---
summary: "Renderer chat runtime deep reference: provider coordination, message-send lifecycle, backend stream event handling, removed chatStreamTransparency helper behavior, local tool execution boundary, thinking status ownership, SDK-projected tool display semantics, and private mergeRendererAnnotations runtime-projection annotation merge behavior."
read_when:
  - When changing renderer chat hooks, stream event handling, or projected tool display callbacks.
  - When debugging stale-turn tool cancellation, transcript writes, or streaming state drift.
  - When debugging current-turn projection side effects such as send-latch cleanup, thinking text, streamTracking updates, or duplicate tool-event tracking.
  - When resolving stale references to removed `chatStreamTransparency.ts`, `ChatStreamTransparency.test.ts`, or `ChatStreamThinkingStatusUtils.test.ts` helper/test paths.
  - When stale code, tests, or docs mention exported `mergeRendererAnnotations` or direct renderer annotation-merge helpers; the merge is an internal `useConversationRuntimeProjectionStream` detail.
title: "Chat Stream and Tool Execution Reference"
---

# Chat Stream and Tool Execution Reference

## Canonical Modules

- `frontend/src/renderer/app/providers/AppProvider.jsx`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/providers/AppStatusProvider.jsx`
- `frontend/src/renderer/app/providers/ChatProvider.jsx`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream.ts`
- `frontend/src/renderer/features/chat/utils/state/currentTurnProjectionSideEffects.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamCompletionHandler.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamLocalUserHandler.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamTerminalHandlers.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamToolHandlers.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTurnGuardRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTrackingRuntime.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamMessageUpdates.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamEventUtils.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamThinkingStatus.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamTypes.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamIngressRuntime.ts`
- `frontend/src/renderer/features/chat/utils/transcriptModelContext.ts`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `frontend/src/renderer/features/chat/utils/modelThinkingCapabilities.ts`
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
- `ChatProvider`: mounts `useChatStream` and mirrors transcript session `conversationRef` into chat-store `activeConversationRef` so overlay renderers consume the correct conversation workspace. Local tool execution is owned by the SDK main runtime.

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
- transition math lives in `desktopChatStreamTrackingRuntime.applyTrackingEvent(...)`

## Model Capability Resolution and Thinking Fallback Policy

`useChatStream` resolves selected-model thinking flags through `resolveThinkingCapabilities(...)`:

- source set is merged `availableModels.local + availableModels.online`
- primary match: `{id, provider}`
- fallback match: `id` only
- renderer does not infer provider capabilities; thinking support comes only from backend model-catalog metadata

Resulting policy:

- if `supportsThinking=true` and `supportsThinkingTextStream=false`, local-user send path sets generic `Thinking...` status until stream text arrives
- otherwise thinking state starts empty and waits for SDK `currentTurn.reasoningText`
  projection updates derived from backend `llm-thought` chunks

Thinking status constants from `chatStreamThinkingStatus.ts`:

- `GENERIC_THINKING_STATUS` is the temporary placeholder for models that report
  thinking support without a text stream.
- `COMPACTION_THINKING_STATUS`, `COMPACTION_COMPLETED_THINKING_STATUS`, and
  `COMPACTION_FAILED_THINKING_STATUS` are live UI lifecycle labels for manual
  and stream-driven compaction paths.
- Final assistant thinking text comes from SDK current-turn reasoning
  projection, not from persisted placeholder status normalization.

## Runtime Projection Listener and Side Effects

`useConversationRuntimeProjectionStream` listens to SDK `windie:current-turn` and
`windie:rows` projections, then maps SDK display rows through
`buildChatMessagesFromSdkDisplayRows(...)`. Display-row presentation metadata
uses `sdk:display-rows` as its source label; the `windie:rows` name is only the
Electron IPC transport channel.

Renderer-only annotations such as prompt transparency, tool schemas, full message
details, feedback, and token counts are merged back into matching SDK-projected
messages inside the hook. Pending optimistic user rows from the local composer
remain visible until the SDK display rows include the same turn.

`mergeRendererAnnotations` is intentionally private. Stale searches for the
removed export should route here; tests should drive the public hook listener
and SDK row projection behavior instead of importing the helper directly.

The hook delegates current-turn UI side effects to
`currentTurnProjectionSideEffects.ts`. That reducer owns cursor-based delta
tracking for `assistantText`, `reasoningText`, `phase`, `lastError`, and seen
tool-event ids. It is the renderer-side owner for:

- accepting an SDK `awaiting` turn before the local send latch has fully reset
- clearing `isSending` when SDK presentation reports visible content,
  assistant text, terminal state, or executable tool rows
