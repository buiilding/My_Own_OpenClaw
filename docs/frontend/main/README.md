---
summary: "Frontend Electron-main docs sub-hub for process orchestration, overlay windows, IPC handlers, and runtime path resolution."
read_when:
  - When changing Electron main-process behavior, ipc handlers, or runtime endpoint/path resolution.
  - When debugging overlay-window lifecycle and packaged sidecar launch behavior.
title: "Frontend Main Docs Hub"
---

# Frontend Main Docs Hub

## Deep Pages

- [Electron Main and IPC](electron_main_and_ipc.md)
- [Main Overlay Focus Docs Hub](overlays/README.md)
- [Window and Overlay Lifecycle](window_and_overlay_lifecycle.md)
- [Main Window Runtime Factory and Overlay Bootstrap Reference](main_window_runtime_factory_and_overlay_bootstrap_reference.md)
- [Main Window Icon and Overlay Runtime Reference](main_window_icon_and_overlay_runtime_reference.md)
- [Main Process Lifecycle, Overlay IPC, and Window Visibility Runtime Reference](main_process_lifecycle_overlay_ipc_and_window_visibility_runtime_reference.md)
- [Display-Affinity Monitor Selection and Screenshot Bounds Reference](display_affinity_runtime_monitor_selection_and_screenshot_bounds_reference.md)
- [Context Label Overlay and Active-Window Runtime Reference](context_label_overlay_and_active_window_runtime_reference.md)
- [Display Query Handler Display Inventory Payload Contract Reference](display_query_handler_display_inventory_payload_contract_reference.md)
- [Runtime Paths and Endpoints](runtime_paths_and_endpoints.md)
- [Query Payload and Relay Reference](query_payload_and_relay_reference.md)
- [WebSocket Handshake and Settings Sync Reference](websocket_handshake_and_settings_sync_reference.md)
- [Wakeword Bridge Runtime Helper Reference](wakeword_bridge_runtime_helper_reference.md)
- [VM Worker Runs Bridge and OpenAI Codex OAuth Runtime Reference](vm_worker_runs_bridge_and_openai_codex_oauth_runtime_reference.md)
- [IPC Helper Module Split and Runtime Boundary Reference](ipc_helper_module_split_and_runtime_boundary_reference.md)
- [IPC Event Replay and Transcript Session Sync Reference](ipc_event_replay_and_transcript_session_sync_reference.md)
- [IPC Query Runtime and Transcript Sync Helper Reference](ipc_query_runtime_and_transcript_sync_helper_reference.md)
- [IPC Memory-Store Event Persistence Payload Fallback and Fail-Open Logging Contract Reference](ipc_memory_store_event_persistence_payload_fallback_and_fail_open_logging_contract_reference.md)
- [Agent Sudo Access Handler PKExec and Non-Interactive Disable Contract Reference](agent_sudo_access_handler_pkexec_and_noninteractive_disable_contract_reference.md)
- [Main Local-Backend Docs Hub](local_backend/README.md)
- [Main Testing Docs Hub](testing/README.md)
- [Main Testing Data-Seed Docs Hub](testing/data_seed/README.md)
- [Local Backend Bridge Overview and Window Guard Index](local_backend_bridge_handler_and_window_guard_reference.md)
- [Local-Backend Process Lifecycle, Readiness, and Request-Correlation Reference](local_backend/process_lifecycle_readiness_and_request_correlation_reference.md)
- [Local-Backend RPC Handler Registry and Payload-Mapper Reference](local_backend/rpc_handler_registry_and_payload_mapper_reference.md)
- [Tool Arg Sudo-Auth Mode Resolution and Config-Guard Contract Reference](local_backend/tool_arg_sudo_auth_mode_resolution_and_config_guard_contract_reference.md)
- [Overlay Query-Capture Blur and Settle Reference](overlays/external_focus_snapshot_restore_and_query_capture_reference.md)
- [Linux Screenshot Window Visibility Runtime Dispatch Reference](overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)
- [Shell Tool Chrome Command Test Harness Runtime Reference](testing/shell_tool_chrome_command_test_harness_runtime_reference.md)
- [Mock Memory Seed Script and NPM Entrypoints Reference](testing/data_seed/mock_memory_seed_script_and_npm_entrypoints_reference.md)
- [Permission Manifest, Probe, and IPC Request Contract Reference](permission_manifest_probe_and_request_ipc_reference.md)

## Code Scope

- `frontend/src/main/*.cjs`
- `frontend/src/main/ipc/*.cjs`
- `frontend/src/shared/permissions/permission_manifest.json`
- `frontend/src/main/test_shell.cjs`
- `frontend/src/main/python/dev_seed_mock_memory.py`
- `frontend/src/preload.js`
