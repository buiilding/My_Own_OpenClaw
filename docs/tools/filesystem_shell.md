---
summary: "Filesystem and shell tool guide covering read/replace, shell commands, process sessions, Linux sudo pkexec prompting, removed sudo auth-mode behavior, path resolution, and output formatting."
read_when:
  - When changing file editing, shell/process execution, output truncation, or local-runtime path handling.
  - When debugging `run_shell_command` sudo behavior, Linux pkexec prompting, shell working directories, or process sessions.
  - When searching for `agent_sudo_access_handler removed`, `AgentSudoAccessHandler.test.cjs removed`, or removed sudo auth-mode bridge/config behavior.
  - When debugging local filesystem or terminal tool behavior.
title: "Filesystem and Shell Tools"
---

# Filesystem and Shell Tools

Filesystem and shell tools execute through the SDK local runtime. They are used for code edits, file inspection, command execution, process sessions, app launching, waits, and host stats.

For code changes or debugging, start with [Filesystem and Shell Change Workflow](filesystem_shell_change_workflow.md). That workflow maps model-visible schema, SDK/main dispatch, Electron local tool runtime, bridge argument shaping, local execution, sudo behavior, process sessions, result envelopes, and focused tests.

## Tool Surface

| Tool | Purpose | Local-runtime implementation owner |
| --- | --- | --- |
| `read_file` | Read text files with pagination, binary guards, and truncation behavior | `frontend/src/main/python/tools/filesystem/read_file_tool.py` |
| `replace` | Apply strict/lenient replacements and patch chunks atomically | `frontend/src/main/python/tools/filesystem/replace_tool.py`, `replace_engine.py` |
| `run_shell_command` | Run foreground/background shell commands | `frontend/src/main/python/tools/system/shell_tool.py` |
| `process` | Interact with ongoing process sessions | `frontend/src/main/python/tools/system/process_tool.py` |
| `open_app` | Open local apps | `frontend/src/main/python/tools/system/open_app_tool.py` |
| `wait` | Non-blocking wait helper | `frontend/src/main/python/tools/system/wait_tool.py` |

## Implementation Rules

- Resolve paths through local-runtime path utilities instead of ad hoc string
  joins.
- Preserve atomic writes for replace operations.
- `replace` accepts exactly one edit mode per call: `replacements` or
  `patch_chunks`. Use a one-item `replacements` list for a single edit.
  Ambiguous combinations are rejected at the backend schema boundary before
  reaching local execution.
- Keep shell output formatting predictable for both user display and model-facing `output`.
- On Linux, `run_shell_command` rewrites leading `sudo ...` commands to
  `pkexec bash -lc ...` so privilege prompts use the OS authentication dialog.
  There is no renderer setting or Electron bridge argument that selects a
  separate sudo auth mode; unsupported sudo flags fail before execution.
- Foreground shell timeouts and manual `process kill` must terminate the shell
  process group on POSIX so child commands cannot keep running behind OS
  prompts or inherited pipes after the wrapper shell exits.
- Use background sessions only when command output needs polling or the process must outlive the immediate request.
- Use `process` for high-volume or long-running command output.

## Removed Sudo Auth Mode

The old Electron sudo auth-mode bridge was deleted. There is no
`agent_sudo_access_handler`, `AgentSudoAccessHandler.test.cjs`, backend
`system_use_shell_auth_mode` message field, renderer sudo auth mode setting, or
local-runtime bridge argument that selects a separate shell authentication mode.
The exact stale query `agent_sudo_access_handler removed` belongs here because
the replacement runtime behavior is local-runtime shell execution with Linux
`pkexec` prompt routing.

Current behavior is simpler: local `run_shell_command` executes through the
local-runtime Python implementation, and on Linux a leading
`sudo ...` command is rewritten to `pkexec bash -lc ...` so the OS owns the
authentication prompt. Searches for removed sudo auth mode behavior should
route to this page and the local-runtime shell reference below.

## Deep Docs

- [Filesystem and Shell Change Workflow](filesystem_shell_change_workflow.md)
- [Local-Runtime Filesystem Read and Replace Runtime Reference](../frontend/sidecar/tools/filesystem_read_replace_runtime_reference.md)
- [Local-Runtime Shell and Process Session Runtime Reference](../frontend/sidecar/tools/shell_and_process_session_runtime_reference.md)
- [Local-Runtime Registry and Result Contract](../frontend/sidecar/tools/registry/tool_registry_exposed_schema_and_result_contract_reference.md)
