---
summary: "Frontend renderer docs sub-hub for provider ownership, feature modules, stream lifecycle, chat/tool runtime behavior, transcript infrastructure contracts, and global style-system boundaries."
read_when:
  - When changing renderer state providers, chat hooks, or event-to-message rendering logic.
  - When debugging stream tracking, transcript writes, or stale-turn tool output handling.
title: "Frontend Renderer Docs Hub"
---

# Frontend Renderer Docs Hub

## Deep Pages

- [Renderer Runtime](renderer_runtime.md)
- [SDK Desktop Transport Command Contract Reference](desktop_runtime_transport_command_contract_reference.md)
- [Renderer State Change Workflow](renderer_state_change_workflow.md)
- [App Startup and Onboarding Change Workflow](app_startup_onboarding_change_workflow.md)
- [App Startup VM-Mode and Permission Onboarding Runtime Reference](app_startup_vm_mode_and_permission_onboarding_runtime_reference.md)
- [Renderer Chat Docs Hub](chat/README.md)
- [Renderer Settings Docs Hub](settings/README.md)
- [Renderer Permissions Docs Hub](permissions/README.md)
- [Permission Store Gate-State and IPC Action Contract Reference](permissions/permission_store_gate_state_and_ipc_action_contract_reference.md)
- [Permission Store Action Liveness and Active Consumer Map Reference](permissions/permission_store_action_liveness_and_active_consumer_map_reference.md)
- [Permission Onboarding Gate and Manifest Version Runtime Reference](permissions/permission_onboarding_gate_manifest_version_and_data_controls_runtime_reference.md)
- [Permission Status Badge Rendering Reference](permissions/permission_status_badge_row_rendering_and_reason_visibility_reference.md)
- [Renderer Voice Docs Hub](voice/README.md)
- [Renderer Voice Utils Docs Hub](voice/utils/README.md)
- [Renderer Provider Docs Hub](providers/README.md)
- [Renderer Overlay Docs Hub](overlays/README.md)
- [Renderer Infrastructure Docs Hub](infrastructure/README.md)
- [Renderer Infrastructure Audio Docs Hub](infrastructure/audio/README.md)
- [Renderer Transcript Docs Hub](transcript/README.md)
- [Renderer Styles Docs Hub](styles/README.md)
- [Feature Module Matrix](feature_module_matrix.md)
- [Renderer Dashboard Docs Hub](dashboard/README.md)
- [Dashboard Memory Management and Resume Reference](dashboard_memory_management_and_resume_reference.md)
- [Dashboard Shell Docs Hub](dashboard/shell/README.md)
- [Dashboard Sections Docs Hub](dashboard/sections/README.md)
- [Dashboard Section Router and Placeholder Panel Contract Reference](dashboard/shell/dashboard_section_router_and_placeholder_panel_contract_reference.md)
- [Dashboard Sidebar, Search, and Profile Menu Runtime Reference](dashboard/shell/sidebar_search_profile_menu_and_recent_conversation_resume_reference.md)
- [Dashboard Conversation Hook Search, Polling, and Group Bucket Contract Reference](dashboard/shell/dashboard_conversation_hook_search_polling_and_group_bucket_contract_reference.md)
- [Dashboard Recent Conversation Loader, Retry, and Title-Visibility Poll Runtime Reference](dashboard/shell/dashboard_recent_conversation_loader_retry_and_title_visibility_poll_runtime_reference.md)
- [Memory Section Data Normalization and Semantic Delete Contract Reference](dashboard/sections/memory_section_data_normalization_and_semantic_delete_contract_reference.md)
- [Models Section Selection Reconciliation and Dashboard Storage Contract Reference](dashboard/sections/models_section_selection_reconciliation_and_dashboard_storage_contract_reference.md)
- [Usage Section Placeholder Panel and Modal Contract Reference](dashboard/sections/usage_section_placeholder_panel_and_modal_contract_reference.md)
- [Chat Stream and Tool Execution Reference](chat_stream_and_tool_execution_reference.md)
- [Message Send Surface Policy and Screenshot Capture Reference](chat/message_send_surface_policy_and_screenshot_capture_reference.md)
- [Chat Interface Header Controls, Model Selection, and Compaction Rehydrate Reference](chat/chat_interface_header_controls_model_selection_and_compaction_rehydrate_reference.md)
- [Chat Store State and New Session Rotation Reference](chat/chat_store_state_and_new_session_rotation_reference.md)
- [Renderer Chat Stream Docs Hub](chat/stream/README.md)
- [Conversation Gate and Active-Turn Filtering Reference](chat/stream/conversation_gate_and_active_turn_filtering_reference.md)
- [Tracking, Formatting, and Message-Update Utility Reference](chat/stream/tracking_formatting_and_message_update_utility_reference.md)
- [Stream Message Updater Selector Contract Reference](chat/stream/stream_message_updater_selector_contract_reference.md)
- [Renderer Chat Payload Docs Hub](chat/payloads/README.md)
- [Tool Call/Output and Transparency Section Rendering Reference](chat/payloads/tool_call_output_and_transparency_section_rendering_reference.md)
- [Renderer Chat Presentation Docs Hub](chat/presentation/README.md)
- [Chat Stream Store Adapter Boundary and Message-Input Send Guard Reference](chat/presentation/chat_common_actions_selector_boundary_and_message_input_send_guard_reference.md)
- [MessageInput Clipboard Image and Voice Submit Reference](chat/presentation/message_input_clipboard_image_and_voice_submit_reference.md)
- [Data-URL Image Parsing and Attachment Payload Contract Reference](chat/presentation/data_url_image_parsing_and_attachment_payload_contract_reference.md)
- [Thinking Display Overflow, Message List Class Assembly, and Token Count Formatting Reference](chat/presentation/thinking_display_overflow_message_list_class_assembly_and_token_count_formatting_reference.md)
- [Renderer Chat Response-Overlay Presentation Docs Hub](chat/presentation/response_overlay/README.md)
- [Latest Visible Assistant Reply Turn-Boundary and Allowed-Type Contract Reference](chat/presentation/latest_visible_assistant_reply_turn_boundary_and_allowed_type_contract_reference.md)
- [Fixed Response-Pill Height, Scroll Anchor, and Overlay Visibility Re-Report Contract Reference](chat/presentation/response_overlay/fixed_response_pill_height_scroll_and_visibility_rereport_contract_reference.md)
- [Tool Ghost Cursor Markup and Label A11y Contract Reference](chat/presentation/response_overlay/tool_ghost_cursor_markup_and_label_a11y_contract_reference.md)
- [Settings Section Tabs and Wakeword Toggle Runtime Reference](settings/sections/settings_section_tabs_and_wakeword_toggle_runtime_reference.md)
- [Model Settings Change Workflow](settings/model_settings_change_workflow.md)
- [Renderer Config Filter, Storage, and Provider Merge Runtime Reference](settings/config/frontend_config_filter_storage_and_provider_merge_runtime_reference.md)
- [Transcript Session and Rehydrate Reference](transcript_session_and_rehydrate_reference.md)
- [Frontend Renderer Transcript Docs Hub](transcript/README.md)
- [Renderer Transcript Contracts Docs Hub](transcript/contracts/README.md)
- [Transcript Type Contract Reference](transcript/contracts/transcript_entry_type_contract_reference.md)
- [Voice Capture and Wakeword Controller Reference](voice_capture_and_wakeword_controller_reference.md)
- [Voice Mode Gateway Connection and Transcription Region Reference](voice/voice_mode_gateway_connection_and_transcription_region_reference.md)
- [Wakeword Detection IPC Capture and Cooldown Reference](voice/wakeword_detection_ipc_capture_and_cooldown_reference.md)
- [Renderer Voice Components Docs Hub](voice/components/README.md)
- [Voice Status Error, Recording, and Connection Indicator Contract Reference](voice/components/voice_status_error_recording_and_connection_indicator_contract_reference.md)
- [Audio Encoding, Chunk Normalization, and Capture Cleanup Reference](voice/utils/audio_encoding_chunk_normalization_and_capture_cleanup_reference.md)
- [Transcription Region State Machine and Input Edit Reconciliation Reference](voice/utils/transcription_region_state_machine_and_input_edit_reconciliation_reference.md)
- [Entrypoint View Routing and Provider Stack Reference](providers/entrypoint_view_routing_and_provider_stack_reference.md)
- [App Provider Coordinator and Save-Status Runtime Reference](providers/app_provider_coordinator_and_save_status_runtime_reference.md)
- [Renderer Provider Contexts Docs Hub](providers/contexts/README.md)
- [App Config and Status Context Hook Guard and Re-Export Boundary Reference](providers/contexts/app_config_and_status_context_hook_guard_and_reexport_boundary_reference.md)
- [Chat Provider Bootstrap Flag Contract Reference](providers/contexts/chat_provider_bootstrap_flag_contract_reference.md)
- [Renderer Provider Components Docs Hub](providers/components/README.md)
- [Error Boundary Fallback and Component-Tree Crash Isolation Contract Reference](providers/components/error_boundary_fallback_and_component_tree_crash_isolation_contract_reference.md)
- [Renderer Provider Shortcut Docs Hub](providers/shortcuts/README.md)
- [Shift+Tab Mode Toggle and Editable Target Guard Reference](providers/shortcuts/shift_tab_mode_toggle_and_editable_target_guard_reference.md)
- [Chatbox Overlay Input, Drag, and Click-Through Reference](overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Response Overlay Phase Runtime Reference](overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Renderer Overlay Tool Ghost Docs Hub](overlays/tool_ghost/README.md)
- [Tool Ghost Preview Payload Parsing and Target Mapping Reference](overlays/tool_ghost/tool_ghost_preview_payload_parsing_and_target_mapping_reference.md)
- [Renderer Tool-Ghost Lifecycle Docs Hub](overlays/tool_ghost/lifecycle/README.md)
- [Tool Ghost Lifecycle System-State Sampling, Target Resolution, and Click Hide-Timer Reference](overlays/tool_ghost/lifecycle/tool_ghost_lifecycle_system_state_sampling_target_resolution_and_click_hide_timer_reference.md)
- [Tool Ghost Track Style Variable and CSS Animation Contract Reference](overlays/tool_ghost/lifecycle/tool_ghost_track_style_variable_and_css_animation_contract_reference.md)
- [Capture, Artifact URL, and Payload Normalization Reference](infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
- [Incoming Text Normalization Contract Reference](infrastructure/incoming_text_normalization_mojibake_and_lone_surrogate_contract_reference.md)
- [Player Service Queue, Generation, and Error-Recovery Reference](infrastructure/audio/player_service_queue_generation_and_error_recovery_reference.md)
- [Global Theme, Accessibility Utility, and Main Layout Visual Contract Reference](styles/global_theme_accessibility_utility_and_main_layout_visual_contract_reference.md)
- [Chat Interface, Thinking Stream, and Token Count Style Contract Reference](styles/chat_interface_thinking_stream_and_token_count_style_contract_reference.md)
- [Voice Status Visual State Style Contract Reference](styles/voice_status_visual_state_style_contract_reference.md)

## Code Scope

- `frontend/src/renderer/app/providers/*`
- `frontend/src/renderer/features/*`
- `frontend/src/renderer/infrastructure/*`
- `frontend/src/renderer/styles/*`

## Evidence Notes

- Renderer state bugs need selector/store evidence and visible component output
  evidence; one without the other only proves half the path.
- If a renderer component mirrors SDK state, prefer fixing the projection source
  or selector boundary before adding local fallback state.
