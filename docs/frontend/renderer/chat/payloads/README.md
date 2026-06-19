---
summary: "Renderer chat payload docs sub-hub for markdown rendering and sanitization, model-facing tool call/output rendering, details panels, and transparency section assembly."
read_when:
  - When changing `MessageContent`, tool output payload projection, or transparency section components in renderer chat.
  - When changing renderer markdown rendering, markdown sanitization, math rendering, or thread-find highlights.
  - When debugging missing tool details panels, screenshot attachments, or system-prompt/tool-schema visibility.
title: "Renderer Chat Payload Docs Hub"
---

# Renderer Chat Payload Docs Hub

## Deep Pages

- [Tool Call/Output and Transparency Section Rendering Reference](tool_call_output_and_transparency_section_rendering_reference.md)

## Related Pages

- [Frontend Renderer Chat Docs Hub](../README.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)

## Code Scope

- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/MessageContent.jsx`
- `frontend/src/renderer/features/chat/components/message/MessageTransparencySections.jsx`
- `frontend/src/renderer/features/chat/components/message/TransparencySection.jsx`
- `frontend/src/renderer/app/runtime/desktopMessageTransparencyRuntime.js`
- `tests/frontend/MessageContent.test.jsx`
- `tests/frontend/DesktopMessageTransparencyRuntime.test.js`
