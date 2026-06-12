---
summary: "Electron main query relay reference: windie renderer IPC handling, SDK desktop-agent sends, initial settings ACK gating, system/memory context payload assembly, and query failure event synthesis."
read_when:
  - When changing query transport from renderer to the SDK desktop agent/backend websocket, including helper payload shaping in `ipc_query_runtime.cjs`.
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
- `packages/windie-sdk-js/src/runtime/ContextEnrichmentPipeline.ts`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/sidecar/local_backend_bridge.cjs`
- `frontend/src/main/sidecar/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/backend_endpoints.cjs`
- `frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient.ts`

## Relay Entry: `ipcMain.handle('windie:invoke', ...)`

Main receives live chat query invokes on the SDK-shaped `windie:invoke` command
channel with `command: 'conversation.send'`.
Electron main is the desktop host and SDK customer: it prepares host-only query
context, calls the SDK agent, and forwards SDK projections back to renderer
windows. There is no generic renderer `to-backend` compatibility relay for SDK
runtime commands.

Common input normalization:

- shallow-copies object payload only
- drops malformed payloads early through query preparation validation

Endpoint context for SDK agent calls:

- websocket send target, origin, hosted defaults, and endpoint environment
  overrides are owned by `WindieClient` managed backend options
- socket construction, sidecar/tool runtime bootstrap, envelope sends,
  current-turn projection, and display-row projection are owned by
  the SDK `WindieClient.wakeUp(...)` + `agent.conversation(...)` path;
  `ipc.cjs` imports the SDK directly and only forwards SDK outputs to renderer
  windows
- `get-client-user-id` snapshot includes resolved diagnostic `backendWsUrl` and
  `backendHttpUrl` values for renderer display, while SDK connection events
  own actual socket lifecycle

Special `windie:invoke` command paths:

- `conversation.send`: prepares the renderer query, runs the initial settings gate, and sends the backend websocket `query` through the SDK desktop agent
- `conversation.stop`: sends backend websocket `stop-query` through the SDK desktop agent
- `settings.update`: delegates to the settings ACK pipeline through the SDK agent
- `models.list`: requests model list through the SDK agent once connected
- `conversation.rehydrate`: rehydrates backend inference history through the SDK agent
- `conversation.compact`: asks backend to compact the active conversation through the SDK agent
- `wakeword.detected`: passes through the initial settings sync gate before backend send

## Initial Settings ACK Gate Before Query

For typed live chat query invokes and `wakeword-detected`, main calls
`ensureInitialSettingsSync()`.

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

## Query-Specific SDK Agent Pipeline

When the `conversation.send` command is invoked, main performs extra steps before sending through the SDK desktop agent.

### 1) Overlay pre-capture hook

- optionally runs `onBeforeOverlayQueryCapture` callback for chatbox view

### 2) Conversation identity resolution

- delegated to `prepareRendererQueryPayload(...)` in `ipc_query_runtime.cjs`:
  - resolves `conversation_ref` from payload or current backend conversation state
  - injects resolved ref into payload when missing
  - strips relay-only fields (`attachment_context`, `memory_retrieval_enabled`) from outbound payload
  - normalizes `attachment_filenames` for local optimistic message metadata

### 3) SDK-owned user row/event projection

Main no longer broadcasts a synthetic `local-user-message` over a raw backend
relay. The query path starts the turn replay buffer with the query message id,
then the SDK emits the user row/conversation event that renderer surfaces use
for display and transcript side effects.

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

### 5) SDK agent send + failure fallback

- sends the backend websocket message through the SDK desktop agent with stable message id
- on send failure, emits a normalized SDK conversation error event via `buildQuerySendFailure(...)`
- on send failure, clears replay buffer so stale optimistic events are not replayed after reconnect

## Query Payload Builder Internals

`buildQueryPayloadContent(...)` composes:

1. optional episodic + semantic memory sections (or `None` placeholders) when retrieval injection is enabled
2. optional `<attached_file_context>` section (hidden non-image file context from renderer-side `read_file`)
3. `<user_query>` XML block

Memory section formatting contract (`ContextEnrichmentPipeline.ts`):

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

- initial: `active_window`, `mouse_position`, `screen_resolution`
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
- main delegates normalization/state-advance to `applyTranscriptSessionSync(...)` (`ipc_transcript_session_sync.cjs`) using first-class identity keys (`conversationRef|conversation_ref`, `userId|user_id`)
- normalized sync envelope is rebroadcast to other windows
- this keeps active-window session state aligned across multi-window sessions, but
  renderer query sends must still include an explicit `conversation_ref`

Overlay phase updates during relay/stream lifecycle:

- query send -> `awaiting-first-chunk`
- `streaming-response` -> `streaming`
- `tool-call`/`tool-bundle` -> `tool-call`
- `tool-output` -> `awaiting-first-chunk`
- `streaming-complete` -> `complete`
- error during active stream -> `error`

## Debug Checklist

Compact response lifecycle milestones are stored in app diagnostics under
`ipc.bridge`:

- `frontend query.send`: renderer query handoff into Electron
  main, with conversation/turn ids, text length, and resource count.
- `backend connection.*`: backend websocket connection state.
- `backend first_event`: the first backend event received for a
  turn.
- `backend tool_call` / `tool_output`: tool activity milestones.
- `backend complete`: backend agent-loop completion.
- `settings update.*`: settings send/ack milestones, including
  provider/model ids and changed setting keys.

Inspect them with `bin/windie diagnostics list --path ipc.bridge --limit 50`.
Set `WINDIE_DEBUG_IPC_STDOUT=1` only when you also want the compact
`[ElectronTrace]` stdout mirror. The diagnostics include conversation/turn ids,
request ids, counts, and content lengths only. Set
`WINDIE_DEBUG_STREAM_EVENTS=1` when full event-family receive/broadcast tracing
or SDK projection progress is needed.

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
2. verify SDK runtime send returned message id
3. inspect synthetic `buildQuerySendFailure` error event path for failed send

For module ownership details of query/local synthetic event broadcasters and renderer-window fan-out, see [IPC Helper Module Split and Runtime Boundary Reference](ipc_helper_module_split_and_runtime_boundary_reference.md).
For end-to-end query-send owner routing across renderer compose, Electron main relay, backend handoff, stream ingress, and validation, see [Query Send and Stream Relay Change Workflow](query_send_and_stream_relay_change_workflow.md).
For replay and transcript session-sync normalization details, see [IPC Event Replay and Transcript Session Sync Reference](ipc_event_replay_and_transcript_session_sync_reference.md).
For helper-level contracts (`prepareRendererQueryPayload`, `buildQueryPayload`, `prepareAutomatedQueryPayload`, `applyTranscriptSessionSync`), see [IPC Query Runtime and Transcript Sync Helper Reference](ipc_query_runtime_and_transcript_sync_helper_reference.md).
For the extracted renderer query-send orchestration helper, see `frontend/src/main/ipc/ipc_query_send_runtime.cjs`.
