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

---

## [x] Bug Report: Timed-Out Foreground Shell Commands Leak Registry Sessions

### Summary

In `frontend/src/main/python/tools/system/shell_tool.py`, foreground commands that timed out were leaving dead sessions in `shell_process_registry._running_sessions`.

### Root Cause

- `run_shell_command(...)` waited with `asyncio.wait_for(wait_task, timeout=...)`.
- On timeout, `wait_for` cancels `wait_task`.
- `wait_task` runs `_wait_for_exit(...)`, which is the only path that calls `mark_exited(...)` and removes the session from `_running_sessions`.
- Because the task was canceled, registry cleanup never ran for that timed-out foreground session.

### Why It's Problematic

- Session entries accumulate in `_running_sessions` over time, creating a memory/state leak.
- Leaked sessions can interfere with background-session management behavior and test reliability.
- The leak is silent, so long-running app processes can degrade without obvious errors.

### Fix

- Changed timeout wait to `asyncio.wait_for(asyncio.shield(wait_task), timeout=...)` so timeout does not cancel `wait_task`.
- After forced termination, explicitly await `wait_task` so `_wait_for_exit(...)` performs normal cleanup.
- Added a defensive fallback: if cleanup task still does not complete, call `mark_exited(...)` directly.
- Updated `_build_result_from_session(...)` to support explicit `exit_code_override=None` while keeping existing timeout response behavior.

### Validation

- Added regression test in `tests/sidecar/test_shell_process_tool.py`:
  - `test_run_shell_command_timeout_cleans_foreground_session_registry_entry`
- Re-ran targeted sidecar suites:
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_shell_process_tool.py tests/sidecar/test_shell_process_registry.py`
  - Result: `29 passed`
- Reproduced the timeout flow before and after patch:
  - Before: `_running_sessions` count increased from `0` to `1`
  - After: `_running_sessions` remains `0`

---

## [x] Bug Report: `process remove` Leaks PTY File Descriptors

### Summary

In `frontend/src/main/python/tools/system/process_tool.py`, removing an active PTY-backed background session did not close the PTY master file descriptor.

### Root Cause

- `process_shell_command(..., action="remove")` canceled session tasks, killed the process, and deleted the session record.
- For PTY sessions (`session.uses_pty=True`), the code never closed `session.pty_master`.
- The normal PTY close path lives in `_wait_for_exit(...)` (`shell_tool.py`), but `remove` cancels that task before cleanup completes.

### Why It's Problematic

- PTY master descriptors remain open after session removal, causing a file descriptor leak.
- Repeated remove operations can accumulate leaked descriptors and eventually degrade sidecar stability.
- The issue is silent because session deletion succeeds, masking the resource leak.

### Fix

- Updated `process_tool.py` remove action to explicitly close `session.pty_master` when present.
- Set `session.pty_master = None` after close to avoid stale descriptor reuse.

### Validation

- Added regression test in `tests/sidecar/test_shell_process_tool.py`:
  - `test_process_remove_closes_pty_master_fd`
- Re-ran targeted sidecar suite:
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_shell_process_tool.py`
  - Result: `20 passed`
- Manual repro before/after fix:
  - Before: `os.fstat(fd)` succeeded after `process remove` (fd still open)
  - After: `os.fstat(fd)` raises `Errno 9` (fd closed)

---

## [x] Bug Report: `process kill` Returned Success While Session Still Showed Running

### Summary

In `frontend/src/main/python/tools/system/process_tool.py`, `process_shell_command(..., action="kill")` could return a successful `"killed"` response even though the session still appeared in the running list and polled as `"running"` immediately after.

### Root Cause

- The kill handler called `session.process.kill()` and awaited only `session.process.wait()`.
- Registry state transition (`_running_sessions` -> `_finished_sessions`) happens in the background `wait_task` path (`_wait_for_exit(...)` in `shell_tool.py`), not in `process.wait()` itself.
- Because `kill` did not await/finish `wait_task`, callers could observe stale running state right after a successful kill response.

### Why It's Problematic

