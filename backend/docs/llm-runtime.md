# LLM Runtime (Copilot SDK × Microsoft Agent Framework)

- `CopilotAgentRuntime` builds Microsoft Agent Framework `Agent` instances for AG-01~14. Each agent uses `CopilotChatClient`, a `BaseChatClient` subclass.
- `CopilotChatClient` delegates each non-streaming model call to GitHub Copilot SDK: `CopilotClient` → `create_session(model=..., system_message=...)` → `CopilotSession.send_and_wait()`.
- Authentication: pass `GITHUB_TOKEN` or `GH_TOKEN` as `github_token`; if neither exists, the SDK defaults to `use_logged_in_user=True` and uses the logged-in Copilot CLI/GitHub user.
- CLI runtime: default stdio mode resolves explicit path, then `COPILOT_CLI_PATH`, then auto-downloads the pinned CLI to `~/.cache/github-copilot-sdk/cli/{version}/copilot` on Linux. `COPILOT_SKIP_CLI_DOWNLOAD=1|true|yes` disables download. `COPILOT_CLI_EXTRACT_DIR` overrides the cache directory; `COPILOT_CLI_DOWNLOAD_BASE_URL` overrides releases.
- Runtime Node dependency: normal stdio CLI use does not require Node.js. The optional in-process FFI transport may download/load a native `runtime.node` library.
- Usage: SDK emits `assistant.usage` (`AssistantUsageData`) with input/output tokens when available; otherwise the adapter logs estimated tokens (`chars/4`) and forwards usage to `usage_sink`.
- Operations: 15s timeout, 2 retries with 0.5s/1s backoff, JSON repair retry once, and prompt-injection isolation through `<untrusted_data>` blocks.
