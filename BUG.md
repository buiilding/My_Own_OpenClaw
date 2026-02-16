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

---

## [x] Bug Report: Stale Readiness Timeout Can Break New Sidecar Startup

### Summary

In `frontend/src/main/local_backend_bridge.cjs`, readiness timeouts from a previous sidecar process could interfere with a newly restarted sidecar and clear its active readiness callback.

### Root Cause

- `checkReadiness(...)` stored a single global `readinessCheckCallback`.
- Timeout closures did not verify they belonged to the current readiness attempt/process.
- If process A timed out after process B had already started, process A’s timeout could null process B’s readiness callback before process B’s ping response arrived.

### Why It's Problematic

- Causes flaky startup/restart behavior in local sidecar readiness.
- New sidecar can be healthy and responding, but readiness response may be dropped due to stale timeout state.
- Produces race-condition failures that are difficult to reproduce and debug.

### Fix

- Added `readinessCheckToken` generation tracking.
- Each readiness attempt captures its token and ignores callback/timeout work when token is stale.
- On backend process reset, increment token to invalidate outstanding readiness timers from the old process.

### Validation

- Added regression test in `tests/frontend/LocalBackendBridge.test.cjs`:
  - `stale readiness timeout from previous process does not cancel new readiness callback`
- Re-ran local backend bridge tests:
  - `cd frontend && npm run test -- tests/frontend/LocalBackendBridge.test.cjs`
  - Result: `15 passed`.

---

## [x] Bug Report: Stale Wakeword Process Exit Can Disable a New Restarted Process

### Summary

In `frontend/src/main/wakeword_bridge.cjs`, lifecycle handlers (`stdout`, `stderr`, `exit`, `error`) were not scoped to the specific spawned wakeword process instance. A delayed `exit` from an older process could overwrite state for a newly started process.

### Root Cause

- `startWakewordService(...)` attached handlers that mutated global state (`pythonProcess`, `isPythonReady`, buffers) without checking whether the event came from the current active process.
- During stop/start races, an old process could emit `exit` after a new process was already running.
- The stale `exit` handler then set `pythonProcess = null` and `isPythonReady = false`, effectively disconnecting the bridge from the live process.

### Why It's Problematic

- Wakeword audio chunks stop being forwarded after a restart race because `sendAudioChunk(...)` bails out when `pythonProcess` is null or not ready.
- The new wakeword subprocess keeps running but becomes unmanaged/orphaned from bridge state.
- This creates intermittent, hard-to-diagnose wakeword outages after lifecycle transitions.

### Fix

- Captured each spawned process instance in `startWakewordService(...)` (`spawnedProcess`).
- Scoped `stdout`, `stderr`, `exit`, and `error` handlers to `spawnedProcess`.
- Added guard checks in each handler:
  - ignore event when `pythonProcess !== spawnedProcess`.
- This prevents stale process events from mutating state for a newer process instance.

### Validation

- Added regression test in `tests/frontend/WakewordBridge.test.cjs`:
  - `ignores stale exit from old process after stop/start restart`
- Re-ran wakeword bridge tests:
  - `cd frontend && npm run test -- tests/frontend/WakewordBridge.test.cjs`
  - Result: `5 passed`.

---

## [x] Bug Report: Stale Wakeword `stderr` Buffer Can Break Ready Signal After Restart

### Summary

In `frontend/src/main/wakeword_bridge.cjs`, the parser buffer used for wakeword process `stderr` logs (`stderrBuffer`) was not reset during manual stop/start. Partial JSON from the previous process could corrupt the first JSON status line from the new process.

### Root Cause

- Wakeword status is parsed from newline-delimited JSON on `stderr`.
- `stderrBuffer` is module-scoped and accumulates partial chunks.
- `stopWakewordService()` did not clear `stderrBuffer`.
- On restart, the new process appended fresh status JSON to stale bytes, making the first line invalid and unparseable.

