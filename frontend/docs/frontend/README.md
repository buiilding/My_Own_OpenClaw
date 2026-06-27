---
summary: "Desktop app implementation hub covering Electron main process, renderer runtime, tool execution services, and local-runtime implementation behavior."
read_when:
  - When changing frontend architecture across main, renderer, or local-runtime implementation boundaries.
  - When tracing query/tool message flow from UI to backend and back.
title: "Frontend Functionality Map"
---

# Frontend Functionality Map

This hub documents WindieOS desktop app implementation details across Electron
main process, React renderer, and the local-runtime Python implementation.

## Full Inventory

- [Frontend Inventory Docs Hub](inventory/README.md)
- [Frontend Full Functionality Inventory Reference](inventory/frontend_full_functionality_inventory_reference.md)
- [Frontend Functionality Capability Catalog Reference](inventory/frontend_functionality_capability_catalog_reference.md)
- [Frontend Capability to File Matrix Reference](inventory/frontend_capability_to_file_matrix_reference.md)
- [Frontend Runtime Surface Matrix Reference](inventory/frontend_runtime_surface_matrix_reference.md)
- [Frontend Module File Index Reference](inventory/frontend_module_file_index_reference.md)
- [Frontend IPC and Local-Runtime Contract Touchpoints Reference](inventory/frontend_ipc_and_sidecar_contract_touchpoints_reference.md)
- [Frontend Inventory Domains Hub](inventory/domains/README.md)
- [Frontend Inventory Protocols Hub](inventory/protocols/README.md)

## Change Workflows

- [IPC Change Workflow](ipc_change_workflow.md)
- [Query Send and Stream Relay Change Workflow](main/query_send_and_stream_relay_change_workflow.md)
- [Local-Runtime Tool Change Workflow](local_runtime_tool_change_workflow.md)
- [Local-Runtime Process Lifecycle Change Workflow](main/local_backend/process_lifecycle_change_workflow.md)
- [Local Runtime JSON-RPC Change Workflow](sidecar/local_backend_jsonrpc_change_workflow.md)

## Deep Pages

### Landing

- [Landing Docs Hub](landing/README.md)
- [Landing Page Runtime and Content Reference](landing/landing_page_runtime_and_content_reference.md)
- [Landing Sections Docs Hub](landing/sections/README.md)
- [Hero, How, Available, and Roadmap Section Content Contract Reference](landing/sections/hero_how_available_and_roadmap_section_content_contract_reference.md)

### Main Process

