---
summary: "Frontend sidecar tools docs sub-hub for filesystem mutation/read contracts and shell/process background-session runtime semantics."
read_when:
  - When changing sidecar filesystem tools (`read_file`, `replace`) or shell/process tool behavior.
  - When debugging background session lifecycle drift, output truncation, or replace patch-chunk matching failures.
title: "Frontend Sidecar Tools Docs Hub"
---

# Frontend Sidecar Tools Docs Hub

## Deep Pages

- [Shell and Process Session Runtime Reference](shell_and_process_session_runtime_reference.md)
- [Filesystem Read and Replace Runtime Reference](filesystem_read_replace_runtime_reference.md)

## Code Scope

- `frontend/src/main/python/tools/registry.py`
- `frontend/src/main/python/tools/schemas.py`
- `frontend/src/main/python/tools/system/shell_tool.py`
- `frontend/src/main/python/tools/system/process_tool.py`
- `frontend/src/main/python/tools/system/shell_process_registry.py`
- `frontend/src/main/python/tools/filesystem/read_file_tool.py`
- `frontend/src/main/python/tools/filesystem/replace_tool.py`
- `frontend/src/main/python/tools/filesystem/replace_engine.py`
- `frontend/src/main/python/tools/filesystem/file_utils.py`
- `tests/sidecar/test_shell_process_tool.py`
- `tests/sidecar/test_shell_process_registry.py`
- `tests/sidecar/test_read_file_tool.py`
- `tests/sidecar/test_replace_tool.py`
