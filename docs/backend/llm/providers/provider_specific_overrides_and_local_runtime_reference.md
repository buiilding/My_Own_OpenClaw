---
summary: "Provider-specific runtime reference for online/local LLM providers: model-prefix rules, reasoning/thinking request flags, local model-listing endpoints, and Kimi streaming tool-call assembly."
read_when:
  - When adding/changing a concrete provider class under `backend/src/llm/providers/*`.
  - When debugging provider-specific completion params, local provider model discovery, or Kimi stream tool-call payloads.
title: "Provider-Specific Overrides and Local Runtime Reference"
---

# Provider-Specific Overrides and Local Runtime Reference

## Canonical Modules

- `backend/src/llm/providers/online.py`
- `backend/src/llm/providers/openai.py`
- `backend/src/llm/providers/anthropic.py`
- `backend/src/llm/providers/gemini.py`
- `backend/src/llm/providers/mistral.py`
- `backend/src/llm/providers/openrouter.py`
- `backend/src/llm/providers/local.py`
- `backend/src/llm/providers/kimi_coding.py`
- `backend/src/llm/providers/__init__.py`
- `backend/src/llm/models/model_service.py`
- `tests/backend/test_kimi_coding_provider.py`
- `tests/backend/test_local_llm_providers.py`
- `tests/backend/test_provider_factory_helpers.py`

## Shared Online Provider Layer (`OnlineLLMProvider`)

`OnlineLLMProvider` centralizes behavior for cloud-like providers:

- API-key dependency check (`_validate_dependencies` uses `_require_api_key`).
- non-stream completion path via `_get_completion_with_standard_params(...)`.
- stream param construction includes usage payloads.
- stream handler selection:
  - thinking-capable providers use `_stream_thinking_and_text_events`,
  - others use `_stream_text_content_events`.
- model namespacing via optional `model_prefix`.

Default `list_models()` returns empty list; online model catalogs are static in `models_config.py`.

## Concrete Online Provider Overrides

### OpenAIProvider

- `provider_label = "OpenAI"`
- no model prefix override (`model_prefix=None`)
- uses shared online behavior only.

### MistralProvider

- `provider_label = "Mistral"`
- `model_prefix = "mistral"`

### OpenRouterProvider

- `provider_label = "OpenRouter"`
- `model_prefix = "openrouter"`
- constructor applies default base URL when missing:
  - `https://openrouter.ai/api/v1`

### AnthropicProvider

- `provider_label = "Anthropic"`
- `model_prefix = "anthropic"`
- `stream_includes_thinking = True`
- for models listed in `ONLINE_THINKING_MODELS["anthropic"]`, adds:
  - `thinking = {"type": "enabled", "budget_tokens": 16384}`

### GeminiProvider

- `provider_label = "Gemini"`
- `model_prefix = "gemini"`
- `stream_includes_thinking = True`
- custom invalid-response message for parser failures.
- for models listed in `ONLINE_THINKING_MODELS["gemini"]`, adds:
  - `reasoning_effort = "low"`

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
- `kimi-code/<id>` -> `<id>`
- `anthropic/<id>` -> `<id>`
- otherwise passthrough

This keeps transport model id aligned with Kimi endpoint expectations.

### Streaming Tool-Turn Support

`supports_streaming_tool_turns(...)` returns `True`.

Kimi stream path accumulates text + tool-call deltas and emits final normalized payload:

- tracks partial arguments across stream chunks,
- merges OpenAI-style `delta.tool_calls` and Anthropic-style `content[type=tool_use]`,
- reconstructs JSON arguments from chunked strings,
- fails closed when streamed argument decoding fails (emits stream error event, no payload persisted),
- synthesizes missing ids as `tool_call_<index>`,
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
  - placeholder API key injected when absent (`LOCAL_PROVIDER_PLACEHOLDER_API_KEY`).
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

## Provider Factory and Alias Normalization

Provider factory normalization from `providers/__init__.py`:

- provider aliases:
  - `kimi-code`, `kimi_code`, `kimi-coding`, `kimi_coding` -> `kimi-coding`
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
- local request params inject placeholder API key + custom provider flag.
- Ollama and LM Studio listing endpoint construction and filtering semantics.
- HTTP client singleton behavior under concurrent access.

`tests/backend/test_provider_factory_helpers.py` verifies:

- URL + provider-name normalization behavior for cache keys.
- Kimi `/v1` canonicalization for equivalent config cache hits.
- alias provider lookup acceptance.

## Drift Hotspots

1. Changing Kimi delta assembly without preserving both OpenAI and Anthropic shapes can drop tool calls mid-stream.
2. Removing placeholder API-key logic can break local LiteLLM compatibility paths.
3. Weakening URL canonicalization inflates provider-factory cache entries and duplicates client pools.
4. Treating all provider failures as fatal in local model discovery removes partial availability behavior.
