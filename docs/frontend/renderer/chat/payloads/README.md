---
summary: "Renderer chat payload docs sub-hub for model-facing tool call/output rendering, details panels, and transparency section assembly."
read_when:
  - When changing `MessageContent`, transcript payload mappers, or transparency section components in renderer chat.
  - When debugging missing tool details panels, edit/retry rehydrate payload shape, screenshot attachments, or system-prompt/tool-schema visibility.
title: "Renderer Chat Payload Docs Hub"
---

# Renderer Chat Payload Docs Hub

## Deep Pages

- [Tool Call/Output and Transparency Section Rendering Reference](tool_call_output_and_transparency_section_rendering_reference.md)
- [Transcript Message Payload Role, Type, and Rehydrate Shape Reference](transcript_message_payload_role_type_and_rehydrate_shape_reference.md)

## Related Pages

- [Frontend Renderer Chat Docs Hub](../README.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
- [Tool Execution Service and Hook Runtime Reference](../../infrastructure/tool_execution_service_and_hook_runtime_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/MessageContent.jsx`
- `frontend/src/renderer/features/chat/components/message/MessageTransparencySections.jsx`
- `frontend/src/renderer/features/chat/components/message/TransparencySection.jsx`
- `frontend/src/renderer/features/chat/utils/session/transcriptMessagePayload.js`
- `frontend/src/renderer/features/chat/utils/message/messageTransparency.js`
- `tests/frontend/MessageContent.test.jsx`
- `tests/frontend/MessageTransparency.test.js`
- `tests/frontend/TranscriptMessagePayload.test.js`
