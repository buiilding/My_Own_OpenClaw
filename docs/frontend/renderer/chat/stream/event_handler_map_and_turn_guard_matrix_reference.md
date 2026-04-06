---
summary: "Deep reference for `useChatStream` event-handler map wiring, stale-turn guard coverage, and error suppression boundaries before per-event side effects."
read_when:
  - When changing `buildChatStreamHandlerMap` wiring or adding/removing backend event types.
  - When debugging events that route to a conversation workspace but do not mutate UI/transcript state.
title: "Event Handler Map and Turn Guard Matrix Reference"
---

# Event Handler Map and Turn Guard Matrix Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamHandlerMap.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamToolHandlers.ts`
- `frontend/src/renderer/features/chat/utils/toolOutputTranscriptPersistence.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamTerminalHandlers.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamConversationGate.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamTurnGuard.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`

## Dispatch Pipeline

Listener flow in `useChatStream`:

1. validate envelope with `isBackendEvent`
2. resolve target workspace conversation identity
3. optionally rebind active workspace projection (`local-user-message` or empty active projection + explicit conversation identity)
4. register `turn_ref -> conversation_ref` mapping
5. update transcript session binding (`activeConversationRef || resolvedConversationRef`)
6. dispatch by `data.type` through `buildChatStreamHandlerMap(...)`

## Handler Wiring Contract

`buildChatStreamHandlerMap(...)` is the single event-type map for chat stream runtime:

- thinking/stream: `llm-thought`, `streaming-response`, `streaming-complete`
- compaction: `context-compaction-started/completed/failed`
- tool rows: `tool-call`, `tool-output`, `tool-bundle`
- transparency metadata: `system-prompt`, `user-message-full`, `assistant-message-full`, `tool-schemas`
- local optimistic user row: `local-user-message`
- terminal/metrics: `memory-store`, `token-count`, `error`

The map performs one additional pre-handler guard:

- `error` events run through `shouldIgnoreStreamError(...)`
- ignored errors do not call `handleError`

## Active-Turn Guard Matrix

`useChatStream` applies one shared stale-turn condition through
`useTurnScopedBackendEventHandler(...)` for every mutable event family except
`local-user-message`:

- if event has `turn_ref`
- and target workspace has active turn
- and active turn differs from event turn
- then handler returns with no side effects

Pending-next-turn exception:

- when the workspace is in a terminal phase (`idle`/`complete`/`error`) and `isSending === true`,
  stale-turn guard does **not** reject mismatched `turn_ref`.
- this allows first chunks for the next turn to pass even if backend `local-user-message`
  echo arrives late or is missing.

Guarded events:

- `llm-thought`
- `streaming-response`
- `streaming-complete`
- `context-compaction-started`
- `context-compaction-completed`
- `context-compaction-failed`
- `tool-call`
- `tool-output`
- `tool-bundle`
- `system-prompt`
- `user-message-full`
- `assistant-message-full`
- `tool-schemas`
- `memory-store`
- `token-count`
- `error`

Wrapper guarantee:

- the shared turn-scoped wrapper keeps callback identity stable across rerenders
  while reading the latest handler logic, so `useChatStream` does not resubscribe
  the backend listener when config/model metadata changes.

Unguarded event:

- `local-user-message`

Reason: local-user-message establishes turn/workspace state and seeds optimistic UI rows before subsequent guarded events arrive.

## Side-Effect Ownership After Dispatch

- `useChatStreamToolHandlers`: writes tool-call/tool-output/tool-bundle rows, resets thinking state for tool events, records transcript tool rows for call/output only, and routes `tool-output` transcript rows through the shared `toolOutputTranscriptPersistence.ts` helper
- `useChatStreamTerminalHandlers`:
  - `token-count`: workspace token counter update
  - `memory-store`: stream tracking only (no direct memory write side effect)
  - `error`: assistant error row + transcript error row (unless suppressed by handler map)
- `useChatStream` core handlers:
  - `streaming-complete`: assistant message completion + optional transcript assistant write
  - transparency handlers: mutate existing user/assistant rows with metadata snapshots

## Drift Hotspots

1. Adding a new backend event type without map wiring silently drops the event.
2. Removing stale-turn guard from a mutable handler can leak old-turn output into the active workspace.
3. Moving `shouldIgnoreStreamError` out of map-level dispatch can double-emit benign settings errors.
4. Adding transcript writes to `memory-store` handler would duplicate side effects already owned by backend-driven memory pipeline.

## Related Pages

- [Frontend Renderer Chat Stream Docs Hub](README.md)
- [Conversation Gate and Active-Turn Filtering Reference](conversation_gate_and_active_turn_filtering_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
