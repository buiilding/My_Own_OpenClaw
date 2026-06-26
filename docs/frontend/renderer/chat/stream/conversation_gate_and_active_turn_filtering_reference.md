---
summary: "Deep reference for SDK conversation-event ingress, conversation/session identity routing, and active-turn filtering for multi-conversation streaming."
read_when:
  - When changing cross-conversation event handling in `useChatStream`.
  - When debugging dropped conversation events during chatbox/main-window handoff, stale-turn filtering, or background conversation routing.
  - When searching for removed `desktopChatStreamConversationGateRuntime.ts` or `DesktopChatStreamConversationGateRuntime.test.ts`; current routing is `desktopChatStreamIngressRuntime.ts` plus `desktopChatStreamEventRuntime.ts`.
title: "Conversation Gate and Conversation Isolation Reference"
---

# Conversation Gate and Conversation Isolation Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopChatStreamTurnGuardRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTerminalHandoffRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamIngressRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamEventRuntime.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `tests/frontend/DesktopChatStreamIngressRuntime.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx`

## Ownership Boundary

`desktopChatStreamIngressRuntime` accepts SDK `ConversationEvent` objects from
`windie:conversation-event`. Backend websocket events are already normalized by
the SDK before the renderer listener runs, so the renderer owns conversation
projection, transcript-session binding, and handler dispatch for a resolved
`event.conversationRef`.

It does not:

- validate backend-wire websocket event shape (handled by the SDK backend-event
  guard and normalizer)
- write transcript rows
- mutate chat store state

## Conversation Ref Resolution Contract

`DesktopChatStreamIngressRuntime.handleConversationEventIngress(event, deps)`
requires a non-empty SDK `event.conversationRef`.

This keeps first-class identity strict:

- SDK conversation events without explicit conversation identity are rejected
  before UI projection or transcript-session sync
- user-message events with conversation identity can promote the active
  conversation projection
- non-user background events are dispatched to their conversation workspace
  without stealing the active conversation

## Routing Decision Matrix

`useChatStream` routes SDK conversation events with this sequence:

1. `DesktopChatStreamIngressRuntime.handleConversationEventIngress(...)` rejects missing `conversationRef`
2. `applyEventChatConversationProjection` promotes explicit user-message
   conversation refs and preserves the current active conversation for late
   non-user events
3. `registerTurnConversationRef(event.turnRef, conversationRef)` records the
   turn mapping when present
4. `dispatchConversationEvent(event, conversationRef)` sends the event to the
   typed chat-stream handler for that workspace

Result:

- mismatched conversation events are no longer dropped outright
- every event is routed to its owning workspace
- currently visible chat renders only the active workspace projection

## Integration Point in `useChatStream`

Event flow inside the conversation event listener:

1. receive the SDK `ConversationEvent` on `windie:conversation-event`
2. reject events without `conversationRef`
3. sync active chat projection only when session rules allow the event to own
   the visible conversation
4. register `turnRef -> conversationRef` mapping when both are available
5. update transcript session user binding for the resolved conversation
6. dispatch to SDK-normalized handlers

Because routing is per-workspace, background conversation events do not leak into the currently active chat.

## Active-Turn Filter Boundary

`desktopChatStreamIngressRuntime` does not enforce stale-turn filtering.

`useChatStream` applies `shouldIgnoreConversationEventForStaleTurn(...)` before
most handlers. The predicate delegates to `desktopChatStreamEventRuntime.ts`,
`DesktopChatStreamTurnGuardRuntime.isStaleTurnForActiveStream(...)`, and
`DesktopChatStreamTerminalHandoffRuntime` predicates:

- guard condition: event has `turnRef` and workspace has active turn and those values differ
- terminal handoff exception: only the explicit renderer `pendingTurn` bridge
  can keep next-turn packets flowing after a terminal phase; raw message tails
  are not scanned as a second pending authority
- guarded handlers: all streamed assistant/tool/system/transparency/token/memory/error handlers
- unguarded handler: `user_message` (used to seed/reset per-turn state)

This split keeps conversation routing in ingress and turn-phase acceptance in
the stream event runtime.

## Test-Backed Invariants

`tests/frontend/DesktopChatStreamIngressRuntime.test.ts` verifies:

- explicit user-message conversation refs promote the active conversation
- late non-user background events do not steal the active conversation
- missing conversation identity or rejected dispatch returns false

`tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx` verifies end-to-end listener behavior:

- background conversation events route to their own workspace
- local-user events promote the active conversation when transcript sync is disabled

## Drift Hotspots

1. accepting SDK conversation events without `conversationRef` reintroduces ambiguous routing.
2. removing turn-ref workspace mapping breaks later turn-scoped state checks.
3. force-switching transcript active conversation from background events causes visible chat jumps while another chat is open.

## Related Pages

- [Frontend Renderer Chat Stream Docs Hub](README.md)
- [Tracking, Formatting, and Message-Update Utility Reference](tracking_formatting_and_message_update_utility_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
