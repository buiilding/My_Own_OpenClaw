---
summary: "Deep reference for chat presentation rendering contracts: thinking-stream auto-stick/overflow behavior, message CSS class assembly, and token-count/cache status formatting for header display."
read_when:
  - When changing `ThinkingDisplay`, `MessageList`, `TokenCountDisplay`, or chat presentation style/class utility behavior.
  - When debugging reasoning-stream scroll affordances, message class regressions, or cache/token label output differences.
title: "Thinking Display Overflow, Message List Class Assembly, and Token Count Formatting Reference"
---

# Thinking Display Overflow, Message List Class Assembly, and Token Count Formatting Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/ThinkingDisplay.jsx`
- `frontend/src/renderer/features/chat/components/MessageList.jsx`
- `frontend/src/renderer/features/chat/components/TokenCountDisplay.jsx`
- `frontend/src/renderer/features/chat/utils/messageListClasses.js`
- `frontend/src/renderer/features/chat/utils/tokenCounts.js`
- `tests/frontend/ThinkingDisplay.test.jsx`
- `tests/frontend/MessageListThinkingDisplay.test.jsx`
- `tests/frontend/MessageListClasses.test.js`
- `tests/frontend/TokenCounts.test.js`

## Thinking Stream Scroll-State Contract

`ThinkingDisplay` normalizes incoming status via trimmed string semantics:

- non-string or empty-trimmed status -> component returns `null`
- non-empty status -> renders `role="status"` container with `aria-live="polite"`

Scroll behavior:

- `THINKING_BOTTOM_STICK_THRESHOLD = 12`
- container tracks `shouldStickToBottomRef`
- on status updates:
  - when near bottom (distance <= threshold), auto-scroll to latest content
  - otherwise preserve user scroll position
- `hasOverflowAbove` is true when `scrollTop > 2`, adding `has-overflow-above` class for top-overflow affordance styling

## Message List Ordering and Auto-Scroll Contract

`MessageList`:

- memoizes message row rendering through `MessageItem`
- applies message class names via `buildMessageClassName(message)`
- renders `<ThinkingDisplay />` before end-anchor node (`data-testid="message-list-end"`)
- scrolls anchor into view on `[messages, thinkingStatus]` changes

Ordering guarantee:

- end-anchor remains last child so auto-scroll includes thinking stream output appended above it

## Message CSS Class Assembly Contract

`buildMessageClassName(message)` always starts with:

- `message`
- `message-${sender}`

Conditional additions:

- `message-streaming` when `sender === 'assistant'` and `isComplete === false`
- `message-type-${type}` when `type` is present
- `message-has-screenshot` when screenshot attachment fields resolve true through `hasMessageScreenshot(...)`

## Token Count Formatting Contract

`TokenCountDisplay` renders output from `buildTokenCountItems(tokenCounts)`.

`buildTokenCountItems` guarantees two rows:

1. `Conversation Total`
2. `Cache`

Conversation total value:

- prefers `total_tokens`
- falls back to `conversation_tokens`
- default `'0'`
- numeric values formatted through `toLocaleString()`

Cache value/status resolution:

1. use explicit `cache_status` when present
2. else derive from `cache_hit` (`true` -> `hit`, `false` -> `miss`, otherwise `unknown`)
3. output text:
   - `hit` -> `Hit (<cached_tokens> cached)`
   - `miss` -> `Miss`
   - `unknown` -> `Unknown`
4. `hit` applies CSS class `token-count-cache-hit`

## Test-Backed Matrix

- `tests/frontend/ThinkingDisplay.test.jsx`
  - empty status renders nothing
  - non-empty status renders reasoning stream text
  - scrolling above bottom sets `has-overflow-above`
- `tests/frontend/MessageListThinkingDisplay.test.jsx`
  - confirms end-anchor remains after thinking display for inclusive auto-scroll
- `tests/frontend/MessageListClasses.test.js`
  - validates base/streaming/type/screenshot class composition
- `tests/frontend/TokenCounts.test.js`
  - validates total-token fallback ordering
  - validates cache hit/miss/unknown text and CSS class
  - validates formatting for zero/decimal/large values

## Drift Hotspots

1. Changing overflow thresholds or class-name toggles can break reasoning-stream affordance CSS without obvious runtime errors.
2. Reordering `ThinkingDisplay` and end-anchor in `MessageList` can make auto-scroll miss reasoning chunks.
3. Altering cache status precedence (`cache_status` vs `cache_hit`) can cause misleading token-cache UI labels.

## Related Pages

- [Renderer Chat Presentation Docs Hub](README.md)
- [Tracking, Formatting, and Message-Update Utility Reference](../stream/tracking_formatting_and_message_update_utility_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
