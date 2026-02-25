---
summary: "Deep reference for ArtifactStore upload/read contracts: content-type normalization, chunked writes with max-byte enforcement, safe-id lookup, partial-file cleanup, and base64 retrieval guards."
read_when:
  - When changing `ArtifactStore.save_upload`, `resolve_path`, or `load_base64`.
  - When debugging upload failures, unsupported media types, invalid artifact IDs, or partial-file cleanup behavior.
title: "Artifact Store Upload Streaming, ID Validation, and Base64 Lookup Contract Reference"
---

# Artifact Store Upload Streaming, ID Validation, and Base64 Lookup Contract Reference

## Canonical Modules

- `backend/src/services/artifacts/store.py`
- `backend/src/services/artifacts/__init__.py`
- `tests/backend/test_artifacts_store.py`

## Core Data and Allowlist Surface

ID format:

- artifact ID must match `^[a-zA-Z0-9_-]+\\.(png|jpg|jpeg)$`
- invalid IDs return HTTP 400 from `resolve_path`

Content-type to extension mapping:

- `image/png` -> `png`
- `image/jpeg` -> `jpg`
- `image/jpg` -> `jpg`

Normalized resolved response type mapping:

- `png` -> `image/png`
- `jpg|jpeg` -> `image/jpeg`

Upload chunk size:

- `_UPLOAD_CHUNK_SIZE_BYTES = 1 MiB`

## Upload Write Path Contract

`save_upload(upload)` sequence:

1. normalize content type (`split(";")`, trim, lowercase)
2. reject missing type (400) or unsupported type (415)
3. generate `<uuid4().hex>.<ext>` artifact id
4. stream write to disk in 1 MiB chunks
5. track byte count and SHA256
6. enforce `max_bytes` during stream; overflow raises 413

Error behavior:

- expected HTTP errors propagate after partial-file cleanup
- unexpected stream/write errors become HTTP 500 `"Artifact upload failed"` after cleanup

Return payload (`ArtifactMeta`):

- `artifact_id`
- `content_type`
- `size_bytes`
- `sha256`
- `path`

## Path Resolution and Read Contract

`resolve_path(artifact_id)`:

- validates ID pattern before touching filesystem
- resolves under configured base directory
- missing files return 404
- returns `(path, content_type)` for route-layer response

`load_base64(artifact_id)`:

- reuses `resolve_path`
- re-checks stored file size against `max_bytes`
- reads bytes and returns UTF-8 base64 string
- oversized reads return 413

## Cleanup Contract

`_cleanup_partial_upload(path)`:

- deletes partially-written artifact if present
- called on both:
  - HTTPException during upload loop
  - generic exceptions during upload loop

No partial artifact should remain after failed upload.

## Test-Backed Matrix

`tests/backend/test_artifacts_store.py` covers:

- save + resolve happy path
- content-type normalization with parameters (`IMAGE/PNG; charset=binary`)
- `image/jpg` alias acceptance with normalized jpeg output type
- upload max-byte enforcement and empty directory after rejection
- missing/unsupported content-type rejection
- invalid ID (400) and missing file (404)
- `load_base64` success + size-limit 413
- partial-file cleanup when upload stream raises mid-write

## Drift Hotspots

1. Relaxing ID regex can reintroduce path traversal or unsafe filename lookup.
2. Removing size checks from either upload or read path can bypass artifact byte caps.
3. Skipping cleanup on unexpected write failures leaves orphan/partial files.
4. Changing extension/content-type maps without tests can break fetch media-type correctness.

## Related Pages

- [Backend Artifact Service Docs Hub](README.md)
- [Artifact HTTP Route Error Mapping and URL Construction Reference](artifact_http_route_error_mapping_and_url_construction_reference.md)
- [Artifact, Screenshot, and System-State Flow Reference](../artifact_screenshot_and_system_state_flow_reference.md)
