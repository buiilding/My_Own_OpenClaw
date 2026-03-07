---
summary: "Deep reference for native tool-call bridging in `tool_call_bridge.py`: ParsedResponse conversion, `computer_use` normalization, whitespace-safe tool-call-id handling, history tool-call shaping, and recoverable-error helper contracts."
read_when:
  - When changing `backend/src/agent/execution/tool_call_bridge.py` conversion behavior or metadata extraction.
  - When debugging mismatches between provider-native `tool_calls` payloads and downstream parsed/history tool-call shapes.
title: "Native Tool-Call Bridge and History Mapping Reference"
---

# Native Tool-Call Bridge and History Mapping Reference

## Canonical Modules

- `backend/src/agent/execution/tool_call_bridge.py`
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/llm/parser_types.py`
- `tests/backend/test_interaction_tool_call_bridge.py`
- `tests/backend/test_interaction_loop.py`

## Bridge Ownership

`tool_call_bridge.py` is the native-tool-call adapter between provider-normalized payloads and the existing parser-shaped pipeline.

Primary bridge functions:

- `to_parsed_response(normalized_response)`
- `to_parsed_tool_call(tool_call)`
- `to_history_tool_calls(parsed_tool_calls)`
- `extract_tool_call_ids(parsed_tool_calls)`

This lets `InteractionLoop` consume provider-native `tool_calls` without running JSON-text parser extraction for normal tool turns.

## ParsedResponse Conversion

`to_parsed_response(...)`:

- reads `normalized_response["content"]` as both `original_response` and `text_content`
- reads `normalized_response["tool_calls"]` as source tool-call list (falls back to empty list)
- converts each call via `to_parsed_tool_call(...)`
- sets `has_tool_calls = len(parsed_tool_calls) > 0`

## Single Tool-Call Normalization

`to_parsed_tool_call(...)` fail-closes malformed payload fields:

- missing/blank `name` -> `unknown_tool`
- non-dict `arguments` -> `{}`

Metadata extraction:

- carries `tool_call.id` into `metadata.tool_call_id` when present
- normalizes `tool_call.id` with whitespace trim; blank/whitespace-only ids are dropped
- extracts thought signature from either:
  - `thought_signature`
  - `thoughtSignature`
- if `arguments.metadata` is a dict:
  - merges it into parsed metadata
  - removes `metadata` key from executable `parameters`
- if `arguments.metadata` is missing or not a dict:
  - metadata merge is skipped safely (no parse failure)

Deep-copy boundary:

- tool-call `arguments` are deep-copied before normalization/mutation
- metadata extraction and `computer_use` reshaping never mutate provider payload dictionaries in place

## Unified `computer_use` Mapping

When normalized name is `computer_use`:

- reads mapped subtool from `parameters.tool`
- allowed mapped names:
  - `mouse_control`
  - `keyboard_control`
  - `screenshot`
  - `scroll_control`
  - `switch_tab`
  - `wait`
- valid mapped name -> replace parsed `tool_name` with subtool
- invalid/missing mapped name -> `tool_name = "invalid_computer_use_tool"`
- executable parameters become `parameters.arguments` if dict, else `{}`

Metadata-promotion boundary for unified envelopes:

- only top-level unified `computer_use.metadata` is promoted to parsed metadata
- nested `computer_use.arguments.metadata` is preserved in executable parameters (not promoted)
- non-dict top-level unified metadata is ignored safely
- computer required metadata fields (`description`, `explanation`, `expectation`) are normalized with trim semantics
- if any required computer metadata field is missing/blank/non-string after normalization, bridge marks call as `invalid_computer_use_tool`

## Unified `system_use` Mapping

When normalized name is `system_use`:

- reads mapped subtool from `parameters.tool`
- supported mapped names:
  - `run_shell_command`
  - `replace`
  - `read_file`
  - `get_system_stats`
  - `get_open_windows`
- valid mapped name -> replace parsed `tool_name` with normalized concrete name
- executable parameters become `parameters.arguments` if dict, else `{}`
- invalid mapped names are left as `system_use` so downstream wrapper validation can return a deterministic tool error message

## History Tool-Call Shaping

`to_history_tool_calls(parsed_tool_calls)` returns assistant-history `tool_calls` rows:

- `id`:
  - uses `metadata.tool_call_id` when present
  - trims metadata id and treats blank/whitespace-only ids as missing
  - otherwise fallback `tool_call_<index>`
- `name`: parsed `tool_name`
- `arguments`: parsed `parameters` copy
- `thought_signature`: included when metadata contains non-empty signature

`extract_tool_call_ids(...)` returns only metadata-backed ids, preserving emission order.
Ids are trim-normalized and whitespace-only values are ignored.

Deep-copy boundary:

- history `tool_calls[].arguments` payloads are deep-copied from parsed call parameters
- mutating generated history payloads does not back-propagate into `ParsedToolCall.parameters`

## Recoverable Error Helper Surface

`tool_call_bridge.py` also hosts helper functions used by interaction-loop recoverable tool-call error handling:

- `is_recoverable_llm_tool_call_error(...)`
- `extract_tool_name_from_error(...)`
- `extract_tool_call_id_from_error(...)`
- `extract_raw_arguments_preview_from_error(...)`
- `extract_tool_call_parse_error_from_error(...)`
- `build_recoverable_tool_output_message(...)`

These helpers provide deterministic classification + synthetic message formatting for malformed streamed tool-call arguments.

## Regex/Classification Contracts

Recoverable marker matching requires:

- tool context present in message
- argument/tool-call format context present
- one configured marker match (for example invalid tool-call arguments / failed parse variants)

Extraction helpers:

- id/name regexes accept both `id=`/`tool_call_id=` and `name=`/`tool_name=` forms
- raw arguments preview parses suffix after literal marker `Raw arguments preview:`
- target file extraction supports:
  - JSON `file_path`
  - escaped JSON `file_path`
  - shell redirect `cat > <path>`

## Test-Backed Notes

`tests/backend/test_interaction_tool_call_bridge.py` covers:

- missing tool name fallback
- native payload argument deep-copy immutability
- history argument deep-copy immutability
- invalid computer-use tool mapping behavior
- missing unified `arguments` -> empty parameters
- top-level metadata promotion boundary (nested `arguments.metadata` remains in parameters; non-dict top-level metadata ignored)
- whitespace-only tool-call id handling in both `extract_tool_call_ids(...)` and history id fallback
- recoverable error marker detection and parse-summary extraction
- target-file extraction from raw-arguments preview
- retry message includes file-target/edit-strategy hints when file path can be extracted

`tests/backend/test_interaction_loop.py` covers protocol integration:

- recoverable errors emit synthetic `ToolCallEvent` + `ToolOutputEvent`
- recovery path keeps loop alive for next turn
- synthetic metadata includes skip-frontend-execution marker

## Drift Hotspots

1. Changing `computer_use` subtool allowlist in bridge without updating parser/remote-tool docs can desync parse and execution behavior.
2. Removing `arguments.metadata` stripping can leak metadata fields into executable tool parameter payloads.
3. Changing history id fallback format can break downstream assumptions in tool-output correlation/debug tooling.
4. Modifying recoverable marker heuristics can convert retryable malformed-tool-call events into hard loop aborts.
5. Changing `system_use` mapped subtool names without schema/sidecar updates can desync wrapper routing.

## Related Docs

- [Interaction Loop and Tool-Turn Orchestration Reference](interaction_loop_and_tool_turn_orchestration_reference.md)
- [Tool-Call Error Recovery and Synthetic Tool-Output Replay Reference](recovery/tool_call_error_recovery_and_synthetic_tool_output_replay_reference.md)
- [Parser Trust Boundary and Native Tool-Call Reference](../llm/parser_trust_boundary_and_native_tool_call_reference.md)
