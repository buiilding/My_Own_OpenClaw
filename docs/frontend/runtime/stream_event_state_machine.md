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
- `frontend/src/renderer/features/chat/utils/streamPhaseState.js`

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
Terminal-vs-active stream turn gating is centralized in `streamPhaseState.isTerminalStreamPhase(...)` so stale-conversation filtering and tool-runner stale-turn behavior share one phase contract.

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
- set `isSending=true` for the target workspace.
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

Main process phase names and metadata keys are centralized in `frontend/src/main/ipc_overlay_phase_contract.cjs`, sourced from shared contract data in `frontend/src/shared/response_overlay_phase_contract.json`; `index.cjs` consumes `createResponseOverlayPhaseEnum()` so handler/runtime wiring cannot drift from the canonical phase contract.
Renderer phase predicates and payload parsing now share the same contract module (`frontend/src/renderer/features/chat/utils/responseOverlayPhaseContract.js`), which reads the same shared JSON contract so stream-phase guards and overlay event payload parsing use one canonical phase/metadata vocabulary.
Cross-layer parity is guarded by `tests/frontend/OverlayPhaseContractParity.test.js`, which asserts renderer/main phase names, metadata keys, and enum mapping remain identical.

Renderer uses that channel in parallel with `streamTracking.phase`:

- `ChatBox.jsx` uses stream/overlay phases for visual loop state only (not click-through toggling).
- `chatLoopUiState.js` now provides a shared finite-state transition table (`idle|awaiting-reply|active-response`) and `useChatLoopUiState(...)` is the single reducer-driven runtime used by both dashboard and overlay surfaces.
- `idle`
- `awaiting-reply`
- `active-response`
- `ChatBox.jsx` and `ChatBoxResponse.jsx` now share one renderer projection helper (`chatboxSurfaceState.js`) so the minimal chat pill follows a single explicit UI contract:
- `compact` -> chat pill only
- `awaiting-reply` -> chat pill + typing indicator
- `response` -> chat pill + response overlay
- `ChatInterface.jsx` uses that same loop vocabulary for dashboard stop-button state and awaiting-dot behavior, including the race where `streaming` arrives before the first assistant row renders.
- `ChatBoxResponse.jsx` uses that shared contract plus the latest visible assistant response to swap between typing and response views without separate component-local transition rules.
- `useChatLoopUiState(...)` listens to main-process `ipc-status` updates and applies a reconnect watchdog so missing terminal stream events after backend disconnect/reconnect cannot leave dashboard/chat pill permanently loop-locked.
- payload contract now includes optional recovery metadata:
- `correlation_id`
- `attempt`
- `max_attempts`
- `recovery_stage`
- `failure_reason`
- renderer phase listeners must treat these fields as optional and remain backward-compatible with phase-only payloads.

## Turn Correlation and Late Event Safety

Correlation helpers:

- `turn_ref` is propagated through chat rows.
- tool output correlation id is derived from payload (`correlation_id` or request id fallback).
- tool-call/tool-bundle correlation ids are normalized via `chatStreamEventUtils` helpers so whitespace-only ids are ignored consistently across transcript metadata and tracking logs.
- shared normalization now routes through `toolCorrelationIds.ts` so tool-call/tool-output/tool-bundle correlation precedence stays consistent between stream handlers and tool runner message assembly.

Late-event mitigation:

- conversation mismatch events are dropped.
- tool-runner layer adds stale-turn guards before executing tool calls (`useToolRunner`).
- stream completion logic scopes updates to active turn where possible.
