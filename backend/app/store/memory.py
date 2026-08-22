"""인메모리 파티션 저장소 (M1 확정, TRD §8.2) — 리포지토리 패턴 뒤 격리.

- 파티션 키 = sessionId, 세션 간 조인/집계 금지 (NG5).
- token은 sha256 해시로만 보관, 불일치 시 SESSION_NOT_FOUND (존재 비노출, §10.1).
- TTL: 마지막 활동 24h / REPORT_READY 72h. lazy check(410) + 5분 sweep (§8.4).
- 만료 파기된 세션은 tombstone으로 기억해 410을 안정적으로 반환.
- M2 Cosmos 승격 시 이 모듈만 교체한다 (§8.2b).
"""

from __future__ import annotations

import hashlib
import logging
import secrets
from collections import OrderedDict
from datetime import timedelta

from app import constants
from app.errors import ApiException, session_expired, session_not_found
from app.models.domain import SessionSettings, new_id, utcnow
from app.models.enums import SessionStatus
from app.observability import log_event
from app.store.state import SessionState

logger = logging.getLogger("app.store")

_TOMBSTONE_CAP = 5_000


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class InMemorySessionStore:
    def __init__(self, max_active_sessions: int = constants.MAX_ACTIVE_SESSIONS) -> None:
        self._states: dict[str, SessionState] = {}
        self._expired_tombstones: OrderedDict[str, bool] = OrderedDict()
        self.max_active_sessions = max_active_sessions

    # --- 수명주기 ---

    def create(self, settings: SessionSettings) -> tuple[SessionState, str]:
        if len(self._states) >= self.max_active_sessions:
            raise ApiException(
                "RATE_LIMITED",
                429,
                "동시 활성 세션 상한에 도달했습니다. 잠시 후 다시 시도해 주세요.",
                retryable=True,
                headers={"Retry-After": "60"},
            )
        token = secrets.token_urlsafe(32)  # 256bit — 추측 불가 난수 (§10.1)
        state = SessionState(
            session_id=new_id(),
            token_hash=_hash_token(token),
            settings=settings,
        )
        self.touch(state)
        self._states[state.session_id] = state
        log_event(logger, "session_created", sessionId=state.session_id, active=len(self._states))
        return state, token

    def get(self, session_id: str, token: str) -> SessionState:
        """토큰 검증 + lazy TTL 검사 + 활동 갱신."""
        state = self._states.get(session_id)
        if state is None:
            if session_id in self._expired_tombstones:
                raise session_expired()
            raise session_not_found()
        if not secrets.compare_digest(state.token_hash, _hash_token(token)):
            raise session_not_found()
        if utcnow() >= state.expires_at:
            self._purge(session_id, expired=True)
            raise session_expired()
        self.touch(state)
        return state

    def delete(self, session_id: str, token: str) -> bool:
        """유저 주도 즉시 파기 (API-19) — 이후 접근은 SESSION_NOT_FOUND. 부재 시 False."""
        state = self._states.get(session_id)
        if state is None:
            return False
        if not secrets.compare_digest(state.token_hash, _hash_token(token)):
            raise session_not_found()
        self._purge(session_id, expired=False)
        log_event(logger, "session_deleted_by_user", sessionId=session_id)
        return True

    def touch(self, state: SessionState) -> None:
        """활동 시 TTL 연장 (§10.2) — REPORT_READY는 72h, 그 외 24h."""
        now = utcnow()
        state.last_activity_at = now
        hours = (
            constants.SESSION_TTL_REPORT_READY_HOURS
            if state.status is SessionStatus.REPORT_READY
            else constants.SESSION_TTL_HOURS
        )
        state.expires_at = now + timedelta(hours=hours)

    def sweep_expired(self) -> int:
        """5분 주기 백그라운드 파기 (§8.4)."""
        now = utcnow()
        expired = [sid for sid, st in self._states.items() if now >= st.expires_at]
        for sid in expired:
            self._purge(sid, expired=True)
        if expired:
            log_event(logger, "ttl_sweep", purged=len(expired), active=len(self._states))
        return len(expired)

    def _purge(self, session_id: str, *, expired: bool) -> None:
        self._states.pop(session_id, None)
        if expired:
            self._expired_tombstones[session_id] = True
            while len(self._expired_tombstones) > _TOMBSTONE_CAP:
                self._expired_tombstones.popitem(last=False)

    # --- 조회 보조 ---

    def count_active(self) -> int:
        return len(self._states)

    def record_usage(
        self, session_id: str | None, input_tokens: int, output_tokens: int, estimated: bool = False
    ) -> None:
        """LLM 어댑터 usage sink — 세션 누적 토큰 계측 (TRD §11.1, 토큰 검증 없음·내부 전용)."""
        if not session_id:
            return
        state = self._states.get(session_id)
        if state is not None:
            state.token_usage.add(input_tokens, output_tokens, estimated)

    def all_states(self) -> list[SessionState]:
        """앱 시작 시 고아 job 복구 전용 (TRD §7.8) — 비즈니스 조회 금지 (NG5)."""
        return list(self._states.values())
