---
summary: "Deep reference for tool-sender correlation identity handling: execution-ref extraction, synthetic single-call failures, bundle failure storage, and wait-layer future resolution."
read_when:
  - When changing metadata contracts for `request_id`, `bundle_id`, or `tool_call_id`.
  - When debugging tool calls that never execute on frontend due to preparation failures.
title: "Request-ID Extraction and Failed-Bundle Storage Reference"
---

# Request-ID Extraction and Failed-Bundle Storage Reference

## Canonical Modules

- `backend/src/agent/tools/sending/sender.py`
- `backend/src/agent/tools/preparation/types/execution_ref.py`
- `backend/src/agent/tools/waiting/storage/result_storage.py`
- `tests/backend/test_tool_sender.py`

## Correlation Identity Resolution

`ToolSender` derives execution identity from metadata through `ExecutionRef.from_metadata(...)`.

Resolution order:

1. `request_id` string -> `ExecutionRef(kind='single', request_id=...)`
2. else `bundle_id` string -> `ExecutionRef(kind='bundle', bundle_id=...)`
3. else `None`

For per-tool preparation failures, sender requires `request_id` to synthesize a pending single-tool result. Missing request IDs are logged and skipped.

## Single-Call Preparation Failure Path

When a tool call fails before frontend dispatch:

1. sender builds synthetic failure `ToolResult` via `SyntheticResultFactory`
2. sender stores it in pending storage (`session.register_pending_tool_result(request_id, result)`)
3. sender emits `ToolCallEvent` then `ToolOutputEvent`
4. both events include failure metadata:
- `coordinate_resolution_failed: true`
- `skip_frontend_execution: true`
- `request_id`

Ordering (`ToolCallEvent` before `ToolOutputEvent`) preserves frontend request/response state machine assumptions.

## Bundle Preparation Failure Path

When `PreparationResult` contains both `errors` and `bundle_id`:

1. sender does not emit `ToolBundleEvent`
2. sender builds a synthetic bundled `ToolResult` with:
- `success=false`
- `data.status='failure'`
- `data.step_results` for every tool call in bundle:
- failed step: original error
- remaining steps: skipped message tied to failed tool name
3. sender stores bundled result in `ToolResultStorage.store_bundled_result(bundle_id, result)`
4. sender attempts immediate future resolution through `ToolResultStorage.resolve_bundle_future(...)`
5. sender returns early

This keeps bundle execution atomic: no partial frontend dispatch when preparation fails.

## Model-Facing Tool Call Identity

For successful single and bundle dispatch, sender ensures metadata includes `model_facing_tool_call`:

- `name`: original LLM tool name
- `arguments`: original LLM tool arguments (before coordinate rewrites)
- optional `id`: from `metadata.tool_call_id`

This keeps transparency UI aligned to model-origin intent while execution args may be transformed.

## Wait-Layer Coupling Points

Sender writes directly into wait-layer storage primitives:

- `register_pending_tool_result` for synthetic single-call failures
- `store_bundled_result` + `resolve_bundle_future` for bundle failures

Wait/orchestrator layers then observe these results without requiring frontend round-trip events.

## Test-Backed Invariants

`tests/backend/test_tool_sender.py` verifies:

- failed single call emits call then output with skip metadata
- pending result exists under failed `request_id`
- failed bundle dispatch emits no tool/bundle events
- failed bundle result stored with `status == 'failure'`
- model-facing metadata preserves original tool id/name/arguments

## Drift Hotspots

1. weakening `request_id` extraction can strand synthetic failures without retrievable pending results.
2. emitting partial bundle events on preparation failure breaks atomic bundle wait semantics.
3. diverging `model_facing_tool_call` payload shape from frontend expectations can break transparency rendering.

## Related Pages

- [Backend Tool Sender Docs Hub](README.md)
- [Tool Sender Frontend Dispatch and Synthetic Error Result Reference](../tool_sender_frontend_dispatch_and_synthetic_error_result_reference.md)
- [Tool Result Orchestrator Bundle Detection and Wait Path Reference](../tool_result_orchestrator_bundle_detection_and_wait_path_reference.md)
