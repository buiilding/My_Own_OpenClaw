---
summary: "Local-runtime filesystem tools docs sub-hub for read-file pagination/binary guards and replace engine matching/atomic write semantics backed by local-runtime Python implementations."
read_when:
  - When changing sidecar filesystem tools under `frontend/src/main/python/tools/filesystem/*`.
  - When debugging read-file truncation windows, replace ambiguity errors, or patch-chunk apply failures.
title: "Local-Runtime Filesystem Tools Docs Hub"
---

# Local-Runtime Filesystem Tools Docs Hub

## Deep Pages

- [Read-File Window Pagination, Binary Guard, and Truncation Contract Reference](read_file_window_pagination_binary_guard_and_truncation_contract_reference.md)
- [Replace Engine Match Modes, Patch Chunks, and Atomic Write Contract Reference](replace_engine_match_modes_patch_chunks_and_atomic_write_contract_reference.md)

## Related Pages

- [Local-Runtime Tools Docs Hub](../README.md)
- [Filesystem Read and Replace Runtime Reference](../filesystem_read_replace_runtime_reference.md)

## Code Scope

- `frontend/src/main/python/tools/filesystem/read_file_tool.py`
- `frontend/src/main/python/tools/filesystem/replace_tool.py`
- `frontend/src/main/python/tools/filesystem/replace_engine.py`
- `frontend/src/main/python/tools/filesystem/replace_matchers.py`
- `frontend/src/main/python/tools/filesystem/replace_patch_chunks.py`
- `frontend/src/main/python/tools/filesystem/file_utils.py`
- `frontend/src/main/python/tools/filesystem/gitignore_utils.py`
- `frontend/src/main/python/tools/schemas.py`
- `tests/sidecar/test_read_file_tool.py`
- `tests/sidecar/test_replace_engine.py`
- `tests/sidecar/test_replace_tool.py`
