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
- registration stores a deep snapshot of the resolved call instead of caller-owned
  mutable state
- retrieval returns a deep snapshot so execution-time callers cannot mutate the
  stored copy through the object returned by `get`
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

During bundle preparation:

- call metadata carries one shared `bundle_id`; steps do not receive `request_id`
- after the full bundle prepares successfully, each resolved step is persisted under deterministic `<bundle_id>:step:<1-based-index>` storage keys
- failed bundle preparation does not register partial steps, avoiding stale storage for a bundle that will not execute

Per-request resolved-call retrieval remains single-tool execution focused. Bundle step registrations are stable session-runtime storage entries for diagnostics and shared resolved-call lifecycle handling, while bundle execution and waiting continue to route by `bundle_id`.

## Read Path (Execution Wait)

`execute_single_tool(...)`:

1. reads request id from tool call metadata
2. fetches resolved call via `session.get_resolved_tool_call(request_id)`
3. if present, requires the value to have the valid `ResolvedToolCall` shape
4. converts that resolved call into the `ParsedToolCall` shape used by result
   objects
5. applies stale-screen guard before waiting

Fallback behavior:

- if no resolved call, original parsed call is used
- if resolved-call storage returns an invalid object or invalid resolved fields,
  execution returns an immediate failed `ToolResult` instead of falling back to
  original parsed parameters

## Stale-Screen Safety Coupling

Execution checks resolved-call metadata field:

- `coordinate_resolution_screenshot_id`

Compared against:

- `session.get_current_screenshot_id()`

Mismatch returns immediate failure `ToolResult` and skips the local-runtime wait, preventing execution with stale coordinates.

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
- invalid resolved-call storage fails before local-runtime wait

## Drift Hotspots

1. bypassing session wrappers for storage access increases coupling and breaks encapsulation assumptions.
2. forgetting cleanup removal in finally paths leaks resolved calls across turns.
3. changing request-id metadata shape without updating preparer/execution paths can orphan resolved calls.
4. adding `request_id` to atomic bundle steps or mixing `bundle_id` values breaks bundle detection and should be avoided.
5. weakening stale-screen guard reintroduces risk of executing coordinates resolved from old screenshots.

## Related Pages

- [Backend Tools Preparation Docs Hub](README.md)
- [Screenshot Manager and OCR Task Lifecycle Reference](screenshot_manager_and_ocr_task_lifecycle_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](../tool_preparation_and_coordinate_resolution_reference.md)
- [Tool Result Orchestrator Bundle Detection and Wait Path Reference](../execution/tool_result_orchestrator_bundle_detection_and_wait_path_reference.md)
