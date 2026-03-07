---
summary: "Frontend renderer chat docs sub-hub for message-send policy, stream/update flow, tool-runner handling, and transcript persistence contracts."
read_when:
  - When changing `frontend/src/renderer/features/chat/*` hooks/components/store contracts.
  - When debugging send-stream-tool state differences between dashboard and overlay chat surfaces.
title: "Frontend Renderer Chat Docs Hub"
---

# Frontend Renderer Chat Docs Hub

## Deep Pages

- [Message Send Surface Policy and Screenshot Capture Reference](message_send_surface_policy_and_screenshot_capture_reference.md)
- [Chat Interface Header Controls, Model Selection, and Compaction Rehydrate Reference](chat_interface_header_controls_model_selection_and_compaction_rehydrate_reference.md)
- [Chat Store State and New Session Rotation Reference](chat_store_state_and_new_session_rotation_reference.md)
- [Chat Loop UI State Disconnect Recovery and Surface Projection Reference](loop_ui_state_disconnect_recovery_and_surface_projection_reference.md)
- [Renderer Chat Stream Docs Hub](stream/README.md)
- [Conversation Gate and Active-Turn Filtering Reference](stream/conversation_gate_and_active_turn_filtering_reference.md)
- [Tracking, Formatting, and Message-Update Utility Reference](stream/tracking_formatting_and_message_update_utility_reference.md)
- [Stream Message Updater Selector Contract Reference](stream/stream_message_updater_selector_contract_reference.md)
- [Renderer Chat Payload Docs Hub](payloads/README.md)
- [Tool Call/Output and Transparency Section Rendering Reference](payloads/tool_call_output_and_transparency_section_rendering_reference.md)
- [Transcript Message Payload Role, Type, and Rehydrate Shape Reference](payloads/transcript_message_payload_role_type_and_rehydrate_shape_reference.md)
- [Renderer Chat Presentation Docs Hub](presentation/README.md)
- [Chatbox Component Split and Overlay Pill Runtime Reference](presentation/chatbox_component_split_and_overlay_pill_runtime_reference.md)
- [Chat Common Actions Selector Boundary and Message-Input Send Guard Reference](presentation/chat_common_actions_selector_boundary_and_message_input_send_guard_reference.md)
- [MessageInput Clipboard Image and Voice Submit Reference](presentation/message_input_clipboard_image_and_voice_submit_reference.md)
- [Data-URL Image Parsing and Attachment Payload Contract Reference](presentation/data_url_image_parsing_and_attachment_payload_contract_reference.md)
- [Thinking Display Overflow, Message List Class Assembly, and Stream Token Tracking Reference](presentation/thinking_display_overflow_message_list_class_assembly_and_token_count_formatting_reference.md)
- [Message Action Controls, Source Badge, and Dev-UI Tagging Reference](presentation/message_action_controls_source_badge_and_dev_ui_tagging_reference.md)
- [Latest Visible Assistant Reply Turn-Boundary and Allowed-Type Contract Reference](presentation/latest_visible_assistant_reply_turn_boundary_and_allowed_type_contract_reference.md)
- [Renderer Chat Response-Overlay Presentation Docs Hub](presentation/response_overlay/README.md)
- [Fixed Response-Pill Height, Scroll Anchor, and Overlay Visibility Re-Report Contract Reference](presentation/response_overlay/fixed_response_pill_height_scroll_and_visibility_rereport_contract_reference.md)
- [Tool Ghost Cursor Markup and Label A11y Contract Reference](presentation/response_overlay/tool_ghost_cursor_markup_and_label_a11y_contract_reference.md)

## Related Pages

- [Frontend Renderer Docs Hub](../README.md)
- [Chat Stream and Tool Execution Reference](../chat_stream_and_tool_execution_reference.md)
- [Chatbox Overlay Input, Drag, and Click-Through Reference](../overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Transcript Session and Rehydrate Reference](../transcript_session_and_rehydrate_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js`
- `frontend/src/renderer/features/chat/hooks/useChatLoopUiState.js`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useStreamMessageUpdaters.ts`
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/hooks/useChatCommonActions.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/utils/messageSender/chatMessageSenderUtils.ts`
- `frontend/src/renderer/features/chat/utils/messageSender/chatMessageSenderPayloads.ts`
- `frontend/src/renderer/features/chat/utils/messageSender/readableFileAttachmentContext.ts`
- `frontend/src/renderer/features/chat/utils/state/chatLoopUiState.js`
- `frontend/src/renderer/features/chat/utils/state/streamPhaseState.js`
- `frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamConversationGate.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamTracking.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamFormatting.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamMessageUpdates.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamEventUtils.ts`
- `frontend/src/renderer/features/chat/utils/session/transcriptMessagePayload.js`
- `frontend/src/renderer/features/chat/utils/message/messageTransparency.js`
- `frontend/src/renderer/features/chat/utils/session/newChatSession.ts`
- `frontend/src/renderer/features/chat/utils/session/conversationRef.ts`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/components/MessageList.jsx`
- `frontend/src/renderer/features/chat/components/message/ThinkingDisplay.jsx`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `frontend/src/renderer/features/chat/components/ToolGhostCursor.jsx`
- `frontend/src/renderer/features/chat/components/MessageContent.jsx`
- `frontend/src/renderer/features/chat/components/message/MessageTransparencySections.jsx`
- `frontend/src/renderer/features/chat/components/message/TransparencySection.jsx`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `tests/frontend/ChatMessageSender.test.tsx`
- `tests/frontend/ChatLoopUiState.test.js`
- `tests/frontend/ChatLoopUiStateHook.test.jsx`
- `tests/frontend/ChatStore.test.ts`
- `tests/frontend/ChatStreamTracking.test.ts`
- `tests/frontend/ChatStreamMessageUpdates.test.ts`
- `tests/frontend/ChatStreamFormatting.test.ts`
- `tests/frontend/MessageListThinkingDisplay.test.jsx`
- `tests/frontend/MessageListClasses.test.js`
- `tests/frontend/ThinkingDisplay.test.jsx`
- `tests/frontend/TranscriptMessagePayload.test.js`
