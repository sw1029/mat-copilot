"""Agent 계약 인터페이스 — TRD §5.4 roster의 구조화 출력을 파이썬 프로토콜로 고정.

인터뷰 엔진(§6)·분석 파이프라인(§7)은 이 프로토콜에만 의존한다.
- 실구현: app/agents/runtime.py (MAF agent + Copilot SDK ChatClient 어댑터)
- 테스트: 결정적 mock (LLM 의존 테스트의 결정적화, TRD §14)

모든 메서드는 LLM 실패(타임아웃·재시도 소진) 시 LlmUnavailableError를 던진다 —
폴백 여부는 호출부(인터뷰=규칙 기반 질문, 파이프라인=stage FAILED)가 결정한다 (TRD §11.2).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Protocol

from app.models.domain import (
    ChartSpec,
    Finding,
    IntentItem,
    NormalizationSchema,
    NormalizedIntent,
)
from app.models.enums import IntentPhase, QuestionKind, ThemeType


# --- 인터뷰 (AG-02 QuestionGenerator / AG-03 InterviewVerifier) ---


@dataclass
class InterviewContext:
    """컨텍스트 패킷 (TRD §5.1/§6.1) — 예산 내 조립본. 유저 콘텐츠는 불신 데이터로 취급."""

    plan_summary: str | None  # 기획안 요약 (≤ 예산)
    intent_snapshots: list[str]  # 현재까지의 의도 서술
    tree_summary: list[str]  # 질문 텍스트만 (기답변 질문 중복 방지용)
    recent_qa: list[tuple[str, str]]  # 최근 (질문, 답변) 최대 5개
    confuse_threshold: float


@dataclass
class AnswerAssessment:
    """AG-03 검증 출력 — confused 하위지표 3종 (TRD §6.4, 각 0~1)."""

    ambiguity: float
    incompleteness: float
    inconsistency: float
    needs_required_followup: bool = False  # 필수 후속 질문 존재 판단 (§6.5 확장 조건)
    rejection_notes: list[str] = field(default_factory=list)


@dataclass
class QuestionCandidate:
    """AG-02 생성 / AG-03 승인을 통과한 질문 후보."""

    prompt: str
    helper_text: str | None = None
    kind: QuestionKind = QuestionKind.OPTIONAL
    intent_phase: IntentPhase = IntentPhase.INITIAL


@dataclass
class IntentDraft:
    """의도 추출 출력 (AG-01/AG-02·03 협업) — IntentItem 전 단계."""

    statement: str
    phase: IntentPhase = IntentPhase.INITIAL
    implicit: bool = False
    source_question_ids: list[str] = field(default_factory=list)


class InterviewAgents(Protocol):
    """인터뷰 턴 루프가 사용하는 agent 집합 (턴당 LLM 호출 ≤3, TRD §6.1)."""

    async def assess_answer(
        self, ctx: InterviewContext, question_prompt: str, answer_value: str
    ) -> AnswerAssessment: ...

    async def generate_candidates(
        self,
        ctx: InterviewContext,
        question_prompt: str,
        answer_value: str,
        assessment: AnswerAssessment,
        max_candidates: int,
        revised_hint: bool,
    ) -> list[QuestionCandidate]: ...

    async def validate_candidates(
        self, ctx: InterviewContext, candidates: list[QuestionCandidate]
    ) -> list[QuestionCandidate]: ...

    async def derive_intents(
        self, ctx: InterviewContext, qa_pairs: list[tuple[str, str, str]]
    ) -> list[IntentDraft]:
        """인터뷰 종료 시 (questionId, 질문, 답변) 전체에서 의도 추출 (implicit 포함)."""
        ...


# --- 분석 파이프라인 (AG-01/05/06/09/10/12/13/14) ---


@dataclass
class ParsedArtifactView:
    """sandbox 파싱 산출의 agent 입력 뷰 (읽기 전용)."""

    artifact_id: str
    name: str
    kind: str  # "file" | "web" | "github"
    texts: list[tuple[str, str]]  # (경로/이름, 추출 텍스트)


@dataclass
class EvaluationItem:
    """AG-06 출력 — DRIFT 단계 작업 명세 (개수 기반 정량 제약 상류 강제, §7.4)."""

    intent_id: str
    aspect: str  # 무엇을 대조할지
    quant_candidate: bool = True  # 개수 기반 정량 여부


@dataclass
class CoverageJudgement:
    """AG-10(REQUIREMENT_OMISSION)의 의도별 커버 판정 (TRD §7.6 결정 규칙 입력)."""

    intent_id: str
    covered: bool
    evidence: list[dict] = field(default_factory=list)  # EvidenceRef 형태 dict


@dataclass
class ThemeDriftResult:
    theme: ThemeType
    findings: list[Finding] = field(default_factory=list)
    coverage: list[CoverageJudgement] = field(default_factory=list)  # REQUIREMENT_OMISSION만


@dataclass
class ReportNarrative:
    """AG-14 출력 — 보고서 정성 파트."""

    intent_doc_markdown: str  # 문단 블록마다 관련 intentId를 [intent:<id>] 마커로 표기
    qualitative_markdown: str
    suggestions: list[str] = field(default_factory=list)


class PipelineAgents(Protocol):
    async def extract_plan_intents(self, plan_text: str) -> list[IntentDraft]: ...  # AG-01

    async def summarize_artifact(self, artifact: ParsedArtifactView) -> str: ...  # AG-09

    async def build_normalization_schema(
        self, intents: list[IntentItem]
    ) -> NormalizationSchema: ...  # AG-05 (생성 즉시 잠금은 파이프라인 책임)

    async def normalize_intents(
        self, intents: list[IntentItem], schema: NormalizationSchema
    ) -> list[NormalizedIntent]: ...  # AG-05

    async def plan_evaluation(
        self, intents: list[IntentItem], normalized: list[NormalizedIntent], schema: NormalizationSchema
    ) -> list[EvaluationItem]: ...  # AG-06

    async def analyze_drift(
        self,
        theme: ThemeType,
        intents: list[IntentItem],
        normalized: list[NormalizedIntent],
        evaluation: list[EvaluationItem],
        artifacts: list[ParsedArtifactView],
        artifact_summaries: dict[str, str],
    ) -> ThemeDriftResult: ...  # AG-10 (테마별 인스턴스, fan-out은 파이프라인이 수행)

    async def verify_findings(
        self, findings: list[Finding], artifacts: list[ParsedArtifactView]
    ) -> list[Finding]: ...  # AG-12 (결정적 verify_quote 와 별개의 LLM 이중 검증)

    async def compose_charts(self, quant_stats_csv_inputs: dict[str, str]) -> list[ChartSpec]: ...  # AG-13

    async def write_report(
        self,
        intents: list[IntentItem],
        findings: list[Finding],
        quant_summary: str,
        early_completed: bool,
    ) -> ReportNarrative: ...  # AG-14


# --- 런타임 집합 ---


class AgentRuntime(Protocol):
    """앱 전역 DI 지점 — app.state.runtime."""

    interview: InterviewAgents
    pipeline: PipelineAgents

    async def warm_up(self) -> None: ...  # Copilot SDK 기동 + ping (TRD §5.2)

    def llm_status(self) -> str: ...  # "ok" | "fail" | "disabled" (API-16 checks.llm)

    async def shutdown(self) -> None: ...
