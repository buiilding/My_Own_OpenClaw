---
summary: "Renderer transcript runtime reference: session identity state, queued transcript write semantics, IPC storage contract, and dashboard conversation resume/rehydrate flow."
read_when:
  - When changing transcript write behavior, session identity wiring, or `store-transcript` payload shape.
  - When debugging missing transcript rows, stuck pending transcript queues, or resume-conversation rehydrate mismatches.
  - When changing try-again/edit+resend replay sequencing in `useConversationReplayActions.js`.
title: "Transcript Session and Rehydrate Reference"
---

# Transcript Session and Rehydrate Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptSessionRuntime.ts`
- `frontend/src/renderer/infrastructure/transcript/transcriptEntryPersistence.ts`
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
- `frontend/src/renderer/infrastructure/transcript/storedTranscriptChatMessageState.js`
- `frontend/src/renderer/infrastructure/services/screenshotMessageState.js`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useConversationReplayActions.js`
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/utils/toolOutputTranscriptPersistence.ts`
- `frontend/src/renderer/features/chat/utils/session/newChatSession.ts`
- `frontend/src/renderer/features/dashboard/components/ChatGptDashboardShell.jsx`
- `frontend/src/renderer/features/dashboard/hooks/useTranscriptSessionInfo.js`
- `frontend/src/renderer/features/dashboard/utils/episodicMemoryUtils.js`
- `frontend/src/renderer/infrastructure/api/client.ts`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`

## Session Identity Model (Renderer)

Transcript writes require:

- `conversationRef`
- `userId`

`createTranscriptSessionState(...)` behavior:

- lazy bootstrap from `sessionStorage` key `transcript-session-info`
- legacy fallback accepts stored `sessionId` as conversation ref
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
  - accepts alias keys (`conversationRef|conversation_ref|sessionId|session_id`, `userId|user_id`)
  - trims/normalizes text and converts blank values to `null`
  - supports partial updates (one field may be `undefined`)
- inbound sync updates apply with rebroadcast disabled to avoid renderer/main loopback storms

Responsibility split:

- `transcriptSessionRuntime.ts` owns session-state bootstrap, storage persistence, browser/main-process sync, and session resolution helpers
- `TranscriptWriter.ts` remains the public write API and queue coordinator, but no longer embeds the full session runtime implementation inline

Dashboard consumers subscribe via `useSyncExternalStore` (`useTranscriptSessionInfo`) for stable snapshot behavior.

Transcript conversation pagination helper:

- `loadConversationTranscriptMemories(...)` centralizes paginated `GET_CONVERSATION` fetch with `afterMessageIndex` cursor progression, used by dashboard open + manual compaction rehydrate flows.

## Transcript Write API Surface

Public writer entrypoints:

- `recordUserMessage(...)`
- `recordAssistantMessage(...)`
- `recordToolMessage(...)`

Shared writer layering:

- `TranscriptWriter.ts` owns public recorder entrypoints, queue coordination, and `transcript-entry-stored` emission
- `transcriptRecordWrite.ts` owns the empty-text / resolve-session / immediate-write-or-queue decision boundary
- `transcriptEntryPersistence.ts` owns IPC payload shaping, workspace-binding attachment, replay bootstrap checks, and replay append writes

Each path:

1. resolve session identity from explicit options + current session state
2. if missing identity fields, queue for retry and return
3. otherwise invoke `store-transcript` over main IPC bridge

Stored fields include:

- `content`, `role`, `messageType`
- `toolName`, `correlationId` (tool rows)
- `structuredPayload` for tool rows so queued retries and later transcript rehydrate preserve model-facing call/output details
- `conversationRef`, `userId`
- optional `modelId`, `modelProvider`, `timestamp`
- screenshot attachment under IPC key `screenshot`
  - persisted as artifact ref when available
  - otherwise persisted as inline screenshot payload for replay-safe rows that do not have a stored artifact ref
- optional `transparency` object snapshot (when available on assistant turns):
  - `systemPrompt`
  - `toolSchemas`
  - `fullUserMessage`
  - `fullAssistantMessage`
- transparency snapshots are normalized via `normalizeTransparencyData(...)` before queueing/persistence so empty/invalid snapshots are dropped
- tool-call message reconstruction is normalized through `toolCallMessageState.js` so live stream rows, session serialization, replayed transcript rows, and rehydrate payloads share one canonical `text/toolCallDisplayText/modelFacingToolCall/toolCallDetails/correlationId` contract
- screenshot attachment reconstruction is normalized through `screenshotMessageState.js` so live tool rows, replayed transcript rows, and screenshot capture/runtime helpers agree on artifact-ref/url inference and inline-vs-remote attachment behavior

Successful writes dispatch browser event `transcript-entry-stored` so dashboard/chat consumers can refresh derived rows without a full reload.

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
- routes transcript `tool-output` writes through `toolOutputTranscriptPersistence.ts` so chat-stream and tool-runner use the same transcript payload builder for output details, screenshots, and model metadata

`useToolRunner` records frontend-side tool execution rows and uses the same shared tool-output transcript persistence helper as chat-stream tool-output handling.

## Dashboard Resume and Rehydrate Flow

`ChatGptDashboardShell` conversation-open path:

1. list conversations (`list-conversations`, transcript record kind)
2. load selected conversation transcript rows via `loadConversationTranscriptMemories(...)` (cursor-paginated `get-conversation`)
3. parse rows to chat messages (`parseMemoriesToMessages`)
   - tool-call rows use `buildToolCallMessageState(...)` so replayed chats reconstruct the same display payload used by live tool-call rows
   - stored transcript field extraction is centralized in `storedTranscriptMemoryState.js` so dashboard replay and backend rehydrate read the same role/message-type/tool/screenshot/transparency inputs from transcript memories
   - final past-chat message shaping is centralized in `storedTranscriptChatMessageState.js` so screenshot fields, transparency sections, and tool display metadata no longer live in a dashboard-local formatter
4. send backend rehydrate payload (`ApiClient.sendRehydrateConversation`)
   - `toRehydrateMessagePayload(...)` appends persisted `transparency` snapshots to rehydrate `content` so resumed/manual compaction runs see saved prompt/tool-schema/full-message context.
   - tool-call rows reuse the same normalized message-state helper before `buildRehydrateToolCall(...)` so transcript/session serialization and dashboard replay cannot drift on tool-call ids or display text
   - final rehydrate payload shaping is centralized in `rehydrateMessageState.js` so dashboard-open rehydrate and edit/retry replay agree on `tool_name`, `tool_call_id`, screenshots, and structured tool payload fallback
5. set active transcript conversation/session info
6. replace renderer chat store with parsed rows

Search modal uses the same open path after `search-conversations` results.

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

This contract prevents provider tool-call sequencing errors without losing valid tool context.

## Main/Sidecar Contract for Transcript Storage

Renderer `STORE_TRANSCRIPT` invoke path:

- main mapped handler: `store-transcript` -> JSON-RPC `store_transcript`
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

1. inspect rehydrate payload mapping (`toRehydrateMessagePayload`)
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
- [Transcript Storage, Semantic Candidate, and Watermark Reference](../sidecar/memory/transcript_storage_semantic_candidate_and_watermark_reference.md)
