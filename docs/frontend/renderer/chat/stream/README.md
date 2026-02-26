---
summary: "Frontend renderer chat stream docs sub-hub for conversation gating, stream-tracking state transitions, and stream utility formatting/update contracts."
read_when:
  - When changing `useChatStream` event routing, stale-conversation filtering, or stream phase transitions.
  - When debugging chunk append behavior, tool event transcript metadata, or stream completion/error bookkeeping.
title: "Frontend Renderer Chat Stream Docs Hub"
---

# Frontend Renderer Chat Stream Docs Hub

## Deep Pages

- [Conversation Gate and Active-Turn Filtering Reference](conversation_gate_and_active_turn_filtering_reference.md)
- [Tracking, Formatting, and Message-Update Utility Reference](tracking_formatting_and_message_update_utility_reference.md)
- [Stream Message Updater Selector Contract Reference](stream_message_updater_selector_contract_reference.md)

## Related Pages

- [Frontend Renderer Chat Docs Hub](../README.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
- [Transcript Session and Rehydrate Reference](../../transcript_session_and_rehydrate_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useStreamMessageUpdaters.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamConversationGate.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamTracking.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamFormatting.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamMessageUpdates.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamEventUtils.ts`
- `tests/frontend/ChatStreamConversationGate.test.ts`
- `tests/frontend/ChatStreamTracking.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx`