- appending reasoning deltas into transient thinking text
- recording `query-accepted`, `llm-thought`, `streaming-response`,
  `tool-call`, `tool-output`, `web-search-progress`, `streaming-complete`, and
  `error` tracking events
- preserving typing/thinking state for SDK tool events projected with
  `executionSkipped === true`

The utility does not create transcript rows or interpret raw backend events.
Transcript display still comes from SDK display rows, and conversation-event
handlers still own metadata, compaction, terminal materialization, and tool-row
persistence.

### Removed Chat Stream Transparency and Thinking Helper Paths

The old `chatStreamTransparency.ts` helper and
`ChatStreamTransparency.test.ts` were removed from the active stream path.
Transparency events now arrive as SDK-normalized conversation events and are
handled through the centralized ingress/runtime path documented below.

The old standalone `ChatStreamThinkingStatusUtils.test.ts` path was also
removed. Thinking placeholders and compaction status labels are owned by
`chatStreamThinkingStatus.ts`, while live assistant reasoning text comes from
SDK `currentTurn.reasoningText`.

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
10. preserve the temporary renderer row across intermediate `windie:rows`
    refreshes that do not yet include that turn's SDK user row
11. replace the temporary renderer row with SDK display rows from `windie:rows`
    once the matching SDK user row is projected

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

Pre-routing and workspace resolution:

- backend event validation and SDK conversation-event normalization happen before
  renderer chat ingress; `desktopChatStreamIngressRuntime.ts` accepts SDK
  `ConversationEvent` payloads only
- event conversation is resolved from `event.conversationRef`
- explicit `conversationRef` events promote chat-store `activeConversationRef` when no active workspace exists; `user_message` also rebinds active workspace to the explicit conversation so overlay-only surfaces (`enableTranscript=false`) project the current turn
- SDK conversation events without explicit conversation identity are quarantined before UI projection, transcript sync, or handler dispatch
- `turnRef -> conversationRef` map is updated opportunistically for downstream turn-scoped state
- handlers write into target conversation workspace instead of only active chat projection
- transcript session sync runs only after event conversation identity resolves
- ingress orchestration for projection sync, turn-map registration,
  transcript-session update, and handler dispatch is centralized in
  `desktopChatStreamIngressRuntime.ts`; `useChatStream` supplies handler and
  store callbacks but does not import backend event contracts directly
- ingress bookkeeping steps are fail-safe isolated (`try/catch` per step) so projection/turn-map/transcript sync errors cannot suppress final handler dispatch for the event
- assistant text runtime state comes from the SDK current-turn projection:
  backend `streaming-response` -> SDK `assistant_delta` -> `currentTurn.assistantText`;
  backend `streaming-complete` still dispatches as SDK `turn_completed` for
  completion and transcript finalization
- tool runtime state comes from the SDK current-turn projection:
  backend `tool-call`/`tool-output`/`tool-bundle`/`web-search-progress` ->
  SDK tool events -> `currentTurn.toolEvents`; SDK `tool_call`,
  `tool_output`, and `tool_bundle_call` still dispatch for transcript
  persistence
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
  backend `llm-thought` -> SDK `reasoning_delta`; the renderer does not handle the normalized event directly for live text, because live thinking state comes from the SDK `currentTurn` projection emitted on `conversation-runtime-updated`
- tool progress events are projected into `currentTurn.toolEvents`; renderer chat code does not dispatch SDK `tool_progress` as a separate live-state path
- local user echo events dispatch from SDK-normalized conversation events:
  backend `local-user-message` -> SDK `user_message`

SDK dispatch behavior:

- SDK `user_message` from backend `local-user-message`: adds user row, resets `streamTracking` for turn
  - the renderer consumes SDK `user_message` payloads directly while keeping
    `local-user-message` as the UI/tracking source label. It does not handle a
    raw backend `local-user-message` fallback after SDK dispatch.
- SDK `currentTurn.reasoningText` from the conversation runtime projection: accumulates transient thinking text and records `llm-thought` tracking without creating raw assistant rows
  - the renderer consumes the SDK current-turn projection directly. It keeps `llm-thought` as the UI/tracking source label, but does not unwrap `payload.rawEvent` back into a backend `llm-thought` event.
- SDK `currentTurn.assistantText` from the conversation runtime projection: dashboard and response overlay render the live assistant text from the projection, while the projection listener clears the send latch and records `streaming-response` chunk tracking
  - raw backend `streaming-response` and normalized SDK `assistant_delta` are not live-row fallbacks in renderer chat code.
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
  - when SDK payload includes replacement history, builds a compacted replay snapshot from the SDK event and persists it through the desktop runtime facade instead of unwrapping the raw backend event
