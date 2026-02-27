---
summary: "Frontend protocol lifecycle sub-hub for main-process websocket bridge state, query settings-gate sequencing, wakeword trigger flow, main-window target routing, and response-overlay phase/visibility transitions."
read_when:
  - When changing `ipc.cjs` connection/query flow state machines.
  - When debugging settings ACK gate timing, reconnect behavior, wakeword STT trigger behavior, or overlay phase drift.
title: "Frontend Protocol Lifecycle Hub"
---

# Frontend Protocol Lifecycle Hub

## Deep Pages

- [Frontend Main WS Bridge, Query Gate, and Overlay Phase Lifecycle Reference](frontend_main_ws_bridge_query_gate_and_overlay_phase_lifecycle_reference.md)

## Related Pages

- [Frontend Inventory Protocols Hub](../README.md)
- [Frontend IPC and Local-Backend Protocol Surface Matrix Reference](../frontend_ipc_and_local_backend_protocol_surface_matrix_reference.md)
- [Frontend Protocol State Hub](../state/README.md)
- [Frontend Protocol Errors Hub](../errors/README.md)
- [Frontend Protocol Validation Hub](../validation/README.md)
- [Frontend Protocol Testing Hub](../testing/README.md)
- [Frontend WebSocket Handshake and Settings Sync Reference](../../../main/websocket_handshake_and_settings_sync_reference.md)

## Code Scope

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc_query_events.cjs`
- `frontend/src/main/response_overlay_phase_handler.cjs`
- `frontend/src/main/overlay_ipc_runtime.cjs`
- `frontend/src/main/main_window_runtime.cjs`
- `frontend/src/main/index.cjs`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx`
- `tests/frontend/ChatGptDashboardShell.test.jsx`
