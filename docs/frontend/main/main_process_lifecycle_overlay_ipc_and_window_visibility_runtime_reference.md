---
summary: "Deep reference for main-process runtime split: app lifecycle bootstrap, overlay IPC handler registration, and chat/main window visibility transitions delegated from `index.cjs`."
read_when:
  - When changing app startup/quit lifecycle wiring in `main_process_lifecycle_runtime.cjs`.
  - When changing overlay IPC registration or show/hide/main-window behavior delegated through `overlay_ipc_runtime.cjs` and `window_visibility_runtime.cjs`.
title: "Main Process Lifecycle, Overlay IPC, and Window Visibility Runtime Reference"
---

# Main Process Lifecycle, Overlay IPC, and Window Visibility Runtime Reference

## Canonical Modules

- `frontend/src/main/index.cjs`
- `frontend/src/main/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/overlay_ipc_runtime.cjs`
- `frontend/src/main/window_visibility_runtime.cjs`
- `frontend/src/main/main_window_runtime.cjs`

## Split Ownership Model

`index.cjs` keeps mutable window/runtime state and dependency wiring.

Delegated runtime modules:

- lifecycle orchestration: `main_process_lifecycle_runtime.cjs`
- overlay/window IPC handler registration: `overlay_ipc_runtime.cjs`
- show/hide/main-window transition behavior: `window_visibility_runtime.cjs`

## Lifecycle Runtime (`main_process_lifecycle_runtime.cjs`)

`initializeMainProcessLifecycleRuntime(deps)` owns:

- `app.whenReady()` startup sequence:
  - `createWindow`
  - `createChatWindow`
  - `createResponseWindow`
  - `createTray`
  - overlay renderer registration
- display-metrics listener for overlay repositioning
- global wakeword hotkey registration and toggle behavior
- app activation behavior (`create*Window` path when all windows closed, else `showMainWindow`)
- app quit lifecycle:
  - `before-quit`: mark `app.isQuitting=true`, stop local backend
  - `will-quit`: unregister shortcuts
  - `window-all-closed`: prevent app quit (tray runtime)

## Overlay IPC Runtime (`overlay_ipc_runtime.cjs`)

`initializeOverlayHandlersRuntime(deps)` centralizes `ipcMain.handle/on` registrations for:

- overlay/window controls:
  - `set-overlay-ignore-mouse`
  - `set-chatbox-size`
  - `move-chatbox-to`
  - `set-responsebox-size`
  - `show-main-window`
  - `show-chatbox`
  - `hide-chatbox`
  - `get-displays`
  - `window-minimize`
  - `window-toggle-maximize`
  - `window-close`
- privilege/permissions:
  - `set-agent-sudo-access`
  - `list-permissions`
  - `check-permissions`
  - `check-permission`
  - `run-permission-probe`
  - `request-permission`

It delegates business logic to existing handler modules while normalizing dependency injection (`getWindows`, `screen`, permission deps, open-target emitters).

## Window Visibility Runtime (`window_visibility_runtime.cjs`)

### `showChatWindow(options, deps)`

Behavior:

- hide main window if visible
- show/focus chat window
- optionally restore response overlay if active stream/visible flag says so
- emit chatbox focus event
- sync wakeword toggle and context-label visibility

### `hideChatWindow(deps)`

Behavior:

- hide chat, response, and context-label windows when visible
- broadcast response overlay visibility false
- sync wakeword toggle

### `showMainWindow(options, deps)`

Behavior:

- hide chat overlay when visible
- show main window
- optional maximize flow (`restore` + `maximize`)
- optional focus

## Drift Hotspots

1. Duplicating lifecycle listeners in `index.cjs` after split causes duplicate hotkey/listener registration.
2. Adding new overlay channels directly in `index.cjs` and skipping `overlay_ipc_runtime.cjs` breaks registration centralization.
3. Mutating window visibility behavior in one path (`window_visibility_runtime`) but not corresponding overlay handler call sites can desync UX.
4. Changing dependency names in `initialize*Runtime` calls without matching runtime module contracts breaks startup silently.

## Related Pages

- [Frontend Main Docs Hub](README.md)
- [Window and Overlay Lifecycle](window_and_overlay_lifecycle.md)
- [Main Window Runtime Factory and Overlay Bootstrap Reference](main_window_runtime_factory_and_overlay_bootstrap_reference.md)
- [IPC Helper Module Split and Runtime Boundary Reference](ipc_helper_module_split_and_runtime_boundary_reference.md)
