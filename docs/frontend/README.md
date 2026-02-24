---
summary: "Frontend documentation hub covering Electron main process, renderer runtime, tool execution services, and Python sidecar behavior."
read_when:
  - When changing frontend architecture across main/renderer/sidecar boundaries.
  - When tracing query/tool message flow from UI to backend and back.
title: "Frontend Functionality Map"
---

# Frontend Functionality Map

This hub documents WindieOS frontend implementation details across Electron main process, React renderer, and Python sidecar runtime.

## Deep Pages

### Landing

- [Landing Docs Hub](landing/README.md)
- [Landing Page Runtime and Content Reference](landing/landing_page_runtime_and_content_reference.md)

### Main Process

- [Main Docs Hub](main/README.md)
- [Main Overlay Focus Docs Hub](main/overlays/README.md)
- [Electron Main and IPC](main/electron_main_and_ipc.md)
- [Window and Overlay Lifecycle](main/window_and_overlay_lifecycle.md)
- [Context Label Overlay and Active-Window Runtime Reference](main/context_label_overlay_and_active_window_runtime_reference.md)
- [Runtime Paths and Endpoints](main/runtime_paths_and_endpoints.md)
- [Query Payload and Relay Reference](main/query_payload_and_relay_reference.md)
- [WebSocket Handshake and Settings Sync Reference](main/websocket_handshake_and_settings_sync_reference.md)
- [Main Local-Backend Docs Hub](main/local_backend/README.md)
- [Local Backend Bridge Overview and Window Guard Index](main/local_backend_bridge_handler_and_window_guard_reference.md)
- [Local-Backend Process Lifecycle, Readiness, and Request-Correlation Reference](main/local_backend/process_lifecycle_readiness_and_request_correlation_reference.md)
- [Local-Backend RPC Handler Registry and Payload-Mapper Reference](main/local_backend/rpc_handler_registry_and_payload_mapper_reference.md)
- [External Focus Snapshot, Restore, and Query-Capture Reference](main/overlays/external_focus_snapshot_restore_and_query_capture_reference.md)
- [Linux Screenshot Window Hide and Restore Guard Reference](main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)

### Preload Boundary

- [Preload Docs Hub](preload/README.md)
- [Preload Channel Allowlist and Renderer Bridge Reference](preload/preload_channel_allowlist_and_renderer_bridge_reference.md)

### Renderer

- [Renderer Docs Hub](renderer/README.md)
- [Renderer Provider Docs Hub](renderer/providers/README.md)
- [Renderer Overlay Docs Hub](renderer/overlays/README.md)
- [Renderer Infrastructure Docs Hub](renderer/infrastructure/README.md)
- [Renderer Infrastructure Audio Docs Hub](renderer/infrastructure/audio/README.md)
- [Renderer Transcript Docs Hub](renderer/transcript/README.md)
- [Renderer Runtime](renderer/renderer_runtime.md)
- [Feature Module Matrix](renderer/feature_module_matrix.md)
- [Dashboard Memory Management and Resume Reference](renderer/dashboard_memory_management_and_resume_reference.md)
- [Chat Stream and Tool Execution Reference](renderer/chat_stream_and_tool_execution_reference.md)
- [Transcript Session and Rehydrate Reference](renderer/transcript_session_and_rehydrate_reference.md)
- [Transcript Writer Queue Flush and Session Event Reference](renderer/transcript/transcript_writer_queue_flush_and_session_event_reference.md)
- [Voice Capture and Wakeword Controller Reference](renderer/voice_capture_and_wakeword_controller_reference.md)
- [Entrypoint View Routing and Provider Stack Reference](renderer/providers/entrypoint_view_routing_and_provider_stack_reference.md)
- [App Provider Coordinator and Save-Status Runtime Reference](renderer/providers/app_provider_coordinator_and_save_status_runtime_reference.md)
- [Chatbox Overlay Input, Drag, and Click-Through Reference](renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Response Overlay Phase and Tool-Ghost Runtime Reference](renderer/overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Tool Execution Service and Hook Runtime Reference](renderer/infrastructure/tool_execution_service_and_hook_runtime_reference.md)
- [Capture, Artifact Upload, and Payload Normalization Reference](renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
- [Player Service Queue, Generation, and Error-Recovery Reference](renderer/infrastructure/audio/player_service_queue_generation_and_error_recovery_reference.md)

### Runtime

- [Runtime Docs Hub](runtime/README.md)
- [Tool Execution and Streaming](runtime/tool_execution_and_streaming.md)
- [Stream Event State Machine](runtime/stream_event_state_machine.md)
- [Config Sync and Settings Lifecycle Reference](runtime/config_sync_and_settings_lifecycle_reference.md)
- [Audio Chunk Playback and Stop Semantics Reference](runtime/audio_chunk_playback_and_stop_semantics_reference.md)

### Sidecar

- [Sidecar Docs Hub](sidecar/README.md)
- [Sidecar System-State Docs Hub](sidecar/system_state/README.md)
- [Sidecar Tools Docs Hub](sidecar/tools/README.md)
- [Sidecar Tool Registry Docs Hub](sidecar/tools/registry/README.md)
- [Sidecar Computer Tools Docs Hub](sidecar/tools/computer/README.md)
- [Sidecar System Tools Docs Hub](sidecar/tools/system/README.md)
- [Sidecar Memory Docs Hub](sidecar/memory/README.md)
- [Python Sidecar and Memory](sidecar/python_sidecar_and_memory.md)
- [Sidecar System-State Collection and Platform Adapter Reference](sidecar/system_state/system_state_collection_and_platform_adapter_reference.md)
- [Sidecar Tool Catalog and Execution Model](sidecar/tool_catalog_and_execution_model.md)
- [Sidecar Shell and Process Session Runtime Reference](sidecar/tools/shell_and_process_session_runtime_reference.md)
- [Sidecar Filesystem Read and Replace Runtime Reference](sidecar/tools/filesystem_read_replace_runtime_reference.md)
- [Sidecar Tool Registry Exposed Schema and Result Normalization Reference](sidecar/tools/registry/tool_registry_exposed_schema_and_result_normalization_reference.md)
- [Sidecar Mouse, Keyboard, Scroll, and Screenshot Runtime Reference](sidecar/tools/computer/mouse_keyboard_scroll_and_screenshot_runtime_reference.md)
- [Sidecar Wait, Window, and Stats Runtime Reference](sidecar/tools/system/wait_window_stats_runtime_reference.md)
- [Memory Pipeline and Summarization](sidecar/memory_pipeline_and_summarization.md)
- [Sidecar Summarizer Watermark and Conversation Batch Reference](sidecar/memory/summarizer_watermark_and_conversation_batch_reference.md)
- [Sidecar Transcript Storage, Semantic Candidate, and Watermark Reference](sidecar/memory/transcript_storage_semantic_candidate_and_watermark_reference.md)
- [Sidecar Browser Docs Hub](sidecar/browser/README.md)
- [Sidecar Browser Use Runtime Docs Hub](sidecar/browser/browser_use/README.md)
- [Browser Automation Stack](sidecar/browser_automation_stack.md)
- [Browser Action Compatibility and Runtime Reference](sidecar/browser_action_compatibility_and_runtime_reference.md)
- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](sidecar/browser/browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](sidecar/browser/browser_adapter_action_routing_and_compatibility_semantics_reference.md)
- [Browser Use Config, Logging, Observability, and Lazy Import Runtime Reference](sidecar/browser/browser_use/config_logging_observability_and_lazy_import_runtime_reference.md)
- [Local Backend JSON-RPC Reference](sidecar/local_backend_jsonrpc_reference.md)
- [Local Backend Process Lifecycle Reference](sidecar/local_backend_process_lifecycle_reference.md)
- [Wakeword Bridge and Audio Framing Reference](sidecar/wakeword_bridge_and_audio_framing_reference.md)

