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
- `frontend/src/main/surfaces/surface_runtime.cjs`
- `frontend/src/main/surfaces/main_window_runtime.cjs`
- `frontend/src/main/surfaces/window_platform_policy.cjs`
- `frontend/src/main/app/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`
- `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_visibility_runtime.cjs`
- `frontend/src/main/surfaces/response_overlay_visibility_policy.cjs`
- `frontend/src/main/debug/chat_pill_trace_runtime.cjs`
- `frontend/src/main/surfaces/window_suppression_runtime.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/sidecar/local_runtime_window_visibility.cjs`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`

Window set:

- `mainWindow`: dashboard/settings surface (`frame: false`, hidden on start)
- `chatWindow`: bottom-center overlay input pill (`transparent`, `alwaysOnTop`)
- `responseWindow`: response overlay above chat pill (`transparent`, `alwaysOnTop`)
- macOS chat/response overlays use the capturable `floating` topmost level in
  normal operation; screenshot exclusion is handled only by the SDK screenshot
  lease
- Windows/Linux chat/response overlays request strongest topmost level first
  (`screen-saver`, fallback `floating`)
- macOS overlays now use native `panel` windows, which span Spaces/fullscreen without calling `setVisibleOnAllWorkspaces(...)`
- Windows/Linux overlays still use the shared workspace-pinning helper when available

Shared ownership model:

- `surfaces/surface_runtime.cjs` is the single main-process owner for `mainWindow`, `chatWindow`, `responseWindow`, response-overlay visibility, and response phase.
- it also owns the high-level surface state:
  - `primarySurface`: `onboarding|dashboard|chat`
  - `mainWindowMode`: `onboarding|dashboard`
- high-level surface state advances only after the low-level show helper reports
  success, so failed chat/dashboard window transitions do not mark startup
  handling complete or report a surface switch that was not applied.
- `surfaces/window_platform_policy.cjs` is the single owner for per-platform `BrowserWindow` policy through `createWindowPlatformPolicy(...)`, including content protection, overlay topmost/workspace rules, and explicit activation/focus handoff.
- `response_overlay_visibility_policy.cjs` is the shared pure policy layer for response-overlay phase -> window mode mapping and chat-pill response-shell restore eligibility.
- `surfaces/surface_runtime.cjs` stores chat-pill show/hide decisions under the
  `surface.visibility` app diagnostics path, including `reason`, `user_hidden`,
  focus, and final window visibility.
- `chat_pill_trace_runtime.cjs` is the gated main-process trace helper for chat-pill / response-overlay transitions (`[ChatPillTrace][main]`).
- `index.cjs` now wires those owners together and passes their narrow callbacks into bootstrap/lifecycle/IPC modules instead of mutating window state directly.


## Creation and Startup Flow

App-ready path (`app.whenReady()`):

1. `initializeMainProcessLifecycleRuntime(...)` runs startup lifecycle listeners.
2. `createWindow()` delegates to `createMainWindowRuntime(...)` to create `mainWindow` and wire IPC/wakeword/local-runtime/overlay phase coordination.
3. when VM mode is disabled, `createChatWindow()` delegates to `createChatWindowRuntime(...)` for overlay input surface (`view=minimal-chat-pill`).
4. when VM mode is disabled, `createResponseWindow()` delegates to `createResponseWindowRuntime(...)` for response surface (`view=minimal-response-overlay` or debug view).
5. when VM mode is disabled, tray and the host-skin primary global hotkey are initialized (`Super+Alt+W` by default, `CommandOrControl+Alt+W` on Windows), with host-skin fallback accelerators tried when the primary is unavailable.
6. chat/response windows are registered in IPC broadcaster set only when those overlay windows are created.
7. chat/response overlay BrowserWindows now start hidden unless explicitly shown, so startup does not briefly materialize overlay surfaces before the dashboard handoff.

For extracted factory/helper ownership details, see [Main Window Runtime Factory and Overlay Bootstrap Reference](main_window_runtime_factory_and_overlay_bootstrap_reference.md).
For icon path resolution and shared overlay BrowserWindow/renderer-loader helper contracts, see [Main Window Icon and Overlay Runtime Reference](main_window_icon_and_overlay_runtime_reference.md).
For lifecycle + overlay-handler split details, see [Main Process Lifecycle, Overlay IPC, and Window Visibility Runtime Reference](main_process_lifecycle_overlay_ipc_and_window_visibility_runtime_reference.md).

Window close policy:

- `mainWindow.close` is intercepted.
- onboarding close hides the main window and does not restore the chat pill.
- dashboard close hides the window and restores the chat pill.
- on macOS, if the dashboard is currently in native fullscreen, close first exits fullscreen and waits for `leave-full-screen` before hiding the dashboard and restoring the chat pill, which prevents the black fullscreen shell from lingering behind the overlay.
- `chatWindow.close` is intercepted; overlay hides without app quit.
- `responseWindow.close` is intercepted; overlay hides and visibility flag resets.

OS debug mode for ghost animation:

- env flag: `WINDIE_DEBUG_GHOST_OVERLAY=1`
- startup behavior:
  - `responseWindow` loads `view=tool-ghost-debug` instead of `minimal-response-overlay`
  - response overlay starts visible (`520x620`) and remains phase-independent
  - phase callback from backend (`applyResponseOverlayPhase`) is ignored to prevent auto-hide during debug
- launcher: `cd frontend && npm run test:ghost-cursor`

Global app policy:

- startup acquires `app.requestSingleInstanceLock()`; duplicate launches exit and trigger `second-instance` on the primary process to focus the existing main window.
- startup records `desktop.startup` diagnostics (ready + 2s delayed) with PID, RSS/heap, and Electron process-type counts for repeated-launch diagnostics. Inspect with `<windie> diagnostics list --path desktop.startup --limit 50`; set `WINDIE_DEBUG_STARTUP_STDOUT=1` only when the `[Main][StartupMetrics]` stdout mirror is needed.
- `window-all-closed` is prevented only while tray mode is active (`!app.isQuitting && !vmMode`).

## Positioning and Bounds Rules

Position helpers in `surface_runtime.cjs` (via `overlay_window_helpers_runtime.cjs`):

- `getChatWindowBounds(width, height)`:
- anchored to primary display work area
- centered horizontally
- margin-bottom of `24px`
- manual drag preserves horizontal placement, vertical placement, and display affinity by storing the dragged bottom edge instead of a raw top `y`, so later pill-height changes keep the visible baseline fixed and grow upward
- `getResponseWindowBounds(width, height)`:
- centered to current chat window width
- rendered above chat window with tight runtime gap (`8px` in current non-dashboard config)
- compact response shells (`<=56px` tall, e.g., typing indicator only) apply a hover offset so the bubble sits closer to the chat pill instead of floating high above it
- fallback to chat-window positioning if chat unavailable

Reposition triggers:

- explicit `positionChatWindow()` and `positionResponseWindow()` calls
- display metric change event (`screen.on('display-metrics-changed', ...)`)
  - syncs stored active display affinity from visible desktop app surfaces (`syncVisibleSurfaceDisplayAffinity`: chat first, then dashboard) before repositioning overlays
- response resize IPC handler (`set-responsebox-size`)

## Overlay Phase Model

Canonical phases (`surface_runtime.cjs` + `ipc.cjs`):

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
- phase application tracks the active `correlation_id`; active-loop phases can
  claim a new response owner, while terminal or idle events from an older owner
  are ignored before they can hide the response window or clear content
  protection for the newer response

Visibility behavior:

- `idle`: force-hide response overlay and clear visibility flag
- streaming/tool phases: ensure overlay visible, keep on top, show inactive if chat window is visible
- terminal phases (`complete`, `error`) keep overlay visible only when previously visible and chat is visible
- those rules are now centralized in `response_overlay_visibility_policy.cjs`, while `response_overlay_phase_handler.cjs` owns only phase application + interactivity sync

## Focus and Foreground Behavior

Overlay focus behavior is now the same on every desktop OS:

- `prepareOverlayQueryCaptureFocus` only blurs desktop app windows and waits `120ms`
- there is no external-app snapshot/restore handoff path in the send/capture runtime
- interactive tool-run focus prep still passes `skipDemotion=true`, so overlay prep avoids hide/show demotion flicker and relies on explicit click-through + non-focusable toggles
- the pre-capture hook exists only to reduce self-capture interference before query screenshot/system-state collection

`showChatWindow({focus})` behavior:

- hides main window if visible
- respects persisted user-hidden chat-pill intent for generic lifecycle reasons
  such as startup and app activation, so a pill closed by the user does not
  reappear just because the app wakes or remounts
- explicit summons such as wakeword detection, global hotkey, and dashboard
  close-to-pill handoff clear the user-hidden intent and may show the pill
- stores `surface.visibility` diagnostics with `action="show-applied"`,
  `action="show-failed"`, or `action="show-suppressed"` so
  `<windie> diagnostics list --path surface.visibility` shows why the pill
  appeared or stayed hidden
- suppresses repeated `reason="startup"` chat-pill show requests after the
  startup surface has already handed off once; onboarding completion uses
  `reason="onboarding-complete"` so the first-run wizard can still hand off to
  the pill intentionally
- display target resolution is centralized in `resolveShowTargetDisplayAffinity(...)`:
  - explicit display target wins
  - stored active display affinity fallback applies only when chat window is hidden
  - visible/destroyed/missing target windows do not trigger fallback retargeting
- shows chat overlay and restores response overlay if stream is active
- `focus=false` path uses non-activating show (`showInactive`) when available to avoid stealing active external window
- `focus=true` path focuses chat overlay and emits `chatbox-focus` to renderer

`hideChatWindow()` behavior:

- hides chat overlay
- hides response overlay
- re-enables wakeword toggle broadcast
- records persisted user-hidden intent only when the hide reason is user-driven;
  capture, dashboard handoff, and other runtime hides do not mark the pill as
  user-hidden

Tool-execution chat-pill lifecycle (SDK/main computer-use path):

- shared response-overlay phase is now the only owner of active-loop interactivity: `awaiting-first-chunk|streaming|tool-call|tool-output` force chat/response overlays into click-through + non-focusable mode; outside active-loop phases the chat pill falls back to main-owned idle hit-testing that keeps transparent regions click-through until the renderer hover state says the pointer is over the visible pill shell
- SDK/local-runtime tool-surface prep runs through Electron main before local execution; it shows the minimal pill with `focus: false` and `restoreResponseOverlay: true`, which hides a visible dashboard through the main window visibility runtime
- renderer code remains display-only for backend tool events; it does not execute computer-use tools or own the dashboard-to-pill handoff
- screenshot capture visibility prep now hides whichever desktop app surface owns the capture:
  - `chatbox` for pill-originated capture
  - `main-window` for dashboard-originated capture
  - `none` when no desktop app surface is visible
- restore is symmetric with prep: capture lifecycles use a dedicated `restore-surface-after-screenshot` IPC so the same hidden surface is restored with the correct contract
- chat-pill restores through that IPC explicitly re-apply the response-overlay shell when the active overlay phase is still in the loop (`awaiting-first-chunk|streaming|tool-call|tool-output`), instead of reusing generic non-focusing `show-chatbox` behavior
- dashboard capture prep now moves the main window off the visible desktop before hide and does not return until the dashboard is offscreen, minimized, or hidden, so screenshot execution no longer races the dashboard hide animation
- Linux prep waits a bounded compositor-settle interval (`120ms`) after hiding
  the owning surface before invoking the screenshot tool so neither the pill nor
  the dashboard leaks into captured frames; Windows/macOS do not run overlay
  capture-time hide/restore suppression for the pill/response overlay, and
  instead toggle Electron `setContentProtection(...)` only inside the SDK
  screenshot-capture lease
- the shared renderer post-tool capture helper now owns the intentional pre-screenshot delay for screenshot/system-state collection on every OS, so capture timing is no longer tied to whether the platform screenshot-visibility runtime hides a desktop app surface
- response overlay renderer now listens to `response-overlay-visibility`; hide marks the cached frame as hidden and show forces a fresh `set-responsebox-size` report (including `compact_hover`) so typing-indicator compact hover offset is re-applied after capture hide/show cycles
- debug tracing for these show/hide/resize transitions is now available in main under `WINDIE_DEBUG_STREAM_EVENTS=1` or `WINDIE_DEBUG_CHAT_PILL=1`

Dashboard-to-chat-pill conversation continuity:

- renderer session updates now publish `transcript-session-sync` to main process whenever `conversationRef`/`userId` changes
- main process fans that payload out to other renderer windows (excluding sender) and updates its own active `currentConversationRef` state
- result: if user selects `New chat` or a past chat in dashboard, then closes dashboard back to minimal chat pill, the pill continues in that selected conversation instead of drifting to a stale one

## Main IPC Handlers for Window Control

Handlers split across narrow registrars (wired by `index.cjs`, guarded by `surface_runtime.initializeMainProcessIpcOnce(...)`).
The guard marks IPC as initialized only after the registrar completes, so a
thrown partial registration can fail clearly and be retried in the same process:

- `overlay_phase_ipc_runtime.cjs`
- `set-responsebox-size`:
  - default mode: bounded resize (`width <= 900`, `height <= 750`), show/hide + re-anchor above chat
  - fullscreen ghost mode (`full_screen=true`): expands response overlay to the active display bounds for anywhere-on-screen ghost cursor rendering
- `move-chatbox-to`: direct chat overlay drag positioning
- `show-chatbox`, `hide-chatbox`
- `window_controls_ipc_runtime.cjs`
- `show-main-window` (optional `{ open, maximize }`; forwards `main-window-open-target` when open target is accepted)
- `get-displays`: returns display id/label/bounds/scaleFactor
  - details: `display_query_handler.cjs` mapping contract is documented in [Display Query Handler Display Inventory Payload Contract Reference](display_query_handler_display_inventory_payload_contract_reference.md)
- `window-minimize`, `window-toggle-maximize`, `window-close`
  - `window-toggle-maximize` is platform-aware: Windows/Linux use native maximize/unmaximize, while macOS routes the custom dashboard maximize control through `setFullScreen(...)` so the frameless dashboard enters and exits native fullscreen instead of the weaker zoom-style maximize path
- `permission_ipc_runtime.cjs`
- `list-permissions`, `check-permissions`, `check-permission`, `run-permission-probe`, `request-permission`

Legacy overlay interactivity/focus-prep invoke handlers were removed; the shared response-overlay phase handler now owns active-loop click-through/`focusable=false`, and query-capture focus prep remains an internal main-process callback.

Main bridge fanout channel (`ipc.cjs`):

- `transcript-session-sync`: accepts `{ conversationRef, userId }` from any renderer, updates IPC bridge active conversation state, and broadcasts to sibling renderers so dashboard/chat-pill windows share the same active conversation identity. Query sends still require their own explicit `conversation_ref`.

`show-main-window` behavior details:

- hides overlay windows before dashboard handoff.
- `resolveShowTargetDisplayAffinity(...)` governs target selection:
  - explicit `targetDisplayAffinity` wins
  - stored active affinity fallback applies only when main window is hidden
  - visible/destroyed/missing target windows do not trigger fallback retargeting
- `maximize=true` restores and maximizes main window before focus.
- on macOS, both `window-toggle-maximize` and `show-main-window({ maximize: true })` use native fullscreen entry/exit instead of Electron `maximize()`, and any display-targeted reopen exits fullscreen first so the frameless dashboard can be repositioned correctly before entering fullscreen again.
- onboarding is treated as a separate primary surface from the dashboard and chat pill:
  - renderer opens it through `show-main-window({ open: 'onboarding' })`
  - onboarding does not request maximize/fullscreen on startup
  - closing onboarding hides the main window without restoring the chat pill
  - later app reactivation restores onboarding in the main window until the renderer leaves onboarding state
- focused dashboard restores use a stronger activation path (`moveTop()` -> `focus()` -> `webContents.focus()`) after the overlay handoff so Windows does not leave the frameless dashboard visible-but-inactive after opening from the minimal chat pill.
- `open` target still routes to renderer as `main-window-open-target`.

## Renderer Participation

### Chat overlay (`ChatBox.jsx`)

- uses a preallocated chat overlay frame in main, and visual-anchor IPC only re-anchors response/context surfaces instead of resizing the native chat window during multiline typing (no renderer-driven freeform resize IPC)
- keeps preview lane always mounted and toggles animated visibility on image attach/remove
- current production control set is: close badge, settings button, attachment button, screenshot toggle, text-to-speech toggle, and send button; `dev_ui=1` adds a compaction button
- screenshot and text-to-speech toggles share one icon-color contract: enabled stays blue both at rest and on hover, while disabled stays white both at rest and on hover
- uses deterministic class-based layout states: compact default pill (`64px` anchor fallback / `56px` pill) and fixed expanded `with-preview` pill while image attachments exist
- reports chat visual anchor height via IPC from the live shell height (`64` compact fallback / `116` preview fallback), so multiline composer growth and preview mode both re-anchor the chat/response stack upward while keeping the visible pill bottom-grounded inside the fixed native frame
- renderer batches resize-driven anchor reports to one animation-frame commit so the main process sees the settled multiline shell height instead of intermediate resize measurements
- main no longer resizes the native chat window on visual-anchor updates; only response/context overlay positioning follows the updated anchor
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
- main-process response positioning now anchors to compact visual chat-pill height (instead of full transparent chat window height), preventing vertical drift when compact pill is shorter than the fixed overlay window.

For renderer-only deep dives:

- `docs/frontend/renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md`
- `docs/frontend/renderer/overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md`

## Linux Screenshot Guard

`local_runtime_window_visibility.cjs:withHiddenWindowForScreenshot(...)`:

- calls the local-runtime screenshot task directly without a platform visibility runtime
- it does not perform a second hide/restore cycle around the local-runtime screenshot task
- result: dashboard-visible computer-use turns perform an explicit main-process dashboard-to-pill handoff before any computer-use local execution runs; after handoff, main hides the dashboard and restores the pill/response-overlay surface, while renderer capture orchestration remains scoped to renderer-initiated attachment flows

For deeper focus/capture guard internals:

- `docs/frontend/main/overlays/external_focus_snapshot_restore_and_query_capture_reference.md`
- `docs/frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md`
