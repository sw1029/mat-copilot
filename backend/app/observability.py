"""관측성 — 구조화 JSON 로그 + traceId 상관관계 + LLM 토큰/비용 로그 (TRD §11.1).

- trace_id_var / session_id_var: 요청·job 단위 contextvar. 오류 응답 traceId와 일치.
- 로그에는 유저 원문 대신 길이·해시·요약 메타데이터 우선 (TRD §10.2).
- Application Insights: APPLICATIONINSIGHTS_CONNECTION_STRING 설정 시 활성.
"""

from __future__ import annotations

import json
import logging
import sys
import uuid
from contextvars import ContextVar
from datetime import datetime, timezone

trace_id_var: ContextVar[str] = ContextVar("trace_id", default="")
session_id_var: ContextVar[str] = ContextVar("session_id", default="")

_SECRET_FIELD_MARKERS = ("token", "secret", "authorization", "connection_string", "api_key")


def new_trace_id() -> str:
    return uuid.uuid4().hex[:16]


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "ts": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if trace_id_var.get():
            payload["traceId"] = trace_id_var.get()
        if session_id_var.get():
            payload["sessionId"] = session_id_var.get()
        extra = getattr(record, "extra_fields", None)
        if isinstance(extra, dict):
            for k, v in extra.items():
                # 시크릿 값 출력 금지 (TRD §10.5 필드 마스킹)
                if any(m in k.lower() for m in _SECRET_FIELD_MARKERS):
                    payload[k] = "***"
                else:
                    payload[k] = v
        if record.exc_info and record.exc_info[0] is not None:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def setup_logging(appinsights_connection_string: str | None = None) -> None:
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    for h in list(root.handlers):
        root.removeHandler(h)
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root.addHandler(handler)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    if appinsights_connection_string:
        try:
            from azure.monitor.opentelemetry import configure_azure_monitor

            configure_azure_monitor(connection_string=appinsights_connection_string)
            log_event(logging.getLogger("app.observability"), "appinsights_enabled")
        except Exception:  # noqa: BLE001 — 관측성 실패가 앱을 죽이면 안 됨(로그로 기록)
            logging.getLogger("app.observability").warning(
                "Application Insights 초기화 실패 — 로컬 로그로만 동작", exc_info=True
            )


def log_event(logger: logging.Logger, msg: str, /, level: int = logging.INFO, **fields) -> None:
    """구조화 필드를 동반한 이벤트 로그."""
    logger.log(level, msg, extra={"extra_fields": fields})


def log_llm_usage(
    *,
    agent_id: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    duration_ms: float,
    estimated: bool = False,
) -> None:
    """LLM 토큰/비용 로그 (TRD §11.1) — sessionId는 contextvar로 상관."""
    log_event(
        logging.getLogger("app.llm.usage"),
        "llm_call",
        agentId=agent_id,
        model=model,
        inputTokens=input_tokens,
        outputTokens=output_tokens,
        durationMs=round(duration_ms, 1),
        estimated=estimated,
    )


def log_agent_trace(
    *,
    agent_id: str,
    action: str,
    input_meta: str,
    output_summary: str,
    duration_ms: float,
    **fields,
) -> None:
    """agent 호출 trace (TRD §11.1) — 원문이 아닌 요약/길이 메타."""
    log_event(
        logging.getLogger("app.agent.trace"),
        "agent_call",
        agentId=agent_id,
        action=action,
        inputMeta=input_meta,
        outputSummary=output_summary[:300],
        durationMs=round(duration_ms, 1),
        **fields,
    )


def log_sandbox_event(*, artifact_id: str, filename: str, size: int, result: str, reason: str = "") -> None:
    """sandbox 실행 로그 (TRD §11.1)."""
    log_event(
        logging.getLogger("app.sandbox"),
        "sandbox_parse",
        artifactId=artifact_id,
        filename=filename,
        size=size,
        result=result,
        reason=reason,
    )