- Produces inconsistent API behavior: kill reports success while subsequent `list`/`poll` still report running.
- Causes racey UI/tooling behavior when callers immediately refresh process status after kill.
- Makes process lifecycle debugging harder due to contradictory state signals.

### Fix

- Updated `process_tool.py` kill action to:
  - await `session.wait_task` (with timeout) so registry cleanup completes,
  - fallback to `mark_exited(...)` if wait-task cleanup does not finish.
- This guarantees killed sessions leave the running registry before the kill response returns.

### Validation

- Added regression test in `tests/sidecar/test_shell_process_tool.py`:
  - `test_process_kill_immediately_removes_session_from_running_registry`
- Re-ran targeted sidecar suites:
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_shell_process_tool.py tests/sidecar/test_shell_process_registry.py`
  - Result: `31 passed`
- Manual repro before/after fix:
  - Before: right after kill, session remained in `running`, not `finished`, and `poll` showed `running`
  - After: right after kill, session is absent from `running`, present in `finished`, and `poll` shows terminal status

---

## [x] Bug Report: Memory Service Can Crash On Valid JSON That Is Not An Object

### Summary

In `frontend/src/main/python/memory_service.py`, `MemoryService.handle_request(...)` assumed the decoded JSON frame was always an object (`dict`). If a client sent valid JSON with a non-object root (for example `[]`), request handling could raise unexpectedly and destabilize the service loop.

### Root Cause

- `handle_request(...)` accessed `request.get(...)` without validating request type.
- When `request` was a list/string/number, `.get` raised `AttributeError`.
- The same method also assumed `payload` was a dict; non-object payloads later caused `.get` failures in request handlers.

### Why It's Problematic

- A malformed-but-valid JSON frame can trigger exceptions in core request dispatch.
- This makes protocol behavior brittle and can terminate or disrupt service handling under bad input.
- The failure mode is avoidable and should be converted into a structured protocol error response.

### Fix

- Added explicit request-shape guards in `MemoryService.handle_request(...)`:
  - reject non-object root requests with `"Request must be a JSON object"`,
  - reject non-object payloads with `"Request payload must be a JSON object"`,
  - keep error responses structured with stable `id` behavior.

### Validation

- Added regression tests in `tests/sidecar/test_memory_service.py`:
  - `test_handle_request_rejects_non_object_request`
  - `test_handle_request_rejects_non_object_payload`
- Re-ran targeted sidecar suite:
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_memory_service.py`
  - Result: `16 passed`
- Runtime check:
  - `handle_request([])` now returns `{success: false, error: "Request must be a JSON object"}`
  - `handle_request({... payload: "bad"})` now returns `{success: false, error: "Request payload must be a JSON object"}`

---

## [x] Bug Report: JSON-RPC Non-Object Requests Were Misclassified As Internal Errors

### Summary

In `frontend/src/main/python/core/ipc_protocol.py`, `JSONRPCProtocol.handle_request(...)` assumed parsed JSON was always an object. Sending valid JSON with a non-object root (for example `[]`) produced an internal exception and returned `-32603 Internal error` instead of `-32600 Invalid Request`.

### Root Cause

- `handle_request(...)` accessed `request.get(...)` without first validating that `request` is a dict.
- For list/string/number payloads, Python raised `AttributeError`.
- `process_line(...)` caught that exception at a higher level and wrapped it as internal error.

### Why It's Problematic

- Violates JSON-RPC semantics by classifying malformed request shape as server internal failure.
- Emits noisy stack traces for client input validation errors.
- Makes protocol diagnostics and client retry logic less reliable because input mistakes look like server faults.

### Fix

- Updated `JSONRPCProtocol.handle_request(...)` to validate request type up front.
- Non-object payloads now return:
  - error code `-32600` (`INVALID_REQUEST`)
  - message `"Invalid request: payload must be a JSON object"`
- Kept existing behavior unchanged for valid object requests.

### Validation

- Added regression tests in `tests/sidecar/test_json_rpc_protocol.py`:
  - `test_handle_request_rejects_non_object_payload`
  - `test_process_line_non_object_json_returns_invalid_request`
