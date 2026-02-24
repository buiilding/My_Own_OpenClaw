---
summary: "Deep reference for waiting router internals: artifact-id gate heuristics, screenshot ref decode/injection, system-state precedence, and shared route_result storage/future behavior."
read_when:
  - When changing screenshot_ref handling or artifact lookup behavior in waiting router.
  - When changing route_result branching between individual and bundle modes.
title: "Artifact Ref Validation and Shared Route-Result Semantics Reference"
---

# Artifact Ref Validation and Shared Route-Result Semantics Reference

## Canonical Modules

- `backend/src/agent/tools/waiting/router.py`
- `backend/src/agent/tools/waiting/storage/result_storage.py`
- `backend/src/services/artifacts.py`
- `tests/backend/test_tool_result_router.py`

## Route Entry Surface

Public route entrypoints:

- `route_individual_result(request_id, tool_result)`
- `route_bundle_result(bundle_id, tool_result)`

Both delegate into one shared path:

- `route_result(correlation_id, tool_result, route_mode="individual"|"bundle")`

Shared path guarantees:

- identical screenshot extraction/processing behavior for single and bundle results
- consistent session system-state refresh
- mode-specific storage/future resolution only at final branch

## System-State Precedence Contract

`_set_current_system_state_if_available(...)` rules:

1. if `tool_result.data` is non-dict: no update
2. prefer `data.system_state_internal` when it is dict
3. otherwise pass `data.system_state` through `session.set_current_system_state(...)`

This gives backend-normalized internal state priority while keeping compatibility with legacy `system_state`.

## Screenshot Extraction and Artifact Ref Gate

`_extract_screenshot_from_result_data(...)` precedence:

1. inline `data.screenshot` -> immediate use
2. else evaluate `data.screenshot_ref` only if `_looks_like_artifact_id(...)` returns true
3. decode artifact with `_resolve_screenshot_ref(...)`
4. inject decoded screenshot into `tool_result.artifacts["screenshot"]`

If decode fails, router logs warning and continues routing without screenshot processing failure.

## Artifact-Id Heuristic Guard

`_looks_like_artifact_id(value)` requires:

- non-empty string
- no `/` or `\` path separators
- lowercase suffix in:
- `.png`
- `.jpg`
- `.jpeg`
- length `< 80`

Purpose:

- avoid attempting artifact-store lookups on arbitrary strings/paths
- constrain decode path to expected artifact-id-like tokens

## Storage/Future Resolution Branching

Individual mode (`route_mode="individual"`):

- `store_pending_result(request_id, result)`
- `resolve_result_future(request_id, result)`

Bundle mode (`route_mode="bundle"`):

- `store_bundled_result(bundle_id, result)`
- `resolve_bundle_future(bundle_id, result)`

Logging behavior differs by mode:

- individual miss is debug-level and non-fatal
- bundle miss is warning-level (bundle future expected for atomic waits)

## Screenshot Processor Coupling

When extracted screenshot data exists:

- router calls `screenshot_processor.process_from_result(session, screenshot_data, correlation_id)`

No screenshot data:

- processing skipped, storage/future steps still run

This keeps screenshot extraction side-effect isolated from core result routing.

## Test-Backed Invariants

`tests/backend/test_tool_result_router.py` verifies:

- individual route with inline screenshot processes screenshot and resolves pending future
- individual route with no screenshot still stores/resolves and leaves session state untouched
- system-state update from `system_state` and priority override from `system_state_internal`
- screenshot_ref decode path injects screenshot artifact and processes decoded data
- bundle route stores/resolves bundled result and supports screenshot_ref decode path
- shared `route_result(..., route_mode="bundle")` updates state and bundle storage path

## Drift Hotspots

1. loosening artifact-id guard can trigger unsafe/invalid artifact lookups on arbitrary ref strings.
2. changing system-state precedence can regress coordinate follow-up behavior after tool execution.
3. splitting single and bundle route pipelines can reintroduce behavior drift in screenshot and state updates.

## Related Pages

- [Backend Waiting Router Docs Hub](README.md)
- [Tool Result Receiver and Router Shared Route-Mode Reference](../tool_result_receiver_and_router_shared_route_mode_reference.md)
- [Tool Result Storage Future Lifecycle and Cleanup Reference](../tool_result_storage_future_lifecycle_and_cleanup_reference.md)
