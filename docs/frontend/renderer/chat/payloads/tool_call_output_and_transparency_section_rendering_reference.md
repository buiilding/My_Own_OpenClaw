---
summary: "Deep reference for renderer chat payload surfaces: tool-call/tool-output card rendering, screenshot source selection, and transparency section configuration/validation."
read_when:
  - When changing model-facing tool payload display behavior in message rows.
  - When changing system prompt/tool schemas/full-user-message transparency section assembly.
title: "Tool Call/Output and Transparency Section Rendering Reference"
---

# Tool Call/Output and Transparency Section Rendering Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/MessageContent.jsx`
- `frontend/src/renderer/features/chat/components/MessageTransparencySections.jsx`
- `frontend/src/renderer/features/chat/components/TransparencySection.jsx`
- `frontend/src/renderer/features/chat/utils/messageTransparency.js`
- `frontend/src/renderer/features/chat/utils/messageScreenshots.js`
- `tests/frontend/MessageContent.test.jsx`
- `tests/frontend/MessageTransparency.test.js`

## Message Type Routing in `MessageContent`

Render priority:

1. `message.type === "error"` -> error card
2. `message.type === "tool-output"` -> tool output card
3. `message.type === "tool-call"` -> tool call card
4. user message with screenshot -> user message container with screenshot
5. fallback markdown message

This ensures tool cards are chosen before generic markdown rendering.

## Tool Output Card Contract

Displayed output precedence:

1. `message.modelFacingToolOutput` string
2. fallback `message.text`

Details payload precedence:

1. object `message.toolOutputDetails`
2. synthesized object from:
- `toolName`
- `executionTime`
- `success`
- `toolMetadata`

Screenshot source is resolved through screenshot utility:

- prefers explicit `screenshotUrl`
- falls back to inline base64 (`message.screenshot`) with content type default handling

## Tool Call Card Contract

Primary preview payload:

1. object `message.modelFacingToolCall` serialized as pretty JSON
2. fallback raw `message.text`

Details panel payload:

1. object `message.toolCallDetails`
2. fallback object with `raw_message_text`

This separation keeps default view aligned with model-facing call while preserving raw execution payload in details.

## Transparency Section Assembly Contract

`buildTransparencySectionConfigs(message)` appends sections in fixed order:

1. `system-prompt`
2. `tool-schemas` (only for canonical schema shape)
3. `user-message-full`

Canonical tool-schema guard requires each entry:

- `type === "function"`
- object `function`
- string `function.name`
- object `function.parameters`

`fullUserMessage.metadata` is copied (`{...metadata}`) to avoid caller-side mutation through section objects.

## Transparency Section Rendering Rules

`TransparencySection` behavior:

- collapsed by default
- content copy button shown only when expanded
- null/undefined content renders `"No content available"`

Render mode by `type`:

- `json` / `system-prompt`: attempts JSON parse for string input, else pretty-prints object
- `xml`: rendered as preformatted text
- `text`: rendered as preformatted text

Metadata panel prints each key/value pair with string coercion.

## Test-Backed Invariants

`tests/frontend/MessageContent.test.jsx` verifies:

- screenshot URL takes precedence over inline base64
- inline screenshot URL defaults to jpeg when content type missing
- tool output details toggle reveals model-facing output + detail payload
- tool call details toggle reveals model-facing call JSON + details payload

`tests/frontend/MessageTransparency.test.js` verifies:

- empty transparency config for messages with no transparency payloads
- section creation order and descriptor shapes for all supported transparency payloads
- metadata copy semantics for `fullUserMessage`
- non-canonical tool schemas are dropped

## Drift Hotspots

1. changing route priority in `MessageContent` can render tool payloads as generic markdown.
2. removing canonical tool-schema guard can expose malformed schema payloads in transparency panel.
3. dropping metadata copy in transparency config can permit accidental shared-object mutation across renders.

## Related Pages

- [Renderer Chat Payload Docs Hub](README.md)
- [Frontend Renderer Chat Docs Hub](../README.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
