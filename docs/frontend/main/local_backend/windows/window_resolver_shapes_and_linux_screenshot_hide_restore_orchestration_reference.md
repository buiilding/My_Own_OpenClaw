summary: "Deep reference for local-backend bridge window-resolver input normalization and screenshot visibility runtime dispatch wiring."
read_when:
  - When changing resolver input contracts in `local_backend_bridge_window_visibility.cjs`.
  - When changing screenshot visibility runtime dispatch between platform modules and local-backend screenshot execution wrappers.
title: "Window Resolver Shapes and Screenshot Visibility Runtime Dispatch Reference"
---

# Window Resolver Shapes and Screenshot Visibility Runtime Dispatch Reference

## Canonical Modules

- `frontend/src/main/sidecar/local_backend_bridge_window_visibility.cjs`
- `frontend/src/main/platform/screenshot_window_visibility/index.cjs`
- `frontend/src/main/sidecar/local_backend_bridge.cjs`

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

## Screenshot Visibility Runtime Dispatch Boundary

`withHiddenWindowForScreenshot(...)` runs only when:

- the local tool execution runtime targets the screenshot tool path

Wrapper behavior:

- returns the shared pass-through runtime through `createScreenshotWindowVisibilityRuntime(...)`
- forwards resolver callbacks and `task` to that runtime

Current runtime implementation contract:

- the platform runtime executes `task()` directly
- local tool execution is pass-through here; dashboard-to-pill
  handoff happens earlier through Electron main's computer-use surface-prep hook,
  while renderer `SurfaceOrchestrator` remains scoped to renderer-initiated
  attachment capture flows

## Why Resolver Contracts Still Matter

Although the platform runtime is currently pass-through, resolver helpers remain part of the wrapper API:

- preserves compatibility for future runtime strategies
- keeps local-backend screenshot call-sites stable across platform behavior changes

## Error Handling Semantics

- task errors are propagated to caller (not swallowed)
- no main-process restore stage exists in current platform runtimes
- timeout and JSON-RPC failure behavior remains owned by local-backend bridge request logic

## Integration Boundary in Bridge

`local_backend_bridge_execute_tool_runtime.cjs` screenshot path:

- wraps only `toolName === 'screenshot'` with `withHiddenWindowForScreenshot(...)`
- all other tools bypass screenshot visibility runtime wrapper

Implication:

- screenshot visibility behavior is intentional and scoped. This wrapper does not
  own dashboard-to-pill handoff; local computer-use surface prep happens in
  `local_backend_bridge_execute_tool_runtime.cjs` before sidecar execution.

## Drift Hotspots

1. changing resolver shape handling can silently drop `responseWindow` in callers that pass object snapshots.
2. reintroducing screenshot-wrapper hide/restore logic without coordinating main
   computer-use prep and renderer attachment capture ownership can create
   double-collapse races.
3. broadening wrapper to non-screenshot tools can produce unnecessary platform behavior coupling.
4. changing platform runtime dispatch without updating docs can hide ownership drift during screenshot debugging.

## Change Checklist

When touching window wrapper flow:

1. verify resolver output shape (`main/chat/response`) remains stable for callers
2. verify screenshot tool only path remains scoped in the local tool execution runtime
3. verify platform runtime dispatch still matches `process.platform`
4. verify renderer capture orchestration assumptions stay aligned with Linux runtime comment/ownership
