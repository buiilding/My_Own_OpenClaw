---
summary: "SDK-owned local-runtime daemon lifecycle reference for desktop launch options, readiness status, helper RPC routing, and failure behavior."
read_when:
  - When changing desktop local-runtime daemon startup, readiness status, or helper RPC routing.
  - When debugging local-runtime daemon startup failures, local-runtime-status drift, or Electron helper calls that cannot reach the local-runtime Python daemon.
title: "SDK-Owned Local-Runtime Lifecycle Reference"
---

# SDK-Owned Local-Runtime Lifecycle Reference

## Canonical Modules

- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/sidecar/local_runtime_launch_options.cjs`
- `frontend/src/main/sidecar/local_runtime_window_visibility.cjs`
- `frontend/src/main/sidecar/local_runtime_utils.cjs`
- `frontend/src/main/app/runtime_paths.cjs`
- `packages/windie-sdk-js/src/runtime/LocalRuntime.ts`

## Process Startup Path

- Electron main computes desktop launch options and passes them to
  `AgentClient` as SDK `autoLocalRuntime` options.
- The SDK starts/reuses `sidecar_daemon.py`, owns `AgentLocalRuntimeHttpClient`
  and unwraps daemon JSON-RPC `/rpc` responses before callers see them.
- The daemon owns the single `LocalRuntimeService` / `LocalMemoryStore` instance for the
  app session.
- Electron bridge code keeps host-only behavior: BrowserWindow handling,
  screenshot hiding, display bounds, artifact upload headers, and direct helper
  IPC channels.
- Electron no longer starts `local_backend.py` as a standalone stdin/stdout
  fallback. `local_backend.py` remains the internal `LocalRuntimeService` implementation
  used by `sidecar_daemon.py`.

Entrypoint:

- `initializeLocalRuntimeBridge(getWindows)`

SDK daemon startup sequence:

1. resolve main/chat/response window resolvers
2. create SDK `autoLocalRuntime` launch options from desktop paths/env/auth state
3. register IPC handlers that lazily call the SDK local runtime provider for
   daemon-backed local JSON-RPC methods
4. normal agent startup calls `AgentClient.wakeUp()`, which starts or reuses the
   daemon through the SDK provider

## Readiness

- `AgentClient.wakeUp()` or a direct Electron helper call resolves the SDK local
  runtime provider.
- A resolved provider means the daemon discovery file matched the expected launch
  context and `/status` succeeded.
- Electron emits `local-runtime-status { ready: true }` only after the SDK
  runtime provider has returned a usable runtime for bridge-owned helper calls.
- If Electron cannot construct a valid SDK local-runtime launch plan, it emits
  `local-runtime-status { ready:false, error }` and helper RPC calls fail closed.

## Request Correlation and Timeout Model

SDK daemon request send path (`sendRequest`):

1. create UUID request ID
2. call the SDK local runtime provider
3. call SDK runtime `rpc(...)`
4. SDK posts to daemon `POST /rpc`, where the daemon dispatches through
   `LocalRuntimeService.protocol.handle_request(...)`
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

The old `initializeLocalRuntimeBridge(...)`, `stopLocalBackend()`, and
`getLocalBackendStatus()` bridge exports have been removed. Main-process code
imports the canonical local-runtime names directly.

## Window Handling for Linux Screenshot Tool

For local tool execution where `toolName === 'screenshot'`:

- wraps call with `withHiddenWindowForScreenshot(...)`, which currently calls the local-runtime screenshot task directly
- dashboard-to-pill handoff for SDK/main computer-use execution happens before
  local execution in Electron main; renderer code does not own screenshot
  hide/restore

## IPC Handlers Registered by Bridge

Core handlers:

- `capture-screenshot-attachment`
- `read-attachment-file`
- `run-browser-action`
- `get-system-state`

Direct chat/memory mapped handlers are no longer registered in Electron main;
those capabilities use SDK-shaped commands and SDK local-runtime store calls.

## Debug Checklist

If local runtime shows ready=false indefinitely:

1. verify `local_runtime_launch_options.cjs` can build a valid daemon launch plan
2. inspect SDK auto-local-runtime discovery context and daemon `/status` failures
3. inspect daemon stderr lines forwarded through `autoLocalRuntime.onStderrLine`

If helper calls fail unexpectedly:

1. verify `ensureSdkLocalRuntime()` resolved a runtime before the helper call
2. verify SDK `AgentLocalRuntimeHttpClient.rpc()` unwraps `/rpc` results
3. inspect the daemon `LocalRuntimeService.protocol.handle_request(...)` method result

If Linux screenshots include overlays:

1. verify screenshot calls go through `capture-screenshot-attachment` or SDK/main local tool execution with tool name `screenshot`
2. verify SDK/main computer-use surface prep ran before local execution
3. verify renderer hide/restore flow is not reintroduced for local-runtime screenshots
4. verify no legacy seam-level hide/restore assumptions remain in local debugging instrumentation
