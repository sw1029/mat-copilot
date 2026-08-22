"""공용 의존성 — session token 검증 (API Layer 책임, TRD §4.2)."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, Header, Request

from app.errors import session_not_found
from app.observability import session_id_var
from app.store.state import SessionState


def get_session_state(
    request: Request,
    session_id: str,
    x_session_token: Annotated[str | None, Header()] = None,
) -> SessionState:
    if not x_session_token:
        raise session_not_found()
    state = request.app.state.store.get(session_id, x_session_token)
    session_id_var.set(state.session_id)
    return state


SessionDep = Annotated[SessionState, Depends(get_session_state)]


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"
