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
- `backend/src/agent/llm/llm_stream_processor.py`
- `backend/src/llm/client.py`
- `backend/src/llm/parser.py`
- `backend/src/llm/parser_extraction.py`
- `backend/src/llm/parser_validation.py`
- `backend/src/llm/parser_types.py`
- `backend/src/core/config/models.py`
- `backend/src/core/infrastructure/exceptions.py`
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
2. computer-use wrapper format:
   - `{"metadata":{...},"action":{"functionCall":{"name":"...","args":{...}}}}`

Computer-use format returns both tool args and metadata payload for downstream metadata validation.

## ToolCallValidator Enforcement

`ToolCallValidator.validate_tool_call(...)` enforces:

- tool name type/non-empty/length (`max_tool_name_length`)
- tool whitelist membership from `ToolRegistry` filtered by `ToolPolicy`
- arg object type check
- max parameter count (`max_parameter_count`)
- parameter value size limits for strings and serialized dict/list values (`max_parameter_value_size`)

Method-level policy check:

- `mouse_control.find_coordinates_by` is validated against dev tool-selection allowed methods (`manual|ocr|prediction`) via `ToolPolicy`.

## Metadata Validation Rules

`validate_metadata(...)` applies strict checks for computer-use tools:

- metadata required
- required text fields:
  - `description`
  - `explanation`
  - `expectation`

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
- maps each provider tool call to `ParsedToolCall`
- persists `tool_call_id` under `ParsedToolCall.metadata`
- defaults unknown/malformed names to `unknown_tool`

This preserves the existing downstream tool pipeline while bypassing parser JSON extraction for native SDK tool-call responses.

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
