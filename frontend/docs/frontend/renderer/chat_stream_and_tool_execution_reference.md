---
summary: "Renderer chat runtime deep reference: provider coordination, message-send lifecycle, SDK conversation-event handling, removed chatStreamTransparency helper behavior, local tool execution boundary, thinking status ownership, SDK-projected tool display semantics, and app-runtime display-row annotation merge behavior."
read_when:
  - When changing renderer chat hooks, stream event handling, or projected tool display callbacks.
  - When debugging stale-turn tool cancellation, transcript writes, or streaming state drift.
  - When debugging SDK live-turn side effects such as send-latch cleanup, thinking text, streamTracking updates, or duplicate tool-event tracking.
  - When resolving stale references to removed `chatStreamTransparency.ts`, `ChatStreamTransparency.test.ts`, or `ChatStreamThinkingStatusUtils.test.ts` helper/test paths.
  - When stale code, tests, or docs mention exported `mergeRendererAnnotations` or direct renderer annotation-merge helpers; the merge now routes through `desktopConversationDisplayProjection.ts`.
title: "Chat Stream and Tool Execution Reference"
---

# Chat Stream and Tool Execution Reference

## Canonical Modules

- `frontend/src/renderer/app/providers/AppProvider.jsx`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/providers/AppStatusProvider.jsx`
- `frontend/src/renderer/app/providers/ChatProvider.jsx`
- `frontend/src/renderer/app/runtime/desktopChatMessageTypes.ts`
- `frontend/src/renderer/app/runtime/desktopPresentationSourceChannels.js`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream.ts`
- `frontend/src/renderer/app/runtime/desktopConversationRuntimeEventClient.ts`
- `frontend/src/renderer/app/runtime/desktopConversationProjectionStreamRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopModelThinkingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopSdkLiveTurnEffectsRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamThinkingRuntime.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamCompletionHandler.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamLocalUserHandler.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamTerminalHandlers.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamToolHandlers.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTurnGuardRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTrackingRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamMessageUpdateRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamEventPayloadRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamModelContextRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamIngressRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopModelThinkingRuntime.ts`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `frontend/src/renderer/infrastructure/hooks/useLatestRef.ts`
- `packages/windie-sdk-js/src/events/backendEvents.ts`

## Provider Topology and Ownership

Provider stack in renderer app:

1. `AppConfigProvider`
2. `AppStatusProvider`
3. coordinator inside `AppProvider` (save-status callback + `Shift+Tab` interaction-mode toggle)
4. `ChatProvider` (hooks-only composition)

Ownership boundaries:

- `AppConfigProvider`: persisted config, model-list fetch trigger, runtime settings sync, wakeword preference/suppression state
- `AppStatusProvider`: transient settings-save status (`idle/saving/success/error`) with timeout-based transitions
- `ChatProvider`: mounts `useChatStream`, mirrors transcript session `conversationRef` into chat-store `activeConversationRef`, and wires the active workspace read model into renderer trace transport through chat-store adapter getters. `DesktopChatProviderTraceRuntime` owns the ConversationView-first trace snapshot summary so the provider does not inspect display rows, raw messages, or raw Zustand workspace state directly. Local tool execution is owned by the Agent SDK runtime.

## Chat Message and Store Contracts

`desktopChatMessageTypes.ts` owns the shared `ChatMessage` and `TokenCounts`
types used by SDK display-row projection and renderer chat state. `chatStore.ts`
re-exports those types while owning only mutable Zustand state and actions.

`desktopPresentationSourceChannels.js` owns renderer presentation source-channel
labels (`sdk:conversation-event`, `sdk:current-turn`, `sdk:display-rows`) so
projection infrastructure and chat UI tagging share the same app-runtime
contract without importing each other.

## Chat Store Contract (`chatStore.ts`)

Primary state:

- `messages`
- `isSending`
- `thinkingStatus`
- `tokenCounts`
- `streamTracking`

Workspace identity state:

- `activeConversationRef`
- `workspaces` (per-conversation `messages/isSending/thinking/tokenCounts/streamTracking`)
- `turnConversationRefs` (turn->conversation routing fallback)

`streamTracking` fields used for runtime guardrails:

