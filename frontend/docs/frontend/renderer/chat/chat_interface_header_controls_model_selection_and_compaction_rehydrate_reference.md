---
summary: "Deep reference for `ChatInterface` runtime behavior: stop button state, header control wiring, provider/model selection reconciliation, stop-query handling, and manual compaction pre-rehydrate flow."
read_when:
  - When changing `ChatInterface.jsx` or `ChatInterfaceHeaderControls.jsx` control behavior.
  - When debugging stop button state, provider/model dropdown updates, compaction pre-rehydrate flow, or dashboard main-window send-surface behavior.
title: "Chat Interface Header Controls, Model Selection, and Compaction Rehydrate Reference"
---

# Chat Interface Header Controls, Model Selection, and Compaction Rehydrate Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/ChatInterfaceHeaderControls.jsx`
- `frontend/src/renderer/app/runtime/desktopChatInterfaceBindingsRuntime.js`
- `frontend/src/renderer/app/runtime/desktopChatModelOptionsRuntime.js`
- `frontend/src/renderer/features/chat/hooks/useChatInterfaceBindings.js`
- `frontend/src/renderer/app/runtime/desktopAudioRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopWindowRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopWorkspaceRuntimeClient.ts`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useChatSurfaceController.js`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime.js`
- `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts`
- `frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts`
- `tests/frontend/ChatInterfaceWiring.test.jsx`

## Busy/Awaiting Projection Contract

`ChatInterface` derives loop state via:

- `useChatSurfaceController({ chatSurfaceState, ... })`, where
  `chatSurfaceState` comes from `selectChatInterfaceState(...)`, which applies
  `DesktopChatSurfaceSelectorRuntime` outside the component
- `DesktopCurrentTurnPresentationRuntime.resolveCurrentTurnPresentationState(...)`
  inside that controller uses the app-runtime default visible-assistant reply
  types, keeping the raw type set private to
  `desktopCurrentTurnPresentationRuntime.js`.

Derived flags:

- `composerBusy` drives send/stop lock behavior
- `canStop = composerBusy`
- `awaitingDotTargetMessageId` comes from the shared current-turn presentation
  contract and is the concrete dashboard awaiting-dot render target

## Presentation Read Model

`selectChatInterfaceState(...)` calls
`DesktopChatInterfacePresentationRuntime.buildChatInterfacePresentationState(...)`
before `ChatInterface` renders. The component receives rendered thread rows,
action gating, active revision id, and selected stop target props. When a
`ConversationView` exists, that runtime projects SDK display rows so React does
not choose between SDK view rows and raw store messages. Replay actions no
longer receive a selector row model; they pass row ids/text through
`desktopConversationReplayRuntime` and SDK commands resolve the authoritative
display rows.

## Stop Query Contract

Dashboard stop behavior is owned by `useStopTurnHandler(...)`:

1. no-op when not busy
2. receive a selected `stopTurnTarget` from `selectChatInterfaceState(...)`
   for SDK `ConversationView`, pending-turn bridge, or idle authority
3. classify the target with `DesktopStopTurnRuntime` predicates before
   current-turn and pending-turn side effects
4. atomically accept the stopped turn in chat store with `acceptStoppedTurn(...)`
5. stop local audio playback
6. call `DesktopLiveTurnRuntimeClient.stop(...)` with the resolved
   conversation ref and turn ref

The hook consumes the selected target only. Raw `ConversationView`, pending-turn,
or session conversation refs stay in the selector runtime so React event
handlers do not run a second stop-target authority beside the SDK view/pending
bridge selection.

`DesktopStopTurnRuntime.buildStoppedSdkLiveTurn(...)` terminalizes
the stopped SDK live turn without restamping SDK `typingVisible` or
`overlayVisible`; renderer visible lifecycle owns post-stop typing and response
visibility from terminal phase and visible entries.

Keyboard binding:

- `useChatInterfaceStopShortcut(canStop, handleStopTurn)`
- Raw `keydown` subscription and Stop shortcut predicate handling live in
  `DesktopChatInterfaceBindingsRuntime`; the hook supplies lifecycle state and
  the resolved stop callback.

## Sender Surface Contract (Dashboard/Main Window)

`ChatInterface` creates sender with:

- `useChatMessageSender(stopPlayback, { senderSurface: "main-window" })`

Operational implication:

- main window send path uses main-window policy (for example no overlay return-to-chatbox behavior and no overlay-only screenshot gate path).

## Header Controls Runtime

`ChatInterfaceHeaderControls` receives fully resolved view-model props and callbacks from `ChatInterface`.

Chat interface event subscriptions are routed through app runtime clients:

- `DesktopAudioRuntimeClient` owns the untyped `audio-chunk` channel
  subscription; `useChatInterfaceAudioChunkStream` owns payload parsing and
  playback queue handoff.
- `DesktopWorkspaceRuntimeClient` owns the `workspace-access-updated`
  subscription, workspace selection normalization, and source classification
  such as `isWorkspacePickerSelection`. `ChatInterface` consumes value-level
  workspace helpers (`fetchActiveWorkspace()`,
  `requestGrantedActiveWorkspace()`, and
  `onWorkspaceSelectionUpdated(...)`) and owns active-workspace refresh,
  conversation binding comparison, and whether a workspace-picker update should
  start a new chat.
