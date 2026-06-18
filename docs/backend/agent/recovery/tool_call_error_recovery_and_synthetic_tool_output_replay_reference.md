---
summary: "Deep reference for interaction-loop recovery from malformed model tool-call payloads: recoverable error classification, synthetic tool-call/tool-output emission order, history replay injection, and cleanup semantics."
read_when:
  - When changing recoverable error marker matching, structured tool-call recovery metadata extraction, or synthetic ToolCallEvent/ToolOutputEvent payload shape.
  - When debugging loops that unexpectedly abort after stream errors, or SDK/renderer behavior for `skip_local_execution` metadata.
title: "Tool-Call Error Recovery and Synthetic Tool-Output Replay Reference"
---

# Tool-Call Error Recovery and Synthetic Tool-Output Replay Reference

## Canonical Modules

- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/execution/tool_call_bridge.py`
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

Recovery requires structured `ErrorEvent.metadata` propagated from
`LLMAPIError.metadata`. Error text is still used for the user-facing diagnostic
message, but missing `llm_tool_call_parse_failed` metadata is non-recoverable.

## Recovery Decision Gate

After LLM stream finishes in `run_loop()`:

- if `ErrorEvent` content exists, loop checks `_is_recoverable_llm_tool_call_error(error_text, metadata)`
- recoverable requires both:
  - `metadata.llm_tool_call_parse_failed is True`
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

This ordering is intentional to preserve SDK/main and renderer state-machine assumptions (`tool-call` before `tool-output`).

Synthetic payload metadata:

- `request_id`: extracted tool call id or generated fallback (`llm_tool_call_error_<12hex>`)
- `llm_tool_call_validation_failed = True`
- `skip_local_execution = True`
- optional parse diagnostics:
  - `llm_tool_call_raw_tool_call_preview`
  - `llm_tool_call_raw_arguments_preview`
  - `llm_tool_call_raw_arguments_preview_truncated` (`True` when preview ends with `...[truncated]`)
  - `llm_tool_call_parse_error` (raw-arguments marker removed + whitespace-normalized summary)

Upstream source:

- streaming/native provider normalization attaches these fields to `LLMAPIError.metadata`
- `LLMStreamProcessor` preserves that metadata on consumed `ErrorEvent`
- `InteractionLoop` reads metadata only; legacy/mock error strings without
  structured metadata are not recoverable

`ToolCallEvent` fields:

- `tool_name`: extracted from `metadata.llm_tool_name` or fallback `invalid_tool_call`
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

If metadata omits `llm_tool_call_id`, a fallback id is generated and used as
both protocol request id and history-staging key. If metadata omits
`llm_tool_name`, the synthetic call uses `invalid_tool_call`.

## Synthetic Tool-Output Message Format

`_build_recoverable_tool_output_message(...)` emits canonical tool-output-style text:

- `<tool_name> output:` header
- fixed explanation: malformed tool-call arguments from model
- compacted single-line error preview
- retry guidance line: `retry_guidance: retry the same tool with smaller argument payload chunks.`
- edit strategy line tuned by file-path detection (see below)
- `status: failed`

Error preview normalization:

- whitespace collapsed
- capped at `_TOOL_OUTPUT_ERROR_PREVIEW_CHARS` (`600`), with `...[truncated]` suffix when exceeded

### Raw tool-call preview, raw-arguments preview, and target-file extraction

Provider normalization writes `llm_tool_call_raw_tool_call_preview` and
`llm_tool_call_raw_arguments_preview` into metadata when the malformed provider
payload exposes those previews.

`_extract_target_file_path(...)` then attempts file-target extraction from that preview:

- JSON form: `"file_path": "..."`
- escaped JSON form: `\"file_path\":\"...\"`
- shell redirect form: `cat > <path>`

When file path is extracted:

- synthetic output adds `target_file: <path>`
- `edit_strategy` becomes section-by-section replace/apply_patch guidance

When no file path is extracted:

- `edit_strategy` remains generic split-large-edit guidance

## History Replay Injection

To ensure next LLM turn sees this recovery context:

- `session.history.stage_tool_call_ids([tool_call_id])`
- `session.history.add_tool_output(tool_output_message)`

This mirrors normal tool-result ingestion shape, preserving context continuity.

## Interaction with Tool Executor Cleanup

In standard tool path, loop uses `finally` to call `tool_executor.process_results(...)` when needed, preventing leaked pending request ids/state.

Recovery path bypasses tool execution entirely (`continue` after synthetic events), so no tool executor state should be created for that failed LLM-generated call.

## Formatter and Transport Contract

Formatter propagation guarantees:

- `ToolCallEventFormatter` forwards `request_id` and `metadata` when present
- `ToolOutputEventFormatter` forwards `metadata` (and output/error fields)

This allows SDK/local-runtime consumers to:

- correlate synthetic tool output via metadata/request id
- skip local execution using metadata gate (`skip_local_execution`)

## Test-Backed Contracts

`tests/backend/test_interaction_loop.py` verifies:

- recoverable stream tool-call error emits `ErrorEvent`, `ToolCallEvent`, `ToolOutputEvent`, then completion on subsequent successful turn
- tool executor is not invoked for recoverable malformed tool-call path
- synthetic history tool output includes malformed-tool-call marker text
- non-recoverable stream error stops loop and persists system error history entry
- empty final-response fallback includes latest tool-output summary with `<system_context>` stripped

## Drift Risks

1. Changing event order (`ToolOutputEvent` before `ToolCallEvent`) can desynchronize SDK/main and renderer tool state.
2. Removing `skip_local_execution` metadata causes SDK local-runtime dispatch to execute nonexistent synthetic tools.
3. Weakening recoverable marker matching can convert recoverable parse failures into hard aborts.
4. Dropping history replay injection removes corrective context for next-turn model retry.

## Related Pages

- [Backend Agent Recovery Docs Hub](README.md)
- [Interaction Loop and Tool-Turn Orchestration Reference](../interaction_loop_and_tool_turn_orchestration_reference.md)
- [Frontend Events Contracts Docs Hub](../../../frontend/contracts/events/README.md)
