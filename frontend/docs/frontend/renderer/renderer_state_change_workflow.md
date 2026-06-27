---
summary: "Workflow for changing desktop renderer state, chat UI, dashboard sections, settings panels, transcript projection, and provider-owned UI state without crossing backend, Electron main, or local-runtime boundaries unnecessarily."
read_when:
  - When changing renderer chat state, dashboard panels, settings controls, transcript replay/projection, stream presentation, tool-result rendering, permission UI, or provider context behavior.
  - When a UI symptom could belong to renderer state, Electron main IPC, backend stream events, local execution, or transcript persistence and you need to route the owner before editing.
title: "Renderer State Change Workflow"
---

# Renderer State Change Workflow

Use this workflow for UI and renderer-state work. The renderer owns presentation, local state projection, user interaction hooks, renderer config persistence, transcript projection, and dispatch through desktop app-runtime facades and SDK-shaped command clients. It does not own backend event production, Electron window policy, preload channel exposure, local tool execution, or hosted auth decisions.

The goal is to fix the state owner, not the nearest component. If a malformed backend event causes bad UI, fix the backend event contract. If a local-runtime result is malformed, fix the local-runtime/main bridge. If the renderer projection is stale or over-broad, fix the renderer store/hook/selector layer.

## Fast Owner Map

