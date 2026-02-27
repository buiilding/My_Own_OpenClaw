---
summary: "Frontend sidecar memory storage docs sub-hub for LocalMemoryStore routing/search internals, transcript title-generation lifecycle, transcript-window queries, FAISS artifact cleanup, and schema/index/watermark persistence contracts."
read_when:
  - When changing `frontend/src/main/python/memory/local_store.py` behavior beyond summarizer-only logic.
  - When debugging memory type routing, vector mapping/index drift, transcript conversation window ordering, title-generation drift, or watermark persistence issues.
title: "Frontend Sidecar Memory Storage Docs Hub"
---

# Frontend Sidecar Memory Storage Docs Hub

## Deep Pages

- [Local Memory Store Embedding, Search, and Memory-Type Routing Reference](local_memory_store_embedding_search_and_memory_type_routing_reference.md)
- [Conversation Search Helper Term, Snippet, Grouping, and Timestamp Contract Reference](conversation_search_helper_term_snippet_grouping_and_timestamp_contract_reference.md)
- [Conversation Search Runtime FTS, Semantic Fusion, and Summary-Fetch Contract Reference](conversation_search_runtime_fts_semantic_fusion_and_summary_fetch_contract_reference.md)
- [Conversation Title Generation Runtime and Helper Contract Reference](conversation_title_generation_runtime_and_helper_contract_reference.md)
- [Conversation Heuristic Title Derivation, Sanitization, and Truncation Contract Reference](conversation_heuristic_title_derivation_sanitization_and_truncation_contract_reference.md)
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
- `frontend/src/main/python/memory/conversation_list_runtime.py`
- `frontend/src/main/python/memory/conversation_search_helpers.py`
- `frontend/src/main/python/memory/conversation_search_runtime.py`
- `frontend/src/main/python/memory/conversation_semanticization_runtime.py`
- `frontend/src/main/python/memory/conversation_titles.py`
- `frontend/src/main/python/memory/conversation_title_helpers.py`
- `frontend/src/main/python/memory/conversation_title_runtime.py`
- `frontend/src/main/python/memory/conversation_window_runtime.py`
- `frontend/src/main/python/memory/sqlite_store.py`
- `frontend/src/main/python/memory/faiss_index.py`
- `frontend/src/main/python/memory/watermark_state.py`
- `frontend/src/main/python/memory/operations.py`
- `frontend/src/main/python/core/remote_title_client.py`
- `tests/sidecar/test_local_store_delete_cleanup.py`
- `tests/sidecar/test_conversation_list_runtime.py`
- `tests/sidecar/test_conversation_search.py`
- `tests/sidecar/test_conversation_search_helpers.py`
- `tests/sidecar/test_conversation_search_runtime.py`
- `tests/sidecar/test_conversation_semanticization_runtime.py`
- `tests/sidecar/test_conversation_titles.py`
- `tests/sidecar/test_conversation_title_helpers.py`
- `tests/sidecar/test_conversation_title_runtime.py`
- `tests/sidecar/test_conversation_window_runtime.py`
- `tests/sidecar/test_remote_title_client.py`
- `tests/sidecar/test_memory_summarizer.py`
- `tests/sidecar/test_memory_service.py`
