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
- `frontend/src/renderer/app/runtime/desktopChatSurfaceRuntime.js`
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
renderer-visible handoff from local pending sends to the selected SDK live-turn
fallback. It combines:

- renderer `pendingTurn`
- SDK live-turn fallback (`sdkLiveTurn`)
- active conversation ref
- awaiting anchors from SDK projection or renderer `pendingTurn.userMessageId`

Output statuses:

- `local_pending`: renderer accepted the send, but SDK has not emitted an
  authoritative same-turn projection yet
- `awaiting`: SDK accepted the same turn but has not emitted visible content
- `active`: SDK emitted visible text, reasoning, tool/search progress, tool
  call, tool output, or visible error content
- `terminal`: SDK completed or errored the same turn
- `idle`: no visible active turn for the conversation

`DesktopVisibleTurnLifecycleRuntime.resolvePendingTurnForSdkLiveTurn(...)`
owns pending-turn handoff for store updates, while
`DesktopVisibleTurnLifecycleRuntime.resolveVisibleTurnLifecycle(...)` owns the
surface local-pending status consumed by dashboard, pill, and overlay surfaces.
Both use the same visible lifecycle authority so SDK idle, wrong-turn terminal,
stale, and visible-empty live-turn fallbacks do not replace `local_pending`.
Local pending rendering requires a valid renderer `pendingTurn`; bare
`isSending=true` is store/diagnostic compatibility state and does not create
visible typing or busy lifecycle by itself.
`DesktopVisibleTurnLifecycleRuntime.applyVisibleTurnLifecycleToPresentationState(...)`
stamps only renderer-owned visible lifecycle, busy, awaiting, and chatbox
surface fields. It no longer preserves a compatibility scrubber for retired
overlay lifecycle payloads; the renderer contract is that those fields are not
produced.

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
and watchdog callback dispatch. Disconnect/reconnect state transitions live in
`DesktopChatLoopUiRuntime.reduceChatLoopTransportMachineState(...)`, while
recovery watchdog timeout scheduling/cleanup lives in
`DesktopChatLoopUiRuntime.scheduleChatLoopRecoveryWatchdog(...)`. The raw state
constants, reducer events, browser timer adapter, and helper functions stay
private behind that renderer app-runtime facade.

It does not mutate stream tracking or backend query state; it is UI projection only.

The deleted `useCurrentTurnPresentationState(...)` shim no longer sits between
surface hooks and app runtime projection. `useChatSurfaceController(...)` and
`useResponseOverlayViewModel(...)` call
`DesktopCurrentTurnPresentationRuntime.resolveCurrentTurnPresentationState(...)`
directly for message/response data, then apply
`DesktopVisibleTurnLifecycleRuntime` for busy, awaiting, Stop, and typing
state.
`useResponseOverlayViewModel(...)` reads SDK live-turn rows through
`DesktopCurrentTurnMessageRuntime.buildSdkLiveTurnMessages(...)`
and uses `DesktopCurrentTurnPresentationRuntime` only for response-overlay
dismissal target projection. SDK overlay intent comes from the live-turn
presentation input before the visible lifecycle adapter stamps busy and typing
fields, so the response overlay no longer consumes the SDK presentation
lifecycle reducer.

`useChatSurfaceController(...)` delegates surface authority to
`DesktopChatSurfaceRuntime.buildChatSurfaceControllerState(...)`, which
composes `DesktopVisibleTurnLifecycleRuntime`,
`DesktopLiveTurnSurfaceRuntime`, and
`DesktopCurrentTurnPresentationRuntime`. That app-runtime helper reads
`ConversationView.surfaces`, `ConversationView.liveTurn.canStop`, SDK
live-turn fallback (`sdkLiveTurn` in selected surface state), and the renderer
pending bridge, then returns
dashboard/pill busy state, stop affordance gating, awaiting-dot visibility, and
chatbox awaiting state. The React hook owns config toggles and manual
compaction callbacks only; it should not branch over SDK view/current-turn
authorities directly. The response overlay uses
`DesktopCurrentTurnPresentationRuntime.resolveSdkResponseOverlayPresentationState(...)`
only for explicit SDK response-entry data plus overlay-intent metadata instead
of merging a fallback presentation snapshot. Actual response visibility
requires a visible response entry; overlay intent alone is not a response
lifecycle authority.
The controller resolves the active lifecycle against the SDK current-turn
conversation ref when present, so a lagging session ref does not hide the
visible same-turn projection.

