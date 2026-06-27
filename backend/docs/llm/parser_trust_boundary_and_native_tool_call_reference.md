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
- `backend/src/core/infrastructure/error_types/trust_boundary.py`
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
- Duplicate provider tool-call IDs are rejected before bridge conversion, because
  later tool-output rows use `tool_call_id` as their unambiguous join key.
- Provider-native built-ins are first normalized into canonical `tool_calls[]` rows upstream before they pass through the same interaction-loop bridge as any other normalized tool turn. Desktop execution now stays on the shared direct-function tool path.

## Parser module path (trust-boundary library)

`backend/src/llm/parser*.py` still provides strict trust-boundary parsing and validation modules:

- actively covered by backend tests (`tests/backend/test_response_parser*.py`)
- available for parser-based ingestion paths and regression protection

Import boundary:

- `ResponseParser` lives in `backend.src.llm.parser`
- `ParsedResponse`, `ParsedToolCall`, and `ToolCallSchema` live in
  `backend.src.llm.parser_types`; `parser.py` should not be used as a type
  re-export surface

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
- rejects oversized tool-call-shaped candidate JSON objects with `InputSizeLimitError`
- validates each decoded candidate against `max_json_nesting_depth` before schema extraction
- supports multiple tool-call objects embedded in free text
- removes extracted spans and normalizes remaining text whitespace

## ToolCallSchema Formats

`ToolCallSchema.extract_tool_call(...)` supports one live format:

1. standard format:
   - `{"functionCall":{"name":"...","args":{...}}}`

Current behavior:

- trims surrounding whitespace from `functionCall.name`
- requires `args` to be an object when present
- defaults missing `args` to `{}`
- returns deep-copied arguments so later mutation cannot affect the parsed source payload

Legacy metadata/action wrapper payloads are rejected by current parser schema extraction.

## ToolCallValidator Enforcement

`ToolCallValidator.validate_tool_call(...)` enforces:

- tool name type/non-empty/length (`max_tool_name_length`)
- tool whitelist membership from `ToolRegistry` filtered by `ToolPolicy`
- arg object type check
- max parameter count (`max_parameter_count`)
- parameter value size limits for strings and serialized dict/list values (`max_parameter_value_size`)

Whitelist behavior:

- validator checks direct tool names against the filtered `ToolRegistry` + `ToolPolicy` surface
- compatibility aliases are not part of the live model-facing tool catalog described by this page

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
- provider-native built-in bridge behavior:
  - normalized built-ins may arrive with logical tool names that do not correspond to registry `function` schemas
  - interaction-loop bridging preserves that logical provider call for the provider-native tools that remain enabled
  - desktop screenshot/image output continues to come from the existing shared bundle capture path rather than a separate provider-native image contract
- model-facing preservation behavior:
  - if the provider supplied a non-blank tool name, the bridge stores the exact normalized provider payload in `metadata.model_facing_tool_call`
  - downstream history/transparency rendering can therefore show the original model-facing name and arguments even when execution later rewrites or expands them

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
3. inspect parser strategy selection (`_should_try_parse_json_response`)
4. inspect trust-boundary exception metadata and boundary metrics payloads
5. if OpenAI Responses-native tool turns regress, inspect the upstream Responses normalization path before changing parser extraction code; the parser library is not the primary ingestion path for those turns

## Related Pages

- [Backend LLM Docs Hub](README.md)
- [ToolCallSchema Extraction Reference](tool_call_schema_extraction_reference.md)
- [Native Tool-Call Bridge and History Mapping Reference](../agent/native_tool_call_bridge_and_history_mapping_reference.md)
