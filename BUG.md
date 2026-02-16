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
