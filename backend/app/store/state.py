"""세션 파티션 내부 상태 — 저장소 계층에만 존재 (TRD §8.3, 핸들러는 무상태)."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from app.agents.interfaces import EvaluationItem
from app.models.domain import (
    AnalysisJob,
    Answer,
    Artifact,
    IntentItem,
    NormalizationSchema,
    NormalizedIntent,
    QuestionNode,
    Report,
    SessionSettings,
    utcnow,
)
from app.models.enums import CompletedReason, JobKind, SessionStatus


@dataclass
class PlanDocument:
    plan_id: str
    filename: str
    text: str
    sha256: str
    uploaded_at: datetime = field(default_factory=utcnow)


@dataclass
class ParsedText:
    path: str  # 파일 경로(zip 내부 포함) 또는 이름
    text: str


@dataclass
class ArtifactRecord:
    """Artifact(공개 모델) + sandbox 파싱 산출(내부)."""

    artifact: Artifact
    raw_sha256: str | None = None
    parsed_texts: list[ParsedText] = field(default_factory=list)
    summary: str | None = None  # AG-09 산출


@dataclass
class JobRecord:
    """job 수명주기 + 단계 체크포인트 (TRD §7.8)."""

    job: AnalysisJob
    cancel_requested: bool = False
    checkpoints: dict[str, Any] = field(default_factory=dict)  # stage명 → 산출물
    created_at: datetime = field(default_factory=utcnow)

    @property
    def kind(self) -> JobKind:
        return self.job.kind


@dataclass
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    calls: int = 0
    estimated: bool = False

    def add(self, input_tokens: int, output_tokens: int, estimated: bool = False) -> None:
        self.input_tokens += max(0, input_tokens)
        self.output_tokens += max(0, output_tokens)
        self.calls += 1
        self.estimated = self.estimated or estimated


@dataclass
class SessionState:
    """단일 세션의 전체 파티션 — sessionId 밖의 데이터 접근 금지 (NG5)."""

    session_id: str
    token_hash: str
    settings: SessionSettings
    status: SessionStatus = SessionStatus.CREATED
    created_at: datetime = field(default_factory=utcnow)
    last_activity_at: datetime = field(default_factory=utcnow)
    expires_at: datetime = field(default_factory=utcnow)

    # 인터뷰 (FR-2~4)
    interview_started_at: datetime | None = None
    interview_completed_reason: CompletedReason | None = None
    early_completed: bool = False
    question_nodes: dict[str, QuestionNode] = field(default_factory=dict)
    question_order: list[str] = field(default_factory=list)  # 생성 순
    answers: dict[str, Answer] = field(default_factory=dict)
    request_flag_bonus_used: set[str] = field(default_factory=set)  # 노드별 1회 예외 (§6.5)
    intents_derived: bool = False  # 인터뷰 의도 추출 완료 여부

    # 의도·기획안
    plan: PlanDocument | None = None
    intents: list[IntentItem] = field(default_factory=list)

    # 결과물 (FR-7)
    artifacts: dict[str, ArtifactRecord] = field(default_factory=dict)
    artifact_order: list[str] = field(default_factory=list)

    # job (FR-1, FR-7~10)
    jobs: dict[str, JobRecord] = field(default_factory=dict)
    active_job_id: str | None = None

    # 파이프라인 산출 (FR-5~10)
    normalization_schema: NormalizationSchema | None = None  # 생성 후 잠금·불변 (§7.3)
    normalized_intents: list[NormalizedIntent] = field(default_factory=list)
    evaluation_items: list[EvaluationItem] = field(default_factory=list)
    report: Report | None = None

    # 관측성 (TRD §11.1)
    token_usage: TokenUsage = field(default_factory=TokenUsage)

    # 동시성 (TRD §4.3) — 세션 단위 잠금
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    def active_question_id(self) -> str | None:
        for qid in self.question_order:
            node = self.question_nodes[qid]
            if node.status.value == "ACTIVE":
                return qid
        return None

    def running_job(self) -> JobRecord | None:
        for rec in self.jobs.values():
            if rec.job.status.value in ("QUEUED", "RUNNING"):
                return rec
        return None
