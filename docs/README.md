---
summary: "Desktop Assistant Documentation"
read_when:
  - When browsing the repo entrypoint.
---

# Desktop Assistant Documentation

Welcome to the comprehensive documentation for the Desktop Assistant project. This documentation covers all aspects of the system, from high-level architecture to detailed implementation guides.

## 📚 Documentation Index

### Documentation Hubs
- [**Documentation Hub**](getting-started/docs_hub.md) - Domain-based navigation for architecture, backend, frontend, and operations
- [**OpenClaw Docs Structure Reference**](reference/openclaw_docs_structure_reference.md) - Structure benchmark and WindieOS mapping
- [**Backend Bootstrap/API/Contracts Hubs**](backend/README.md) - Subfolder-level backend navigation mirroring OpenClaw-style layered docs
- [**Frontend Main/Renderer/Contracts/Sidecar Hubs**](frontend/README.md) - Subfolder-level frontend navigation for process/runtime boundaries
- [**Backend Config/LLM/Services Hubs**](backend/README.md) - Additional backend sub-hub navigation for config policy, model stack, and runtime services
- [**Backend LLM Provider Hub**](backend/llm/providers/README.md) - Base provider contract and provider-specific runtime docs for cloud/local integrations

### Getting Started
- [**Product Overview**](getting-started/product_overview.md) - Non-technical summary of current capabilities and future direction
- [**Overview**](getting-started/overview.md) - Project overview, vision, and key capabilities
- [**Quick Start Guide**](getting-started/quick_start.md) - Get up and running quickly
- [**Installation Guide**](getting-started/installation.md) - Detailed installation instructions

