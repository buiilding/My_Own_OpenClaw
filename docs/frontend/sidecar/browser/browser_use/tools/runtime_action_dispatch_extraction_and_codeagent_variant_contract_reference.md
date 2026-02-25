---
summary: "Deep reference for browser_use tools runtime behavior: action registration catalog, event-dispatch execution patterns, extraction/search/evaluate flows, memory payload conventions, and CodeAgent-specific action-set overrides."
read_when:
  - When changing `tools/service.py` action logic or action-memory conventions.
  - When debugging click/input/upload edge cases, structured extraction flow, or CodeAgent tool availability differences.
title: "Browser Use Tools Runtime Action Dispatch, Extraction, and CodeAgent Variant Contract Reference"
---

# Browser Use Tools Runtime Action Dispatch, Extraction, and CodeAgent Variant Contract Reference

This page documents:

- `frontend/src/main/python/tools/browser/browser_use/tools/service.py`
- `frontend/src/main/python/tools/browser/browser_use/tools/utils.py`

## Runtime Shell Overview

`Tools` is the runtime action container that:

- registers built-in browser/file actions on construction
- delegates execution through `Registry.execute_action(...)`
- normalizes action result envelopes into `ActionResult`
- supports dynamic direct-calls via `__getattr__` wrappers

`Controller` is retained as backward-compat alias.

## Action Registration Surface in `Tools.__init__`

Registered categories:

- navigation/search: `search`, `navigate`, `go_back`, `wait`
- interaction: `click`, `input`, `scroll`, `send_keys`, `find_text`, `screenshot`, `upload_file`
- tabs/dropdowns: `switch`, `close`, `dropdown_options`, `select_dropdown`
- extraction/exploration: `extract`, `search_page`, `find_elements`, `read_long_content`, `evaluate`
- filesystem utilities: `write_file`, `replace_file`, `read_file`
- completion: `done` (structured or free-text mode)

`terminates_sequence` is set for actions that should stop remaining multi-act queue execution (for example navigation/tab switching).

## Click and Input Execution Contracts

### Click modes

`click` registration switches based on coordinate mode:

- default: index-only (`ClickElementActionIndexOnly`)
- optional: index or coordinates (`ClickElementAction`)

Coordinate mode:

- converts LLM screenshot coordinates into viewport coordinates when resized screenshots were used
- dispatches `ClickCoordinateEvent`

Index mode:

- resolves node from selector map
- dispatches `ClickElementEvent`
- auto-routes select-click validation failures into dropdown options helper when possible

Both paths try to detect new tab creation and append tab hint to returned memory.

### Input mode

`input(...)` dispatches `TypeTextEvent` with sensitive-data flags and optional placeholder key labels.

Post-input behavior:

- metadata may include `actual_value`; mismatch note is appended for non-sensitive writes
- autocomplete detection advises wait-and-click flow; combobox-like fields trigger short delay for suggestion population

`tools/utils.py` contributes `get_click_description(...)` and checkbox-state resolution helpers for memory text.

## Upload and File Interaction Semantics

Upload path validates file availability with layered checks:

- explicit `available_file_paths`
- recently downloaded files
- `FileSystem` managed files
- remote-browser relaxed behavior

Upload target resolution:

- starts near selected node (ancestor/sibling/descendant search)
- fallback selects nearest file input by scroll position
- dispatches `UploadFileEvent` with resolved node

Filesystem helper actions in `Tools` call sidecar `FileSystem` APIs and return user-facing result strings plus bounded long-term memory.

## Extraction and Search Flows

### `extract(...)`

Flow:

1. resolve optional output schema (action payload or injected extraction schema)
2. convert schema to runtime model when possible
3. extract clean markdown via unified DOM markdown extractor
4. structure-aware chunk selection (`start_from_char`, `has_more`, overlap prefix)
5. invoke extraction LLM in structured or free-text mode
6. package result into XML-tagged extracted content + memory/metadata

Structured mode metadata includes `ExtractionResult` payload serialized under `metadata.extraction_result`.

Large extracted payloads are file-spooled when exceeding memory threshold.

### Zero-LLM page search tools

`search_page` and `find_elements` execute JS snippets via CDP Runtime evaluate, returning formatted human-readable result summaries without LLM usage.

## Long-Content Reader (`read_long_content`)

Supports:

- current page source via markdown extraction
- local file source with whitelist checks
- PDF adaptive extraction using `pypdf`

For large content it performs relevance selection:

- LLM-derived search terms
- chunk/page scoring
- bounded-content assembly with gaps/truncation markers

## JavaScript Evaluation Contract (`evaluate`)

`evaluate(...)` runs JS through CDP and applies:

- quote/escape repair heuristics (`_validate_and_fix_javascript`)
- exception-details to action error conversion
- large-result truncation
- base64 image extraction into metadata image list
- memory-length-aware long-term-memory compaction

## Completion Action Modes

### Structured output mode

`done` returns `params.data.model_dump(mode='json')` and keeps `success` outside user payload schema.

### Non-structured mode

`done` optionally inlines `files_to_display` content into user message and resolves attachment paths via `FileSystem`.

## Orchestration Entry Point (`act`)

`act(...)`:

- wraps execution in optional Laminar span when available
- catches `BrowserError`/`TimeoutError`/generic exceptions
- always normalizes to `ActionResult`
- is the canonical path also used by dynamic `__getattr__` wrappers

## CodeAgent Variant (`CodeAgentTools`)

`CodeAgentTools` extends `Tools` with code-first defaults:

- excludes extraction/search/screenshot and filesystem text helpers by default
- overrides `done` attachment logic to include regular disk files beyond FileSystem-managed files
- provides upload-file variant with relaxed local-disk path handling when whitelist is absent

This keeps code-agent loops centered on Python execution and explicit browser interaction tools.

## Related Docs

- [Browser Use Tools Action Model Surface and Input Schema Contract Reference](action_model_surface_and_input_schema_contract_reference.md)
- [Browser Use Tools Registry Signature Normalization, Sensitive Placeholder, and Domain Filter Contract Reference](registry_signature_normalization_sensitive_placeholder_and_domain_filter_contract_reference.md)
- [Frontend Sidecar Browser Use DOM Docs Hub](../dom/README.md)
