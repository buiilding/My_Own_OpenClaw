---
summary: "Electron main query relay reference: renderer to-backend handling, initial settings ACK gating, system/memory context payload assembly, and local-user-message/failure event synthesis."
read_when:
  - When changing query transport from renderer to backend websocket, including helper payload shaping in `ipc_query_runtime.cjs`.
  - When debugging first-query context assembly, settings-sync gate timing, or local-user-message/error event behavior.
title: "Query Payload and Relay Reference"
---

# Query Payload and Relay Reference

## Canonical Modules

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/ipc/ipc_query_send_runtime.cjs`
- `frontend/src/main/ipc/ipc_transcript_session_sync.cjs`
- `frontend/src/main/ipc/ipc_event_replay_state.cjs`
- `frontend/src/main/ipc/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc/ipc_renderer_windows.cjs`
- `frontend/src/main/query_payload_builder.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/backend_endpoints.cjs`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`

## Relay Entry: `ipcMain.on('to-backend', ...)`

Main receives renderer messages and branches by `type`.

Common input normalization:

- validates `type` is string
- shallow-copies object payload only
- drops malformed events early

Endpoint context for relay calls:

- websocket send target and origin come from `resolveBackendEndpoints(...)` state in `ipc.cjs`
- `initializeIpc(..., { isPackaged })` refreshes endpoint resolution at startup to select dev or packaged fallback policy
- `get-client-user-id` snapshot includes resolved `backendWsUrl` and `backendHttpUrl` values for renderer diagnostics

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

- delegated to `prepareRendererQueryPayload(...)` in `ipc_query_runtime.cjs`:
  - resolves `conversation_ref` from payload or current backend conversation state
  - injects resolved ref into payload when missing
  - strips relay-only fields (`attachment_context`, `memory_retrieval_enabled`) from outbound payload
  - normalizes `attachment_filenames` for local optimistic message metadata

### 3) Local optimistic user event

Main broadcasts synthetic `local-user-message` to renderer via `from-backend` channel:

- includes `turn_ref` (query message id)
- includes screenshot refs/urls when present
- when renderer only provides `screenshot_ref`, main derives `screenshot_url` from the preferred artifact HTTP base:
  - prefer loopback/local artifact base only when an explicit loopback backend candidate exists
  - otherwise use the active backend HTTP URL
- includes `attachment_filenames` when renderer supplied picker/clipboard attachment names
- includes session/user/conversation context fields
- uses `broadcastLocalUserMessage` in `ipc_query_broadcast.cjs` with shape builder from `ipc_query_events.cjs`

Replay tie-in:

- query path seeds `ipcEventReplayState.startTurn(queryMessageId, localUserMessage)` so late-mounted renderer windows can rehydrate the in-flight turn.

### 4) Context-enriched payload assembly

Main delegates to `buildQueryPayload(...)` (`ipc_query_runtime.cjs`), which calls `buildQueryPayloadContent(...)` with:

- raw query text
- conversation ref
- user ID
- context type (`initial` for first query in connection, `sequential` afterward)
- retrieval-injection toggle (`memory_retrieval_enabled`, default `true`) sourced from renderer local preference
- optional hidden `attachment_context` generated from sender-side `read_file` calls for selected non-image files
- local backend bridge methods (`getSystemState`, `searchMemory`)

Output from `buildQueryPayload(...)`:

- normalized payload containing `content` (XML-enriched user message)
- optional `system_state_internal` (runtime-only state for backend normalization)
- resolved `userId` used by automated query return path

### 5) Backend send + failure fallback

- sends websocket message with stable message id
- on send failure, emits synthetic renderer error event via `buildQuerySendFailure(...)`
- on send failure, clears replay buffer so stale optimistic events are not replayed after reconnect

## Query Payload Builder Internals

`buildQueryPayloadContent(...)` composes:

1. optional episodic + semantic memory sections (or `None` placeholders) when retrieval injection is enabled
2. optional `<attached_file_context>` section (hidden non-image file context from renderer-side `read_file`)
3. `<user_query>` XML block

