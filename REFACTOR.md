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
