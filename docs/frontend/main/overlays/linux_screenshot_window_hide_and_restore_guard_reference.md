---
summary: "Deep reference for screenshot visibility runtime dispatch used by local-backend screenshot execution: current platform pass-through behavior and renderer-owned Linux hide/restore ownership."
read_when:
  - When changing `local_backend_bridge_window_visibility.cjs` or platform `screenshot_window_visibility/*` modules.
  - When debugging whether screenshot overlay hide/show is owned by Electron main process or renderer orchestration.
title: "Linux Screenshot Window Visibility Runtime Dispatch Reference"
---

# Linux Screenshot Window Visibility Runtime Dispatch Reference

## Canonical Modules

- `frontend/src/main/local_backend_bridge_window_visibility.cjs`
- `frontend/src/main/platform/screenshot_window_visibility/index.cjs`
- `frontend/src/main/platform/screenshot_window_visibility/linux.cjs`
- `frontend/src/main/platform/screenshot_window_visibility/windows.cjs`
- `frontend/src/main/platform/screenshot_window_visibility/macos.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/renderer/infrastructure/services/SurfaceOrchestrator.ts`

## Runtime Scope and Entry

Guard helper:

- `withHiddenWindowForScreenshot({ resolveWindows, resolveChatWindow, resolveResponseWindow, task })`

Used in local backend bridge:

- wrapped around `execute-tool` only for screenshot tool requests

Platform dispatch:

- `createScreenshotWindowVisibilityRuntime(platform)` selects:
  - `windows.cjs` for `win32`
  - `macos.cjs` for `darwin`
  - `linux.cjs` otherwise

## Current Behavior (All Platforms)

Current platform runtime modules are pass-through wrappers:

- `windows.cjs` -> `return task()`
- `macos.cjs` -> `return task()`
- `linux.cjs` -> `return task()` and explicitly documents renderer ownership for hide/show lifecycle

Implication:

- no Electron-main window hide/restore is performed by this wrapper today
- screenshot window visibility control on Linux is owned by renderer `SurfaceOrchestrator` capture flow

## Resolver Argument Compatibility

`withHiddenWindowForScreenshot(...)` still accepts resolver arguments:

- `resolveWindows`
- `resolveChatWindow`
- `resolveResponseWindow`
- `task`

Current platform runtimes ignore resolver arguments, but they remain part of the function contract for compatibility and future runtime strategy changes.

## Error and Cancellation Semantics

`task` errors propagate to caller unchanged.

This means:

- screenshot tool failures keep request timeout/error behavior unchanged
- request timeout/error logic in `local_backend_bridge.cjs` stays unchanged

## Drift Hotspots

1. Reintroducing main-process hide/restore behavior without updating renderer `SurfaceOrchestrator` ownership docs can create double-hide races.
2. Changing platform runtime modules to use resolver arguments without updating wrapper call contracts can break screenshot execution paths.
3. Assuming Linux-only behavior in callers is incorrect; wrapper is called for screenshot tool requests and runtime selection handles platform semantics.

## Debug Checklist

If Linux screenshots contain overlay UI:

1. verify screenshot execute-tool path still wraps task via `withHiddenWindowForScreenshot(...)`
2. verify renderer `SurfaceOrchestrator` capture prep/hide logic ran as expected
3. verify no legacy Electron-main hide/restore assumptions remain in debugging scripts
