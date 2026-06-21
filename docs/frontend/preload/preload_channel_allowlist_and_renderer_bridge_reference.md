---
summary: "Frontend preload runtime reference for contextBridge `window.ipc` exposure, send/invoke/on/once allowlist semantics, renderer bridge validation, and main-process channel ownership alignment."
read_when:
  - When adding/removing IPC channels or changing renderer-main API exposure policy.
  - When debugging invalid-channel rejections, missing listener cleanup, or preload/bridge/main contract drift.
title: "Preload Channel Allowlist and Renderer Bridge Reference"
---

# Preload Channel Allowlist and Renderer Bridge Reference

## Canonical Modules

- `frontend/src/shared/ipcChannels.json`
- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/main/ipc.cjs`

## Security Boundary

`preload.js` is the hard runtime boundary between sandboxed renderer and Electron privileged APIs.

Channel names are now sourced from `frontend/src/shared/ipcChannels.json`, which is consumed by both preload and renderer constants to prevent drift.

Electron main injects the serialized registry into each BrowserWindow via `webPreferences.additionalArguments`, and preload reads it from `process.argv` because the sandboxed preload bundle does not reliably support local sibling-module resolution or Node builtin imports.

`contextBridge.exposeInMainWorld('ipc', ...)` exposes only four methods:

- `send(channel, data)`
- `invoke(channel, data)`
- `on(channel, handler)`
- `once(channel, handler)`

All methods are channel-allowlisted in preload before hitting `ipcRenderer`.

## Channel Allowlist Semantics

### `send(...)` behavior

Allowed channels (from shared `SEND_CHANNELS` registry):

- `renderer-log`
- `live-surface-trace`
- `transcript-session-sync`
- `move-chatbox-to`
- `wakeword-audio-chunk`
- `wakeword-enable`
- `wakeword-disable`

Historical note: `to-backend` is not a current preload send channel. Renderer
backend commands enter Electron main through `window.agentSdk.invoke(...)`, which
uses the `windie:invoke` invoke channel.

For invalid channels:

- call is ignored (no throw, no reject)

### `invoke(...)` behavior

Allowed channels (from shared `INVOKE_CHANNELS` registry):

- `capture-screenshot-attachment`
- `read-attachment-file`
- `run-browser-action`
- `windie:invoke` for SDK-shaped commands such as `conversation.send`,
  `conversation.stop`, `settings.update`, `models.list`, `wakeword.detected`,
  `conversations.list`, `conversations.search`, `conversation.load`,
  `conversations.delete`, `memories.list`, `memories.delete`, and
  `memories.clearAll`
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
- `show-main-window`
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

Memory list/delete/clear and chat clear are not direct preload invoke channels.
Renderer memory UI uses SDK-shaped `window.agentSdk.invoke("memories.*", payload)`
and `window.agentSdk.invoke("conversations.clearAll", payload)` commands, and
Electron main maps those commands to public Agent SDK APIs.

For invalid channels:

- returns `Promise.reject(new Error("Invalid invoke channel: ..."))`

Legacy note:

- overlay click-through/focus prep is no longer renderer-callable over preload
- active-loop interactivity is owned by main-process overlay phase handling instead

### `on(...)` and `once(...)` behavior

Allowed channels (from shared `ON_CHANNELS` registry):

- `windie:rows`
- `windie:status`
- `windie:conversation-event`
- `windie:memory-store-changed`
- `windie:conversation-metadata-invalidated`
- `windie:current-turn`
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

Historical note: `from-backend` is not a current preload listener channel.
Main routes SDK conversation projections and typed backend events through the
specific channels above.

`on(...)` semantics:

- strips Electron event object before calling renderer handler (`func(...args)`)
- returns cleanup callback that removes exact listener

`once(...)` semantics:

- single-shot wrapper with stripped event object
- no cleanup callback returned

Invalid `on/once` channel behavior:

- no subscription; function returns `undefined`

## Renderer Typed Bridge Alignment

`channels.ts` re-exports typed constants/types from the shared channel registry:

- `SEND_CHANNELS`
- `INVOKE_CHANNELS`
- `ON_CHANNELS`
- `SendChannel` / `InvokeChannel` / `OnChannel` unions

`IpcBridge` in `bridge.ts` adds:

- `window.ipc` presence guard via `getRawIpc()`
- development-only runtime channel validation with `Set` membership checks
- prod fast path (no validation) because preload already enforces allowlists

`bridge.ts` intentionally exports only `IpcBridge`; renderer callers import
channel constants from `channels.ts` so channel ownership stays in one module.

Dev-mode validation trigger:

- `process.env.NODE_ENV === 'development'`

Failure mode if preload not loaded:

- throws `window.ipc is not available. Make sure preload.js is loaded.`

## Main-Process Ownership Cross-Check

Allowlisted preload channels must have matching main-process ownership in `frontend/src/main/ipc.cjs`.

Current high-value mappings:

- `send('renderer-log')` / `send('live-surface-trace')` -> main logging and
  trace handlers in `ipc.cjs`
- `send('transcript-session-sync')` -> transcript session sync handler in
  `ipc.cjs`
- `invoke('windie:invoke')` -> SDK-shaped command router in `ipc.cjs`
- `invoke('load-frontend-config')` / `invoke('save-frontend-config')` ->
  desktop UI config handlers
- `invoke('get-client-user-id')` -> connection/user/session snapshot handler
- `invoke('upload-artifact')` / `invoke('fetch-artifact-image')` -> artifact
  handlers
- `invoke('list-permissions'|'check-permissions'|'run-permission-probe'|'request-permission')`
  -> permission handlers in `permission_ipc_runtime.cjs`
- `on('windie:rows'|'windie:status'|'windie:conversation-event'|'windie:current-turn')`
  -> SDK projection/event broadcasts
- `on('backend-settings-event'|'agent-capability-event'|'audio-chunk')` ->
  typed backend event fan-out
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

1. update the shared registry in `frontend/src/shared/ipcChannels.json`
2. update/confirm `frontend/src/main/ipc.cjs` handler or broadcast owner
3. update related contract docs under `docs/frontend/contracts/*`
4. add/update tests for bridge validation, preload allowlist behavior, and main handler behavior
