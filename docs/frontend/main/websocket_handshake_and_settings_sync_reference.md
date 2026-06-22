---
summary: "Electron main SDK websocket relay reference for handshake, typed renderer fan-out, per-connection settings ACK gating, and query send-failure synthesis."
read_when:
  - When changing `ipc.cjs` websocket lifecycle, `ipc_agent_connection_events.cjs` handshake identity handling, `ipc_agent_backend_close_runtime.cjs` close cleanup, or reconnection behavior.
  - When debugging first-query settings drift, missing backend sends, or inconsistent renderer relay context fields.
title: "WebSocket Handshake and Settings Sync Reference"
---

# WebSocket Handshake and Settings Sync Reference

## Canonical Modules

- SDK runtime: `packages/windie-sdk-js`
- Electron adapter: `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_agent_connection_events.cjs`
- `frontend/src/main/ipc/ipc_agent_backend_close_runtime.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc/ipc_event_replay_state.cjs`
- `frontend/src/main/ipc/ipc_overlay_phase_events.cjs`
- `frontend/src/main/ipc/ipc_overlay_phase_contract.cjs`
- `frontend/src/main/ipc/ipc_renderer_windows.cjs`
- `frontend/src/main/ipc/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/ipc/ipc_transcript_session_sync.cjs`
- `frontend/src/main/ipc/ipc_settings_sync.cjs`
- `frontend/src/main/ipc/ipc_settings_sync_runtime.cjs`
- `frontend/src/main/ipc/ipc_desktop_ui_config.cjs`
- `packages/windie-sdk-js/src/runtime/AgentClient.ts`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `frontend/src/main/app/backend_endpoints.cjs`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`

## Backend Endpoint Resolution

`resolveBackendEndpoints()` determines relay targets:

- explicit `BACKEND_WS_URL` / `BACKEND_HTTP_URL` if valid
- otherwise derived counterpart URL from whichever explicit URL exists
- final default candidates:
  - dev/source runs:
    - hosted only: `wss://api.windieos.com/ws`, `https://api.windieos.com`
  - packaged runs: hosted defaults only (`wss://api.windieos.com/ws`, `https://api.windieos.com`)
  - hosted default env overrides:
    - `WINDIE_DEFAULT_BACKEND_HTTP_URL`
    - `WINDIE_DEFAULT_BACKEND_WS_URL`

Relay state keeps:

- `BACKEND_URL` (ws)
- `BACKEND_HTTP_URL` (http for artifact upload)
- `wsOrigin` for websocket constructor origin

`initializeIpc(win, options)` refreshes endpoints with:

- `refreshBackendEndpoints({ isPackaged: options.isPackaged === true })`

This means packaged-vs-dev fallback selection is determined at IPC bridge initialization time, not only process boot.

## Ownership Direction

The SDK runtime is the canonical owner of backend websocket sessions. Electron main should use the SDK runtime for connect/reconnect, handshake, query, stop, settings, event parsing, event fan-out, and local tool-call routing. Electron-specific code remains responsible for windows, overlays, renderer IPC, settings UI, permission prompts, and platform display/screenshot integration.

## SDK Connection Lifecycle (`AgentClient.wakeUp(...)`)

The SDK runtime owns connection demand, connect waiters, reconnect timers, idle
disconnect timers, socket construction, handshake send, and backend message
envelope send helpers for query, wakeword, stop-query, settings, model listing,
and tool-result traffic.
Electron main provides callbacks for UI/session state and renderer fan-out.

Guard:

- skips new connection if existing socket is `OPEN` or `CONNECTING`
- resolves `ensureConnected(...)` waiters only after the handshake has been sent

Open event adaptation lives in the `createAgentConnectionEventsRuntime(...)`
instance from `ipc_agent_connection_events.cjs`. `ipc.cjs` injects the
main-process state setters, trace/log callbacks, endpoint state, and close
handler once when composing the IPC runtime, while the lower-level connection
event and fallback handlers stay private to that runtime helper. On open:

