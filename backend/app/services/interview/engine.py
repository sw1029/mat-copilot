"""인터뷰 엔진 — TRD §6 질문 트리/턴 루프/완료 처리."""

from __future__ import annotations

import logging
from datetime import timedelta

from app import constants
from app.agents.interfaces import AnswerAssessment, IntentDraft, InterviewAgents, InterviewContext, QuestionCandidate
from app.errors import LlmUnavailableError, interview_not_active, invalid_input, required_questions_pending
from app.models.domain import Answer, IntentItem, QuestionNode, utcnow
from app.models.enums import CompletedReason, IntentPhase, InterviewStatus, QuestionKind, QuestionStatus, SessionStatus
from app.observability import log_event
from app.services.interview.fallback import fallback_followup_questions, fallback_intents, fallback_root_questions
from app.store.state import SessionState

logger = logging.getLogger("app.interview.engine")


def _clamp01(value: float) -> float:
    return min(1.0, max(0.0, value))


def round_to_step(value: float, step: float = constants.CONFUSE_THRESHOLD_STEP) -> float:
    return round(round(_clamp01(value) / step) * step, 2)


def confused_score(assessment: AnswerAssessment) -> float:
    """TRD §6.4 confused = 0.4*a + 0.4*i + 0.2*c, 0.05 단위 반올림."""
    raw = (
        constants.CONFUSED_W_AMBIGUITY * _clamp01(assessment.ambiguity)
        + constants.CONFUSED_W_INCOMPLETENESS * _clamp01(assessment.incompleteness)
        + constants.CONFUSED_W_INCONSISTENCY * _clamp01(assessment.inconsistency)
    )
    return round_to_step(raw)


def _assessment_store(state: SessionState) -> dict[str, dict]:
    if not hasattr(state, "_interview_assessments"):
        state._interview_assessments = {}
    return state._interview_assessments


def _ctx(state: SessionState) -> InterviewContext:
    plan_summary = None
    if state.plan is not None:
        plan_summary = state.plan.text[: constants.CONTEXT_PLAN_SUMMARY_MAX_CHARS]
    intent_snapshots = [i.statement for i in state.intents]
    tree_summary = [state.question_nodes[qid].prompt for qid in state.question_order]
    recent_pairs: list[tuple[str, str]] = []
    for qid in reversed(state.question_order):
        answer = state.answers.get(qid)
        if answer is None:
            continue
        recent_pairs.append((state.question_nodes[qid].prompt, answer.value))
        if len(recent_pairs) >= constants.CONTEXT_RECENT_ANSWERS:
            break
    recent_pairs.reverse()
    return InterviewContext(
        plan_summary=plan_summary,
        intent_snapshots=intent_snapshots,
        tree_summary=tree_summary,
        recent_qa=recent_pairs,
        confuse_threshold=state.settings.confuse_threshold,
    )


def _question_from_candidate(
    candidate: QuestionCandidate,
    *,
    parent_id: str | None,
    depth: int,
    ai_generated: bool,
    status: QuestionStatus = QuestionStatus.PENDING,
) -> QuestionNode:
    return QuestionNode(
        parent_id=parent_id,
        depth=depth,
        prompt=candidate.prompt,
        helper_text=candidate.helper_text,
        kind=candidate.kind,
        status=status,
        ai_generated=ai_generated,
        intent_phase=candidate.intent_phase,
    )


def _add_nodes(
    state: SessionState,
    candidates: list[QuestionCandidate],
    *,
    parent_id: str | None,
    depth: int,
    ai_generated: bool,
) -> list[QuestionNode]:
    available = max(0, constants.MAX_QUESTIONS - len(state.question_order))
    nodes: list[QuestionNode] = []
    for candidate in candidates[:available]:
        node = _question_from_candidate(candidate, parent_id=parent_id, depth=depth, ai_generated=ai_generated)
        state.question_nodes[node.question_id] = node
        state.question_order.append(node.question_id)
        nodes.append(node)
    if available <= 0:
        log_event(logger, "interview_watchdog_max_questions", sessionId=state.session_id, total=len(state.question_order))
    return nodes


