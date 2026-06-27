---
summary: "Core Loop Regression Pack subset for chat pill, dashboard, overlay, SDK projection, conversation runtime, IPC, replay, stop, tool-row, and surface-lease invariants."
read_when:
  - When fixing a user-visible chat pill, dashboard, response overlay, active-turn, stop, tool-row, replay, SDK projection, conversation runtime, or IPC bug.
  - When changing core-loop UI state, pending-turn handling, live current-turn projection, dashboard handoff, response overlay visibility, stop behavior, tool-row pairing, screenshot capture, or tool-surface leases.
  - When deciding where to add a regression test for a human-discovered core-loop UI bug.
title: "Core Loop Regression Pack"
---

# Core Loop Regression Pack

The Core Loop Regression Pack is the focused core-loop subset of the broader
[User-Facing Regression Pack](user_facing_regression_pack.md). It protects the
path where a user sends from the pill or dashboard, WindieOS projects the active
turn, tools run, the response streams, and surfaces hand off between the pill,
response overlay, and dashboard.

Run it with:

```bash
<windie> test core-loop
```

Use `<windie> test core-loop -- <jest args...>` when passing extra Jest flags.
Use `<windie> test pick core-loop` to print the focused route from the test
selection matrix.

## Protected Behaviors

| Behavior | Initial owner tests |
| --- | --- |
| Sending from the pill immediately latches pending/Stop state. | `PendingTurnLiveSurfaceIntegration.test.js`, `ChatPillSessionFlow.test.ts` |
| Opening the dashboard after sending from the pill reuses stable pending-turn selector projections instead of re-rendering derived snapshots until React trips maximum update depth. | `ChatSelectors.test.js` |
| Renderer-local pending typing does not flash because of SDK idle, visible-empty, wrong-turn projections, or SDK presentation visibility flags before authoritative same-turn handoff. | `DesktopVisibleTurnLifecycleRuntime.test.js`, `DesktopSdkLiveTurnEffectsRuntime.test.ts`, `PendingTurnLiveSurfaceIntegration.test.js` |
| Live-surface awaiting/response flags follow visible lifecycle instead of SDK presentation flags or hidden overlay intent. | `LiveTurnSurfaceState.test.js`, `ChatBoxResponse.state.test.jsx` |
| Dashboard awaiting-dot routing follows renderer visible lifecycle instead of durable live-progress row shape or stale session refs. | `ChatInterfaceWiring.test.jsx`, `ChatSurfaceController.test.jsx` |
| Dashboard assistant feedback/retry actions follow visible lifecycle busy/Stop state instead of stale raw send latches. | `ChatInterfaceWiring.test.jsx` |
| Response overlay consumes renderer visible lifecycle and SDK `ConversationView` instead of phase-only typing state, `view.liveTurn.entries` and `view.surfaces.responseOverlay` win over transient SDK `awaiting` phase snapshots, same-turn SDK projection handoff updates the workspace current turn, conversation view, pending turn, and global latest view atomically, inactive workspace projections cannot replace the active latest turn/view, and internal `conv-agent-*` lanes are filtered before normal responsebox surface intent is built, so typing dots cannot reappear between response-stream snapshots. | `ChatBoxResponse.state.test.jsx`, `DesktopConversationRuntimeEventClient.test.ts`, `DesktopVisibleTurnLifecycleRuntime.test.js`, `LiveTurnSurfaceState.test.js`, `ConversationRuntimeProjectionStream.test.ts`, `ChatStore.test.ts`, `AgentSdkConversationRuntime.test.ts`, `SdkLiveTurnSurfaceController.test.cjs` |
| Response overlay renders materialized active-turn `ConversationView.displayRows` before non-materialized live entries, so tool call/output cards remain visible in the floating overlay after the SDK removes those same discrete tool rows from `liveTurn.entries` to prevent dashboard duplication. | `ResponseOverlayViewContract.test.ts` |
| Chat-pill query screenshot metadata survives dashboard display load and later same-turn metadata replay. | `AgentConversationStoreApi.test.ts`, `AgentSdkConversationRuntime.test.ts`, `SdkDisplayChatMessageProjection.test.ts` |
| User-included images, camera screenshot requests, and mixed visual sends project through SDK-owned ordered `attachments[]`; repeated same-turn display rebuilds do not downgrade image-bearing rows to text-only, dashboard can show pending screenshot placeholders, compact surfaces can omit them, ready artifact descriptors replace volatile preview state without persisting preview bytes, and the renderer keeps the last visible image source during preview-to-artifact resolution without scheduling equivalent-source update loops. | `AgentSdkConversationRuntime.test.ts`, `SdkDisplayChatMessageProjection.test.ts`, `AttachmentDisplayComponents.test.jsx`, `DesktopConversationDisplayProjection.test.ts`, `ChatMessageSender.test.tsx`, `ChatStore.test.ts`, `ConversationRuntimeProjectionStream.test.ts`, `UseDashboardConversations.test.jsx`, `DesktopAttachmentImageRuntime.test.jsx` |
| Active and replayed tool-output screenshots render through typed SDK `attachments[]`, including old stored `screenshot_ref(s)` rows adapted by the SDK replay adapter, without renderer whole-message screenshot alias readers. | `AgentSdkConversationRuntime.test.ts`, `SdkDisplayChatMessageProjection.test.ts`, `MessageContent.test.jsx`, `RendererChatRuntimeBoundary.test.ts` |
| Retry/edit resend keeps the accepted child display revision visible if the later normal send fails, clearing only the pending turn and appending a send-failure row instead of rolling back to the parent transcript. | `ConversationReplayActions.test.jsx` |
| Retry/edit resend live updates apply the `ConversationView` carried by current-turn IPC before no-view side effects, so the dashboard can show the replacement user row, typing state, and assistant response without re-subscribing to raw display-row stream events. | `ConversationRuntimeProjectionStream.test.ts` |
| Normal dashboard sends keep the renderer pending user row visible through awaiting-only SDK current-turn projections and awaiting-only first-class `ConversationView` snapshots; typing/busy state may come from SDK, but pending is not cleared until same-turn SDK display rows, view live entries, legacy visible current-turn content, or terminal lifecycle replaces it. | `ConversationRuntimeProjectionStream.test.ts`, `DesktopVisibleTurnLifecycleRuntime.test.js`, `DesktopCurrentTurnWorkspaceRuntime.test.ts`, `DesktopConversationViewWorkspaceRuntime.test.ts` |
| Dashboard recent-chat refreshes caused by edit/resend-style conversation events stay background-only after chats have rendered, keeping the existing list visible while metadata reloads. | `UseDashboardConversations.test.jsx`, `DashboardShell.test.jsx` |
| Empty SDK display-row projections remain conversation-scoped, SDK user display rows preserve turn refs, SDK source/CJS display timeline loads include same-revision replacement send rows, local-runtime display revisions can be authoritative with zero rows, stale parent checkpoints cannot reactivate over an edited child revision, `conversation state` exposes branch/display/model/raw-event/superseded-live diagnostics, and renderer edit/resend publishes the retained prefix plus edited pending turn as one replay frame. Replay pending user rows use the SDK replacement display-row id, replay image payloads use real artifact refs instead of local attachment ids, SDK `send()` persists display-safe visual metadata on the initial user row, pending-turn IPC preserves only identity/text/timestamp and filename chips while SDK display rows own typed visual attachments, echoed pending turns no-op in the originating renderer, and same-turn SDK display user echoes keep the existing optimistic bubble while pending, so editing the first user row clears the old visible suffix without a prefix-only flash, user-pill repaint, screenshot loss, or duplicate display-row/pending optimistic user row. Edit/resend and retry now create an SDK-owned `turn_superseded` handoff before the replacement normal send: late old-turn backend events remain raw audit rows with sanitized `turn.supersession` traces, but cannot retake current-turn ownership, append display rows, install model-history checkpoints, run completed-turn memory persistence, execute local tools, clear the replacement lane through stale stop acknowledgements, or keep dashboard/pill/overlay typing busy. Renderer-local source fallback, old-turn best-effort stop, SDK active-turn ownership guards, non-blocking completed-turn memory persistence, SDK-owned inference-context rehydrate, and fallback-safe rehydrate snapshot messages keep repeated edit Send clicks from resurrecting the replaced row, clearing the replacement pending turn, dropping/blocking the replacement turn's backend stream, or sending model-history-only fields through backend fallback `messages[]` after late old-turn trace/stop/memory side effects. `renderer.replay.timeline` live-surface diagnostics expose the resend action/projection order with sanitized ids, counts, phases, and match booleans when a manual reproduction still leaves typing stuck. | `AgentSdkConversationRuntime.test.ts`, `AgentSdkCjsConversationRuntime.test.cjs`, `IpcDirectWakeUpAgentAdapter.test.cjs`, `IpcPendingTurnHandlers.test.cjs`, `DesktopConversationRuntimeEventClient.test.ts`, `SdkDisplayChatMessageProjection.test.ts`, `DesktopConversationDisplayProjection.test.ts`, `ConversationReplayActions.test.jsx`, `ConversationRuntimeProjectionStream.test.ts`, `ChatStore.test.ts`, `DesktopRendererTraceRuntime.test.ts`, `WindieCli.test.cjs`, `tests/sidecar/test_chat_event_store.py` |
| Typing/awaiting state does not flash because of transient idle events. | `AgentSdkConversationRuntime.test.ts`, `ConversationRuntimeProjectionStream.test.ts`, `ResponseOverlayPhaseHandler.test.cjs` |
| Dashboard and pill render the same active turn projection. | `DesktopLiveTurnRuntimeClient.test.ts`, `IpcLiveTurnState.test.cjs`, `IpcConversationEventProjection.test.cjs` |
| SDK `ConversationView` projects display rows, live turn entries, response overlay surface mode, busy/Stop capability, and action metadata as one conversation-scoped authority while filtering internal `conv-agent-*` lanes out of normal UI output before Electron main applies surface intent; `<windie> conversation view` exposes only sanitized view diagnostics including `--revision` branch inspection, response-overlay renderer paths consume the view before raw current-turn fallback, Electron-main responsebox ownership consumes `view.surfaces.responseOverlay` without falling back to raw current-turn overlay intent, newly tracked renderer windows hydrate from the cached `ConversationView` on the current-turn envelope instead of raw current-turn-only sync, dashboard chat and minimal live-surface selectors suppress raw current-turn projections once a view exists and the renderer chat store no longer retains the global raw `latestCurrentTurnProjection` as normal UI authority, pill busy uses `view.surfaces.pill.mode`, dashboard busy uses `view.surfaces.dashboard.mode`, Stop controls and Electron-main Stop shortcut resolution use `view.liveTurn.canStop` or the local pending pre-view bridge only, with no raw current-turn phase or idle conversation-ref fallback, dashboard transcript messages and `conversation.loadDisplay` renderer facades project from `view.displayRows` without falling back to legacy display rows, dashboard live thread rows project from `view.liveTurn.entries` instead of stale raw current-turn presentation once a view exists, renderer edit/resend plus Try again command rendering follows `view.actions.canEdit/canRetry`, `view.displayRows[].actions` supplies stable per-row edit/retry targets, renderer replay execution calls SDK `conversation.editAndResend`/`conversation.retryTurn` instead of loading display timelines, constructing durable replacement rows, or dispatching a separate send from React, and host revision navigation lists sanitized revisions through SDK `conversation.listRevisions`, checks out through SDK `conversation.checkoutRevision` and applies the returned view, and forks whole selected revisions through SDK `conversation.fork` without renderer display-timeline prefetch before switching to the forked view, so checkout-selected views keep live-turn/response-overlay authority scoped to the selected revision and forked views remain independent of the source branch. | `AgentSdkConversationRuntime.test.ts`, `AgentSdkClient.test.ts`, `WindieCli.test.cjs`, `ChatSelectors.test.js`, `RendererAppRuntimeBoundary.test.ts`, `ChatBoxResponse.state.test.jsx`, `LiveTurnSurfaceState.test.js`, `SdkLiveTurnSurfaceController.test.cjs`, `ChatSurfaceController.test.jsx`, `DesktopStopTurnRuntime.test.js`, `IpcStopTargetRuntime.test.cjs`, `ChatBoxOverlayMouseIgnore.test.jsx`, `ChatInterfaceWiring.test.jsx`, `MessageListAssistantActions.test.jsx`, `ConversationReplayActions.test.jsx`, `ConversationReplayDatabaseIntegration.test.tsx`, `DesktopConversationContinuityService.test.ts`, `IpcMainReplayCommands.test.cjs`, `IpcDirectWakeUpAgentAdapter.test.cjs`, `SdkDisplayChatMessageProjection.test.ts`, `ConversationRuntimeProjectionStream.test.ts`, `DesktopConversationLibraryClient.test.ts`, `DesktopConversationStore.test.ts`, `IpcRendererWindows.test.cjs`, `IpcMainSdkRuntimeBoundary.test.cjs`, `tests/sidecar/test_chat_event_store.py`, `tests/sidecar/test_local_backend.py` |
| SDK `ConversationView` does not put materialized discrete tool-call/tool-output/tool-progress events in both `displayRows` and `liveTurn.entries`; display rows own the dashboard transcript row once materialized. | `AgentSdkConversationRuntime.test.ts` |
| Stop clears busy/thinking state for the correct conversation and turn, terminalizes the SDK/runtime projection locally before backend acknowledgement, and sends backend cancellation through Electron main's SDK bridge/direct wake-up adapter with transport snake_case translated to the SDK public camelCase stop API. | `PendingStopLiveSurfaceIntegration.test.jsx`, `DesktopStopTurnRuntime.test.js`, `IpcAgentSdkRuntimeCommands.test.cjs`, `IpcDirectWakeUpAgentAdapter.test.cjs`, `AgentSdkConversationRuntime.test.ts` |
| Tool-call rows pair with tool-output rows after replay. | `ToolCallMessageState.test.js`, `ToolOutputMessageState.test.ts`, `ConversationRuntimeProjectionStream.test.ts` |
| Opening dashboard during an active turn hides native overlay but preserves live content. | `ResponseOverlayVisibilityPolicy.test.cjs`, `ResponseOverlayPhaseHandler.test.cjs` |
| Screenshot/tool leases restore overlay click-through and visibility state. | `LocalRuntimeExecuteToolRuntime.test.cjs`, `SurfaceRuntime.test.cjs` |

## Adding A Bug

Every user-visible core-loop bug should add or extend an owner-correct test in
this pack. Start with the smallest replayable timeline:

```text
user_send_accepted
pending_turn_created
sdk_current_turn_idle
sdk_current_turn_awaiting
assistant_delta
streaming_complete
```

Then assert the visible projection never enters the invalid state the user saw.
Keep the test at the producing layer when possible:

- SDK projection invariant: add to SDK/conversation runtime tests.
- Renderer surface invariant: add to renderer projection or surface tests.
- Electron main overlay policy invariant: add to main-process surface or IPC
  tests.
- Tool/screenshot lease invariant: add to local-runtime execution or surface
  policy tests.

After adding the test, add its file to the `core-loop` preset in
`scripts/windie/commands.cjs` when it is not already covered, and update this
page's protected behavior table if the bug creates a new named invariant.

## Scope

This subset is for the desktop core-loop UI and live-turn path. Backend
provider, tool-history, or parser bugs should still become invariants, but
their tests belong in the backend or local-runtime test that owns the broken
behavior and, when product-visible, should be registered in the broader
[User-Facing Regression Pack](user_facing_regression_pack.md).
