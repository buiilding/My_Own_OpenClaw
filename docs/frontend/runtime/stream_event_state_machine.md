---
summary: "Renderer stream runtime reference: backend-event ingress routing, turn-scoped stale-event guards, stream tracking transitions, and loop-state projection to dashboard/chatbox surfaces."
read_when:
  - When changing chat stream handler composition, backend event ingress, or stream-tracking updates.
  - When debugging reconnect races, stale-turn event drops, or stuck loop-busy UI after terminal events are missed.
title: "Stream Event State Machine"
---

# Stream Event State Machine

## Owner Modules

- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useTurnScopedBackendEventHandler.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamTextHandlers.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamToolHandlers.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamCompletionHandler.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamTerminalHandlers.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamBackendIngress.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamEventRuntime.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamTerminalHandoffGuard.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamConversationGate.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamTurnGuard.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamTracking.ts`
- `frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerEventGuards.ts`
- `frontend/src/renderer/features/chat/utils/toolRunner/toolRunnerExecutionState.ts`
- `frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState.js`
- `frontend/src/renderer/features/chat/hooks/useChatLoopUiState.js`
- `frontend/src/renderer/features/chat/utils/state/chatLoopUiState.js`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/types/backendEvents.ts`

## Inbound Event Surface

Handled backend event types:

- `local-user-message`
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

## Event Ingress and Conversation Routing

`useChatStream` listener flow:

1. validate payload with `isBackendEvent(...)`
2. resolve target conversation ref through `chatStreamEventRuntime.resolveTargetConversationRef(...)`
3. call `ingestBackendEvent(...)` to:
  - sync active conversation projection when event has explicit conversation identity
  - register `turn_ref -> conversation_ref` mapping
  - refresh transcript session binding (`activeConversationRef || resolvedConversationRef`)
  - dispatch to event-type handler map
4. optional renderer trace logging (`[StreamTrace][renderer][before|after]`) runs only when the window URL includes `debug_stream=1` so normal `electron:dev` sessions do not spam console output

Conversation resolution order:

1. explicit `event.conversation_ref`
2. compatibility fallbacks:
  - `memory-store`: `payload.session_id`, then `event.session_id`
  - `local-user-message`: `payload.conversation_ref`
3. `turn_ref` workspace mapping
4. active transcript conversation fallback

This is workspace routing, not active-chat filtering. Background conversations keep receiving their own events.

## Turn-Scoped Stale Event Guard

All chat-stream handlers except `local-user-message` run through
`useTurnScopedBackendEventHandler(...)` with one shared guard contract:

- compare incoming `event.turn_ref` with workspace `streamTracking.activeTurnRef`
- drop when values differ
- keep the wrapper callback identity stable across rerenders while reading the latest
  handler implementation, so model-metadata changes do not force backend listener
  resubscription

Guard exception:

- if workspace is sending a new turn (`isSending=true`) while stream phase is terminal (`idle|complete|error`), stale-turn guard is temporarily relaxed so first packets of the new turn are not dropped due to lagging turn-reset bookkeeping.
- when terminal handoff has already re-anchored to the current `turn_ref`, same-turn packets are still allowed only if the workspace tail is the optimistic user row for that new turn; assistant-tailed completed/error workspaces still reject trailing old-turn packets.
- terminal-handoff packet policy now lives in `chatStreamTerminalHandoffGuard.ts` as pure predicates so re-anchor behavior can be regression-tested without going through the whole ingress runtime.
- tool-runner turn guards and local tool-result persistence now reuse the same terminal-handoff predicates, so dashboard tool rows and local execution output stay aligned with stream ingress during later-turn re-anchor windows.

Handler-level skip:

- `local-user-message` uses `skipStaleTurnGate=true` because it seeds turn state.

Extra error gate:

- `buildChatStreamHandlerMap(...)` suppresses benign errors through `shouldIgnoreStreamError(...)` before `handleError(...)`.

## Stream Tracking Model

