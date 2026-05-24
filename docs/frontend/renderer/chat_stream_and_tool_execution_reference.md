---
summary: "Renderer chat runtime deep reference: provider coordination, message-send lifecycle, backend stream event handling, and SDK-projected tool display semantics."
read_when:
  - When changing renderer chat hooks, stream event handling, or projected tool display callbacks.
  - When debugging stale-turn tool cancellation, transcript writes, or streaming state drift.
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
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamCompletionHandler.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamLocalUserHandler.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamTextHandlers.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamTerminalHandlers.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useChatStreamToolHandlers.ts`
- `frontend/src/renderer/features/chat/hooks/chatStream/useTurnScopedBackendEventHandler.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamConversationGate.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamTracking.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamMessageUpdates.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamEventUtils.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamToolMessages.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamThinkingStatus.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamTypes.ts`
- `frontend/src/renderer/features/chat/utils/chatStream/chatStreamBackendIngress.ts`
- `frontend/src/renderer/features/chat/utils/transcriptModelContext.ts`
- `frontend/src/renderer/features/chat/utils/toolOutputTranscriptPersistence.ts`
- `frontend/src/renderer/features/chat/utils/modelThinkingCapabilities.ts`
- `frontend/src/renderer/infrastructure/hooks/useLatestRef.ts`
- `frontend/src/renderer/types/backendEvents.ts`

## Provider Topology and Ownership

Provider stack in renderer app:

1. `AppConfigProvider`
2. `AppStatusProvider`
3. coordinator inside `AppProvider` (save-status callback + `Shift+Tab` interaction-mode toggle)
4. `ChatProvider` (hooks-only composition)

Ownership boundaries:

- `AppConfigProvider`: persisted config, model-list fetch trigger, backend settings sync, wakeword preference/suppression state
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
- transition math lives in `chatStreamTracking.applyTrackingEvent(...)`

## Model Capability Resolution and Thinking Fallback Policy

`useChatStream` resolves selected-model thinking flags through `resolveThinkingCapabilities(...)`:

- source set is merged `availableModels.local + availableModels.online`
- primary match: `{id, provider}`
- fallback match: `id` only
- renderer does not infer provider capabilities; thinking support comes only from backend model-catalog metadata

Resulting policy:

- if `supportsThinking=true` and `supportsThinkingTextStream=false`, local-user send path sets generic `Thinking...` status until stream text arrives
- otherwise thinking state starts empty and waits for SDK `reasoning_delta`
  events normalized from backend `llm-thought` chunks

Persisted thinking cleanup contract from `chatStreamThinkingStatus.ts`:

- `GENERIC_THINKING_STATUS` and `COMPACTION_THINKING_STATUS` are never persisted into final assistant message `thinkingText`
- blank/non-string statuses are normalized to `null`

## Message Send Lifecycle (`useChatMessageSender`)

`sendMessage(text)` sequence:

1. stop playback (optional)
2. ensure `conversation_ref` exists:
  - resolve from transcript/store active ref
  - fallback to main-process session snapshot (`GET_CLIENT_USER_ID`)
  - create new ref only when both are absent
3. append pending user message immediately for optimistic UI
4. set sending state
5. optional overlay transition back to chatbox (`show-chatbox` invoke)
6. optional screenshot capture via `captureScreenshotAttachment(...)`
7. optional screenshot materialization (`ScreenshotAttachmentPipeline`)
8. update already-rendered user message with `screenshot_ref/url`
9. record transcript user row
10. emit backend `query` via `DesktopConversationRuntimeClient.sendQuery(...)`

Before final query dispatch, the hook may send immediate model/provider updates via `DesktopConversationRuntimeClient.setModel(...)` when deferred-model selection changes are detected.

Failure handling:

- on query-send failure, `isSending=false` and synthetic assistant error message is appended.

## Stream Event Ingestion (`useChatStream`)

Listener source:

- `IpcBridge.on(ON_CHANNELS.FROM_BACKEND, ...)`

Pre-routing and workspace resolution:

- event shape validation and SDK conversation-event normalization go through
  `DesktopConversationRuntimeClient` before renderer-specific UI handlers run
- event conversation resolved from `conversation_ref`, then a registered turn map fallback
- `memory-store` events without `conversation_ref` are quarantined instead of using `session_id` as chat identity
- explicit `conversation_ref` events promote chat-store `activeConversationRef` when no active workspace exists; `local-user-message` also rebinds active workspace to the explicit conversation so overlay-only surfaces (`enableTranscript=false`) project the current turn
- backend events without explicit conversation identity or a registered turn mapping are quarantined before UI projection, transcript sync, or handler dispatch
- `turn_ref -> conversation_ref` map is updated opportunistically so later events without `conversation_ref` route correctly
- handlers write into target conversation workspace instead of only active chat projection
- transcript session sync runs only after event conversation identity resolves
- ingress orchestration for projection sync, turn-map registration, transcript-session update, and handler dispatch is centralized in `chatStreamBackendIngress.ingestBackendEvent(...)`
- ingress bookkeeping steps are fail-safe isolated (`try/catch` per step) so projection/turn-map/transcript sync errors cannot suppress final handler dispatch for the event
- assistant text stream events dispatch from SDK-normalized conversation events:
  backend `streaming-response` -> SDK `assistant_delta`, and backend
  `streaming-complete` -> SDK `turn_completed`
- tool display events dispatch from SDK-normalized conversation events:
  backend `tool-call` -> SDK `tool_call`, backend `tool-output` -> SDK
  `tool_output`, and backend `tool-bundle` -> SDK `tool_bundle_call`
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
  backend `error` -> SDK `turn_error`
- token usage events dispatch from SDK-normalized conversation events:
  backend `token-count` -> SDK `usage_updated`
- memory-store telemetry events dispatch from SDK-normalized conversation events:
  backend `memory-store` -> SDK `memory_stored`
- thinking/reasoning events dispatch from SDK-normalized conversation events:
  backend `llm-thought` -> SDK `reasoning_delta`
- tool progress events dispatch from SDK-normalized conversation events:
  backend `web-search-progress` -> SDK `tool_progress`
- renderer handlers still consume raw backend events for local-user flows until
  that projection path moves behind the SDK.

SDK dispatch and raw fallback behavior:

- `local-user-message`: adds user row, resets `streamTracking` for turn
- SDK `reasoning_delta` from backend `llm-thought`: accumulates transient thinking text and writes live reasoning (`thinkingText`) onto the same-turn assistant `llm-text` message (creates placeholder assistant row before first text chunk when needed)
  - the renderer consumes SDK `reasoning_delta.text` directly. It keeps
    `llm-thought` as the UI/tracking source label, but does not unwrap
    `payload.rawEvent` back into a backend `llm-thought` event.
- SDK `assistant_delta` from backend `streaming-response`: append/create assistant `llm-text` row and increment chunk tracking
- SDK `compaction_started` from backend `context-compaction-started`: sets thinking text to `Compacting conversation history...` while backend compaction runs
- SDK `compaction_applied` from backend `context-compaction-completed`: replaces in-progress compaction thinking with a terminal `Conversation history compacted.` status and marks source as `context-compaction-completed`
  - in dev UI, also stores compaction debug payload including the full summary text plus the replacement-history preview (summary message + kept tail messages)
  - when SDK payload includes replacement history, builds a compacted replay snapshot from the SDK event and persists it through the desktop runtime facade instead of unwrapping the raw backend event
- SDK `compaction_skipped` from backend `context-compaction-completed` with `skipped_reason`: clears only an active compaction status/debug payload. It does not render a compacted-history panel, persist replay rows, or clear unrelated active thinking/tool state.
- SDK `compaction_failed` from backend `context-compaction-failed`: replaces compaction thinking with terminal failure text (backend error string when available, otherwise `Conversation compaction failed.`) and marks source as `context-compaction-failed`
- SDK `tool_call` from backend `tool-call`: append assistant tool-call row and transcript tool-call row
- SDK `tool_progress` from backend `web-search-progress`: append transient `search-source` rows for live web-search progress without transcript writes
  - the renderer consumes SDK `tool_progress` payloads directly and keeps
    `web-search-progress` as the UI/tracking source label. It does not unwrap
    `payload.rawEvent` back into a backend `web-search-progress` event.
- SDK `tool_output` from backend `tool-output`: append assistant tool-output row with screenshot/tool metadata and transcript tool-output row
- SDK `tool_bundle_call` from backend `tool-bundle`: append bundle call row and persist a transcript `tool-bundle` trace row so later transcript loads can reconstruct the bundle call card without reclassifying it as a normal executable tool-call
- SDK `system_prompt` from backend `system-prompt`: annotate last user message with system prompt + tool schema snapshot
- SDK `user_message_metadata` from backend `user-message-full`: annotate user message with full payload metadata
- SDK `assistant_message` from backend `assistant-message-full`: annotate latest assistant `llm-text` message
- metadata/transparency handlers consume SDK payload fields directly instead of
  unwrapping raw backend metadata events
- SDK `memory_stored` from backend `memory-store`: renderer chat stream path records tracking only; no direct local-memory write side effect is executed in `useChatStreamTerminalHandlers`
- SDK `tool_schemas_metadata` from backend `tool-schemas`: annotate first user message with tool schema list
- SDK `usage_updated` from backend `token-count`: update token counters
- terminal handlers consume SDK `turn_error`, `usage_updated`, and
  `memory_stored` payloads directly. They do not unwrap `payload.rawEvent`
  back into backend terminal events.
- SDK `turn_completed` from backend `streaming-complete`: persist final streamed thinking text onto the same-turn assistant `llm-text` message (`thinkingText` + `thinkingSourceEventType`), then mark assistant message complete and clear transient `thinkingStatus`
  - completion transcript writes read identity from SDK event fields:
    `event.conversationRef` and `payload.userId`. They do not unwrap
    `payload.rawEvent` to recover backend `conversation_ref` or `user_id`.
  - when `turn_ref` is present, completion targeting is strict to assistant rows with the same `turnRef` (no cross-turn fallback)
  - duplicate completion events do not duplicate assistant transcript writes because transcript recording only runs for not-yet-complete assistant rows
- SDK `turn_error` from backend `error`: append assistant error row unless ignored by settings-update-error filter

Handler composition boundary:

- `useChatStream` dispatches SDK-normalized conversation events first.
- `local-user-message` is the only raw backend chat event fallback, because it
  seeds the optimistic user row and active turn before later SDK-owned stream
  events arrive.
- local-user-message handling is delegated to `useChatStreamLocalUserHandler`
- SDK `reasoning_delta` and SDK `assistant_delta` text/placeholder behavior is delegated to `useChatStreamTextHandlers`
- SDK `system_prompt`/`user_message_metadata`/`assistant_message`/`tool_schemas_metadata`
  transparency projection is delegated to `useChatStreamMetadataHandlers`.
- SDK `turn_error`, SDK `usage_updated`, and SDK `memory_stored` terminal behaviors are delegated to `useChatStreamTerminalHandlers`
- SDK `tool_call`/`tool_progress`/`tool_output`/`tool_bundle_call` display and transcript
  projection is delegated to `useChatStreamToolHandlers`; local tool execution
  remains owned by the main-process SDK runtime and sidecar.
- SDK `compaction_started`/`compaction_applied`/`compaction_skipped`/`compaction_failed`
  display and replay persistence is delegated to `useChatStreamCompactionHandlers`.
- SDK `turn_completed` finalization and transcript write side effects are delegated to `useChatStreamCompletionHandler`
- turn-scoped wrapper callbacks for local-user events are centralized in
  `useTurnScopedBackendEventHandler`, with optional `skipStaleTurnGate` for
  `local-user-message` passthrough behavior. SDK assistant text, tool display,
  compaction, metadata, error, usage, memory-store, reasoning, and tool-progress
  events run the same stale-turn gate before dispatch.

Turn guard + error suppression matrix:

- `useChatStream` applies the same stale-turn guard to every handler except `local-user-message`
- guard condition: `event.turn_ref` exists, workspace has `activeTurnRef`, and values mismatch
- dropped stale events have no chat-store mutation and no transcript side effects
- `turn_error` has one extra gate in `useChatStreamTerminalHandlers`: `shouldIgnoreStreamError(...)` suppresses benign settings-sync errors before UI mutation

Message targeting utilities:

- `findLastMessageIdBySender`
- `findLastAssistantLlmTextMessageId`
- `findStreamingCompleteAssistantMessage`
- `resolveStreamingResponseAction`

Tool-specific handler extraction (`useChatStreamToolHandlers`) ownership:

- clears transient thinking status/source before each tool event
- converts backend tool payloads into chat rows via `chatStreamToolMessages.ts`
- records transcript tool rows with model metadata from `modelContextRef`
- persists bundle-call rows as `messageType='tool-bundle'` so replay/rehydrate can preserve bundle provenance instead of degrading them into generic `tool-call` rows
- stores a typed transcript `structured_payload` for tool rows (single call, bundle call, and tool output details) so past-chat rendering can restore tool-call cards and tool-output details from structured data, and backend rehydrate can prefer the same payload over reparsing display JSON
- resolves tool-output correlation id fallback via `resolveToolOutputCorrelationId(...)`
- normalizes screenshot attachment from `payload.screenshot_ref`
- routes transcript `tool-output` writes through `toolOutputTranscriptPersistence.ts` so backend-stream and frontend-executed tool outputs share one output-detail persistence contract

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

## SDK-Owned Tool Execution

The renderer does not execute backend tool events. `tool-call` and
`tool-bundle` events are displayed by chat-stream handlers, while the SDK main
runtime routes execution through Electron main and the sidecar daemon.

Renderer display contract:

- render `tool-call`, `tool-bundle`, and `tool-output` cards from stream events
- preserve backend identifiers in structured payloads for replay and debugging
- write visible transcript rows through transcript helpers
- keep skipped or display-only execution metadata out of model-facing history

Execution contract:

- SDK main runtime receives backend tool events and owns local execution state
- Electron main bridges SDK local-runtime calls into the sidecar daemon
- sidecar executes filesystem, shell, browser, computer-use, MCP, plugin, and extension tools
- SDK main runtime sends exactly one `tool-result` or `tool-bundle-result` back to backend for each claimed call or bundle

For execution bugs, start with the SDK main runtime and sidecar bridge. For
visual or replay bugs, start with renderer chat-stream tool handlers and
transcript projection.

## Debug Checklist

If stream UI duplicates assistant rows:

1. verify `resolveStreamingResponseAction` append-vs-new conditions
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
- [Capture, Artifact Upload, and Payload Normalization Reference](infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
