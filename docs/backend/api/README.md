---
summary: "Backend API docs sub-hub for HTTP/WebSocket routes, message-handler behavior, and transport lifecycle guarantees."
read_when:
  - When adding or changing backend API routes, handlers, or websocket limits.
  - When debugging incoming message dispatch and stream transport behavior.
title: "Backend API Docs Hub"
---

# Backend API Docs Hub

## Deep Pages

- [API and Transport](api_and_transport.md)
- [API Processing Docs Hub](processing/README.md)
- [API Processing Formatters Docs Hub](processing/formatters/README.md)
- [API Processing TTS Docs Hub](processing/tts/README.md)
- [API Transport Docs Hub](transport/README.md)
- [HTTP and WebSocket Endpoint Reference](http_and_ws_endpoint_reference.md)
- [App Assembly and Container Dependency Reference](app_assembly_and_container_dependency_reference.md)
- [Memory Route Validation and Fallback Reference](memory_route_validation_and_fallback_reference.md)
- [WebSocket Connection and Task Lifecycle Reference](websocket_connection_and_task_lifecycle_reference.md)
- [Handler Registry and Error Envelope Reference](handler_registry_and_error_envelope_reference.md)
- [Handler Behavior Matrix](handler_behavior_matrix.md)
- [Non-Query Handler and Control Flow Reference](non_query_handler_and_control_flow_reference.md)
- [Formatter Dispatch and Schema Alignment Reference](processing/formatter_dispatch_and_schema_alignment_reference.md)
- [Stream Pipeline, Completion, and TTS Concurrency Reference](processing/stream_pipeline_completion_and_tts_concurrency_reference.md)
- [Query Execution Runtime-State and Completion Resolver Reference](processing/query_execution_runtime_state_and_completion_resolver_reference.md)
- [Base Formatter Guard Utilities and Skip Semantics Reference](processing/formatters/base_formatter_guard_utilities_and_skip_semantics_reference.md)
- [Formatter Validation and Contract-Test Matrix Reference](processing/formatters/formatter_validation_and_contract_test_matrix_reference.md)
- [TTS Manager Audio Stream and Cleanup Reference](processing/tts/tts_manager_audio_stream_and_cleanup_reference.md)
- [TTS Processor Suppression State-Machine Reference](processing/tts/tts_processor_suppression_state_machine_reference.md)
- [Safe WebSocket and Transport Envelope Reference](transport/safe_websocket_and_transport_envelope_reference.md)

## Code Scope

- `backend/src/api/routes/*`
- `backend/src/api/handlers/*`
- `backend/src/api/processing/*`
- `backend/src/api/transport/*`
