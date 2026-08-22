from __future__ import annotations

import hashlib
import ipaddress
from urllib.parse import urlparse

from fastapi import APIRouter, Request, status
from starlette.datastructures import UploadFile

from app import constants
from app.api.deps import SessionDep
from app.errors import analysis_precondition_failed, invalid_input, payload_too_large
from app.models.domain import Artifact, new_id
from app.models.enums import ArtifactIngestStatus, ArtifactType, SessionStatus
from app.services.sandbox.parser import parse_upload
from app.store.state import ArtifactRecord, ParsedText

router = APIRouter()


def _validate_url(kind: ArtifactType, url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise invalid_input("URL은 https만 허용합니다.")
    host = parsed.hostname.lower()
    if kind is ArtifactType.GITHUB and host != "github.com":
        raise invalid_input("GITHUB 결과물은 github.com URL만 허용합니다.")
    if host in {"localhost", "127.0.0.1", "::1"} or host.endswith(".localhost"):
        raise invalid_input("localhost URL은 허용하지 않습니다.")
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise invalid_input("사설/로컬 IP URL은 허용하지 않습니다.")
    except ValueError:
        pass
    return parsed.geturl()


def _ensure_can_submit(state) -> None:
    if state.status is SessionStatus.ANALYZING:
        raise analysis_precondition_failed("분석 중에는 결과물을 제출할 수 없습니다.")
    if len(state.artifact_order) >= constants.ARTIFACTS_MAX_COUNT:
        raise invalid_input("세션당 결과물은 최대 20개까지 제출할 수 있습니다.")


@router.post("/sessions/{session_id}/artifacts", status_code=status.HTTP_201_CREATED)
async def submit_artifact(request: Request, state: SessionDep):
    ctype = request.headers.get("content-type", "")
    created: list[Artifact] = []
    async with state.lock:
        _ensure_can_submit(state)
        if ctype.startswith("application/json"):
            body = await request.json()
            try:
                kind = ArtifactType(body.get("type"))
            except Exception:
                raise invalid_input("type은 LINK 또는 GITHUB여야 합니다.")
            if kind is ArtifactType.FILE:
                raise invalid_input("JSON 제출은 LINK/GITHUB만 지원합니다.")
            url = _validate_url(kind, str(body.get("url") or ""))
            aid = new_id()
            artifact = Artifact(artifact_id=aid, type=kind, name=urlparse(url).hostname or url, url=url, ingest_status=ArtifactIngestStatus.SKIPPED_UNSUPPORTED, ingest_note="웹/깃헙 수집은 M2")
            state.artifacts[aid] = ArtifactRecord(artifact=artifact)
            state.artifact_order.append(aid)
            created.append(artifact)
        else:
            form = await request.form()
            values = form.getlist("file")
            files = [v for v in values if isinstance(v, UploadFile)]
            if not files:
                raise invalid_input("multipart 필드 'file'이 필요합니다.")
            if len(state.artifact_order) + len(files) > constants.ARTIFACTS_MAX_COUNT:
                raise invalid_input("세션당 결과물은 최대 20개까지 제출할 수 있습니다.")
            for upload in files:
                data = await upload.read()
                if len(data) > constants.ARTIFACT_MAX_BYTES:
                    raise payload_too_large("결과물 파일은 20MB 이하만 업로드할 수 있습니다.")
                aid = new_id()
                filename = upload.filename or "artifact"
                parsed = parse_upload(filename, data, artifact_id=aid)
                artifact = Artifact(artifact_id=aid, type=ArtifactType.FILE, name=filename, ingest_status=parsed.status, ingest_note=parsed.note_text)
                rec = ArtifactRecord(artifact=artifact, raw_sha256=hashlib.sha256(data).hexdigest(), parsed_texts=[ParsedText(path=p.path, text=p.text) for p in parsed.files])
                state.artifacts[aid] = rec
                state.artifact_order.append(aid)
                if request.app.state.blob.enabled:
                    await request.app.state.blob.upload(f"sessions/{state.session_id}/artifacts/{aid}-{filename}", data)
                created.append(artifact)
    if len(created) == 1:
        a = created[0]
        return {"artifactId": a.artifact_id, "type": a.type.value, "name": a.name, "submittedAt": a.submitted_at, "ingestStatus": a.ingest_status.value, "ingestNote": a.ingest_note}
    return {"artifacts": [a.model_dump(by_alias=True, mode="json", exclude_none=True) for a in created]}


@router.get("/sessions/{session_id}/artifacts")
async def list_artifacts(state: SessionDep):
    return {"artifacts": [state.artifacts[aid].artifact.model_dump(by_alias=True, mode="json", exclude_none=True) for aid in state.artifact_order]}
