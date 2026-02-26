---
summary: "Electron main query relay reference: renderer to-backend handling, initial settings ACK gating, system/memory context payload assembly, and local-user-message/failure event synthesis."
read_when:
  - When changing query transport from renderer to backend websocket.
  - When debugging first-query context assembly, settings-sync gate timing, or local-user-message/error event behavior.
title: "Query Payload and Relay Reference"
---

# Query Payload and Relay Reference

## Canonical Modules

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc_renderer_windows.cjs`
- `frontend/src/main/query_payload_builder.cjs`
- `frontend/src/main/ipc_query_events.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/backend_endpoints.cjs`

## Relay Entry: `ipcMain.on('to-backend', ...)`

Main receives renderer messages and branches by `type`.

Common input normalization:

- validates `type` is string
- shallow-copies object payload only
- drops malformed events early

Special handling paths:

- `update-settings`: delegated to settings ACK pipeline, no generic relay path
- `query` and `wakeword-detected`: pass through initial settings sync gate before backend send

## Initial Settings ACK Gate Before Query

For `query`/`wakeword-detected`, main calls `ensureInitialSettingsSync()`.

Gate behavior:

1. run once per websocket connection (`hasAttemptedInitialSettingsSync`)
2. ensure latest frontend config is available (memory cache or disk load fallback)
3. send `update-settings` with generated message `id`
4. wait for ACK or timeout (`SETTINGS_SYNC_TIMEOUT_MS=2500`)

ACK resolution map:

- backend `settings-updated` with same `id` -> success
- backend `error` with same `id` -> failure
- timeout -> failure

Goal:

- prevent first query from using stale backend session settings.

## Query-Specific Relay Pipeline

When `type === 'query'`, main performs extra steps before websocket send.

### 1) Overlay pre-capture hook

- optionally runs `onBeforeOverlayQueryCapture` callback for chatbox view

### 2) Conversation identity resolution

- resolves `conversation_ref` from payload or current backend conversation state
- injects resolved ref into payload if missing

### 3) Local optimistic user event

Main broadcasts synthetic `local-user-message` to renderer via `from-backend` channel:

- includes `turn_ref` (query message id)
- includes screenshot refs/urls when present
- includes session/user/conversation context fields
- uses `broadcastLocalUserMessage` in `ipc_query_broadcast.cjs` with shape builder from `ipc_query_events.cjs`

### 4) Context-enriched payload assembly

Main calls `buildQueryPayloadContent(...)` with:

- raw query text
- conversation ref
- user ID
- context type (`initial` for first query in connection, `sequential` afterward)
- local backend bridge methods (`getSystemState`, `searchMemory`)

Output injected into query payload:

- `content` (XML-enriched user message)
- optional `system_state_internal` (runtime-only state for backend normalization)

### 5) Backend send + failure fallback

- sends websocket message with stable message id
- on send failure, emits synthetic renderer error event via `buildQuerySendFailure(...)`

## Query Payload Builder Internals

`buildQueryPayloadContent(...)` composes:

1. `<system_context>` XML (initial vs sequential field sets)
2. episodic + semantic memory sections (or `None` placeholders)
3. `<user_query>` XML block

System-state field policy:

- initial: `active_window`, `mouse_position`, `screen_resolution`, `windows`
- sequential: `active_window`, `mouse_position`, `screen_resolution`

Runtime-only extraction:

- only `screen_resolution` currently exported into `runtimeSystemState`
- included as `system_state_internal` for backend runtime normalization, not user-facing prompt content

Failure behavior:

- system-state failure falls back to minimal `<active_window>Unknown</active_window>` context
- memory lookup failure logs and emits empty memory sections
- global builder exception returns fallback context + escaped user query

## Local Backend Bridge Dependencies

`local_backend_bridge.cjs` provides query-enrichment dependencies:

- `getSystemState(fields)` -> JSON-RPC `get_system_state`
- `searchMemory(query, user_id, limit, memory_type, exclude_conversation_id)` -> mapped JSON-RPC `search_memory`

Mapping details for memory search payload are centralized in:

- `local_backend_bridge_rpc_mappers.cjs` (`mapSearchMemoryPayload`)

## Connection Context and Overlay State

Main enriches backend and local events with tracked runtime context:

- `currentUserId` (client handshake identity)
- `currentServerUserId` (server echo identity)
- `currentSessionId`
- `currentConversationRef`

Overlay phase updates during relay/stream lifecycle:

- query send -> `awaiting-first-chunk`
- `streaming-response` -> `streaming`
- `tool-call`/`tool-bundle` -> `tool-call`
- `tool-output` -> `awaiting-first-chunk`
- `streaming-complete` -> `complete`
- error during active stream -> `error`

## Debug Checklist

If first query lacks expected settings:

1. verify `ensureInitialSettingsSync()` ran before query send
2. verify `update-settings` ACK map resolved by message `id`
3. inspect timeout logs for settings sync gate

If query content misses memory/system context:

1. verify `buildQueryPayloadContent(...)` executes without fallback exception
2. inspect local backend bridge readiness (`Local backend not ready` errors)
3. verify memory search payload mapping includes expected conversation exclusion key

If renderer shows user message but backend never streams:

1. confirm local synthetic `local-user-message` occurred (optimistic path)
2. verify websocket send returned message id
3. inspect synthetic `buildQuerySendFailure` error event path for failed send

For module ownership details of query/local synthetic event broadcasters and renderer-window fan-out, see [IPC Helper Module Split and Runtime Boundary Reference](ipc_helper_module_split_and_runtime_boundary_reference.md).