- Re-ran targeted sidecar suites:
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_json_rpc_protocol.py tests/sidecar/test_local_backend.py`
  - Result: `43 passed`
- Runtime check:
  - Before: `process_line('[]')` returned `-32603 Internal error` with an attribute-error trace.
  - After: `process_line('[]')` returns `-32600 Invalid request`.

---

## [x] Bug Report: JSON-RPC Helper Dropped Valid Falsy Request IDs

### Summary

In `frontend/src/main/python/core/ipc_protocol.py`, `JSONRPCProtocol.create_request(...)` omitted `id` when `request_id` was falsy (`0` or empty string), silently converting a normal request into a JSON-RPC notification.

### Root Cause

- `create_request(...)` used truthiness checks (`if request_id:`) rather than explicit null checks.
- JSON-RPC allows IDs such as numeric `0` and string `""`; both are valid request IDs.
- Those values were incorrectly treated as “no id provided”.

### Why It's Problematic

- Requests with `id=0` or `id=""` lose correlation IDs and become notifications.
- Callers waiting for a response can hang because the peer may not send notification responses.
- This creates subtle protocol bugs that are hard to debug in integrations/tests using numeric IDs.

### Fix

- Updated `create_request(...)` to include `id` when `request_id is not None`.
- Broadened `request_id` type hint to `Optional[Any]` to reflect valid JSON-RPC ID types.

### Validation

- Added regression tests in `tests/sidecar/test_json_rpc_protocol.py`:
  - `test_create_request_keeps_zero_request_id`
  - `test_create_request_keeps_empty_string_request_id`
- Re-ran targeted sidecar suites:
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_json_rpc_protocol.py tests/sidecar/test_local_backend.py`
  - Result: `45 passed`
- Runtime check:
  - `create_request("ping", request_id=0)` now includes `"id": 0`
  - `create_request("ping", request_id="")` now includes `"id": ""`

---

## [x] Bug Report: Dev Tool Selection Cache Can Serve Stale Config After Rewrite

### Summary

In `backend/src/tools/tool_selection.py`, `load_tool_selection(...)` cached parsed config using only `stat.st_mtime`. If `tool_selection.toml` was rewritten while preserving `mtime`, the loader could return stale cached selection.

### Root Cause

- Cache key compared only `st_mtime`.
- Some workflows can rewrite file contents and then pin `mtime` back (for example, explicit `utime` or copy/sync tooling).
- In that case, cache invalidation did not trigger, so old parsed config was reused.

### Why It's Problematic

- Backend can run with outdated tool allowlist/denylist policy even though config content changed.
- Dev/runtime behavior becomes inconsistent and hard to debug (file contents and active policy diverge).
- This can unintentionally expose or hide tools against the expected config.

### Fix

- Reworked cache signature to include `(st_mtime_ns, st_ctime_ns, st_size)` instead of only `st_mtime`.
- Added `_cache_signature(...)` helper and switched cache compare/store logic to that signature.

### Validation

- Added regression test in `tests/backend/test_dev_tool_selection.py`:
  - `test_load_tool_selection_refreshes_cache_when_file_rewritten_with_same_mtime`
- Re-ran targeted backend suites:
  - `./scripts/python-in-env backend pytest tests/backend/test_dev_tool_selection.py tests/backend/test_tool_policy.py`
  - Result: `12 passed`
- Runtime repro:
  - Before: rewriting config with same `mtime` returned stale tool list (`read_file`)
  - After: same scenario returns updated tool list (`edit_file`)

---

## [x] Bug Report: JSON-RPC Non-String Method Names Were Misclassified

### Summary

In `frontend/src/main/python/core/ipc_protocol.py`, `JSONRPCProtocol.handle_request(...)` treated requests with non-string `method` values (for example `123`) as `METHOD_NOT_FOUND` instead of `INVALID_REQUEST`.

### Root Cause

- Method validation only checked presence/truthiness (`if not method_name`).
- Non-string truthy values bypassed that guard.
- The dispatcher then did `self.methods.get(method_name)` and returned `METHOD_NOT_FOUND` for invalid method types.

### Why It's Problematic

