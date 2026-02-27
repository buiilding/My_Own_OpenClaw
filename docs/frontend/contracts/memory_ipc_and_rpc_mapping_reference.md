---
summary: "Renderer/main/sidecar memory contract reference: invoke-channel payload shapes, main-process JSON-RPC method mappings, response envelopes, and transcript/semantic memory operation semantics."
read_when:
  - When changing memory-related IPC invoke payloads or sidecar JSON-RPC method contracts.
  - When debugging dashboard memory list/delete failures, transcript persistence issues, or search-memory filter mismatches.
title: "Memory IPC and RPC Mapping Reference"
---

# Memory IPC and RPC Mapping Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `frontend/src/renderer/features/dashboard/components/sections/MemorySection.jsx`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/memory/operations.py`
- `frontend/src/main/python/memory/local_store.py`

## Invoke Channels Covered

Memory-related `invoke` channels exposed to renderer:

- `store-transcript`
- `search-conversations`
- `list-conversations`
- `list-episodic-memories`
- `get-conversation`
- `delete-conversation`
- `list-semantic-memories`
- `delete-semantic-memory`
- `store-memory`
- `search-memory`

Current primary renderer call sites:

- `TranscriptWriter` -> `store-transcript`
- `ChatGptDashboardShell` + `DashboardSidebar` + `SearchChatsModal` -> search/list/get transcript conversations
- `MemorySection` -> list episodic memory entries + list/delete semantic memory

## Main-Process Mapping Layer

`local_backend_bridge.cjs` registers mapped RPC handlers from `COMPILED_RPC_HANDLER_DEFINITIONS`.

Mapping helper behavior:

- only object payloads are accepted (`getPayloadObject`)
- supports direct key mapping, function mapping, and fallback-key mapping

## Channel -> JSON-RPC Method Map

### Conversation and semantic list/delete

- `search-conversations` -> `search_conversations`
- `list-conversations` -> `list_conversations`
- `list-episodic-memories` -> `list_episodic_memories`
- `get-conversation` -> `get_conversation`
- `delete-conversation` -> `delete_conversation`
- `list-semantic-memories` -> `list_semantic_memories`
- `delete-semantic-memory` -> `delete_semantic_memory`

Renderer camelCase to sidecar snake_case conversions:

- `userId` -> `user_id`
- `conversationId` -> `conversation_id`
- `recordKind` -> `record_kind`
- `memoryId` -> `memory_id`

`search-conversations` field mapping:

- `query`
- `userId` -> `user_id`
- `limit`

### Transcript and memory write methods

- `store-transcript` -> `store_transcript`
- `store-memory` -> `store_memory`

`store-transcript` field mapping:

- `content`
- `userId` -> `user_id`
- `conversationRef` -> `conversation_ref`
- `role`
- `messageType` -> `message_type`
- `toolName` -> `tool_name`
- `correlationId` -> `correlation_id`
- `messageIndex` -> `message_index`
- `modelId` -> `model_id`
- `modelProvider` -> `model_provider`
- `screenshot`
- `timestamp`

### Search-memory mapping detail

`mapSearchMemoryPayload` supports both keys for exclusion:

- camel: `excludeConversationId`
- snake: `exclude_conversation_id`

Output always sends `exclude_conversation_id` to sidecar method `search_memory`.

## Sidecar JSON-RPC Response Envelope

Sidecar memory handlers return shape:

- success path:
  - `{ "success": true, "data": { ... } }`
- failure path:
  - `{ "success": false, "error": "<message>" }`

`local_backend_bridge.cjs` forwards this object to renderer unchanged for mapped channels.

## Sidecar Handler Semantics (Memory)

### Memory-store availability guard

Decorator `@requires_memory_store` gates most memory handlers:

- if store unavailable: immediate `{success:false,error:"Memory store not initialized"}`

### `list_conversations`

- transcript-only behavior (non-transcript `record_kind` ignored/normalized)
- newest-first by last timestamp
- includes `is_resumable` when `conversation_id` starts with `conv_`
- includes `title` and `title_source` (`model` for model-generated titles)
- title generation is best-effort, asynchronous, and only starts after both first user and first assistant `llm-text` transcript rows exist for a conversation
- untitled conversations are not returned until generation completes

### `search_conversations`

- transcript-only query surface (searches user/assistant transcript message content, not just titles)
- ranking blends lexical hits (FTS with LIKE fallback), semantic vector hits, and recency
- returns conversation summaries plus match metadata (`snippet`, `matched_role`, lexical/semantic hit counts, score)

### `list_episodic_memories`

- returns episodic memory entries while excluding transcript conversation rows
- keeps chat history ownership in sidebar `Your chats`
- returns newest-first by timestamp

### `get_conversation`

- fetches episodic transcript rows by conversation window
- returns `{conversation_id, memories[], count}`

### `delete_conversation`

- deletes transcript rows for conversation (or null-conversation bucket)
- returns `deleted_count`
- cleans in-memory FAISS ID mappings for removed rows

### `list_semantic_memories`

- returns semantic records newest-first with parsed metadata

### `delete_semantic_memory`

- requires `memory_id`
- returns boolean `deleted`
- removes DB row + vector-id mappings (no FAISS vector compaction)

### `store_transcript`

- stores transcript row with metadata fields and optional screenshot
- computes/assigns `message_index` when omitted
- marks semantic candidate only for selected roles/message types
- sets `skip_embedding` for non-candidate rows
- does not drive semantic-summarization run gating

### `store_memory`

- stores combined interaction text (`User: ... / Assistant: ...`)
- attaches interaction metadata and optional session/conversation id
- writes episodic rows with `record_kind='interaction'` for semantic-summarization source input

## Contract Edge Cases

- sidecar defaults many handlers to `user_id="default_user"` when omitted
- renderer dashboard and transcript flows typically provide explicit `userId`
- `conversationRef` and `sessionId` may both feed transcript conversation identity; sidecar resolves `conversation_ref or session_id`

## Debug Checklist

If dashboard memory actions fail with generic errors:

1. inspect renderer payload key names (camelCase expected at renderer boundary)
2. inspect mapper output in `local_backend_bridge_rpc_mappers.cjs`
3. verify sidecar returned `success=true` and non-empty `data`

If transcript rows fail to persist:

1. verify `store-transcript` invoke includes both `content` and `userId`
2. verify sidecar memory store initialized
3. verify conversation/user identity resolution in `TranscriptWriter`

If search results include active conversation unexpectedly:

1. verify exclusion key name (`excludeConversationId` or `exclude_conversation_id`)
2. verify mapped output contains `exclude_conversation_id`
3. verify sidecar `exclude_conversation_results` received matching conversation id

## Related Pages

- [Local Backend JSON-RPC Reference](../sidecar/local_backend_jsonrpc_reference.md)
- [Transcript Storage, Semantic Candidate, and Watermark Reference](../sidecar/memory/transcript_storage_semantic_candidate_and_watermark_reference.md)
- [Transcript Session and Rehydrate Reference](../renderer/transcript_session_and_rehydrate_reference.md)