- active turn identity: `activeTurnRef`
- phase: `idle | awaiting-first-chunk | streaming | tool-call | tool-output | complete | error`
- timing markers: `startedAt`, `firstChunkAt`, `completedAt`, `lastEventAt`
- counters: events/chunks/tool calls/tool outputs
- last error text
- transition math lives in `DesktopChatStreamTrackingRuntime.applyTrackingEvent(...)`

## Model Capability Resolution and Thinking Fallback Policy

`useChatStream` resolves selected-model thinking flags through
`DesktopModelThinkingRuntime.resolveThinkingCapabilities(...)`:

- source set is merged `availableModels.local + availableModels.online`
- primary match: `{id, provider}`
- fallback match: `id` only
- renderer does not infer provider capabilities; thinking support comes only from backend model-catalog metadata

Resulting policy:

- if `supportsThinking=true` and `supportsThinkingTextStream=false`, local-user send path sets generic `Thinking...` status until stream text arrives
- otherwise thinking state starts empty and waits for SDK presentation thinking
  entries derived from backend `llm-thought` chunks

Thinking status methods from `DesktopChatStreamThinkingRuntime`:

- `DesktopChatStreamThinkingRuntime.getGenericThinkingStatus()` returns the temporary placeholder for models
  that report thinking support without a text stream, and
  `DesktopChatStreamThinkingRuntime.isGenericThinkingStatus(...)` lets projection side effects replace that
  placeholder when real reasoning text arrives.
- `DesktopChatStreamThinkingRuntime.getCompactionStartedThinkingStatus()`,
  `DesktopChatStreamThinkingRuntime.getCompactionCompletedThinkingStatus()`,
  `DesktopChatStreamThinkingRuntime.getCompactionFailedThinkingStatus()`, and
  `DesktopChatStreamThinkingRuntime.resolveCompactionFailedThinkingStatus(...)` provide live UI lifecycle labels
  for manual and stream-driven compaction paths while keeping raw label strings
  private to the app-runtime adapter.
- Final assistant thinking text comes from SDK current-turn reasoning
  projection, not from persisted placeholder status normalization.

## Runtime Projection Listener and Side Effects

`useConversationRuntimeProjectionStream` subscribes through
`DesktopConversationRuntimeEventClient` to renderer pending-turn broadcasts and
SDK `windie:current-turn` projections, then delegates current-turn application
and replay trace payload shaping to
`DesktopConversationProjectionStreamRuntime`. Normal chat display rows enter
the renderer through SDK `ConversationView`; the `windie:rows` channel remains
an Electron IPC compatibility/diagnostic transport, not a normal chat render
subscription.
When Electron main includes `view` on a `windie:current-turn` envelope, the
renderer must preserve that `ConversationView` in the normalized event and store
it in the target chat workspace before applying no-view current-turn side
effects. Retry and edit/resend live updates depend on that envelope; dropping
the view leaves only the local pending bridge visible after the raw display-row
stream subscription has been removed.

Replay diagnostics use the same projection-stream helper. Replay intent runtime
passes old/new turn refs into `buildReplayProjectionTracePayload(...)` and logs
the resulting summary; it should not read raw current-turn, pending-turn, stream
tracking, or message-count fields itself. Once `ConversationView` exists, that
helper reports trace current-turn identity from `ConversationView.liveTurn` and
uses that live-turn ref as the trace active turn while counting `displayRows`;
raw `chatStore.messages`, `currentTurnProjection`, and stream-tracking active
turn refs remain no-view diagnostic fallbacks only.

Renderer-only feedback is merged back into matching SDK-projected messages by
`desktopConversationDisplayProjection.ts`; prompt transparency, tool schemas,
full message details, and token counts should arrive on SDK-projected rows once
`ConversationView` exists. Main-thread `ConversationView` rendering passes that
field as a narrow annotation record selected from `chatStore.messages`, not as
the full raw message transcript. Display-row stream fallback may still inspect
full messages only while applying the no-view bridge.
`desktopConversationProjectionStreamRuntime.ts` composes that display adapter
with replay superseded-turn filtering, stale current-turn side-effect gating,
projection cursor management, and trace routing so the hook owns subscription
wiring and store dependency injection only; it does not own display-row
annotation, optimistic-row merge, stale replay display suppression, or
current-turn side-effect semantics.

