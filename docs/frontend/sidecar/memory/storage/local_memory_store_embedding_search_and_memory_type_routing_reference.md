---
summary: "Deep reference for LocalMemoryStore core runtime: OS-aware path resolution, episodic/semantic routing, embedding generation gates, vector mapping synchronization, and cross-index semantic search behavior."
read_when:
  - When changing `LocalMemoryStore.add` or `search` behavior, especially around transcript routing, skip-embedding paths, and metadata filters.
  - When debugging missing vectors, mismatched FAISS/SQLite mappings, or unexpected episodic-vs-semantic search result composition.
title: "Local Memory Store Embedding, Search, and Memory-Type Routing Reference"
---

# Local Memory Store Embedding, Search, and Memory-Type Routing Reference

## Canonical Modules

- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/conversation_search_helpers.py`
- `frontend/src/main/python/memory/conversation_search_runtime.py`
- `frontend/src/main/python/memory/conversation_title_helpers.py`
- `frontend/src/main/python/core/remote_embedding_client.py`
- `frontend/src/main/python/core/remote_title_client.py`
- `frontend/src/main/python/memory/faiss_index.py`
- `frontend/src/main/python/memory/sqlite_store.py`
- `tests/sidecar/test_local_store_delete_cleanup.py`
- `tests/sidecar/test_conversation_search_helpers.py`

## Runtime Topology

`LocalMemoryStore` maintains parallel stores:

- episodic SQLite DB + episodic FAISS index
- semantic SQLite DB + semantic FAISS index

Per-type runtime state:

- `vector_id_to_memory_id` map
- `memory_id_to_vector_id` map
- `next_vector_id`
- FAISS index path and in-memory index handle

## OS-Aware Storage Path Resolution

Default `db_path=None` resolves to:

- Windows: `%APPDATA%/desktop-assistant/memory`
- macOS: `~/Library/Application Support/desktop-assistant/memory`
- Linux: `~/.config/desktop-assistant/memory`

Guard behavior:

- directory creation is attempted eagerly
- path-creation failure raises (store cannot run without local persistence path)

## Initialization Sequence

`initialize()` does:

1. async safe index load (`read_index_safe_async`)
2. remote embedder initialization
3. SQLite schema initialization for episodic + semantic DBs
4. vector mapping load from SQLite embedding IDs
5. mapping/index sync backfill for rows missing `embedding_id`
6. index rebuild fallback when DB mappings exist but index is empty

Index dimension source:

- always `self.embedder.dimension`

## Memory-Type Normalization and Routing Rules

Normalization helpers:

- `_normalize_memory_type(...)` maps enum/string input to `"episodic"` or `"semantic"`
- `_maybe_normalize_memory_type(...)` returns optional normalized type for filter parsing

Routing rules in `add(...)`:

- default memory type is episodic
- explicit metadata `type` can request semantic
- transcript record kind (`record_kind="transcript"`) is force-routed to episodic even if metadata says semantic

## Embedding Generation Gate

`add(...)` generates embeddings unless `skip_embedding=True`.

When embedding path is active:

1. call remote embedder
2. reshape vector to `(1, -1)`
3. `faiss.normalize_L2`
4. allocate current `next_vector_id`
5. insert into selected FAISS index
6. write same vector ID into SQLite `embedding_id`
7. update in-memory maps
8. save indices to disk

When `skip_embedding=True`:

- row is persisted in SQLite only
- map/index updates and index save are skipped

## Episodic Embedding Backfill Policy

`_sync_vector_mappings_for_db(...)` backfills rows missing `embedding_id`.

For episodic rows, embedding eligibility uses `_should_embed_episodic_entry(...)`:

- non-transcript rows: embed
- transcript user rows: embed
- transcript assistant rows: embed only for `"" | "llm-text" | "error"`
- tool/other transcript rows: skip embedding

This avoids indexing low-signal tool chatter while preserving useful conversational turns.

Startup performance guard:

- startup backfill query now applies this eligibility filter directly in SQL for episodic rows.
- non-embeddable transcript tool rows are excluded before iteration, so launches avoid repeated full-row rescans of permanent `embedding_id IS NULL` tool chatter.

## Conversation-Title Boundary

Transcript title generation is a parallel contract (not part of semantic vector search):

- triggered only by assistant transcript rows with normalized `message_type = llm-text`
- executed through async background tasks with bounded concurrency
- resolved/persisted through `conversation_title_helpers` + `RemoteTitleClient`

See dedicated title contract reference for trigger/lock/upsert/task details.

## Search Execution Model

`search(query, user_id, filters, limit)`:

1. decide target memory types from filters (`type` / `metadata.type`)
2. skip query embedding call entirely if no searchable indices are available
3. embed query and L2-normalize
4. run per-database searches concurrently
5. merge results, sort by score desc, trim to limit

Per-database candidate fanout:

- search `k = min(limit * 3, index.ntotal)` for headroom before filtering

Post-search filters:

- user ID check
- metadata filter matching (excluding type keys already handled by target selection)

Result payload fields:

- `id`, `text`, `metadata`, `score`, `timestamp`, `type`, optional `conversation_id`

### Transcript Companion Enrichment (Current Retrieval Contract)

After score sort + top-`limit` trim, `search(...)` performs transcript enrichment when episodic search is enabled:

1. scan final episodic rows for transcript user turns
2. for each user turn, resolve the next assistant transcript reply in the same conversation (primary path uses SQLite lookup by `conversation_id + message_index`)
3. allow only assistant transcript message types `"" | "llm-text" | "error"`
4. rewrite user-row `text` in canonical interaction format (`User: ...` + `Assistant: ...`) via `format_interaction_memory(...)`
5. keep result count stable (no extra rows appended)

Why this exists:

- vector top-k can return user-only transcript rows
- prompt memory injection needs paired user/assistant context to avoid low-signal one-sided episodic recall

Ownership boundary:

- pairing now lives in `LocalMemoryStore.search(...)` (store/retrieval layer), not in `local_backend_memory_handlers.py`
- `search_memory` handler remains responsible for payload validation, active-conversation exclusion filtering, and grouping response shape

Regression coverage:

- `tests/sidecar/test_local_store_search_pairing.py`

Conversation search surface (`search_conversations(...)`):

- lexical + semantic transcript hit collection now routes through `conversation_search_runtime`
- helper module owns FTS/LIKE fallback, transcript filtering, and summary/title fetch normalization

## Mapping and Index Drift Recovery

On startup or detected empty index with existing mappings:

- `_rebuild_index(memory_type)` rebuilds contiguous vector IDs from SQLite rows
- DB `embedding_id` values are rewritten to new contiguous IDs
- in-memory maps and `next_vector_id` reset to match rebuilt index order

Test coverage confirms sparse/legacy embedding IDs are rewritten deterministically.

## Drift Hotspots

1. changing transcript force-routing to semantic would break transcript-window APIs that assume episodic-only transcript rows.
2. removing `skip_embedding` support would index tool/system transcript noise and increase vector store churn.
3. skipping index save after writes can create restart-time mapping/index drift.
4. changing search type-filter handling without aligning metadata-filter stripping can silently overfilter or underfilter results.

## Related Pages

- [Frontend Sidecar Memory Storage Docs Hub](README.md)
- [Memory Search Grouping and Transcript Pair Synthesis Contract Reference](../memory_search_grouping_and_transcript_pair_synthesis_contract_reference.md)
- [Conversation Search Helper Term, Snippet, Grouping, and Timestamp Contract Reference](conversation_search_helper_term_snippet_grouping_and_timestamp_contract_reference.md)
- [Conversation Search Runtime FTS, Semantic Fusion, and Summary-Fetch Contract Reference](conversation_search_runtime_fts_semantic_fusion_and_summary_fetch_contract_reference.md)
- [Conversation Title Generation Runtime and Helper Contract Reference](conversation_title_generation_runtime_and_helper_contract_reference.md)
- [Conversation Transcript Window Queries and FAISS Artifact Cleanup Reference](conversation_transcript_window_queries_and_faiss_artifact_cleanup_reference.md)
- [SQLite Schema Migration, FAISS Index I/O, and Watermark State Reference](sqlite_schema_migration_faiss_index_and_watermark_state_reference.md)
