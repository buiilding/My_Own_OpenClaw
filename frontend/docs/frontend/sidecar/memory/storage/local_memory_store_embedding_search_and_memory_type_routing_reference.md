---
summary: "Deep reference for LocalMemoryStore core runtime: OS-aware path resolution, episodic/semantic routing, SDK-provided embeddings, vector mapping synchronization, and cross-index search behavior."
read_when:
  - When changing `LocalMemoryStore.add` or `search_by_embedding` behavior, especially around transcript routing, caller-provided embeddings, and metadata filters.
  - When debugging missing vectors, mismatched FAISS/SQLite mappings, or unexpected episodic-vs-semantic search result composition.
title: "Local Memory Store Embedding, Search, and Memory-Type Routing Reference"
---

# Local Memory Store Embedding, Search, and Memory-Type Routing Reference

## Canonical Modules

- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/conversation_search_helpers.py`
- `frontend/src/main/python/memory/faiss_index.py`
- `frontend/src/main/python/memory/sqlite_store.py`
- `tests/sidecar/test_local_store_delete_cleanup.py`
- `tests/sidecar/test_local_store_init.py`
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

The sidecar never calls the backend to create memory embeddings. The SDK owns
backend embedding calls and passes vectors into the sidecar through
`store_memory_by_embedding` and `search_memory_by_embedding`.

## OS-Aware Storage Path Resolution

Default `db_path=None` resolves to:

- Windows: `%APPDATA%/windieos/memory`
- macOS: `~/Library/Application Support/windieos/memory`
- Linux: `~/.config/windieos/memory`

Directory creation is attempted eagerly. Path-creation failure raises because
the store cannot run without a local persistence path.

## Initialization Sequence

`initialize()` does:

1. async safe index load (`read_index_safe_async`)
2. SQLite schema initialization for episodic + semantic DBs
3. vector mapping load from SQLite embedding IDs
4. stale mapping cleanup when SQLite and FAISS mappings disagree

Index dimension source:

- persisted embedding-space metadata when available
- current in-memory index dimension when an index already exists
- default local dimension only for empty placeholder indices

## Memory-Type Routing

Normalization helpers:

- `_normalize_memory_type(...)` maps enum/string input to `"episodic"` or `"semantic"`
- `_maybe_normalize_memory_type(...)` returns optional normalized type for filter parsing

Routing rules in `add(...)`:

- default memory type is episodic
- explicit metadata `type` can request semantic
- transcript record kind (`record_kind="chat_event"`) is force-routed to episodic even if metadata says semantic

## Caller-Provided Embeddings

`add(...)` persists the row first. It indexes the row only when the caller also
provides `embedding` and `embedding_space_version`.

When an embedding is provided:

1. validate embedding-space version and vector dimension
2. reshape vector to `(1, -1)`
3. `faiss.normalize_L2`
4. allocate current `next_vector_id`
5. insert into selected FAISS index
6. write the same vector ID into SQLite `embedding_id`
7. update in-memory maps
8. save indices to disk

When no embedding is provided:

- row is persisted in SQLite only
- map/index updates and index save are skipped

If the SDK-provided embedding space version or dimension changes, the sidecar
clears local vector mappings and FAISS artifacts before accepting the new
embedding space.

## Conversation-Title Boundary

Transcript title storage and manual title updates remain local-runtime memory
store responsibilities. Hosted title generation belongs to the SDK/backend route
path, not to a Python implementation remote-title client.

## Search Execution Model

`search_by_embedding(query_embedding, user_id, filters, limit)`:

1. decide target memory types from filters (`type` / `metadata.type`)
2. skip search entirely if no searchable indices are available
3. validate embedding-space version/dimension and L2-normalize the caller vector
4. run per-database searches concurrently
5. merge results, sort by score descending, trim to limit

Per-database candidate fanout:

- search `k = min(limit * 3, index.ntotal)` for headroom before filtering

Post-search filters:

- user ID check
- metadata filter matching, excluding type keys already handled by target selection

Result payload fields:

- `id`, `text`, `metadata`, `score`, `timestamp`, `type`, optional `conversation_id`

The local-runtime `search_memory_by_embedding` RPC also returns sanitized trace
metadata under `data.trace` for SDK durable path traces. This metadata is
structural only: method name, searched memory types, embedding dimension,
embedding-space version, retrieval limits, exclusion id, result counts, and
duration. It must not include memory text, embedding vectors, raw SQL rows, or
full user query text.

Local memory retrieval uses SDK-provided embeddings through
`search_memory_by_embedding`; the sidecar does not expose a text-query
compatibility search surface or generate query embeddings.

## Mapping and Index Drift Recovery

On startup or detected index/database mismatch:

- stale vector mappings are cleared
- DB `embedding_id` values are nulled
- future SDK-provided embedding writes repopulate the local FAISS index

Test coverage confirms stale local mappings are cleared deterministically.

## Drift Hotspots

1. Changing transcript force-routing to semantic would break transcript-window APIs that assume episodic-only transcript rows.
2. Adding sidecar-side embedding calls would reintroduce backend/auth ownership drift.
3. Skipping index save after writes can create restart-time mapping/index drift.
4. Changing search type-filter handling without aligning metadata-filter stripping can silently overfilter or underfilter results.

## Related Pages

- [Local Runtime Memory Storage Docs Hub](README.md)
- [Conversation Search Helper Term, Snippet, Grouping, and Timestamp Contract Reference](conversation_search_helper_term_snippet_grouping_and_timestamp_contract_reference.md)
- [SQLite Schema Migration, FAISS Index I/O, and Watermark State Reference](sqlite_schema_migration_faiss_index_and_watermark_state_reference.md)
