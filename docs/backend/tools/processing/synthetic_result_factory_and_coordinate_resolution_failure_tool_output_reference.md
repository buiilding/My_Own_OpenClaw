---
summary: "Deep reference for backend-generated synthetic tool results: coordinate-resolution failure payload shape, pending-result storage semantics, and SDK/local-runtime event ordering guarantees."
read_when:
  - When changing synthetic tool-result construction or the send-path handling for preparation failures.
  - When debugging SDK/local-runtime protocol-ordering issues (`ToolCallEvent` before `ToolOutputEvent`) or immediate wait completion for failed tool preparation.
title: "Synthetic Result Factory and Coordinate-Resolution Failure Tool-Output Reference"
---

# Synthetic Result Factory and Coordinate-Resolution Failure Tool-Output Reference

## Canonical Modules

- `backend/src/agent/tools/processing/synthetic_factory.py`
- `backend/src/agent/tools/sending/sender.py`
- `backend/src/core/interfaces/tool.py`
- `tests/backend/test_tool_sender.py`

## Factory Ownership Boundary

`SyntheticResultFactory` owns object creation only.

`create(tool_call, error_msg)` returns:

- `success=False`
- `error=error_msg`
- `output=f"Error: {error_msg}"`
- `data={"error": error_msg, "tool_name": tool_call.tool_name}`

No side effects:

- no session writes
- no event emission
- no wait/future mutation

## Single-Tool Preparation Failure Runtime Path

`ToolSender.send_tools(...)` handles `(tool_call, error_msg)` preparation failures by:

1. extracting `request_id` from metadata `ExecutionRef`
2. building synthetic `ToolResult` through `SyntheticResultFactory`
3. storing result in session pending map via `register_pending_tool_result(request_id, ...)`
4. emitting `ToolCallEvent` with failure flags
5. emitting `ToolOutputEvent` with failure flags

Failure metadata fields:

- `coordinate_resolution_failed: true`
- `skip_local_execution: true`
- `request_id`

Protocol guarantee:

- `ToolCallEvent` is always emitted before `ToolOutputEvent`, even though the tool never entered SDK/main local-runtime dispatch

## Why Pending Result Storage Happens Before Events

Sender stores synthetic pending result before emission so orchestrator wait path can resolve immediately once it awaits by request id.

This prevents:

- unnecessary timeout waits for non-executed tool calls
- race where wait starts after failure event but before synthetic result registration

## Bundle Failure Contrast (No Per-Call Synthetic Events)

For bundle preparation failures:

- sender stores one synthetic bundle `ToolResult` with `status: "failure"` and per-step `step_results`
- sender resolves bundle future immediately if already registered
- sender emits no `ToolBundleEvent`/`ToolCallEvent` for partial bundle execution

This keeps atomic-bundle semantics: all-or-nothing SDK/main local-runtime dispatch.

## Tool-Output Text Shape Coupling

Synthetic result `output` is plain `Error: ...`.

Downstream processing path:

- `ResultTransformer.transform` passes it through `format_for_history`
- `HistoryCommitter` writes it unchanged into conversation history

Result:

- consistent error text in LLM context for coordinate-resolution failures

## Test-Backed Invariants

`tests/backend/test_tool_sender.py` verifies:

- synthetic single-call failures emit exactly two events in protocol order
- both events carry `coordinate_resolution_failed` and `skip_local_execution`
- synthetic result is present in pending result storage under request id
- bundle preparation failure path stores synthetic bundle result without dispatching SDK/main local-runtime events

## Drift Hotspots

1. changing event order can break SDK projection and renderer display assumptions.
2. skipping `register_pending_tool_result` can reintroduce wait-path timeouts for backend-generated failures.
3. changing synthetic `data` keys can break error diagnostics relying on `tool_name` and `error`.
4. dispatching partial bundle events on preparation failure can desynchronize bundle wait handling.

## Related Pages

- [Backend Tools Processing Docs Hub](README.md)
- [Result Transformer and Tool Result Formatting Contract Reference](result_transformer_and_tool_result_formatting_contract_reference.md)
- [Tool Sender Local-Runtime Dispatch and Synthetic Error Result Reference](../execution/tool_sender_local_runtime_dispatch_and_synthetic_error_result_reference.md)
- [Tool Result Ingress and Storage Reference](../tool_result_ingress_and_storage_reference.md)
