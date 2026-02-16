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