### Architecture & Design
- [**Frontend Functionality Map**](frontend/README.md) - Detailed module-level renderer, electron-main, and sidecar runtime maps
- [**Frontend Landing Runtime + Content Reference**](frontend/landing/landing_page_runtime_and_content_reference.md) - Standalone landing entrypoint wiring, section/anchor contracts, static content sources, and CSS token/animation behavior
- [**Backend Functionality Map**](backend/README.md) - Detailed module-level backend runtime and API maps
- [**Backend Simulation Runtime Reference**](backend/simulation/simulation_backend_and_mock_llm_runtime_reference.md) - Simulation entrypoints, DI LLM-factory override lifecycle, native tool-call adapter behavior, and deterministic mock-sequence invariants
- [**Backend SDK Tool Context + Schema Contract**](backend/sdk/tool_context_and_schema_contract_reference.md) - SDK `Tool` base contract, schema normalization/caching behavior, ToolContext shape, and ContextFactory injection semantics
- [**Backend SDK Sub-Agent Helper Runtime**](backend/sdk/subagent_session_helper_runtime_reference.md) - Restricted tool-registry behavior, child-session creation helpers, model override semantics, and response extraction fallback rules
- [**Backend Event Bus + Cache Infrastructure**](backend/core/event_bus_and_cache_infrastructure_reference.md) - Core event dispatch internals (weakref handlers, MRO cache, error recovery) and cache semantics (TTL/LRU/negative caching/stampede guards)
- [**Backend Trust-Boundary Metrics + Enforcement**](backend/core/observability/trust_boundary_metrics_and_enforcement_reference.md) - Per-boundary violation metrics model, DI lifecycle wiring, exception metadata conventions, and parser/prompt trust-boundary observability flow
- [**Backend Input Validation + Frontend Patch Guard**](backend/core/validation/input_validation_and_frontend_patch_guard_reference.md) - Shared query/user-id/message validation helpers, frontend-owned settings patch allowlist, and API error-sanitization boundary semantics
- [**Backend Container DI Lifecycle**](backend/bootstrap/container_di_and_init_lifecycle_reference.md) - Container composition, startup phase sequencing, lazy runtime binders, and config-update propagation
- [**Backend Config Runtime Policy**](backend/config/config_fields_and_runtime_policy.md) - Exact config fields, runtime normalization, and frontend patch boundaries
- [**Frontend Stream State Machine**](frontend/runtime/stream_event_state_machine.md) - Event-to-phase transitions and per-turn stream tracking behavior
- [**Frontend Chat Stream + Tool Runtime**](frontend/renderer/chat_stream_and_tool_execution_reference.md) - Provider ownership, query-send flow, backend event routing, stale-turn cancellation, and tool-result relay semantics
- [**Frontend Renderer Overlay Hub**](frontend/renderer/overlays/README.md) - Chatbox input-pill and response overlay renderer internals
- [**Frontend Renderer Provider Hub**](frontend/renderer/providers/README.md) - Root app composition, view routing, and provider coordination internals
- [**Frontend Renderer Transcript Hub**](frontend/renderer/transcript/README.md) - TranscriptWriter queue/flush internals, session identity persistence rules, and session-event contracts
- [**Frontend Entrypoint View Routing + Provider Stack**](frontend/renderer/providers/entrypoint_view_routing_and_provider_stack_reference.md) - `view`-based root selection and per-surface `ChatProvider` capability flags
- [**Frontend App Provider Coordinator + Save-Status Runtime**](frontend/renderer/providers/app_provider_coordinator_and_save_status_runtime_reference.md) - `AppConfig/AppStatus` bridge callback, shift-tab interaction-mode toggle, and config persistence guardrails
- [**Frontend Chatbox Overlay Input + Drag Runtime**](frontend/renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md) - Overlay click-through toggles, drag IPC flow, focus contract, and size-report behavior
- [**Frontend Response Overlay + Tool Ghost Runtime**](frontend/renderer/overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md) - Response visibility state machine, thinking stream rendering, closeability rules, and coordinate-based tool-ghost preview
- [**Frontend Renderer Infrastructure Hub**](frontend/renderer/infrastructure/README.md) - Focused runtime docs for tool execution service orchestration and backend-bound payload normalization
- [**Frontend Renderer Infrastructure Audio Hub**](frontend/renderer/infrastructure/audio/README.md) - PlayerService queue lifecycle, stale-callback generation guards, and stop/cleanup boundaries
- [**Frontend Tool Execution Service + Hook Runtime**](frontend/renderer/infrastructure/tool_execution_service_and_hook_runtime_reference.md) - `useToolRunner` turn/correlation guards, service callback ordering, bundle status semantics, and backend envelope shapes
- [**Frontend Capture + Artifact Payload Normalization**](frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md) - Screenshot/system-state capture paths, artifact upload URL policy, and `tool-result` payload field filtering/internals
- [**Frontend PlayerService Queue + Error-Recovery Runtime**](frontend/renderer/infrastructure/audio/player_service_queue_generation_and_error_recovery_reference.md) - PCM decode pipeline, sequential playback contract, playback-generation stale-callback isolation, and error-tolerant stop/cleanup behavior
- [**Frontend Transcript Session + Rehydrate Runtime**](frontend/renderer/transcript_session_and_rehydrate_reference.md) - Session identity persistence, queued transcript storage contract, main/sidecar transcript RPC mapping, and episodic-memory resume-to-chat rehydrate flow
- [**Frontend Transcript Writer Queue + Session Event Runtime**](frontend/renderer/transcript/transcript_writer_queue_flush_and_session_event_reference.md) - Queue category flush order, retry/requeue behavior, `transcript-session-update` emission guards, and test-backed session-state invariants
- [**Frontend Dashboard Memory Management + Resume Runtime**](frontend/renderer/dashboard_memory_management_and_resume_reference.md) - Dashboard section routing, episodic/semantic memory list-delete flows, context-menu hotkeys, and resumable conversation handoff back into chat
- [**Frontend Runtime Paths and Endpoints**](frontend/main/runtime_paths_and_endpoints.md) - Backend ws/http endpoint derivation, packaged Python path lookup, and frontend config persistence path
- [**Frontend Query Payload Relay**](frontend/main/query_payload_and_relay_reference.md) - Main-process query enrichment pipeline, initial settings ACK gate, local-user-message synthesis, and backend relay failure semantics
- [**Frontend Context Label Overlay + Active-Window Runtime**](frontend/main/context_label_overlay_and_active_window_runtime_reference.md) - Dedicated `chatbox-context-label` window lifecycle, visibility gates, active-window polling pipeline, and label normalization behavior
- [**Frontend WS Handshake + Settings Sync**](frontend/main/websocket_handshake_and_settings_sync_reference.md) - Main-process websocket handshake lifecycle, renderer fan-out context tracking, settings ACK gate internals, and query send-failure synthesis
- [**Frontend Local Backend Bridge Handler + Window Guard**](frontend/main/local_backend_bridge_handler_and_window_guard_reference.md) - Main-process sidecar request correlation, mapped memory RPC handler registration, Linux screenshot window-hide guard, and stderr/error normalization behavior
- [**Frontend Main Overlay Focus Hub**](frontend/main/overlays/README.md) - External focus handoff and Linux screenshot hide-restore deep dives
- [**Frontend External Focus Snapshot + Query-Capture Prep**](frontend/main/overlays/external_focus_snapshot_restore_and_query_capture_reference.md) - Windows-focused external window snapshot/restore and pre-capture blur/settle semantics
- [**Frontend Linux Screenshot Hide/Restore Guard**](frontend/main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md) - Linux-only window hide/wait/restore behavior for clean screenshot tool execution
- [**Frontend Preload Channel Allowlist + Renderer Bridge**](frontend/preload/preload_channel_allowlist_and_renderer_bridge_reference.md) - `window.ipc` exposure policy, channel allowlist enforcement semantics, and preload/renderer/main ownership alignment
- [**Frontend Config Sync Lifecycle**](frontend/runtime/config_sync_and_settings_lifecycle_reference.md) - AppConfig/AppStatus provider ownership, local+disk persistence layering, and main-process `update-settings` ACK gating
- [**Frontend Audio Chunk Playback Runtime**](frontend/runtime/audio_chunk_playback_and_stop_semantics_reference.md) - Backend `audio-chunk` relay path, renderer playback queue/decoding behavior, and stop/new-query audio reset semantics
- [**Frontend IPC Channel Reference**](frontend/contracts/ipc_channel_and_handler_reference.md) - Exact send/invoke/on channel ownership and handler map
- [**Frontend Schema Generation + Event Guard Runtime**](frontend/contracts/schema_generation_and_event_guard_reference.md) - Generated schema boundary vs live runtime contracts across preload allowlists, `backendEvents.ts` type guards, and main-process payload normalization
- [**Frontend Memory IPC + RPC Mapping Runtime**](frontend/contracts/memory_ipc_and_rpc_mapping_reference.md) - Exact renderer `invoke` memory payload keys, main-process mapper conversions, sidecar JSON-RPC method contracts, and transcript/semantic memory operation semantics
- [**Frontend Backend Event Consumer Matrix**](frontend/contracts/backend_event_consumer_matrix_reference.md) - Which renderer modules consume each `from-backend` event type (typed stream, tool runner, config/save status, audio chunks) and drift hotspots
- [**Frontend Contracts Events Hub**](frontend/contracts/events/README.md) - Sub-hub for `from-backend` event ingress typing boundaries and synthetic query lifecycle event contracts
- [**Frontend Contracts IPC Hub**](frontend/contracts/ipc/README.md) - Sub-hub for preload/channel parity and main-process IPC ownership by module
- [**Frontend Preload Allowlist + Channel Parity**](frontend/contracts/ipc/preload_allowlist_and_channel_constant_parity_reference.md) - Exact channel-family parity across preload allowlists, typed renderer constants, and runtime invalid-channel behavior
- [**Frontend Main IPC Handler Ownership + RPC Mapper**](frontend/contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md) - Channel-to-owner map across `ipc.cjs/index.cjs/local_backend_bridge.cjs/wakeword_bridge.cjs`, including mapped JSON-RPC param transforms
- [**Frontend From-Backend Ingress + Audio Side-Channel**](frontend/contracts/events/from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md) - Main-process rebroadcast path, typed event-guard limits, and `audio-chunk` parser boundary behavior
- [**Frontend Local User Message + Query Send-Failure Synthesis**](frontend/contracts/events/local_user_message_and_query_send_failure_synthesis_reference.md) - Main-process `local-user-message` optimistic event contract and transport-failure `error` synthesis semantics
- [**Frontend Settings + Models ACK Event Routing**](frontend/contracts/events/settings_and_model_ack_event_routing_reference.md) - Provider-level handling for non-typed `models-listed`/`settings-updated` events and settings-failure status/error suppression coupling
- [**Frontend Overlay + Wakeword Control Channels**](frontend/contracts/overlay_and_wakeword_control_channel_reference.md) - Main/renderer contracts for `wakeword-toggle`, `response-overlay-phase`, `response-overlay-visibility`, and `chatbox-focus` behavior
- [**Frontend Voice Capture + Wakeword Controller**](frontend/renderer/voice_capture_and_wakeword_controller_reference.md) - Renderer voice transcription and wakeword lifecycle: config gates, mic capture/encoding paths, IPC event flow, and retrigger guardrails
- [**System Architecture**](architecture/architecture.md) - High-level system design and components
- [**Backend Architecture**](architecture/backend_architecture.md) - Backend system design and patterns
- [**Frontend Architecture**](architecture/frontend_architecture.md) - Frontend system design and patterns
- [**Communication Flow**](architecture/communication_flow.md) - How frontend and backend communicate

