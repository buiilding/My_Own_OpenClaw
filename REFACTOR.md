# Refactor: Remove Per-Event TTS Closure Allocation in StreamPipeline

## Target
Reduce per-event allocation overhead and simplify TTS task lifecycle management in:
- `backend/src/api/processing/pipeline.py`

This is a performance + maintainability refactor in the query streaming hot path.

## Current Structure and Root Cause
For every streamed event with TTS enabled, `StreamPipeline.process(...)` created an inline nested coroutine:
- closure captured `event`, `tts_service`, and `task`
- `finally` block removed the task from `_pending_tts_tasks`

This introduced avoidable per-event closure allocations and mixed TTS execution, error handling, and task cleanup logic inside one nested function.

Root cause: TTS background scheduling used ad-hoc inline closures instead of stable class methods with done callbacks.

## Refactor Plan
1. Extract TTS execution into a dedicated method (`_run_tts_event(...)`).
2. Extract pending-set cleanup into a dedicated done callback (`_on_tts_task_done(...)`).
3. Keep existing behavior:
  - text transport remains non-blocking relative to TTS
  - TTS failures are logged and swallowed
  - `wait_for_pending_tts()` still waits for tracked tasks
4. Add focused unit tests for scheduling and failure-isolation behavior.

## Implemented Changes
### 1) Stable TTS execution method
- Added `_run_tts_event(event, tts_service)`:
  - calls `tts_processor.process_event(...)`
  - logs and swallows exceptions

### 2) Done callback cleanup
- Added `_on_tts_task_done(task)`:
  - removes completed task from `_pending_tts_tasks`

### 3) Process-path rewiring
- Updated `process(...)` TTS branch to:
  - schedule `asyncio.create_task(self._run_tts_event(...))`
  - add task to `_pending_tts_tasks`
  - attach `task.add_done_callback(self._on_tts_task_done)`

This removes per-event nested function allocation and clarifies responsibility boundaries.

### 4) Regression coverage
- Added new test module:
  - `tests/backend/test_stream_pipeline.py`
- Tests:
  - `test_process_schedules_tts_in_background_and_tracks_pending_tasks`
  - `test_process_swallows_tts_failures_and_cleans_pending_tasks`

## Validation
Ran:

```bash
./scripts/python-in-env backend pytest tests/backend/test_stream_pipeline.py
./scripts/python-in-env backend pytest tests/backend/test_api_handlers.py
```

Results:
- `2 passed`
- `24 passed`

This confirms no behavior regression while reducing allocation churn in the streaming TTS path.

---

# Refactor: Prune Completed WebSocket Tasks Before Concurrency Checks

## Target
Prevent false task-limit rejections in:
- `backend/src/api/routes/websocket/task_manager.py`

This is a correctness + performance refactor in the WebSocket request scheduler hot path.

## Current Structure and Root Cause
`TaskManager.create_task_if_under_limit(...)` enforced limits using:
- `len(self.active_tasks) >= self.max_concurrent_tasks`

but did not prune completed tasks first.

In normal flow, completed tasks are removed by `task_done_callback`, but callback cleanup can be delayed (or intentionally disabled in edge cases/tests). When that happens, stale done tasks inflate `active_tasks`, causing:
- unnecessary "task limit exceeded" rejections
- avoidable coroutine closes
- underutilization of available concurrency

Root cause: concurrency checks were coupled to a set that can temporarily contain completed tasks.

## Refactor Plan
1. Introduce a shared done-task pruning helper in `TaskManager`.
2. Call pruning inside `create_task_if_under_limit(...)` while holding `tasks_lock`, before limit checks.
3. Reuse the same helper in `cleanup(...)` to remove duplicated prune logic.
4. Keep external API unchanged (`(task | None, limit_exceeded)` contract).
5. Add regression coverage for stale-done-task scheduling.

## Implemented Changes
### 1) Shared prune helper
- Added:
  - `TaskManager._prune_done_tasks_locked()`
- File:
  - `backend/src/api/routes/websocket/task_manager.py`

This helper removes completed tasks and returns prune count.

### 2) Scheduler path improvement
- Updated `create_task_if_under_limit(...)` to:
  - prune done tasks first (under lock)
  - then enforce max-concurrency limit

This ensures stale completed tasks do not consume concurrency slots.

### 3) Cleanup deduplication
- Updated `cleanup(...)` to call `_prune_done_tasks_locked()` instead of open-coded set filtering.

## Regression Coverage
- Added test:
  - `test_create_task_if_under_limit_prunes_done_tasks_before_limit_check`
- File:
  - `tests/backend/test_websocket_task_manager.py`

The test simulates delayed callback cleanup by overriding `task_done_callback`, then verifies scheduling still accepts a new task after pruning stale done tasks.

## Validation
Ran:

```bash
./scripts/python-in-env backend pytest tests/backend/test_websocket_task_manager.py
./scripts/python-in-env backend pytest tests/backend/test_websocket_route.py
```

Results:
- `10 passed`
- `1 passed`

This confirms behavior is preserved while removing false task-limit pressure from stale completed tasks.

---

# Refactor: Avoid Redundant Transcript Session Persistence on Every Stream Event