- Violates JSON-RPC request validation semantics (`method` must be a string).
- Client-side input bugs are reported as missing server methods, which is misleading.
- This can trigger incorrect retries/fallback behavior in protocol clients.

### Fix

- Added explicit type validation for `method` in `handle_request(...)`.
- Non-string method values now return:
  - error code `-32600` (`INVALID_REQUEST`)
  - message `"Method name must be a string"`

### Validation

- Added regression test in `tests/sidecar/test_json_rpc_protocol.py`:
  - `test_handle_request_non_string_method_is_invalid_request`
- Re-ran targeted sidecar suites:
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_json_rpc_protocol.py tests/sidecar/test_local_backend.py`
  - Result: `46 passed`
- Runtime check:
  - `handle_request({"jsonrpc":"2.0","method":123,"id":"req-1"})` now returns `-32600 Invalid request` with method-type message.

---

## [x] Bug Report: JSON-RPC Notifications Incorrectly Emitted Responses

### Summary

In `frontend/src/main/python/core/ipc_protocol.py`, `JSONRPCProtocol.handle_request(...)` returned response objects for JSON-RPC notifications (requests without an `id` field), causing the sidecar to write unsolicited responses to stdout.

### Root Cause

- The handler always built and returned a response for both success and error paths.
- It did not distinguish regular requests from notifications (`id` missing).
- `local_backend.py` sends every non-`None` protocol response, so notification requests still produced protocol output.

### Why It's Problematic

- Violates JSON-RPC 2.0 semantics: notifications must not receive responses.
- Produces unnecessary stdout traffic and parser noise in the Electron bridge.
- Increases risk of confusing protocol diagnostics, since responses can appear without any tracked pending request.

### Fix

- Added notification detection in `handle_request(...)` (`is_notification = "id" not in request`).
- For notifications:
  - still execute the registered method handler (preserving side effects),
  - return `None` instead of a response object for success and error paths.
- Kept normal request behavior unchanged when `id` is present.

### Validation

- Added regression tests in `tests/sidecar/test_json_rpc_protocol.py`:
  - `test_handle_request_notification_returns_none_and_executes_handler`
  - `test_process_line_notification_returns_none`
- Re-ran targeted sidecar suites:
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_json_rpc_protocol.py tests/sidecar/test_local_backend.py`
  - Result: `48 passed`
- Runtime check:
  - `handle_request({"jsonrpc":"2.0","method":"ping"})` now returns `None`.

---

## [x] Bug Report: Sidecar Tool Registry Executed Tools With Invalid Non-Object Args

### Summary

In `frontend/src/main/python/tools/registry.py`, `ToolRegistry.execute_tool(...)` silently coerced non-dict `args` to `{}`. Invalid requests (for example string/list args) could still execute tools instead of failing fast.

### Root Cause

- Argument normalization used:
  - `tool_args = args if isinstance(args, dict) else {}`
- This converted malformed payloads into seemingly valid empty argument objects.
- Some tools accept empty args or have optional fields, so execution could proceed with unintended defaults.

### Why It's Problematic

- Invalid client/tool payloads were not rejected at the sidecar execution boundary.
- Malformed calls could trigger real side effects (for example screenshot capture) instead of returning a validation error.
- This masks caller bugs and makes protocol/tool debugging harder.

### Fix

- Updated `ToolRegistry.execute_tool(...)` to reject non-dict `args`:
  - returns `ToolResult.error_result("Tool args must be an object")`
  - does not invoke the target tool when args are malformed.

### Validation

- Updated regression test in `tests/sidecar/test_tool_registry.py`:
  - `test_execute_tool_rejects_non_dict_args`
  - verifies malformed args return an error and the tool callback is not executed.
