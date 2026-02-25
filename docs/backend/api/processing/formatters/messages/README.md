---
summary: "Backend API formatter message docs sub-hub for assistant/user/system/complete/error/memory-store formatter payload mapping and skip-guard contracts."
read_when:
  - When changing message-style formatter modules under `backend/src/api/processing/formatters/*`.
  - When debugging missing `assistant-message-full`, `user-message-full`, `system-prompt`, `streaming-complete`, `error`, or `memory-store` websocket payloads.
title: "Backend API Formatter Message Docs Hub"
---

# Backend API Formatter Message Docs Hub

## Deep Pages

- [Assistant/User/System/Complete Formatter Payload Contract Reference](assistant_user_system_and_complete_formatter_payload_contract_reference.md)
- [Error and Memory-Store Formatter Guard and Schema-Mapping Reference](error_and_memory_store_formatter_guard_and_schema_mapping_reference.md)

## Related Pages

- [Backend API Processing Formatters Docs Hub](../README.md)
- [Response Formatter Registry Lifecycle, Lazy Specs, and Context Attachment Reference](../registry/response_formatter_registry_lifecycle_lazy_specs_and_context_attachment_reference.md)
- [Formatter Validation and Contract-Test Matrix Reference](../formatter_validation_and_contract_test_matrix_reference.md)

## Code Scope

- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/processing/formatters/assistant_message.py`
- `backend/src/api/processing/formatters/user_message.py`
- `backend/src/api/processing/formatters/system_prompt.py`
- `backend/src/api/processing/formatters/complete.py`
- `backend/src/api/processing/formatters/error.py`
- `backend/src/api/processing/formatters/memory_store.py`
- `backend/src/api/schemas/outgoing.py`
- `backend/src/core/events/streaming_events.py`
- `tests/backend/test_formatters.py`
- `tests/backend/test_outgoing_schema_contract.py`