### Core Systems
- [**Agent System**](architecture/agent_system.md) - Agent orchestrator and execution flow
- [**Tool System**](architecture/tool_system.md) - Tool execution architecture and development
- [**Backend Tools Docs Hub**](backend/tools/README.md) - Backend schema bridge, policy filtering, and wait/ingress runtime docs for frontend-executed tools
- [**Backend Tools Security Docs Hub**](backend/tools/security/README.md) - Core security policy primitives, audit sanitization controls, and tool-executor registry isolation contracts
- [**Backend Tool Security Policy + Executor**](backend/tools/tool_security_policy_and_executor_reference.md) - Active vs planned tool-security boundary: ToolPolicy filtering, fail-closed permission checks, audit-log hardening, and sandbox executor registry behavior
- [**Backend Policy Permissions + Audit Sanitization + Executor Registry**](backend/tools/security/policy_permissions_audit_and_executor_registry_reference.md) - `core/security` fail-closed permission rules, path/resource checks, bounded audit-log sanitization semantics, and runtime executor swap behavior
- [**Backend Tool Result Ingress Reference**](backend/tools/tool_result_ingress_and_storage_reference.md) - End-to-end `tool-result`/`tool-bundle-result` flow across API handler, session routing, storage, and futures
- [**Backend Query Execution Pipeline**](backend/runtime/query_execution_and_stream_pipeline_reference.md) - Query handler to stream pipeline internals, completion backfill rules, and cancellation/task-tracking behavior
- [**Backend API Processing Hub**](backend/api/processing/README.md) - Formatter dispatch, stream pipeline ordering, completion fallback resolution, and TTS concurrency docs
- [**Backend Formatter Dispatch + Schema Alignment**](backend/api/processing/formatter_dispatch_and_schema_alignment_reference.md) - Canonical formatter registry wiring, per-event required-field behavior, and outgoing schema drift guards
- [**Backend Stream Pipeline + Completion + TTS Concurrency**](backend/api/processing/stream_pipeline_completion_and_tts_concurrency_reference.md) - Per-event send/format/TTS ordering, completion-text precedence/backfill, and pending-audio race barriers
- [**Backend Query Execution Runtime-State + Completion Resolver**](backend/api/processing/query_execution_runtime_state_and_completion_resolver_reference.md) - Query-time system-state merge rules, screenshot artifact fallback, event extraction compatibility, and deterministic completion-text fallback semantics
- [**Backend API Processing TTS Hub**](backend/api/processing/tts/README.md) - API-layer TTS manager/session lifecycle and suppression-state docs
- [**Backend API Processing Formatters Hub**](backend/api/processing/formatters/README.md) - Base formatter utility contracts and formatter-specific validation/test matrices
- [**Backend Base Formatter Guard Utilities + Skip Semantics**](backend/api/processing/formatters/base_formatter_guard_utilities_and_skip_semantics_reference.md) - Shared event dict conversion, required-field logging guards, and per-formatter skip-vs-raise behavior
- [**Backend Formatter Validation + Contract-Test Matrix**](backend/api/processing/formatters/formatter_validation_and_contract_test_matrix_reference.md) - Formatter behavior coverage tied to schema parsing and registry drift tests
- [**Backend Streaming Events Contracts Hub**](backend/contracts/events/README.md) - Sub-hub for stream event dataclass semantics and event-type alignment across formatters/schemas
- [**Backend Routing Contracts Hub**](backend/contracts/routing/README.md) - Sub-hub for incoming message route-table parity and handler-binding invariants
- [**Backend Message Types Contracts Hub**](backend/contracts/message_types/README.md) - Sub-hub for canonical message-type constants and schema-subset/ACK-control boundaries
- [**Backend Incoming Route Table + Handler-Binding Reference**](backend/contracts/routing/incoming_route_table_schema_parity_and_handler_binding_reference.md) - Canonical route-table/schema-literal validation rules and DI handler-key binding guarantees
- [**Backend Streaming Event -> Formatter + Outgoing Alignment**](backend/contracts/events/streaming_event_to_formatter_and_outgoing_contract_alignment_reference.md) - Canonical matrix from `StreamingEventType` literals to formatter dispatch and outgoing websocket schema types
- [**Backend Message-Type Constants + Schema-Subset Reference**](backend/contracts/message_types/message_type_constants_schema_subset_and_handler_ack_reference.md) - Exact incoming/outgoing constants, schema-validated outgoing subset, and settings/model ACK-type semantics
- [**Backend TTS Manager Audio Stream + Cleanup**](backend/api/processing/tts/tts_manager_audio_stream_and_cleanup_reference.md) - Speech gate, audio-chunk relay loop, disconnect behavior, and bounded teardown/cancellation semantics
- [**Backend TTS Processor Suppression State Machine**](backend/api/processing/tts/tts_processor_suppression_state_machine_reference.md) - Chunk classification states, code/json suppression exits, and mid-chunk marker handling behavior
- [**Backend Session Runtime + Config Rewire**](backend/agent/session_runtime_and_config_rewire_reference.md) - SessionManager lock/task semantics, AgentSession runtime containers, conversation-thread switching, and full LLM/prompt dependency rebind behavior on settings updates
- [**Backend Interaction Loop + Tool-Turn Orchestration**](backend/agent/interaction_loop_and_tool_turn_orchestration_reference.md) - Executor component composition, loop iteration policy, tool send/wait/process sequencing, empty-final-response fallback rules, and cleanup invariants
- [**Backend Conversation History + Prompt Context Runtime**](backend/runtime/conversation_history_and_prompt_context_runtime_reference.md) - Iteration-1 prompt metadata generation, cached later-turn history retrieval, tool-call/tool-output linkage, rehydrate normalization, and token-cache semantics
- [**Backend Token Count Event + Usage Diagnostics**](backend/runtime/token_count_event_and_usage_diagnostics_reference.md) - Token-count event lifecycle from LLM stream processor through websocket formatter, provider usage-precedence rules, and fallback/cache semantics
- [**Backend Token Service Message Normalization + Fallback**](backend/services/token/token_service_message_normalization_and_fallback_reference.md) - LiteLLM token-counter message canonicalization rules, assistant tool-call normalization, text-only fallback estimate semantics, and singleton/thread-safety contract
- [**Backend Non-Query Handler Flows**](backend/api/non_query_handler_and_control_flow_reference.md) - Settings/model handlers, stop-query cancellation semantics, wakeword activation responses, and transcript rehydrate normalization path
- [**Backend WebSocket Connection + Task Lifecycle**](backend/api/websocket_connection_and_task_lifecycle_reference.md) - `/ws` handshake contract, receive-loop task scheduling/limits, SafeWebSocket serialization, stop-query cancellation tracking, and disconnect cleanup guarantees
- [**Backend App Assembly + Container Dependency**](backend/api/app_assembly_and_container_dependency_reference.md) - FastAPI creation/route registration order, default CORS, lifespan container set-clear sequence, and HTTP/WS dependency failure contracts
- [**Backend Memory Route Validation + Fallback**](backend/api/memory_route_validation_and_fallback_reference.md) - Exact `/api/embeddings` and `/api/semantic` request constraints, session/global config resolution, parser/fallback logic, and sanitized health/error semantics
- [**Backend Handler Registry + Error Envelope Runtime**](backend/api/handler_registry_and_error_envelope_reference.md) - Canonical incoming route-table validation, fail-closed middleware/typed handler dispatch, and sanitized websocket error envelope guarantees
- [**Backend Safe WebSocket + Transport Envelope Runtime**](backend/api/transport/safe_websocket_and_transport_envelope_reference.md) - `SafeWebSocket` bounded sender-loop/backpressure semantics, protocol-wrapped send path, and canonical outbound context-field attachment behavior
- [**Backend Provider Factory Runtime**](backend/llm/provider_factory_and_runtime_selection_reference.md) - Provider-factory cache keys, provider availability gates, client normalization, and model-service catalog/discovery rules
- [**Backend LLM Base Request + Stream Normalization**](backend/llm/providers/base_request_stream_and_normalization_reference.md) - `LLMProvider` request validation, message/tool schema normalization, stream delta parsing, and usage/cache diagnostics extraction
- [**Backend LLM Provider-Specific Overrides**](backend/llm/providers/provider_specific_overrides_and_local_runtime_reference.md) - Anthropic/Gemini thinking flags, Kimi stream tool-call assembly, local provider model listing, and provider alias/URL normalization
- [**Backend LLM Prompt Constructor + Transparency Metadata**](backend/llm/prompts/prompt_constructor_and_transparency_metadata_reference.md) - Prompt build tuple contract, tool-policy schema filtering, XML context extraction, and first-turn metadata event emission
- [**Backend LLM Prompt Manager Lifecycle**](backend/llm/prompts/prompt_manager_and_system_prompt_lifecycle_reference.md) - Startup prompt loading/failure semantics, prompt-history wiring, and sub-agent custom system-prompt override behavior
- [**Backend Parser Trust Boundary + Native Tool-Call Path**](backend/llm/parser_trust_boundary_and_native_tool_call_reference.md) - Current live native tool-call ingestion path, parser trust-boundary modules, extraction/validation limits, and violation telemetry semantics
- [**Backend Artifact + Screenshot Flow**](backend/services/artifact_screenshot_and_system_state_flow_reference.md) - Artifact upload/load rules and screenshot/system-state propagation across query, tool-result, OCR refresh, and rehydrate flows
- [**Backend Embedding + Semantic Memory Runtime**](backend/services/embedding_and_semantic_memory_runtime_reference.md) - Embedder DI/startup lifecycle, `/api/embeddings` and `/api/semantic` contracts, parser fallback semantics, and sidecar consumption path impacts
- [**Backend TTS + Wakeword Audio Runtime**](backend/services/tts_and_wakeword_audio_runtime_reference.md) - Query-time speech pipeline and wakeword greeting flow: runtime config gates, TTS filtering/queueing internals, chunk streaming, and cleanup semantics
- [**Backend OCR + Vision Coordinate Runtime**](backend/services/ocr_and_vision_coordinate_runtime_reference.md) - OCR/vision startup gating, screenshot-triggered OCR lifecycle, coordinate resolver behavior, and model/provider fallback paths for `mouse_control`
- [**Backend Tool Preparation + Coordinate Resolution**](backend/tools/tool_preparation_and_coordinate_resolution_reference.md) - Pre-dispatch tool resolution internals: execution refs, OCR/prediction coordinate flow, normalization metadata contract, synthetic failure paths, and stale-screen execution guard
- [**Browser Control**](browser/browser_control.md) - Browser automation architecture and tool behavior
- [**Sidecar Browser Automation Stack**](frontend/sidecar/browser_automation_stack.md) - Renderer->main->sidecar browser runtime and CDP orchestration details
- [**Sidecar Browser Action Compatibility + Runtime**](frontend/sidecar/browser_action_compatibility_and_runtime_reference.md) - OpenClaw-compatible browser action surface, adapter normalization rules, native runtime handler mapping, and timeout/error-code behavior
- [**Sidecar System-State Collection + Platform Adapter Runtime**](frontend/sidecar/system_state/system_state_collection_and_platform_adapter_reference.md) - `get-system-state` field semantics, per-OS probes, fallback defaults, and renderer/main/sidecar integration contracts
- [**Sidecar Shell + Process Session Runtime**](frontend/sidecar/tools/shell_and_process_session_runtime_reference.md) - `run_shell_command`/`process` execution modes, output token truncation policy, PTY fallback behavior, background session registry TTL/caps, and action-level management semantics
- [**Sidecar Filesystem Read + Replace Runtime**](frontend/sidecar/tools/filesystem_read_replace_runtime_reference.md) - `read_file` pagination/truncation contracts, binary/encoding guards, and `replace` strict-vs-lenient/patch-chunk atomic edit semantics
- [**Sidecar JSON-RPC Reference**](frontend/sidecar/local_backend_jsonrpc_reference.md) - Main-process bridge method map and local backend JSON-RPC contract details
- [**Sidecar Process Lifecycle**](frontend/sidecar/local_backend_process_lifecycle_reference.md) - Python sidecar spawn env/readiness probe loop, request correlation/timeouts, and restart/failure recovery behavior
- [**Sidecar Summarizer Watermark + Conversation Batch Runtime**](frontend/sidecar/memory/summarizer_watermark_and_conversation_batch_reference.md) - Semantic summarizer run-loop gating, pending watermark counters, user/conversation batch selection, transcript filtering rules, and dedupe/hash semantics
- [**Sidecar Transcript Storage + Semantic Candidate Runtime**](frontend/sidecar/memory/transcript_storage_semantic_candidate_and_watermark_reference.md) - `store_transcript` role/message-type candidate gates, message-index ordering contract, and pending watermark increment semantics
- [**Wakeword Bridge + Audio Framing**](frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md) - Wakeword subprocess lifecycle, length-prefixed audio transport, enable/disable buffering policy, and detection event propagation
- [**Browser Control Runbook**](browser/browser_control_run.md) - Practical setup/testing flow for browser control
- [**Memory System**](architecture/memory_system.md) - Memory management and retrieval
- [**Python Sidecar**](architecture/python_sidecar.md) - Local tool execution + memory service
- [**LLM Integration**](architecture/llm_integration.md) - LLM providers and configuration
- [**Billing & Usage (Planned)**](planning/billing_and_usage.md) - Subscriptions, entitlements, and usage limits

