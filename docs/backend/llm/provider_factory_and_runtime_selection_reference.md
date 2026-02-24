---
summary: "Backend LLM provider runtime reference: provider-factory caching keys, provider normalization, timeout/API-key dependency gates, and model-service local/online catalog assembly."
read_when:
  - When changing provider selection, API-key/base-url handling, or LLM timeout behavior.
  - When debugging unavailable providers, stale model lists, or mismatched online/local model catalogs.
title: "Provider Factory and Runtime Selection Reference"
---

# Provider Factory and Runtime Selection Reference

## Canonical Modules

- `backend/src/llm/client.py`
- `backend/src/llm/providers/__init__.py`
- `backend/src/llm/providers/base.py`
- `backend/src/llm/models/model_service.py`
- `backend/src/llm/models/models_config.py`

## Runtime Selection Layers

Selection path per LLM call:

1. `LiteLLMClient` resolves provider name from session config (`config.model_provider`)
2. provider resolution delegates to `get_provider(config, provider_name)`
3. provider instance comes from cached provider-factory map (`create_provider_factory`)
4. provider executes completion/stream and returns normalized payload

`LiteLLMClient` itself is not globally cached; `get_llm_client(cfg)` creates a new client per call/session update.

## Provider Factory Caching

`_create_cached_provider_factory(...)` uses `@lru_cache(maxsize=16)`.

Cache key inputs are primitives only:

- `api_key`
- normalized timeout string
- canonicalized provider URLs (`ollama`, `lmstudio`, `openrouter`, `kimi-coding`)

Normalization behaviors:

- provider name aliases (`kimi-code`, `kimi_code`, etc.) collapse to `kimi-coding`
- base URLs trimmed and trailing slash normalized
- Kimi URL canonicalized to avoid duplicated cache keys for equivalent `/coding` vs `/coding/v1`
- timeout converted safely with finite/range checks (min floor, max cap)

## Provider Availability Gates

Factory only registers providers that can initialize.

Cloud providers (`openai`, `gemini`, `anthropic`, `openrouter`, `mistral`, `kimi-coding`):

- require API key presence
- skipped if API key missing or provider constructor validation fails

Local providers (`ollama`, `lmstudio`):

- registered without API key
- may still fail at request time if local runtime endpoint is unavailable

If requested provider name is absent in factory map:

- `get_provider(...)` raises `ValueError` with available provider list

## Client Response Normalization and Error Boundaries

`LiteLLMClient` normalizes provider responses to canonical shape:

- required: `content` (string; empty string allowed)
- optional: `tool_calls` list with strict per-item fields (`id`, `name`, `arguments`)
- optional: `finish_reason`

Error semantics:

- non-stream completion path raises `LLMAPIError` on provider or schema failure
- stream path yields `ErrorEvent` on failure (no exception propagation to stream caller)
- stream cache diagnostics and normalized payload retained on client after stream completion

## Model Service Assembly (`ModelService`)

### Online catalog

Source:

- `ONLINE_MODELS`
- `ONLINE_THINKING_MODELS`
- `LOCAL_VISION_MODELS`

Assembly behavior:

- immutable prebuilt catalogs for fast repeated reads
- dedupe by `(provider, id)`
- thinking variants override non-thinking duplicates in combined online list

### Local discovery

`get_local_models()`:

1. reuses provider factory (same cache path as runtime calls)
2. queries local providers (`ollama`, `lmstudio`) concurrently
3. normalizes each returned model entry
4. logs partial/full failure summary
5. deduplicates merged local model list

Return surface from `get_all_models()`:

- `local`
- `online`
- `vision`

## Config-Change Implications

When session config changes (provider/model/API key/timeout/base URL):

- session update path recreates `LiteLLMClient`
- new provider lookups hit cached factory keyed by normalized primitives
- changed key inputs create/fetch a distinct cached provider map automatically

## Debug Checklist

If provider is reported unavailable:

1. verify normalized provider name matches supported keys
2. verify API key presence for cloud providers
3. inspect provider-factory available list in logs

If timeout behavior looks inconsistent:

1. verify configured timeout value survives safe conversion range checks
2. verify provider map cache key changed after timeout update
3. confirm new session/client instance was created after config update

If model list is stale or incomplete:

1. verify `get_all_models()` path (not static list only)
2. check local provider list-model warnings for partial failures
3. verify dedupe key collisions are not hiding duplicate provider/id entries
