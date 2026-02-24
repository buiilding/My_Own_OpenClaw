---
summary: "Backend tools docs sub-hub for remote-tool registry/domain surfaces, policy/selection boundaries, security controls, and tool-result ingress orchestration."
read_when:
  - When changing backend remote-tool registration, schema declaration generation, or browser compatibility schema surface.
  - When changing interaction allowlist/dev tool-selection filtering or mouse coordinate-method policy behavior.
  - When changing core tool-security boundaries, dev tool selection policy, or sidecar compatibility rules.
  - When debugging tool-result ingress, future resolution, or bundle execution wait behavior.
title: "Backend Tools Docs Hub"
---

# Backend Tools Docs Hub

## Deep Pages

- [Frontend Tool Bridge and Policy](frontend_tool_bridge_and_policy.md)
- [Tools Registry Docs Hub](registry/README.md)
- [Browser Tools Docs Hub](browser/README.md)
- [Browser Schema Docs Hub](browser/schema/README.md)
- [Policy Docs Hub](policy/README.md)
- [Remote Tools Docs Hub](remote/README.md)
- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)
- [Browser Remote Schema Surface and Compatibility Contract Reference](browser/browser_remote_schema_surface_and_compatibility_contract_reference.md)
- [Browser Control Unified Schema and Compatibility Field Matrix Reference](browser/schema/browser_control_unified_schema_and_compatibility_field_matrix_reference.md)
- [Backend-Sidecar Browser Schema Parity and Validation Boundary Reference](browser/schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)
- [Tool Policy and Dev Tool Selection Runtime Reference](policy/tool_policy_and_dev_tool_selection_runtime_reference.md)
- [Remote Tool Domain Payload and Request-ID Semantics Reference](remote/remote_tool_domain_payload_and_request_id_semantics_reference.md)
- [Tools Security Docs Hub](security/README.md)
- [Tool Security Policy and Executor Reference](tool_security_policy_and_executor_reference.md)
- [Policy Permissions, Audit Sanitization, and Executor Registry Reference](security/policy_permissions_audit_and_executor_registry_reference.md)
- [Tool Result Ingress and Storage Reference](tool_result_ingress_and_storage_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](tool_preparation_and_coordinate_resolution_reference.md)

## Code Scope

- `backend/src/tools/*`
- `backend/src/tools/remote_tools/*`
- `backend/src/tools/browser/*`
- `backend/src/tools/tool_policy.py`
- `backend/src/tools/tool_selection.py`
- `backend/src/agent/tools/*`
- `backend/src/core/security/*`
- `backend/src/api/handlers/tool_result.py`
