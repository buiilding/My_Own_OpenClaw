---
summary: "Detailed local-runtime memory pipeline: local store internals, SDK-provided embeddings, remote semantic summarization, and periodic summarization workflow."
read_when:
  - When changing memory retrieval quality, summarization cadence, or memory persistence behavior.
  - When debugging missing semantic memories or vector-index drift.
title: "Memory Pipeline and Summarization"
---

# Memory Pipeline and Summarization

Deep split references:

- [Local Runtime Memory Docs Hub](memory/README.md)
- [Memory Storage Docs Hub](memory/storage/README.md)
- [Summarizer Watermark and Conversation Batch Reference](memory/summarizer_watermark_and_conversation_batch_reference.md)
- [Local Memory Store Embedding, Search, and Memory-Type Routing Reference](memory/storage/local_memory_store_embedding_search_and_memory_type_routing_reference.md)
- [SQLite Schema Migration, FAISS Index I/O, and Watermark State Reference](memory/storage/sqlite_schema_migration_faiss_index_and_watermark_state_reference.md)

## Memory Storage Core

Primary store:

- `frontend/src/main/python/memory/local_store.py:LocalMemoryStore`

Storage split:

- episodic SQLite DB + episodic FAISS index
- semantic SQLite DB + semantic FAISS index

State tracked:

- vector ID <-> memory ID mappings per memory type
- next vector IDs for insertion
- watermark state for semanticization progress
- persisted embedding-space metadata (`embedding_space.json`) used to detect backend embedding model/provider changes

## Embedding Ownership

The SDK owns backend embedding calls for memory. It calls the backend
`POST /api/embeddings/` route, then sends vectors into the local runtime through
`search_memory_by_embedding` and `store_memory_by_embedding`.

Local-runtime Python backs local-runtime SQLite/FAISS storage. It persists
`embedding_space.json` to detect embedding-space version or dimension changes
and clears local vector mappings when the caller-provided embedding space
changes.

## Semantic Summarization Dependency

Client:

- `core/remote_semantic_client.py`

Behavior:

- calls backend `POST /api/semantic/summarize`
- receives `(summary, facts)` result for semantic memory write path

## Conversation Titles

The local-runtime memory store lists conversation titles, including manually
updated titles. Hosted title generation belongs to the SDK/backend route path,
not to a Python implementation remote-title client.

## Periodic Summarizer

Module:

- `memory/summarizer.py:MemorySummarizer`

Core loop behavior:

- immediate startup wake plus periodic wake-up interval
- checks unsemanticized interaction backlog and idle state
- finds user IDs and conversations with unsemanticized episodic memories
- batches conversations, builds chunks, and requests semantic summarization
- writes semantic memory entry and marks source episodic memories semanticized

Operational controls (from `SummarizerSettings`):

- batch size limits
- idle and age thresholds
- max summaries/conversations per cycle
- chunk-size limits
- backoff min/max when cycles fail

## Initialization and Runtime Sequence

1. Sidecar initializes local memory store.
2. SQLite schemas and FAISS indices are loaded/synced.
3. Summarizer starts background task loop and triggers an immediate first pass.
4. New SDK-embedded memory writes update watermark and notify summarizer.

## Failure Modes and Recovery

Observed defensive behavior:

- index/database mismatch clears stale vector mappings so future SDK-embedded writes rebuild local indices
- embedding-space metadata mismatch clears local FAISS/vector mappings before mixed-space search/add flows continue
- summarizer failures apply backoff and continue next cycle
- empty semantic results are skipped without corrupting source data
- remote API failures are logged and surfaced through exception paths
