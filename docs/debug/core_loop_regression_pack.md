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
| Typing/awaiting state does not flash because of transient idle events. | `AgentSdkConversationRuntime.test.ts`, `ConversationRuntimeProjectionStream.test.ts`, `LiveTurnSurfaceState.test.js`, `ChatSurfaceController.test.jsx`, `ResponseOverlayPhaseHandler.test.cjs` |
| Dashboard and pill render the same active turn projection. | `LiveTurnSurfaceState.test.js`, `ChatSurfaceController.test.jsx`, `DesktopLiveTurnRuntimeClient.test.ts`, `IpcLiveTurnState.test.cjs`, `IpcConversationEventProjection.test.cjs` |
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
