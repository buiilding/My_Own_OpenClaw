---
summary: "Frontend contracts IPC bridge docs sub-hub for renderer-side `IpcBridge` channel validation policy, `window.ipc` guard behavior, and typed wrapper guarantees."
read_when:
  - When changing `frontend/src/renderer/infrastructure/ipc/bridge.ts` or `channels.ts`.
  - When debugging invalid-channel errors in development or missing preload bridge availability in renderer tests/runtime.
title: "Frontend IPC Bridge Docs Hub"
---

# Frontend IPC Bridge Docs Hub

## Deep Pages

- [Renderer IPC Bridge Runtime Validation and Window IPC Guard Reference](renderer_ipc_bridge_runtime_validation_and_window_ipc_guard_reference.md)

## Related Pages

- [Frontend Contracts IPC Docs Hub](../README.md)
- [Preload Allowlist and Channel-Constant Parity Reference](../preload_allowlist_and_channel_constant_parity_reference.md)
- [IPC Channel and Handler Reference](../../ipc_channel_and_handler_reference.md)

## Code Scope

- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/preload.js`
- `tests/frontend/IpcBridge.test.ts`
- `tests/frontend/IpcBridgeValidation.test.ts`
