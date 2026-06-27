---
summary: "Deep reference for sidecar `read_file`: workspace-relative path resolution, binary/encoding detection, line-window pagination semantics, and long-line truncation messaging."
read_when:
  - When changing `read_file_tool.py`, `file_utils.py`, or `ReadFileArgs` schema fields.
  - When debugging offset/limit paging behavior, binary-file rejections, or truncated-line output hints.
title: "Read-File Window Pagination, Binary Guard, and Truncation Contract Reference"
---

# Read-File Window Pagination, Binary Guard, and Truncation Contract Reference

## Canonical Modules

- `frontend/src/main/python/tools/filesystem/read_file_tool.py`
- `frontend/src/main/python/tools/filesystem/file_utils.py`
- `frontend/src/main/python/tools/schemas.py`
- `tests/sidecar/test_read_file_tool.py`

## Input Contract and Validation

`read_file(args)` requires:

- `file_path`: path to an existing regular file
  - absolute paths are allowed
  - relative paths resolve from the selected workspace folder when `filesystem_workspace_access` has a stored selected path
  - if no workspace folder is selected, relative paths resolve from `Path.home()`

Optional controls:

- `offset`: 0-based line start (default `0`)
- `limit`: max lines to return (default `2000`)

Validation failures:

- missing path / non-file path -> error
- invalid `offset` (< 0 or non-int) -> error
- invalid `limit` (<= 0 or non-int) -> error

## Binary Guard Pipeline

`is_binary_file(path)` checks:

1. extension fast-path against binary extension set (`.png`, `.zip`, `.exe`, `.pdf`, etc.)
2. magic-byte signature checks (`PNG`, `JPEG`, `PDF`, `ELF`, etc.)
3. null-byte presence in header
4. printable-ratio heuristic on first bytes (`< 70%` printable => binary-like)

If binary-like:

- `read_file` rejects with binary-file message and does not return text content

Exception:

- `.pdf` files are handled by a dedicated `pypdf` extraction path before binary rejection.
- PDF reads use page extraction + size-aware relevance selection instead of line-window reads.
- supported image files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.bmp`, `.tif`, `.tiff`, `.ico`, `.svg`) are handled before binary rejection and returned as image attachment payloads.

## PDF Read Path

For `.pdf` files, `read_file`:

- imports `pypdf` and extracts text page-by-page
- uses `offset`/`limit` as page-window controls (`offset` = starting page index, `limit` = max pages considered)
- applies size-aware truncation (`PDF_MAX_CHARS`) with relevance-first page ordering:
  - always include the first page of the current page window
  - prioritize pages matching search terms from request context (`query`, `search_query`, `goal`, `context`, `explanation`, file stem)
  - fill remaining budget with other pages in order
- returns PDF metadata fields:
  - `pdf_total_pages`
  - `pdf_pages_included`
  - `pdf_search_terms`

## Image Read Path

For supported image files, `read_file`:

- reads raw bytes and returns base64 attachment fields (`screenshot`, `image_data`)
- includes MIME metadata (`screenshot_content_type`, `image_content_type`) and `image_size_bytes`
- returns a deterministic `output` note that OCR/text extraction is not performed

The local-runtime execution result remains image-rich so the agent can inspect
the file. SDK tool-result persistence must materialize those inline bytes to a
durable artifact ref and typed tool-result display attachment before writing
conversation replay state, so restarting the app can show the image without
storing raw base64 in the local conversation event.

## Encoding Path

`detect_encoding(path)` behavior:

- tries `chardet` when available
- fallback default `utf-8`
- file read uses `errors="replace"` to avoid hard decode failure

## Window Read Semantics

Read operation executes in executor thread:

- avoids blocking event loop for large files
- iterates whole file to compute `total_lines`
- collects only requested window `[offset, offset+limit)`

Result fields:

- `content`: joined window text
- `total_lines`
- `read_lines`
- `is_truncated`
- `line_truncation_limit` (`500`)
- `truncated_line_count`

`is_truncated` becomes `True` when:

- `offset > 0`, or
- window end < total lines

This means offset-past-EOF still marks truncated because view is partial relative to user request context.

## Long-Line Truncation Contract

Per line body max:

- `MAX_LINE_LENGTH = 500`

Implementation details:

- preserves original line endings (`\n`, `\r\n`, `\r`)
- truncates only body characters
- increments per-line truncation counter

Response messaging includes line-truncation note when any line was shortened.

## Output Formatting

Every response starts with:

- `File path: <absolute_path>`

Truncated window path adds:

- explicit `"IMPORTANT: The file content has been truncated."`
- shown range status
- next paging hint with concrete `offset` value

Empty-file path returns:

- `File is empty.`

Offset-past-EOF path returns:

- `"Showing 0 lines..."` status in truncation section

## Test-Backed Invariants

`tests/sidecar/test_read_file_tool.py` validates:

- default limit of 2000 lines
- offset/limit window slicing
- long-line truncation to 500 chars
- offset past EOF returns empty content window with truncation status
- empty-file deterministic message
- large file with tiny limit keeps paging behavior stable
- image payload output shape and explicit no-OCR note
- non-image binary files remain rejected

## Drift Hotspots

1. changing default limit or truncation hint text can break model-side paging expectations.
2. adjusting binary heuristic thresholds can unexpectedly block valid text files or admit binary payloads.
3. removing executor offload can increase event-loop stalls on larger files.
4. changing `is_truncated` logic affects follow-up read behavior driven by assistant prompts.