Display-row stream projections are a no-`ConversationView` bridge. When the
workspace already has an SDK `ConversationView`, the runtime keeps the packet
trace-only and does not build legacy renderer chat messages or merge renderer
annotations from it. Normal chat rendering should read
`ConversationView.displayRows`; `chatStore.messages` remains only the local
pending/no-view fallback.

Conversation-stream sub-handlers resolve event identity through
`DesktopChatStreamEventRuntime.resolveConversationStreamEventIdentity(...)`.
The dispatcher, ingress runtime, compaction, local-user, metadata, and terminal
handlers consume that runtime-built conversation ref, turn ref, and update-target
turn ref object instead of unpacking SDK event identity fields independently.
Low-level conversation-ref and turn-ref helpers stay internal to
`DesktopChatStreamEventRuntime`; renderer consumers should not import or
destructure them from the facade.
Stale-turn gating uses
`DesktopChatStreamEventRuntime.shouldIgnoreConversationEventIdentityForStaleTurn(...)`
with the runtime-built event identity object; hooks should not pass raw event
turn-ref shapes into stale-turn checks.
Chat-stream message target construction also stays in
`DesktopChatStreamMessageUpdateRuntime`. Hooks pass the runtime-built event
identity object into that facade instead of assembling `last_by_sender` or
`last_assistant_llm_text` targets with raw turn refs.

The old exported `mergeRendererAnnotations` helper remains removed.
Annotation merging is internal to `desktopConversationDisplayProjection.ts`;
callers pass narrow renderer annotation records into
`DesktopChatInterfacePresentationRuntime` through the selector boundary and
tests should exercise the `ConversationView` projection facade or the public
hook listener.

The hook delegates current-turn UI side effects to
`DesktopSdkLiveTurnEffectsRuntime`. That runtime reducer owns cursor-based delta
tracking for SDK presentation entries, `phase`, and `lastError`; it does not
store raw current-turn text or SDK presentation visibility fields in the
cursor. It is the renderer-side owner for:

- accepting an SDK `awaiting` turn before the local send latch has fully reset
- clearing `isSending` when SDK presentation contains actual entries or an
  explicit visible-content flag, terminal state, or executable tool rows
- appending presentation thinking-entry deltas into transient thinking text
- recording `query-accepted`, `llm-thought`, `streaming-response`,
  `tool-call`, `tool-output`, `web-search-progress`, `streaming-complete`, and
  `error` tracking events
- preserving typing/thinking state for SDK presentation tool entries projected with
  `executionSkipped === true`

The reducer does not treat SDK `presentation.typingVisible` or
`presentation.overlayVisible` as send-latch authorities. `phase='awaiting'`
accepts the SDK turn, while empty overlay-visible presentation remains
rendering data until real entries, content, tool rows, text, or terminal state
arrive.

`DesktopRendererTraceRuntime` owns the SDK current-turn applied live-surface
trace projection. `useConversationRuntimeProjectionStream` reports the
SDK current-turn object plus whether derived side effects were skipped; the
runtime emits `renderer.current_turn.applied` with overlay mode, guard ref,
visible-content booleans, entry counts, text lengths, tool-event counts, and the
`staleSideEffectsSkipped` trace field. The hook must not duplicate those trace
field names locally.

The utility does not create transcript rows or interpret backend-wire events.
Transcript display still comes from SDK display rows, and conversation-event
handlers still own metadata, compaction, terminal materialization, and tool-row
persistence.
Live-turn tool-call presentation consumes SDK-provided tool identity fields
only. Renderer UI row ids are display identities and must not be promoted into
model-facing tool-call ids when a live entry omits `requestId` or
`modelFacingToolCall.id`.
Turn-completion handlers call
`DesktopChatStreamEventRuntime.resolveTurnCompletedStreamEventState(...)` for
resolved conversation identity, turn identity, and terminal tracking decisions;
hooks should not read workspace stream state directly to make that decision.
Compaction handlers similarly read the current thinking source through
`DesktopChatStreamEventRuntime.resolveWorkspaceThinkingSourceEventType(...)`;
the hook wires store access as an adapter dependency and does not dereference
workspace thinking fields inline.
SDK conversation-event stale-turn gating also belongs to
`DesktopChatStreamEventRuntime`: it resolves active turn identity from
`ConversationView.liveTurn.turnRef` first and uses raw `streamTracking` only as
the no-view fallback so stale renderer stream tracking cannot reject the
SDK-owned live turn. Terminal completion tracking uses the same view-first
turn identity before falling back to raw complete-state/pending-bridge checks.

