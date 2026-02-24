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
- [Window and Overlay Lifecycle](window_and_overlay_lifecycle.md)
- [Context Label Overlay and Active-Window Runtime Reference](context_label_overlay_and_active_window_runtime_reference.md)
- [Runtime Paths and Endpoints](runtime_paths_and_endpoints.md)
- [Query Payload and Relay Reference](query_payload_and_relay_reference.md)
- [WebSocket Handshake and Settings Sync Reference](websocket_handshake_and_settings_sync_reference.md)
- [Local Backend Bridge Handler and Window Guard Reference](local_backend_bridge_handler_and_window_guard_reference.md)

## Code Scope

- `frontend/src/main/*.cjs`
- `frontend/src/preload.js`