### Why It's Problematic

- The new wakeword process can be healthy, but the bridge may miss its `{"status":"ready"}` message.
- `isPythonReady` may remain `false`, so audio chunks are ignored even though the process is running.
- This creates intermittent post-restart wakeword outages that are hard to diagnose.

### Fix

- Reset `stderrBuffer` when starting a wakeword process (`startWakewordService(...)`).
- Reset `stderrBuffer` when stopping the wakeword process (`stopWakewordService()`).
- This guarantees each process instance begins with a clean `stderr` parser state.

### Validation

- Added regression test in `tests/frontend/WakewordBridge.test.cjs`:
  - `clears stale partial stderr buffer across stop/start restart`
- Re-ran wakeword bridge tests:
  - `cd frontend && npm run test -- tests/frontend/WakewordBridge.test.cjs`
  - Result: `6 passed`.

---

## [x] Bug Report: Stale Readiness Retry Timer Can Override New Sidecar Readiness Attempt

### Summary

In `frontend/src/main/local_backend_bridge.cjs`, a retry timer created by an old sidecar readiness attempt could still run after process restart and overwrite readiness tracking for the new process.

### Root Cause

- `checkReadiness(...)` uses a token (`readinessCheckToken`) to reject stale callbacks/timeouts.
- But `scheduleReadinessRetry(...)` queued `setTimeout(() => checkReadiness(...))` without carrying/verifying that token.
- If process A scheduled a retry, then exited, and process B started before that retry fired, the stale retry still executed against process B.
- That stale retry replaced `readinessCheckCallback` with a new request id (e.g. `__readiness_check_2__`), so process B’s valid response for `__readiness_check_1__` could be ignored.

### Why It's Problematic

- Sidecar readiness can become flaky during restart races even when the new sidecar is healthy.
- Frontend may delay or miss transition to ready state due to overwritten callback state.
- Produces intermittent startup failures that are hard to diagnose.

### Fix

- Updated `scheduleReadinessRetry(...)` to accept the originating readiness token.
- Retry timer now verifies token still matches `readinessCheckToken` before invoking `checkReadiness(...)`.
- Passed the current `checkToken` to all retry scheduling call sites:
  - ping write failure path,
  - non-ok ping response path,
  - ping timeout path.

### Validation

- Added regression test in `tests/frontend/LocalBackendBridge.test.cjs`:
  - `stale readiness retry timer from previous process does not override new readiness request`
- Re-ran local backend bridge tests:
  - `cd frontend && npm run test -- tests/frontend/LocalBackendBridge.test.cjs`
  - Result: `18 passed`.

---

## [x] Bug Report: FAISS Rebuild Kept Stale `embedding_id` Values and Broke Recall

### Summary

In `frontend/src/main/python/memory/local_store.py`, `_rebuild_index(...)` reused historical `embedding_id` mappings while rebuilding FAISS vectors from scratch. When IDs were sparse/non-contiguous (common after deletes), FAISS result positions no longer matched mapping keys.

### Root Cause

- FAISS `IndexFlatIP` returns positional indices (`0..ntotal-1`) for search results.
- `_rebuild_index(...)` added vectors sequentially, but preserved old DB IDs (for example `4`, `11`) in `vector_id_to_memory_id`.
- Search then filtered out valid results because returned FAISS positions (for example `0`, `1`) were absent from the mapping.

### Why It's Problematic

- Memory search can return empty/incomplete results after index rebuild/recovery.
- A DB may contain valid embedded memories, but recall appears broken until new writes repopulate contiguous IDs.
- Failure is subtle and state-dependent, making incident diagnosis difficult.

### Fix

- Reworked `_rebuild_index(...)` to fully reset mapping state and assign fresh contiguous vector IDs during rebuild.
- Persisted rebuilt IDs back into SQLite `embedding_id`.
- Ordered rebuild input by prior `embedding_id` for deterministic remap.
- Rows with missing content now clear `embedding_id` instead of leaving stale mapped IDs.

