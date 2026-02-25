---
summary: "Backend documentation hub covering bootstrap, API transport, agent runtime, tool lifecycle, model stack, and runtime services."
read_when:
  - When making backend changes beyond a single module.
  - When tracing full query lifecycle from WebSocket ingress to streamed response.
title: "Backend Functionality Map"
---

# Backend Functionality Map

This hub is the implementation-level map for `backend/src`. Use this as the entrypoint when changing backend behavior.

## Scope

Covers:

- Startup and dependency graph initialization
- Config/runtime policy normalization
- WebSocket + REST transport contracts
- Agent runtime loop and session lifecycle
- Tool lifecycle (prepare, send, wait, process)
- LLM provider/model/prompt/parser stack
- Runtime services (OCR, vision, embeddings, artifacts)
- Simulation runtime and mock LLM entrypoints
- SDK tool contracts and sub-agent helper utilities

## Deep Pages

### Bootstrap

- [Bootstrap Docs Hub](bootstrap/README.md)
- [Bootstrap and Config](bootstrap/bootstrap_and_config.md)
- [Backend Full Functionality Inventory Reference](backend_full_functionality_inventory_reference.md)
- [Container DI and Initialization Lifecycle Reference](bootstrap/container_di_and_init_lifecycle_reference.md)
- [Bootstrap Entrypoints Docs Hub](bootstrap/entrypoints/README.md)
- [Shared Entrypoint Logger and Uvicorn Runner Contract Reference](bootstrap/entrypoints/shared_entrypoint_logger_and_uvicorn_runner_contract_reference.md)
- [Config Docs Hub](config/README.md)
- [Config Fields and Runtime Policy](config/config_fields_and_runtime_policy.md)
- [Core Infrastructure Docs Hub](core/README.md)
- [Event Bus and Cache Infrastructure Reference](core/event_bus_and_cache_infrastructure_reference.md)
- [Core Observability Docs Hub](core/observability/README.md)
- [Trust-Boundary Metrics and Enforcement Reference](core/observability/trust_boundary_metrics_and_enforcement_reference.md)
- [Core Validation Docs Hub](core/validation/README.md)
- [Input Validation and Frontend Patch Guard Reference](core/validation/input_validation_and_frontend_patch_guard_reference.md)
- [Core Messages Docs Hub](core/messages/README.md)
- [Stored Message LLM Serialization, Tool-Call Normalization, and Multimodal Image Contract Reference](core/messages/stored_message_llm_serialization_tool_call_normalization_and_multimodal_image_contract_reference.md)
- [Content Converter Parsing, First-Image Selection, and Type-Alias Export Contract Reference](core/messages/content_converter_parsing_first_image_selection_and_type_alias_export_contract_reference.md)
- [Core Cache Docs Hub](core/cache/README.md)
- [Cache Store TTL, LRU, Negative-Cache, and Sync/Async Waiter Contract Reference](core/cache/cache_store_ttl_lru_negative_cache_and_sync_async_waiter_contract_reference.md)
- [Cache Manager Namespace Keying, Cache Entry Dataclass, and Facade Export Contract Reference](core/cache/cache_manager_namespace_keying_cache_entry_dataclass_and_facade_export_contract_reference.md)
- [Core Interfaces Docs Hub](core/interfaces/README.md)
- [Embedding Provider Async Contract and Container Wiring Reference](core/interfaces/embedding_provider_async_contract_and_container_wiring_reference.md)
- [Vision Service Protocol Boundary and Session Hierarchy Access Contract Reference](core/interfaces/vision_service_protocol_boundary_and_session_hierarchy_access_contract_reference.md)
- [Core Logging Docs Hub](core/logging/README.md)
- [Log Profile Noise Filter and Env-Level Resolution Contract Reference](core/logging/log_profile_noise_filter_and_env_level_resolution_contract_reference.md)
- [Source Maps Docs Hub](source_maps/README.md)
- [API/Core Folder Topology and Data-Flow Source Map Reference](source_maps/api_core_folder_topology_and_data_flow_source_map_reference.md)
- [Package `__init__` Exports and Public Import Surface Reference](source_maps/backend_package_init_exports_and_public_import_surface_reference.md)

### API and Contracts

