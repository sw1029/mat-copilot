"""Agent 런타임 팩토리 — LLM_MODE에 따라 실구현/비활성 런타임 선택."""

from __future__ import annotations

import logging

from app.config import Settings

logger = logging.getLogger("app.agents")


def build_runtime(settings: Settings):
    if settings.llm_mode == "disabled":
        from app.agents.null_runtime import NullRuntime

        return NullRuntime()
    try:
        from app.agents.runtime import CopilotAgentRuntime

        return CopilotAgentRuntime(settings)
    except Exception:  # noqa: BLE001 — 어댑터 로드 실패 시 폴백 경로로 강등 (TRD §11.2)
        logger.error("Copilot 런타임 초기화 실패 — 폴백(NullRuntime)으로 기동", exc_info=True)
        from app.agents.null_runtime import NullRuntime

        return NullRuntime()
