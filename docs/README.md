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
- [**Frontend Inventory Docs Hub**](frontend/inventory/README.md) - Subfolder inventory hub for exhaustive frontend runtime coverage, matrix views, and file ownership indexes
- [**Frontend Inventory Domains Hub**](frontend/inventory/domains/README.md) - Domain ownership matrix + change-path playbooks for main/preload/renderer/sidecar/landing scope decisions
- [**Frontend Inventory Protocols Hub**](frontend/inventory/protocols/README.md) - IPC + local-backend JSON-RPC matrix for renderer/main/sidecar protocol boundaries and ownership
- [**Frontend Full Functionality Inventory Reference**](frontend/inventory/frontend_full_functionality_inventory_reference.md) - Exhaustive frontend feature inventory across main/preload/renderer/sidecar/landing ownership boundaries and runtime flows
- [**Frontend Functionality Capability Catalog Reference**](frontend/inventory/frontend_functionality_capability_catalog_reference.md) - Capability-first frontend map linking concrete runtime behaviors to ownership files across main/preload/renderer/sidecar/landing
- [**Frontend Capability to File Matrix Reference**](frontend/inventory/frontend_capability_to_file_matrix_reference.md) - Detailed frontend capability matrix with concrete ownership files across main/preload/renderer/sidecar/landing modules
- [**Frontend IPC + Sidecar Contract Touchpoints**](frontend/inventory/frontend_ipc_and_sidecar_contract_touchpoints_reference.md) - Frontend-owned boundary map for renderer/main IPC, sidecar JSON-RPC methods, and backend stream/tool payload integration points
- [**Frontend Landing Runtime + Content Reference**](frontend/landing/landing_page_runtime_and_content_reference.md) - Standalone landing entrypoint wiring, section/anchor contracts, static content sources, and CSS token/animation behavior
- [**Frontend Landing Section Content Contracts**](frontend/landing/sections/hero_how_available_and_roadmap_section_content_contract_reference.md) - Hero/How/Available/Roadmap source arrays, CTA anchor semantics, and status-label behavior for public capability messaging
- [**Backend Functionality Map**](backend/README.md) - Detailed module-level backend runtime and API maps
- [**Backend Inventory Docs Hub**](backend/inventory/README.md) - Subfolder inventory hub for exhaustive backend runtime coverage, flow matrices, and file ownership indexes
- [**Backend Inventory Domains Hub**](backend/inventory/domains/README.md) - Domain ownership matrix + change-path playbooks for API/agent/core/tools/llm/services scope decisions
- [**Backend Inventory Protocols Hub**](backend/inventory/protocols/README.md) - WebSocket handshake/incoming/outgoing/formatter matrix for backend protocol ownership and drift detection
- [**Backend Full Functionality Inventory Reference**](backend/inventory/backend_full_functionality_inventory_reference.md) - Exhaustive backend feature inventory by runtime domain, module ownership, and end-to-end query/tool path
- [**Backend Functionality Capability Catalog Reference**](backend/inventory/backend_functionality_capability_catalog_reference.md) - Capability-first backend map linking runtime behaviors to ownership files across API/session/loop/tool/LLM/service domains
- [**Backend Capability to File Matrix Reference**](backend/inventory/backend_capability_to_file_matrix_reference.md) - Detailed backend capability matrix with concrete ownership files for API/agent/tool/LLM/core/service responsibilities
- [**Backend Cross-Layer Contract Touchpoints**](backend/inventory/backend_cross_layer_contract_touchpoints_reference.md) - Backend-owned contract map for websocket schemas, formatter outputs, tool-result envelopes, and sidecar/browser parity seams
- [**Backend Source Maps Hub**](backend/source_maps/README.md) - Sub-hub for source-owned folder topology maps and package `__init__` export surfaces
- [**Backend Simulation Runtime Reference**](backend/simulation/simulation_backend_and_mock_llm_runtime_reference.md) - Simulation entrypoints, DI LLM-factory override lifecycle, native tool-call adapter behavior, and deterministic mock-sequence invariants
- [**Backend Simulation Entrypoint Launch Contracts**](backend/simulation/entrypoints/package_runner_and_module_alias_uvicorn_bootstrap_contract_reference.md) - `python -m` package runner vs module alias uvicorn bootstrap behavior (reload/access-log differences)
- [**Backend Simulation Coordinate Resolver Parity Contract**](backend/simulation/contracts/coordinate_resolver_reexport_and_production_parity_contract_reference.md) - Simulation shim that re-exports production coordinate resolver classes without behavior divergence
- [**Backend SDK Tool Context + Schema Contract**](backend/sdk/tool_context_and_schema_contract_reference.md) - SDK `Tool` base contract, schema normalization/caching behavior, ToolContext shape, and ContextFactory injection semantics
- [**Backend SDK Sub-Agent Helper Runtime**](backend/sdk/subagent_session_helper_runtime_reference.md) - Restricted tool-registry behavior, child-session creation helpers, model override semantics, and response extraction fallback rules
- [**Backend Event Bus + Cache Infrastructure**](backend/core/event_bus_and_cache_infrastructure_reference.md) - Core event dispatch internals (weakref handlers, MRO cache, error recovery) and cache semantics (TTL/LRU/negative caching/stampede guards)
- [**Backend Core Logging Profile Contracts**](backend/core/logging/log_profile_noise_filter_and_env_level_resolution_contract_reference.md) - Logging profile/env resolution, noisy-module suppression policy, and important-profile signal retention
- [**Backend Trust-Boundary Metrics + Enforcement**](backend/core/observability/trust_boundary_metrics_and_enforcement_reference.md) - Per-boundary violation metrics model, DI lifecycle wiring, exception metadata conventions, and parser/prompt trust-boundary observability flow
- [**Backend Input Validation + Frontend Patch Guard**](backend/core/validation/input_validation_and_frontend_patch_guard_reference.md) - Shared query/user-id/message validation helpers, frontend-owned settings patch allowlist, and API error-sanitization boundary semantics
- [**Backend Container DI Lifecycle**](backend/bootstrap/container_di_and_init_lifecycle_reference.md) - Container composition, startup phase sequencing, lazy runtime binders, and config-update propagation
- [**Backend Shared Entrypoint Logger + Uvicorn Runner**](backend/bootstrap/entrypoints/shared_entrypoint_logger_and_uvicorn_runner_contract_reference.md) - Shared startup logging bootstrap and uvicorn launch kwargs contract for production and simulation
- [**Backend Config Runtime Policy**](backend/config/config_fields_and_runtime_policy.md) - Exact config fields, runtime normalization, and frontend patch boundaries
- [**Backend API/Core Topology Source Map Runtime**](backend/source_maps/api_core_folder_topology_and_data_flow_source_map_reference.md) - Source-owned API/core folder maps and layer/data-flow parity expectations
- [**Backend Package `__init__` Export Surface Runtime**](backend/source_maps/backend_package_init_exports_and_public_import_surface_reference.md) - Compatibility contract for backend package-level re-export and `__all__` import surfaces
- [**Frontend Stream State Machine**](frontend/runtime/stream_event_state_machine.md) - Event-to-phase transitions and per-turn stream tracking behavior
- [**Frontend Chat Stream + Tool Runtime**](frontend/renderer/chat_stream_and_tool_execution_reference.md) - Provider ownership, query-send flow, backend event routing, stale-turn cancellation, and tool-result relay semantics
- [**Frontend Renderer Chat Hub**](frontend/renderer/chat/README.md) - Sub-hub for chat send-path policy, screenshot attachment flow, and store/session rotation contracts
- [**Frontend Message Send Surface Policy + Screenshot Capture**](frontend/renderer/chat/message_send_surface_policy_and_screenshot_capture_reference.md) - Main-window vs overlay send behavior, optimistic message update ordering, and screenshot upload fallback semantics
- [**Frontend Chat Store State + New Session Rotation**](frontend/renderer/chat/chat_store_state_and_new_session_rotation_reference.md) - Zustand no-op guards, stream-tracking reset behavior, and new-chat/resume conversation-ref synchronization
- [**Frontend Renderer Settings Hub**](frontend/renderer/settings/README.md) - Sub-hub for settings-section toggle/display-selection contracts and config update boundaries
- [**Frontend Settings Section Display Selection + Config Toggles**](frontend/renderer/settings/settings_section_display_selection_and_config_toggle_reference.md) - Wakeword/audio/screenshot toggle payload semantics, display fallback/persistence behavior, and provider update coupling
- [**Frontend Renderer Overlay Hub**](frontend/renderer/overlays/README.md) - Chatbox input-pill and response overlay renderer internals
- [**Frontend Renderer Provider Hub**](frontend/renderer/providers/README.md) - Root app composition, view routing, and provider coordination internals
- [**Frontend Renderer Error Boundary Contract**](frontend/renderer/providers/components/error_boundary_fallback_and_component_tree_crash_isolation_contract_reference.md) - Root-surface crash containment fallback UI and console logging semantics
- [**Frontend Renderer Transcript Hub**](frontend/renderer/transcript/README.md) - TranscriptWriter queue/flush internals, session identity persistence rules, and session-event contracts
- [**Frontend Transcript Type Contracts**](frontend/renderer/transcript/contracts/transcript_entry_and_pending_message_type_contract_reference.md) - Shared pending queue and persisted transcript entry field contracts
- [**Frontend Entrypoint View Routing + Provider Stack**](frontend/renderer/providers/entrypoint_view_routing_and_provider_stack_reference.md) - `view`-based root selection and per-surface `ChatProvider` capability flags
- [**Frontend App Provider Coordinator + Save-Status Runtime**](frontend/renderer/providers/app_provider_coordinator_and_save_status_runtime_reference.md) - `AppConfig/AppStatus` bridge callback, shift-tab interaction-mode toggle, and config persistence guardrails
- [**Frontend Chatbox Overlay Input + Drag Runtime**](frontend/renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md) - Overlay click-through toggles, drag IPC flow, focus contract, and size-report behavior
- [**Frontend Response Overlay + Tool Ghost Runtime**](frontend/renderer/overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md) - Response visibility state machine, thinking stream rendering, closeability rules, and coordinate-based tool-ghost preview
- [**Frontend Renderer Infrastructure Hub**](frontend/renderer/infrastructure/README.md) - Focused runtime docs for tool execution service orchestration and backend-bound payload normalization
- [**Frontend Renderer Infrastructure Audio Hub**](frontend/renderer/infrastructure/audio/README.md) - PlayerService queue lifecycle, stale-callback generation guards, and stop/cleanup boundaries
- [**Frontend Renderer Styles Hub**](frontend/renderer/styles/README.md) - Sub-hub for global theme tokens, accessibility utility classes, layout shell styles, and chat/voice visual contracts
- [**Frontend Tool Execution Service + Hook Runtime**](frontend/renderer/infrastructure/tool_execution_service_and_hook_runtime_reference.md) - `useToolRunner` turn/correlation guards, service callback ordering, bundle status semantics, and backend envelope shapes
- [**Frontend Capture + Artifact Payload Normalization**](frontend/renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md) - Screenshot/system-state capture paths, artifact upload URL policy, and `tool-result` payload field filtering/internals
- [**Frontend PlayerService Queue + Error-Recovery Runtime**](frontend/renderer/infrastructure/audio/player_service_queue_generation_and_error_recovery_reference.md) - PCM decode pipeline, sequential playback contract, playback-generation stale-callback isolation, and error-tolerant stop/cleanup behavior
- [**Frontend Global Theme + Main Layout Style Runtime**](frontend/renderer/styles/global_theme_accessibility_utility_and_main_layout_visual_contract_reference.md) - Root CSS token model, reduced-motion/global scrollbar/reset behavior, accessibility utility semantics, and shell/sidebar responsive layout contracts
- [**Frontend Chat/Thinking/Token Style Runtime**](frontend/renderer/styles/chat_interface_thinking_stream_and_token_count_style_contract_reference.md) - Chat tool/transparency card styling, thinking overflow gradient state behavior, and token badge variant contracts
- [**Frontend Voice Status Style Runtime**](frontend/renderer/styles/voice_status_visual_state_style_contract_reference.md) - Voice status base/error/active banner style-state coupling and runtime visibility expectations
- [**Frontend Transcript Session + Rehydrate Runtime**](frontend/renderer/transcript_session_and_rehydrate_reference.md) - Session identity persistence, queued transcript storage contract, main/sidecar transcript RPC mapping, and episodic-memory resume-to-chat rehydrate flow
- [**Frontend Transcript Writer Queue + Session Event Runtime**](frontend/renderer/transcript/transcript_writer_queue_flush_and_session_event_reference.md) - Queue category flush order, retry/requeue behavior, `transcript-session-update` emission guards, and test-backed session-state invariants
- [**Frontend Dashboard Memory Management + Resume Runtime**](frontend/renderer/dashboard_memory_management_and_resume_reference.md) - Dashboard section routing, episodic/semantic memory list-delete flows, context-menu hotkeys, and resumable conversation handoff back into chat
- [**Frontend Runtime Paths and Endpoints**](frontend/main/runtime_paths_and_endpoints.md) - Backend ws/http endpoint derivation, packaged Python path lookup, and frontend config persistence path
- [**Frontend Query Payload Relay**](frontend/main/query_payload_and_relay_reference.md) - Main-process query enrichment pipeline, initial settings ACK gate, local-user-message synthesis, and backend relay failure semantics
- [**Frontend Context Label Overlay + Active-Window Runtime**](frontend/main/context_label_overlay_and_active_window_runtime_reference.md) - Dedicated `chatbox-context-label` window lifecycle, visibility gates, active-window polling pipeline, and label normalization behavior
- [**Frontend WS Handshake + Settings Sync**](frontend/main/websocket_handshake_and_settings_sync_reference.md) - Main-process websocket handshake lifecycle, renderer fan-out context tracking, settings ACK gate internals, and query send-failure synthesis
- [**Frontend Main Local-Backend Hub**](frontend/main/local_backend/README.md) - Electron-main local-backend sub-hub for process lifecycle, JSON-RPC mapping, and screenshot guard boundaries
- [**Frontend Main Shell Tool Test Harness**](frontend/main/testing/shell_tool_chrome_command_test_harness_runtime_reference.md) - Manual shell-tool smoke harness and platform-specific Chrome command probe behavior
- [**Frontend Local Backend Bridge Overview + Window Guard Index**](frontend/main/local_backend_bridge_handler_and_window_guard_reference.md) - Overview page linking local-backend lifecycle/mapping deep dives and overlay guard references
- [**Frontend Local-Backend Process Lifecycle + Request Correlation**](frontend/main/local_backend/process_lifecycle_readiness_and_request_correlation_reference.md) - Sidecar startup env/path resolution, readiness retry token guards, timeout/pending map semantics, and reset/shutdown behavior
- [**Frontend Local-Backend RPC Handler Registry + Mapper Runtime**](frontend/main/local_backend/rpc_handler_registry_and_payload_mapper_reference.md) - Direct and compiled handler registration contracts, payload mapping modes, and test-backed channel/method invariants
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
- [**Frontend Renderer Voice Docs Hub**](frontend/renderer/voice/README.md) - Sub-hub for transcription gateway lifecycle, wakeword IPC capture policy, and shared audio cleanup invariants
- [**Frontend Renderer Voice Utils Docs Hub**](frontend/renderer/voice/utils/README.md) - Sub-hub for low-level voice utility contracts: PCM conversion/framing, capture cleanup primitives, and transcription-region edit reconciliation
- [**Frontend Voice Capture + Wakeword Controller**](frontend/renderer/voice_capture_and_wakeword_controller_reference.md) - Renderer voice transcription and wakeword lifecycle: config gates, mic capture/encoding paths, IPC event flow, and retrigger guardrails
- [**Frontend Voice Mode Gateway + Transcription Region Runtime**](frontend/renderer/voice/voice_mode_gateway_connection_and_transcription_region_reference.md) - Gateway socket/message framing, reconnect backoff, silence auto-submit, and transcription-region replacement behavior
- [**Frontend Audio Encoding + Chunk Normalization + Capture Cleanup**](frontend/renderer/voice/utils/audio_encoding_chunk_normalization_and_capture_cleanup_reference.md) - Float32->PCM16 conversion, gateway frame prefix cache contract, supported chunk-size normalization rules, and safe audio-node/context teardown behavior
- [**Frontend Transcription Region State Machine + Edit Reconciliation**](frontend/renderer/voice/utils/transcription_region_state_machine_and_input_edit_reconciliation_reference.md) - Single-region append/replace model, input-change/paste offset logic, and utterance-end submission/reset coupling
- [**Frontend Wakeword IPC Capture + Cooldown Runtime**](frontend/renderer/voice/wakeword_detection_ipc_capture_and_cooldown_reference.md) - Readiness-gated wakeword capture, generation-guarded start/stop flow, threshold/cooldown filtering, and retrigger-prevention disable sequence
- [**System Architecture**](architecture/architecture.md) - High-level system design and components
- [**Backend Architecture**](architecture/backend_architecture.md) - Backend system design and patterns
- [**Frontend Architecture**](architecture/frontend_architecture.md) - Frontend system design and patterns
- [**Communication Flow**](architecture/communication_flow.md) - How frontend and backend communicate