def _time_limit_reached(state: SessionState) -> bool:
    limit = state.settings.time_limit_sec
    return bool(
        limit
        and state.interview_started_at is not None
        and utcnow() >= state.interview_started_at + timedelta(seconds=limit)
    )


def remaining_questions(state: SessionState) -> int:
    return max(0, constants.MAX_QUESTIONS - len(state.question_order))


def stats(state: SessionState) -> dict:
    nodes = list(state.question_nodes.values())
    return {
        "totalQuestions": len(nodes),
        "answered": len(state.answers),
        "remainingRequired": len(
            [n for n in nodes if n.kind is QuestionKind.REQUIRED and n.status in (QuestionStatus.PENDING, QuestionStatus.ACTIVE)]
        ),
        "maxDepthReached": max((n.depth for n in nodes), default=0),
        "remainingQuestions": remaining_questions(state),
    }


def progress(state: SessionState) -> dict:
    total = len(state.question_order)
    answered = len(state.answers)
    return {
        "answered": answered,
        "totalQuestions": total,
        "percent": round((answered / total) * 100, 1) if total else 0.0,
    }


def _pending_required(state: SessionState) -> list[QuestionNode]:
    return [
        state.question_nodes[qid]
        for qid in state.question_order
        if state.question_nodes[qid].kind is QuestionKind.REQUIRED
        and state.question_nodes[qid].status in (QuestionStatus.PENDING, QuestionStatus.ACTIVE)
    ]


def select_next_question(state: SessionState, *, current_id: str | None = None, required_only: bool = False) -> QuestionNode | None:
    """TRD §6.2: REQUIRED 미답변 → 현재 노드 자식 DFS → 생성 순."""
    for qid in state.question_order:
        node = state.question_nodes[qid]
        if node.status is QuestionStatus.ACTIVE:
            node.status = QuestionStatus.PENDING

    candidates = _pending_required(state)
    if not candidates and not required_only and current_id is not None:
        candidates = [
            state.question_nodes[qid]
            for qid in state.question_order
            if state.question_nodes[qid].parent_id == current_id and state.question_nodes[qid].status is QuestionStatus.PENDING
        ]
    if not candidates and not required_only:
        candidates = [
            state.question_nodes[qid]
            for qid in state.question_order
            if state.question_nodes[qid].status is QuestionStatus.PENDING
        ]
    if not candidates:
        return None
    candidates[0].status = QuestionStatus.ACTIVE
    return candidates[0]


async def _generate_roots(agent: InterviewAgents, state: SessionState) -> tuple[list[QuestionCandidate], bool]:
    ctx = _ctx(state)
    project_hint = "; ".join(ctx.intent_snapshots[:5]) or ctx.plan_summary or "서비스 도메인 개방형 인터뷰"
    try:
        # 실 런타임이 확장 계약을 제공하면 사용하고, 현재 Protocol/Mock은 기존 후보 생성 API로 대체한다.
        if hasattr(agent, "generate_root_questions"):
            return await agent.generate_root_questions(project_hint, count=3), True  # type: ignore[attr-defined]
        neutral = AnswerAssessment(ambiguity=0.2, incompleteness=0.2, inconsistency=0.0)
        candidates = await agent.generate_candidates(ctx, project_hint, "", neutral, 3, False)
        return await agent.validate_candidates(ctx, candidates[:3]), True
    except LlmUnavailableError:
        log_event(logger, "interview_root_fallback", sessionId=state.session_id)
        return fallback_root_questions(3), False