## Target
Reduce redundant storage/event churn in:
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`

This is a performance + maintainability refactor in the renderer transcript session path.

## Current Structure and Root Cause
`useChatStream` calls `updateTranscriptSession(...)` for each backend event, including high-frequency `streaming-response` chunks.

Before this refactor, both session update entry points:
- `updateTranscriptSession(...)`
- `setActiveConversationRef(...)`

always did:
1. `persistSessionInfoToStorage(info)` (`sessionStorage.setItem`)
2. `emitSessionUpdateEvent(info)` (DOM custom event dispatch)
3. `flushPendingMessages()`

even when `conversationRef` and `userId` were unchanged.

Root cause: persistence/event side effects were not guarded by session identity changes.

## Refactor Plan
1. Add a small session-diff helper to detect whether session identity actually changed.
2. Keep current APIs unchanged.
3. Keep pending flush behavior unchanged (important for retry paths).
4. Persist to storage + emit event only when session info changed.
5. Add frontend regression tests to prove:
  - unchanged updates do not re-persist/re-emit
  - existing retry/flush behavior remains intact

## Implemented Changes
### 1) Session-change guard
- Added:
  - `sessionInfoChanged(previous, next)`
  - `persistAndEmitSessionInfoIfChanged(previous, next)`
- File:
  - `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`

### 2) Rewired update paths
- Updated both:
  - `updateTranscriptSession(...)`
  - `setActiveConversationRef(...)`

They now:
1. read previous session info
2. apply session update
3. persist/emit only when changed
4. always run `flushPendingMessages()` (unchanged behavior)

### 3) Regression test coverage
- Added test:
  - `skips redundant persistence and session-update events when session info is unchanged`
- File:
  - `tests/frontend/TranscriptWriter.test.ts`

This test asserts:
- only one `transcript-session-update` event is emitted across repeated identical updates
- only one `sessionStorage.setItem` call occurs across those no-op updates

## Validation
Ran:

```bash
./scripts/python-in-env frontend bash -lc "cd frontend && npm run test -- tests/frontend/TranscriptWriter.test.ts"
./scripts/python-in-env frontend bash -lc "cd frontend && npm run test -- tests/frontend/ChatStreamThinkingStatus.test.tsx"
```

Results:
- `TranscriptWriter`: 17 passed
- `ChatStreamThinkingStatus`: 27 passed

This confirms behavior is preserved while removing high-frequency redundant persistence/event work during streaming.

---

# Refactor: Centralize WebSocket Handshake Failure Handling

## Target
Deduplicate handshake failure policy in:
- `backend/src/api/routes/websocket/connection.py`

This is a maintainability refactor on the WebSocket connection entry path.

## Current Structure and Root Cause
`perform_handshake(...)` had three separate `except` branches:
- `PydanticValidationError`
- `json.JSONDecodeError`
- generic `Exception`

Each branch duplicated the same control flow:
1. log handshake failure
2. close socket with policy-violation code via `_close_policy_violation(...)`
3. return `None`

Root cause: handshake failure policy (log + close + fail) lived inline per exception branch instead of being centralized.

## Refactor Plan
1. Add a shared helper for handshake failure handling.
2. Keep severity split:
  - validation/JSON failures -> warning
  - unexpected runtime failures -> error
3. Rewire all handshake exception branches to use helper.
4. Keep handshake API unchanged (`str | None` return contract).
5. Add regression assertions for warning-vs-error logging behavior and run connection tests.

## Implemented Changes
### Shared failure helper
- Added `_fail_handshake(...)` in:
  - `backend/src/api/routes/websocket/connection.py`

Responsibilities:
- log with correct severity based on `validation_error`
- close socket via `_close_policy_violation(...)`

### Handshake rewiring
- Updated all `perform_handshake(...)` exception branches to delegate to `_fail_handshake(...)`.
- Success path and return contract were preserved.

### Regression coverage
- Added:
  - `test_perform_handshake_validation_failure_logs_warning`
  - `test_perform_handshake_unexpected_failure_logs_error`
- File:
  - `tests/backend/test_websocket_connection.py`

These tests verify log severity routing while preserving close-on-failure behavior.

## Validation
Ran:

```bash
./scripts/python-in-env backend pytest tests/backend/test_websocket_connection.py
```

Result:
- `15 passed`

This confirms handshake behavior is unchanged while removing duplicated failure policy code.

---

# Refactor: Centralize WebSocket Error-Response Fallback Handling

## Target
Remove duplicated error-send fallback logic in:
- `backend/src/api/routes/websocket/message_handler.py`

This is a maintainability refactor on a central routing path.

## Current Structure and Root Cause
`handle_message(...)` had duplicated `try/except` blocks in both error branches:
- `ValueError` branch (safe client-facing errors)
- generic `Exception` branch (sanitized internal errors)

Each branch repeated:
1. call `send_error(...)`
2. catch socket-write failures
3. log fallback failure with branch-specific severity/message

Root cause: fallback policy (don’t raise if socket send fails) was implemented inline per branch instead of as a shared helper.

## Refactor Plan
1. Add one helper to send client errors with fallback logging.
2. Rewire both `handle_message` error branches to use that helper.
3. Preserve current external behavior:
  - `ValueError` sends raw message
  - unexpected exceptions send sanitized message
  - socket-send failures are swallowed and logged
4. Add regression assertions for logging severity on fallback failures.
5. Run websocket message-handler tests.

## Implemented Changes
### Shared fallback helper
- Added `_send_error_with_fallback_logging(...)` in:
  - `backend/src/api/routes/websocket/message_handler.py`

Helper responsibilities:
- sends error via `send_error(...)`
- catches send failures
- logs `warning` for non-critical path and `error` for critical path
- never re-raises

### `handle_message(...)` rewiring
- `ValueError` path now delegates to helper with `critical=False`.
- generic `Exception` path still sanitizes message via `sanitize_error_message(...)`, then delegates with `critical=True`.

No interface changes were made to `handle_message(...)` or `send_error(...)`.

### Regression coverage
- Updated `tests/backend/test_websocket_message_handler.py` to assert:
  - fallback send failure in `ValueError` path logs `warning` (not `error`)
  - fallback send failure in unexpected-error path logs `error` (not `warning`)

## Validation
Ran:

```bash
./scripts/python-in-env backend pytest tests/backend/test_websocket_message_handler.py
```

Result:
- `19 passed`

This confirms behavior is preserved while removing duplicated fallback policy code.

---

# Refactor: Centralize Conversation SQL Clauses in LocalMemoryStore

## Target
Remove duplicated `conversation_id` SQL branching in:
- `frontend/src/main/python/memory/local_store.py`

This is a maintainability refactor in a high-churn sidecar memory module.

## Current Structure and Root Cause
Several `LocalMemoryStore` methods had duplicated `if conversation_id is None` SQL branches:
- `delete_conversation(...)`
- `get_next_message_index(...)`
- `get_episodic_memories_by_conversation(...)`
- `get_unsemanticized_episodic_memories_by_conversation(...)`

Each method duplicated two query variants:
- `conversation_id IS NULL`
- `conversation_id = ?`

Root cause: conversation-window predicate construction was inlined at each call site instead of being centralized as shared query policy.

## Refactor Plan
1. Add one helper that returns canonical SQL predicate + params for conversation filters.
2. Replace duplicated `if conversation_id is None` SQL branches in the four methods.
3. Keep method signatures and output contracts unchanged.
4. Add regression coverage for NULL-conversation deletion path.
5. Run focused sidecar tests for local store + summarizer flows.

## Implemented Changes
### Shared query helper
- Added `LocalMemoryStore._conversation_where_clause(conversation_id)` returning:
  - `"conversation_id IS NULL", ()` for `None`
  - `"conversation_id = ?", (conversation_id,)` otherwise

### Method rewiring
- Replaced duplicated branches in:
  - `delete_conversation(...)`
  - `get_next_message_index(...)`
  - `get_episodic_memories_by_conversation(...)`
  - `get_unsemanticized_episodic_memories_by_conversation(...)`

The methods now build SQL once using the shared clause and parameter tuple.

### Regression coverage
- Added `test_delete_conversation_with_null_conversation_id_clears_faiss_artifacts_when_empty` in:
  - `tests/sidecar/test_local_store_delete_cleanup.py`

This validates the `conversation_id IS NULL` deletion path still:
- deletes rows
- clears in-memory vector mappings
- resets FAISS artifacts when index becomes empty

## Validation
Ran:

```bash
./scripts/python-in-env sidecar pytest tests/sidecar/test_local_store_delete_cleanup.py tests/sidecar/test_memory_summarizer.py
```

Result:
- `13 passed, 3 warnings`

This confirms behavior remains stable after query-clause centralization.

---

# Refactor: Reuse Parsed Event Type in QueryExecutionService Stream Loop

## Target
Reduce repeated per-event parsing in:
- `backend/src/api/services/query_execution.py`

This is a performance + maintainability refactor on a central hot path (query streaming loop).

## Current Structure and Root Cause
Inside `QueryExecutionService.execute()`, each streamed event was repeatedly re-parsed:
- `_is_non_empty_text_chunk(event)` called `_extract_event_type(event)`
- `_extract_assistant_full_text(event)` called `_extract_event_type(event)` again
- `_is_streaming_complete_event(event)` called `_extract_event_type(event)` again
- `_is_error_event(event)` called `_extract_event_type(event)` again

Root cause: event classification helpers did their own type extraction instead of reusing a single parsed event type in the loop. On long streaming responses, this multiplies dict/attribute lookups and adds avoidable CPU overhead.

## Refactor Plan
1. Parse `event_type` once per streamed event in `execute()`.
2. Introduce a helper that returns non-empty chunk text with optional precomputed `event_type`.
3. Update assistant/completion text extractors to accept optional precomputed `event_type`.
4. Switch terminal/error checks in the loop to direct `event_type` comparisons.
5. Add focused regression coverage for the new helper behavior and run backend handler tests.

## Implemented Changes
### Stream-loop optimization
- Updated `execute()` in `backend/src/api/services/query_execution.py` to:
  - compute `event_type` once per event
  - reuse it for chunk, assistant-full, terminal, and error logic
  - pass precomputed type into completion-text resolution

### Helper consolidation
- Added `_TEXT_CHUNK_EVENT_TYPES` constant.
- Added `QueryExecutionService._extract_non_empty_chunk_text(...)`.
- Updated these methods to accept optional precomputed event type:
  - `_extract_assistant_full_text(...)`
  - `_extract_streaming_complete_text(...)`
  - `_resolve_completion_text(...)`

Behavior was intentionally preserved; only repeated parsing work was removed.

### Regression coverage
- Added `test_query_execution_extract_non_empty_chunk_text_respects_precomputed_event_type` in:
  - `tests/backend/test_api_handlers.py`

The test validates chunk extraction behavior when `event_type` is precomputed, including payload-text extraction, whitespace-only chunk filtering, and non-chunk event rejection.

## Validation
Ran:

```bash
./scripts/python-in-env backend pytest tests/backend/test_api_handlers.py
```

Result:
- `24 passed`

This confirms query handler behavior remains stable after stream-loop refactoring.

---

# Refactor: Short-Circuit Empty LocalMemoryStore Searches

## Target
Remove unnecessary embedding generation in:
- `frontend/src/main/python/memory/local_store.py`

This is a performance refactor for the sidecar memory-recall hot path.

## Current Structure and Root Cause
`LocalMemoryStore.search()` always generated a query embedding before checking whether any searchable FAISS index existed.

Flow before refactor:
1. Parse type filters.
2. Always call `embedder.embed_text(query)`.
3. Attempt per-database search, where each branch may immediately return because index is empty.

Root cause: search target selection and index-availability checks happened after embedding creation, so the expensive remote embedding call ran even when no memory vectors were available to search.

## Refactor Plan
1. Keep existing filter behavior (`episodic`/`semantic`/both).
2. Precompute searchable targets first (respecting filters and index readiness).
3. Return early when no searchable targets exist.
4. Generate query embeddings only when at least one searchable target is present.
5. Add a regression test proving no embedding call happens on empty-index searches.

## Implemented Changes
### Search planning update
- Updated `LocalMemoryStore.search()` to:
  - log search start
  - build searchable targets first
  - short-circuit with `[]` when no indices are searchable
  - defer embedding generation until after target selection

### New helper
- Added `LocalMemoryStore._build_search_targets(...)` to centralize:
  - memory-type filter application
  - index availability checks
  - per-database search target construction

### Regression coverage
- Added `test_search_short_circuits_without_embedding_when_no_searchable_indices` in:
  - `tests/sidecar/test_local_store_delete_cleanup.py`

The test installs an embedder that raises if called, then verifies `search()` returns `[]` when both indices are unavailable.

## Validation
Ran:

```bash
./scripts/python-in-env sidecar pytest tests/sidecar/test_local_store_delete_cleanup.py tests/sidecar/test_memory_service.py
```

Result:
- `18 passed, 3 warnings`

This confirms the refactor preserves behavior while removing unnecessary embedding work on empty-index paths.

---

# Refactor: Consolidate Sidecar Memory Search/Store Transformations

## Target
Deduplicate memory request transformation logic that existed in both:
- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/memory_service.py`

