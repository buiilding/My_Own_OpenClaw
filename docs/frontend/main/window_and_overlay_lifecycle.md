---
summary: "Electron window lifecycle reference for main/dashboard window, chat overlay, response overlay, blur-only capture prep, response sizing IPC, and overlay phase transitions."
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
- `frontend/src/main/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/window_controls_ipc_runtime.cjs`
- `frontend/src/main/permission_ipc_runtime.cjs`
- `frontend/src/main/window_visibility_runtime.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/local_backend_bridge_window_visibility.cjs`
- `frontend/src/main/platform/screenshot_window_visibility/*`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`

Window set:

- `mainWindow`: dashboard/settings surface (`frame: false`, hidden on start)
- `chatWindow`: bottom-center overlay input pill (`transparent`, `alwaysOnTop`)
- `responseWindow`: response overlay above chat pill (`transparent`, `alwaysOnTop`)
- `contextLabelWindow`: dormant context-label shell window hooks remain in main process, but window is not currently instantiated in startup flow
- chat/response overlays request strongest topmost level first (`screen-saver`, fallback `floating`) and are pinned to all workspaces/fullscreen spaces (`visibleOnFullScreen`; macOS also requests `skipTransformProcessType`)

For deeper context-label runtime details, see [Context Label Overlay and Active-Window Runtime Reference](context_label_overlay_and_active_window_runtime_reference.md).

## Creation and Startup Flow

App-ready path (`app.whenReady()`):

1. `initializeMainProcessLifecycleRuntime(...)` runs startup lifecycle listeners.
2. `createWindow()` delegates to `createMainWindowRuntime(...)` to create `mainWindow` and wire IPC/wakeword/local-backend/overlay phase coordination.
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
  - phase callback from backend (`applyResponseOverlayPhase`) is ignored to prevent auto-hide during debug
- launcher: `cd frontend && npm run test:ghost-cursor`

Global app policy:

- startup acquires `app.requestSingleInstanceLock()`; duplicate launches exit and trigger `second-instance` on the primary process to focus the existing main window.
- startup emits `[Main][StartupMetrics]` snapshots (ready + 2s delayed) with PID, RSS/heap, and Electron process-type counts for repeated-launch diagnostics.
- `window-all-closed` is prevented only while tray mode is active (`!app.isQuitting`).
- `before-quit` sets `app.isQuitting=true` and stops local backend sidecar process.

## Positioning and Bounds Rules

Position helpers in `index.cjs`:

- `getChatWindowBounds(width, height)`:
- anchored to primary display work area
- centered horizontally
- margin-bottom of `24px`
- `getResponseWindowBounds(width, height)`:
- centered to current chat window width
- rendered above chat window with tight runtime gap (`2px` in current non-dashboard config)
- compact response shells (`<=56px` tall, e.g., typing indicator only) apply a hover offset so the bubble sits closer to the chat pill instead of floating high above it
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
- main process callback `applyResponseOverlayPhase(...)` drives response window visibility

Visibility behavior:

- `idle`: force-hide response overlay and clear visibility flag
- streaming/tool phases: ensure overlay visible, keep on top, show inactive if chat window is visible
- terminal phases (`complete`, `error`) keep overlay visible only when previously visible and chat is visible

## Focus and Foreground Behavior

Windows-specific external focus tracking:

- before chat overlay focus, app snapshots external focused window id/title via `node-window-manager`
- pre-capture hook (`prepareOverlayQueryCaptureFocus`) only blurs app windows and waits `120ms`
- interactive tool-run focus prep now passes `skipDemotion=true`, so overlay focus handoff avoids hide/show demotion flicker and relies on explicit click-through + non-focusable toggles
- used before overlay query capture path to avoid self-capture interference

`showChatWindow({focus})` behavior:

- hides main window if visible
- shows chat overlay and restores response overlay if stream is active
- `focus=false` path uses non-activating show (`showInactive`) when available to avoid stealing active external window
- `focus=true` path focuses chat overlay and emits `chatbox-focus` to renderer

`hideChatWindow()` behavior:

- hides chat overlay
- hides response overlay
- re-enables wakeword toggle broadcast

Tool-execution chat-pill lifecycle (interactive computer-use path):

- shared response-overlay phase is now the only owner of active-loop interactivity: `awaiting-first-chunk|streaming|tool-call|tool-output` force chat/response overlays into click-through + non-focusable mode, terminal phases restore normal interactivity
- tool-runner prep no longer performs external-window focus restoration/verification; frontend prep is blur-only and avoids hide/show focus demotion churn
- screenshot capture visibility prep still collapses the chat pill on Linux before capture and restores with `show-chatbox { focus: false }` after capture; Windows/macOS keep overlays visible and rely on content protection
- response overlay renderer now listens to `response-overlay-visibility`; hide marks the cached frame as hidden and show forces a fresh `set-responsebox-size` report (including `compact_hover`) so typing-indicator compact hover offset is re-applied after capture hide/show cycles

Dashboard-to-chat-pill conversation continuity:

- renderer session updates now publish `transcript-session-sync` to main process whenever `conversationRef`/`userId` changes
- main process fans that payload out to other renderer windows (excluding sender) and updates its own `currentConversationRef` fallback
- result: if user selects `New chat` or a past chat in dashboard, then closes dashboard back to minimal chat pill, the pill continues in that selected conversation instead of drifting to a stale one

## Main IPC Handlers for Window Control

Handlers split across narrow registrars (wired by `index.cjs`):

- `overlay_phase_ipc_runtime.cjs`
- `set-responsebox-size`:
  - default mode: bounded resize (`width <= 900`, `height <= 750`), show/hide + re-anchor above chat
  - fullscreen ghost mode (`full_screen=true`): expands response overlay to the active display bounds for anywhere-on-screen ghost cursor rendering
- `move-chatbox-to`: direct chat overlay drag positioning
- `show-chatbox`, `hide-chatbox`
- `window_controls_ipc_runtime.cjs`
- `show-main-window` (optional `{ open, maximize }`; forwards `main-window-open-target` when open target is accepted)
- `get-displays`: returns display id/label/bounds/scaleFactor
- `window-minimize`, `window-toggle-maximize`, `window-close`
- `permission_ipc_runtime.cjs`
- `set-agent-sudo-access`
- `list-permissions`, `check-permissions`, `check-permission`, `run-permission-probe`, `request-permission`

Legacy overlay interactivity/focus-prep invoke handlers were removed; the shared response-overlay phase handler now owns active-loop click-through/`focusable=false`, and query-capture focus prep remains an internal main-process callback.

Main bridge fanout channel (`ipc.cjs`):

- `transcript-session-sync`: accepts `{ conversationRef, userId }` from any renderer, updates IPC bridge conversation fallback, and broadcasts to sibling renderers so dashboard/chat-pill windows share the same active conversation identity

`show-main-window` behavior details:

- hides overlay windows before dashboard handoff.
- `maximize=true` restores and maximizes main window before focus.
- `open` target still routes to renderer as `main-window-open-target`.

## Renderer Participation

### Chat overlay (`ChatBox.jsx`)

- uses fixed overlay dimensions (no renderer-driven live resize IPC)
- keeps preview lane always mounted and toggles animated visibility on image attach/remove
- uses deterministic class-based layout states: compact default pill (`64px` shell / `56px` pill) and fixed expanded `with-preview` pill while image attachments exist
- reports chat visual anchor height (`64` compact / `116` with-preview) via IPC so response/context overlays re-anchor upward when preview mode is active
- main-process overlay phase handler owns click-through + `focusable=false` during active loop phases; renderer no longer toggles overlay interactivity directly
- listens for `chatbox-focus` to focus input when unlocked; renderer no longer re-focuses on generic window/tab visibility events
- sends `MOVE_CHATBOX_TO` while dragging

### Response overlay (`ChatBoxResponse.jsx`)

- listens to `response-overlay-phase`
- listens to `response-overlay-visibility` and re-reports compact frame size after hide/show cycles, preventing stale tall typing-indicator bounds after tool capture
- uses explicit layout modes (`response`, `awaiting-typing`, `hidden`) so sizing/reporting logic is deterministic across query/tool/capture transitions
- response mode uses a fixed `236px` shell height; streamed content scrolls inside the same frame instead of resizing the overlay mid-turn
- `awaiting-typing` mode locks to a deterministic fixed frame height (`24px`) so typing-indicator vertical placement remains stable between turns
- computes visibility from phase + stream content state
- reports frame size via `SET_RESPONSEBOX_SIZE`
- supports awaiting-first-chunk view and final/error markdown pane
- main-process response/context-label positioning now anchors to compact visual chat-pill height (instead of full transparent chat window height), preventing vertical drift when compact pill is shorter than the fixed overlay window.

For renderer-only deep dives:

- `docs/frontend/renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md`
- `docs/frontend/renderer/overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md`

## Linux Screenshot Guard

`local_backend_bridge_window_visibility.cjs:withHiddenWindowForScreenshot(...)`:

- selects a platform-specific screenshot visibility runtime
- Linux behavior lives in `platform/screenshot_window_visibility/linux.cjs`
- Linux main-process runtime is now a no-op; renderer `SurfaceOrchestrator` owns the single hide/show path to avoid double-collapse races
- Windows and macOS are also no-op here because overlay protection is handled elsewhere (`setContentProtection(true)`)
- result: screenshot tool execution no longer adds a second hide/restore cycle on top of renderer capture prep

For deeper focus/capture guard internals:

- `docs/frontend/main/overlays/external_focus_snapshot_restore_and_query_capture_reference.md`
- `docs/frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md`
