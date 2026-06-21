---
summary: "Deep reference for local-runtime screenshot execution visibility: direct task behavior, main-process computer-use surface prep, and renderer attachment capture boundaries."
read_when:
  - When changing `local_runtime_window_visibility.cjs`.
  - When debugging whether screenshot overlay hide/show is owned by Electron main process, SDK/main tool execution, or renderer attachment capture.
title: "Linux Screenshot Window Visibility Reference"
---

# Linux Screenshot Window Visibility Reference

## Canonical Modules

- `frontend/src/main/sidecar/local_runtime_window_visibility.cjs`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/sidecar/local_runtime_execute_tool_runtime.cjs`
- `frontend/src/main/surfaces/main_window_runtime.cjs`

## Runtime Scope and Entry

Guard helper:

- `createLocalRuntimeWindowVisibilityRuntime(...).withHiddenWindowForScreenshot({ resolveWindows, resolveChatWindow, resolveResponseWindow, task })`

Used in local-runtime bridge:

- wrapped around `execute-tool` only for screenshot tool requests

## Current Behavior (All Platforms)

`visibilityRuntime.withHiddenWindowForScreenshot(...)` currently calls `task()` directly.

Implication:

- no Electron-main window hide/restore is performed by this seam today
- SDK/main computer-use execution prepares the desktop surface before invoking
  the local runtime; dashboard-visible turns are handed to the minimal pill by Electron
  main before local execution starts
- renderer code does not own screenshot hide/restore

## Resolver Argument Compatibility

`visibilityRuntime.withHiddenWindowForScreenshot(...)` still accepts resolver arguments:

- `resolveWindows`
- `resolveChatWindow`
- `resolveResponseWindow`
- `task`

Current behavior ignores resolver arguments.

## Error and Cancellation Semantics

`task` errors propagate to caller unchanged.

This means:

- screenshot tool failures keep request timeout/error behavior unchanged
- request timeout/error logic in `local_runtime_bridge.cjs` stays unchanged

## Drift Hotspots

1. Reintroducing seam-level hide/restore behavior without coordinating
   SDK/main surface prep and renderer attachment capture docs can create
   double-hide races.
2. Assuming Linux-only behavior in callers is incorrect; this seam is called for screenshot tool requests on every platform.

## Debug Checklist

If Linux screenshots contain overlay UI:

1. verify screenshot execute-tool path still routes through `visibilityRuntime.withHiddenWindowForScreenshot(...)`
2. verify SDK/main computer-use surface prep ran before local execution
3. verify no legacy renderer or seam-level hide/restore assumptions remain in debugging scripts