### Contracts

- [Contracts Docs Hub](contracts/README.md)
- [Contracts Events Docs Hub](contracts/events/README.md)
- [Contracts IPC Docs Hub](contracts/ipc/README.md)
- [IPC Channels and Event Contracts](contracts/ipc_channels_and_event_contracts.md)
- [IPC Channel and Handler Reference](contracts/ipc_channel_and_handler_reference.md)
- [Preload Allowlist and Channel-Constant Parity Reference](contracts/ipc/preload_allowlist_and_channel_constant_parity_reference.md)
- [Main-Process IPC Handler Ownership and RPC Mapper Reference](contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)
- [Schema Generation and Event Guard Reference](contracts/schema_generation_and_event_guard_reference.md)
- [Memory IPC and RPC Mapping Reference](contracts/memory_ipc_and_rpc_mapping_reference.md)
- [Backend Event Consumer Matrix Reference](contracts/backend_event_consumer_matrix_reference.md)
- [From-Backend Event Ingress, Typed Guard, and Audio Side-Channel Reference](contracts/events/from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md)
- [Local User Message and Query Send-Failure Synthesis Reference](contracts/events/local_user_message_and_query_send_failure_synthesis_reference.md)
- [Settings and Model ACK Event Routing Reference](contracts/events/settings_and_model_ack_event_routing_reference.md)
- [Overlay and Wakeword Control Channel Reference](contracts/overlay_and_wakeword_control_channel_reference.md)

## Frontend Code Layout

- `frontend/src/main`: Electron main process, backend/ws bridge, wakeword bridge, query payload enrichment
- `frontend/src/preload.js`: sandbox-safe IPC exposure to renderer
- `frontend/src/renderer`: React app, contexts, feature modules, infrastructure services
- `frontend/src/main/python`: local backend sidecar, memory service, wakeword subprocess, tool implementations
- `frontend/src/landing`: standalone landing page entrypoint, section composition, and shared marketing style system

## End-to-End Runtime Path (Condensed)

1. Renderer sends query via typed IPC bridge.
2. Main process gates initial settings sync, enriches query with system context + memory search.
3. Main process forwards query over backend WebSocket.
4. Backend streams events back; main relays to renderer.
5. Renderer stream hook updates chat state and transcript.
6. Tool events trigger `ToolExecutionService`, which executes tools via local sidecar bridge.
7. Tool results (single or bundle) are posted back to backend for next loop iteration.