This is a maintainability refactor focused on reducing duplicated business logic in central sidecar services.

## Current Structure and Root Cause
The codebase has two Python sidecar services that both interact with `LocalMemoryStore`:
- `local_backend.py` (full JSON-RPC sidecar)
- `memory_service.py` (minimal memory-only sidecar)

Before this refactor, both services independently reimplemented the same logic for:
- building `{"type": ...}` filters from `memory_type`
- grouping raw memory rows into `{"semantic": [...], "episodic": [...]}`
- formatting interaction content as `User: ...\nAssistant: ...`
- building memory metadata with `type/source/conversation_id`

`local_backend.py` also had one extra variant for excluding active conversation episodic rows.

Root cause: the transformation rules lived at call sites instead of a shared module. That increases drift risk (one service changes behavior, the other silently diverges) and makes tests less focused because the same rules are asserted through two unrelated entrypoints.

## Refactor Plan
1. Introduce a shared helper module in `frontend/src/main/python/memory/`.
2. Move common transformation logic into pure helper functions.
3. Replace duplicated inline logic in both sidecar services with helper calls.
4. Keep API response/error shapes unchanged so callers do not break.
5. Run sidecar tests covering both services.

## Implemented Changes
### New shared module
- Added `frontend/src/main/python/memory/operations.py` with:
  - `build_memory_filters(memory_type)`
  - `exclude_conversation_results(results, conversation_id)`
  - `group_memory_texts(results)`
  - `format_interaction_memory(user_query, assistant_response)`
  - `build_interaction_metadata(memory_type, session_id)`

### Service rewiring
- Updated `frontend/src/main/python/local_backend.py` to use shared helpers in:
  - `_handle_search_memory()`
  - `_handle_store_memory()`
- Updated `frontend/src/main/python/memory_service.py` to use shared helpers in:
  - `handle_search()`
  - `handle_store()`

No request/response schema changes were introduced.

## Validation
Ran:

```bash
./scripts/python-in-env sidecar pytest tests/sidecar/test_local_backend.py tests/sidecar/test_memory_service.py
```

Result:
- `37 passed, 3 warnings`

This confirms existing behavior for memory search/store flows remains intact after the refactor.

---

# Refactor: Consolidate Sidecar Shutdown/Signal Runtime Logic

## Target
Deduplicate graceful-shutdown and signal forwarding logic duplicated in:
- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/memory_service.py`

## Current Structure and Root Cause
Both sidecar entrypoints had near-identical implementations for:
- marking `_shutdown_requested` and stopping main loops
- closing `stdin` to unblock `readline()` loops
- logging and forwarding `SIGINT`/`SIGTERM` to active service instances
- registering shutdown signal handlers in `main()`

Root cause: lifecycle/runtime concerns were embedded directly inside each service module instead of a shared sidecar-runtime utility. This made behavior changes error-prone because shutdown semantics had to be updated in multiple places.

## Refactor Plan
1. Extract shared shutdown/signal helpers into `frontend/src/main/python/core/`.
2. Replace duplicated logic in both service modules with helper calls.
3. Preserve existing service interfaces (`request_shutdown()`, module-level `signal_handler()`, `main()` flow).
4. Add focused unit tests for the new helper module and run existing sidecar service tests.

## Implemented Changes
### New shared runtime helper
- Added `frontend/src/main/python/core/runtime_shutdown.py`:
  - `request_stdin_shutdown(service, logger, signum)`
  - `handle_shutdown_signal(signum, active_service, logger)`
  - `register_shutdown_signal_handlers(handler)`

### Rewired sidecar services
- Updated `frontend/src/main/python/local_backend.py`:
  - `request_shutdown()` now delegates to `request_stdin_shutdown(...)`
  - `signal_handler()` now delegates to `handle_shutdown_signal(...)`
  - `main()` now uses `register_shutdown_signal_handlers(...)`
- Updated `frontend/src/main/python/memory_service.py` with the same delegation pattern.

### Added test coverage
- Added `tests/sidecar/test_runtime_shutdown.py` to verify:
  - stdin shutdown marking + close behavior
  - idempotent shutdown request behavior
  - signal forwarding behavior with/without active service
  - signal handler registration for `SIGINT`/`SIGTERM`

## Validation
Ran:

```bash
./scripts/python-in-env sidecar pytest tests/sidecar/test_local_backend.py tests/sidecar/test_memory_service.py tests/sidecar/test_runtime_shutdown.py
```

Result:
- `42 passed, 3 warnings`

This confirms the refactor preserved existing sidecar behavior while reducing duplicated lifecycle logic.

---

# Refactor: Centralize LocalBackend Memory-Store Guarding

## Target
Remove repeated memory-store availability checks across `LocalBackend` memory handlers in:
- `frontend/src/main/python/local_backend.py`

## Current Structure and Root Cause
`LocalBackend` had the same early-return guard duplicated in eight handlers:
- `_handle_search_memory`
- `_handle_list_conversations`
- `_handle_get_conversation`
- `_handle_list_semantic_memories`
- `_handle_delete_conversation`
- `_handle_delete_semantic_memory`
- `_handle_store_transcript`
- `_handle_store_memory`

Each repeated:

```python
if not self.memory_store:
    return {"success": False, "error": "Memory store not initialized"}
