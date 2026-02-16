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
