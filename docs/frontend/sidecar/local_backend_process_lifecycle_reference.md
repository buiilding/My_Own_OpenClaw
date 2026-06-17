---
summary: "SDK-owned sidecar daemon lifecycle reference for desktop launch options, readiness status, helper RPC routing, and failure behavior."
read_when:
  - When changing desktop sidecar daemon startup, readiness status, or helper RPC routing.
  - When debugging sidecar startup failures, local-backend-status drift, or Electron helper calls that cannot reach the sidecar daemon.
title: "SDK-Owned Sidecar Lifecycle Reference"
---

# Local Backend Process Lifecycle Reference

## Canonical Modules

- `frontend/src/main/sidecar/local_backend_bridge.cjs`
- `frontend/src/main/sidecar/sdk_sidecar_launch_options.cjs`
- `frontend/src/main/sidecar/local_backend_bridge_window_visibility.cjs`
- `frontend/src/main/sidecar/local_backend_bridge_utils.cjs`
- `frontend/src/main/app/runtime_paths.cjs`
- `packages/windie-sdk-js/src/runtime/LocalSidecarRuntime.ts`

## Process Startup Path

- Electron main computes desktop launch options and passes them to
  `AgentClient` as SDK `autoSidecar` options.
- The SDK starts/reuses `sidecar_daemon.py`, owns `AgentLocalRuntimeHttpClient`
  with `SidecarDaemonHttpClient` as a compatibility alias, and unwraps daemon
  JSON-RPC `/rpc` responses before callers see them.
- The daemon owns the single `LocalBackend` / `LocalMemoryStore` instance for the
  app session.
- Electron bridge code keeps host-only behavior: BrowserWindow handling,
  screenshot hiding, display bounds, artifact upload headers, and direct helper
  IPC channels.
- Electron no longer starts `local_backend.py` as a standalone stdin/stdout
  fallback. `local_backend.py` remains the internal `LocalBackend` implementation
  used by `sidecar_daemon.py`.

Entrypoint:

- `initializeLocalRuntimeBridge(getWindows)`

SDK daemon startup sequence:

1. resolve main/chat/response window resolvers
2. create SDK `autoSidecar` launch options from desktop paths/env/auth state
3. register IPC handlers that lazily call the SDK local runtime provider for
   daemon-backed local JSON-RPC methods
4. normal agent startup calls `AgentClient.wakeUp()`, which starts or reuses the
   daemon through the SDK provider

## Readiness

- `AgentClient.wakeUp()` or a direct Electron helper call resolves the SDK local
  runtime provider.
- A resolved provider means the daemon discovery file matched the expected launch
  context and `/status` succeeded.
- Electron emits `local-backend-status { ready: true }` only after the SDK
  runtime provider has returned a usable runtime for bridge-owned helper calls.
- If Electron cannot construct a valid SDK sidecar launch plan, it emits
  `local-backend-status { ready:false, error }` and helper RPC calls fail closed.

## Request Correlation and Timeout Model

SDK daemon request send path (`sendRequest`):

1. create UUID request ID
2. call the SDK local runtime provider
3. call SDK runtime `rpc(...)`
4. SDK posts to daemon `POST /rpc`, where the daemon dispatches through
   `LocalBackend.protocol.handle_request(...)`
5. SDK converts JSON-RPC `error` to an exception and returns JSON-RPC `result` to
   IPC callers

Per-request timeout overrides:

- browser tool execution uses 120s in the local tool execution runtime

## Failure and Reset Behavior

On SDK provider failure:

1. helper calls return `{ success:false, error }` when they use `sendRequestOrError`
2. direct helper callers receive the SDK provider exception through their normal
   error envelopes
3. status remains not ready until a future bridge initialization or SDK wake-up
   resolves the provider successfully

`stopLocalRuntime()` shutdown path:

- switches backend tool execution to a stopped executor
- calls `sdkLocalRuntime.shutdown()` when a runtime has been resolved
- clears the SDK runtime handle and local status snapshot

`initializeLocalBackendBridge(...)` and `stopLocalBackend()` remain
compatibility aliases for older bridge imports.

## Window Handling for Linux Screenshot Tool

For local tool execution where `toolName === 'screenshot'`:

- wraps call with `withHiddenWindowForScreenshot(...)`, which currently calls the sidecar task directly
- dashboard-to-pill handoff for SDK/main computer-use execution happens before
  sidecar execution in Electron main; renderer code does not own screenshot
  hide/restore

## IPC Handlers Registered by Bridge

Core handlers:

- `capture-screenshot-attachment`
- `read-attachment-file`
- `run-browser-action`
- `get-system-state`

Additional mapped handlers are registered through compiled mapper definitions (`registerMappedRpcHandlers`).

## Debug Checklist

If sidecar shows ready=false indefinitely:

1. verify `sdk_sidecar_launch_options.cjs` can build a valid daemon launch plan
2. inspect SDK auto-sidecar discovery context and daemon `/status` failures
3. inspect daemon stderr lines forwarded through `autoSidecar.onStderrLine`

If helper calls fail unexpectedly:

1. verify `ensureSdkLocalRuntime()` resolved a runtime before the helper call
2. verify SDK `AgentLocalRuntimeHttpClient.rpc()` unwraps `/rpc` results
3. inspect the daemon `LocalBackend.protocol.handle_request(...)` method result

If Linux screenshots include overlays:

1. verify screenshot calls go through `capture-screenshot-attachment` or SDK/main local tool execution with tool name `screenshot`
2. verify SDK/main computer-use surface prep ran before sidecar execution
3. verify renderer hide/restore flow is not reintroduced for local-backend screenshots
4. verify no legacy seam-level hide/restore assumptions remain in local debugging instrumentation
