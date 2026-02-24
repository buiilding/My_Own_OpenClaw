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
- [Container DI and Initialization Lifecycle Reference](bootstrap/container_di_and_init_lifecycle_reference.md)
- [Config Docs Hub](config/README.md)
- [Config Fields and Runtime Policy](config/config_fields_and_runtime_policy.md)
- [Core Infrastructure Docs Hub](core/README.md)
- [Event Bus and Cache Infrastructure Reference](core/event_bus_and_cache_infrastructure_reference.md)
- [Core Observability Docs Hub](core/observability/README.md)
- [Trust-Boundary Metrics and Enforcement Reference](core/observability/trust_boundary_metrics_and_enforcement_reference.md)
- [Core Validation Docs Hub](core/validation/README.md)
- [Input Validation and Frontend Patch Guard Reference](core/validation/input_validation_and_frontend_patch_guard_reference.md)

### API and Contracts

- [API Docs Hub](api/README.md)
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
- [WebSocket Connection and Task Lifecycle Reference](api/websocket_connection_and_task_lifecycle_reference.md)
- [Handler Registry and Error Envelope Reference](api/handler_registry_and_error_envelope_reference.md)
- [Non-Query Handler and Control Flow Reference](api/non_query_handler_and_control_flow_reference.md)
- [Formatter Dispatch and Schema Alignment Reference](api/processing/formatter_dispatch_and_schema_alignment_reference.md)
- [Stream Pipeline, Completion, and TTS Concurrency Reference](api/processing/stream_pipeline_completion_and_tts_concurrency_reference.md)
- [Query Execution Runtime-State and Completion Resolver Reference](api/processing/query_execution_runtime_state_and_completion_resolver_reference.md)
- [Base Formatter Guard Utilities and Skip Semantics Reference](api/processing/formatters/base_formatter_guard_utilities_and_skip_semantics_reference.md)
- [Formatter Validation and Contract-Test Matrix Reference](api/processing/formatters/formatter_validation_and_contract_test_matrix_reference.md)
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
- [Agent and Tool Runtime](runtime/agent_and_tool_runtime.md)
- [Session State and Lifecycle](runtime/session_state_and_lifecycle.md)
- [Session Runtime and Config Rewire Reference](agent/session_runtime_and_config_rewire_reference.md)
- [Interaction Loop and Tool-Turn Orchestration Reference](agent/interaction_loop_and_tool_turn_orchestration_reference.md)
- [Query Execution and Stream Pipeline Reference](runtime/query_execution_and_stream_pipeline_reference.md)
- [Conversation History and Prompt Context Runtime Reference](runtime/conversation_history_and_prompt_context_runtime_reference.md)
- [Token Count Event and Usage Diagnostics Reference](runtime/token_count_event_and_usage_diagnostics_reference.md)
- [Tools Docs Hub](tools/README.md)
- [Tools Registry Docs Hub](tools/registry/README.md)
- [Browser Tools Docs Hub](tools/browser/README.md)
- [Browser Schema Docs Hub](tools/browser/schema/README.md)
- [Tools Policy Docs Hub](tools/policy/README.md)
- [Remote Tools Docs Hub](tools/remote/README.md)
- [Tools Security Docs Hub](tools/security/README.md)
- [Frontend Tool Bridge and Policy](tools/frontend_tool_bridge_and_policy.md)
- [Remote Tool Registry, Schema Cache, and Cross-Layer Parity Reference](tools/registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md)
- [Browser Remote Schema Surface and Compatibility Contract Reference](tools/browser/browser_remote_schema_surface_and_compatibility_contract_reference.md)
- [Browser Control Unified Schema and Compatibility Field Matrix Reference](tools/browser/schema/browser_control_unified_schema_and_compatibility_field_matrix_reference.md)
- [Backend-Sidecar Browser Schema Parity and Validation Boundary Reference](tools/browser/schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md)
- [Tool Policy and Dev Tool Selection Runtime Reference](tools/policy/tool_policy_and_dev_tool_selection_runtime_reference.md)
- [Remote Tool Domain Payload and Request-ID Semantics Reference](tools/remote/remote_tool_domain_payload_and_request_id_semantics_reference.md)
- [Tool Security Policy and Executor Reference](tools/tool_security_policy_and_executor_reference.md)
- [Policy Permissions, Audit Sanitization, and Executor Registry Reference](tools/security/policy_permissions_audit_and_executor_registry_reference.md)
- [Tool Result Ingress and Storage Reference](tools/tool_result_ingress_and_storage_reference.md)
- [Tool Preparation and Coordinate Resolution Reference](tools/tool_preparation_and_coordinate_resolution_reference.md)
- [SDK Docs Hub](sdk/README.md)
- [Tool Context and Schema Contract Reference](sdk/tool_context_and_schema_contract_reference.md)
- [Sub-Agent Session Helper Runtime Reference](sdk/subagent_session_helper_runtime_reference.md)

### LLM and Services

- [LLM Docs Hub](llm/README.md)
- [LLM Provider Docs Hub](llm/providers/README.md)
- [LLM Prompt Docs Hub](llm/prompts/README.md)
- [Services Docs Hub](services/README.md)
- [Services Token Docs Hub](services/token/README.md)
- [Services Screen-Grounding Docs Hub](services/screen_grounding/README.md)
- [LLM Models and Parsing](llm/llm_models_and_parsing.md)
- [Provider Factory and Runtime Selection Reference](llm/provider_factory_and_runtime_selection_reference.md)
- [Parser Trust Boundary and Native Tool-Call Reference](llm/parser_trust_boundary_and_native_tool_call_reference.md)
- [Base Request, Stream, and Normalization Reference](llm/providers/base_request_stream_and_normalization_reference.md)
- [Provider-Specific Overrides and Local Runtime Reference](llm/providers/provider_specific_overrides_and_local_runtime_reference.md)
- [Prompt Constructor and Transparency Metadata Reference](llm/prompts/prompt_constructor_and_transparency_metadata_reference.md)
- [Prompt Manager and System Prompt Lifecycle Reference](llm/prompts/prompt_manager_and_system_prompt_lifecycle_reference.md)
- [Services and Storage](services/services_and_storage.md)
- [Token Service Message Normalization and Fallback Reference](services/token/token_service_message_normalization_and_fallback_reference.md)
- [Embedding and Semantic Memory Runtime Reference](services/embedding_and_semantic_memory_runtime_reference.md)
- [Artifact, Screenshot, and System-State Flow Reference](services/artifact_screenshot_and_system_state_flow_reference.md)
- [TTS and Wakeword Audio Runtime Reference](services/tts_and_wakeword_audio_runtime_reference.md)
- [OCR and Vision Coordinate Runtime Overview](services/ocr_and_vision_coordinate_runtime_reference.md)
- [OCR Service and Screenshot State-Machine Reference](services/screen_grounding/ocr_service_and_screenshot_state_machine_reference.md)
- [Vision Provider Runtime and Coordinate-Scaling Reference](services/screen_grounding/vision_provider_runtime_and_coordinate_scaling_reference.md)

### Simulation

- [Simulation Docs Hub](simulation/README.md)
- [Simulation Backend and Mock LLM Runtime Reference](simulation/simulation_backend_and_mock_llm_runtime_reference.md)

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
