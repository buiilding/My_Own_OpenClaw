---
summary: "Deep reference for `ToolCallSchema` extraction behavior in `parser_types.py`: strict standard-format parsing, metadata promotion boundary, unified wrapper normalization, and deep-copy immutability guarantees."
read_when:
  - When changing `backend/src/llm/parser_types.py` tool-call extraction or wrapper normalization behavior.
  - When debugging parser-path differences between standard `functionCall` payloads and unified `computer_use`/`system_use` envelopes.
title: "ToolCallSchema Extraction and Unified Wrapper Normalization Reference"
---

# ToolCallSchema Extraction and Unified Wrapper Normalization Reference

## Canonical Modules

- `backend/src/llm/parser_types.py`
- `backend/src/llm/parser.py`
- `backend/src/llm/parser_extraction.py`
- `tests/backend/test_parser_types.py`
- `tests/backend/test_response_parser.py`

## Scope

This page covers parser-module extraction behavior only (`ToolCallSchema`).

For native provider tool-call bridging differences (`tool_call_bridge.py`), see:

- [Parser Trust Boundary and Native Tool-Call Reference](parser_trust_boundary_and_native_tool_call_reference.md)
- [Native Tool-Call Bridge and History Mapping Reference](../agent/native_tool_call_bridge_and_history_mapping_reference.md)

## Accepted Root Shape

`ToolCallSchema.extract_tool_call(parsed_json)` only accepts:

- `{"functionCall": {"name": "...", "args": {...}}}`

Key points:

- root object must be a dict
- `functionCall` value must be a dict
- `name` must be non-empty string after trim
- `args` must be a dict (defaults to `{}` when absent)

Legacy wrapper payloads (for example top-level `metadata` + `action`) are rejected.

## Standard Extraction Contract

For non-wrapper tool names:

1. trim tool name
2. deep-copy args dictionary
3. extract metadata from `args.metadata` only when it is a dict
4. remove extracted `metadata` from returned executable args
5. return `(tool_name, args_without_metadata, metadata_or_none)`

Metadata boundary:

- non-dict `args.metadata` is ignored (no error, no promotion)
- metadata is not validated here; validation happens in parser validation and downstream tool schema layers

## Unified `computer_use` Normalization

When `name == "computer_use"`:

- `args.tool` must be non-empty string in supported set:
  - `mouse_control`
  - `keyboard_control`
  - `screenshot`
  - `scroll_control`
  - `switch_tab`
  - `wait`
- trimmed mapped subtool becomes returned concrete `tool_name`
- `args.arguments`:
  - missing => defaults to `{}`
  - must be dict after defaulting; otherwise reject (`None`)

Return tuple shape:

- `(mapped_subtool_name, deep_copied_arguments, metadata_or_none)`

## Unified `system_use` Normalization

When `name == "system_use"`:

- `args.tool` must be non-empty string in supported set:
  - `run_shell_command`
  - `replace`
  - `read_file`
  - `get_system_stats`
  - `get_open_windows`
- mapped subtool becomes returned concrete `tool_name`
- `args.arguments`:
  - missing => defaults to `{}`
  - must be dict after defaulting; otherwise reject (`None`)

Explanation resolution:

1. top-level wrapper `args.explanation` (trimmed, non-empty)
2. nested `arguments.explanation` is ignored and not promoted

When present, top-level explanation is injected into returned concrete args as `arguments["explanation"]`.

## Immutability and Deep-Copy Guarantees

`ToolCallSchema` intentionally deep-copies extracted payload objects so parser outputs can be mutated downstream without mutating original parsed JSON structures.

Locked by tests:

- standard format args deep-copy immutability
- unified `computer_use.arguments` deep-copy immutability
- direct/unified metadata extraction does not mutate source payload metadata objects

## Failure Semantics

`extract_tool_call(...)` returns `None` for malformed payloads, including:

- non-dict root/functionCall/args
- missing/blank tool names
- unknown unified wrapper subtool values
- non-dict unified `arguments`
- invalid schema root shape

No exceptions are raised by this helper for normal invalid input rejection paths.

## Drift Hotspots

1. Changing unified subtool allowlists without synchronizing tool schemas/registry docs can cause parser/runtime divergence.
2. Mutating source payloads in-place breaks caller expectations and test contracts around parser immutability.
3. Re-introducing nested `arguments.explanation` fallback in parser path without matching native bridge and sidecar behavior creates provider-specific drift.

## Related Pages

- [Backend LLM Docs Hub](README.md)
- [Parser Trust Boundary and Native Tool-Call Reference](parser_trust_boundary_and_native_tool_call_reference.md)
- [System Use Unified Wrapper Schema and Explanation Resolution Reference](../tools/contracts/system_use_unified_wrapper_schema_and_explanation_resolution_reference.md)
- [Computer Tool Schema Guidance and Unified Envelope Validation Reference](../tools/contracts/computer_tool_schema_guidance_and_unified_envelope_validation_reference.md)
