---
summary: "Deep reference for chat presentation contracts: thinking-stream overflow behavior, message-row class assembly, and token-count stream-state ownership."
read_when:
  - When changing `ThinkingDisplay`, `MessageList`, or chat presentation class utility behavior.
  - When debugging stream token-count state updates or thinking-stream scroll affordances.
title: "Thinking Display Overflow, Message List Class Assembly, and Stream Token Tracking Reference"
---

# Thinking Display Overflow, Message List Class Assembly, and Stream Token Tracking Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/ThinkingDisplay.jsx`
- `frontend/src/renderer/features/chat/components/MessageList.jsx`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/utils/messageListClasses.js`
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
- renders `<ThinkingDisplay />` before terminal end-anchor node
- auto-scrolls on `[messages, thinkingStatus]` updates

Guarantee:

- end-anchor stays last child so both message and thinking updates stay in auto-scroll path.

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

## Test-Backed Matrix

- `ThinkingDisplay.test.jsx`:
  - empty status hidden
  - non-empty status visible
  - overflow-above class toggles correctly
- `MessageListThinkingDisplay.test.jsx`:
  - confirms thinking + end-anchor ordering
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
