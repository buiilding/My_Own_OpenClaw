---
summary: "Backend memory HTTP route reference for `/api/embeddings` and `/api/semantic`: request validation limits, config/session resolution, parser/fallback behavior, and health-check normalization."
read_when:
  - When changing backend memory HTTP request schemas, validation constraints, or health routes.
  - When debugging embedding route availability, semantic summarize/title parse misses, or sanitized HTTP error behavior.
title: "Memory Route Validation and Fallback Reference"
---

# Memory Route Validation and Fallback Reference

## Canonical Modules

- `backend/src/api/routes/memory/embeddings.py`
- `backend/src/api/routes/memory/semantic.py`
- `backend/src/api/routes/memory/semantic_service.py`
- `backend/src/api/routes/memory/semantic_parser.py`
- `backend/src/api/routes/memory/health.py`
- `backend/src/core/validation/validators.py`
- `backend/src/api/routes/__init__.py`
- `backend/src/api/app_assembly.py`

## Router Registration Surface

Memory HTTP routes are mounted via:

- `backend/src/api/routes/__init__.py` (`embeddings.router`, `semantic.router`)
- then attached by `register_api_routes(...)` in `api/app_assembly.py`

Public prefixes:

- `/api/embeddings`
- `/api/semantic`

## `/api/embeddings` Contract

Route: `POST /api/embeddings/`

Request model `EmbeddingRequest`:

- `text`: required, `1..8192` chars
- `model_name`: optional hint, default `"default"`, `1..128` chars

Execution flow:

1. resolve `container.embedder`
2. return `503` when embedder is unavailable
3. call `await embedder.embed_text(request.text)`
4. normalize vector to JSON-safe list (`tolist()` fallback to `list(...)`)
5. return `embedding`, resolved `model_name`, and `dimension`

Error behavior:

- expected service unavailability -> `HTTP 503`
- unexpected failures -> `HTTP 500` with sanitized message:
  - `"Embedding generation failed: An internal error occurred"`

## `/api/embeddings/health` Contract

Route: `GET /api/embeddings/health`

Health behavior:

- returns `{"status":"unhealthy","message":"Embedding provider not available"}` when embedder missing
- probes real embedder call using `embed_text("test")`
- returns `healthy` payload with `model_name` and measured embedding `dimension`
- unexpected exceptions are normalized by `dependency_health_check(...)` (built on `safe_health_check(...)`) to unhealthy payload (no thrown 500)

## `/api/semantic/summarize` Contract

Route: `POST /api/semantic/summarize`

Request model `SummarizeRequest`:

- `conversations`: required list length `1..100`
- each conversation max length `32768`
- `user_id`: required, validated through shared `validate_user_id(...)`

`validate_user_id(...)` rejects:

- empty string
- whitespace-only string
- literal `"default_user"`

Response model:

- `summary: str`
- `facts: list[str]`
- `success: bool` (route currently returns `true` on success)

## `/api/semantic/title` Contract

Route: `POST /api/semantic/title`

Request model `GenerateTitleRequest`:

- `user_id`: required, validated through shared `validate_user_id(...)`
- `user_message`: required, `1..32768` chars
- `assistant_message`: required, `1..32768` chars
- `model_id`: optional override
- `model_provider`: optional override

Response model:

- `title: str`
- `success: bool` (route currently returns `true` on success)

## Semantic Config Resolution and API-Key Loading

`SemanticSummarizationService.summarize(...)` config path:

1. if active session exists for `user_id`, use `session.cfg`
2. otherwise use global `container.config`
3. for non-local model mode with missing key, call `load_api_key_for_provider(...)`
4. instantiate LLM client from resolved config and request completion with `selected_model_id`

`SemanticSummarizationService.generate_title(...)` follows the same path, with optional
`model_provider`/`model_id` overrides applied before client creation.

## Semantic Prompt/Parsing Pipeline

Prompt assembly:

- merges all conversation strings with `\n\n---\n\n` delimiters
- asks model for `SUMMARY:` block and `FACTS:` bullet list

Primary parser (`parse_summarization_response`):

- summary regex tolerates markdown markers/headings around `SUMMARY:`
- facts regex targets `FACTS:` section followed by bullet lines (`-` or `*`)

Fallback behavior:

- if summary missing:
  - use first `500` chars (`FALLBACK_SUMMARY_LENGTH`) or fixed failure text
- if facts missing:
  - apply broad bullet extraction (`extract_fallback_facts`) over whole response

## Semantic Error Semantics

`SemanticSummarizationService` preserves explicit `HTTPException`s.

Any other exception is sanitized to:

- `HTTP 500`
- detail: `"Summarization failed: An internal error occurred"`

This avoids leaking provider internals to clients while preserving detailed server logs.

## `/api/semantic/health` Contract

Route: `GET /api/semantic/health`

Health behavior:

- validates `container.llm_client` availability
- returns `healthy` with readiness message when client exists
- wraps unexpected errors via `dependency_health_check(...)` to canonical unhealthy payload

## Shared Health Helper Contract

`dependency_health_check(...)` guarantees:

- missing dependency path: returns canonical unhealthy payload with route-specific message
- healthy dependency path: executes route-provided `on_healthy` callback (sync or async)
- exception path: delegates to `safe_health_check(...)` for canonical logged fallback

`safe_health_check(check_fn, ...)` remains the lower-level primitive that:

- success path: returns `check_fn()` payload untouched
- failure path: logs prefixed error and returns:
  - `{"status":"unhealthy","message":"Health check failed"}` (or custom fallback message)

This keeps health routes non-throwing for operational polling systems.

## Debug Checklist

If embeddings route returns `503`:

1. verify container embedder initialization and memory-enabled config
2. verify runtime config updates did not disable/rebind embedder incorrectly

If semantic summarize returns `500`:

1. verify effective session/global model config and provider key availability
2. inspect raw model output for expected `SUMMARY:` / `FACTS:` format
3. confirm parser/fallback path produced non-empty summary/facts

If health route reports unhealthy unexpectedly:

1. confirm dependency presence (`container.embedder` or `container.llm_client`)
2. check server logs for `dependency_health_check` / `safe_health_check` wrapped exceptions
3. verify route registration is active in `API_ROUTERS`

## Related Pages

- [Backend API Docs Hub](README.md)
- [Backend API Memory Docs Hub](memory/README.md)
- [Semantic Summarization Service Config Resolution, Prompt Assembly, and Parser-Fallback Contract Reference](memory/semantic_summarization_service_config_resolution_prompt_assembly_and_parser_fallback_contract_reference.md)
- [Embeddings Route Serialization, Sanitized Error Surface, and Health-Probe Contract Reference](memory/embeddings_route_serialization_sanitized_error_surface_and_health_probe_contract_reference.md)