- Re-ran targeted sidecar suites:
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_tool_registry.py tests/sidecar/test_local_backend.py tests/sidecar/test_json_rpc_protocol.py`
  - Result: `55 passed`
- Runtime check:
  - `execute_tool("read_file", "not-a-dict")` now returns `{"success": False, "error": "Tool args must be an object"}`.

---

## [x] Bug Report: Sidecar ToolResult Serialization Dropped Empty Payloads

### Summary

In `frontend/src/main/python/tools/result.py`, `ToolResult.to_dict()` dropped valid empty values (`data={}` and `error=""`) because it used truthiness checks. This produced inconsistent JSON-RPC payloads for successful tools that intentionally return an empty object.

### Root Cause

- Serialization logic used:
  - `if self.data:`
  - `if self.error:`
- Empty dict/string values are falsy in Python.
- As a result, fields were omitted even when explicitly set.

### Why It's Problematic

- Breaks response-shape consistency between sidecar tool results:
  - `ToolResult.success_result({})` serialized to `{"success": true}` instead of including `data`.
- Callers can no longer distinguish between:
  - "field intentionally empty" vs "field missing/unset".
- This can create subtle parsing/branching bugs in downstream IPC handling.

### Fix

- Updated `ToolResult.to_dict()` in `tools/result.py`:
  - include `data` when `self.data is not None`
  - include `error` when `self.error is not None`
- Removed unused `field` import from the same module.

### Validation

- Added regression tests:
  - `tests/sidecar/test_tool_result.py`
    - `test_tool_result_to_dict_preserves_empty_data_dict`
    - `test_tool_result_to_dict_preserves_empty_error_string`
  - `tests/sidecar/test_local_backend.py`
    - `test_handle_execute_tool_preserves_empty_data_payload`
- Re-ran targeted sidecar suites:
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_tool_result.py tests/sidecar/test_local_backend.py tests/sidecar/test_tool_registry.py`
  - Result: `35 passed`
- Runtime check:
  - Before: `ToolResult.success_result({}).to_dict()` -> `{"success": True}`
  - After: `ToolResult.success_result({}).to_dict()` -> `{"success": True, "data": {}}`

---

## [x] Bug Report: JSON-RPC Argument Binding Errors Were Misclassified As Internal Errors

### Summary

In `frontend/src/main/python/core/ipc_protocol.py`, JSON-RPC calls with missing or unexpected method parameters were returned as `INTERNAL_ERROR` (`-32603`) instead of `INVALID_PARAMS` (`-32602`).

### Root Cause

- `handle_request(...)` called method handlers directly (`handler(**params)`).
- Python `TypeError` from argument binding (for example missing required args) was caught by the generic exception handler.
- The generic handler always mapped these failures to `INTERNAL_ERROR`.

### Why It's Problematic

- Violates JSON-RPC semantics: malformed params should return `INVALID_PARAMS`.
- Misleads clients into treating caller-side request bugs as server faults.
- Creates noisy stack traces and weakens retry/diagnostic behavior for tooling around the protocol.

### Fix

- Extended `RegisteredMethod` with precomputed callable signatures (`handler_signature`).
- During method registration, capture `inspect.signature(handler)` when available.
- In `handle_request(...)`, validate params with `handler_signature.bind(**params)` before invoking the handler.
- If binding fails, return:
  - code `-32602` (`INVALID_PARAMS`)
  - message prefixed with `"Invalid params: ..."`

### Validation

- Added regression tests in `tests/sidecar/test_json_rpc_protocol.py`:
  - `test_handle_request_missing_required_param_returns_invalid_params`
  - `test_handle_request_unexpected_param_returns_invalid_params`
- Re-ran targeted sidecar suites:
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_json_rpc_protocol.py tests/sidecar/test_local_backend.py`
  - Result: `52 passed`
- Runtime check:
  - Before: missing/extra args returned `-32603 Internal error`
  - After: missing/extra args return `-32602 Invalid params`

---

## [x] Bug Report: `process send-keys` Crashes On Non-String Key Tokens

### Summary

In `frontend/src/main/python/tools/system/process_tool.py`, `process_shell_command` action `send-keys` could raise an exception when `keys` contained non-string values.

### Root Cause

- `_encode_keys(...)` iterated `keys` and unconditionally called `key.strip().lower()`.
- If a token was not a string (for example `123`), this raised `AttributeError`.
- `process_shell_command(...)` does not wrap action handling in a top-level `try/except`, so the exception escaped the action handler path.

### Why It's Problematic

- A malformed `send-keys` payload caused tool execution failure instead of a controlled response.
- Mixed payloads (valid literal + invalid key token) could not proceed, reducing robustness of sidecar command input handling.
- Error handling became inconsistent with other validation flows that return structured `success: false` responses.

### Fix

- Hardened `_encode_keys(...)` in `process_tool.py`:
  - validates `keys`/`hex` container types (`list` expected),
  - ignores non-string entries with warnings instead of throwing,
  - ignores non-string `literal` payloads with warnings.
- Kept existing behavior for valid key aliases/hex/literal inputs.

### Validation

- Added regression test in `tests/sidecar/test_shell_process_tool.py`:
  - `test_process_send_keys_ignores_non_string_key_tokens`
- Re-ran targeted suites:
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_shell_process_tool.py`
  - `./scripts/python-in-env sidecar pytest tests/sidecar/test_tool_registry.py`
  - Result: `29 passed` (22 + 7).