- [Main Docs Hub](main/README.md)
- [Main Overlay Focus Docs Hub](main/overlays/README.md)
- [Electron Main and IPC](main/electron_main_and_ipc.md)
- [Window and Overlay Lifecycle](main/window_and_overlay_lifecycle.md)
- [Main Window Runtime Factory and Overlay Bootstrap Reference](main/main_window_runtime_factory_and_overlay_bootstrap_reference.md)
- [Main Window Icon and Overlay Runtime Reference](main/main_window_icon_and_overlay_runtime_reference.md)
- [Main Process Lifecycle, Overlay IPC, and Window Visibility Runtime Reference](main/main_process_lifecycle_overlay_ipc_and_window_visibility_runtime_reference.md)
- [Display-Affinity Monitor Selection and Screenshot Bounds Reference](main/display_affinity_runtime_monitor_selection_and_screenshot_bounds_reference.md)
- [Display Query Handler Display Inventory Payload Contract Reference](main/display_query_handler_display_inventory_payload_contract_reference.md)
- [Runtime Paths and Endpoints](main/runtime_paths_and_endpoints.md)
- [Query Send and Stream Relay Change Workflow](main/query_send_and_stream_relay_change_workflow.md)
- [Query Payload and Relay Reference](main/query_payload_and_relay_reference.md)
- [WebSocket Handshake and Settings Sync Reference](main/websocket_handshake_and_settings_sync_reference.md)
- [Wakeword Bridge Runtime Helper Reference](main/wakeword_bridge_runtime_helper_reference.md)
- [VM Worker Runs Bridge Runtime Reference](main/vm_worker_runs_bridge_runtime_reference.md)
- [IPC Helper Module Split and Runtime Boundary Reference](main/ipc_helper_module_split_and_runtime_boundary_reference.md)
- [IPC Query Runtime and Transcript Sync Helper Reference](main/ipc_query_runtime_and_transcript_sync_helper_reference.md)
- [Main Local-Runtime Docs Hub](main/local_backend/README.md)
- [Local-Runtime Process Lifecycle Change Workflow](main/local_backend/process_lifecycle_change_workflow.md)
- [Main Testing Docs Hub](main/testing/README.md)
- [Main Testing Data-Seed Docs Hub](main/testing/data_seed/README.md)
- [Local Runtime Bridge Overview and Window Guard Index](main/local_runtime_bridge_handler_and_window_guard_reference.md)
- [Local-Runtime Process Lifecycle, Readiness, and Request-Correlation Reference](main/local_backend/process_lifecycle_readiness_and_request_correlation_reference.md)
- [Local-Runtime RPC Handler Registry and Payload-Mapper Reference](main/local_backend/rpc_handler_registry_and_payload_mapper_reference.md)
- [Mock Memory Seed Script and NPM Entrypoints Reference](main/testing/data_seed/mock_memory_seed_script_and_npm_entrypoints_reference.md)
- [Overlay Query-Capture Blur and Settle Reference](main/overlays/external_focus_snapshot_restore_and_query_capture_reference.md)
- [Linux Screenshot Window Visibility Reference](main/overlays/linux_screenshot_window_hide_and_restore_guard_reference.md)
- [Permission Manifest, Probe, and IPC Request Contract Reference](main/permission_manifest_probe_and_request_ipc_reference.md)

### Preload Boundary

- [Preload Docs Hub](preload/README.md)
- [Preload Channel Allowlist and Renderer Bridge Reference](preload/preload_channel_allowlist_and_renderer_bridge_reference.md)

### Renderer

