---
summary: "Deep reference for `chatStreamConversationGate`: conversation_ref resolution, stale-event suppression rules, and active-turn terminal-phase gating."
read_when:
  - When changing cross-conversation event handling in `useChatStream`.
  - When debugging dropped backend events during chatbox/main-window handoff.
title: "Conversation Gate and Active-Turn Filtering Reference"
---

# Conversation Gate and Active-Turn Filtering Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/utils/chatStreamConversationGate.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `tests/frontend/ChatStreamConversationGate.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx`

## Ownership Boundary

`chatStreamConversationGate` decides whether a valid backend event should be ignored because it belongs to a different conversation while a turn is still active.

It does not:

- validate backend event shape (handled by `isBackendEvent`)
- write transcript rows
- mutate chat store state

## Conversation Ref Resolution Contract

`resolveEventConversationRef(event)` precedence:

1. top-level `event.conversation_ref` when non-empty string
2. fallback only for `local-user-message`: `event.payload.conversation_ref`
3. otherwise `null`

This keeps compatibility for local-user-message payloads that carry conversation identity inside payload fields.

## Ignore Decision Matrix

`shouldIgnoreEventForActiveConversation(...)` returns `true` only when all conditions hold:

1. active conversation ref exists
2. event has resolvable conversation ref
3. event conversation ref differs from active conversation
4. event type is not `local-user-message`
5. stream has an active turn (`streamTracking.activeTurnRef` non-empty)
6. stream phase is non-terminal (`awaiting-first-chunk`, `streaming`, `tool-call`, `tool-output`)

Terminal phases are allowlisted for cross-conversation pass-through:

- `idle`
- `complete`
- `error`

This allows handoff after a turn is done while still blocking stale in-flight events.

## Integration Point in `useChatStream`

Event flow inside backend listener:

1. drop invalid payloads (`!isBackendEvent`)
2. read current `streamTracking` from store
3. gate by `shouldIgnoreEventForActiveConversation`
4. update transcript session (`updateTranscriptSession`) if event is accepted
5. dispatch to per-event handler map

Because transcript session update happens after gate evaluation, stale events do not rewrite transcript conversation/user identity.

## Test-Backed Invariants

`tests/frontend/ChatStreamConversationGate.test.ts` verifies:

- top-level `conversation_ref` precedence
- `local-user-message` payload fallback resolution
- stale non-local events ignored only when turn active and phase non-terminal
- local-user-message mismatch events never ignored

`tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx` verifies end-to-end listener behavior:

- stale `streaming-response` with mismatched conversation ref is ignored
- compatibility events that omit conversation ref still process normally

## Drift Hotspots

1. ignoring all mismatched events regardless of phase blocks post-turn handoff.
2. removing local-user-message fallback breaks first-turn session updates in mixed payload shapes.
3. moving transcript-session update before the gate causes stale events to overwrite transcript identity.

## Related Pages

- [Frontend Renderer Chat Stream Docs Hub](README.md)
- [Tracking, Formatting, and Message-Update Utility Reference](tracking_formatting_and_message_update_utility_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
