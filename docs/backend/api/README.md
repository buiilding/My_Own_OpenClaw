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
- [API Handlers Docs Hub](handlers/README.md)
- [API Services Docs Hub](services/README.md)
- [API Processing Docs Hub](processing/README.md)
- [API Processing Formatters Docs Hub](processing/formatters/README.md)
- [API Processing TTS Docs Hub](processing/tts/README.md)
- [API Transport Docs Hub](transport/README.md)
- [API WebSocket Docs Hub](websocket/README.md)
- [API WebSocket Connection Docs Hub](websocket/connection/README.md)
- [API Memory Docs Hub](memory/README.md)
- [HTTP and WebSocket Endpoint Reference](http_and_ws_endpoint_reference.md)
- [App Assembly and Container Dependency Reference](app_assembly_and_container_dependency_reference.md)
- [Memory Route Validation and Fallback Reference](memory_route_validation_and_fallback_reference.md)
- [Semantic Summarization Service Config Resolution, Prompt Assembly, and Parser-Fallback Contract Reference](memory/semantic_summarization_service_config_resolution_prompt_assembly_and_parser_fallback_contract_reference.md)
- [Embeddings Route Serialization, Sanitized Error Surface, and Health-Probe Contract Reference](memory/embeddings_route_serialization_sanitized_error_surface_and_health_probe_contract_reference.md)
- [WebSocket Connection and Task Lifecycle Reference](websocket_connection_and_task_lifecycle_reference.md)
- [WebSocket Message Parse, Validation Guard, and Task-Scheduling Reference](websocket/websocket_message_parse_validation_guard_and_task_scheduling_reference.md)
- [Handshake Parse, Validation, and Policy-Close Contract Reference](websocket/connection/handshake_parse_validation_and_policy_close_contract_reference.md)
- [Task Manager Concurrency Limit, Rejected-Coroutine Close, and Cleanup Contract Reference](websocket/connection/task_manager_concurrency_limit_rejected_coroutine_close_and_cleanup_contract_reference.md)
- [Handler Registry and Error Envelope Reference](handler_registry_and_error_envelope_reference.md)
- [Handler Behavior Matrix](handler_behavior_matrix.md)
- [Query Handler and Query Execution Service Runtime Reference](handlers/query_handler_and_query_execution_service_runtime_reference.md)
- [Non-Query Handler Dispatch and Payload Normalization Reference](handlers/non_query_handler_dispatch_and_payload_normalization_reference.md)
- [Query Execution Service Stream Context and Completion Fallback Reference](services/query_execution_service_stream_context_and_completion_fallback_reference.md)
- [Rehydrate and Wakeword Execution Service and TTS Session Reference](services/rehydrate_and_wakeword_execution_service_and_tts_session_reference.md)
- [Non-Query Handler and Control Flow Reference](non_query_handler_and_control_flow_reference.md)
- [Formatter Dispatch and Schema Alignment Reference](processing/formatter_dispatch_and_schema_alignment_reference.md)
- [Stream Pipeline, Completion, and TTS Concurrency Reference](processing/stream_pipeline_completion_and_tts_concurrency_reference.md)
- [Query Execution Runtime-State and Completion Resolver Reference](processing/query_execution_runtime_state_and_completion_resolver_reference.md)
- [Base Formatter Guard Utilities and Skip Semantics Reference](processing/formatters/base_formatter_guard_utilities_and_skip_semantics_reference.md)
- [Formatter Validation and Contract-Test Matrix Reference](processing/formatters/formatter_validation_and_contract_test_matrix_reference.md)
- [Formatter Message Docs Hub](processing/formatters/messages/README.md)
- [Assistant/User/System/Complete Formatter Payload Contract Reference](processing/formatters/messages/assistant_user_system_and_complete_formatter_payload_contract_reference.md)
- [Error and Memory-Store Formatter Guard and Schema-Mapping Reference](processing/formatters/messages/error_and_memory_store_formatter_guard_and_schema_mapping_reference.md)
- [Formatter Signal Docs Hub](processing/formatters/signals/README.md)
- [Chunk and Thinking Formatter Required-Content and Skip Contract Reference](processing/formatters/signals/chunk_and_thinking_formatter_required_content_and_skip_contract_reference.md)
- [Token Count and Tool Schemas Formatter Schema-Alignment and Strict-Validation Reference](processing/formatters/signals/token_count_and_tool_schemas_formatter_schema_alignment_and_strict_validation_reference.md)
- [Formatter Action Docs Hub](processing/formatters/actions/README.md)
- [Tool Call and Tool Output Formatter Validation and Metadata-Passthrough Reference](processing/formatters/actions/tool_call_and_tool_output_formatter_validation_and_metadata_passthrough_reference.md)
- [Tool Bundle Formatter Typed/Dict Parity and Default-Payload Contract Reference](processing/formatters/actions/tool_bundle_formatter_typed_dict_parity_and_default_payload_contract_reference.md)
- [TTS Manager Audio Stream and Cleanup Reference](processing/tts/tts_manager_audio_stream_and_cleanup_reference.md)
- [TTS Processor Suppression State-Machine Reference](processing/tts/tts_processor_suppression_state_machine_reference.md)
- [Safe WebSocket and Transport Envelope Reference](transport/safe_websocket_and_transport_envelope_reference.md)

## Code Scope

- `backend/src/api/routes/*`
- `backend/src/api/handlers/*`
- `backend/src/api/services/*`
- `backend/src/api/processing/*`
- `backend/src/api/transport/*`
