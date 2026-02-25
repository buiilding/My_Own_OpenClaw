---
summary: "Renderer chat presentation docs sub-hub for shared chat action selectors, input send guards, thinking stream overflow behavior, message list class assembly, and token-count display formatting contracts."
read_when:
  - When changing `frontend/src/renderer/features/chat/components/MessageInput.jsx`, `MessageList.jsx`, `ThinkingDisplay.jsx`, or `TokenCountDisplay.jsx`.
  - When modifying `useChatCommonActions` selector wiring or chat presentation utility helpers under `frontend/src/renderer/features/chat/utils/*`.
title: "Renderer Chat Presentation Docs Hub"
---

# Renderer Chat Presentation Docs Hub

## Deep Pages

- [Chat Common Actions Selector Boundary and Message-Input Send Guard Reference](chat_common_actions_selector_boundary_and_message_input_send_guard_reference.md)
- [Thinking Display Overflow, Message List Class Assembly, and Token Count Formatting Reference](thinking_display_overflow_message_list_class_assembly_and_token_count_formatting_reference.md)

## Related Pages

- [Frontend Renderer Chat Docs Hub](../README.md)
- [Renderer Chat Stream Docs Hub](../stream/README.md)
- [Voice Mode Gateway Connection and Transcription Region Reference](../../voice/voice_mode_gateway_connection_and_transcription_region_reference.md)
- [Transcription Region State Machine and Input Edit Reconciliation Reference](../../voice/utils/transcription_region_state_machine_and_input_edit_reconciliation_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/hooks/useChatCommonActions.ts`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/components/MessageList.jsx`
- `frontend/src/renderer/features/chat/components/ThinkingDisplay.jsx`
- `frontend/src/renderer/features/chat/components/TokenCountDisplay.jsx`
- `frontend/src/renderer/features/chat/utils/messageInput.js`
- `frontend/src/renderer/features/chat/utils/messageListClasses.js`
- `frontend/src/renderer/features/chat/utils/tokenCounts.js`
- `tests/frontend/MessageInput.test.jsx`
- `tests/frontend/MessageInputUtils.test.js`
- `tests/frontend/MessageListThinkingDisplay.test.jsx`
- `tests/frontend/MessageListClasses.test.js`
- `tests/frontend/ThinkingDisplay.test.jsx`
- `tests/frontend/TokenCounts.test.js`
