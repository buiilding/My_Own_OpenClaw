---
summary: "Frontend sidecar memory docs sub-hub for transcript storage, async conversation-title generation, summarizer cadence, watermark progression, and unsemanticized conversation-window batching behavior."
read_when:
  - When changing sidecar transcript storage fields, semantic-candidate rules, or summarizer watermark progression logic.
  - When debugging why episodic transcript entries are or are not promoted to semantic memory, or why transcript windows remain untitled/pending.
title: "Frontend Sidecar Memory Docs Hub"
---

# Frontend Sidecar Memory Docs Hub

## Deep Pages

- [Memory Search Grouping and Transcript Pair Synthesis Contract Reference](memory_search_grouping_and_transcript_pair_synthesis_contract_reference.md)
- [Memory Storage Docs Hub](storage/README.md)
- [Summarizer Watermark and Conversation Batch Reference](summarizer_watermark_and_conversation_batch_reference.md)
- [Transcript Storage, Semantic Candidate, and Watermark Reference](transcript_storage_semantic_candidate_and_watermark_reference.md)
- [Local Memory Store Embedding, Search, and Memory-Type Routing Reference](storage/local_memory_store_embedding_search_and_memory_type_routing_reference.md)
- [Conversation Search Helper Term, Snippet, Grouping, and Timestamp Contract Reference](storage/conversation_search_helper_term_snippet_grouping_and_timestamp_contract_reference.md)
- [Conversation Search Runtime FTS, Semantic Fusion, and Summary-Fetch Contract Reference](storage/conversation_search_runtime_fts_semantic_fusion_and_summary_fetch_contract_reference.md)
- [Conversation Title Generation Runtime and Helper Contract Reference](storage/conversation_title_generation_runtime_and_helper_contract_reference.md)
- [Conversation Heuristic Title Derivation, Sanitization, and Truncation Contract Reference](storage/conversation_heuristic_title_derivation_sanitization_and_truncation_contract_reference.md)
- [Conversation Transcript Window Queries and FAISS Artifact Cleanup Reference](storage/conversation_transcript_window_queries_and_faiss_artifact_cleanup_reference.md)
- [SQLite Schema Migration, FAISS Index I/O, and Watermark State Reference](storage/sqlite_schema_migration_faiss_index_and_watermark_state_reference.md)

## Related Pages

- [Sidecar Memory Pipeline and Summarization](../memory_pipeline_and_summarization.md)
- [Memory Service JSON Protocol and Store Lifecycle Reference](../services/memory_service_json_protocol_and_store_lifecycle_reference.md)

## Code Scope

- `frontend/src/main/python/memory/summarizer.py`
- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/operations.py`
- `frontend/src/main/python/memory/conversation_search_helpers.py`
- `frontend/src/main/python/memory/conversation_search_runtime.py`
- `frontend/src/main/python/memory/conversation_titles.py`
- `frontend/src/main/python/memory/conversation_title_helpers.py`
- `frontend/src/main/python/memory/sqlite_store.py`
- `frontend/src/main/python/memory/faiss_index.py`
- `frontend/src/main/python/memory/watermark_state.py`
- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/local_backend_memory_handlers.py`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/python/core/remote_semantic_client.py`
- `frontend/src/main/python/core/remote_title_client.py`
- `tests/sidecar/test_memory_summarizer.py`
- `tests/sidecar/test_conversation_search.py`
- `tests/sidecar/test_conversation_search_helpers.py`
- `tests/sidecar/test_conversation_search_runtime.py`
- `tests/sidecar/test_conversation_titles.py`
- `tests/sidecar/test_conversation_title_helpers.py`
- `tests/sidecar/test_remote_title_client.py`
- `tests/sidecar/test_local_store_delete_cleanup.py`
- `tests/sidecar/test_local_backend.py`
