---
summary: "Deep reference for renderer chat payload surfaces: markdown rendering and sanitization through toSanitizedMarkdownHtml, removed sanitizeMarkdownHtml standalone markdown sanitizer wrapper behavior, DOMParser/createHTMLDocument markdown text extraction after deprecated document.createElement removal, tool-call/tool-output card rendering, removed toolExplanationMessages and MessageToolMetadata.test.js helper behavior, screenshot-source helper behavior, provider-aware transport cleanup plus provider-agnostic math normalization, optional math rendering, structured-JSON output parsing, screenshot source selection, transparency section configuration/validation, and current normalizeToolSchemaList behavior after the removed isSupportedToolSchemaList helper."
read_when:
  - When changing model-facing tool payload display behavior in message rows.
  - When changing renderer markdown sanitization, markdown rendering, math rendering, or thread-find highlight behavior.
  - When stale code, tests, or docs mention deprecated `document.createElement` usage in renderer markdown HTML container construction; markdown text extraction now prefers `DOMParser` with `createHTMLDocument` fallback.
  - When changing system prompt/tool schemas/full-user-message transparency section assembly.
  - When resolving stale references to the removed `features/chat/utils/message/messageTransparency.js` helper path; transparency descriptor assembly now lives in the renderer app runtime facade.
  - When stale code, tests, or docs mention `isSupportedToolSchemaList` or removed renderer tool-schema list helper exports.
  - When resolving stale references to the removed `sanitizeMarkdownHtml` wrapper, markdown sanitizer wrapper, or standalone sanitized-HTML wrapper.
  - When resolving stale references to removed `toolExplanationMessages.js`, `MessageToolMetadata.test.js`, or `MessageScreenshotSrc.test.js` helper paths.
title: "Tool Call/Output and Transparency Section Rendering Reference"
---