```

Root cause: precondition enforcement was implemented inline at each call site instead of being expressed as shared handler policy.

## Refactor Plan
1. Add a reusable async decorator for memory handlers (`requires_memory_store`).
2. Add one canonical response builder (`_memory_store_not_initialized_response`) to preserve response shape/message consistency.
3. Apply the decorator to all memory handlers that require the store.
4. Remove duplicated inline guards.
5. Add a regression test for one previously untested handler and rerun sidecar tests.

## Implemented Changes
### Shared guard policy in `LocalBackend`
- Added `requires_memory_store` decorator in `frontend/src/main/python/local_backend.py`.
- Added `LocalBackend._memory_store_not_initialized_response()`.
- Decorated the eight memory handlers listed above and removed duplicated inline guards.

Result:
- Memory-store precondition logic now lives in one place.
- Reduced duplicated guard blocks from 8 to 0.
- Error response contract remains unchanged.

### Test coverage
- Added `test_handle_list_conversations_fails_without_store` in:
  - `tests/sidecar/test_local_backend.py`

## Validation
Ran:

```bash
./scripts/python-in-env sidecar pytest tests/sidecar/test_local_backend.py tests/sidecar/test_memory_service.py tests/sidecar/test_runtime_shutdown.py
```

Result:
- `43 passed, 3 warnings`

This confirms the refactor did not break existing sidecar behavior and preserved memory error response semantics.

---

# Refactor: Unify LocalBackendBridge Process-Termination Cleanup

## Target
Deduplicate sidecar process-teardown logic in:
- `frontend/src/main/local_backend_bridge.cjs`

## Current Structure and Root Cause
`startLocalBackend()` had duplicated teardown logic in both process event handlers:
- `pythonProcess.on('exit', ...)`
- `pythonProcess.on('error', ...)`

Both handlers repeated state-reset + cleanup steps:
- clear `pythonProcess`, `isPythonReady`, `readinessCheckCallback`
- reject all in-flight requests
- clear `stdoutBuffer`

The only differences were:
- reject reason (`exited` vs `error`)
- renderer status error message content

Root cause: process lifecycle cleanup policy was encoded directly in each event callback instead of centralized runtime helper functions.

## Refactor Plan
1. Extract shared teardown helper to reset bridge state and reject pending requests.
2. Extract shared status-notification helper for `local-backend-status`.
3. Rewire both `exit` and `error` callbacks to use helpers.
4. Preserve existing event semantics and error messages.
5. Add focused frontend bridge tests for both termination paths.

## Implemented Changes
### Shared helpers added in bridge module
- Added `resetBackendProcessState(reason)`:
  - resets bridge runtime state
  - rejects pending RPC requests with provided reason
- Added `notifyBackendUnavailable(mainWindow, error)`:
  - emits `local-backend-status` only when an error message exists

### Event handlers simplified
- `pythonProcess.on('exit', ...)` now:
  - calls `resetBackendProcessState('Local backend process exited')`
  - computes optional non-zero exit error
  - calls `notifyBackendUnavailable(...)`
- `pythonProcess.on('error', ...)` now:
  - calls `resetBackendProcessState('Local backend process error')`
  - preserves existing ENOENT-friendly message behavior
  - calls `notifyBackendUnavailable(...)`

Result:
- removed duplicated cleanup logic from both termination paths
- centralized sidecar bridge teardown policy in one location
- no interface or payload shape changes

### Added test coverage
- Updated `tests/frontend/LocalBackendBridge.test.cjs` with:
  - `sidecar non-zero exit reports unavailable status`
  - `execute-tool rejects in-flight request when sidecar emits process error`

## Validation
Ran:

```bash
cd frontend && npm run test -- LocalBackendBridge.test.cjs
```

Result:
- `13 passed, 0 failed`

This confirms bridge behavior remains intact while reducing duplicated process-lifecycle code.

---

# Refactor: Remove Per-Request Async Introspection in JSON-RPC Dispatch

## Target
Optimize central JSON-RPC dispatch path in:
- `frontend/src/main/python/core/ipc_protocol.py`

## Current Structure and Root Cause
`JSONRPCProtocol.handle_request()` previously did async dispatch detection on every request:
- dynamic `import asyncio` inside handler execution path
- `asyncio.iscoroutinefunction(handler)` checked for each call

This logic runs on every JSON-RPC request from Electron to the sidecar.  
Root cause: method metadata (callable/async callable) was inferred at execution time instead of registration time.

## Refactor Plan
1. Add registration-time dispatch metadata for each method.
2. Compute `is_callable` and `is_async_callable` once in `register_method()`.
3. Use precomputed metadata in `handle_request()` for fast dispatch.
4. Keep request/response behavior unchanged.
5. Add regression coverage for sync success path and run sidecar tests.

## Implemented Changes
### Protocol dispatch metadata
- Added `RegisteredMethod` dataclass in `frontend/src/main/python/core/ipc_protocol.py`.
- Changed `self.methods` to store `RegisteredMethod` entries.
- `register_method()` now computes:
  - `is_callable`
  - `is_async_callable`
- `handle_request()` now dispatches using precomputed metadata.

### Behavior preservation details
- Method lookup now checks `registered_method is None` (explicit missing-key check).
- Error/response contracts are unchanged.
- No external interface changes for call sites (`register_method`, `handle_request`, `process_line`, `send_response`).

## Added Test Coverage
- Added `test_handle_request_success_sync` in:
  - `tests/sidecar/test_json_rpc_protocol.py`

## Validation
Ran:

```bash
./scripts/python-in-env sidecar pytest tests/sidecar/test_json_rpc_protocol.py tests/sidecar/test_local_backend.py
```

Result:
- `34 passed, 3 warnings`

This confirms the protocol refactor preserved sidecar behavior while removing repeated async introspection overhead from the request hot path.

---

# Refactor: Centralize Sidecar JSON Line Output Encoding

## Target
Remove duplicated stdout JSON-line serialization/write logic across:
- `frontend/src/main/python/core/ipc_protocol.py`
- `frontend/src/main/python/memory_service.py`

## Current Structure and Root Cause
Before this refactor, both modules implemented their own UTF-8 JSON write blocks:
- JSON-RPC path: `JSONRPCProtocol.send_response()`
- Memory service path: 3 separate write blocks in `MemoryService.run()` (success + two error paths)

Each path repeated:
- `json.dumps(..., ensure_ascii=False)`
- append newline
- encode to UTF-8 bytes
- write to `sys.stdout.buffer`
- flush buffer

Root cause: output transport concerns were implemented independently per module instead of a shared sidecar output utility.

## Refactor Plan
1. Add one shared writer utility in `core/` for JSON-line stdout writes.
2. Replace all duplicated output blocks in JSON-RPC and memory service paths.
3. Keep output format identical (UTF-8, newline-delimited JSON, flush-on-write).
4. Add focused unit coverage for the shared writer.
5. Run sidecar protocol/memory tests.

## Implemented Changes
### New shared utility
- Added `frontend/src/main/python/core/stdout_json.py`:
  - `write_json_line(payload)`

### Rewired call sites
- `frontend/src/main/python/core/ipc_protocol.py`
  - `send_response()` now delegates to `write_json_line(response)`
- `frontend/src/main/python/memory_service.py`
  - `run()` now uses `write_json_line(...)` for:
    - normal response output
    - invalid-JSON error output
    - unexpected processing error output

Result:
- removed duplicated serialization/write blocks across sidecar output paths
- standardized one canonical JSON line transport implementation
- preserved external protocol behavior

## Added Test Coverage
- Added `tests/sidecar/test_stdout_json.py`:
  - verifies UTF-8 JSON bytes with newline and flush behavior

## Validation
Ran:

```bash
./scripts/python-in-env sidecar pytest tests/sidecar/test_json_rpc_protocol.py tests/sidecar/test_memory_service.py tests/sidecar/test_stdout_json.py
```

Result:
- `24 passed, 3 warnings`

This confirms output-path refactoring preserved sidecar behavior while reducing duplicated serialization logic.

---

# Refactor: Table-Driven LocalBackendBridge IPC-to-RPC Mapping

## Target
Reduce duplicated request-mapping logic in:
- `frontend/src/main/local_backend_bridge.cjs`

Specifically, refactor the repeated IPC handler payload-to-RPC-param translation for memory/conversation handlers.

## Current Structure and Root Cause
Before this refactor, each IPC handler used hand-written inline mapper lambdas:
- `list-conversations`
- `get-conversation`
- `list-semantic-memories`
- `delete-conversation`
- `delete-semantic-memory`
- `store-memory`
- `store-transcript`
- plus a one-off `search-memory` mapper with alias handling

Root cause: parameter translation policy lived in many handler-local lambdas, so adding/changing one field required touching multiple ad hoc code blocks. This increases maintenance churn in a central module and makes mapping drift easier.

## Refactor Plan
1. Add one shared payload-mapping utility for IPC payloads.
2. Add one table-driven registration utility for RPC handlers.
3. Convert inline per-handler mappers into declarative field maps.
4. Keep IPC channel names, RPC method names, and payload shapes unchanged.
5. Add tests for previously uncovered mappings and run bridge tests.

## Implemented Changes
### Shared mapper utilities
- Added in `frontend/src/main/local_backend_bridge.cjs`:
  - `getPayloadObject(payload)`
  - `mapPayloadParams(payload, fieldMap)`
  - `registerMappedRpcHandlers(registerRpcHandler, definitions)`

### Handler registration rewrite
- Replaced seven inline `registerRpcHandler(..., mapParams)` lambdas with one declarative definition table and `registerMappedRpcHandlers(...)`.
- Reworked `search-memory` payload mapping to use `mapPayloadParams(...)`, preserving `excludeConversationId`/`exclude_conversation_id` alias behavior.
- Preserved existing null-coalescing behavior for `conversation_id` on conversation handlers.

Result:
- Centralized IPC-to-RPC field mapping logic in one reusable utility path.
- Reduced repetitive mapping boilerplate in a high-churn bridge module.
- Kept runtime behavior and API contracts unchanged.

## Added Test Coverage
- Updated `tests/frontend/LocalBackendBridge.test.cjs`:
  - `get-conversation handler maps missing conversationId to null`
  - `store-memory handler maps payload keys to backend params`

## Validation
Ran:

```bash
cd frontend && npm run test -- --runTestsByPath ../tests/frontend/LocalBackendBridge.test.cjs
```

Result:
- `1 passed` test suite
- `17 passed` tests

This confirms the mapping refactor preserved bridge handler behavior while consolidating duplicated translation logic.

---

# Refactor: Centralize IPC Query Memory-Section Rendering

## Target
Remove duplicated memory XML rendering/fallback logic in:
- `frontend/src/main/ipc.cjs`

Specifically in the high-churn query-enrichment path that builds `<episodic_memory>` and `<semantic_memory>` blocks.

## Current Structure and Root Cause
Before this refactor, `ipc.cjs` built memory sections inline with duplicated branches:
- one branch when memory search returned valid memories
- another branch when memory search failed or payload shape was invalid

Both branches repeated:
- emitting section tags for episodic + semantic memory
- rendering list items with XML escaping
- emitting `None` fallback sections

Root cause: memory-section formatting policy lived directly in the event-handler control flow instead of dedicated helpers.

## Refactor Plan
1. Introduce pure helpers for memory section formatting.
2. Reuse those helpers in both success and fallback branches.
3. Keep query payload contract unchanged (`payload.content`, tags, fallback behavior).
4. Add regression coverage for malformed memory responses.
5. Run targeted IPC bridge tests.

## Implemented Changes
### New helper utilities in IPC bridge
- Added in `frontend/src/main/ipc.cjs`:
  - `formatMemorySection(tagName, entries)`
  - `appendMemorySections(parts, memories = null)`

### Query-enrichment cleanup
- Replaced duplicated inline XML section construction in the `type === 'query'` branch with helper calls.
- Preserved behavior:
  - valid memory arrays render bullet items
  - missing/invalid memory data renders `None` sections
  - tags and section names are unchanged

Result:
- one canonical implementation for memory-section rendering
- reduced duplication and branch complexity in a central module
- unchanged external message schema and backend contract

## Added Test Coverage
- Updated `tests/frontend/IpcMainBridge.test.cjs`:
  - `builds query with empty memories when search response is malformed`

## Validation
Ran:

```bash
cd frontend && npm run test -- --runTestsByPath ../tests/frontend/IpcMainBridge.test.cjs
```

Result:
- `1 passed` test suite
- `17 passed` tests

This confirms the refactor preserved query-enrichment behavior while consolidating duplicated memory-section logic.

---

# Refactor: Unify WebSocket JSON Parse Policy and Remove Unconditional Handshake Offload

## Target
Consolidate duplicated WebSocket JSON parsing policy across:
- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/message_handler.py`

## Current Structure and Root Cause
Before this refactor:
- `message_handler.py` used size-aware parsing (inline for small payloads, thread-pool offload for large payloads).
- `connection.py` always offloaded handshake JSON parsing to `run_in_executor`, even for very small handshake payloads.

