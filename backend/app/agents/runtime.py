from __future__ import annotations

import json
import re
import time
from collections.abc import Awaitable, Callable
from typing import Any

from agent_framework import Agent

from app.config import Settings
from app.errors import LlmUnavailableError
from app.models.domain import (
    ChartSpec,
    EvidenceRef,
    Finding,
    IntentItem,
    NormalizationSchema,
    NormalizedIntent,
    SchemaField,
    SchemaTag,
    new_id,
)
from app.models.enums import Confidence, IntentPhase, QuestionKind, Severity, ThemeType
from app.observability import log_agent_trace
from app.agents.copilot_client import CopilotChatClient, SendFn, UsageSink
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
from app.agents import prompts

_JSON_OBJ = re.compile(r"\{", re.M)


def _dump(value: Any) -> str:
    if hasattr(value, "model_dump"):
        return json.dumps(value.model_dump(by_alias=True), ensure_ascii=False, default=str)
    if hasattr(value, "__dataclass_fields__"):
        return json.dumps(value, ensure_ascii=False, default=lambda o: getattr(o, "__dict__", str(o)))
    return json.dumps(value, ensure_ascii=False, default=str)


def _clamp_float(value: Any, default: float = 0.0) -> float:
    try:
        return min(1.0, max(0.0, float(value)))
    except (TypeError, ValueError):
        return default


def _enum(enum_cls, value: Any, default):
    try:
        return enum_cls(value)
    except Exception:  # noqa: BLE001
        return default


def _json_loads_loose(text: str) -> dict[str, Any]:
    text = text.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.S)
    if fenced:
        return json.loads(fenced.group(1))
    match = _JSON_OBJ.search(text)
    if not match:
        raise ValueError("JSON 객체 시작을 찾을 수 없습니다.")
    start = match.start()
    depth = 0
    in_string = False
    escape = False
    for i, ch in enumerate(text[start:], start):
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_string = False
        else:
            if ch == '"':
                in_string = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    return json.loads(text[start : i + 1])
    raise ValueError("완결된 JSON 객체를 찾을 수 없습니다.")


class _JsonAgentMixin:
    client: CopilotChatClient
    agents: dict[str, Agent]

    async def _json(self, agent_id: str, user_prompt: str) -> dict[str, Any]:
        try:
            response = await self.agents[agent_id].run(user_prompt)
        except LlmUnavailableError:
            raise
        except Exception as first:  # noqa: BLE001
            raise LlmUnavailableError(f"{agent_id} 호출 실패: {first}") from first
        try:
            return _json_loads_loose(response.text)
        except Exception as first:  # noqa: BLE001
            try:
                repair = (
                    "이전 응답이 유효한 JSON이 아님. 설명 없이 JSON 객체만 다시 출력하세요.\n"
                    f"원래 요청:\n{user_prompt}"
                )
                response = await self.agents[agent_id].run(repair)
                return _json_loads_loose(response.text)
            except LlmUnavailableError:
                raise
            except Exception as second:  # noqa: BLE001
                raise LlmUnavailableError(f"{agent_id} JSON 파싱 실패: {first}; {second}") from second

    async def _text(self, agent_id: str, user_prompt: str) -> str:
        try:
            response = await self.agents[agent_id].run(user_prompt)
            return response.text.strip()
        except LlmUnavailableError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise LlmUnavailableError(f"{agent_id} 호출 실패: {exc}") from exc


