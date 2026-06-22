---
summary: "Deep reference for Electron-main IPC helper modules that shape query payloads and transcript-session sync updates: renderer query normalization, automated query preparation, and cross-window session identity propagation."
read_when:
  - When changing query payload shaping in `frontend/src/main/ipc/ipc_query_runtime.cjs`.
  - When changing transcript-session sync normalization in `frontend/src/main/ipc/ipc_transcript_session_sync.cjs`.
  - When debugging missing `conversation_ref` rejection, dropped attachment metadata, or cross-window conversation/user drift.
title: "IPC Query Runtime and Transcript Sync Helper Reference"
---

# IPC Query Runtime and Transcript Sync Helper Reference

## Canonical Modules

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_client_session_handlers.cjs`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/ipc/ipc_transcript_session_sync.cjs`
- `packages/windie-sdk-js/src/runtime/ContextEnrichmentPipeline.ts`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/IpcTranscriptSessionSync.test.cjs`
- `tests/frontend/TranscriptSessionSyncPayload.test.ts`

## Query Helper Ownership (`ipc_query_runtime.cjs`)

`ipc_query_runtime.cjs` centralizes query payload shaping used by both renderer-driven sends and automated VM sends.

### `prepareRendererQueryPayload(payload, currentConversationRef, resolveConversationRef)`

Responsibilities:

- clone and normalize incoming renderer payload object
- normalize `attachment_filenames` to trimmed non-empty string array
- extract and remove `attachment_context` from outbound payload
- extract and remove `memory_retrieval_enabled` (defaults to enabled when omitted)
- resolve `conversationRef` through
  `createQueryEventsRuntime(...).resolveConversationRefFromPayload(...)`
- reject renderer queries that do not carry an explicit `conversation_ref`

Returns:

- `payload` (normalized outbound payload)
- `attachmentContext`
- `conversationRef`
- `memoryRetrievalEnabled`

### `buildQueryPayload(...)`

Responsibilities:

- derive `contextType` (`initial` vs `sequential`) from `isFirstQuery`
- derive effective `userId` (`currentUserId` fallback to generated id)
- call `buildQueryPayload(...)` for backend query payload filtering and required identity fields
- inject `content` and optional `system_state_internal` into returned payload

Returns:

- `payload` (ready for websocket send)
- `userId`
- `conversationRef`
- `queryUsedInitialContext`

### `buildRendererBackendQueryPayloadWithAgentDefinition(...)`

Responsibilities:

- attach Electron-collected agent-definition context to a renderer query payload
- filter the enriched object to backend query payload keys
- preserve SDK turn input `resources` and `metadata` from the original renderer
  command payload after backend filtering

This keeps SDK turn-resource preservation private to `ipc_query_runtime.cjs`
instead of exporting a lower-level field-copy helper.

### `prepareAutomatedQueryPayload(options, currentConversationRef)`

Responsibilities:

- validate/trim required `text`; returns `null` when missing
- resolve `conversationRef` from explicit options only; `sendAutomatedQuery(...)`
  creates a new `vm-run-*` conversation ref when no option is provided
- normalize optional attachment context/filenames
- normalize `memoryRetrievalEnabled` flag (default true)

Used by `ipc_automated_query_dispatcher.cjs`.

## Transcript Sync Helper Ownership (`ipc_transcript_session_sync.cjs`)

`ipc_transcript_session_sync.cjs` centralizes main-process normalization and state-advance rules for renderer `transcript-session-sync` events.

### `normalizeTranscriptSessionSyncPayload(payload)`

Accepted identity keys:

- conversation: `conversationRef`
- user: `userId`

Removed transcript-session sync aliases `conversation_ref` and `user_id` are
rejected. Those snake_case keys belong to renderer query payloads and backend
transport envelopes, not this renderer/main UI-session sync channel.

Normalization semantics:

- trim non-empty strings
- preserve explicit `null`
- output `undefined` for missing keys (no update intent)
- reject payloads with no recognized conversation/user keys
- reject payloads containing removed `conversation_ref` or `user_id` sync
  aliases

### `applyTranscriptSessionSync({ ... })`

Responsibilities:

- normalize payload via `normalizeTranscriptSessionSyncPayload(...)`
- compute next main-process state:
  - `nextConversationRef`: explicit update when present, otherwise preserve current
  - `nextUserId`: update only when normalized user id is non-empty string, otherwise preserve current
- broadcast the resolved next session state to sibling windows (sender excluded),
  so omitted fields do not become `null` clears in other renderers

Returns:

- `null` when payload is not actionable
- otherwise `{ normalizedPayload, nextConversationRef, nextUserId }`

## `ipc.cjs` Integration Contract

### Renderer query path (`windie:invoke` command `conversation.send`)

1. `prepareRendererQueryPayload(...)` normalizes mutable relay payload.
2. optimistic local-user message uses normalized conversation/attachment context.
3. `buildQueryPayload(...)` filters backend query fields and preserves required identity fields; SDK context enrichment renders model-facing XML-style content later.
4. `buildRendererBackendQueryPayloadWithAgentDefinition(...)` attaches
   agent-definition context while preserving SDK turn resources/metadata from
   the original command payload.
5. `ipc.cjs` replaces original payload object contents with normalized/built payload before send.

### Automated query path (`sendAutomatedQuery`)

1. `prepareAutomatedQueryPayload(...)` validates/normalizes options.
2. `ipc_automated_query_dispatcher.cjs` connects the backend, waits for
   settings sync, and builds normalized outbound payload through
   `buildQueryPayload(...)`.
3. attachment filenames remain top-level payload metadata; hidden `attachmentContext` stays prompt-only.
4. the dispatcher attaches agent-definition context and sends the SDK runtime
   `query` command.

### Transcript sync path (`transcript-session-sync`)

1. `ipc_client_session_handlers.cjs` registers the renderer event listener.
2. `applyTranscriptSessionSync(...)` normalizes event and computes next state.
3. `ipc_client_session_handlers.cjs` writes returned
   `nextConversationRef`/`nextUserId` through injected `ipc.cjs` state setters.
4. normalized envelope is rebroadcast to sibling windows by helper.

## Test-Backed Invariants

`tests/frontend/IpcMainBridge.query.test.cjs`:

- `attachment_context` is prompt-only and stripped from outbound payload
- `attachment_filenames` remain local-echo metadata and are not sent in outbound query payload
- disabled memory retrieval removes memory tags and strips `memory_retrieval_enabled` from outbound payload

`tests/frontend/IpcMainBridge.lifecycle.test.cjs`:

- transcript-session sync from one renderer updates active conversation context for another renderer, while query sends still require explicit `conversation_ref`
- sender window is excluded from transcript-session sync rebroadcast

`tests/frontend/IpcTranscriptSessionSync.test.cjs` and `TranscriptSessionSyncPayload.test.ts`:

- renderer inbound transcript-session updates apply locally without echoing back to main

## Drift Hotspots

1. Reintroducing ad-hoc payload mutation in `ipc.cjs` can desync renderer query and automated query behavior.
2. Reintroducing `sessionId`/`session_id` as chat identity aliases can bind durable conversation state to hosted backend runtime sessions.
3. Failing to preserve explicit `null` semantics can prevent intended conversation/session clears.
4. Sending attachment context/filenames in outbound backend payload can leak UI-only metadata into backend protocol surfaces.

## Related Pages

- [IPC Helper Module Split and Runtime Boundary Reference](ipc_helper_module_split_and_runtime_boundary_reference.md)
- [Query Payload and Relay Reference](query_payload_and_relay_reference.md)
- [IPC Event Replay and Transcript Session Sync Reference](ipc_event_replay_and_transcript_session_sync_reference.md)
