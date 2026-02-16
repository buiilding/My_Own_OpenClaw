# Bug Report: Pending Sidecar Requests Hang On Process Teardown

## Summary

In `frontend/src/main/local_backend_bridge.cjs`, in-flight JSON-RPC requests could hang indefinitely when the Python sidecar exited or errored.

## Root Cause

The bridge tracked outstanding requests in `pendingRequests`, but on sidecar `exit`/`error` it only called `pendingRequests.clear()` without rejecting the promises.

This removed request entries before timeout handlers could fire, leaving callers waiting forever.

## Fix

- Added explicit pending-request teardown via `rejectPendingRequests(reason)`.
- On sidecar `exit` and `error`, the bridge now:
  - clears request timeouts,
  - rejects all pending promises with a clear error,
  - resets readiness callback state.

## Validation

- Added regression test:
  - `tests/frontend/LocalBackendBridge.test.cjs`
  - `execute-tool rejects in-flight request when sidecar exits`
- Confirmed relevant suites pass after the fix:
  - `../tests/frontend/LocalBackendBridge.test.cjs`
  - `../tests/frontend/IpcMainBridge.test.cjs`

---

## [x] Bug Report: Local Sidecar Ignores SIGTERM and Requires Forced Kill

### Summary

In `frontend/src/main/python/local_backend.py`, the custom `SIGTERM`/`SIGINT` handler only logged the signal and did not trigger shutdown. This overrode Python's default termination behavior, so Electron's `stopLocalBackend()` had to wait and then force-kill the sidecar with `SIGKILL`.

### Root Cause

- `signal_handler()` returned after logging and never stopped the `LocalBackend` loop.
- The main loop blocks on `sys.stdin.readline()` via `asyncio.to_thread(...)`, so without an explicit shutdown request it remains alive.
- Electron main sends `SIGTERM` first (`frontend/src/main/local_backend_bridge.cjs`), expecting graceful exit.

### Why It's Problematic

- Sidecar teardown is delayed by the forced-kill timeout.
- Graceful cleanup paths (memory summarizer stop + memory store close) are less reliable under forced kill.
- This can increase shutdown latency and risk unflushed sidecar state.

### Fix

- Added active-backend tracking in `local_backend.py` so the signal handler can reach the running instance.
- Added `LocalBackend.request_shutdown(signum)` to:
  - mark shutdown requested,
  - stop the run loop,
  - close stdin to unblock the pending readline.
- Updated the run loop to treat stdin-close/read errors as expected when shutdown is requested.
- Updated `signal_handler()` to call `request_shutdown(...)` instead of logging only.

### Validation

- Added regression tests in `tests/sidecar/test_local_backend.py`:
  - `test_signal_handler_requests_shutdown`
  - `test_request_shutdown_marks_backend_and_closes_stdin`
- Re-ran the sidecar local backend suite:
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_local_backend.py`
  - Result: `23 passed`.

---

## [x] Bug Report: Memory Service Also Ignores SIGTERM and Hangs Until Forced Exit

### Summary

In `frontend/src/main/python/memory_service.py`, the signal handler for `SIGTERM`/`SIGINT` logged the signal but did not request shutdown. The service loop remained blocked on stdin reads.

### Root Cause

- `signal_handler()` never told `MemoryService` to stop.
- `MemoryService.run()` waits on `sys.stdin.readline()` in a thread and needs explicit shutdown signaling to exit promptly.

### Why It's Problematic

- Graceful teardown cannot happen reliably when the process only exits through force-kill paths.
- Memory store cleanup can be skipped or delayed, risking stale state and slower process stop.

### Fix

- Added active-service tracking in `memory_service.py`.
- Added `MemoryService.request_shutdown(signum)` to:
  - mark shutdown requested,
  - set `running=False`,
  - close stdin to unblock the readline wait.
- Updated `run()` to treat stdin close/read errors as expected when shutdown is in progress.
- Updated `signal_handler()` to call `request_shutdown(...)`.

### Validation

- Added regression tests in `tests/sidecar/test_memory_service.py`:
  - `test_signal_handler_requests_shutdown`
  - `test_request_shutdown_marks_service_and_closes_stdin`
- Re-ran targeted sidecar suites:
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_memory_service.py tests/sidecar/test_local_backend.py`
  - Result: `37 passed`.

---

## [x] Bug Report: Wakeword Callback Is Lost After Wakeword Service Restart

### Summary

In `frontend/src/main/wakeword_bridge.cjs`, wakeword detections stop triggering the original callback after the Python wakeword subprocess exits and is restarted via `wakeword-enable`.

### Root Cause

- `initializeWakewordBridge(mainWindow, onWakewordDetected)` passes the callback only during the first `startWakewordService(...)`.
- On restart, `wakeword-enable` called `startWakewordService(mainWindow)` without passing `onWakewordDetected`.
- `processDetectionResults(...)` then received `undefined` callback, so only IPC event forwarding happened while callback-driven behavior (like auto-showing chat) was skipped.

