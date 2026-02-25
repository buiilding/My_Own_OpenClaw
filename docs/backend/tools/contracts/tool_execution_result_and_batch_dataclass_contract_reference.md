---
summary: "Deep reference for typed tool execution containers: ToolExecutionResult and ToolExecutionBatch dataclass fields, defaults, and orchestration compatibility expectations."
read_when:
  - When changing dataclass fields in `backend/src/tools/result_types.py`.
  - When debugging tool orchestration paths that expect `tool_call/result/success/execution_time/context` on per-call results.
title: "Tool Execution Result and Batch Dataclass Contract Reference"
---

# Tool Execution Result and Batch Dataclass Contract Reference

## Canonical Modules

- `backend/src/tools/result_types.py`
- `backend/src/tools/result_helpers.py`
- `backend/src/tools/single_tool_execution.py`
- `backend/src/tools/bundle_execution.py`
- `backend/src/agent/tools/shared/bundle_detection.py`
- `tests/backend/test_result_helpers.py`

## `ToolExecutionResult` Contract

Dataclass fields:

- `tool_call: ParsedToolCall`
- `result: ToolResult`
- `success: bool`
- `execution_time: float`
- `context: Optional[Any] = None`

Notes:

- dataclass uses `slots=True` (attribute shape is fixed and lightweight)
- `success` is explicit and may duplicate `result.success` for fast filtering/aggregation callers

## `ToolExecutionBatch` Contract

Dataclass fields:

- `tool_results: list[ToolExecutionResult] = field(default_factory=list)`

`default_factory=list` guarantees independent list instances per batch (no shared mutable default).

## Runtime Usage Expectations

- single-tool execution returns one `ToolExecutionResult`
- bundle execution returns `ToolExecutionBatch` with one result per original tool call
- bundle detection consumes list of `ToolExecutionResult` to decide atomic-bundle history behavior

## Coverage Signals

`tests/backend/test_result_helpers.py` validates the typed object shape indirectly through helper constructors:

- `ToolExecutionResult` fields are set correctly
- `ToolExecutionBatch` starts with empty list
- each `ToolExecutionBatch` call creates independent list instances

## Drift Hotspots

1. Renaming/removing result fields breaks orchestrator and formatter code paths expecting current attributes.
2. Removing `default_factory` from batch list risks shared mutable state across turns.
3. Dropping `slots=True` may increase memory overhead in high-frequency tool runs.

## Related Pages

- [Backend Tools Contracts Docs Hub](README.md)
- [Tool Result Orchestrator Bundle Detection and Wait Path Reference](../execution/tool_result_orchestrator_bundle_detection_and_wait_path_reference.md)
- [Tool Result Processor Bundle Formatting and Cleanup Reference](../processing/tool_result_processor_bundle_formatting_and_cleanup_reference.md)
