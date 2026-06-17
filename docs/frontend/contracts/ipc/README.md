---
summary: "Frontend contracts IPC docs sub-hub for preload allowlist parity, typed channel constants, and main-process handler ownership."
read_when:
  - When adding/removing IPC channel names in preload, renderer constants, or main handlers.
  - When debugging invoke/send/on channel drift, permission onboarding channel wiring, or local-runtime command mismatches.
title: "Frontend Contracts IPC Docs Hub"
---

# Frontend Contracts IPC Docs Hub

## Deep Pages

- [IPC Change Workflow](../../ipc_change_workflow.md)
- [Preload Allowlist and Channel-Constant Parity Reference](preload_allowlist_and_channel_constant_parity_reference.md)
- [Main-Process IPC Handler Ownership and RPC Mapper Reference](main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)
- [IPC Bridge Docs Hub](bridge/README.md)
- [Renderer IPC Bridge Runtime Validation and Window IPC Guard Reference](bridge/renderer_ipc_bridge_runtime_validation_and_window_ipc_guard_reference.md)

## Start Here By Task

| Task | Start doc |
| --- | --- |
| Add, rename, remove, or repurpose an Electron IPC channel | [IPC Change Workflow](../../ipc_change_workflow.md) |
| Debug invalid invoke/send/on drift | [Preload Allowlist and Channel-Constant Parity Reference](preload_allowlist_and_channel_constant_parity_reference.md) |
| Find the main-process owner for a channel | [Main-Process IPC Handler Ownership and RPC Mapper Reference](main_process_ipc_handler_ownership_and_rpc_mapper_reference.md) |
| Debug renderer-side validation or missing `window.ipc` | [IPC Bridge Docs Hub](bridge/README.md) |

## Code Scope

- `frontend/src/shared/ipcChannels.json`
- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc/ipc_renderer_windows.cjs`
- `frontend/src/main/ipc/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/index.cjs`
- `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`
- `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_visibility_runtime.cjs`
- `frontend/src/main/app/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/permissions/permission_service.cjs`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`
