---
summary: "Frontend preload docs sub-hub for Electron contextBridge API exposure, channel allowlist enforcement, and renderer typed IPC bridge alignment."
read_when:
  - When changing `frontend/src/preload.js` or renderer IPC bridge/channel constants.
  - When debugging channel allowlist mismatches between preload, renderer constants, and main-process handlers.
title: "Frontend Preload Docs Hub"
---

# Frontend Preload Docs Hub

## Deep Pages

- [IPC Change Workflow](../ipc_change_workflow.md)
- [Preload Channel Allowlist and Renderer Bridge Reference](preload_channel_allowlist_and_renderer_bridge_reference.md)
- [Preload Allowlist and Channel-Constant Parity Reference](../contracts/ipc/preload_allowlist_and_channel_constant_parity_reference.md)

## Change Routing

| Task | Owner path |
| --- | --- |
| Add or remove a channel exposed through preload | Start with [IPC Change Workflow](../ipc_change_workflow.md), then update `frontend/src/shared/ipcChannels.json` and preload parity tests. |
| Debug `Invalid invoke channel` or silent listener/send no-op behavior | Read [Preload Allowlist and Channel-Constant Parity Reference](../contracts/ipc/preload_allowlist_and_channel_constant_parity_reference.md). |
| Change the renderer wrapper behavior | Read [Preload Channel Allowlist and Renderer Bridge Reference](preload_channel_allowlist_and_renderer_bridge_reference.md) and `frontend/src/renderer/infrastructure/ipc/bridge.ts`. |

## Code Scope

- `frontend/src/shared/ipcChannels.json`
- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/main/ipc.cjs`
- `tests/frontend/IpcBridge.test.ts`
- `tests/frontend/IpcBridgeValidation.test.ts`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/IpcMainBridge.query.test.cjs`
