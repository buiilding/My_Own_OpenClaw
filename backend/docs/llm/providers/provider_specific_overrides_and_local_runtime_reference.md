---
summary: "Provider-specific runtime reference for online/local LLM providers: model-prefix rules, reasoning/thinking request flags, local model-listing endpoints, and shared Anthropic/Gemini/Kimi streaming tool-call assembly."
read_when:
  - When adding/changing a concrete provider class under `backend/src/llm/providers/*`.
  - When debugging provider-specific completion params, local provider model discovery, or Anthropic/Gemini/Kimi stream tool-call payloads.
title: "Provider-Specific Overrides and Local Runtime Reference"
---

# Provider-Specific Overrides and Local Runtime Reference

## Canonical Modules

- `backend/src/llm/providers/online.py`
- `backend/src/llm/providers/streaming_tool_call_aggregation.py`
- `backend/src/llm/providers/openai.py`
- `backend/src/llm/providers/anthropic.py`
- `backend/src/llm/providers/gemini.py`
- `backend/src/llm/providers/mistral.py`
- `backend/src/llm/providers/openrouter.py`
- `backend/src/llm/providers/local.py`
- `backend/src/llm/providers/kimi_coding.py`
- `backend/src/llm/providers/factory.py`
- `backend/src/llm/models/model_service.py`
- `tests/backend/test_kimi_coding_provider.py`
- `tests/backend/test_local_llm_providers.py`
- `tests/backend/test_provider_factory_helpers.py`

## Shared Online Provider Layer (`OnlineLLMProvider`)

`OnlineLLMProvider` centralizes behavior for cloud-like providers:

- API-key dependency check (`_validate_dependencies` uses `_require_api_key`).
- non-stream completion path via `_get_completion_with_standard_params(...)`.
- stream param construction in the base provider includes usage payloads through
  `stream_event_pipeline.enable_stream_with_usage(...)`.
- stream handler selection stays in `OnlineLLMProvider` and calls
  `stream_event_pipeline.stream_thinking_and_text_events(...)` for
  thinking-capable providers or `stream_text_content_events(...)` for normal
  text streams.
- model namespacing via optional `model_prefix`.

Default `list_models()` returns empty list; online model catalogs are static in `models_config.py`.

## Concrete Online Provider Overrides

### OpenAIProvider

- `provider_label = "OpenAI"`
- no model prefix override (`model_prefix=None`)
- keeps the shared online behavior for normal chat-completions turns
- switches to `openai_responses_runtime.py` when any of these are true:
  - the selected model preset enables native reasoning
  - backend native `web_search` is enabled for the turn
- OpenAI Responses transport behavior now includes:
  - follow-up continuation with `previous_response_id` when the previous Responses payload exposed one and the current prompt ends in tool outputs
- OpenAI still uses the provider-generic prompt/tool registry as the canonical internal contract for desktop and other direct tools; provider-native adaptation remains limited to supported built-ins such as native `web_search`.

### MistralProvider

- `provider_label = "Mistral"`
- `model_prefix = "mistral"`

### OpenRouterProvider

- `provider_label = "OpenRouter"`
- `model_prefix = "openrouter"`
- `stream_includes_thinking = True`
- constructor applies default base URL when missing:
  - `https://openrouter.ai/api/v1`
- for thinking models listed in `ONLINE_THINKING_MODELS["openrouter"]`, requests
  reasoning details by setting:
  - `reasoning = {"exclude": False}` (when caller has not already provided reasoning params)

### AnthropicProvider

- `provider_label = "Anthropic"`
- `model_prefix = "anthropic"`
- `stream_includes_thinking = True`
- `supports_streaming_tool_turns(...)` returns `True`
- for models listed in `ONLINE_THINKING_MODELS["anthropic"]`, adds provider-native thinking payload:
  - `thinking = {"type": "enabled", "budget_tokens": <resolved>}`
