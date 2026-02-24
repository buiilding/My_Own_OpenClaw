---
summary: "Deep reference for Linux-only screenshot guard that hides main/chat/response windows around sidecar screenshot tool execution and restores visibility/focus/topmost state."
read_when:
  - When changing local-backend screenshot execution wrappers on Linux.
  - When debugging overlay artifacts in screenshots or post-capture focus/always-on-top regressions.
title: "Linux Screenshot Window Hide and Restore Guard Reference"
---

# Linux Screenshot Window Hide and Restore Guard Reference

## Canonical Modules

- `frontend/src/main/local_backend_bridge_windows.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/index.cjs`

## Guard Scope and Entry

Guard helper:

- `withHiddenWindowForScreenshot({ resolveWindows, resolveChatWindow, resolveResponseWindow, task })`

Used in local backend bridge:

- wrapped around `execute-tool` only for screenshot tool requests on Linux

Platform gate:

- if platform is not Linux, wrapper runs `task()` directly

## Hide Phase

Before task execution:

1. resolve live windows from `resolveWindows()`
2. snapshot each window state:
   - visibility
   - focus
   - minimized
3. hide windows that were visible and not minimized
4. wait `320ms` before running screenshot task

Reason:

- compositor latency + overlay transparency can leak stale frame contents into captures

## Restore Phase (`finally`)

After task completion/failure:

1. restore each previously visible, non-minimized window
2. overlay windows (`chatWindow`/`responseWindow`) prefer `showInactive()` when available
3. non-overlay windows call `show()`
4. chat overlay gets `blur()` when it was not focused pre-hide
5. overlays reassert topmost flags:
   - `setAlwaysOnTop(true, "floating")`
   - optional `moveTop()`
6. re-focus previously focused window when still alive

All restore operations are best effort; overlay topmost failures log warnings.

## Resolver Contracts

`createWindowResolvers(getWindows)` supports:

- function returning `{ mainWindow, chatWindow, responseWindow }`
- object with those keys
- single BrowserWindow fallback

Output helpers:

- `resolveWindows()`
- `resolveChatWindow()`
- `resolveResponseWindow()`

Including response window in resolver input is required for correct overlay restore behavior.

## Error and Cancellation Semantics

`task` errors propagate to caller after restore sequence runs.

This means:

- screenshot tool failures still restore window stack
- request timeout/error logic in `local_backend_bridge.cjs` stays unchanged

## Drift Hotspots

1. skipping minimized-state checks and unminimizing windows unexpectedly
2. not restoring overlay topmost flags and causing overlays to appear behind other windows
3. removing settle delay and reintroducing self-capture artifacts
4. not preserving focused window and stealing focus after screenshot operations

## Debug Checklist

If Linux screenshots contain overlay UI:

1. verify screenshot execute-tool path is wrapped by guard
2. verify guard platform check sees `linux`
3. verify windows were hidden before task (log or temporary probes)

If overlays stop floating on top after screenshot:

1. inspect overlay restore branch (`setAlwaysOnTop` + `moveTop`)
2. verify resolver still returns chat/response windows
3. inspect warnings for topmost restore failures