### Why It's Problematic

- Wakeword feature becomes partially broken after a restart/crash cycle.
- Detection still appears to work in logs/events, making the regression subtle and harder to diagnose.
- User-visible behavior diverges from expected hotword UX (callback side effects no longer run).

### Fix

- Added persisted callback state: `wakewordDetectedCallback`.
- Store callback at bridge initialization.
- On service restart (`wakeword-enable` when no process), restart with the stored callback.
- In stdout handling, use `onWakewordDetected || wakewordDetectedCallback` to keep callback continuity across lifecycle transitions.

### Validation

- Added regression test in `tests/frontend/WakewordBridge.test.cjs`:
  - `preserves wakeword callback after process restart`
- Re-ran wakeword bridge tests:
  - `cd frontend && npm run test -- tests/frontend/WakewordBridge.test.cjs`
  - Result: `3 passed`.

---

## [x] Bug Report: Stale Wakeword Parser Buffer Survives Process Restart

### Summary

In `frontend/src/main/wakeword_bridge.cjs`, `resultBuffer` was not cleared when the wakeword Python process exited/errored/stopped. Partial frame bytes from the old process could remain and corrupt parsing for the next process instance.

### Root Cause

- Wakeword detection parser uses a module-level `resultBuffer` with length-prefixed frames.
- Process lifecycle handlers reset `pythonProcess` and `stderrBuffer`, but did not reset `resultBuffer`.
- After restart, new stdout bytes were appended to stale bytes, so the parser could read an invalid large frame length and stop emitting detections.

### Why It's Problematic

- Wakeword can silently stop detecting after restart/crash recovery.
- The failure is stateful and hard to diagnose because process restart appears successful, but detections no longer flow.
- Behavior depends on exact buffered bytes from the previous process, causing intermittent production issues.

### Fix

- Clear `resultBuffer` on wakeword process `exit`.
- Clear `resultBuffer` on wakeword process `error`.
- Clear `resultBuffer` in `stopWakewordService()` to avoid cross-instance contamination.

### Validation

- Added regression test in `tests/frontend/WakewordBridge.test.cjs`:
  - `clears stale partial result buffer across process restart`
- Re-ran wakeword bridge suite:
  - `cd frontend && npm run test -- tests/frontend/WakewordBridge.test.cjs`
  - Result: `4 passed`.

---

## [x] Bug Report: LocalBackend Stores Invalid Memory When Query/Response Is Empty

### Summary

In `frontend/src/main/python/local_backend.py`, `_handle_store_memory(...)` accepted empty/missing `user_query` or `assistant_response` and still attempted to store memory content.

### Root Cause

- Unlike `memory_service.py`, `LocalBackend._handle_store_memory(...)` had no required-field validation.
- Calls containing empty values could produce low-quality entries such as `"User: \nAssistant: hello"` or `"User: None\nAssistant: None"`.

### Why It's Problematic

- Pollutes local episodic memory with invalid interactions.
- Can degrade retrieval quality and semantic summarization relevance.
- Creates inconsistent behavior between sidecar memory paths (`memory_service.py` validates; `local_backend.py` did not).

### Fix

- Added explicit input validation in `LocalBackend._handle_store_memory(...)`:
  - Return `{"success": false, "error": "Missing user_query or assistant_response"}` when required fields are empty/missing.

### Validation

- Added regression test in `tests/sidecar/test_local_backend.py`:
  - `test_handle_store_memory_requires_query_and_response`
- Re-ran local backend sidecar tests:
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_local_backend.py`
  - Result: `25 passed`.

---

## [x] Bug Report: Stop Timer Can SIGKILL a Newly Restarted Local Backend Process

### Summary

In `frontend/src/main/local_backend_bridge.cjs`, `stopLocalBackend()` scheduled a delayed `SIGKILL` using the global `pythonProcess` reference. If the sidecar restarted before that timer fired, the delayed kill could target the new process instead of the original one.

### Root Cause

- `stopLocalBackend()` sent `SIGTERM` and then used:
  - `setTimeout(() => { if (pythonProcess) pythonProcess.kill('SIGKILL'); }, 5000)`
- `pythonProcess` is mutable and reused after restart.
- The timer closure did not bind to the original process instance.

### Why It's Problematic

- Can kill a healthy restarted sidecar unexpectedly.
- Produces flaky startup/reconnect behavior that is hard to diagnose.
- Creates race-condition crashes during normal shutdown/restart cycles.

### Fix

- Capture the process instance at shutdown call time (`processToStop`).
- Send `SIGTERM` to `processToStop`.
- In delayed force-kill, only send `SIGKILL` when `pythonProcess === processToStop`.

### Validation

- Added regression test in `tests/frontend/LocalBackendBridge.test.cjs`:
  - `stopLocalBackend force-kill timer does not kill restarted process`
- Re-ran local backend bridge tests:
  - `cd frontend && npm run test -- tests/frontend/LocalBackendBridge.test.cjs`
  - Result: `14 passed`.
