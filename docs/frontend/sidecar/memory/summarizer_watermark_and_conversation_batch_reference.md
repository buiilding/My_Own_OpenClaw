---
summary: "Sidecar memory summarizer deep reference: run-loop gating, per-user conversation batching, semantic dedupe hash behavior, transcript filtering rules, chunk limits, and watermark updates."
read_when:
  - When changing `MemorySummarizer` thresholds, chunking, or backoff behavior.
  - When debugging semanticization gaps, duplicate summaries, or pending watermark counters that never clear.
title: "Summarizer Watermark and Conversation Batch Reference"
---

# Summarizer Watermark and Conversation Batch Reference

## Canonical Modules

- `frontend/src/main/python/memory/summarizer.py`
- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/watermark_state.py`
- `frontend/src/main/python/core/remote_semantic_client.py`
- `tests/sidecar/test_memory_summarizer.py`

## Runtime Purpose

The sidecar summarizer periodically converts transcript-backed episodic rows into semantic memories while preventing duplicate summaries and uncontrolled background churn.

Dev toggle:

- `WINDIE_ENABLE_SEMANTIC_SUMMARIZER=0` disables summarizer startup in `local_backend.py`.
- When disabled, transcript writes still persist to episodic memory; periodic semanticization loop does not run.

## Settings and Scheduling Model

`SummarizerSettings` defaults:

- `interval_seconds=60`
- `idle_seconds=120`
- `min_batch_size=6`
- `min_batch_size_idle=6`
- `max_batch_size=30`
- `min_memory_age_seconds=45`
- `max_summaries_per_cycle=1`
- `max_conversations_per_cycle=5`
- `max_chunk_chars=24000`
- `max_chunks_per_request=20`
- backoff window: `30..600` seconds

Loop behavior:

- `_run_loop()` waits `interval_seconds` (or active backoff) between attempts
- `_maybe_summarize()` is lock-guarded to avoid concurrent cycles
- backoff doubles on cycle-level failure until max, resets after successful cycle

## Watermark Gate and Pending Counter

Cycle entry checks `memory_store.get_watermark()` and requires:

- `pending_message_count >= min_batch_size`

Pending counter lifecycle:

- incremented by sidecar on new store-memory events (`increment_pending_count`)
- reset to zero only when at least one summary is produced in cycle (`update_watermark(..., pending_message_count=0)`)

Watermark storage:

- JSON file via `WatermarkStateStore`
- fields: `last_semanticized_id`, `pending_message_count`, `last_updated`
- read/write performed in shared thread pool to avoid loop blocking

## User and Conversation Selection

User selection in `_get_user_ids_with_work()`:

- preferred source: `_known_user_ids` (populated by `notify_new_memory(user_id)`)
- cold-start fallback: DB discovery limited to newest one user (`get_user_ids_with_unsemanticized_memories(limit=1)`)

Conversation selection:

- `get_unsemanticized_conversation_windows(user_id)` ordered by earliest unsummarized timestamp
- cycle enforces `max_conversations_per_cycle`

## Per-Conversation Summarization Flow

`_summarize_conversation_batch(user_id, conversation_id)`:

1. load unsummarized transcript memories for conversation (`max_batch_size` cap)
2. apply batch readiness rules (`_should_summarize_batch`)
3. compute deterministic summary hash from user/conversation/memory IDs
4. if semantic summary already exists, mark source memories semanticized and skip API call
5. build chunked conversation payload
6. call remote semantic summarizer
7. format semantic content (`Summary:` + `Facts:` blocks)
8. persist semantic memory with provenance metadata
9. mark source episodic memories semanticized

## Batch Readiness Rules

`_should_summarize_batch(memories)` returns true when:

- memory count reaches `min_batch_size`, or
- memory count reaches `min_batch_size_idle` and idle/age thresholds pass

Timestamp handling:

- parses ISO timestamps, normalizes `Z` suffix to UTC offset
- naive timestamps get local tz then normalized to UTC
- failures fall back to idle heuristic

## Transcript Filtering and Chunking

Before summarization, each memory row is normalized by `_format_memory_line`.

Filtering:

- transcript rows with `role="tool"` are skipped
- defensive skip list also removes tool message types (`tool-call`, `tool-output`, `tool-bundle-result`, etc.)

Normalization:

- line prefix includes role/message_type/tool_name when available
- content clipped to `1600` chars per memory line

Chunking:

- per-line clipping against `max_chunk_chars`
- chunk accumulation split by `max_chunk_chars`
- total chunks capped by `max_chunks_per_request`

## Store Queries Used by Summarizer

`LocalMemoryStore` queries enforce transcript-only summarization surface:

- unsemanticized user discovery: `record_kind='transcript' AND is_semanticized=0`
- conversation windows: grouped by `conversation_id`
- memory batch load: transcript rows ordered chronologically
- semantic dedupe check: `semantic_summary_exists(summary_hash)` via metadata lookup

## Test-Backed Behavior

`tests/sidecar/test_memory_summarizer.py` validates:

- tool transcript chatter is excluded from semantic request chunks
- one user batch failure does not prevent processing remaining users
- known-user preference skips cold-start discovery query
- cold-start discovery limits to one user
- mixed timezone timestamp parsing remains stable
- pending watermark threshold gate for `_should_run()`

## Drift Hotspots

1. Changing pending-counter reset behavior can leave summarizer permanently gated or always active.
2. Loosening transcript tool-entry filtering can pollute semantic memory with low-signal execution chatter.
3. Altering summary-hash inputs can reintroduce duplicate semantic writes for same memory window.
4. Raising chunk size/count caps without safeguards can increase semantic request latency and failure blast radius.

## Related Pages

- [Frontend Sidecar Memory Docs Hub](README.md)
- [Frontend Sidecar Memory Storage Docs Hub](storage/README.md)
- [Transcript Storage, Semantic Candidate, and Watermark Reference](transcript_storage_semantic_candidate_and_watermark_reference.md)
- [Conversation Transcript Window Queries and FAISS Artifact Cleanup Reference](storage/conversation_transcript_window_queries_and_faiss_artifact_cleanup_reference.md)
