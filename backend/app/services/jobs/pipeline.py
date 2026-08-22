from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from app.agents.interfaces import CoverageJudgement, ParsedArtifactView, ReportNarrative
from app.errors import LlmUnavailableError
from app.models.domain import (
    ChartSpec,
    EvidenceRef,
    Finding,
    IntentBlock,
    IntentDoc,
    IntentItem,
    Metric,
    MetricThresholds,
    NormalizationSchema,
    QuantStats,
    Report,
    SeverityCount,
    ThemeCount,
)
from app.models.enums import ArtifactIngestStatus, Confidence, JobStage, MetricStatus, Severity, ThemeType, M1_CORE_THEMES
from app.services.jobs import demo
from app.services.sandbox.parser import whitespace_normalized_contains
from app.store.state import SessionState


class PipelineCancelled(Exception):
    pass


def _complete_stage(rec, stage: JobStage) -> None:
    if stage not in rec.job.completed_stages:
        rec.job.completed_stages.append(stage)
    rec.job.progress = round(len(rec.job.completed_stages) / 6 * 100)
    if rec.cancel_requested:
        raise PipelineCancelled()


def _parsed_views(state: SessionState) -> list[ParsedArtifactView]:
    views: list[ParsedArtifactView] = []
    for aid in state.artifact_order:
        rec = state.artifacts[aid]
        if rec.artifact.ingest_status is ArtifactIngestStatus.PARSED:
            kind = rec.artifact.type.value.lower()
            kind = "file" if kind == "file" else kind
            views.append(
                ParsedArtifactView(
                    artifact_id=aid,
                    name=rec.artifact.name,
                    kind=kind,
                    texts=[(pt.path, pt.text) for pt in rec.parsed_texts],
                )
            )
    return views


def _artifact_notes(state: SessionState) -> list[str]:
    notes: list[str] = []
    for aid in state.artifact_order:
        artifact = state.artifacts[aid].artifact
        if artifact.ingest_status is not ArtifactIngestStatus.PARSED:
            notes.append(f"{artifact.name}: {artifact.ingest_status.value} {artifact.ingest_note or ''}".strip())
        elif artifact.ingest_note:
            notes.append(f"{artifact.name}: {artifact.ingest_note}")
    return notes


def _evidence_from_dict(raw: Any) -> EvidenceRef | None:
    if isinstance(raw, EvidenceRef):
        return raw
    if not isinstance(raw, dict):
        return None
    data = {k[0].lower() + k[1:]: v for k, v in raw.items()}
    try:
        return EvidenceRef.model_validate(data)
    except Exception:
        try:
            return EvidenceRef.model_validate(raw)
        except Exception:
            return None


def _all_text_by_artifact(views: list[ParsedArtifactView]) -> dict[str, str]:
    return {v.artifact_id: "\n".join(text for _, text in v.texts) for v in views}


def _verify_evidence(evidence: list[EvidenceRef], views: list[ParsedArtifactView]) -> list[EvidenceRef]:
    text_by_artifact = _all_text_by_artifact(views)
    verified: list[EvidenceRef] = []
    for ev in evidence:
        body = text_by_artifact.get(ev.artifact_id, "")
        if ev.quote and (ev.quote in body or whitespace_normalized_contains(body, ev.quote)):
            verified.append(ev)
    return verified


def sanitize_findings(findings: list[Finding], views: list[ParsedArtifactView], intents: list[IntentItem]) -> list[Finding]:
    valid_intents = {i.intent_id for i in intents}
    clean: list[Finding] = []
    for finding in findings:
        finding.related_intent_ids = [i for i in finding.related_intent_ids if i in valid_intents]
        finding.evidence = _verify_evidence(finding.evidence, views)
        if not finding.evidence and finding.theme is not ThemeType.REQUIREMENT_OMISSION:
            finding.confidence = Confidence.LOW
        clean.append(finding)
    return clean


