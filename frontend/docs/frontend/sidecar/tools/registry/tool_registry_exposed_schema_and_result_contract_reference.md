---
summary: "Deep reference for local-runtime Python ToolRegistry internals: exposed-tool parity contract, import-time registration behavior, execute_tool dispatch path, and native ToolResult enforcement."
read_when:
  - When adding/removing local-runtime Python tools or changing backend remote schema exposure lists.
  - When debugging invalid tool return formats or unexpected `Tool not found` failures.
title: "Tool Registry Exposed Schema and Result Contract Reference"
---

# Tool Registry Exposed Schema and Result Contract Reference

This page documents behavior in:

- `frontend/src/main/python/tools/registry.py`
- `frontend/src/main/python/tools/result.py`
- `frontend/src/main/python/local_backend.py`
- `tests/sidecar/test_tool_registry.py`

## Registry Construction and Registration

`ToolRegistry.__init__` initializes an in-memory map:

- `self.tools: Dict[str, Callable[..., Any]]`

`_register_tools()` performs per-tool import/registration with isolated `try/except ImportError` blocks.

Implication:

- one failed import does not block other tool registrations
- failed imports are warning-level logs

Built-in local-runtime tool names expected by backend schemas are tracked in `frontend/src/main/python/tools/manifest.py` as `LOCAL_RUNTIME_BUILTIN_TOOL_NAMES`.

Current exposed set includes:

- computer: `mouse_control`, `keyboard_control`, `screenshot`, `scroll_control`, `switch_window`, `wait`
- system: `get_open_windows`, `get_system_stats`, `open_app`, `run_shell_command`, `process`
- filesystem: `read_file`, `replace`
- browser: `browser`

Wrapper artifact note:

- repo-local `model-facing/tool_schema.txt` still contains unified `computer_use` and `system_use` schemas
- those wrapper names are not present in `frontend/src/main/python/tools/registry.py` and are not part of the live local-runtime exposed set backed by the Python registry

Parity guard:

- registry computes `missing_builtin_tools`
- missing names emit a warning about unavailable built-in local-runtime tools

## Execute Path

Runtime flow:

1. `LocalRuntimeService._handle_execute_tool(tool_name, args)` calls `tool_registry.execute_tool(...)`.
2. registry resolves callable by exact tool name.
3. args must be a dict; non-dict args fail early with `Tool args must be an object`.
4. callable dispatch:
   - coroutine function -> `await tool(args)`
   - sync function -> `tool(args)`
5. output must be a native `ToolResult`.
6. the local-runtime implementation returns `ToolResult.to_dict()` over JSON-RPC.

Missing tool behavior:

- returns `ToolResult.error_result("Tool not found: <name>")`

Exception behavior:

- unexpected exceptions are caught and returned as `Tool execution failed: <error>`

## Result Rules

### Native `ToolResult`

- passthrough with no transformation
- `mouse_control`, `keyboard_control`, `screenshot`, `scroll_control`,
  `switch_window`, `get_open_windows`, `wait`, `get_system_stats`,
  `run_shell_command`, and `process` return this shape directly; first-party
  tools should prefer this contract when touched

### Invalid result type

- any non-`ToolResult` response becomes `Tool returned invalid result format`

## Exposed-Tools Contract and Tests

`tests/sidecar/test_tool_registry.py` enforces key behaviors:

- registered tool names must match exposed set, with optional runtime-missing `browser`
- missing tool lookup returns canonical error
- non-dict args are rejected before tool callable executes
- tool args are passed through without schema-driven registry validation beyond the object check
- mapping-shaped tool results are rejected instead of normalized
- exceptions are captured and wrapped

## Schema File Boundary

`tools/schemas.py` defines Pydantic arg models for many tools.

Important runtime fact:

- `ToolRegistry.execute_tool` does not currently instantiate/validate those schemas
- there is no unified-wrapper router in the current registry implementation
- validation is therefore tool-implementation-specific unless callers validate upstream

Operational consequence:

- changing schema classes alone does not enforce runtime behavior
- enforcement requires wiring schema validation into registry path or each tool

## Integration Notes

Cross-doc references:

- execution model overview: [Local-Runtime Tool Catalog and Execution Model](../../tool_catalog_and_execution_model.md)
- computer tool behavior: [Mouse, Keyboard, Scroll, and Screenshot Runtime Reference](../computer/mouse_keyboard_scroll_and_screenshot_runtime_reference.md)
- shell/process behavior: [Shell and Process Session Runtime Reference](../shell_and_process_session_runtime_reference.md)
- filesystem behavior: [Filesystem Read and Replace Runtime Reference](../filesystem_read_replace_runtime_reference.md)
