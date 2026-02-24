---
summary: "Backend browser-tools docs sub-hub for remote browser stub behavior, unified schema surface, and OpenClaw compatibility field modeling boundaries."
read_when:
  - When changing backend browser tool argument schemas or remote browser stub payload behavior.
  - When debugging browser action schema acceptance drift between backend validation and sidecar runtime enforcement.
title: "Backend Browser Tools Docs Hub"
---

# Backend Browser Tools Docs Hub

## Deep Pages

- [Browser Remote Schema Surface and Compatibility Contract Reference](browser_remote_schema_surface_and_compatibility_contract_reference.md)

## Related Pages

- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](../registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)
- [Frontend Sidecar Browser Docs Hub](../../../frontend/sidecar/browser/README.md)

## Code Scope

- `backend/src/tools/browser/__init__.py`
- `backend/src/tools/browser/schema_types.py`
- `backend/src/tools/browser/shared_compat_fields.py`
- `backend/src/tools/browser/snapshot_scope_fields.py`
- `backend/src/tools/browser/browser_control_args_schema.py`
- `backend/src/tools/browser/schemas.py`
- `backend/src/tools/browser/openclaw_compat_schema.py`
- `backend/src/tools/remote_tools/browser.py`
- `tests/backend/test_browser_remote_tool.py`