def validate_coverage(raw: list[CoverageJudgement], views: list[ParsedArtifactView], intents: list[IntentItem]) -> tuple[set[str], list[str]]:
    valid_intents = {i.intent_id for i in intents}
    covered: set[str] = set()
    notes: list[str] = []
    for item in raw:
        if item.intent_id not in valid_intents or not item.covered:
            continue
        evs = [_evidence_from_dict(e) for e in item.evidence]
        verified = _verify_evidence([e for e in evs if e], views)
        if verified:
            covered.add(item.intent_id)
        else:
            notes.append(f"intent {item.intent_id}: 커버 판정 근거 인용을 원문에서 확인하지 못했습니다.")
    return covered, notes


def aggregate(intents: list[IntentItem], findings: list[Finding], covered_intent_ids: set[str], state: SessionState) -> tuple[QuantStats, list[Metric], list[ChartSpec], str]:
    counts_theme = {theme: 0 for theme in M1_CORE_THEMES}
    for f in findings:
        counts_theme[f.theme] = counts_theme.get(f.theme, 0) + 1
    counts_sev = {sev: 0 for sev in Severity}
    for f in findings:
        counts_sev[f.severity] = counts_sev.get(f.severity, 0) + 1
    stats = QuantStats(
        total_intents=len(intents),
        covered_intents=len(covered_intent_ids),
        drift_count=len(findings),
        counts_by_theme=[ThemeCount(theme=t, count=c) for t, c in counts_theme.items()],
        counts_by_severity=[SeverityCount(severity=s, count=c) for s, c in counts_sev.items()],
    )
    if stats.total_intents:
        coverage = round(stats.covered_intents / stats.total_intents * 100)
        cov_status = MetricStatus.BAD if coverage < 40 else MetricStatus.WARN if coverage < 70 else MetricStatus.GOOD
        cov_value: float | None = coverage
        cov_computable = True
        cov_reason = None
    else:
        cov_status = MetricStatus.NA
        cov_value = None
        cov_computable = False
        cov_reason = "의도가 없어 산정할 수 없습니다."
    high = counts_sev.get(Severity.HIGH, 0)
    drift = stats.drift_count
    tokens = state.token_usage.input_tokens + state.token_usage.output_tokens
    qa = len(state.answers)
    metrics = [
        Metric(metric_id="intent-coverage", label="의도 커버리지", value=cov_value, unit="%", thresholds=MetricThresholds(warn=70, bad=40), status=cov_status, description="검증된 근거가 있는 커버 의도 / 전체 의도", computable=cov_computable, reason=cov_reason),
        Metric(metric_id="drift-count", label="Drift 발견 건수", value=drift, unit="개", thresholds=MetricThresholds(warn=3, bad=6), status=MetricStatus.BAD if drift >= 6 else MetricStatus.WARN if drift >= 3 else MetricStatus.GOOD, description="검증된 finding 총수", computable=True),
        Metric(metric_id="high-severity-count", label="높은 심각도 건수", value=high, unit="개", thresholds=MetricThresholds(warn=1, bad=3), status=MetricStatus.BAD if high >= 3 else MetricStatus.WARN if high >= 1 else MetricStatus.GOOD, description="severity=HIGH finding 수", computable=True),
        Metric(metric_id="token-usage", label="LLM 토큰 사용량", value=tokens, unit="tokens", status=MetricStatus.NA, description="세션 누적 입력+출력 토큰(참고용)", computable=True),
        Metric(metric_id="qa-count", label="인터뷰 문답 수", value=qa, unit="개", status=MetricStatus.NA, description="제출된 인터뷰 답변 수(참고용)", computable=True),
    ]
    csv = "theme,count\n" + "\n".join(f"{tc.theme.value},{tc.count}" for tc in stats.counts_by_theme) + "\n"
    charts = [ChartSpec(title="테마별 발견 건수", x_axis_name="테마", y_axis_name="건수", csv=csv, description="drift 테마별 finding 수")]
    summary = json.dumps(stats.model_dump(mode="json", by_alias=True), ensure_ascii=False)
    return stats, metrics, charts, summary


