---
summary: "Backend artifact/screenshot/system-state flow reference from HTTP artifact upload and query screenshot resolution through tool-result screenshot ingestion, OCR refresh, and runtime system-state updates."
read_when:
  - When changing screenshot handling across query payloads, tool results, and transcript rehydrate.
  - When debugging missing artifact loads, stale OCR data, or incorrect runtime system-state propagation.
title: "Artifact, Screenshot, and System-State Flow Reference"
---

# Artifact, Screenshot, and System-State Flow Reference

## Canonical Modules

- `backend/src/services/artifacts/store.py`
- `backend/src/api/routes/artifacts.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/agent/tools/waiting/router.py`
- `backend/src/agent/tools/preparation/screenshot/manager.py`
- `backend/src/agent/tools/preparation/screenshot/processor.py`
- `backend/src/api/services/rehydrate_execution.py`
- `backend/src/agent/session/session.py`

## Artifact Storage Layer (`ArtifactStore`)

Storage contract:

- artifact IDs are generated as `<uuid>.<ext>` with strict suffix allowlist (`png/jpg/jpeg`)
- ID validation regex blocks path traversal and arbitrary filenames
- content-type allowlist enforced on upload
- max size enforced during stream-write and read-back

Metadata returned on upload:

- `artifact_id`
- `content_type`
- `size_bytes`
- `sha256`
- URL via artifact route

## HTTP Artifact API

Routes:

- `POST /api/artifacts/`
- `GET /api/artifacts/{artifact_id}`

Upload path:

1. construct `ArtifactStore` from runtime config
2. stream multipart file to disk with size checks
3. return metadata + fetch URL

Fetch path:

1. validate artifact ID
2. resolve file path + media type
3. return `FileResponse`

## Query Screenshot Ingress

`QueryExecutionService._resolve_screenshot(...)` resolution precedence:

1. inline `payload.screenshot`
2. `payload.screenshot_ref` via artifact store base64 load
3. `None` when missing/unresolvable

On query execution, screenshot data is passed to `agent_instance.process_query(..., image_data=screenshot)`.

In `AgentExecutor.process_query(...)`:

- screenshot is added into history user message
- screenshot is processed by `ScreenshotManager.process_screenshot(...)`
- OCR may start asynchronously for coordinate resolution readiness

## Tool-Result Screenshot Ingress

Tool result routing (`ToolResultRouter.route_result`):

1. extract screenshot bytes from tool result payload
2. if only `screenshot_ref` present and artifact-like ID detected, load base64 from artifact store
3. inject resolved screenshot into tool artifacts map when loaded from ref
4. send screenshot to `ScreenshotProcessor.process_from_result(...)`

`ScreenshotProcessor` delegates to `ScreenshotManager.process_screenshot(...)`.

## Screenshot Manager and OCR Refresh Semantics

`ScreenshotManager.process_screenshot(...)` behavior:

- computes lightweight screenshot ID from content sample hash
- sets screenshot as current session screenshot (single-current model)
- triggers async OCR task if OCR service enabled
- cancels stale OCR task before scheduling new one

OCR race guard:

- OCR results applied only if screenshot ID still matches current screenshot
- outdated OCR results are ignored

## Runtime System-State Propagation

### Query path

`QueryExecutionService` seeds runtime state from `payload.system_state_internal`:

- merges with existing session runtime state
- currently tracks key fields including `screen_resolution`

### Tool-result path

`ToolResultRouter._set_current_system_state_if_available(...)` updates session runtime state from:

- `system_state_internal` (preferred)
- fallback `system_state`

Purpose:

- keep coordinate normalization and runtime context aligned with latest tool/UI state

## Rehydrate Screenshot Handling

`RehydrateExecutionService` supports transcript screenshot restoration:

- uses inline `screenshot` if present
- else resolves `screenshot_ref` via artifact store
- logs and continues without screenshot on ref resolution failure

This preserves rehydrate robustness even when artifact files are missing.

## Debug Checklist

If screenshot refs fail to resolve:

1. verify artifact ID format (`<id>.png|jpg|jpeg`)
2. verify file exists under configured artifact store path
3. verify artifact size does not exceed configured max bytes

If OCR appears stale after tool execution:

1. verify new screenshot was processed through `ScreenshotManager`
2. inspect OCR task cancellation/replacement logs
3. verify screenshot ID match check did not discard current OCR result

If runtime system-state looks outdated:

1. verify `system_state_internal` is included in query/tool-result payloads
2. inspect router/query service state merge path
3. confirm session `set_current_system_state(...)` accepted dict payload shape

## Related Pages

- [Backend Services Docs Hub](README.md)
- [Artifact Service Docs Hub](artifacts/README.md)
- [Artifact Store Upload Streaming, ID Validation, and Base64 Lookup Contract Reference](artifacts/artifact_store_upload_streaming_id_validation_and_base64_lookup_contract_reference.md)
- [Artifact HTTP Route Error Mapping and URL Construction Reference](artifacts/artifact_http_route_error_mapping_and_url_construction_reference.md)
