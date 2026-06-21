---
summary: "Deep reference for shared chat loop UI state resolution: overlay-turn lifecycle projection, transport-disconnect recovery watchdog behavior, and dashboard/minimal-pill surface consumers."
read_when:
  - When changing `useChatLoopUiState`, `desktopOverlayTurnLifecycleRuntime`, `desktopChatLoopUiRuntime`, or stream-phase-to-UI mapping behavior.
  - When debugging stuck stop buttons, minimal-pill loop locks, or reconnect races after missing terminal events.
title: "Chat Loop UI State Disconnect Recovery and Surface Projection Reference"
---

# Chat Loop UI State Disconnect Recovery and Surface Projection Reference

## Canonical Modules

- `frontend/src/shared/overlay_turn_lifecycle_contract.json`
- `frontend/src/renderer/app/runtime/desktopVisibleTurnLifecycleRuntime.js`
- `frontend/src/renderer/app/runtime/desktopOverlayTurnLifecycleRuntime.js`
- `frontend/src/renderer/app/runtime/desktopChatLoopUiRuntime.js`
- `frontend/src/renderer/features/chat/hooks/useChatLoopUiState.js`
- `frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js`
- `frontend/src/renderer/app/runtime/desktopStreamPhaseRuntime.js`
- `frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime.js`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- `tests/frontend/DesktopVisibleTurnLifecycleRuntime.test.js`
- `tests/frontend/ChatLoopUiState.test.js`
- `tests/frontend/ChatLoopUiStateHook.test.jsx`
- `tests/frontend/OverlayTurnLifecycle.test.js`

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

`DesktopVisibleTurnLifecycleRuntime.hasAuthoritativeSameTurnSdkReplacement(...)`
is the shared handoff predicate for clearing renderer pending turns and
suppressing local send preflight. SDK idle, wrong-turn terminal, stale, and
visible-empty projections must not replace `local_pending`.

## Overlay Turn Lifecycle Contract

Shared lifecycle source of truth:

- `frontend/src/shared/overlay_turn_lifecycle_contract.json`

Public lifecycle states:

- `idle`
- `preflight`
- `awaiting`
- `active`
- `terminal`

`resolveOverlayTurnLifecycle(...)` input fields:

- `phase` (response-overlay phase vocabulary)
- `isSending` (renderer-local send/preflight latch)
- `hasVisibleReply`
- `transportConnected` (default `true`)

Resolution precedence:

1. transport disconnected => `idle`
2. terminal phase (`complete`/`error`) with a newly staged local send and no visible reply => `preflight`
3. terminal phase without a staged local send => `terminal`
4. `awaiting-first-chunk` => `awaiting`
5. `streaming` / `tool-call` / `tool-output` => `active`
6. local send latch before main-phase advancement => `preflight`
7. otherwise => `idle`

Busy lifecycle states:

- `preflight`
- `awaiting`
- `active`

Awaiting lifecycle states:

- `preflight`
- `awaiting`

## Base UI-State Contract (`desktopChatLoopUiRuntime.js`)

Public states:

- `idle`
- `awaiting-reply`
- `active-response`

`DesktopChatLoopUiRuntime.resolveChatLoopUiState(...)` input fields:

- `lifecycle` (`idle | preflight | awaiting | active | terminal`)
- `phase` (response-overlay phase vocabulary; retained only for tool-phase surface intent)
- `hasVisibleReply`

Resolution precedence:

1. `idle` / `terminal` lifecycle => `idle`
2. `preflight` / `awaiting` lifecycle => `awaiting-reply`
3. `active` lifecycle during tool-awaiting phases (`tool-call` / `tool-output`) => `awaiting-reply`
4. other `active` lifecycle with no visible assistant reply => `awaiting-reply`
5. other `active` lifecycle with visible assistant reply => `active-response`
6. otherwise => `idle`

Tool-awaiting phase checks are owned by
`DesktopStreamPhaseRuntime.isOverlayAwaitingReplyPhase(...)`; the stream-phase
predicate helper and awaiting phase set stay private behind that renderer
app-runtime facade.

Helper predicates:

- `DesktopChatLoopUiRuntime.isChatLoopBusy(loopUiState)` (`idle` => false, others => true)
- `DesktopChatLoopUiRuntime.isChatLoopAwaitingReply(loopUiState)` (`awaiting-reply` only)

## Reducer Runtime (`desktopChatLoopUiRuntime.js`)

Reducer state fields:

- `loopUiState`
- `transportConnected`
- `recoveryWatchdogArmed`
- `pendingRecoveryFromDisconnect`
- `preDisconnectSnapshotSignature`
- `currentSnapshotSignature`

