---
summary: "Deep reference for backend memory embeddings package split: router/models/service ownership boundaries, direct route registration, and helper-level error/health contracts."
read_when:
  - When changing files under `backend/src/api/routes/memory/embeddings/*`.
  - When debugging import drift between route registration and module-level `embeddings.router` or `embeddings.service` helpers.
title: "Embeddings Route Package Split and Export Contract Reference"
---

# Embeddings Route Package Split and Export Contract Reference

## Canonical Modules

- `backend/src/api/routes/memory/embeddings/router.py`
- `backend/src/api/routes/memory/embeddings/models.py`
- `backend/src/api/routes/memory/embeddings/service.py`
- `backend/src/api/routes/memory/health.py`
- `backend/src/api/routes/__init__.py`
- `tests/backend/test_memory_routes.py`
- `tests/backend/test_embeddings_service.py`

## Package Ownership Boundary

Embeddings route internals are split by responsibility:

- `router.py`: FastAPI endpoint owners (`POST /api/embeddings/`, `GET /api/embeddings/health`), dependency resolution, and HTTPException boundary.
- `models.py`: request/response Pydantic contracts (`EmbeddingRequest`, `EmbeddingResponse`).
- `service.py`: pure helper behavior for vector serialization, route response shaping, health probe payload construction, and sanitized error raise helper.

## Router Registration Contract

Memory route registration uses the concrete router module directly:

1. `backend/src/api/routes/__init__.py` imports `embeddings_router` from
   `backend.src.api.routes.memory.embeddings.router`.
2. `API_ROUTERS` appends `embeddings_router`.

Public API path is unchanged: `/api/embeddings/*`.

## Import Surface

Route handlers, models, and service helpers are imported from their owner modules: `router.py`, `models.py`, and `service.py`.

## Route-to-Service Helper Contract

`generate_embedding(...)` route in `router.py`:

1. resolve `container.embedding_router`
2. fail fast with `HTTPException(503)` when provider missing
3. delegate payload construction to `generate_embedding_response(...)`
4. preserve explicit `HTTPException`
5. map unexpected exceptions via `raise_embedding_error(...)`

`health_check(...)` route in `router.py`:

- delegates dependency/missing/error policy to `dependency_health_check(...)`
- delegates healthy probe payload to `resolve_health_payload(...)`

Helper boundaries in `service.py`:

- `embedding_to_list(...)`: `.tolist()` then iterable fallback
- `generate_embedding_response(...)`: provider call + timing log + `EmbeddingResponse`
- `resolve_health_payload(...)`: live probe call + healthy payload shape
- `raise_embedding_error(...)`: sanitized 500 envelope (`Embedding generation failed: An internal error occurred`)

## Test-Locked Invariants

`tests/backend/test_memory_routes.py` locks:

- direct route/model imports from `embeddings.router` and `embeddings.models`
- successful route response shape and provider model-name preference
- 503 behavior when embedder missing
- health unhealthy fallback on probe failure

`tests/backend/test_embeddings_service.py` locks:

- helper-level serialization behavior for both `.tolist()` and iterable vectors
- route-response shaping helper output fields
- health payload helper behavior
- sanitized 500 helper raise contract

## Drift Hotspots

1. Reintroducing `embeddings/__init__.py` can blur router/model ownership.
2. Inlining service helper logic back into router functions weakens helper-level unit-test coverage and increases route coupling.
3. Changing helper error message text without route-doc/test updates can desynchronize client-visible error expectations.
4. Registering routes from non-canonical symbols can bypass the concrete route owner.

## Related Pages

- [Backend API Memory Docs Hub](README.md)
- [Memory Route Validation and Fallback Reference](../memory_route_validation_and_fallback_reference.md)
- [Embeddings Route Serialization, Sanitized Error Surface, and Health-Probe Contract Reference](embeddings_route_serialization_sanitized_error_surface_and_health_probe_contract_reference.md)
- [Health Helper Safe-Check, Dependency-Probe, and Payload Contract Reference](health_helper_safe_check_dependency_probe_and_payload_contract_reference.md)