### Development Guides
- [**Developer Guide**](development/developer_guide.md) - Comprehensive development guide
- Developer Guide includes local automation scripts (`node scripts/doc-lists.js`, `scripts/check`, `scripts/test`, `scripts/check-loc.py`) and frontend audit commands (`npm run lint:audit`, `npm run audit:jscpd`, `npm run audit:knip`).
- [**Dev Tool Selection**](development/dev_tool_selection.md) - Backend-only tool schema allow/denylist controls for development
- [**Tool Development Guide**](development/tool_development.md) - Creating custom tools
- [**API Reference**](reference/api_reference.md) - Complete API documentation
- [**Extension Points**](architecture/extension_points.md) - How to extend the system

### Configuration & Deployment
- [**Configuration Guide**](operations/configuration.md) - Configuration options and settings
- [**Deployment Guide**](operations/deployment.md) - Production deployment instructions
- [**Release Guide**](operations/release.md) - Repeatable release checklist and guardrails
- [**Future Product Plan (Draft)**](planning/future_plan.md) - Sequenced roadmap for packaging, hosted rollout, and major future features
- [**Environment Setup**](development/environment_setup.md) - Development environment configuration
- [**Security & Compliance (Planned)**](planning/security_and_compliance.md) - Security posture and compliance roadmap
- [**Plan Matrix (Draft)**](planning/plan_matrix.md) - Subscription tiers and limits

