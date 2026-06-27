---
summary: "Electron main query relay reference: windie renderer IPC handling, Agent SDK runtime sends, initial settings ACK gating, query payload normalization, SDK memory-context enrichment, and query failure event synthesis."
read_when:
  - When changing query transport from renderer to the Agent SDK runtime/backend websocket, including helper payload shaping in `ipc_query_runtime.cjs`.
  - When debugging first-query payload normalization, settings-sync gate timing, SDK memory-context enrichment, SDK user-message projection, or send-failure error behavior.
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
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/app/backend_endpoints.cjs`
- `frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts`
- `frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js`
- `frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient.ts`

## Relay Entry: `windie:invoke` SDK command handler

Main receives live chat query invokes on the SDK-shaped `windie:invoke` command
channel with `command: 'conversation.send'` through
`ipc_agent_sdk_command_handlers.cjs`.
Electron main is the Electron agent host: it prepares host-only query
context, calls the Agent SDK runtime, and forwards SDK projections back to renderer
windows. There is no generic renderer `to-backend` compatibility relay for SDK
runtime commands.

Common input normalization:

- shallow-copies object payload only
- drops malformed payloads early through query preparation validation

Endpoint context for Agent SDK runtime calls:

- websocket send target, origin, hosted defaults, and endpoint environment
  overrides are owned by `AgentClient` managed backend options
- socket construction, local-runtime/tool runtime bootstrap, envelope sends,
  current-turn projection, and display-row projection are owned by
  the SDK `AgentClient.wakeUp(...)` + `agent.conversation(...)` path;
  `ipc.cjs` imports the SDK directly and only forwards SDK outputs to renderer
  windows
- `get-client-user-id` snapshot includes resolved diagnostic `backendWsUrl` and
  `backendHttpUrl` values for renderer display, while SDK connection events
  own actual socket lifecycle

Special `windie:invoke` command paths:

- `conversation.send`: prepares the renderer query, runs the initial settings gate, and sends the backend websocket `query` through the Agent SDK runtime
- `conversation.stop`: sends backend websocket `stop-query` through the Agent SDK runtime
- `settings.update`: delegates to the settings ACK pipeline through the Agent SDK runtime
- `models.list`: requests model list through the Agent SDK runtime once connected
- `conversation.rehydrate`: rehydrates backend inference history through the Agent SDK runtime
- `conversation.compact`: asks backend to compact the active conversation through the Agent SDK runtime
- `wakeword.detected`: passes through the initial settings sync gate before backend send

## Initial Settings ACK Gate Before Query

For typed live chat query invokes and `wakeword-detected`, main calls
`ensureInitialSettingsSync()`.

Gate behavior:

1. run once per websocket connection (`hasAttemptedInitialSettingsSync`)
2. ensure latest desktop UI config is available (memory cache or disk load fallback)
3. send `update-settings` with generated message `id`
4. wait for ACK or timeout (`SETTINGS_SYNC_TIMEOUT_MS=2500`)

ACK resolution map:

- backend `settings-updated` with same `id` -> success
- backend `error` with same `id` -> failure
- timeout -> failure

Goal:

- prevent first query from using stale backend session settings.

## Query-Specific SDK Agent Pipeline

When the `conversation.send` command is invoked, main performs extra steps before sending through the Agent SDK runtime.

### 1) Overlay pre-capture hook

- optionally runs `onBeforeOverlayQueryCapture` callback for chatbox view

### 2) Conversation identity resolution

- delegated to `prepareRendererQueryPayload(...)` in `ipc_query_runtime.cjs`:
  - resolves `conversation_ref` from payload or current backend conversation state
  - injects resolved ref into payload when missing
  - preserves SDK enrichment fields (`attachment_context`, `memory_retrieval_enabled`) for the SDK handoff
  - normalizes `attachment_filenames` for local optimistic message metadata

### 3) SDK-owned user row/event projection

Main no longer broadcasts a synthetic `local-user-message` over a backend-wire
relay. The query path starts the turn replay buffer with the query message id,
then the SDK emits the user row/conversation event that renderer surfaces use
for display and transcript side effects.

### 4) Query payload normalization and SDK enrichment handoff

Main delegates to `buildQueryPayload(...)` (`ipc_query_runtime.cjs`) with:

- raw query text
- conversation ref
- user ID
- retrieval-injection toggle (`memory_retrieval_enabled`, default `true`) sourced from renderer local preference
- optional hidden `attachment_context` generated from sender-side `read_file` calls for selected non-image files

Output from `buildQueryPayload(...)`:

- normalized payload filtered to the backend query contract
- resolved `userId` used by automated query return path

The SDK `ContextEnrichmentPipeline.ts` then renders model-facing `content` with memory and attachment context before the backend websocket send.

### 5) Agent SDK Runtime Send + Failure Fallback

- sends the backend websocket message through the Agent SDK runtime with stable message id
- on send failure, builds and emits an SDK `turn_error` conversation event
  through `createQueryEventsRuntime(...).buildQuerySendFailure(...)` context
  without backend-wire normalization
- on send failure, clears replay buffer so stale optimistic events are not replayed after reconnect
- on backend close during active response phases,
  `ipc_agent_backend_close_runtime.cjs` builds an interrupted SDK-shaped query
  event through `createQueryEventsRuntime(...).buildQueryInterrupted(...)`,
  routes it through the backend-event relay, and clears replay/session state

## SDK Context Enrichment Internals

`ContextEnrichmentPipeline.ts` composes:

1. optional episodic + semantic memory sections (or `None` placeholders) when retrieval injection is enabled
2. optional `<attached_file_context>` section (hidden non-image file context from renderer-side `read_file`)
3. `<user_query>` XML block

Memory section formatting contract (`ContextEnrichmentPipeline.ts`):

- SDK `agent.searchMemory(...)` creates the query embedding and calls local-runtime
  `search_memory_by_embedding` when retrieval injection is enabled.
- prompt injection requests a balanced retrieval budget:
  - `episodic_limit=4`
  - `semantic_limit=2`
  - `semantic_min_score=0.20`
- local-runtime memory search path applies: embedding store search -> active-conversation exclusion -> episodic/semantic grouping.
- episodic grouping prefers pre-paired interaction rows (`User + Assistant`), then transcript synthesis fallback, then raw episodic fallback text.
- each section is always emitted when retrieval injection is enabled:
  - `<episodic_memory>...</episodic_memory>`
  - `<semantic_memory>...</semantic_memory>`
- empty or missing lists render as:
  - `<tag>\nNone\n</tag>`
- non-empty lists render as `- <entry>` bullet lines with XML escaping (`&`, `<`, `>`, `"`, `'`).
- active conversation exclusion is requested at search time via `exclude_conversation_id` to avoid echoing current-turn transcript context.