### Removed Chat Stream Transparency and Thinking Helper Paths

The old `chatStreamTransparency.ts` helper and
`ChatStreamTransparency.test.ts` were removed from the active stream path.
Transparency events now arrive as SDK-normalized conversation events and are
handled through the centralized ingress/runtime path documented below.

The old standalone `ChatStreamThinkingStatusUtils.test.ts` path was also
removed. Thinking placeholders and compaction status labels are owned by
`desktopChatStreamThinkingRuntime.ts`, while live assistant reasoning text
comes from SDK presentation thinking entries.

## Message Send Lifecycle (`useChatMessageSender`)

`sendMessage(text)` sequence:

1. stop playback (optional)
2. resolve `conversation_ref` from renderer state:
  - resolve from transcript/store active ref
  - create new ref only when both are absent
3. accept a pending turn in chat state, which appends/updates the renderer-local
   optimistic user message with the outgoing turn id
4. emit `windie:pending-turn` so Electron main can fan out and replay that
   pending user row until SDK current-turn projection clears it
5. resolve workspace binding and typed resource handles for SDK send
6. optional send-surface window policy (`show-chatbox` when configured)
7. apply deferred model/provider selection through `DesktopSettingsRuntimeClient`
8. dispatch the turn through `DesktopLiveTurnRuntimeClient.sendQuery(...)`
9. let SDK `ConversationRuntime.send()` emit the authoritative base user row,
   resolve file/clipboard/workspace/query-screenshot resources, and update user
   metadata
10. keep the renderer pending bridge visible beside SDK `ConversationView`
    rows while the matching SDK user row is absent
11. let `ConversationView.displayRows` replace the pending bridge once the SDK
    projects the matching user row

The local send latch and temporary renderer row are latency cover only. They
must be keyed to the outgoing turn and removed when the SDK row projection for
that turn arrives; they are not a fallback transcript writer and must not
survive as a duplicate user row after SDK projection catches up.

Before final query dispatch, the hook may send immediate model/provider updates via `DesktopSettingsRuntimeClient.setModel(...)` when deferred-model selection changes are detected.

Failure handling:

- on query-send failure, `isSending=false` and synthetic assistant error message
  is appended after the optimistic user row.

## Stream Event Ingestion (`desktopChatStreamIngressRuntime`)

Listener source:

- SDK-owned renderer channels:
  - `windie:current-turn` for active assistant text, tool progress, phase, and
    terminal state
  - `windie:conversation-event` for transcript/session side effects
- renderer hooks subscribe to those channels through
  `DesktopConversationRuntimeEventClient`; hook-local policy owns validation,
  stale-turn guards, transcript updates, and projection side effects

Pre-routing and workspace resolution:

- backend event validation and SDK conversation-event normalization happen before
  renderer chat ingress; `desktopChatStreamIngressRuntime.ts` accepts SDK
  `ConversationEvent` payloads only
- event conversation is resolved through
  `DesktopChatStreamEventRuntime.resolveConversationStreamEventConversationRef(...)`
- explicit `conversationRef` events promote chat-store `activeConversationRef` when no active workspace exists; `user_message` also rebinds active workspace to the explicit conversation so overlay-only surfaces (`enableTranscript=false`) project the current turn
- SDK conversation events without explicit conversation identity are quarantined before UI projection, transcript sync, or handler dispatch
- `turnRef -> conversationRef` map is updated opportunistically from
  `DesktopChatStreamEventRuntime.resolveConversationStreamEventTurnRef(...)`
  for downstream turn-scoped state
- handlers write into target conversation workspace instead of only active chat projection
- transcript session sync runs only after event conversation identity resolves;
  transcript user binding reads the SDK event payload through
  `DesktopChatStreamEventPayloadRuntime.resolveConversationStreamEventUserId(...)`
- ingress orchestration for projection sync, turn-map registration,
  transcript-session update, and handler dispatch is centralized in
  `desktopChatStreamIngressRuntime.ts`; `useChatStream` supplies handler and
  store callbacks but does not import backend event contracts directly
