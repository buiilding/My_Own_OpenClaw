---
summary: "Deep reference for tool-result helper constructors: create_tool_result_object success propagation/default timing and create_empty_tool_results independent-batch semantics."
read_when:
  - When changing helper behavior in `backend/src/tools/result_helpers.py`.
  - When debugging inconsistent execution-time defaults or missing success propagation in orchestrator-produced ToolExecutionResult objects.
title: "Tool Result Helper Object Creation and Default Timing Contract Reference"
---

# Tool Result Helper Object Creation and Default Timing Contract Reference

## Canonical Modules

- `backend/src/tools/result_helpers.py`
- `backend/src/tools/result_types.py`
- `backend/src/tools/single_tool_execution.py`
- `backend/src/tools/bundle_execution.py`
- `tests/backend/test_result_helpers.py`

## `create_tool_result_object(...)` Contract

Signature:

- inputs: `tool_call`, `tool_result`, optional `execution_time` (default `0.1`)
- output: `ToolExecutionResult`

Behavior:

- `tool_call` reference is passed through unchanged
- `result` reference is passed through unchanged
- `success` is mirrored from `tool_result.success`
- `execution_time` defaults to `0.1` unless caller overrides
- `context` is set to `None`

Design intent:

- centralize object-shape construction in one helper
- keep single-tool and bundle paths aligned on identical result object structure

## Execution-Time Default Semantics

Default `0.1` is a placeholder timing used broadly for frontend-executed tool flows.

Callers that measure real wait duration can override value explicitly before serialization/diagnostics.

## `create_empty_tool_results()` Contract

Returns `ToolExecutionBatch(tool_results=[])`.

Must create a fresh list per call (no shared list instance across batches).

## Test-Backed Invariants

`tests/backend/test_result_helpers.py` validates:

- object type and field mapping from helper outputs
- success propagation for success/failure tool results
- custom timing override behavior
- empty-batch helper returns independent instances

## Drift Hotspots

1. Breaking success propagation from `tool_result.success` can desync downstream status checks.
2. Changing default `execution_time` affects timing diagnostics and historical assumptions.
3. Replacing helper usage with ad-hoc object construction increases shape drift risk between single/bundle execution paths.

## Related Pages

- [Backend Tools Contracts Docs Hub](README.md)
- [Tool Execution Result and Batch Dataclass Contract Reference](tool_execution_result_and_batch_dataclass_contract_reference.md)
- [Tool Result Orchestrator Bundle Detection and Wait Path Reference](../execution/tool_result_orchestrator_bundle_detection_and_wait_path_reference.md)