- [API Docs Hub](api/README.md)
- [API Handlers Docs Hub](api/handlers/README.md)
- [API Services Docs Hub](api/services/README.md)
- [API Processing Docs Hub](api/processing/README.md)
- [API Processing Formatters Docs Hub](api/processing/formatters/README.md)
- [API Processing TTS Docs Hub](api/processing/tts/README.md)
- [API Transport Docs Hub](api/transport/README.md)
- [Contracts Docs Hub](contracts/README.md)
- [Contracts Streaming Events Docs Hub](contracts/events/README.md)
- [Contracts Routing Docs Hub](contracts/routing/README.md)
- [Contracts Message Types Docs Hub](contracts/message_types/README.md)
- [API and Transport](api/api_and_transport.md)
- [Safe WebSocket and Transport Envelope Reference](api/transport/safe_websocket_and_transport_envelope_reference.md)
- [HTTP and WebSocket Endpoint Reference](api/http_and_ws_endpoint_reference.md)
- [App Assembly and Container Dependency Reference](api/app_assembly_and_container_dependency_reference.md)
- [Memory Route Validation and Fallback Reference](api/memory_route_validation_and_fallback_reference.md)
- [API Memory Docs Hub](api/memory/README.md)
- [Semantic Summarization Service Config Resolution, Prompt Assembly, and Parser-Fallback Contract Reference](api/memory/semantic_summarization_service_config_resolution_prompt_assembly_and_parser_fallback_contract_reference.md)
- [Embeddings Route Serialization, Sanitized Error Surface, and Health-Probe Contract Reference](api/memory/embeddings_route_serialization_sanitized_error_surface_and_health_probe_contract_reference.md)
- [WebSocket Connection and Task Lifecycle Reference](api/websocket_connection_and_task_lifecycle_reference.md)
- [API WebSocket Connection Docs Hub](api/websocket/connection/README.md)
- [Handler Registry and Error Envelope Reference](api/handler_registry_and_error_envelope_reference.md)
- [Non-Query Handler and Control Flow Reference](api/non_query_handler_and_control_flow_reference.md)
- [Query Handler and Query Execution Service Runtime Reference](api/handlers/query_handler_and_query_execution_service_runtime_reference.md)
- [Non-Query Handler Dispatch and Payload Normalization Reference](api/handlers/non_query_handler_dispatch_and_payload_normalization_reference.md)
- [Query Execution Service Stream Context and Completion Fallback Reference](api/services/query_execution_service_stream_context_and_completion_fallback_reference.md)
- [Rehydrate and Wakeword Execution Service and TTS Session Reference](api/services/rehydrate_and_wakeword_execution_service_and_tts_session_reference.md)
- [Handshake Parse, Validation, and Policy-Close Contract Reference](api/websocket/connection/handshake_parse_validation_and_policy_close_contract_reference.md)
- [Task Manager Concurrency Limit, Rejected-Coroutine Close, and Cleanup Contract Reference](api/websocket/connection/task_manager_concurrency_limit_rejected_coroutine_close_and_cleanup_contract_reference.md)
- [Formatter Dispatch and Schema Alignment Reference](api/processing/formatter_dispatch_and_schema_alignment_reference.md)
- [Stream Pipeline, Completion, and TTS Concurrency Reference](api/processing/stream_pipeline_completion_and_tts_concurrency_reference.md)
- [Query Execution Runtime-State and Completion Resolver Reference](api/processing/query_execution_runtime_state_and_completion_resolver_reference.md)
- [Base Formatter Guard Utilities and Skip Semantics Reference](api/processing/formatters/base_formatter_guard_utilities_and_skip_semantics_reference.md)
- [Formatter Validation and Contract-Test Matrix Reference](api/processing/formatters/formatter_validation_and_contract_test_matrix_reference.md)
- [Formatter Message Docs Hub](api/processing/formatters/messages/README.md)
- [Assistant/User/System/Complete Formatter Payload Contract Reference](api/processing/formatters/messages/assistant_user_system_and_complete_formatter_payload_contract_reference.md)
- [Error and Memory-Store Formatter Guard and Schema-Mapping Reference](api/processing/formatters/messages/error_and_memory_store_formatter_guard_and_schema_mapping_reference.md)
- [Formatter Signal Docs Hub](api/processing/formatters/signals/README.md)
- [Chunk and Thinking Formatter Required-Content and Skip Contract Reference](api/processing/formatters/signals/chunk_and_thinking_formatter_required_content_and_skip_contract_reference.md)
- [Token Count and Tool Schemas Formatter Schema-Alignment and Strict-Validation Reference](api/processing/formatters/signals/token_count_and_tool_schemas_formatter_schema_alignment_and_strict_validation_reference.md)
- [Formatter Action Docs Hub](api/processing/formatters/actions/README.md)
- [Tool Call and Tool Output Formatter Validation and Metadata-Passthrough Reference](api/processing/formatters/actions/tool_call_and_tool_output_formatter_validation_and_metadata_passthrough_reference.md)
- [Tool Bundle Formatter Typed/Dict Parity and Default-Payload Contract Reference](api/processing/formatters/actions/tool_bundle_formatter_typed_dict_parity_and_default_payload_contract_reference.md)
- [TTS Manager Audio Stream and Cleanup Reference](api/processing/tts/tts_manager_audio_stream_and_cleanup_reference.md)
- [TTS Processor Suppression State-Machine Reference](api/processing/tts/tts_processor_suppression_state_machine_reference.md)
- [WebSocket Message Contracts](contracts/websocket_message_contracts.md)
- [Message Schema and Formatter Reference](contracts/message_schema_and_formatter_reference.md)
- [Message-Type Constants, Schema-Subset, and Handler ACK Reference](contracts/message_types/message_type_constants_schema_subset_and_handler_ack_reference.md)
- [Incoming Route Table, Schema Parity, and Handler-Binding Reference](contracts/routing/incoming_route_table_schema_parity_and_handler_binding_reference.md)
- [Streaming Event Dataclass and Enum Semantics Reference](contracts/events/streaming_event_dataclass_and_enum_semantics_reference.md)
- [Streaming Event to Formatter and Outgoing Contract Alignment Reference](contracts/events/streaming_event_to_formatter_and_outgoing_contract_alignment_reference.md)
- [Handler Behavior Matrix](api/handler_behavior_matrix.md)

