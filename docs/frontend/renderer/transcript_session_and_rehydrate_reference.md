---
summary: "Renderer transcript runtime reference: session identity state, queued transcript write semantics, IPC storage contract, and dashboard conversation resume/rehydrate flow."
read_when:
  - When changing transcript write behavior, session identity wiring, or `store-chat-event` payload shape.
  - When debugging missing transcript rows, stuck pending transcript queues, or resume-conversation rehydrate mismatches.
  - When changing try-again/edit+resend replay sequencing in `useConversationReplayActions.js`.
title: "Transcript Session and Rehydrate Reference"
---

# Transcript Session and Rehydrate Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopTranscriptProjectionRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopConversationContinuityService.ts`
- `frontend/src/renderer/app/runtime/desktopBackendTransport.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptSessionRuntime.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptEntryPersistence.ts`
- `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts`
- `frontend/src/renderer/infrastructure/transcript/localConversationStore.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionSyncPayload.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoState.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoStorage.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptRecordWrite.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingTranscriptMessages.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingUserQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingAssistantQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/pendingToolQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pending/transcriptPendingFlush.ts`
- `frontend/src/renderer/infrastructure/transcript/toolCallMessageState.js`
- `frontend/src/renderer/infrastructure/transcript/rehydrateMessageState.js`
- `frontend/src/renderer/infrastructure/transcript/storedTranscriptMemoryState.js`
- `frontend/src/renderer/infrastructure/services/screenshotMessageState.js`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useConversationReplayActions.js`
- `frontend/src/renderer/features/chat/utils/toolOutputTranscriptPersistence.ts`
- `frontend/src/renderer/features/chat/utils/session/newChatSession.ts`
- `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx`
- `frontend/src/renderer/features/dashboard/hooks/useTranscriptSessionInfo.js`
- `frontend/src/renderer/app/runtime/desktopBackendTransport.ts`
- `frontend/src/main/sidecar/local_backend_bridge.cjs`
- `frontend/src/main/sidecar/local_backend_bridge_rpc_mappers.cjs`

## Session Identity Model (Renderer)

Transcript writes require:

- `conversationRef`
- `userId`

`createTranscriptSessionState(...)` behavior:

- lazy bootstrap from `sessionStorage` key `transcript-session-info`
- stored identity must use `conversationRef`; `sessionId` is not accepted as a chat identity alias
- after bootstrap, reads are in-memory

Update semantics:

- `update(conversationRef?, userId?)`
- conversation ref can be explicitly set `null`
- empty/undefined user id does not overwrite existing user id

## Persist and Broadcast Behavior

Session info is persisted/emitted only when changed:

- writes to `sessionStorage`
- dispatches browser event `transcript-session-update`
- sends IPC event `transcript-session-sync` so main process session snapshots track renderer transcript identity
- inbound `transcript-session-sync` packets are normalized by `extractTranscriptSessionSyncPayload(...)` before state updates:
  - accepts first-class identity keys (`conversationRef|conversation_ref`, `userId|user_id`)
  - trims/normalizes text and converts blank values to `null`
  - supports partial updates (one field may be `undefined`)
- inbound sync updates apply with rebroadcast disabled to avoid renderer/main loopback storms

Responsibility split:

- `transcriptSessionRuntime.ts` owns session-state bootstrap, storage persistence, browser/main-process sync, and session resolution helpers
- `DesktopTranscriptProjectionRuntimeClient` is the public projection write API and queue coordinator; `transcriptSessionRuntime.ts` owns session identity.
- Chat feature code reads and updates active conversation/user identity through
  `DesktopTranscriptSessionRuntimeClient`, not through the desktop conversation
  command facade.

Dashboard consumers subscribe via `useSyncExternalStore` (`useTranscriptSessionInfo`) for stable snapshot behavior.

Transcript conversation pagination helper:

- `loadConversationTranscriptMemories(...)` centralizes paginated `GET_CHAT_EVENTS` fetch with `afterMessageIndex` cursor progression, used by dashboard open + manual compaction rehydrate flows.

## Transcript Write API Surface

Public writer entrypoints:

- `recordUserMessage(...)`
- `recordAssistantMessage(...)`
- `recordToolMessage(...)`

Shared writer layering:

- `DesktopTranscriptProjectionRuntimeClient` owns public recorder entrypoints, queue coordination, and `transcript-entry-stored` emission
- `transcriptRecordWrite.ts` owns the empty-text / resolve-session / immediate-write-or-queue decision boundary
- `transcriptEntryPersistence.ts` resolves the final session and delegates persistence to the desktop conversation store factory
- `SidecarConversationStore` owns sidecar event writes and reads; the desktop conversation store factory only supplies desktop write enrichment such as workspace binding, attachments, and compaction checkpoints

Each path:

1. resolve session identity from explicit options + current session state
2. if missing identity fields, queue for retry and return
3. otherwise call the desktop conversation store, which invokes the
   SDK-shaped `conversation.appendEvent` command

Stored fields include:

- `content`, `role`, `messageType`
- `toolName`, `correlationId` (tool rows)
- `structuredPayload` for tool rows so queued retries and later transcript rehydrate preserve model-facing call/output details
- `conversationRef`, `userId`
- optional `modelId`, `modelProvider`, `timestamp`
- screenshot attachments keep artifact refs separate from inline screenshot data:
  - `screenshotRef`/`screenshot_ref` carries persisted artifact refs
  - `screenshot` is reserved for inline screenshot payloads
- optional `transparency` object snapshot (when available on assistant turns):
  - `systemPrompt`
  - `toolSchemas`
  - `fullUserMessage`
  - `fullAssistantMessage`
- transparency snapshots are normalized via `normalizeTransparencyData(...)` before queueing/persistence so empty/invalid snapshots are dropped
- tool-call message reconstruction is normalized through `toolCallMessageState.js` so live stream rows, session serialization, replayed transcript rows, and rehydrate payloads share one canonical `text/toolCallDisplayText/modelFacingToolCall/toolCallDetails/correlationId` contract
- screenshot attachment reconstruction is normalized through `screenshotMessageState.js` so live tool rows, replayed transcript rows, and screenshot capture/runtime helpers agree on artifact-ref/url inference and inline-vs-remote attachment behavior

Successful writes dispatch browser event `transcript-entry-stored` so dashboard/chat consumers can refresh derived rows without a full reload. Generated title writes are asynchronous sidecar metadata updates; after `conversation_titles` is updated, the sidecar emits `conversation-title-updated`, the SDK local-runtime event source normalizes it into a conversation metadata invalidation, and the dashboard reloads recent conversation metadata through the conversation library.

## Queue and Retry Semantics

Separate FIFO queues:

- user
- assistant
- tool

Flush behavior (`flushPendingMessages`):

- runs on transcript session updates
- no-op if identity incomplete or queues empty
- fixed category order: user -> assistant -> tool
- if a category fails mid-flush, remaining items in that category are requeued and later categories wait for next pass
- flush helpers in `pending/transcriptPendingFlush.ts` requeue only unflushed message suffixes to prevent duplicate writes

## Call-Site Wiring Across Renderer

### User identity seeding

`AppConfigProvider` sets transcript `userId` from:

- pushed `ipc-status` events
- initial `get-client-user-id` invoke

### New turn + user row

`useChatMessageSender`:

- ensures active conversation ref exists
- records user row with timestamp and optional screenshot ref

`startNewChatSession(...)`:

- clears chat state
- sets fresh active conversation ref

### Stream + tool rows

`useChatStream`:

- updates transcript session identity from accepted backend events
- records tool-call/tool-output/assistant/error rows
- routes transcript `tool-output` writes through `toolOutputTranscriptPersistence.ts` so streamed tool-output rows use the shared transcript payload builder for output details, screenshots, and model metadata

SDK/main records model-facing local tool execution through normalized
conversation events. Renderer transcript rows remain visible projections and do
not execute tools.

## Dashboard Resume and Rehydrate Flow

`ChatGptDashboardShell` conversation-open path:

1. list conversations from the SDK conversation library (`recordKind: "chat_event"`)
2. load selected conversation SDK events via the chat-event store adapter (cursor-paginated local RPC)
3. project SDK display messages for the renderer
4. ask the desktop conversation continuity service to rehydrate the backend inference session through `DesktopConversationContinuityService.rehydrateFromStore(...)`
   - rehydrate payload shaping is centralized in SDK projection helpers so dashboard-open rehydrate and edit/retry replay agree on `tool_name`, `tool_call_id`, screenshots, and structured tool payloads
5. set active transcript conversation/session info
6. replace renderer chat store with projected SDK display messages

Search modal uses the same open path after `search-chat-conversations` results.

## SDK Store Boundary

The desktop runtime uses `ConversationContinuityService` as the SDK-owned
continuity orchestrator and the SDK `SidecarConversationStore` as the
sidecar-backed conversation-store owner. The desktop conversation store factory
only adapts desktop projection writes into that SDK store.

Storage split:

- `chat_events` stores canonical SDK conversation events for the runtime,
  including `conversationRef`, `turnRef`, `revisionId`, request/bundle/tool-call
  ids, and structured payloads.
- `transcript` remains a visible projection/memory-era storage path and is not
  the active SDK continuity source.
- compacted backend rehydrate snapshots are stored as complete
  `compaction_applied` conversation events.

The factory supplies desktop write-enrichment params to the SDK
`SidecarConversationStore`, which owns the sidecar write/read RPCs. Display and
backend rehydrate snapshots come from the SDK projection path, and backend
resume is triggered by the SDK continuity service rather than by dashboard or
chat feature code.

`DesktopTranscriptProjectionRuntimeClient` routes new visible projection appends
through this adapter. Direct `store-chat-event` calls and replay append mutation
are not renderer feature-code surfaces; sidecar chat-event RPC names remain
inside SDK store/local-runtime and Electron main bridge internals.

`ensureConversationInferenceSessionHydrated(...)` now uses the continuity
service for the backend rehydrate payload. The local snapshot loader still
supplies workspace binding/display metadata, but the backend continuation
payload comes from the SDK store projection.

Hydration work is scoped to the current backend connection epoch. If the
connection is invalidated while a local snapshot load or explicit rehydrate is
pending, stale continuations must return before mutating workspace bindings or
rehydrating the new backend session.

Dashboard startup and open-chat loading also use the SDK store adapter:

- recent chats are listed through store metadata from `chat_events` rows
  and explicit pagination options
- dashboard chat deletion goes through the SDK store path so visible transcript
  projection rows and canonical `chat_events` rows are removed together
- opening a chat renders `DisplayConversation` through
  `sdkDisplayChatMessageProjection.ts`
- the local snapshot loader remains only for workspace binding and projection
  metadata
- edit/resend and try-again actions go through
  `DesktopConversationContinuityService.editAndResend(...)` and
  `DesktopConversationContinuityService.retryTurn(...)`. The hook identifies the
  clicked message and sets the optimistic display projection, while the desktop
  continuity runtime loads canonical sidecar chat events through the desktop
  conversation store factory and delegates revision cutting, rehydrate
  generation, model sync, and query send to `SdkConversationRuntime`. Retry and
  edit/resend rewrites use a compact sidecar cutoff RPC instead of sending a
  copied shortened transcript back to the sidecar. New live sends align the
  renderer user-row id, transcript projection `messageId`, and SDK turn ref;
  replay also passes the clicked user-message ordinal so older renderer-only ids
  can still resolve to the canonical sidecar event. Replay dispatch records the
  replacement user turn before sending the query, and SDK projection suppresses
  orphan empty-chat greeting rows when no user turn exists.
- compacted replay replacement appends a new generation with
  `replay_generation_entry_count` and `replay_generation_complete` metadata.
  Loaders select the newest complete generation and ignore partial writes, so a
  failed replacement cannot erase the previous replay snapshot.
- Stream compaction handlers persist compacted replay snapshots through
  `DesktopConversationContinuityService`, not through the conversation command
  facade.

## Try-Again and Edit+Resend Replay Contract

Replay rehydrate must keep prior context stable.

- Keep all prior non-tool transcript rows.
- Keep valid tool history pairs (`tool-call` + matching `tool-output`).
- Remove only orphan tool rows (call without output, output without call).
- Pairing/correlation normalization for this pruning path is centralized in `features/chat/utils/conversationReplayToolMessages.js` so edit+resend and try-again flows share one replay contract.
- Replay screenshot normalization is centralized in `screenshotMessageState.js` so edit+resend and try-again:
  - preserve inline screenshot payloads when no artifact ref exists
  - infer artifact refs from stored artifact URLs before transcript rewrite or backend query resend
- Backend rehydrate also repairs malformed old transcript rows by:
  - converting old `role=tool + message_type=tool-call` rows into assistant tool-call turns
  - reusing explicit `tool_call_id` values when tool outputs arrive out of order
  - synthesizing fallback `tool-output` rows for unanswered pending tool calls so strict providers can resume old chats safely
- Local transcript rewriting must be owned by the SDK runtime/store boundary,
  not by chat UI hooks. Hooks may build the optimistic display projection, but
  persistence, revision cutting, rehydrate shaping, and resend delivery stay
  behind `DesktopLiveTurnRuntimeClient`.

This contract prevents provider tool-call sequencing errors without losing valid tool context.

## Main/Sidecar Contract for Transcript Storage

SDK/local-runtime `store_chat_event` implementation path:

- SDK `SidecarConversationStore` calls local-runtime RPC `store_chat_event`
- Electron main maps implementation-level `store-chat-event` to JSON-RPC
  `store_chat_event`
- camelCase to snake_case mapping includes:
  - `conversationRef` -> `conversation_ref`
  - `userId` -> `user_id`
  - `messageType` -> `message_type`
  - `toolName` -> `tool_name`
  - `correlationId` -> `correlation_id`
  - `modelId` -> `model_id`
  - `modelProvider` -> `model_provider`

Conversation list/get/delete similarly map through same bridge mapper set.

## Debug Checklist

If transcript rows never appear:

1. verify transcript session has both `conversationRef` and `userId`
2. verify `updateTranscriptSession(...)` runs after IPC status/backend events
3. inspect renderer warnings for immediate store failures/requeues

If pending rows never drain:

1. verify session identity changes (flush only runs on update calls)
2. verify earliest queue category is not repeatedly failing
3. verify sidecar readiness (`Local backend not ready`)

If resumed conversation loses screenshot/tool linkage:

1. inspect SDK display and rehydrate projection mapping
   (`sdkDisplayChatMessageProjection.ts` and the desktop continuity service)
2. verify screenshot ref propagation
3. verify `correlation_id` + `tool_name` survive list/get round-trip

## Related Pages

- [Frontend Renderer Transcript Docs Hub](transcript/README.md)
- [Transcript Writer Queue Flush and Session Event Reference](transcript/transcript_writer_queue_flush_and_session_event_reference.md)
- [Transcript Queue Docs Hub](transcript/queue/README.md)
- [Pending Transcript Queue FIFO and Requeue Contract Reference](transcript/queue/pending_transcript_queue_fifo_and_requeue_contract_reference.md)
- [Transcript Session Sync Payload Normalization and Alias Contract Reference](transcript/contracts/transcript_session_sync_payload_normalization_and_alias_contract_reference.md)
- [Transcript Transparency Normalization and Snapshot Pruning Contract Reference](transcript/contracts/transcript_transparency_normalization_and_snapshot_pruning_contract_reference.md)
- [Memory IPC and RPC Mapping Reference](../contracts/memory_ipc_and_rpc_mapping_reference.md)
