---
summary: "Frontend Electron-main docs sub-hub for process orchestration, overlay windows, IPC handlers, and runtime path resolution."
read_when:
  - When changing Electron main-process behavior, ipc handlers, or runtime endpoint/path resolution.
  - When debugging overlay-window lifecycle and packaged local-runtime startup behavior.
title: "Frontend Main Docs Hub"
---

# Frontend Main Docs Hub

## Deep Pages

- [Electron Main and IPC](electron_main_and_ipc.md)
- [Main Process Change Workflow](main_process_change_workflow.md)
- [Main Overlay Focus Docs Hub](overlays/README.md)
- [Window and Overlay Lifecycle](window_and_overlay_lifecycle.md)
- [Main Window Runtime Factory and Overlay Bootstrap Reference](main_window_runtime_factory_and_overlay_bootstrap_reference.md)
- [Main Window Icon and Overlay Runtime Reference](main_window_icon_and_overlay_runtime_reference.md)
- [Main Process Lifecycle, Overlay IPC, and Window Visibility Runtime Reference](main_process_lifecycle_overlay_ipc_and_window_visibility_runtime_reference.md)
- [Display-Affinity Monitor Selection and Screenshot Bounds Reference](display_affinity_runtime_monitor_selection_and_screenshot_bounds_reference.md)
- [Display Query Handler Display Inventory Payload Contract Reference](display_query_handler_display_inventory_payload_contract_reference.md)
- [Runtime Paths and Endpoints](runtime_paths_and_endpoints.md)
- [Query Send and Stream Relay Change Workflow](query_send_and_stream_relay_change_workflow.md)
- [Query Payload and Relay Reference](query_payload_and_relay_reference.md)
- [WebSocket Handshake and Settings Sync Reference](websocket_handshake_and_settings_sync_reference.md)
- [Wakeword Bridge Runtime Helper Reference](wakeword_bridge_runtime_helper_reference.md)
- [Global Stop Shortcut Runtime Reference](global_stop_shortcut_runtime_reference.md)
- [IPC Helper Module Split and Runtime Boundary Reference](ipc_helper_module_split_and_runtime_boundary_reference.md)
- [IPC Event Replay and Transcript Session Sync Reference](ipc_event_replay_and_transcript_session_sync_reference.md)
- [IPC Query Runtime and Transcript Sync Helper Reference](ipc_query_runtime_and_transcript_sync_helper_reference.md)
- [Memory IPC and RPC Mapping Reference](../contracts/memory_ipc_and_rpc_mapping_reference.md)
- [Main Local-Runtime Docs Hub](local_backend/README.md)
- [Local-Runtime Process Lifecycle Change Workflow](local_backend/process_lifecycle_change_workflow.md)
- [Main Testing Docs Hub](testing/README.md)
- [Main Testing Data-Seed Docs Hub](testing/data_seed/README.md)
- [Local Runtime JSON-RPC Change Workflow](../sidecar/local_backend_jsonrpc_change_workflow.md)
- [Local Runtime Bridge Overview and Window Guard Index](local_runtime_bridge_handler_and_window_guard_reference.md)
- [Local-Runtime Process Lifecycle, Readiness, and Request-Correlation Reference](local_backend/process_lifecycle_readiness_and_request_correlation_reference.md)
- [Local-Runtime RPC Handler Registry and Payload-Mapper Reference](local_backend/rpc_handler_registry_and_payload_mapper_reference.md)
- [Overlay Query-Capture Blur and Settle Reference](overlays/external_focus_snapshot_restore_and_query_capture_reference.md)
- [Linux Screenshot Window Visibility Reference](overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)
- [Mock Memory Seed Script and NPM Entrypoints Reference](testing/data_seed/mock_memory_seed_script_and_npm_entrypoints_reference.md)
- [Permission Manifest, Probe, and IPC Request Contract Reference](permission_manifest_probe_and_request_ipc_reference.md)

## Code Scope

- `frontend/src/main/*.cjs`
- `frontend/src/main/agent/*.cjs`
- `frontend/src/main/ipc/*.cjs`
- `frontend/src/main/shortcuts/agent_stop_shortcut_runtime.cjs`
- `frontend/src/main/surfaces/*.cjs`
- `frontend/src/shared/permissions/permission_manifest.json`
- `frontend/src/main/python/dev_seed_mock_memory.py`
- `frontend/src/preload.js`

## Evidence Notes

- Main-process changes need proof at the IPC, SDK runtime, or native
  BrowserWindow boundary that owns the behavior.
- Avoid treating renderer logs as sufficient evidence for main-owned window,
  permission, local-runtime lifecycle, or IPC routing behavior.