---

## [x] Bug Report: Malformed Renderer `to-backend` Events Could Crash Main IPC Query Handler

### Summary

In `frontend/src/main/ipc.cjs`, malformed renderer IPC messages could throw in the `to-backend` event handler:
- missing event payload object caused unsafe parameter destructuring issues
- query events with missing `payload` caused `payload.content = ...` to throw

### Root Cause

- The handler signature assumed a valid shape:
  - `ipcMain.on('to-backend', async (event, { type, payload }) => { ... })`
- Query enrichment later mutates payload directly:
  - `payload.content = completeContent`
- If renderer sends `{ type: 'query' }` (or no message object), `payload` is `undefined`, which raises a runtime `TypeError`.

### Why It's Problematic

- A malformed renderer event can crash query-path execution in the Electron main process.
- The failure happens before backend send, so the request is silently dropped.
- This is a robustness bug in a high-churn frontend routing path (`ipc.cjs`).

### Fix

- Hardened `to-backend` handler input normalization in `frontend/src/main/ipc.cjs`:
  - switched to safe signature: `(event, message = {})`
  - normalized `type` to string-or-null
  - normalized `payload` to an object fallback (`{}`) for non-object/missing payloads
  - added early return for malformed messages missing string `type`
- Kept existing behavior for valid renderer payloads.

### Validation

- Added regression tests in `tests/frontend/IpcMainBridge.test.cjs`:
  - `ignores malformed to-backend event payloads without crashing`
  - `handles query events with missing payload object without throwing`
- Re-ran targeted frontend suite:
  - `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/IpcMainBridge.test.cjs`
  - Result: `20 passed`.

---

## [x] Bug Report: Offline Query Dispatch Could Leave Frontend Chat Stuck In Sending State

### Summary

In `frontend/src/main/ipc.cjs`, when the renderer sent a `query` while backend WebSocket was disconnected, the main process dropped the outbound send but did not emit an error event back to renderer.

### Root Cause

- Query dispatch path in `ipc.cjs`:
  - builds query payload and local-user event
  - calls `sendMessageToBackend(...)`
  - if send fails (`null`), only resets overlay phase to `idle`
- No `from-backend` error event was emitted for renderer state machines (`useChatStream`) to clear pending send state and show failure.

### Why It's Problematic

- User sees a pending query with no completion/error feedback.
- Chat sending lifecycle can remain in an ambiguous or stuck state.
- Failure is silent during transient disconnects, hurting resilience and debuggability.

### Fix

- Updated `frontend/src/main/ipc.cjs` query send-failure branch:
  - when `sendMessageToBackend(...)` returns `null` for `query`,
  - emit a structured `from-backend` `error` event with:
    - `turn_ref`
    - session/user/conversation refs
    - payload message: `"Unable to send query: backend connection is unavailable."`
- Existing overlay reset behavior is preserved.

### Validation

- Added regression test in `tests/frontend/IpcMainBridge.test.cjs`:
  - `emits renderer error event when query send fails due to disconnected backend`
- Re-ran targeted frontend suite:
  - `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/IpcMainBridge.test.cjs`
  - Result: `21 passed`.

---

## [x] Bug Report: Immediate Transcript Writes Could Be Lost On IPC Failure

