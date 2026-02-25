---
summary: "Frontend sidecar browser contracts docs sub-hub for action-schema registry, OpenClaw compatibility payload surface, and sidecar validation boundary semantics."
read_when:
  - When changing `tools/browser/schemas.py` or `openclaw_compat_schema.py` action/field definitions.
  - When debugging browser payloads that pass backend parsing but fail sidecar schema validation.
title: "Frontend Sidecar Browser Contracts Docs Hub"
---

# Frontend Sidecar Browser Contracts Docs Hub

## Deep Pages

- [Schema Registry and Action Validation Boundary Reference](schema_registry_and_action_validation_boundary_reference.md)
- [OpenClaw Compatibility Action and Field Surface Reference](openclaw_compat_action_and_field_surface_reference.md)
- [Browser Role-Snapshot Docs Hub](role_snapshot/README.md)
- [ARIA Snapshot Ref Generation and Compaction Contract Reference](role_snapshot/aria_snapshot_ref_generation_and_compaction_contract_reference.md)

## Related Pages

- [Frontend Sidecar Browser Docs Hub](../README.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](../browser_adapter_action_routing_and_compatibility_semantics_reference.md)
- [Backend Browser Schema Docs Hub](../../../../backend/tools/browser/schema/README.md)

## Code Scope

- `frontend/src/main/python/tools/browser/schemas.py`
- `frontend/src/main/python/tools/browser/openclaw_compat_schema.py`
- `frontend/src/main/python/tools/browser/role_snapshot.py`
- `frontend/src/main/python/tools/browser/browser_tool.py`
- `tests/sidecar/tools/test_browser_schemas.py`
- `tests/sidecar/tools/test_browser_use_tool_parity.py`