async def start_interview(state: SessionState, agent: InterviewAgents) -> QuestionNode:
    # SCHEMA API-05 멱등: 이미 시작된 인터뷰면 현재 활성 질문을 그대로 반환.
    if state.status is SessionStatus.INTERVIEWING:
        active_id = state.active_question_id()
        if active_id is not None:
            return state.question_nodes[active_id]
        existing = select_next_question(state)
        if existing is not None:
            return existing
        raise interview_not_active("활성화 가능한 질문이 없습니다.")
    if state.status is not SessionStatus.CREATED:
        raise interview_not_active("CREATED 상태에서만 인터뷰를 시작할 수 있습니다.")
    state.status = SessionStatus.INTERVIEWING
    state.interview_started_at = utcnow()
    candidates, ai_generated = await _generate_roots(agent, state)
    nodes = _add_nodes(state, candidates[:3], parent_id=None, depth=0, ai_generated=ai_generated)
    if not nodes:
        nodes = _add_nodes(state, fallback_root_questions(3), parent_id=None, depth=0, ai_generated=False)
    first = select_next_question(state)
    if first is None:
        raise interview_not_active("시작 질문을 생성할 수 없습니다.")
    return first


async def _generate_followups(
    agent: InterviewAgents,
    state: SessionState,
    node: QuestionNode,
    answer_value: str,
    assessment: AnswerAssessment,
    *,
    revised: bool,
) -> tuple[list[QuestionNode], bool]:
    count = min(constants.MAX_CANDIDATES_PER_TURN, remaining_questions(state))
    if count <= 0:
        return [], False
    try:
        candidates = await agent.generate_candidates(_ctx(state), node.prompt, answer_value, assessment, count, revised)
        candidates = await agent.validate_candidates(_ctx(state), candidates[:count])
        return _add_nodes(state, candidates, parent_id=node.question_id, depth=node.depth + 1, ai_generated=True), True
    except LlmUnavailableError:
        log_event(logger, "interview_followup_fallback", sessionId=state.session_id, questionId=node.question_id)
        candidates = fallback_followup_questions(
            answer_value=answer_value,
            count=count,
            required=assessment.needs_required_followup,
            revised=revised,
        )
        return _add_nodes(state, candidates, parent_id=node.question_id, depth=node.depth + 1, ai_generated=False), False


async def complete_interview(
    state: SessionState,
    agent: InterviewAgents,
    *,
    reason: CompletedReason | None,
    early_completed: bool,
) -> None:
    """공통 완료 처리 — 상태 전이 후 의도 추출/폴백 병합."""
    if state.status is SessionStatus.INTERVIEW_DONE and state.intents_derived:
        return
    state.status = SessionStatus.INTERVIEW_DONE
    state.interview_completed_reason = reason
    state.early_completed = early_completed
    if state.intents_derived:
        return

    qa_pairs = [
        (qid, state.question_nodes[qid].prompt, state.answers[qid].value)
        for qid in state.question_order
        if qid in state.answers
    ]
    try:
        drafts = await agent.derive_intents(_ctx(state), qa_pairs)
    except LlmUnavailableError:
        log_event(logger, "interview_intent_fallback", sessionId=state.session_id)
        drafts = fallback_intents(qa_pairs)
    state.intents.extend(_intent_from_draft(d) for d in drafts)
    state.intents_derived = True


def _intent_from_draft(draft: IntentDraft) -> IntentItem:
    return IntentItem(
        phase=draft.phase,
        statement=draft.statement,
        implicit=draft.implicit,
        source_question_ids=draft.source_question_ids,
    )


