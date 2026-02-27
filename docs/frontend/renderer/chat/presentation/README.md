---
summary: "Renderer chat presentation docs sub-hub for message input/list/thinking rendering contracts and response-overlay presentation helpers."
read_when:
  - When changing `MessageInput`, `MessageList`, `ThinkingDisplay`, or response-overlay chat presentation components.
  - When modifying chat presentation utility helpers under `frontend/src/renderer/features/chat/utils/*`.
title: "Renderer Chat Presentation Docs Hub"
---

# Renderer Chat Presentation Docs Hub

## Deep Pages

- [Chat Common Actions Selector Boundary and Message-Input Send Guard Reference](chat_common_actions_selector_boundary_and_message_input_send_guard_reference.md)
- [MessageInput Clipboard Image and Voice Submit Reference](message_input_clipboard_image_and_voice_submit_reference.md)
- [Thinking Display Overflow, Message List Class Assembly, and Stream Token Tracking Reference](thinking_display_overflow_message_list_class_assembly_and_token_count_formatting_reference.md)
- [Message Action Controls, Source Badge, and Dev-UI Tagging Reference](message_action_controls_source_badge_and_dev_ui_tagging_reference.md)
- [Renderer Chat Response-Overlay Presentation Docs Hub](response_overlay/README.md)
- [Auto-Resized Response Height ResizeObserver and Clamp Contract Reference](response_overlay/auto_resized_response_height_resizeobserver_and_clamp_contract_reference.md)
- [Tool Ghost Cursor Markup and Label A11y Contract Reference](response_overlay/tool_ghost_cursor_markup_and_label_a11y_contract_reference.md)

## Related Pages

- [Frontend Renderer Chat Docs Hub](../README.md)
- [Renderer Chat Stream Docs Hub](../stream/README.md)
- [Renderer Overlay Tool Ghost Docs Hub](../../overlays/tool_ghost/README.md)
- [Voice Mode Gateway Connection and Transcription Region Reference](../../voice/voice_mode_gateway_connection_and_transcription_region_reference.md)
- [Transcription Region State Machine and Input Edit Reconciliation Reference](../../voice/utils/transcription_region_state_machine_and_input_edit_reconciliation_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/hooks/useChatCommonActions.ts`
- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/components/MessageList.jsx`
- `frontend/src/renderer/features/chat/components/AssistantMessageActions.jsx`
- `frontend/src/renderer/features/chat/components/UserMessageActions.jsx`
- `frontend/src/renderer/features/chat/components/MessageSourceBadge.jsx`
- `frontend/src/renderer/features/chat/components/ThinkingDisplay.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `frontend/src/renderer/features/chat/components/ToolGhostCursor.jsx`
- `frontend/src/renderer/features/chat/hooks/useAutoResizedResponseHeight.js`
- `frontend/src/renderer/features/chat/hooks/useCopyMessageAction.js`
- `frontend/src/renderer/features/chat/utils/messageInput.js`
- `frontend/src/renderer/features/chat/utils/messageListClasses.js`
- `frontend/src/renderer/features/chat/utils/sourceTags.js`
- `frontend/src/renderer/features/chat/utils/devUiFlag.js`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `tests/frontend/MessageInput.test.jsx`
- `tests/frontend/MessageInputUtils.test.js`
- `tests/frontend/MessageListAssistantActions.test.jsx`
- `tests/frontend/MessageListThinkingDisplay.test.jsx`
- `tests/frontend/MessageListClasses.test.js`
- `tests/frontend/ThinkingDisplay.test.jsx`
- `tests/frontend/ChatBoxResponse.state.test.jsx`