Memory section formatting contract (`query_payload_builder.cjs`):

- `searchMemory(query, user_id, limit=6, memory_type=null, exclude_conversation_id=conversationRef, retrievalOptions)` is called when retrieval injection is enabled.
- prompt injection requests a balanced retrieval budget:
  - `episodic_limit=4`
  - `semantic_limit=2`
  - `semantic_min_score=0.20`
- sidecar search path applies: store search -> active-conversation exclusion -> episodic/semantic grouping.
- episodic grouping prefers pre-paired interaction rows (`User + Assistant`), then transcript synthesis fallback, then raw episodic fallback text.
- each section is always emitted when retrieval injection is enabled:
  - `<episodic_memory>...</episodic_memory>`
  - `<semantic_memory>...</semantic_memory>`
- empty or missing lists render as:
  - `<tag>\nNone\n</tag>`
- non-empty lists render as `- <entry>` bullet lines with XML escaping (`&`, `<`, `>`, `"`, `'`).
- active conversation exclusion is requested at search time via `exclude_conversation_id` to avoid echoing current-turn transcript context.

System-state field policy:

- initial: `active_window`, `mouse_position`, `screen_resolution`, `windows`
- sequential: `active_window`, `mouse_position`, `screen_resolution`

Runtime-only extraction:

- only `screen_resolution` currently exported into `runtimeSystemState`
- active window / mouse position are no longer serialized into model-facing query `content`
- included as `system_state_internal` for backend runtime normalization, not user-facing prompt content

Failure behavior:

- system-state failure falls back to minimal `<active_window>Unknown</active_window>` context
- memory lookup failure logs and emits empty memory sections
- retrieval injection disabled skips memory lookup entirely and omits both memory XML sections
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

Transcript session sync bridge:

- renderer transcript subsystem emits `transcript-session-sync` on conversation/user updates
- main delegates normalization/state-advance to `applyTranscriptSessionSync(...)` (`ipc_transcript_session_sync.cjs`) using aliases (`conversationRef|conversation_ref|sessionId|session_id`, `userId|user_id`)
- normalized sync envelope is rebroadcast to other windows
- this keeps query fallback conversation context and transcript writer session state aligned across multi-window sessions

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

1. verify `buildQueryPayload(...)` path executes without fallback exception from `buildQueryPayloadContent(...)`
2. inspect local backend bridge readiness (`Local backend not ready` errors)
3. verify memory search payload mapping includes expected conversation exclusion key
4. verify sidecar episodic grouping/pairing behavior from `memory.operations` when retrieval text is unexpectedly user-only

If renderer shows user message but backend never streams:

1. confirm local synthetic `local-user-message` occurred (optimistic path)
2. verify websocket send returned message id
3. inspect synthetic `buildQuerySendFailure` error event path for failed send

For module ownership details of query/local synthetic event broadcasters and renderer-window fan-out, see [IPC Helper Module Split and Runtime Boundary Reference](ipc_helper_module_split_and_runtime_boundary_reference.md).
For replay and transcript session-sync normalization details, see [IPC Event Replay and Transcript Session Sync Reference](ipc_event_replay_and_transcript_session_sync_reference.md).
For helper-level contracts (`prepareRendererQueryPayload`, `buildQueryPayload`, `prepareAutomatedQueryPayload`, `applyTranscriptSessionSync`), see [IPC Query Runtime and Transcript Sync Helper Reference](ipc_query_runtime_and_transcript_sync_helper_reference.md).
For the extracted renderer query-send orchestration helper, see `frontend/src/main/ipc/ipc_query_send_runtime.cjs`.
For full pairing/grouping details behind `<episodic_memory>` content generation, see [Memory Search Grouping and Transcript Pair Synthesis Contract Reference](../sidecar/memory/memory_search_grouping_and_transcript_pair_synthesis_contract_reference.md).
