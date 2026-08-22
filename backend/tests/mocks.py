"""결정적 mock 런타임 — LLM 의존 테스트의 결정적화 (TRD §14).

답변 텍스트 마커 규약:
- "@a=0.8 @i=0.4 @c=0.6" → confused 하위지표 지정 (기본 0.2/0.2/0.0)
- "@required"           → 필수 후속 질문 필요 판단
- "@implicit"           → 무의식적 의도 방향성
결과물 텍스트 규약:
- 의도 statement의 앞 10자가 결과물 텍스트에 포함되면 covered
- "DISTORT:" 로 시작하는 행은 INTENT_DISTORTION finding 근거
"""

from __future__ import annotations

import re

from app.agents.interfaces import (
    AnswerAssessment,
    CoverageJudgement,
    EvaluationItem,
    IntentDraft,
    InterviewContext,
    ParsedArtifactView,
    QuestionCandidate,
    ReportNarrative,
    ThemeDriftResult,
)
from app.models.domain import (
    ChartSpec,
    EvidenceLocation,
    EvidenceRef,
    Finding,
    IntentItem,
    NormalizationSchema,
    NormalizedIntent,
    SchemaField,
    SchemaTag,
)
from app.models.enums import Confidence, IntentPhase, QuestionKind, Severity, ThemeType


def _marker(value: str, key: str, default: float) -> float:
    m = re.search(rf"@{key}=([0-9.]+)", value)
    return float(m.group(1)) if m else default


class MockInterviewAgents:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def assess_answer(self, ctx: InterviewContext, question_prompt: str, answer_value: str):
        self.calls.append("assess")
        return AnswerAssessment(
            ambiguity=_marker(answer_value, "a", 0.2),
            incompleteness=_marker(answer_value, "i", 0.2),
            inconsistency=_marker(answer_value, "c", 0.0),
            needs_required_followup="@required" in answer_value,
        )

    async def generate_candidates(
        self, ctx, question_prompt, answer_value, assessment, max_candidates, revised_hint
    ):
        self.calls.append("generate")
        kind = QuestionKind.REQUIRED if assessment.needs_required_followup else QuestionKind.OPTIONAL
        phase = IntentPhase.REVISED if revised_hint else IntentPhase.INITIAL
        return [
            QuestionCandidate(
                prompt=f"[후속 {i + 1}] '{answer_value[:20]}'에 대해 더 구체적으로 알려주세요.",
                helper_text="구체적인 예시를 들어 주세요.",
                kind=kind if i == 0 else QuestionKind.OPTIONAL,
                intent_phase=phase,
            )
            for i in range(max_candidates)
        ]

    async def validate_candidates(self, ctx, candidates):
        self.calls.append("validate")
        seen = set(ctx.tree_summary)
        approved = []
        for c in candidates:
            if c.prompt not in seen:
                seen.add(c.prompt)
                approved.append(c)
        return approved

    async def derive_intents(self, ctx, qa_pairs):
        self.calls.append("derive")
        drafts = []
        for qid, _q, a in qa_pairs:
            clean = re.sub(r"@\w+(=[0-9.]+)?", "", a).strip()
            drafts.append(
                IntentDraft(
                    statement=f"사용자 의도: {clean[:60]}",
                    phase=IntentPhase.REVISED if "@c=" in a and _marker(a, "c", 0.0) > 0.5 else IntentPhase.INITIAL,
                    implicit="@implicit" in a,
                    source_question_ids=[qid],
                )
            )
        return drafts


