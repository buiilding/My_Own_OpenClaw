---
summary: "Deep reference for shared chat loop UI state resolution: overlay-turn lifecycle projection, transport-disconnect recovery watchdog behavior, and dashboard/chatbox surface consumers."
read_when:
  - When changing `useChatLoopUiState`, `useOverlayTurnLifecycle`, `chatLoopUiState`, or stream-phase-to-UI mapping behavior.
  - When debugging stuck stop buttons, chatbox loop locks, or reconnect races after missing terminal events.
title: "Chat Loop UI State Disconnect Recovery and Surface Projection Reference"
---

# Chat Loop UI State Disconnect Recovery and Surface Projection Reference

## Canonical Modules

- `frontend/src/shared/overlay_turn_lifecycle_contract.json`
- `frontend/src/renderer/features/chat/utils/overlay/overlayTurnLifecycleContract.js`
- `frontend/src/renderer/features/chat/utils/state/overlayTurnLifecycleState.js`
- `frontend/src/renderer/features/chat/utils/state/chatLoopUiState.js`
- `frontend/src/renderer/features/chat/hooks/useChatLoopUiState.js`
- `frontend/src/renderer/features/chat/hooks/useOverlayTurnLifecycle.js`
- `frontend/src/renderer/features/chat/hooks/useCurrentTurnPresentationState.js`
- `frontend/src/renderer/features/chat/utils/state/streamPhaseState.js`
- `frontend/src/renderer/features/chat/utils/state/chatTurnPresentationState.js`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `tests/frontend/ChatLoopUiState.test.js`
- `tests/frontend/ChatLoopUiStateHook.test.jsx`
- `tests/frontend/OverlayTurnLifecycle.test.js`

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

## Base UI-State Contract (`chatLoopUiState.js`)

Public states:

- `idle`
- `awaiting-reply`
- `active-response`

`resolveChatLoopUiState(...)` input fields:

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

Helper predicates:

- `isChatLoopBusy(loopUiState)` (`idle` => false, others => true)
- `isChatLoopAwaitingReply(loopUiState)` (`awaiting-reply` only)

## Reducer Runtime (`useChatLoopUiState.js`)

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

- `ON_CHANNELS.IPC_STATUS` subscription updates
- startup invoke `INVOKE_CHANNELS.GET_CLIENT_USER_ID` (best-effort initial status sync)

It does not mutate stream tracking or backend query state; it is UI projection only.

`useOverlayTurnLifecycle(...)` composes that transport projection with the shared lifecycle resolver so current-turn presentation consumers no longer each reduce `phase + isSending` separately.

## Surface Consumers

`ChatInterface.jsx`:

- consumes `useCurrentTurnPresentationState(...)`
- uses `isBusy` as the stop-query affordance gate
- uses `showAssistantAwaitingDot` from the shared current-turn projection instead of component-local reply scanning

`ChatBox.jsx`:

- consumes `useCurrentTurnPresentationState(...)`
- treats `isBusy` as loop-interaction lock for pill controls/input/drag/actions

`ChatBoxResponse.jsx`:

- consumes `useCurrentTurnPresentationState(...)`, which layers current-turn assistant-reply detection on top of `useOverlayTurnLifecycle(...)` and `useChatLoopUiState(...)`
- uses the derived chatbox surface state:
  - `compact`
  - `awaiting-reply`
  - `response`

## Test-Backed Invariants

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
