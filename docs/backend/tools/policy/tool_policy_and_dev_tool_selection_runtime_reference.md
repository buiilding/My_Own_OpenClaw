---
summary: "Deep backend reference for ToolPolicy and ToolSelection internals: allowlist/denylist precedence, mouse method schema pruning, parser-time method validation, startup OCR/vision gating, and selection cache invalidation semantics."
read_when:
  - When changing backend tool policy rules or `backend/dev/tool_selection*.toml` behavior.
  - When debugging tool whitelist errors, mouse method denial messages, or startup OCR/vision unexpectedly enabled or skipped.
title: "Tool Policy and Dev Tool Selection Runtime Reference"
---

# Tool Policy and Dev Tool Selection Runtime Reference

This page documents policy behavior implemented in:

- `backend/src/tools/tool_policy.py`
- `backend/src/tools/tool_selection.py`
- `backend/src/llm/parser_validation.py`
- `backend/src/llm/prompts/prompt_constructor.py`
- `backend/src/tools/orchestrator.py`
- `backend/src/core/container/initializer.py`
- `tests/backend/test_tool_policy.py`
- `tests/backend/test_dev_tool_selection.py`

## Policy Layers and Precedence

Tool exposure filtering is layered in this order:

1. interaction-mode allowlist from runtime config (`config.get_tool_allowlist()`)
2. dev tool-selection policy (`ToolSelection`) when enabled

`ToolPolicy.filter_tool_names(...)` and `ToolPolicy.filter_tool_schemas(...)` apply both layers in that order.

Practical effect:

- interaction-mode restrictions always apply, even when dev selection is disabled
- dev selection further narrows what remains

## ToolSelection Config Model

`ToolSelection` fields:

- `enabled`
- `mode` (`allowlist` or `denylist`)
- `tools` (name set)
- `mouse_enabled_coordinate_methods` (`manual|ocr|prediction`, optional)

Top-level enable rules:

- if `enabled=false`, selection returns `None` and policy acts as if dev selection is absent
- allowlist keeps only named tools
- denylist removes named tools

## Mouse Method Semantics

Mouse policy has method-level controls beyond tool name visibility.

`get_allowed_mouse_coordinate_methods()` behavior:

- if `mouse_control` disabled by top-level selection mode, returns empty set
- if enabled and no per-method list configured, all methods allowed
- if explicit method list configured, only those methods are allowed

If allowed method set is empty:

- `mouse_control` is effectively removed from filtered tool names/schemas

## Schema Pruning for Mouse Methods

`ToolSelection.filter_tool_schemas(...)` performs deep schema edits for `mouse_control`.

Field/enum pruning behavior:

- narrows `find_coordinates_by.enum` to allowed methods, preserving canonical order (`manual`, `ocr`, `prediction`)
- adjusts default method if current default is disallowed
- removes method-specific fields when corresponding method disabled:
  - `manual` disabled -> remove `x`, `y`
  - `ocr` disabled -> remove `ocr_text`
  - `prediction` disabled -> remove `description`, `model_name`

Schema path compatibility:

- supports legacy wrapped computer-use schema shape
- supports native direct function-parameter schema shape

## Parsing-Time Validation Coupling

`ToolCallValidator` composes policy in parser trust-boundary validation.

Validation flow:

1. compute valid tool-name index from registry names filtered via `ToolPolicy.filter_tool_names(...)`
2. reject tool names outside filtered set with whitelist error message
3. for `mouse_control`, call `ToolPolicy.get_method_validation_errors(...)`
4. reject disallowed methods with explicit allowed-method list in error

Method normalization:

- `find_coordinates_by` values are normalized via `normalize_coordinate_method(...)`
- enum instances and mixed-case strings are normalized to lowercase strings

## Prompt Injection Coupling

`PromptConstructor._get_filtered_tool_schemas()` uses `ToolPolicy.filter_tool_schemas(...)`.

Result:

- LLM only sees policy-filtered tool schemas
- mouse schema it receives already excludes disabled method fields

## Available-Tools Listing Coupling

`ToolResultOrchestrator.get_available_tools()` filters tool names via policy before returning capability metadata.

Result:

- API/runtime available-tool lists align with prompt-injected schema visibility

## Startup Service Gating Coupling

`ContainerInitializer` startup gates OCR and vision pre-initialization with policy:

- `ToolPolicy.should_initialize_ocr()` -> true only when OCR mouse method remains allowed
- `ToolPolicy.should_initialize_vision()` -> true only when prediction mouse method remains allowed

When disabled:

- OCR startup initialization is skipped and service can be marked disabled
- vision startup model preload is skipped

This keeps startup cost aligned with currently enabled coordinate methods.

## Selection File Loading and Cache Semantics

`load_tool_selection(...)` behavior:

- default file path: `backend/dev/tool_selection.toml`
- env override: `WINDIEOS_DEV_TOOL_SELECTION_PATH`
- missing file -> `None` (no selection)

Cache key uses file signature tuple:

- `mtime_ns`
- `ctime_ns`
- `size`

Rationale:

- protects against same-mtime rewrites (for example explicit `utime` operations)

Parsing robustness:

- invalid modes fall back to `denylist` with warning
- non-string tool entries ignored
- unknown mouse methods ignored with warning
- malformed tables/arrays tolerated with warning and best-effort defaults

## Test-Backed Invariants

From `test_tool_policy.py` and `test_dev_tool_selection.py`:

- interaction-mode allowlist filtering works independently
- allowlist/denylist selection filtering works
- mouse method schema field pruning works
- disabled method calls produce parser validation errors
- empty mouse method list effectively disables mouse tool
- OCR/vision startup helpers reflect allowed methods
- cache refresh occurs even when file rewritten with same mtime

## Related Docs

- [Dev Tool Selection (Backend)](../../../development/dev_tool_selection.md)
- [Frontend Tool Bridge and Policy](../frontend_tool_bridge_and_policy.md)
- [Tool Security Policy and Executor Reference](../tool_security_policy_and_executor_reference.md)
