---
summary: "Deep reference for chat presentation contracts: thinking-stream overflow behavior, message-row class assembly, and token-count stream-state ownership."
read_when:
  - When changing `ThinkingDisplay`, `MessageList`, or chat presentation class utility behavior.
  - When debugging stream token-count state updates or thinking-stream scroll affordances.
title: "Thinking Display Overflow, Message List Class Assembly, and Stream Token Tracking Reference"
---

# Thinking Display Overflow, Message List Class Assembly, and Stream Token Tracking Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/message/ThinkingDisplay.jsx`
- `frontend/src/renderer/features/chat/components/MessageList.jsx`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/utils/message/messageListClasses.js`
- `tests/frontend/ThinkingDisplay.test.jsx`
- `tests/frontend/MessageListThinkingDisplay.test.jsx`
- `tests/frontend/MessageListClasses.test.js`
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

## Message List Ordering and Auto-Scroll Contract

`MessageList`:

- memoizes message rows through `MessageItem`
- resolves row class names via `buildMessageClassName(message)`
- does not render a global bottom-of-thread thinking strip
- keeps terminal end-anchor node as the final child
- auto-scrolls on `[messages]` updates only while user remains near bottom (`24px` threshold)
- preserves manual scroll position after user scrolls away from bottom (assistant/tool/live updates do not force snap-to-bottom)
- on active conversation switch, resets auto-scroll stickiness and jumps instantly to a near-bottom anchor (`72px` above absolute bottom, no smooth animation) so history selection opens at the latest context without fully pinning the last pixel

Guarantee:

- end-anchor stays last child and streamed thinking appears inside assistant message rows (not in a transient global strip).

Assistant message thinking presentation:

- finalized reasoning text is persisted onto assistant rows (`message.thinkingText`) by `useChatStream` at `streaming-complete`.
- live `llm-thought` chunks also write to the same assistant row while streaming; `MessageContent` renders this as a per-message collapsible section (`Show thinking`) above assistant markdown output.

## Message CSS Class Assembly Contract

`buildMessageClassName(message)` emits:

- always: `message`, `message-${sender}`
- `message-streaming` for unfinished assistant LLM rows
- `message-type-${type}` for typed rows (`tool-call`, `tool-output`, `error`, etc.)
- `message-has-screenshot` when screenshot attachment fields resolve true

## Token Count Tracking Contract (State, not Dedicated UI Component)

Current runtime keeps token usage in chat store/state:

- `chatStore.ts` holds `tokenCounts` payload from backend.
- `useChatStream` handles `token-count` events and calls `setTokenCounts`.

Important:

- dedicated `TokenCountDisplay` component path is retired in current frontend runtime.
- token count remains part of stream telemetry/state and may be surfaced by future UI consumers.
- in `dev_ui=1`, per-message token estimates now render via `MessageSourceBadge`:
  - user rows show text/image/total estimates
  - tool-call/tool-output rows show payload token estimates
  - all message-level values are approximate and intentionally tagged `tokens~`

## Test-Backed Matrix

- `ThinkingDisplay.test.jsx`:
  - empty status hidden
  - non-empty status visible
  - overflow-above class toggles correctly
- `MessageListThinkingDisplay.test.jsx`:
  - confirms thinking + end-anchor ordering
- `MessageListScrollBehavior.test.jsx`:
  - confirms no forced auto-scroll after user scrolls up
  - confirms near-bottom streaming updates still auto-scroll
  - confirms conversation selection changes force an instant near-bottom jump (`top = maxScrollTop - 72`) even after manual scroll-up in previous thread
- `MessageListClasses.test.js`:
  - verifies class assembly for sender/type/screenshot/streaming state
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
