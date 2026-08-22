"""LLM 비활성 런타임 — LLM_MODE=disabled 또는 어댑터 부재 시.

모든 agent 호출이 LlmUnavailableError를 던져 호출부의 폴백 경로
(인터뷰 규칙 기반 질문·데모 샘플 경로, TRD §11.2)를 활성화한다.
"""

from __future__ import annotations

from app.errors import LlmUnavailableError


class _Unavailable:
    def __getattr__(self, name: str):
        async def _raise(*args, **kwargs):
            raise LlmUnavailableError(f"LLM 비활성 상태에서 agent 호출: {name}")

        return _raise


class NullRuntime:
    """AgentRuntime 프로토콜 충족 — 전 호출 LlmUnavailableError."""

    def __init__(self) -> None:
        self.interview = _Unavailable()
        self.pipeline = _Unavailable()

    async def warm_up(self) -> None:
        return None

    def llm_status(self) -> str:
        return "disabled"

    async def shutdown(self) -> None:
        return None
