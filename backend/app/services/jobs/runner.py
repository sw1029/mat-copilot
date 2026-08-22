from __future__ import annotations

import asyncio
import logging
from typing import Any

from app.errors import LlmUnavailableError, job_not_cancellable, job_not_found, job_not_retryable
from app.models.domain import AnalysisJob, ApiError
from app.models.enums import JobKind, JobStatus, SessionStatus
from app.services.session_service import mark_report_ready
from app.observability import new_trace_id, session_id_var, trace_id_var
from app.services.jobs.pipeline import PipelineCancelled, run_analysis_pipeline
from app.services.jobs.plan_extraction import run_plan_extraction
from app.store.state import JobRecord, SessionState

logger = logging.getLogger("app.jobs.runner")


def _pipeline_error(stage: str | None, exc: Exception) -> ApiError:
    cause = "LLM_UPSTREAM_ERROR" if isinstance(exc, LlmUnavailableError) else exc.__class__.__name__
    return ApiError(
        code="PIPELINE_STAGE_FAILED",
        message=str(exc) or "파이프라인 단계 실행에 실패했습니다.",
        retryable=True,
        details={"stage": stage, "cause": cause},
        trace_id=trace_id_var.get() or new_trace_id(),
    )


class JobRunner:
    def __init__(self, state: SessionState, runtime: Any, store: Any = None, blob: Any = None) -> None:
        self.state = state
        self.runtime = runtime
        self.store = store
        self.blob = blob

    def start(self, kind: JobKind) -> JobRecord:
        rec = JobRecord(job=AnalysisJob(kind=kind, status=JobStatus.QUEUED, progress=0))
        self.state.jobs[rec.job.job_id] = rec
        self.state.active_job_id = rec.job.job_id
        asyncio.create_task(self._run(rec))
        return rec

    def retry(self, job_id: str) -> JobRecord:
        rec = self.state.jobs.get(job_id)
        if rec is None:
            raise job_not_found()
        if rec.job.status not in (JobStatus.FAILED, JobStatus.CANCELLED):
            raise job_not_retryable()
        rec.cancel_requested = False
        rec.job.status = JobStatus.QUEUED
        rec.job.error = None
        self.state.active_job_id = job_id
        asyncio.create_task(self._run(rec))
        return rec

    def cancel(self, job_id: str) -> JobRecord:
        rec = self.state.jobs.get(job_id)
        if rec is None:
            raise job_not_found()
        if rec.job.status is JobStatus.CANCELLED:
            return rec
        if rec.job.status is JobStatus.QUEUED:
            rec.cancel_requested = True
            rec.job.status = JobStatus.CANCELLED
            if self.state.active_job_id == job_id:
                self.state.active_job_id = None
            if rec.job.kind is JobKind.ANALYSIS:
                self.state.status = SessionStatus.INTERVIEW_DONE
            return rec
        if rec.job.status is JobStatus.RUNNING:
            rec.cancel_requested = True
            rec.job.status = JobStatus.CANCELLED
            if rec.job.kind is JobKind.ANALYSIS:
                self.state.status = SessionStatus.INTERVIEW_DONE
            return rec
        raise job_not_cancellable()

    async def _run(self, rec: JobRecord) -> None:
        trace_id_var.set(new_trace_id())
        session_id_var.set(self.state.session_id)
        if rec.cancel_requested or rec.job.status is JobStatus.CANCELLED:
            rec.job.status = JobStatus.CANCELLED
            return
        rec.job.status = JobStatus.RUNNING
        try:
            if rec.job.kind is JobKind.PLAN_EXTRACTION:
                rec.job.stage = None
                expected_plan_id = self.state.plan.plan_id if self.state.plan else None
                intents = await run_plan_extraction(self.state, self.runtime)
                if (
                    rec.cancel_requested
                    or rec.job.status is JobStatus.CANCELLED
                    or (self.state.plan and self.state.plan.plan_id != expected_plan_id)
                ):
                    rec.job.status = JobStatus.CANCELLED
                    return
                interview_intents = [i for i in self.state.intents if i.source_question_ids]
                self.state.intents = intents + interview_intents
                rec.checkpoints["PLAN_EXTRACTION"] = {"intents": len(intents)}
                rec.job.progress = 100
                rec.job.status = JobStatus.SUCCEEDED
            else:
                self.state.status = SessionStatus.ANALYZING
                await run_analysis_pipeline(self.state, self.runtime, rec=rec)
                if rec.cancel_requested or rec.job.status is JobStatus.CANCELLED:
                    rec.job.status = JobStatus.CANCELLED
                    self.state.status = SessionStatus.INTERVIEW_DONE
                    return
                rec.job.progress = 100
                rec.job.status = JobStatus.SUCCEEDED
                mark_report_ready(self.state)
                if self.store:
                    self.store.touch(self.state)
                if self.blob and self.state.report is not None:
                    data = self.state.report.model_dump_json(by_alias=True).encode("utf-8")
                    await self.blob.upload(f"sessions/{self.state.session_id}/reports/{self.state.report.report_id}.json", data, "application/json")
        except PipelineCancelled:
            rec.job.status = JobStatus.CANCELLED
            if rec.job.kind is JobKind.ANALYSIS:
                self.state.status = SessionStatus.INTERVIEW_DONE
        except Exception as exc:  # noqa: BLE001 — job.error 계약으로 변환
            logger.error("job failed id=%s", rec.job.job_id, exc_info=True)
            rec.job.status = JobStatus.FAILED
            rec.job.error = _pipeline_error(rec.job.stage.value if rec.job.stage else rec.job.kind.value, exc)
            if rec.job.kind is JobKind.ANALYSIS:
                self.state.status = SessionStatus.INTERVIEW_DONE
        finally:
            if self.state.active_job_id == rec.job.job_id and rec.job.status in (JobStatus.SUCCEEDED, JobStatus.FAILED, JobStatus.CANCELLED):
                self.state.active_job_id = None


def runner_for(request, state: SessionState) -> JobRunner:
    return JobRunner(state, request.app.state.runtime, request.app.state.store, request.app.state.blob)
