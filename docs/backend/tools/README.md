---
summary: "Backend tools docs sub-hub for remote-tool registry/schema surfaces, frontend-executed policy boundaries, security controls, and tool-result ingress orchestration."
read_when:
  - When changing backend remote-tool registration, schema declaration generation, or browser compatibility schema surface.
  - When changing core tool-security boundaries, dev tool selection policy, or sidecar compatibility rules.
  - When debugging tool-result ingress, future resolution, or bundle execution wait behavior.
title: "Backend Tools Docs Hub"
---

# Backend Tools Docs Hub

## Deep Pages

- [Frontend Tool Bridge and Policy](frontend_tool_bridge_and_policy.md)
- [Tools Registry Docs Hub](registry/README.md)
- [Browser Tools Docs Hub](browser/README.md)
- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)
- [Browser Remote Schema Surface and Compatibility Contract Reference](browser/browser_remote_schema_surface_and_compatibility_contract_reference.md)
- [Tools Security Docs Hub](security/README.md)
- [Tool Security Policy and Executor Reference](tool_security_policy_and_executor_reference.md)
- [Policy Permissions, Audit Sanitization, and Executor Registry Reference](security/policy_permissions_audit_and_executor_registry_reference.md)
- [Tool Result Ingress and Storage Reference](tool_result_ingress_and_storage_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](tool_preparation_and_coordinate_resolution_reference.md)

## Code Scope

- `backend/src/tools/*`
- `backend/src/tools/remote_tools/*`
- `backend/src/tools/browser/*`
- `backend/src/agent/tools/*`
- `backend/src/core/security/*`
- `backend/src/api/handlers/tool_result.py`