class CopilotInterviewAgents(_JsonAgentMixin):
    def __init__(self, client: CopilotChatClient) -> None:
        self.client = client
        self.agents = {
            "AG-02": Agent(client, instructions=prompts.AG02_SYSTEM, id="AG-02", name="QuestionGenerator"),
            "AG-03": Agent(client, instructions=prompts.AG03_SYSTEM, id="AG-03", name="InterviewVerifier"),
            "AG-04": Agent(client, instructions=prompts.AG04_SYSTEM, id="AG-04", name="QuestionExpander"),
            "AG-05": Agent(client, instructions=prompts.AG05_SYSTEM, id="AG-05", name="IntentDeriver"),
        }

    async def assess_answer(self, ctx: InterviewContext, question_prompt: str, answer_value: str) -> AnswerAssessment:
        data = await self._json(
            "AG-03",
            prompts.AG03_USER.format(
                ctx=prompts.ublock("context", ctx),
                question=prompts.ublock("question", question_prompt),
                answer=prompts.ublock("answer", answer_value),
            ),
        )
        return AnswerAssessment(
            ambiguity=_clamp_float(data.get("ambiguity")),
            incompleteness=_clamp_float(data.get("incompleteness")),
            inconsistency=_clamp_float(data.get("inconsistency")),
            needs_required_followup=bool(data.get("needsRequiredFollowup") or data.get("needs_required_followup")),
            rejection_notes=[str(x) for x in (data.get("rejectionNotes") or data.get("rejection_notes") or [])][:5],
        )

    async def generate_root_questions(self, project_hint: str | None, count: int) -> list[QuestionCandidate]:
        ctx = InterviewContext(project_hint, [], [], [], 0.5)
        return await self.generate_candidates(ctx, "", project_hint or "", AnswerAssessment(0, 0, 0), count, False)

    async def generate_candidates(
        self,
        ctx: InterviewContext,
        question_prompt: str,
        answer_value: str,
        assessment: AnswerAssessment,
        max_candidates: int,
        revised_hint: bool,
    ) -> list[QuestionCandidate]:
        data = await self._json(
            "AG-02",
            prompts.AG02_USER.format(
                count=max_candidates,
                ctx=prompts.ublock("context", ctx),
                question=prompts.ublock("question", question_prompt),
                answer=prompts.ublock("answer", answer_value),
                assessment=_dump(assessment),
                revised_hint=str(revised_hint).lower(),
            ),
        )
        return _parse_questions(data.get("questions", []), max_candidates)

    async def validate_candidates(self, ctx: InterviewContext, candidates: list[QuestionCandidate]) -> list[QuestionCandidate]:
        data = await self._json(
            "AG-04",
            prompts.AG04_USER.format(
                count=len(candidates),
                ctx=prompts.ublock("context", ctx),
                candidates=prompts.ublock("candidates", [_dump(c) for c in candidates]),
            ),
        )
        return _parse_questions(data.get("questions", []), len(candidates))

    async def derive_intents(self, ctx: InterviewContext, qa_pairs: list[tuple[str, str, str]]) -> list[IntentDraft]:
        data = await self._json(
            "AG-05",
            prompts.AG05_DERIVE_USER.format(ctx=prompts.ublock("context", ctx), qa=prompts.ublock("qa", qa_pairs)),
        )
        return _parse_intent_drafts(data.get("intents", []))


