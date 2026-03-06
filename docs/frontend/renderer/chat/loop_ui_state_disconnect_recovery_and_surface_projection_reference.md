---
summary: "Deep reference for shared chat loop UI state resolution: phase/send/reply projection, transport-disconnect recovery watchdog behavior, and dashboard/chatbox surface consumers."
read_when:
  - When changing `useChatLoopUiState`, `chatLoopUiState`, or stream-phase-to-UI mapping behavior.
  - When debugging stuck stop buttons, chatbox loop locks, or reconnect races after missing terminal events.
title: "Chat Loop UI State Disconnect Recovery and Surface Projection Reference"
---

# Chat Loop UI State Disconnect Recovery and Surface Projection Reference

## Canonical Modules

- `frontend/src/renderer/features/chat/utils/state/chatLoopUiState.js`
- `frontend/src/renderer/features/chat/hooks/useChatLoopUiState.js`
- `frontend/src/renderer/features/chat/utils/state/streamPhaseState.js`
- `frontend/src/renderer/features/chat/utils/state/chatboxSurfaceState.js`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/components/ChatBox.jsx`
- `frontend/src/renderer/features/chat/components/ChatBoxResponse.jsx`
- `tests/frontend/ChatLoopUiState.test.js`
- `tests/frontend/ChatLoopUiStateHook.test.jsx`

## Base UI-State Contract (`chatLoopUiState.js`)

Public states:

- `idle`
- `awaiting-reply`
- `active-response`

`resolveChatLoopUiState(...)` input fields:

- `phase` (response-overlay phase vocabulary)
- `isSending` (local send latch)
- `hasVisibleReply`
- `transportConnected` (default `true`)

Resolution precedence:

1. transport disconnected => force `idle`
2. terminal phase (`complete`/`error`) => force `idle`
3. local send latch => `awaiting-reply`
4. awaiting-phase predicates (`awaiting-first-chunk`, overlay awaiting-reply phases) => `awaiting-reply`
5. `streaming` with no visible assistant reply => `awaiting-reply`
6. `streaming` with visible assistant reply => `active-response`
7. other active-loop phases (`tool-call`/`tool-output`) => `active-response`
8. otherwise => `idle`

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

## Surface Consumers

`ChatInterface.jsx`:

- uses `isBusy` as the stop-query affordance gate
- uses `isAwaitingReply` for the awaiting dot before first assistant content

`ChatBox.jsx`:

- treats `isBusy` as loop-interaction lock for pill controls/input/drag/actions

`ChatBoxResponse.jsx`:

- combines loop state with `hasVisibleResponse` via `chatboxSurfaceState`:
  - `compact`
  - `awaiting-reply`
  - `response`

## Test-Backed Invariants

`tests/frontend/ChatLoopUiState.test.js` validates:

- local send latch maps to `awaiting-reply`
- streaming with/without visible reply splits into `active-response` vs `awaiting-reply`
- terminal phases force `idle` even if send latch is stale
- disconnected transport forces `idle`

`tests/frontend/ChatLoopUiStateHook.test.jsx` validates:

- active-loop disconnect immediately drops to `idle`
- reconnect watchdog clears stale busy lock when no progress arrives
- watchdog disarms when post-reconnect stream progress arrives
- `tool-output` without visible assistant reply stays awaiting until streamed reply appears
- duplicate terminal snapshots after reconnect do not re-arm busy state

## Drift Hotspots

1. Changing phase predicates in `streamPhaseState` without updating `chatLoopUiState` can desync stop-button and overlay states.
2. Removing snapshot-signature progress detection can cause false watchdog idle resets during valid reconnect recovery.
3. Treating transport disconnection as non-terminal in UI projection can leave dashboard/chatbox permanently loop-locked after backend outages.

## Related Pages

- [Frontend Renderer Chat Docs Hub](README.md)
- [Chatbox Overlay Input, Drag, and Click-Through Reference](../overlays/chatbox_overlay_input_drag_and_clickthrough_reference.md)
- [Stream Event State Machine](../../runtime/stream_event_state_machine.md)
