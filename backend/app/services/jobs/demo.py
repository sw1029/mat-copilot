from __future__ import annotations

from app.agents.interfaces import CoverageJudgement, ReportNarrative
from app.models.domain import EvidenceLocation, EvidenceRef, Finding, IntentItem, NormalizationSchema, NormalizedIntent, SchemaField, SchemaTag
from app.models.enums import Confidence, IntentPhase, Severity, ThemeType

DEMO_MARKER = "<!-- mat-copilot-demo-sample:v1 -->"

DEMO_INTENT_STATEMENTS = [
    "사용자는 매일 습관을 기록하고 완료 여부를 체크할 수 있다.",
    "주간 달성률과 연속 성공 일수를 대시보드에서 확인할 수 있다.",
    "로그인 없이 브라우저에서 즉시 사용할 수 있는 웹앱이어야 한다.",
    "사용자가 알림 시간을 설정하면 친절한 리마인더 문구를 보여준다.",
    "모바일 화면에서도 핵심 기록 흐름이 깨지지 않아야 한다.",
]


def is_demo_plan(text: str) -> bool:
    return DEMO_MARKER in text


def is_demo_artifact(text: str) -> bool:
    return DEMO_MARKER in text


def demo_intents() -> list[IntentItem]:
    return [IntentItem(phase=IntentPhase.INITIAL, statement=s, implicit=False, source_question_ids=[]) for s in DEMO_INTENT_STATEMENTS]


def demo_schema() -> NormalizationSchema:
    return NormalizationSchema(
        tags=[SchemaTag(tag_id="demo-core", name="핵심 경험", description="습관 트래커 MVP 핵심 요구")],
        fields=[SchemaField(field_id="priority", name="우선순위", type="string")],
    )


def demo_normalized(intents: list[IntentItem], schema: NormalizationSchema) -> list[NormalizedIntent]:
    tag_id = schema.tags[0].tag_id if schema.tags else "demo-core"
    return [NormalizedIntent(intent_id=i.intent_id, tag_ids=[tag_id], values={"priority": "P0"}) for i in intents]


def demo_coverage_and_findings(intents: list[IntentItem], artifact_id: str, path: str) -> tuple[list[CoverageJudgement], list[Finding]]:
    coverage = [
        CoverageJudgement(intent_id=intents[0].intent_id, covered=True, evidence=[{"artifactId": artifact_id, "location": {"kind": "file", "path": path}, "quote": "사용자는 매일 습관을 기록하고 완료 여부를 체크할 수 있다."}]),
        CoverageJudgement(intent_id=intents[1].intent_id, covered=True, evidence=[{"artifactId": artifact_id, "location": {"kind": "file", "path": path}, "quote": "주간 달성률과 연속 성공 일수를 대시보드 카드로 확인할 수 있다."}]),
        CoverageJudgement(intent_id=intents[2].intent_id, covered=True, evidence=[{"artifactId": artifact_id, "location": {"kind": "file", "path": path}, "quote": "로그인 없이 로컬 저장소 기반으로 바로 시작할 수 있다."}]),
        CoverageJudgement(intent_id=intents[3].intent_id, covered=False),
        CoverageJudgement(intent_id=intents[4].intent_id, covered=False),
    ]
    findings = [
        Finding(
            theme=ThemeType.INTENT_DISTORTION,
            related_intent_ids=[intents[3].intent_id],
            summary="알림 설정 의도가 고정 문구로 축소됨",
            detail="원 의도는 사용자가 알림 시간을 설정하는 것이지만 결과물은 고정 안내 문구만 제공합니다.",
            evidence=[EvidenceRef(artifact_id=artifact_id, location=EvidenceLocation(kind="file", path=path), quote="리마인더는 매일 오전 9시에 고정 문구로 표시된다.")],
            severity=Severity.MEDIUM,
            confidence=Confidence.HIGH,
            suggestion="사용자별 알림 시간 설정 UI와 저장 로직을 추가하세요.",
        ),
        Finding(
            theme=ThemeType.REQUIREMENT_OMISSION,
            related_intent_ids=[intents[4].intent_id],
            summary="모바일 대응 요구 누락",
            detail="결과물 설명에서 모바일 화면 대응 근거를 찾지 못했습니다.",
            evidence=[],
            severity=Severity.HIGH,
            confidence=Confidence.MEDIUM,
            suggestion="모바일 레이아웃과 핵심 기록 플로우를 검증해 반영하세요.",
        ),
    ]
    return coverage, findings


def demo_narrative(intents: list[IntentItem], findings: list[Finding], quant_summary: str, early_completed: bool) -> ReportNarrative:
    md = "# 의도 기준선\n\n" + "\n\n".join(f"{i.statement} [intent:{i.intent_id}]" for i in intents)
    return ReportNarrative(
        intent_doc_markdown=md,
        qualitative_markdown=f"## 데모 분석\n\n핵심 기록과 대시보드는 반영됐지만 알림 개인화와 모바일 대응은 보완이 필요합니다.\n\n{quant_summary}",
        suggestions=[f.suggestion for f in findings if f.suggestion],
    )