# Tool Call/Output and Transparency Section Rendering Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/MessageContent.jsx`
- `frontend/src/renderer/features/chat/components/message/content/MarkdownMessage.jsx`
- `frontend/src/renderer/app/runtime/desktopMarkdownMessageRuntime.js`
- `frontend/src/renderer/app/runtime/desktopThreadFindRuntime.js`
- `frontend/src/renderer/features/chat/components/message/content/ToolExplanationMessage.jsx`
- `frontend/src/renderer/features/chat/components/message/content/ToolActionsSummaryMessage.jsx`
- `frontend/src/renderer/features/chat/components/message/content/ToolCallMessage.jsx`
- `frontend/src/renderer/features/chat/components/message/content/ToolOutputMessage.jsx`
- `frontend/src/renderer/features/chat/components/message/content/UserMessage.jsx`
- `frontend/src/renderer/features/chat/components/message/content/ErrorMessage.jsx`
- `frontend/src/renderer/features/chat/components/message/content/AssistantThinkingSection.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- `frontend/src/renderer/features/chat/components/message/MessageTransparencySections.jsx`
- `frontend/src/renderer/features/chat/components/message/TransparencySection.jsx`
- `frontend/src/renderer/app/runtime/desktopClipboardRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMessageTransparencyRuntime.js`
- `frontend/src/renderer/infrastructure/llmOutputContract.ts`
- `frontend/src/renderer/infrastructure/markdown.ts`
- `tests/frontend/MessageContent.test.jsx`
- `tests/frontend/LlmOutputContract.test.ts`
- `tests/frontend/MarkdownRenderer.test.ts`
- `tests/frontend/DesktopThreadFindRuntime.test.js`
- `tests/frontend/DesktopMessageTransparencyRuntime.test.js`

## Message Type Routing in `MessageContent`

Render priority:

1. `message.type === "error"` -> error card
2. `message.type === "tool-output"` -> tool output card
3. `message.type === "tool-call"` -> tool call card
4. `message.type === "tool-explanation"` -> subdued action-explanation text row
5. `message.type === "tool-actions-summary"` -> collapsed `View actions` summary row
6. user message with screenshot -> user message container with screenshot
7. fallback markdown message

This ensures tool cards are chosen before generic markdown rendering.

## Tool Log Presentation Contract

Dashboard thread presentation no longer branches on the frontend
`show_tool_logs` setting or active loop busy state. `ChatInterface` passes
durable rows and SDK current-turn projection data into
`DesktopThreadPresentationRuntime.buildThreadPresentationMessages(...)`, and
the runtime keeps tool-call, tool-output, search-source, and tool-explanation
rows as rendering data rather than using them as typing or busy lifecycle
authority.

The old hidden-tool-log filtering path was removed from the dashboard thread
projection. Tests now assert that toggling `show_tool_logs` does not reorder or
filter transcript rows; visible lifecycle and SDK current-turn entries decide
live projection separately from this setting.

## LLM Output Rendering Contract

Assistant markdown rendering now follows a single contract:

- **Renderer-facing facade**: message components and thread-find projection call
  `DesktopMarkdownMessageRuntime.buildMarkdownRenderModel(...)` rather than a
  standalone helper export, keeping markdown normalization, sanitization, math
  toggling, and plain-text extraction in the renderer app-runtime boundary.
- **Input contract**: model text must resolve to **renderable markdown + optional math**
- **Provider-aware transport cleanup** happens before markdown parse in `resolveLlmOutputContract(...)`
- **Provider-agnostic math normalization** converts LaTeX delimiters (`\(...\)` / `\[...\]`) into the dollar-delimited forms consumed by the markdown math renderer when math rendering is enabled
- **Renderer remains model-agnostic** (`toSanitizedMarkdownHtml`) and receives normalized markdown + `enableMath`
- **Sanitization is exposed only through the markdown rendering pipeline**:
  callers use `toSanitizedMarkdownHtml(...)` for markdown parse/sanitize and
  `highlightSanitizedHtml(...)` for thread-find markup over already-sanitized
  output. There is no separate public sanitized-HTML wrapper for arbitrary HTML.
  The old `sanitizeMarkdownHtml(...)` wrapper was deleted because it bypassed
  the markdown rendering contract and had no production consumers.

Contract fields:

- `markdown`: normalized markdown payload for render
- `source`: `markdown` or `structured-json`
- `provider` / `modelId`: metadata used for provider-specific normalization
- `mathEnabled`: boolean toggle for KaTeX-enabled markdown parse
  - when false, LaTeX delimiters remain literal and are not normalized before markdown rendering

Gemini-specific cleanup:

- normalize malformed escaped newlines (`\\n`, `\\r\\n`) into real newlines
- optionally strip accidental wrapper html tokens (for example `<div>`, `<p>`) and map `<br>` to newline

Provider-agnostic math normalization:

- normalize escaped math delimiters and convert `\\(...\\)` / `\\[...\\]` into `$...$` / `$$...$$`
- skip fenced code blocks so TeX examples remain literal inside markdown code fences

Thread-find and text extraction helpers parse already-sanitized HTML through
`createHtmlContainer(...)` in `frontend/src/renderer/infrastructure/markdown.ts`.
The current path prefers `DOMParser.parseFromString(...)` and falls back to
`document.implementation.createHTMLDocument(...)` when `DOMParser` is missing.
The old direct `document.createElement("div")` container construction was
removed for the deprecation audit; stale searches for that API should route to
this renderer markdown contract.

Thread-find match projection is exposed through
`DesktopThreadFindRuntime.buildThreadFindState(...)`, keeping message search
indexing rules behind the renderer app-runtime facade rather than as a
standalone helper export.

Structured JSON support:

- if assistant output parses as JSON and matches supported fields (`markdown`, `content`, `text`, `answer`, `output`, or `blocks[]`), renderer converts JSON payload to markdown client-side before parse/sanitize.

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

Visible tool-output screenshots render through the same typed attachment path as
user visuals:

```text
SDK tool_output/tool_bundle_output metadata.attachments[]
-> renderer ChatMessage.attachments
-> ToolOutputMessage
-> AttachmentList / AttachmentRendererRegistry
-> useResolvedAttachmentImageSrc(attachment)
```

Renderer tool-output components do not infer display visuals from
`screenshot`, `screenshotRef`, `screenshotUrl`, `screenshots`, or
`screenshot_refs`. Legacy aliases are converted earlier by the SDK replay
adapter for old stored rows, or retained by backend/provider compatibility for
model-visible history.

### Removed Tool Explanation, Metadata, and Screenshot Helper Paths

The old renderer `toolExplanationMessages.js` helper is no longer an active
message-scanning path. Tool explanations are rendered by the current
`MessageContent` routing and tool message components. When rows use
`tool-explanation` or `tool-actions-summary`, explanation copy comes from the
canonical model/tool payload fields on the active message shape.

The old `MessageToolMetadata.test.js` suite covered a standalone
`messageToolMetadata` formatter. That helper path is gone; current tool-output
source, channel, and token badges are covered through `MessageSourceBadge` and
`MessageTokenUsage`, while detailed tool-call/tool-output card content is owned
by the message content components listed above.

The old standalone screenshot-source test path `MessageScreenshotSrc.test.js`
and the whole-message `DesktopMessageScreenshotRuntime` path were removed.
Screenshot source selection is covered through typed attachment rendering,
`desktopAttachmentImageRuntime.js`, and attachment/artifact tests.
Stale searches for either removed helper should route here.

## Tool Call Card Contract

Primary preview payload:

1. `message.toolCallDisplayText` string

Details panel payload:

1. object `message.toolCallDetails`

SDK display-row and live-turn projection must set the preview text from SDK
display content and must not forward provider-facing `modelFacingToolCall` as a
renderer chat message prop. Tool-call render, find, and estimated-token helpers
use `toolCallDisplayText` only; they do not serialize provider-facing payloads
as a fallback. `ConversationView.displayRows` and SDK live entries remain
display contracts, not provider-payload recovery channels. Recovery preview and
display-only execution state come from SDK current-turn fields such as
`rawToolCallPreview`, `rawArgumentsPreview`, `parseError`,
`toolCallValidationFailed`, and `executionSkipped`, not from backend-shaped
metadata keys in renderer message helpers. Transcript helper state must return
display text, sanitized details, and correlation ids only; it must not return a
model-facing tool-call object for renderer chat messages.
SDK current-turn presentation entries own live tool-call preview text. Renderer
current-turn adapters may pass SDK `text`, recovery previews, normalized
`toolArguments`, and sanitized details through the transcript helper, but they
must not read `modelFacingToolCall` to reconstruct the card body.
When the renderer includes the display-only marker in the pretty-printed
model-facing payload, it uses the neutral `execution_skipped` field.

Tool-call preview content stays in the transcript flow instead of using a nested
vertical scroll box. Long JSON lines wrap inside the card so the first line is
visible immediately after render; the details panel may remain internally
scrollable for large diagnostic payloads.

Backend contract:

- `metadata.model_facing_tool_call` should carry the exact LLM-emitted tool payload whenever available, including successful unified wrapper calls that are internally normalized before execution
- if backend omits that field, the renderer falls back to the normalized execution payload (`tool_name` + `parameters`)

## Transparency Section Assembly Contract

`DesktopMessageTransparencyRuntime.buildTransparencySectionConfigs(message, options?)`
lives in `frontend/src/renderer/app/runtime/desktopMessageTransparencyRuntime.js`
and appends sections in fixed order:

1. `system-prompt`
2. `tool-schemas` (for canonical schema shape on the message itself, or from conversation-level tool-schema transparency when rendering later user rows)
3. `user-message-full`

Canonical tool-schema guard requires each entry:

- `type === "function"`
- object `function`
- string `function.name`
- object `function.parameters`

`fullUserMessage.metadata` is copied (`{...metadata}`) to avoid caller-side mutation through section objects.

Transparency section copy buttons serialize content through
`DesktopMessageTransparencyRuntime.serializeTransparencySectionContent(...)`
and write the result through `DesktopClipboardRuntime.writeText(...)`, so the
feature component does not own the browser clipboard adapter.

Conversation-level behavior:

- `MessageList` derives the latest canonical tool-schema payload across the active conversation
  through `DesktopMessageTransparencyRuntime.resolveConversationToolSchemas(...)`
- later user rows can render that conversation-level tool-schema transparency even when the schema event was attached to an earlier turn
- assistant rows do not inherit conversation-level tool-schema sections

Tool schema list normalization is centralized in
`frontend/src/renderer/infrastructure/transcript/toolSchemaShape.ts` and is
exposed to renderer presentation through
`frontend/src/renderer/app/runtime/desktopChatMessageRuntimeClient.ts`.
`DesktopChatMessageRuntimeClient.normalizeToolSchemaList(value)` is the public
runtime helper used by chat stream message updates and transparency rendering.
It accepts only arrays where every entry is supported:

- `type: "computer"` schemas pass through as renderer display schemas
- canonical function schemas with `function.name` and `function.parameters`
  pass through after normalization
- flat function-shaped entries with top-level `name` and `parameters` normalize
  into canonical `{type: "function", function: {...}}`
- non-arrays, unsupported tool types, or partially malformed arrays return
  `undefined`

The old `isSupportedToolSchemaList` helper is removed and should not be used as
a public renderer API. Tests should cover `normalizeToolSchemaList` through chat
stream metadata updates or transparency section rendering.

## Transparency Section Rendering Rules

`TransparencySection` behavior:

- collapsed by default
- content copy button shown only when expanded
- null/undefined content renders `"No content available"`
- content render-mode and clipboard serialization are resolved by
  `DesktopMessageTransparencyRuntime`, so the component renders the runtime
  presentation model without branching on raw transparency type strings.
- light appearance uses light transparency panels and the active appearance
  foreground for the header, metadata, and content text instead of inheriting
  dark debug-card colors.

Render mode by `type`:

- `json` / `system-prompt`: attempts JSON parse for string input, else pretty-prints object
- `xml`: rendered as preformatted text
- `text`: rendered as preformatted text

Metadata panel prints each key/value pair with string coercion.

## Test-Backed Invariants

`tests/frontend/MessageContent.test.jsx` verifies:

- tool-output screenshots render from typed `attachments[]`
- legacy tool-output screenshot aliases alone do not render primary visuals
- tool output details toggle reveals model-facing output + detail payload
- tool call details toggle reveals model-facing call JSON + details payload
- tool explanation and tool action summary rows render subdued explanation text
  and expandable `View actions` summaries

`tests/frontend/DesktopMessageTransparencyRuntime.test.js` verifies:

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
