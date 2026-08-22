from __future__ import annotations

import asyncio
import inspect
import os
import time
from collections.abc import Awaitable, Callable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from agent_framework import BaseChatClient, ChatResponse, ChatResponseUpdate, Message

from app import constants
from app.errors import LlmUnavailableError
from app.observability import log_agent_trace, log_llm_usage, session_id_var


@dataclass
class CopilotReply:
    text: str
    model: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    estimated: bool = False


SendFn = Callable[[str, str | None, str | None, str], Awaitable[str | dict[str, Any] | CopilotReply]]
UsageSink = Callable[[str | None, int, int, bool], None]


class CopilotChatClient(BaseChatClient):
    """MAF ChatClient 구현체: Agent Framework 호출을 GitHub Copilot SDK 세션으로 위임한다."""

    OTEL_PROVIDER_NAME = "github-copilot-sdk"

    def __init__(
        self,
        *,
        model: str | None = None,
        agent_id: str = "copilot",
        send_fn: SendFn | None = None,
        timeout_sec: float = constants.LLM_CALL_TIMEOUT_SEC,
        retry_count: int = constants.LLM_RETRY_COUNT,
        usage_sink: UsageSink | None = None,
    ) -> None:
        super().__init__(additional_properties={"provider": "github-copilot-sdk"})
        self.model = model
        self.agent_id = agent_id
        self._send_fn = send_fn or self._send_via_sdk
        self.timeout_sec = timeout_sec
        self.retry_count = retry_count
        self.usage_sink = usage_sink

    async def _inner_get_response(
        self,
        *,
        messages: Sequence[Message],
        stream: bool,
        options: Mapping[str, Any],
        **kwargs: Any,
    ) -> Awaitable[ChatResponse] | Any:
        if stream:
            raise LlmUnavailableError("스트리밍 응답은 지원하지 않습니다.")
        return await self._complete(messages, options)

    async def complete_text(self, prompt: str, *, system_prompt: str | None = None) -> str:
        reply = await self._call_with_retry(prompt, system_prompt)
        return reply.text

    async def _complete(self, messages: Sequence[Message], options: Mapping[str, Any]) -> ChatResponse:
        system_prompt, prompt = self._merge_messages(messages)
        instructions = options.get("instructions") if isinstance(options, Mapping) else None
        if instructions:
            system_prompt = "\n\n".join([x for x in [system_prompt, str(instructions)] if x])
        reply = await self._call_with_retry(prompt, system_prompt)
        return ChatResponse(
            messages=[Message("assistant", [reply.text])],
            model=reply.model or self.model,
            additional_properties={"estimatedUsage": reply.estimated},
        )

    async def _call_with_retry(self, prompt: str, system_prompt: str | None) -> CopilotReply:
        last: Exception | None = None
        for attempt in range(self.retry_count + 1):
            start = time.perf_counter()
            try:
                raw = await asyncio.wait_for(self._invoke_send_fn(prompt, system_prompt), timeout=self.timeout_sec)
                reply = self._coerce_reply(raw)
                self._record_usage(reply, prompt, start)
                log_agent_trace(
                    agent_id=self.agent_id,
                    action="complete",
                    input_meta=f"chars={len(prompt)} attempt={attempt + 1}",
                    output_summary=reply.text,
                    duration_ms=(time.perf_counter() - start) * 1000,
                )
                return reply
            except Exception as exc:  # noqa: BLE001
                last = exc
                if attempt >= self.retry_count:
                    break
                await asyncio.sleep(0.5 * (2**attempt))
        raise LlmUnavailableError(f"Copilot LLM 호출 실패: {last}") from last

    async def _invoke_send_fn(self, prompt: str, system_prompt: str | None) -> str | dict[str, Any] | CopilotReply:
        result = self._send_fn(prompt, system_prompt, self.model, self.agent_id)
        if inspect.isawaitable(result):
            return await result
        return result

    def _record_usage(self, reply: CopilotReply, prompt: str, start: float) -> None:
        estimated = reply.estimated or reply.input_tokens is None or reply.output_tokens is None
        input_tokens = reply.input_tokens if reply.input_tokens is not None else max(1, len(prompt) // 4)
        output_tokens = reply.output_tokens if reply.output_tokens is not None else max(1, len(reply.text) // 4)
        log_llm_usage(
            agent_id=self.agent_id,
            model=reply.model or self.model or "copilot-default",
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            duration_ms=(time.perf_counter() - start) * 1000,
            estimated=estimated,
        )
        if self.usage_sink is not None:
            self.usage_sink(session_id_var.get() or None, input_tokens, output_tokens, estimated)

    @staticmethod
    def _coerce_reply(raw: str | dict[str, Any] | CopilotReply) -> CopilotReply:
        if isinstance(raw, CopilotReply):
            return raw
        if isinstance(raw, str):
            return CopilotReply(text=raw, estimated=True)
        return CopilotReply(
            text=str(raw.get("text") or raw.get("content") or ""),
            model=raw.get("model"),
            input_tokens=raw.get("input_tokens") or raw.get("inputTokens"),
            output_tokens=raw.get("output_tokens") or raw.get("outputTokens"),
            estimated=bool(raw.get("estimated", False)),
        )

    @staticmethod
    def _merge_messages(messages: Sequence[Message]) -> tuple[str | None, str]:
        system: list[str] = []
        body: list[str] = []
        for msg in messages:
            line = msg.text
            if not line:
                continue
            if msg.role == "system":
                system.append(line)
            else:
                body.append(f"[{msg.role}]\n{line}")
        return ("\n\n".join(system) or None, "\n\n".join(body))

    async def _send_via_sdk(
        self, prompt: str, system_prompt: str | None, model: str | None, agent_id: str
    ) -> CopilotReply:
        from copilot import CopilotClient
        from copilot.session_events import AssistantMessageData, AssistantUsageData

        usage: dict[str, Any] = {}

        def on_event(event: Any) -> None:
            data = getattr(event, "data", None)
            if isinstance(data, AssistantUsageData):
                usage.update(
                    model=data.model,
                    input_tokens=data.input_tokens,
                    output_tokens=data.output_tokens,
                    estimated=False,
                )

        token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or None
        async with CopilotClient(github_token=token, use_logged_in_user=None, session_idle_timeout_seconds=30) as client:
            session = await client.create_session(
                model=model,
                client_name="mat-copilot-backend",
                system_message={"mode": "replace", "content": system_prompt} if system_prompt else None,
                on_event=on_event,
                tools=[],
            )
            try:
                event = await session.send_and_wait(prompt, timeout=self.timeout_sec)
            finally:
                await session.disconnect()
        data = getattr(event, "data", None)
        if not isinstance(data, AssistantMessageData):
            raise LlmUnavailableError("Copilot 응답에 assistant message가 없습니다.")
        return CopilotReply(
            text=data.content,
            model=usage.get("model") or data.model or model,
            input_tokens=usage.get("input_tokens"),
            output_tokens=usage.get("output_tokens") or data.output_tokens,
            estimated=not usage,
        )
