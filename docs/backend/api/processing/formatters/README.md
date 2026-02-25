---
summary: "Backend API processing formatters docs sub-hub for base formatter guard utilities, per-formatter validation semantics, and test-backed schema/registry alignment contracts."
read_when:
  - When changing files under `backend/src/api/processing/formatters/*`.
  - When debugging why events are skipped, transformed, or fail schema validation on outbound websocket payloads.
title: "Backend API Processing Formatters Docs Hub"
---

# Backend API Processing Formatters Docs Hub

## Deep Pages

- [Base Formatter Guard Utilities and Skip Semantics Reference](base_formatter_guard_utilities_and_skip_semantics_reference.md)
- [Formatter Validation and Contract-Test Matrix Reference](formatter_validation_and_contract_test_matrix_reference.md)
- [Formatter Message Docs Hub](messages/README.md)
- [Assistant/User/System/Complete Formatter Payload Contract Reference](messages/assistant_user_system_and_complete_formatter_payload_contract_reference.md)
- [Error and Memory-Store Formatter Guard and Schema-Mapping Reference](messages/error_and_memory_store_formatter_guard_and_schema_mapping_reference.md)
- [Formatter Signal Docs Hub](signals/README.md)
- [Chunk and Thinking Formatter Required-Content and Skip Contract Reference](signals/chunk_and_thinking_formatter_required_content_and_skip_contract_reference.md)
- [Token Count and Tool Schemas Formatter Schema-Alignment and Strict-Validation Reference](signals/token_count_and_tool_schemas_formatter_schema_alignment_and_strict_validation_reference.md)
- [Formatter Action Docs Hub](actions/README.md)
- [Tool Call and Tool Output Formatter Validation and Metadata-Passthrough Reference](actions/tool_call_and_tool_output_formatter_validation_and_metadata_passthrough_reference.md)
- [Tool Bundle Formatter Typed/Dict Parity and Default-Payload Contract Reference](actions/tool_bundle_formatter_typed_dict_parity_and_default_payload_contract_reference.md)
- [Formatter Registry Docs Hub](registry/README.md)
- [Response Formatter Registry Lifecycle, Lazy Specs, and Context Attachment Reference](registry/response_formatter_registry_lifecycle_lazy_specs_and_context_attachment_reference.md)

## Code Scope

- `backend/src/api/processing/formatters/base.py`
- `backend/src/api/processing/formatters/*.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/contracts/registry.py`
- `backend/src/api/transport/envelope.py`
- `tests/backend/test_formatters.py`
- `tests/backend/test_response_formatter.py`
- `tests/backend/test_outgoing_schema_contract.py`
- `tests/backend/test_api_contract_registry.py`
- `tests/backend/test_tool_bundle_formatter.py`
