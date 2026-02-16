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