Root cause: JSON parsing policy lived in two separate call sites with different behavior. This caused:
- unnecessary per-connection executor scheduling overhead on normal handshake traffic
- duplicated policy logic in a central route path
- drift risk when parse thresholds or behavior change

## Refactor Plan
1. Add a shared WebSocket JSON parse utility module with threshold-based offload behavior.
2. Rewire both handshake and message parsing to use the shared utility.
3. Keep all validation/error contracts unchanged.
4. Add handshake parse-policy tests (inline + offload) and rerun websocket route tests.

## Implemented Changes
### New shared utility
- Added `backend/src/api/routes/websocket/json_parse.py`:
  - `DEFAULT_JSON_PARSE_OFFLOAD_BYTES = 64 * 1024`
  - `parse_json_payload(data, offload_threshold_bytes, loop_getter)`

### Rewired call sites
- `backend/src/api/routes/websocket/message_handler.py`
  - now uses `parse_json_payload(...)` for inbound message parsing
  - keeps `_JSON_PARSE_OFFLOAD_BYTES` behavior and existing error responses
- `backend/src/api/routes/websocket/connection.py`
  - now uses `parse_json_payload(...)` for handshake parsing
  - adds `_HANDSHAKE_JSON_PARSE_OFFLOAD_BYTES`
  - preserves existing handshake validation + close-on-error behavior

Result:
- one canonical parse/offload policy for websocket route modules
- removed unconditional handshake executor offload for small payloads
- reduced duplication and divergence risk in central connection/message code paths

## Added Test Coverage
- Updated `tests/backend/test_websocket_connection.py`:
  - `test_perform_handshake_small_payload_parses_inline`
  - `test_perform_handshake_large_payload_uses_executor`

## Validation
Ran:

```bash
./scripts/python-in-env backend pytest tests/backend/test_websocket_connection.py tests/backend/test_websocket_message_handler.py
```

Result:
- `24 passed in 0.30s`

This confirms the shared parse refactor preserved websocket behavior while reducing duplicated JSON parse policy and avoiding unnecessary handshake offload work.

---

# Refactor: Remove Per-Completion Cleanup Task Allocation in WebSocket TaskManager

## Target
Simplify and optimize task-completion cleanup in:
- `backend/src/api/routes/websocket/task_manager.py`

## Current Structure and Root Cause
Before this refactor, each completed handler task triggered:
1. `task_done_callback(...)`
2. `asyncio.get_running_loop()`
3. `loop.create_task(self._remove_task_safely(task))`
4. async lock acquisition inside `_remove_task_safely(...)`

Root cause: done-task removal used an extra asynchronous cleanup coroutine, even though callback execution already happens on the event loop thread and only needs an in-place `set.discard`. This added avoidable per-task scheduling overhead and extra callback complexity.

## Refactor Plan
1. Remove `_remove_task_safely(...)` helper coroutine.
2. Make `task_done_callback(...)` discard completed tasks directly.
3. Keep shutdown edge-case protection (`RuntimeError`) and rely on `cleanup()` deterministic done-task pruning.
4. Update tests to validate callback behavior without event-loop lookup.
5. Run websocket task-manager and route test suites.

## Implemented Changes
### TaskManager cleanup path simplification
- Updated `backend/src/api/routes/websocket/task_manager.py`:
  - removed `_remove_task_safely(...)`
  - rewired `task_done_callback(...)` to perform direct `self.active_tasks.discard(task)`
  - retained defensive `RuntimeError` handling for shutdown/iteration edge cases

Result:
- removed one background task allocation per completed websocket handler task
- reduced callback complexity and lock/scheduling overhead
- preserved external TaskManager interface and cleanup semantics

## Added Test Coverage
- Updated `tests/backend/test_websocket_task_manager.py`:
  - `test_task_done_callback_removes_task_without_event_loop_lookup`

## Validation
Ran:

```bash
./scripts/python-in-env backend pytest tests/backend/test_websocket_connection.py tests/backend/test_websocket_message_handler.py tests/backend/test_websocket_task_manager.py
```

Result:
- `31 passed in 0.32s`

This confirms the refactor preserved websocket task lifecycle behavior while reducing per-completion scheduler overhead.

---

# Refactor: Extract IPC Query Enrichment Builder from Main Bridge

## Target
Separate query-content enrichment orchestration from transport/event handling in:
- `frontend/src/main/ipc.cjs`

## Current Structure and Root Cause
Before this refactor, the `type === 'query'` branch inside `initializeIpc()` in `ipc.cjs` mixed multiple responsibilities in one high-churn path:
- websocket/IPC event handling
- system-state and memory I/O orchestration
- XML section rendering and escaping
- fallback/error behavior
- payload mutation (`content`, `system_state_internal`)

Root cause: query enrichment policy lived inline in the IPC bridge instead of a dedicated module. This made the bridge harder to reason about and increased change risk because transport logic and content-building logic had to evolve together.

## Refactor Plan
1. Introduce a dedicated query payload builder module in `frontend/src/main/`.
2. Move query enrichment/formatting/fallback helpers into that module.
3. Keep `ipc.cjs` responsible for lifecycle/transport only, delegating content construction.
4. Preserve output payload shape and fallback behavior.
5. Add focused unit tests for the builder and rerun IPC bridge tests.

## Implemented Changes
### New query builder module
- Added `frontend/src/main/query_payload_builder.cjs`:
  - `buildQueryPayloadContent(...)`
  - moved XML escape/format helpers:
    - `escapeXml`
    - `formatMemorySection`
    - `appendMemorySections`
    - `formatInitialStateXml`
    - `formatSequentialStateXml`
    - `extractQueryRuntimeSystemState`
    - `formatFallbackStateXml`

### IPC bridge rewiring
- Updated `frontend/src/main/ipc.cjs`:
  - imports `buildQueryPayloadContent(...)`
  - replaces the large inline query-enrichment block with one delegated call
  - keeps overlay state changes, local-user-message broadcast, and backend send flow unchanged

Result:
- central query-enrichment policy now has one module boundary
- `ipc.cjs` query branch is shorter and focused on bridge flow
- payload contract remains unchanged (`payload.content`, memory sections, XML escaping, `system_state_internal` behavior)

## Added Test Coverage
- Added `tests/frontend/QueryPayloadBuilder.test.cjs`:
  - `builds enriched query content for initial context`
  - `uses fallback system context when system state retrieval fails`

## Validation
Ran:

```bash
cd frontend && npm run test -- --runTestsByPath ../tests/frontend/QueryPayloadBuilder.test.cjs ../tests/frontend/IpcMainBridge.test.cjs
```

Result:
- `2 passed` test suites
- `19 passed` tests

This confirms query payload enrichment behavior remains intact while reducing complexity in the main IPC bridge module.

---

# Refactor: Centralize WebSocket Route Cleanup in One Control Path

## Target
Remove duplicated cleanup control flow in:
- `backend/src/api/routes/websocket/__init__.py`

## Current Structure and Root Cause
Before this refactor, `websocket_endpoint()` invoked `cleanup_connection(...)` in three separate branches:
- receive-timeout branch inside the message loop
- `except WebSocketDisconnect`
- `except Exception`

Root cause: connection-lifecycle cleanup was handled at branch call sites instead of one canonical endpoint-exit path. This made the route harder to maintain and increased the chance of drift when timeout/disconnect/error behavior changes.

## Refactor Plan
1. Extract timeout close behavior into a helper to keep loop logic focused.
2. Move cleanup responsibility to one `finally` block after successful handshake.
3. Preserve existing timeout policy-close behavior (`1008`) and disconnect/error logging.
4. Add regression test to verify timeout path cleans up exactly once.
5. Run websocket route test suite.

## Implemented Changes
### Route cleanup control flow
- Updated `backend/src/api/routes/websocket/__init__.py`:
  - added `_close_connection_on_timeout(...)`
  - timeout branch now closes socket via helper and breaks loop
  - removed duplicated `cleanup_connection(...)` calls from timeout/disconnect/error branches
  - added one canonical `finally: await cleanup_connection(...)` after handshake success

Result:
- one cleanup path for timeout/disconnect/unexpected error termination
- lower branch complexity in central websocket route logic
- unchanged external behavior for timeout close code and error propagation

## Added Test Coverage
- Added `tests/backend/test_websocket_route.py`:
  - `test_websocket_endpoint_timeout_cleans_up_once`
    - simulates receive timeout
    - verifies timeout close uses `1008` reason
    - verifies cleanup runs exactly once

## Validation
Ran:

```bash
./scripts/python-in-env backend pytest tests/backend/test_websocket_route.py tests/backend/test_websocket_connection.py tests/backend/test_websocket_message_handler.py tests/backend/test_websocket_task_manager.py
```

Result:
- `32 passed in 0.34s`

This confirms websocket route behavior remains intact while consolidating cleanup into one canonical lifecycle path.

---

# Refactor: Reuse Query Stream Context and Unify Completion Emission

## Target
Reduce per-event allocation and duplicated completion flow in:
- `backend/src/api/services/query_execution.py`

## Current Structure and Root Cause
Before this refactor, `QueryExecutionService.execute()` repeatedly constructed the same context dictionary for every `pipeline.process(...)` call:
- event-forwarding path
- streaming-complete path
- fallback-completion path