class CopilotPipelineAgents(_JsonAgentMixin):
    def __init__(self, client: CopilotChatClient) -> None:
        self.client = client
        self.agents = {
            "AG-01": Agent(client, instructions=prompts.AG01_SYSTEM, id="AG-01", name="PlanIntentExtractor"),
            "AG-05": Agent(client, instructions=prompts.AG05_SYSTEM, id="AG-05", name="Normalizer"),
            "AG-06": Agent(client, instructions=prompts.AG06_SYSTEM, id="AG-06", name="EvaluationPlanner"),
            "AG-09": Agent(client, instructions=prompts.AG09_SYSTEM, id="AG-09", name="ArtifactSummarizer"),
            "AG-11": Agent(client, instructions=prompts.AG11_SYSTEM, id="AG-11", name="DriftDetector"),
            "AG-12": Agent(client, instructions=prompts.AG12_SYSTEM, id="AG-12", name="FindingVerifier"),
            "AG-13": Agent(client, instructions=prompts.AG13_SYSTEM, id="AG-13", name="ChartNarrator"),
            "AG-14": Agent(client, instructions=prompts.AG14_SYSTEM, id="AG-14", name="ReportWriter"),
        }

    async def extract_plan_intents(self, plan_text: str) -> list[IntentDraft]:
        data = await self._json("AG-01", prompts.AG01_USER.format(plan=prompts.ublock("plan", plan_text)))
        return _parse_intent_drafts(data.get("intents", []))

    async def summarize_artifact(self, artifact: ParsedArtifactView) -> str:
        data = await self._json("AG-09", prompts.AG09_USER.format(artifact=prompts.ublock("artifact", artifact)))
        return str(data.get("summary") or "").strip()

    async def build_normalization_schema(self, intents: list[IntentItem]) -> NormalizationSchema:
        data = await self._json("AG-05", prompts.AG05_SCHEMA_USER.format(intents=prompts.ublock("intents", intents)))
        tags = []
        seen = set()
        for raw in data.get("tags", [])[:30]:
            try:
                tag = SchemaTag.model_validate(raw)
                if tag.tag_id and re.match(r"^[a-z0-9][a-z0-9_-]{0,63}$", tag.tag_id) and tag.tag_id not in seen:
                    tags.append(tag)
                    seen.add(tag.tag_id)
            except Exception:  # noqa: BLE001
                continue
        fields = []
        for raw in data.get("fields", [])[:20]:
            try:
                fields.append(SchemaField.model_validate(raw))
            except Exception:  # noqa: BLE001
                continue
        return NormalizationSchema(tags=tags, fields=fields)

    async def normalize_intents(self, intents: list[IntentItem], schema: NormalizationSchema) -> list[NormalizedIntent]:
        data = await self._json(
            "AG-05",
            prompts.AG05_NORMALIZE_USER.format(
                schema=prompts.ublock("schema", schema), intents=prompts.ublock("intents", intents)
            ),
        )
        allowed_intents = {i.intent_id for i in intents}
        allowed_tags = {t.tag_id for t in schema.tags}
        out: list[NormalizedIntent] = []
        for raw in data.get("normalized", []):
            iid = str(raw.get("intentId") or raw.get("intent_id") or "")
            if iid not in allowed_intents:
                continue
            tag_ids = [str(t) for t in raw.get("tagIds", raw.get("tag_ids", [])) if str(t) in allowed_tags]
            values = raw.get("values") if isinstance(raw.get("values"), dict) else {}
            out.append(NormalizedIntent(intent_id=iid, tag_ids=tag_ids, values=values))
        return out

    async def plan_evaluation(
        self, intents: list[IntentItem], normalized: list[NormalizedIntent], schema: NormalizationSchema
    ) -> list[EvaluationItem]:
        data = await self._json(
            "AG-06",
            prompts.AG06_USER.format(
                schema=prompts.ublock("schema", schema),
                intents=prompts.ublock("intents", intents),
                normalized=prompts.ublock("normalized", normalized),
            ),
        )
        allowed = {i.intent_id for i in intents}
        return [
            EvaluationItem(
                intent_id=str(x.get("intentId") or x.get("intent_id")),
                aspect=str(x.get("aspect") or "결과물 반영 여부"),
                quant_candidate=bool(x.get("quantCandidate", x.get("quant_candidate", True))),
            )
            for x in data.get("items", [])
            if str(x.get("intentId") or x.get("intent_id")) in allowed
        ]

    async def analyze_drift(
        self,
        theme: ThemeType,
        intents: list[IntentItem],
        normalized: list[NormalizedIntent],
        evaluation: list[EvaluationItem],
        artifacts: list[ParsedArtifactView],
        artifact_summaries: dict[str, str],
    ) -> ThemeDriftResult:
        data = await self._json(
            "AG-11",
            prompts.AG11_USER.format(
                theme=theme.value,
                intents=prompts.ublock("intents", intents),
                normalized=prompts.ublock("normalized", normalized),
                evaluation=prompts.ublock("evaluation", evaluation),
                summaries=prompts.ublock("summaries", artifact_summaries),
                artifacts=prompts.ublock("artifacts", artifacts),
            ),
        )
        intent_ids = {i.intent_id for i in intents}
        artifact_ids = {a.artifact_id for a in artifacts}
        coverage = _parse_coverage(data.get("coverage", []), intent_ids, artifact_ids)
        findings = _parse_findings(data.get("findings", []), intent_ids, artifact_ids, forced_theme=theme)
        if theme != ThemeType.REQUIREMENT_OMISSION:
            coverage = []
        return ThemeDriftResult(theme=theme, findings=findings, coverage=coverage)

    async def verify_findings(self, findings: list[Finding], artifacts: list[ParsedArtifactView]) -> list[Finding]:
        data = await self._json(
            "AG-12",
            prompts.AG12_USER.format(findings=prompts.ublock("findings", findings), artifacts=prompts.ublock("artifacts", artifacts)),
        )
        artifact_ids = {a.artifact_id for a in artifacts}
        intent_ids = {iid for f in findings for iid in f.related_intent_ids}
        returned = _parse_findings(data.get("findings", []), intent_ids, artifact_ids)
        if returned:
            return returned
        keep = {str(x) for x in data.get("keepFindingIds", [])}
        return [f for f in findings if f.finding_id in keep] if keep else []

    async def compose_charts(self, quant_stats_csv_inputs: dict[str, str]) -> list[ChartSpec]:
        data = await self._json("AG-13", prompts.AG13_USER.format(csvs=prompts.ublock("csvs", quant_stats_csv_inputs)))
        charts: list[ChartSpec] = []
        for raw in data.get("charts", []):
            try:
                charts.append(ChartSpec.model_validate(raw))
            except Exception:  # noqa: BLE001
                csv = quant_stats_csv_inputs.get(str(raw.get("chartId") or raw.get("chart_id") or ""), "")
                charts.append(
                    ChartSpec(
                        chart_id=str(raw.get("chartId") or raw.get("chart_id") or new_id()),
                        title=str(raw.get("title") or "분석 차트"),
                        x_axis_name=str(raw.get("xAxisName") or raw.get("x_axis_name") or "항목"),
                        y_axis_name=str(raw.get("yAxisName") or raw.get("y_axis_name") or "값"),
                        csv=str(raw.get("csv") or csv),
                        description=str(raw.get("description") or ""),
                    )
                )
        return charts

    async def write_report(
        self,
        intents: list[IntentItem],
        findings: list[Finding],
        quant_summary: str,
        early_completed: bool,
    ) -> ReportNarrative:
        data = await self._json(
            "AG-14",
            prompts.AG14_USER.format(
                early_completed=str(early_completed).lower(),
                quant_summary=prompts.ublock("quant_summary", quant_summary),
                intents=prompts.ublock("intents", intents),
                findings=prompts.ublock("findings", findings),
            ),
        )
        return ReportNarrative(
            intent_doc_markdown=str(data.get("intentDocMarkdown") or data.get("intent_doc_markdown") or ""),
            qualitative_markdown=str(data.get("qualitativeMarkdown") or data.get("qualitative_markdown") or ""),
            suggestions=[str(x) for x in data.get("suggestions", [])][:10],
        )


