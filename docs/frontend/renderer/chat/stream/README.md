---
summary: "Frontend renderer chat stream docs sub-hub for conversation gating, stream-tracking state transitions, and stream utility formatting/update contracts."
read_when:
  - When changing `useChatStream` event routing, stale-conversation filtering, or stream phase transitions.
  - When debugging chunk append behavior, tool event transcript metadata, or stream completion/error bookkeeping.
title: "Frontend Renderer Chat Stream Docs Hub"
---

# Frontend Renderer Chat Stream Docs Hub

## Deep Pages

- [Conversation Event Ingress Fail-Safe and Dispatch Order Reference](conversation_event_ingress_failsafe_and_dispatch_order_reference.md)
- [Conversation Gate and Active-Turn Filtering Reference](conversation_gate_and_active_turn_filtering_reference.md)
- [Event Handler Map and Turn Guard Matrix Reference](event_handler_map_and_turn_guard_matrix_reference.md)
- [Tracking, Formatting, and Message-Update Utility Reference](tracking_formatting_and_message_update_utility_reference.md)
- [Stream Message Updater Selector Contract Reference](stream_message_updater_selector_contract_reference.md)

## Related Pages

- [Frontend Renderer Chat Docs Hub](../README.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
- [Transcript Session and Rehydrate Reference](../../transcript_session_and_rehydrate_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTurnGuardRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamIngressRuntime.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useStreamMessageUpdaters.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTurnGuardRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTrackingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamThinkingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopSdkLiveTurnEffectsRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamEventPayloadRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamMessageUpdateRuntime.ts`
- `tests/frontend/DesktopChatStreamIngressRuntime.test.ts`
- `tests/frontend/DesktopChatStreamIngressRuntime.test.ts`
- `tests/frontend/DesktopChatStreamTrackingRuntime.test.ts`
- `tests/frontend/DesktopChatStreamThinkingRuntime.test.ts`
- `tests/frontend/DesktopChatStreamEventPayloadRuntime.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx`