The same context payload (`user_id`, `session_id`, `conversation_ref`, `turn_ref`) was rebuilt multiple times per query stream.

Root cause: stream context and completion emission policy were inlined at each call site instead of centralized helper methods.

## Refactor Plan
1. Build stream context once per query and reuse it for all pipeline emissions.
2. Add a helper that forwards events through the pipeline with shared context.
3. Add a helper to emit completion events (optional backfill chunk + terminal completion) used by both normal and fallback completion paths.
4. Preserve existing message/event contracts and completion fallback behavior.
5. Add/extend tests to validate context reuse and run backend handler/websocket tests.

## Implemented Changes
### Query execution service simplification
- Updated `backend/src/api/services/query_execution.py`:
  - added `_build_stream_context(...)` to construct context once per query
  - added `_process_pipeline_event(...)` to reuse context on every pipeline call
  - added `_emit_completion_events(...)` to centralize completion emission flow
  - rewired main loop + fallback path to use these helpers

Result:
- stream context allocation reduced from O(events) to O(1) per query
- removed duplicated completion-emission blocks
- kept external behavior unchanged (same fallback completion semantics and event ordering)

## Added Test Coverage
- Updated `tests/backend/test_api_handlers.py`:
  - strengthened `test_query_handler_success` with context identity assertion
  - strengthened `test_query_handler_emits_fallback_chunk_and_completion_when_agent_stream_is_silent` with context identity assertion

## Validation
Ran:

```bash
./scripts/python-in-env backend pytest tests/backend/test_api_handlers.py tests/backend/test_websocket_route.py tests/backend/test_websocket_connection.py tests/backend/test_websocket_message_handler.py tests/backend/test_websocket_task_manager.py
```

Result:
- `62 passed in 1.72s`

This confirms query streaming behavior remains intact while reducing repeated context allocation and duplicated completion-flow logic.

---

# Refactor: Centralize API Error/Success Transport Send Path

## Target
Remove duplicated transport-send logic in:
- `backend/src/api/infrastructure/errors.py`

## Current Structure and Root Cause
Before this refactor, both `send_error_response(...)` and `send_success_response(...)` independently repeated the same transport concerns:
- instantiate `WebSocketTransportSender`
- send a built envelope
- catch the same closed-connection exception set (`WebSocketDisconnect`, `RuntimeError`, `ConnectionError`)
- emit near-identical debug logging

Root cause: canonical transport send behavior lived in two call sites instead of one shared helper in the module that already centralizes handler response policy.

## Refactor Plan
1. Extract one private helper for transport sends with closed-connection swallowing behavior.
2. Keep `send_error_response(...)` focused on sanitization/logging + envelope construction.
3. Keep `send_success_response(...)` focused on envelope construction.
4. Preserve response shapes and existing error sanitization semantics.
5. Add focused tests for sanitization, context attachment, and closed-connection behavior.

## Implemented Changes
### Shared transport helper
- Updated `backend/src/api/infrastructure/errors.py`:
  - added `_send_transport_message(...)`
  - rewired both `send_error_response(...)` and `send_success_response(...)` to delegate to it

Result:
- one canonical send path for API handler success/error utilities
- removed duplicated transport construction + exception-handling blocks
- unchanged public helper interfaces and payload contracts

## Added Test Coverage
- Added `tests/backend/test_api_errors.py`:
  - `test_sanitize_error_message_returns_validation_error_message`
  - `test_send_error_response_sanitizes_internal_exception`
  - `test_send_success_response_attaches_context_fields`
  - `test_send_helpers_swallow_closed_connection_errors`

## Validation
Ran:

```bash
./scripts/python-in-env backend pytest tests/backend/test_api_errors.py tests/backend/test_api_handlers.py tests/backend/test_websocket_message_handler.py
```

Result:
- `46 passed in 1.60s`

This confirms centralized send-path refactoring preserved existing backend response behavior while reducing duplication in a core API utility module.

---

# Refactor: Precompute Middleware Dispatch Metadata in MessageHandlerRegistry

## Target
Reduce per-message middleware dispatch overhead in:
- `backend/src/api/infrastructure/registry.py`

## Current Structure and Root Cause
Before this refactor, `MessageHandlerRegistry.handle(...)` determined middleware awaitability at runtime for every message by checking the middleware return value:
- call middleware
- check awaitability dynamically
- conditionally `await`

Root cause: middleware dispatch shape (async callable vs sync callable) was inferred during hot-path message handling instead of registration time.

## Refactor Plan
1. Add registration-time middleware metadata (`is_async_callable`).
2. Compute async-callable shape once in `add_middleware(...)`.
3. Keep support for sync middleware that returns awaitables.
4. Keep fail-closed middleware exception propagation behavior unchanged.
5. Add focused tests for async callable objects, sync-awaitable middleware, and fail-closed behavior.

## Implemented Changes
### Registry middleware metadata
- Updated `backend/src/api/infrastructure/registry.py`:
  - added `RegisteredMiddleware` dataclass
  - changed `_middleware` storage to registered metadata entries
  - added `_is_async_middleware(...)` registration-time classifier
  - rewired middleware loop to:
    - skip per-message async-callable introspection for known async middleware
    - still await sync middleware return values when they are awaitable

Result:
- less hot-path introspection in central websocket message routing
- clearer middleware dispatch policy in one place
- preserved middleware compatibility and fail-closed semantics

## Added Test Coverage
- Added `tests/backend/test_message_handler_registry.py`:
  - `test_registry_awaits_async_callable_object_middleware`
  - `test_registry_awaits_sync_middleware_returned_awaitable`
  - `test_registry_fail_closed_on_middleware_exception`

## Validation
Ran:

```bash
./scripts/python-in-env backend pytest tests/backend/test_message_handler_registry.py tests/backend/test_websocket_message_handler.py tests/backend/test_api_handlers.py
```

Result:
- `45 passed in 1.59s`

This confirms middleware dispatch refactoring preserved backend handler behavior while reducing per-message dispatch overhead in the registry hot path.

---

# Refactor: Precompile Local Backend IPC Payload Mappers

## Target
Remove repeated runtime interpretation of static IPC field maps in:
- `frontend/src/main/local_backend_bridge.cjs`

This is a maintainability + micro-performance refactor in a central Electron main-process bridge module.

## Current Structure and Root Cause
Before this refactor, payload mapping relied on `mapPayloadParams(payload, fieldMap)`:
- `fieldMap` was traversed with `Object.entries(...)` on every IPC request
- mapping-type checks (`function` / `array` / direct key) were re-evaluated on every call
- fallback-key resolution setup was rebuilt every time

Root cause: static mapping metadata lived as runtime work in request handlers instead of being compiled once at bridge initialization.

## Refactor Plan
1. Introduce a mapper compiler that converts static field-map definitions into compiled mapping operations once.
2. Keep payload-shape handling unchanged (including non-object payload fallback to `{}`).
3. Rewire mapped handler registration to use compiled mappers.
4. Rewire `search-memory` mapping to use a compiled mapper instead of per-call field-map interpretation.
5. Add regression coverage for non-object payload handling and run focused frontend bridge tests.

## Implemented Changes
### Compiled payload mapper path
- Updated `frontend/src/main/local_backend_bridge.cjs`:
  - replaced per-call field-map interpretation with `createPayloadMapper(fieldMap)`
  - `createPayloadMapper(...)` now precomputes mapping strategy (`function`, `fallback`, `direct`) once
  - mapping handlers now execute compiled operations per request

### Handler rewiring
- Updated `registerMappedRpcHandlers(...)` to compile each definition once and register the compiled mapper directly.
- Updated `search-memory` IPC handler to use a precompiled `mapSearchMemoryPayload` mapper.

Result:
- removed repeated `Object.entries(...)` and mapping-type branching from hot request paths
- preserved external IPC/RPC payload contracts and fallback semantics

## Added Test Coverage
- Updated `tests/frontend/LocalBackendBridge.test.cjs`:
  - added `list-conversations handler safely handles non-object payloads`

The test verifies mapper behavior remains stable when payloads are not objects.

## Validation
Ran:

```bash
cd frontend && npm run test -- LocalBackendBridge.test.cjs
```

Result:
- `21 passed`

This confirms bridge behavior remains stable after moving field-map interpretation from request time to initialization time.

---

# Refactor: Centralize IPC WebSocket Lifecycle State Resets

## Target
Deduplicate connection lifecycle state-reset and status payload logic in:
- `frontend/src/main/ipc.cjs`

This is a maintainability refactor in a central main-process routing module.

## Current Structure and Root Cause
Before this refactor, `connect()` had duplicated lifecycle logic split across two handlers:
- `ws.on('open', ...)`
- `ws.on('close', ...)`

Both handlers independently managed overlapping state concerns:
- settings-sync lifecycle flags/promises
- pending settings ACK cleanup
- IPC status payload assembly (`isConnected`, `userId`, backend URLs)

`close` also had extra inline session-context resets (`currentSessionId`, `currentServerUserId`, `currentConversationRef`).

Root cause: connection lifecycle policy was implemented as inline mutable-state mutations per event handler, rather than centralized helpers. This increases drift risk when adding/changing lifecycle state fields.