### Validation

- Added regression test in `tests/sidecar/test_local_store_delete_cleanup.py`:
  - `test_rebuild_index_rewrites_sparse_embedding_ids_to_contiguous_ids`
- Re-ran targeted sidecar tests:
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_local_store_delete_cleanup.py`
  - Result: `3 passed`
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_local_backend.py`
  - Result: `25 passed`

---

## [x] Bug Report: Pending Transcript Queue Drops Messages On First IPC Failure

### Summary

In `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`, queued transcript entries were removed from memory before persistence. If a `store-transcript` IPC call failed once, remaining queued messages were silently lost.

### Root Cause

- `flushPendingMessages()` called `pendingUserQueue.drain()` and `pendingToolQueue.drain()` up front.
- It then awaited `storeTranscriptEntry(...)` in a loop without per-message error recovery.
- Any rejection aborted the flush with the queue already emptied, so failed/current/remaining entries were no longer retained for retry.

### Why It's Problematic

- User/tool transcript history becomes incomplete during transient IPC failures.
- Failures are easy to miss because flush is triggered via `void flushPendingMessages()` and happened in background session updates.
- This can break memory quality and dashboard transcript continuity.

### Fix

- Added guarded flush helper in `TranscriptWriter`:
  - on failed write, requeue the failed entry and remaining entries in original order,
  - stop flush early and retry on next session-triggered flush.
- Kept user and tool queue handling symmetric with explicit category logging.

### Validation

- Added regression tests in `tests/frontend/TranscriptWriter.test.ts`:
  - `requeues queued user messages when a pending flush write fails`
  - `requeues queued tool messages when a pending flush write fails`
- Re-ran targeted frontend suites:
  - `cd frontend && npm run test -- ../tests/frontend/TranscriptWriter.test.ts`
  - Result: `15 passed`
  - `cd frontend && npm run test -- ../tests/frontend/ChatMessageSender.test.tsx ../tests/frontend/TranscriptStorage.test.ts`
  - Result: `22 passed`

---

## [x] Bug Report: `setActiveConversationRef(null)` Failed To Clear Active Conversation

### Summary

In `frontend/src/renderer/infrastructure/transcript/sessionInfoState.ts`, clearing the active conversation by passing `null` did not work. The previous conversation ref was retained.

### Root Cause

- `update(...)` used `conversationRef || currentConversationRef`.
- When `conversationRef` was `null`, JavaScript fallback logic reused the old value instead of clearing.
- `setActiveConversationRef(...)` passes through this state layer, so `setActiveConversationRef(null)` became a no-op for conversation identity.

### Why It's Problematic

- Transcript routing can leak into a stale conversation after reset/clear flows.
- New user messages may be written immediately under an old conversation instead of staying queued until a new conversation ref is set.
- This creates incorrect episodic history grouping in the frontend dashboard and transcript store.

### Fix

- Updated `sessionInfoState.update(...)` to treat `undefined` as “keep current” and `null` as an explicit clear for conversation ref.
- Updated `setActiveConversationRef(...)` to pass `undefined` for `userId` (preserve user while clearing/setting conversation explicitly).

### Validation

- Added regression tests:
  - `tests/frontend/TranscriptSessionState.test.ts`
    - `update clears conversation ref when null is explicitly provided`
  - `tests/frontend/TranscriptWriter.test.ts`
    - `setActiveConversationRef(null) clears active conversation and queues new messages`
- Re-ran targeted frontend suites:
  - `cd frontend && npm run test -- ../tests/frontend/TranscriptSessionState.test.ts ../tests/frontend/TranscriptWriter.test.ts`
  - Result: `22 passed`
  - `cd frontend && npm run test -- ../tests/frontend/ChatMessageSender.test.tsx ../tests/frontend/TranscriptStorage.test.ts`
  - Result: `22 passed`
