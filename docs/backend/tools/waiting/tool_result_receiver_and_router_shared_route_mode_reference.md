---
summary: "Deep reference for frontend tool-result receive and route internals: single-vs-bundle shared route mode, system-state refresh, screenshot/screenshot_ref handling, and storage/future resolution handoff."
read_when:
  - When changing `ToolResultHandler`, `ToolResultReceiver`, or `ToolResultRouter` behavior.
  - When debugging route-mode mismatches, bundle success evaluation, or screenshot artifact decode failures on tool-result ingress.
title: "Tool Result Receiver and Router Shared Route-Mode Reference"
---

# Tool Result Receiver and Router Shared Route-Mode Reference

## Canonical Modules

- `backend/src/agent/tools/waiting/handler.py`
- `backend/src/agent/tools/waiting/receiver.py`
- `backend/src/agent/tools/waiting/router.py`
- `backend/src/agent/tools/waiting/storage/result_storage.py`
- `tests/backend/test_tool_result_handler.py`
- `tests/backend/test_tool_result_receiver.py`
- `tests/backend/test_tool_result_router.py`

## Facade-to-Component Split

`ToolResultHandler` is a façade with two public entrypoints:

- `process_frontend_tool_result(...)`
- `process_frontend_tool_bundle_result(...)`

Both paths normalize via `ToolResultReceiver` then funnel into one shared router API:

- `route_result(correlation_id, tool_result, route_mode='individual'|'bundle')`

This keeps individual and bundle behavior unified and avoids divergent routing code paths.

## Receiver Normalization Rules

### Individual results

`receive_individual_result(...)`:

- wraps frontend payload through `ToolResult.from_dict`
- preserves `result_data` shape as provided
- does not inject metadata for non-bundle results

### Bundle results

`receive_bundle_result(...)`:

- normalizes each step to plain dict (`dict` or `model_dump()`)
- builds `data` block with `step_results`, `screenshot`, `screenshot_ref`, `system_state`
- computes `success` from both bundle `status` and per-step `status == 'ok'`
- adds metadata: `{ is_bundled: true, bundle_id: <id> }`

## Router Shared Pipeline

`ToolResultRouter.route_result(...)` performs, in order:

1. determine bundle vs individual mode
2. update session runtime system state
3. extract screenshot payload (inline or artifact ref decode)
4. process screenshot via screenshot processor
5. store result + resolve matching future in storage

### System-state update precedence

`_set_current_system_state_if_available(...)`:

- prefers `data.system_state_internal` when present (dict)
- otherwise uses `data.system_state`

This keeps session state fresh before subsequent tool preparation stages.

### Screenshot extraction semantics

`_extract_screenshot_from_result_data(...)`:

- inline `data.screenshot` wins immediately
- if no inline screenshot, checks `data.screenshot_ref`
- only decodes refs that look like artifact ids (`.png/.jpg/.jpeg`, short, no path separators)
- decoded screenshot is also injected into `tool_result.artifacts['screenshot']`

Decode failure is warning-only and routing continues.

## Storage/Future Resolution Integration

For individual route mode:

- `store_pending_result(request_id, result)`
- `resolve_result_future(request_id, result)`

For bundle route mode:

- `store_bundled_result(bundle_id, result)`
- `resolve_bundle_future(bundle_id, result)`

Bundle misses log warning; individual misses default to debug-level behavior.

## Test-Backed Invariants

`tests/backend/test_tool_result_handler.py` verifies:

- individual results route through shared mode `individual`
- bundle results route through shared mode `bundle`

`tests/backend/test_tool_result_receiver.py` verifies:

- individual result preserves required `system_state` without metadata injection
- bundle success depends on both bundle status and all step statuses
- pydantic step models are normalized into dicts

`tests/backend/test_tool_result_router.py` verifies:

- screenshot processing for inline screenshot payloads
- system state update behavior and internal-state preference
- screenshot_ref decode path and artifact injection
- shared route-result path for bundle mode updates storage/futures

## Drift Hotspots

1. bypassing shared `route_result` can reintroduce single-vs-bundle behavior drift.
2. altering bundle success calculation can break downstream history/loop expectations.
3. changing screenshot-ref heuristics may block valid artifact refs or decode unsafe values.
4. skipping session-state refresh can degrade coordinate/tool follow-up accuracy.

## Related Pages

- [Backend Tools Waiting Docs Hub](README.md)
- [Backend Waiting Router Docs Hub](router/README.md)
- [Artifact Ref Validation and Shared Route-Result Semantics Reference](router/artifact_ref_validation_and_shared_route_result_semantics_reference.md)
- [Tool Result Storage Future Lifecycle and Cleanup Reference](tool_result_storage_future_lifecycle_and_cleanup_reference.md)
- [Tool Result Ingress and Storage Reference](../tool_result_ingress_and_storage_reference.md)
