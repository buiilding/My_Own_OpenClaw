---
summary: "Deep reference for tool-call/tool-output formatter contracts: typed event attribute extraction, required-field validation, skip semantics, and request-id/metadata passthrough."
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
- `output` key is present; explicit `null` is a valid tool result payload

Failure behavior:

- logs missing field list via `_log_missing_fields(...)`
- returns `None` (skip event)

Accepted edge cases:

- `success=False` allowed
- empty output string `""` allowed
- explicit JSON null / Python `None` output allowed when the `output` field is present

Payload mapping always includes:

- `tool_name`
- `success`
- `execution_time`
- `output`
- `error`
- `screenshot`
- `metadata`

## Formatter Input Semantics

Production response formatting reaches these formatters through typed event dispatch.
`ToolCallEventFormatter` and `ToolOutputEventFormatter` read typed event
attributes directly; they do not normalize dict payloads inside the formatter.

Contract outcome:

- skip semantics apply consistently for required-field failures

## Schema Alignment Notes

`outgoing.py` models:

- `ToolCallPayload` uses `extra="allow"` (supports optional request_id/metadata)
- `ToolOutputPayload` uses `extra="allow"` and optional metadata/error/screenshot fields

Formatter behavior must remain aligned with these permissive payload envelopes.

## Test-Backed Matrix

`tests/backend/test_formatters.py` verifies:

- tool-call success + request-id + metadata passthrough
- tool-call skips for missing/empty `tool_name`, missing/non-dict parameters
- tool-output success for typed events
- tool-output allows `success=False` and `output=""`
- tool-output skip + warning logging for missing required fields

## Drift Hotspots

1. Tightening request_id/metadata truthy checks to non-empty-string semantics changes correlation visibility for remote tool flows.
2. Treating empty output strings as missing will drop valid failure tool outputs.
3. Converting skip behavior to raised exceptions can abort stream pipeline on malformed tool payloads.

## Related Pages

- [Backend API Formatter Action Docs Hub](README.md)
- [Tool Bundle Formatter Payload Validation Contract Reference](tool_bundle_formatter_typed_dict_parity_and_default_payload_contract_reference.md)
- [Result Transformer and Tool Result Formatting Contract Reference](../../../../tools/processing/result_transformer_and_tool_result_formatting_contract_reference.md)
