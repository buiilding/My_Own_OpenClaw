---
summary: "Deep reference for `ToolCallSchema` extraction behavior in `parser_types.py`: strict standard-format parsing, removed unified wrapper normalization, direct argument preservation, metadata promotion rejection, and deep-copy immutability guarantees."
read_when:
  - When changing `backend/src/llm/parser_types.py` tool-call extraction behavior.
  - When debugging parser-path differences between standard `functionCall` payloads, removed unified wrapper normalization, `computer_use`/`system_use` wrapper rejection, and provider-native tool calls.
title: "ToolCallSchema Extraction Reference"
---

# ToolCallSchema Extraction Reference

## Canonical Modules

- `backend/src/llm/parser_types.py`
- `backend/src/llm/parser.py`
- `backend/src/llm/parser_extraction.py`
- `tests/backend/test_parser_types.py`
- `tests/backend/test_response_parser.py`

## Scope

This page covers parser-module extraction behavior only (`ToolCallSchema`).

For native provider tool-call bridging (`tool_call_bridge.py`), see:

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

Wrapper payloads such as top-level `metadata` + `action`, `computer_use`, or
`system_use` envelopes are rejected by this parser path.

## Removed Unified Wrapper Normalization

`ToolCallSchema.extract_tool_call(...)` does not map unified wrapper names into
concrete tools:

- `computer_use` is not normalized to `mouse_control`, `keyboard_control`,
  `screenshot`, `scroll_control`, `switch_window`, or `wait`
- `system_use` is not normalized to `run_shell_command`, `replace`,
  `read_file`, `get_system_stats`, or `get_open_windows`
- nested `arguments` objects are not unwrapped
- `args.explanation` is not promoted into concrete tool arguments

If a model emits a parser-path tool call, it must use the concrete tool name and
the exact executable args shape directly inside `functionCall.args`.

## Standard Extraction Contract

For non-wrapper tool names:

1. trim tool name
2. deep-copy args dictionary
3. return `(tool_name, copied_args, None)`

Metadata boundary:

- `args.metadata` is preserved inside returned args when present.
- this helper does not promote metadata into `ParsedToolCall.metadata`.
- metadata validation happens in parser validation and downstream tool schema layers.

## Immutability and Deep-Copy Guarantees

`ToolCallSchema` intentionally deep-copies extracted payload objects so parser outputs can be mutated downstream without mutating original parsed JSON structures.

Locked by tests:

- standard format args deep-copy immutability
- direct metadata preservation does not mutate source payload metadata objects

## Failure Semantics

`extract_tool_call(...)` returns `None` for malformed payloads, including:

- non-dict root/functionCall/args
- missing/blank tool names
- invalid schema root shape

No exceptions are raised by this helper for normal invalid input rejection paths.

## Drift Hotspots

1. Mutating source payloads in-place breaks caller expectations and test contracts around parser immutability.
2. Reintroducing wrapper normalization here would duplicate direct tool-schema ownership and provider-native bridge behavior.
3. Promoting metadata from `args.metadata` in this helper would change executable args and drift from the current direct-schema contract.

## Related Pages

- [Backend LLM Docs Hub](README.md)
- [Parser Trust Boundary and Native Tool-Call Reference](parser_trust_boundary_and_native_tool_call_reference.md)
- [System Tool Direct Schema and Remote Catalog Contract Reference](../tools/contracts/system_tool_direct_schema_and_remote_catalog_contract_reference.md)
- [Computer Tool Schema Guidance Reference](../tools/contracts/computer_tool_schema_guidance_reference.md)