def build_intent_doc(markdown: str, intents: list[IntentItem]) -> IntentDoc:
    blocks: list[IntentBlock] = []
    rendered: list[str] = []
    seen: set[str] = set()
    valid = {i.intent_id for i in intents}
    for raw in re.split(r"\n\s*\n", markdown.strip()):
        ids = [m for m in re.findall(r"\[intent:([^\]]+)\]", raw) if m in valid]
        clean = re.sub(r"\s*\[intent:[^\]]+\]", "", raw).strip()
        if not clean:
            continue
        block_id = f"ib-{len(blocks) + 1}"
        blocks.append(IntentBlock(block_id=block_id, intent_ids=ids))
        rendered.append(clean)
        seen.update(ids)
    for intent in intents:
        if intent.intent_id not in seen:
            block_id = f"ib-{len(blocks) + 1}"
            blocks.append(IntentBlock(block_id=block_id, intent_ids=[intent.intent_id]))
            rendered.append(intent.statement)
    return IntentDoc(markdown="\n\n".join(rendered), blocks=blocks)


def assign_intent_blocks(findings: list[Finding], doc: IntentDoc) -> None:
    by_intent: dict[str, list[str]] = {}
    for block in doc.blocks:
        for iid in block.intent_ids:
            by_intent.setdefault(iid, []).append(block.block_id)
    valid_blocks = {b.block_id for b in doc.blocks}
    for f in findings:
        ids: list[str] = []
        for iid in f.related_intent_ids:
            ids.extend(by_intent.get(iid, []))
        f.intent_block_ids = [b for b in dict.fromkeys(ids) if b in valid_blocks]


def build_report(state: SessionState, findings: list[Finding], covered: set[str], narrative: ReportNarrative) -> tuple[Report, list[ChartSpec]]:
    stats, metrics, charts, quant_summary = aggregate(state.intents, findings, covered, state)
    doc = build_intent_doc(narrative.intent_doc_markdown, state.intents)
    assign_intent_blocks(findings, doc)
    suggestions = narrative.suggestions or [f.suggestion for f in findings if f.suggestion] or ["개선 제안 없음"]
    schema = state.normalization_schema or NormalizationSchema()
    report = Report(
        session_id=state.session_id,
        early_completed=state.early_completed,
        intent_doc=doc,
        metrics=metrics,
        quant_stats=stats,
        qualitative=narrative.qualitative_markdown,
        suggestions=suggestions,
        findings=findings,
        normalization_schema=schema,
    )
    return report, charts


async def _compose_charts_best_effort(runtime, charts: list[ChartSpec]) -> list[ChartSpec]:
    try:
        produced = await runtime.pipeline.compose_charts({"countsByTheme": charts[0].csv})
        return produced or charts
    except LlmUnavailableError:
        return charts


