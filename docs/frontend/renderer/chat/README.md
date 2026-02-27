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
- [Chat Store State and New Session Rotation Reference](chat_store_state_and_new_session_rotation_reference.md)
- [Renderer Chat Stream Docs Hub](stream/README.md)
- [Conversation Gate and Active-Turn Filtering Reference](stream/conversation_gate_and_active_turn_filtering_reference.md)
- [Tracking, Formatting, and Message-Update Utility Reference](stream/tracking_formatting_and_message_update_utility_reference.md)
- [Stream Message Updater Selector Contract Reference](stream/stream_message_updater_selector_contract_reference.md)
- [Renderer Chat Payload Docs Hub](payloads/README.md)
- [Tool Call/Output and Transparency Section Rendering Reference](payloads/tool_call_output_and_transparency_section_rendering_reference.md)
- [Transcript Message Payload Role, Type, and Rehydrate Shape Reference](payloads/transcript_message_payload_role_type_and_rehydrate_shape_reference.md)
- [Renderer Chat Presentation Docs Hub](presentation/README.md)
- [Chat Common Actions Selector Boundary and Message-Input Send Guard Reference](presentation/chat_common_actions_selector_boundary_and_message_input_send_guard_reference.md)
- [MessageInput Clipboard Image and Voice Submit Reference](presentation/message_input_clipboard_image_and_voice_submit_reference.md)
- [Thinking Display Overflow, Message List Class Assembly, and Stream Token Tracking Reference](presentation/thinking_display_overflow_message_list_class_assembly_and_token_count_formatting_reference.md)
- [Message Action Controls, Source Badge, and Dev-UI Tagging Reference](presentation/message_action_controls_source_badge_and_dev_ui_tagging_reference.md)
- [Renderer Chat Response-Overlay Presentation Docs Hub](presentation/response_overlay/README.md)
- [Auto-Resized Response Height ResizeObserver and Clamp Contract Reference](presentation/response_overlay/auto_resized_response_height_resizeobserver_and_clamp_contract_reference.md)
- [Tool Ghost Cursor Markup and Label A11y Contract Reference](presentation/response_overlay/tool_ghost_cursor_markup_and_label_a11y_contract_reference.md)

## Related Pages

- [Frontend Renderer Docs Hub](../README.md)
- [Chat Stream and Tool Execution Reference](../chat_stream_and_tool_execution_reference.md)
- [Chatbox Overlay Input, Drag, and Click-Through Reference](../overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Transcript Session and Rehydrate Reference](../transcript_session_and_rehydrate_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useStreamMessageUpdaters.ts`
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/hooks/useChatCommonActions.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/utils/chatMessageSenderUtils.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamConversationGate.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamTracking.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamFormatting.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamMessageUpdates.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamEventUtils.ts`
- `frontend/src/renderer/features/chat/utils/transcriptMessagePayload.js`
- `frontend/src/renderer/features/chat/utils/messageTransparency.js`
- `frontend/src/renderer/features/chat/utils/newChatSession.ts`
- `frontend/src/renderer/features/chat/utils/conversationRef.ts`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/components/MessageList.jsx`
- `frontend/src/renderer/features/chat/components/ThinkingDisplay.jsx`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `frontend/src/renderer/features/chat/components/ToolGhostCursor.jsx`
- `frontend/src/renderer/features/chat/components/MessageContent.jsx`
- `frontend/src/renderer/features/chat/components/MessageTransparencySections.jsx`
- `frontend/src/renderer/features/chat/components/TransparencySection.jsx`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `tests/frontend/ChatMessageSender.test.tsx`
- `tests/frontend/ChatStore.test.ts`
- `tests/frontend/ChatStreamTracking.test.ts`
- `tests/frontend/ChatStreamMessageUpdates.test.ts`
- `tests/frontend/ChatStreamFormatting.test.ts`
- `tests/frontend/MessageListThinkingDisplay.test.jsx`
- `tests/frontend/MessageListClasses.test.js`
- `tests/frontend/ThinkingDisplay.test.jsx`
- `tests/frontend/TranscriptMessagePayload.test.js`