| Symptom or request | Renderer owner | First source roots | First tests | First docs |
| --- | --- | --- | --- | --- |
| Message list, input, pending send, screenshot attachment, or send button behavior changes | Chat send path and presentation | `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`, `frontend/src/renderer/features/chat/components/MessageInput.jsx`, `frontend/src/renderer/app/runtime/desktopChatSendPayloadRuntime.ts`, `frontend/src/renderer/app/runtime/desktopChatSendStateRuntime.ts`, `frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts` | `tests/frontend/ChatMessageSender.test.tsx`, `tests/frontend/DesktopChatSendPayloadRuntime.test.ts`, `tests/frontend/DesktopChatSendStateRuntime.test.ts` | [Message Send Surface Policy](chat/message_send_surface_policy_and_screenshot_capture_reference.md) |
| Streamed text, thinking text, token counts, completion, or stale-turn filtering is wrong | Chat stream ingestion and chat store | `features/chat/hooks/useChatStream.ts`, `features/chat/hooks/chatStream/*`, `app/runtime/desktopChatStream*.ts`, `features/chat/stores/chatStore.ts` | `tests/frontend/ChatStream*.test.ts`, `tests/frontend/ChatStore.test.ts` | [Chat Stream and Tool Execution](chat_stream_and_tool_execution_reference.md), [Stream Event State Machine](../runtime/stream_event_state_machine.md) |
| Tool-call or tool-output cards render incorrectly after backend events | SDK current-turn projection and message payload projection | `features/chat/hooks/useConversationRuntimeProjectionStream.ts`, `app/runtime/desktopCurrentTurnMessageRuntime.js`, `features/chat/payloads/*`, `infrastructure/transcript/*` | `tests/frontend/ChatStreamThinkingStatus.state.test.tsx`, `tests/frontend/ChatBoxResponse.state.test.jsx`, `tests/frontend/ToolOutputMessageState.test.ts` | [Tool Call/Output Rendering](chat/payloads/tool_call_output_and_transparency_section_rendering_reference.md) |
| Local tool result never returns, returns twice, or targets stale turn | Agent SDK tool routing, local-runtime bridge, and renderer display projection | `packages/windie-sdk-js/src/runtime/Agent.ts`, `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`, `features/chat/hooks/chatStream/useChatStreamToolHandlers.ts` | `tests/frontend/AgentSdkConversationRuntime.test.ts`, `tests/frontend/LocalRuntimeExecuteToolRuntime.test.cjs`, and renderer tool display tests | [Tool Execution Lifecycle](../../tools/tool_execution_lifecycle.md), [Local-Runtime Tool Change Workflow](../local_runtime_tool_change_workflow.md) |
| Minimal pill, response overlay, stop button, or busy state gets stuck | Current-turn projection and overlay state | `features/chat/hooks/useChatSurfaceController.js`, `features/minimalChatPill/hooks/useResponseOverlayViewModel.js`, `app/runtime/desktopVisibleTurnLifecycleRuntime.js`, `app/runtime/desktopLiveTurnSurfaceRuntime.js`, `app/runtime/desktopCurrentTurnMessageRuntime.js`, `app/runtime/desktopResponseOverlayViewRuntime.ts` | `tests/frontend/ChatLoopUiState*.test.*`, `tests/frontend/StreamPhaseState.test.js`, `tests/frontend/ChatBoxResponse*.test.jsx` | [Chat Loop UI State](chat/loop_ui_state_disconnect_recovery_and_surface_projection_reference.md), [Response Overlay Phase](overlays/response_overlay_phase_and_tool_ghost_runtime_reference.md) |
| New chat, resume conversation, active conversation, or wrong transcript target changes | Chat workspace state plus transcript session sync | `features/chat/stores/chatStore.ts`, `app/runtime/desktopActiveChatSessionRuntime.ts`, `app/runtime/desktopConversationSessionRuntime.ts`, `app/runtime/desktopNewChatSessionRuntime.ts`, `features/dashboard/components/DashboardShell.jsx`, `infrastructure/transcript/transcriptSessionRuntime.ts` | `tests/frontend/NewChatSession.test.ts`, `tests/frontend/ResetActiveChatSession.test.ts`, `tests/frontend/TranscriptSessionState.test.ts`, `tests/frontend/ChatWorkspaceState.test.ts` | [Chat Store and New Session Rotation](chat/chat_store_state_and_new_session_rotation_reference.md), [Transcript Session and Rehydrate](transcript_session_and_rehydrate_reference.md) |
| Dashboard conversation list, sidebar search, recent chat loading, or resume flow changes | Dashboard shell and conversation hooks | `features/dashboard/components/DashboardShell.jsx`, `features/dashboard/components/DashboardSidebar.jsx`, `features/dashboard/hooks/useDashboardConversations.js`, `app/runtime/desktopDashboardConversationGroupRuntime.js` | `tests/frontend/DashboardConversationLoad.test.js`, `tests/frontend/DashboardSidebar.test.jsx`, `tests/frontend/DashboardShell.test.jsx` | [Renderer Dashboard Hub](dashboard/README.md) |
| Memory, models, settings, usage, or API-key panel state changes | Dashboard section component plus app-runtime facade | `features/dashboard/components/sections/*`, `app/runtime/desktopMemoryRuntimeClient.ts`, `app/runtime/desktopMemoryPresentationRuntime.js`, `app/runtime/desktopChatModelOptionsRuntime.js`, `app/runtime/desktopSettingsEventRuntimeClient.ts` | `tests/frontend/DesktopMemoryPresentationRuntime.test.js`, `tests/frontend/MemorySection.test.jsx`, `tests/frontend/SettingsSection.test.jsx`, `tests/frontend/DesktopChatModelOptionsRuntime.test.js`, `tests/frontend/DesktopSettingsEventRuntimeClient.test.ts` | [Dashboard Sections Hub](dashboard/sections/README.md), [Renderer Settings Hub](settings/README.md) |
| Settings value persists incorrectly or runtime config sync is wrong | App config provider and settings sync | `app/providers/AppConfigProvider.jsx`, `app/providers/appConfigPersistence.js`, `app/providers/appConfigRuntimeSync.js`, `app/runtime/desktopSettingsEventRuntimeClient.ts` | `tests/frontend/AppConfigProvider*.test.tsx`, `tests/frontend/IpcSettingsSync.test.cjs`, `tests/frontend/DesktopSettingsEventRuntimeClient.test.ts` | [Settings Sync Change Workflow](../runtime/settings_sync_change_workflow.md), [Renderer Config Filter](settings/config/frontend_config_filter_storage_and_provider_merge_runtime_reference.md) |
| Permission onboarding/control-center status is wrong | Permission store and permission UI | `features/permissions/stores/permissionStore.js`, `features/permissions/components/*` | `tests/frontend/permissionStore.test.js`, permission component tests | [Renderer Permissions Hub](permissions/README.md), [Permissions and Local Authority Workflow](../../security/permissions_and_local_authority_workflow.md) |
| Replay, transcript load, pending queue, or stored message shape changes | Transcript infrastructure and replay projection | `infrastructure/transcript/*`, `app/runtime/desktopConversationReplayRuntime.js` | `tests/frontend/Transcript*.test.*`, `tests/frontend/ConversationReplayActions.test.jsx`, `tests/frontend/ConversationReplayDatabaseIntegration.test.tsx`, `tests/frontend/DesktopConversationReplayRuntime.test.js` | [Renderer Transcript Hub](transcript/README.md), [Transcript Session and Rehydrate](transcript_session_and_rehydrate_reference.md) |
| Renderer app crashes or provider hook is used outside context | App provider/context ownership | `app/providers/*`, `app/App.jsx`, `app/providers/contexts/*` | `tests/frontend/AppProvider.test.tsx`, `tests/frontend/AppStatusProvider.test.tsx`, `tests/frontend/AppConfigProvider*.test.tsx` | [Renderer Provider Hub](providers/README.md) |

