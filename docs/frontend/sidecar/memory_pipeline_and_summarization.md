---
summary: "Detailed sidecar memory pipeline: local store internals, remote embedding/semantic APIs, and periodic summarization workflow."
read_when:
  - When changing memory retrieval quality, summarization cadence, or memory persistence behavior.
  - When debugging missing semantic memories or vector-index drift.
title: "Memory Pipeline and Summarization"
---

# Memory Pipeline and Summarization

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

## Remote Embedding Dependency

Client:

- `core/remote_embedding_client.py`

Behavior:

- calls backend `POST /api/embeddings/`
- returns numpy vectors to sidecar memory store
- exposes health check via backend embeddings health endpoint

## Semantic Summarization Dependency

Client:

- `core/remote_semantic_client.py`

Behavior:

- calls backend `POST /api/semantic/summarize`
- receives `(summary, facts)` result for semantic memory write path

## Periodic Summarizer

Module:

- `memory/summarizer.py:MemorySummarizer`

Core loop behavior:

- periodic wake-up interval
- checks watermark/pending-message thresholds
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
4. Summarizer starts background task loop.
5. New memory writes update watermark and notify summarizer.

## Failure Modes and Recovery

Observed defensive behavior:

- index/database mismatch triggers index rebuild flow
- summarizer failures apply backoff and continue next cycle
- empty semantic results are skipped without corrupting source data
- remote API failures are logged and surfaced through exception paths
