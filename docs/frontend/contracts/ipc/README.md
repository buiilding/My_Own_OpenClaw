---
summary: "Frontend contracts IPC docs sub-hub for preload allowlist parity, typed channel constants, and main-process handler/RPC mapper ownership."
read_when:
  - When adding/removing IPC channel names in preload, renderer constants, or main handlers.
  - When debugging invoke/send/on channel drift, permission onboarding channel wiring, or local-backend RPC mapping mismatches.
title: "Frontend Contracts IPC Docs Hub"
---

# Frontend Contracts IPC Docs Hub

## Deep Pages

- [Preload Allowlist and Channel-Constant Parity Reference](preload_allowlist_and_channel_constant_parity_reference.md)
- [Main-Process IPC Handler Ownership and RPC Mapper Reference](main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)
- [IPC Bridge Docs Hub](bridge/README.md)
- [Renderer IPC Bridge Runtime Validation and Window IPC Guard Reference](bridge/renderer_ipc_bridge_runtime_validation_and_window_ipc_guard_reference.md)

## Code Scope

- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc/ipc_renderer_windows.cjs`
- `frontend/src/main/ipc/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/index.cjs`
- `frontend/src/main/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/window_controls_ipc_runtime.cjs`
- `frontend/src/main/permission_ipc_runtime.cjs`
- `frontend/src/main/window_visibility_runtime.cjs`
- `frontend/src/main/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/permission_service.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/main/wakeword_bridge_runtime.cjs`
