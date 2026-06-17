summary: "Electron main local-runtime bridge overview covering startup/handler boundaries, with links to focused lifecycle, RPC-mapper, and screenshot visibility ownership references."
read_when:
  - When changing `frontend/src/main/sidecar/local_backend_bridge*.cjs` and deciding where local-backend behavior documentation belongs.
  - When tracing local-backend issues across process lifecycle, payload mapping, and screenshot visibility ownership boundaries.
  - When resolving removed `local_runtime_bridge.getSystemState` export references.
title: "Local Runtime Bridge Overview and Window Guard Index"
---

# Local Runtime Bridge Overview and Window Guard Index

## Scope

This page is the entrypoint for Electron-main local-runtime bridge behavior.
Detailed implementation docs now live under the dedicated local-backend
subfolder because the file names remain compatibility names.

## Local-Backend Docs (Detailed)

- [Frontend Main Local-Backend Docs Hub](local_backend/README.md)
- [Local-Backend Process Lifecycle, Readiness, and Request-Correlation Reference](local_backend/process_lifecycle_readiness_and_request_correlation_reference.md)
- [Local-Backend RPC Handler Registry and Payload-Mapper Reference](local_backend/rpc_handler_registry_and_payload_mapper_reference.md)
- [Screenshot Display-Bounds Fallback and Attachment Materialization Reference](local_backend/screenshot_display_bounds_fallback_and_attachment_materialization_reference.md)
- [Display-Affinity Monitor Selection and Screenshot Bounds Reference](display_affinity_runtime_monitor_selection_and_screenshot_bounds_reference.md)
- [Local-Backend Windows Docs Hub](local_backend/windows/README.md)
- [Window Resolver Shapes and Screenshot Task Routing Reference](local_backend/windows/window_resolver_shapes_and_linux_screenshot_hide_restore_orchestration_reference.md)

## Window Guard Docs (Detailed)

- [Main Overlay Focus Docs Hub](overlays/README.md)
- [Linux Screenshot Window Visibility Reference](overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)
- [Overlay Query-Capture Blur and Settle Reference](overlays/external_focus_snapshot_restore_and_query_capture_reference.md)

## Bridge Boundary (Condensed)

Bridge responsibilities in `frontend/src/main/sidecar/local_runtime_bridge.cjs`:

1. assemble desktop launch options and resolve the SDK local runtime provider
2. publish renderer-visible readiness through `local-runtime-status`
3. map renderer IPC channels to sidecar JSON-RPC methods through the SDK runtime
4. normalize error payloads for renderer callers
5. route screenshot tool calls through host-owned display bounds and artifact materialization; Linux hide/show ownership lives in SDK/main surface prep and renderer attachment capture orchestration

## Removed System-State Direct Export

`local_runtime_bridge.cjs` no longer exports `getSystemState(fields)`.
System-state access is the `get-system-state` IPC handler registered by
`initializeLocalRuntimeBridge(...)`; the old `initializeLocalBackendBridge(...)`
export has been removed. The focused behavior reference is
[System-State Collection and Removed getSystemState Bridge Export Reference](../sidecar/system_state/system_state_collection_and_platform_adapter_reference.md).

## Canonical Modules

- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/sidecar/local_runtime_window_visibility.cjs`
- `frontend/src/main/sidecar/local_runtime_rpc_mappers.cjs`
- `frontend/src/main/sidecar/local_runtime_tool_args.cjs`
- `frontend/src/main/sidecar/local_runtime_utils.cjs`
- `frontend/src/main/app/runtime_paths.cjs`
- `frontend/src/main/app/backend_endpoints.cjs`

## Related Contracts

- [Main-Process IPC Handler Ownership and RPC Mapper Reference](../contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)
- [Memory IPC and RPC Mapping Reference](../contracts/memory_ipc_and_rpc_mapping_reference.md)

## Legacy Note

Earlier revisions kept most local-backend detail in this single page. The content is now split into `main/local_backend/` so each behavior domain has a stable, focused deep reference.