- `DesktopChatInterfaceBindingsRuntime` owns the browser `mousedown` and
  `keydown` listener adapters used by provider/model/reasoning menu dismissal,
  local Stop shortcut handling, and thread-find open/close shortcuts. It also
  owns window-focus subscriptions for active-workspace refresh and
  animation-frame scheduling plus input focus/select mechanics for thread-find
  input focus.

Provider dropdown:

- toggles provider menu and closes model menu
- `handleProviderSelect(provider)` trims provider id
- if currently selected model is not in chosen provider pool, selection falls back to first provider model
- provider/model changes update renderer config immediately but do not call `DesktopSettingsRuntimeClient.setModel(...)` yet

Model dropdown:

- toggles model menu and closes provider menu
- renders one base entry per runtime model (for example one `GPT-5.3 Codex` instead of separate `Low/High` rows)
- `handleModelSelect(option)` writes both `selected_model_id` and provider fallback (`option.provider || configuredProvider`)
- grouping/label/default selection should prefer runtime family metadata (`family_id`, `family_label`, `default_model_id`, `default_reasoning_mode`, `reasoning_modes`) when present instead of reconstructing families from display-name text
- when the selected model exposes multiple reasoning levels, model selection preserves the current reasoning mode when possible (fallback: `medium`, then first available)
- backend session model selection is synced and awaited through
  `DesktopSettingsRuntimeClient.setModel(...)` on the next send,
  retry/edit-replay, or manual-compaction path. Retry/edit replay also carries
  the selected model in its SDK replay command payload, and
  `ConversationRuntime.editAndResend(...)` / `retryTurn(...)` forward it into
  `ConversationRuntime.send()`, where the SDK applies the model before
  inference without adding model fields to backend query payloads.

Reasoning mode dropdown (conditional):

- shown only when the selected model has more than one reasoning mode variant
- options are normalized to `Low`, `Medium`, `High`, `Extra High`
- currently used by model families that expose multiple reasoning variants (for example OpenAI GPT-5.4, Anthropic, Gemini)
- renderer-side reasoning variant discovery should come from runtime family metadata first; display-name heuristics are only a label fallback and must not invent missing reasoning modes
- selecting a reasoning mode updates `selected_model_id` to the matching model variant id for the same runtime model family

Window controls:

- minimize/maximize/close invoke `DesktopWindowRuntimeClient`
- hidden entirely when VM mode query flag is enabled (`vm_mode=1`)

Utility controls:

- search button toggles the thread-find bar open and closed; keyboard
  `Command/Ctrl+F` remains an open/refocus shortcut, while Escape and the find
  bar close button close and clear find state
- speech toggle flips `speech_mode_enabled` in config
- dev-only compaction button appears when
  `DesktopDevUiRuntime.isDevUiEnabled()` is true

## Manual Compaction Pre-Rehydrate Flow

`handleRunAutoCompaction()` delegates to the shared manual compaction runtime:

1. sets compaction-specific thinking status/source markers
2. waits one paint so state is visible before async work
3. syncs and awaits deferred model selection (`model_provider`, `selected_model_id`) through `DesktopSettingsRuntimeClient.setModel(...)`
4. resolves transcript session (`conversationRef`, `userId`)
5. when a conversation ref exists, calls `ensureConversationInferenceSessionHydrated(...)` so backend compaction sees the latest normalized store rehydrate snapshot
6. calls `DesktopConversationContinuityService.compactHistory(true)` after the pre-rehydrate attempt
7. if model sync or compact dispatch fails before backend compaction starts, sets the local status to `Conversation compaction failed.`

The overlay chatbox dev compaction button uses the same helper, so dashboard and
overlay compaction controls share the same rehydrate-before-compact behavior.

Failure behavior:

- pre-rehydrate load/send errors are warning-logged and do not block the compaction request

## Disconnect Feedback Contract

When `useChatLoopUiState` reports disconnected transport:

- `ChatInterface` does not render a pre-send warning banner in the thread or composer
- send remains available
- a failed send is surfaced by the normal assistant error-message path after the user submits

## Test-Backed Invariants

`tests/frontend/ChatInterfaceWiring.test.jsx` validates:

- sender surface is `main-window`
- window controls invoke expected IPC channels
- VM mode hides native window controls
- disconnected transport does not render a pre-send warning banner
- speech-mode toggle control remains available

## Drift Hotspots

1. Changing provider/model fallback rules without matching `DesktopChatModelOptionsRuntime` methods can leave impossible selected-model combinations.
2. Removing `waitForNextPaint()` before compaction can hide status transition timing in UI during manual compaction.
3. Bypassing `DesktopLiveTurnRuntimeClient.stop(...)` can send stop signals outside the SDK runtime/transport boundary.

## Related Pages

- [Frontend Renderer Chat Docs Hub](README.md)
- [Message Send Surface Policy and Screenshot Capture Reference](message_send_surface_policy_and_screenshot_capture_reference.md)
- [Chat Loop UI State Disconnect Recovery and Surface Projection Reference](loop_ui_state_disconnect_recovery_and_surface_projection_reference.md)
- [Conversation Transcript Loader and Display-Bounds Storage Reference](../infrastructure/conversation_transcript_loader_and_display_bounds_storage_reference.md)
