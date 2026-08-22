"""인터뷰 LLM 폴백 — TRD §11.2 규칙 기반 질문/의도 생성."""

from __future__ import annotations

from app.agents.interfaces import IntentDraft, QuestionCandidate
from app.models.enums import IntentPhase, QuestionKind


_REQUIRED_QUESTIONS = [
    ("이 서비스를 사용할 핵심 대상 사용자는 누구인가요?", "사용자군과 주요 상황을 함께 적어 주세요."),
    ("가장 중요한 핵심 기능 또는 사용자 행동은 무엇인가요?", "반드시 포함되어야 하는 기능을 우선순위대로 적어 주세요."),
    ("성공 기준은 무엇인가요?", "정량 지표나 완료 조건이 있으면 함께 적어 주세요."),
    ("반드시 지켜야 할 제약 조건은 무엇인가요?", "기술, 일정, 정책, 예산 제약을 포함할 수 있습니다."),
    ("결과물에서 특히 검증하고 싶은 위험 지점은 무엇인가요?", "누락되면 치명적인 항목을 적어 주세요."),
]


def fallback_root_questions(count: int = 3) -> list[QuestionCandidate]:
    """API-05 생성 실패 시 사용하는 도메인 무관 REQUIRED 질문 세트."""
    return [
        QuestionCandidate(prompt=prompt, helper_text=helper, kind=QuestionKind.REQUIRED)
        for prompt, helper in _REQUIRED_QUESTIONS[:count]
    ]


def fallback_followup_questions(
    *,
    answer_value: str,
    count: int = 3,
    required: bool = False,
    revised: bool = False,
) -> list[QuestionCandidate]:
    """API-06 확장 실패 시 사용하는 결정적 후속 질문."""
    prefix = answer_value.strip()[:40] or "방금 답변"
    prompts = [
        f"'{prefix}'에서 가장 중요한 요구사항을 한 문장으로 정리해 주세요.",
        f"'{prefix}'를 결과물에서 어떻게 확인하면 될지 기준을 알려 주세요.",
        f"'{prefix}'와 관련해 제외해야 할 범위나 제약을 알려 주세요.",
    ]
    return [
        QuestionCandidate(
            prompt=p,
            helper_text="가능하면 구체적인 예시와 기준을 포함해 주세요.",
            kind=QuestionKind.REQUIRED if required and i == 0 else QuestionKind.OPTIONAL,
            intent_phase=IntentPhase.REVISED if revised else IntentPhase.INITIAL,
        )
        for i, p in enumerate(prompts[:count])
    ]


def fallback_intents(qa_pairs: list[tuple[str, str, str]]) -> list[IntentDraft]:
    """derive_intents 실패 시 질문+답변 기반으로 결정적 IntentDraft 생성."""
    drafts: list[IntentDraft] = []
    for question_id, question, answer in qa_pairs:
        clean_answer = " ".join(answer.split())
        clean_question = " ".join(question.split())
        statement = f"{clean_question[:60]}에 대해 사용자는 '{clean_answer[:120]}'라고 답변했습니다."
        drafts.append(IntentDraft(statement=statement, source_question_ids=[question_id]))
    return drafts
