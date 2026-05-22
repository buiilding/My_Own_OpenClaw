---
summary: "Detailed sidecar memory pipeline: local store internals, transcript title generation, remote embedding/semantic/title APIs, and periodic summarization workflow."
read_when:
  - When changing memory retrieval quality, summarization cadence, or memory persistence behavior.
  - When debugging missing semantic memories or vector-index drift.
title: "Memory Pipeline and Summarization"
---

# Memory Pipeline and Summarization

Deep split references:

- [Sidecar Memory Docs Hub](memory/README.md)
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

## Remote Embedding Dependency

Client:

- `core/remote_embedding_client.py`

Behavior:

- calls backend `POST /api/embeddings/`
- returns numpy vectors to sidecar memory store
- exposes health check via backend embeddings health endpoint
- caches `embedding_provider_id`, `embedding_model_id`, `embedding_dimension`, and `embedding_space_version`

## Semantic Summarization Dependency

Client:

- `core/remote_semantic_client.py`

Behavior:

- calls backend `POST /api/semantic/summarize`
- receives `(summary, facts)` result for semantic memory write path

## Conversation Title Dependency

Client:

- `core/remote_title_client.py`

Behavior:

- called by `LocalMemoryStore` async title-generation tasks after the first completed assistant `llm-text` transcript row for a conversation
- calls backend `POST /api/semantic/title`
- sends the first non-empty user message and first non-empty assistant reply, with model/provider metadata when the transcript row carries it
- writes generated titles into `conversation_titles` with `source = model` and does not overwrite locked or manually sourced titles
- emits a sidecar `conversation-title-updated` event after a generated title is stored so Electron can refresh dashboard metadata without waiting for transcript polling
- dashboard conversation metadata prefers `conversation_titles.title`, then falls back to the first user message, latest content, or conversation id

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
2. Remote embedding client is initialized.
3. SQLite schemas and FAISS indices are loaded/synced.
4. Summarizer starts background task loop and triggers an immediate first pass.
5. New memory writes update watermark and notify summarizer.

## Failure Modes and Recovery

Observed defensive behavior:

- index/database mismatch triggers index rebuild flow
- embedding-space metadata mismatch triggers explicit FAISS rebuild before mixed-space search/add flows continue
- summarizer failures apply backoff and continue next cycle
- empty semantic results are skipped without corrupting source data
- remote API failures are logged and surfaced through exception paths
