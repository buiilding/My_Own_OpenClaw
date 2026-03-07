---
summary: "Deep reference for sidecar ToolRegistry internals: exposed-tool parity contract, import-time registration behavior, execute_tool dispatch path, and legacy dict error normalization semantics."
read_when:
  - When adding/removing sidecar tools or changing backend remote schema exposure lists.
  - When debugging mixed tool return formats, nested error payload extraction, or unexpected `Tool not found` failures.
title: "Tool Registry Exposed Schema and Result Normalization Reference"
---

# Tool Registry Exposed Schema and Result Normalization Reference

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

Tool names expected by backend schemas are tracked in `EXPOSED_TO_BACKEND_TOOLS`.

Current exposed set includes:

- unified wrappers: `computer_use`, `system_use`
- computer: `mouse_control`, `keyboard_control`, `screenshot`, `scroll_control`, `switch_tab`, `wait`
- system: `get_open_windows`, `get_system_stats`, `open_app`, `run_shell_command`, `process`
- filesystem: `read_file`, `replace`
- browser: `browser`

Parity guard:

- registry computes `missing_exposed_tools`
- missing names emit warning about sidecar/backend schema drift

## Execute Path

Runtime flow:

1. `LocalBackend._handle_execute_tool(tool_name, args)` calls `tool_registry.execute_tool(...)`.
2. registry resolves callable by exact tool name.
3. args must be a dict; non-dict args fail early with `Tool args must be an object`.
4. callable dispatch:
   - coroutine function -> `await tool(args)`
   - sync function -> `tool(args)`
5. output normalized into `ToolResult`.
6. local backend returns `ToolResult.to_dict()` over JSON-RPC.

Missing tool behavior:

- returns `ToolResult.error_result("Tool not found: <name>")`

Unified computer-use behavior:

- `computer_use` accepts `{tool, metadata, arguments}` and routes execution to a concrete local sidecar tool (`mouse_control`, `keyboard_control`, `screenshot`, `scroll_control`, `switch_tab`, `wait`).
- sidecar now enforces `metadata` as an object with required non-empty string fields: `description`, `explanation`, and `expectation` (whitespace-only rejected, values trimmed before delegation).
- `arguments` must be an object; malformed envelopes fail closed in sidecar before subtool execution.
- metadata must be top-level on the unified envelope; legacy nested wrappers such as `arguments.metadata` are rejected (`computer_use.metadata must be an object`).
- non-string required metadata values fail closed as missing required fields.
- normalized/trimmed metadata is written back to envelope args (`args["metadata"]`) for observability parity, while delegated concrete subtool receives only `arguments` payload.

Unified system-use behavior:

- `system_use` accepts `{tool, explanation, arguments}` and routes to mapped concrete local tools (`run_shell_command`, `replace`, `read_file`, `get_system_stats`, `get_open_windows`).
- `tool` is trim-normalized and must be in the supported set, else fail-closed (`system_use requires a valid 'tool' value ...`).
- `arguments` must be an object, else fail-closed (`system_use.arguments must be an object`).
- explanation resolution precedence:
  1. top-level `explanation` when non-empty
  2. fallback nested `arguments.explanation` (legacy compatibility)
- resolved explanation text is trim-normalized; whitespace-only values are treated as missing
- delegated concrete subtool receives a deep-copied `arguments` payload (plus resolved explanation when available), preventing subtool mutations from leaking back into wrapper envelope input.
- wrapper scope is intentionally limited to those five actions; `open_app` and `process` remain direct tools and are rejected when sent as `system_use.tool` values.

Exception behavior:

- unexpected exceptions are caught and returned as `Tool execution failed: <error>`

## Result Normalization Rules

### Native `ToolResult`

- passthrough with no transformation

### Legacy dict success path

When dict result has `success != False`:

- registry wraps `result.get("data", result)` into `ToolResult.success_result(...)`

### Legacy dict failure path

When dict result has `success is False`, registry uses `_extract_failure_payload(...)`.

Error-message extraction precedence:

1. top-level `error` string
2. top-level `data` string
3. nested dict fields in order:
   - `error`
   - `return_display`
   - `llm_content`
   - `output`
   - `message`
4. nested `exit_code` integer -> `Tool execution failed with exit code <n>`
5. fallback -> `Tool execution failed`

Returned failure payload:

- message from precedence list above
- `data` field preserved when nested payload is dict

### Invalid result type

- any non-dict, non-`ToolResult` response becomes `Tool returned invalid result format`

## Exposed-Tools Contract and Tests

`tests/sidecar/test_tool_registry.py` enforces key behaviors:

- registered tool names must match exposed set, with optional runtime-missing `browser`
- missing tool lookup returns canonical error
- non-dict args are rejected before tool callable executes
- `computer_use` fails closed when required metadata is missing/blank
- `computer_use` rejects legacy nested `arguments.metadata` wrappers and non-string required metadata fields
- `computer_use` accepts trimmed required metadata and still delegates unchanged concrete `arguments`
- `system_use` routes supported wrappers to the expected concrete subtool and injects resolved explanation into delegated args
- `system_use` supports nested explanation fallback for legacy payload compatibility
- `system_use` trims explanation text and ignores whitespace-only top-level/nested values before delegation
- `system_use` rejects unknown wrapper subtool names (including `open_app` and `process`) and non-object `arguments`
- dict legacy success/failure normalization behaves as expected
- nested legacy errors (for example usage text in `data.error`) are surfaced to top-level `ToolResult.error`
- exceptions are captured and wrapped

## Schema File Boundary

`tools/schemas.py` defines Pydantic arg models for many tools.

Important runtime fact:

- `ToolRegistry.execute_tool` does not currently instantiate/validate those schemas
- exception: unified wrapper envelope fields are validated in registry routers before dispatch:
  - `computer_use`: `tool`, `metadata`, `arguments`
  - `system_use`: `tool`, optional top-level `explanation`, `arguments`
- validation is therefore tool-implementation-specific unless callers validate upstream

Operational consequence:

- changing schema classes alone does not enforce runtime behavior
- enforcement requires wiring schema validation into registry path or each tool

## Integration Notes

Cross-doc references:

- execution model overview: [Sidecar Tool Catalog and Execution Model](../../tool_catalog_and_execution_model.md)
- computer tool behavior: [Mouse, Keyboard, Scroll, and Screenshot Runtime Reference](../computer/mouse_keyboard_scroll_and_screenshot_runtime_reference.md)
- shell/process behavior: [Shell and Process Session Runtime Reference](../shell_and_process_session_runtime_reference.md)
- filesystem behavior: [Filesystem Read and Replace Runtime Reference](../filesystem_read_replace_runtime_reference.md)
