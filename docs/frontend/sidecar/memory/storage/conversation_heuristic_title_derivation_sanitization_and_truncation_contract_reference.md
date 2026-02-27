---
summary: "Deep reference for sidecar heuristic conversation-title derivation utility: candidate sanitization order, smalltalk filtering, user-vs-assistant precedence, truncation limits, and fallback-title behavior."
read_when:
  - When changing `memory/conversation_titles.py` title heuristics or deciding whether to wire heuristic fallback into runtime title generation.
  - When debugging why derived fallback titles drop URL/prompt prefixes, collapse to `New chat`, or truncate at 8 words / 72 chars.
title: "Conversation Heuristic Title Derivation, Sanitization, and Truncation Contract Reference"
---

# Conversation Heuristic Title Derivation, Sanitization, and Truncation Contract Reference

## Canonical Module

- `frontend/src/main/python/memory/conversation_titles.py`

## Runtime Role

`derive_conversation_title(user_text, assistant_text)` builds a short title candidate from early transcript text.

Current status:

- utility module exists in sidecar memory package
- no current runtime imports from `local_store`/title helper pipeline
- safe to treat as heuristic/fallback utility contract for future integration

## Selection Precedence Contract

Candidate precedence is strict:

1. sanitized user candidate
2. sanitized assistant candidate
3. fallback title `"New chat"`

For each candidate in priority order:

- skip missing/blank candidates
- skip generic smalltalk candidates
- return first remaining candidate after truncation

If both candidates sanitize to blank, return `"New chat"`.

## Sanitization Pipeline Contract

`_sanitize_candidate(text)` applies this ordered transform chain:

1. non-string or blank -> `""`
2. keep only first line (`splitlines()[0]`)
3. remove URLs via `https?://\S+` regex
4. strip backticks
5. collapse repeated whitespace
6. strip edge punctuation (` .,!?:;"'()[]{} `)
7. remove common leading prompt phrases (case-insensitive), including:
   - `please`, `can you`, `could you`, `would you`
   - `help me`, `i need to`, `i want to`
   - `show me`, `tell me`, `how to`, `how do i`

Output is a trimmed plain-text candidate or empty string.

## Smalltalk Filter Contract

`_is_generic_smalltalk(candidate)` returns true for:

- exact tokens in `_GENERIC_SMALLTALK` (`hi`, `hello`, `thanks`, `test`, `testing`, etc.)
- two-word variants where both tokens are in that set (`hi there`, `hello assistant`)

Effect:

- smalltalk-only openings do not become titles
- function falls through to assistant candidate or fallback title

## Truncation Contract

`_truncate_candidate(candidate)` applies:

- max `8` words (`_MAX_WORDS`)
- max `72` chars (`_MAX_CHARS`) after word-trim step
- empty post-trim result falls back to `"New chat"`

No ellipsis marker is appended.

## Constants Contract

- `_FALLBACK_TITLE = "New chat"`
- `_MAX_WORDS = 8`
- `_MAX_CHARS = 72`
- URL and leading-prompt regexes are case-insensitive

These constants define user-visible title shape for any runtime that adopts this helper.

## Drift Hotspots

1. Relaxing smalltalk filtering can produce noisy one-word titles in sidebar/resume surfaces.
2. Changing transform order (for example truncating before prompt-prefix stripping) alters stable title output and can break UX expectations.
3. Increasing max words/chars without UI review can overflow compact title slots in dashboard and chat resume lists.
4. Wiring this helper into active title pipeline without lock/persistence policy alignment can conflict with `conversation_title_helpers` + DB `conversation_titles` state.

## Related Pages

- [Frontend Sidecar Memory Storage Docs Hub](README.md)
- [Conversation Title Generation Runtime and Helper Contract Reference](conversation_title_generation_runtime_and_helper_contract_reference.md)
- [Conversation Transcript Window Queries and FAISS Artifact Cleanup Reference](conversation_transcript_window_queries_and_faiss_artifact_cleanup_reference.md)
- [Frontend Sidecar Memory Docs Hub](../README.md)
