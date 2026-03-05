---
summary: "Deep reference for `chatStreamConversationGate`: conversation/session identity resolution helpers and workspace routing behavior for multi-conversation streaming."
read_when:
  - When changing cross-conversation event handling in `useChatStream`.
  - When debugging dropped backend events during chatbox/main-window handoff.
title: "Conversation Gate and Conversation Isolation Reference"
---

# Conversation Gate and Conversation Isolation Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamConversationGate.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamHandlerMap.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `tests/frontend/ChatStreamConversationGate.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx`

## Ownership Boundary

`chatStreamConversationGate` resolves conversation identity from backend events (`conversation_ref` + compatibility fallbacks). Runtime event acceptance/filtering now lives in `useChatStream` workspace routing logic.

It does not:

- validate backend event shape (handled by `isBackendEvent`)
- write transcript rows
- mutate chat store state

## Conversation Ref Resolution Contract

`resolveEventConversationRef(event)` precedence:

1. top-level `event.conversation_ref` when non-empty string
2. fallback for `memory-store`: `event.payload.session_id`
3. fallback for `memory-store`: top-level `event.session_id`
4. fallback for `local-user-message`: `event.payload.conversation_ref`
5. otherwise `null`

This keeps compatibility for:

- local-user-message payloads that carry conversation identity inside payload fields
- memory-store events that only include session identity in compatibility fields

## Routing Decision Matrix

`useChatStream` resolves target workspace per event with this precedence:

1. `resolveEventConversationRef(event)` from top-level `conversation_ref` (or compatibility payload fallback for `local-user-message`)
2. `chatStore.resolveConversationRefForTurn(event.turn_ref)` when conversation ref is omitted
3. current transcript active conversation ref

Result:

- mismatched conversation events are no longer dropped outright
- every event is routed to its owning workspace
- currently visible chat renders only the active workspace projection

## Integration Point in `useChatStream`

Event flow inside backend listener:

1. drop invalid payloads (`!isBackendEvent`)
2. resolve target conversation workspace with conversation-ref + turn-ref fallback
3. sync active chat projection only when event includes explicit conversation identity and active projection is empty or event is `local-user-message`
4. register `turn_ref -> conversation_ref` mapping when both are available
5. update transcript session user binding without force-switching active conversation (`activeConversationRef || resolvedConversationRef`)
6. dispatch to per-event handler map

Because routing is per-workspace, background conversation events do not leak into the currently active chat.

## Active-Turn Filter Boundary

`chatStreamConversationGate` does not enforce stale-turn filtering.

`useChatStream` applies the active-turn mismatch guard before most handlers:

- guard condition: event has `turn_ref` and workspace has active turn and those values differ
- guarded handlers: all streamed assistant/tool/system/transparency/token/memory/error handlers
- unguarded handler: `local-user-message` (used to seed/reset per-turn state)

This split keeps identity routing in one helper and turn-phase acceptance in the stream hook.

## Test-Backed Invariants

`tests/frontend/ChatStreamConversationGate.test.ts` verifies:

- top-level `conversation_ref` precedence
- `local-user-message` payload fallback resolution
- compatibility fallback resolution behavior for payload-level conversation refs

`tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx` verifies end-to-end listener behavior:

- events with omitted conversation refs still process through turn mapping / active fallback

## Drift Hotspots

1. removing turn-ref workspace mapping reintroduces ambiguous routing for events without `conversation_ref`.
2. removing local-user-message fallback breaks compatibility for payload-level conversation identity.
3. force-switching transcript active conversation from background events causes visible chat jumps while another chat is open.

## Related Pages

- [Frontend Renderer Chat Stream Docs Hub](README.md)
- [Tracking, Formatting, and Message-Update Utility Reference](tracking_formatting_and_message_update_utility_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
