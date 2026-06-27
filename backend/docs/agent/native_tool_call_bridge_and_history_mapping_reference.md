---
summary: "Deep reference for native tool-call bridging in `tool_call_bridge.py`: ParsedResponse conversion, provider-payload preservation, whitespace-safe tool-call-id handling, history tool-call shaping, structured recoverable-error helper contracts, and removed raw-preview builder relay behavior."
read_when:
  - When changing `backend/src/agent/execution/tool_call_bridge.py` conversion behavior or metadata extraction.
  - When debugging mismatches between provider-native `tool_calls` payloads and downstream parsed/history tool-call shapes.
  - When stale imports reference `tool_call_bridge.extract_*_from_error`; recovery diagnostics now come from structured LLM error metadata in `interaction_loop.py`.
  - When stale imports reference `tool_call_bridge.build_raw_tool_call_preview`; raw preview construction belongs to `backend/src/core/utils/raw_tool_call_preview.py`.
title: "Native Tool-Call Bridge and History Mapping Reference"
---

# Native Tool-Call Bridge and History Mapping Reference

## Canonical Modules

- `backend/src/agent/execution/tool_call_bridge.py`
- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/core/utils/raw_tool_call_preview.py`
- `backend/src/llm/parser_types.py`
- `tests/backend/test_interaction_tool_call_bridge.py`
- `tests/backend/test_interaction_loop.py`

## Bridge Ownership

`tool_call_bridge.py` is the native-tool-call adapter between provider-normalized payloads and the existing parser-shaped pipeline.

Primary bridge functions:

- `to_parsed_response(normalized_response)`
- `to_parsed_tool_call(tool_call)`
- `to_history_tool_calls(parsed_tool_calls)`
- `extract_history_tool_call_ids(history_tool_calls)`

This lets `InteractionLoop` consume provider-native `tool_calls` without running JSON-text parser extraction for normal tool turns.

## ParsedResponse Conversion

`to_parsed_response(...)`:

- reads `normalized_response["content"]` as both `original_response` and `text_content`
- reads `normalized_response["tool_calls"]` as source tool-call list (falls back to empty list)
- converts each call via `to_parsed_tool_call(...)`
- sets `has_tool_calls = len(parsed_tool_calls) > 0`

Provider-normalized built-in note:

- provider-normalized tool calls no longer have to be function tools only
- the bridge treats provider-normalized built-ins like any other canonical native tool call: it preserves the model-facing payload in metadata and passes the logical tool name downstream unchanged
- OpenAI desktop execution uses the shared direct-function tool path

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
- preserves the original provider-emitted payload as `metadata.model_facing_tool_call` when the tool name is non-blank

Deep-copy boundary:

- tool-call `arguments` are deep-copied before normalization
- metadata extraction never mutates provider payload dictionaries in place
- every native tool call retains the original provider-normalized envelope in `metadata.model_facing_tool_call` so history/transparency can show the exact model-emitted payload

No wrapper normalization happens in this bridge:

- direct tool names remain unchanged
- direct argument objects remain executable parameters
- any later execution-time rewriting happens downstream in preparation/execution layers, not in `tool_call_bridge.py`

## History Tool-Call Shaping

`to_history_tool_calls(parsed_tool_calls)` returns assistant-history `tool_calls` rows:

- `id`:
  - uses `metadata.tool_call_id` when present
  - trims metadata id and treats blank/whitespace-only ids as missing
  - otherwise fallback `tool_call_<index>`
- if `metadata.model_facing_tool_call` exists, history prefers that preserved raw payload for `id`/`name`/`arguments`
- otherwise `name`: parsed `tool_name`
- otherwise `arguments`: parsed `parameters` copy
- `thought_signature`: included when metadata contains non-empty signature

`extract_history_tool_call_ids(...)` collects ids from an already-rendered
assistant-history `tool_calls` payload. The interaction loop uses this helper
after rendering history calls once, so the staged ids exactly match the ids
persisted on the assistant row.

Deep-copy boundary:

- history `tool_calls[].arguments` payloads are deep-copied from parsed call parameters
- mutating generated history payloads does not back-propagate into `ParsedToolCall.parameters`

## Recoverable Error Helper Surface

`tool_call_bridge.py` also hosts helper functions used by interaction-loop recoverable tool-call error handling:

- `is_recoverable_llm_tool_call_error(...)`
- `build_recoverable_tool_output_message(...)`

These helpers provide deterministic marker classification and synthetic message
formatting for malformed streamed tool-call arguments. Tool name, id, raw
preview, and parse-summary diagnostics come from structured LLM error metadata
read by `interaction_loop.py`; the bridge no longer reverse-parses those values
from provider error text.

Raw preview construction is not owned by `tool_call_bridge.py`. Consumers import
`build_raw_tool_call_preview(...)` directly from
`backend/src/core/utils/raw_tool_call_preview.py`; the former bridge-level relay
is removed so raw-preview serialization has a single utility owner.

## Regex/Classification Contracts

Recoverable marker matching requires:

- tool context present in message
- argument/tool-call format context present
- one configured marker match (for example invalid tool-call arguments / failed parse variants)

Recovery helper behavior:

- malformed tool-call classification still requires tool context, format context, and one configured recoverable marker
- target file extraction supports:
  - JSON `file_path`
  - escaped JSON `file_path`
  - shell redirect `cat > <path>`

## Test-Backed Notes

`tests/backend/test_interaction_tool_call_bridge.py` covers:

- missing tool name fallback
- native payload argument deep-copy immutability
- history argument deep-copy immutability
- direct native tool-call preservation behavior
- thought-signature preservation across parsed/history shapes
- whitespace-only tool-call id handling in history id fallback and rendered history id extraction
- recoverable error marker detection
- target-file extraction from raw-arguments preview
- retry message includes file-target/edit-strategy hints when file path can be extracted

`tests/backend/test_interaction_loop.py` covers protocol integration:

- recoverable errors emit synthetic `ToolCallEvent` + `ToolOutputEvent`
- recovery path keeps loop alive for next turn
- synthetic metadata includes skip-local-execution marker

## Drift Hotspots

1. Changing metadata preservation or id-normalization behavior in the bridge without updating history/transparency docs can desync what the user sees from what execution received.
2. Removing `arguments.metadata` stripping can leak metadata fields into executable tool parameter payloads.
3. Changing history id fallback format can break downstream assumptions in tool-output correlation/debug tooling.
4. Modifying recoverable marker heuristics can convert retryable malformed-tool-call events into hard loop aborts.
5. Re-introducing nested `arguments.explanation` fallback in the bridge without matching parser/sidecar behavior can desync wrapper routing.
6. Forgetting that canonical native tool calls can include provider-built-in logical names can lead to downstream code that incorrectly assumes every normalized tool call originated from a function tool schema.

## Related Docs

- [Interaction Loop and Tool-Turn Orchestration Reference](interaction_loop_and_tool_turn_orchestration_reference.md)
- [Tool-Call Error Recovery and Synthetic Tool-Output Replay Reference](recovery/tool_call_error_recovery_and_synthetic_tool_output_replay_reference.md)
- [Parser Trust Boundary and Native Tool-Call Reference](../llm/parser_trust_boundary_and_native_tool_call_reference.md)
