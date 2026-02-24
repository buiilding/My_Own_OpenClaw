---
summary: "Renderer chat payload docs sub-hub for model-facing tool call/output rendering, details panels, and transparency section assembly."
read_when:
  - When changing `MessageContent` or transparency section components in renderer chat.
  - When debugging missing tool details panels, screenshot attachments, or system-prompt/tool-schema visibility.
title: "Renderer Chat Payload Docs Hub"
---

# Renderer Chat Payload Docs Hub

## Deep Pages

- [Tool Call/Output and Transparency Section Rendering Reference](tool_call_output_and_transparency_section_rendering_reference.md)

## Related Pages

- [Frontend Renderer Chat Docs Hub](../README.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
- [Tool Execution Service and Hook Runtime Reference](../../infrastructure/tool_execution_service_and_hook_runtime_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/components/MessageContent.jsx`
- `frontend/src/renderer/features/chat/components/MessageTransparencySections.jsx`
- `frontend/src/renderer/features/chat/components/TransparencySection.jsx`
- `frontend/src/renderer/features/chat/utils/messageTransparency.js`
- `tests/frontend/MessageContent.test.jsx`
- `tests/frontend/MessageTransparency.test.js`
