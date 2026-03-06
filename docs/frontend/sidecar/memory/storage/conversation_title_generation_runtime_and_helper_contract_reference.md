---
summary: "Deep reference for sidecar transcript conversation-title lifecycle: title trigger gating, helper query/normalization contracts, async generation task orchestration, and remote `/api/semantic/title` boundary behavior."
read_when:
  - When changing transcript-title generation behavior in `LocalMemoryStore`, `conversation_title_helpers`, or `RemoteTitleClient`.
  - When debugging missing conversation titles, stuck `New chat`/pending title states, or title rows not updating/deleting as expected.
title: "Conversation Title Generation Runtime and Helper Contract Reference"
---

# Conversation Title Generation Runtime and Helper Contract Reference

## Canonical Modules

- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/conversation_title_helpers.py`
- `frontend/src/main/python/memory/conversation_title_runtime.py`
- `frontend/src/main/python/memory/conversation_titles.py`
- `frontend/src/main/python/core/remote_title_client.py`
- `frontend/src/main/python/memory/sqlite_store.py`
- `backend/src/api/routes/memory/semantic/router.py`
- `backend/src/api/routes/memory/semantic/service.py`
- `tests/sidecar/test_conversation_titles.py`
- `tests/sidecar/test_conversation_title_helpers.py`
- `tests/sidecar/test_conversation_title_runtime.py`
- `tests/sidecar/test_remote_title_client.py`
- `tests/backend/test_memory_routes.py`

## Trigger Gate Contract

`LocalMemoryStore.add(...)` only triggers async title generation when all conditions hold:

- memory type resolves to episodic
- `record_kind == "transcript"`
- `conversation_id` is non-empty
- `role == "assistant"`
- normalized `message_type == "llm-text"` (after trim + `_` -> `-` normalization)

Implications:

- user transcript rows never trigger title generation directly
- assistant `error` transcript rows are persisted but do not trigger title generation
- title generation is decoupled from write success (best-effort background task)

## Async Runtime State and Concurrency Contract

Runtime fields:

- `title_client` (`RemoteTitleClient` in normal runtime, `conversation_title_runtime.NoopTitleClient` fallback in `__new__` test harnesses)
- `_title_generation_tasks: Dict[(user_id, conversation_id), asyncio.Task]`
- `_title_generation_semaphore = asyncio.Semaphore(2)`

Runtime ownership:

- `conversation_title_runtime.ensure_title_generation_runtime_state(...)`
- `conversation_title_runtime.maybe_generate_conversation_title(...)`
- `conversation_title_runtime.cancel_title_generation_tasks(...)`
- `conversation_title_runtime.run_conversation_title_generation(...)`
- `conversation_title_runtime.generate_conversation_title_and_persist(...)`
- `LocalMemoryStore` keeps thin private wrapper methods for compatibility.

Behavior:

- duplicate task fanout is suppressed per `(user_id, conversation_id)` while a task is still running
- max two concurrent title generations across all conversations
- done callback removes completed task entries from `_title_generation_tasks`
- `close()` cancels pending title tasks before closing the title client

Failure semantics:

- `CancelledError` is re-raised in worker task
- other exceptions log warning and are swallowed so transcript write/list flow is not failed

## Title Input Selection Contract (`fetch_title_generation_inputs`)

Helper query order:

1. first non-empty user transcript message (`message_index ASC`, `timestamp ASC`)
2. first assistant `llm-text` transcript message with preferred `model_id` + `model_provider` when both preferred values are present
3. fallback first assistant `llm-text` transcript message without model/provider filter

Returned tuple:

- first user content
- first assistant content
- assistant model id (trimmed)
- assistant model provider (trimmed)

If either user or assistant content is missing, generation is skipped.

## Title Existence and Lock Guard Contract

Before generation/persist:

- `lookup_conversation_title_state(...)` reads `conversation_titles` row
- if existing title exists -> skip generation
- if `is_locked` is true -> skip generation

`ensure_conversation_title(...)` read helper precedence:

1. existing row title passed by query caller (`existing_title`)
2. lookup in `conversation_titles`
3. if locked-without-title -> return `(None, source)` (caller can preserve lock/pending semantics)

## Normalization Contract (`normalize_generated_title`)

Sidecar normalization:

- use first non-empty line only
- strip optional `title:` prefix (case-insensitive)
- strip surrounding quotes/backticks
- collapse repeated whitespace
- truncate to first `6` words
- cap to `48` chars

Returns empty string on invalid/blank input, causing persist skip.

## Persistence Contract (`conversation_titles`)

When normalized title is available, `LocalMemoryStore` executes upsert:

- insert `(user_id, conversation_id, title, source="model", is_locked=0, created_at, updated_at)`
- on conflict, update `title/source/updated_at` only when existing row is not locked (`WHERE conversation_titles.is_locked = 0`)

Schema defaults from `sqlite_store`:

- `source` default is `"heuristic"` for non-model/manual writers
- `is_locked` default `0`

## Conversation Listing/Search Surface Contract

`list_conversations(...)`:

- resolves title via `ensure_conversation_title(...)`
- drops rows where resolved title is empty
- exposes `title_source` and resumable flag

`search_conversations(...)` summary path:

- fetches title metadata in `conversation_search_runtime.fetch_conversation_summaries(...)`
- unresolved titles become `"New chat"`
- unresolved source is tagged `"pending"` when title fallback is still `"New chat"`

## Remote API Boundary (`RemoteTitleClient` -> `/api/semantic/title`)

Request payload contract:

- required: `user_id`, `user_message`, `assistant_message`
- optional overrides included only when trimmed non-empty: `model_id`, `model_provider`

Response contract:

- expects JSON `{success: true, title: <string|null>}`
- `None` title normalizes to `""`
- non-200 / network failures raise typed request errors via shared remote client base

## Delete and Cleanup Contract

`delete_conversation(...)` removes transcript rows and then deletes matching `conversation_titles` row for that `(user_id, conversation_id)`.

Effect:

- sidebar/resume conversation title state is deleted atomically with transcript window deletion path

## Test-Backed Invariants

`tests/sidecar/test_conversation_titles.py` validates:

- title generation requires user + assistant `llm-text` transcript rows
- conversation list hides untitled windows until title generation completes
- generated titles are normalized to concise shape
- deleting conversation removes `conversation_titles` row

`tests/sidecar/test_conversation_title_helpers.py` validates:

- helper normalization/lookup precedence
- preferred-model assistant lookup fallback path
- `ensure_conversation_title(...)` short-circuits with existing query row title

`tests/sidecar/test_conversation_title_runtime.py` validates:

- runtime-state default initialization (`NoopTitleClient`, task map, semaphore)
- per-conversation task de-duplication in `maybe_generate_conversation_title(...)`
- cancellation/cleanup behavior of `cancel_title_generation_tasks(...)`

`tests/sidecar/test_remote_title_client.py` validates:

- payload formation with/without optional overrides
- success/blank-title normalization
- non-200 and network error propagation

`tests/backend/test_memory_routes.py` validates:

- `/api/semantic/title` session-vs-container config selection
- override model id/provider path
- concise parsed title shape truncation behavior

## Drift Hotspots

1. Changing trigger gate away from assistant `llm-text` can cause noisy/incorrect titles from tool/error rows.
2. Removing the per-conversation in-flight task gate can flood `/api/semantic/title` during rapid streaming writes.
3. Breaking helper query ordering can select mismatched assistant model/provider context for title generation.
4. Bypassing lock guard or `WHERE is_locked = 0` upsert condition can overwrite user-pinned conversation titles.

## Related Pages

- [Frontend Sidecar Memory Storage Docs Hub](README.md)
- [Conversation Search Runtime FTS, Semantic Fusion, and Summary-Fetch Contract Reference](conversation_search_runtime_fts_semantic_fusion_and_summary_fetch_contract_reference.md)
- [Conversation Heuristic Title Derivation, Sanitization, and Truncation Contract Reference](conversation_heuristic_title_derivation_sanitization_and_truncation_contract_reference.md)
- [Local Memory Store Embedding, Search, and Memory-Type Routing Reference](local_memory_store_embedding_search_and_memory_type_routing_reference.md)
- [Conversation Transcript Window Queries and FAISS Artifact Cleanup Reference](conversation_transcript_window_queries_and_faiss_artifact_cleanup_reference.md)
- [Transcript Storage, Semantic Candidate, and Watermark Reference](../transcript_storage_semantic_candidate_and_watermark_reference.md)
- [Semantic Summarization Service Config Resolution, Prompt Assembly, and Parser-Fallback Contract Reference](../../../../backend/api/memory/semantic_summarization_service_config_resolution_prompt_assembly_and_parser_fallback_contract_reference.md)