### Runtime and Tools

- [Runtime Docs Hub](runtime/README.md)
- [Agent Docs Hub](agent/README.md)
- [Agent History Docs Hub](agent/history/README.md)
- [Agent LLM Docs Hub](agent/llm/README.md)
- [Agent Recovery Docs Hub](agent/recovery/README.md)
- [Agent Tools Shared-Utility Docs Hub](agent/tools/shared/README.md)
- [Agent and Tool Runtime](runtime/agent_and_tool_runtime.md)
- [Session State and Lifecycle](runtime/session_state_and_lifecycle.md)
- [Session Runtime and Config Rewire Reference](agent/session_runtime_and_config_rewire_reference.md)
- [Interaction Loop and Tool-Turn Orchestration Reference](agent/interaction_loop_and_tool_turn_orchestration_reference.md)
- [Conversation Context and Event Presenter Prompt-Metadata Reference](agent/llm/conversation_context_and_event_presenter_prompt_metadata_reference.md)
- [LLM Stream Processor Token Count and Cache Diagnostics Reference](agent/llm/llm_stream_processor_token_count_and_cache_diagnostics_reference.md)
- [History Committer and Result-Processor Boundary Reference](agent/history/history_committer_and_result_processor_boundary_reference.md)
- [Tool-Call-ID Staging and Tool-Output History Row Contract Reference](agent/history/tool_call_id_staging_and_tool_output_history_row_contract_reference.md)
- [Tool-Call Error Recovery and Synthetic Tool-Output Replay Reference](agent/recovery/tool_call_error_recovery_and_synthetic_tool_output_replay_reference.md)
- [Request-ID Shortener Utility and Logging Contract Reference](agent/tools/shared/request_id_shortener_utility_and_logging_contract_reference.md)
- [Query Execution and Stream Pipeline Reference](runtime/query_execution_and_stream_pipeline_reference.md)
- [Conversation History and Prompt Context Runtime Reference](runtime/conversation_history_and_prompt_context_runtime_reference.md)
- [Token Count Event and Usage Diagnostics Reference](runtime/token_count_event_and_usage_diagnostics_reference.md)
- [Tools Docs Hub](tools/README.md)
- [Tools Registry Docs Hub](tools/registry/README.md)
- [Browser Tools Docs Hub](tools/browser/README.md)
- [Browser Schema Docs Hub](tools/browser/schema/README.md)
- [Tools Policy Docs Hub](tools/policy/README.md)
- [Remote Tools Docs Hub](tools/remote/README.md)
- [Tools Execution Docs Hub](tools/execution/README.md)
- [Tools Preparation Docs Hub](tools/preparation/README.md)
- [Tools Waiting Docs Hub](tools/waiting/README.md)
- [Tools Processing Docs Hub](tools/processing/README.md)
- [Tools Contracts Docs Hub](tools/contracts/README.md)
- [Tools Templates Docs Hub](tools/templates/README.md)
- [Tools Security Docs Hub](tools/security/README.md)
- [Frontend Tool Bridge and Policy](tools/frontend_tool_bridge_and_policy.md)
- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](tools/registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)
- [Browser Remote Schema Surface and Compatibility Contract Reference](tools/browser/browser_remote_schema_surface_and_compatibility_contract_reference.md)
- [Browser Control Unified Schema and Compatibility Field Matrix Reference](tools/browser/schema/browser_control_unified_schema_and_compatibility_field_matrix_reference.md)
- [Backend-Sidecar Browser Schema Parity and Validation Boundary Reference](tools/browser/schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)
- [Tool Policy and Dev Tool Selection Runtime Reference](tools/policy/tool_policy_and_dev_tool_selection_runtime_reference.md)
- [Remote Tool Domain Payload and Request-ID Semantics Reference](tools/remote/remote_tool_domain_payload_and_request_id_semantics_reference.md)
- [Tool Domain and Category Enum Contract Reference](tools/contracts/tool_domain_and_category_enum_contract_reference.md)
- [Schema Field Factory Explanation and Post-Action Wait Contract Reference](tools/contracts/schema_field_factory_explanation_and_post_action_wait_contract_reference.md)
- [Tool Execution Result and Batch Dataclass Contract Reference](tools/contracts/tool_execution_result_and_batch_dataclass_contract_reference.md)
- [Tool Result Helper Object Creation and Default Timing Contract Reference](tools/contracts/tool_result_helper_object_creation_and_default_timing_contract_reference.md)
- [Tools Package Lazy Export and Runtime Import Contract Reference](tools/contracts/tools_package_lazy_export_and_runtime_import_contract_reference.md)
- [SDK Tool Template Scaffold, Manifest, and Capability Contract Reference](tools/templates/sdk_tool_template_scaffold_manifest_and_capability_contract_reference.md)
- [Tool Security Policy and Executor Reference](tools/tool_security_policy_and_executor_reference.md)
- [Policy Permissions, Audit Sanitization, and Executor Registry Reference](tools/security/policy_permissions_audit_and_executor_registry_reference.md)
- [Tool Result Ingress and Storage Reference](tools/tool_result_ingress_and_storage_reference.md)
- [Tool Sender Frontend Dispatch and Synthetic Error Result Reference](tools/execution/tool_sender_frontend_dispatch_and_synthetic_error_result_reference.md)
- [Tool Result Orchestrator Bundle Detection and Wait Path Reference](tools/execution/tool_result_orchestrator_bundle_detection_and_wait_path_reference.md)
- [Tool Result Receiver and Router Shared Route-Mode Reference](tools/waiting/tool_result_receiver_and_router_shared_route_mode_reference.md)
- [Tool Result Storage Future Lifecycle and Cleanup Reference](tools/waiting/tool_result_storage_future_lifecycle_and_cleanup_reference.md)
- [Tool Result Processor Bundle Formatting and Cleanup Reference](tools/processing/tool_result_processor_bundle_formatting_and_cleanup_reference.md)
- [Result Transformer and Tool Result Formatting Contract Reference](tools/processing/result_transformer_and_tool_result_formatting_contract_reference.md)
- [Synthetic Result Factory and Coordinate-Resolution Failure Tool-Output Reference](tools/processing/synthetic_result_factory_and_coordinate_resolution_failure_tool_output_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](tools/tool_preparation_and_coordinate_resolution_reference.md)
- [Screenshot Manager and OCR Task Lifecycle Reference](tools/preparation/screenshot_manager_and_ocr_task_lifecycle_reference.md)
- [Resolved Tool-Call Storage and Session Access Contract Reference](tools/preparation/resolved_tool_call_storage_and_session_access_contract_reference.md)
- [SDK Docs Hub](sdk/README.md)
- [Tool Context and Schema Contract Reference](sdk/tool_context_and_schema_contract_reference.md)
- [Sub-Agent Session Helper Runtime Reference](sdk/subagent_session_helper_runtime_reference.md)

