---
summary: "Deep reference for main-process runtime split: app lifecycle bootstrap, overlay IPC handler registration, and chat/main window visibility transitions delegated from `index.cjs`."
read_when:
  - When changing app startup/quit lifecycle wiring in `main_process_lifecycle_runtime.cjs`.
  - When changing split main-process IPC registration or show/hide/main-window behavior delegated through `overlay_phase_ipc_runtime.cjs`, `window_controls_ipc_runtime.cjs`, `permission_ipc_runtime.cjs`, and `window_visibility_runtime.cjs`.
title: "Main Process Lifecycle, Overlay IPC, and Window Visibility Runtime Reference"
---

# Main Process Lifecycle, Overlay IPC, and Window Visibility Runtime Reference

## Canonical Modules

- `frontend/src/main/index.cjs`
- `frontend/src/main/app/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`
- `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_visibility_runtime.cjs`
- `frontend/src/main/surfaces/main_window_runtime.cjs`

## Split Ownership Model

`index.cjs` keeps mutable window/runtime state and dependency wiring.

Delegated runtime modules:

- lifecycle orchestration: `main_process_lifecycle_runtime.cjs`
- phase-owned overlay shell IPC registration: `overlay_phase_ipc_runtime.cjs`
- main-window/display IPC registration: `window_controls_ipc_runtime.cjs`
- permission IPC registration: `permission_ipc_runtime.cjs`
- show/hide/main-window transition behavior: `window_visibility_runtime.cjs`

## Lifecycle Runtime (`main_process_lifecycle_runtime.cjs`)

`initializeMainProcessLifecycleRuntime(deps)` owns:

- single-instance lock acquisition and duplicate-process exit path (`requestSingleInstanceLock` / `quitApp`)
- second-instance focus throttling (`secondInstanceFocusCooldownMs`, default `1000ms`) before `showMainWindow(...)`
- `app.whenReady()` startup sequence:
  - `createWindow`
  - non-VM mode only:
    - `createChatWindow`
    - `createResponseWindow`
    - `createTray`
  - overlay renderer registration
- display-metrics listener for overlay repositioning (non-VM mode only)
  - listener syncs active display affinity from visible desktop app surfaces via `syncVisibleSurfaceDisplayAffinity(...)` (chat first, dashboard second) before `positionChatWindow()` / `positionResponseWindow()`
- global wakeword hotkey registration and toggle behavior (non-VM mode only)
- app activation behavior (`create*Window` path when all windows closed, else `showMainWindow`)
- app quit lifecycle:
  - `before-quit`: mark `app.isQuitting=true`, stop the SDK local runtime bridge, stop VM worker runtime
  - `will-quit`: unregister shortcuts
- `window-all-closed`: prevent app quit only in non-VM mode

## Split Main-Process IPC Registrars

`index.cjs` now wires three narrower registrars instead of one catch-all overlay IPC module:

- `initializeOverlayPhaseHandlersRuntime(deps)` in `overlay_phase_ipc_runtime.cjs`
- `initializeWindowControlHandlersRuntime(deps)` in `window_controls_ipc_runtime.cjs`
- `initializePermissionHandlersRuntime(deps)` in `permission_ipc_runtime.cjs`

### `overlay_phase_ipc_runtime.cjs`

Owns only phase-driven overlay shell channels:

- `set-chatbox-visual-anchor-height`
- `move-chatbox-to`
- `set-responsebox-size`
- `show-chatbox`
- `hide-chatbox`
- `prepare-surface-for-screenshot`

`prepare-surface-for-screenshot` semantics (`overlay_visibility_handler.cjs`):

- optional `waitMs` pre-delay before capture prep (default `0`)
- optional `settleMs` post-hide compositor settle delay (default `120`)
- optional `hideChatbox` flag (default `true`)
- returns timing diagnostics:
  - `waitTime`
  - `hideInvokeTime`
  - `settleTime`
- fail-closes when hide step fails (`hideResult.success === false`)
- `show-chatbox` target-display resolution routes through `resolveActiveSurfaceDisplayAffinityForWindows(...)` (sender + `getWindows()` wrapper) before delegating to window-visibility runtime