## Boundary Rules

- Keep renderer fixes inside renderer modules when the bug is projection, display, selector, local persistence, or hook composition.
- Do not add preload IPC channels for convenience. If renderer needs new main-process data, follow [IPC Change Workflow](../ipc_change_workflow.md).
- Do not duplicate backend event correction in renderer if the backend payload is wrong. Update backend schema/formatter docs and tests instead.
- Do not repair local-runtime tool payloads in chat components. Fix the Agent SDK tool router, the main bridge mapper, or local-runtime Python executor depending on where the payload first becomes wrong.
- Do not put raw filesystem, shell, browser, or computer-use execution in renderer code. Backend tool execution belongs to the Agent SDK runtime and local-runtime bridge; renderer code renders projections only.
- Keep store selectors narrow. High-frequency stream paths should mutate only the workspace and selector slices that need to update.
- Keep transcript persistence separate from visual projection. A message card can render from transient state before a transcript row is durable.

## Change Sequence

1. **Classify the symptom.** Decide whether the issue is producer payload, renderer projection, presentation component, local persistence, transcript replay, or IPC transport.
2. **Read the nearest hub and reference.** Use the owner map above, then read [Feature Module Matrix](feature_module_matrix.md) and the specific chat/dashboard/settings/transcript page.
3. **Inspect the store or hook before the component.** Most renderer behavior is owned by hooks, stores, selectors, and projection helpers; components should stay mostly declarative.
4. **Identify the state lifetime.** Separate transient UI state, per-conversation chat workspace state, persisted config, pending transcript queue state, and durable transcript rows.
5. **Update the smallest owner.** Prefer a helper/store/hook patch over threading special cases through multiple components.
6. **Update tests at the same abstraction.** Store bugs get store tests, hook orchestration gets hook tests, component presentation gets component tests, and IPC/config changes get boundary tests.
7. **Update docs when behavior changes.** Add or update the focused reference and link the workflow/hub when a new owner path appears.

## State Lifetime Map

| State lifetime | Owner | Examples | Do not store here |
| --- | --- | --- | --- |
| Per-render interaction state | Component or local hook | open menus, draft UI affordances, hover/focus state | backend event history, durable transcript rows |
| Active chat workspace state | `chatStore.ts` and chat workspace helpers | messages, `isSending`, thinking status, token counts, stream tracking, active conversation ref | raw local results before normalization, app-wide config |
| Current-turn presentation projection | chat state utilities and overlay hooks | busy/awaiting/active response state, visible assistant reply, stop affordance state | durable conversation identity or backend cancellation semantics |
| App config and settings state | `AppConfigProvider` and settings hooks | selected model, wakeword toggles, local setting persistence, backend config sync payloads | per-message stream data or tool results |
| Permission gate state | `permissionStore.js` | onboarding completion, required permission status, recheck state | platform permission implementation logic |
| Transcript session state | transcript runtime and writer | active conversation/user identity, pending writes, flush status | live-only visual state such as hover or menu state |
| Durable conversation projection | transcript loaders and replay helpers | stored user/assistant/tool rows, replayed message shape, transparency payloads | in-flight stream counters |

## Chat and Stream Checklist

When changing chat send, stream, or message state:

