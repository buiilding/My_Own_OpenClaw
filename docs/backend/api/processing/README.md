---
summary: "Backend API processing docs sub-hub for formatter dispatch contracts, stream pipeline ordering, completion fallback logic, and TTS concurrency behavior."
read_when:
  - When changing `backend/src/api/processing/*` formatter or stream pipeline code.
  - When debugging missing streamed events, schema drift, or TTS race conditions.
title: "Backend API Processing Docs Hub"
---

# Backend API Processing Docs Hub

## Deep Pages

- [API Processing Formatters Docs Hub](formatters/README.md)
- [Formatter Registry Docs Hub](formatters/registry/README.md)
- [API Processing TTS Docs Hub](tts/README.md)
- [API Processing Completion Docs Hub](completion/README.md)
- [Formatter Dispatch and Schema Alignment Reference](formatter_dispatch_and_schema_alignment_reference.md)
- [Response Formatter Registry Lifecycle, Lazy Specs, and Context Attachment Reference](formatters/registry/response_formatter_registry_lifecycle_lazy_specs_and_context_attachment_reference.md)
- [Stream Pipeline, Completion, and TTS Concurrency Reference](stream_pipeline_completion_and_tts_concurrency_reference.md)
- [Query Execution Runtime-State and Completion Resolver Reference](query_execution_runtime_state_and_completion_resolver_reference.md)
- [Query Execution Helper Contracts and Compatibility Event Extraction Reference](completion/query_execution_helper_contracts_and_compatibility_event_extraction_reference.md)
- [Base Formatter Guard Utilities and Skip Semantics Reference](formatters/base_formatter_guard_utilities_and_skip_semantics_reference.md)
- [Formatter Validation and Contract-Test Matrix Reference](formatters/formatter_validation_and_contract_test_matrix_reference.md)
- [Formatter Message Docs Hub](formatters/messages/README.md)
- [Assistant/User/System/Complete Formatter Payload Contract Reference](formatters/messages/assistant_user_system_and_complete_formatter_payload_contract_reference.md)
- [Error and Memory-Store Formatter Guard and Schema-Mapping Reference](formatters/messages/error_and_memory_store_formatter_guard_and_schema_mapping_reference.md)
- [TTS Manager Audio Stream and Cleanup Reference](tts/tts_manager_audio_stream_and_cleanup_reference.md)
- [TTS Processor Suppression State-Machine Reference](tts/tts_processor_suppression_state_machine_reference.md)

## Code Scope

- `backend/src/api/processing/formatter.py`
- `backend/src/api/processing/pipeline.py`
- `backend/src/api/processing/formatters/*`
- `backend/src/api/processing/tts/*`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/contracts/registry.py`
- `backend/src/api/schemas/outgoing.py`