## Refactor Plan
1. Extract shared helpers for settings-sync reset, backend-session reset, and IPC status payload construction.
2. Rewire `ws.on('open')` and `ws.on('close')` to use these helpers.
3. Keep runtime behavior unchanged:
   - open resets first-query + settings-sync state
   - close resets settings-sync + backend session context
   - both still broadcast the same IPC status contract
4. Add regression coverage for stale `conversation_ref` reset across reconnect.
5. Run focused IPC bridge tests.

## Implemented Changes
### Shared lifecycle helpers
- Updated `frontend/src/main/ipc.cjs`:
  - added `resetSettingsSyncState()`
  - added `resetBackendSessionState()`
  - added `buildIpcStatusPayload(connected)`
  - added `broadcastConnectionStatus(connected)`

### Handler rewiring
- `ws.on('open')` now reuses:
  - `resetSettingsSyncState()`
  - `broadcastConnectionStatus(true)`
- `ws.on('close')` now reuses:
  - `resetSettingsSyncState()`
  - `resetBackendSessionState()`
  - `broadcastConnectionStatus(false)`

Result:
- removed duplicated lifecycle state-reset code in connection handlers
- preserved IPC/status payload contracts in one canonical path

## Added Test Coverage
- Updated `tests/frontend/IpcMainBridge.test.cjs`:
  - added `reconnect clears stale conversation ref fallback before next query`

This test verifies reconnection clears stale `currentConversationRef` state before the next query’s local mirror event is emitted.

## Validation
Ran:

```bash
cd frontend && npm run test -- IpcMainBridge.test.cjs
```

Result:
- `18 passed`

This confirms lifecycle helper extraction preserved existing IPC bridge behavior.

---

# Refactor: Lazy ResponseParser Executor + Plain-Text Fast Path

## Target
Reduce unnecessary parser overhead in:
- `backend/src/llm/parser.py`

This is a performance + maintainability refactor on a central LLM response handling path.

## Current Structure and Root Cause
Before this refactor, `ResponseParser` always:
1. created a `ThreadPoolExecutor` at construction time
2. offloaded every `parse_response(...)` call into that executor

Even plain conversational responses with no JSON/tool-call structure paid executor-related overhead.

Root cause: parser execution policy assumed all responses needed CPU-bound JSON/tool-call parsing, rather than recognizing the common plain-text case.

## Refactor Plan
1. Make executor allocation lazy (create only when parse offload is actually needed).
2. Add a fast-path guard that returns immediately for responses that cannot contain JSON-object tool calls.
3. Preserve all trust-boundary behavior:
   - type checks
   - response-size limits and exceptions
4. Add regression coverage for the plain-text fast path.
5. Run focused parser test suites.

## Implemented Changes
### Lazy executor initialization
- Updated `backend/src/llm/parser.py`:
  - `self._executor` now initializes as `None`
  - existing `_ensure_executor()` remains the single creation path

### Plain-text fast path
- Added `ResponseParser._can_contain_tool_call(response)` with JSON-object delimiter check.
- Updated `parse_response(...)` to:
  - run existing trust-boundary validation first
  - return a direct `ParsedResponse` for plain text without `{`
  - skip thread-pool offload in that case

Result:
- no startup thread-pool allocation until needed
- no executor scheduling for common no-tool conversational responses
- unchanged parsing path for tool-call-capable responses

## Added Test Coverage
- Updated `tests/backend/test_response_parser.py`:
  - added `test_parse_response_plain_text_fast_path_skips_executor_creation`

The test verifies plain-text parsing returns no tool calls and leaves `_executor` uninitialized.

## Validation
Ran:

```bash
./scripts/python-in-env backend pytest tests/backend/test_response_parser.py tests/backend/test_response_parser_limits.py tests/backend/test_parser_extraction.py
```

Result:
- `24 passed in 1.40s`

This confirms parser behavior is preserved while reducing unnecessary executor overhead on plain-text responses.

---

# Refactor: Skip Parser Executor for Responses Missing Tool-Call Root Key

## Target
Reduce unnecessary parse-offload work in:
- `backend/src/llm/parser.py`

This is a performance + maintainability refactor on a central trust-boundary parsing path.

## Current Structure and Root Cause
After the previous plain-text fast path, `ResponseParser` still offloaded many non-tool responses when they contained `{`:
- JSON status/debug blobs like `{"status":"ok"}`
- conversational text snippets with braces

These responses cannot produce tool calls when they do not contain the configured schema root key (default: `functionCall`), but they still paid executor scheduling + parse strategy overhead.

Root cause: fast-path gating checked for `{` only, without using schema-level knowledge (`ToolCallSchema.root_key`) to reject impossible tool-call payloads.

## Refactor Plan
1. Refine parser fast-path gating to require:
   - JSON-object delimiter (`{`)
   - configured schema root key presence in response text
2. Keep trust-boundary behavior unchanged:
   - type validation
   - response size limits
   - timeout/validation semantics for parse-capable responses
3. Preserve custom schema support by reading `self.schema.root_key` dynamically.
4. Add focused regression tests for:
   - non-tool JSON skipping executor
   - custom schema root key still parsing successfully
5. Run parser-focused backend tests.

## Implemented Changes
### Root-key aware fast path
- Updated `backend/src/llm/parser.py`:
  - changed `_can_contain_tool_call(...)` from static delimiter-only check to instance method
  - added configured `root_key` presence check before executor offload
  - retained object-delimiter gate and debug logging for each skip reason

Result:
- parser now short-circuits more non-tool responses before executor scheduling
- parsing behavior for tool-call-capable responses is unchanged
- custom schema root keys remain supported

## Added Test Coverage
- Updated `tests/backend/test_response_parser.py`:
  - `test_parse_response_non_tool_json_fast_path_skips_executor_creation`
  - `test_parse_response_respects_custom_schema_root_key`

These tests lock in both optimization behavior and schema compatibility.

## Validation
Ran:

```bash
./scripts/python-in-env backend pytest tests/backend/test_response_parser.py tests/backend/test_response_parser_limits.py tests/backend/test_parser_extraction.py
```

Result:
- `26 passed in 1.33s`

This confirms root-key-aware fast-path optimization preserves parser correctness while reducing avoidable parse-offload work.

---

# Refactor: Cache Valid Tool Name Index in ToolCallValidator

## Target
Reduce repeated whitelist recomputation in:
- `backend/src/llm/parser_validation.py`

This is a performance + maintainability refactor on a central trust-boundary validation path.

## Current Structure and Root Cause
Before this refactor, every `validate_tool_call(...)` invocation rebuilt valid tool-name structures:
1. call `tool_registry.get_tool_names()`
2. sanitize + dedupe + sort names
3. apply `ToolPolicy.filter_tool_names(...)`
4. build a new `set(...)` for membership checks

During parsing of responses with multiple tool calls, this repeated identical work per call.

Root cause: valid tool whitelist/index lived as per-call transient data instead of validator-scoped cached policy state.

## Refactor Plan
1. Add a validator-local cache for `(valid_tool_names, valid_tool_name_set)`.
2. Scope cache to current dev-selection object (`_dev_tool_selection`) so test/runtime selection changes refresh automatically.
3. Keep public validation behavior and error messages unchanged.
4. Retain `_get_valid_tool_names()` for compatibility, backed by the new cache.
5. Add regression tests for cache reuse and selection-change invalidation.

## Implemented Changes
### Cached tool index
- Updated `backend/src/llm/parser_validation.py`:
  - added `_valid_tool_name_cache_selection`
  - added `_valid_tool_name_cache`
  - extracted `_compute_valid_tool_names()` for one-time list construction
  - added `_get_valid_tool_name_index()` returning cached list+set
  - rewired `_collect_tool_call_validation_errors(...)` to use cached index
  - kept `_get_valid_tool_names()` as compatibility wrapper

Result:
- repeated tool-name sorting/filtering/set-allocation removed from per-call hot path
- validation contracts and whitelist error formatting preserved

## Added Test Coverage
- Updated `tests/backend/test_parser_validation.py`:
  - added `CountingRegistry` test double
  - added `test_validate_tool_call_reuses_valid_tool_cache_across_calls`
  - added `test_validate_tool_call_invalidates_cache_when_dev_selection_changes`

These tests verify both cache-hit behavior and safe cache refresh when selection policy changes.

## Validation
Ran:

```bash
./scripts/python-in-env backend pytest tests/backend/test_parser_validation.py tests/backend/test_response_parser.py tests/backend/test_response_parser_limits.py tests/backend/test_parser_extraction.py
```

Result:
- `44 passed in 1.33s`

This confirms validator caching reduces repeated whitelist computation while preserving parser/validation behavior.

---

# Refactor: Skip Pure-JSON Strategy for Embedded Tool-Call Responses

## Target
Reduce redundant parse passes in:
- `backend/src/llm/parser.py`

This is a performance + maintainability refactor on the central response parsing hot path.

## Current Structure and Root Cause
Before this refactor, `_parse_sync(...)` always attempted strategies in fixed order:
1. `parse_json_response` (full-response JSON decode)
2. `parse_embedded_json` (scanner-based extraction)

For mixed responses like:
- plain text + embedded tool call JSON

