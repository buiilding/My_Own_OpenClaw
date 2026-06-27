---
summary: "Backend API deep reference for artifacts route package split: router/models ownership, direct router registration, and route-level upload/lookup error contracts."
read_when:
  - When changing files under `backend/src/api/routes/artifacts/*`.
  - When debugging import drift between route registration and module-level router/model symbols used by tests.
title: "Artifacts Route Package Split Reference"
---

# Artifacts Route Package Split Reference

## Canonical Modules

- `backend/src/api/routes/artifacts/router.py`
- `backend/src/api/routes/artifacts/models.py`
- `backend/src/api/routes/__init__.py`
- `backend/src/services/artifacts/store.py`
- `tests/backend/test_artifact_routes.py`
- `tests/backend/test_app_assembly.py`

## Package Ownership Boundary

Artifacts route internals are split by responsibility:

- `router.py`: FastAPI handlers for upload and fetch endpoints plus HTTP error-mapping boundary.
- `models.py`: API response model (`ArtifactUploadResponse`).

`backend/src/services/artifacts/store.py` remains storage/runtime owner (validation, content-type handling, path resolution).

## Router Registration Contract

Route registration uses the concrete router module directly:

1. `backend/src/api/routes/__init__.py` imports `artifacts_router` from
   `backend.src.api.routes.artifacts.router`.
2. `API_ROUTERS` includes `artifacts_router`.

Public endpoints stay unchanged:

- `POST /api/artifacts/`
- `GET /api/artifacts/{artifact_id}`

## Import Surface

Implementation symbols stay in their owner modules:

- route handlers: `backend.src.api.routes.artifacts.router`
- response models: `backend.src.api.routes.artifacts.models`
- storage owner: `backend.src.services.artifacts`

## Route Behavior Contracts

### Upload (`upload_artifact`)

Flow:

1. build store via `ArtifactStore.from_config(container.config)`
2. persist multipart file via `store.save_upload(file)`
3. build canonical artifact URL from `request.base_url`
4. return `ArtifactUploadResponse` with:
  - `artifact_id`
  - `content_type`
  - `size_bytes`
  - `sha256`
  - `url`

### Fetch (`get_artifact`)

Flow:

1. build store via `ArtifactStore.from_config(container.config)`
2. resolve `(path, content_type)` via `store.resolve_path(artifact_id)`
3. return `FileResponse(path, media_type=content_type)`

Error boundary:

- explicit `HTTPException` from store is preserved (for example invalid id / missing artifact)
- unexpected exceptions are logged and wrapped as:
  - `HTTPException(500, "Artifact lookup failed")`

## Test-Locked Invariants

`tests/backend/test_artifact_routes.py` locks:

- direct route-module handler behavior
- upload response includes stable metadata + canonical URL construction
- invalid artifact id returns `400`
- missing artifact returns `404`
- unexpected resolve errors are wrapped to sanitized `500` lookup failure
- size limit enforcement returns `413`

`tests/backend/test_app_assembly.py` locks endpoint registration for both upload and fetch paths.

## Drift Hotspots

1. Reintroducing `artifacts/__init__.py` recreates a second import surface for route internals.
2. Moving URL construction away from `request.base_url` can desynchronize frontend artifact URL assumptions.
3. Returning raw exception details from fetch path can leak storage internals over HTTP.
4. Registering routes from non-canonical symbols can bypass package ownership assumptions.

## Related Pages

- [Backend API Docs Hub](README.md)
- [HTTP and WebSocket Endpoint Reference](http_and_ws_endpoint_reference.md)
- [API and Transport](api_and_transport.md)
- [Artifact HTTP Route Error Mapping and URL Construction Reference](../services/artifacts/artifact_http_route_error_mapping_and_url_construction_reference.md)
