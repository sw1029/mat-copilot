"""API 요청/응답 모델 — SCHEMA §2.1 필수 계약."""

from __future__ import annotations

from pydantic import Field

from app.models.domain import (
    Answer,
    ApiError,
    CamelModel,
    QuestionNode,
    Session,
    SessionSettings,
)
from app.models.enums import CompletedReason, InterviewStatus, JobKind, JobStage, JobStatus


# --- API-01 POST /sessions ---


class SessionCreateRequest(CamelModel):
    settings: SessionSettings | None = None


class SessionCreateResponse(Session):
    session_token: str  # 이후 X-Session-Token 헤더로 전달


# --- API-03 PATCH /sessions/{id}/settings ---


class SettingsPatchRequest(CamelModel):
    confuse_threshold: float | None = None
    time_limit_sec: int | None = None


# --- API-04 POST /sessions/{id}/plan ---


class PlanUploadResponse(CamelModel):
    plan_id: str
    job_id: str
    job_kind: JobKind = JobKind.PLAN_EXTRACTION


# --- API-05/06 인터뷰 ---


class InterviewStartResponse(CamelModel):
    question: QuestionNode | None = None
    interview_status: InterviewStatus = InterviewStatus.ACTIVE
    remaining_questions: int = 0


class AnswerSubmitRequest(CamelModel):
    question_id: str
    value: str
    request_flag: bool = False


class AnswerSubmitResponse(CamelModel):
    answered_question_id: str
    next_questions: list[QuestionNode] = Field(default_factory=list)
    remaining_questions: int = 0
    interview_status: InterviewStatus = InterviewStatus.ACTIVE
    completed_reason: CompletedReason | None = None


# --- API-07 GET /interview/tree ---


class InterviewTreeResponse(CamelModel):
    nodes: list[QuestionNode] = Field(default_factory=list)
    answers: list[Answer] = Field(default_factory=list)
    interview_status: InterviewStatus = InterviewStatus.ACTIVE
    completed_reason: CompletedReason | None = None
    active_question_id: str | None = None
    remaining_questions: int = 0


# --- API-08 POST /artifacts (링크형) ---


class ArtifactLinkRequest(CamelModel):
    type: str  # "LINK" | "GITHUB"
    url: str


class ArtifactCreateResponse(CamelModel):
    artifact_id: str
    type: str
    name: str
    submitted_at: str


# --- API-10 POST /analysis ---


class AnalysisCreateResponse(CamelModel):
    job_id: str
    job_kind: JobKind = JobKind.ANALYSIS
    status: JobStatus = JobStatus.QUEUED


# --- API-11 GET /jobs/{jobId} ---


class JobStatusResponse(CamelModel):
    job_id: str
    kind: JobKind
    status: JobStatus
    stage: JobStage | None = None
    completed_stages: list[JobStage] = Field(default_factory=list)
    progress: int | None = None
    error: ApiError | None = None


# --- API-17 POST /interview/complete ---


class InterviewCompleteRequest(CamelModel):
    confirm: bool = False


class InterviewCompleteResponse(CamelModel):
    interview_status: InterviewStatus = InterviewStatus.COMPLETED
    completed_reason: CompletedReason | None = None
    early_completed: bool = False


# --- API-18 POST /jobs/{jobId}/cancel ---


class JobCancelResponse(CamelModel):
    job_id: str
    status: JobStatus
    completed_stages: list[JobStage] = Field(default_factory=list)


# --- API-15/16 health/ready ---


class HealthResponse(CamelModel):
    status: str = "ok"


class ReadyResponse(CamelModel):
    status: str
    checks: dict[str, str]
