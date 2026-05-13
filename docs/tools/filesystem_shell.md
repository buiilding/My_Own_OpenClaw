---
summary: "Filesystem and shell tool guide covering read/replace, shell commands, process sessions, path resolution, and output formatting."
read_when:
  - When changing file editing, shell/process execution, output truncation, or sidecar path handling.
  - When debugging local filesystem or terminal tool behavior.
title: "Filesystem and Shell Tools"
---

# Filesystem and Shell Tools

Filesystem and shell tools execute in the local sidecar. They are used for code edits, file inspection, command execution, process sessions, app launching, waits, and host stats.

For code changes or debugging, start with [Filesystem and Shell Change Workflow](filesystem_shell_change_workflow.md). That workflow maps model-visible schema, renderer dispatch, Electron `execute-tool`, bridge argument shaping, sidecar execution, sudo mode, process sessions, result envelopes, and focused tests.

## Tool Surface

| Tool | Purpose | Sidecar owner |
| --- | --- | --- |
| `read_file` | Read text files with pagination, binary guards, and truncation behavior | `frontend/src/main/python/tools/filesystem/read_file_tool.py` |
| `replace` | Apply strict/lenient replacements and patch chunks atomically | `frontend/src/main/python/tools/filesystem/replace_tool.py`, `replace_engine.py` |
| `run_shell_command` | Run foreground/background shell commands with output limits | `frontend/src/main/python/tools/system/shell_tool.py` |
| `process` | Interact with ongoing process sessions | `frontend/src/main/python/tools/system/process_tool.py` |
| `open_app` | Open local apps | `frontend/src/main/python/tools/system/open_app_tool.py` |
| `wait` | Non-blocking wait helper | `frontend/src/main/python/tools/system/wait_tool.py` |

## Implementation Rules

- Resolve paths through sidecar path utilities instead of ad hoc string joins.
- Preserve atomic writes for replace operations.
- Keep shell output formatting predictable for both user display and model-facing `llm_content`.
- Use background sessions only when command output needs polling or the process must outlive the immediate request.
- Keep token-budget truncation visible in returned metadata.

## Deep Docs

- [Filesystem and Shell Change Workflow](filesystem_shell_change_workflow.md)
- [Frontend Sidecar Filesystem Read and Replace Runtime Reference](../frontend/sidecar/tools/filesystem_read_replace_runtime_reference.md)
- [Frontend Sidecar Shell and Process Session Runtime Reference](../frontend/sidecar/tools/shell_and_process_session_runtime_reference.md)
- [Frontend Sidecar Tool Registry Exposed Schema and Result Normalization Reference](../frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_normalization_reference.md)
