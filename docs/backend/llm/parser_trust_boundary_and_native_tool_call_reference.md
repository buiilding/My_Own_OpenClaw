---
summary: "Backend LLM tool-call ingestion reference: live native-tool-call path, parser trust-boundary modules, extraction/validation limits, observability metrics, and failure semantics."
read_when:
  - When changing LLM tool-call ingestion behavior, parser limits, or tool-call validation policy.
  - When debugging malformed tool-call payloads, parser size/timeout violations, or tool whitelist rejections.
title: "Parser Trust Boundary and Native Tool-Call Reference"
---

# Parser Trust Boundary and Native Tool-Call Reference

## Canonical Modules

- `backend/src/agent/execution/interaction_loop.py`
- `backend/src/agent/execution/tool_call_bridge.py`
- `backend/src/agent/llm/llm_stream_processor.py`
- `backend/src/llm/client.py`
- `backend/src/llm/parser.py`
- `backend/src/llm/parser_extraction.py`
- `backend/src/llm/parser_validation.py`
- `backend/src/llm/parser_types.py`
- `backend/src/core/config/models.py`
- `backend/src/core/infrastructure/exceptions.py`
- `backend/src/core/infrastructure/error_types/trust_boundary.py`
- `backend/src/core/observability/trust_boundary_metrics.py`

## Current Runtime Path vs Parser Module Path

## Live runtime path (current default)

Current interaction loop behavior:

1. `LLMStreamProcessor` captures normalized provider payload (`content`, optional `tool_calls`).
2. `InteractionLoop._to_parsed_response(...)` converts normalized `tool_calls` directly into `ParsedToolCall`.
3. Tool execution pipeline consumes those parsed calls.

Key nuance:

- Live runtime currently does not call `ResponseParser.parse_response(...)` for tool turns.
- Tool-call structure validation in this path is enforced by `LiteLLMClient._normalize_response_payload(...)` (non-empty `id`/`name`, dict `arguments`).
- Provider-native built-ins such as OpenAI Responses `computer_call` are first normalized into canonical `tool_calls[]` rows upstream, then pass through the same interaction-loop bridge as any other normalized tool turn.

## Parser module path (trust-boundary library)

`backend/src/llm/parser*.py` still provides strict trust-boundary parsing and validation modules:

- actively covered by backend tests (`tests/backend/test_response_parser*.py`)
- available for parser-based ingestion paths and regression protection

## ResponseParser Trust-Boundary Guards

`ResponseParser.parse_response(...)` enforces:

- input type checks (`str` required; `None` rejected)
- max response size (`security_limits.max_response_size`)
- parse timeout via `asyncio.wait_for(...)` around threadpool parse
- structured metrics on size/timeout/validation violations

Fast reject optimization before threadpool parse:

- response must contain `{`
- response must contain schema root key (default `functionCall`)

If either is missing, parser returns conversational text response without executing extraction strategies.

## Parsing Strategies and Selection

Strategy order:

1. `parse_json_response` (pure object-wrapped JSON)
2. `parse_embedded_json` (iterative decoder scan over mixed text)

`_select_parsing_strategies(...)` skips pure JSON strategy when response is not trimmed object-wrapped text.

### `parse_json_response`

- attempts full JSON decode
- enforces JSON size limit (`max_json_size`)
- validates nesting depth (`max_json_nesting_depth`)
- extracts single tool call via schema

### `parse_embedded_json`

- uses iterative `json.JSONDecoder.raw_decode(...)` scanning from each `{`
- skips oversized candidate JSON objects
- supports multiple tool-call objects embedded in free text
- removes extracted spans and normalizes remaining text whitespace

## ToolCallSchema Formats

`ToolCallSchema.extract_tool_call(...)` supports:

1. standard format:
   - `{"functionCall":{"name":"...","args":{...}}}`
2. unified computer-use envelope:
   - `{"functionCall":{"name":"computer_use","args":{"tool":"mouse_control","arguments":{...},"metadata":{...}}}}`
