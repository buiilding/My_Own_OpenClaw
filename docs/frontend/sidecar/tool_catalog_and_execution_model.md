---
summary: "Python sidecar tool catalog and execution model, including registry dispatch, schema-definition boundaries, and result normalization."
read_when:
  - When adding/changing sidecar tool implementations.
  - When debugging sidecar tool output shape or backend compatibility.
title: "Sidecar Tool Catalog and Execution Model"
---

# Sidecar Tool Catalog and Execution Model

Core modules:

- `frontend/src/main/python/tools/registry.py`
- `frontend/src/main/python/tools/schemas.py`
- `frontend/src/main/python/local_backend.py`

## Execution Model

1. Electron main sends `execute_tool` JSON-RPC request.
2. `LocalBackend._handle_execute_tool` delegates to `ToolRegistry.execute_tool`.
3. Registry resolves tool callable by name.
4. Tool runs sync or async.
5. Output normalized to `ToolResult` shape.
6. Main process maps result back to renderer/backend payload flow.

Detailed registry behavior:

- [Tool Registry Exposed Schema and Result Normalization Reference](tools/registry/tool_registry_exposed_schema_and_result_normalization_reference.md)

## Tool Families

### Computer tools

- `mouse_control`
- `keyboard_control`
- `screenshot`
- `scroll_control`

Deep runtime reference:

- [Mouse, Keyboard, Scroll, and Screenshot Runtime Reference](tools/computer/mouse_keyboard_scroll_and_screenshot_runtime_reference.md)

### Filesystem tools

- `read_file`
- `replace`

Deep runtime reference:

- [Filesystem Read and Replace Runtime Reference](tools/filesystem_read_replace_runtime_reference.md)

### System tools

- `run_shell_command`
- `process`
- `switch_tab`
- `get_open_windows`
- `get_system_stats`
- `wait`

System shell output shaping is split into dedicated helpers:

- `tools/system/shell_output_formatting.py` (token-budget truncation + display/LLM formatting)
- `tools/system/shell_response_payloads.py` (foreground/background envelope assembly)

Deep runtime reference:

- [Shell and Process Session Runtime Reference](tools/shell_and_process_session_runtime_reference.md)
- [Shell Output Formatting and Response Payload Contract Reference](tools/system/shell_output_formatting_and_response_payload_contract_reference.md)
- [Wait, Window, and Stats Runtime Reference](tools/system/wait_window_stats_runtime_reference.md)

### Browser tools

- `browser`

## Schema Definitions and Validation Boundary

`tools/schemas.py` defines Pydantic arg models for tool parameters.

Schema classes include validation rules such as:

- coordinate requirements for mouse actions
- action-specific required fields for keyboard and scroll
- shell command timeout/output limits
- process tool action/session argument rules

Current runtime boundary:

- `ToolRegistry.execute_tool` does not instantiate these schema models before invoking tools.
- Effective validation today is split between callers and tool implementations themselves.

Implication:

- schema-only changes do not enforce runtime behavior unless registry/tool execution path is updated too.

## Backend Compatibility Constraint

`EXPOSED_TO_BACKEND_TOOLS` in sidecar registry defines expected parity with backend remote tool schemas.

If missing, sidecar logs warnings and tools may fail at runtime when backend emits calls.

## Result Normalization Rules

Registry output normalization handles:

- native `ToolResult`
- legacy dict payloads (`success`, `data`, `error`)
- fallback error extraction from nested payload fields

This keeps backend ingestion stable despite mixed tool implementation styles.
