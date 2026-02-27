---
summary: "Deep reference for LocalMemoryStore transcript-window APIs: conversation listing/order/index allocation, semanticization window queries, deletion semantics, and empty-index artifact cleanup."
read_when:
  - When changing sidecar transcript conversation resume/list/delete behaviors or message-index allocation semantics.
  - When debugging stale vector mappings after delete flows, missing transcript windows, or watermark-based unprocessed-memory selection drift.
title: "Conversation Transcript Window Queries and FAISS Artifact Cleanup Reference"
---

# Conversation Transcript Window Queries and FAISS Artifact Cleanup Reference

## Canonical Modules

- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/conversation_list_runtime.py`
- `frontend/src/main/python/memory/conversation_window_runtime.py`
- `frontend/src/main/python/memory/conversation_search_helpers.py`
- `frontend/src/main/python/memory/conversation_title_helpers.py`
- `frontend/src/main/python/memory/watermark_state.py`
- `tests/sidecar/test_local_store_delete_cleanup.py`
- `tests/sidecar/test_conversation_list_runtime.py`
- `tests/sidecar/test_conversation_window_runtime.py`
- `tests/sidecar/test_memory_summarizer.py`
- `tests/sidecar/test_conversation_search.py`
- `tests/sidecar/test_conversation_search_helpers.py`
- `tests/sidecar/test_conversation_titles.py`
- `tests/sidecar/test_conversation_title_helpers.py`

## Transcript Window Query Surface

Transcript-window APIs are episodic-only and transcript-only by design:

- `list_conversations(...)`
- `get_next_message_index(...)`
- `get_episodic_memories_by_conversation(...)`
- `get_unsemanticized_conversation_windows(...)`
- `get_unsemanticized_episodic_memories_by_conversation(...)`
- `get_unsemanticized_episodic_memories(...)`
- `get_unprocessed_memories_after_id(...)`

All these paths enforce `record_kind = 'transcript'` regardless of caller hint values.

Runtime split:

- `conversation_window_runtime.get_next_message_index_for_conversation(...)` owns next-index SQL for transcript windows.
- `conversation_window_runtime.get_episodic_memories_for_conversation(...)` owns transcript window fetch + optional `after_message_index` cursor behavior.
- `conversation_window_runtime.get_unsemanticized_conversation_windows(...)` and `get_unsemanticized_episodic_memories_by_conversation(...)` own interaction-window selection for summarizer inputs.
- `conversation_window_runtime.get_unsemanticized_episodic_memories(...)`, `mark_episodic_memories_semanticized(...)`, and `get_unprocessed_memories_after_id(...)` own semanticization-batch source selection/update and watermark-cursor filtering.
- `conversation_window_runtime.format_transcript_rows(...)` owns normalized transcript/interactions row payload shaping with metadata fallback semantics.
- `conversation_semanticization_runtime.get_user_ids_with_unsemanticized_memories(...)`, `count_unsemanticized_interaction_memories(...)`, and `semantic_summary_exists(...)` own summarizer run-gate and dedupe metadata queries.
- `LocalMemoryStore` keeps wrapper methods plus shared `_conversation_where_clause(...)` compatibility facade.

## Conversation Listing Semantics

`list_conversations(user_id, limit, ...)` returns grouped windows with:

- `conversation_id`
- first/last timestamp
- entry count
- latest non-empty `model_id` and `model_provider` (subqueries)
- resumable flag (`conversation_id` starts with `conv_`)

Ordering:

- newest conversation first (`ORDER BY last_timestamp DESC`)

Runtime split:

- `conversation_list_runtime.fetch_transcript_conversation_rows(...)` owns list-conversation SQL query shape and ordering.
- `conversation_list_runtime.build_conversation_list_results(...)` owns title resolution/filtering and response payload shaping.
- `conversation_list_runtime.list_transcript_conversations(...)` owns connection/row-factory orchestration for transcript conversation listing runtime.

## Message Index Allocation and Replay Order

`get_next_message_index(...)`:

- computes `MAX(message_index)` within `(user_id, conversation_id, transcript)`
- returns max+1 with default fallback to `1`

Replay path (`get_episodic_memories_by_conversation`) orders by:

- `message_index ASC`
- then `timestamp ASC`

This keeps transcript reconstruction stable even when timestamps collide.

## Null Conversation-ID Semantics

`_conversation_where_clause(...)` supports two modes:

- specific window: `conversation_id = ?`
- unscoped window: `conversation_id IS NULL`

This same helper is reused by window fetch, message-index allocation, and delete paths.

## Watermark-Oriented Unprocessed Selection

`get_unprocessed_memories_after_id(last_id, user_id, limit)`:

- uses CTE to resolve watermark row timestamp when `last_id` exists
- returns unsemanticized transcript rows after watermark timestamp/id tie-break
- falls back to full unsemanticized set when watermark missing
- deterministic order: `timestamp ASC, id ASC`

Formatted row output preserves:

- `record_kind`, `role`, `message_type`, `tool_name`
- optional `conversation_id`
- parsed metadata dict

## Semanticization Lifecycle Helpers

Support methods for summarizer:

- `mark_episodic_memories_semanticized(memory_ids)` sets `is_semanticized=1`
- `get_unsemanticized_conversation_windows(user_id)` returns oldest-first windows with pending transcript rows
- `get_user_ids_with_unsemanticized_memories(limit)` returns latest-active users by unsemanticized transcript timestamps
- `count_unsemanticized_interaction_memories(user_id?)` enforces interaction-row count gate for summarizer cycle execution
- `semantic_summary_exists(summary_hash)` enforces summary dedupe check before semantic write

## Delete Semantics and Mapping Cleanup

`delete_conversation(...)` and `delete_semantic_memory(...)`:

- remove SQLite rows first
- remove vector-ID mappings from in-memory maps
- do not remove vectors individually from FAISS

Cleanup policy:

- invoke `_cleanup_index_artifacts_if_empty(memory_type)` after successful delete

## Empty-Index Artifact Cleanup Contract

`_cleanup_index_artifacts_if_empty(memory_type)` behavior:

1. query DB for remaining rows with non-null `embedding_id`
2. if any remain: do nothing
3. if zero remain:
- reinitialize in-memory FAISS index (`IndexFlatIP`)
- clear mapping dicts
- reset next vector ID to `0`
- delete on-disk FAISS index file when present

Goal:

- full-delete flows remove stale persisted vector artifacts and reset state for clean future ingestion

## Test-Backed Invariants

`tests/sidecar/test_local_store_delete_cleanup.py` verifies:

- semantic delete clears mappings, resets next vector ID, empties index, removes index file when last indexed row deleted
- conversation delete does same for episodic index, including `conversation_id IS NULL` windows
- rebuild path rewrites sparse embedding IDs to contiguous IDs
- search short-circuits without embedder call when no searchable index exists

`tests/sidecar/test_conversation_window_runtime.py` verifies:

- `conversation_where_clause(...)` null vs explicit window semantics
- transcript next-index increment behavior
- transcript conversation fetch cursor + metadata parsing behavior
- unsemanticized window ordering and by-conversation formatting callback behavior
- semanticization mark + watermark-cursor filtering (`last_id` existing vs missing) behavior
- summarizer user-discovery/count-gate query scope and summary-hash dedupe lookup behavior

Summarizer tests additionally validate transcript/tool filtering and pending watermark behavior built on these storage queries.

## Drift Hotspots

1. removing transcript-only enforcement from window APIs can mix non-chat rows into resume/list/delete flows.
2. changing replay sort order can scramble resumed chat chronology.
3. skipping artifact cleanup on last-row delete leaves stale index files and mismatched startup state.
4. weakening watermark tie-break logic (`timestamp + id`) can skip or duplicate rows at watermark boundaries.

## Related Pages

- [Frontend Sidecar Memory Storage Docs Hub](README.md)
- [Local Memory Store Embedding, Search, and Memory-Type Routing Reference](local_memory_store_embedding_search_and_memory_type_routing_reference.md)
- [Conversation Title Generation Runtime and Helper Contract Reference](conversation_title_generation_runtime_and_helper_contract_reference.md)
- [Transcript Storage, Semantic Candidate, and Watermark Reference](../transcript_storage_semantic_candidate_and_watermark_reference.md)
- [Summarizer Watermark and Conversation Batch Reference](../summarizer_watermark_and_conversation_batch_reference.md)