### Core Systems
- [**Agent System**](architecture/agent_system.md) - Agent orchestrator and execution flow
- [**Tool System**](architecture/tool_system.md) - Tool execution architecture and development
- [**Backend Tools Docs Hub**](backend/tools/README.md) - Backend schema bridge, policy filtering, and wait/ingress runtime docs for frontend-executed tools
- [**Backend Tools Registry Docs Hub**](backend/tools/registry/README.md) - Sub-hub for remote tool registration, canonical schema caching, and backend/frontend tool-name parity contracts
- [**Backend Browser Tools Docs Hub**](backend/tools/browser/README.md) - Sub-hub for browser remote schema surface and OpenClaw compatibility-field boundaries
- [**Backend Browser Schema Docs Hub**](backend/tools/browser/schema/README.md) - Sub-hub for BrowserControlArgs schema layering, compatibility-field mixins, and backend-sidecar validation boundary mapping
- [**Backend Tools Policy Docs Hub**](backend/tools/policy/README.md) - Sub-hub for interaction allowlist + dev tool-selection filtering and mouse method startup gating semantics
- [**Backend Remote Tools Docs Hub**](backend/tools/remote/README.md) - Sub-hub for domain-specific remote stub payload and request-id behavior before frontend execution
- [**Backend Tools Execution Docs Hub**](backend/tools/execution/README.md) - Sub-hub for send-path dispatch rules, bundle detection branching, and single/bundle wait orchestration semantics
- [**Backend Tools Preparation Docs Hub**](backend/tools/preparation/README.md) - Sub-hub for active screenshot/OCR state lifecycle and resolved-call storage contracts used across preparation and execution
- [**Backend Tools Waiting Docs Hub**](backend/tools/waiting/README.md) - Sub-hub for frontend tool-result receive/route internals and centralized pending/future storage cleanup semantics
- [**Backend Tools Processing Docs Hub**](backend/tools/processing/README.md) - Sub-hub for result-transform formatting rules, synthetic failure result generation, and history-commit cleanup sequencing
- [**Backend Tools Contracts Docs Hub**](backend/tools/contracts/README.md) - Sub-hub for tool taxonomy enums, shared schema field factories, and typed tool-result helper/model contracts
- [**Backend Tools Templates Docs Hub**](backend/tools/templates/README.md) - Sub-hub for SDK tool scaffold files and manifest/capability conventions for new tool authors
- [**Backend Tools Security Docs Hub**](backend/tools/security/README.md) - Core security policy primitives, audit sanitization controls, and tool-executor registry isolation contracts
- [**Backend Tool Security Policy + Executor**](backend/tools/tool_security_policy_and_executor_reference.md) - Active vs planned tool-security boundary: ToolPolicy filtering, fail-closed permission checks, audit-log hardening, and sandbox executor registry behavior
- [**Backend Policy Permissions + Audit Sanitization + Executor Registry**](backend/tools/security/policy_permissions_audit_and_executor_registry_reference.md) - `core/security` fail-closed permission rules, path/resource checks, bounded audit-log sanitization semantics, and runtime executor swap behavior
- [**Backend Tool Result Ingress Reference**](backend/tools/tool_result_ingress_and_storage_reference.md) - End-to-end `tool-result`/`tool-bundle-result` flow across API handler, session routing, storage, and futures
- [**Backend Tool Sender Dispatch + Synthetic Error Runtime**](backend/tools/execution/tool_sender_frontend_dispatch_and_synthetic_error_result_reference.md) - Preparation-result branching, synthetic failure event ordering, and model-facing metadata contracts for frontend dispatch
- [**Backend Tool Result Orchestrator Bundle + Wait Runtime**](backend/tools/execution/tool_result_orchestrator_bundle_detection_and_wait_path_reference.md) - Atomic bundle detection rules, session-required execution routing, per-tool/bundle futures, and stale-screen safety guard behavior
- [**Backend Tool Result Receiver + Router Shared Route-Mode**](backend/tools/waiting/tool_result_receiver_and_router_shared_route_mode_reference.md) - Single-vs-bundle shared routing path, bundle success normalization, screenshot-ref decode flow, and session system-state refresh behavior
- [**Backend Tool Result Storage Future Lifecycle + Cleanup**](backend/tools/waiting/tool_result_storage_future_lifecycle_and_cleanup_reference.md) - Pending/future map ownership, sync/async future creation, TTL cleanup semantics, and request-id targeted cleanup guarantees
- [**Backend Screenshot Manager + OCR Task Lifecycle**](backend/tools/preparation/screenshot_manager_and_ocr_task_lifecycle_reference.md) - Current-screenshot model, proactive OCR task replacement/cleanup, completion-event behavior, and outdated-result suppression rules
- [**Backend Resolved Tool-Call Storage + Session Access Contract**](backend/tools/preparation/resolved_tool_call_storage_and_session_access_contract_reference.md) - Request-id map semantics, session encapsulation APIs, cleanup lifecycle, and stale-screen guard coupling at execution time
- [**Backend Tool Result Processor Bundle Formatting + Cleanup**](backend/tools/processing/tool_result_processor_bundle_formatting_and_cleanup_reference.md) - Atomic-bundle commit branch, bundle narrative generation, individual-result fallback path, and guaranteed request-id/resolved-call cleanup behavior
- [**Backend Result Transformer + Tool Result Formatting Contract**](backend/tools/processing/result_transformer_and_tool_result_formatting_contract_reference.md) - Pure transformation invariant, screenshot extraction precedence, and `ToolResult.format_for_history` fallback semantics
- [**Backend Synthetic Result Factory + Coordinate-Resolution Failure Output**](backend/tools/processing/synthetic_result_factory_and_coordinate_resolution_failure_tool_output_reference.md) - Backend-generated synthetic `ToolResult` shape, failure event ordering, and immediate pending-result storage semantics
- [**Backend Remote Tool Registry + Schema Cache Runtime**](backend/tools/registry/remote_tool_registry_schema_cache_and_cross_layer_parity_reference.md) - `ToolRegistry`/`SchemaRegistry` internals: remote class registration, canonical schema rules, capability fallback extraction, and parity tests against sidecar exposed tools
- [**Backend Browser Remote Schema Surface + Compatibility Runtime**](backend/tools/browser/browser_remote_schema_surface_and_compatibility_contract_reference.md) - `BrowserControlArgs` unified action schema, action-specific validator models, compatibility aliases, and `RemoteBrowserTool` payload emission semantics
- [**Backend Browser Control Unified Schema + Compatibility Field Matrix**](backend/tools/browser/schema/browser_control_unified_schema_and_compatibility_field_matrix_reference.md) - Action literal surface, snapshot-scope aliases, shared compatibility-field model mixins, and unified schema field-family contracts
- [**Backend-Sidecar Browser Schema Parity + Validation Boundary**](backend/tools/browser/schema/backend_sidecar_browser_schema_parity_and_validation_boundary_reference.md) - Cross-layer action/field parity checks and debugging flow for backend parse-success vs sidecar runtime rejection cases
- [**Backend Tool Policy + Dev Tool Selection Runtime**](backend/tools/policy/tool_policy_and_dev_tool_selection_runtime_reference.md) - `ToolPolicy` + `ToolSelection` precedence rules, mouse schema pruning, parser method validation, and OCR/vision startup gating behavior
- [**Backend Remote Tool Domain Payload + Request-ID Runtime**](backend/tools/remote/remote_tool_domain_payload_and_request_id_semantics_reference.md) - Domain stub matrix (computer/system/filesystem/browser), request-id sourcing/override behavior, and payload model_dump differences
- [**Backend Query Execution Pipeline**](backend/runtime/query_execution_and_stream_pipeline_reference.md) - Query handler to stream pipeline internals, completion backfill rules, and cancellation/task-tracking behavior
- [**Backend API Handlers Hub**](backend/api/handlers/README.md) - Sub-hub for typed websocket handler contracts and query/non-query execution ownership boundaries
- [**Backend API Services Hub**](backend/api/services/README.md) - Sub-hub for query/rehydrate/wakeword service-layer orchestration and shared API TTS-session lifecycle boundaries
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
- [**Backend Agent LLM Docs Hub**](backend/agent/llm/README.md) - Sub-hub for iteration-aware prompt context caching, prompt-transparency presentation contracts, and stream/token diagnostics runtime behavior
- [**Backend Conversation Context + Prompt-Metadata Presenter**](backend/agent/llm/conversation_context_and_event_presenter_prompt_metadata_reference.md) - First-turn prompt build/cache semantics, `system-prompt`/`user-message-full`/`tool-schemas` event ordering, and tool-schema validation boundary
- [**Backend LLM Stream Processor Token + Cache Diagnostics**](backend/agent/llm/llm_stream_processor_token_count_and_cache_diagnostics_reference.md) - Stream-vs-non-stream tool-turn routing, normalized payload capture, prompt/provider cache diagnostics, and provider-vs-estimated token accounting rules
- [**Backend Agent History Docs Hub**](backend/agent/history/README.md) - Sub-hub for result-transform/commit boundaries and tool-call-id staging semantics in conversation history writes
- [**Backend History Committer + Result-Processor Boundary**](backend/agent/history/history_committer_and_result_processor_boundary_reference.md) - Pure-transform vs state-mutation split, atomic bundle commit path, and finally-block request-id cleanup guarantees
- [**Backend Tool-Call-ID Staging + Tool-Output History Rows**](backend/agent/history/tool_call_id_staging_and_tool_output_history_row_contract_reference.md) - Dual-row tool-output storage strategy, staged id consumption modes, and token-cache update semantics
- [**Backend Tool-Call Error Recovery + Synthetic Tool-Output Replay**](backend/agent/recovery/tool_call_error_recovery_and_synthetic_tool_output_replay_reference.md) - Recoverable malformed tool-call stream error classification, synthetic `ToolCallEvent`/`ToolOutputEvent` ordering, history replay injection, and skip-frontend-execution metadata contract
- [**Backend Conversation History + Prompt Context Runtime**](backend/runtime/conversation_history_and_prompt_context_runtime_reference.md) - Iteration-1 prompt metadata generation, cached later-turn history retrieval, tool-call/tool-output linkage, rehydrate normalization, and token-cache semantics
- [**Backend Token Count Event + Usage Diagnostics**](backend/runtime/token_count_event_and_usage_diagnostics_reference.md) - Token-count event lifecycle from LLM stream processor through websocket formatter, provider usage-precedence rules, and fallback/cache semantics
- [**Backend Token Service Message Normalization + Fallback**](backend/services/token/token_service_message_normalization_and_fallback_reference.md) - LiteLLM token-counter message canonicalization rules, assistant tool-call normalization, text-only fallback estimate semantics, and singleton/thread-safety contract
- [**Backend Non-Query Handler Flows**](backend/api/non_query_handler_and_control_flow_reference.md) - Settings/model handlers, stop-query cancellation semantics, wakeword activation responses, and transcript rehydrate normalization path
- [**Backend Query Handler + Query Execution Service Runtime**](backend/api/handlers/query_handler_and_query_execution_service_runtime_reference.md) - Active task registration, screenshot/runtime-state ingestion, stream completion backfill ordering, and TTS session lifecycle
- [**Backend Non-Query Handler Dispatch + Payload Normalization**](backend/api/handlers/non_query_handler_dispatch_and_payload_normalization_reference.md) - Stop-query completion guarantee, tool-result normalization/routing, settings boundary enforcement, and rehydrate/wakeword service sequencing
- [**Backend Query Execution Service Stream Context + Completion Fallback**](backend/api/services/query_execution_service_stream_context_and_completion_fallback_reference.md) - Shared stream-context reuse, screenshot/runtime-state ingestion, completion-text precedence, and synthetic fallback/backfill emission rules
- [**Backend Rehydrate and Wakeword Services + TTSSession**](backend/api/services/rehydrate_and_wakeword_execution_service_and_tts_session_reference.md) - Transcript rehydrate normalization/linkage repair and wakeword greeting+audio service lifecycle contracts
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
- [**Backend Services Screen-Grounding Hub**](backend/services/screen_grounding/README.md) - Sub-hub for OCR state machine and vision provider/runtime details used by coordinate preparation
- [**Backend OCR + Vision Coordinate Runtime Overview**](backend/services/ocr_and_vision_coordinate_runtime_reference.md) - Overview index linking focused OCR-state and vision-provider deep references
- [**Backend OCR Service + Screenshot State Machine Runtime**](backend/services/screen_grounding/ocr_service_and_screenshot_state_machine_reference.md) - Startup OCR policy gate, screenshot-ID/task race guards, proactive/on-demand OCR coordination, and CUDA->CPU OCR fallback semantics
- [**Backend OCR Helper Utility Contracts**](backend/services/screen_grounding/ocr/cuda_error_detection_screenshot_decode_and_ocr_field_normalization_helper_contract_reference.md) - CUDA error classification, strict screenshot payload decode rules, and OCR field normalization behavior used by OCR service internals
- [**Backend Vision Provider Runtime + Coordinate Scaling**](backend/services/screen_grounding/vision_provider_runtime_and_coordinate_scaling_reference.md) - Vision provider selection/load fallback, inference serialization/runtime retries, and coordinate parse/scale contracts
- [**Backend Tool Preparation + Coordinate Resolution**](backend/tools/tool_preparation_and_coordinate_resolution_reference.md) - Pre-dispatch tool resolution internals: execution refs, OCR/prediction coordinate flow, normalization metadata contract, synthetic failure paths, and stale-screen execution guard
- [**Backend Tools Processing Hub**](backend/tools/processing/README.md) - Sub-hub for history-facing post-execution processing (transform, synthetic error creation, and bundle-aware commit behavior)
- [**Browser Control**](browser/browser_control.md) - Browser automation architecture and tool behavior
- [**Sidecar Browser Automation Stack**](frontend/sidecar/browser_automation_stack.md) - Renderer->main->sidecar browser runtime and CDP orchestration details
- [**Sidecar Browser Action Compatibility + Runtime**](frontend/sidecar/browser_action_compatibility_and_runtime_reference.md) - OpenClaw-compatible browser action surface, adapter normalization rules, native runtime handler mapping, and timeout/error-code behavior
- [**Sidecar Browser Docs Hub**](frontend/sidecar/browser/README.md) - Sub-hub for Browser Use runtime-provider/vendoring guarantees and adapter action normalization contracts
- [**Sidecar Browser Contracts Docs Hub**](frontend/sidecar/browser/contracts/README.md) - Sub-hub for sidecar browser action schemas, compatibility payload fields, and validation boundary semantics
- [**Sidecar Browser Chrome Docs Hub**](frontend/sidecar/browser/chrome/README.md) - Sub-hub for executable detection, dedicated CDP launch/connect policy, BrowserController lifecycle, and enhanced snapshot pipeline internals
- [**Sidecar Browser Use Runtime Docs Hub**](frontend/sidecar/browser/browser_use/README.md) - Sub-hub for vendored Browser Use package bootstrap, lazy imports, logging, and optional observability behavior
- [**Sidecar Browser Use Browser Docs Hub**](frontend/sidecar/browser/browser_use/browser/README.md) - Sub-hub for BrowserSession/session-manager orchestration, profile runtime defaults, demo overlay behavior, and watchdog architecture
- [**Sidecar Browser Use Browser Watchdogs Docs Hub**](frontend/sidecar/browser/browser_use/browser/watchdogs/README.md) - Sub-hub for base watchdog registration contracts and specialized watchdog behavior across actions, downloads, DOM, security, persistence, and launch lifecycle
- [**Sidecar Browser Use DOM Docs Hub**](frontend/sidecar/browser/browser_use/dom/README.md) - Sub-hub for Browser Use DOM capture/merge contracts, enhanced view-model identity semantics, and serializer/extraction pipeline internals
- [**Sidecar Browser Use Tools Docs Hub**](frontend/sidecar/browser/browser_use/tools/README.md) - Sub-hub for Browser Use action schema models, registry signature normalization, domain-filtering exposure, and runtime action dispatch semantics
- [**Sidecar Browser Use LLM Docs Hub**](frontend/sidecar/browser/browser_use/llm/README.md) - Sub-hub for Browser Use LLM base protocol/message contracts, schema optimizer behavior, model alias factory, and provider adapter runtime details
- [**Sidecar Browser Use Actor Docs Hub**](frontend/sidecar/browser/browser_use/actor/README.md) - Sub-hub for Browser Use actor page/element/mouse input orchestration and Windows key-mapping utilities
- [**Sidecar Browser Use Agent Docs Hub**](frontend/sidecar/browser/browser_use/agent/README.md) - Sub-hub for Browser Use agent state/output/history schemas, loop-detection nudges, and message-manager compaction state models
- [**Sidecar Browser Use Tokens Docs Hub**](frontend/sidecar/browser/browser_use/tokens/README.md) - Sub-hub for Browser Use token usage/cost/pricing view models and per-model aggregate summary contracts
- [**Sidecar Browser Use Filesystem Docs Hub**](frontend/sidecar/browser/browser_use/filesystem/README.md) - Sub-hub for Browser Use typed file adapters, filename sanitization policy, internal/external reads, and state restore semantics
- [**Sidecar Source Maps Docs Hub**](frontend/sidecar/source_maps/README.md) - Sub-hub for sidecar source-owned folder topology maps and package entrypoint export surfaces
- [**Sidecar Browser Runtime Provider + Native Handler Bridge**](frontend/sidecar/browser/browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md) - Runtime selection env policy, vendored Browser Use import enforcement, native handler loading, and BrowserUseNative action dispatch semantics
- [**Sidecar Browser Adapter Action Routing + Compatibility Semantics**](frontend/sidecar/browser/browser_adapter_action_routing_and_compatibility_semantics_reference.md) - Adapter action-family dispatch, compatibility-field rejection rules, parameter normalization, and error-code surfaces
- [**Sidecar Browser Schema Registry + Action Validation Boundary**](frontend/sidecar/browser/contracts/schema_registry_and_action_validation_boundary_reference.md) - `BROWSER_SCHEMAS` action-to-model wiring, helper validation entrypoints, strict per-action validators, and schema-vs-runtime enforcement split
- [**Sidecar OpenClaw Compatibility Action + Field Surface**](frontend/sidecar/browser/contracts/openclaw_compat_action_and_field_surface_reference.md) - Full compatibility action set, field alias families, optional payload semantics, and adapter/runtime rejection boundary notes
- [**Sidecar Browser Role Snapshot Contracts**](frontend/sidecar/browser/contracts/role_snapshot/aria_snapshot_ref_generation_and_compaction_contract_reference.md) - ARIA snapshot parsing, role-based filtering, ref/nth generation, and compact-tree behavior used in role snapshot helpers
- [**Sidecar Chrome Detection + Launcher + CDP Session**](frontend/sidecar/browser/chrome/chrome_detection_launcher_and_cdp_session_reference.md) - Cross-platform browser executable detection, dedicated-profile launch args, CDP endpoint checks, and ensure-connect state-machine behavior
- [**Sidecar BrowserController Lifecycle + Snapshot + Actions**](frontend/sidecar/browser/chrome/browser_controller_lifecycle_snapshot_and_action_runtime_reference.md) - Connection-mode lifecycle, tab observer buffers, snapshot routing, role-ref disambiguation, click fallback ordering, and cleanup semantics
- [**Sidecar Enhanced CDP DOM Snapshot Pipeline Runtime**](frontend/sidecar/browser/chrome/enhanced_cdp_dom_snapshot_pipeline_runtime_reference.md) - Parallel CDP fetch+retry policy, DOM/AX/style merge heuristics, interactivity selection, ref attachment, and truncation behavior
- [**Sidecar Browser Use Config + Logging + Observability Runtime**](frontend/sidecar/browser/browser_use/config_logging_observability_and_lazy_import_runtime_reference.md) - Browser Use package bootstrap gates, lazy import resolver contract, config migration/env behavior, logging pipeline, and lmnr/no-op observability decorator semantics
- [**Sidecar Browser Session + Event Bus + CDP Lifecycle Runtime**](frontend/sidecar/browser/browser_use/browser/session_manager_event_bus_and_cdp_lifecycle_orchestration_reference.md) - BrowserSession startup/connect/stop flow, SessionManager attach-detach ownership, focus recovery, and navigation lifecycle waiting contracts
- [**Sidecar Browser Profile + Launch Args + Demo/Video Runtime**](frontend/sidecar/browser/browser_use/browser/profile_runtime_defaults_launch_args_demo_overlay_and_video_recording_reference.md) - BrowserProfile defaults/validators/extension bootstrap contracts plus demo overlay injection and screencast recording helper behavior
- [**Sidecar Browser Watchdog Base + Specialized Runtime**](frontend/sidecar/browser/browser_use/browser/watchdogs/watchdog_base_and_specialized_watchdogs_runtime_reference.md) - BaseWatchdog handler registration/recovery semantics and specialized watchdog behavior matrix (actions, downloads, DOM, security, persistence, launch, HAR, recording)
- [**Sidecar Browser Use DOM Tree Construction + Iframe Traversal Runtime**](frontend/sidecar/browser/browser_use/dom/dom_tree_construction_visibility_iframe_traversal_and_pagination_detection_contract_reference.md) - Parallel CDP capture, frame-aware visibility, cross-origin iframe recursion gates, serialized timing envelopes, and pagination hint extraction behavior
- [**Sidecar Browser Use DOM Data Models + Interaction Identity Runtime**](frontend/sidecar/browser/browser_use/dom/dom_data_models_hashing_scrollability_and_interaction_identity_contract_reference.md) - Enhanced node/snapshot/AX data model semantics, stable hash vs dynamic-class filtering, xpath/scroll-info generation, and interacted-element replay identity
- [**Sidecar Browser Use DOM Serializer + Markdown Pipeline Runtime**](frontend/sidecar/browser/browser_use/dom/dom_serializer_snapshot_clickability_and_markdown_pipeline_runtime_reference.md) - Clickability heuristics, simplified-tree/index assignment contracts, paint-order+bbox filtering semantics, HTML reconstruction, and structure-aware markdown chunk continuation rules
- [**Sidecar Browser Use Tools Action Model + Input Schema Runtime**](frontend/sidecar/browser/browser_use/tools/action_model_surface_and_input_schema_contract_reference.md) - Pydantic action parameter contracts, structured-output envelope behavior, extraction metadata shape, and supported JSON-schema conversion subset
- [**Sidecar Browser Use Tools Registry Signature + Sensitive Placeholder Runtime**](frontend/sidecar/browser/browser_use/tools/registry_signature_normalization_sensitive_placeholder_and_domain_filter_contract_reference.md) - Wrapper signature normalization, special-parameter injection, domain-gated action availability, and `<secret>` placeholder + TOTP replacement contracts
- [**Sidecar Browser Use Tools Action Dispatch + CodeAgent Runtime**](frontend/sidecar/browser/browser_use/tools/runtime_action_dispatch_extraction_and_codeagent_variant_contract_reference.md) - Event-dispatch action flow, extraction/search/evaluate behavior, result-memory conventions, and CodeAgent exclusion/override differences
- [**Sidecar Browser Use LLM Base Protocol + Schema Runtime**](frontend/sidecar/browser/browser_use/llm/base_protocol_message_types_schema_optimization_and_model_alias_factory_contract_reference.md) - Shared `BaseChatModel` invoke contract, message/content envelopes, strict schema optimizer behavior, and model alias/provider factory rules
- [**Sidecar Browser Use LLM Provider Adapters + Serializer Runtime**](frontend/sidecar/browser/browser_use/llm/provider_adapters_and_serializer_runtime_reference.md) - OpenAI/Gemini/Mistral request+retry+error mapping behavior and provider-specific message serializer conversion boundaries
- [**Sidecar Browser Use Actor Page/Element/Mouse + Key Mapping Runtime**](frontend/sidecar/browser/browser_use/actor/page_element_mouse_and_key_mapping_runtime_reference.md) - Page session/domain attach semantics, resilient element click/fill fallback chains, mouse scroll fallback ordering, and virtual-key lookup behavior
- [**Sidecar Browser Use Agent State/Output/History Runtime**](frontend/sidecar/browser/browser_use/agent/agent_state_output_history_and_error_handling_contract_reference.md) - Agent settings/loop-detection contracts, action result validation rules, dynamic output schema variants, history serialization, and error formatting behavior
- [**Sidecar Browser Use Agent Message History + Compaction Runtime**](frontend/sidecar/browser/browser_use/agent/message_history_and_compaction_state_contract_reference.md) - History item render ordering, system/state/context message assembly order, and compaction/read-state tracking fields
- [**Sidecar Browser Use Token Usage + Pricing Runtime**](frontend/sidecar/browser/browser_use/tokens/token_usage_pricing_and_aggregate_cost_summary_contract_reference.md) - Prompt/cache/completion cost decomposition and global plus per-model token summary structures
- [**Sidecar Browser Use Filesystem Runtime + State Persistence**](frontend/sidecar/browser/browser_use/filesystem/file_system_runtime_file_type_adapters_and_state_persistence_contract_reference.md) - Filename validation/sanitization policy, adapter-specific read/write behavior, external PDF/image read semantics, and state restore guarantees
- [**Sidecar Python Folder Topology + Package Export Surface Runtime**](frontend/sidecar/source_maps/python_sidecar_folder_topology_and_package_init_export_surface_reference.md) - Source-owned sidecar service/tool topology flow and `__init__` compatibility/import-surface contracts
- [**Sidecar System-State Collection + Platform Adapter Runtime**](frontend/sidecar/system_state/system_state_collection_and_platform_adapter_reference.md) - `get-system-state` field semantics, per-OS probes, fallback defaults, and renderer/main/sidecar integration contracts
- [**Sidecar Tool Registry Docs Hub**](frontend/sidecar/tools/registry/README.md) - Sub-hub for exposed-tool parity, lazy import registration behavior, and result normalization boundaries
- [**Sidecar Tools Contracts Docs Hub**](frontend/sidecar/tools/contracts/README.md) - Sub-hub for base tool interface lifecycle and simple result-wrapper serialization contracts
- [**Sidecar Computer Tools Docs Hub**](frontend/sidecar/tools/computer/README.md) - Sub-hub for computer-use action contracts and OS-aware scroll/screenshot behavior
- [**Sidecar System Tools Docs Hub**](frontend/sidecar/tools/system/README.md) - Sub-hub for wait/window/stats tool semantics and platform window manager behavior
- [**Sidecar Shell + Process Session Runtime**](frontend/sidecar/tools/shell_and_process_session_runtime_reference.md) - `run_shell_command`/`process` execution modes, output token truncation policy, PTY fallback behavior, background session registry TTL/caps, and action-level management semantics
- [**Sidecar Filesystem Read + Replace Runtime**](frontend/sidecar/tools/filesystem_read_replace_runtime_reference.md) - `read_file` pagination/truncation contracts, binary/encoding guards, and `replace` strict-vs-lenient/patch-chunk atomic edit semantics
- [**Sidecar Tool Registry Exposed Schema + Result Normalization Runtime**](frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_normalization_reference.md) - Exact `ToolRegistry.execute_tool` dispatch path, legacy failure payload extraction precedence, and exposed-tool parity drift guards
- [**Sidecar Mouse, Keyboard, Scroll, and Screenshot Runtime**](frontend/sidecar/tools/computer/mouse_keyboard_scroll_and_screenshot_runtime_reference.md) - Computer tool action requirements, hotkey safety blocks, scroll unit normalization, and screenshot JPEG/base64 payload semantics
- [**Sidecar Wait, Window, and Stats Runtime**](frontend/sidecar/tools/system/wait_window_stats_runtime_reference.md) - Non-blocking wait behavior, platform window targeting rules, and shared psutil metrics collector contracts
- [**Sidecar JSON-RPC Reference**](frontend/sidecar/local_backend_jsonrpc_reference.md) - Main-process bridge method map and local backend JSON-RPC contract details
- [**Sidecar Process Lifecycle**](frontend/sidecar/local_backend_process_lifecycle_reference.md) - Python sidecar spawn env/readiness probe loop, request correlation/timeouts, and restart/failure recovery behavior
- [**Sidecar Core Docs Hub**](frontend/sidecar/core/README.md) - Sub-hub for low-level sidecar core modules: JSON-RPC dispatcher, stdout framing, shutdown helpers, backend URL resolution, remote memory clients, and thread-pool lifecycle
- [**Sidecar Services Docs Hub**](frontend/sidecar/services/README.md) - Sub-hub for standalone Python sidecar entrypoint services: memory-only JSON protocol runtime and wakeword binary framing/model bootstrap behavior
- [**Sidecar JSON-RPC Protocol + Stdout + Shutdown Runtime**](frontend/sidecar/core/json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md) - JSON-RPC validation/dispatch and notification suppression semantics, stdout JSON-line contract, and stdin-unblocking graceful shutdown behavior
- [**Sidecar Backend URL + Remote Memory Client Runtime**](frontend/sidecar/core/backend_url_resolution_remote_memory_clients_and_thread_pool_runtime_reference.md) - Backend endpoint env precedence, remote embedding/semantic client API/error contracts, and process-global thread-pool reuse semantics
- [**Sidecar Memory Service JSON Protocol + Store Lifecycle**](frontend/sidecar/services/memory_service_json_protocol_and_store_lifecycle_reference.md) - Minimal memory-service request dispatch/validation, search/store payload contracts, line-based stdin loop semantics, and graceful shutdown behavior
- [**Sidecar Wakeword Service Model + Binary Framing Runtime**](frontend/sidecar/services/wakeword_service_model_bootstrap_and_binary_framing_reference.md) - openWakeWord model bootstrap/fallback sequence, length-prefixed audio/result frame contracts, detection threshold semantics, and reset-frame behavior
- [**Sidecar Memory Storage Docs Hub**](frontend/sidecar/memory/storage/README.md) - Sub-hub for sidecar local storage internals: dual-db routing/search, transcript-window lifecycle APIs, FAISS artifact cleanup, and schema/index/watermark persistence contracts
- [**Sidecar Summarizer Watermark + Conversation Batch Runtime**](frontend/sidecar/memory/summarizer_watermark_and_conversation_batch_reference.md) - Semantic summarizer run-loop gating, pending watermark counters, user/conversation batch selection, transcript filtering rules, and dedupe/hash semantics
- [**Sidecar Transcript Storage + Semantic Candidate Runtime**](frontend/sidecar/memory/transcript_storage_semantic_candidate_and_watermark_reference.md) - `store_transcript` role/message-type candidate gates, message-index ordering contract, and pending watermark increment semantics
- [**Sidecar Local Memory Store Embedding + Search Routing Runtime**](frontend/sidecar/memory/storage/local_memory_store_embedding_search_and_memory_type_routing_reference.md) - OS-aware memory path setup, episodic/semantic routing, transcript embedding gates, vector mapping sync/rebuild, and cross-index search filtering semantics
- [**Sidecar Conversation Transcript Window + FAISS Cleanup Runtime**](frontend/sidecar/memory/storage/conversation_transcript_window_queries_and_faiss_artifact_cleanup_reference.md) - Transcript-window list/replay/query contracts, watermark-after-id selection logic, delete semantics, and zero-index artifact reset policy
- [**Sidecar SQLite Schema Migration + FAISS/Watermark Persistence Runtime**](frontend/sidecar/memory/storage/sqlite_schema_migration_faiss_index_and_watermark_state_reference.md) - Episodic/semantic schema migration/index contracts, safe FAISS load/save behavior, and thread-pool-backed watermark JSON state guarantees
- [**Wakeword Bridge + Audio Framing**](frontend/sidecar/wakeword_bridge_and_audio_framing_reference.md) - Wakeword subprocess lifecycle, length-prefixed audio transport, enable/disable buffering policy, and detection event propagation
- [**Browser Control Runbook**](browser/browser_control_run.md) - Practical setup/testing flow for browser control
- [**Memory System**](architecture/memory_system.md) - Memory management and retrieval
- [**Python Sidecar**](architecture/python_sidecar.md) - Local tool execution + memory service
- [**LLM Integration**](architecture/llm_integration.md) - LLM providers and configuration
- [**Billing & Usage (Planned)**](planning/billing_and_usage.md) - Subscriptions, entitlements, and usage limits

### Development Guides
- [**Developer Guide**](development/developer_guide.md) - Comprehensive development guide
- Developer Guide includes local automation scripts (`bin/docs-list` or `node scripts/docs-list.js`, `scripts/check`, `scripts/test`, `scripts/check-loc.py`) and frontend audit commands (`npm run lint:audit`, `npm run audit:jscpd`, `npm run audit:knip`).
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
