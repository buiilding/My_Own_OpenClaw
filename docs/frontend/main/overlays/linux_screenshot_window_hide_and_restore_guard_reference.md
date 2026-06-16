---
summary: "Deep reference for screenshot visibility runtime dispatch used by local-backend screenshot execution: current platform pass-through behavior, main-process computer-use surface prep, and renderer attachment capture boundaries."
read_when:
  - When changing `local_backend_bridge_window_visibility.cjs` or the platform screenshot visibility runtime.
  - When debugging whether screenshot overlay hide/show is owned by Electron main process, SDK/main tool execution, or renderer attachment capture.
title: "Linux Screenshot Window Visibility Runtime Dispatch Reference"
---

# Linux Screenshot Window Visibility Runtime Dispatch Reference

## Canonical Modules

- `frontend/src/main/sidecar/local_backend_bridge_window_visibility.cjs`
- `frontend/src/main/platform/screenshot_window_visibility/index.cjs`
- `frontend/src/main/sidecar/local_backend_bridge.cjs`
- `frontend/src/main/sidecar/local_backend_bridge_execute_tool_runtime.cjs`
- `frontend/src/main/surfaces/main_window_runtime.cjs`

## Runtime Scope and Entry

Guard helper:

- `withHiddenWindowForScreenshot({ resolveWindows, resolveChatWindow, resolveResponseWindow, task })`

Used in local backend bridge:

- wrapped around `execute-tool` only for screenshot tool requests

Platform wrapper:

- `createScreenshotWindowVisibilityRuntime(platform)` returns the shared
  pass-through runtime.

## Current Behavior (All Platforms)

Current platform runtime is a pass-through wrapper:

- `index.cjs` -> `return task()`

Implication:

- no Electron-main window hide/restore is performed by this wrapper today
- SDK/main computer-use execution prepares the desktop surface before invoking the
  sidecar; dashboard-visible turns are handed to the minimal pill by Electron
  main before local execution starts
- renderer code does not own screenshot hide/restore

## Resolver Argument Compatibility

`withHiddenWindowForScreenshot(...)` still accepts resolver arguments:

- `resolveWindows`
- `resolveChatWindow`
- `resolveResponseWindow`
- `task`

Current runtime ignores resolver arguments, but they remain part of the function contract for future runtime strategy changes.

## Error and Cancellation Semantics

`task` errors propagate to caller unchanged.

This means:

- screenshot tool failures keep request timeout/error behavior unchanged
- request timeout/error logic in `local_backend_bridge.cjs` stays unchanged

## Drift Hotspots

1. Reintroducing wrapper-level hide/restore behavior without coordinating
   SDK/main surface prep and renderer attachment capture docs can create
   double-hide races.
2. Changing the platform runtime to use resolver arguments without updating wrapper call contracts can break screenshot execution paths.
3. Assuming Linux-only behavior in callers is incorrect; wrapper is called for screenshot tool requests on every platform.

## Debug Checklist

If Linux screenshots contain overlay UI:

1. verify screenshot execute-tool path still wraps task via `withHiddenWindowForScreenshot(...)`
2. verify SDK/main computer-use surface prep ran before sidecar execution
3. verify no legacy renderer or wrapper-level hide/restore assumptions remain in debugging scripts
