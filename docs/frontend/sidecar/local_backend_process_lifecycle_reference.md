---
summary: "Electron main local-backend process lifecycle reference: sidecar launch-target resolution (binary-first packaged paths), readiness probe loop, request correlation/timeouts, and failure recovery behavior."
read_when:
  - When changing local backend process startup, readiness checks, or request timeout behavior.
  - When debugging sidecar startup failures, unknown-response warnings, or stuck pending JSON-RPC requests.
title: "Local Backend Process Lifecycle Reference"
---

# Local Backend Process Lifecycle Reference

## Canonical Modules

- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_window_visibility.cjs`
- `frontend/src/main/local_backend_bridge_utils.cjs`
- `frontend/src/main/runtime_paths.cjs`
- `frontend/src/main/backend_endpoints.cjs`

## Process Startup Path

Current preferred runtime:

- Electron main starts/reuses `sidecar_daemon.py` through `sidecar_daemon_manager.cjs`.
- The daemon owns the single `LocalBackend` / `LocalMemoryStore` instance for the app session.
- Electron local RPC calls are sent to daemon `POST /rpc`, which dispatches through the same `LocalBackend` JSON-RPC protocol.
- `local_backend.py` remains the legacy stdin/stdout fallback path when daemon mode is unavailable or disabled in tests.

Do not start `local_backend.py` and `sidecar_daemon.py` as independent memory owners in the same app session. Both initialize `LocalMemoryStore` against the same SQLite/FAISS files, which can produce duplicate embedding backfill, SQLite write locks, and FAISS mapping drift.

Entrypoint:

- `initializeLocalBackendBridge(getWindows)`

Daemon startup sequence:

1. resolve main/chat/response window resolvers
2. create/reuse `sidecarDaemonManager`
3. call `startDaemonBackedLocalBackend(mainWindow, launchOptions)`
4. register IPC handlers that proxy to daemon-backed local JSON-RPC methods

Legacy `startLocalBackend(...)` behavior:

`startLocalBackend(...)` is used only when no daemon manager is active.

1. resolve launch target (`resolveSidecarLaunchTarget('local_backend.py')`)
2. fail-close when launch target is python and command is missing:
- packaged: bundled runtime reinstall guidance
- dev: install Python / set `WINDIE_PYTHON_PATH` guidance
3. fail-close when launch target is python and script path is missing
4. spawn child process with:
- `cwd` = script directory
- `PYTHONUNBUFFERED=1`
- `WINDIE_BACKEND_HTTP_URL` from `resolveBackendEndpoints().httpUrl`
- `WINDIE_PACKAGED_APP` and `WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL`
- `NODE_OPTIONS` amended with `--no-deprecation`

If executable missing (`ENOENT`):

- binary launch path emits bundled sidecar executable reinstall guidance
- python launch path emits Python missing guidance

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

Daemon request send path (`sendRequest`):

1. create UUID request ID
2. call `sidecarDaemonManager.rpc(...)`
3. daemon posts the JSON-RPC envelope to `LocalBackend.protocol.handle_request(...)`
4. response `error` becomes a bridge error; response `result` is returned to IPC callers

Legacy process request send path (`sendRequest`):

1. require process exists and `isPythonReady=true`
2. create UUID request ID
3. store resolver/rejector + timeout handle in `pendingRequests`
4. write JSON line to sidecar stdin

Default timeout:

- 30s unless overridden

Per-request timeout overrides:

- browser tool execution uses 120s in the local tool execution runtime

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

For local tool execution where `toolName === 'screenshot'`:

- wraps call with `withHiddenWindowForScreenshot(...)`, which dispatches platform runtime behavior
- current runtime modules are pass-through on all platforms
- dashboard-to-pill handoff for SDK/main computer-use execution happens before
  sidecar execution in Electron main; renderer `SurfaceOrchestrator` remains
  scoped to renderer-initiated attachment capture flows

## IPC Handlers Registered by Bridge

Core handlers:

- `capture-screenshot-attachment`
- `read-attachment-file`
- `run-browser-action`
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

1. verify screenshot calls go through `capture-screenshot-attachment` or SDK/main local tool execution with tool name `screenshot`
2. verify SDK/main computer-use surface prep ran before sidecar execution
3. verify renderer capture prep/hide flow (`SurfaceOrchestrator`) only when the
   screenshot came from renderer-initiated attachment capture
4. verify no legacy wrapper-level hide/restore assumptions remain in local debugging instrumentation