3. unified system/filesystem envelope:
   - `{"functionCall":{"name":"system_use","args":{"tool":"run_shell_command","explanation":"...","arguments":{...}}}}`

Unified computer-use normalization behavior:

- maps unified `tool` to concrete computer subtool name (`mouse_control`, `keyboard_control`, etc.)
- forwards unified `metadata` for downstream metadata validation
- defaults missing unified `arguments` to `{}`
- rejects unknown unified subtools and non-dict `arguments`

Unified system-use normalization behavior:

- maps unified `tool` to concrete action (`run_shell_command|replace|read_file|get_system_stats|get_open_windows`)
- defaults missing unified `arguments` to `{}`
- strips nested `arguments.explanation`
- trims top-level unified `explanation`; whitespace-only values are treated as missing
- injects top-level explanation into concrete tool parameters when present
- rejects unknown unified subtools and non-dict `arguments`

Legacy metadata/action wrapper payloads are rejected by current parser schema extraction.

## ToolCallValidator Enforcement

`ToolCallValidator.validate_tool_call(...)` enforces:

- tool name type/non-empty/length (`max_tool_name_length`)
- tool whitelist membership from `ToolRegistry` filtered by `ToolPolicy`
- arg object type check
- max parameter count (`max_parameter_count`)
- parameter value size limits for strings and serialized dict/list values (`max_parameter_value_size`)

Whitelist compatibility behavior:

- when unified `computer_use` is present in filtered registry tool names, validator expands allowed names to include legacy concrete computer subtool names
- this preserves backward-compatible concrete-name ingestion while keeping unified declaration surface available for tool schema exposure
- when unified `system_use` is present in filtered registry tool names, validator expands allowed names to include legacy concrete system/filesystem action names
- this preserves compatibility for direct concrete names while keeping the model-facing declaration surface unified

Method-level policy check:

- `mouse_control.find_coordinates_by` is validated against dev tool-selection allowed methods (`manual|ocr|prediction`) via `ToolPolicy`.

## Metadata Validation Rules

`validate_metadata(...)` applies strict checks for computer-use tools:

- metadata required
- required text fields:
  - `description`
  - `explanation`
  - `expectation`
- each required field must be non-whitespace text (`value.strip()` non-empty)

Missing/invalid metadata raises `ParseValidationError`.

## Parser Limits (SecurityLimits Defaults)

From `SecurityLimits`:

- `max_response_size`: `10MB`
- `max_json_size`: `1MB`
- `max_json_nesting_depth`: `100`
- `max_tool_name_length`: `256`
- `max_parameter_count`: `100`
- `max_parameter_value_size`: `64KB`
- `max_tool_calls_per_response`: `50`
- `parse_timeout_seconds`: `5.0`

When extracted tool call count exceeds limit, parser raises `ParseValidationError`.

## Exception and Error Semantics

Trust-boundary exceptions:

- `InputSizeLimitError` (`INPUT_SIZE_LIMIT_ERROR`)
- `ParseTimeoutError` (`PARSE_TIMEOUT_ERROR`)
- `ParseValidationError` (`PARSE_VALIDATION_ERROR`)

Each includes boundary metadata (`boundary_name="response_parser"` plus optional fields like `actual_size`, `timeout_seconds`, `validation_errors`).

## Observability Surface

`BoundaryViolationMetrics` records:

- size-limit violation counters + rejected size samples
- timeout violation counters + timeout samples
- validation violation counters + detailed violation payloads

`ResponseParser` writes metrics through boundary key `response_parser`.

## Bridging Behavior in InteractionLoop

`InteractionLoop._to_parsed_response(...)` currently:

- reads normalized payload from `LLMStreamProcessor.get_last_response_payload()`
- maps each provider tool call to `ParsedToolCall` via `tool_call_bridge.to_parsed_response(...)`
- normalizes malformed base payloads:
  - blank/missing tool `name` -> `unknown_tool`
  - non-dict `arguments` -> `{}`
