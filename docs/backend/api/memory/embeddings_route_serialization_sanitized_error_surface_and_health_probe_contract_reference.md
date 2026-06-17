---
summary: "Deep reference for embeddings route behavior: request bounds, vector serialization helper contract, availability/error mapping, and health-check probe normalization."
read_when:
  - When changing `/api/embeddings` request limits, serialization, or health route behavior.
  - When debugging 503/500 embeddings responses or unhealthy embedding-health status.
title: "Embeddings Route Serialization, Sanitized Error Surface, and Health-Probe Contract Reference"
---

# Embeddings Route Serialization, Sanitized Error Surface, and Health-Probe Contract Reference

## Canonical Modules

- `backend/src/api/routes/memory/embeddings/router.py`
- `backend/src/api/routes/memory/embeddings/models.py`
- `backend/src/api/routes/memory/embeddings/service.py`
- `backend/src/api/routes/memory/health.py`
- `tests/backend/test_memory_routes.py`
- `tests/backend/test_embeddings_service.py`

## Request/Response Schema Contract

`POST /api/embeddings/` request (`EmbeddingRequest`):

- `text`: `1..8192` chars
- `model_name`: `1..128` chars, default `"default"`

Response (`EmbeddingResponse`):

- `embedding: list[float]`
- `model_name: str`
- `dimension: int`
- `embedding_space_version: str`, built from provider/model identity and the
  returned vector dimension

## Embedding Serialization Helper

`embedding_to_list(embedding)` behavior:

- prefers `.tolist()` when available (numpy-like vectors)
- falls back to `list(embedding)` for generic iterables

Purpose:

- force JSON-serializable list output regardless of embedder return type.

## Generation Route Error Mapping

`generate_embedding(...)` flow:

1. resolve `container.embedding_router`
2. missing embedder -> `HTTPException(503, "Embedding service not available")`
3. call `await embedding_provider.embed_text(request.text)`
4. serialize vector with `embedding_to_list`
5. return dimension and provider model name (provider attribute preferred over request hint)
6. derive `embedding_space_version` from the same serialized vector dimension
   returned in `dimension`

Exception handling:

- explicit `HTTPException` preserved as-is
- unexpected failures mapped to:
  - `HTTPException(500, "Embedding generation failed: An internal error occurred")`
- full error details logged server-side; client error stays sanitized.

## Health Route Contract

`GET /api/embeddings/health`:

- unhealthy when embedder missing
- otherwise probes live embedder using `"test"` input
- returns healthy payload with:
  - `model_name`
  - computed `dimension`
  - `embedding_space_version` using the computed probe dimension
  - computed `dimension`

Wrapped via `dependency_health_check(...)`:

- unexpected exceptions return canonical unhealthy payload instead of raising.

## Shared Health Helper Semantics

`dependency_health_check(...)`:

- returns unhealthy payload immediately when embedder dependency is missing
- runs route-specific `on_healthy` probe callback (sync/async)
- routes unexpected exceptions through `safe_health_check(...)`

`safe_health_check(check_fn, ...)`:

- success: returns check payload unchanged
- exception: logs prefixed error and returns `{"status":"unhealthy","message":"Health check failed"}` (or custom fallback)

## Test-Backed Matrix

`tests/backend/test_memory_routes.py` verifies:

- embeddings success route returns serialized list and expected dimension/model name
- embeddings route returns 503 when embedder missing
- embeddings health returns unhealthy when probe call fails
- `dependency_health_check` handles missing dependencies + healthy probes
- `safe_health_check` returns check payload on success and canonical unhealthy payload on exception

`tests/backend/test_embeddings_service.py` verifies:

- serialization helper handles both `.tolist()` and plain iterables
- response shaping keeps provider model preference + correct dimension
- health probe payload uses live embedder results
- sanitized 500 error mapping helper raises `HTTPException`

## Drift Hotspots

1. Removing `.tolist()` fallback can break numpy-like embedding outputs.
2. Dropping 503 missing-embedder behavior can blur infra availability vs runtime errors.
3. Returning raw exception messages from 500 path can leak backend internals.

## Related Pages

- [Backend API Memory Docs Hub](README.md)
- [Embeddings Route Package Split and Export Contract Reference](embeddings_route_package_split_and_export_contract_reference.md)
- [Health Helper Safe-Check, Dependency-Probe, and Payload Contract Reference](health_helper_safe_check_dependency_probe_and_payload_contract_reference.md)
- [Semantic Summarization Service Config Resolution, Prompt Assembly, and Parser-Fallback Contract Reference](semantic_summarization_service_config_resolution_prompt_assembly_and_parser_fallback_contract_reference.md)
- [Memory Route Validation and Fallback Reference](../memory_route_validation_and_fallback_reference.md)