### LLM and Services

- [LLM Docs Hub](llm/README.md)
- [LLM Provider Docs Hub](llm/providers/README.md)
- [LLM Prompt Docs Hub](llm/prompts/README.md)
- [Services Docs Hub](services/README.md)
- [Services Artifact Docs Hub](services/artifacts/README.md)
- [Services Token Docs Hub](services/token/README.md)
- [Services Screen-Grounding Docs Hub](services/screen_grounding/README.md)
- [Services Screen-Grounding Vision Docs Hub](services/screen_grounding/vision/README.md)
- [LLM Models and Parsing](llm/llm_models_and_parsing.md)
- [Provider Factory and Runtime Selection Reference](llm/provider_factory_and_runtime_selection_reference.md)
- [Parser Trust Boundary and Native Tool-Call Reference](llm/parser_trust_boundary_and_native_tool_call_reference.md)
- [Base Request, Stream, and Normalization Reference](llm/providers/base_request_stream_and_normalization_reference.md)
- [Provider-Specific Overrides and Local Runtime Reference](llm/providers/provider_specific_overrides_and_local_runtime_reference.md)
- [Prompt Constructor and Transparency Metadata Reference](llm/prompts/prompt_constructor_and_transparency_metadata_reference.md)
- [Prompt Manager and System Prompt Lifecycle Reference](llm/prompts/prompt_manager_and_system_prompt_lifecycle_reference.md)
- [Services and Storage](services/services_and_storage.md)
- [Artifact Service Docs Hub](services/artifacts/README.md)
- [Token Service Message Normalization and Fallback Reference](services/token/token_service_message_normalization_and_fallback_reference.md)
- [Embedding and Semantic Memory Runtime Reference](services/embedding_and_semantic_memory_runtime_reference.md)
- [Artifact, Screenshot, and System-State Flow Reference](services/artifact_screenshot_and_system_state_flow_reference.md)
- [Artifact Store Upload Streaming, ID Validation, and Base64 Lookup Contract Reference](services/artifacts/artifact_store_upload_streaming_id_validation_and_base64_lookup_contract_reference.md)
- [Artifact HTTP Route Error Mapping and URL Construction Reference](services/artifacts/artifact_http_route_error_mapping_and_url_construction_reference.md)
- [TTS and Wakeword Audio Runtime Reference](services/tts_and_wakeword_audio_runtime_reference.md)
- [OCR and Vision Coordinate Runtime Overview](services/ocr_and_vision_coordinate_runtime_reference.md)
- [OCR Service and Screenshot State-Machine Reference](services/screen_grounding/ocr_service_and_screenshot_state_machine_reference.md)
- [Screen-Grounding OCR Helpers Docs Hub](services/screen_grounding/ocr/README.md)
- [CUDA Error Detection, Screenshot Decode, and OCR Field Normalization Helper Contract Reference](services/screen_grounding/ocr/cuda_error_detection_screenshot_decode_and_ocr_field_normalization_helper_contract_reference.md)
- [Vision Provider Runtime and Coordinate-Scaling Reference](services/screen_grounding/vision_provider_runtime_and_coordinate_scaling_reference.md)
- [Provider Loader Device-Map, Direct, CPU Fallback, and Dtype Contract Reference](services/screen_grounding/vision/provider_loader_device_map_direct_cpu_fallback_and_dtype_contract_reference.md)
- [InternVL Chat/Generate Fallback and Runtime Flash-Attention Disable Reference](services/screen_grounding/vision/internvl_chat_generate_fallback_and_runtime_flash_attention_disable_reference.md)

