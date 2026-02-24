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
- [Context Label Overlay and Active-Window Runtime Reference](context_label_overlay_and_active_window_runtime_reference.md)
- [Runtime Paths and Endpoints](runtime_paths_and_endpoints.md)
- [Query Payload and Relay Reference](query_payload_and_relay_reference.md)
- [WebSocket Handshake and Settings Sync Reference](websocket_handshake_and_settings_sync_reference.md)
- [Main Local-Backend Docs Hub](local_backend/README.md)
- [Local Backend Bridge Overview and Window Guard Index](local_backend_bridge_handler_and_window_guard_reference.md)
- [Local-Backend Process Lifecycle, Readiness, and Request-Correlation Reference](local_backend/process_lifecycle_readiness_and_request_correlation_reference.md)
- [Local-Backend RPC Handler Registry and Payload-Mapper Reference](local_backend/rpc_handler_registry_and_payload_mapper_reference.md)
- [External Focus Snapshot, Restore, and Query-Capture Reference](overlays/external_focus_snapshot_restore_and_query_capture_reference.md)
- [Linux Screenshot Window Hide and Restore Guard Reference](overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)

## Code Scope

- `frontend/src/main/*.cjs`
- `frontend/src/preload.js`
