---
summary: "Local-runtime memory implementation docs sub-hub for transcript storage, SDK-provided embeddings, summarizer cadence, watermark progression, and unsemanticized conversation-window batching behavior."
read_when:
  - When changing local-runtime transcript storage fields, semantic-candidate rules, or summarizer watermark progression logic.
  - When debugging why episodic transcript entries are or are not promoted to semantic memory, or why transcript windows remain untitled/pending.
title: "Local Runtime Memory Docs Hub"
---

# Local Runtime Memory Docs Hub

## Deep Pages

- [Memory Storage Docs Hub](storage/README.md)
- [Summarizer Watermark and Conversation Batch Reference](summarizer_watermark_and_conversation_batch_reference.md)
- [Local Memory Store Embedding, Search, and Memory-Type Routing Reference](storage/local_memory_store_embedding_search_and_memory_type_routing_reference.md)
- [Conversation Search Helper Term, Snippet, Grouping, and Timestamp Contract Reference](storage/conversation_search_helper_term_snippet_grouping_and_timestamp_contract_reference.md)
- [SQLite Schema Migration, FAISS Index I/O, and Watermark State Reference](storage/sqlite_schema_migration_faiss_index_and_watermark_state_reference.md)

## Related Pages

- [Local Runtime Memory Pipeline and Summarization](../memory_pipeline_and_summarization.md)

## Code Scope

- `frontend/src/main/python/memory/summarizer.py`
- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/operations.py`
- `frontend/src/main/python/memory/conversation_search_helpers.py`
- `frontend/src/main/python/memory/conversation_title_store.py`
- `frontend/src/main/python/memory/chat_event_store.py`
- `frontend/src/main/python/memory/sqlite_store.py`
- `frontend/src/main/python/memory/faiss_index.py`
- `frontend/src/main/python/memory/watermark_state.py`
- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/local_backend_memory_handlers.py`
- `frontend/src/main/python/core/remote_semantic_client.py`
- `tests/sidecar/test_memory_summarizer.py`
- `tests/sidecar/test_conversation_search_helpers.py`
- `tests/sidecar/test_chat_event_store.py`
- `tests/sidecar/test_chat_event_store.py`
- `tests/sidecar/test_local_store_delete_cleanup.py`
- `tests/sidecar/test_local_backend.py`
