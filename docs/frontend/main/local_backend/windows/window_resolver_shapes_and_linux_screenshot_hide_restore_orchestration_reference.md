---
summary: "Deep reference for local-backend bridge window resolver input-shape normalization and Linux-only screenshot hide/restore/focus restoration sequencing."
read_when:
  - When changing resolver input contracts (`getWindows` function/object/window instance) or overlay window detection logic.
  - When debugging screenshot captures that include overlays, miss focus restoration, or alter always-on-top behavior after restore.
title: "Window Resolver Shapes and Linux Screenshot Hide/Restore Orchestration Reference"
---

# Window Resolver Shapes and Linux Screenshot Hide/Restore Orchestration Reference

## Canonical Modules

- `frontend/src/main/local_backend_bridge_windows.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/index.cjs`

## Resolver Input Normalization

`createWindowResolvers(getWindows)` accepts multiple caller shapes:

1. function provider:
   - used directly (`getWindowState = getWindows`)
2. object provider:
   - if object has `mainWindow` or `chatWindow`, treated as full window-state object provider
   - otherwise treated as single `mainWindow` object with `chatWindow: null`
3. invalid/empty input:
   - falls back to empty object provider

Returned resolvers:

- `resolveWindows()` -> `[mainWindow, chatWindow, responseWindow]` filtered truthy
- `resolveChatWindow()` -> `chatWindow | null`
- `resolveResponseWindow()` -> `responseWindow | null`

Design intent:

- keep call sites simple even when they can only provide one window handle

## Linux Screenshot Wrapper Activation Boundary

`withHiddenWindowForScreenshot(...)` runs only when:

- `process.platform === 'linux'`

Non-Linux path:

- executes `task()` directly with no window mutations

Linux preconditions:

- windows list resolved from `resolveWindows()`
- destroyed windows filtered out before hide/restore logic
- if no candidate windows, executes `task()` directly

## Hide Phase Contract

For each tracked window:

- captures state snapshot:
  - `wasVisible`
  - `wasFocused`
  - `wasMinimized`
- hides window only when:
  - `wasVisible` and not `wasMinimized`

After hide pass:

- waits `320ms` before calling screenshot task
- goal: allow compositor/UI to settle before capture

## Restore Phase Contract

Restore runs in `finally` (always):

Per window restore condition:

- restore only if initially visible, not minimized, and still not destroyed

Overlay identification:

- window equals resolved `chatWindow` or `responseWindow`

Restore behavior:

- overlay window:
  - prefer `showInactive()` when available
  - re-assert always-on-top (`setAlwaysOnTop(true, 'floating')`)
  - call `moveTop()` when available
- non-overlay window:
  - `show()`
  - if chat window was not previously focused, call `blur()` to avoid focus steal

Focus restoration:

- attempts to focus originally focused window (if still alive) after restore

## Error Handling Semantics

- screenshot task error is propagated to caller (not swallowed)
- restore still executes because of `finally`
- always-on-top reassert failures are logged with warning but do not fail overall flow

## Integration Boundary in Bridge

`local_backend_bridge.cjs` execute-tool handler:

- only wraps `toolName === 'screenshot'` with `withHiddenWindowForScreenshot(...)`
- all other tools bypass window hide/restore guard

Implication:

- overlay-safe screenshot capture is intentional/specific behavior, not a general tool wrapper

## Drift Hotspots

1. changing resolver shape handling can silently drop `responseWindow` in callers that pass object snapshots.
2. removing the 320ms settle delay can reintroduce overlays in captured screenshots.
3. skipping always-on-top reassert on overlay windows can leave overlays behind other apps after screenshot tasks.
4. altering focus restore order can steal focus from external apps unexpectedly.
5. broadening wrapper to non-screenshot tools can produce unnecessary Linux UI flicker.

## Change Checklist

When touching window wrapper flow:

1. verify Linux screenshot hides overlays before capture
2. verify overlay windows recover always-on-top and stacking order
3. verify previously focused window regains focus when still available
4. verify non-Linux behavior remains pass-through
5. verify screenshot tool only path remains scoped in execute-tool handler
