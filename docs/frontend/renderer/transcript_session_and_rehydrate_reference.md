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
- `frontend/src/renderer/infrastructure/transcript/sessionInfoState.ts`
- `frontend/src/renderer/infrastructure/transcript/sessionInfoStorage.ts`
- `frontend/src/renderer/infrastructure/transcript/pendingUserQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pendingAssistantQueue.ts`
- `frontend/src/renderer/infrastructure/transcript/pendingToolQueue.ts`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useConversationReplayActions.js`
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/utils/newChatSession.ts`
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

Dashboard consumers subscribe via `useSyncExternalStore` (`useTranscriptSessionInfo`) for stable snapshot behavior.

## Transcript Write API Surface

Public writer entrypoints:

- `recordUserMessage(...)`
- `recordAssistantMessage(...)`
- `recordToolMessage(...)`

Each path:

1. resolve session identity from explicit options + current session state
2. if missing identity fields, queue for retry and return
3. otherwise invoke `store-transcript` over main IPC bridge

Stored fields include:

- `content`, `role`, `messageType`
- `toolName`, `correlationId` (tool rows)
- `conversationRef`, `userId`
- optional `modelId`, `modelProvider`, `timestamp`
- screenshot ref under IPC key `screenshot`

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

`useToolRunner` records frontend-side tool execution rows.

## Dashboard Resume and Rehydrate Flow

`ChatGptDashboardShell` conversation-open path:

1. list conversations (`list-conversations`, transcript record kind)
2. get selected conversation (`get-conversation`)
3. parse rows to chat messages (`parseMemoriesToMessages`)
4. send backend rehydrate payload (`ApiClient.sendRehydrateConversation`)
5. set active transcript conversation/session info
6. replace renderer chat store with parsed rows

Search modal uses the same open path after `search-conversations` results.

## Try-Again and Edit+Resend Replay Contract

Replay rehydrate must keep prior context stable.

- Keep all prior non-tool transcript rows.
- Keep valid tool history pairs (`tool-call` + matching `tool-output`).
- Remove only orphan tool rows (call without output, output without call).

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
- [Memory IPC and RPC Mapping Reference](../contracts/memory_ipc_and_rpc_mapping_reference.md)
- [Transcript Storage, Semantic Candidate, and Watermark Reference](../sidecar/memory/transcript_storage_semantic_candidate_and_watermark_reference.md)
