---
summary: "Backend browser-tools docs sub-hub for remote browser stub behavior and the shared strict browser schema surface."
read_when:
  - When changing backend browser tool argument schemas or remote browser stub payload behavior.
  - When debugging browser action schema acceptance drift between backend validation and sidecar runtime enforcement.
title: "Backend Browser Tools Docs Hub"
---

# Backend Browser Tools Docs Hub

## Deep Pages

- [Browser Remote Schema Surface Reference](browser_remote_schema_surface_reference.md)
- [Browser Schema Docs Hub](schema/README.md)
- [Browser Control Unified Schema Reference](schema/browser_control_unified_schema_reference.md)
- [Backend-Local Runtime Browser Schema Parity and Validation Boundary Reference](schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)

## Related Pages

- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](../registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)
- [Local-Runtime Browser Docs Hub](../../../frontend/sidecar/browser/README.md)

## Code Scope

- `backend/src/tools/browser/shared_contract_loader.py`
- `backend/src/tools/remote_tools/browser.py`
- `tests/backend/test_browser_remote_tool.py`
- `tests/backend/test_browser_shared_contract_loader.py`