- ingress bookkeeping steps are fail-safe isolated (`try/catch` per step) so projection/turn-map/transcript sync errors cannot suppress final handler dispatch for the event
- assistant text runtime state comes from SDK presentation entries:
  backend `streaming-response` -> SDK `assistant_delta` -> presentation
  `llm-text` entries; backend `streaming-complete` still dispatches as SDK
  `turn_completed` for completion and transcript finalization
- tool runtime state comes from SDK presentation entries:
  backend `tool-call`/`tool-output`/`tool-bundle`/`web-search-progress` ->
  SDK tool entries; SDK `tool_call`, `tool_output`, and `tool_bundle_call`
  still dispatch for transcript persistence
- compaction events dispatch from SDK-normalized conversation events:
  backend `context-compaction-started` -> SDK `compaction_started`, backend
  `context-compaction-completed` -> SDK `compaction_applied` or
  `compaction_skipped`, and backend `context-compaction-failed` -> SDK
  `compaction_failed`
- metadata/transparency events dispatch from SDK-normalized conversation events:
  backend `system-prompt` -> SDK `system_prompt`, backend `user-message-full`
  -> SDK `user_message_metadata`, backend `assistant-message-full` -> SDK
  `assistant_message`, and backend `tool-schemas` -> SDK
  `tool_schemas_metadata`
- error events dispatch from SDK-normalized conversation events:
  backend `error` -> SDK `turn_error`; terminal live state comes from
  `currentTurn.phase='error'`/`currentTurn.lastError`, while SDK `turn_error`
  remains for transcript/error materialization
- token usage events dispatch from SDK-normalized conversation events:
  backend `token-count` -> SDK `usage_updated`
- thinking/reasoning events dispatch from SDK-normalized conversation events:
  backend `llm-thought` -> SDK `reasoning_delta`; the renderer does not handle the normalized event directly for live text, because live thinking state comes from SDK presentation entries emitted on `conversation-runtime-updated`
- tool progress events are projected into SDK presentation entries; renderer chat code does not dispatch SDK `tool_progress` as a separate live-state path
- local user echo events dispatch from SDK-normalized conversation events:
  backend `local-user-message` -> SDK `user_message`

SDK dispatch behavior:

- SDK `user_message` from backend `local-user-message`: adds user row, resets `streamTracking` for turn
  - the renderer consumes SDK `user_message` payloads directly while keeping
    `local-user-message` as the UI/tracking source label. It does not handle a
    backend-wire `local-user-message` fallback after SDK dispatch.
- SDK presentation thinking entries from the conversation runtime projection: accumulate transient thinking text and record `llm-thought` tracking without creating raw assistant rows
  - the renderer consumes SDK presentation entries directly. It keeps `llm-thought` as the UI/tracking source label, but does not fall back to backend-wire `llm-thought` payloads.
- SDK presentation `llm-text` entries from the conversation runtime projection: dashboard and response overlay render live assistant text from the projection, while the projection listener clears the send latch and records `streaming-response` chunk tracking
  - backend-wire `streaming-response` and normalized SDK `assistant_delta` are not live-row fallbacks in renderer chat code.
- SDK `currentTurn.phase` from the conversation runtime projection: records terminal `streaming-complete`/`error` tracking and clears transient send/thinking state for `complete` and `error`
  - benign settings-update errors and recoverable streamed tool-call parse errors are filtered before they become SDK current-turn terminal errors.
  - dashboard and minimal chat pill busy/typing/stop state resolve from SDK
    current-turn projection first, then the pending renderer turn before the
    SDK turn opens. Stop uses the same target order and clears the matching
    pending turn locally before backend cancellation completes. Renderer stream tracking is telemetry/transcript
    bookkeeping, not a busy-state fallback. `response-overlay-phase` is
    retained only as Electron overlay window/layout state, not chat runtime
    authority.
- SDK `compaction_started` from backend `context-compaction-started`: sets thinking text to `Compacting conversation history...` while backend compaction runs
- SDK `compaction_applied` from backend `context-compaction-completed`: replaces in-progress compaction thinking with a terminal `Conversation history compacted.` status and marks source as `context-compaction-completed`
  - in dev UI, also stores compaction debug payload including the full summary text plus the replacement-history preview (summary message + kept tail messages)
  - when SDK payload includes replacement history, builds a compacted replay snapshot from the SDK event and persists it through the renderer app-runtime facade instead of unwrapping a backend-wire event
