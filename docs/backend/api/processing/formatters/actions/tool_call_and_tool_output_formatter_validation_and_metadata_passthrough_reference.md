---
summary: "Deep reference for tool-call/tool-output formatter contracts: required-field validation, skip semantics, request-id/metadata passthrough, and typed/dict payload normalization boundaries."
read_when:
  - When changing `ToolCallEventFormatter` or `ToolOutputEventFormatter` required-field checks.
  - When debugging missing tool action events, dropped request-id correlation, or metadata passthrough regressions.
title: "Tool Call and Tool Output Formatter Validation and Metadata-Passthrough Reference"
---

# Tool Call and Tool Output Formatter Validation and Metadata-Passthrough Reference

## Canonical Modules

- `backend/src/api/processing/formatters/tool_call.py`
- `backend/src/api/processing/formatters/tool_output.py`
- `backend/src/api/processing/formatters/base.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/schemas/outgoing.py`
- `tests/backend/test_formatters.py`

## Registration Mapping Contract

`formatter_specs` maps:

- `ToolCallEvent` / `tool_call` -> `ToolCallEventFormatter` -> `tool-call`
- `ToolOutputEvent` / `tool_output` -> `ToolOutputEventFormatter` -> `tool-output`

## Tool Call Validation Contract

`ToolCallEventFormatter` required conditions:

- `tool_name` must be truthy
- `parameters` must be present and `dict`

Failure behavior:

- missing/invalid fields logged through `_log_missing_fields(...)`
- formatter returns `None` (skip event)

Accepted edge case:

- empty parameters object `{}` is valid and preserved

Optional passthrough fields:

- `request_id` included when truthy
- `metadata` included when truthy

## Tool Output Validation Contract

`ToolOutputEventFormatter` required fields:

- `tool_name` is not `None`
- `success` is not `None`
- `output` is not `None`

Failure behavior:

- logs missing field list via `_log_missing_fields(...)`
- returns `None` (skip event)

Accepted edge cases:

- `success=False` allowed
- empty output string `""` allowed

Payload mapping always includes:

- `tool_name`
- `success`
- `execution_time`
- `output`
- `error`
- `screenshot`
- `metadata`

## Typed vs Dict Input Semantics

Both formatters accept typed and dict events through `_get_event_dict(...)`.

Contract outcome:

- typed streaming dataclasses and legacy dict events share one validation path
- skip semantics apply consistently regardless of event input type

## Schema Alignment Notes

`outgoing.py` models:

- `ToolCallPayload` uses `extra="allow"` (supports optional request_id/metadata)
- `ToolOutputPayload` uses `extra="allow"` and optional metadata/error/screenshot fields

Formatter behavior must remain aligned with these permissive payload envelopes.

## Test-Backed Matrix

`tests/backend/test_formatters.py` verifies:

- tool-call success + request-id + metadata passthrough
- tool-call skips for missing/empty `tool_name`, missing/non-dict parameters
- tool-output success for dict + typed events
- tool-output allows `success=False` and `output=""`
- tool-output skip + warning logging for missing required fields

## Drift Hotspots

1. Tightening request_id/metadata truthy checks to non-empty-string semantics changes correlation visibility for remote tool flows.
2. Treating empty output strings as missing will drop valid failure tool outputs.
3. Converting skip behavior to raised exceptions can abort stream pipeline on malformed tool payloads.

## Related Pages

- [Backend API Formatter Action Docs Hub](README.md)
- [Tool Bundle Formatter Typed/Dict Parity and Default-Payload Contract Reference](tool_bundle_formatter_typed_dict_parity_and_default_payload_contract_reference.md)
- [Result Transformer and Tool Result Formatting Contract Reference](../../../../../tools/processing/result_transformer_and_tool_result_formatting_contract_reference.md)