`DesktopLiveTurnSurfaceRuntime.resolveLiveTurnPresentationInput(...)` delegates
local pending-turn handoff to the already-resolved
`DesktopVisibleTurnLifecycleRuntime.resolveVisibleTurnLifecycle(...)` status.
When a same-turn SDK `ConversationView` live turn exists, the visible lifecycle
and live-surface input use `ConversationView.liveTurn` plus
`ConversationView.surfaces.responseOverlay` before raw current-turn projection.
An unrelated renderer-local pending turn still owns the immediate pending
bridge. The live surface still prepares overlay presentation input and SDK
overlay intent metadata, but phase, busy, awaiting, and response flags now come
from that visible lifecycle projection. The
live-surface adapter exposes `isBusy` rather than a legacy `isSending` alias,
and no longer returns a separate `showAwaiting` typing alias; typing state
stays on `visibleTurnLifecycle.showTyping`. It also omits the duplicate
`showResponse` alias; response overlay visibility is resolved by the
response-overlay view intent after entries and dismissal state are applied.
It recognizes SDK presentation rows from non-empty `presentation.entries`
rather than legacy SDK visibility booleans or overlay intent mode. Overlay
intent remains guard/window metadata; its mode is derived from SDK phase and
actual entries, text, error, or tool-progress evidence instead of copied as
lifecycle authority. SDK `presentation.hasVisibleContent` is also not lifecycle
evidence by itself.
`selectLiveTurnSurfaceState(...)` likewise omits raw `isSending`, and minimal
surface trace payloads name the renderer-local path `useLocalPendingTurn`
instead of a send-latch alias.
It also omits store `thinkingStatus`; response overlay reasoning text follows
SDK `currentTurn.reasoningText`, while dashboard message-list compaction/manual
status text remains on the chat-interface selector path.
It suppresses raw workspace `messages[]` when a `ConversationView` exists, so
shared live surfaces do not derive lifecycle or overlay state from stale
renderer rows. The only exception is the accepted renderer `pendingTurn`
bridge, which keeps its pending user row available until SDK view handoff.
`DesktopChatSurfaceRuntime.buildChatSurfaceControllerState(...)` also enforces
the same empty renderer-message fallback internally, so callers that bypass the
selector cannot reintroduce stale message-derived response state beside an SDK
view.
The decision to keep renderer-local pending typing through idle, hidden, stale,
terminal, or visible SDK projections lives with the visible lifecycle owner and
requires an accepted renderer `pendingTurn`.

Conversation replay actions now pass only edit/retry intent to
`DesktopConversationReplayRuntime`, which delegates to SDK edit/resend and
retry commands. The renderer does not load display timelines, replace display
prefix rows, publish replay pending turns, or send a separate replacement
query. SDK commands own target-row resolution, child display/model revisions,
supersession, replacement rows, and attachment/resource preservation.

`useResponseOverlayViewModel(...)` also resolves the same visible lifecycle,
passes `ConversationView` into the live-surface runtime, and applies
`DesktopVisibleTurnLifecycleRuntime.applyVisibleTurnLifecycleToPresentationState(...)`
directly before deriving response-overlay view intent. The response overlay
therefore shows awaiting only for renderer local pending or SDK awaiting
lifecycle, and shows response only for visible SDK entries. Phase-only `streaming`,
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
- accepts stopped SDK projections without preserving SDK `typingVisible`,
  `overlayVisible`, or `hasVisibleContent`; visible lifecycle derives terminal
  busy/typing state from phase and visible entries
- disables assistant feedback/retry actions from visible lifecycle busy/Stop
  state instead of raw `isSending`
- uses visible lifecycle awaiting anchor for `awaitingDotTargetMessageId`
  instead of component-local reply scanning or raw message fallback
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
- SDK presentation visibility flags do not replace local pending unless actual
  entries, text, error, or tool-progress evidence is present
- shared presentation adapters map renderer visible lifecycle into busy,
  awaiting-dot, chatbox, and response overlay presentation fields
- bare `isSending=true` does not create local pending without `pendingTurn`
- live surfaces read local pending from visible lifecycle status instead of a
  second handoff predicate

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
- recovery watchdog scheduling uses the app-runtime browser timer adapter and
  cleans up through the returned cleanup callback

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
