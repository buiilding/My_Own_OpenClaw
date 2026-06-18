---
summary: "Deep reference for local-runtime memory persistence helpers: SQLite schema/migration/index creation, safe FAISS read/write lifecycle, and thread-pool-backed watermark state file semantics."
read_when:
  - When changing local-runtime memory table columns/indexes or migration behavior.
  - When debugging corrupted FAISS index recovery, failed index saves, or watermark JSON load/save drift.
title: "SQLite Schema Migration, FAISS Index I/O, and Watermark State Reference"
---

# SQLite Schema Migration, FAISS Index I/O, and Watermark State Reference

## Canonical Modules

- `frontend/src/main/python/memory/sqlite_store.py`
- `frontend/src/main/python/memory/faiss_index.py`
- `frontend/src/main/python/memory/watermark_state.py`
- `frontend/src/main/python/core/executors.py`
- `frontend/src/main/python/memory/local_store.py`

## SQLite Schema Ownership

`sqlite_store.py` defines initialization helpers used by `LocalMemoryStore`:

- `init_episodic_schema(db_path)`
- `init_semantic_schema(db_path)`
- `load_vector_mappings(db_path)`

## Episodic Schema Contract

Episodic `memories` table includes transcript-aware columns:

- base memory fields (`id`, `user_id`, `content`, `timestamp`, `metadata`, `embedding_id`)
- semanticization/provenance fields (`is_semanticized`, `conversation_id`, `record_kind`)
- transcript ordering/context (`role`, `message_index`, `message_type`, `tool_name`, `correlation_id`)
- model/source details (`model_id`, `model_provider`, `screenshot`)

Migration behavior:

- each newer column has defensive `SELECT ... LIMIT 1` probe
- missing columns are added via `ALTER TABLE ... ADD COLUMN`
- migration failure is warning-logged and does not hard-crash initialization

Created indexes include:

- `idx_user_id`, `idx_timestamp`, `idx_embedding_id`
- `idx_is_semanticized`, `idx_conversation_id`, `idx_conversation_semanticized`
- `idx_record_kind`, `idx_conversation_message_index`

## Semantic Schema Contract

Semantic `memories` table is intentionally narrower:

- `id`, `user_id`, `content`, `timestamp`, `metadata`, `embedding_id`, `created_at`

Indexes:

- `idx_user_id`, `idx_timestamp`, `idx_embedding_id`

No `is_semanticized` column is required for semantic DB rows.

## Vector Mapping Load Contract

`load_vector_mappings(db_path)`:

- scans rows with non-null `embedding_id`
- builds both direction maps
- computes `next_vector_id = max(existing) + 1`

This is the authoritative bootstrap source for mapping state before runtime sync/rebuild logic.

## Safe FAISS Read Contract

`read_index_safe(index_path, faiss_module)`:

- returns `None` when index file missing
- on read failure: warning-log, attempt to delete corrupted file, return `None`

Async wrapper (`read_index_safe_async`) uses shared thread pool (`run_in_executor`) to avoid blocking event loop on FAISS file I/O.

## FAISS Save Contract

`save_indices_async(...)`:

- writes episodic/semantic indices when non-null
- executes writes in shared thread pool
- logs (does not raise) save failures

Consequence:

- caller should treat save failure as degraded durability, not necessarily fatal runtime failure

## Watermark State File Contract

`WatermarkStateStore` persists semanticization progress JSON:

- `last_semanticized_id`
- `pending_message_count`
- `last_updated`

Load behavior:

- missing file -> default state
- parse/read failure -> error-log + default state
- default keys are always backfilled into loaded dict

Save behavior:

- writes JSON with indentation
- sets fresh `last_updated` timestamp on save
- runs in shared thread pool
- save failures are logged

Helper methods:

- `get()`
- `update(last_semanticized_id, pending_message_count)`

## Integration Touchpoints

`LocalMemoryStore` uses these helpers as follows:

- startup schema init + vector mapping load (`sqlite_store`)
- resilient index load/save (`faiss_index`)
- summarizer watermark reads/writes (`watermark_state`)

Together they form the persistence substrate for all local-runtime memory and summarizer behavior.

## Drift Hotspots

1. removing migration guards around `ALTER TABLE` can break startup for users with older DB files.
2. changing index-file corruption recovery to hard-fail can block memory startup on a single bad FAISS artifact.
3. bypassing thread-pool wrappers for FAISS/JSON disk operations can block sidecar event loop under heavy I/O.
4. changing watermark default keys without backfill logic can break summarizer assumptions on existing state files.

## Related Pages

- [Local Runtime Memory Storage Docs Hub](README.md)
- [Local Memory Store Embedding, Search, and Memory-Type Routing Reference](local_memory_store_embedding_search_and_memory_type_routing_reference.md)
