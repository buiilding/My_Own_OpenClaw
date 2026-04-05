summary: "Electron main local-backend bridge overview covering startup/handler boundaries, with links to focused lifecycle, RPC-mapper, and screenshot visibility runtime ownership references."
read_when:
  - When changing `frontend/src/main/local_backend_bridge*.cjs` and deciding where local-backend behavior documentation belongs.
  - When tracing local-backend issues across process lifecycle, payload mapping, and screenshot visibility ownership boundaries.
title: "Local Backend Bridge Overview and Window Guard Index"
---

# Local Backend Bridge Overview and Window Guard Index

## Scope

This page is the entrypoint for Electron-main local-backend bridge behavior. Detailed implementation docs now live under the dedicated local-backend subfolder.

## Local-Backend Docs (Detailed)

- [Frontend Main Local-Backend Docs Hub](local_backend/README.md)
- [Local-Backend Process Lifecycle, Readiness, and Request-Correlation Reference](local_backend/process_lifecycle_readiness_and_request_correlation_reference.md)
- [Local-Backend RPC Handler Registry and Payload-Mapper Reference](local_backend/rpc_handler_registry_and_payload_mapper_reference.md)
- [Tool Arg Sudo-Auth Mode Resolution and Config-Guard Contract Reference](local_backend/tool_arg_sudo_auth_mode_resolution_and_config_guard_contract_reference.md)
- [Screenshot Display-Bounds Fallback and Attachment Materialization Reference](local_backend/screenshot_display_bounds_fallback_and_attachment_materialization_reference.md)
- [Display-Affinity Monitor Selection and Screenshot Bounds Reference](display_affinity_runtime_monitor_selection_and_screenshot_bounds_reference.md)
- [Local-Backend Windows Docs Hub](local_backend/windows/README.md)
- [Window Resolver Shapes and Screenshot Visibility Runtime Dispatch Reference](local_backend/windows/window_resolver_shapes_and_linux_screenshot_hide_restore_orchestration_reference.md)

## Window Guard Docs (Detailed)

- [Main Overlay Focus Docs Hub](overlays/README.md)
- [Linux Screenshot Window Visibility Runtime Dispatch Reference](overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)
- [Overlay Query-Capture Blur and Settle Reference](overlays/external_focus_snapshot_restore_and_query_capture_reference.md)

## Bridge Boundary (Condensed)

Bridge responsibilities in `frontend/src/main/local_backend_bridge.cjs`:

1. spawn/monitor Python sidecar process
2. gate request sending on readiness (`isPythonReady`)
3. map renderer IPC channels to sidecar JSON-RPC methods
4. normalize error payloads for renderer callers
5. route screenshot tool calls through platform screenshot visibility runtime wrapper (current runtime behavior is pass-through; Linux hide/show ownership lives in renderer capture orchestration)

## Canonical Modules

- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_window_visibility.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/local_backend_bridge_tool_args.cjs`
- `frontend/src/main/local_backend_bridge_utils.cjs`
- `frontend/src/main/runtime_paths.cjs`
- `frontend/src/main/backend_endpoints.cjs`

## Related Contracts

- [Main-Process IPC Handler Ownership and RPC Mapper Reference](../contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)
- [Memory IPC and RPC Mapping Reference](../contracts/memory_ipc_and_rpc_mapping_reference.md)

## Legacy Note

Earlier revisions kept most local-backend detail in this single page. The content is now split into `main/local_backend/` so each behavior domain has a stable, focused deep reference.
