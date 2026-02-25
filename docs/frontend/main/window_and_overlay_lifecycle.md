---
summary: "Electron window lifecycle reference for main/dashboard window, chat overlay, response overlay, focus restoration, sizing IPC, and overlay phase transitions."
read_when:
  - When changing chat/response overlay behavior, window positioning, or click-through policy.
  - When adding/editing Electron IPC handlers for window state, sizing, focus, or display selection.
title: "Window and Overlay Lifecycle"
---

# Window and Overlay Lifecycle

## Ownership and Entry Points

Primary modules:

- `frontend/src/main/index.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/local_backend_bridge_windows.cjs`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`

Window set:

- `mainWindow`: dashboard/settings surface (`frame: false`, hidden on start)
- `chatWindow`: bottom-center overlay input pill (`transparent`, `alwaysOnTop`)
- `responseWindow`: response overlay above chat pill (`transparent`, `alwaysOnTop`)
- `contextLabelWindow`: active-app context label above chat pill (`transparent`, `alwaysOnTop`)

For deeper context-label runtime details, see [Context Label Overlay and Active-Window Runtime Reference](context_label_overlay_and_active_window_runtime_reference.md).

## Creation and Startup Flow

App-ready path (`app.whenReady()`):

1. `createWindow()` creates `mainWindow`, wires IPC, wakeword bridge, local backend bridge.
2. `createChatWindow()` creates overlay input surface (`view=chatbox`).
3. `createResponseWindow()` creates overlay response surface (`view=chatbox-response`).
4. tray and global hotkey (`Super+Alt+W`) are initialized.
5. chat/response windows are registered in IPC broadcaster set.

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
- chat/response resize IPC handlers (`set-chatbox-size`, `set-responsebox-size`)

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

Handlers in `index.cjs`:

- `set-overlay-ignore-mouse`: toggles click-through for chat and response overlays
- `set-chatbox-size`: bounded resize (`width <= 900`, `height <= 7500`), repositions response overlay
- `set-responsebox-size`:
  - default mode: bounded resize (`width <= 900`, `height <= 750`), show/hide + re-anchor above chat
  - fullscreen ghost mode (`full_screen=true`): expands response overlay to the active display bounds for anywhere-on-screen ghost cursor rendering
- `move-chatbox-to`: direct chat overlay drag positioning
- `show-main-window` (optional `{ open }` target payload; forwards `main-window-open-target` to main renderer)
- `show-chatbox`, `hide-chatbox`
- `get-displays`: returns display id/label/bounds/scaleFactor
- `window-minimize`, `window-toggle-maximize`, `window-close`

## Renderer Participation

### Chat overlay (`ChatBox.jsx`)

- reports measured shell size via `SET_CHATBOX_SIZE` on `ResizeObserver`
- sets overlay click-through (`SET_OVERLAY_IGNORE_MOUSE`) by stream/overlay phases
- listens for `chatbox-focus` to force input focus
- sends `MOVE_CHATBOX_TO` while dragging
- polls `GET_SYSTEM_STATE(active_window)` for context badge freshness

### Response overlay (`ChatBoxResponse.jsx`)

- listens to `response-overlay-phase`
- computes visibility from phase + stream content state
- reports frame size via `SET_RESPONSEBOX_SIZE`
- supports awaiting-first-chunk view, tool-call ghost preview, final/error markdown pane

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
