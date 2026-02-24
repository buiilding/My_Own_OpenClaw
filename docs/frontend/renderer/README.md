---
summary: "Frontend renderer docs sub-hub for provider ownership, feature modules, stream lifecycle, chat/tool runtime behavior, and transcript infrastructure contracts."
read_when:
  - When changing renderer state providers, chat hooks, or event-to-message rendering logic.
  - When debugging stream tracking, transcript writes, or stale-turn tool output handling.
title: "Frontend Renderer Docs Hub"
---

# Frontend Renderer Docs Hub

## Deep Pages

- [Renderer Runtime](renderer_runtime.md)
- [Renderer Chat Docs Hub](chat/README.md)
- [Renderer Settings Docs Hub](settings/README.md)
- [Renderer Voice Docs Hub](voice/README.md)
- [Renderer Voice Utils Docs Hub](voice/utils/README.md)
- [Renderer Provider Docs Hub](providers/README.md)
- [Renderer Overlay Docs Hub](overlays/README.md)
- [Renderer Infrastructure Docs Hub](infrastructure/README.md)
- [Renderer Infrastructure Audio Docs Hub](infrastructure/audio/README.md)
- [Renderer Transcript Docs Hub](transcript/README.md)
- [Feature Module Matrix](feature_module_matrix.md)
- [Dashboard Memory Management and Resume Reference](dashboard_memory_management_and_resume_reference.md)
- [Chat Stream and Tool Execution Reference](chat_stream_and_tool_execution_reference.md)
- [Message Send Surface Policy and Screenshot Capture Reference](chat/message_send_surface_policy_and_screenshot_capture_reference.md)
- [Chat Store State and New Session Rotation Reference](chat/chat_store_state_and_new_session_rotation_reference.md)
- [Renderer Chat Stream Docs Hub](chat/stream/README.md)
- [Conversation Gate and Active-Turn Filtering Reference](chat/stream/conversation_gate_and_active_turn_filtering_reference.md)
- [Tracking, Formatting, and Message-Update Utility Reference](chat/stream/tracking_formatting_and_message_update_utility_reference.md)
- [Renderer Chat Payload Docs Hub](chat/payloads/README.md)
- [Tool Call/Output and Transparency Section Rendering Reference](chat/payloads/tool_call_output_and_transparency_section_rendering_reference.md)
- [Settings Section Display Selection and Config Toggle Reference](settings/settings_section_display_selection_and_config_toggle_reference.md)
- [Transcript Session and Rehydrate Reference](transcript_session_and_rehydrate_reference.md)
- [Transcript Writer Queue Flush and Session Event Reference](transcript/transcript_writer_queue_flush_and_session_event_reference.md)
- [Voice Capture and Wakeword Controller Reference](voice_capture_and_wakeword_controller_reference.md)
- [Voice Mode Gateway Connection and Transcription Region Reference](voice/voice_mode_gateway_connection_and_transcription_region_reference.md)
- [Wakeword Detection IPC Capture and Cooldown Reference](voice/wakeword_detection_ipc_capture_and_cooldown_reference.md)
- [Audio Encoding, Chunk Normalization, and Capture Cleanup Reference](voice/utils/audio_encoding_chunk_normalization_and_capture_cleanup_reference.md)
- [Transcription Region State Machine and Input Edit Reconciliation Reference](voice/utils/transcription_region_state_machine_and_input_edit_reconciliation_reference.md)
- [Entrypoint View Routing and Provider Stack Reference](providers/entrypoint_view_routing_and_provider_stack_reference.md)
- [App Provider Coordinator and Save-Status Runtime Reference](providers/app_provider_coordinator_and_save_status_runtime_reference.md)
- [Renderer Provider Shortcut Docs Hub](providers/shortcuts/README.md)
- [Shift+Tab Mode Toggle and Editable Target Guard Reference](providers/shortcuts/shift_tab_mode_toggle_and_editable_target_guard_reference.md)
- [Chatbox Overlay Input, Drag, and Click-Through Reference](overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Response Overlay Phase and Tool-Ghost Runtime Reference](overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Renderer Overlay Tool Ghost Docs Hub](overlays/tool_ghost/README.md)
- [Tool Ghost Preview Payload Parsing and Target Mapping Reference](overlays/tool_ghost/tool_ghost_preview_payload_parsing_and_target_mapping_reference.md)
- [Tool Execution Service and Hook Runtime Reference](infrastructure/tool_execution_service_and_hook_runtime_reference.md)
- [Capture, Artifact Upload, and Payload Normalization Reference](infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
- [Player Service Queue, Generation, and Error-Recovery Reference](infrastructure/audio/player_service_queue_generation_and_error_recovery_reference.md)

## Code Scope

- `frontend/src/renderer/app/providers/*`
- `frontend/src/renderer/features/*`
- `frontend/src/renderer/infrastructure/*`
