---
summary: "Reference for SDK-owned desktop local-runtime readiness, helper RPC routing, local-runtime status snapshots, and Electron host-only helper shaping."
read_when:
  - When changing SDK local runtime provider usage in `frontend/src/main/sidecar/local_runtime_bridge.cjs`.
  - When debugging desktop local-runtime startup, `local-runtime-status`, helper RPC failures, or screenshot helper routing.
title: "SDK-Owned Local-Runtime Readiness and Helper RPC Reference"
---

# SDK-Owned Local-Runtime Readiness and Helper RPC Reference

## Canonical Modules

- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/ipc/ipc_electron_agent_client_factory.cjs`
- `frontend/src/main/sidecar/local_runtime_launch_options.cjs`
- `frontend/src/main/sidecar/local_runtime_execute_tool_runtime.cjs`
- `frontend/src/main/sidecar/local_runtime_timeout_policy.cjs`
- `frontend/src/main/sidecar/local_runtime_display_bounds.cjs`
- `frontend/src/main/sidecar/local_runtime_screenshot_attachment.cjs`
- `frontend/src/main/sidecar/local_runtime_supervisor.cjs`
- `frontend/src/main/app/runtime_paths.cjs`
- `frontend/src/main/app/backend_endpoints.cjs`
- `packages/windie-sdk-js/src/runtime/LocalRuntime.ts`
- `tests/frontend/LocalRuntimeBridge.lifecycle.test.cjs`
- `tests/frontend/LocalRuntimeBridge.rpc.test.cjs`

## Runtime Contract

Electron main does not spawn `local_backend.py` as a standalone process.
`ipc_electron_agent_client_factory.cjs` builds SDK `autoLocalRuntime` launch
options during desktop startup, then `AgentClient.wakeUp()` or a bridge helper
call resolves the SDK local runtime provider. The SDK starts or reuses
`sidecar_daemon.py`, owns `AgentLocalRuntimeHttpClient`, and unwraps daemon
`/rpc` JSON-RPC results.

Electron main owns only host-side behavior:

- desktop launch facts: command, args, cwd, env, auth path, permission path,
  discovery file, and launch context
- renderer-visible local-runtime status snapshots
- BrowserWindow visibility, screenshot display bounds, artifact upload headers,
  and screenshot attachment materialization
- narrow IPC handlers that map renderer/helper calls to SDK runtime `rpc` or
  `executeTool`

## Readiness

`ensureSdkLocalRuntime()` is the readiness boundary:

1. call the SDK local runtime provider with `{ wakeUp: {}, needsLocalRuntime: true }`
2. cache the returned runtime
3. subscribe to daemon events for conversation metadata invalidation
4. attach a synthetic SDK daemon process ref to `local_runtime_supervisor`
5. emit `local-runtime-status { ready:true, localRuntime }`

If launch option construction or provider resolution fails, the bridge keeps
status not-ready and helper calls return stable error envelopes where possible.

## Helper RPC Routing

`sendRequest(method, params, options)` calls SDK runtime `rpc(...)` only. There
is no stdin/stdout fallback transport.

Tool helpers call SDK runtime `executeTool(...)` when available. The bridge still
normalizes host-only arguments before execution:

- screenshot helpers inject active display bounds
- browser header controls add their fixed explanation
- screenshot results are materialized into backend artifacts when possible

## Shutdown

`stopLocalRuntime()` switches backend tool execution to a stopped executor,
calls `sdkLocalRuntime.shutdown()` when a runtime has been resolved, clears the
SDK runtime handle, and resets the local status snapshot to stopped.
The old `stopLocalBackend()` export has been removed.

## Validation

Run these focused checks after changing this path:

- `cd frontend && npm run test -- ../tests/frontend/LocalRuntimeBridge.lifecycle.test.cjs ../tests/frontend/LocalRuntimeBridge.rpc.test.cjs --runInBand`
- `cd frontend && npm run test -- ../tests/frontend/LocalRuntimeStatusBroadcaster.test.cjs ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs --runInBand`
- `<windie> docs list`
