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
- `frontend/src/main/ipc/ipc_memory_store_persistence.cjs`
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
- `delete-episodic-memory`
- `delete-semantic-memory`
- `store-memory`
- `search-memory`

Current primary renderer call sites:

- `TranscriptWriter` -> `store-transcript`
- `ChatGptDashboardShell` + `DashboardSidebar` + `SearchChatsModal` -> search/list/get transcript conversations
- `MemorySection` -> list episodic + semantic memory entries + delete episodic/semantic memory

## Main-Process Mapping Layer

`local_backend_bridge.cjs` registers mapped RPC handlers from `COMPILED_RPC_HANDLER_DEFINITIONS`.

Mapping helper behavior:

- only object payloads are accepted (`getPayloadObject`)
- supports direct key mapping, function mapping, and fallback-key mapping

## Backend `memory-store` Event Persistence Boundary

Backend stream events with `type="memory-store"` persist interaction memory in Electron main process via `ipc_memory_store_persistence.cjs`:

- map payload-first fields into `storeMemory(...)` request shape
- default `memory_type` to `episodic`
- derive `session_id` from payload, then envelope `session_id`, then `conversation_ref`
- execute one fire-and-forget side effect per backend event (failure logs only, no throw)

This prevents renderer-window fan-out from producing duplicate `store_memory` writes.

## Channel -> JSON-RPC Method Map

### Conversation and memory list/delete

- `search-conversations` -> `search_conversations`
- `list-conversations` -> `list_conversations`
- `list-episodic-memories` -> `list_episodic_memories`
- `get-conversation` -> `get_conversation`
- `delete-conversation` -> `delete_conversation`
- `list-semantic-memories` -> `list_semantic_memories`
- `delete-episodic-memory` -> `delete_episodic_memory`
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
- `transparency`
  - optional JSON object persisted in transcript metadata
  - currently carries renderer prompt/transparency snapshots (`systemPrompt`, `toolSchemas`, `fullUserMessage`, `fullAssistantMessage`) for richer resume/rehydrate context

### Search-memory mapping detail

`mapSearchMemoryPayload` supports both keys for exclusion:

- camel: `excludeConversationId`
- snake: `exclude_conversation_id`

Output always sends `exclude_conversation_id` to sidecar method `search_memory`.

Search payload validation at sidecar boundary:

- `query` must be a non-empty string (trimmed)
- `memory_type` must be a string when provided and must normalize to `episodic` or `semantic`

Search result shaping detail:

- sidecar `LocalMemoryStore.search(...)` can rewrite episodic transcript user hits into canonical interaction text (`User: ...` + `Assistant: ...`) by resolving the next assistant reply in the same conversation before handler grouping.
- sidecar handler pipeline then applies `exclude_conversation_results(...)` and `group_memory_texts(...)`.
- `group_memory_texts(...)` prioritizes explicit interaction-style episodic rows, falls back to transcript pair synthesis, and only then falls back to raw episodic text.
- grouped response contract remains unchanged: `{ memories: { episodic: [...], semantic: [...] } }`.

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

- returns completed-turn `interaction` memory entries only
- keeps transcript and replay chat-history rows owned by sidebar `Your chats`
- returns newest-first by timestamp

### `get_conversation`

- fetches episodic transcript rows by conversation window
- returns `{conversation_id, memories[], count}`

### `delete_conversation`

- deletes transcript rows for conversation (or null-conversation bucket)
- returns `deleted_count`
- cleans in-memory FAISS ID mappings for removed rows

### `delete_episodic_memory`

- requires `memory_id`
- deletes completed-turn `interaction` memory entry by id
- returns `{ memory_id, deleted }`

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
- rejects non-string `user_query` / `assistant_response` payloads before normalization
- requires `memory_type` to be a string when provided
- trims accepted string values and rejects blank user/assistant message content
- validates `memory_type` strictly (`episodic` or `semantic`); invalid values return an error

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
- [Memory Search Grouping and Transcript Pair Synthesis Contract Reference](../sidecar/memory/memory_search_grouping_and_transcript_pair_synthesis_contract_reference.md)
- [IPC Memory-Store Event Persistence Payload Fallback and Fail-Open Logging Contract Reference](../main/ipc_memory_store_event_persistence_payload_fallback_and_fail_open_logging_contract_reference.md)
- [Transcript Storage, Semantic Candidate, and Watermark Reference](../sidecar/memory/transcript_storage_semantic_candidate_and_watermark_reference.md)
- [Transcript Session and Rehydrate Reference](../renderer/transcript_session_and_rehydrate_reference.md)
