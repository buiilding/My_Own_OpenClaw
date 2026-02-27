---
summary: "Frontend sidecar memory storage docs sub-hub for LocalMemoryStore routing/search internals, transcript-window lifecycle queries, FAISS artifact cleanup, and schema/index/watermark persistence contracts."
read_when:
  - When changing `frontend/src/main/python/memory/local_store.py` behavior beyond summarizer-only logic.
  - When debugging memory type routing, vector mapping/index drift, transcript conversation window ordering, or watermark persistence issues.
title: "Frontend Sidecar Memory Storage Docs Hub"
---

# Frontend Sidecar Memory Storage Docs Hub

## Deep Pages

- [Local Memory Store Embedding, Search, and Memory-Type Routing Reference](local_memory_store_embedding_search_and_memory_type_routing_reference.md)
- [Conversation Transcript Window Queries and FAISS Artifact Cleanup Reference](conversation_transcript_window_queries_and_faiss_artifact_cleanup_reference.md)
- [SQLite Schema Migration, FAISS Index I/O, and Watermark State Reference](sqlite_schema_migration_faiss_index_and_watermark_state_reference.md)

## Related Pages

- [Frontend Sidecar Memory Docs Hub](../README.md)
- [Memory Pipeline and Summarization](../../memory_pipeline_and_summarization.md)
- [Summarizer Watermark and Conversation Batch Reference](../summarizer_watermark_and_conversation_batch_reference.md)
- [Transcript Storage, Semantic Candidate, and Watermark Reference](../transcript_storage_semantic_candidate_and_watermark_reference.md)
- [Memory Service JSON Protocol and Store Lifecycle Reference](../../services/memory_service_json_protocol_and_store_lifecycle_reference.md)

## Code Scope

- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/conversation_search_helpers.py`
- `frontend/src/main/python/memory/sqlite_store.py`
- `frontend/src/main/python/memory/faiss_index.py`
- `frontend/src/main/python/memory/watermark_state.py`
- `frontend/src/main/python/memory/operations.py`
- `tests/sidecar/test_local_store_delete_cleanup.py`
- `tests/sidecar/test_conversation_search.py`
- `tests/sidecar/test_conversation_search_helpers.py`
- `tests/sidecar/test_memory_summarizer.py`
- `tests/sidecar/test_memory_service.py`
