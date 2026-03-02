---
summary: "Deep reference for sidecar-native deterministic extraction for Browser Use `extract` and `read_long_content`: markdown pipeline, focused excerpt behavior, pagination metadata, and error/debug boundaries."
read_when:
  - When changing deterministic extraction behavior in `browser_runtime.py`.
  - When debugging `extract`/`read_long_content` failures, content-window issues, or markdown extraction import/runtime errors.
title: "Browser Runtime Deterministic Extraction Contract Reference"
---

# Browser Runtime Deterministic Extraction Contract Reference

## Canonical Modules

- `frontend/src/main/python/tools/browser/browser_runtime.py`
- `tests/sidecar/tools/test_browser_use_adapter.py`

## Runtime Role

Deterministic extraction keeps sidecar browser actions lightweight and removes sidecar LLM inference from extraction actions.

- `extract` and `read_long_content` execute directly in `_BrowserUseActionBridge`
- sidecar uses vendored Browser Use markdown extraction helpers
- runtime returns stable payload/metadata fields for frontend/backend consumers

## Deterministic Execution Flow

For both extraction actions:

1. ensure Browser Use runtime modules/session are available
2. call `browser_use.dom.markdown_extractor.extract_clean_markdown(...)`
3. produce focused excerpt from markdown text
4. return action payload with deterministic metadata

No extraction model/provider lookup occurs in sidecar.

## `extract` Action Contract

Input behavior:

- requires non-empty `query`
- optional `extract_links` (default `False`)
- optional `max_chars`; clamped to `MAX_DETERMINISTIC_EXTRACT_CHARS`

Output behavior:

- includes `content` and `extracted_content`
- includes deterministic metadata:
  - `extraction_backend="sidecar_deterministic"`
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

- includes `extracted_content`
- includes deterministic metadata:
  - `extraction_backend="sidecar_deterministic"`
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
- markdown extractor import/function contract is unavailable

Errors are surfaced as action failure payloads in the same shape used by other Browser Use actions.

## Debug Checklist

1. Verify controller/browser connection status before extraction action dispatch.
2. Verify action input includes non-empty `query` or `goal`.
3. Verify `browser_use.dom.markdown_extractor.extract_clean_markdown` resolves from vendored Browser Use tree.
4. Verify clamped `offset/max_chars` values when truncation behavior looks incorrect.
5. Check metadata (`returned_chars`, `total_chars`, `has_more`, `next_offset`) to confirm pagination windowing path.

## Related Pages

- [Frontend Sidecar Browser Docs Hub](README.md)
- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Adapter Action Routing and Compatibility Semantics Reference](browser_adapter_action_routing_and_compatibility_semantics_reference.md)
- [Browser Action Compatibility and Runtime Reference](../browser_action_compatibility_and_runtime_reference.md)
