---
summary: "Backend API formatter signal docs sub-hub for chunk/thinking required-content skip behavior and token-count/tool-schemas schema-alignment contracts."
read_when:
  - When changing stream-signal formatters (`chunk`, `thinking`, `token_count`, `tool_schemas`).
  - When debugging missing `streaming-response`/`llm-thought` events or strict tool-schemas payload validation failures.
title: "Backend API Formatter Signal Docs Hub"
---

# Backend API Formatter Signal Docs Hub

## Deep Pages

- [Chunk and Thinking Formatter Required-Content and Skip Contract Reference](chunk_and_thinking_formatter_required_content_and_skip_contract_reference.md)
- [Token Count and Tool Schemas Formatter Schema-Alignment and Strict-Validation Reference](token_count_and_tool_schemas_formatter_schema_alignment_and_strict_validation_reference.md)

## Related Pages

- [Backend API Processing Formatters Docs Hub](../README.md)
- [Formatter Validation and Contract-Test Matrix Reference](../formatter_validation_and_contract_test_matrix_reference.md)
- [Formatter Message Docs Hub](../messages/README.md)
- [Response Formatter Registry Lifecycle, Lazy Specs, and Context Attachment Reference](../registry/response_formatter_registry_lifecycle_lazy_specs_and_context_attachment_reference.md)

## Code Scope

- `backend/src/api/processing/formatters/chunk.py`
- `backend/src/api/processing/formatters/thinking.py`
- `backend/src/api/processing/formatters/token_count.py`
- `backend/src/api/processing/formatters/tool_schemas.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/schemas/outgoing.py`
- `tests/backend/test_formatters.py`
- `tests/backend/test_outgoing_schema_contract.py`
