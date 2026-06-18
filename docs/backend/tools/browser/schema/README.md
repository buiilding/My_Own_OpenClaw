---
summary: "Backend browser schema docs sub-hub for unified BrowserControlArgs design and backend-to-local-runtime schema parity boundaries."
read_when:
  - When changing backend browser schema literals/fields or splitting/merging browser schema models.
  - When debugging backend-accepted browser payloads that local-runtime browser adapters later reject.
title: "Backend Browser Schema Docs Hub"
---

# Backend Browser Schema Docs Hub

## Deep Pages

- [Browser Control Unified Schema Reference](browser_control_unified_schema_reference.md)
- [Backend-Local Runtime Browser Schema Parity and Validation Boundary Reference](backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)

## Related Pages

- [Backend Browser Tools Docs Hub](../README.md)
- [Browser Remote Schema Surface Reference](../browser_remote_schema_surface_reference.md)
- [Local Runtime Sidecar Browser Docs Hub](../../../../frontend/sidecar/browser/README.md)

## Code Scope

- `backend/src/tools/browser/shared_contract_loader.py`
- `backend/src/tools/remote_tools/browser.py`
- `tests/backend/test_browser_remote_tool.py`
- `tests/backend/test_browser_shared_contract_loader.py`