Failure behavior:

- memory lookup failure logs and emits empty memory sections
- retrieval injection disabled skips memory lookup and renders only attachment context plus the escaped user query
- enrichment failures degrade to escaped user content instead of blocking query send

## Local Runtime Bridge Dependencies

The SDK local runtime provides query-enrichment dependencies:

- backend embeddings API -> query embedding for local memory search
- `search_memory_by_embedding` local-runtime RPC -> episodic/semantic memory snippets for prompt enrichment

Mapping details for memory search payload are centralized in:

- `LocalRuntime.ts` and local-runtime memory RPC handlers

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

- `renderer query.send`: renderer query handoff into Electron
  main, with conversation/turn ids, text length, resource count, and sanitized
  model checkpoints for the original renderer payload, prepared query payload,
  and SDK handoff payload. `model_dropped=true` means a model override existed
  before the SDK handoff payload lost it.
- `backend connection.*`: backend websocket connection state.
- `backend first_event`: the first backend event received for a
  turn.
- `backend tool_call` / `tool_output`: tool activity milestones.
- `backend complete`: backend agent-loop completion.
- `settings update.*`: settings send/ack milestones, including
  provider/model ids and changed setting keys.

Inspect them with `<windie> diagnostics list --path ipc.bridge --limit 50`.
Set `WINDIE_DEBUG_IPC_STDOUT=1` only when you also want the compact
`[ElectronTrace]` stdout mirror. The diagnostics include conversation/turn ids,
request ids, counts, and content lengths only. Set
`WINDIE_DEBUG_STREAM_EVENTS=1` when full event-family receive/broadcast tracing
or SDK projection progress is needed.

If first query lacks expected settings:

1. verify `ensureInitialSettingsSync()` ran before query send
2. verify `update-settings` ACK map resolved by message `id`
3. inspect timeout logs for settings sync gate

If query content misses memory or attachment context:

1. verify `buildQueryPayload(...)` returns the expected backend query fields, then check SDK context enrichment diagnostics
2. inspect local runtime bridge readiness (`Local runtime not ready` errors)
3. verify SDK memory search traces include `search_memory_by_embedding` with the expected conversation exclusion key
4. verify local-runtime episodic grouping/pairing behavior from `memory.operations` when retrieval text is unexpectedly user-only

If renderer shows user message but backend never streams:

1. confirm the SDK `user_message` projection arrived after the optimistic row
2. inspect Electron main logs for `Failed to connect Agent SDK runtime for query`
   or `Failed to connect Agent SDK runtime for update-settings`
3. verify SDK runtime send returned message id
4. inspect the query-events runtime send-failure context and SDK `turn_error`
   broadcast path for failed send

For module ownership details of query send-failure broadcasters and
renderer-window fan-out, see [IPC Helper Module Split and Runtime Boundary
Reference](ipc_helper_module_split_and_runtime_boundary_reference.md).
For end-to-end query-send owner routing across renderer compose, Electron main relay, backend handoff, stream ingress, and validation, see [Query Send and Stream Relay Change Workflow](query_send_and_stream_relay_change_workflow.md).
For replay and transcript session-sync normalization details, see [IPC Event Replay and Transcript Session Sync Reference](ipc_event_replay_and_transcript_session_sync_reference.md).
For helper-level contracts (`prepareRendererQueryPayload`, `buildQueryPayload`, `prepareAutomatedQueryPayload`, `applyTranscriptSessionSync`), see [IPC Query Runtime and Transcript Sync Helper Reference](ipc_query_runtime_and_transcript_sync_helper_reference.md).
For the extracted renderer query-send orchestration helper, see `frontend/src/main/ipc/ipc_query_send_runtime.cjs`.