### User Guides
- [**User Guide**](getting-started/user_guide.md) - End-user documentation
- [**Troubleshooting**](getting-started/troubleshooting.md) - Common issues and solutions

### Additional Resources
- [**Testing Guide**](development/testing.md) - Testing strategies and practices
- [**Security Guide**](operations/security.md) - Security considerations and best practices
- [**Multi-User Runtime Hardening**](operations/multi_user_runtime_hardening.md) - Session identity, multi-device policy, and per-user model isolation guidance
- [**Performance Guide**](operations/performance.md) - Performance optimization strategies
- [**Planning Hub**](planning/README.md) - Single entrypoint for roadmap and future initiative plans
- [**Contributing Guide**](development/contributing.md) - How to contribute to the project

### Hosted Platform (Planned)
- [**Planning Hub**](planning/README.md) - Canonical list of hosted roadmap + initiative docs

## 🎯 Quick Navigation

### For Developers
Start with:
1. [Developer Guide](development/developer_guide.md) - Understand the codebase structure
2. [Architecture Overview](architecture/architecture.md) - Learn the system design
3. [Tool Development Guide](development/tool_development.md) - Create custom tools

### For System Administrators
Start with:
1. [Installation Guide](getting-started/installation.md) - Set up the system
2. [Configuration Guide](operations/configuration.md) - Configure the application
3. [Deployment Guide](operations/deployment.md) - Deploy to production

