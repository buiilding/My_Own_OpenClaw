---
summary: "Deep reference for `desktopChatStreamConversationGateRuntime`: conversation/session identity resolution helpers and workspace routing behavior for multi-conversation streaming."
read_when:
  - When changing cross-conversation event handling in `useChatStream`.
  - When debugging dropped backend events during chatbox/main-window handoff.
title: "Conversation Gate and Conversation Isolation Reference"
---

# Conversation Gate and Conversation Isolation Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopChatStreamConversationGateRuntime.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `tests/frontend/DesktopChatStreamConversationGateRuntime.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx`

## Ownership Boundary

`desktopChatStreamConversationGateRuntime` resolves conversation identity from first-class backend event state: explicit `conversation_ref`, local-user payload `conversation_ref`, or an SDK-recorded `turn_ref -> conversationRef` mapping. Runtime event acceptance/filtering now lives in `useChatStream` workspace routing logic.

It does not:

- validate backend event shape (handled by `isBackendEvent`)
- write transcript rows
- mutate chat store state

## Conversation Ref Resolution Contract

`resolveEventConversationRef(event)` precedence:

1. top-level `event.conversation_ref` when non-empty string
2. fallback for `local-user-message`: `event.payload.conversation_ref`
3. otherwise `null`

This keeps first-class identity strict:

- local-user-message payloads that carry conversation identity inside payload fields
- memory-store events that only include session identity are unresolved and are quarantined

## Routing Decision Matrix

`useChatStream` resolves target workspace per event with this precedence:

1. `resolveEventConversationRef(event)` from top-level `conversation_ref` or local-user payload `conversation_ref`
2. `chatStore.resolveConversationRefForTurn(event.turn_ref)` when conversation ref is omitted
3. quarantine when neither identity source resolves

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
5. update transcript session user binding for the resolved conversation
6. dispatch to SDK-normalized handlers

Because routing is per-workspace, background conversation events do not leak into the currently active chat.

## Active-Turn Filter Boundary

`desktopChatStreamConversationGateRuntime` does not enforce stale-turn filtering.

`useChatStream` applies the active-turn mismatch guard before most handlers:

- guard condition: event has `turn_ref` and workspace has active turn and those values differ
- guarded handlers: all streamed assistant/tool/system/transparency/token/memory/error handlers
- unguarded handler: `local-user-message` (used to seed/reset per-turn state)

This split keeps identity routing in one helper and turn-phase acceptance in the stream hook.

## Test-Backed Invariants

`tests/frontend/DesktopChatStreamConversationGateRuntime.test.ts` verifies:

- top-level `conversation_ref` precedence
- `local-user-message` payload fallback resolution
- unresolved backend events are quarantined before UI projection or transcript sync

`tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx` verifies end-to-end listener behavior:

- events with omitted conversation refs process only through turn mapping; otherwise they are quarantined

## Drift Hotspots

1. removing turn-ref workspace mapping reintroduces ambiguous routing for events without `conversation_ref`.
2. removing local-user-message payload resolution breaks local echo identity.
3. force-switching transcript active conversation from background events causes visible chat jumps while another chat is open.

## Related Pages

- [Frontend Renderer Chat Stream Docs Hub](README.md)
- [Tracking, Formatting, and Message-Update Utility Reference](tracking_formatting_and_message_update_utility_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
