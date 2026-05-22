---
summary: "OpenAI provider guide for WindieOS covering Responses routing, native reasoning, native web search, Codex OAuth, tool compatibility, and tests."
read_when:
  - When changing OpenAI model behavior, Responses API routing, native web search, Codex OAuth, or OpenAI tool-call compatibility.
  - When debugging OpenAI-specific streaming, reasoning, web-search sources, or provider credentials.
title: "OpenAI Provider"
---

# OpenAI Provider

WindieOS treats OpenAI as an online LLM provider with extra routing for native reasoning, native web search, and Codex OAuth-capable models.

## Code Ownership

| Concern | Files |
| --- | --- |
| Provider class | `backend/src/llm/providers/openai.py` |
| Responses runtime | `backend/src/llm/providers/openai_responses_runtime.py` |
| Responses input/payload helpers | `backend/src/llm/providers/openai_responses_input.py`, `backend/src/llm/providers/openai_responses_payload.py` |
| Chat tool compatibility | `backend/src/llm/providers/openai_tool_prep.py` |
| Model catalog/capabilities | `backend/src/llm/models/models_config.py` |
| Credential loading | `backend/src/core/config/loader.py`, `backend/src/core/config/models.py` |
| OAuth helper | `frontend/src/main/openai_codex_oauth.cjs` |
| Dashboard model/API key UI | `frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx`, `ApiKeysSection.jsx` |

## Runtime Selection

`OpenAIProvider` extends `OnlineLLMProvider`.

The provider uses the OpenAI Responses runtime when:

- `resolve_provider_thinking_preference(model_id, "openai")` returns `True`.
- Native web search is enabled for the request.

Otherwise it falls back to the shared LiteLLM chat-completion path from `OnlineLLMProvider`.

## Credential Resolution

Credential priority is:

1. OpenAI Codex OAuth token, only when the selected model supports `supports_codex_oauth` and the token is connected and unexpired.
2. Frontend-managed API key override in `provider_api_keys.openai`.
3. Environment variable from `OpenAIConfig.api_key_env`, default `OPENAI_API_KEY`.

Do not add a second OpenAI key-loading path in provider code. Keep credentials centralized in `load_api_key_for_provider`.

## Tool Calling

OpenAI chat requests pass tools through `make_openai_chat_tools_compatible` before shared request execution. Responses requests are prepared through the Responses payload helpers.

For streamed Responses requests, do not treat `response.completed` or `response.incomplete` as the only authoritative source of assistant output. The stream adapter must also accumulate `response.output_item.added`, `response.function_call_arguments.delta`, `response.function_call_arguments.done`, and `response.output_item.done` so message output and function calls survive when OpenAI ends the stream without a final response envelope. The final envelope is still preferred when present because it carries usage and terminal status.

If a Responses stream closes without a final envelope or any parsed output events, treat it as an incomplete empty assistant response instead of raising a provider exception. This lets the interaction loop use the deterministic empty-final-response fallback rather than surfacing a generic internal server error.

Missing-final-payload fallback logs are intentionally sanitized. They include fallback mode, model id, response id if present, total event count, event-type counts, terminal-event counts, text/reasoning/output-item counters, accumulated text length, output-item counts, and last event key names. They must not log raw text deltas, tool arguments, message content, response payloads, API keys, or bearer tokens.

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
./scripts/test-backend tests/backend/test_openai_provider.py tests/backend/test_openai_embedding_provider.py -q
./scripts/test-backend tests/backend/test_web_search_capabilities.py tests/backend/test_prompt_constructor_utils.py -q
./scripts/test-backend tests/backend/test_llm_provider_base.py tests/backend/test_llm_provider_stream_event_pipeline.py -q
```

Focused frontend tests:

```bash
cd frontend
npm run test:ci -- OpenAICodexOAuth.test.cjs ModelThinkingCapabilities.test.ts ChatInterfaceWiring.test.jsx
```