the first strategy was guaranteed to fail, but still paid full-response JSON decode exception overhead before the embedded parser handled the response.

Root cause: parser strategy order did not account for coarse response shape (embedded/mixed vs object-wrapped JSON).

## Refactor Plan
1. Add coarse shape detection for object-wrapped JSON-like responses.
2. Select parsing strategy order dynamically:
   - object-wrapped response -> keep existing order (pure JSON first, then embedded fallback)
   - embedded/mixed response -> skip pure JSON strategy and run embedded parser directly
3. Keep parsing contracts unchanged (same parsed tool calls/text output).
4. Add regression tests proving:
   - embedded responses skip pure JSON strategy
   - object-wrapped responses still use pure JSON strategy
5. Run parser-focused backend tests.

## Implemented Changes
### Strategy selector
- Updated `backend/src/llm/parser.py`:
  - added `_select_parsing_strategies(response)`
  - added `_should_try_parse_json_response(response)`
  - rewired `_parse_sync(...)` to iterate selected strategies

Behavior:
- trimmed object-wrapped responses still run pure JSON strategy first
- embedded/mixed responses skip the known-failing pure JSON pass

Result:
- removed one redundant parse attempt for embedded-response paths
- preserved successful pure-JSON parsing behavior

## Added Test Coverage
- Updated `tests/backend/test_response_parser.py`:
  - `test_parse_sync_skips_pure_json_strategy_for_embedded_response`
  - `test_parse_sync_keeps_pure_json_strategy_for_object_wrapped_response`

These tests lock in both optimization and backward-compatible strategy behavior.

## Validation
Ran:

```bash
./scripts/python-in-env backend pytest tests/backend/test_response_parser.py tests/backend/test_response_parser_limits.py tests/backend/test_parser_extraction.py
```

Result:
- `28 passed in 1.35s`

This confirms dynamic strategy selection preserves parser correctness while removing redundant pure-JSON parse attempts for embedded responses.

---

# Refactor: Centralize Summarization Watermark Updates in LocalBackend

## Target
Remove duplicated pending-count/summarizer-update logic in:
- `frontend/src/main/python/local_backend.py`

This is a maintainability refactor in a central sidecar memory-write path.

## Current Structure and Root Cause
Before this refactor, both handlers implemented identical best-effort watermark logic:
- `_handle_store_transcript(...)`
- `_handle_store_memory(...)`

Each method repeated:
1. conditionally call `memory_store.increment_pending_count()`
2. conditionally notify summarizer (`notify_new_memory(user_id)`)
3. swallow/log failures as warning so writes still succeed

Root cause: summarization watermark policy lived inline at each memory-write call site instead of one shared helper. This duplicates behavior in a high-churn module and increases drift risk when watermark semantics change.

## Refactor Plan
1. Add one `LocalBackend` helper for best-effort watermark updates.
2. Keep existing behavior:
   - update only when caller says update is required
   - never fail memory writes due to watermark update errors
3. Rewire transcript and memory handlers to delegate to helper.
4. Add regression coverage for transcript pending-update failure path.
5. Run focused sidecar local-backend tests.

## Implemented Changes
### Shared watermark helper
- Added `LocalBackend._maybe_update_summarization_watermark(...)` in:
  - `frontend/src/main/python/local_backend.py`

Helper responsibilities:
- early return when update is not required
- increment pending counter
- notify summarizer when available
- catch/log failures without failing storage handlers

### Handler rewiring
- Updated `_handle_store_transcript(...)` to call shared helper with:
  - `should_update=self._counts_toward_pending_turns(...)`
- Updated `_handle_store_memory(...)` to call shared helper with:
  - `should_update=(memory_type == "episodic")`

No request/response schema changes were introduced.

### Added test coverage
- Updated `tests/sidecar/test_local_backend.py`:
  - `test_handle_store_transcript_pending_failure_still_succeeds`

This verifies transcript writes remain successful when pending-count update fails, matching existing best-effort behavior.

## Validation
Ran:

```bash
./scripts/python-in-env sidecar pytest tests/sidecar/test_local_backend.py
```

Result:
- `27 passed, 3 warnings`

This confirms behavior is preserved while consolidating duplicated watermark update policy.

---

# Refactor: Centralize Notification-Aware Error Responses in JSONRPCProtocol

## Target
Remove duplicated notification-response branching in:
- `frontend/src/main/python/core/ipc_protocol.py`

This is a maintainability refactor in the sidecar JSON-RPC request dispatch hot path.

## Current Structure and Root Cause
Before this refactor, `JSONRPCProtocol.handle_request(...)` repeated the same pattern for each validation/dispatch failure branch:
1. create error response with `create_error_response(...)`
2. return `None` for notifications or response payload for regular requests

This pattern was duplicated across:
- invalid JSON-RPC version
- missing/non-string method
- method not found
- invalid params type
- `JSONRPCError` and unexpected exception paths

Root cause: notification-aware transport policy lived inline at each branch instead of one shared helper.

## Refactor Plan
1. Add one helper for notification-aware response suppression.
2. Add one helper for notification-aware error response creation.
3. Rewire all error branches in `handle_request(...)` to delegate to helpers.
4. Keep external API and response shapes unchanged.
5. Add regression coverage for notification error suppression behavior and run JSON-RPC tests.

## Implemented Changes
### Shared helpers
- Added in `frontend/src/main/python/core/ipc_protocol.py`:
  - `_notification_aware_response(response, is_notification=...)`
  - `_notification_aware_error(request_id=..., code=..., message=..., data=..., is_notification=...)`

### Handler rewiring
- Updated `JSONRPCProtocol.handle_request(...)` to call helper methods for:
  - validation errors
  - method lookup errors
  - params validation errors
  - `JSONRPCError` passthrough
  - unexpected internal errors

Result:
- removed repeated `return None if is_notification else response` blocks from central dispatch logic
- kept response payload contract and notification behavior unchanged

### Added test coverage
- Updated `tests/sidecar/test_json_rpc_protocol.py`:
  - `test_handle_request_notification_suppresses_error_response`

This locks in the notification policy for error paths (no response emitted for notification requests).

## Validation
Ran:

```bash
./scripts/python-in-env sidecar pytest tests/sidecar/test_json_rpc_protocol.py
```

Result:
- `26 passed in 0.03s`

This confirms JSON-RPC behavior remains stable after centralizing notification-aware error handling.

---

# Refactor: Collapse Watermark Lookup to Single Query in LocalMemoryStore

## Target
Reduce duplicated query branches and database round-trips in:
- `frontend/src/main/python/memory/local_store.py`

This is a performance + maintainability refactor for episodic memory retrieval.

## Current Structure and Root Cause
`get_unprocessed_memories_after_id(...)` used three SQL branches:
- `last_id is None` path
- `last_id` exists path (after first querying watermark timestamp)
- `last_id` missing path (fallback to full fetch)

For non-null `last_id`, the method always did two SQL calls:
1. `SELECT timestamp FROM memories WHERE id = ?`
2. second query to fetch unprocessed rows

The same transcript row-shaping logic was also duplicated across:
- `get_unsemanticized_episodic_memories_by_conversation(...)`
- `get_unsemanticized_episodic_memories(...)`
- `get_unprocessed_memories_after_id(...)`

Root cause: watermark filtering and transcript result shaping were implemented inline per method/branch instead of shared query/formatting policy.

## Refactor Plan
1. Replace the multi-branch watermark lookup flow with one SQL query using a CTE.
2. Preserve existing semantics:
   - `last_id=None` returns all unsemanticized transcript rows
   - missing watermark id behaves like no watermark
   - existing watermark returns rows after `(timestamp, id)` watermark tuple
3. Extract transcript row formatting into one helper.
4. Rewire the three unsemanticized transcript retrieval methods to use the helper.
5. Add regression coverage for existing-watermark and missing-watermark behavior.

## Implemented Changes
### Single-query watermark filtering
- Updated `get_unprocessed_memories_after_id(...)` in:
  - `frontend/src/main/python/memory/local_store.py`

It now uses a CTE (`WITH watermark AS (...)`) and one `SELECT` with conditional filtering, removing the pre-query watermark lookup branch.

### Shared transcript row formatter
- Added:
  - `LocalMemoryStore._format_transcript_rows(...)`

- Rewired methods to use it:
  - `get_unsemanticized_episodic_memories_by_conversation(...)`
  - `get_unsemanticized_episodic_memories(...)`
  - `get_unprocessed_memories_after_id(...)`

Result:
- reduced duplicated transcript row-mapping logic in three call paths
- centralized transcript output shaping in one helper

### Regression coverage
- Added:
  - `test_get_unprocessed_memories_after_id_handles_existing_and_missing_watermarks`
- File:
  - `tests/sidecar/test_local_store_delete_cleanup.py`

The test verifies:
- existing watermark returns only newer rows
- missing watermark id still returns the full unsemanticized transcript set

## Validation
Ran:

```bash
./scripts/python-in-env sidecar pytest tests/sidecar/test_local_store_delete_cleanup.py tests/sidecar/test_memory_summarizer.py
```

Result:
- `14 passed, 3 warnings`

This confirms behavior stability while reducing SQL branching and per-call DB round-trips in the watermark retrieval path.
