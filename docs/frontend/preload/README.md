---
summary: "Frontend preload docs sub-hub for Electron contextBridge API exposure, channel allowlist enforcement, and renderer typed IPC bridge alignment."
read_when:
  - When changing `frontend/src/preload.js` or renderer IPC bridge/channel constants.
  - When debugging channel allowlist mismatches between preload, renderer constants, and main-process handlers.
title: "Frontend Preload Docs Hub"
---

# Frontend Preload Docs Hub

## Deep Pages

- [Preload Channel Allowlist and Renderer Bridge Reference](preload_channel_allowlist_and_renderer_bridge_reference.md)

## Code Scope

- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/main/ipc.cjs`
- `tests/frontend/IpcBridge.test.ts`
- `tests/frontend/IpcBridgeValidation.test.ts`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/IpcMainBridge.query.test.cjs`
