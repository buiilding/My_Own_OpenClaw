---
summary: "Deep reference for ToolResultProcessor runtime: atomic bundle detection path, bundle narrative formatting, transform/commit sequencing, and fail-safe request-id/resolved-call cleanup semantics."
read_when:
  - When changing `ToolResultProcessor.process` behavior for bundle or non-bundle result batches.
  - When debugging duplicated bundle history rows, missing bundle message content, or lingering request-id/resolved-call state after failures.
title: "Tool Result Processor Bundle Formatting and Cleanup Reference"
---

# Tool Result Processor Bundle Formatting and Cleanup Reference

## Canonical Modules

- `backend/src/agent/tools/processing/coordinator.py`
- `backend/src/agent/tools/processing/processor.py`
- `backend/src/agent/tools/shared/bundle_detection.py`
- `backend/src/agent/tools/shared/bundle_result_formatter.py`
- `backend/src/agent/history/history_committer.py`
- `backend/src/agent/session/session.py`

## Coordinator-to-Processor Ownership

`ToolProcessingCoordinator` is pass-through orchestration:

- receives `ToolExecutionBatch`
- delegates all processing to `ToolResultProcessor`

All branching, formatting, and cleanup logic lives in `ToolResultProcessor`.

## Atomic Bundle Processing Path

Bundle branch activates when:

- `is_atomic_bundle_from_results(orchestration_result.tool_results)` returns true

Processing sequence:

1. extract `bundle_id` from first result tool-call metadata via `ExecutionRef`
2. fetch stored bundle result from session
3. build narrative with `BundleResultFormatter.format(...)`
4. wrap formatted narrative into a new `ToolResult`
5. transform once with tool name `bundled_tools`
6. commit once via `HistoryCommitter`
7. remove stored bundle result and return early

Outcome:

- one consolidated history tool-output message for the whole bundle

## Bundle Narrative Formatting Semantics

`BundleResultFormatter` heading logic:

- `success` -> executed successfully
- `partial_failure` -> partial failures
- other/unknown -> failed

Step line logic:

- `status == "ok"` -> normal line
- otherwise -> `FAILED - ...`

Additional inclusions:

- top-level `error` line when present
- `<os_state>` XML block from bundle/system state
- screenshot marker for `screenshot` or `screenshot_ref`

System-state precedence:

- bundle payload `system_state` overrides fallback argument

## Individual Results Path

When bundle path is not used:

1. pre-collect all request ids from tool-call metadata
2. for each result:
- transform with per-tool name
- commit formatted output
3. always run cleanup in `finally`

Pre-collection before loop is intentional to preserve full cleanup on mid-loop exceptions.

## Cleanup Guarantees

`finally` block always executes:

- `session.get_result_storage().cleanup_request_ids(all_request_ids)`
- `session.remove_resolved_tool_call(request_id)` for each request id
- TTL safety sweep: `cleanup_old_results(max_age_seconds=300)`

This prevents pending-result/resolved-call leaks during long-running sessions.

## Commit Surface

`HistoryCommitter.commit(...)` writes only:

- `formatted_message`
- optional `screenshot_data`

No extra logic or branching in commit layer.

## Drift Hotspots

1. removing bundle early return can duplicate bundle history output by falling through to per-result loop.
2. changing `bundled_tools` transform path without updating formatter assumptions can degrade LLM-readable bundle context.
3. moving cleanup outside `finally` reintroduces leak risk on transform/commit failures.
4. skipping request-id pre-collection can leave unresolved ids when loop exits early on exceptions.

## Related Pages

- [Backend Tools Processing Docs Hub](README.md)
- [Result Transformer and Tool Result Formatting Contract Reference](result_transformer_and_tool_result_formatting_contract_reference.md)
- [Synthetic Result Factory and Coordinate-Resolution Failure Tool-Output Reference](synthetic_result_factory_and_coordinate_resolution_failure_tool_output_reference.md)
- [History Committer and Result-Processor Boundary Reference](../../agent/history/history_committer_and_result_processor_boundary_reference.md)