### Summary

In `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`, immediate transcript writes from `recordUserMessage(...)` and `recordToolMessage(...)` could be dropped when `IpcBridge.invoke('store-transcript', ...)` failed.

### Root Cause

- When conversation/user identity was available, both methods used fire-and-forget writes:
  - `void storeTranscriptEntry(...)`
- There was no `.catch(...)` fallback to queue failed writes for retry.
- Pending queues/retry logic existed only for:
  - missing identity at write time, and
  - flush-time failures for already queued items.

### Why It's Problematic

- Transient IPC failures can silently lose user/tool transcript entries.
- This creates durable history gaps in local memory and dashboard conversation views.
- It also introduces unhandled async rejection risk from uncaught fire-and-forget promises.

### Fix

- Added shared retry-queue helpers:
  - `queueUserMessageForRetry(...)`
  - `queueToolMessageForRetry(...)`
- Updated immediate write paths:
  - `recordUserMessage(...)` now catches `storeTranscriptEntry(...)` failures, queues the entry, and logs a warning.
  - `recordToolMessage(...)` now does the same.
- Existing pending flush flow remains unchanged and now retries these immediate-failure entries as well.

### Validation

- Added regression tests in `tests/frontend/TranscriptWriter.test.ts`:
  - `recordUserMessage requeues immediate writes when IPC store fails`
  - `recordToolMessage requeues immediate writes when IPC store fails`
- Re-ran targeted frontend suite:
  - `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/TranscriptWriter.test.ts`
  - Result: `19 passed`.

---

## [x] Bug Report: Assistant Transcript Entries Were Not Retried After Immediate IPC Write Failures

### Summary

In `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`, assistant transcript entries created by `recordAssistantMessage(...)` could be dropped when `store-transcript` IPC calls failed transiently.

### Root Cause

- `recordAssistantMessage(...)` used fire-and-forget persistence:
  - `void storeTranscriptEntry(...)`
- Unlike `recordUserMessage(...)` and `recordToolMessage(...)`, there was no failure catch-and-requeue path for immediate assistant writes.
- Pending retry queues only covered user/tool entries, so assistant entries had no retry channel.

### Why It's Problematic

- Assistant responses are critical for chat history continuity; dropping them creates conversation gaps.
- A transient renderer-main IPC failure could permanently lose assistant memory records.
- This produced inconsistent reliability across transcript roles (user/tool had retries, assistant did not).

### Fix

- Added assistant pending retry queue infrastructure:
  - `PendingAssistantMessage` in `frontend/src/renderer/infrastructure/transcript/types.ts`
  - `createPendingAssistantQueue()` in `frontend/src/renderer/infrastructure/transcript/pendingAssistantQueue.ts`
- Updated `TranscriptWriter`:
  - new helper `queueAssistantMessageForRetry(...)`
  - `recordAssistantMessage(...)` now catches immediate `storeTranscriptEntry(...)` failures, queues retry entry, and logs warning
  - `flushPendingMessages()` now flushes assistant queue between user and tool queues
- Updated test microtask drain helper depth in transcript tests to match the expanded async flush pipeline.

### Validation

- Added regression test in `tests/frontend/TranscriptWriter.test.ts`:
  - `recordAssistantMessage requeues immediate writes when IPC store fails`
- Re-ran targeted frontend suite:
  - `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/TranscriptWriter.test.ts`
  - Result: `20 passed`.

---

## [x] Bug Report: Failed First Query Send Incorrectly Consumed Initial-Context Mode

### Summary

In `frontend/src/main/ipc.cjs`, a transient failure while sending the first query could incorrectly flip the query-context mode from `initial` to `sequential`, causing the next successful query to miss initial context fields.

### Root Cause

- In `to-backend` query handling:
  - `contextType` was computed from `isFirstQuery`
  - `isFirstQuery = false` was set **before** send success was known
- If `sendMessageToBackend(...)` failed (returned `null` after send exception), initial-context mode was still consumed.
- Subsequent queries then used sequential context (`active_window`, `mouse_position`, `screen_resolution`) instead of initial context (includes `windows`).

### Why It's Problematic

