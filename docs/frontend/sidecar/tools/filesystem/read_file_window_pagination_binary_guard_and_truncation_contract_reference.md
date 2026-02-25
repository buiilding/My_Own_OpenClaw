---
summary: "Deep reference for sidecar `read_file`: absolute-path guardrails, binary/encoding detection, line-window pagination semantics, and long-line truncation messaging."
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

- `file_path`: absolute path to an existing regular file

Optional controls:

- `offset`: 0-based line start (default `0`)
- `limit`: max lines to return (default `2000`)

Validation failures:

- non-absolute path -> error
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

## LLM Content Formatting

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

## Drift Hotspots

1. changing default limit or truncation hint text can break model-side paging expectations.
2. adjusting binary heuristic thresholds can unexpectedly block valid text files or admit binary payloads.
3. removing executor offload can increase event-loop stalls on larger files.
4. changing `is_truncated` logic affects follow-up read behavior driven by assistant prompts.