async def run_analysis_pipeline(state: SessionState, runtime, *, rec) -> None:
    views = _parsed_views(state)
    artifact_notes = _artifact_notes(state)
    demo_mode = bool(state.plan and demo.is_demo_plan(state.plan.text) and any(demo.is_demo_artifact(t) for v in views for _, t in v.texts))

    # INGEST
    if JobStage.INGEST not in rec.job.completed_stages:
        rec.job.stage = JobStage.INGEST
        if demo_mode:
            for v in views:
                state.artifacts[v.artifact_id].summary = "데모 샘플 결과물 요약"
        else:
            for v in views:
                state.artifacts[v.artifact_id].summary = await runtime.pipeline.summarize_artifact(v)
        rec.checkpoints[JobStage.INGEST.value] = {"artifacts": [{"artifactId": v.artifact_id, "name": v.name, "texts": len(v.texts)} for v in views], "notes": artifact_notes}
        _complete_stage(rec, JobStage.INGEST)

    # NORMALIZE
    if JobStage.NORMALIZE not in rec.job.completed_stages:
        rec.job.stage = JobStage.NORMALIZE
        if state.normalization_schema is None:
            state.normalization_schema = demo.demo_schema() if demo_mode else await runtime.pipeline.build_normalization_schema(state.intents)
        if demo_mode:
            state.normalized_intents = demo.demo_normalized(state.intents, state.normalization_schema)
        else:
            normalized = await runtime.pipeline.normalize_intents(state.intents, state.normalization_schema)
            allowed_tags = {t.tag_id for t in state.normalization_schema.tags}
            allowed_intents = {i.intent_id for i in state.intents}
            state.normalized_intents = [
                n.model_copy(update={"tag_ids": [t for t in n.tag_ids if t in allowed_tags]})
                for n in normalized if n.intent_id in allowed_intents
            ]
        rec.checkpoints[JobStage.NORMALIZE.value] = {"schemaId": state.normalization_schema.schema_id, "normalized": len(state.normalized_intents)}
        _complete_stage(rec, JobStage.NORMALIZE)

    # EVALUATE(MAP)
    if JobStage.EVALUATE not in rec.job.completed_stages:
        rec.job.stage = JobStage.EVALUATE
        if demo_mode:
            state.evaluation_items = []
        else:
            state.evaluation_items = await runtime.pipeline.plan_evaluation(state.intents, state.normalized_intents, state.normalization_schema)
        rec.checkpoints[JobStage.EVALUATE.value] = {"items": len(state.evaluation_items)}
        _complete_stage(rec, JobStage.EVALUATE)

    # DRIFT
    if JobStage.DRIFT not in rec.job.completed_stages:
        rec.job.stage = JobStage.DRIFT
        if demo_mode:
            first = views[0]
            first_path = first.texts[0][0] if first.texts else first.name
            coverage, findings = demo.demo_coverage_and_findings(state.intents, first.artifact_id, first_path)
        else:
            results = await asyncio.gather(*[
                runtime.pipeline.analyze_drift(theme, state.intents, state.normalized_intents, state.evaluation_items, views, {aid: r.summary or "" for aid, r in state.artifacts.items()})
                for theme in M1_CORE_THEMES
            ])
            coverage = []
            findings = []
            for r in results:
                coverage.extend(r.coverage)
                findings.extend(r.findings)
            findings = sanitize_findings(findings, views, state.intents)
            findings = await runtime.pipeline.verify_findings(findings, views)
            findings = sanitize_findings(findings, views, state.intents)
        omission_intents = {iid for f in findings if f.theme is ThemeType.REQUIREMENT_OMISSION for iid in f.related_intent_ids}
        covered, notes = validate_coverage(coverage, views, state.intents)
        covered = {iid for iid in covered if iid not in omission_intents}
        rec.checkpoints[JobStage.DRIFT.value] = {"findings": findings, "coveredIntentIds": sorted(covered), "notes": notes}
        _complete_stage(rec, JobStage.DRIFT)

    # AGGREGATE
    if JobStage.AGGREGATE not in rec.job.completed_stages:
        rec.job.stage = JobStage.AGGREGATE
        cp = rec.checkpoints[JobStage.DRIFT.value]
        findings = cp["findings"]
        covered = set(cp["coveredIntentIds"])
        stats, metrics, charts, quant_summary = aggregate(state.intents, findings, covered, state)
        state.report_charts = charts if demo_mode else await _compose_charts_best_effort(runtime, charts)
        rec.checkpoints[JobStage.AGGREGATE.value] = {"stats": stats, "metrics": metrics, "quantSummary": quant_summary}
        _complete_stage(rec, JobStage.AGGREGATE)

    # REPORT
    if JobStage.REPORT not in rec.job.completed_stages:
        rec.job.stage = JobStage.REPORT
        drift_cp = rec.checkpoints[JobStage.DRIFT.value]
        agg_cp = rec.checkpoints[JobStage.AGGREGATE.value]
        findings = drift_cp["findings"]
        covered = set(drift_cp["coveredIntentIds"])
        narrative = demo.demo_narrative(state.intents, findings, agg_cp["quantSummary"], state.early_completed) if demo_mode else await runtime.pipeline.write_report(state.intents, findings, agg_cp["quantSummary"], state.early_completed)
        report, charts = build_report(state, findings, covered, narrative)
        # AGGREGATE 단계에서 AG-13이 성공했다면 해당 차트를 유지한다.
        if not state.report_charts:
            state.report_charts = charts
        state.report = report
        rec.checkpoints[JobStage.REPORT.value] = {"reportId": report.report_id}
        _complete_stage(rec, JobStage.REPORT)