### For Users
Start with:
1. [User Guide](getting-started/user_guide.md) - Learn how to use the assistant
2. [Troubleshooting](getting-started/troubleshooting.md) - Solve common issues

## 📖 Documentation Structure

All documentation is organized in the `docs/` folder at the project root. Each document is self-contained but cross-references related topics.

### Document Conventions

- **Code blocks**: Include file paths and line numbers when referencing existing code
- **Diagrams**: ASCII art diagrams for architecture visualization
- **Examples**: Practical code examples for all major features
- **Warnings**: Important notes and gotchas highlighted

## 🔄 Keeping Documentation Updated

This documentation is maintained alongside the codebase. When making changes:

1. Update relevant documentation files
2. Add examples for new features
3. Update architecture diagrams if structure changes
4. Keep cross-references accurate

## 📝 Contributing to Documentation

See [Contributing Guide](development/contributing.md) for guidelines on improving documentation.

---

**Last Updated**: February 2026  
**Version**: 1.0.0

## Recent Updates

### Frontend Refactor (January 2026)
- **Feature-Based Architecture**: Reorganized into feature modules (chat, settings, voice)
- **Split Contexts**: AppConfigContext and AppStatusContext for better performance
- **Zustand Store**: Chat state managed via Zustand for efficient updates
- **Infrastructure Layer**: New service layer (ToolExecutionService, MessageFormatter, IpcBridge)
- **New Hooks**: useChatStream, useToolRunner, useChatMessageSender

### Backend Optimizations (January 2026)
- **Centralized Tool Result Storage**: ToolResultStorage class with TTL-based cleanup
- **Conversation History Optimization**: O(1) LLM format access via cached conversion
- **Shallow Copy Optimization**: PreparedToolCall uses shallow copy for better performance

### Productization Roadmap (February 2026)
- **Multi-Tenant Backend**: Auth, subscriptions, usage metering, and plan enforcement
- **Billing UX**: Plan selection, billing portal, and usage limits in the UI
- **Hosted Architecture**: API gateway, session routing, and scalable data plane
