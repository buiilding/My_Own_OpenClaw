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
| Renderer-local pending typing does not flash because of SDK idle, visible-empty, wrong-turn projections, or SDK presentation visibility flags before authoritative same-turn handoff. | `DesktopVisibleTurnLifecycleRuntime.test.js`, `DesktopCurrentTurnProjectionEffectsRuntime.test.ts`, `PendingTurnLiveSurfaceIntegration.test.js` |
| Live-surface awaiting/response flags follow visible lifecycle instead of SDK presentation flags or hidden overlay intent. | `LiveTurnSurfaceState.test.js`, `ChatBoxResponse.state.test.jsx` |
| Dashboard awaiting-dot routing follows renderer visible lifecycle instead of durable live-progress row shape or stale session refs. | `ChatInterfaceWiring.test.jsx`, `ChatSurfaceController.test.jsx` |
| Dashboard assistant feedback/retry actions follow visible lifecycle busy/Stop state instead of stale raw send latches. | `ChatInterfaceWiring.test.jsx` |
| Response overlay consumes renderer visible lifecycle instead of phase-only typing state. | `ChatBoxResponse.state.test.jsx`, `DesktopVisibleTurnLifecycleRuntime.test.js` |
| Chat-pill query screenshot metadata survives dashboard display load and later same-turn metadata replay. | `AgentConversationStoreApi.test.ts`, `AgentSdkConversationRuntime.test.ts`, `SdkDisplayChatMessageProjection.test.ts` |
| User-included images, camera screenshot requests, and mixed visual sends project through SDK-owned ordered `attachments[]`; repeated same-turn display rebuilds do not downgrade image-bearing rows to text-only, dashboard can show pending screenshot placeholders, compact surfaces can omit them, ready artifact descriptors replace volatile preview state without persisting preview bytes, and the renderer keeps the last visible image source during preview-to-artifact resolution without scheduling equivalent-source update loops. | `AgentSdkConversationRuntime.test.ts`, `SdkDisplayChatMessageProjection.test.ts`, `AttachmentDisplayComponents.test.jsx`, `DesktopConversationDisplayProjection.test.ts`, `ChatMessageSender.test.tsx`, `ChatStore.test.ts`, `ConversationRuntimeProjectionStream.test.ts`, `UseDashboardConversations.test.jsx`, `DesktopResolvedMessageScreenshotsRuntime.test.jsx` |
| Active and replayed tool-output screenshots render through typed SDK `attachments[]`, including old stored `screenshot_ref(s)` rows adapted by the SDK replay adapter, without renderer whole-message screenshot alias readers. | `AgentSdkConversationRuntime.test.ts`, `SdkDisplayChatMessageProjection.test.ts`, `MessageContent.test.jsx`, `RendererChatRuntimeBoundary.test.ts` |
| Retry/edit resend keeps the accepted child display revision visible if the later normal send fails, clearing only the pending turn and appending a send-failure row instead of rolling back to the parent transcript. | `ConversationReplayActions.test.jsx` |
| Dashboard recent-chat refreshes caused by edit/resend-style conversation events stay background-only after chats have rendered, keeping the existing list visible while metadata reloads. | `UseDashboardConversations.test.jsx`, `DashboardShell.test.jsx` |
| Empty SDK display-row projections remain conversation-scoped, SDK user display rows preserve turn refs, SDK source/CJS display timeline loads include same-revision replacement send rows, local-runtime display revisions can be authoritative with zero rows, stale parent checkpoints cannot reactivate over an edited child revision, `conversation state` exposes branch/display/model/raw-event diagnostics, and renderer edit/resend publishes the retained prefix plus edited pending turn as one replay frame, so editing the first user row clears the old visible suffix without a prefix-only flash or duplicate display-row/pending optimistic user row. | `AgentSdkConversationRuntime.test.ts`, `AgentSdkCjsConversationRuntime.test.cjs`, `IpcDirectWakeUpAgentAdapter.test.cjs`, `DesktopConversationRuntimeEventClient.test.ts`, `SdkDisplayChatMessageProjection.test.ts`, `DesktopConversationDisplayProjection.test.ts`, `ConversationReplayActions.test.jsx`, `WindieCli.test.cjs`, `tests/sidecar/test_chat_event_store.py` |
| Typing/awaiting state does not flash because of transient idle events. | `AgentSdkConversationRuntime.test.ts`, `ConversationRuntimeProjectionStream.test.ts`, `ResponseOverlayPhaseHandler.test.cjs` |
| Dashboard and pill render the same active turn projection. | `DesktopLiveTurnRuntimeClient.test.ts`, `IpcLiveTurnState.test.cjs`, `IpcConversationEventProjection.test.cjs` |
| Stop clears busy/thinking state for the correct conversation and turn. | `PendingStopLiveSurfaceIntegration.test.jsx`, `DesktopStopTurnRuntime.test.js` |
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
