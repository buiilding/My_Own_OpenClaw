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
- [**Backend Container DI Lifecycle**](backend/bootstrap/container_di_and_init_lifecycle_reference.md) - Container composition, startup phase sequencing, lazy runtime binders, and config-update propagation
- [**Backend Config Runtime Policy**](backend/config/config_fields_and_runtime_policy.md) - Exact config fields, runtime normalization, and frontend patch boundaries
- [**Frontend Stream State Machine**](frontend/runtime/stream_event_state_machine.md) - Event-to-phase transitions and per-turn stream tracking behavior
- [**Frontend Chat Stream + Tool Runtime**](frontend/renderer/chat_stream_and_tool_execution_reference.md) - Provider ownership, query-send flow, backend event routing, stale-turn cancellation, and tool-result relay semantics
- [**Frontend Transcript Session + Rehydrate Runtime**](frontend/renderer/transcript_session_and_rehydrate_reference.md) - Session identity persistence, queued transcript storage contract, main/sidecar transcript RPC mapping, and episodic-memory resume-to-chat rehydrate flow
- [**Frontend Dashboard Memory Management + Resume Runtime**](frontend/renderer/dashboard_memory_management_and_resume_reference.md) - Dashboard section routing, episodic/semantic memory list-delete flows, context-menu hotkeys, and resumable conversation handoff back into chat
- [**Frontend Runtime Paths and Endpoints**](frontend/main/runtime_paths_and_endpoints.md) - Backend ws/http endpoint derivation, packaged Python path lookup, and frontend config persistence path
- [**Frontend Query Payload Relay**](frontend/main/query_payload_and_relay_reference.md) - Main-process query enrichment pipeline, initial settings ACK gate, local-user-message synthesis, and backend relay failure semantics
- [**Frontend WS Handshake + Settings Sync**](frontend/main/websocket_handshake_and_settings_sync_reference.md) - Main-process websocket handshake lifecycle, renderer fan-out context tracking, settings ACK gate internals, and query send-failure synthesis
- [**Frontend Local Backend Bridge Handler + Window Guard**](frontend/main/local_backend_bridge_handler_and_window_guard_reference.md) - Main-process sidecar request correlation, mapped memory RPC handler registration, Linux screenshot window-hide guard, and stderr/error normalization behavior
- [**Frontend Preload Channel Allowlist + Renderer Bridge**](frontend/preload/preload_channel_allowlist_and_renderer_bridge_reference.md) - `window.ipc` exposure policy, channel allowlist enforcement semantics, and preload/renderer/main ownership alignment
- [**Frontend Config Sync Lifecycle**](frontend/runtime/config_sync_and_settings_lifecycle_reference.md) - AppConfig/AppStatus provider ownership, local+disk persistence layering, and main-process `update-settings` ACK gating
- [**Frontend Audio Chunk Playback Runtime**](frontend/runtime/audio_chunk_playback_and_stop_semantics_reference.md) - Backend `audio-chunk` relay path, renderer playback queue/decoding behavior, and stop/new-query audio reset semantics
- [**Frontend IPC Channel Reference**](frontend/contracts/ipc_channel_and_handler_reference.md) - Exact send/invoke/on channel ownership and handler map
- [**Frontend Schema Generation + Event Guard Runtime**](frontend/contracts/schema_generation_and_event_guard_reference.md) - Generated schema boundary vs live runtime contracts across preload allowlists, `backendEvents.ts` type guards, and main-process payload normalization
- [**Frontend Memory IPC + RPC Mapping Runtime**](frontend/contracts/memory_ipc_and_rpc_mapping_reference.md) - Exact renderer `invoke` memory payload keys, main-process mapper conversions, sidecar JSON-RPC method contracts, and transcript/semantic memory operation semantics
- [**Frontend Backend Event Consumer Matrix**](frontend/contracts/backend_event_consumer_matrix_reference.md) - Which renderer modules consume each `from-backend` event type (typed stream, tool runner, config/save status, audio chunks) and drift hotspots
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
- [**Backend Tool Security Policy + Executor**](backend/tools/tool_security_policy_and_executor_reference.md) - Active vs planned tool-security boundary: ToolPolicy filtering, fail-closed permission checks, audit-log hardening, and sandbox executor registry behavior
- [**Backend Tool Result Ingress Reference**](backend/tools/tool_result_ingress_and_storage_reference.md) - End-to-end `tool-result`/`tool-bundle-result` flow across API handler, session routing, storage, and futures
- [**Backend Query Execution Pipeline**](backend/runtime/query_execution_and_stream_pipeline_reference.md) - Query handler to stream pipeline internals, completion backfill rules, and cancellation/task-tracking behavior
- [**Backend Token Count Event + Usage Diagnostics**](backend/runtime/token_count_event_and_usage_diagnostics_reference.md) - Token-count event lifecycle from LLM stream processor through websocket formatter, provider usage-precedence rules, and fallback/cache semantics
- [**Backend Non-Query Handler Flows**](backend/api/non_query_handler_and_control_flow_reference.md) - Settings/model handlers, stop-query cancellation semantics, wakeword activation responses, and transcript rehydrate normalization path
- [**Backend WebSocket Connection + Task Lifecycle**](backend/api/websocket_connection_and_task_lifecycle_reference.md) - `/ws` handshake contract, receive-loop task scheduling/limits, SafeWebSocket serialization, stop-query cancellation tracking, and disconnect cleanup guarantees
- [**Backend App Assembly + Container Dependency**](backend/api/app_assembly_and_container_dependency_reference.md) - FastAPI creation/route registration order, default CORS, lifespan container set-clear sequence, and HTTP/WS dependency failure contracts
- [**Backend Memory Route Validation + Fallback**](backend/api/memory_route_validation_and_fallback_reference.md) - Exact `/api/embeddings` and `/api/semantic` request constraints, session/global config resolution, parser/fallback logic, and sanitized health/error semantics
- [**Backend Handler Registry + Error Envelope Runtime**](backend/api/handler_registry_and_error_envelope_reference.md) - Canonical incoming route-table validation, fail-closed middleware/typed handler dispatch, and sanitized websocket error envelope guarantees
- [**Backend Provider Factory Runtime**](backend/llm/provider_factory_and_runtime_selection_reference.md) - Provider-factory cache keys, provider availability gates, client normalization, and model-service catalog/discovery rules
- [**Backend Parser Trust Boundary + Native Tool-Call Path**](backend/llm/parser_trust_boundary_and_native_tool_call_reference.md) - Current live native tool-call ingestion path, parser trust-boundary modules, extraction/validation limits, and violation telemetry semantics
- [**Backend Artifact + Screenshot Flow**](backend/services/artifact_screenshot_and_system_state_flow_reference.md) - Artifact upload/load rules and screenshot/system-state propagation across query, tool-result, OCR refresh, and rehydrate flows
- [**Backend Embedding + Semantic Memory Runtime**](backend/services/embedding_and_semantic_memory_runtime_reference.md) - Embedder DI/startup lifecycle, `/api/embeddings` and `/api/semantic` contracts, parser fallback semantics, and sidecar consumption path impacts
- [**Backend TTS + Wakeword Audio Runtime**](backend/services/tts_and_wakeword_audio_runtime_reference.md) - Query-time speech pipeline and wakeword greeting flow: runtime config gates, TTS filtering/queueing internals, chunk streaming, and cleanup semantics
- [**Backend OCR + Vision Coordinate Runtime**](backend/services/ocr_and_vision_coordinate_runtime_reference.md) - OCR/vision startup gating, screenshot-triggered OCR lifecycle, coordinate resolver behavior, and model/provider fallback paths for `mouse_control`
- [**Backend Tool Preparation + Coordinate Resolution**](backend/tools/tool_preparation_and_coordinate_resolution_reference.md) - Pre-dispatch tool resolution internals: execution refs, OCR/prediction coordinate flow, normalization metadata contract, synthetic failure paths, and stale-screen execution guard
- [**Browser Control**](browser/browser_control.md) - Browser automation architecture and tool behavior
- [**Sidecar Browser Automation Stack**](frontend/sidecar/browser_automation_stack.md) - Renderer->main->sidecar browser runtime and CDP orchestration details
- [**Sidecar Browser Action Compatibility + Runtime**](frontend/sidecar/browser_action_compatibility_and_runtime_reference.md) - OpenClaw-compatible browser action surface, adapter normalization rules, native runtime handler mapping, and timeout/error-code behavior
- [**Sidecar JSON-RPC Reference**](frontend/sidecar/local_backend_jsonrpc_reference.md) - Main-process bridge method map and local backend JSON-RPC contract details
- [**Sidecar Process Lifecycle**](frontend/sidecar/local_backend_process_lifecycle_reference.md) - Python sidecar spawn env/readiness probe loop, request correlation/timeouts, and restart/failure recovery behavior
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
