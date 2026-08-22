"""세션 서비스 — 설정 검증(SCHEMA §4.1)·공개 프로젝션·상태 전이 보조."""

from __future__ import annotations

from app import constants
from app.errors import invalid_input
from app.models.domain import Session, SessionSettings, iso
from app.models.enums import SessionStatus
from app.store.state import SessionState


def validate_confuse_threshold(value: float) -> float:
    if not (constants.CONFUSE_THRESHOLD_MIN <= value <= constants.CONFUSE_THRESHOLD_MAX):
        raise invalid_input("confuseThreshold는 0~1 범위여야 합니다.")
    steps = value / constants.CONFUSE_THRESHOLD_STEP
    if abs(steps - round(steps)) > 1e-6:
        raise invalid_input("confuseThreshold는 0.05 단위여야 합니다.")
    return round(round(steps) * constants.CONFUSE_THRESHOLD_STEP, 2)


def validate_time_limit(value: int | None) -> int | None:
    if value is None:
        return None
    if not isinstance(value, int) or isinstance(value, bool):
        raise invalid_input("timeLimitSec는 정수여야 합니다.")
    if not (constants.TIME_LIMIT_SEC_MIN <= value <= constants.TIME_LIMIT_SEC_MAX):
        raise invalid_input("timeLimitSec는 60~3600 범위 또는 null이어야 합니다.")
    return value


def validate_settings(settings: SessionSettings) -> SessionSettings:
    return SessionSettings(
        confuse_threshold=validate_confuse_threshold(settings.confuse_threshold),
        time_limit_sec=validate_time_limit(settings.time_limit_sec),
    )


def to_session_model(state: SessionState) -> Session:
    return Session(
        session_id=state.session_id,
        status=state.status,
        settings=state.settings,
        plan_id=state.plan.plan_id if state.plan else None,
        active_job_id=state.active_job_id,
        interview_started_at=iso(state.interview_started_at) if state.interview_started_at else None,
        created_at=iso(state.created_at),
        expires_at=iso(state.expires_at),
    )


def has_intents(state: SessionState) -> bool:
    return len(state.intents) > 0


def mark_report_ready(state: SessionState) -> None:
    """REPORT_READY 전이 + TTL 72h 연장 (§10.2)."""
    from datetime import timedelta

    from app.models.domain import utcnow

    state.status = SessionStatus.REPORT_READY
    state.expires_at = utcnow() + timedelta(hours=constants.SESSION_TTL_REPORT_READY_HOURS)
