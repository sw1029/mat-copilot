from __future__ import annotations

import hashlib
from pathlib import PurePath

from fastapi import APIRouter, Request
from starlette.datastructures import UploadFile

from app import constants
from app.api.deps import SessionDep
from app.errors import analysis_precondition_failed, payload_too_large, unsupported_format, invalid_input
from app.models.api import PlanUploadResponse
from app.models.domain import new_id
from app.models.enums import JobKind, JobStatus, SessionStatus
from app.services.jobs.runner import runner_for
from app.services.sandbox.parser import parse_upload
from app.store.state import PlanDocument

router = APIRouter()


@router.post("/sessions/{session_id}/plan", status_code=202, response_model=PlanUploadResponse)
async def upload_plan(request: Request, state: SessionDep) -> PlanUploadResponse:
    if state.status is not SessionStatus.CREATED:
        raise analysis_precondition_failed("기획안은 인터뷰 시작 전에만 업로드할 수 있습니다.")
    form = await request.form()
    upload = form.get("file")
    if not isinstance(upload, UploadFile):
        raise invalid_input("multipart 필드 'file'이 필요합니다.")
    filename = upload.filename or "plan"
    ext = PurePath(filename).suffix.lower()
    if ext not in constants.PLAN_ALLOWED_EXTENSIONS:
        raise unsupported_format()
    data = await upload.read()
    if len(data) > constants.PLAN_MAX_BYTES:
        raise payload_too_large("기획안 파일은 10MB 이하만 업로드할 수 있습니다.")
    plan_id = new_id()
    parsed = parse_upload(filename, data, artifact_id=plan_id)
    if not parsed.files:
        raise unsupported_format(parsed.note_text or "기획안 텍스트를 추출할 수 없습니다.")
    text = "\n\n".join(p.text for p in parsed.files)

    async with state.lock:
        for rec in state.jobs.values():
            if rec.job.kind is JobKind.PLAN_EXTRACTION and rec.job.status in (JobStatus.QUEUED, JobStatus.RUNNING):
                rec.cancel_requested = True
                rec.job.status = JobStatus.CANCELLED
        state.plan = PlanDocument(plan_id=plan_id, filename=filename, text=text, sha256=hashlib.sha256(data).hexdigest())
        # 재업로드 last-wins: 이전 PLAN 유래 의도(source_question_ids 없음) 제거
        state.intents = [i for i in state.intents if i.source_question_ids]
        if request.app.state.blob.enabled:
            await request.app.state.blob.upload(f"sessions/{state.session_id}/plans/{plan_id}-{filename}", data)
        rec = runner_for(request, state).start(JobKind.PLAN_EXTRACTION)
    return PlanUploadResponse(plan_id=plan_id, job_id=rec.job.job_id)
