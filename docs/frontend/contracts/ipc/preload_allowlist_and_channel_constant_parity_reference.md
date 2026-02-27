---
summary: "Deep reference for frontend IPC channel parity across preload allowlists, renderer typed constants, and runtime validation behavior."
read_when:
  - When changing `frontend/src/preload.js` or `frontend/src/renderer/infrastructure/ipc/channels.ts`.
  - When debugging `Invalid invoke channel` errors or silent send/on no-op behavior.
title: "Preload Allowlist and Channel-Constant Parity Reference"
---

# Preload Allowlist and Channel-Constant Parity Reference

## Canonical Modules

- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`

## Contract Layers

Channel validation has two layers:

1. preload allowlists (`preload.js`) are the hard boundary
2. renderer `IpcBridge` set checks are dev-only safety checks

In production, preload is authoritative because `IpcBridge` validation is gated by `NODE_ENV === "development"`.

## Channel Families

### `send` (`window.ipc.send`)

Shared names in preload + `SEND_CHANNELS`:

- `to-backend`
- `move-chatbox-to`
- `wakeword-audio-chunk`
- `wakeword-enable`
- `wakeword-disable`

Invalid behavior:

- preload ignores unknown send channels (no exception)

### `invoke` (`window.ipc.invoke`)

Shared names in preload + `INVOKE_CHANNELS`:

- `execute-tool`
- `upload-artifact`
- `get-system-state`
- `store-memory`
- `search-memory`
- `search-conversations`
- `list-conversations`
- `list-episodic-memories`
- `get-conversation`
- `list-semantic-memories`
- `delete-episodic-memory`
- `delete-conversation`
- `delete-semantic-memory`
- `store-transcript`
- `get-client-user-id`
- `set-overlay-ignore-mouse`
- `set-responsebox-size`
- `show-main-window` (optional payload `{ open?: 'chat' | 'memory' | 'models' | 'settings', maximize?: boolean }`)
- `show-chatbox`
- `hide-chatbox`
- `prepare-overlay-tool-focus`
- `get-displays`
- `load-frontend-config`
- `save-frontend-config`
- `set-agent-sudo-access`
- `list-permissions`
- `check-permissions`
- `check-permission`
- `run-permission-probe`
- `request-permission`
- `window-minimize`
- `window-toggle-maximize`
- `window-close`

Invalid behavior:

- preload rejects promise with `Error("Invalid invoke channel: <name>")`

### `on` / `once` listeners

Shared names in preload + `ON_CHANNELS`:

- `from-backend`
- `ipc-status`
- `log`
- `wakeword-detected`
- `wakeword-status`
- `wakeword-toggle`
- `wakeword-stt-trigger`
- `chatbox-focus`
- `main-window-open-target`
- `response-overlay-phase`
- `response-overlay-visibility`

Invalid behavior:

- preload does not register listener (no throw)

## Event-Sender Stripping Contract

`preload.js` deliberately strips Electron `event` object for `on`/`once` callbacks:

- exposed callback receives only payload args
- renderer cannot access `event.sender` or other privileged fields

This is part of the sandboxing boundary.

## Listener Cleanup Contract

`window.ipc.on(...)` in preload returns a cleanup function that removes the specific wrapped subscription.

`IpcBridge.on(...)` forwards this cleanup function directly.

If callers skip cleanup, listeners accumulate and duplicate event handling.

## Drift Hotspots

1. new channel added to `channels.ts` but not to preload allowlist
2. preload allowlist changed but `channels.ts` not updated
3. docs and constants updated but main `ipcMain` handler missing
4. relying on `IpcBridge` validation in production (it is not active there)

## Debug Checklist

If `IpcBridge.invoke(...)` throws `Invalid invoke channel`:

1. compare channel against preload invoke allowlist
2. compare channel against `INVOKE_CHANNELS`
3. verify typo/case/hyphen differences

If `send` appears ignored:

1. confirm channel is in preload send allowlist
2. confirm renderer call uses `SEND_CHANNELS` constant
3. verify main has matching `ipcMain.on` handler

## Related Pages

- [Frontend Contracts IPC Docs Hub](README.md)
- [Main-Process IPC Handler Ownership and RPC Mapper Reference](main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)
- [IPC Bridge Docs Hub](bridge/README.md)
- [Renderer IPC Bridge Runtime Validation and Window IPC Guard Reference](bridge/renderer_ipc_bridge_runtime_validation_and_window_ipc_guard_reference.md)
- [IPC Channel and Handler Reference](../ipc_channel_and_handler_reference.md)
