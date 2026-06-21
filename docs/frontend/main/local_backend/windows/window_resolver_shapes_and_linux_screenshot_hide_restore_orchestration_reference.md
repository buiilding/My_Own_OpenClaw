---
summary: "Deep reference for local-runtime bridge window-resolver input normalization and screenshot task wiring."
read_when:
  - When changing resolver input contracts in `local_runtime_window_visibility.cjs`.
  - When changing screenshot task routing in local-runtime execution wrappers.
title: "Window Resolver Shapes and Screenshot Task Routing Reference"
---

# Window Resolver Shapes and Screenshot Task Routing Reference

## Canonical Modules

- `frontend/src/main/sidecar/local_runtime_window_visibility.cjs`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`

## Resolver Input Normalization

`createLocalRuntimeWindowVisibilityRuntime({ getWindows })` is the public
facade for window resolver normalization and screenshot task routing. Its
internal resolver builder accepts multiple caller shapes:

1. function provider:
   - used directly (`getWindowState = getWindows`)
2. object provider:
   - if object has `mainWindow` or `chatWindow`, treated as full window-state object provider
   - otherwise treated as single `mainWindow` object with `chatWindow: null`
3. invalid/empty input:
   - falls back to empty object provider

Returned runtime methods:

- `resolveWindows()` -> `[mainWindow, chatWindow, responseWindow]` filtered truthy
- `resolveChatWindow()` -> `chatWindow | null`
- `resolveResponseWindow()` -> `responseWindow | null`
- `withHiddenWindowForScreenshot(...)` -> runs the scoped screenshot task

Design intent:

- keep call sites simple even when they can only provide one window handle

## Screenshot Task Boundary

`visibilityRuntime.withHiddenWindowForScreenshot(...)` runs only when:

- the local tool execution runtime targets the screenshot tool path

Wrapper behavior:

- calls `task()` directly

Current runtime implementation contract:

- local tool execution is pass-through here; dashboard-to-pill
  handoff happens earlier through Electron main's computer-use surface-prep hook,
  while renderer code does not own screenshot hide/restore

## Why Resolver Contracts Still Matter

The resolver methods remain part of the wrapper facade:

- keeps local-runtime screenshot call-sites stable across platform behavior changes

## Error Handling Semantics

- task errors are propagated to caller (not swallowed)
- no main-process restore stage exists in this seam
- timeout and JSON-RPC failure behavior remains owned by local-runtime bridge request logic

## Integration Boundary in Bridge

`local_runtime_execute_tool_runtime.cjs` screenshot path:

- wraps only `toolName === 'screenshot'` with `visibilityRuntime.withHiddenWindowForScreenshot(...)`
- all other tools bypass this screenshot seam

Implication:

- screenshot visibility behavior is intentional and scoped. This wrapper does not
  own dashboard-to-pill handoff; local computer-use surface prep happens in
  `local_runtime_execute_tool_runtime.cjs` before local execution.

## Drift Hotspots

1. changing resolver shape handling can silently drop `responseWindow` in callers that pass object snapshots.
2. reintroducing screenshot-wrapper hide/restore logic without coordinating main
   computer-use prep and renderer attachment capture ownership can create
   double-collapse races.
3. broadening wrapper to non-screenshot tools can produce unnecessary platform behavior coupling.

## Change Checklist

When touching window wrapper flow:

1. verify resolver output shape (`main/chat/response`) remains stable for callers
2. verify screenshot tool only path remains scoped in the local tool execution runtime
3. verify renderer capture orchestration assumptions stay out of the local-runtime screenshot wrapper
