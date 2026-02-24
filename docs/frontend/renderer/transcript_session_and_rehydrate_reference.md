---
summary: "Renderer transcript runtime reference: session identity state, queued transcript write semantics, IPC storage contract, and episodic-memory rehydrate flow back into live chat."
read_when:
  - When changing transcript write behavior, session identity wiring, or `store-transcript` payload shape.
  - When debugging missing transcript rows, stuck pending transcript queues, or resume-conversation rehydrate mismatches.
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
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/utils/newChatSession.ts`
- `frontend/src/renderer/features/dashboard/components/sections/EpisodicMemorySection.jsx`
- `frontend/src/renderer/features/dashboard/hooks/useTranscriptSessionInfo.js`
- `frontend/src/renderer/features/dashboard/utils/episodicMemoryUtils.js`
- `frontend/src/renderer/infrastructure/api/client.ts`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`

## Session Identity Model (Renderer)

Transcript writes depend on two values:

- `conversationRef`
- `userId`

`createTranscriptSessionState(...)` stores them in-memory with lazy storage bootstrap:

- first read loads from `sessionStorage` key `transcript-session-info`
- legacy fallback accepts stored `sessionId` as conversation ref
- repeated reads are in-memory (no repeated storage parse)

Update semantics:

- `update(conversationRef?, userId?)`
- conversation ref can be set to `null` explicitly
- user ID only changes when truthy (empty/undefined does not overwrite existing user ID)

## Persist + Broadcast Behavior

`TranscriptWriter` persists session info and emits browser event only when either field changed:

- writes to `sessionStorage`
- dispatches `window` custom event: `transcript-session-update`

Dashboard consumers subscribe via `useSyncExternalStore` (`useTranscriptSessionInfo`), with referentially stable snapshots to avoid unnecessary rerenders.

## Transcript Write API Surface

Public writer entrypoints:

- `recordUserMessage(...)`
- `recordAssistantMessage(...)`
- `recordToolMessage(...)`

Each path:

1. resolve session identity from explicit options + current session state
2. if `conversationRef` or `userId` missing, enqueue for retry and return
3. otherwise invoke main IPC `store-transcript` immediately

Stored fields include:

- `content`, `role`, `messageType`
- `toolName`, `correlationId` (tool paths)
- `conversationRef`, `userId`
- optional `modelId`, `modelProvider`, `timestamp`
- `screenshotRef` sent under IPC key `screenshot`

## Queue and Retry Semantics

Three independent FIFO queues exist:

- user queue
- assistant queue
- tool queue

Flush behavior (`flushPendingMessages`):

- runs only when session state updates (`updateTranscriptSession` or `setActiveConversationRef`)
- no-op if identity is incomplete or all queues empty
- flush order is fixed: user -> assistant -> tool
- if one category fails mid-flush, remaining messages in that category are requeued; later categories are not flushed in that pass

Immediate store failures also requeue per message category.

## Call-Site Wiring Across Renderer

### User identity seeding

`AppConfigProvider` updates transcript session user ID from:

- `ipc-status` push events
- initial `get-client-user-id` invoke response

This is the main path that unlocks queued transcript writes after app startup/reconnect.

### New turn + user row

`useChatMessageSender`:

- ensures active conversation ref exists (creates one if missing)
- records user transcript row with timestamp and optional screenshot ref

`startNewChatSession(...)`:

- clears chat state and sets a fresh conversation ref via `setActiveConversationRef(...)`

### Stream + tool rows

`useChatStream`:

- refreshes transcript session identity on each accepted backend event
- records tool-call/tool-output rows
- records assistant rows on `streaming-complete` and `error`

`useToolRunner` records frontend-side tool execution rows as tool messages.

## Episodic Memory Resume and Rehydrate Flow

`EpisodicMemorySection` integrates transcript persistence with replay/resume:

1. list conversations via `list-conversations` (record kind `transcript`)
2. load selected conversation via `get-conversation`
3. transform stored memories to chat messages for preview (`parseMemoriesToMessages`)
4. on Continue:
   - send `rehydrate-conversation` via `ApiClient.sendRehydrateConversation(...)`
   - map memory rows into backend shape (`role/content/message_type/tool_name/correlation_id/timestamp`)
   - preserve screenshot payload as either inline base64 (`screenshot`) or ref (`screenshot_ref`)
   - set active transcript conversation + session state
   - hydrate chat store with parsed messages and switch UI back to chat

Non-resumable legacy conversations are shown as view-only.

## Main/Sidecar Contract for Transcript Storage

Renderer `INVOKE_CHANNELS.STORE_TRANSCRIPT` goes through main local-backend bridge:

- main registers mapped RPC handlers (`registerMappedRpcHandlers(...)`)
- channel `store-transcript` -> JSON-RPC method `store_transcript`
- mapper converts camelCase payload into snake_case backend params:
  - `conversationRef` -> `conversation_ref`
  - `userId` -> `user_id`
  - `messageType` -> `message_type`
  - `toolName` -> `tool_name`
  - `correlationId` -> `correlation_id`
  - `modelId` -> `model_id`
  - `modelProvider` -> `model_provider`

Conversation list/get/delete flows use the same mapped-handler pipeline:

- `list-conversations` -> `list_conversations`
- `get-conversation` -> `get_conversation`
- `delete-conversation` -> `delete_conversation`

## Debug Checklist

If transcript rows never appear:

1. verify transcript session has both `conversationRef` and `userId`
2. verify `updateTranscriptSession(...)` runs after IPC status / backend events
3. inspect console warnings for immediate store failures or requeue logs

If pending rows never drain:

1. verify session identity actually changes (flush only runs on update calls)
2. verify no repeated failure in earliest queue category (user queue blocks later categories in one pass)
3. verify main local-backend bridge readiness (`Local backend not ready`)

If resumed conversation loses screenshots/tool linkage:

1. inspect rehydrate mapping in `toRehydrateMessage(...)`
2. verify inline image vs ref detection (base64 vs artifact id)
3. verify `correlation_id` and `tool_name` fields survive list/get round-trip

## Related Pages

- [Frontend Renderer Transcript Docs Hub](transcript/README.md)
- [Transcript Writer Queue Flush and Session Event Reference](transcript/transcript_writer_queue_flush_and_session_event_reference.md)
- [Memory IPC and RPC Mapping Reference](../contracts/memory_ipc_and_rpc_mapping_reference.md)
- [Transcript Storage, Semantic Candidate, and Watermark Reference](../sidecar/memory/transcript_storage_semantic_candidate_and_watermark_reference.md)