- A transient transport failure changes behavior of later successful requests.
- First successful query can lose richer initial system context unexpectedly.
- This creates hard-to-debug prompt-context inconsistency after temporary send faults.

### Fix

- Updated `frontend/src/main/ipc.cjs` query dispatch flow:
  - track whether current query used initial context (`queryUsedInitialContext`)
  - only set `isFirstQuery = false` after send succeeds (`messageId` truthy)
  - preserve existing error event/overlay behavior when send fails

### Validation

- Added regression test in `tests/frontend/IpcMainBridge.test.cjs`:
  - `keeps initial query context after transient query send failure`
- Re-ran targeted frontend suite:
  - `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/IpcMainBridge.test.cjs`
  - Result: `22 passed`.

---

## [x] Bug Report: Transcript Session State Re-reads Storage Indefinitely for Null Values

### Summary

In `frontend/src/renderer/infrastructure/transcript/sessionInfoState.ts`, session hydration from storage could execute on every `get()`/`resolve()` call when stored values were both `null`.

### Root Cause

- `ensureLoaded()` used value-truthiness as the hydration guard:
  - `if (currentConversationRef || currentUserId) return;`
- When storage returns `{ conversationRef: null, userId: null }`, the guard never becomes true.
- That causes repeated `readStoredSessionInfo()` calls even though storage was already read.

### Why It's Problematic

- Adds unnecessary repeated reads/parsing on a hot renderer path.
- Increases avoidable work for transcript/session-dependent flows.
- Makes session-state behavior inconsistent between null and non-null storage values.

### Fix

- Added explicit one-time hydration sentinel in `sessionInfoState.ts`:
  - `let hasLoadedFromStorage = false;`
- Updated `ensureLoaded()` to guard on `hasLoadedFromStorage` instead of truthiness.
- Set `hasLoadedFromStorage = true` immediately after first storage read.
- Added regression test in `tests/frontend/TranscriptSessionState.test.ts`:
  - `reads null session state from storage only once`

### Validation

- Ran targeted regression suite:
  - `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/TranscriptSessionState.test.ts`
  - Result: `9 passed`.
- Ran adjacent transcript smoke suite:
  - `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/TranscriptWriter.test.ts`
  - Result: `20 passed`.

---

## [x] Bug Report: Chat Stream Events Without Refs Could Clear Active Transcript Session

### Summary

In `frontend/src/renderer/features/chat/hooks/useChatStream.ts`, transcript session updates were normalizing missing backend refs to `null` for every event. For events that legitimately omit refs (for example `tool-schemas`), this could clear active transcript session context.

### Root Cause

- `useChatStream` called:
  - `updateTranscriptSession(data.conversation_ref ?? null, data.user_id ?? null)`
- `conversation_ref` is optional in backend events.
- `updateTranscriptSession(..., ...)` forwards to `sessionInfoState.update(...)`, where `conversationRef = null` is treated as an explicit clear.
- Result: events with omitted refs could unintentionally reset conversation tracking.

### Why It's Problematic

- Active transcript session can be cleared by unrelated backend events that are not conversation-scoped.
- Subsequent transcript writes may be queued/skipped until conversation info is restored.
- This creates subtle state drift in renderer transcript behavior.

### Fix

- Updated `useChatStream` to forward optional refs without null-coalescing:
  - from `updateTranscriptSession(data.conversation_ref ?? null, data.user_id ?? null)`
  - to `updateTranscriptSession(data.conversation_ref, data.user_id)`
- Added regression test in `tests/frontend/ChatStreamThinkingStatus.test.tsx`:
  - `preserves transcript session refs when backend event omits conversation and user ids`
- The regression asserts `updateTranscriptSession(undefined, undefined)` for a `tool-schemas` event that omits refs.

### Validation

- Ran targeted frontend hook suite:
  - `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/ChatStreamThinkingStatus.test.tsx`
  - Result: `28 passed`.
- Ran adjacent transcript smoke suite:
  - `cd frontend && npm run test -- --runTestsByPath ../tests/frontend/TranscriptWriter.test.ts`
  - Result: `20 passed`.
