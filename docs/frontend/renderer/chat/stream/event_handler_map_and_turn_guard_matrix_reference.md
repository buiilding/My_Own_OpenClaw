---
summary: "Deep reference for `useChatStream` SDK event dispatch, stale-turn guard coverage, and error suppression boundaries before per-event side effects."
read_when:
  - When changing `useChatStream` SDK conversation-event dispatch wiring or adding/removing conversation event types.
  - When debugging events that route to a conversation workspace but do not mutate UI/transcript state.
title: "Stream Dispatch and Turn Guard Matrix Reference"
---

# Stream Dispatch and Turn Guard Matrix Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamToolHandlers.ts`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamTerminalHandlers.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTurnGuardRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTurnGuardRuntime.ts`
- `frontend/src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream.ts`
- `frontend/src/renderer/app/runtime/desktopSdkLiveTurnEffectsRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamThinkingRuntime.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`

## Dispatch Pipeline

Listener flow in `desktopChatStreamIngressRuntime`:

1. receive SDK `ConversationEvent` from `windie:conversation-event`
2. require non-empty workspace conversation identity
3. optionally rebind active workspace projection (`user_message` or empty active projection + explicit conversation identity)
4. register `turnRef -> conversationRef` mapping
5. update transcript session binding (`activeConversationRef || resolvedConversationRef`)
6. dispatch SDK-owned event families from conversation events through
   the chat hook callback

## Dispatch Wiring Contract

Assistant thinking, assistant text, live tool rows, active tool phase tracking,
and terminal complete/error phase tracking come from the SDK `currentTurn`
projection. Completion transcript persistence/materialization, compaction,
transparency metadata, error transcript persistence/materialization, token
usage, and transcript tool persistence still dispatch
from SDK-normalized conversation events.
Benign/recoverable error suppression runs in the SDK current-turn projection and
inside `useChatStreamTerminalHandlers` before transcript/error materialization.

## Active-Turn Guard Matrix

`useChatStream` applies one shared stale-turn condition through
`shouldIgnoreConversationEventForStaleTurn(...)` for every mutable event family
except `user_message`:

- if event has `turn_ref`
- and target workspace has active turn
- and active turn differs from event turn
- then handler returns with no side effects

The pure active-turn comparison is exposed through
`DesktopChatStreamTurnGuardRuntime.isStaleTurnForActiveStream(...)`; the raw
predicate stays private to `desktopChatStreamTurnGuardRuntime.ts`.

Pending-next-turn exception:

- when the workspace is in a terminal phase (`idle`/`complete`/`error`) and
  renderer `pendingTurn.turnRef` matches the incoming `turn_ref`, stale-turn
  guard does **not** reject the mismatched active stream turn.
- bare `isSending === true` is diagnostic compatibility state and does not
  open this exception; unrelated non-pending turn refs are still rejected.
- this allows first chunks for the next accepted renderer turn to pass even if
  backend `local-user-message` echo arrives late or is missing.

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
- `token-count`
- `error`

Wrapper guarantee:

- the shared turn-scoped wrapper keeps callback identity stable across rerenders
  while reading the latest handler logic, so `useChatStream` does not resubscribe
  the conversation event listener when config/model metadata changes.

Unguarded event:

- `user_message`

Reason: `user_message` establishes turn/workspace state and seeds pending bridge rows before subsequent guarded events arrive.

## Side-Effect Ownership After Dispatch

- `DesktopChatStreamEventRuntime`: owns SDK conversation event identity
  predicates used by both `useChatStream` dispatch and sub-handler fail-fast
  guards.
- `useChatStreamLocalUserHandler`: seeds local-user turn state and model
  context from `user_message` events while `DesktopChatStreamEventPayloadRuntime`
  owns `text`/`content` payload alias normalization.
- `useChatStreamToolHandlers`: persists tool-call/tool-output/tool-bundle transcript rows only, and routes `tool-output` transcript rows through the shared `ConversationRuntime.ts` helper
- `useChatStreamTerminalHandlers`:
  - SDK `usage_updated`: workspace token counter update
  - SDK `turn_error`: materialized assistant error row + transcript error row unless suppressed
- `useConversationRuntimeProjectionStream`:
  - listens to SDK current-turn projections and passes accepted projections to `DesktopSdkLiveTurnEffectsRuntime`
  - keeps per-conversation/turn cursors so repeated projections do not duplicate text-delta or tool-event side effects
- `desktopConversationDisplayProjection.ts`:
  - projects SDK display rows into chat messages for transcript display
  - merges renderer-only annotations and pending bridge user rows into SDK display messages without duplicating SDK-projected user turns
- `DesktopSdkLiveTurnEffectsRuntime`:
  - SDK `currentTurn.reasoningText`: live thinking text and `llm-thought` stream tracking
  - SDK `currentTurn.assistantText`: clear the send latch and record `streaming-response` chunk tracking without creating raw assistant rows
  - SDK `currentTurn.toolEvents`: clear send/thinking state for active executable tool rows and record `tool-call`, `tool-output`, and `web-search-progress` phase tracking
  - SDK `currentTurn.phase`: clear send/thinking state and record terminal `streaming-complete`/`error` tracking for `complete`/`error`
  - backend-owned synthetic tool calls projected by the SDK with `executionSkipped === true`: record the tool-call tracking event without clearing typing/thinking state as if an executable local-runtime tool started
- `useChatStream` core handlers:
  - `streaming-complete`: assistant message completion + optional transcript assistant write; duplicate terminal tracking is gated by `DesktopChatStreamEventRuntime.shouldRecordTerminalCompletionTracking(...)` so raw `isSending` compatibility state does not own completion recording
  - transparency handlers: mutate existing user/assistant rows with metadata snapshots

## Drift Hotspots

1. Adding a new backend stream event without SDK normalization or a mapped SDK
   conversation event silently drops the renderer side effect.
2. Removing stale-turn guard from a mutable handler can leak old-turn output into the active workspace.
3. Removing ignored-error filtering from either SDK current-turn projection or terminal transcript handling can reintroduce benign settings/recoverable parser errors.
4. Adding renderer-side local memory writes would duplicate the SDK-owned completed-turn memory pipeline.

## Related Pages

- [Frontend Renderer Chat Stream Docs Hub](README.md)
- [Conversation Gate and Active-Turn Filtering Reference](conversation_gate_and_active_turn_filtering_reference.md)
- [Chat Stream and Tool Execution Reference](../../chat_stream_and_tool_execution_reference.md)
