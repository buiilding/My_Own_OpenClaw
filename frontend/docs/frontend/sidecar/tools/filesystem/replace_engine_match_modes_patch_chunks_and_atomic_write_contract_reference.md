---
summary: "Deep reference for sidecar `replace`: operation parsing, strict/lenient matching strategy, patch-chunk ordered application, and atomic write/no-partial-update guarantees."
read_when:
  - When changing `replace_tool.py`, `replace_engine.py`, `replace_matchers.py`, `replace_patch_chunks.py`, or `ReplaceArgs` schema behavior.
  - When debugging multi-match ambiguity errors, context-anchor misses, or patch chunk ordering issues.
title: "Replace Engine Match Modes, Patch Chunks, and Atomic Write Contract Reference"
---

# Replace Engine Match Modes, Patch Chunks, and Atomic Write Contract Reference

## Canonical Modules

- `frontend/src/main/python/tools/filesystem/replace_tool.py`
- `frontend/src/main/python/tools/filesystem/replace_engine.py`
- `frontend/src/main/python/tools/filesystem/replace_matchers.py`
- `frontend/src/main/python/tools/filesystem/replace_patch_chunks.py`
- `frontend/src/main/python/tools/schemas.py`
- `tests/sidecar/test_replace_engine.py`
- `tests/sidecar/test_replace_tool.py`

## Entry Modes and Mutual Exclusivity

`replace(args)` supports two exclusive flows:

1. operation mode:
   - one or more operations in `replacements[]`
   - a single edit is represented as a one-item `replacements[]`
2. patch mode:
   - `patch_chunks[]`

Guard rule:

- `patch_chunks` cannot be combined with `replacements`

## Path and Creation Policy

Path guard:

- `file_path` must be absolute

Missing-file behavior:

- patch mode rejected for missing files
- creation allowed only for one unconstrained operation where:
  - `old_string == ""`
  - no context constraints
  - no occurrence index
  - `require_eof == False`

Existing-file behavior:

- empty `old_string` is rejected

## Matching and Normalization

All content normalized to `\n` line endings before matching.

Match modes:

- `strict`: exact comparisons only
- `lenient` (default): allows relaxed matching

Lenient normalization includes:

- trimmed/whitespace-relaxed comparisons
- punctuation normalization (curly quotes/dashes, non-breaking spaces)

## Operation Mode Resolution

`build_operations(args)` parses operation definitions into normalized `ReplaceOperation` structs with:

- context constraints (`before_context`, `after_context`)
- disambiguation controls (`occurrence_index`, `replace_all`)
- EOF enforcement (`require_eof`)
- per-op or default `match_mode`

Ambiguity behavior:

- multiple candidate spans without disambiguation returns explicit error

Disambiguation tools:

- `replace_all`
- `occurrence_index` (1-based)
- context fields
- EOF constraint

## Patch Chunk Mode Resolution

`patch_chunks[]` map into ordered chunk updates:

- `old_lines` -> `new_lines`
- optional `change_context` anchor
- optional `is_end_of_file`

Chunk apply algorithm:

1. resolve each chunk to matched line span
2. convert to replacements with absolute ranges
3. apply replacements in reverse index order to preserve earlier offsets

Supports:

- pure insertion chunks (`old_lines: []`)
- interleaved multi-chunk updates
- Unicode-lenient line matching in patch mode

## Atomic Write Guarantee

No partial writes:

- all matching and transformations happen in memory
- final content written once through temp-file + `os.replace`

If any operation/chunk fails:

- write is skipped
- original file content remains unchanged

## Output Contract

Success payload includes:

- `replacements` count
- `matched_spans`
- `operations` metadata
- `unified_diff`
- `is_new_file`

Failure payload includes specific reason (e.g., multi-match ambiguity, operation index failure, context miss, invalid mode combination).

## Test-Backed Invariants

`tests/sidecar/test_replace_tool.py` validates:

- single unique replacement
- multi-match rejection without disambiguation
- `replace_all`, `occurrence_index`, and `require_eof` semantics
- strict vs lenient behavior differences
- lenient Unicode dash and whitespace normalization
- context-based disambiguation (`before_context`, `after_context`)
- batched operation atomicity (no partial writes on failure)
- missing-file creation gate behavior
- patch chunk updates, insertions, EOF insertion, and `change_context` anchoring

## Drift Hotspots

1. broadening lenient normalization can introduce accidental over-matching.
2. changing disambiguation precedence can alter which span is selected for same input.
3. modifying reverse-apply patch ordering can corrupt multi-chunk updates.
4. replacing atomic write with direct write reintroduces partial-write risk.
5. changing creation-gate rules can allow unintended file creation/update modes.