- SDK `compaction_skipped` from backend `context-compaction-completed` with `skipped_reason`: clears only an active compaction status/debug payload. It does not render a compacted-history panel, persist replay rows, or clear unrelated active thinking/tool state.
- SDK `compaction_failed` from backend `context-compaction-failed`: replaces compaction thinking with terminal failure text (backend error string when available, otherwise `Conversation compaction failed.`) and marks source as `context-compaction-failed`
- SDK presentation tool entries from the conversation runtime projection:
  response overlay renders live tool-call/tool-output/tool-progress entries from
  the presentation, while the projection listener records `tool-call`,
  `tool-output`, and `web-search-progress` phase tracking and clears transient
  send/thinking state for active tool rows. The dashboard transcript renders SDK
  display rows, including retained OpenAI-native `tool_progress` search trace
  rows.
  - live presentation entries carry SDK-shaped tool identity fields
    (`toolName`, `requestId`, `correlationId`, `bundleId`). Renderer live-row
    builders consume those fields plus explicit SDK `toolCallDetails`,
    `toolOutputDetails`, `toolArguments`, and `toolCalls`, leaving raw payloads
    out of live display recovery.
  - legacy no-presentation response overlay fallback rows built from
    `currentTurnProjection.toolEvents` follow the same rule: `toolName`,
    `requestId`, `correlationId`, bundle calls, metadata, and output text come
    from explicit SDK tool-event fields and projected detail objects instead of
    raw `payload` or `structuredPayload` fallbacks.
  - SDK rehydrate groups progress-only OpenAI native search rows into one
    synthetic SDK-normalized `web_search` tool-call/tool-output pair for later
    model history.
  - backend-wire `tool-call`, `tool-output`, `tool-bundle`, and `web-search-progress` events are not live-row or active-phase fallbacks in renderer chat code.
- SDK `tool_call` from backend `tool-call`: persists a transcript tool-call row only. Live display comes from SDK presentation entries or SDK display rows.
  - renderer-visible rows use explicit SDK projection fields for metadata and parameters. They do not read `structuredPayload` or fall back to backend-wire `tool-call` payloads.
- SDK `tool_output` from backend `tool-output`: persists a transcript tool-output row only. Live display comes from SDK presentation entries or SDK display rows.
  - renderer-visible rows use explicit SDK projection fields for output text, metadata, request ids, and typed attachments. They do not read `structuredPayload` or fall back to backend-wire `tool-output` payloads.
- SDK `tool_bundle_call` from backend `tool-bundle`: persists a transcript `tool-bundle` trace row so later transcript loads can reconstruct the bundle call card without reclassifying it as a normal executable tool-call. Live display comes from SDK presentation entries or SDK display rows.
  - renderer-visible rows use explicit SDK projection fields for bundle identity and per-tool metadata. They do not read `structuredPayload` or fall back to backend-wire `tool-bundle` payloads.
- SDK `system_prompt` from backend `system-prompt`: annotate last user message with system prompt + tool schema snapshot
- SDK `user_message_metadata` from backend `user-message-full`: annotate user message with full payload metadata
- SDK `assistant_message` from backend `assistant-message-full`: annotate latest assistant `llm-text` message
- metadata/transparency handlers consume SDK payload fields directly instead of
  unwrapping backend-wire metadata events
- turn-scoped metadata annotations are strict: when normalized SDK turn
  identity is present, user/system/tool-schema metadata updates only a
  same-turn user row; missing same-turn rows are no-ops rather than sender-only
  fallbacks
- SDK `tool_schemas_metadata` from backend `tool-schemas`: annotate the selected user message with tool schema list
- SDK `usage_updated` from backend `token-count`: update token counters
- terminal handlers consume SDK `turn_error` and `usage_updated` payloads
  directly. They do not fall back to backend-wire terminal payloads.
- SDK `turn_completed` from backend `streaming-complete`: materialize the SDK-projected same-turn assistant `llm-text` message and write the assistant transcript when needed. Active terminal phase tracking comes from `currentTurn.phase='complete'`.
  - completion transcript writes read conversation and turn identity through
    the app-runtime SDK event identity helpers. They do not unwrap backend-wire
    payloads to recover backend `conversation_ref` or `user_id`.
  - when `turn_ref` is present, completion targeting is strict to assistant rows with the same `turnRef` (no cross-turn fallback)
  - duplicate completion events do not duplicate assistant transcript writes because transcript recording only runs for not-yet-complete assistant rows
