from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import SessionDep
from app.errors import analysis_precondition_failed
from app.models.domain import Report

router = APIRouter()


@router.get("/sessions/{session_id}/report", response_model=Report)
async def get_report(state: SessionDep) -> Report:
    if state.report is None:
        raise analysis_precondition_failed("완성된 보고서가 없습니다.")
    return state.report


@router.get("/sessions/{session_id}/report/charts")
async def get_report_charts(state: SessionDep):
    if state.report is None:
        raise analysis_precondition_failed("완성된 보고서가 없습니다.")
    return {"charts": [c.model_dump(by_alias=True, mode="json", exclude_none=True) for c in state.report_charts]}
