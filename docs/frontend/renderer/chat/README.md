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
- `frontend/src/renderer/features/chat/utils/newChatSession.ts`
- `frontend/src/renderer/features/chat/utils/conversationRef.ts`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `tests/frontend/ChatMessageSender.test.tsx`
- `tests/frontend/ChatStore.test.ts`
- `tests/frontend/MessageSendUiPolicy.test.ts`
- `tests/frontend/ChatStreamConversationGate.test.ts`
- `tests/frontend/ChatStreamTracking.test.ts`
