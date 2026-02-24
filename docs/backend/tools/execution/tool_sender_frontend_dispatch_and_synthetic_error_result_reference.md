---
summary: "Deep reference for ToolSender dispatch semantics: preparation-result branching, synthetic error result emission order, model-facing metadata contract, and bundle-preparation failure short-circuit behavior."
read_when:
  - When changing `ToolSender.send_tools` branching or event payload metadata.
  - When debugging missing frontend tool execution, protocol ordering regressions, or bundle-preparation failure handling.
title: "Tool Sender Frontend Dispatch and Synthetic Error Result Reference"
---

# Tool Sender Frontend Dispatch and Synthetic Error Result Reference

## Canonical Modules

- `backend/src/agent/tools/sending/sender.py`
- `backend/src/agent/tools/preparation/preparer.py`
- `backend/src/agent/tools/preparation/types/execution_ref.py`
- `backend/src/core/events/streaming_events.py`
- `tests/backend/test_tool_sender.py`

## Sender Ownership Boundary

`ToolSender` owns outbound frontend tool execution events only.

It does not:

- wait on tool completion futures
- commit tool results to conversation history
- parse frontend return payloads

Those responsibilities stay in wait/processing layers.

## Input Contract: `PreparationResult`

`send_tools(...)` branches on `PreparationResult` fields:

- `resolved_calls`
- `errors`
- `bundle_id`

All dispatch behavior is derived from that triad.

## Error Path for Single Calls

For each `(tool_call, error_msg)` in `preparation_result.errors`:

1. extract `request_id` via `ExecutionRef.from_metadata`
2. synthesize failure `ToolResult` through `SyntheticResultFactory`
3. store pending result (`session.register_pending_tool_result`) so wait path can complete immediately
4. emit `ToolCallEvent` first
5. emit `ToolOutputEvent` second

Protocol invariant:

- tool-call must precede tool-output even for backend-generated failures

Failure metadata contract (both events):

- `coordinate_resolution_failed: true`
- `skip_frontend_execution: true`
- `request_id`

## Model-Facing Metadata Contract

Every emitted call/bundle tool item gets `model_facing_tool_call` unless already present.

Shape:

- `name`: tool name
- `arguments`: original model parameters
- optional `id`: from `metadata.tool_call_id` when non-empty string

This preserves model-origin transparency even when prepared parameters are rewritten.

## Success Path: Single vs Bundle

Single (`bundle_id` absent):

- emit one `ToolCallEvent` with prepared parameters
- include merged metadata payload

Bundle (`bundle_id` present):

- emit one `ToolBundleEvent`
- each bundle step carries prepared `args` and metadata

## Bundle Preparation Failure Short-Circuit

If `errors` exists and `bundle_id` is present:

- sender stores one synthetic bundled `ToolResult` with:
- `status: failure`
- per-step `step_results` where failed call gets real error, remaining calls marked skipped
- sender resolves bundle future if already created
- sender returns without emitting `ToolBundleEvent` or `ToolCallEvent`

This prevents partial frontend dispatch for atomic bundles.

## Test-Backed Invariants

`tests/backend/test_tool_sender.py` verifies:

- failed coordinate-resolution path emits `ToolCallEvent` then `ToolOutputEvent`
- failure metadata includes `skip_frontend_execution` and `coordinate_resolution_failed`
- failed bundle preparation does not dispatch bundle or per-tool call events
- synthetic bundle failure is stored with `status == "failure"`
- `model_facing_tool_call` preserves original tool-call id/name/arguments

## Drift Hotspots

1. changing event order for synthetic failures can break frontend state machine assumptions.
2. removing pending-result storage for synthetic failures can cause unnecessary wait timeouts.
3. allowing partial bundle dispatch on preparation failure can desynchronize bundle wait handling.
4. changing `model_facing_tool_call` shape can break transparency UI consumers.

## Related Pages

- [Backend Tools Execution Docs Hub](README.md)
- [Tool Result Orchestrator Bundle Detection and Wait Path Reference](tool_result_orchestrator_bundle_detection_and_wait_path_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](../tool_preparation_and_coordinate_resolution_reference.md)
- [Tool Result Ingress and Storage Reference](../tool_result_ingress_and_storage_reference.md)
