---
summary: "Deep reference for frontend IPC channel parity across preload allowlists, renderer typed constants, module-load registry validation behavior, and removed/private renderer IPC validator exports such as validateIpcHandlerRegistration and EXPECTED_SHARED_CHANNEL_REGISTRY."
read_when:
  - When changing `frontend/src/preload.js` or `frontend/src/renderer/infrastructure/ipc/channels.ts`.
  - When debugging `Invalid invoke channel` errors or silent send/on no-op behavior.
  - When stale code, tests, or docs mention exported renderer IPC validator helpers such as `validateIpcHandlerRegistration`, `validateSharedChannelRegistry`, or `EXPECTED_SHARED_CHANNEL_REGISTRY`.
title: "Preload Allowlist and Channel-Constant Parity Reference"
---

# Preload Allowlist and Channel-Constant Parity Reference

## Canonical Modules

- `frontend/src/shared/ipcChannels.json`
- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`

## Contract Layers

Channel validation has two runtime layers plus one shared source:

1. shared channel registry (`ipcChannels.json`) defines the names
2. preload allowlists (`preload.js`) are the hard boundary
3. renderer `channels.ts` validates the shared registry against the expected channel family keys before exporting constants
4. renderer `IpcBridge` set checks are dev-only safety checks

Electron main injects the serialized shared registry through `webPreferences.additionalArguments`, and preload parses it from `process.argv` because Electron's sandboxed preload runtime can fail both relative sibling-module resolution and Node builtin imports.

In production, preload is authoritative because `IpcBridge` validation is gated by `NODE_ENV === "development"`.
The renderer registry validation still runs at module load in every mode so a missing or renamed shared JSON entry fails before callers can observe `undefined` channel constants.

The registry key expectation and validation helpers in
`frontend/src/renderer/infrastructure/ipc/channels.ts` are private module-load
invariants. They are intentionally not renderer API exports:
`validateIpcHandlerRegistration`, `validateSharedChannelRegistry`,
`EXPECTED_IPC_HANDLER_REGISTRY`, and `EXPECTED_SHARED_CHANNEL_REGISTRY` should
route here as stale helper/export searches, while renderer callers should import
only `SEND_CHANNELS`, `INVOKE_CHANNELS`, `ON_CHANNELS`, and their channel-name
types.

The shared JSON registry is the only source for concrete IPC wire values,
including the legacy `windie:*` SDK channel strings. Renderer `channels.ts`
keeps required key lists and validates that each key resolves to a non-empty
string, but it does not duplicate product-prefixed wire values.

## Channel Families

### `send` (`window.ipc.send`)

Shared names from `ipcChannels.json`, consumed by preload + `SEND_CHANNELS`:

- `renderer-log`
- `live-surface-trace`
- `windie:pending-turn`
- `transcript-session-sync`
- `move-chatbox-to`
- `wakeword-audio-chunk`
- `wakeword-enable`
- `wakeword-disable`

Historical note: `to-backend` is not a current send channel. Renderer backend
commands use `window.agentSdk.invoke(...)`, which enters main through
`windie:invoke`.

Invalid behavior:

- preload ignores unknown send channels (no exception)

### `invoke` (`window.ipc.invoke`)

Shared names from `ipcChannels.json`, consumed by preload + `INVOKE_CHANNELS`:

- `capture-screenshot-attachment`
- `read-attachment-file`
- `run-browser-action`
- `windie:invoke` for SDK-shaped conversation, settings/model, memory, and
  local-runtime commands
- `upload-artifact`
- `fetch-artifact-image`
- `get-system-state`
- `get-client-user-id`
- `copy-image-to-clipboard`
- `show-image-context-menu`
- `set-chatbox-visual-anchor-height`
- `set-chatbox-hit-test-active`
- `set-responsebox-hit-test-active`
- `set-responsebox-size`
- `show-main-window` (optional payload `{ open?: 'chat' | 'memory' | 'models' | 'settings', maximize?: boolean }`)
- `get-main-window-visibility`
- `show-chatbox`
- `activate-chatbox-text-entry`
- `hide-chatbox`
- `handoff-surface-for-computer-use`
- `prepare-surface-for-screenshot`
- `restore-surface-after-screenshot`
- `get-displays`
- `load-frontend-config`
- `save-frontend-config`
- `list-agent-extensions`
- `list-mcp-servers`
- `set-mcp-server-enabled`
- `refresh-mcp-servers`
- `list-permissions`
- `check-permissions`
- `check-permission`
- `run-permission-probe`
- `request-permission`
- `set-active-workspace`
- `window-minimize`
- `window-toggle-maximize`
- `window-close`
- `get-local-runtime-status`

Memory list/delete/clear and chat clear are intentionally absent from direct
`window.ipc.invoke` preload channels. Renderer memory UI uses SDK-shaped
`window.agentSdk.invoke("memories.*", payload)` and
`window.agentSdk.invoke("conversations.clearAll", payload)` commands.

Invalid behavior:

- preload rejects promise with `Error("Invalid invoke channel: <name>")`

### `on` / `once` listeners

Shared names from `ipcChannels.json`, consumed by preload + `ON_CHANNELS`:

- `windie:rows`
- `windie:status`
- `windie:conversation-event`
- `windie:memory-store-changed`
- `windie:conversation-metadata-invalidated`
- `windie:current-turn`
- `windie:pending-turn`
- `transcript-session-sync`
- `ipc-status`
- `local-runtime-status`
- `log`
- `wakeword-detected`
- `wakeword-status`
- `wakeword-toggle`
- `wakeword-stt-trigger`
- `chatbox-focus`
- `workspace-access-updated`
- `main-window-open-target`
- `response-overlay-phase`
- `backend-settings-event`
- `agent-capability-event`
- `audio-chunk`
- `response-overlay-visibility`

Historical note: `from-backend` is not a current listener channel. Main routes
SDK conversation projections and typed backend events through the specific
channels above.

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

1. new channel added to `ipcChannels.json` without a matching main handler
2. docs drift from the shared registry after channel additions/removals
3. adding a required channel family key without updating the expected key lists in `channels.ts`
4. relying on `IpcBridge` validation in production (it is not active there)

## Debug Checklist

If `IpcBridge.invoke(...)` throws `Invalid invoke channel`:

1. compare channel against shared `INVOKE_CHANNELS` registry in `ipcChannels.json`
2. verify typo/case/hyphen differences
3. verify preload is loading the current shared registry

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
