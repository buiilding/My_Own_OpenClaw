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
- `frontend/src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream.ts`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnProjectionEffectsRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamThinkingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTurnGuardRuntime.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamToolHandlers.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamCompletionHandler.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamTerminalHandlers.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamIngressRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamEventRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTerminalHandoffRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTurnGuardRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTrackingRuntime.ts`
- `frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime.js`
- `frontend/src/renderer/features/chat/hooks/useChatLoopUiState.js`
- `frontend/src/renderer/app/runtime/desktopChatLoopUiRuntime.js`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `packages/windie-sdk-js/src/events/backendEvents.ts`

## Inbound Event Surface

Renderer chat now consumes SDK `ConversationEvent` objects from
`windie:conversation-event`. Those events are projected from backend websocket
events by the SDK backend-event normalizer before they reach `useChatStream`.

Handled conversation event types:

- `user_message`
- `assistant_message`
- `turn_completed`
- `turn_error`
- `tool_call`
- `tool_output`
- `tool_bundle_call`
- `tool_bundle_output`
- `compaction_started`
- `compaction_applied`
- `compaction_skipped`
- `compaction_failed`
- `system_prompt`
- `user_message_metadata`
- `tool_schemas_metadata`
- `usage_updated`

## Event Ingress and Conversation Routing

`desktopChatStreamIngressRuntime` listener flow:

1. receive the SDK `ConversationEvent` from `windie:conversation-event`
2. reject missing or malformed conversation identity
3. call `handleConversationEventIngress(...)` to:
  - sync active conversation projection when event has explicit conversation identity
  - register `turn_ref -> conversation_ref` mapping
  - refresh transcript session binding (`activeConversationRef || resolvedConversationRef`)
  - dispatch to SDK-normalized handlers through the chat hook callback
4. optional renderer trace logging (`[StreamTrace][renderer][before|after]`) runs only when the window URL includes `debug_stream=1` so normal `electron:dev` sessions do not spam console output

Conversation resolution order:

1. explicit SDK `event.conversationRef`
2. quarantine when no conversation identity exists

This is workspace routing, not active-chat filtering. Background conversations keep receiving their own events.

## Turn-Scoped Stale Event Guard

All chat-stream handlers except `user_message` call
`shouldIgnoreConversationEventForStaleTurn(...)` before mutating workspace UI
state. The guard is implemented by `desktopChatStreamEventRuntime.ts` and the
pure turn comparison in `desktopChatStreamTurnGuardRuntime.ts`:

- compare incoming SDK `event.turnRef` with workspace `streamTracking.activeTurnRef`
- drop when values differ
- preserve first-packet and terminal-handoff exceptions so a newly sending turn
  can re-anchor after optimistic local bookkeeping lags

Guard exception:

- if workspace is sending a new turn (`isSending=true`) while stream phase is terminal (`idle|complete|error`), stale-turn guard is temporarily relaxed so first packets of the new turn are not dropped due to lagging turn-reset bookkeeping.
- when terminal handoff has already re-anchored to the current `turn_ref`, same-turn packets are still allowed only if the workspace tail is the SDK user row for that new turn; assistant-tailed completed/error workspaces still reject trailing old-turn packets.
- terminal-handoff packet policy now lives in `desktopChatStreamTerminalHandoffRuntime.ts` as pure predicates so re-anchor behavior can be regression-tested without going through the whole ingress runtime.
- SDK/main execution-side stale-turn handling should stay aligned with this stream ingress policy so display projections and local result delivery do not diverge during later-turn re-anchor windows.

Handler-level skip:

- `user_message` bypasses stale-turn filtering because it seeds turn state.

Extra error gate:

- SDK `turn_error` handling suppresses benign errors through
  `shouldIgnoreStreamError(...)` before UI mutation.

## Stream Tracking Model

`chatStore.streamTracking` fields:

- `activeTurnRef`
- `phase`: `idle | awaiting-first-chunk | streaming | tool-call | tool-output | complete | error`
- `startedAt`, `firstChunkAt`, `completedAt`, `lastEventAt`
- `eventCount`, `chunkCount`, `toolCallCount`, `toolOutputCount`
- `lastEventType`, `lastChunkSize`, `lastError`

Transition reducer is centralized in `applyTrackingEvent(...)`. SDK
current-turn projection deltas are converted into those tracking events by
`desktopCurrentTurnProjectionEffectsRuntime.ts`; `useConversationRuntimeProjectionStream`
owns subscription, cursor storage, stale projection acceptance, and display-row
merging.

Reset/start contract:

- `local-user-message` records `phase='awaiting-first-chunk'` with `resetForTurn=true`

Automatic updates:

- SDK `currentTurn.assistantText` growth records a `streaming-response` tracking event, increments `chunkCount`, sets first chunk timestamp, and defaults phase to `streaming`
- SDK `currentTurn.reasoningText` growth records an `llm-thought` tracking event
- SDK `currentTurn.toolEvents` growth records `tool-call`, `tool-output`, or `web-search-progress` tracking and increments tool counters
- SDK `currentTurn.phase='complete'` records `streaming-complete`, clears send/thinking state, and stamps completion timestamp when missing
- SDK `currentTurn.phase='error'` records `error`, clears send/thinking state, stores `lastError`, and stamps completion timestamp when missing

Dashboard/pill presentation note:

- terminal `phase='complete'|'error'` still renders as `awaiting-reply` when a new send latch is already active and the current turn has no visible assistant reply yet; this prevents later turns from inheriting the previous turn's terminal phase and suppressing the awaiting indicator.

## Event-to-State Side Effects

`local-user-message`:

- seed the SDK user row in renderer compatibility state
- set sending true
- initialize thinking fallback for non-thinking-text models
- reset stream tracking for new turn

SDK current-turn reasoning text:

- accumulate transient thinking status from `currentTurn.reasoningText`
- keep `llm-thought` as the UI/tracking source label

SDK current-turn assistant text:

- clear sending latch
- record `streaming-response` tracking from `currentTurn.assistantText` growth
- dashboard and response overlay render the assistant text from the SDK projection rather than backend-wire chunks

Compaction events:

- run through the shared turn-scoped handler wrapper
- update thinking status/source with compaction start/success/failure messaging

SDK current-turn tool events:

- clear transient thinking state for executable local-runtime tool rows. Backend-owned
  synthetic tool calls projected with `executionSkipped === true`
  still record tool-call tracking, but they do not clear the current typing or
  thinking state as if an executable local-runtime tool had started.
- dashboard renders SDK display rows for normal tool-call/tool-output rows and
  retained OpenAI-native `tool_progress` search trace rows. Response overlay
  renders current-turn tool-call/tool-output/tool-progress rows from the SDK
  projection. Rehydrate history groups OpenAI-native progress-only search into a
  synthetic paired Windie `web_search` tool call/output.
- record active tool phase tracking from `currentTurn.toolEvents`

SDK current-turn terminal phase:

- clear transient sending/thinking state from `currentTurn.phase='complete'|'error'`
- record terminal complete/error phase tracking from the SDK projection rather than backend-wire terminal events
- dashboard and response overlay render terminal error text from `currentTurn.lastError`

Tool transcript events:

- `useChatStreamToolHandlers` persists tool-call/tool-output/tool-bundle transcript rows when transcript is enabled
- it does not own live tool rows, send-latch cleanup, or phase tracking

Metadata/transparency events (`system-prompt`, `user-message-full`, `assistant-message-full`, `tool-schemas`):

- run through the shared turn-scoped handler wrapper
- update metadata on existing user/assistant rows
- no new assistant text rows

Terminal/diagnostic events:

- `token-count`: update token counts
- `streaming-complete`: runs through the shared turn-scoped handler wrapper, then materializes the projected final assistant row and optionally writes assistant transcript row
- `error`: materializes the projected assistant error row and optionally records transcript error row

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
- stale-turn guards in stream handlers and SDK/local-runtime callbacks prevent old-turn payloads from mutating active-turn UI

## Related Pages

- [Query Send and Stream Relay Change Workflow](../main/query_send_and_stream_relay_change_workflow.md)
- [Chat Stream and Tool Execution Reference](../renderer/chat_stream_and_tool_execution_reference.md)
- [Frontend Renderer Chat Stream Docs Hub](../renderer/chat/stream/README.md)
- [Conversation Event Ingress Fail-Safe and Dispatch Order Reference](../renderer/chat/stream/conversation_event_ingress_failsafe_and_dispatch_order_reference.md)
- [Chat Loop UI State Disconnect Recovery and Surface Projection Reference](../renderer/chat/loop_ui_state_disconnect_recovery_and_surface_projection_reference.md)