1. mark connected in `ipc_backend_connection_gate_state.cjs`
2. reset first-query/settings-sync flags for this connection
3. reset overlay phase to `idle`
4. clear turn replay buffer
5. generate valid client `user_id`
6. send backend `handshake` message with the host operating-system label (`macOS` / `Windows` / `Linux`)
7. broadcast `ipc-status` to renderer windows

Close cleanup lives in `ipc_agent_backend_close_runtime.cjs`. On close:

1. mark disconnected in `ipc_backend_connection_gate_state.cjs`
2. clear pending settings ACK waiters
3. clear backend session context (`session_id`, server `user_id`, `conversation_ref`)
4. set overlay phase `idle`
5. clear turn replay buffer
6. if the socket never opened and another candidate endpoint exists, promote the next candidate immediately
7. otherwise broadcast disconnected status
8. SDK runtime schedules reconnect after `BACKEND_RECONNECT_INTERVAL_MS` (`1000ms`) so backend restarts are detected quickly

## Identity and Session Context Tracking

`ipc.cjs` composes multiple identity/state owners:

- `currentUserId`: client-side user id sent in outbound messages
- `ipc_backend_session_state.cjs`: server-echoed user id, backend session id,
  and last seen backend conversation ref
- `ipc_backend_connection_gate_state.cjs`: backend transport connected flag and
  first-query gate

Inbound backend messages update backend session identity opportunistically
before typed renderer side-channel fan-out and SDK conversation projection
fan-out.

## Renderer Fan-Out Contract

Renderer-visible stream state is broadcast through typed channels:

- SDK conversation projections: `windie:conversation-event`,
  `windie:current-turn`, `windie:pending-turn`, and `windie:rows`
- backend settings/capability/audio side channels: `backend-settings-event`,
  `agent-capability-event`, and `audio-chunk`
- implementation owners: `ipc_renderer_windows.cjs`,
  `ipc_backend_event_channels.cjs`, and the SDK conversation-runtime listeners

Window-aware behavior:

- dead windows pruned from broadcaster set
- optional source window exclusion for synthetic local events

`trackRendererWindow(...)` also syncs latest overlay phase to windows after `did-finish-load`.
When replay state has buffered backend events for the active turn, it rebuilds
SDK conversation events and replays them on `windie:conversation-event` after
phase sync.

Overlay transition contract:

- backend event -> overlay phase mapping and recovery metadata extraction live
  behind `createOverlayPhaseEventRuntime(...)`
- shared phase/metadata normalization primitives live in `ipc_overlay_phase_contract.cjs`
- `ipc_runtime_helpers.processBackendMessageData(...)` applies that transition via `setResponseOverlayPhase(...)`

## SDK-Owned Local Tool Routing

Backend local execution events are handled by the SDK runtime before renderer fan-out:

1. The SDK `ConversationRuntime` receives a backend `tool-call` or `tool-bundle`.
2. `ToolExecutionCoordinator` executes the local call through the SDK local-runtime client.
3. The local runtime uses the local-runtime daemon-backed bridge.
4. The SDK runtime sends `tool-result` or `tool-bundle-result` back over the SDK websocket.
5. `ipc.cjs` receives only the renderer-safe copy for replay, session tracking,
   overlay state, typed side-channel fan-out, and SDK conversation projection.
6. the renderer receives a display-only SDK conversation event for chat state.

Display-only backend events retain normal chat/transcript/overlay behavior after
SDK projection. Their backend wire metadata includes:

- `metadata.skip_local_execution = true`
- `metadata.execution_owner = "sdk-runtime"`

The SDK converts that into display-safe projection fields such as
`executionSkipped`, keeping the UI informed while preventing local-runtime tool
execution for synthetic calls.

## Settings Sync ACK Pipeline

Core runtime methods and state are owned by `ipc_settings_sync_runtime.cjs`
and composed by `ipc.cjs`:

- `sendSettingsUpdate(config, source)`
- `resolveAck(msgId, wasSuccessful)`
- `reset()`
- pending settings ACK promise/map with timeout

Rules:

