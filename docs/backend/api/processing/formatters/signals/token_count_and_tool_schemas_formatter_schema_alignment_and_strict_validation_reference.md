---
summary: "Deep reference for token-count and tool-schemas formatter contracts: payload field pass-through, outgoing-schema alignment, and strict canonical-list validation behavior."
read_when:
  - When changing token usage telemetry payload fields or cache-status semantics.
  - When changing tool-schemas formatter validation behavior or canonical tool schema envelope structure.
title: "Token Count and Tool Schemas Formatter Schema-Alignment and Strict-Validation Reference"
---

# Token Count and Tool Schemas Formatter Schema-Alignment and Strict-Validation Reference

## Canonical Modules

- `backend/src/api/processing/formatters/token_count.py`
- `backend/src/api/processing/formatters/tool_schemas.py`
- `backend/src/api/schemas/outgoing.py`
- `backend/src/api/contracts/formatter_specs.py`
- `tests/backend/test_outgoing_schema_contract.py`

## Registration Mapping Contract

`formatter_specs` maps:

- `TokenCountEvent` / `token_count` -> `TokenCountEventFormatter` -> outgoing `token-count`
- `ToolSchemasEvent` / `tool_schemas` -> `ToolSchemasEventFormatter` -> outgoing `tool-schemas`

These signals carry contract-sensitive payloads consumed by typed frontend schema guards.

## Token Count Payload Contract

`TokenCountEventFormatter` forwards payload fields directly from event dict:

- `prompt_tokens`
- `visible_output_tokens`
- `thinking_tokens`
- `output_tokens_total`
- `total_tokens`
- `conversation_tokens`
- `usage_source`
- `cached_tokens`
- `cache_hit`
- `cache_status`

No local required-field validation is applied in formatter.

Contract assumption:

- upstream event construction should provide values matching `TokenCountPayload` schema constraints.

## Tool Schemas Strict Validation Contract

`ToolSchemasEventFormatter` enforces strict type check:

- `tool_schemas` must be `list`
- non-list payload raises `ValueError("tool_schemas event payload must be a canonical tool object list")`

On success, formatter emits:

- `type: "tool-schemas"`
- `payload.tool_schemas = tool_schemas`

This is strict-fail behavior (exception), not skip behavior.

## Outgoing Schema Alignment

`tests/backend/test_outgoing_schema_contract.py` model-validates:

- token-count formatter output against `TokenCountMessage`
- tool-schemas formatter output against `ToolSchemasMessage`
- explicit reject path for non-list tool schemas

Implication:

- these formatter outputs are locked to `outgoing.py` schema field names and optionality.

## Drift Hotspots

1. Changing token-count field names or optionality in formatter without schema/test updates causes contract breakage.
2. Relaxing tool-schemas strict list validation can allow non-canonical payloads through and fail downstream rendering.
3. Changing error string for non-list schemas can break assertion-based diagnostics in tests.

## Related Pages

- [Backend API Formatter Signal Docs Hub](README.md)
- [Chunk and Thinking Formatter Required-Content and Skip Contract Reference](chunk_and_thinking_formatter_required_content_and_skip_contract_reference.md)
- [Formatter Validation and Contract-Test Matrix Reference](../formatter_validation_and_contract_test_matrix_reference.md)
