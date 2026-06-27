---
summary: "OpenAI provider guide for WindieOS covering Responses routing, native reasoning, native web search, tool compatibility, and tests."
read_when:
  - When changing OpenAI model behavior, Responses API routing, native web search, or OpenAI tool-call compatibility.
  - When debugging OpenAI-specific streaming, reasoning, web-search sources, or provider credentials.
title: "OpenAI Provider"
---

# OpenAI Provider

WindieOS treats OpenAI as an online LLM provider with extra routing for native reasoning and native web search.

## Code Ownership

| Concern | Files |
| --- | --- |
| Provider class | `backend/src/llm/providers/openai.py` |
| Responses runtime | `backend/src/llm/providers/openai_responses_runtime.py` |
| Responses input/payload helpers | `backend/src/llm/providers/openai_responses_input.py`, `backend/src/llm/providers/openai_responses_payload.py` |
| Chat tool compatibility | `backend/src/llm/providers/openai_tool_prep.py` |
| Model catalog/capabilities | `backend/src/llm/models/models_config.py` |
| Credential loading | `backend/src/core/config/loader.py`, `backend/src/core/config/models.py` |
| Dashboard model/API key UI | `frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx`, `ApiKeysSection.jsx` |

## Runtime Selection

`OpenAIProvider` extends `OnlineLLMProvider`.

The backend model catalog exposes GPT-5.4 and GPT-5.5 as separate OpenAI
families. Each family has `none`, `low`, `medium`, `high`, and `xhigh`
reasoning presets, and every preset is routed through the Responses runtime.

The provider uses the OpenAI Responses runtime when:

- `resolve_provider_thinking_preference(model_id, "openai")` returns `True`.
- Native web search is enabled for the request.

Otherwise it falls back to the shared LiteLLM chat-completion path from `OnlineLLMProvider`.

## Image Detail

OpenAI request shaping sets image blocks to `detail: "original"` for both
Responses input images and chat-completions `image_url` blocks. This is an
OpenAI-provider payload decision; stored WindieOS messages stay provider-neutral
and do not carry OpenAI-specific image detail metadata.

## Credential Resolution

Credential priority is:

1. Renderer-managed API key override in `provider_api_keys.openai`.
2. Environment variable from `OpenAIConfig.api_key_env`, default `OPENAI_API_KEY`.

Do not add a second OpenAI key-loading path in provider code. Keep credentials centralized in `load_api_key_for_provider`.

## Tool Calling

OpenAI chat requests pass tools through `make_openai_chat_tools_compatible` before shared request execution. Responses requests are prepared through the Responses payload helpers, which accept both Windie flat function specs and OpenAI chat-shaped `{"type":"function","function":{...}}` specs before emitting Responses `function` tools.

Responses history input is stricter than the tool-schema adapter: assistant
`tool_calls` must already be provider-normalized to
`{"id": "...", "type": "function", "function": {"name": "...", "arguments": "..."}}`.
Internal WindieOS `{id,name,arguments}` tool-call rows are normalized at the
provider message boundary before `openai_responses_input.py` builds the request.

For streamed Responses requests, do not treat `response.completed` or `response.incomplete` as the only authoritative source of assistant output. The stream adapter must also accumulate `response.output_item.added`, `response.function_call_arguments.delta`, `response.function_call_arguments.done`, and `response.output_item.done` so message output and function calls survive when OpenAI ends the stream without a final response envelope. The final envelope is still preferred when present because it carries usage and terminal status.

If a Responses stream closes without a final envelope, parsed output events, or structured upstream failure details, emit a provider stream error instead of synthesizing an empty assistant completion. This keeps incomplete upstream failures out of assistant history while still allowing parsed output fallbacks when OpenAI omits the final response envelope.

Missing-final-payload fallback logs are intentionally sanitized. They include fallback mode, model id, response id if present, total event count, event-type counts, terminal-event counts, text/reasoning/output-item counters, accumulated text length, output-item counts, last event key names, and bounded failure summaries for upstream `error` or `response.failed` events. Failure summaries may include status, code, param, response id, and a redacted/truncated provider error message. They must not log raw text deltas, tool arguments, message content, full response payloads, API keys, or bearer tokens.

When an upstream `response.failed` event carries structured error details, the stream adapter must emit classified provider metadata instead of the generic empty-stream marker. `context_length_exceeded` remains non-retryable and must include a context marker so the interaction loop can attempt compaction recovery. `rate_limit_exceeded`, upstream server failures, and transient transport-shaped failures are retryable only before any downstream-visible output; quota, auth, invalid prompt, and policy failures remain fatal.

When changing OpenAI tool behavior, verify:

- Tool schema stays provider-compatible.
- Tool-call ids remain stable through stream parsing and history writes.
- The provider-specific payload still normalizes back to `NormalizedLLMResponse`.
- Native reasoning models continue to report support for streaming tool turns.

## Web Search

Native web search is exposed through capability metadata in `models_config.py`. The web-search planner enables OpenAI-native search only for models marked with `supports_native_web_search`.

If search results disappear:

- Check model capability metadata first.
- Check `native_web_search_enabled` propagation through request kwargs.
- Check Responses runtime payload construction.
- Check source extraction/formatting before editing renderer display.

## Tests

Focused backend tests:

```bash
<windie> test backend tests/backend/test_openai_provider.py tests/backend/test_openai_embedding_provider.py -q
<windie> test backend tests/backend/test_web_search_capabilities.py tests/backend/test_prompt_constructor_utils.py -q
<windie> test backend tests/backend/test_llm_provider_base.py tests/backend/test_llm_provider_stream_event_pipeline.py -q
```

Focused frontend tests:

```bash
cd frontend
<windie> test frontend -- ModelThinkingCapabilities.test.ts ChatInterfaceWiring.test.jsx
```
