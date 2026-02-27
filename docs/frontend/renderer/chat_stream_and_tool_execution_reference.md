---
summary: "Renderer chat runtime deep reference: provider coordination, message-send lifecycle, backend stream event handling, and frontend tool execution/relay semantics."
read_when:
  - When changing renderer chat hooks, stream event handling, or tool execution callbacks.
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
- `frontend/src/renderer/features/chat/hooks/useChatStreamToolHandlers.ts`
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamConversationGate.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamTracking.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamMessageUpdates.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamEventUtils.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamToolMessages.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamThinkingStatus.ts`
- `frontend/src/renderer/features/chat/utils/chatStreamTypes.ts`
- `frontend/src/renderer/features/chat/utils/modelThinkingCapabilities.ts`
- `frontend/src/renderer/features/chat/utils/toolRunnerSurface.ts`
- `frontend/src/renderer/infrastructure/hooks/useLatestRef.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionService.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionBundleRunner.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionCapture.ts`
- `frontend/src/renderer/infrastructure/services/ToolExecutionPayloads.ts`
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
- `ChatProvider`: mounts `useChatStream` and `useToolRunner`; no extra chat business logic

## Chat Store Contract (`chatStore.ts`)

Primary state:

- `messages`
- `isSending`
- `thinkingStatus`
- `tokenCounts`
- `streamTracking`

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
- fallback heuristic for Gemini: provider `gemini` + model id prefix `gemini-` implies `supportsThinking=true` when catalog flags are absent

Resulting policy:

- if `supportsThinking=true` and `supportsThinkingTextStream=false`, local-user send path sets generic `Thinking...` status until stream text arrives
- otherwise thinking state starts empty and waits for `llm-thought` chunks

Persisted thinking cleanup contract from `chatStreamThinkingStatus.ts`:

- `GENERIC_THINKING_STATUS` and `COMPACTION_THINKING_STATUS` are never persisted into final assistant message `thinkingText`
- blank/non-string statuses are normalized to `null`

## Message Send Lifecycle (`useChatMessageSender`)

`sendMessage(text)` sequence:

1. stop playback (optional)
2. ensure `conversation_ref` exists (create if absent)
3. append pending user message immediately for optimistic UI
4. set sending state
5. optional overlay transition back to chatbox (`show-chatbox` invoke)
6. optional screenshot capture via `extractOSstate(...)`
7. optional artifact upload (`uploadArtifactBase64`)
8. update already-rendered user message with `screenshot_ref/url`
9. record transcript user row
10. emit backend `query` via `ApiClient.sendQuery`

Failure handling:

- on query-send failure, `isSending=false` and synthetic assistant error message is appended.

## Stream Event Ingestion (`useChatStream`)

Listener source:

- `IpcBridge.on(ON_CHANNELS.FROM_BACKEND, ...)`

Pre-routing guards:

- event shape validated by `isBackendEvent`
- event filtered by active conversation mismatch guard (`chatStreamConversationGate`), including `memory-store` fallback routing via payload/session `session_id` when `conversation_ref` is absent

Handler map (`BackendEventType` -> behavior):

- `local-user-message`: adds user row, resets `streamTracking` for turn
- `llm-thought`: accumulates transient thinking text and writes live reasoning (`thinkingText`) onto the same-turn assistant `llm-text` message (creates placeholder assistant row before first text chunk when needed)
- `streaming-response`: append/create assistant `llm-text` row and increment chunk tracking
- `context-compaction-started`: sets thinking text to `Compacting conversation history...` while backend compaction runs
- `context-compaction-completed`: clears compaction thinking text so normal stream status can resume
- `context-compaction-failed`: clears compaction thinking text on failed compaction attempts
- `tool-call`: append assistant tool-call row and transcript tool-call row
- `tool-output`: append assistant tool-output row with screenshot/tool metadata and transcript tool-output row
- `tool-bundle`: append bundle call row
- `system-prompt`: annotate last user message with system prompt + tool schema snapshot
- `user-message-full`: annotate user message with full payload metadata
- `assistant-message-full`: annotate latest assistant `llm-text` message
- `memory-store`: forward backend-provided `{user_query, assistant_response}` pair to sidecar `store-memory` IPC so episodic interaction memory is persisted
- `tool-schemas`: annotate first user message with tool schema list
- `token-count`: update token counters
- `streaming-complete`: persist final streamed thinking text onto the same-turn assistant `llm-text` message (`thinkingText` + `thinkingSourceEventType`), then mark assistant message complete and clear transient `thinkingStatus`
- `error`: append assistant error row unless ignored by settings-update-error filter

Message targeting utilities:

- `findLastMessageIdBySender`
- `findLastAssistantLlmTextMessageId`
- `findStreamingCompleteAssistantMessage`
- `resolveStreamingResponseAction`

Tool-specific handler extraction (`useChatStreamToolHandlers`) ownership:

- clears transient thinking status/source before each tool event
- converts backend tool payloads into chat rows via `chatStreamToolMessages.ts`
- records transcript tool rows with model metadata from `modelContextRef`
- resolves tool-output correlation id fallback via `resolveToolOutputCorrelationId(...)`
- normalizes screenshot attachment from `payload.screenshot_ref`

## Tool Execution Runtime (`useToolRunner` + `ToolExecutionService`)

Ingress events:

- `tool-call`
- `tool-bundle`

Stale-turn guardrails:

- tool events are ignored when `turn_ref` does not match active stream turn or stream is terminal (`idle/complete/error`)
- stale tool events send explicit backend cancellation payloads:
- tool call -> `tool-result` failure with `frontend_stale_turn_cancelled`
- tool bundle -> `tool-bundle-result` failure with `frontend_stale_turn_cancelled`

Correlation tracking:

- hook tracks correlation IDs to active turn refs
- drops late/foreign callback results before UI append/backend relay
- removes correlation tracking after backend send

Surface preparation contract (`toolRunnerSurface.ts`):

- classifies tool UI mode as `none | screenshot | interactive`
- interactive mode covers computer-control primitives (`mouse_control`, `keyboard_control`, `scroll_control`, plus browser actions `click|type|scroll`)
- screenshot mode covers capture-only computer-use actions (`screenshot`, `switch_tab`, `wait`, plus browser `action=screenshot|switch|switch_tab`)
- every non-`none` preparation claims a surface token; chat-pill restoration runs only after the last outstanding token is released (prevents early restore when tool executions overlap)

Overlay/focus runtime behavior:

- interactive mode:
  - `SHOW_CHATBOX(focus=false)` then `HIDE_CHATBOX`
  - `PREPARE_OVERLAY_TOOL_FOCUS(waitMs=180)`
  - fail-close when focus prep fails or `externalFocusActive` check fails while verification is available
- screenshot mode:
  - `SHOW_CHATBOX(focus=false)` then `HIDE_CHATBOX` (no focus verification call)
- restoration:
  - when preparation requested chat-pill hide, `restoreToolExecutionSurface(...)` releases the token
  - `SHOW_CHATBOX(focus=false)` runs best-effort only when no active surface tokens remain

`ToolExecutionService.executeTool(...)` flow:

1. invoke tool over IPC (`execute-tool` invoke)
2. run capture policy (`ensureAutoCapture`) for computer-use paths
3. upload screenshot artifact when available
4. format assistant-facing output (`formatToolOutputMessage`)
5. emit UI callback with rich result payload
6. send backend `tool-result` with normalized payload data (`llm_content`, optional `screenshot_ref`, optional normalized `system_state`)

Bundle flow (`executeToolBundle(...)`):

1. run tools sequentially via `runToolBundle`
2. fail-fast on first error step
3. capture screenshot/system-state policy for computer tools
4. format combined bundle output
5. emit UI callback
6. send single atomic `tool-bundle-result`

## Capture and Payload Normalization Rules

`ToolExecutionCapture`:

- computer-use tool detection includes standard computer tools and `run_shell_command` with positive `wait`
- auto-capture only when screenshot missing and capture not skipped
- tool-specific wait defaults:
- `screenshot`: 0s
- other computer tools: 2s

`ToolExecutionPayloads.buildToolResultPayloadData(...)`:

- strips raw image/base64 fields before backend relay
- always injects formatted `llm_content`
- `system_state` normalized to required keys (`active_window`, `mouse_position`)
- optional internal extension (`system_state_internal.screen_resolution`) for backend normalization paths

## Debug Checklist

If stream UI duplicates assistant rows:

1. verify `resolveStreamingResponseAction` append-vs-new conditions
2. verify `turn_ref` consistency in backend events
3. verify `isComplete` flag set on streaming-complete

If tool outputs appear for wrong turn:

1. inspect `streamTracking.activeTurnRef` transitions
2. verify stale-turn cancellation path in `useToolRunner`
3. verify correlation IDs from backend tool-call payloads

If transcript rows missing:

1. verify `enableTranscript` flag in `ChatProvider`
2. verify event conversation/user IDs are present
3. inspect per-event transcript write sites in `useChatStream` and `useToolRunner`

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
- [Tool Execution Service and Hook Runtime Reference](infrastructure/tool_execution_service_and_hook_runtime_reference.md)
- [Capture, Artifact Upload, and Payload Normalization Reference](infrastructure/capture_artifact_upload_and_payload_normalization_reference.md)
