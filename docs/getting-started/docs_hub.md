---
summary: "Documentation hub with domain-based navigation for backend, frontend, sidecar, operations, and reference."
read_when:
  - When you need a fast entrypoint to WindieOS docs by domain.
  - When deciding where new documentation should be added.
title: "Documentation Hub"
---

# Documentation Hub

This page mirrors the domain-based docs navigation style used in OpenClaw, but adapted to WindieOS architecture.

## Start Here

- [Overview](overview.md)
- [Quick Start](quick_start.md)
- [Installation](installation.md)
- [Platform Setup: Backend + Frontend](platform_setup_backend_frontend.md)

## Architecture Hubs

- [System Architecture](../architecture/architecture.md)
- [Communication Flow](../architecture/communication_flow.md)
- [Backend Architecture (high level)](../architecture/backend_architecture.md)
- [Frontend Architecture (high level)](../architecture/frontend_architecture.md)
- [Python Sidecar (high level)](../architecture/python_sidecar.md)
- [Agent System](../architecture/agent_system.md)
- [Tool System](../architecture/tool_system.md)
- [Memory System](../architecture/memory_system.md)
- [LLM Integration](../architecture/llm_integration.md)

## Deep Technical Maps

- [Backend Functionality Map](../backend/README.md)
- [Backend Bootstrap Docs Hub](../backend/bootstrap/README.md)
- [Backend Core Infrastructure Docs Hub](../backend/core/README.md)
- [Backend API Docs Hub](../backend/api/README.md)
- [Backend Contracts Docs Hub](../backend/contracts/README.md)
- [Backend Runtime Docs Hub](../backend/runtime/README.md)
- [Backend Tools Docs Hub](../backend/tools/README.md)
- [Backend Config Docs Hub](../backend/config/README.md)
- [Backend LLM Docs Hub](../backend/llm/README.md)
- [Backend Services Docs Hub](../backend/services/README.md)
- [Backend Simulation Docs Hub](../backend/simulation/README.md)
- [Backend SDK Docs Hub](../backend/sdk/README.md)
- [Backend Container DI and Init Lifecycle](../backend/bootstrap/container_di_and_init_lifecycle_reference.md)
- [Backend Event Bus + Cache Infrastructure Reference](../backend/core/event_bus_and_cache_infrastructure_reference.md)
- [Backend WebSocket Contracts](../backend/contracts/websocket_message_contracts.md)
- [Backend Message Schema + Formatter Reference](../backend/contracts/message_schema_and_formatter_reference.md)
- [Backend Query Execution Pipeline Reference](../backend/runtime/query_execution_and_stream_pipeline_reference.md)
- [Backend Token Count Event + Usage Diagnostics Reference](../backend/runtime/token_count_event_and_usage_diagnostics_reference.md)
- [Backend Non-Query Handler Control Flow Reference](../backend/api/non_query_handler_and_control_flow_reference.md)
- [Backend Provider Factory + Runtime Selection Reference](../backend/llm/provider_factory_and_runtime_selection_reference.md)
- [Backend Parser Trust Boundary + Native Tool-Call Reference](../backend/llm/parser_trust_boundary_and_native_tool_call_reference.md)
- [Backend Simulation + Mock LLM Runtime Reference](../backend/simulation/simulation_backend_and_mock_llm_runtime_reference.md)
- [Backend SDK Tool Context + Schema Contract Reference](../backend/sdk/tool_context_and_schema_contract_reference.md)
- [Backend SDK Sub-Agent Session Helper Runtime Reference](../backend/sdk/subagent_session_helper_runtime_reference.md)
- [Backend Artifact/Screenshot/System-State Flow Reference](../backend/services/artifact_screenshot_and_system_state_flow_reference.md)
- [Backend Embedding + Semantic Memory Runtime Reference](../backend/services/embedding_and_semantic_memory_runtime_reference.md)
- [Backend TTS + Wakeword Audio Runtime Reference](../backend/services/tts_and_wakeword_audio_runtime_reference.md)
- [Backend OCR + Vision Coordinate Runtime Reference](../backend/services/ocr_and_vision_coordinate_runtime_reference.md)
- [Backend Tool Result Ingress Reference](../backend/tools/tool_result_ingress_and_storage_reference.md)
- [Backend Tool Preparation + Coordinate Resolution Reference](../backend/tools/tool_preparation_and_coordinate_resolution_reference.md)
- [Backend Tool Security Policy + Executor Reference](../backend/tools/tool_security_policy_and_executor_reference.md)
- [Backend Config Runtime Policy](../backend/config/config_fields_and_runtime_policy.md)
- [Backend Endpoint Reference](../backend/api/http_and_ws_endpoint_reference.md)
- [Backend App Assembly + Container Dependency Reference](../backend/api/app_assembly_and_container_dependency_reference.md)
- [Backend Memory Route Validation + Fallback Reference](../backend/api/memory_route_validation_and_fallback_reference.md)
- [Backend WebSocket Connection + Task Lifecycle Reference](../backend/api/websocket_connection_and_task_lifecycle_reference.md)
- [Backend Handler Registry + Error Envelope Reference](../backend/api/handler_registry_and_error_envelope_reference.md)
- [Frontend Functionality Map](../frontend/README.md)
- [Frontend Landing Docs Hub](../frontend/landing/README.md)
- [Frontend Main Docs Hub](../frontend/main/README.md)
- [Frontend Renderer Docs Hub](../frontend/renderer/README.md)
- [Frontend Runtime Docs Hub](../frontend/runtime/README.md)
- [Frontend Contracts Docs Hub](../frontend/contracts/README.md)
- [Frontend Sidecar Docs Hub](../frontend/sidecar/README.md)
- [Frontend Preload Docs Hub](../frontend/preload/README.md)
- [Frontend Landing Page Runtime + Content Reference](../frontend/landing/landing_page_runtime_and_content_reference.md)
- [Frontend IPC/Event Contracts](../frontend/contracts/ipc_channels_and_event_contracts.md)
- [Frontend IPC Channel Handler Reference](../frontend/contracts/ipc_channel_and_handler_reference.md)
- [Frontend Schema Generation + Event Guard Reference](../frontend/contracts/schema_generation_and_event_guard_reference.md)
- [Frontend Memory IPC + RPC Mapping Reference](../frontend/contracts/memory_ipc_and_rpc_mapping_reference.md)
- [Frontend Backend Event Consumer Matrix](../frontend/contracts/backend_event_consumer_matrix_reference.md)
- [Frontend Overlay + Wakeword Control Channel Reference](../frontend/contracts/overlay_and_wakeword_control_channel_reference.md)
- [Frontend Dashboard Memory Management + Resume Reference](../frontend/renderer/dashboard_memory_management_and_resume_reference.md)
- [Frontend Chat Stream + Tool Execution Reference](../frontend/renderer/chat_stream_and_tool_execution_reference.md)
- [Frontend Transcript Session + Rehydrate Reference](../frontend/renderer/transcript_session_and_rehydrate_reference.md)
- [Frontend Voice Capture + Wakeword Controller Reference](../frontend/renderer/voice_capture_and_wakeword_controller_reference.md)
- [Frontend Runtime Paths and Endpoints](../frontend/main/runtime_paths_and_endpoints.md)
- [Frontend Context Label Overlay + Active-Window Runtime Reference](../frontend/main/context_label_overlay_and_active_window_runtime_reference.md)
- [Frontend Query Payload + Relay Reference](../frontend/main/query_payload_and_relay_reference.md)
- [Frontend WebSocket Handshake + Settings Sync Reference](../frontend/main/websocket_handshake_and_settings_sync_reference.md)
- [Frontend Local Backend Bridge Handler + Window Guard Reference](../frontend/main/local_backend_bridge_handler_and_window_guard_reference.md)
- [Frontend Preload Channel Allowlist + Renderer Bridge Reference](../frontend/preload/preload_channel_allowlist_and_renderer_bridge_reference.md)
- [Frontend Stream State Machine](../frontend/runtime/stream_event_state_machine.md)
- [Frontend Config Sync + Settings Lifecycle Reference](../frontend/runtime/config_sync_and_settings_lifecycle_reference.md)
- [Frontend Audio Chunk Playback + Stop Semantics Reference](../frontend/runtime/audio_chunk_playback_and_stop_semantics_reference.md)
- [Frontend Sidecar Browser Stack](../frontend/sidecar/browser_automation_stack.md)
- [Frontend Sidecar Browser Action Compatibility + Runtime Reference](../frontend/sidecar/browser_action_compatibility_and_runtime_reference.md)
- [Frontend Sidecar JSON-RPC Reference](../frontend/sidecar/local_backend_jsonrpc_reference.md)
- [Frontend Sidecar Process Lifecycle Reference](../frontend/sidecar/local_backend_process_lifecycle_reference.md)
- [Frontend Wakeword Bridge + Audio Framing Reference](../frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md)
- [API Reference](../reference/api_reference.md)

## Development and Operations

- [Developer Guide](../development/developer_guide.md)
- [Environment Setup](../development/environment_setup.md)
- [Testing Guide](../development/testing.md)
- [Configuration](../operations/configuration.md)
- [Deployment](../operations/deployment.md)
- [Release Guide](../operations/release.md)
- [Security](../operations/security.md)
- [Performance](../operations/performance.md)

## Planning

- [Planning Hub](../planning/README.md)
- [Future Product Plan](../planning/future_plan.md)
- [Plan Matrix](../planning/plan_matrix.md)
- [Security and Compliance (Planned)](../planning/security_and_compliance.md)

## Documentation Design Notes

- [OpenClaw Docs Structure Reference](../reference/openclaw_docs_structure_reference.md)
