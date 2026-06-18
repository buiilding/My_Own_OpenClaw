---
summary: "Sidecar local memory guide covering episodic and semantic memory, LocalRuntimeService memory handlers, LocalMemoryStore, SQLite/FAISS storage, SDK-provided embeddings, semanticization, titles, and remote semantic clients."
read_when:
  - When changing sidecar episodic or semantic memory, local memory JSON-RPC handlers, memory search/list/delete, semantic summarization, title generation, or sidecar memory storage.
  - When debugging local memory search, dashboard memory sections, conversation titles, or semantic memory generation.
title: "Sidecar Local Memory"
---

# Sidecar Local Memory

The Python sidecar owns local episodic and semantic memory persistence and search.
Renderer and Electron main call it through the SDK local-runtime JSON-RPC path;
backend code must not import sidecar memory code.

## Code Ownership

| Concern | Files |
| --- | --- |
| JSON-RPC handlers | `frontend/src/main/python/local_backend_memory_handlers.py` |
| Local store | `frontend/src/main/python/memory/local_store.py`, `sqlite_store.py` |
| Memory operations | `frontend/src/main/python/memory/operations.py`, `record_kinds.py` |
| Search/list/title storage | `conversation_search_helpers.py`, `chat_event_store.py`, `conversation_title_store.py` |
| Semanticization | `conversation_semanticization_runtime.py`, `conversation_window_runtime.py`, `summarizer.py`, `watermark_state.py` |
| Indexing | `faiss_index.py`, `transcript_embedding_policy.py` |
| Remote helpers | `frontend/src/main/python/core/remote_semantic_client.py` |

## Handler Contract

`LocalRuntimeMemoryHandlersMixin` provides memory-specific JSON-RPC methods. Handlers must return the canonical failure shape when the memory store is unavailable:

```json
{"success": false, "error": "Memory store not initialized"}
```

Transcript transparency and structured payloads are sanitized and dropped if they are not JSON-serializable.

## Semanticization

The summarizer converts episodic interaction memories into semantic memory in the background.

Default behavior:

- wakes on new memory,
- checks DB counts before running,
- waits for enough pending work or idle time,
- batches by user and conversation,
- backs off after failures,
- stores semanticization metadata,
- keeps local memory writes non-fatal when remote semantic services fail.

Do not use semanticization as the primary transcript persistence path. It is derived, delayed, and best-effort.

## Titles

Conversation title storage, title-state reads, and conversation-list fallback
belong in sidecar memory storage and JSON-RPC handlers. Hosted title generation belongs to the
SDK/backend route path: after the first completed user plus assistant text
exchange, the SDK may call the hosted title route and persist the generated
title back through `update_conversation_title`.

The sidecar must not call hosted title routes directly. It only persists durable
titles, reports title state through `get_conversation_title_state`, emits
`conversation-title-updated`, and lists conversations with the fallback order
`stored title -> first user message -> conversation id`. Title failures should
not block transcript persistence or conversation listing.

## Tests

```bash
./scripts/python-in-env sidecar python -m pytest tests/sidecar/test_local_backend.py tests/sidecar/test_memory_operations.py tests/sidecar/test_memory_summarizer.py -q
<windie> test sidecar tests/sidecar/test_conversation_search_helpers.py tests/sidecar/test_chat_event_store.py tests/sidecar/test_conversation_window_runtime.py -q
<windie> test sidecar tests/sidecar/test_remote_semantic_client.py -q
```
