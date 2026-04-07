---
summary: "Deep reference for main-process synthetic `from-backend` events around query send lifecycle: local optimistic user-message generation and backend-send failure error synthesis."
read_when:
  - When changing query send flow in `ipc.cjs` or helper contracts in `ipc_query_events.cjs`.
  - When debugging missing local user echo messages or query-send failure errors.
title: "Local User Message and Query Send-Failure Synthesis Reference"
---

# Local User Message and Query Send-Failure Synthesis Reference

## Canonical Modules

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/renderer/types/backendEvents.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`

## Why Synthetic Events Exist

Main process injects renderer-facing events before/around backend query send to keep UI responsive and explicit when transport fails:

- optimistic local echo: `local-user-message`
- send failure feedback: `error` with query context

Both are emitted on `from-backend` channel so renderer handles them through normal stream/event listeners.

## Local User Message Build Contract

`buildLocalUserMessage(...)` requires `payload.text`; otherwise returns `null`.

Event shape:

- `type: "local-user-message"`
- context fields copied into root:
  - `turn_ref`
  - `session_id`
  - `user_id`
  - `conversation_ref`
- payload fields:
  - `text`
  - `screenshot_ref` (nullable)
  - `screenshot_refs` (nullable array; multi-image compatibility path)
  - `attachment_filenames` (nullable array; filename chips for user-row display)
  - `screenshot_url` (nullable)
  - `timestamp` (ISO)
  - `session_id`
  - `user_id`
  - `conversation_ref`

Conversation reference resolution:

- `resolveConversationRef(payload, currentConversationRef)`
- prefers payload value, falls back to current tracked conversation

## Context-Field Helper Semantics

`buildQueryContextFields(...)` behavior:

- uses server user id (`currentServerUserId`) by default
- optional fallback to client-generated user id only when explicitly enabled (`includeClientUserFallback`)
- always returns explicit `null` for missing fields

This keeps synthetic event context shape deterministic for renderer filters.

## Query Send-Failure Event Contract

`buildQuerySendFailure(...)` emits:

- `type: "error"`
- `id`: original `queryMessageId`
- same query context fields (`turn_ref`, `session_id`, `user_id`, `conversation_ref`)
- payload:
  - `message: "Your message wasn't sent because WindieOS isn't connected right now. Try again when the backend reconnects."`

`broadcastQuerySendFailure(...)` also sets overlay phase to:

- `idle` (`query-send-failed` source)

## Main Query Lifecycle Integration

In `ipc.cjs` `ipcMain.on("to-backend")` query path:

1. generate `queryMessageId`
2. resolve/fill `conversation_ref`
3. emit local optimistic user event via `broadcastLocalUserMessage(...)`
4. enrich query payload (`content`, optional `system_state_internal`)
5. attempt websocket send (`sendMessageToBackend("query", ...)`)
6. if send fails, emit synthetic error via `broadcastQuerySendFailure(...)`

The optimistic user message is emitted before send attempt, so send failures can produce a visible user-message + error pair.

## Renderer Consumption Path

`local-user-message` is part of typed `BackendEventType` union and is handled by `useChatStream`:

- adds user chat row with optional screenshot refs (`screenshot_refs[]` first, fallback `screenshot_ref`)
- resets stream-tracking for new turn (`awaiting-first-chunk`, `resetForTurn`)

Synthetic send-failure `error` events are handled through normal error path unless filtered by `shouldIgnoreStreamError(...)`.

## Drift Hotspots

1. helper emits `local-user-message` payload keys not reflected in renderer type definitions
2. multi-image payload omitted (`screenshot_refs`) while query payload includes it
3. query send-failure text changed and downstream status/error heuristics rely on exact string fragments
4. fallback user-id policy modified, causing unexpected null/non-null context behavior
5. conversation-ref resolution changed, breaking active-conversation filtering

## Debug Checklist

If user query appears to "vanish" before backend response:

1. verify `buildLocalUserMessage(...)` saw non-empty `payload.text`
2. verify optimistic event reached `from-backend` listeners
3. verify conversation filter did not drop event (conversation_ref mismatch)

If query send failure is silent:

1. verify `sendMessageToBackend(...)` returned `null`
2. verify `broadcastQuerySendFailure(...)` executed
3. verify error event passes `isBackendEvent(...)` and `shouldIgnoreStreamError(...)` guards

## Related Pages

- [Frontend Contracts Events Docs Hub](README.md)
- [From-Backend Event Ingress, Typed Guard, and Audio Side-Channel Reference](from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md)
- [Backend Event Consumer Matrix Reference](../backend_event_consumer_matrix_reference.md)
- [Query Payload and Relay Reference](../../main/query_payload_and_relay_reference.md)
