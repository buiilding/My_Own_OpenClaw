---
summary: "Deep reference for Electron-main turn-scoped backend-event replay and cross-window transcript-session sync normalization between main and renderer."
read_when:
  - When changing turn replay buffering in `ipc_event_replay_state.cjs`, renderer window registration fan-out, or query optimistic event seeding.
  - When changing `transcript-session-sync` payload normalization/forwarding between `ipc_transcript_session_sync.cjs` and the desktop transcript session runtime.
title: "IPC Event Replay and Transcript Session Sync Reference"
---

# IPC Event Replay and Transcript Session Sync Reference

## Canonical Modules

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_event_replay_state.cjs`
- `frontend/src/main/ipc/ipc_conversation_event_projection.cjs`
- `frontend/src/main/ipc/ipc_transcript_session_sync.cjs`
- `frontend/src/main/ipc/ipc_renderer_windows.cjs`
- `frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntime.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptSessionRuntime.ts`
- `tests/frontend/IpcMainBridge.query.test.cjs`

## Turn-Scoped Event Replay Contract

Replay state is owned by `createIpcEventReplayState(maxEvents = 240)` and kept in main process memory.

State fields:

- `activeTurnRef`
- `replayEvents[]` ring-like capped list (max default 240)

Core methods:

- `startTurn(turnRef, seedEvent?)`
  - resets replay state
  - sets new active turn id
  - optionally seeds replay with optimistic `local-user-message`
- `appendForActiveTurn(event)`
  - appends only when `event.turn_ref` matches `activeTurnRef`
- `snapshot()`
  - returns cloned event list for safe replay fan-out
- `clear()`
  - drops active turn + buffered events

Clone safety:

- replay append/snapshot clone the envelope and shallow clone object payloads.
- consumers cannot mutate replay storage by reference.

## Replay Lifecycle in `ipc.cjs`

### Query send path

1. generate `queryMessageId`
2. emit optimistic local event (`local-user-message`)
3. call `ipcEventReplayState.startTurn(queryMessageId, localUserMessage)`
4. backend inbound events later append through `appendForActiveTurn(...)`

### Inbound backend path

- websocket `message` handler parses event and calls `appendForActiveTurn(data)` before renderer fan-out.
- only matching-turn events are replay-eligible; stale-turn packets are ignored for replay buffering.

### Reset paths

- websocket open: `clear()` (fresh connection lifecycle)
- websocket close: `clear()` (drop stale buffered packets)
- query send failure (SDK runtime query send returns null): `clear()` before synthetic error fan-out

## Late Window Rehydrate Contract

`trackRendererWindow(...)` synchronizes runtime state when a window is registered or finishes loading:

1. sends current `response-overlay-phase`
2. requests replay snapshot
3. rebuilds SDK conversation events from the replay buffer and re-emits them on
   `windie:conversation-event` through
   `createConversationEventProjectionRuntime(...)`

Result:

- late-mounted renderer windows can recover in-flight turn context (SDK user
  row + streamed conversation projections) without waiting for new backend
  events.

## Transcript Session Sync Channel Contract

Channel name is shared both directions:

- renderer -> main: `SEND_CHANNELS.TRANSCRIPT_SESSION_SYNC`
- main -> renderer: `ON_CHANNELS.TRANSCRIPT_SESSION_SYNC`

### Main-process normalization (`ipc_transcript_session_sync.cjs`)

`applyTranscriptSessionSync(...)` owns normalization and next-state derivation.

Underlying payload normalizer: `normalizeTranscriptSessionSyncPayload(...)`.

Accepted conversation keys:

- `conversationRef`

Removed session identity keys are rejected:

- `sessionId`
- `session_id`

Backend runtime session ids are not durable transcript conversation identity.

Accepted user keys:

- `userId`

Removed transcript-session sync aliases are rejected:

- `conversation_ref`
- `user_id`

Those snake_case keys belong to the separate backend query transport contract,
not the renderer/main transcript-session UI sync channel.

Normalization semantics:

- explicit `null` is preserved as `null`
- non-string/empty values normalize to `null`
- missing fields are returned as `undefined` (no write intent)
- payloads with no recognized conversation or user key are ignored
- payloads containing removed `sessionId` or `session_id` keys fail fast

Main update behavior:

- helper returns `nextConversationRef` and `nextUserId` for `ipc.cjs` state assignment
- `conversationRef` updates include explicit null clears
- `userId` update only occurs when normalized value is a non-empty string
- sibling-window rebroadcasts carry the resolved next state; omitted
  `conversationRef` or `userId` fields do not turn into clears
- rebroadcast excludes sender window (`broadcastToRenderers(..., sourceWebContents)`)

### Renderer normalization (`transcriptSessionRuntime.ts`)

Renderer accepts the same camelCase keys, rejects the same removed session
identity and snake_case sync alias keys, and applies the same normalization
semantics through the private transcript sync parser before calling:

- `applyTranscriptSessionUpdate(conversationRef, userId, { syncToMainProcess: false })`

Loop prevention:

- inbound sync does not echo back to main (`syncToMainProcess: false`)

Durability side effects:

- updates session state + local storage
- triggers pending transcript flush attempt after session changes

## Drift Hotspots

1. Replacing turn-scoped replay append logic with unconditional append can leak stale-turn packets into late window replays.
2. Removing sender exclusion from transcript sync rebroadcast can create duplicate self-applies and extra render churn.
3. Diverging removed-key handling between main and renderer
   (`conversation_ref`/`user_id`, plus rejected `session_id`) can desync
   conversation/user identity across windows.
4. Dropping `clear()` on reconnect/failure paths can replay outdated events into newly connected windows.

## Related Pages

- [IPC Helper Module Split and Runtime Boundary Reference](ipc_helper_module_split_and_runtime_boundary_reference.md)
- [IPC Query Runtime and Transcript Sync Helper Reference](ipc_query_runtime_and_transcript_sync_helper_reference.md)
- [Query Payload and Relay Reference](query_payload_and_relay_reference.md)
- [WebSocket Handshake and Settings Sync Reference](websocket_handshake_and_settings_sync_reference.md)
- [Transcript Session and Rehydrate Reference](../renderer/transcript_session_and_rehydrate_reference.md)
