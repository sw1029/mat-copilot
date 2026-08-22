"""핵심 데이터 모델 — SCHEMA §4 와 1:1 대응 (JSON은 camelCase).

모든 API 노출 모델은 CamelModel을 상속해 snake_case(파이썬) ↔ camelCase(JSON)로 변환한다.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.models.enums import (
    ArtifactIngestStatus,
    ArtifactType,
    Confidence,
    IntentPhase,
    JobKind,
    JobStage,
    JobStatus,
    MetricStatus,
    QuestionKind,
    QuestionStatus,
    SessionStatus,
    Severity,
    ThemeType,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid4())


def iso(dt: datetime) -> str:
    """ISO 8601 UTC (SCHEMA §1) — `2026-08-22T04:00:00Z` 형식."""
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
        extra="ignore",
    )


# --- 세션 ---


class SessionSettings(CamelModel):
    confuse_threshold: float = 0.5  # 0~1, step 0.05 (SCHEMA §4.1)
    time_limit_sec: int | None = None  # 60~3600 또는 null


class Session(CamelModel):
    session_id: str
    status: SessionStatus
    settings: SessionSettings
    plan_id: str | None = None
    active_job_id: str | None = None
    interview_started_at: str | None = None
    created_at: str
    expires_at: str


# --- 인터뷰 ---


class QuestionNode(CamelModel):
    question_id: str = Field(default_factory=new_id)
    parent_id: str | None = None
    depth: int = 0
    prompt: str
    helper_text: str | None = None
    kind: QuestionKind = QuestionKind.OPTIONAL
    status: QuestionStatus = QuestionStatus.PENDING
    input_type: Literal["text"] = "text"  # MVP 고정 (OQ-10)
    ai_generated: bool = True  # 규칙 기반 폴백 질문만 False (TRD §11.2)
    confused: float | None = None  # 0~1, AG-03 산출 (TRD §6.4)
    intent_phase: IntentPhase = IntentPhase.INITIAL
    created_at: str = Field(default_factory=lambda: iso(utcnow()))


class Answer(CamelModel):
    question_id: str
    value: str
    request_flag: bool = False
    submitted_at: str = Field(default_factory=lambda: iso(utcnow()))


# --- 의도 ---


class IntentItem(CamelModel):
    intent_id: str = Field(default_factory=new_id)
    phase: IntentPhase = IntentPhase.INITIAL
    statement: str
    implicit: bool = False  # 의식적(false)/무의식적(true) (FR-4)
    source_question_ids: list[str] = Field(default_factory=list)


# --- 정규화 (FR-5) ---


class SchemaTag(CamelModel):
    tag_id: str
    name: str
    description: str


class SchemaField(CamelModel):
    field_id: str
    name: str
    type: Literal["string", "number", "boolean", "enum"]
    enum_values: list[str] | None = None


class NormalizationSchema(CamelModel):
    schema_id: str = Field(default_factory=new_id)
    locked_at: str = Field(default_factory=lambda: iso(utcnow()))  # 잠금 후 불변
    tags: list[SchemaTag] = Field(default_factory=list)
    fields: list[SchemaField] = Field(default_factory=list)


class NormalizedIntent(CamelModel):
    intent_id: str
    tag_ids: list[str] = Field(default_factory=list)
    values: dict[str, str | float | int | bool] = Field(default_factory=dict)


# --- 결과물 ---


class Artifact(CamelModel):
    artifact_id: str = Field(default_factory=new_id)
    type: ArtifactType
    name: str
    url: str | None = None
    ingest_status: ArtifactIngestStatus = ArtifactIngestStatus.PENDING
    ingest_note: str | None = None
    submitted_at: str = Field(default_factory=lambda: iso(utcnow()))


# --- job ---


class ApiError(CamelModel):
    code: str
    message: str
    retryable: bool = False
    details: dict[str, Any] | None = None
    trace_id: str = ""


class AnalysisJob(CamelModel):
    job_id: str = Field(default_factory=new_id)
    kind: JobKind
    status: JobStatus = JobStatus.QUEUED
    stage: JobStage | None = None
    completed_stages: list[JobStage] = Field(default_factory=list)
    progress: int | None = None
    error: ApiError | None = None


# --- 분석 결과 ---


class EvidenceLocation(CamelModel):
    kind: Literal["file", "web", "github"]
    path: str | None = None
    start_line: int | None = None
    end_line: int | None = None
    url: str | None = None
    note: str | None = None


class EvidenceRef(CamelModel):
    artifact_id: str
    location: EvidenceLocation
    quote: str  # 결정적 substring 검증 대상 (verify_quote)


class IntentBlock(CamelModel):
    block_id: str  # "ib-<seq>" — 재렌더링 불변 (OQ-22)
    intent_ids: list[str] = Field(default_factory=list)


class IntentDoc(CamelModel):
    markdown: str
    blocks: list[IntentBlock] = Field(default_factory=list)


class MetricThresholds(CamelModel):
    warn: float
    bad: float


class Metric(CamelModel):
    metric_id: str
    label: str
    value: float | None = None  # computable=false면 null
    unit: str
    thresholds: MetricThresholds | None = None
    status: MetricStatus = MetricStatus.NA
    description: str
    computable: bool = True
    reason: str | None = None


class Finding(CamelModel):
    finding_id: str = Field(default_factory=new_id)
    theme: ThemeType
    dynamic_theme_name: str | None = None
    related_intent_ids: list[str] = Field(default_factory=list)
    intent_block_ids: list[str] = Field(default_factory=list)
    summary: str
    detail: str
    evidence: list[EvidenceRef] = Field(default_factory=list)
    severity: Severity = Severity.MEDIUM
    confidence: Confidence = Confidence.MEDIUM
    suggestion: str | None = None


class ThemeCount(CamelModel):
    theme: ThemeType
    dynamic_theme_name: str | None = None
    count: int


class SeverityCount(CamelModel):
    severity: Severity
    count: int


class QuantStats(CamelModel):
    total_intents: int = 0
    covered_intents: int = 0
    drift_count: int = 0
    counts_by_theme: list[ThemeCount] = Field(default_factory=list)
    counts_by_severity: list[SeverityCount] = Field(default_factory=list)


class Report(CamelModel):
    report_id: str = Field(default_factory=new_id)
    session_id: str
    ai_generated_notice: Literal[True] = True  # AI 생성 고지 (SCHEMA §1)
    early_completed: bool | None = None
    intent_doc: IntentDoc
    metrics: list[Metric] = Field(default_factory=list)
    quant_stats: QuantStats = Field(default_factory=QuantStats)
    qualitative: str = ""
    suggestions: list[str] = Field(default_factory=list)
    findings: list[Finding] = Field(default_factory=list)
    normalization_schema: NormalizationSchema
    created_at: str = Field(default_factory=lambda: iso(utcnow()))


class ChartSpec(CamelModel):
    chart_id: str = Field(default_factory=new_id)
    title: str
    x_axis_name: str
    y_axis_name: str
    csv: str  # 헤더 포함 CSV 문자열
    description: str | None = None
