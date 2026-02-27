---
summary: "Deep reference for transcript conversation-search runtime helpers: FTS5/LIKE lexical paths, episodic semantic-hit filtering, score fusion behavior, and conversation summary/title fetch normalization."
read_when:
  - When changing `conversation_search_runtime.py` helper behavior used by `LocalMemoryStore.search_conversations`.
  - When debugging missing conversation hits, FTS fallback behavior, or `New chat`/`pending` title states in search results.
title: "Conversation Search Runtime FTS, Semantic Fusion, and Summary-Fetch Contract Reference"
---

# Conversation Search Runtime FTS, Semantic Fusion, and Summary-Fetch Contract Reference

## Canonical Modules

- `frontend/src/main/python/memory/conversation_search_runtime.py`
- `frontend/src/main/python/memory/conversation_search_helpers.py`
- `frontend/src/main/python/memory/conversation_title_helpers.py`
- `frontend/src/main/python/memory/local_store.py`
- `tests/sidecar/test_conversation_search_runtime.py`
- `tests/sidecar/test_conversation_search_helpers.py`
- `tests/sidecar/test_conversation_search.py`

## Runtime Helper Surface

`conversation_search_runtime.py` provides async/runtime helpers used by `LocalMemoryStore.search_conversations(...)`:

- `search_transcript_hits_lexical(...)`
- `search_transcript_hits_like(...)`
- `search_transcript_hits_semantic(...)`
- `fetch_conversation_summaries(...)`
- `search_transcript_conversations(...)`
- `build_ranked_conversation_search_rows(...)`

These isolate runtime querying/scoring from small pure helper utilities in `conversation_search_helpers.py`.

## Lexical Search Contract (`search_transcript_hits_lexical`)

Primary lexical path:

- builds FTS query via `build_fts_query(...)`
- returns early with `[]` when normalized FTS query is empty
- executes FTS5 query joining `transcript_fts` to transcript rows in `memories`
- orders by `bm25(transcript_fts)` ascending then newest timestamp

Per-hit score formula:

- `position_score = 1 - (index / limit)` clamped to `>=0`
- `rank_factor = 1 / (1 + abs(lexical_rank))`
- final lexical score = `(position_score * 0.72) + (rank_factor * 0.28)`

Failure behavior:

- any FTS query exception logs warning and falls back to `search_transcript_hits_like(...)`

## LIKE Fallback Contract (`search_transcript_hits_like`)

Fallback path:

- term extraction uses `extract_query_terms(...)`
- returns `[]` when no query terms survive normalization
- builds OR clause `LOWER(content) LIKE ?` per term
- filters transcript rows with non-null `conversation_id`
- orders by newest timestamp

Per-hit fallback score:

- rank-only linear decay by index (`1 - index/limit`, clamped)

All rows are converted through `build_conversation_hit(...)` with source `lexical`.

## Semantic Transcript Search Contract (`search_transcript_hits_semantic`)

Semantic source:

- calls `store.search(query, user_id, filters={"type":"episodic"}, limit=limit)`

Filtering rules:

- keeps only rows where metadata `record_kind == "transcript"`
- conversation id resolved from row field or metadata
- rows without conversation id are skipped

Per-hit semantic score:

- raw vector score normalized from `[-1,1]` to `[0,1]`:
  - `semantic_score = clamp((raw_score + 1.0) / 2.0, 0.0, 1.0)`
- rank bonus = `1 - index/limit` clamped
- final semantic score = `(semantic_score * 0.74) + (rank_bonus * 0.26)`

Failure behavior:

- semantic search exceptions are logged and surfaced as empty hit list

## Conversation Summary Fetch Contract (`fetch_conversation_summaries`)

Input normalization:

- keeps only non-empty string `conversation_ids`
- returns `{}` when normalized list is empty

SQL contract:

- grouped transcript aggregate per conversation:
  - `MIN(timestamp)`/`MAX(timestamp)`/`COUNT(*)`
- correlated subqueries fetch:
  - `conversation_titles.title/source/is_locked`
  - latest non-empty transcript `model_id` + `model_provider`

Title resolution:

- uses `ensure_conversation_title(...)` per conversation
- when unresolved title remains blank, fallback title is `"New chat"`
- unresolved fallback source becomes `"pending"`
- `is_resumable` true only when conversation id starts with `conv_`

## End-to-End Runtime Orchestration (`search_transcript_conversations`)

Orchestration contract:

- query normalization + minimum-length guard (`len(query.strip()) >= 2`)
- lexical query path on episodic DB connection
- semantic query path via store callback
- grouped hit merge via `group_conversation_search_hits(...)`
- early return when grouped hits are empty
- summary fetch on episodic DB connection
- final row ranking/limit via `build_ranked_conversation_search_rows(...)`

## Final Ranking Contract (`build_ranked_conversation_search_rows`)

Input contract:

- grouped hit payload from `group_conversation_search_hits(...)`
- summary payload from `fetch_conversation_summaries(...)`
- `limit` and caller-supplied `now_epoch_seconds`

Score formula:

- lexical contribution: `lexical_best * 0.56`
- semantic contribution: `semantic_best * 0.32`
- match count contribution: `min(match_count, 8) * 0.03`
- recency boost: `1 / (1 + age_days/14)` weighted by `0.12`

Output contract:

- drops grouped-hit entries without matching summary row
- sorts by `score DESC`, then `last_timestamp DESC` tie-break
- enforces `max(1, limit)` result floor
- includes renderer-facing fields (`match_source`, `matched_role`, `matched_at`, `snippet`)

## LocalMemoryStore Integration Boundary

`LocalMemoryStore.search_conversations(...)` orchestrates:
- delegates to `search_transcript_conversations(...)`
- passes `episodic_db_path`, logger, and caller limits/query/user id
- passes current UTC epoch seconds for recency scoring determinism

## Test-Backed Invariants

`tests/sidecar/test_conversation_search_runtime.py` verifies:

- FTS failures trigger LIKE fallback and still emit lexical hits
- semantic helper filters out non-transcript and missing-conversation rows
- summary fetch assigns `title_source="pending"` for unresolved `New chat` entries
- conversation-id placeholder normalization excludes blank/null ids
- orchestration early returns for short queries and empty grouped-hit paths
- final score/recency ranking order and limit-floor behavior

`tests/sidecar/test_conversation_search_helpers.py` + `test_conversation_search.py` verify:

- term/query/snippet shaping and grouping behavior
- high-level search ranking behavior across lexical/semantic fusion inputs

## Drift Hotspots

1. Changing FTS exception handling can silently remove fallback hit coverage in environments without healthy FTS tables.
2. Removing transcript-only semantic filtering can pollute search with interaction/tool rows.
3. Changing score weights without coordinated docs/tests can shift search ranking behavior unexpectedly.
4. Changing summary-title fallback/source semantics can break renderer assumptions for pending title UI state.

## Related Pages

- [Frontend Sidecar Memory Storage Docs Hub](README.md)
- [Conversation Search Helper Term, Snippet, Grouping, and Timestamp Contract Reference](conversation_search_helper_term_snippet_grouping_and_timestamp_contract_reference.md)
- [Local Memory Store Embedding, Search, and Memory-Type Routing Reference](local_memory_store_embedding_search_and_memory_type_routing_reference.md)
- [Conversation Title Generation Runtime and Helper Contract Reference](conversation_title_generation_runtime_and_helper_contract_reference.md)
- [Conversation Transcript Window Queries and FAISS Artifact Cleanup Reference](conversation_transcript_window_queries_and_faiss_artifact_cleanup_reference.md)
