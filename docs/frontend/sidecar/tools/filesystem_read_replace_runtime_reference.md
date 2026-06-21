---
summary: "Local-runtime filesystem tool reference for `read_file` and `replace`: path/encoding guards, windowed read contracts, replace legacy field guard removal, canonical replacements[] edit mode, lenient-vs-strict replacement matching, and patch-chunk application semantics."
read_when:
  - When changing sidecar filesystem tool behavior, especially read pagination or replace matching rules.
  - When debugging replace legacy field guard behavior, top-level old_string/new_string payloads, replace ambiguity failures, patch-chunk context misses, or read-file truncation messages.
title: "Filesystem Read and Replace Runtime Reference"
---

# Filesystem Read and Replace Runtime Reference

## Canonical Modules

- `frontend/src/main/python/tools/filesystem/read_file_tool.py`
- `frontend/src/main/python/tools/filesystem/replace_tool.py`
- `frontend/src/main/python/tools/filesystem/replace_engine.py`
- `frontend/src/main/python/tools/filesystem/replace_matchers.py`
- `frontend/src/main/python/tools/filesystem/replace_patch_chunks.py`
- `frontend/src/main/python/tools/filesystem/file_utils.py`
- `frontend/src/main/python/tools/schemas.py` (`ReadFileArgs`, `ReplaceArgs`)
- `tests/sidecar/test_read_file_tool.py`
- `tests/sidecar/test_replace_engine.py`
- `tests/sidecar/test_replace_tool.py`

## Runtime Purpose

The sidecar filesystem surface is intentionally narrow:

- `read_file`: safe text reads with pagination + truncation hints
- `replace`: deterministic edits with strict/lenient matching and atomic file writes

`replace` still requires an absolute file path. `read_file` accepts absolute paths and also accepts paths relative to the selected workspace folder when one is set; otherwise relative paths resolve from `Path.home()`.

## `read_file` Contract

Entry: `read_file(args: dict) -> ToolResult`.

Validation:

