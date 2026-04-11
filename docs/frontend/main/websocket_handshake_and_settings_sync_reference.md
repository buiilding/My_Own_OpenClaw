---
summary: "Electron main backend relay reference for websocket handshake, renderer fan-out, per-connection settings ACK gating, and query send-failure synthesis."
read_when:
  - When changing `ipc.cjs` websocket lifecycle, handshake identity handling, or reconnection behavior.
  - When debugging first-query settings drift, missing backend sends, or inconsistent renderer relay context fields.
title: "WebSocket Handshake and Settings Sync Reference"
---

# WebSocket Handshake and Settings Sync Reference

## Canonical Modules

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc/ipc_event_replay_state.cjs`
- `frontend/src/main/ipc/ipc_overlay_phase_events.cjs`
- `frontend/src/main/ipc/ipc_overlay_phase_contract.cjs`
- `frontend/src/main/ipc/ipc_renderer_windows.cjs`
- `frontend/src/main/ipc/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/ipc/ipc_transcript_session_sync.cjs`
- `frontend/src/main/ipc/ipc_settings_sync.cjs`
- `frontend/src/main/ipc/ipc_frontend_config.cjs`
- `frontend/src/main/backend_endpoints.cjs`
- `frontend/src/main/query_payload_builder.cjs`

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
  - packaged compatibility overrides:
    - `WINDIE_DEFAULT_PACKAGED_BACKEND_HTTP_URL`
    - `WINDIE_DEFAULT_PACKAGED_BACKEND_WS_URL`

Relay state keeps:

- `BACKEND_URL` (ws)
- `BACKEND_HTTP_URL` (http for artifact upload)
- `wsOrigin` for websocket constructor origin

`initializeIpc(win, options)` refreshes endpoints with:

- `refreshBackendEndpoints({ isPackaged: options.isPackaged === true })`

This means packaged-vs-dev fallback selection is determined at IPC bridge initialization time, not only process boot.

## Connection Lifecycle (`connect`)

Guard:

- skips new connection if existing socket is `OPEN` or `CONNECTING`

On open:

1. mark `isConnected=true`
2. reset first-query/settings-sync flags for this connection
3. reset overlay phase to `idle`
4. clear turn replay buffer
5. generate valid client `user_id`
6. send backend `handshake` message with the frontend-owned operating-system label (`macOS` / `Windows` / `Linux`)
7. broadcast `ipc-status` to renderer windows

On close:

1. mark disconnected
2. clear pending settings ACK waiters
3. clear backend session context (`session_id`, server `user_id`, `conversation_ref`)
4. set overlay phase `idle`
5. clear turn replay buffer
6. if the socket never opened and another candidate endpoint exists, promote the next candidate immediately
7. otherwise broadcast disconnected status
8. schedule reconnect after `BACKEND_RECONNECT_INTERVAL_MS` (`1000ms`) so backend restarts are detected quickly

## Identity and Session Context Tracking

`ipc.cjs` tracks multiple IDs:

- `currentUserId`: client-side user id sent in outbound messages
- `currentServerUserId`: server-echoed user id from inbound backend events
- `currentSessionId`: backend session id
- `currentConversationRef`: last seen backend conversation ref

Inbound backend messages update these fields opportunistically before renderer fan-out.

## Renderer Fan-Out Contract

All backend messages are broadcast via:

- `broadcastToRenderers('from-backend', data)`
- implementation owner: `ipc_renderer_windows.cjs`

Window-aware behavior:

- dead windows pruned from broadcaster set
- optional source window exclusion for synthetic local events

`trackRendererWindow(...)` also syncs latest overlay phase to windows after `did-finish-load`.
When replay state has buffered events for the active turn, it then replays those events on `from-backend` after phase sync.

Overlay transition contract:

- backend event -> overlay phase mapping and recovery metadata extraction live in `ipc_overlay_phase_events.cjs`
- shared phase/metadata normalization primitives live in `ipc_overlay_phase_contract.cjs`
- `ipc_runtime_helpers.processBackendMessageData(...)` applies that transition via `setResponseOverlayPhase(...)`

## Settings Sync ACK Pipeline

Core primitives (implemented in `ipc_settings_sync.cjs`, orchestrated by `ipc.cjs`):

- `sendSettingsUpdate(config, source)`
- `waitForSettingsAck(msgId, source)`
- `resolveSettingsSync(msgId, wasSuccessful)`
- `pendingSettingsSyncs` map with timeout

Rules:

- each outbound `update-settings` gets a message id and ACK promise
- ACK resolves true on backend `settings-updated` with same id
- ACK resolves false on backend `error` with same id
- timeout (`SETTINGS_SYNC_TIMEOUT_MS=2500`) resolves false

Connection reset always resolves and clears stale pending ACK promises.

## Initial Query Gate

Before `query` or `wakeword-detected` relay:

1. run `ensureInitialSettingsSync()`
2. load cached config from memory or disk (`frontend-config.json`) when needed
3. send initial `update-settings` and await ACK/timeout once per connection
4. if a settings sync promise is still in-flight, await it before sending query/wakeword

Purpose:

- reduce backend session config drift on first interactive action after reconnect.

## Outbound Message Normalization

`sendMessageToBackend(type, payload, messageId?)`:

- requires active websocket and non-empty `currentUserId`
- injects envelope fields: `id`, `type`, `payload`, `user_id`, `timestamp`

`normalizeBackendPayload(...)` strips unsupported/transient fields:

- removes `screenshot_url` for `query` and `tool-bundle-result`

## Query Send Failure Synthesis

If backend send fails for query path:

- overlay phase reset to `idle`
- replay state cleared for that turn
- synthetic error event built by `buildQuerySendFailure(...)`
- event includes query context ids + user-facing failure message
- broadcast to renderer on `from-backend`

This keeps renderer state consistent even when backend transport is unavailable.

## Synthetic Local User Message Path

Before successful backend query send, main emits synthetic:

- `type: local-user-message`
- includes `turn_ref`, session/user/conversation context, screenshot refs

Built via `buildLocalUserMessage(...)` and broadcast to other renderer windows (excluding sender when provided).

Broadcast plumbing is delegated to `ipc_query_broadcast.cjs`.

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

If renderer shows local user message but backend never responds:

1. confirm `sendMessageToBackend` returned null (transport down)
2. verify synthetic query-failure error was emitted
3. inspect websocket state transitions around reconnect

If user/session context is inconsistent across windows:

1. inspect inbound event updates to `currentSessionId/currentServerUserId/currentConversationRef`
2. verify synthetic event builders used expected context at emission time
3. verify renderer windows were registered with `registerRendererWindow`

For helper-module split ownership details, see [IPC Helper Module Split and Runtime Boundary Reference](ipc_helper_module_split_and_runtime_boundary_reference.md).
For replay/transcript channel details, see [IPC Event Replay and Transcript Session Sync Reference](ipc_event_replay_and_transcript_session_sync_reference.md).
For helper-level transcript/query payload normalization functions, see [IPC Query Runtime and Transcript Sync Helper Reference](ipc_query_runtime_and_transcript_sync_helper_reference.md).
