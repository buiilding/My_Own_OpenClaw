---
summary: "Renderer/main/local-runtime memory and chat-event contract reference: SDK-shaped renderer commands, internal local-runtime JSON-RPC bridge handler mappings, response envelopes, and storage ownership."
read_when:
  - When changing memory-related SDK renderer commands, local-runtime bridge handler payloads, or local-runtime JSON-RPC method contracts.
  - When debugging dashboard memory list/delete failures, chat history persistence issues, or embedding memory search mismatches.
title: "Memory IPC and RPC Mapping Reference"
---

# Memory IPC and RPC Mapping Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts`
- `frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/local_backend_memory_handlers.py`
- `frontend/src/main/python/memory/chat_event_store.py`
- `frontend/src/main/python/memory/local_store.py`

## Active Local-Runtime Command Path

Renderer feature code enters through SDK-shaped
`window.agentSdk.invoke(...)` commands. Electron main no longer registers
direct sidecar-named chat or memory IPC handlers for conversation and memory
storage.

Memory storage and retrieval:

- Renderer-facing memory UI uses SDK-shaped `memories.list`,
  `memories.delete`, and `memories.clearAll` commands over
  `window.agentSdk.invoke`.
- Electron main maps those commands to public Agent SDK APIs.
- Python-backed memory RPC names remain implementation details behind the SDK local
  runtime.
- Chat clear uses SDK-shaped `conversations.clearAll` and removes chat-derived
  history rows, display timeline checkpoints, model-history checkpoints,
  revisions, titles, turns, and conversation metadata for the active user.

Chat history is stored in `conversation_events`, not as memory rows. Memory rows are for episodic interaction memory and semantic memory.

## SDK Local-Runtime to JSON-RPC Method Map

The SDK local-runtime store calls these local-runtime JSON-RPC methods behind public
SDK command names:

- `conversation.append_event`
- `conversation.list`
- `conversation.search`
- `conversation.load_events`
- `conversation.get_revision`
- `conversation.delete`
- `conversation.display.replace`
- `conversation.display.load`
- `conversation.model_history.replace`
- `conversation.model_history.load`
- `clear_chat_history`
- `list_episodic_memories`
- `list_semantic_memories`
- `delete_episodic_memory`
- `delete_semantic_memory`
- `clear_local_memory`

Removed text-query memory search:

- `search-memory` no longer maps to `search_memory`.
- `search_memory` is not registered by the Python local runtime.
- prompt memory search uses SDK-owned backend embeddings and
  `search_memory_by_embedding`.

SDK/local-runtime camelCase to Python JSON-RPC snake_case conversions include:

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

- `conversation_events`: visible chat replay, conversation list/search,
  diagnostic/export rehydrate snapshots, edit/resend continuity, attachments,
  and compaction checkpoints.
- `conversation_model_history`: bounded model-facing checkpoints used for
  normal backend resume.
- `conversation_display_timeline`: SDK display checkpoints used by replay,
  edit/resend, retry, and the sidebar fallback when raw events are absent.
- `episodic.db` memory rows with `record_kind='interaction'`: completed user+assistant memory pairs used by the Episodic Memory view and semantic summarizer.
- `semantic.db` memory rows: extracted durable facts and summaries.

Renderer transcript projection clients now route through the SDK conversation
continuity service and the local-runtime-backed chat-event store. The legacy
transcript-row IPC/RPC path has been removed.

Completed-turn memory storage is SDK-owned. The SDK formats the memory text,
calls backend `/api/embeddings/`, and then calls local-runtime
`store_memory_by_embedding` with the content, embedding, embedding space
version, user id, memory type, and conversation id. Electron/renderer IPC does
not expose a direct memory-storage channel.

## Local-Runtime Response Envelope

Local-runtime memory handlers return:

- success: `{ "success": true, "data": { ... } }`
- failure: `{ "success": false, "error": "<message>" }`

SDK local-runtime callers normalize responses before crossing public renderer
command boundaries.

## Key Handler Semantics

### `conversation.append_event`

- appends an event in `conversation_events`
- stores metadata, attachments, full event payload, and optional compaction checkpoint
- assigns `message_index` when omitted

### Display And Model-History Commands

- `conversation.display.replace/load` stores and reads editable display
  timeline checkpoints.
- `conversation.model_history.replace/load` stores and reads bounded
  provider-neutral model-history checkpoints for backend resume.
- These commands do not delete or rewrite `conversation_events` rows. Chat
  history clearing deletes their checkpoint rows because they are
  chat-derived history, not episodic or semantic memory.

### `conversation.list`

- groups `conversation_events` by `conversation_id`
- returns newest-first conversation summaries with title derived from the first user message or latest content
- returns `record_kind='chat_event'`

### `conversation.load_events`

- returns ordered events for one conversation
- supports `after_message_index` cursor pagination

### `conversation.delete`

- deletes `conversation_events` for one conversation
- does not delete episodic or semantic memory rows

### `clear_chat_history`

- deletes all user-scoped chat history surfaces:
  `conversation_events`, `conversation_display_timeline`,
  `conversation_model_history`, `conversation_revisions`,
  `conversation_titles`, `conversation_turns`, and `conversations`
- does not delete episodic or semantic memory rows

### `store_memory_by_embedding`

- persists SDK-formatted interaction memory with a caller-provided embedding
- writes episodic rows with `record_kind='interaction'`
- rejects non-string or blank content and invalid embedding payloads

### `search_memory_by_embedding`

- retrieves relevant episodic and semantic memory for prompt injection
- requires an SDK-provided query embedding
- excludes active conversation ids when requested
- groups memory text without depending on chat-event replay rows

## Debug Checklist

If chats do not reload:

1. verify renderer calls SDK-shaped `conversations.list` and
   `conversation.load`
2. inspect Electron main `windie:invoke` command handling
3. if the SDK command reaches local persistence but data is missing, inspect
   the SDK local-runtime store params sent to the local runtime
4. verify local-runtime memory store is initialized and `conversation_events` rows exist

If memory injection is empty:

1. verify the SDK context enrichment pipeline called backend embeddings before query send
2. verify the SDK completed-turn handler called backend embeddings after assistant completion
3. verify the SDK then called local-runtime `store_memory_by_embedding`
4. verify embedding service health and FAISS/SQLite vector mappings

## Related Pages

- [Local Runtime JSON-RPC Reference](../sidecar/local_backend_jsonrpc_reference.md)
- [Transcript Session and Rehydrate Reference](../renderer/transcript_session_and_rehydrate_reference.md)
