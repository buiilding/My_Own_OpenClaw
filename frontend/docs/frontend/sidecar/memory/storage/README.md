---
summary: "Local-runtime memory storage docs sub-hub for LocalMemoryStore routing/search internals, SDK-provided embeddings, transcript-window queries, FAISS artifact cleanup, and schema/index/watermark persistence contracts."
read_when:
  - When changing `frontend/src/main/python/memory/local_store.py` behavior beyond summarizer-only logic.
  - When debugging memory type routing, vector mapping/index drift, transcript conversation window ordering, title drift, or watermark persistence issues.
title: "Local Runtime Memory Storage Docs Hub"
---

# Local Runtime Memory Storage Docs Hub

## Deep Pages

- [Local Memory Store Embedding, Search, and Memory-Type Routing Reference](local_memory_store_embedding_search_and_memory_type_routing_reference.md)
- [Conversation Search Helper Term, Snippet, Grouping, and Timestamp Contract Reference](conversation_search_helper_term_snippet_grouping_and_timestamp_contract_reference.md)
- [History DB UI Read Model Reference](history_db_ui_read_model_reference.md)
- [SQLite Schema Migration, FAISS Index I/O, and Watermark State Reference](sqlite_schema_migration_faiss_index_and_watermark_state_reference.md)

## Related Pages

- [Local Runtime Memory Docs Hub](../README.md)
- [Memory Pipeline and Summarization](../../memory_pipeline_and_summarization.md)
- [Summarizer Watermark and Conversation Batch Reference](../summarizer_watermark_and_conversation_batch_reference.md)

## Code Scope

- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/conversation_search_helpers.py`
- `frontend/src/main/python/memory/conversation_semanticization_runtime.py`
- `frontend/src/main/python/memory/conversation_title_store.py`
- `frontend/src/main/python/memory/conversation_window_runtime.py`
- `frontend/src/main/python/memory/chat_event_store.py`
- `frontend/src/main/python/memory/sqlite_store.py`
- `frontend/src/main/python/memory/faiss_index.py`
- `frontend/src/main/python/memory/watermark_state.py`
- `frontend/src/main/python/memory/operations.py`
- `tests/sidecar/test_local_store_delete_cleanup.py`
- `tests/sidecar/test_conversation_search_helpers.py`
- `tests/sidecar/test_chat_event_store.py`
- `tests/sidecar/test_conversation_semanticization_runtime.py`
- `tests/sidecar/test_conversation_window_runtime.py`
- `tests/sidecar/test_memory_summarizer.py`
- `tests/sidecar/test_chat_event_store.py`
- `tests/sidecar/test_local_backend.py`
