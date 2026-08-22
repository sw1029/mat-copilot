from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import JSONResponse

from app.api.deps import SessionDep
from app.errors import analysis_precondition_failed, job_not_found
from app.models.api import AnalysisCreateResponse, JobCancelResponse
from app.models.enums import ArtifactIngestStatus, JobKind, JobStatus, SessionStatus
from app.services.jobs.runner import runner_for

router = APIRouter()


def _job_payload(rec) -> dict:
    checkpoints = {k: _checkpoint_summary(v) for k, v in rec.checkpoints.items()}
    data = rec.job.model_dump(by_alias=True, mode="json", exclude_none=True)
    data["checkpoint"] = checkpoints
    return data


def _checkpoint_summary(value):
    if isinstance(value, dict):
        summary = {}
        for k, v in value.items():
            if isinstance(v, list):
                summary[k] = len(v)
            elif hasattr(v, "model_dump"):
                summary[k] = v.model_dump(by_alias=True, mode="json")
            else:
                summary[k] = v
        return summary
    return value


def _etag(data: dict) -> str:
    raw = json.dumps(data, sort_keys=True, ensure_ascii=False, default=str).encode("utf-8")
    return '"' + hashlib.sha256(raw).hexdigest() + '"'


@router.post("/sessions/{session_id}/analysis", status_code=status.HTTP_202_ACCEPTED, response_model=AnalysisCreateResponse)
async def start_analysis(request: Request, state: SessionDep) -> AnalysisCreateResponse:
    async with state.lock:
        running_analysis = next((r for r in state.jobs.values() if r.job.kind is JobKind.ANALYSIS and r.job.status in (JobStatus.QUEUED, JobStatus.RUNNING)), None)
        if running_analysis:
            return AnalysisCreateResponse(job_id=running_analysis.job.job_id, status=running_analysis.job.status)
        if state.status is SessionStatus.INTERVIEWING:
            raise analysis_precondition_failed("인터뷰를 먼저 완료해 주세요.")
        if not state.intents:
            raise analysis_precondition_failed("분석할 의도가 없습니다. 기획안 업로드 또는 인터뷰를 먼저 진행해 주세요.")
        if not any(state.artifacts[aid].artifact.ingest_status is ArtifactIngestStatus.PARSED for aid in state.artifact_order):
            raise analysis_precondition_failed("분석 가능한 결과물이 없습니다.")
        if state.status is SessionStatus.CREATED:
            state.status = SessionStatus.INTERVIEW_DONE
        if state.status not in (SessionStatus.INTERVIEW_DONE, SessionStatus.REPORT_READY):
            raise analysis_precondition_failed("분석을 시작할 수 없는 세션 상태입니다.")
        rec = runner_for(request, state).start(JobKind.ANALYSIS)
        return AnalysisCreateResponse(job_id=rec.job.job_id, status=rec.job.status)


@router.get("/sessions/{session_id}/jobs/{job_id}")
async def get_job(request: Request, state: SessionDep, job_id: str) -> Response:
    rec = state.jobs.get(job_id)
    if rec is None:
        raise job_not_found()
    data = _job_payload(rec)
    tag = _etag(data)
    if request.headers.get("if-none-match") == tag:
        return Response(status_code=304, headers={"ETag": tag})
    return JSONResponse(content=data, headers={"ETag": tag})


@router.post("/sessions/{session_id}/jobs/{job_id}/retry", status_code=status.HTTP_202_ACCEPTED)
async def retry_job(request: Request, state: SessionDep, job_id: str):
    async with state.lock:
        rec = runner_for(request, state).retry(job_id)
    return _job_payload(rec)


@router.post("/sessions/{session_id}/jobs/{job_id}/cancel", response_model=JobCancelResponse)
async def cancel_job(request: Request, state: SessionDep, job_id: str) -> JobCancelResponse:
    async with state.lock:
        rec = runner_for(request, state).cancel(job_id)
    return JobCancelResponse(job_id=rec.job.job_id, status=rec.job.status, completed_stages=rec.job.completed_stages)
