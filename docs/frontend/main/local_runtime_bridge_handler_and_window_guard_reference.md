---
summary: "Electron main local-runtime bridge overview covering startup/handler boundaries, with links to focused lifecycle, scoped handler, and screenshot visibility ownership references."
read_when:
  - When changing `frontend/src/main/sidecar/local_runtime*.cjs` and deciding where local-runtime bridge documentation belongs.
  - When tracing local-runtime issues across process lifecycle, scoped host handler, and screenshot visibility ownership boundaries.
  - When resolving removed `local_runtime_bridge.getSystemState` export references.
title: "Local Runtime Bridge Overview and Window Guard Index"
---

# Local Runtime Bridge Overview and Window Guard Index

## Scope

This page is the entrypoint for Electron-main local-runtime bridge behavior.
Detailed implementation docs still live under the historical `local_backend/`
subfolder because that subfolder describes the local-runtime Python executor and
JSON-RPC protocol domain. The Electron main host adapter modules now use
local-runtime names.

## Local-Runtime Docs (Detailed)

- [Frontend Main Local-Runtime Docs Hub](local_backend/README.md)
- [Local-Runtime Process Lifecycle, Readiness, and Request-Correlation Reference](local_backend/process_lifecycle_readiness_and_request_correlation_reference.md)
- [Local-Runtime RPC Handler Registry Reference](local_backend/rpc_handler_registry_and_payload_mapper_reference.md)
- [Screenshot Display-Bounds Fallback and Attachment Materialization Reference](local_backend/screenshot_display_bounds_fallback_and_attachment_materialization_reference.md)
- [Display-Affinity Monitor Selection and Screenshot Bounds Reference](display_affinity_runtime_monitor_selection_and_screenshot_bounds_reference.md)
- [Local-Runtime Windows Docs Hub](local_backend/windows/README.md)
- [Window Resolver Shapes and Screenshot Task Routing Reference](local_backend/windows/window_resolver_shapes_and_linux_screenshot_hide_restore_orchestration_reference.md)

## Window Guard Docs (Detailed)

- [Main Overlay Focus Docs Hub](overlays/README.md)
- [Linux Screenshot Window Visibility Reference](overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)
- [Overlay Query-Capture Blur and Settle Reference](overlays/external_focus_snapshot_restore_and_query_capture_reference.md)

## Bridge Boundary (Condensed)

Bridge responsibilities in `frontend/src/main/sidecar/local_runtime_bridge.cjs`:

1. assemble desktop launch options and resolve the SDK local runtime provider
2. publish renderer-visible readiness through `local-runtime-status`
3. route scoped host IPC channels through the SDK local runtime when Electron authority is required
4. normalize error payloads for host-channel callers
5. route screenshot tool calls through host-owned display bounds and artifact materialization; Linux hide/show ownership lives in SDK/main surface prep and renderer attachment capture orchestration

## Removed System-State Direct Export

`local_runtime_bridge.cjs` no longer exports `getSystemState(fields)`.
System-state access is the `get-system-state` IPC handler registered by
`initializeLocalRuntimeBridge(...)`; the old `initializeLocalRuntimeBridge(...)`
export has been removed. The focused behavior reference is
[System-State Collection and Removed getSystemState Bridge Export Reference](../sidecar/system_state/system_state_collection_and_platform_adapter_reference.md).

## Canonical Modules

- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/sidecar/local_runtime_window_visibility.cjs`
- `frontend/src/main/sidecar/local_runtime_tool_args.cjs`
- `frontend/src/main/sidecar/local_runtime_utils.cjs`
- `frontend/src/main/app/runtime_paths.cjs`
- `frontend/src/main/app/backend_endpoints.cjs`

## Related Contracts

- [Main-Process IPC Handler Ownership and RPC Mapper Reference](../contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)
- [Memory IPC and RPC Mapping Reference](../contracts/memory_ipc_and_rpc_mapping_reference.md)

## Legacy Note

Earlier revisions kept most local-runtime detail in this single page. The content is now split into the historical `main/local_backend/` folder so each behavior domain has a stable, focused deep reference.
