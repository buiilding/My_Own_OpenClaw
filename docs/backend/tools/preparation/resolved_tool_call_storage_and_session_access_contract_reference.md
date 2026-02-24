---
summary: "Deep reference for resolved tool-call storage contracts: request-id keyed overwrite semantics, session-level encapsulation APIs, cleanup lifecycle, and execution-time stale-screen guard coupling."
read_when:
  - When changing resolved-call registration/removal behavior across preparation, execution wait, and cleanup paths.
  - When debugging missing prepared coordinates, stale-screen execution failures, or unresolved request-id storage leaks.
title: "Resolved Tool-Call Storage and Session Access Contract Reference"
---

# Resolved Tool-Call Storage and Session Access Contract Reference

## Canonical Modules

- `backend/src/agent/tools/preparation/storage/resolved_call_storage.py`
- `backend/src/agent/session/session.py`
- `backend/src/agent/tools/preparation/preparer.py`
- `backend/src/tools/single_tool_execution.py`
- `backend/src/agent/tools/processing/processor.py`
- `tests/backend/test_resolved_tool_call_storage.py`
- `tests/backend/test_single_tool_execution.py`

## Storage Model

`ResolvedToolCallStorage` is a minimal request-id keyed map:

- `register(request_id, resolved_call)`
- `get(request_id)`
- `remove(request_id)`
- `clear()`

Behavior guarantees:

- registering same request id overwrites existing value
- removing missing id is no-op
- clear is idempotent

No additional validation, TTL, or eviction policy exists in storage class itself.

## Session Encapsulation Boundary

`AgentSession` exposes resolved-call storage only through wrappers:

- `register_resolved_tool_call`
- `get_resolved_tool_call`
- `remove_resolved_tool_call`

Callers should not access runtime internals directly (`runtime.resolved_calls`) outside session methods.

## Write Path (Preparation)

During single-tool preparation:

- preparer resolves coordinates and rewrites executable call shape
- resolved call is persisted under execution `request_id`

For bundle paths, call metadata carries `bundle_id` and execution uses bundle wait path; per-request resolved-call retrieval is single-tool execution focused.

## Read Path (Execution Wait)

`execute_single_tool(...)`:

1. reads request id from tool call metadata
2. fetches resolved call via `session.get_resolved_tool_call(request_id)`
3. if present, coerces resolved-call object into `ParsedToolCall` fallback-safe shape
4. applies stale-screen guard before waiting

Fallback behavior:

- if no resolved call, original parsed call is used

## Stale-Screen Safety Coupling

Execution checks resolved-call metadata field:

- `coordinate_resolution_screenshot_id`

Compared against:

- `session.get_current_screenshot_id()`

Mismatch returns immediate failure `ToolResult` and skips frontend wait, preventing execution with stale coordinates.

## Cleanup Lifecycle

Resolved calls are removed in tool-result processing cleanup:

- request ids are gathered from orchestration results
- `session.remove_resolved_tool_call(request_id)` called in `finally` block

This cleanup runs even when transform/commit path fails, preventing unbounded map growth over long sessions.

## Test-Backed Invariants

`tests/backend/test_resolved_tool_call_storage.py` verifies:

- register/get/remove/clear happy path
- overwrite behavior for same request id
- remove-missing no-op behavior
- clear idempotency

`tests/backend/test_single_tool_execution.py` verifies:

- stale-screen mismatch from resolved metadata triggers immediate failure
- matching screenshot id allows normal wait/result flow

## Drift Hotspots

1. bypassing session wrappers for storage access increases coupling and breaks encapsulation assumptions.
2. forgetting cleanup removal in finally paths leaks resolved calls across turns.
3. changing request-id metadata shape without updating preparer/execution paths can orphan resolved calls.
4. weakening stale-screen guard reintroduces risk of executing coordinates resolved from old screenshots.

## Related Pages

- [Backend Tools Preparation Docs Hub](README.md)
- [Screenshot Manager and OCR Task Lifecycle Reference](screenshot_manager_and_ocr_task_lifecycle_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](../tool_preparation_and_coordinate_resolution_reference.md)
- [Tool Result Orchestrator Bundle Detection and Wait Path Reference](../execution/tool_result_orchestrator_bundle_detection_and_wait_path_reference.md)
