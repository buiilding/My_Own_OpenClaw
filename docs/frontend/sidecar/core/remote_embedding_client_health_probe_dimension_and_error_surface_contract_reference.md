---
summary: "Deep reference for `RemoteEmbeddingClient`: backend URL normalization, embedding request/response shape, cached embedding-space metadata contract, health-probe semantics, and error-surface behavior."
read_when:
  - When changing `core/remote_embedding_client.py` request, timeout, health-check, or session lifecycle behavior.
  - When debugging sidecar embedding failures, unexpected embedding dimensions, or embedding health-check false negatives.
title: "Remote Embedding Client Health-Probe, Dimension, and Error-Surface Contract Reference"
---

# Remote Embedding Client Health-Probe, Dimension, and Error-Surface Contract Reference

## Canonical Modules

- `frontend/src/main/python/core/remote_embedding_client.py`
- `frontend/src/main/python/core/backend_config.py`
- `backend/src/api/routes/memory/embeddings/router.py`
- `backend/src/api/routes/memory/health.py`
- `tests/sidecar/test_remote_embedding_client.py`
- `tests/backend/test_memory_routes.py`

## Client Surface

Primary methods/properties:

- `initialize()`
- `close()`
- `embed_text(text) -> np.ndarray`
- `health_check() -> bool`
- `refresh_embedding_space() -> dict | None`
- `dimension -> int`
- `provider_id -> str | None`
- `model_id -> str | None`
- `embedding_space_version -> str | None`

## URL and Session Lifecycle Contract

Constructor:

- resolves backend URL from explicit arg or `get_backend_http_url()`
- strips trailing slash (`rstrip("/")`)
- starts with `_session=None`

Session behavior:

- `initialize()` creates one `aiohttp.ClientSession` lazily
- `close()` closes active session and resets it to `None`
- `embed_text(...)` and `health_check(...)` lazily initialize session when missing

## Embedding Request Contract (`embed_text`)

Request:

- endpoint: `POST {backend_url}/api/embeddings/`
- payload:
  - `text`
  - `model_name: "default"`
- timeout: fixed `aiohttp.ClientTimeout(total=30)`

Success response behavior:

- requires `HTTP 200`
- expects JSON fields:
  - `embedding`
  - `provider_id`
  - `model_id`
  - `model_name`
  - `dimension`
  - `embedding_space_version`
- converts to `np.ndarray(dtype=np.float32)`
- caches provider/model/dimension/version metadata for later FAISS compatibility checks

Error behavior:

- non-200 raises:
  - `Embedding API returned {status}: {error_text}`
- `aiohttp.ClientError` raises:
  - `Failed to connect to embedding service: {err}`
- other exceptions are logged and re-raised

## Embedding-Space Metadata Contract

`RemoteEmbeddingClient` caches embedding-space identity from successful embed and health responses:

- `provider_id`
- `model_id`
- `dimension`
- `embedding_space_version`

`get_embedding_space_metadata()` returns:

- `embedding_provider_id`
- `embedding_model_id`
- `embedding_dimension`
- `embedding_space_version`

`dimension` returns the cached backend dimension when available, falling back to the default constant only before the first metadata-bearing success response.

## Health Probe Contract (`health_check`)

Request:

- endpoint: `GET {backend_url}/api/embeddings/health`
- timeout: fixed `aiohttp.ClientTimeout(total=5)`

Success criteria:

- returns `True` only when:
  - HTTP status is `200`
  - JSON payload has `{"status": "healthy"}`
- successful health responses also refresh cached embedding-space metadata

All other outcomes return `False`:

- non-200 status
- non-healthy payload status
- thrown exceptions during request/parse

This method is fail-closed and does not raise to callers.

## Backend Compatibility Boundary

`RemoteEmbeddingClient` expects backend route semantics from:

- `/api/embeddings/` returning JSON-serializable vector list + success HTTP status
- `/api/embeddings/health` returning health envelope with `status` field

See backend route reference for serialization + sanitized error mapping details.

## Test-Backed Invariants

`tests/sidecar/test_remote_embedding_client.py` verifies:

- success ndarray conversion to float32
- embedding response metadata cache updates
- normalized endpoint URL when backend_url has trailing slash
- fixed `30s` POST timeout wiring
- non-200 and network error surfaces
- `health_check()` true/false matrix for healthy/degraded/non-200/exception paths
- initialize/close session reuse + noop close behavior
- default dimension fallback before metadata discovery

`tests/backend/test_memory_routes.py` verifies backend embeddings route/health contracts consumed by this client.

## Drift Hotspots

1. Changing endpoint path or payload fields can silently break sidecar-to-backend embedding compatibility.
2. Changing fixed timeout values affects failure latency and can destabilize long-running embedding calls.
3. Changing backend response metadata fields without updating the sidecar cache logic can break FAISS index compatibility checks.
4. Relaxing health-check criteria can mask degraded embedding backends as healthy.

## Related Pages

- [Frontend Sidecar Core Docs Hub](README.md)
- [Backend URL Resolution, Remote Memory Clients, and Thread-Pool Runtime Reference](backend_url_resolution_remote_memory_clients_and_thread_pool_runtime_reference.md)
- [Embeddings Route Serialization, Sanitized Error Surface, and Health-Probe Contract Reference](../../../backend/api/memory/embeddings_route_serialization_sanitized_error_surface_and_health_probe_contract_reference.md)