async def submit_answer(
    state: SessionState,
    agent: InterviewAgents,
    *,
    question_id: str,
    value: str,
    request_flag: bool,
) -> dict:
    if state.status is not SessionStatus.INTERVIEWING:
        raise interview_not_active()

    # API-06 멱등: 이미 저장된 답변이면 현재 활성 상태와 무관하게 재평가/재확장 금지.
    if question_id in state.answers:
        next_node = state.question_nodes.get(state.active_question_id() or "") if state.active_question_id() else None
        return _answer_payload(state, question_id, next_node, expanded=False)

    node = state.question_nodes.get(question_id)
    if node is None or node.status is not QuestionStatus.ACTIVE:
        raise invalid_input("현재 답변 가능한 질문이 아닙니다.", {"questionId": question_id})

    answer = Answer(question_id=question_id, value=value, request_flag=request_flag)
    state.answers[question_id] = answer
    node.status = QuestionStatus.ANSWERED

    try:
        assessment = await agent.assess_answer(_ctx(state), node.prompt, value)
        degraded = False
    except LlmUnavailableError:
        assessment = AnswerAssessment(ambiguity=0.5, incompleteness=0.5, inconsistency=0.5)
        degraded = True
        log_event(logger, "interview_assess_fallback", sessionId=state.session_id, questionId=question_id)

    score = confused_score(assessment)
    node.confused = score
    _assessment_store(state)[question_id] = {
        "confusedScore": score,
        "ambiguity": round_to_step(assessment.ambiguity),
        "incompleteness": round_to_step(assessment.incompleteness),
        "inconsistency": round_to_step(assessment.inconsistency),
        "fallback": degraded,
    }

    timed_out = _time_limit_reached(state)
    revised = assessment.inconsistency > constants.INCONSISTENCY_REVISED_TRIGGER
    request_bonus = False
    if request_flag and question_id not in state.request_flag_bonus_used:
        state.request_flag_bonus_used.add(question_id)
        request_bonus = True

    max_depth = constants.MAX_DEPTH + (constants.REQUEST_FLAG_DEPTH_BONUS if request_bonus else 0)
    should_expand = (
        not timed_out
        and remaining_questions(state) > 0
        and node.depth < max_depth
        and (
            assessment.needs_required_followup
            or request_bonus
            or (node.kind is QuestionKind.OPTIONAL and score > state.settings.confuse_threshold)
        )
    )
    expanded_nodes: list[QuestionNode] = []
    if should_expand:
        expanded_nodes, _ = await _generate_followups(agent, state, node, value, assessment, revised=revised)
    elif remaining_questions(state) == 0:
        log_event(logger, "interview_watchdog_max_questions", sessionId=state.session_id, total=len(state.question_order))

    next_node = select_next_question(state, current_id=question_id, required_only=timed_out)
    if next_node is None:
        if timed_out:
            reason, early = CompletedReason.TIME_LIMIT, True
        elif remaining_questions(state) == 0:
            reason, early = CompletedReason.WATCHDOG, True
        else:
            reason, early = CompletedReason.THRESHOLD, False
        await complete_interview(state, agent, reason=reason, early_completed=early)
    return _answer_payload(state, question_id, next_node, expanded=bool(expanded_nodes))


def _answer_payload(state: SessionState, question_id: str, next_node: QuestionNode | None, *, expanded: bool) -> dict:
    return {
        "answeredQuestionId": question_id,
        "assessment": _assessment_store(state).get(question_id),
        "expanded": expanded,
        "nextQuestion": next_node,
        "nextQuestions": [next_node] if next_node is not None else [],
        "remainingQuestions": remaining_questions(state),
        "interviewStatus": InterviewStatus.COMPLETED
        if state.status is SessionStatus.INTERVIEW_DONE
        else InterviewStatus.ACTIVE,
        "completedReason": state.interview_completed_reason,
        "stats": stats(state),
        "progress": progress(state),
        "degradedMode": bool((_assessment_store(state).get(question_id) or {}).get("fallback")),
    }


async def request_complete(state: SessionState, agent: InterviewAgents, *, confirm: bool) -> None:
    if state.status is SessionStatus.INTERVIEW_DONE:
        return
    if state.status is SessionStatus.CREATED:
        if state.intents:
            await complete_interview(state, agent, reason=None, early_completed=False)
            return
        raise interview_not_active("인터뷰를 시작하지 않았고 기획안 유래 의도도 없습니다.")
    if state.status is not SessionStatus.INTERVIEWING:
        raise interview_not_active()
    pending = _pending_required(state)
    if pending and not confirm:
        exc = required_questions_pending([q.question_id for q in pending])
        exc.details = {
            **(exc.details or {}),
            "pendingQuestions": [{"questionId": q.question_id, "prompt": q.prompt} for q in pending],
        }
        raise exc
    await complete_interview(state, agent, reason=CompletedReason.USER_EARLY, early_completed=True)
