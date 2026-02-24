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
- [Electron Main and IPC](main/electron_main_and_ipc.md)
- [Window and Overlay Lifecycle](main/window_and_overlay_lifecycle.md)
- [Context Label Overlay and Active-Window Runtime Reference](main/context_label_overlay_and_active_window_runtime_reference.md)
- [Runtime Paths and Endpoints](main/runtime_paths_and_endpoints.md)
- [Query Payload and Relay Reference](main/query_payload_and_relay_reference.md)
- [WebSocket Handshake and Settings Sync Reference](main/websocket_handshake_and_settings_sync_reference.md)
- [Local Backend Bridge Handler and Window Guard Reference](main/local_backend_bridge_handler_and_window_guard_reference.md)

### Preload Boundary

- [Preload Docs Hub](preload/README.md)
- [Preload Channel Allowlist and Renderer Bridge Reference](preload/preload_channel_allowlist_and_renderer_bridge_reference.md)

### Renderer

- [Renderer Docs Hub](renderer/README.md)
- [Renderer Runtime](renderer/renderer_runtime.md)
- [Feature Module Matrix](renderer/feature_module_matrix.md)
- [Dashboard Memory Management and Resume Reference](renderer/dashboard_memory_management_and_resume_reference.md)
- [Chat Stream and Tool Execution Reference](renderer/chat_stream_and_tool_execution_reference.md)
- [Transcript Session and Rehydrate Reference](renderer/transcript_session_and_rehydrate_reference.md)
- [Voice Capture and Wakeword Controller Reference](renderer/voice_capture_and_wakeword_controller_reference.md)

### Runtime

- [Runtime Docs Hub](runtime/README.md)
- [Tool Execution and Streaming](runtime/tool_execution_and_streaming.md)
- [Stream Event State Machine](runtime/stream_event_state_machine.md)
- [Config Sync and Settings Lifecycle Reference](runtime/config_sync_and_settings_lifecycle_reference.md)
- [Audio Chunk Playback and Stop Semantics Reference](runtime/audio_chunk_playback_and_stop_semantics_reference.md)

### Sidecar

- [Sidecar Docs Hub](sidecar/README.md)
- [Sidecar System-State Docs Hub](sidecar/system_state/README.md)
- [Python Sidecar and Memory](sidecar/python_sidecar_and_memory.md)
- [Sidecar System-State Collection and Platform Adapter Reference](sidecar/system_state/system_state_collection_and_platform_adapter_reference.md)
- [Sidecar Tool Catalog and Execution Model](sidecar/tool_catalog_and_execution_model.md)
- [Memory Pipeline and Summarization](sidecar/memory_pipeline_and_summarization.md)
- [Browser Automation Stack](sidecar/browser_automation_stack.md)
- [Browser Action Compatibility and Runtime Reference](sidecar/browser_action_compatibility_and_runtime_reference.md)
- [Local Backend JSON-RPC Reference](sidecar/local_backend_jsonrpc_reference.md)
- [Local Backend Process Lifecycle Reference](sidecar/local_backend_process_lifecycle_reference.md)
- [Wakeword Bridge and Audio Framing Reference](sidecar/wakeword_bridge_and_audio_framing_reference.md)

### Contracts

- [Contracts Docs Hub](contracts/README.md)
- [IPC Channels and Event Contracts](contracts/ipc_channels_and_event_contracts.md)
- [IPC Channel and Handler Reference](contracts/ipc_channel_and_handler_reference.md)
- [Schema Generation and Event Guard Reference](contracts/schema_generation_and_event_guard_reference.md)
- [Memory IPC and RPC Mapping Reference](contracts/memory_ipc_and_rpc_mapping_reference.md)
- [Backend Event Consumer Matrix Reference](contracts/backend_event_consumer_matrix_reference.md)
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
