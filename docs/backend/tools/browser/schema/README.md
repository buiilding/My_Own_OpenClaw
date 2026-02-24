---
summary: "Backend browser schema docs sub-hub for unified BrowserControlArgs design, shared compatibility-field mixins, and backend-to-sidecar schema parity boundaries."
read_when:
  - When changing backend browser schema literals/fields or splitting/merging browser schema models.
  - When debugging backend-accepted browser payloads that sidecar adapter/runtime later rejects.
title: "Backend Browser Schema Docs Hub"
---

# Backend Browser Schema Docs Hub

## Deep Pages

- [Browser Control Unified Schema and Compatibility Field Matrix Reference](browser_control_unified_schema_and_compatibility_field_matrix_reference.md)
- [Backend-Sidecar Browser Schema Parity and Validation Boundary Reference](backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)

## Related Pages

- [Backend Browser Tools Docs Hub](../README.md)
- [Browser Remote Schema Surface and Compatibility Contract Reference](../browser_remote_schema_surface_and_compatibility_contract_reference.md)
- [Frontend Sidecar Browser Docs Hub](../../../../frontend/sidecar/browser/README.md)

## Code Scope

- `backend/src/tools/browser/schema_types.py`
- `backend/src/tools/browser/snapshot_scope_fields.py`
- `backend/src/tools/browser/shared_compat_fields.py`
- `backend/src/tools/browser/browser_control_args_schema.py`
- `backend/src/tools/browser/openclaw_compat_schema.py`
- `backend/src/tools/browser/schemas.py`
- `tests/backend/test_browser_remote_tool.py`
- `tests/sidecar/tools/test_browser_use_tool_parity.py`