- budget resolution:
  - default is `16384`
  - low/high Anthropic reasoning variants (for example `... Low`, `... High`) map to lower/higher budgets via model preset metadata
- request params add LiteLLM/Anthropic prompt-cache markers with
  `cache_control = {"type": "ephemeral"}` on cacheable stable prefixes:
  - the final normalized tool definition, so Anthropic can cache the tool schema
    prefix before system/messages.
  - the final static prompt-context message (`system`, repo `AGENTS.md`
    instruction, or client prompt layer), leaving per-turn user messages
    unmarked so changing query/window context does not create write-only cache
    entries.
- stream path reuses shared `StreamingToolCallAggregationMixin`, which emits
  normal/thinking deltas live while buffering Anthropic `tool_use` blocks and
  OpenAI-style `delta.tool_calls` until stream completion.
- partial tool calls are not emitted as stream events or executed; only the
  finalized normalized `tool_calls` payload is handed to the agent loop.

### GeminiProvider

- `provider_label = "Gemini"`
- `model_prefix = "gemini"`
- `stream_includes_thinking = True`
- custom invalid-response message for parser failures.
- for models listed in `ONLINE_THINKING_MODELS["gemini"]`, adds provider-native thinking payload:
  - `thinking = {"type": "enabled", "budget_tokens": <resolved>}`
- budget resolution:
  - default is `16384`
  - low/high Gemini reasoning variants map to lower/higher budgets via model preset metadata
- `supports_streaming_tool_turns(...)` returns `True`.
- stream path reuses shared `StreamingToolCallAggregationMixin`, which accumulates OpenAI-style `delta.tool_calls` (and block-style `tool_use`)
  across chunks, then stores normalized stream payload via
  `get_last_stream_response_payload()` so agent tool loops can continue safely after
  streamed thinking/text.
- streamed tool-argument JSON decode failures fail closed: provider emits stream error
  and does not persist partial stream payloads/tool-calls.

## Kimi Coding Provider Specialization

`KimiCodingProvider` is the most customized provider path.

### Endpoint and Provider Wiring

- default base URL: `https://api.kimi.com/coding`
- configured URLs ending in `/v1` are canonicalized to no `/v1`
- request params always include:
  - `custom_llm_provider = "anthropic"`

Provider factory also canonicalizes Kimi URL key (`/v1` stripped) to avoid cache-key duplication.

### Model String Mapping

`_get_full_model_string(...)` rules:

- `kimi-for-coding` -> `k2p5`
- `kimi-coding/<id>` -> `<id>`
- `anthropic/<id>` -> `<id>`
- otherwise passthrough

This keeps transport model id aligned with Kimi endpoint expectations.

### Streaming Tool-Turn Support

`supports_streaming_tool_turns(...)` returns `True`.

Kimi stream path reuses shared `StreamingToolCallAggregationMixin` for text + tool-call delta aggregation and emits final normalized payload:

- tracks partial arguments across stream chunks,
- merges OpenAI-style `delta.tool_calls` and Anthropic-style `content[type=tool_use]`,
- reconstructs JSON arguments from chunked strings,
- fails closed when streamed argument decoding fails (emits stream error event, no payload persisted),
- fails closed when streamed tool-call ids are missing,
- preserves stream `finish_reason`.

Result is persisted via `get_last_stream_response_payload()` for runtime loop tool processing.

Detailed Kimi-only stream behavior:

- [Backend Kimi Provider Docs Hub](kimi/README.md)
- [Stream Tool-Call Aggregation and Fail-Closed Argument Parsing Reference](kimi/stream_tool_call_aggregation_and_fail_closed_argument_parsing_reference.md)

## Local Provider Runtime (`LocalLLMProvider`, `OllamaProvider`, `LMStudioProvider`)

## Local request behavior

- inherits online completion/stream framework.
- overrides request params:
  - `custom_llm_provider = "openai"`
  - `api_key` remains `None` for local providers.