`chatStore.streamTracking` fields:

- `activeTurnRef`
- `phase`: `idle | awaiting-first-chunk | streaming | tool-call | tool-output | complete | error`
- `startedAt`, `firstChunkAt`, `completedAt`, `lastEventAt`
- `eventCount`, `chunkCount`, `toolCallCount`, `toolOutputCount`
- `lastEventType`, `lastChunkSize`, `lastError`

Transition reducer is centralized in `applyTrackingEvent(...)`.

Reset/start contract:

- `local-user-message` records `phase='awaiting-first-chunk'` with `resetForTurn=true`

Automatic updates:

- `streaming-response` increments `chunkCount`, sets first chunk timestamp, defaults phase to `streaming`
- tool handlers increment tool call/output counters
- error options set `lastError`, terminal phase, and completion timestamp
- `phase='complete'` stamps completion timestamp when missing

Dashboard/pill presentation note:

- terminal `phase='complete'|'error'` still renders as `awaiting-reply` when a new send latch is already active and the current turn has no visible assistant reply yet; this prevents later turns from inheriting the previous turn's terminal phase and suppressing the awaiting indicator.

## Event-to-State Side Effects

`local-user-message`:

- add optimistic user row
- set sending true
- initialize thinking fallback for non-thinking-text models
- reset stream tracking for new turn

`llm-thought`:

- accumulate thinking status and thinking text on current assistant row
- create assistant placeholder row when needed

`streaming-response`:

- clear sending latch
- append/extend assistant `llm-text` row for the turn

Compaction events:

- run through the shared turn-scoped handler wrapper
- update thinking status/source with compaction start/success/failure messaging

Tool events:

- clear transient thinking state
- append tool-call/tool-output/tool-bundle rows
- record transcript rows for tool-call/tool-output when transcript is enabled

Metadata/transparency events (`system-prompt`, `user-message-full`, `assistant-message-full`, `tool-schemas`):

- run through the shared turn-scoped handler wrapper
- update metadata on existing user/assistant rows
- no new assistant text rows

Terminal/diagnostic events:

- `token-count`: update token counts
- `memory-store`: tracking-only side effect in renderer stream handler path
- `streaming-complete`: runs through the shared turn-scoped handler wrapper, then persists final thinking text, marks assistant row complete, and optionally writes assistant transcript row
- `error`: clear sending/thinking, append assistant error row, optionally record transcript error row

## Loop UI Projection Coupling

`useChatLoopUiState` projects stream/transport signals into shared loop UI states:

- `idle`
- `awaiting-reply`
- `active-response`

Transport safety:

- `ipc-status` disconnect forces loop UI state to `idle`
- reconnect arms a watchdog; if no stream progress arrives before timeout, state is forced back to `idle`

Consumers:

- `ChatInterface.jsx` stop button and awaiting-dot behavior via `useCurrentTurnPresentationState(...)`
- `ChatBox.jsx` interaction-lock behavior via `useCurrentTurnPresentationState(...)`
- `ChatBoxResponse.jsx` compact/awaiting/response surface mode via the same shared current-turn presentation contract

## Turn Correlation and Late Event Safety

- `turn_ref` is persisted on chat rows and stream tracking
- `turn_ref -> conversation_ref` map allows late events without conversation refs to route correctly
- stale-turn guards in stream handlers and tool-runner callbacks prevent old-turn payloads from mutating active-turn UI

## Related Pages

- [Chat Stream and Tool Execution Reference](../renderer/chat_stream_and_tool_execution_reference.md)
- [Frontend Renderer Chat Stream Docs Hub](../renderer/chat/stream/README.md)
- [Backend Ingress Fail-Safe and Dispatch Order Reference](../renderer/chat/stream/backend_ingress_failsafe_and_dispatch_order_reference.md)
- [Chat Loop UI State Disconnect Recovery and Surface Projection Reference](../renderer/chat/loop_ui_state_disconnect_recovery_and_surface_projection_reference.md)
