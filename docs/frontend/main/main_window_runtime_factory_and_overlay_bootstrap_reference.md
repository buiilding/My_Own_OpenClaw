---
summary: "Deep reference for `main_window_runtime.cjs`: main/chat/response/tray bootstrap orchestration, close/hide lifecycle contracts, and delegation into icon/overlay helper runtimes."
read_when:
  - When changing main/chat/response window creation defaults or startup bootstrap delegation into icon/overlay helper runtimes.
  - When changing startup bootstrap wiring between `index.cjs` and `main_window_runtime.cjs`.
title: "Main Window Runtime Factory and Overlay Bootstrap Reference"
---

# Main Window Runtime Factory and Overlay Bootstrap Reference

## Canonical Modules

- `frontend/src/main/main_window_runtime.cjs`
- `frontend/src/main/main_window_icon_runtime.cjs`
- `frontend/src/main/main_window_overlay_runtime.cjs`
- `frontend/src/main/index.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/overlay_topmost_runtime.cjs`
- `tests/frontend/MainWindowRuntime.test.cjs`
- `tests/frontend/MainWindowIconRuntime.test.cjs`
- `tests/frontend/MainWindowOverlayRuntime.test.cjs`

## Runtime Split

`index.cjs` owns mutable app state and runtime callbacks.

`main_window_runtime.cjs` owns high-level window/bootstrap orchestration:

- main dashboard window creation (`createMainWindow`)
- chat overlay window creation (`createChatWindow`)
- response overlay window creation (`createResponseWindow`)
- tray menu creation (`createTray`)
- open-target normalization/emission helpers

Startup visibility ownership note:

- non-VM desktop startup no longer auto-shows the dashboard window from Electron main
- Electron main creates the dashboard and overlay windows hidden
- the renderer startup-surface controller decides the first visible surface:
  - onboarding -> main window
  - normal desktop launch -> minimal chat pill
  - VM mode -> main window

Delegated helper ownership:

- icon resolution + fallback behavior: `main_window_icon_runtime.cjs`
- renderer view loading + shared overlay BrowserWindow defaults + lazy loader: `main_window_overlay_runtime.cjs`

## Main Window Bootstrap (`createMainWindow`)

Creation behavior:

- builds frameless hidden dashboard window (`1000x700`, `#111318`)
- initializes:
  - IPC bridge (`initializeIpc`)
  - wakeword bridge (`initializeWakewordBridge`)
  - local backend bridge (`initializeLocalBackendBridge`)
  - main-process IPC registration (`initializeMainProcessIpc`)

Important ownership note:

- `createMainWindow(...)` does not call `enableContentProtectionSafely(...)`.
- Content protection in this module is applied to overlay windows (`createChatWindow`, `createResponseWindow`) only.

Close behavior:

- when app not quitting, close is intercepted
- window is hidden and chat overlay is shown/focused

Visibility behavior:

- the dashboard window is not the default first surface for normal desktop startup
- it is shown on explicit dashboard opens, onboarding, VM mode, or when already visible and focused again by lifecycle events

`prepareOverlayQueryCaptureFocus(...)` helper contract:

- blur chat/response/main windows (when present + not destroyed)
- wait bounded settle delay (`120ms` default)
- return deterministic no-op focus-prep payload:
  - `restoredExternalFocus=false`
  - `demotedOverlayFocus=false`
  - `externalFocusActive=false`
  - `canVerifyExternalFocus=false`

This keeps overlay query-capture prep blur-only and avoids hide/show demotion churn in active interaction flows.

## Chat Overlay Bootstrap (`createChatWindow`)

Creation behavior:

- builds chat overlay window with a preallocated transparent frame (`520x220`) so multiline pill growth does not need native window resizes during typing
- positions via injected `positionChatWindow`
- lazily loads renderer route `view=chatbox` on first `show` event
- syncs wakeword toggle on show/hide
- applies content protection and topmost/workspace visibility policy through shared runtime helpers, with macOS overlay panels avoiding explicit `setVisibleOnAllWorkspaces(...)` calls

Close behavior:

- intercepted to hide overlay instead of quitting

## Response Overlay Bootstrap (`createResponseWindow`)

Creation behavior:

- builds overlay window (default hidden, height `1` unless debug mode)
- loads:
  - `view=chatbox-response` (normal mode; eager-loaded while hidden so awaiting UI is ready before first show)
  - debug view (ghost overlay mode) when `enableOsToolGhostDebug=true`
- syncs response overlay visibility state via injected setters
- applies content protection and topmost/workspace visibility policy through shared runtime helpers, with macOS overlay panels avoiding explicit `setVisibleOnAllWorkspaces(...)` calls

Debug mode behavior:

- response overlay renderer is eagerly loaded
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
- tray icon creation delegates to `resolveTrayIconNativeImage(...)`:
  - path candidate resolution from `resolveAppIconPathRuntime(...)`
  - fallback to embedded data-url icon when path image is empty/unreadable

## Drift Hotspots

1. Changing overlay BrowserWindow defaults in only one window path (chat vs response) instead of shared factory.
2. Changing `view` route names in runtime helper without matching renderer route map.
3. Moving initializer calls out of `createMainWindow` without preserving startup ordering from `index.cjs`.
4. Breaking `show-main-window` open-target normalization/emission parity between helper and `index.cjs` handler.

## Related Pages

- [Frontend Main Docs Hub](README.md)
- [Main Window Icon and Overlay Runtime Reference](main_window_icon_and_overlay_runtime_reference.md)
- [Window and Overlay Lifecycle](window_and_overlay_lifecycle.md)
- [Electron Main and IPC](electron_main_and_ipc.md)
