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

- `computer_use` (unified router)
- `mouse_control`
- `keyboard_control`
- `screenshot`
- `scroll_control`
- `switch_tab`
- `wait`

Deep runtime reference:

- [Mouse, Keyboard, Scroll, and Screenshot Runtime Reference](tools/computer/mouse_keyboard_scroll_and_screenshot_runtime_reference.md)

### Filesystem tools

- `read_file`
- `replace`

Deep runtime reference:

- [Filesystem Read and Replace Runtime Reference](tools/filesystem_read_replace_runtime_reference.md)

### System tools

- `system_use` (unified router)
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
- `ToolRegistry` validates envelope shape for unified wrappers before delegation:
  - `computer_use`: requires `tool` + required `metadata` + object `arguments`
  - `system_use`: requires valid `tool` + object `arguments` + top-level non-empty `explanation`
    - explanation resolution is trim-normalized; whitespace-only values are treated as missing
    - when explanation resolves, delegated concrete args receive injected `explanation`
    - wrapper scope is limited to `run_shell_command|replace|read_file|get_system_stats|get_open_windows`; `open_app` and `process` remain direct-only tools
- Backend `ToolPreparer` now performs authoritative pre-dispatch validation for model-emitted tool args and resolved computer-use executor payloads before any frontend execution request is sent.
- Sidecar still keeps lightweight wrapper-envelope validation plus concrete tool runtime checks as defense in depth.

Implication:

- schema-only changes still do not automatically enforce runtime behavior inside the sidecar registry, but malformed backend-dispatched tool payloads should now fail closed in backend preparation before reaching frontend execution.

## Backend Compatibility Constraint

`EXPOSED_TO_BACKEND_TOOLS` in sidecar registry defines expected parity with backend remote tool schemas.

If missing, sidecar logs warnings and tools may fail at runtime when backend emits calls.

## Result Normalization Rules

Registry output normalization handles:

- native `ToolResult`
- legacy dict payloads (`success`, `data`, `error`)
- fallback error extraction from nested payload fields

This keeps backend ingestion stable despite mixed tool implementation styles.
