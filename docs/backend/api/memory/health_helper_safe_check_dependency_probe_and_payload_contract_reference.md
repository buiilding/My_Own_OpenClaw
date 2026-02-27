---
summary: "Deep reference for memory-route health helpers: canonical healthy/unhealthy payload builders, exception-safe check wrapper semantics, and dependency-aware probe orchestration for sync/async callbacks."
read_when:
  - When changing `backend/src/api/routes/memory/health.py` helper behavior.
  - When debugging memory health endpoints that unexpectedly return unhealthy payloads or suppress probe exceptions.
title: "Health Helper Safe-Check, Dependency-Probe, and Payload Contract Reference"
---

# Health Helper Safe-Check, Dependency-Probe, and Payload Contract Reference

## Canonical Modules

- `backend/src/api/routes/memory/health.py`
- `backend/src/api/routes/memory/embeddings.py`
- `backend/src/api/routes/memory/semantic.py`
- `tests/backend/test_memory_routes.py`

## Payload Builder Contracts

`healthy_payload(**fields)`:

- always returns `{"status": "healthy", ...fields}`
- allows route-specific metadata extension (for example `model_name`, `dimension`, `message`)

`unhealthy_payload(message)`:

- always returns `{"status": "unhealthy", "message": <message>}`

These helpers define the canonical memory health response envelope shape.

## Safe Wrapper Contract (`safe_health_check`)

Signature intent:

- accepts async `check_fn` returning health payload dict
- requires logger + error prefix context
- optional fallback message (default: `"Health check failed"`)

Behavior:

1. executes `await check_fn()`
2. returns check result unchanged on success
3. catches unexpected exceptions, logs with `exc_info=True`, then returns canonical unhealthy payload

Critical invariant:

- health routes stay non-throwing for probe failures; callers always receive a payload dict.

## Dependency-Aware Probe Contract (`dependency_health_check`)

Inputs:

- `dependency`: direct dependency object (optional when `get_dependency` is provided)
- `get_dependency`: optional callable for runtime dependency resolution
- `missing_message`: unhealthy message when dependency absent
- `on_healthy`: callback that returns payload dict (sync or async)
- logger + error/fallback message config

Resolution behavior:

1. resolve dependency via `get_dependency()` when provided, else use `dependency`
2. when resolved dependency is falsey -> return `unhealthy_payload(missing_message)`
3. invoke `on_healthy(resolved_dependency)`
4. if callback result is awaitable, await it
5. wrap whole check via `safe_health_check(...)` for exception normalization

Sync/async callback compatibility is explicit and required.

## Route Integration Contract

`/api/embeddings/health` and `/api/semantic/health` use `dependency_health_check(...)` to:

- fail closed when required dependency (`embedder` / `llm_client`) is missing
- keep route-specific healthy payload details
- avoid 500 exceptions on probe failures

## Test-Backed Invariants

`tests/backend/test_memory_routes.py` verifies:

- `safe_health_check` returns check result unchanged on success
- `safe_health_check` converts raised exception to unhealthy payload
- `dependency_health_check` returns unhealthy payload when dependency missing
- `dependency_health_check` supports both sync and async `on_healthy` callbacks

## Drift Hotspots

1. Removing exception wrapping in `safe_health_check` can cause health route 500s during probes.
2. Changing falsey dependency handling can silently mark missing dependencies as healthy.
3. Breaking sync/async callback compatibility can regress existing health route callback behavior.
4. Changing payload builder keys can break frontend/ops health polling assumptions.

## Related Pages

- [Backend API Memory Docs Hub](README.md)
- [Embeddings Route Serialization, Sanitized Error Surface, and Health-Probe Contract Reference](embeddings_route_serialization_sanitized_error_surface_and_health_probe_contract_reference.md)
- [Semantic Summarization Service Config Resolution, Prompt Assembly, and Parser-Fallback Contract Reference](semantic_summarization_service_config_resolution_prompt_assembly_and_parser_fallback_contract_reference.md)
- [Memory Route Validation and Fallback Reference](../memory_route_validation_and_fallback_reference.md)
