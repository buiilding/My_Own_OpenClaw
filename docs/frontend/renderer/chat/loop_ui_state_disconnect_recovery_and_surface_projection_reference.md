---
summary: "Deep reference for shared chat loop UI state resolution: overlay-turn lifecycle projection, transport-disconnect recovery watchdog behavior, and dashboard/minimal-pill surface consumers."
read_when:
  - When changing `useChatLoopUiState`, `desktopVisibleTurnLifecycleRuntime`, `desktopChatLoopUiRuntime`, or stream-phase-to-UI mapping behavior.
  - When debugging stuck stop buttons, minimal-pill loop locks, or reconnect races after missing terminal events.
title: "Chat Loop UI State Disconnect Recovery and Surface Projection Reference"
---

# Chat Loop UI State Disconnect Recovery and Surface Projection Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopVisibleTurnLifecycleRuntime.js`
- `frontend/src/renderer/app/runtime/desktopChatLoopUiRuntime.js`
- `frontend/src/renderer/features/chat/hooks/useChatLoopUiState.js`
- `frontend/src/renderer/features/chat/hooks/useChatSurfaceController.js`
- `frontend/src/renderer/app/runtime/desktopStreamPhaseRuntime.js`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime.js`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- `tests/frontend/DesktopVisibleTurnLifecycleRuntime.test.js`
- `tests/frontend/ChatLoopUiState.test.js`
- `tests/frontend/ChatLoopUiStateHook.test.jsx`

## Visible Turn Lifecycle Contract (`desktopVisibleTurnLifecycleRuntime.js`)

`DesktopVisibleTurnLifecycleRuntime.resolveVisibleTurnLifecycle(...)` owns the
renderer-visible handoff from local pending sends to SDK current-turn
projection. It combines:

- renderer `pendingTurn`
- SDK `currentTurnProjection`
- active conversation ref
- message rows used only for awaiting-anchor lookup

Output statuses:

- `local_pending`: renderer accepted the send, but SDK has not emitted an
  authoritative same-turn projection yet
- `awaiting`: SDK accepted the same turn but has not emitted visible content
- `active`: SDK emitted visible text, reasoning, tool/search progress, tool
  call, tool output, or visible error content
- `terminal`: SDK completed or errored the same turn
- `idle`: no visible active turn for the conversation

`DesktopVisibleTurnLifecycleRuntime.resolvePendingTurnForCurrentProjection(...)`
owns pending-turn handoff for store updates, while
`DesktopVisibleTurnLifecycleRuntime.shouldUseLocalSendPreflight(...)` owns
surface preflight suppression. Both use the same visible lifecycle authority so
SDK idle, wrong-turn terminal, stale, and visible-empty projections do not
replace `local_pending`.
Local send preflight requires a valid renderer `pendingTurn`; bare
`isSending=true` is store/diagnostic compatibility state and does not create
visible typing or busy lifecycle by itself.
`DesktopVisibleTurnLifecycleRuntime.applyVisibleTurnLifecycleToPresentationState(...)`
stamps only renderer-owned visible lifecycle, busy, awaiting, and chatbox
surface fields. It strips the retired `overlayTurnLifecycle` compatibility
field instead of adapting visible lifecycle back into overlay lifecycle names.

## Deleted Overlay Turn Lifecycle Contract

The older `overlay_turn_lifecycle_contract.json`,
`desktopOverlayTurnLifecycleRuntime.js`, and `OverlayTurnLifecycle.test.js`
surfaces were deleted after all production consumers moved to
`visibleTurnLifecycle.status`. Do not reintroduce overlay lifecycle names such
as `preflight` as desktop typing or busy state. Use
`DesktopVisibleTurnLifecycleRuntime.resolveVisibleTurnLifecycle(...)` for
local-pending, awaiting, active, terminal, and idle projection.

## Transport Recovery Runtime (`desktopChatLoopUiRuntime.js`)

`DesktopChatLoopUiRuntime` owns only the transport recovery machine used by
`useChatLoopTransportState(...)`. It does not decide typing, Stop, busy, or
chatbox response lifecycle; visible lifecycle output supplies the `isBusy`
snapshot input.

Reducer state fields:

- `transportConnected`
- `forceIdle`
- `recoveryWatchdogArmed`
- `pendingRecoveryFromDisconnect`
- `preDisconnectSnapshotSignature`
- `currentSnapshotSignature`

Reducer events:

- `SNAPSHOT`
- `IPC_STATUS`
- `RECOVERY_TIMEOUT`

Snapshot signature contract:

- signature is supplied by the visible lifecycle consumer
- used to detect post-reconnect progress vs stale repeated snapshots

### Disconnect/Reconnect Contract

On `IPC_STATUS` disconnect:

- transport marked disconnected
- loop state forced to `idle`
- recovery watchdog disarmed
- pending recovery flag set
- stores pre-disconnect snapshot signature

On reconnect while pending recovery:

- transport marked connected
- watchdog armed
- pending recovery cleared

On subsequent snapshot while watchdog armed:

- if snapshot signature changed from pre-disconnect signature, recovery is considered progressed and watchdog disarms
- if still busy and no observed progress, watchdog remains armed

On recovery timeout while watchdog armed:

- loop forced to `idle`
- watchdog disarmed
- pre-disconnect snapshot cleared

Default watchdog timeout is `3500ms` and is configurable through `recoveryWatchdogMs`.

## IPC Coupling

`useChatLoopUiState` reads transport connectivity from:

- `DesktopClientSessionRuntimeClient.onObservedIpcTransportConnection(...)`
  subscription updates
- `DesktopClientSessionRuntimeClient.loadObservedMainTransportConnection(...)`
  for best-effort initial status sync

The renderer client-session runtime client normalizes raw `ipc-status` and
startup snapshot payloads into observed boolean connection updates for this hook.
The client filters snapshots/events without a boolean connection field; the hook
owns only subscriptions, `DesktopChatLoopUiRuntime` snapshot event creation,
and the recovery watchdog timer. Disconnect/reconnect state transitions live in
`DesktopChatLoopUiRuntime.reduceChatLoopTransportMachineState(...)`; the raw
state constants, reducer events, and helper functions stay private behind that
renderer app-runtime facade.

It does not mutate stream tracking or backend query state; it is UI projection only.

The deleted `useCurrentTurnPresentationState(...)` shim no longer sits between
surface hooks and app runtime projection. `useChatSurfaceController(...)` and
`useResponseOverlayViewModel(...)` call
`DesktopCurrentTurnPresentationRuntime.resolveCurrentTurnPresentationState(...)`
directly for message/response data, then apply
`DesktopVisibleTurnLifecycleRuntime` for busy, awaiting, Stop, and typing
state.
`useResponseOverlayViewModel(...)` reads SDK presentation entries through
`DesktopCurrentTurnMessageRuntime.buildCurrentTurnMessagesFromPresentation(...)`
and uses `DesktopCurrentTurnPresentationRuntime` only for response-overlay
dismissal target projection. SDK overlay intent comes from the live-turn
presentation input before the visible lifecycle adapter stamps busy and typing
fields, so the response overlay no longer consumes the SDK presentation
lifecycle reducer.

`useChatSurfaceController(...)` resolves
`DesktopVisibleTurnLifecycleRuntime.resolveVisibleTurnLifecycle(...)` and uses
that projection for dashboard/pill busy state, stop affordance gating,
awaiting-dot visibility, and chatbox awaiting state. The controller builds the
message-only presentation snapshot from `DesktopCurrentTurnPresentationRuntime`
and passes the resolved lifecycle directly into presentation stamping; it no
longer calls an SDK presentation reducer, and the response overlay uses
`DesktopCurrentTurnPresentationRuntime.resolveSdkResponseOverlayPresentationState(...)`
only for SDK response-entry data plus overlay-intent metadata. Actual response
visibility requires a visible response entry; overlay intent alone is not a
response lifecycle authority.
The controller resolves the active lifecycle against the SDK current-turn
conversation ref when present, so a lagging session ref does not hide the
visible same-turn projection.

`DesktopLiveTurnSurfaceRuntime.resolveLiveTurnPresentationInput(...)` delegates
local send-preflight handoff to
`DesktopVisibleTurnLifecycleRuntime.shouldUseLocalSendPreflight(...)`. The live
surface still prepares overlay presentation input and SDK overlay intent
metadata, but phase, busy, awaiting, and response flags now come from
`DesktopVisibleTurnLifecycleRuntime.resolveVisibleTurnLifecycle(...)`. The
live-surface adapter exposes `isBusy` rather than a legacy `isSending` alias.
It recognizes SDK presentation rows from `presentation.entries` or an explicit
overlay intent object rather than legacy SDK visibility booleans; when overlay
intent is absent, fallback intent is derived from SDK phase and actual visible
content/progress evidence.
`selectLiveTurnSurfaceState(...)` likewise omits raw `isSending`, and minimal
surface trace payloads do not subscribe to the raw send latch separately.
It also omits store `thinkingStatus`; response overlay reasoning text follows
SDK `currentTurn.reasoningText`, while dashboard message-list compaction/manual
status text remains on the chat-interface selector path.
The decision to keep renderer-local pending typing through idle, hidden, stale,
terminal, or visible SDK projections lives with the visible lifecycle owner and
requires an accepted renderer `pendingTurn`.

Conversation replay actions now allocate a replay `turnRef` before SDK
continuity preparation, publish a renderer `pendingTurn` through
`DesktopConversationReplayRuntime.buildReplayPendingTurn(...)`, and forward the
same `turnRef` to `DesktopConversationContinuityService.prepareEditAndResend`
or `prepareRetryTurn`. That keeps edit/resend and retry in the same
`local_pending -> SDK handoff` path as normal sends; replay preparation latency
does not rely on bare `isSending` as a visible lifecycle authority.

`useResponseOverlayViewModel(...)` also resolves the same visible lifecycle and
applies `DesktopVisibleTurnLifecycleRuntime.applyVisibleTurnLifecycleToPresentationState(...)`
directly before deriving response-overlay view intent. The response overlay therefore
shows awaiting only for renderer local pending or SDK awaiting lifecycle, and
shows response only for visible SDK entries. Phase-only `streaming`,
`tool_call`, or `tool_output` projections with no visible text, tool event,
progress, error, or pending turn do not independently show typing. The
response-overlay view contract reads `visibleTurnLifecycle.status` directly
when suppressing stale previous responses during a new awaiting turn, so it no
longer imports the overlay lifecycle adapter.

## Surface Consumers

`ChatInterface.jsx`:

- consumes `useChatSurfaceController(...)`
- uses visible lifecycle `isBusy` as the stop-query affordance gate
- resolves Stop targets from active SDK phases or renderer `pendingTurn`; SDK
  `presentation.isBusy` is rendering data and does not create a Stop target
- accepts stopped SDK projections without preserving SDK `typingVisible` or
  `overlayVisible`; visible lifecycle derives terminal busy/typing state from
  phase and visible entries
- disables assistant feedback/retry actions from visible lifecycle busy/Stop
  state instead of raw `isSending`
- uses visible lifecycle awaiting anchor for `showAssistantAwaitingDot` instead
  of component-local reply scanning
- passes the visible lifecycle awaiting anchor directly to `MessageList`; live
  progress row shape remains rendering data and does not suppress lifecycle
  typing state

`ChatBox.jsx`:

- consumes `useChatSurfaceController(...)`
- treats visible lifecycle `isBusy` as loop-interaction lock for pill
  controls/input/drag/actions

`ChatBoxResponse.jsx`:

- consumes `useResponseOverlayViewModel(...)`, which adapts visible lifecycle
  plus current-turn presentation entries
- uses the derived chatbox surface state:
  - `compact`
  - `awaiting-reply`
  - `response`

## Test-Backed Invariants

`tests/frontend/DesktopVisibleTurnLifecycleRuntime.test.js` validates:

- local pending persists through SDK idle, visible-empty, stale, and wrong-turn
  projections
- same-turn SDK awaiting, visible progress/text, and terminal projections
  replace local pending
- shared presentation adapters map renderer visible lifecycle into legacy busy,
  awaiting-dot, chatbox, and response overlay presentation fields
- bare `isSending=true` does not create local preflight without `pendingTurn`
- the handoff predicate stays behind the visible lifecycle runtime facade

`tests/frontend/ChatSurfaceController.test.jsx` validates:

- controller busy/Stop state follows visible lifecycle instead of legacy
  presentation hook busy state
- local pending remains visible through SDK idle/visible-empty handoff
- visible lifecycle awaiting anchors drive dashboard and chatbox awaiting state

`tests/frontend/ChatLoopUiState.test.js` validates:

- chat loop transport recovery starts connected and not forced idle
- disconnect/reconnect arms the recovery watchdog
- changed snapshot signatures disarm recovery after reconnect progress
- stale snapshots keep the recovery watchdog armed until timeout

`tests/frontend/ChatLoopUiStateHook.test.jsx` validates:

- active-loop disconnect immediately forces transport idle
- startup snapshots and live events without a boolean connection field are ignored
- reconnect watchdog clears stale busy lock when no progress arrives
- watchdog disarms when post-reconnect stream progress arrives

## Drift Hotspots

1. Reintroducing overlay lifecycle names or `phase + isSending` reducers can split desktop typing state away from `DesktopVisibleTurnLifecycleRuntime`.
2. Removing snapshot-signature progress detection can cause false watchdog idle resets during valid reconnect recovery.
3. Treating transport disconnection as non-terminal in lifecycle projection can leave dashboard/chatbox permanently loop-locked after backend outages.

## Related Pages

- [Frontend Renderer Chat Docs Hub](README.md)
- [Chatbox Overlay Input, Drag, and Click-Through Reference](../overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Stream Event State Machine](../../runtime/stream_event_state_machine.md)