def _parse_questions(raw_items: Any, limit: int) -> list[QuestionCandidate]:
    out: list[QuestionCandidate] = []
    for raw in list(raw_items or [])[:limit]:
        prompt = str(raw.get("prompt") or raw.get("text") or "").strip()
        if not prompt:
            continue
        out.append(
            QuestionCandidate(
                prompt=prompt,
                helper_text=raw.get("helperText") or raw.get("helper_text") or raw.get("rationale"),
                kind=_enum(QuestionKind, raw.get("kind"), QuestionKind.OPTIONAL),
                intent_phase=_enum(IntentPhase, raw.get("intentPhase") or raw.get("phase"), IntentPhase.INITIAL),
            )
        )
    return out


def _parse_intent_drafts(raw_items: Any) -> list[IntentDraft]:
    out: list[IntentDraft] = []
    for raw in list(raw_items or [])[:100]:
        statement = str(raw.get("statement") or "").strip()
        if not statement:
            continue
        out.append(
            IntentDraft(
                statement=statement,
                phase=_enum(IntentPhase, raw.get("phase"), IntentPhase.INITIAL),
                implicit=bool(raw.get("implicit", False)),
                source_question_ids=[str(x) for x in raw.get("sourceQuestionIds", raw.get("source_question_ids", []))],
            )
        )
    return out


