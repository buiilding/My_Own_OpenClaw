---
summary: "Renderer/main/sidecar memory and chat-event IPC contract reference: invoke-channel payload shapes, JSON-RPC method mappings, response envelopes, and storage ownership."
read_when:
  - When changing memory-related IPC invoke payloads or sidecar JSON-RPC method contracts.
  - When debugging dashboard memory list/delete failures, chat history persistence issues, or search-memory filter mismatches.
title: "Memory IPC and RPC Mapping Reference"
---

# Memory IPC and RPC Mapping Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/renderer/infrastructure/transcript/localConversationStore.ts`
- `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/local_backend_memory_handlers.py`
- `frontend/src/main/python/memory/chat_event_store.py`
- `frontend/src/main/python/memory/local_store.py`

## Active Invoke Channels

Chat-event storage and continuity:

- `store-chat-event`
- `list-chat-conversations`
- `search-chat-conversations`
- `get-chat-events`
- `delete-chat-conversation`

Memory storage and retrieval:

- `store-memory`
- `search-memory`
- `list-episodic-memories`
- `list-semantic-memories`
- `delete-episodic-memory`
- `delete-semantic-memory`
- `clear-local-memory`
- `clear-chat-history`

Chat history is stored in `chat_events`, not as memory rows. Memory rows are for episodic interaction memory and semantic memory.

## Channel to JSON-RPC Method Map

Chat-event channels:

- `store-chat-event` -> `store_chat_event`
- `list-chat-conversations` -> `list_chat_conversations`
- `search-chat-conversations` -> `search_chat_conversations`
- `get-chat-events` -> `get_chat_events`
- `delete-chat-conversation` -> `delete_chat_conversation`

Memory channels:

- `store-memory` -> `store_memory`
- `search-memory` -> `search_memory`
- `list-episodic-memories` -> `list_episodic_memories`
- `list-semantic-memories` -> `list_semantic_memories`
- `delete-episodic-memory` -> `delete_episodic_memory`
- `delete-semantic-memory` -> `delete_semantic_memory`
- `clear-local-memory` -> `clear_local_memory`
- `clear-chat-history` -> `clear_chat_history`
- `replace-chat-conversation` -> `replace_chat_conversation`

Renderer camelCase to sidecar snake_case conversions include:

- `userId` -> `user_id`
- `conversationId` / `conversationRef` -> `conversation_id`
- `memoryId` -> `memory_id`
- `eventType` -> `event_type`
- `messageIndex` -> `message_index`
- `revisionId` -> `revision_id`
- `turnRef` -> `turn_ref`
- `toolName` -> `tool_name`
- `correlationId` -> `correlation_id`
- `workspacePath` -> `workspace_path`
- `workspaceName` -> `workspace_name`
- `eventPayload` -> `event_payload`
- `compactionCheckpoint` -> `compaction_checkpoint`

## Storage Ownership

- `chat_events`: visible chat replay, conversation list/search, rehydrate snapshots, edit/resend continuity, attachments, and compaction checkpoints.
- `episodic.db` memory rows with `record_kind='interaction'`: completed user+assistant memory pairs used by the Episodic Memory view and semantic summarizer.
- `semantic.db` memory rows: extracted durable facts and summaries.

Renderer transcript projection clients now route through the SDK conversation continuity service and the sidecar-backed chat-event store. The legacy transcript-row IPC/RPC path has been removed.

## Sidecar Response Envelope

Sidecar memory handlers return:

- success: `{ "success": true, "data": { ... } }`
- failure: `{ "success": false, "error": "<message>" }`

The main-process bridge forwards mapped responses to the renderer unchanged.

## Key Handler Semantics

### `store_chat_event`

- appends or replaces an event in `chat_events`
- stores metadata, attachments, full event payload, and optional compaction checkpoint
- assigns `message_index` when omitted

### `replace_chat_conversation`

- atomically replaces all `chat_events` rows for one user conversation
- accepts the same event fields as `store_chat_event`, batched in `events`
- uses the provided `message_index` values to preserve replacement order
- rolls back the delete if any replacement event cannot be inserted

### `list_chat_conversations`

- groups `chat_events` by `conversation_id`
- returns newest-first conversation summaries with title derived from the first user message or latest content
- returns `record_kind='chat_event'`

### `get_chat_events`

- returns ordered events for one conversation
- supports `after_message_index` cursor pagination

### `delete_chat_conversation`

- deletes `chat_events` for one conversation
- does not delete episodic or semantic memory rows

### `store_memory`

- persists completed user+assistant interaction memory
- writes episodic rows with `record_kind='interaction'`
- rejects non-string or blank user/assistant payloads

### `search_memory`

- retrieves relevant episodic and semantic memory for prompt injection
- excludes active conversation ids when requested
- groups memory text without depending on chat-event replay rows

## Debug Checklist

If chats do not reload:

1. verify renderer calls `list-chat-conversations` and `get-chat-events`
2. inspect mapper output in `local_backend_bridge_rpc_mappers.cjs`
3. verify sidecar memory store is initialized and `chat_events` rows exist

If memory injection is empty:

1. verify the SDK context enrichment pipeline called backend embeddings before query send
2. verify the SDK completed-turn handler called `store-memory` after assistant completion
3. verify embedding service health and FAISS/SQLite vector mappings

## Related Pages

- [Local Backend JSON-RPC Reference](../sidecar/local_backend_jsonrpc_reference.md)
- [Transcript Session and Rehydrate Reference](../renderer/transcript_session_and_rehydrate_reference.md)