- [Renderer Docs Hub](renderer/README.md)
- [Renderer Chat Docs Hub](renderer/chat/README.md)
- [Renderer Settings Docs Hub](renderer/settings/README.md)
- [Model Settings Change Workflow](renderer/settings/model_settings_change_workflow.md)
- [Renderer Permissions Docs Hub](renderer/permissions/README.md)
- [Renderer Voice Docs Hub](renderer/voice/README.md)
- [Renderer Voice Utils Docs Hub](renderer/voice/utils/README.md)
- [Renderer Provider Docs Hub](renderer/providers/README.md)
- [Renderer Overlay Docs Hub](renderer/overlays/README.md)
- [Renderer Infrastructure Docs Hub](renderer/infrastructure/README.md)
- [Renderer Infrastructure Audio Docs Hub](renderer/infrastructure/audio/README.md)
- [Renderer Transcript Docs Hub](renderer/transcript/README.md)
- [Renderer Styles Docs Hub](renderer/styles/README.md)
- [Renderer Transcript Contracts Docs Hub](renderer/transcript/contracts/README.md)
- [Renderer Runtime](renderer/renderer_runtime.md)
- [App Startup and Onboarding Change Workflow](renderer/app_startup_onboarding_change_workflow.md)
- [App Startup VM-Mode and Permission Onboarding Runtime Reference](renderer/app_startup_vm_mode_and_permission_onboarding_runtime_reference.md)
- [Feature Module Matrix](renderer/feature_module_matrix.md)
- [Renderer Dashboard Docs Hub](renderer/dashboard/README.md)
- [Dashboard Change Workflow](renderer/dashboard/dashboard_change_workflow.md)
- [Dashboard Memory Management and Resume Reference](renderer/dashboard_memory_management_and_resume_reference.md)
- [Dashboard Shell Docs Hub](renderer/dashboard/shell/README.md)
- [Dashboard Sections Docs Hub](renderer/dashboard/sections/README.md)
- [Dashboard Section Router and Placeholder Panel Contract Reference](renderer/dashboard/shell/dashboard_section_router_and_placeholder_panel_contract_reference.md)
- [Dashboard Sidebar, Search, and Profile Menu Runtime Reference](renderer/dashboard/shell/sidebar_search_profile_menu_and_recent_conversation_resume_reference.md)
- [Dashboard Conversation Hook Search, Polling, and Group Bucket Contract Reference](renderer/dashboard/shell/dashboard_conversation_hook_search_polling_and_group_bucket_contract_reference.md)
- [Dashboard Recent Conversation Loader, Retry, and Title-Visibility Poll Runtime Reference](renderer/dashboard/shell/dashboard_recent_conversation_loader_retry_and_title_visibility_poll_runtime_reference.md)
- [Memory Section Data Normalization and Semantic Delete Contract Reference](renderer/dashboard/sections/memory_section_data_normalization_and_semantic_delete_contract_reference.md)
- [Models Section Selection Reconciliation and Dashboard Storage Contract Reference](renderer/dashboard/sections/models_section_selection_reconciliation_and_dashboard_storage_contract_reference.md)
- [Usage Section Placeholder Panel and Modal Contract Reference](renderer/dashboard/sections/usage_section_placeholder_panel_and_modal_contract_reference.md)
- [Chat Stream and Tool Execution Reference](renderer/chat_stream_and_tool_execution_reference.md)
- [Message Send Surface Policy and Screenshot Capture Reference](renderer/chat/message_send_surface_policy_and_screenshot_capture_reference.md)
- [Chat Store State and New Session Rotation Reference](renderer/chat/chat_store_state_and_new_session_rotation_reference.md)
- [Renderer Chat Presentation Docs Hub](renderer/chat/presentation/README.md)
- [Chat Stream Store Adapter Boundary and Message-Input Send Guard Reference](renderer/chat/presentation/chat_common_actions_selector_boundary_and_message_input_send_guard_reference.md)
- [MessageInput Clipboard Image and Voice Submit Reference](renderer/chat/presentation/message_input_clipboard_image_and_voice_submit_reference.md)
- [Data-URL Image Parsing and Attachment Payload Contract Reference](renderer/chat/presentation/data_url_image_parsing_and_attachment_payload_contract_reference.md)
- [Thinking Display Overflow, Message List Class Assembly, and Token Count Formatting Reference](renderer/chat/presentation/thinking_display_overflow_message_list_class_assembly_and_token_count_formatting_reference.md)
- [Settings Section Tabs and Wakeword Toggle Runtime Reference](renderer/settings/sections/settings_section_tabs_and_wakeword_toggle_runtime_reference.md)
- [Frontend Model Settings Change Workflow](renderer/settings/model_settings_change_workflow.md)
- [Permission Onboarding Gate and Manifest Version Runtime Reference](renderer/permissions/permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)
- [Permission Store Action Liveness and Active Consumer Map Reference](renderer/permissions/permission_store_action_liveness_and_active_consumer_map_reference.md)
- [Permission Status Badge Rendering Reference](renderer/permissions/permission_status_badge_row_rendering_and_reason_visibility_reference.md)
- [Renderer Config Filter, Storage, and Provider Merge Runtime Reference](renderer/settings/config/frontend_config_filter_storage_and_provider_merge_runtime_reference.md)
- [Transcript Session and Rehydrate Reference](renderer/transcript_session_and_rehydrate_reference.md)
- [Frontend Renderer Transcript Docs Hub](renderer/transcript/README.md)
- [Transcript Type Contract Reference](renderer/transcript/contracts/transcript_entry_type_contract_reference.md)
- [Voice Capture and Wakeword Controller Reference](renderer/voice_capture_and_wakeword_controller_reference.md)
- [Voice Mode Gateway Connection and Transcription Region Reference](renderer/voice/voice_mode_gateway_connection_and_transcription_region_reference.md)
- [Wakeword Detection IPC Capture and Cooldown Reference](renderer/voice/wakeword_detection_ipc_capture_and_cooldown_reference.md)
- [Renderer Voice Components Docs Hub](renderer/voice/components/README.md)
- [Voice Status Error, Recording, and Connection Indicator Contract Reference](renderer/voice/components/voice_status_error_recording_and_connection_indicator_contract_reference.md)
- [Audio Encoding, Chunk Normalization, and Capture Cleanup Reference](renderer/voice/utils/audio_encoding_chunk_normalization_and_capture_cleanup_reference.md)
- [Transcription Region State Machine and Input Edit Reconciliation Reference](renderer/voice/utils/transcription_region_state_machine_and_input_edit_reconciliation_reference.md)
- [Entrypoint View Routing and Provider Stack Reference](renderer/providers/entrypoint_view_routing_and_provider_stack_reference.md)
- [App Provider Coordinator and Save-Status Runtime Reference](renderer/providers/app_provider_coordinator_and_save_status_runtime_reference.md)
- [Renderer Provider Contexts Docs Hub](renderer/providers/contexts/README.md)
- [App Config and Status Context Hook Guard and Re-Export Boundary Reference](renderer/providers/contexts/app_config_and_status_context_hook_guard_and_reexport_boundary_reference.md)
- [Chat Provider Bootstrap Flag Contract Reference](renderer/providers/contexts/chat_provider_bootstrap_flag_contract_reference.md)
- [Renderer Provider Components Docs Hub](renderer/providers/components/README.md)
- [Error Boundary Fallback and Component-Tree Crash Isolation Contract Reference](renderer/providers/components/error_boundary_fallback_and_component_tree_crash_isolation_contract_reference.md)
- [Chatbox Overlay Input, Drag, and Click-Through Reference](renderer/overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Response Overlay Phase Runtime Reference](renderer/overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Renderer Overlay Tool Ghost Docs Hub](renderer/overlays/tool_ghost/README.md)
- [Tool Ghost Preview Payload Parsing and Target Mapping Reference](renderer/overlays/tool_ghost/tool_ghost_preview_payload_parsing_and_target_mapping_reference.md)
- [Renderer Tool-Ghost Lifecycle Docs Hub](renderer/overlays/tool_ghost/lifecycle/README.md)
- [Tool Ghost Lifecycle System-State Sampling, Target Resolution, and Click Hide-Timer Reference](renderer/overlays/tool_ghost/lifecycle/tool_ghost_lifecycle_system_state_sampling_target_resolution_and_click_hide_timer_reference.md)
- [Tool Ghost Track Style Variable and CSS Animation Contract Reference](renderer/overlays/tool_ghost/lifecycle/tool_ghost_track_style_variable_and_css_animation_contract_reference.md)
- [Capture, Artifact URL, and Payload Normalization Reference](renderer/infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
- [Incoming Text Normalization Contract Reference](renderer/infrastructure/incoming_text_normalization_mojibake_and_lone_surrogate_contract_reference.md)
- [Player Service Queue, Generation, and Error-Recovery Reference](renderer/infrastructure/audio/player_service_queue_generation_and_error_recovery_reference.md)
- [Global Theme, Accessibility Utility, and Main Layout Visual Contract Reference](renderer/styles/global_theme_accessibility_utility_and_main_layout_visual_contract_reference.md)
- [Chat Interface, Thinking Stream, and Token Count Style Contract Reference](renderer/styles/chat_interface_thinking_stream_and_token_count_style_contract_reference.md)
- [Voice Status Visual State Style Contract Reference](renderer/styles/voice_status_visual_state_style_contract_reference.md)

### Runtime

- [Runtime Docs Hub](runtime/README.md)
- [Tool Execution and Streaming](runtime/tool_execution_and_streaming.md)
- [Stream Event State Machine](runtime/stream_event_state_machine.md)
- [Overlay Phase and Surface Change Workflow](runtime/overlay_phase_and_surface_change_workflow.md)
- [Workspace Context Change Workflow](runtime/workspace_context_change_workflow.md)
- [Frontend Runtime Surface: Main, Renderer, Local Runtime, and VM Worker](runtime/frontend_runtime_surface_main_renderer_sidecar_and_vm_worker_reference.md)
- [Config Sync and Settings Lifecycle Reference](runtime/config_sync_and_settings_lifecycle_reference.md)
- [Audio Chunk Playback and Stop Semantics Reference](runtime/audio_chunk_playback_and_stop_semantics_reference.md)

### Local-Runtime Python

- [Local Runtime Python Implementation Docs Hub](sidecar/README.md)
- [Local-Runtime Core Docs Hub](sidecar/core/README.md)
- [Local-Runtime Services Docs Hub](sidecar/services/README.md)
- [Local-Runtime Source Maps Docs Hub](sidecar/source_maps/README.md)
- [Local-Runtime System-State Docs Hub](sidecar/system_state/README.md)
- [Local-Runtime Tools Docs Hub](sidecar/tools/README.md)
- [Local-Runtime Tool Registry Docs Hub](sidecar/tools/registry/README.md)
- [Local-Runtime Computer Tools Docs Hub](sidecar/tools/computer/README.md)
- [Local-Runtime System Tools Docs Hub](sidecar/tools/system/README.md)
- [Local Runtime Memory Docs Hub](sidecar/memory/README.md)
- [Local Runtime Memory Storage Docs Hub](sidecar/memory/storage/README.md)
- [Local-Runtime Python and Memory](sidecar/python_sidecar_and_memory.md)
- [Local Runtime JSON-RPC Change Workflow](sidecar/local_backend_jsonrpc_change_workflow.md)
- [Local-Runtime System-State Collection and Platform Adapter Reference](sidecar/system_state/system_state_collection_and_platform_adapter_reference.md)
- [Local-Runtime Tool Catalog and Execution Model](sidecar/tool_catalog_and_execution_model.md)
- [Local-Runtime Shell and Process Session Runtime Reference](sidecar/tools/shell_and_process_session_runtime_reference.md)
- [Local-Runtime Filesystem Read and Replace Runtime Reference](sidecar/tools/filesystem_read_replace_runtime_reference.md)
- [Local-Runtime Registry and Result Contract](sidecar/tools/registry/tool_registry_exposed_schema_and_result_contract_reference.md)
- [Local-Runtime Mouse, Keyboard, Scroll, and Screenshot Runtime Reference](sidecar/tools/computer/mouse_keyboard_scroll_and_screenshot_runtime_reference.md)
- [Local-Runtime Wait, Window, and Stats Runtime Reference](sidecar/tools/system/wait_window_stats_runtime_reference.md)
- [Memory Pipeline and Summarization](sidecar/memory_pipeline_and_summarization.md)
- [Local-Runtime Summarizer Watermark and Conversation Batch Reference](sidecar/memory/summarizer_watermark_and_conversation_batch_reference.md)
- [Local Runtime Memory Store Embedding, Search, and Memory-Type Routing Reference](sidecar/memory/storage/local_memory_store_embedding_search_and_memory_type_routing_reference.md)
- [Local Runtime SQLite Schema Migration, FAISS Index I/O, and Watermark State Reference](sidecar/memory/storage/sqlite_schema_migration_faiss_index_and_watermark_state_reference.md)
- [Local-Runtime Browser Docs Hub](sidecar/browser/README.md)
- [Local-Runtime Browser Contracts Docs Hub](sidecar/browser/contracts/README.md)
- [Local-Runtime Browser Chrome Docs Hub](sidecar/browser/chrome/README.md)
- [Browser Automation Stack](sidecar/browser_automation_stack.md)
- [Browser Action Runtime Reference](sidecar/browser_action_runtime_reference.md)
- [Schema Registry and Action Validation Boundary Reference](sidecar/browser/contracts/schema_registry_and_action_validation_boundary_reference.md)
- [Chrome Detection, Launcher, and CDP Session Reference](sidecar/browser/chrome/chrome_detection_launcher_and_cdp_session_reference.md)
- [Local Runtime JSON-RPC Reference](sidecar/local_backend_jsonrpc_reference.md)
- [SDK-Owned Local-Runtime Lifecycle Reference](sidecar/local_backend_process_lifecycle_reference.md)
- [Wakeword Bridge and Audio Framing Reference](sidecar/wakeword_bridge_and_audio_framing_reference.md)
- [JSON-RPC Protocol and Stdout Framing Reference](sidecar/core/json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md)
- [Backend Config Env-Precedence Reference](sidecar/core/backend_config_env_precedence_trailing_slash_normalization_and_default_url_contract_reference.md)
- [Remote Semantic Client Reference](sidecar/core/remote_semantic_client_summarize_payload_timeout_and_error_surface_contract_reference.md)
- [Wakeword Service Model Bootstrap and Binary Framing Reference](sidecar/services/wakeword_service_model_bootstrap_and_binary_framing_reference.md)
- [Local-Runtime Python Folder Topology and Package `__init__` Export Surface Reference](sidecar/source_maps/python_sidecar_folder_topology_and_package_init_export_surface_reference.md)

### Contracts

- [Contracts Docs Hub](contracts/README.md)
- [Contracts Events Docs Hub](contracts/events/README.md)
- [Contracts Events Tool Runtime Docs Hub](contracts/events/tool_runtime/README.md)
- [Contracts IPC Docs Hub](contracts/ipc/README.md)
- [IPC Channels and Event Contracts](contracts/ipc_channels_and_event_contracts.md)
- [IPC Channel and Handler Reference](contracts/ipc_channel_and_handler_reference.md)
- [Preload Allowlist and Channel-Constant Parity Reference](contracts/ipc/preload_allowlist_and_channel_constant_parity_reference.md)
- [Main-Process IPC Handler Ownership and RPC Mapper Reference](contracts/ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)
- [Runtime Event Guard Reference](contracts/schema_generation_and_event_guard_reference.md)
- [Memory IPC and RPC Mapping Reference](contracts/memory_ipc_and_rpc_mapping_reference.md)
- [Backend Event Consumer Matrix Reference](contracts/backend_event_consumer_matrix_reference.md)
- [From-Backend Event Ingress, Typed Guard, and Audio Side-Channel Reference](contracts/events/from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md)
- [Local User Message and Query Send-Failure Synthesis Reference](contracts/events/local_user_message_and_query_send_failure_synthesis_reference.md)
- [Settings and Model ACK Event Routing Reference](contracts/events/settings_and_model_ack_event_routing_reference.md)
- [Tool-Call and Tool-Output Recovery/Skip-Execution Contract Reference](contracts/events/tool_runtime/tool_call_and_tool_output_recovery_skip_execution_contract_reference.md)
- [Overlay and Wakeword Control Channel Reference](contracts/overlay_and_wakeword_control_channel_reference.md)

## Frontend Code Layout

- `frontend/src/main`: Electron main process, SDK runtime adapter, wakeword bridge, query payload enrichment
- `frontend/src/preload.js`: sandbox-safe IPC exposure to renderer
- `frontend/src/renderer`: React app, contexts, feature modules, infrastructure services
- `frontend/src/main/python`: local-runtime Python implementation, memory service, wakeword subprocess, tool implementations
- `frontend/src/landing`: standalone landing page entrypoint, section composition, and shared marketing style system

## End-to-End Runtime Path (Condensed)

1. Renderer sends query via typed IPC bridge.
2. Main process gates initial settings sync, enriches query with system context + memory search.
3. Main process forwards query through the SDK runtime.
4. Backend streams events back through the SDK runtime; main relays display events to renderer.
5. Renderer stream hook updates chat state and transcript.
6. SDK runtime routes tool events to the SDK local runtime and posts tool results back to backend.
7. Renderer receives SDK-owned tool events as display-only chat/transcript events.

## Evidence Notes

- Frontend fixes should identify whether the evidence comes from Electron main,
  SDK runtime, renderer state, or local-runtime Python output.
- For stale UI, verify the active selector inputs before patching the rendered
  component that displays the stale state.
