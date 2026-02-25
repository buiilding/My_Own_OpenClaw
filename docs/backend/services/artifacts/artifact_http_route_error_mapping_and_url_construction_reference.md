---
summary: "Deep reference for artifact HTTP routes: upload response envelope, base-url artifact URL synthesis, store delegation boundaries, and fetch route error mapping."
read_when:
  - When changing `/api/artifacts` route schemas or endpoint behavior in `backend/src/api/routes/artifacts.py`.
  - When debugging artifact upload URL mismatches or unexpected 500 responses during artifact fetch.
title: "Artifact HTTP Route Error Mapping and URL Construction Reference"
---

# Artifact HTTP Route Error Mapping and URL Construction Reference

## Canonical Modules

- `backend/src/api/routes/artifacts.py`
- `backend/src/services/artifacts/store.py`
- `tests/backend/test_artifact_routes.py`
- `tests/backend/test_artifacts_store.py`

## Route Surface

Router prefix and tags:

- prefix: `/api/artifacts`
- tags: `["artifacts"]`

Endpoints:

- `POST /api/artifacts/`
- `GET /api/artifacts/{artifact_id}`

## Upload Route Contract

`upload_artifact(request, container, file)`:

- builds store from config via `ArtifactStore.from_config(container.config)`
- delegates all validation/write/hash logic to `store.save_upload(file)`
- builds returned URL as:
  - `base_url = str(request.base_url).rstrip("/")`
  - `url = f"{base_url}/api/artifacts/{meta.artifact_id}"`

Response model (`ArtifactUploadResponse`):

- `artifact_id`
- `content_type`
- `size_bytes`
- `sha256`
- `url`

Error mapping:

- upload route intentionally relies on `ArtifactStore` HTTPException statuses (400/413/415/500)

## Fetch Route Contract

`get_artifact(artifact_id, container)`:

- constructs store from config
- resolves `(path, content_type)` through `store.resolve_path(artifact_id)`
- returns `FileResponse(path, media_type=content_type)`

Error mapping:

- if `resolve_path` raises `HTTPException`, route re-raises unchanged
- any other exception:
  - logs `Failed to resolve artifact` with traceback
  - returns HTTP 500 `"Artifact lookup failed"`

## Store-Route Boundary

Ownership split:

- route layer:
  - request/response schema and URL construction
  - unexpected error wrapping for fetch route
- store layer:
  - ID/content-type validation
  - filesystem read/write operations
  - max-byte enforcement

This keeps route behavior thin and testable while centralizing file safety policy in the store.

## Test-Backed Matrix

`tests/backend/test_artifact_routes.py` covers:

- GET success with expected file path and media type
- GET invalid ID -> 400
- GET missing file -> 404
- GET unexpected resolver exception -> 500 wrapper
- POST success returns metadata and stable URL prefix
- POST size-limit violations propagate 413

Additional URL behavior anchor:

- `tests/backend/test_artifacts_store.py::test_upload_artifact_builds_url`

## Drift Hotspots

1. Changing URL construction shape can break renderer/backend artifact-ref assumptions.
2. Catching and rewriting HTTPException in fetch route can hide exact validation/not-found semantics.
3. Moving validation from store to route can duplicate policy and diverge behavior across call sites.

## Related Pages

- [Backend Artifact Service Docs Hub](README.md)
- [Artifact Store Upload Streaming, ID Validation, and Base64 Lookup Contract Reference](artifact_store_upload_streaming_id_validation_and_base64_lookup_contract_reference.md)
- [Artifact, Screenshot, and System-State Flow Reference](../artifact_screenshot_and_system_state_flow_reference.md)
