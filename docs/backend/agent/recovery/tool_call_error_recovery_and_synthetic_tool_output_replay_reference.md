---
summary: "Deep reference for interaction-loop recovery from malformed model tool-call payloads: recoverable error classification, synthetic tool-call/tool-output emission order, history replay injection, and cleanup semantics."
read_when:
  - When changing recoverable error marker matching, tool-call id/name extraction, or synthetic ToolCallEvent/ToolOutputEvent payload shape.
  - When debugging loops that unexpectedly abort after stream errors, or frontend tool runner behavior for `skip_frontend_execution` metadata.
title: "Tool-Call Error Recovery and Synthetic Tool-Output Replay Reference"
---

# Tool-Call Error Recovery and Synthetic Tool-Output Replay Reference

## Canonical Modules

- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/execution/policies.py`
- `backend/src/api/processing/formatters/tool_call.py`
- `backend/src/api/processing/formatters/tool_output.py`
- `tests/backend/test_interaction_loop.py`

## Problem This Path Solves

LLM streams can emit provider error events indicating malformed tool-call arguments even though turn execution should remain recoverable.

Without recovery, loop behavior would:

- abort current turn
- lose opportunity for model self-correction on next iteration
- leave frontend with incomplete tool-state narrative

Recovery converts these errors into synthetic tool protocol events plus history context so model can retry with corrected call syntax.

## Recovery Decision Gate

After LLM stream finishes in `run_loop()`:

- if `ErrorEvent` content exists, loop checks `_is_recoverable_llm_tool_call_error(error_text)`
- recoverable requires both:
  - tool context in text (`tool`)
  - format context (`argument` or `tool_call` variants)
- and any configured marker from `_RECOVERABLE_TOOL_CALL_ERROR_MARKERS`, including:
  - failed to parse streamed tool-call arguments
  - invalid tool-call arguments
  - invalid tool call at index
  - invalid tool_calls type

Branch behavior:

- recoverable: emit synthetic tool events and continue loop
- non-recoverable: write `[System Error: ...]` assistant history marker and return

## Synthetic Event Emission Protocol

`_emit_recoverable_tool_call_error(...)` emits exactly:

1. `ToolCallEvent`
2. `ToolOutputEvent`

This ordering is intentional to preserve frontend state machine assumptions (`tool-call` before `tool-output`).

Synthetic payload metadata:

- `request_id`: extracted tool call id or generated fallback (`llm_tool_call_error_<12hex>`)
- `llm_tool_call_validation_failed = True`
- `skip_frontend_execution = True`

`ToolCallEvent` fields:

- `tool_name`: extracted from error text via name regex or fallback `invalid_tool_call`
- `parameters`: `{}`
- `request_id`: synthetic/extracted id
- `metadata`: synthetic flags above

`ToolOutputEvent` fields:

- `tool_name`: same resolved name
- `success`: `False`
- `output`: normalized synthetic tool-output message
- `error`: original provider error text
- `execution_time`: `0.0`
- `metadata`: same synthetic flags

## ID and Name Extraction

Regex extractors:

- `_LLM_TOOL_ERROR_ID_PATTERN`: matches `id=` or `tool_call_id=` forms
- `_LLM_TOOL_ERROR_NAME_PATTERN`: matches `name=` or `tool_name=` forms

If id extraction fails, fallback id is generated and used as both protocol request id and history-staging key.

## Synthetic Tool-Output Message Format

`_build_recoverable_tool_output_message(...)` emits canonical tool-output-style text:

- `<tool_name> output:` header
- fixed explanation: malformed tool-call arguments from model
- compacted single-line error preview
- `status: failed`

Error preview normalization:

- whitespace collapsed
- capped at `_TOOL_OUTPUT_ERROR_PREVIEW_CHARS` (`600`), with `...[truncated]` suffix when exceeded

## History Replay Injection

To ensure next LLM turn sees this recovery context:

- `session.history.stage_tool_call_ids([tool_call_id])`
- `session.history.add_tool_output(tool_output_message)`

This mirrors normal tool-result ingestion shape, preserving context continuity.

## Interaction with Tool Executor Cleanup

In standard tool path, loop uses `finally` to call `tool_executor.process_results(...)` when needed, preventing leaked pending request ids/state.

Recovery path bypasses tool execution entirely (`continue` after synthetic events), so no tool executor state should be created for that failed LLM-generated call.

## Parser Recovery Policy Boundary (`policies.py`)

`ParseRecoveryPolicy.build_validation_error_user_message(...)` exists separately for parser-level validation failures and emits corrective system guidance (metadata-first format).

This is distinct from stream error recovery path above, but both aim to keep model retry loop alive with structured corrective context.

## Formatter and Transport Contract

Formatter propagation guarantees:

- `ToolCallEventFormatter` forwards `request_id` and `metadata` when present
- `ToolOutputEventFormatter` forwards `metadata` (and output/error fields)

This allows frontend to:

- correlate synthetic tool output via metadata/request id
- skip local execution using metadata gate (`skip_frontend_execution`)

## Test-Backed Contracts

`tests/backend/test_interaction_loop.py` verifies:

- recoverable stream tool-call error emits `ErrorEvent`, `ToolCallEvent`, `ToolOutputEvent`, then completion on subsequent successful turn
- tool executor is not invoked for recoverable malformed tool-call path
- synthetic history tool output includes malformed-tool-call marker text
- non-recoverable stream error stops loop and persists system error history entry
- empty final-response fallback includes latest tool-output summary with `<system_context>` stripped

## Drift Risks

1. Changing event order (`ToolOutputEvent` before `ToolCallEvent`) can desynchronize frontend tool runner state.
2. Removing `skip_frontend_execution` metadata causes frontend to execute nonexistent synthetic tools.
3. Weakening recoverable marker matching can convert recoverable parse failures into hard aborts.
4. Dropping history replay injection removes corrective context for next-turn model retry.

## Related Pages

- [Backend Agent Recovery Docs Hub](README.md)
- [Interaction Loop and Tool-Turn Orchestration Reference](../interaction_loop_and_tool_turn_orchestration_reference.md)
- [Frontend Events Contracts Docs Hub](../../../frontend/contracts/events/README.md)
