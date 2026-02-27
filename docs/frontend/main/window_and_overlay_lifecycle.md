---
summary: "Electron window lifecycle reference for main/dashboard window, chat overlay, response overlay, focus restoration, response sizing IPC, and overlay phase transitions."
read_when:
  - When changing chat/response overlay behavior, window positioning, or click-through policy.
  - When adding/editing Electron IPC handlers for window state, sizing, focus, or display selection.
title: "Window and Overlay Lifecycle"
---

# Window and Overlay Lifecycle

## Ownership and Entry Points

Primary modules:

- `frontend/src/main/index.cjs`
- `frontend/src/main/main_window_runtime.cjs`
- `frontend/src/main/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/overlay_ipc_runtime.cjs`
- `frontend/src/main/window_visibility_runtime.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/local_backend_bridge_windows.cjs`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`

Window set:

- `mainWindow`: dashboard/settings surface (`frame: false`, hidden on start)
- `chatWindow`: bottom-center overlay input pill (`transparent`, `alwaysOnTop`)
- `responseWindow`: response overlay above chat pill (`transparent`, `alwaysOnTop`)
- `contextLabelWindow`: dormant context-label shell window hooks remain in main process, but window is not currently instantiated in startup flow

For deeper context-label runtime details, see [Context Label Overlay and Active-Window Runtime Reference](context_label_overlay_and_active_window_runtime_reference.md).

## Creation and Startup Flow

App-ready path (`app.whenReady()`):

1. `initializeMainProcessLifecycleRuntime(...)` runs startup lifecycle listeners.
2. `createWindow()` delegates to `createMainWindowRuntime(...)` to create `mainWindow` and wire IPC/wakeword/local-backend/overlay handlers.
3. `createChatWindow()` delegates to `createChatWindowRuntime(...)` for overlay input surface (`view=chatbox`).
4. `createResponseWindow()` delegates to `createResponseWindowRuntime(...)` for response surface (`view=chatbox-response` or debug view).
5. tray and global hotkey (`Super+Alt+W`) are initialized.
6. chat/response windows are registered in IPC broadcaster set.

For extracted factory/helper ownership details, see [Main Window Runtime Factory and Overlay Bootstrap Reference](main_window_runtime_factory_and_overlay_bootstrap_reference.md).
For lifecycle + overlay-handler split details, see [Main Process Lifecycle, Overlay IPC, and Window Visibility Runtime Reference](main_process_lifecycle_overlay_ipc_and_window_visibility_runtime_reference.md).

Window close policy:

- `mainWindow.close` is intercepted; app hides window and shows chat overlay instead.
- `chatWindow.close` is intercepted; overlay hides without app quit.
- `responseWindow.close` is intercepted; overlay hides and visibility flag resets.

OS debug mode for ghost animation:

- env flag: `WINDIE_DEBUG_GHOST_OVERLAY=1`
- startup behavior:
  - `responseWindow` loads `view=tool-ghost-debug` instead of `chatbox-response`
  - response overlay starts visible (`520x620`) and remains phase-independent
  - phase callback from backend (`handleResponseOverlayPhaseChange`) is ignored to prevent auto-hide during debug
- launcher: `cd frontend && npm run test:ghost-cursor`

Global app policy:

- `window-all-closed` is prevented to keep tray runtime active.
- `before-quit` sets `app.isQuitting=true` and stops local backend sidecar process.

## Positioning and Bounds Rules

Position helpers in `index.cjs`:

- `getChatWindowBounds(width, height)`:
- anchored to primary display work area
- centered horizontally
- margin-bottom of `24px`
- `getResponseWindowBounds(width, height)`:
- centered to current chat window width
- rendered above chat window with `10px` gap
- fallback to chat-window positioning if chat unavailable

Reposition triggers:

- explicit `positionChatWindow()` and `positionResponseWindow()` calls
- display metric change event (`screen.on('display-metrics-changed', ...)`)
- response resize IPC handler (`set-responsebox-size`)

## Overlay Phase Model

Canonical phases (`index.cjs` + `ipc.cjs`):

- `idle`
- `awaiting-first-chunk`
- `streaming`
- `tool-call`
- `tool-output`
- `complete`
- `error`

Wiring:

- backend events in `ipc.cjs` translate to phase transitions
- phase broadcast channel: `response-overlay-phase`
- main process callback `handleResponseOverlayPhaseChange(...)` drives response window visibility

Visibility behavior:

- `idle`: force-hide response overlay and clear visibility flag
- streaming/tool phases: ensure overlay visible, keep on top, show inactive if chat window is visible
- terminal phases (`complete`, `error`) keep overlay visible only when previously visible and chat is visible

## Focus and Foreground Behavior

Windows-specific external focus preservation:

- before chat overlay focus, app snapshots external focused window id/title via `node-window-manager`
- pre-capture hook (`prepareOverlayQueryCaptureFocus`) blurs app windows, restores previous external window, and waits `120ms`
- used before overlay query capture path to avoid self-capture interference

`showChatWindow({focus})` behavior:

- hides main window if visible
- shows chat overlay and restores response overlay if stream is active
- optional focus + emits `chatbox-focus` to renderer

`hideChatWindow()` behavior:

- hides chat overlay
- hides response overlay
- re-enables wakeword toggle broadcast

## Main IPC Handlers for Window Control

Handlers in `overlay_ipc_runtime.cjs` (wired by `index.cjs`):

- `set-overlay-ignore-mouse`: toggles click-through for chat and response overlays
- `set-responsebox-size`:
  - default mode: bounded resize (`width <= 900`, `height <= 750`), show/hide + re-anchor above chat
  - fullscreen ghost mode (`full_screen=true`): expands response overlay to the active display bounds for anywhere-on-screen ghost cursor rendering
- `move-chatbox-to`: direct chat overlay drag positioning
- `show-main-window` (optional `{ open, maximize }`; forwards `main-window-open-target` when open target is accepted)
- `show-chatbox`, `hide-chatbox`
- `get-displays`: returns display id/label/bounds/scaleFactor
- `window-minimize`, `window-toggle-maximize`, `window-close`

`show-main-window` behavior details:

- hides overlay windows before dashboard handoff.
- `maximize=true` restores and maximizes main window before focus.
- `open` target still routes to renderer as `main-window-open-target`.

## Renderer Participation

### Chat overlay (`ChatBox.jsx`)

- uses fixed overlay dimensions (no renderer-driven live resize IPC)
- keeps preview lane always mounted and toggles animated visibility on image attach/remove
- sets overlay click-through (`SET_OVERLAY_IGNORE_MOUSE`) by stream/overlay phases
- listens for `chatbox-focus` to force input focus
- sends `MOVE_CHATBOX_TO` while dragging

### Response overlay (`ChatBoxResponse.jsx`)

- listens to `response-overlay-phase`
- computes visibility from phase + stream content state
- reports frame size via `SET_RESPONSEBOX_SIZE`
- supports awaiting-first-chunk view and final/error markdown pane

For renderer-only deep dives:

- `docs/frontend/renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md`
- `docs/frontend/renderer/overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md`

## Linux Screenshot Guard

`local_backend_bridge_windows.cjs:withHiddenWindowForScreenshot(...)`:

- only active on Linux
- temporarily hides app windows before screenshot tool execution
- restores previous visibility/focus and always-on-top state after capture
- prevents overlay artifacts leaking into screenshot payloads

For deeper focus/capture guard internals:

- `docs/frontend/main/overlays/external_focus_snapshot_restore_and_query_capture_reference.md`
- `docs/frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md`
