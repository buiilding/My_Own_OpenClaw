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
- `frontend/src/main/ipc_query_events.cjs`
- `frontend/src/main/ipc_frontend_config.cjs`
- `frontend/src/main/backend_endpoints.cjs`
- `frontend/src/main/query_payload_builder.cjs`

## Backend Endpoint Resolution

`resolveBackendEndpoints()` determines relay targets:

- explicit `BACKEND_WS_URL` / `BACKEND_HTTP_URL` if valid
- otherwise derived counterpart URL from whichever explicit URL exists
- final fallback: `127.0.0.1:8765` (`ws://.../ws`, `http://...`)

Relay state keeps:

- `BACKEND_URL` (ws)
- `BACKEND_HTTP_URL` (http for artifact upload)
- `wsOrigin` for websocket constructor origin

## Connection Lifecycle (`connect`)

Guard:

- skips new connection if existing socket is `OPEN` or `CONNECTING`

On open:

1. mark `isConnected=true`
2. reset first-query/settings-sync flags for this connection
3. reset overlay phase to `idle`
4. generate valid client `user_id`
5. send backend `handshake` message
6. broadcast `ipc-status` to renderer windows

On close:

1. mark disconnected
2. clear pending settings ACK waiters
3. clear backend session context (`session_id`, server `user_id`, `conversation_ref`)
4. set overlay phase `idle`
5. broadcast disconnected status
6. schedule reconnect after `reconnectInterval` (5s)

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

Window-aware behavior:

- dead windows pruned from broadcaster set
- optional source window exclusion for synthetic local events

`trackRendererWindow(...)` also syncs latest overlay phase to windows after `did-finish-load`.

## Settings Sync ACK Pipeline

Core primitives:

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
- synthetic error event built by `buildQuerySendFailure(...)`
- event includes query context ids + user-facing failure message
- broadcast to renderer on `from-backend`

This keeps renderer state consistent even when backend transport is unavailable.

## Synthetic Local User Message Path

Before successful backend query send, main emits synthetic:

- `type: local-user-message`
- includes `turn_ref`, session/user/conversation context, screenshot refs

Built via `buildLocalUserMessage(...)` and broadcast to other renderer windows (excluding sender when provided).

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