- SDK `compaction_skipped` from backend `context-compaction-completed` with `skipped_reason`: clears only an active compaction status/debug payload. It does not render a compacted-history panel, persist replay rows, or clear unrelated active thinking/tool state.
- SDK `compaction_failed` from backend `context-compaction-failed`: replaces compaction thinking with terminal failure text (backend error string when available, otherwise `Conversation compaction failed.`) and marks source as `context-compaction-failed`
- SDK `currentTurn.toolEvents` from the conversation runtime projection:
  response overlay renders live tool-call/tool-output/tool-progress entries from
  the projection, while the projection listener records `tool-call`,
  `tool-output`, and `web-search-progress` phase tracking and clears transient
  send/thinking state for active tool rows. The dashboard transcript renders SDK
  display rows, including retained OpenAI-native `tool_progress` search trace
  rows.
  - live presentation entries carry SDK-shaped tool identity fields
    (`toolName`, `requestId`, `correlationId`, `bundleId`). Renderer live-row
    builders consume those fields and camelCase payload fields, leaving
    `structuredPayload` for detailed backend metadata instead of re-reading raw
    backend identity aliases.
  - response overlay fallback rows built from `currentTurnProjection.toolEvents`
    follow the same rule: `toolName`, `requestId`, and `correlationId` come from
    SDK tool-event fields or camelCase payload fields, while backend
    `structuredPayload` remains detail-only.
  - SDK rehydrate groups progress-only OpenAI native search rows into one
    synthetic Windie `web_search` tool-call/tool-output pair for later model
    history.
  - raw backend `tool-call`, `tool-output`, `tool-bundle`, and `web-search-progress` events are not live-row or active-phase fallbacks in renderer chat code.
- SDK `tool_call` from backend `tool-call`: persists a transcript tool-call row only. Live display comes from `currentTurn.toolEvents`.
  - the renderer consumes SDK `tool_call` payloads directly for transcript persistence, using `structuredPayload` for backend detail fields such as metadata and parameters. It does not unwrap `payload.rawEvent` back into a backend `tool-call` event.
- SDK `tool_output` from backend `tool-output`: persists a transcript tool-output row only. Live display comes from `currentTurn.toolEvents`.
  - the renderer consumes SDK `tool_output` payloads directly for transcript persistence, using `structuredPayload` for backend detail fields such as output text, metadata, request ids, and screenshot refs. It does not unwrap `payload.rawEvent` back into a backend `tool-output` event.
- SDK `tool_bundle_call` from backend `tool-bundle`: persists a transcript `tool-bundle` trace row so later transcript loads can reconstruct the bundle call card without reclassifying it as a normal executable tool-call. Live display comes from `currentTurn.toolEvents`.
  - the renderer consumes SDK `tool_bundle_call` payloads directly for transcript persistence, using normalized bundle identity fields plus `structuredPayload` for backend detail fields such as `bundle_id` and per-tool metadata. It does not unwrap `payload.rawEvent` back into a backend `tool-bundle` event.
- SDK `system_prompt` from backend `system-prompt`: annotate last user message with system prompt + tool schema snapshot
- SDK `user_message_metadata` from backend `user-message-full`: annotate user message with full payload metadata
- SDK `assistant_message` from backend `assistant-message-full`: annotate latest assistant `llm-text` message
- metadata/transparency handlers consume SDK payload fields directly instead of
  unwrapping raw backend metadata events
- turn-scoped metadata annotations are strict: when `event.turnRef` is present,
  user/system/tool-schema metadata updates only a same-turn user row; missing
  same-turn rows are no-ops rather than sender-only fallbacks
- SDK `tool_schemas_metadata` from backend `tool-schemas`: annotate the selected user message with tool schema list
- SDK `usage_updated` from backend `token-count`: update token counters
- terminal handlers consume SDK `turn_error` and `usage_updated` payloads
  directly. They do not unwrap `payload.rawEvent` back into backend terminal events.
- SDK `turn_completed` from backend `streaming-complete`: materialize the SDK-projected same-turn assistant `llm-text` message and write the assistant transcript when needed. Active terminal phase tracking comes from `currentTurn.phase='complete'`.
  - completion transcript writes read identity from SDK event fields:
    `event.conversationRef` and `payload.userId`. They do not unwrap
    `payload.rawEvent` to recover backend `conversation_ref` or `user_id`.
  - when `turn_ref` is present, completion targeting is strict to assistant rows with the same `turnRef` (no cross-turn fallback)
  - duplicate completion events do not duplicate assistant transcript writes because transcript recording only runs for not-yet-complete assistant rows