- requires non-empty `base_url` for local concrete providers.

## Shared HTTP client lifecycle

`LocalLLMProvider` keeps one shared `httpx.AsyncClient` per provider instance:

- lazy creation under async lock to prevent duplicate clients under concurrency,
- event-loop reference stored for finalizer cleanup,
- `weakref.finalize` schedules async `aclose()` when provider is GC-evicted from cache.

This avoids repeated connection churn and file descriptor leaks for repeated model-list requests.

## Local model listing behavior

Shared helper `_list_models_from_json_endpoint(...)`:

- executes GET request against provider endpoint,
- non-200 returns empty list with warning,
- non-object JSON payload returns empty list,
- malformed/non-list model fields return empty list,
- rows normalized to `{id, provider, display_name}`,
- blank/non-string ids filtered out.

### Ollama model discovery

- model prefix: `ollama`
- `/v1` suffix removed when building tags endpoint.
- listing endpoint:
  - `<normalized-base>/api/tags`
- special edge case:
  - base URL `/v1` falls back to `http://localhost:11434/api/tags`

### LM Studio model discovery

- model prefix: `lmstudio`
- listing endpoint:
  - `<base_url>/models`
- expects `data` array with `id` fields.

Detailed local-provider runtime behavior:

- [Backend Local Provider Docs Hub](local/README.md)
- [Model Listing and Connection Pooling Reference](local/model_listing_connection_pooling_reference.md)
- [Local Provider HTTP Client Docs Hub](local/http_client/README.md)
- [Shared Async Client Lifecycle and Finalizer Cleanup Runtime Reference](local/http_client/shared_async_client_lifecycle_and_finalizer_cleanup_runtime_reference.md)

## Provider Factory and Key Normalization

Provider factory normalization from `providers/factory.py`:

- provider keys:
  - `kimi-coding`, `kimi_coding` -> `kimi-coding`
  - unsupported Kimi spellings use the normal unavailable-provider path
  - internal whitespace is not rewritten into provider-key punctuation
- trailing slash stripped from provider URLs for stable cache keys.
- timeout conversion:
  - defaults invalid values,
  - enforces minimum 1s and maximum 3600s.

Factory registration policy:

- cloud providers register only when API key exists.
- local providers (`ollama`, `lmstudio`) always attempted.
- missing/invalid provider key raises `ValueError` with available providers list.

## Model Service Integration

`ModelService.get_local_models()` uses provider factory (same cached instances as runtime calls):

1. fetches `ollama` and `lmstudio` providers from factory.
2. queries provider `list_models()` concurrently.
3. keeps partial success when one provider fails.
4. dedupes final list by `(provider,id)`.

Static online catalogs and dynamic local catalogs stay separate in response:

- `online`
- `local`
- `vision`

## Test-Backed Invariants

`tests/backend/test_kimi_coding_provider.py` verifies:

- Kimi declares streaming tool-turn support.
- Kimi completion includes `custom_llm_provider=anthropic`.
- Kimi stream emits thinking + chunk text and reconstructs tool calls/final payload.

`tests/backend/test_local_llm_providers.py` verifies:

- local providers require valid base URL.
- local request params keep `api_key=None` + set the custom provider flag.
- Ollama and LM Studio listing endpoint construction and filtering semantics.
- HTTP client singleton behavior under concurrent access.

`tests/backend/test_provider_factory_helpers.py` verifies:

- URL + provider-name normalization behavior for cache keys.
- Kimi `/v1` canonicalization for equivalent config cache hits.
- alias provider lookup acceptance.

## Drift Hotspots

1. Changing Kimi delta assembly without preserving both OpenAI and Anthropic shapes can drop tool calls mid-stream.
2. Weakening URL canonicalization inflates provider-factory cache entries and duplicates client pools.
3. Treating all provider failures as fatal in local model discovery removes partial availability behavior.