- Confirm whether the change is active-workspace only or must write a specific `conversationRef`.
- Preserve `turn_ref -> conversation_ref` routing for backend events that omit `conversation_ref`.
- Keep `streamTracking.phase` transitions consistent with [Stream Event State Machine](../runtime/stream_event_state_machine.md).
- Do not write duplicate assistant transcript rows on duplicate `streaming-complete` events.
- Keep generic thinking placeholders out of final persisted assistant `thinkingText`.
- Keep stale-turn guards before display projection and before transcript side effects; SDK/main owns execution-side stale-turn handling.
- Add tests for active turn, stale turn, duplicate terminal event, and conversation switch behavior when relevant.

## Dashboard and Settings Checklist

When changing dashboard sections or settings:

- Keep shell navigation and section-specific state separate.
- Normalize section data in section helpers before rendering lists or cards.
- Treat conversation-open state as transient dashboard orchestration state. The
  chat component may render a loading projection for the selected conversation,
  but durable conversation identity still comes from transcript/session sync and
  chat-store workspace state after rows load.
- Route provider/model setting changes through `AppConfigProvider` and settings sync helpers, not ad hoc IPC calls from leaf components.
- Keep permission status UI driven by `permissionStore`, with platform probing owned by Electron main and local-runtime platform code.
- Add tests for empty/loading/error states and for any persisted setting or runtime sync payload.

## Transcript and Replay Checklist

When changing transcript or replay projection:

- Decide whether the change affects pending writes, durable rows, local replay projection, or backend rehydrate payloads.
- Preserve transcript session identity updates when opening or creating conversations.
- Keep pending queue retry behavior FIFO and do not drop rows silently unless the existing contract says the row is non-durable.
- Preserve structured tool payloads so replay can render tool cards without reparsing display text.
- Add tests for stored message shape, pending queue behavior, and rehydrate/replay projection when message schema changes.

## Visual Change Checklist

For UI-only changes:

- Keep behavior state untouched unless the visual change requires a new explicit state.
- Prefer existing CSS modules/styles in `frontend/src/renderer/styles`.
- Verify compact overlay surfaces and dashboard panels separately because they consume different selector slices.
- Check long text, narrow widths, and loading/error/empty states.
- Pure styling may skip tests when behavior is unchanged, but update docs if the component contract or expected state changes.

## Validation Matrix

| Changed surface | Focused validation |
| --- | --- |
| Chat store/selectors | `cd frontend && npm run test -- ChatStore ChatSelectors ChatWorkspaceState` |
| Chat send path | `cd frontend && npm run test -- ChatMessageSender DesktopChatSendPayloadRuntime DesktopChatSendStateRuntime` |
| Stream ingestion/formatting | `cd frontend && npm run test -- ChatStream` |
| SDK tool coordination and renderer tool display | `cd frontend && npm run test -- AgentSdkConversationRuntime LocalRuntimeExecuteToolRuntime ToolOutputMessageState ToolCallMessageState` |
| Overlay/current-turn projection | `cd frontend && npm run test -- ChatLoopUiState ChatBoxResponse StreamPhaseState` |
| Dashboard shell/sidebar | `cd frontend && npm run test -- Dashboard DashboardShell` |
| Settings/config provider | `cd frontend && npm run test -- Settings AppConfigProvider IpcSettingsSync` |
| Transcript/replay | `cd frontend && npm run test -- Transcript StoredTranscript ConversationReplay` |
| Docs-only renderer workflow updates | `<windie> docs list`, `git diff --check`, focused Markdown link checks |

## Review Checklist

Before committing renderer state work:

- Did the patch fix the owner layer instead of the nearest visual symptom?
- Did selector scope remain narrow enough for streaming-heavy paths?
- Did active conversation, turn, and transcript identity stay aligned?
- Did persisted config and runtime settings sync stay on the provider path?
- Did local-only UI state avoid leaking into durable transcript rows?
- Did tests cover the state lifetime that changed?
- Did `CHANGELOG.md` mention the behavior or docs update?

## Related Docs

- [Frontend Renderer Docs Hub](README.md)
- [Feature Module Matrix](feature_module_matrix.md)
- [Chat Stream and Tool Execution Reference](chat_stream_and_tool_execution_reference.md)
- [Renderer Chat Docs Hub](chat/README.md)
- [Renderer Dashboard Docs Hub](dashboard/README.md)
- [Renderer Settings Docs Hub](settings/README.md)
- [Renderer Transcript Docs Hub](transcript/README.md)
- [Frontend Runtime Invariants Checklist](../runtime/frontend_runtime_invariants_checklist.md)
