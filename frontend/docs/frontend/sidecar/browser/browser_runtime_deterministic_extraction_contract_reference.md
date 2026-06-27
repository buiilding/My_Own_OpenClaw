---
summary: "Deep reference for local-runtime deterministic extraction for Browser Use `extract` and `read_long_content`: markdown pipeline, focused excerpt behavior, pagination metadata, and error/debug boundaries."
read_when:
  - When changing deterministic extraction behavior in `browser_use_engine.py`.
  - When debugging `extract`/`read_long_content` failures or content-window issues.
title: "Browser Runtime Deterministic Extraction Contract Reference"
---

# Browser Runtime Deterministic Extraction Contract Reference

## Canonical Modules

- `frontend/src/main/python/tools/browser/browser_use_engine.py`
- `tests/sidecar/tools/test_browser_use_engine.py`

## Runtime Role

Deterministic extraction keeps local-runtime browser actions lightweight and removes local-runtime LLM inference from extraction actions.

- `extract` and `read_long_content` execute in `BrowserUseEngineRuntime`
- the local-runtime browser adapter reads page HTML through Browser Use CLI and uses WindieOS markdown/focused-excerpt helpers
- runtime returns stable payload/metadata fields for backend and client consumers

## Deterministic Execution Flow

For both extraction actions:

1. call the Browser Use CLI to read page HTML
2. convert HTML to markdown through `content_extraction.py`
3. produce focused excerpt from markdown text
4. return action payload with deterministic metadata

No extraction model/provider lookup occurs in local-runtime Python.

## `extract` Action Contract

Input behavior:

- requires non-empty `query`
- optional `extract_links` (default `False`)
- optional `max_chars`; clamped to `MAX_DETERMINISTIC_EXTRACT_CHARS`

Output behavior:

- includes focused page text in canonical `output`
- includes deterministic metadata:
  - `extraction_backend="browser_use.cli"`
  - `total_chars`
  - `returned_chars`
  - `has_more`
  - `next_offset` (when truncated)

## `read_long_content` Action Contract

Input behavior:

- requires non-empty `goal`
- optional `offset` (default `0`)
- optional `max_chars`; clamped to `MAX_DETERMINISTIC_EXTRACT_CHARS`

Output behavior:

- includes focused page text in canonical `output`
- includes deterministic metadata:
  - `extraction_backend="browser_use.cli"`
  - `offset`
  - `total_chars`
  - `returned_chars`
  - `has_more`
  - `next_offset`

## Non-Extraction Browser Use Actions

All other Browser Use actions still route to Browser Use registry execution.

- `page_extraction_llm` is always passed as `None`
- runtime behavior for non-extraction actions remains unchanged

## Error Boundaries

`extract`/`read_long_content` fail closed when:

- browser session is not connected/available
- required action input (`query` or `goal`) is blank
- Browser Use CLI HTML retrieval fails

Errors are surfaced as action failure payloads in the same shape used by other Browser Use actions.

## Debug Checklist

1. Verify Browser Use session status before extraction action dispatch.
2. Verify action input includes non-empty `query` or `goal`.
3. Verify Browser Use CLI `get html` returns page HTML.
4. Verify clamped `offset/max_chars` values when truncation behavior looks incorrect.
5. Check metadata (`returned_chars`, `total_chars`, `has_more`, `next_offset`) to confirm pagination windowing path.

## Related Pages

- [Local-Runtime Browser Docs Hub](README.md)
- [Browser Action Runtime Reference](../browser_action_runtime_reference.md)
