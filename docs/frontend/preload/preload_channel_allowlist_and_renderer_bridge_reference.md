---
summary: "Frontend preload runtime reference for contextBridge `window.ipc` exposure, send/invoke/on/once allowlist semantics, renderer bridge validation, and main-process channel ownership alignment."
read_when:
  - When adding/removing IPC channels or changing renderer-main API exposure policy.
  - When debugging invalid-channel rejections, missing listener cleanup, or preload/bridge/main contract drift.
title: "Preload Channel Allowlist and Renderer Bridge Reference"
---

# Preload Channel Allowlist and Renderer Bridge Reference

## Canonical Modules

- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/main/ipc.cjs`

## Security Boundary

`preload.js` is the hard runtime boundary between sandboxed renderer and Electron privileged APIs.

`contextBridge.exposeInMainWorld('ipc', ...)` exposes only four methods:

- `send(channel, data)`
- `invoke(channel, data)`
- `on(channel, handler)`
- `once(channel, handler)`

All methods are channel-allowlisted in preload before hitting `ipcRenderer`.

## Channel Allowlist Semantics

### `send(...)` behavior

Allowed channels:

- `to-backend`
- `move-chatbox-to`
- `wakeword-audio-chunk`
- `wakeword-enable`
- `wakeword-disable`

For invalid channels:

- call is ignored (no throw, no reject)

### `invoke(...)` behavior

Allowed channels:

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
- `delete-conversation`
- `delete-semantic-memory`
- `store-transcript`
- `get-client-user-id`
- `set-overlay-ignore-mouse`
- `set-responsebox-size`
- `show-main-window`
- `show-chatbox`
- `hide-chatbox`
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

For invalid channels:

- returns `Promise.reject(new Error("Invalid invoke channel: ..."))`

### `on(...)` and `once(...)` behavior

Allowed channels:

- `from-backend`
- `ipc-status`
- `log`
- `wakeword-detected`
- `wakeword-status`
- `wakeword-toggle`
- `chatbox-focus`
- `main-window-open-target`
- `response-overlay-phase`
- `response-overlay-visibility`

`on(...)` semantics:

- strips Electron event object before calling renderer handler (`func(...args)`)
- returns cleanup callback that removes exact listener

`once(...)` semantics:

- single-shot wrapper with stripped event object
- no cleanup callback returned

Invalid `on/once` channel behavior:

- no subscription; function returns `undefined`

## Renderer Typed Bridge Alignment

`channels.ts` defines typed constants/types:

- `SEND_CHANNELS`
- `INVOKE_CHANNELS`
- `ON_CHANNELS`
- `SendChannel` / `InvokeChannel` / `OnChannel` unions

`IpcBridge` in `bridge.ts` adds:

- `window.ipc` presence guard via `getRawIpc()`
- development-only runtime channel validation with `Set` membership checks
- prod fast path (no validation) because preload already enforces allowlists

Dev-mode validation trigger:

- `process.env.NODE_ENV === 'development'`

Failure mode if preload not loaded:

- throws `window.ipc is not available. Make sure preload.js is loaded.`

## Main-Process Ownership Cross-Check

Allowlisted preload channels must have matching main-process ownership in `frontend/src/main/ipc.cjs`.

Current high-value mappings:

- `send('to-backend')` -> `ipcMain.on('to-backend', ...)`
- `invoke('load-frontend-config')` -> `ipcMain.handle('load-frontend-config', ...)`
- `invoke('save-frontend-config')` -> `ipcMain.handle('save-frontend-config', ...)`
- `invoke('get-client-user-id')` -> `ipcMain.handle('get-client-user-id', ...)`
- `invoke('upload-artifact')` -> `ipcMain.handle('upload-artifact', ...)`
- `invoke('list-permissions'|'check-permissions'|'run-permission-probe'|'request-permission')` -> `ipcMain.handle(...)` in `index.cjs` backed by `permission_service.cjs`
- `on('from-backend')` -> main bridge broadcasts backend events to renderer windows
- `on('ipc-status')` -> main bridge broadcasts connection-state payload

Contract drift usually appears when one layer is changed without the others.

## Test Coverage Signals

Primary coverage:

- `tests/frontend/IpcBridge.test.ts`
  - forwarding behavior (`send/invoke/on/once`)
  - missing `window.ipc` guard errors
- `tests/frontend/IpcBridgeValidation.test.ts`
  - dev-mode invalid channel rejection
  - production no-throw path with preload expected to enforce
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
  - websocket lifecycle + bridge initialization behavior
- `tests/frontend/IpcMainBridge.query.test.cjs`
  - query relay and backend message path behavior

## Update Checklist

When adding or renaming channels:

1. update preload allowlist arrays in `frontend/src/preload.js`
2. update typed constants in `frontend/src/renderer/infrastructure/ipc/channels.ts`
3. update/confirm `frontend/src/main/ipc.cjs` handler or broadcast owner
4. update related contract docs under `docs/frontend/contracts/*`
5. add/update tests for bridge validation and main handler behavior
