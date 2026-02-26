---
summary: "Deep reference for `main_window_runtime.cjs`: BrowserWindow factory helpers, renderer view loading, overlay creation contracts, and tray bootstrap behavior delegated from `index.cjs`."
read_when:
  - When changing main/chat/response window creation defaults or shared overlay BrowserWindow options.
  - When changing startup bootstrap wiring between `index.cjs` and `main_window_runtime.cjs`.
title: "Main Window Runtime Factory and Overlay Bootstrap Reference"
---

# Main Window Runtime Factory and Overlay Bootstrap Reference

## Canonical Modules

- `frontend/src/main/main_window_runtime.cjs`
- `frontend/src/main/index.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/main/local_backend_bridge.cjs`

## Runtime Split

`index.cjs` owns mutable app state and runtime callbacks.

`main_window_runtime.cjs` owns reusable window/bootstrap factories:

- main dashboard window creation (`createMainWindow`)
- chat overlay window creation (`createChatWindow`)
- response overlay window creation (`createResponseWindow`)
- tray menu creation (`createTray`)
- shared helpers (`loadRendererView`, `createOverlayBrowserWindow`, target normalization/emission)

## Shared Window Factory Contracts

### `createOverlayBrowserWindow(...)`

Shared overlay defaults for chat/response windows:

- frameless + transparent + skip taskbar + always-on-top
- no resize/minimize/maximize/fullscreen controls
- preload set to `frontend/src/preload.js`
- context isolation on, Node integration off

This centralizes overlay BrowserWindow option parity across both overlay surfaces.

### `loadRendererView(...)`

Loads renderer routes for packaged and dev runtime:

- packaged: `dist/index.html` with optional query params
- dev: `http://localhost:5173` + optional query string
- view routing uses `?view=...`
- debug transparency UI uses `?dev_ui=1` when enabled

## Main Window Bootstrap (`createMainWindow`)

Creation behavior:

- builds frameless hidden dashboard window (`1000x700`, `#111318`)
- enables content protection on supported platforms
- initializes:
  - IPC bridge (`initializeIpc`)
  - wakeword bridge (`initializeWakewordBridge`)
  - local backend bridge (`initializeLocalBackendBridge`)
  - overlay handler registration (`initializeOverlayHandlers`)

Close behavior:

- when app not quitting, close is intercepted
- window is hidden and chat overlay is shown/focused

## Chat Overlay Bootstrap (`createChatWindow`)

Creation behavior:

- builds overlay window (`520x96`)
- positions via injected `positionChatWindow`
- loads renderer route `view=chatbox`
- syncs wakeword toggle on show/hide

Close behavior:

- intercepted to hide overlay instead of quitting

## Response Overlay Bootstrap (`createResponseWindow`)

Creation behavior:

- builds overlay window (default hidden, height `1` unless debug mode)
- loads:
  - `view=chatbox-response` (normal mode)
  - debug view (ghost overlay mode) when `enableOsToolGhostDebug=true`
- syncs response overlay visibility state via injected setters

Debug mode behavior:

- response overlay starts visible and positioned immediately

Close behavior:

- intercepted to hide overlay + clear response visibility state
- on closed, response reference reset and context-label sync callback invoked

## Open-Target + Tray Helpers

### `normalizeMainWindowOpenTarget(...)`

- validates requested `show-main-window` open target against allowed target set
- normalizes lowercase/trimmed string target

### `emitMainWindowOpenTarget(...)`

- sends `main-window-open-target` event to main window webContents when valid

### `createTray(...)`

- creates tray icon and context menu:
  - `Show App` -> `showMainWindow({ focus: true })`
  - `Quit` -> mark quitting and call `app.quit()`
- double-click opens app

## Drift Hotspots

1. Changing overlay BrowserWindow defaults in only one window path (chat vs response) instead of shared factory.
2. Changing `view` route names in runtime helper without matching renderer route map.
3. Moving initializer calls out of `createMainWindow` without preserving startup ordering from `index.cjs`.
4. Breaking `show-main-window` open-target normalization/emission parity between helper and `index.cjs` handler.

## Related Pages

- [Frontend Main Docs Hub](README.md)
- [Window and Overlay Lifecycle](window_and_overlay_lifecycle.md)
- [Electron Main and IPC](electron_main_and_ipc.md)
