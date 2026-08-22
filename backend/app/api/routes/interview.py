"""인터뷰 API — API-05/06/07/17 (TRD §6)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import Field, model_validator

from app import constants
from app.api.deps import SessionDep
from app.models.api import InterviewCompleteRequest, InterviewCompleteResponse, InterviewStartResponse
from app.models.domain import Answer, CamelModel, QuestionNode
from app.models.enums import CompletedReason, InterviewStatus, SessionStatus
from app.services.interview.engine import (
    remaining_questions,
    request_complete,
    start_interview,
    stats,
    submit_answer,
)

router = APIRouter()


class InterviewAnswerRequest(CamelModel):
    question_id: str
    value: str | None = None
    text: str | None = None
    request_flag: bool | None = None
    request_deeper: bool | None = None

    @model_validator(mode="after")
    def _validate_answer(self):
        answer = self.value if self.value is not None else self.text
        if answer is None:
            raise ValueError("value 또는 text가 필요합니다.")
        trimmed = answer.strip()
        if not (constants.ANSWER_MIN_LEN <= len(trimmed) <= constants.ANSWER_MAX_LEN):
            raise ValueError("답변은 1~2,000자여야 합니다.")
        self.value = trimmed
        if self.request_flag is None:
            self.request_flag = bool(self.request_deeper)
        return self


class AnswerAssessmentView(CamelModel):
    confused_score: float
    ambiguity: float
    incompleteness: float
    inconsistency: float
    fallback: bool = False


class InterviewStats(CamelModel):
    total_questions: int = 0
    answered: int = 0
    remaining_required: int = 0
    max_depth_reached: int = 0
    remaining_questions: int = 0


class InterviewAnswerResponse(CamelModel):
    answered_question_id: str
    assessment: AnswerAssessmentView | None = None
    expanded: bool = False
    next_question: QuestionNode | None = None
    next_questions: list[QuestionNode] = Field(default_factory=list)
    remaining_questions: int = 0
    interview_status: InterviewStatus = InterviewStatus.ACTIVE
    completed_reason: CompletedReason | None = None
    stats: InterviewStats
    progress: dict[str, float | int] = Field(default_factory=dict)
    degraded_mode: bool = False


class InterviewTreeResponse(CamelModel):
    nodes: list[QuestionNode] = Field(default_factory=list)
    answers: list[Answer] = Field(default_factory=list)
    stats: InterviewStats
    interview_status: InterviewStatus = InterviewStatus.ACTIVE
    completed_reason: CompletedReason | None = None
    active_question_id: str | None = None
    remaining_questions: int = 0
    early_completed: bool = False


def _tree_response(state) -> InterviewTreeResponse:
    return InterviewTreeResponse(
        nodes=[state.question_nodes[qid] for qid in state.question_order],
        answers=[state.answers[qid] for qid in state.question_order if qid in state.answers],
        stats=stats(state),
        interview_status=InterviewStatus.COMPLETED
        if state.status is SessionStatus.INTERVIEW_DONE
        else InterviewStatus.ACTIVE,
        completed_reason=state.interview_completed_reason,
        active_question_id=state.active_question_id(),
        remaining_questions=remaining_questions(state),
        early_completed=state.early_completed,
    )


def _answer_response(payload: dict[str, Any]) -> InterviewAnswerResponse:
    return InterviewAnswerResponse.model_validate(payload)


@router.post("/sessions/{session_id}/interview/start", response_model=InterviewStartResponse)
async def start(request: Request, state: SessionDep) -> InterviewStartResponse:
    async with state.lock:
        question = await start_interview(state, request.app.state.runtime.interview)
        return InterviewStartResponse(question=question, remaining_questions=remaining_questions(state))


@router.post("/sessions/{session_id}/interview/answers", response_model=InterviewAnswerResponse)
async def answer(request: Request, state: SessionDep, body: InterviewAnswerRequest) -> InterviewAnswerResponse:
    async with state.lock:
        payload = await submit_answer(
            state,
            request.app.state.runtime.interview,
            question_id=body.question_id,
            value=body.value or "",
            request_flag=bool(body.request_flag),
        )
        return _answer_response(payload)


@router.get("/sessions/{session_id}/interview/tree", response_model=InterviewTreeResponse)
async def tree(state: SessionDep) -> InterviewTreeResponse:
    return _tree_response(state)


@router.post("/sessions/{session_id}/interview/complete", response_model=InterviewCompleteResponse)
async def complete(request: Request, state: SessionDep, body: InterviewCompleteRequest) -> InterviewCompleteResponse:
    async with state.lock:
        await request_complete(state, request.app.state.runtime.interview, confirm=body.confirm)
        return InterviewCompleteResponse(
            completed_reason=state.interview_completed_reason,
            early_completed=state.early_completed,
        )
