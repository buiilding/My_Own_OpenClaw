---
summary: "Deep reference for sidecar shell output formatting and response payload builders: token-budget truncation rules, display/LLM content shaping, and foreground/background response envelopes."
read_when:
  - When changing `run_shell_command` output shaping (`llm_content`, `return_display`, truncation metadata).
  - When changing shell response payload fields returned to ToolRegistry/backend (`output_token_limit`, `output_truncated`, session-running metadata).
title: "Shell Output Formatting and Response Payload Contract Reference"
---

# Shell Output Formatting and Response Payload Contract Reference

## Canonical Modules

- `frontend/src/main/python/tools/system/shell_output_formatting.py`
- `frontend/src/main/python/tools/system/shell_response_payloads.py`
- `frontend/src/main/python/tools/system/shell_tool.py`
- `tests/sidecar/test_shell_output_formatting.py`
- `tests/sidecar/test_shell_process_tool.py`

## Runtime Split and Ownership

`shell_tool.py` delegates shell output shaping to focused helpers:

- token-budget + content formatting: `shell_output_formatting.py`
- foreground/background response envelope assembly: `shell_response_payloads.py`

This keeps process execution/session lifecycle logic separate from payload-shaping contracts.

## Max Output Token Contract

`resolve_max_output_tokens(raw_value)` behavior:

- `None` -> defaults to `DEFAULT_MAX_OUTPUT_TOKENS` (`10000`)
- non-int or bool -> validation error (`max_output_tokens must be an integer`)
- `<= 0` -> validation error (`max_output_tokens must be greater than zero`)
- positive int -> accepted limit

## Approximate Token Truncation Policy

`format_llm_output(...)` uses approximate budget:

- `APPROX_BYTES_PER_TOKEN = 4`
- output block built from:
  - stdout section (`Output:`)
  - stderr section (`Error:`)
- if output exceeds budget:
  - keeps head + tail slices
  - inserts marker `…<n> tokens truncated…`
  - prefixes `Total output lines: <count>`
  - reports `Original output token count: <count>` in final `llm_content`

Status lines appended to model-facing content:

- success (`exit_code == 0`)
- failed non-zero exit
- timed out
- execution time (seconds)

## Display Output Contract

`format_display_output(result)` provides short user-facing status text:

- timed out -> `Command timed out and was terminated`
- success -> `Command completed successfully`
- failure -> `Command failed with exit code <n>`
- includes formatted stdout/stderr blocks when present
- fallback `No output` when both streams empty

Used for `return_display` field in foreground responses.

## Response Payload Builder Contract

### `build_background_response(...)`

Returns:

- `success: true`
- `data.status: "running"`
- session/runtime fields: `session_id`, `pid`, `pty`, `tail`
- warnings list passthrough
- `llm_content` guidance to use process tool for polling
- concise `return_display`

### `build_foreground_response(...)`

Returns:

- `success = (exit_code == 0 or exit_code is None)`
- execution payload fields:
  - `command`, `working_directory`
  - `output`, `error`, `exit_code`, `execution_time`, `timed_out`
  - `warnings`
  - `output_token_limit`
  - `original_output_tokens`
  - `output_truncated`
  - `llm_content`
  - `return_display`

Warnings append to `return_display` suffix while preserving base status text.

## ToolRegistry/Backend Contract Impact

These fields are consumed downstream as standard tool result payload keys:

- model-facing: `llm_content`
- UI-facing short text: `return_display`
- truncation diagnostics: `output_token_limit`, `original_output_tokens`, `output_truncated`

Maintaining field names is required for backward-compatible result transformer behavior.

## Test-Backed Signals

`tests/sidecar/test_shell_output_formatting.py` verifies:

- default + validation behavior of `max_output_tokens`
- truncation marker and original-token metadata emission
- display status text for success/failure/timeout

`tests/sidecar/test_shell_process_tool.py` continues to validate integration behavior through `run_shell_command` end-to-end paths.

## Drift Hotspots

1. Changing truncation marker text can break log scanning and snapshot expectations.
2. Renaming `output_token_limit` / `output_truncated` / `original_output_tokens` breaks downstream diagnostics.
3. Diverging `llm_content` vs `return_display` status semantics can confuse model history vs user status views.

## Related Pages

- [Shell and Process Session Runtime Reference](../shell_and_process_session_runtime_reference.md)
- [Tool Registry Exposed Schema and Result Normalization Reference](../registry/tool_registry_exposed_schema_and_result_normalization_reference.md)
- [Frontend Sidecar System Tools Docs Hub](README.md)
