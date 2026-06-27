---
summary: "Deep reference for query send lifecycle events: SDK-owned user-message projection and Electron query-send failure synthesis."
read_when:
  - When changing query send flow in `ipc.cjs` or helper contracts in `ipc_query_events.cjs`.
  - When debugging missing local user echo messages or query-send failure errors.
title: "Query Send-Failure Synthesis Reference"
---

# Query Send-Failure Synthesis Reference

## Canonical Modules

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/ipc/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc/ipc_query_send_runtime.cjs`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `packages/windie-sdk-js/src/events/backendEvents.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`

## Ownership Boundary

SDK `ConversationRuntime.send(...)` owns the local turn-start and user-message
projection:

- emits `turn_started`
- emits `user_message`
- forwards query payload through the active backend transport
- rejects if the transport cannot send

Electron main must not synthesize a duplicate optimistic local user message
before SDK send. It only prepares the query payload and emits explicit
send-failure feedback if SDK send returns no message id.

Conversation reference resolution still lives in Electron query prep:

- `resolveConversationRef(payload, currentConversationRef)`
- prefers payload value, falls back to current tracked conversation

## Context-Field Helper Semantics

`buildQueryContextFields(...)` behavior:

- uses server user id (`currentServerUserId`) by default
- optional fallback to client-generated user id only when explicitly enabled (`includeClientUserFallback`)
- always returns explicit `null` for missing fields

This keeps synthetic event context shape deterministic for renderer filters.

## Query Send-Failure Event Contract

`buildQuerySendFailure(...)` returns the deterministic failure context consumed
by `broadcastQuerySendFailure(...)`:

- `type: "error"`
- `id`: original `queryMessageId`
- `event_id`: stable local failure id derived from the query id
- same query context fields (`turn_ref`, `session_id`, `user_id`, `conversation_ref`)
- payload:
  - `message: "Your message wasn't sent because WindieOS isn't connected right now. Try again when the connection is restored."`

`broadcastQuerySendFailure(...)` converts that context into an SDK
conversation event with:

- `type: "turn_error"`
- `source: "electron-main"`
- `payload.sourceEventType: "query-send-failed"`
- payload `message` and `content` set to the failure message

`broadcastQuerySendFailure(...)` also sets overlay phase to:

- `idle` (`query-send-failed` source)

## Main Query Lifecycle Integration

In the `ipc.cjs` `windie:invoke` command `conversation.send` query path:

1. generate `queryMessageId`
2. resolve/fill `conversation_ref`
3. enrich query payload (`content`, optional `system_state_internal`)
4. attempt websocket send through the SDK runtime query command router
5. if send fails or returns no message id, emit synthetic error via
   `broadcastQuerySendFailure(...)`

The SDK conversation runtime emits the user-message projection for accepted
turn starts, so Electron main does not synthesize a second optimistic
local-user-message event.

## Renderer Consumption Path

`local-user-message` is part of typed `BackendEventType` union and is handled by `useChatStream`:

- adds user chat row with optional screenshot refs (`screenshot_refs[]` first, fallback `screenshot_ref`)
- resets stream-tracking for new turn (`awaiting-first-chunk`, `resetForTurn`)

Synthetic send-failure `turn_error` events are handled through the normal
renderer error path unless filtered by `DesktopChatStreamEventPayloadRuntime.shouldIgnoreStreamError(...)`.
Renderer send hooks may clear the short local pending bridge when
`conversation.send` rejects, but they must not append their own assistant error
chat row for the same failure. Visible failure rows come from SDK/main
conversation events and `ConversationView` projection.

## Drift Hotspots

1. Electron query prep reintroduces a synthetic local user-message path and duplicates SDK `user_message`.
2. query send-failure text changed and downstream status/error heuristics rely on exact string fragments
3. failure event identity fields are omitted, causing renderer conversation
   filtering to drop the SDK `turn_error`
4. fallback user-id policy modified, causing unexpected null/non-null context behavior
5. conversation-ref resolution changed, breaking active-conversation filtering

## Debug Checklist

If user query appears to "vanish" before backend response:

1. verify `ConversationRuntime.send(...)` emitted SDK `turn_started` and `user_message`
2. verify Electron main broadcast `windie:conversation-event`, `windie:rows`, and `windie:current-turn`
3. verify conversation filter did not drop event (conversation_ref mismatch)

If query send failure is silent:

1. verify the SDK runtime query send rejected or returned no message id
2. verify `broadcastQuerySendFailure(...)` executed
3. verify the SDK `turn_error` includes stable `eventId`, `turnRef`, and
   `conversationRef`
4. verify renderer receives the normalized `windie:conversation-event` `turn_error`

## Related Pages

- [Frontend Contracts Events Docs Hub](README.md)
- [From-Backend Event Ingress, Typed Guard, and Audio Side-Channel Reference](from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md)
- [Backend Event Consumer Matrix Reference](../backend_event_consumer_matrix_reference.md)
- [Query Payload and Relay Reference](../../main/query_payload_and_relay_reference.md)
