---
summary: "Electron main local-backend process lifecycle reference: sidecar launch-target resolution (binary-first packaged paths), readiness probe loop, request correlation/timeouts, and failure recovery behavior."
read_when:
  - When changing local backend process startup, readiness checks, or request timeout behavior.
  - When debugging sidecar startup failures, unknown-response warnings, or stuck pending JSON-RPC requests.
title: "Local Backend Process Lifecycle Reference"
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

Current preferred runtime:

- Electron main computes desktop launch options and passes them to
  `WindieClient` as SDK `autoSidecar` options.
- The SDK starts/reuses `sidecar_daemon.py`, owns `SidecarDaemonHttpClient`, and
  unwraps daemon JSON-RPC `/rpc` responses before callers see them.
- The daemon owns the single `LocalBackend` / `LocalMemoryStore` instance for the
  app session.
- Electron bridge code keeps host-only behavior: BrowserWindow handling,
  screenshot hiding, display bounds, artifact upload headers, and direct helper
  IPC channels.
- `local_backend.py` remains the legacy stdin/stdout fallback path only when the
  SDK daemon provider is unavailable or disabled in tests.

Do not start `local_backend.py` and `sidecar_daemon.py` as independent memory owners in the same app session. Both initialize `LocalMemoryStore` against the same SQLite/FAISS files, which can produce duplicate embedding backfill, SQLite write locks, and FAISS mapping drift.

Entrypoint:

- `initializeLocalBackendBridge(getWindows)`

SDK daemon startup sequence:

1. resolve main/chat/response window resolvers
2. create SDK `autoSidecar` launch options from desktop paths/env/auth state
3. register IPC handlers that lazily call the SDK local runtime provider for
   daemon-backed local JSON-RPC methods
4. normal agent startup calls `WindieClient.wakeUp()`, which starts or reuses the
   daemon through the SDK provider

Legacy `startLocalBackend(...)` behavior:

`startLocalBackend(...)` is used only when no SDK daemon provider is active.

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

## Readiness

SDK daemon readiness:

- `WindieClient.wakeUp()` or a direct Electron helper call resolves the SDK local
  runtime provider.
- A resolved provider means the daemon discovery file matched the expected launch
  context and `/status` succeeded.
- Electron emits `local-backend-status { ready: true }` only after the SDK
  runtime provider has returned a usable runtime for bridge-owned helper calls.

Legacy stdin/stdout readiness:

After legacy `local_backend.py` spawn, bridge runs `checkReadiness(...)`.

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

SDK daemon request send path (`sendRequest`):

1. create UUID request ID
2. call the SDK local runtime provider
3. call SDK runtime `rpc(...)`
4. SDK posts to daemon `POST /rpc`, where the daemon dispatches through
   `LocalBackend.protocol.handle_request(...)`
5. SDK converts JSON-RPC `error` to an exception and returns JSON-RPC `result` to
   IPC callers

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
