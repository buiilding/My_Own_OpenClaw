---
summary: "Deep reference for main-process display-affinity resolution: monitor/work-area normalization, active query display tracking, screenshot display-bounds payload shaping, and target-display window placement contracts."
read_when:
  - When changing display selection logic in `display_affinity_runtime.cjs`.
  - When debugging screenshot monitor routing drift between query-origin context and hidden-window tool execution.
  - When changing display-targeted `show-main-window` placement behavior.
title: "Display-Affinity Monitor Selection and Screenshot Bounds Reference"
---

# Display-Affinity Monitor Selection and Screenshot Bounds Reference

## Canonical Modules

- `frontend/src/main/surfaces/display_affinity_runtime.cjs`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/sidecar/local_runtime_display_bounds.cjs`
- `frontend/src/main/sidecar/local_runtime_tool_args.cjs`
- `frontend/src/main/surfaces/window_visibility_runtime.cjs`
- `tests/frontend/DisplayAffinityRuntime.test.cjs`
- `tests/frontend/LocalRuntimeDisplayBounds.test.cjs`
- `tests/frontend/LocalRuntimeBridge.rpc.test.cjs`

## Display-Affinity Shape

Normalized affinity object:

- `monitor_id: string | null`
- `bounds: { x, y, width, height }`
- `workArea: { x, y, width, height }`
- `desktopVirtualBounds: { x, y, width, height } | null`

Screenshot payload shape (`toScreenshotDisplayBounds(...)`):

- `x`, `y`, `width`, `height`
- `monitor_id`
- optional `desktop_virtual_bounds`

## Core Resolution Functions

`normalizeBounds(...)`:

- accepts finite numeric bounds
- rounds numeric values
- rejects non-positive `width`/`height`

`resolveDesktopVirtualBounds(screen)`:

- computes union rectangle across all display bounds
- returns `null` when displays are unavailable/invalid

`createDisplayAffinity(display, { desktopVirtualBounds })`:

- normalizes `display.bounds` and `display.workArea` (`workArea` falls back to `bounds`)
- normalizes `display.id` to string `monitor_id`

`resolveDisplayAffinityForBounds(screen, bounds)`:

- uses `screen.getDisplayMatching(bounds)` when available
- falls back to primary display when matching is unavailable/fails

`resolveDisplayAffinityForWindow(screen, targetWindow, { requireVisible })`:

- returns primary display affinity when target window is missing/destroyed/no bounds accessor
- returns `null` when `requireVisible=true` and window is hidden

`resolveDisplayAffinityForWebContents({ BrowserWindow, screen, webContents, requireVisible })`:

- resolves owner window from sender webContents
- applies window-level rules above

`resolveVisibleSurfaceDisplayAffinity({ screen, chatWindow, mainWindow })`:

- checks visible chat window first (`requireVisible=true`)
- checks visible main window second (`requireVisible=true`)
- returns `null` when neither visible surface resolves to a display affinity

`syncVisibleSurfaceDisplayAffinity({ screen, chatWindow, mainWindow, syncActiveDisplayAffinityForWindow })`:

- syncs stored active display affinity from visible chat window first
- falls back to visible main window second
- returns synced affinity (or `null` when no visible surface qualifies)
- keeps precedence consistent with active-surface routing (chat surface preferred over dashboard)

`resolveActiveSurfaceDisplayAffinityForWindows({ BrowserWindow, screen, webContents, getWindows, getActiveDisplayAffinity })`:

- reads `{ chatWindow, mainWindow }` from `getWindows()`
- delegates to `resolveActiveSurfaceDisplayAffinity(...)` with the same sender/visible/stored precedence
- used by IPC/local-runtime callers to avoid duplicating chat/main window resolution logic

## Active Query Display-Affinity Lifecycle

Main process stores active query-origin display affinity via:

- `setActiveDisplayAffinity(...)` in `ipc.cjs` query-send path

Reset conditions:

- backend/session reset in `ipc.cjs` intentionally does **not** clear active display affinity
- active affinity persists across websocket/session resets and is replaced by the next explicit `setActiveDisplayAffinity(...)` update (query send or window-surface sync paths)
- non-VM display-metrics listener now calls `syncVisibleSurfaceDisplayAffinity(...)` before overlay repositioning so monitor affinity follows whichever desktop app surface is currently visible after display layout changes

Stored state access:

- `getActiveDisplayAffinity()` returns defensive clones

## Screenshot Monitor Routing Contract

`execute-tool` screenshot calls in `local_runtime_bridge.cjs` resolve display bounds in strict order:

1. resolve through `resolveActiveSurfaceDisplayAffinityForWindows(...)`
2. inside that resolver: visible sender surface affinity when sender is chat/main and visible
3. fallback to visible chat/main surface affinity
4. fallback to active query-origin display affinity (`getActiveDisplayAffinity()`)
5. no display bounds when none exist

Resolved affinity is transformed with `toScreenshotDisplayBounds(...)` and provided to
`resolveToolArgs(..., { displayBounds })`, which injects default `display_bounds` only when
caller args do not already contain valid explicit bounds.

## Display-Targeted Main-Window Placement

`showMainWindow({ targetDisplayAffinity, maximize })` in `window_visibility_runtime.cjs`:

- without `maximize`, centers current window size inside target display `workArea`
- with `maximize`, fits window bounds to target display `workArea` for display-targeted placement rather than invoking native fullscreen/maximize during the reposition step
- if currently maximized, unmaximizes before display-targeted placement
- on macOS, if currently fullscreen, exits native fullscreen before display-targeted placement
- when hidden and `targetDisplayAffinity` is omitted, falls back to stored active display affinity to keep open-target monitor continuity

When no target affinity is provided:

- legacy behavior remains (`restore` + native maximize when requested on Windows/Linux, native fullscreen when requested on macOS)

`showChatWindow({ ... })` in `window_visibility_runtime.cjs`:

- when hidden and no explicit display target is supplied, falls back to stored active display affinity
- applies that affinity before show by updating active affinity and repositioning chat overlay

## Drift Hotspots

1. Losing `requireVisible:true` on screenshot sender-affinity lookup can route captures to hidden/off-screen windows.
2. Clearing active affinity on backend/session reset can collapse reconnect-time screenshot/main-window routing to primary-display fallback before a new sender-affinity write occurs.
3. Overwriting explicit renderer screenshot `display_bounds` with fallback affinity breaks user-selected monitor capture.
4. Regressing cloned affinity storage can allow downstream mutation to corrupt future routing.
5. Diverging helper precedence between resolve and sync paths (chat first, then main) can cause monitor churn after display-metrics changes.

## Related Pages

- [Main Process Lifecycle, Overlay IPC, and Window Visibility Runtime Reference](main_process_lifecycle_overlay_ipc_and_window_visibility_runtime_reference.md)
- [Local-Runtime RPC Handler Registry and Payload-Mapper Reference](local_backend/rpc_handler_registry_and_payload_mapper_reference.md)
- [Screenshot Display-Bounds Fallback and Attachment Materialization Reference](local_backend/screenshot_display_bounds_fallback_and_attachment_materialization_reference.md)
