---
summary: "Deep reference for formatter validation behaviors tied to backend contract tests: response formatter dispatch guards, outgoing schema validation, and registry drift checks."
read_when:
  - When changing formatter outputs or message schema fields.
  - When triaging failing tests in `test_formatters`, `test_response_formatter`, `test_outgoing_schema_contract`, or `test_api_contract_registry`.
title: "Formatter Validation and Contract-Test Matrix Reference"
---

# Formatter Validation and Contract-Test Matrix Reference

## Canonical Modules

- `backend/src/api/processing/formatter.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/contracts/registry.py`
- `backend/src/api/schemas/outgoing.py`
- `tests/backend/test_formatters.py`
- `tests/backend/test_response_formatter.py`
- `tests/backend/test_outgoing_schema_contract.py`
- `tests/backend/test_api_contract_registry.py`
- `tests/backend/test_tool_bundle_formatter.py`

## ResponseFormatter Dispatch/Registration Tests

`test_response_formatter.py` validates:

- typed events are formatted and context fields are attached
- dict payloads are ignored by the top-level runtime dispatcher
- unknown events return `None`
- formatter `None` results remain `None` (no context attachment)
- duplicate event-type registrations raise `ValueError`
- duplicate event-class registrations raise `ValueError`

Operational implication:

- registration drift or duplicate specs fail fast at formatter construction

## Per-Formatter Behavior Tests

`test_formatters.py` confirms key contracts:

- base formatter required-field guards operate on already-extracted typed-event
  attribute values
- chunk/thinking/assistant-full skip when `content` missing
- error formatter maps:
  - `content -> payload.message`
  - `metadata -> payload.metadata` when metadata is a dict
  - fallback default message when content is unsafe or empty
- tool-call formatter:
  - validates required `tool_name` + dict `parameters`
  - allows empty `parameters` dict
  - optional `request_id` and `metadata` passthrough
- tool-output formatter:
  - requires non-`None` `tool_name/success`
  - allows `output=""` and `success=False`

Additional dedicated matrix:

- `test_tool_bundle_formatter.py` covers typed-event validation and malformed
  `tools` behaviors

## Outgoing Schema Contract Tests

`test_outgoing_schema_contract.py` performs model-validate checks for formatter output:

- `ToolSchemasEventFormatter` output parses as `ToolSchemasMessage`
- `TokenCountEventFormatter` output parses as `TokenCountMessage`

Strict guard test:

- non-list `tool_schemas` must raise `ValueError("canonical tool object list")`

Implication:

- these formatters are test-locked to `schemas/outgoing.py` contracts

## Registry Alignment and Drift Checks

`test_api_contract_registry.py` ensures:

- incoming/outgoing message-type constants are unique
- registry contract tables match schema literal declarations
- formatter spec event classes/types align with live `ResponseFormatter` dispatch maps
- formatter spec outgoing types are subset of outgoing schema contract types
- `validate_registry_alignment()` fails on mismatched incoming/outgoing sets

Implication:

- schema literals, message constants, and formatter specs are guarded as one contract surface

## Change Safety Checklist

When adding/changing formatter payload fields:

1. update formatter implementation
2. update outgoing schema model if payload contract changes
3. update/extend formatter-specific tests
4. verify registry/spec alignment tests still pass

When adding a new event formatter:

1. add event -> formatter entry in `formatter_specs`
2. ensure outgoing type constant is represented in schema-contract tables when required
3. add typed-event tests for the formatter and any schema edge cases

When changing strict/skip behavior:

1. decide `return None` vs `raise ValueError` explicitly
2. adjust tests to reflect new failure mode
3. ensure query pipeline can tolerate raised exceptions if strict path is chosen

## Related Pages

- [Backend API Processing Formatters Docs Hub](README.md)
- [Formatter Message Docs Hub](messages/README.md)
- [Assistant/User/System/Complete Formatter Payload Contract Reference](messages/assistant_user_system_and_complete_formatter_payload_contract_reference.md)
- [Error Formatter Guard and Schema-Mapping Reference](messages/error_formatter_guard_and_schema_mapping_reference.md)
- [Formatter Signal Docs Hub](signals/README.md)
- [Chunk and Thinking Formatter Required-Content and Skip Contract Reference](signals/chunk_and_thinking_formatter_required_content_and_skip_contract_reference.md)
- [Token Count and Tool Schemas Formatter Schema-Alignment and Strict-Validation Reference](signals/token_count_and_tool_schemas_formatter_schema_alignment_and_strict_validation_reference.md)
- [Formatter Action Docs Hub](actions/README.md)
- [Tool Call and Tool Output Formatter Validation and Metadata-Passthrough Reference](actions/tool_call_and_tool_output_formatter_validation_and_metadata_passthrough_reference.md)
- [Tool Bundle Formatter Payload Validation Contract Reference](actions/tool_bundle_formatter_typed_dict_parity_and_default_payload_contract_reference.md)
