---
summary: "Deep reference for sidecar shell output formatting and response payload builders: foreground display text, raw captured output, and foreground/background ToolResult payloads."
read_when:
  - When changing `run_shell_command` output shaping (`output`, `error`, `message`).
  - When changing shell response payload fields returned to ToolRegistry/backend or session-running metadata.
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

- user-facing status text formatting: `shell_output_formatting.py`
- foreground/background `ToolResult` assembly: `shell_response_payloads.py`

This keeps process execution/session lifecycle logic separate from payload-shaping contracts.

## Raw Output Contract

`run_shell_command` does not accept a caller-provided output token limit. The
foreground response exposes the captured `stdout` as `data.output` and captured
`stderr` as `data.error`.

For long-running or high-volume commands, use `run_in_background=true` or
`yield_after_seconds`, then inspect output through the `process` tool. Background
session storage is capped by `shell_process_registry.py` using character limits
instead of per-call model token limits.

## Display Output Contract

`format_display_output(result)` provides short user-facing status text:

- timed out -> `Command timed out and was terminated`
- success -> `Command completed successfully`
- failure -> `Command failed with exit code <n>`
- includes formatted stdout/stderr blocks when present
- fallback `No output` when both streams empty

Used for `output` field in foreground responses.

## Response Payload Builder Contract

### `build_background_response(...)`

Returns `ToolResult.success_result(...)` with:

- `data.status: "running"`
- session/runtime fields: `session_id`, `pid`, `pty`, `tail`
- warnings list passthrough
- `output` guidance to use process tool for polling
- concise `output`

### `build_foreground_response(...)`

Returns a native `ToolResult` with:

- `success = (exit_code == 0 or exit_code is None)`
- execution payload fields:
  - `command`, `working_directory`
  - `output`, `error`, `exit_code`, `execution_time`, `timed_out`
  - `warnings`
  - raw `output`
  - user-facing `message`

Warnings append to `message` while preserving base status text.

Failed foreground commands preserve structured stdout/stderr/exit-code data and
set the native `ToolResult.error` message explicitly.

## ToolRegistry/Backend Contract Impact

These fields are consumed downstream as standard tool result payload keys:

- model-facing captured stdout: `output`
- captured stderr: `error`
- UI-facing short text: `message`

Maintaining field names is required for backward-compatible result transformer behavior.

## Test-Backed Signals

`tests/sidecar/test_shell_output_formatting.py` verifies display status text for
success/failure/timeout.

`tests/sidecar/test_shell_process_tool.py` continues to validate integration behavior through `run_shell_command` end-to-end paths.

## Drift Hotspots

1. Renaming `output`, `error`, or `message` breaks downstream result handling.
2. Adding caller-controlled output truncation in shell execution can hide command output that users expect to inspect directly.
3. Diverging raw captured output from user-facing status text can confuse model history vs user status views.

## Related Pages

- [Shell and Process Session Runtime Reference](../shell_and_process_session_runtime_reference.md)
- [Tool Registry Exposed Schema and Result Contract Reference](../registry/tool_registry_exposed_schema_and_result_contract_reference.md)
- [Local-Runtime System Tools Docs Hub](README.md)