def _parse_evidence(raw_items: Any, artifact_ids: set[str]) -> list[EvidenceRef]:
    out: list[EvidenceRef] = []
    for raw in list(raw_items or [])[:10]:
        aid = str(raw.get("artifactId") or raw.get("artifact_id") or "")
        if aid not in artifact_ids:
            continue
        loc = raw.get("location") if isinstance(raw.get("location"), dict) else {}
        loc.setdefault("kind", "file")
        try:
            out.append(EvidenceRef(artifact_id=aid, quote=str(raw.get("quote") or ""), location=loc))
        except Exception:  # noqa: BLE001
            continue
    return out


def _parse_coverage(raw_items: Any, intent_ids: set[str], artifact_ids: set[str]) -> list[CoverageJudgement]:
    out: list[CoverageJudgement] = []
    for raw in list(raw_items or []):
        iid = str(raw.get("intentId") or raw.get("intent_id") or "")
        if iid not in intent_ids:
            continue
        evidence = [e.model_dump(by_alias=True) for e in _parse_evidence(raw.get("evidence", []), artifact_ids)]
        out.append(CoverageJudgement(intent_id=iid, covered=bool(raw.get("covered", False)), evidence=evidence))
    return out


def _parse_findings(
    raw_items: Any, intent_ids: set[str], artifact_ids: set[str], forced_theme: ThemeType | None = None
) -> list[Finding]:
    out: list[Finding] = []
    for raw in list(raw_items or [])[:100]:
        theme = forced_theme or _enum(ThemeType, raw.get("theme"), None)
        if theme is None:
            continue
        related = [str(x) for x in raw.get("relatedIntentIds", raw.get("related_intent_ids", [])) if str(x) in intent_ids]
        summary = str(raw.get("summary") or "").strip()
        detail = str(raw.get("detail") or summary).strip()
        if not summary:
            continue
        out.append(
            Finding(
                finding_id=str(raw.get("findingId") or raw.get("finding_id") or new_id()),
                theme=theme,
                dynamic_theme_name=raw.get("dynamicThemeName") or raw.get("dynamic_theme_name"),
                related_intent_ids=related,
                summary=summary,
                detail=detail,
                evidence=_parse_evidence(raw.get("evidence", []), artifact_ids),
                severity=_enum(Severity, raw.get("severity"), Severity.MEDIUM),
                confidence=_enum(Confidence, raw.get("confidence"), Confidence.MEDIUM),
                suggestion=raw.get("suggestion"),
            )
        )
    return out


class CopilotAgentRuntime:
    def __init__(self, settings: Settings, *, send_fn: SendFn | None = None) -> None:
        self.client = CopilotChatClient(model=settings.copilot_model, send_fn=send_fn)
        self.interview = CopilotInterviewAgents(self.client)
        self.pipeline = CopilotPipelineAgents(self.client)
        self.usage_sink: UsageSink | None = None
        self._llm_status = "unknown"

    def attach_usage_sink(self, sink: UsageSink) -> None:
        self.usage_sink = sink
        self.client.usage_sink = sink

    async def warm_up(self) -> None:
        start = time.perf_counter()
        try:
            await self.client.complete_text("ping: JSON으로 {\"ok\":true}만 응답", system_prompt=prompts.COMMON_SYSTEM)
            self._llm_status = "ok"
        except Exception as exc:  # noqa: BLE001
            self._llm_status = "fail"
            log_agent_trace(
                agent_id="runtime",
                action="warm_up",
                input_meta="ping",
                output_summary=str(exc),
                duration_ms=(time.perf_counter() - start) * 1000,
            )

    def llm_status(self) -> str:
        return self._llm_status

    async def shutdown(self) -> None:
        return None
