---
summary: "Deep reference for transcript conversation-search helper utilities: query-term extraction, FTS query builder, snippet-window shaping, hit grouping/deduping, lexical-preferred best-hit selection, and safe timestamp parsing."
read_when:
  - When changing `conversation_search_helpers.py` helper behavior consumed by LocalMemoryStore ranking flows.
  - When debugging missing query terms, malformed snippets, duplicate-match counting, or timestamp parse drift in conversation search scoring.
title: "Conversation Search Helper Term, Snippet, Grouping, and Timestamp Contract Reference"
---

# Conversation Search Helper Term, Snippet, Grouping, and Timestamp Contract Reference

## Canonical Modules

- `frontend/src/main/python/memory/conversation_search_helpers.py`
- `frontend/src/main/python/memory/local_store.py`
- `tests/sidecar/test_conversation_search_helpers.py`

## Helper Surface

`conversation_search_helpers.py` provides pure utility helpers used by runtime and merge/ranking flows:

- `extract_query_terms(query)`
- `build_fts_query(query)`
- `build_content_snippet(content, query)`
- `build_conversation_hit(...)`
- `group_conversation_search_hits(lexical_hits, semantic_hits)`
- `pick_best_conversation_hit(hit_info)`
- `safe_timestamp_to_epoch_seconds(timestamp)`

## Query-Term Extraction Contract (`extract_query_terms`)

Normalization behavior:

- token regex: `[A-Za-z0-9_]+` over lowercased query
- trims each token
- drops terms shorter than 2 chars
- preserves first-seen order
- dedupes repeated terms
- max retained terms: `8`

Result implications:

- short/noisy tokens are intentionally ignored for FTS/LIKE stability
- first 8 surviving terms define lexical query scope

## FTS Query Builder Contract (`build_fts_query`)

Behavior:

- builds from `extract_query_terms(...)`
- returns empty string when no terms survive
- appends `*` prefix wildcard to each term
- joins terms with spaces

Example:

- input `lawyer outreach` -> `lawyer* outreach*`

## Snippet Builder Contract (`build_content_snippet`)

Behavior for empty/short content:

- empty/blank content -> `""`
- normalizes whitespace to single spaces
- if content length <= `160` chars -> full normalized content

Behavior for long content:

- finds first query-term occurrence in lowercase text (term order from `extract_query_terms`)
- default hit index `0` when no term match
- builds focused window:
  - target span length `130`
  - back-shift start by up to `45` chars before hit
- adds ellipsis markers when truncated:
  - prefix `…` when start > 0
  - suffix `…` when end < len(text)

## Hit Envelope Contract (`build_conversation_hit`)

Output fields:

- `memory_id`
- `conversation_id`
- `role`
- `content`
- `timestamp`
- `source`
- `score`
- `snippet`

Role normalization:

- trimmed lowercase role
- fallback role `"assistant"` when role missing/blank

Score normalization:

- always cast to float in output envelope

## Grouping + Dedup Contract (`group_conversation_search_hits`)

Grouping key:

- `conversation_id`

Dedup rule:

- per-conversation duplicate `memory_id` rows are ignored after first insertion

Per-conversation tracked counters:

- `lexical_match_count`
- `semantic_match_count`
- `lexical_best`
- `semantic_best`
- derived `match_count` (unique memory id count)

Internal `match_ids` set is removed from final payload.

## Best-Hit Selection Contract (`pick_best_conversation_hit`)

Selection behavior:

- if any lexical hits exist, returns highest-score lexical hit
- else returns highest-score hit from all sources
- if no hits available, returns fallback envelope:
  - source `lexical`
  - role `assistant`
  - timestamp `None`
  - snippet `""`
  - score `0.0`

This lexical-preference rule controls snippet/source attribution shown in merged conversation results.

## Timestamp Parse Contract (`safe_timestamp_to_epoch_seconds`)

Behavior:

- invalid/blank/non-string input -> `0.0`
- accepts ISO strings including `Z` suffix (`Z` normalized to `+00:00`)
- naive timestamps are interpreted as UTC
- parse failures return `0.0` (fail-safe, no exceptions)

Used for recency scoring/sort tie-break safety across heterogeneous stored timestamp formats.

## Test-Backed Invariants

`tests/sidecar/test_conversation_search_helpers.py` validates:

- term dedupe/short-term filtering/max-8 cap behavior
- FTS wildcard query assembly and empty fallback
- long-snippet hit focus + ellipsis wrapping
- grouping dedupe by memory id and lexical-preferred best-hit selection
- timestamp parse behavior for `Z` suffix and invalid values

## Drift Hotspots

1. Changing token regex/length threshold can silently widen or collapse search recall.
2. Removing per-conversation `memory_id` dedupe can inflate match counts and over-weight repeated rows.
3. Changing lexical-preferred best-hit selection can alter snippet/source behavior in UI without runtime code changes.
4. Tightening timestamp parse errors instead of returning `0.0` can introduce avoidable exceptions in ranking paths.

## Related Pages

- [Local Runtime Memory Storage Docs Hub](README.md)
- [Local Memory Store Embedding, Search, and Memory-Type Routing Reference](local_memory_store_embedding_search_and_memory_type_routing_reference.md)
