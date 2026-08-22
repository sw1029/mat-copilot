"""세션 API — API-01(생성)/02(조회)/03(설정)/19(삭제). FR-11."""

from __future__ import annotations

from fastapi import APIRouter, Request, Response, status

from app.api.deps import SessionDep, client_ip
from app.models.api import SessionCreateRequest, SessionCreateResponse, SettingsPatchRequest
from app.models.domain import Session, SessionSettings
from app.services.session_service import (
    to_session_model,
    validate_confuse_threshold,
    validate_settings,
    validate_time_limit,
)

router = APIRouter()


@router.post("/sessions", status_code=status.HTTP_201_CREATED, response_model=SessionCreateResponse)
async def create_session(request: Request, body: SessionCreateRequest | None = None) -> SessionCreateResponse:
    request.app.state.rate_limiter.check(client_ip(request))  # API-01만 rate limit (§10.7)
    settings = validate_settings(body.settings if body and body.settings else SessionSettings())
    state, token = request.app.state.store.create(settings)
    session = to_session_model(state)
    return SessionCreateResponse(**session.model_dump(by_alias=False), session_token=token)


@router.get("/sessions/{session_id}", response_model=Session)
async def get_session(state: SessionDep) -> Session:
    return to_session_model(state)


@router.patch("/sessions/{session_id}/settings", response_model=Session)
async def patch_settings(state: SessionDep, body: SettingsPatchRequest) -> Session:
    async with state.lock:  # 세션 단위 잠금 (§4.3)
        current = state.settings
        confuse = (
            validate_confuse_threshold(body.confuse_threshold)
            if body.confuse_threshold is not None
            else current.confuse_threshold
        )
        time_limit = (
            validate_time_limit(body.time_limit_sec)
            if body.time_limit_sec is not None
            else current.time_limit_sec
        )
        state.settings = SessionSettings(confuse_threshold=confuse, time_limit_sec=time_limit)
    return to_session_model(state)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(request: Request, session_id: str) -> Response:
    """API-19 — 즉시 파기. 부재 시에도 204 (SCHEMA §2). 토큰 필수."""
    token = request.headers.get("x-session-token") or ""
    deleted = False
    if token:
        deleted = request.app.state.store.delete(session_id, token)
    if deleted and request.app.state.blob.enabled:
        await request.app.state.blob.delete_prefix(f"sessions/{session_id}/")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