- SDK `turn_error` from backend `error`: materialize the SDK-projected assistant error row and write the transcript error row unless ignored by the benign/recoverable error filter. Active terminal phase tracking comes from `currentTurn.phase='error'`.

Handler composition boundary:

- `useChatStream` dispatches SDK-normalized conversation events first.
- Stream event identity predicates and normalized conversation/turn identity
  helpers live behind `DesktopChatStreamEventRuntime`; sub-handlers use those
  helpers for fail-fast guards, workspace routing, row targeting, and tracking
  updates instead of spelling SDK event names or raw identity fields locally.
- Stream event payload extraction lives in
  `DesktopChatStreamEventPayloadRuntime`; sub-handlers resolve a payload
  value through that runtime before calling payload-specific projection helpers
  instead of reading `event.payload` directly.
- SDK `user_message` handling for backend `local-user-message` is delegated to
  `useChatStreamLocalUserHandler`
- SDK presentation-entry and terminal `phase` active-turn side effects are delegated through `useConversationRuntimeProjectionStream` to `DesktopConversationProjectionStreamRuntime`, which applies `DesktopSdkLiveTurnEffectsRuntime`.
- SDK `system_prompt`/`user_message_metadata`/`assistant_message`/`tool_schemas_metadata`
  transparency projection is delegated to `useChatStreamMetadataHandlers`.
- SDK `turn_error` transcript/error materialization plus SDK `usage_updated` terminal behavior is delegated to `useChatStreamTerminalHandlers`
- SDK presentation tool-entry active-turn display and phase tracking is delegated through `useConversationRuntimeProjectionStream` to `DesktopConversationProjectionStreamRuntime`, which applies `DesktopSdkLiveTurnEffectsRuntime`.
- SDK `tool_call`/`tool_output`/`tool_bundle_call` transcript persistence is delegated to `useChatStreamToolHandlers`; local tool execution remains owned by SDK/main local-runtime execution and the local-runtime Python implementation.
- SDK `compaction_started`/`compaction_applied`/`compaction_skipped`/`compaction_failed`
  display and replay persistence is delegated to `useChatStreamCompactionHandlers`.
- SDK `turn_completed` finalization and transcript write side effects are delegated to `useChatStreamCompletionHandler`
- SDK user messages, assistant text, tool display, compaction, metadata, error,
  usage, reasoning, and tool-progress events run the same
  stale-turn gate before dispatch.

Turn guard + error suppression matrix:

- `useChatStream` applies the same stale-turn guard to SDK-dispatched chat stream handlers
- guard condition: `event.turn_ref` exists, workspace has `activeTurnRef`, and values mismatch
- dropped stale events have no chat-store mutation and no transcript side effects
- `turn_error` has one extra gate in `useChatStreamTerminalHandlers`: `DesktopChatStreamEventPayloadRuntime.shouldIgnoreStreamError(...)` suppresses benign settings-sync errors before UI mutation

Message targeting utilities:

- `DesktopChatStreamMessageUpdateRuntime.findLastMessageIdBySender(...)`
- `DesktopChatStreamMessageUpdateRuntime.findLastAssistantLlmTextMessageId(...)`
- `DesktopChatStreamMessageUpdateRuntime.findFirstMessageIdBySender(...)`
- `useStreamMessageUpdaters` resolves current message ids at update time for
  full-message and metadata update handlers.

Tool-specific handler extraction (`useChatStreamToolHandlers`) ownership:

- records transcript tool rows with model metadata from `modelContextRef`
- persists bundle-call rows as `messageType='tool-bundle'` so replay/rehydrate can preserve bundle provenance instead of degrading them into generic `tool-call` rows
- stores a typed transcript `structured_payload` for tool rows (single call, bundle call, and tool output details) so past-chat rendering can restore tool-call cards and tool-output details from structured data, and backend rehydrate can prefer the same payload over reparsing display JSON
- resolves tool-output correlation id fallback via the SDK correlation helper
  imported through the SDK package