- `file_path` must resolve to an existing regular file
- absolute paths are allowed; relative paths resolve from the selected workspace folder when available, otherwise from `Path.home()`
- binary-like non-PDF files are rejected via extension/signature/null-byte/printable-ratio checks (`file_utils.is_binary_file`)
- image files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.tif`, `.tiff`, `.ico`, `.svg`) are handled by an image attachment path before binary rejection
- `offset` must be non-negative int
- `limit` must be positive int

Defaults:

- `DEFAULT_LINE_LIMIT = 2000`
- per-line truncation limit `MAX_LINE_LENGTH = 500`

Read behavior:

- file read happens in executor thread (`run_in_executor`) to avoid blocking loop
- text files return line window starting at `offset`
- line endings preserved while truncating overlong line bodies
- reports:
  - `total_lines`
  - `read_lines`
  - `is_truncated` (windowed read or EOF not fully shown)
  - `truncated_line_count`
  - `line_truncation_limit`

PDF behavior (`.pdf`):

- read via `pypdf` page extraction path
- `offset`/`limit` are interpreted as page window controls
- large extracted content is truncated with relevance-aware page ordering under char budget
- includes PDF metadata in response payload (`pdf_total_pages`, `pdf_pages_included`, `pdf_search_terms`)

Image behavior:

- reads image bytes and returns attachment payload fields (`screenshot`, `image_data`, content type, byte size)
- intentionally does not run OCR or extract text from pixels
- returns deterministic `output` note stating OCR is not performed

LLM content shape:

- always starts with `File path: ...`
- truncated windows include explicit paging instructions with next offset
- empty file returns deterministic `"File is empty."`

## `replace` Contract

Entry: `replace(args: dict) -> ToolResult`.

Modes:

- `replacements[]` operation mode (applied atomically in memory; use a one-item
  list for a single edit)
- `patch_chunks[]` ordered line-based update mode (cannot be combined with
  `replacements[]`)

Canonical edit payload:

- `replace` requires exactly one current edit mode: `replacements[]` or
  `patch_chunks[]`
- `old_string`, `new_string`, `replace_all`, `before_context`,
  `after_context`, `occurrence_index`, and `require_eof` belong inside each
  `replacements[]` item
- removed top-level edit fields no longer have a custom legacy field guard;
  payloads that omit `replacements[]` and `patch_chunks[]` fail through the
  canonical parser/validator path

Path + creation policy:

- absolute path required
- existing file edits reject `old_string == ""`
- missing-file creation allowed only for exactly one unconstrained operation with `old_string == ""`
- missing-file + `patch_chunks` is rejected

Write policy:

- performs all matching in memory
- writes once via atomic temp-file + `os.replace`
- failed match never writes partial content

Result payload:

- `replacements` total count
- `matched_spans` + per-operation metadata
- `unified_diff` between normalized before/after content
- `is_new_file`

## Replacement Matching Engine (`replace_engine.py`)

Normalization:

- all content normalized to `\n` line endings before matching/diffing

Match modes:

- `strict`: exact string/line matching only
- `lenient` (default): tolerates whitespace and common unicode punctuation variants

Context constraints:

- optional `before_context` and `after_context`
- optional `require_eof`
- optional `occurrence_index` (1-based)
- `replace_all` supported; incompatible with `occurrence_index`

Ambiguity handling:

- if multiple matches and no disambiguation -> explicit error requiring context/index/replace_all

Fallback path:

- if exact spans fail in lenient mode, engine attempts line-sequence matching
- line-sequence/lenient punctuation matching helpers are isolated in `replace_matchers.py` for reusable, test-focused behavior.
- ordered patch-chunk span resolution/apply helpers are isolated in `replace_patch_chunks.py`.

Patch chunk mode:

- each chunk defines `old_lines` -> `new_lines`
- optional `change_context` anchor moves search cursor after matching line
- optional `is_end_of_file` enforces EOF match
- chunks resolved to line replacements then applied in reverse order to preserve offsets
- final output normalized with trailing newline behavior

## Behavioral Guarantees (Tests)

`tests/sidecar/test_read_file_tool.py` verifies:

- default limit window (`2000`)
- offset/limit paging
- long-line truncation behavior
- offset past EOF window semantics
- empty file message
- large-file paging stability
- image-file attachment payloads (no OCR text extraction)
- non-image binary files still rejected

`tests/sidecar/test_replace_tool.py` verifies:

- unique/single replacement flow
- multi-match rejection without disambiguation
- `replace_all`, `occurrence_index`, `require_eof`
- strict vs lenient behavior differences
- unicode/whitespace lenient normalization
- context-anchor disambiguation
- batch atomicity (no partial writes on failure)
- file creation path
- patch-chunk ordered updates, insertions, EOF matching, and change-context anchors

`tests/sidecar/test_replace_engine.py` verifies:

- operation parsing defaults/validation (`match_mode`, `occurrence_index`, patch-chunk shape guards)
- lenient unicode punctuation matching fallback behavior
- patch-chunk context + EOF anchored line replacement behavior

## Drift Hotspots

1. Changing lenient normalization can silently widen/narrow match scope and break deterministic edits.
2. Adjusting truncation limits/messages in `read_file` can break downstream prompt behavior that depends on offset hints.
3. Altering patch-chunk ordering/search cursor semantics can create hard-to-debug multi-hunk misapplies.
4. Replacing atomic write path with direct write increases partial-write risk on process interruption.

## Related Pages

- [Local-Runtime Tools Docs Hub](README.md)
- [Filesystem Tools Docs Hub](filesystem/README.md)
- [Read-File Window Pagination, Binary Guard, and Truncation Contract Reference](filesystem/read_file_window_pagination_binary_guard_and_truncation_contract_reference.md)
- [Replace Engine Match Modes, Patch Chunks, and Atomic Write Contract Reference](filesystem/replace_engine_match_modes_patch_chunks_and_atomic_write_contract_reference.md)