- SDK `turn_error` from backend `error`: materialize the SDK-projected assistant error row and write the transcript error row unless ignored by the benign/recoverable error filter. Active terminal phase tracking comes from `currentTurn.phase='error'`.

Handler composition boundary:

- `useChatStream` dispatches SDK-normalized conversation events first.
- SDK `user_message` handling for backend `local-user-message` is delegated to
  `useChatStreamLocalUserHandler`
- SDK current-turn `reasoningText`, `assistantText`, and terminal `phase` active-turn side effects are delegated through `useConversationRuntimeProjectionStream` to `currentTurnProjectionSideEffects.ts`
- SDK `system_prompt`/`user_message_metadata`/`assistant_message`/`tool_schemas_metadata`
  transparency projection is delegated to `useChatStreamMetadataHandlers`.
- SDK `turn_error` transcript/error materialization plus SDK `usage_updated` terminal behavior is delegated to `useChatStreamTerminalHandlers`
- SDK current-turn `toolEvents` active-turn display and phase tracking is delegated through `useConversationRuntimeProjectionStream` to `currentTurnProjectionSideEffects.ts`.
- SDK `tool_call`/`tool_output`/`tool_bundle_call` transcript persistence is delegated to `useChatStreamToolHandlers`; local tool execution remains owned by the main-process SDK runtime and sidecar.
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
- `turn_error` has one extra gate in `useChatStreamTerminalHandlers`: `shouldIgnoreStreamError(...)` suppresses benign settings-sync errors before UI mutation

Message targeting utilities:

- `findLastMessageIdBySender`
- `findLastAssistantLlmTextMessageId`
- `findFirstMessageIdBySender`
- `useStreamMessageUpdaters` resolves current message ids at update time for
  full-message and metadata update handlers.

Tool-specific handler extraction (`useChatStreamToolHandlers`) ownership:

- records transcript tool rows with model metadata from `modelContextRef`
- persists bundle-call rows as `messageType='tool-bundle'` so replay/rehydrate can preserve bundle provenance instead of degrading them into generic `tool-call` rows
- stores a typed transcript `structured_payload` for tool rows (single call, bundle call, and tool output details) so past-chat rendering can restore tool-call cards and tool-output details from structured data, and backend rehydrate can prefer the same payload over reparsing display JSON
- resolves tool-output correlation id fallback via the SDK correlation helper
  imported through `agentSdkClient`
- normalizes screenshot attachment from `payload.screenshot_ref`
- routes transcript `tool-output` writes through `ConversationRuntime.ts` so backend-stream and local-runtime tool outputs share one output-detail persistence contract

Model metadata contract:

- `transcriptModelContext.ts` owns the shared `{ modelId, modelProvider }` base used by transcript tool-output helpers
- `chatStreamTypes.ts` extends that base with chat-stream-only thinking capability flags
- SDK/local-runtime tool-output helpers consume the shared base directly so transcript model metadata shape no longer drifts between the two codepaths

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
projects live tool-call/tool-output/tool-progress state into
`currentTurn.toolEvents`; response overlay consumes that current-turn state, and
the dashboard consumes SDK display rows. OpenAI-native web-search progress is
retained as dashboard display transparency, while SDK rehydrate normalizes
progress-only native search into a synthetic paired Windie `web_search` history
entry. The SDK main runtime routes executable local tools through Electron main
and the SDK local runtime.

Renderer display contract:

- render active `tool-call`, `tool-output`, and `tool-progress` rows from the SDK `currentTurn.toolEvents` projection
- preserve backend identifiers in structured payloads for replay and debugging
- write durable visible transcript state through SDK conversation events and the
  desktop conversation store path
- keep skipped or display-only execution metadata out of model-facing history

Execution contract:

- SDK main runtime receives backend tool events and owns local execution state
- SDK local runtime starts/reuses the local runtime daemon and unwraps daemon JSON-RPC
  responses before callers see them
- Electron main supplies desktop launch options and host-only window, screenshot,
  display-bounds, and artifact behavior
- the local executor runs filesystem, shell, browser, computer-use, MCP, plugin,
  and extension tools
- SDK main runtime sends exactly one `tool-result` or `tool-bundle-result` back to backend for each claimed call or bundle

For execution bugs, start with the SDK main runtime and local-runtime bridge. For
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
