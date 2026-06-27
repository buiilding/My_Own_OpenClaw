---
summary: "Deep reference for chat presentation contracts: thinking-stream overflow behavior, message content kind routing, message-row class assembly, and token-count stream-state ownership."
read_when:
  - When changing `ThinkingDisplay`, `MessageContent`, `MessageList`, or chat presentation utility behavior.
  - When debugging stream token-count state updates or thinking-stream scroll affordances.
title: "Thinking Display Overflow, Message Content/Class Assembly, and Stream Token Tracking Reference"
---

# Thinking Display Overflow, Message Content/Class Assembly, and Stream Token Tracking Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/message/ThinkingDisplay.jsx`
- `frontend/src/renderer/features/chat/components/MessageList.jsx`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/app/runtime/desktopMessageContentRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMessageClassRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMessageListRuntime.js`
- `frontend/src/renderer/app/runtime/desktopAttachmentImageRuntime.js`
- `frontend/src/renderer/features/chat/components/message/content/AttachmentList.jsx`
- `frontend/src/renderer/app/runtime/desktopMessageSourceTagRuntime.js`
- `frontend/src/renderer/app/runtime/desktopMessageTokenUsageRuntime.js`
- `tests/frontend/ThinkingDisplay.test.jsx`
- `tests/frontend/MessageListThinkingDisplay.test.jsx`
- `tests/frontend/DesktopMessageContentRuntime.test.js`
- `tests/frontend/DesktopMessageClassRuntime.test.js`
- `tests/frontend/DesktopMessageListRuntime.test.js`
- `tests/frontend/DesktopAttachmentImageRuntime.test.jsx`
- `tests/frontend/AttachmentDisplayComponents.test.jsx`
- `tests/frontend/DesktopMessageTokenUsageRuntime.test.js`
- `tests/frontend/ChatStore.test.ts`

## Thinking Stream Scroll-State Contract

`ThinkingDisplay` status normalization:

- non-string or empty-trimmed status -> render `null`
- non-empty status -> render live status container (`aria-live="polite"`)

Overflow behavior:

- bottom-stick threshold is distance-based (`12px`)
- while user stays near bottom, new thinking chunks auto-scroll
- when user scrolls away, component preserves manual position
- top overflow indicator class toggles when `scrollTop > 2`

Dev source badge:

- `ThinkingDisplay` checks the dev-UI gate, then renders
  `DesktopMessageSourceTagRuntime.resolveThinkingSourceBadgePresentation(sourceEventType)`
  output when enabled.
- `desktopMessageSourceTagRuntime` owns the `llm-thought` fallback, source
  label, SDK conversation-event channel label, and source badge title string.

## Message List Ordering and Auto-Scroll Contract

`MessageList` consumes scroll/action/compaction state through
`DesktopMessageListRuntime` from
`frontend/src/renderer/app/runtime/desktopMessageListRuntime.js`:

- memoizes message rows through `MessageItem`
- resolves row class names via `DesktopMessageClassRuntime.buildMessageClassName(message)`
- does not render a global bottom-of-thread thinking strip
- keeps terminal end-anchor node as the final child
- auto-scrolls on `[messages]` updates only while user remains near bottom (`24px` threshold)
- preserves manual scroll position after user scrolls away from bottom (assistant/tool/live updates do not force snap-to-bottom)
- on active conversation switch, resets auto-scroll stickiness and jumps instantly to a near-bottom anchor (`72px` above absolute bottom, no smooth animation) so history selection opens at the latest context without fully pinning the last pixel
- routes same-row assistant thinking-text update detection through
  `DesktopMessageListRuntime.shouldAutoScrollForThinkingTextUpdate(...)`,
  keeping raw message-type classification out of `useMessageListAutoScroll`
- routes active find-match scroll scheduling, auto-scroll animation-frame
  coalescing/cleanup, and message-list resize observation through
  `DesktopMessageListRuntime`; `MessageList` and
  `useMessageListAutoScroll` supply refs and policy callbacks without owning
  raw browser `requestAnimationFrame`, `cancelAnimationFrame`, or
  `ResizeObserver` adapters

Guarantee:

- end-anchor stays last child and streamed thinking appears inside assistant message rows (not in a transient global strip).

Assistant message thinking presentation:

- finalized reasoning text is persisted onto assistant rows (`message.thinkingText`) by `useChatStream` at `streaming-complete`.
- live `llm-thought` chunks also write to the same assistant row while streaming; `MessageContent` renders this as a per-message collapsible section (`Show thinking`) above assistant markdown output.

## Message Content Render-Kind Contract

`MessageContent` consumes
`DesktopMessageContentRuntime` from
`frontend/src/renderer/app/runtime/desktopMessageContentRuntime.js` to resolve
a single render kind before selecting React-only content components. The
runtime keeps the raw render-kind table private and exposes semantic predicates
for React routing through the facade.

The runtime owns row classification for:

- error rows
- tool call/output rows
- tool explanation and search-source rows
- tool action summaries
- user rows with SDK display attachments
- assistant LLM-text rows, including whether visible assistant text should render below thinking
- generic markdown fallback rows

This keeps raw SDK/display-row message-type branching out of the React
component while preserving the existing content components and markup. It also
keeps raw render-kind constants out of the component; callers should use
`DesktopMessageContentRuntime.isErrorMessageContentPresentation(...)`,
`DesktopMessageContentRuntime.isToolOutputMessageContentPresentation(...)`,
`DesktopMessageContentRuntime.isToolCallMessageContentPresentation(...)`,
`DesktopMessageContentRuntime.isToolExplanationMessageContentPresentation(...)`,
`DesktopMessageContentRuntime.isToolActionsSummaryMessageContentPresentation(...)`,
`DesktopMessageContentRuntime.isUserAttachmentMessageContentPresentation(...)`,
and `DesktopMessageContentRuntime.isAssistantResponseMessageContentPresentation(...)`
instead.

## Message CSS Class Assembly Contract

`DesktopMessageClassRuntime.buildMessageClassName(message)` lives in
`frontend/src/renderer/app/runtime/desktopMessageClassRuntime.js` and emits:

- always: `message`, `message-${sender}`
- `message-streaming` for unfinished assistant LLM rows
- `message-type-${type}` for typed rows (`tool-call`, `tool-output`, `error`, etc.)
- `message-has-screenshot` when typed ready image attachments resolve true

Screenshot presence for row classes is resolved from typed `attachments[]`;
user-message and tool-output visual routing use SDK-owned descriptors through
`AttachmentList` / `AttachmentRendererRegistry`.
The React-only async artifact image fetch/cache hook remains in
`frontend/src/renderer/app/runtime/desktopAttachmentImageRuntime.js`.

## Token Count Tracking Contract (State, not Dedicated UI Component)

Current runtime keeps token usage in chat store/state:

- `chatStore.ts` holds `tokenCounts` payload from backend.
- `useChatStream` handles `token-count` events and calls `setTokenCounts`.
- dev token image estimates count SDK typed image `attachments[]` only; legacy
  `screenshots[]` and whole-message `screenshotRef`/`screenshotUrl` aliases are
  not renderer presentation or token-estimate authorities.
- React message prop contracts advertise typed `attachments[]`, not
  whole-message screenshot aliases.
- `DesktopAttachmentImageRuntime` resolves image refs/URLs only from typed SDK
  image attachment descriptors; whole-message screenshot alias-shaped objects
  are ignored before artifact fetch.

Important:

- dedicated `TokenCountDisplay` component path is retired in current frontend runtime.
- token count remains part of stream telemetry/state and may be surfaced by future UI consumers.
- in `dev_ui=1`, per-message token estimates now render via
  `MessageSourceBadge` through `DesktopMessageTokenUsageRuntime`:
  - user rows show text/image/total estimates
  - tool-call/tool-output rows show payload token estimates
  - all message-level values are approximate and intentionally tagged `tokens~`

## Test-Backed Matrix

- `ThinkingDisplay.test.jsx`:
  - empty status hidden
  - non-empty status visible
  - overflow-above class toggles correctly
  - dev source badge renders the runtime-provided text/title
- `MessageListThinkingDisplay.test.jsx`:
  - confirms thinking + end-anchor ordering
- `MessageListScrollBehavior.test.jsx`:
  - confirms no forced auto-scroll after user scrolls up
  - confirms near-bottom streaming updates still auto-scroll
  - confirms conversation selection changes force an instant near-bottom jump (`top = maxScrollTop - 72`) even after manual scroll-up in previous thread
- `DesktopMessageClassRuntime.test.js`:
  - verifies class assembly for sender/type/screenshot/streaming state
- `DesktopMessageContentRuntime.test.js`:
  - verifies content render-kind routing for error, tool, source, screenshot,
    assistant, and generic markdown rows
- `DesktopMessageListRuntime.test.js`:
  - verifies compaction status metadata and assistant/user action gating
- `DesktopAttachmentImageRuntime.test.jsx`:
  - verifies artifact-backed attachment image resolution and equivalent-source stability
- `ChatStore.test.ts`:
  - validates token-count state updates and reset behavior

## Drift Hotspots

1. changing overflow threshold/class toggles breaks subtle thinking affordances without hard runtime errors.
2. reordering thinking display/end-anchor can regress auto-scroll during long reasoning streams.
3. removing or renaming `token-count` event handling in `useChatStream` silently drops usage telemetry from state.

## Related Pages

- [Renderer Chat Presentation Docs Hub](README.md)
- [Tracking, Formatting, and Message-Update Utility Reference](../stream/tracking_formatting_and_message_update_utility_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
