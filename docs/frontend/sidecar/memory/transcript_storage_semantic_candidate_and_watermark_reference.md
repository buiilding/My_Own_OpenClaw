---
summary: "Deep reference for sidecar transcript storage semantics: renderer/main JSON-RPC mapping, `store_transcript` candidate gating, message-index ordering, and summarizer pending-count updates."
read_when:
  - When changing transcript persistence fields or `store_transcript` behavior in local sidecar memory handlers.
  - When debugging transcript rows that persist but do not embed, or summarizer pending counts that never advance/reset.
title: "Transcript Storage, Semantic Candidate, and Watermark Reference"
---

# Transcript Storage, Semantic Candidate, and Watermark Reference

## Canonical Modules

- `frontend/src/renderer/infrastructure/transcript/TranscriptWriter.ts`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/summarizer.py`
- `frontend/src/main/python/memory/watermark_state.py`
- `tests/sidecar/test_local_backend.py`
- `tests/frontend/LocalBackendBridge.rpc.test.cjs`

## End-to-End Contract

Transcript persistence path:

1. renderer calls `INVOKE_CHANNELS.STORE_TRANSCRIPT` from `TranscriptWriter`
2. main maps camelCase payload to sidecar snake_case params (`store-transcript` -> `store_transcript`)
3. sidecar `LocalBackend._handle_store_transcript(...)` validates and normalizes
4. sidecar writes episodic row via `LocalMemoryStore.add(..., record_kind="transcript")`
5. sidecar optionally updates summarizer pending watermark counter

Core payload fields preserved across this path:

- identity: `user_id`, `conversation_ref` (or fallback `session_id`)
- message shape: `role`, `message_type`, `tool_name`, `correlation_id`
- ordering/context: `message_index`, `timestamp`
- provenance: `model_id`, `model_provider`
- capture: `screenshot`

## `store_transcript` Handler Semantics

`_handle_store_transcript(...)` fail-fast behavior:

- missing `content` returns `{success:false,error:"Content is required"}`
- missing memory store returns canonical memory-store-not-initialized error via decorator

On success, handler:

1. derives `conversation_id = conversation_ref or session_id`
2. sets `record_kind="transcript"` and metadata envelope
3. allocates `message_index` from `get_next_message_index(...)` when omitted
4. evaluates semantic candidate via `_is_semantic_transcript_candidate(role, message_type)`
5. writes row with `skip_embedding = not semantic_candidate`
6. evaluates pending watermark update gate via `_counts_toward_pending_turns(role, message_type)`

Response payload includes:

- `memory_id`
- `message_index`
- `record_kind` (`transcript`)
- `semantic_candidate` (bool)

## Semantic Candidate Gate vs Pending-Counter Gate

Two related but distinct gates exist.

Embedding/semantic-candidate gate (`_is_semantic_transcript_candidate`):

- user rows: candidate
- assistant rows: candidate only for `"" | "llm-text" | "error"`
- tool rows: non-candidate

Pending-count gate (`_counts_toward_pending_turns`):

- only assistant rows with `"" | "llm-text" | "error"` increment pending count
- user rows do not increment pending count
- tool rows do not increment pending count

Result:

- user messages are searchable (embedded) but do not drive summarizer cadence
- assistant terminal outputs are both searchable and cadence-driving
- tool chatter is persisted for transcript fidelity but skipped for embedding/cadence

## `LocalMemoryStore` Transcript Invariants

Transcript write invariants in `LocalMemoryStore.add(...)`:

- `record_kind="transcript"` is forced into episodic DB path
- `is_semanticized` flag starts at `0` for episodic entries
- optional transcript metadata columns persist:
  - `role`, `message_index`, `message_type`, `tool_name`, `correlation_id`
  - `model_id`, `model_provider`, `screenshot`

Conversation query/delete APIs are transcript-scoped:

- `list_conversations(...)` ignores non-transcript kinds and returns transcript windows only
- `get_episodic_memories_by_conversation(...)` applies `record_kind='transcript'`
- `delete_conversation(...)` applies `record_kind='transcript'` and cleans vector-ID maps for deleted rows

## Message Ordering Contract

Ordering source:

- sidecar allocates monotonic `message_index` per `(user_id, conversation_id)` when not supplied

Read path ordering:

- conversation replay query sorts by `message_index ASC`, then `timestamp ASC`

Implication:

- preserving or regenerating correct `message_index` is required for stable chat replay order

## Watermark Update and Summarizer Coupling

`_maybe_update_summarization_watermark(...)` is best-effort:

- memory write should still succeed when pending-count increment fails
- pending update failure logs warning and does not fail `store_transcript`

When update gate passes:

- `memory_store.increment_pending_count()` runs
- summarizer is nudged with `notify_new_memory(user_id)` when active

Summarizer loop later resets pending count only after successful summary write path (`update_watermark(..., pending_message_count=0)`).

## Test-Backed Contracts

`tests/sidecar/test_local_backend.py` validates:

- assistant `llm-text` transcript rows set `skip_embedding=False` and increment pending count
- tool transcript rows set `skip_embedding=True` and do not increment pending count
- user transcript rows can embed but do not increment pending count
- pending-count update failure does not fail transcript write result
- missing `content` fails with validation error

`tests/frontend/LocalBackendBridge.rpc.test.cjs` validates:

- `store-transcript` IPC handler maps camelCase renderer payload to `store_transcript` snake_case params
- mapped handler returns standardized error payload on JSON-RPC error responses

## Debug Checklist

If transcript rows exist but semantic search quality is poor:

1. inspect stored `role` and `message_type`; candidate gate may be excluding those rows
2. verify `skip_embedding` path was not triggered unintentionally
3. verify embedding service availability for rows expected to embed

If summarizer appears idle despite ongoing chat:

1. verify assistant terminal rows (`llm-text` or `error`) are being stored
2. verify pending counter increments in watermark state
3. verify summarizer enabled (`WINDIE_ENABLE_SEMANTIC_SUMMARIZER` not disabled)

If resume order appears scrambled:

1. inspect `message_index` assignment path in `store_transcript`
2. inspect transcript rows returned by `get_episodic_memories_by_conversation`
3. verify no external writer is injecting rows with missing/duplicate index semantics

## Related Pages

- [Frontend Sidecar Memory Docs Hub](README.md)
- [Summarizer Watermark and Conversation Batch Reference](summarizer_watermark_and_conversation_batch_reference.md)
- [Memory IPC and RPC Mapping Reference](../../contracts/memory_ipc_and_rpc_mapping_reference.md)
- [Transcript Session and Rehydrate Reference](../../renderer/transcript_session_and_rehydrate_reference.md)