### `window_controls_ipc_runtime.cjs`

Owns dashboard/display window control channels:

- `show-main-window`
- `get-main-window-visibility`
- `show-main-window` target-display resolution routes through `resolveActiveSurfaceDisplayAffinityForWindows(...)` (sender + `getWindows()` wrapper) before delegating to window-visibility runtime
- `get-displays`
  - mapped payload shape is `{ id, label, isPrimary, bounds, scaleFactor }` with label format `Display N (WIDTHxHEIGHT)`
  - detailed mapper contract: [Display Query Handler Display Inventory Payload Contract Reference](display_query_handler_display_inventory_payload_contract_reference.md)
- `window-minimize`
- `window-toggle-maximize`
- `window-close`

### `permission_ipc_runtime.cjs`

Owns privilege/permission channels:

- `list-permissions`
- `check-permissions`
- `check-permission`
- `run-permission-probe`
- `request-permission`

Removed legacy invoke channels:

- `set-overlay-ignore-mouse`
- `set-overlay-focusable`
- `prepare-overlay-tool-focus`

Loop interactivity and query-capture focus prep are now internal main-process behavior, not renderer-callable IPC.

## Window Visibility Runtime (`window_visibility_runtime.cjs`)

### `showChatWindow(options, deps)`

Behavior:

- hide main window if visible
- display target resolution is centralized in `resolveShowTargetDisplayAffinity(...)`:
  - explicit `options.targetDisplayAffinity` wins
  - otherwise stored active display affinity is used only when the chat window is hidden
  - visible/destroyed/missing windows do not trigger fallback retargeting
- applies resolved display affinity (explicit or stored fallback) before show by updating active affinity + repositioning chat window
- show/focus chat window
- optionally restore response overlay if active stream/visible flag says so
- non-focusing restores (`focus=false`) do not auto-restore response overlay even when stream phase is active
- emit chatbox focus event
- sync wakeword toggle visibility

### `hideChatWindow(deps)`

Behavior:

- hide chat and response windows when visible
- broadcast response overlay visibility false
- sync wakeword toggle

### `showMainWindow(options, deps)`

Behavior:

- hide chat overlay when visible
- optional display-targeted placement is resolved through `resolveShowTargetDisplayAffinity(...)`:
  - explicit `options.targetDisplayAffinity` wins
  - fallback to stored active affinity is used only when main window is hidden
  - visible/destroyed/missing windows do not trigger fallback retargeting
- resolved display-targeted placement before show/focus:
  - centered in target display work area for normal open
  - fit to target display work area when `maximize=true`
  - if currently maximized, unmaximize before display-targeted placement
  - on macOS, if currently fullscreen, exit native fullscreen before display-targeted placement
- hidden-window no-target path therefore preserves monitor continuity without retargeting already-visible windows
- show main window
- optional maximize flow (`restore` + native maximize on Windows/Linux, native fullscreen on macOS)
- optional focus

## Drift Hotspots

1. Duplicating lifecycle listeners in `index.cjs` after split causes duplicate hotkey/listener registration.
2. Adding new main-process channels directly in `index.cjs` and skipping the split registrar modules breaks registration centralization.
3. Mutating window visibility behavior in one path (`window_visibility_runtime`) but not corresponding overlay handler call sites can desync UX.
4. Changing dependency names in `initialize*Runtime` calls without matching runtime module contracts breaks startup silently.
5. Losing VM-mode guards (`if (!vmMode)`) can accidentally create overlay windows/tray/hotkeys in hosted VM surfaces where dashboard-only behavior is expected.

## Related Pages

- [Frontend Main Docs Hub](README.md)
- [Display-Affinity Monitor Selection and Screenshot Bounds Reference](display_affinity_runtime_monitor_selection_and_screenshot_bounds_reference.md)
- [Window and Overlay Lifecycle](window_and_overlay_lifecycle.md)
- [Main Window Runtime Factory and Overlay Bootstrap Reference](main_window_runtime_factory_and_overlay_bootstrap_reference.md)
- [IPC Helper Module Split and Runtime Boundary Reference](ipc_helper_module_split_and_runtime_boundary_reference.md)
