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
- [Execution Docs Hub](execution/README.md)
- [Preparation Docs Hub](preparation/README.md)
- [Waiting Docs Hub](waiting/README.md)
- [Processing Docs Hub](processing/README.md)
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
- [Tool Sender Frontend Dispatch and Synthetic Error Result Reference](execution/tool_sender_frontend_dispatch_and_synthetic_error_result_reference.md)
- [Tool Result Orchestrator Bundle Detection and Wait Path Reference](execution/tool_result_orchestrator_bundle_detection_and_wait_path_reference.md)
- [Tool Result Receiver and Router Shared Route-Mode Reference](waiting/tool_result_receiver_and_router_shared_route_mode_reference.md)
- [Tool Result Storage Future Lifecycle and Cleanup Reference](waiting/tool_result_storage_future_lifecycle_and_cleanup_reference.md)
- [Tool Result Processor Bundle Formatting and Cleanup Reference](processing/tool_result_processor_bundle_formatting_and_cleanup_reference.md)
- [Result Transformer and Tool Result Formatting Contract Reference](processing/result_transformer_and_tool_result_formatting_contract_reference.md)
- [Synthetic Result Factory and Coordinate-Resolution Failure Tool-Output Reference](processing/synthetic_result_factory_and_coordinate_resolution_failure_tool_output_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](tool_preparation_and_coordinate_resolution_reference.md)
- [Screenshot Manager and OCR Task Lifecycle Reference](preparation/screenshot_manager_and_ocr_task_lifecycle_reference.md)
- [Resolved Tool-Call Storage and Session Access Contract Reference](preparation/resolved_tool_call_storage_and_session_access_contract_reference.md)

## Code Scope

- `backend/src/tools/*`
- `backend/src/tools/remote_tools/*`
- `backend/src/tools/browser/*`
- `backend/src/tools/tool_policy.py`
- `backend/src/tools/tool_selection.py`
- `backend/src/agent/tools/*`
- `backend/src/core/security/*`
- `backend/src/api/handlers/tool_result.py`
