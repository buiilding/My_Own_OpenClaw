---
summary: "Deep reference for Electron-main IPC helper modules that shape query payloads and transcript-session sync updates: renderer query normalization, automated query preparation, and cross-window session identity propagation."
read_when:
  - When changing query payload shaping in `frontend/src/main/ipc/ipc_query_runtime.cjs`.
  - When changing transcript-session sync normalization in `frontend/src/main/ipc/ipc_transcript_session_sync.cjs`.
  - When debugging missing `conversation_ref` fallback, dropped attachment metadata, or cross-window conversation/user drift.
title: "IPC Query Runtime and Transcript Sync Helper Reference"
---

# IPC Query Runtime and Transcript Sync Helper Reference

## Canonical Modules

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/ipc/ipc_transcript_session_sync.cjs`
- `frontend/src/main/query_payload_builder.cjs`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/TranscriptWriter.session.test.ts`

## Query Helper Ownership (`ipc_query_runtime.cjs`)

`ipc_query_runtime.cjs` centralizes query payload shaping used by both renderer-driven sends and automated VM sends.

### `prepareRendererQueryPayload(payload, currentConversationRef, resolveConversationRef)`

Responsibilities:

- clone and normalize incoming renderer payload object
- normalize `attachment_filenames` to trimmed non-empty string array
- extract and remove `attachment_context` from outbound payload
- extract and remove `memory_retrieval_enabled` (defaults to enabled when omitted)
- resolve `conversationRef` using existing `resolveConversationRefFromPayload(...)`
- write `conversation_ref` into payload when missing and a fallback ref exists

Returns:

- `payload` (normalized outbound payload)
- `attachmentContext`
- `conversationRef`
- `memoryRetrievalEnabled`

### `buildQueryPayload(...)`

Responsibilities:

- derive `contextType` (`initial` vs `sequential`) from `isFirstQuery`
- derive effective `userId` (`currentUserId` fallback to generated id)
- call `buildQueryPayloadContent(...)` for XML-enriched content assembly
- inject `content` and optional `system_state_internal` into returned payload

Returns:

- `payload` (ready for websocket send)
- `userId`
- `conversationRef`
- `queryUsedInitialContext`

### `prepareAutomatedQueryPayload(options, currentConversationRef)`

Responsibilities:

- validate/trim required `text`; returns `null` when missing
- resolve `conversationRef` from options fallback to current active ref
- normalize optional attachment context/filenames
- normalize `memoryRetrievalEnabled` flag (default true)

Used by `sendAutomatedQuery(...)` in `ipc.cjs`.

## Transcript Sync Helper Ownership (`ipc_transcript_session_sync.cjs`)

`ipc_transcript_session_sync.cjs` centralizes main-process normalization and state-advance rules for renderer `transcript-session-sync` events.

### `normalizeTranscriptSessionSyncPayload(payload)`

Accepted alias keys:

- conversation: `conversationRef`, `conversation_ref`, `sessionId`, `session_id`
- user: `userId`, `user_id`

Normalization semantics:

- trim non-empty strings
- preserve explicit `null`
- output `undefined` for missing keys (no update intent)
- reject payloads with no recognized conversation/user keys

### `applyTranscriptSessionSync({ ... })`

Responsibilities:

- normalize payload via `normalizeTranscriptSessionSyncPayload(...)`
- compute next main-process state:
  - `nextConversationRef`: explicit update when present, otherwise preserve current
  - `nextUserId`: update only when normalized user id is non-empty string, otherwise preserve current
- broadcast normalized sync envelope to sibling windows (sender excluded)

Returns:

- `null` when payload is not actionable
- otherwise `{ normalizedPayload, nextConversationRef, nextUserId }`

## `ipc.cjs` Integration Contract

### Renderer query path (`to-backend` -> `type === "query"`)

1. `prepareRendererQueryPayload(...)` normalizes mutable relay payload.
2. optimistic local-user message uses normalized conversation/attachment context.
3. `buildQueryPayload(...)` injects context XML + runtime system state fields.
4. `ipc.cjs` replaces original payload object contents with normalized/built payload before send.

### Automated query path (`sendAutomatedQuery`)

1. `prepareAutomatedQueryPayload(...)` validates/normalizes options.
2. `buildQueryPayload(...)` builds enriched outbound payload.
3. attachment filenames remain top-level payload metadata; hidden `attachmentContext` stays prompt-only.

### Transcript sync path (`transcript-session-sync`)

1. `applyTranscriptSessionSync(...)` normalizes event and computes next state.
2. `ipc.cjs` writes returned `nextConversationRef`/`nextUserId`.
3. normalized envelope is rebroadcast to sibling windows by helper.

## Test-Backed Invariants

`tests/frontend/IpcMainBridge.query.test.cjs`:

- `attachment_context` is prompt-only and stripped from outbound payload
- `attachment_filenames` remain local-echo metadata and are not sent in outbound query payload
- disabled memory retrieval removes memory tags and strips `memory_retrieval_enabled` from outbound payload

`tests/frontend/IpcMainBridge.lifecycle.test.cjs`:

- transcript-session sync from one renderer updates fallback conversation context for another renderer
- sender window is excluded from transcript-session sync rebroadcast

`tests/frontend/TranscriptWriter.session.test.ts`:

- renderer inbound transcript-session updates apply locally without echoing back to main

## Drift Hotspots

1. Reintroducing ad-hoc payload mutation in `ipc.cjs` can desync renderer query and automated query behavior.
2. Dropping alias normalization in transcript sync helper can break compatibility with existing renderer payload shapes.
3. Failing to preserve explicit `null` semantics can prevent intended conversation/session clears.
4. Sending attachment context/filenames in outbound backend payload can leak UI-only metadata into backend protocol surfaces.

## Related Pages

- [IPC Helper Module Split and Runtime Boundary Reference](ipc_helper_module_split_and_runtime_boundary_reference.md)
- [Query Payload and Relay Reference](query_payload_and_relay_reference.md)
- [IPC Event Replay and Transcript Session Sync Reference](ipc_event_replay_and_transcript_session_sync_reference.md)
