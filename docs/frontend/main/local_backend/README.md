---
summary: "Frontend Electron-main local-runtime docs sub-hub for SDK local-runtime host/status context, readiness, request correlation timeouts, and scoped JSON-RPC handler contracts."
read_when:
  - When changing `frontend/src/main/sidecar/local_runtime*.cjs` request routing, readiness probes, or scoped host IPC handler registration.
  - When debugging pending-request timeouts, stale readiness callbacks, or SDK local-runtime payload drift.
title: "Frontend Main Local-Runtime Docs Hub"
---

# Frontend Main Local-Runtime Docs Hub

## Deep Pages

- [Local Runtime Process Lifecycle Change Workflow](process_lifecycle_change_workflow.md)
- [Local-Runtime Process Lifecycle, Readiness, and Request-Correlation Reference](process_lifecycle_readiness_and_request_correlation_reference.md)
- [Local-Runtime RPC Handler Registry and Payload-Mapper Reference](rpc_handler_registry_and_payload_mapper_reference.md)
- [Screenshot Display-Bounds Fallback and Attachment Materialization Reference](screenshot_display_bounds_fallback_and_attachment_materialization_reference.md)
- [Local-Runtime Windows Docs Hub](windows/README.md)
- [Window Resolver Shapes and Screenshot Task Routing Reference](windows/window_resolver_shapes_and_linux_screenshot_hide_restore_orchestration_reference.md)

## Start Here By Task

| Task | Start doc |
| --- | --- |
| Change local-runtime daemon startup, readiness, shutdown, status, request timeout, stdout/stderr, or packaged launch behavior | [Local-Runtime Process Lifecycle Change Workflow](process_lifecycle_change_workflow.md) |
| Add or change a Python JSON-RPC method or SDK local-runtime caller | [Local Runtime JSON-RPC Change Workflow](../../sidecar/local_backend_jsonrpc_change_workflow.md) |
| Debug local-runtime lifecycle races or pending request correlation | [Local-Runtime Process Lifecycle, Readiness, and Request-Correlation Reference](process_lifecycle_readiness_and_request_correlation_reference.md) |
| Debug scoped host payload keys or Python JSON-RPC method names | [Local-Runtime RPC Handler Registry Reference](rpc_handler_registry_and_payload_mapper_reference.md) |

## Related Pages

- [Local Runtime Bridge Handler and Window Guard Reference](../local_runtime_bridge_handler_and_window_guard_reference.md)
- [Display-Affinity Monitor Selection and Screenshot Bounds Reference](../display_affinity_runtime_monitor_selection_and_screenshot_bounds_reference.md)
- [Main Overlay Focus Docs Hub](../overlays/README.md)
- [Linux Screenshot Window Visibility Reference](../overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)

## Code Scope

- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/sidecar/local_runtime_display_bounds.cjs`
- `frontend/src/main/sidecar/local_runtime_screenshot_attachment.cjs`
- `frontend/src/main/sidecar/local_runtime_tool_args.cjs`
- `frontend/src/main/sidecar/local_runtime_window_visibility.cjs`
- `frontend/src/main/sidecar/local_runtime_utils.cjs`
- `frontend/src/main/app/runtime_paths.cjs`
- `frontend/src/main/app/backend_endpoints.cjs`
- `tests/frontend/LocalRuntimeBridge.lifecycle.test.cjs`
- `tests/frontend/LocalRuntimeBridge.rpc.test.cjs`
- `tests/frontend/LocalRuntimeDisplayBounds.test.cjs`
- `tests/frontend/LocalRuntimeToolArgs.test.cjs`