- normalizes screenshot attachment from `payload.screenshot_ref`
- routes transcript `tool-output` writes through `ConversationRuntime.ts` so backend-stream and local-runtime tool outputs share one output-detail persistence contract

Model metadata contract:

- `desktopChatStreamModelContextRuntime.ts` owns the shared
  `{ modelId, modelProvider, supportsThinking, supportsThinkingTextStream }`
  context used by stream handlers.
- SDK/local-runtime tool-output helpers consume SDK event metadata directly so
  transcript model metadata shape no longer drifts between codepaths.

Streaming-complete transcript write nuance:

- assistant transcript write on completion is conditional:
  - assistant message must be found and not already complete
  - message text must be non-empty
  - `enableTranscript` must be true
- transparency payload is assembled from current-turn user/assistant context when available:
  - system prompt content
  - tool schemas
  - full user message content/metadata
  - full assistant message content
- when completion has a `turnRef`, transparency uses only a same-turn user
  message; latest-user fallback is reserved for unscoped legacy completions

## SDK-Owned Tool Execution

The renderer does not execute backend tool events. The SDK conversation runtime
projects live tool-call/tool-output/tool-progress state into presentation
entries; response overlay consumes those entries, and the dashboard consumes
SDK display rows. OpenAI-native web-search progress is retained as dashboard
display transparency, while SDK rehydrate normalizes progress-only native
search into an SDK-normalized paired `web_search` history entry. The Agent SDK
runtime routes executable local tools through Electron main and the SDK local
runtime.

Renderer display contract:

- render active `tool-call`, `tool-output`, and `tool-progress` rows from SDK presentation entries
- preserve backend identifiers in structured payloads for replay and debugging
- write durable visible transcript state through SDK conversation events and the
  desktop conversation store path
- keep skipped or display-only execution metadata out of model-facing history

Execution contract:

- Agent SDK runtime receives backend tool events and owns local execution state
- SDK local runtime starts/reuses the local runtime daemon and unwraps daemon JSON-RPC
  responses before callers see them
- Electron main supplies desktop launch options and host-only window, screenshot,
  display-bounds, and artifact behavior
- the local executor runs filesystem, shell, browser, computer-use, MCP, plugin,
  and extension tools
- Agent SDK runtime sends exactly one `tool-result` or `tool-bundle-result` back to backend for each claimed call or bundle

For execution bugs, start with the Agent SDK runtime and local-runtime bridge. For
active visual bugs, start with the SDK current-turn projection and
`useConversationRuntimeProjectionStream`; for replay bugs, start with renderer
chat-stream transcript handlers and transcript projection.

## Debug Checklist

If stream UI duplicates assistant rows:

1. verify SDK current-turn assistant-text projection and active-turn stream handlers
2. verify `turn_ref` consistency in backend events
3. verify `isComplete` flag set on streaming-complete

If tool outputs appear for wrong turn:

1. inspect `streamTracking.activeTurnRef` transitions
2. verify stale-turn rejection in the SDK runtime and display-only renderer event metadata
3. verify correlation IDs from backend tool-call payloads

If transcript rows missing:

1. verify `enableTranscript` flag in `ChatProvider`
2. verify event conversation/user IDs are present
3. inspect per-event transcript write sites in `useChatStream` and SDK-owned tool-output projection

## Related References

- [Renderer Chat Docs Hub](chat/README.md)
- [Renderer Chat Payload Docs Hub](chat/payloads/README.md)
- [Tool Call/Output and Transparency Section Rendering Reference](chat/payloads/tool_call_output_and_transparency_section_rendering_reference.md)
- [Message Send Surface Policy and Screenshot Capture Reference](chat/message_send_surface_policy_and_screenshot_capture_reference.md)
- [Chat Store State and New Session Rotation Reference](chat/chat_store_state_and_new_session_rotation_reference.md)
- [Renderer Overlay Docs Hub](overlays/README.md)
- [Chatbox Overlay Input, Drag, and Click-Through Reference](overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Response Overlay Phase and Tool-Ghost Runtime Reference](overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md)
- [Renderer Infrastructure Docs Hub](infrastructure/README.md)
- [Tool Execution Lifecycle](../../tools/tool_execution_lifecycle.md)
- [Capture, Artifact URL, and Payload Normalization Reference](infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