class MockPipelineAgents:
    def __init__(self) -> None:
        self.calls: list[str] = []

    async def extract_plan_intents(self, plan_text: str):
        self.calls.append("extract_plan")
        drafts = [
            IntentDraft(statement=line.lstrip("- ").strip())
            for line in plan_text.splitlines()
            if line.strip().startswith("- ")
        ]
        return drafts or [IntentDraft(statement=plan_text.strip()[:80] or "기획 의도")]

    async def summarize_artifact(self, artifact: ParsedArtifactView) -> str:
        self.calls.append("summarize")
        joined = " ".join(t[:100] for _, t in artifact.texts)
        return f"{artifact.name}: {joined[:200]}"

    async def build_normalization_schema(self, intents):
        self.calls.append("schema")
        return NormalizationSchema(
            tags=[SchemaTag(tag_id="tag-core", name="핵심", description="핵심 요구")],
            fields=[SchemaField(field_id="f-priority", name="priority", type="string")],
        )

    async def normalize_intents(self, intents, schema):
        self.calls.append("normalize")
        return [
            NormalizedIntent(intent_id=i.intent_id, tag_ids=[schema.tags[0].tag_id], values={"priority": "P0"})
            for i in intents
        ]

    async def plan_evaluation(self, intents, normalized, schema):
        self.calls.append("evaluate")
        return [EvaluationItem(intent_id=i.intent_id, aspect=f"'{i.statement[:30]}' 반영 여부") for i in intents]

    async def analyze_drift(self, theme, intents, normalized, evaluation, artifacts, artifact_summaries):
        self.calls.append(f"drift:{theme.value}")
        result = ThemeDriftResult(theme=theme)
        all_texts: list[tuple[str, str, str]] = [
            (a.artifact_id, path, text) for a in artifacts for path, text in a.texts
        ]
        if theme is ThemeType.REQUIREMENT_OMISSION:
            for intent in intents:
                needle = intent.statement.replace("사용자 의도: ", "")[:10]
                hit = next((t for t in all_texts if needle and needle in t[2]), None)
                if hit:
                    aid, path, text = hit
                    idx = text.index(needle)
                    quote = text[idx : idx + min(len(needle) + 20, len(text) - idx)]
                    result.coverage.append(
                        CoverageJudgement(
                            intent_id=intent.intent_id,
                            covered=True,
                            evidence=[
                                {
                                    "artifactId": aid,
                                    "location": {"kind": "file", "path": path},
                                    "quote": quote,
                                }
                            ],
                        )
                    )
                else:
                    result.coverage.append(CoverageJudgement(intent_id=intent.intent_id, covered=False))
                    result.findings.append(
                        Finding(
                            theme=theme,
                            related_intent_ids=[intent.intent_id],
                            summary=f"요구 누락: {intent.statement[:40]}",
                            detail="결과물에서 해당 의도의 구현/서술을 찾지 못했습니다.",
                            evidence=[],  # 누락은 근거 없음이 정상 (§7.5)
                            severity=Severity.HIGH,
                            confidence=Confidence.MEDIUM,
                            suggestion="누락된 요구를 결과물에 반영하세요.",
                        )
                    )
        elif theme is ThemeType.INTENT_DISTORTION:
            for aid, path, text in all_texts:
                for line in text.splitlines():
                    if line.strip().startswith("DISTORT:"):
                        result.findings.append(
                            Finding(
                                theme=theme,
                                related_intent_ids=[intents[0].intent_id] if intents else [],
                                summary="의도 왜곡 감지",
                                detail=f"원 의도와 다른 방향의 서술: {line.strip()[:80]}",
                                evidence=[
                                    EvidenceRef(
                                        artifact_id=aid,
                                        location=EvidenceLocation(kind="file", path=path),
                                        quote=line.strip(),
                                    )
                                ],
                                severity=Severity.MEDIUM,
                                confidence=Confidence.HIGH,
                                suggestion="의도 기준선에 맞게 방향을 교정하세요.",
                            )
                        )
        return result

    async def verify_findings(self, findings, artifacts):
        self.calls.append("verify")
        return findings

    async def compose_charts(self, quant_stats_csv_inputs):
        self.calls.append("charts")
        return [
            ChartSpec(
                title="테마별 발견 건수",
                x_axis_name="테마",
                y_axis_name="건수",
                csv=quant_stats_csv_inputs.get("countsByTheme", "theme,count\n"),
                description="drift 테마별 finding 수",
            )
        ]

    async def write_report(self, intents: list[IntentItem], findings, quant_summary, early_completed):
        self.calls.append("report")
        paragraphs = [f"{i.statement} [intent:{i.intent_id}]" for i in intents]
        return ReportNarrative(
            intent_doc_markdown="# 의도 기준선\n\n" + "\n\n".join(paragraphs),
            qualitative_markdown=f"## 정성 분석\n\n총 {len(findings)}건의 drift가 발견되었습니다.\n\n{quant_summary}",
            suggestions=[f.suggestion for f in findings if f.suggestion][:5] or ["개선 제안 없음"],
        )


class MockRuntime:
    def __init__(self) -> None:
        self.interview = MockInterviewAgents()
        self.pipeline = MockPipelineAgents()
        self._status = "ok"

    async def warm_up(self) -> None:
        return None

    def llm_status(self) -> str:
        return self._status

    async def shutdown(self) -> None:
        return None
