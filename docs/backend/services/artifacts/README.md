---
summary: "Backend artifact service docs sub-hub for upload stream-write limits, artifact-id/path validation, base64 retrieval limits, and HTTP route error mapping."
read_when:
  - When changing `backend/src/services/artifacts/store.py` upload/lookup behavior or ID/content-type policy.
  - When changing `backend/src/api/routes/artifacts.py` response schema, URL construction, or error mapping.
title: "Backend Artifact Service Docs Hub"
---

# Backend Artifact Service Docs Hub

## Deep Pages

- [Artifact Store Upload Streaming, ID Validation, and Base64 Lookup Contract Reference](artifact_store_upload_streaming_id_validation_and_base64_lookup_contract_reference.md)
- [Artifact HTTP Route Error Mapping and URL Construction Reference](artifact_http_route_error_mapping_and_url_construction_reference.md)

## Related Pages

- [Backend Services Docs Hub](../README.md)
- [Artifact, Screenshot, and System-State Flow Reference](../artifact_screenshot_and_system_state_flow_reference.md)
- [HTTP and WebSocket Endpoint Reference](../../api/http_and_ws_endpoint_reference.md)

## Code Scope

- `backend/src/services/artifacts/store.py`
- `backend/src/services/artifacts/__init__.py`
- `backend/src/api/routes/artifacts.py`
- `tests/backend/test_artifacts_store.py`
- `tests/backend/test_artifact_routes.py`
