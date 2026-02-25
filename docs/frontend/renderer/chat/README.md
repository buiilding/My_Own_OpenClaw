---
summary: "Frontend renderer chat docs sub-hub for message-send surface policy, screenshot capture/upload flow, conversation-ref rotation, and chat-store state contracts."
read_when:
  - When changing `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts` or chat store/session utilities.
  - When debugging send-path UI behavior differences between main window and overlay chatbox surfaces.
title: "Frontend Renderer Chat Docs Hub"
---

# Frontend Renderer Chat Docs Hub

## Deep Pages

- [Message Send Surface Policy and Screenshot Capture Reference](message_send_surface_policy_and_screenshot_capture_reference.md)
- [Chat Store State and New Session Rotation Reference](chat_store_state_and_new_session_rotation_reference.md)
- [Renderer Chat Stream Docs Hub](stream/README.md)
- [Conversation Gate and Active-Turn Filtering Reference](stream/conversation_gate_and_active_turn_filtering_reference.md)
- [Tracking, Formatting, and Message-Update Utility Reference](stream/tracking_formatting_and_message_update_utility_reference.md)
- [Renderer Chat Payload Docs Hub](payloads/README.md)
- [Tool Call/Output and Transparency Section Rendering Reference](payloads/tool_call_output_and_transparency_section_rendering_reference.md)
- [Renderer Chat Presentation Docs Hub](presentation/README.md)
- [Chat Common Actions Selector Boundary and Message-Input Send Guard Reference](presentation/chat_common_actions_selector_boundary_and_message_input_send_guard_reference.md)
- [Thinking Display Overflow, Message List Class Assembly, and Token Count Formatting Reference](presentation/thinking_display_overflow_message_list_class_assembly_and_token_count_formatting_reference.md)

## Related Pages

- [Frontend Renderer Docs Hub](../README.md)
- [Chat Stream and Tool Execution Reference](../chat_stream_and_tool_execution_reference.md)
- [Chatbox Overlay Input, Drag, and Click-Through Reference](../overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Transcript Session and Rehydrate Reference](../transcript_session_and_rehydrate_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/utils/chatMessageSenderUtils.ts`
- `frontend/src/renderer/features/chat/policies/messageSendUiPolicy.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamConversationGate.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamTracking.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamFormatting.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamMessageUpdates.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamEventUtils.ts`
- `frontend/src/renderer/features/chat/utils/messageTransparency.js`
- `frontend/src/renderer/features/chat/utils/newChatSession.ts`
- `frontend/src/renderer/features/chat/utils/conversationRef.ts`
- `frontend/src/renderer/features/chat/hooks/useChatCommonActions.ts`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/components/MessageList.jsx`
- `frontend/src/renderer/features/chat/components/ThinkingDisplay.jsx`
- `frontend/src/renderer/features/chat/components/TokenCountDisplay.jsx`
- `frontend/src/renderer/features/chat/utils/messageInput.js`
- `frontend/src/renderer/features/chat/utils/messageListClasses.js`
- `frontend/src/renderer/features/chat/utils/tokenCounts.js`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/MessageContent.jsx`
- `frontend/src/renderer/features/chat/components/MessageTransparencySections.jsx`
- `frontend/src/renderer/features/chat/components/TransparencySection.jsx`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `tests/frontend/ChatMessageSender.test.tsx`
- `tests/frontend/ChatStore.test.ts`
- `tests/frontend/MessageSendUiPolicy.test.ts`
- `tests/frontend/ChatStreamConversationGate.test.ts`
- `tests/frontend/ChatStreamTracking.test.ts`
- `tests/frontend/MessageInput.test.jsx`
- `tests/frontend/MessageInputUtils.test.js`
- `tests/frontend/MessageListThinkingDisplay.test.jsx`
- `tests/frontend/MessageListClasses.test.js`
- `tests/frontend/ThinkingDisplay.test.jsx`
- `tests/frontend/TokenCounts.test.js`
- `tests/frontend/MessageContent.test.jsx`
- `tests/frontend/MessageTransparency.test.js`