### Simulation

- [Simulation Docs Hub](simulation/README.md)
- [Simulation Backend and Mock LLM Runtime Reference](simulation/simulation_backend_and_mock_llm_runtime_reference.md)
- [Simulation Entrypoints Docs Hub](simulation/entrypoints/README.md)
- [Package Runner and Module Alias Uvicorn Bootstrap Contract Reference](simulation/entrypoints/package_runner_and_module_alias_uvicorn_bootstrap_contract_reference.md)
- [Simulation Contracts Docs Hub](simulation/contracts/README.md)
- [Coordinate Resolver Re-Export and Production Parity Contract Reference](simulation/contracts/coordinate_resolver_reexport_and_production_parity_contract_reference.md)

## Backend Layout (Code)

Primary folders under `backend/src`:

- `agent/`: session state, execution loop, tool lifecycle, history commit
- `api/`: routes, handlers, schemas, transport wrappers, response formatting
- `core/`: bootstrap, DI containers, config, events, interfaces, validation
- `llm/`: provider abstraction, model cataloging, prompt construction, parsing
- `tools/`: backend-visible tool schema registry and orchestration bridge
- `sdk/`: SDK base classes/context contract and helper utilities for child sessions
- `services/`: OCR, vision, artifacts, token counting
- `embeddings/`: sentence-transformer embedding provider
- `simulation/`: mock LLM entrypoints, simulation lifespan wiring, legacy payload adapters

## End-to-End Query Path (Condensed)

1. `/ws` receives message and handshake-validates connection.
2. Incoming message is parsed and validated via discriminated Pydantic schemas.
3. Handler registry dispatches by `type` (for example `query`).
4. Query handler starts stream pipeline + TTS session and delegates to `AgentSession`.
5. Agent loop builds prompt, calls provider, parses response, may dispatch tools.
6. Tool results return from frontend (`tool-result` or `tool-bundle-result`).
7. Result processor commits tool outputs to history, loop continues or completes.
8. Streamed events are formatted and sent back to frontend with transport context.