Reducer events:

- `SNAPSHOT`
- `IPC_STATUS`
- `RECOVERY_TIMEOUT`

Snapshot signature contract:

- signature format: `<phase>|<isSendingBit>|<hasVisibleReplyBit>`
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

`useCurrentTurnPresentationState(...)` now only adapts visible assistant
message rows into the legacy current-turn presentation shape. It does not
compose transport recovery or `phase + isSending` lifecycle mapping; those
decisions belong to `useChatSurfaceController(...)` and
`DesktopVisibleTurnLifecycleRuntime`.
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
awaiting-dot visibility, and chatbox awaiting state. The older
`useCurrentTurnPresentationState(...)` result remains an adapter for legacy
presentation fields while visible lifecycle owns the typing decision; the
controller no longer calls an SDK presentation reducer, and the response
overlay uses
`DesktopCurrentTurnPresentationRuntime.resolveSdkResponseOverlayPresentationState(...)`
only for SDK response-entry and overlay-intent data.
The controller resolves the active lifecycle against the SDK current-turn
conversation ref when present, so a lagging session ref does not hide the
visible same-turn projection.

`DesktopLiveTurnSurfaceRuntime.resolveLiveTurnPresentationInput(...)` delegates
local send-preflight handoff to
`DesktopVisibleTurnLifecycleRuntime.shouldUseLocalSendPreflight(...)`. The live
surface still prepares overlay presentation input and SDK overlay intent
metadata, but phase, busy, awaiting, and response flags now come from
`DesktopVisibleTurnLifecycleRuntime.resolveVisibleTurnLifecycle(...)`. The
decision to keep a renderer-local send latch through idle, hidden, stale,
terminal, or visible SDK projections lives with the visible lifecycle owner.

`useResponseOverlayViewModel(...)` also resolves the same visible lifecycle and
applies `DesktopVisibleTurnLifecycleRuntime.applyVisibleTurnLifecycleToPresentationState(...)`
before deriving response-overlay view intent. The response overlay therefore
shows awaiting only for renderer local pending or SDK awaiting lifecycle, and
shows response only for visible SDK entries. Phase-only `streaming`,
`tool_call`, or `tool_output` projections with no visible text, tool event,
progress, error, or pending turn do not independently show typing. The
visible-lifecycle adapter also stamps the legacy `overlayTurnLifecycle` field
for response-overlay view code, so stale phase-derived lifecycle values do not
survive adaptation.

## Surface Consumers

`ChatInterface.jsx`:

- consumes `useChatSurfaceController(...)`
- uses visible lifecycle `isBusy` as the stop-query affordance gate
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
- the handoff predicate stays behind the visible lifecycle runtime facade

`tests/frontend/ChatSurfaceController.test.jsx` validates:

- controller busy/Stop state follows visible lifecycle instead of legacy
  presentation hook busy state
- local pending remains visible through SDK idle/visible-empty handoff
- visible lifecycle awaiting anchors drive dashboard and chatbox awaiting state

`tests/frontend/ChatLoopUiState.test.js` validates:

- lifecycle-to-loop-ui mapping (`preflight/awaiting/active/terminal`)
- visible-reply split inside the `active` lifecycle
- terminal and idle lifecycles stay non-busy

`tests/frontend/OverlayTurnLifecycle.test.js` validates:

- local send latch maps to `preflight`
- main awaiting phase maps to `awaiting`
- active backend phases map to `active`
- terminal phase + newly staged send stays `preflight`
- disconnected transport forces `idle`

`tests/frontend/ChatLoopUiStateHook.test.jsx` validates:

- active-loop disconnect immediately drops to `idle`
- startup snapshots and live events without a boolean connection field are ignored
- reconnect watchdog clears stale busy lock when no progress arrives
- watchdog disarms when post-reconnect stream progress arrives
- `tool-output` without visible assistant reply stays awaiting until streamed reply appears
- duplicate terminal snapshots after reconnect do not re-arm busy state

## Drift Hotspots

1. Changing phase groups in `overlay_turn_lifecycle_contract.json` without updating the renderer lifecycle resolver can desync preflight/awaiting/active transitions.
2. Removing snapshot-signature progress detection can cause false watchdog idle resets during valid reconnect recovery.
3. Treating transport disconnection as non-terminal in lifecycle projection can leave dashboard/chatbox permanently loop-locked after backend outages.

## Related Pages

- [Frontend Renderer Chat Docs Hub](README.md)
- [Chatbox Overlay Input, Drag, and Click-Through Reference](../overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Stream Event State Machine](../../runtime/stream_event_state_machine.md)