- each outbound `update-settings` gets a message id and ACK promise
- ACK resolves true on backend `settings-updated` with same id
- ACK resolves false on backend `error` with same id
- timeout (`SETTINGS_SYNC_TIMEOUT_MS=2500`) resolves false
- reset resolves and clears stale pending ACK promises with false

`ipc_settings_sync.cjs` only exposes `isValidConfigPayload(...)` as the shared
settings payload contract for main-process callers. The ACK wait/resolve/clear
primitives stay private to the composed settings-sync runtime.

## Initial Query Gate

Before `query` or `wakeword-detected` relay:

1. run `ensureInitialSettingsSync()`
2. load cached config from memory or disk (`frontend-config.json`) when needed
3. send initial `update-settings` and await ACK/timeout once per connection
4. if a settings sync promise is still in-flight, await it before sending query/wakeword

Purpose:

- reduce backend session config drift on first interactive action after reconnect.

## Outbound Message Normalization

SDK runtime backend send helpers:

- require an active websocket and non-empty `currentUserId`
- inject envelope fields: `id`, `type`, `payload`, `user_id`, `timestamp`
- expose named helpers for query, wakeword, stop-query, settings, list-models,
  and local tool-result traffic
- expose a typed `sendStopQueryToBackend(...)` adapter for VM/bootstrap stop
  controls instead of a generic backend-message escape hatch

Outbound websocket payload filtering is owned by the SDK managed agent session
through its default `filterBackendPayload(...)` normalizer. Electron main sends
direct main-process payloads such as settings sync through that SDK contract
import, while query sends shape backend payload fields through
`ipc_query_runtime.cjs` before entering the SDK command path.

## Query Send Failure Synthesis

If backend send fails for query path:

- overlay phase reset to `idle`
- replay state cleared for that turn
- synthetic error event built by the query-events runtime
- event includes query context ids + user-facing failure message
- broadcast to renderer through the SDK conversation-event channel

This keeps renderer state consistent even when backend transport is unavailable.

## SDK Local User Message Path

Before successful backend query send, SDK `ConversationRuntime.send(...)` emits
the local `turn_started` and `user_message` conversation events. Electron main
forwards those SDK events and snapshots to renderer windows; it does not build
or broadcast a duplicate optimistic local user event.

Query-send failure broadcast plumbing remains delegated to
`ipc_query_broadcast.cjs`.

## Transcript Session Sync Coupling

`ipc.cjs` delegates cross-window `transcript-session-sync` handling to `applyTranscriptSessionSync(...)` (`ipc_transcript_session_sync.cjs`):

- normalizes alias keys from renderer payloads
- updates tracked `currentConversationRef` / `currentUserId` where applicable
- rebroadcasts normalized shape to other renderer windows (sender excluded)

This contract keeps main-process query fallback identity and renderer transcript identity synchronized in multi-window sessions.

## Debug Checklist

If first query uses stale settings:

1. verify `ensureInitialSettingsSync()` path ran for that connection
2. verify outbound `update-settings` id appears in backend ACK/error
3. inspect settings timeout logs for unresolved ACK

If renderer shows the SDK local user message but backend never responds:

1. confirm the SDK runtime query send returned null (transport down)
2. verify synthetic query-failure error was emitted
3. inspect websocket state transitions around reconnect

If user/session context is inconsistent across windows:

1. inspect inbound event updates to `currentSessionId/currentServerUserId/currentConversationRef`
2. verify synthetic event builders used expected context at emission time
3. verify renderer windows were registered with `registerRendererWindow`

For helper-module split ownership details, see [IPC Helper Module Split and Runtime Boundary Reference](ipc_helper_module_split_and_runtime_boundary_reference.md).
For replay/transcript channel details, see [IPC Event Replay and Transcript Session Sync Reference](ipc_event_replay_and_transcript_session_sync_reference.md).
For helper-level transcript/query payload normalization functions, see [IPC Query Runtime and Transcript Sync Helper Reference](ipc_query_runtime_and_transcript_sync_helper_reference.md).
