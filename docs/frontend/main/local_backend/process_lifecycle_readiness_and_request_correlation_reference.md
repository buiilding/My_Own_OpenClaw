---
summary: "Deep reference for Electron main local-backend process startup/teardown, readiness retry token guards, pending-request timeout semantics, and subprocess env/path resolution."
read_when:
  - When changing `startLocalBackend`, `checkReadiness`, `sendRequest`, or `stopLocalBackend` behavior in `frontend/src/main/local_backend_bridge.cjs`.
  - When debugging sidecar startup failures, stale retry timers after restart, or in-flight request rejection after process exit/error.
title: "Local-Backend Process Lifecycle, Readiness, and Request-Correlation Reference"
---

# Local-Backend Process Lifecycle, Readiness, and Request-Correlation Reference

## Canonical Modules

- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_request_transport.cjs`
- `frontend/src/main/local_backend_bridge_execute_tool_runtime.cjs`
- `frontend/src/main/local_backend_bridge_timeout_policy.cjs`
- `frontend/src/main/local_backend_bridge_display_bounds.cjs`
- `frontend/src/main/local_backend_bridge_screenshot_attachment.cjs`
- `frontend/src/main/runtime_paths.cjs`
- `frontend/src/main/backend_endpoints.cjs`
- `frontend/src/main/local_backend_bridge_utils.cjs`
- `tests/frontend/LocalBackendBridge.lifecycle.test.cjs`
- `tests/frontend/LocalBackendBridge.rpc.test.cjs`
- `tests/frontend/LocalBackendBridgeDisplayBounds.test.cjs`

## Spawn Preconditions and Runtime Env Contract

`startLocalBackend(mainWindow)`:

1. no-op when a process already exists (`pythonProcess` truthy)
2. resolves launch target via `resolveSidecarLaunchTarget('local_backend.py')`
3. fail-fast when launch target is python and command is missing (`command=null`) and emits:
   - packaged: bundled-runtime reinstall guidance
   - dev: install Python / set `WINDIE_PYTHON_PATH` guidance
4. fail-fast when launch target is python and script path is missing and emits:
   - `local-backend-status { ready:false, error:"Local backend script not found: ..." }`
5. resolves backend URLs once via `resolveBackendEndpoints()`
6. spawns child process with:
   - `cwd = path.dirname(scriptPath)`
   - `stdio = ['pipe', 'pipe', 'pipe']`
   - env merge with `PYTHONUNBUFFERED=1`
   - env merge with `WINDIE_BACKEND_HTTP_URL=<resolved httpUrl>`
   - env merge with `WINDIE_PACKAGED_APP` and `WINDIE_ENABLE_BROWSER_FEATURE_PACK_AUTOINSTALL`
   - `NODE_OPTIONS` amended by `withLocalBackendNodeOptions(...)` (adds `--no-deprecation` exactly once)

`runtime_paths.cjs` launch preference order:

1. packaged sidecar binary under `resources/sidecar-bin` (when present)
2. python launch target with:
  - command from `resolvePythonExecutablePath()`
  - script from bundled `.pyc` (packaged) or source `.py` (dev)

`resolvePythonExecutablePath()` preference order:

1. `WINDIE_PYTHON_PATH` (must exist)
2. packaged bundled runtime candidates (`python-runtime`/`python`)
3. dev-only `CONDA_PREFIX` python
4. dev-only fallback launcher (`py` on Windows, `python3` elsewhere)

## Readiness Probe and Stale-Timer Isolation

`checkReadiness(mainWindow, attempt = 1, maxAttempts = 10)` sends JSON-RPC:

- method: `ping`
- id: `__readiness_check_<attempt>__`

Retry/backoff contract:

- delay: `min(50 * 2^(attempt - 1), 1000)` ms
- per-attempt wait timeout: `500ms`
- max attempts: `10`

Race guard contract:

- `readinessCheckToken` increments for every new check and on process reset
- scheduled retries/timeouts carry captured token and abort when token is stale

Fail-open startup contract:

- after max retry or max timeout, bridge still calls `markBackendReady(...)` with warning logs
- intent: avoid deadlock at app startup if sidecar ping path is unstable

Test-backed guarantees:

- stale readiness timeout from old process cannot clear new process callback
- stale retry timer from old process cannot issue retry pings against new generation

## Stdout/Stderr Protocol Handling

Stdout handling in `local_backend_bridge.cjs`:

- accumulates chunks in `stdoutBuffer`
- splits by newline and preserves trailing partial line
- parse strategy per complete line:
  - default: inline `JSON.parse`
  - large payloads (`>= 128KB`) may offload parse to worker thread (`parseJsonInWorker`)
- queue/drain runtime:
  - `pendingStdoutLines` stores deferred lines
  - `drainStdoutLines(...)` serially drains queued lines and forwards parsed responses
  - guarded by `isDrainingStdoutLines` and `isActiveProcessReference(...)` so stale process generations cannot drain new-process lines
- malformed JSON lines are logged and skipped (process stays alive)

Stderr handling:

- splits by newline and evaluates each non-empty line with `shouldForwardStderrLine(...)`
- suppressed path:
  - known Node deprecation noise patterns are dropped
- forwarded path:
  - always forward when `WINDIE_VERBOSE_SIDECAR_STDERR` is truthy
  - otherwise forward Python WARNING/ERROR/CRITICAL log-level lines
  - fallback keyword forwarding for warning/error/exception/traceback/fatal text
- forwarded lines log as `[LocalBackend Python] ...`

## Request Correlation and Timeout Semantics

`local_backend_bridge_request_transport.cjs` owns `sendRequest(method, params, options)` and pending request correlation:

1. hard-requires both `pythonProcess` and `isPythonReady`
2. creates UUID request id
3. stores `pendingRequests[requestId] = { resolve, reject, timeout }`
4. writes one JSON line to stdin
5. timeout defaults to `60000ms` unless `options.timeoutMs` provided

Timeout behavior:

- if pending entry still exists at timeout, entry is removed and promise rejects `"Request timed out"`

Response behavior in `handlePythonResponse(response)`:

- readiness IDs route through `readinessCheckCallback`
- known request IDs:
  - clear timeout
  - remove from pending map
  - reject on `response.error`
  - resolve `response.result` otherwise
- unknown IDs log warning only

`sendRequestOrError(...)` normalization:

- wraps `sendRequest` and converts thrown failures to `{ success:false, error:string }`

## Process Reset, Exit, and Shutdown Contract

`resetBackendProcessState(reason)`:

- nulls process handle and readiness callback
- increments token (invalidates stale readiness async work)
- rejects all pending requests with shared reason
- clears stdout buffer
- sets `isPythonReady = false`

Exit handler:

- always resets process state
- emits `local-backend-status { ready:false, error }` only for non-zero exit code

Error handler:

- resets process state
- maps `ENOENT` to explicit user-facing Python installation guidance
  - binary launch path: bundled sidecar executable reinstall guidance
  - python launch path: Python executable guidance
- emits `local-backend-status { ready:false, error }`

`stopLocalBackend()`:

- sends `SIGTERM`
- schedules `SIGKILL` at 5s only if same process handle is still active

Test-backed guarantee:

- delayed force-kill timer from an old process generation does not kill a restarted process

## Tool Timeout Tier and Screenshot Wrapper Hook

`local_backend_bridge_timeout_policy.cjs` owns execute-tool timeout tiers:

- `browser` tool: `120000ms`
- all others: `60000ms`

Screenshot path:

- only `toolName === 'screenshot'` is wrapped in `withHiddenWindowForScreenshot(...)`
- platform runtime decides whether hide/show behavior is active or pass-through
- see overlay deep pages for screenshot visibility runtime ownership details

## Debug Sequence

If startup fails:

1. verify script path candidates in `runtime_paths.cjs`
2. verify emitted `local-backend-status` error payload
3. verify spawned env contains `WINDIE_BACKEND_HTTP_URL`

If requests reject after sidecar reset:

1. inspect exit/error logs for reset reason
2. confirm response ID was pending before reset
3. inspect pending rejection payload surfaced to renderer

If readiness appears stuck:

1. inspect ping ID progression (`__readiness_check_n__`)
2. inspect token invalidation conditions during restart
3. inspect whether fail-open path marked ready after max attempts

## Related Pages

- [Frontend Main Local-Backend Docs Hub](README.md)
- [Local-Backend RPC Handler Registry and Payload-Mapper Reference](rpc_handler_registry_and_payload_mapper_reference.md)
- [Screenshot Display-Bounds Fallback and Attachment Materialization Reference](screenshot_display_bounds_fallback_and_attachment_materialization_reference.md)
- [Local Backend Bridge Handler and Window Guard Reference](../local_backend_bridge_handler_and_window_guard_reference.md)