- metadata merge behavior:
  - carries provider `id` as `metadata.tool_call_id`
  - carries `thought_signature`/`thoughtSignature` when present
  - if `arguments.metadata` exists, merges it into `ParsedToolCall.metadata` and removes it from execution `parameters`
- provider-native built-in bridge behavior:
  - normalized built-ins may arrive with logical tool names that do not correspond to registry `function` schemas; current native case is `name="computer"`
  - OpenAI Responses `computer_call` is normalized upstream into `arguments={"actions":[...]}` and kept as one logical model-facing tool turn
  - interaction-loop bridging preserves that logical provider call while the downstream execution layer expands it into the existing internal desktop-action bundle path
  - screenshot/image output for native `computer` turns still comes from the existing bundle capture path rather than a separate provider-native image contract
- unified native `computer_use` bridge behavior:
  - maps `arguments.tool` to concrete computer subtool when in allowed set (`mouse_control|keyboard_control|screenshot|scroll_control|switch_window|wait`)
  - invalid/unknown mapped subtool becomes `invalid_computer_use_tool`
  - missing/non-dict unified `arguments` becomes `parameters={}`
  - only top-level unified `metadata` is promoted; nested `arguments.metadata` remains in tool parameters
  - non-dict top-level unified metadata is ignored safely (no merge, no crash)
  - strict metadata allowlist applies during native bridge normalization:
    - required fields: `description`, `explanation`, `expectation`
    - allowed internal passthrough fields: `tool_call_id`, `thought_signature`
    - unexpected metadata keys invalidate the call (`invalid_computer_use_tool`)
  - direct native computer-subtool names (`mouse_control|keyboard_control|screenshot|scroll_control|switch_window|wait`) run through the same metadata gate; missing/invalid metadata resolves to `invalid_computer_use_tool`
- unified native `system_use` bridge behavior:
  - maps `arguments.tool` to concrete tool (`run_shell_command|replace|read_file|get_system_stats|get_open_windows`) when valid
  - strips nested `arguments.explanation`
  - injects top-level `explanation` into concrete parameters when present
  - invalid mapped subtool is kept as `tool_name="system_use"` so downstream wrapper validation emits deterministic errors in native path

History-call shaping via `tool_call_bridge.to_history_tool_calls(...)`:

- preserves extracted `tool_call_id` when present
- defaults missing ids to `tool_call_<index>`
- forwards `thought_signature` into assistant history `tool_calls[]` entries when available

This preserves the existing downstream tool pipeline while bypassing parser JSON extraction for native SDK tool-call responses.

Important nuance:

- not every normalized provider tool call is backed by a model-facing `function` schema entry
- provider-native built-ins can still appear in the normalized `tool_calls[]` payload and must remain bridgeable without being downgraded into synthetic function names

## Debug Checklist

If tool calls are missing in live runs:

1. verify provider returned normalized `tool_calls` in `LiteLLMClient` payload
2. inspect `InteractionLoop._to_parsed_response` mapping for `name/arguments/id`
3. confirm stream processor captured `_last_response_payload` for that turn

If parser tests fail on limits/validation:

1. inspect `SecurityLimits` changes
2. inspect tool whitelist filtering (`ToolPolicy` + `ToolRegistry`)
3. inspect unified-wrapper compatibility expansion in `ToolCallValidator` (computer + system legacy names)
4. inspect parser strategy selection (`_should_try_parse_json_response`)
5. inspect trust-boundary exception metadata and boundary metrics payloads
6. if OpenAI native `computer` turns regress, inspect the upstream Responses normalization path before changing parser extraction code; the parser library is not the primary ingestion path for those turns

## Related Pages

- [Backend LLM Docs Hub](README.md)
- [ToolCallSchema Extraction and Unified Wrapper Normalization Reference](tool_call_schema_extraction_and_unified_wrapper_normalization_reference.md)
- [Native Tool-Call Bridge and History Mapping Reference](../agent/native_tool_call_bridge_and_history_mapping_reference.md)
