---
summary: "Deep reference for `ChatInterface` runtime behavior: header control wiring, provider/model selection reconciliation, stop-query handling, and manual compaction pre-rehydrate flow."
read_when:
  - When changing `ChatInterface.jsx` or `ChatInterfaceHeaderControls.jsx` control behavior.
  - When debugging stop button state, provider/model dropdown updates, compaction pre-rehydrate flow, or dashboard main-window send-surface behavior.
title: "Chat Interface Header Controls, Model Selection, and Compaction Rehydrate Reference"
---

# Chat Interface Header Controls, Model Selection, and Compaction Rehydrate Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/ChatInterfaceHeaderControls.jsx`
- `frontend/src/renderer/features/chat/utils/chatModelOptions.js`
- `frontend/src/renderer/features/chat/hooks/useChatInterfaceBindings.js`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState.js`
- `frontend/src/renderer/infrastructure/transcript/conversationTranscriptLoader.js`
- `frontend/src/renderer/features/dashboard/utils/episodicMemoryUtils.js`
- `tests/frontend/ChatInterfaceWiring.test.jsx`

## Busy/Awaiting Projection Contract

`ChatInterface` derives loop state via:

- `useCurrentTurnPresentationState({ phase: streamPhase, isSending, messages, allowedTypes: VISIBLE_ASSISTANT_REPLY_TYPE_SET })`

Derived flags:

- `composerBusy` drives send/stop lock behavior
- `canStop = composerBusy`
- `showAssistantAwaitingDot` comes from the shared current-turn presentation contract

## Stop Query Contract

`handleStopQuery()` behavior:

1. no-op when not busy
2. applies UI-side stop state reset via `applyStopQueryUiState(...)`
3. stops local audio playback
4. calls `ApiClient.stopQuery(...)` using:
  - transcript-session conversation ref first
  - fallback `getActiveConversationRef()`

Keyboard binding:

- `useChatInterfaceStopShortcut(canStop, handleStopQuery)`

## Sender Surface Contract (Dashboard/Main Window)

`ChatInterface` creates sender with:

- `useChatMessageSender(stopPlayback, { senderSurface: "main-window" })`

Operational implication:

- main window send path uses main-window policy (for example no overlay return-to-chatbox behavior and no overlay-only screenshot gate path).

## Header Controls Runtime

`ChatInterfaceHeaderControls` receives fully resolved view-model props and callbacks from `ChatInterface`.

Provider dropdown:

- toggles provider menu and closes model menu
- `handleProviderSelect(provider)` trims provider id
- if currently selected model is not in chosen provider pool, selection falls back to first provider model

Model dropdown:

- toggles model menu and closes provider menu
- renders one base entry per runtime model (for example one `GPT-5.3 Codex` instead of separate `Low/High` rows)
- `handleModelSelect(option)` writes both `selected_model_id` and provider fallback (`option.provider || configuredProvider`)
- when the selected model exposes multiple reasoning levels, model selection preserves the current reasoning mode when possible (fallback: `medium`, then first available)

Reasoning mode dropdown (conditional):

- shown only when the selected model has more than one reasoning mode variant
- options are normalized to `Low`, `Medium`, `High`, `Extra High`
- selecting a reasoning mode updates `selected_model_id` to the matching model variant id for the same runtime model family

Window controls:

- minimize/maximize/close invoke `IpcBridge.invoke(...)` channels
- hidden entirely when VM mode query flag is enabled (`vm_mode=1`)

Utility controls:

- speech toggle flips `speech_mode_enabled` in config
- dev-only compaction button appears when `isDevUiEnabled()` is true

## Manual Compaction Pre-Rehydrate Flow

`handleRunAutoCompaction()` flow:

1. sets compaction-specific thinking status/source markers
2. waits one paint (`waitForNextPaint()`) so state is visible before async work
3. resolves transcript session (`conversationRef`, `userId`)
4. when both values exist:
  - loads transcript rows via `loadConversationTranscriptMemories(...)`
  - maps rows with `toRehydrateMessagePayload(...)`
  - calls `ApiClient.sendRehydrateConversation(...)`
5. always calls `ApiClient.compactHistory(true)` after the pre-rehydrate attempt

Failure behavior:

- pre-rehydrate load/send errors are warning-logged and do not block the compaction request

## Connection Warning Contract

When `useChatLoopUiState` reports disconnected transport:

- `ChatInterface` renders alert banner:
  - `Cannot connect to server right now, try again later.`

Banner is removed automatically when transport reconnects.

## Test-Backed Invariants

`tests/frontend/ChatInterfaceWiring.test.jsx` validates:

- sender surface is `main-window`
- window controls invoke expected IPC channels
- VM mode hides native window controls
- disconnected transport renders warning banner
- speech-mode toggle control remains available

## Drift Hotspots

1. Changing provider/model fallback rules without matching `chatModelOptions` helpers can leave impossible selected-model combinations.
2. Removing `waitForNextPaint()` before compaction can hide status transition timing in UI during manual compaction.
3. Bypassing transcript session fallback on `stopQuery` can send stop signals to wrong/no conversation on edge reconnect states.

## Related Pages

- [Frontend Renderer Chat Docs Hub](README.md)
- [Message Send Surface Policy and Screenshot Capture Reference](message_send_surface_policy_and_screenshot_capture_reference.md)
- [Chat Loop UI State Disconnect Recovery and Surface Projection Reference](loop_ui_state_disconnect_recovery_and_surface_projection_reference.md)
- [Conversation Transcript Loader and Display-Bounds Storage Reference](../infrastructure/conversation_transcript_loader_and_display_bounds_storage_reference.md)
