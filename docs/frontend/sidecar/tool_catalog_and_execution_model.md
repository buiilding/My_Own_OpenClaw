---
summary: "Python sidecar tool catalog and execution model, including schema validation, async dispatch, and result normalization."
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

## Tool Families

### Computer tools

- `mouse_control`
- `keyboard_control`
- `screenshot`
- `scroll_control`

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

Deep runtime reference:

- [Shell and Process Session Runtime Reference](tools/shell_and_process_session_runtime_reference.md)

### Browser tools

- `browser`

## Schema Validation

`tools/schemas.py` defines Pydantic arg models for tool parameters.

Validation examples:

- coordinate requirements for mouse actions
- action-specific required fields for keyboard and scroll
- shell command timeout/output limits
- process tool action/session argument rules

This is the first line of safety before running sidecar actions.

## Backend Compatibility Constraint

`EXPOSED_TO_BACKEND_TOOLS` in sidecar registry defines expected parity with backend remote tool schemas.

If missing, sidecar logs warnings and tools may fail at runtime when backend emits calls.

## Result Normalization Rules

Registry output normalization handles:

- native `ToolResult`
- legacy dict payloads (`success`, `data`, `error`)
- fallback error extraction from nested payload fields

This keeps backend ingestion stable despite mixed tool implementation styles.
