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
- `switch_window`
- `wait`

Deep runtime reference:

- [Mouse, Keyboard, Scroll, and Screenshot Runtime Reference](tools/computer/mouse_keyboard_scroll_and_screenshot_runtime_reference.md)

### Filesystem tools

- `read_file`
- `replace`

Deep runtime reference:

- [Filesystem Read and Replace Runtime Reference](tools/filesystem_read_replace_runtime_reference.md)

### System tools

- `open_app`
- `run_shell_command`
- `process`
- `get_open_windows`
- `get_system_stats`

System shell output shaping is split into dedicated helpers:

- `tools/system/shell_output_formatting.py` (token-budget truncation + display/LLM formatting)
- `tools/system/shell_response_payloads.py` (foreground/background envelope assembly)

Deep runtime reference:

- [Shell and Process Session Runtime Reference](tools/shell_and_process_session_runtime_reference.md)
- [Shell Output Formatting and Response Payload Contract Reference](tools/system/shell_output_formatting_and_response_payload_contract_reference.md)
- [Wait, Window, and Stats Runtime Reference](tools/system/wait_window_stats_runtime_reference.md)

### Browser tools

- `browser`

Current runtime note:

- the live sidecar registry exposes 14 direct tool names
- `computer_use` and `system_use` are not registered sidecar tools in `frontend/src/main/python/tools/registry.py`
- wrapper-shaped artifacts still exist under `model-facing/`, but they are not part of the current sidecar execution path

## Schema Definitions and Validation Boundary

`tools/schemas.py` defines Pydantic arg models for tool parameters.

Schema classes include validation rules such as:

- coordinate requirements for mouse actions
- action-specific required fields for keyboard and scroll
- shell command timeout/output limits
- detached app launch verification controls
- process tool action/session argument rules

Current runtime boundary:

- `ToolRegistry.execute_tool` does not instantiate these schema models before invoking tools.
- `ToolRegistry.execute_tool` currently performs only registry-level dispatch checks:
  - tool name must exist in the in-memory registry
  - `args` must be an object
  - args are deep-copied before tool invocation
- no wrapper-envelope validation path exists in the current sidecar registry implementation
- runtime argument enforcement is therefore owned by the concrete tool implementation, not by a sidecar wrapper router

Implication:

- schema-only changes still do not automatically enforce runtime behavior inside the sidecar registry.

## Backend Compatibility Constraint

`EXPOSED_TO_BACKEND_TOOL_NAMES` in `frontend/src/main/python/tools/exposed_tool_names.py` defines expected parity with backend remote tool schemas.

If missing, sidecar logs warnings and tools may fail at runtime when backend emits calls.

## Result Normalization Rules

Registry output normalization handles:

- native `ToolResult`
- legacy dict payloads (`success`, `data`, `error`)
- fallback error extraction from nested payload fields

This keeps backend ingestion stable despite mixed tool implementation styles.
