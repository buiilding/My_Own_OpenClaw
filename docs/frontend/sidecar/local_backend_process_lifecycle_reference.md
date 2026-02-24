---
summary: "Electron main local-backend process lifecycle reference: Python spawn/runtime env, readiness probe loop, request correlation/timeouts, stderr filtering, and failure recovery behavior."
read_when:
  - When changing local backend process startup, readiness checks, or request timeout behavior.
  - When debugging sidecar startup failures, unknown-response warnings, or stuck pending JSON-RPC requests.
title: "Local Backend Process Lifecycle Reference"
---

# Local Backend Process Lifecycle Reference

## Canonical Modules

- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_windows.cjs`
- `frontend/src/main/local_backend_bridge_utils.cjs`
- `frontend/src/main/runtime_paths.cjs`
- `frontend/src/main/backend_endpoints.cjs`

## Process Startup Path

Entrypoint:

- `initializeLocalBackendBridge(getWindows)`

Startup sequence:

1. resolve main/chat/response window resolvers
2. call `startLocalBackend(mainWindow)`
3. register IPC handlers that proxy to sidecar JSON-RPC methods

`startLocalBackend(...)` behavior:

1. resolve Python executable path (`resolvePythonExecutablePath`)
2. resolve script path (`resolvePythonScriptPath('local_backend.py')`)
3. verify script exists
4. spawn child process with:
- `cwd` = script directory
- `PYTHONUNBUFFERED=1`
- `WINDIE_BACKEND_HTTP_URL` from `resolveBackendEndpoints().httpUrl`
- `NODE_OPTIONS` amended with `--no-deprecation`

If executable missing (`ENOENT`):

- emits user-facing local-backend-status error with Python missing guidance

## Readiness Probe Loop

After spawn, bridge runs `checkReadiness(...)`.

Probe contract:

- sends JSON-RPC `ping` requests with special IDs (`__readiness_check_<n>__`)
- retries with exponential backoff (`50ms` base, capped at `1000ms`)
- each attempt has 500ms response wait timeout

Concurrency/race guard:

- `readinessCheckToken` invalidates stale callbacks/retry timers when process state resets

Ready-state behavior:

- successful ping -> `isPythonReady=true`, emits `local-backend-status { ready: true }`
- max-retry failure/timeout path still marks ready with warning to avoid deadlock

## Stdout/Stderr Processing

Stdout handling:

- line-buffered JSON parsing (`stdoutBuffer`)
- each line parsed as one JSON-RPC response object
- parse failures logged with raw line context

Stderr handling:

- line-based logging
- suppresses known noisy deprecation patterns via `shouldSuppressStderrLine(...)`

## Request Correlation and Timeout Model

Request send path (`sendRequest`):

1. require process exists and `isPythonReady=true`
2. create UUID request ID
3. store resolver/rejector + timeout handle in `pendingRequests`
4. write JSON line to sidecar stdin

Default timeout:

- 30s unless overridden

Per-request timeout overrides:

- browser tool execution uses 120s (`execute-tool` branch)

Response dispatch (`handlePythonResponse`):

- readiness probe responses routed to readiness callback
- normal responses matched by `id` in `pendingRequests`
- unknown IDs log warning (possible late/stale response)

## Failure and Reset Behavior

On process `exit` or `error`:

1. `resetBackendProcessState(reason)`
2. clear ready flag and callback state
3. reject all pending requests with shared reason
4. clear stdout buffer
5. emit `local-backend-status { ready:false, error? }` when applicable

`stopLocalBackend()` shutdown path:

- send `SIGTERM`
- escalate to `SIGKILL` after 5s if process remains alive

## Window Handling for Linux Screenshot Tool

For `execute-tool` where `toolName === 'screenshot'`:

- on Linux only, runs inside `withHiddenWindowForScreenshot(...)`

Behavior:

1. hide visible non-minimized windows
2. wait 320ms before capture
3. run screenshot RPC
4. restore window visibility/focus and overlay always-on-top state

Purpose:

- avoid capturing WindieOS overlay windows in screenshots

## IPC Handlers Registered by Bridge

Core handlers:

- `execute-tool`
- `get-system-state`
- `search-memory`

Additional mapped handlers are registered through compiled mapper definitions (`registerMappedRpcHandlers`).

## Debug Checklist

If sidecar shows ready=false indefinitely:

1. verify `local_backend.py` resolved path exists
2. inspect ping probe logs for repeated timeout/retry
3. inspect stderr output for Python startup/import failures

If requests time out unexpectedly:

1. verify `isPythonReady` true before request send
2. check `pendingRequests` cleanup and timeout override paths
3. inspect unknown response ID warnings for out-of-order/late replies

If Linux screenshots include overlays:

1. verify screenshot calls go through `execute-tool` with tool name `screenshot`
2. verify window resolver returns chat/response windows
3. inspect restoration logic for overlay `alwaysOnTop` reapplication
