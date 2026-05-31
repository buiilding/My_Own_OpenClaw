---
summary: "Sidecar local memory guide covering LocalBackend memory handlers, LocalMemoryStore, SQLite/FAISS storage, semanticization, titles, and remote semantic clients."
read_when:
  - When changing local memory JSON-RPC handlers, memory search/list/delete, semantic summarization, title generation, or sidecar memory storage.
  - When debugging local memory search, dashboard memory sections, conversation titles, or semantic memory generation.
title: "Sidecar Local Memory"
---

# Sidecar Local Memory

The sidecar owns local memory persistence and search. Renderer and Electron main call it through local-backend JSON-RPC; backend code must not import sidecar memory code.

## Code Ownership

| Concern | Files |
| --- | --- |
| JSON-RPC handlers | `frontend/src/main/python/local_backend_memory_handlers.py` |
| Local store | `frontend/src/main/python/memory/local_store.py`, `sqlite_store.py` |
| Memory operations | `frontend/src/main/python/memory/operations.py`, `record_kinds.py` |
| Search/list/title runtime | `conversation_search_runtime.py`, `conversation_list_runtime.py`, `conversation_title_runtime.py` |
| Semanticization | `conversation_semanticization_runtime.py`, `conversation_window_runtime.py`, `summarizer.py`, `watermark_state.py` |
| Indexing | `faiss_index.py`, `transcript_embedding_policy.py` |
| Remote helpers | `frontend/src/main/python/core/remote_embedding_client.py`, `remote_semantic_client.py`, `remote_title_client.py` |

## Handler Contract

`LocalBackendMemoryHandlersMixin` provides memory-specific JSON-RPC methods. Handlers must return the canonical failure shape when the memory store is unavailable:

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

Conversation title generation belongs in sidecar memory title runtime and remote title client helpers. Title failures should not block transcript persistence or conversation listing.

## Tests

```bash
./scripts/python-in-env sidecar python -m pytest tests/sidecar/test_local_backend.py tests/sidecar/test_memory_operations.py tests/sidecar/test_memory_summarizer.py -q
./scripts/test-sidecar tests/sidecar/test_conversation_search.py tests/sidecar/test_conversation_list_runtime.py tests/sidecar/test_conversation_title_runtime.py -q
./scripts/test-sidecar tests/sidecar/test_remote_embedding_client.py tests/sidecar/test_remote_semantic_client.py tests/sidecar/test_remote_title_client.py -q
```
