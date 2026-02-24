---
summary: "Deep reference for local LLM providers (Ollama/LM Studio): request param compatibility, list-model endpoint normalization, and shared async HTTP client cleanup lifecycle."
read_when:
  - When changing local provider model-list behavior or endpoint URL construction.
  - When debugging local provider request compatibility with LiteLLM or leaked/stale HTTP clients.
title: "Model Listing, Connection Pooling, and Placeholder Key Reference"
---

# Model Listing, Connection Pooling, and Placeholder Key Reference

## Canonical Modules

- `backend/src/llm/providers/local.py`
- `backend/src/llm/providers/online.py`
- `backend/src/llm/providers/__init__.py`
- `tests/backend/test_local_llm_providers.py`

## Local Provider Request Compatibility

`LocalLLMProvider` inherits completion/stream plumbing from `OnlineLLMProvider`, then mutates transport params:

- sets `custom_llm_provider = "openai"`
- injects `api_key = "placeholder"` when key is absent

Reason:

- local backends do not require real API keys, but LiteLLM compatibility paths may reject null/empty key state.

Both Ollama and LM Studio providers require non-empty `base_url`; invalid values raise provider-specific `ValueError` during initialization.

## Shared Async HTTP Client Lifecycle

Each local provider instance owns one lazily-created `httpx.AsyncClient`.

Concurrency behavior:

- `_get_http_client()` is guarded by async lock
- concurrent calls race safely and return same client instance

Cleanup behavior:

- provider registers `weakref.finalize` callback
- finalizer attempts async `aclose()` on captured event loop
- fallback path handles loop-running vs loop-stopped vs loop-closed cases

Goal:

- reduce connection churn and file descriptor pressure for repeated model-list requests
- avoid leaks when provider instances are evicted from factory cache

## Model Listing Normalization Surface

Shared helper `_list_models_from_json_endpoint(...)` applies:

- HTTP non-200 -> warning + empty list
- non-object JSON root -> warning + empty list
- missing/non-list model field -> warning + empty list
- row-level normalization to:
- `{ id, provider, display_name }`
- trims ids and filters blank/non-string entries

### Ollama endpoint construction

`OllamaProvider._build_tags_url(base_url)` rules:

- strip `/v1` suffix when present
- if result empty or `/`, fallback to `http://localhost:11434`
- final endpoint: `<normalized>/api/tags`

Edge-case compatibility:

- configured base URL `/v1` still resolves to default localhost tags endpoint.

### LM Studio endpoint construction

`LMStudioProvider.list_models()` uses:

- `<base_url>/models` (retains `/v1` when present in configured base URL)
- expects model array in `data` field

## Factory Coupling and Cache-Key Stability

Provider factory (`providers/__init__.py`) always attempts to register local providers regardless of API key.

Canonicalized URL values are used in factory cache keys, so equivalent trailing-slash forms reuse provider instances.

## Test-Backed Invariants

`tests/backend/test_local_llm_providers.py` verifies:

- missing base URL raises clear provider-specific errors
- placeholder API key and `custom_llm_provider=openai` are injected
- Ollama tags endpoint URL normalization (`/v1` stripping and `/v1` fallback host)
- LM Studio `/models` endpoint shape handling
- model row trimming/filtering for invalid ids
- non-list or malformed payload fields return empty list safely
- concurrent `_get_http_client()` calls create exactly one shared client

## Drift Hotspots

1. removing placeholder API-key injection can break local requests through LiteLLM compatibility checks.
2. weakening URL normalization can fragment provider-factory cache and duplicate HTTP client pools.
3. bypassing shared helper normalization can leak malformed model rows into renderer model selectors.

## Related Pages

- [Backend Local Provider Docs Hub](README.md)
- [Provider-Specific Overrides and Local Runtime Reference](../provider_specific_overrides_and_local_runtime_reference.md)
- [Provider Factory and Runtime Selection Reference](../../provider_factory_and_runtime_selection_reference.md)
