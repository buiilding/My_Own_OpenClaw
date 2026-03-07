---
summary: "Frontend Electron-main local-backend docs sub-hub for sidecar process lifecycle, readiness retries, request correlation timeouts, and mapped JSON-RPC handler contracts."
read_when:
  - When changing `frontend/src/main/local_backend_bridge*.cjs` request routing, readiness probes, or sidecar IPC handler registration.
  - When debugging pending-request timeouts, stale readiness callbacks, or renderer invoke payload mapping drift.
title: "Frontend Main Local-Backend Docs Hub"
---

# Frontend Main Local-Backend Docs Hub

## Deep Pages

- [Local-Backend Process Lifecycle, Readiness, and Request-Correlation Reference](process_lifecycle_readiness_and_request_correlation_reference.md)
- [Local-Backend RPC Handler Registry and Payload-Mapper Reference](rpc_handler_registry_and_payload_mapper_reference.md)
- [Tool Arg Sudo-Auth Mode Resolution and Config-Guard Contract Reference](tool_arg_sudo_auth_mode_resolution_and_config_guard_contract_reference.md)
- [Screenshot Display-Bounds Fallback and Attachment Materialization Reference](screenshot_display_bounds_fallback_and_attachment_materialization_reference.md)
- [Local-Backend Windows Docs Hub](windows/README.md)
- [Window Resolver Shapes and Screenshot Visibility Runtime Dispatch Reference](windows/window_resolver_shapes_and_linux_screenshot_hide_restore_orchestration_reference.md)

## Related Pages

- [Local Backend Bridge Handler and Window Guard Reference](../local_backend_bridge_handler_and_window_guard_reference.md)
- [Display-Affinity Monitor Selection and Screenshot Bounds Reference](../display_affinity_runtime_monitor_selection_and_screenshot_bounds_reference.md)
- [Main Overlay Focus Docs Hub](../overlays/README.md)
- [Linux Screenshot Window Visibility Runtime Dispatch Reference](../overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)

## Code Scope

- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_display_bounds.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/local_backend_bridge_screenshot_attachment.cjs`
- `frontend/src/main/local_backend_bridge_tool_args.cjs`
- `frontend/src/main/local_backend_bridge_window_visibility.cjs`
- `frontend/src/main/local_backend_bridge_utils.cjs`
- `frontend/src/main/runtime_paths.cjs`
- `frontend/src/main/backend_endpoints.cjs`
- `tests/frontend/LocalBackendBridge.lifecycle.test.cjs`
- `tests/frontend/LocalBackendBridge.rpc.test.cjs`
- `tests/frontend/LocalBackendBridgeDisplayBounds.test.cjs`
- `tests/frontend/LocalBackendBridgeToolArgs.test.cjs`
