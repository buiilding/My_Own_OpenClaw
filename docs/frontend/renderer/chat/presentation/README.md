---
summary: "Renderer chat presentation docs sub-hub for message input/list/thinking rendering contracts and response-overlay presentation helpers."
read_when:
  - When changing `MessageInput`, `MessageList`, `ThinkingDisplay`, or response-overlay chat presentation components.
  - When modifying chat presentation utility helpers under `frontend/src/renderer/app/runtime/*`.
title: "Renderer Chat Presentation Docs Hub"
---

# Renderer Chat Presentation Docs Hub

## Deep Pages

- [Chatbox Component Split and Overlay Pill Runtime Reference](chatbox_component_split_and_overlay_pill_runtime_reference.md)
- [Chat Stream Store Adapter Boundary and Message-Input Send Guard Reference](chat_common_actions_selector_boundary_and_message_input_send_guard_reference.md)
- [MessageInput Clipboard Image and Voice Submit Reference](message_input_clipboard_image_and_voice_submit_reference.md)
- [Data-URL Image Parsing and Attachment Payload Contract Reference](data_url_image_parsing_and_attachment_payload_contract_reference.md)
- [Thinking Display Overflow, Message List Class Assembly, and Stream Token Tracking Reference](thinking_display_overflow_message_list_class_assembly_and_token_count_formatting_reference.md)
- [Message Action Controls, Source Badge, and Dev-UI Tagging Reference](message_action_controls_source_badge_and_dev_ui_tagging_reference.md)
- [Latest Visible Assistant Reply Turn-Boundary and Allowed-Type Contract Reference](latest_visible_assistant_reply_turn_boundary_and_allowed_type_contract_reference.md)
- [Renderer Chat Response-Overlay Presentation Docs Hub](response_overlay/README.md)
- [Fixed Response-Pill Height, Scroll Anchor, and Overlay Visibility Re-Report Contract Reference](response_overlay/fixed_response_pill_height_scroll_and_visibility_rereport_contract_reference.md)
- [Tool Ghost Cursor Markup and Label A11y Contract Reference](response_overlay/tool_ghost_cursor_markup_and_label_a11y_contract_reference.md)

## Related Pages

- [Frontend Renderer Chat Docs Hub](../README.md)
- [Renderer Chat Stream Docs Hub](../stream/README.md)
- [Renderer Overlay Tool Ghost Docs Hub](../../overlays/tool_ghost/README.md)
- [Voice Mode Gateway Connection and Transcription Region Reference](../../voice/voice_mode_gateway_connection_and_transcription_region_reference.md)
- [Transcription Region State Machine and Input Edit Reconciliation Reference](../../voice/utils/transcription_region_state_machine_and_input_edit_reconciliation_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/components/MessageInput.jsx`
- `frontend/src/renderer/features/chat/components/MessageList.jsx`
- `frontend/src/renderer/features/chat/components/message/AssistantMessageActions.jsx`
- `frontend/src/renderer/features/chat/components/message/UserMessageActions.jsx`
- `frontend/src/renderer/features/chat/components/message/MessageSourceBadge.jsx`
- `frontend/src/renderer/features/chat/components/message/ThinkingDisplay.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- `frontend/src/renderer/features/chat/hooks/useChatSurfaceController.js`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`
- `frontend/src/renderer/features/minimalChatPill/components/PillIcons.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/AttachmentPreviewRow.jsx`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime.js`
- `frontend/src/renderer/features/chat/components/ToolGhostCursor.jsx`
- `frontend/src/renderer/features/chat/hooks/useCopyMessageAction.js`
- `frontend/src/renderer/app/runtime/desktopMessageActionRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMessageInputRuntime.js`
- `frontend/src/renderer/app/runtime/desktopComposerAttachmentRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMessageClassRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMessageListRuntime.js`
- `frontend/src/renderer/app/runtime/desktopAttachmentImageRuntime.js`
- `frontend/src/renderer/features/chat/components/message/content/AttachmentList.jsx`
- `frontend/src/renderer/app/runtime/desktopMessageSourceTagRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMessageTokenUsageRuntime.js`
- `frontend/src/renderer/app/runtime/desktopDevUiRuntime.js`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `tests/frontend/MessageInput.test.jsx`
- `tests/frontend/DesktopComposerAttachmentRuntime.test.js`
- `tests/frontend/DesktopMessageActionRuntime.test.js`
- `tests/frontend/DesktopMessageInputRuntime.test.js`
- `tests/frontend/MessageListAssistantActions.test.jsx`
- `tests/frontend/MessageListThinkingDisplay.test.jsx`
- `tests/frontend/DesktopMessageClassRuntime.test.js`
- `tests/frontend/DesktopMessageListRuntime.test.js`
- `tests/frontend/DesktopAttachmentImageRuntime.test.jsx`
- `tests/frontend/AttachmentDisplayComponents.test.jsx`
- `tests/frontend/DesktopMessageTokenUsageRuntime.test.js`
- `tests/frontend/ThinkingDisplay.test.jsx`
- `tests/frontend/ChatBoxResponse.state.test.jsx`
