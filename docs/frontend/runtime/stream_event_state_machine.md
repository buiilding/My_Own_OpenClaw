---
summary: "Renderer stream state-machine reference: backend event filtering, per-turn tracking, phase transitions, and message/transcript side effects in useChatStream."
read_when:
  - When changing backend event handling, stream phase transitions, or per-turn message updates.
  - When debugging stale conversation events, duplicate assistant chunks, or completion/error edge cases.
title: "Stream Event State Machine"
---

# Stream Event State Machine

## Owner Modules

- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/types/backendEvents.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamConversationGate.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamTracking.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamMessageUpdates.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamEventUtils.ts`

## Inbound Event Surface

Backend event union (`BackendEventType`):

- `llm-thought`
- `streaming-response`
- `streaming-complete`
- `tool-call`
- `tool-output`
- `tool-bundle`
- `local-user-message`
- `system-prompt`
- `user-message-full`
- `assistant-message-full`
- `token-count`
- `tool-schemas`
- `error`

## Conversation Guard and Session Sync

Before dispatch:

1. `isBackendEvent(...)` type-guards incoming payload.
2. `shouldIgnoreEventForActiveConversation(...)` drops events whose `conversation_ref` does not match active transcript conversation.
3. transcript session metadata is refreshed (`updateTranscriptSession(...)`) when transcript mode is enabled.

This prevents cross-conversation leakage when multiple threads are loaded locally.

## Stream Tracking Model

`chatStore.streamTracking` fields:

- `activeTurnRef`
- `phase`: `idle | awaiting-first-chunk | streaming | tool-call | tool-output | complete | error`
- timing: `startedAt`, `firstChunkAt`, `completedAt`, `lastEventAt`
- counters: `eventCount`, `chunkCount`, `toolCallCount`, `toolOutputCount`
- diagnostics: `lastEventType`, `lastChunkSize`, `lastError`

`recordTrackingEvent(...)` rules:

- new turn reset is triggered by `local-user-message` (`resetForTurn=true`).
- first streaming chunk sets `firstChunkAt` if unset.
- tool events increment dedicated counters and phase.
- terminal error stores `lastError` and `completedAt`.
- completion sets `phase=complete` and fills `completedAt`.
- transition math is centralized in `applyTrackingEvent(...)` to keep hook handlers thin and deterministic.

## Event-to-UI State Transitions

### `local-user-message`

Effects:

- append user chat row immediately (optimistic local echo).
- optional screenshot refs attached.
- transition phase to `awaiting-first-chunk`.
- reset stream-tracking counters for new turn.

### `llm-thought`

Effects:

- updates `thinkingStatus` string via `buildThinkingStatus(...)`.
- tracking event recorded without changing message rows.

### `streaming-response`

Effects:

- `setIsSending(false)` once chunks arrive.
- resolves append-or-create behavior:
- append to last assistant llm-text row for same turn when possible
- otherwise create new assistant llm-text row
- tracking phase -> `streaming`.

### `tool-call` and `tool-bundle`

Effects:

- clear thinking status.
- append assistant row (`type='tool-call'`) with formatted payload.
- increment tool-call counters.
- optional transcript write (`recordToolMessage`) with model/provider metadata and correlation id.

### `tool-output`

Effects:

- clear thinking status.
- append assistant row (`type='tool-output'`) with:
- formatted output text
- screenshot reference/url
- tool metadata, execution time, success flag
- correlation id
- tracking phase -> `tool-output`.
- optional transcript write as tool-output message.

### `system-prompt` / `tool-schemas` / `user-message-full` / `assistant-message-full`

Effects:

- update existing message metadata-only transparency fields.
- no new visible assistant chunk row is created by these events.

### `token-count`

Effects:

- updates token counters store (`setTokenCounts`).

### `streaming-complete`

Effects:

- clears `isSending` and thinking status.
- marks final assistant llm-text row complete when found.
- writes assistant transcript row (if enabled).
- tracking phase -> `complete`.

### `error`

Effects:

- ignored when `shouldIgnoreStreamError(...)` says non-fatal.
- otherwise appends assistant error row, clears sending/thinking, records transcript, phase -> `error`.

## Overlay Phase Coupling

Overlay phase is maintained in Electron main via `ipc.cjs` and emitted as `response-overlay-phase`.

Renderer uses that channel in parallel with `streamTracking.phase`:

- `ChatBox.jsx` uses stream/overlay phases for visual loop state only (not click-through toggling).
- `ChatBoxResponse.jsx` chooses awaiting/tool-ghost/final response views.

## Turn Correlation and Late Event Safety

Correlation helpers:

- `turn_ref` is propagated through chat rows.
- tool output correlation id is derived from payload (`correlation_id` or request id fallback).

Late-event mitigation:

- conversation mismatch events are dropped.
- tool-runner layer adds stale-turn guards before executing tool calls (`useToolRunner`).
- stream completion logic scopes updates to active turn where possible.
