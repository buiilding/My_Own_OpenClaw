---
summary: "Model-visible tool catalog matrix with backend owners, local-runtime executors, use cases, policy gates, and validation routes."
read_when:
  - When adding, removing, renaming, or debugging a model-visible tool.
  - When deciding whether a tool belongs in backend schema, SDK/main dispatch, local execution, UI projection, or provider-native capability routing.
title: "Tool Catalog Matrix"
---

# Tool Catalog Matrix

Model-visible and executable tools are registered in three places by design:

- Client/local-runtime manifest: source of truth for client/local-runtime
  model-facing schemas and executable local actions.
- Backend catalog: backend-owned tools plus fallback/default model-facing
  entries and tool policy owner.
- Local-runtime executable registry: executable local action owner, currently backed by local-runtime Python.

Do not import backend tool code into the sidecar to force parity. Keep parity explicit through shared contracts, exposed-name sets, and tests.

## Canonical Catalog

| Tool | Domain | Backend fallback/policy owner | Local-runtime executor | Use for | Key docs and tests |
| --- | --- | --- | --- | --- | --- |
| `mouse_control` | computer | private backend implementation | `frontend/src/main/python/tools/computer/mouse_tool.py` | Click, move, drag, and coordinate-targeted mouse actions | [Computer Tools](computer.md), private backend tests, `tests/sidecar/test_mouse_tool.py` |
| `keyboard_control` | computer | private backend implementation | `frontend/src/main/python/tools/computer/keyboard_tool.py` | Type text, paste, press keys, and shortcuts | [Computer Tools](computer.md), `tests/sidecar/test_keyboard_tool.py` |
| `screenshot` | computer | private backend implementation | `frontend/src/main/python/tools/computer/screenshot_tool.py` | Capture current desktop image for grounding and verification | [Computer Tools](computer.md), [Desktop Artifacts](../desktop/artifacts_and_attachments.md), `tests/sidecar/test_screenshot_tool.py` |
| `scroll_control` | computer | private backend implementation | `frontend/src/main/python/tools/computer/scroll_tool.py` | Scroll desktop regions with manual/OCR/prediction targeting | [Computer Tools](computer.md), `tests/sidecar/test_scroll_tool.py` |
| `switch_window` | computer | private backend implementation | `frontend/src/main/python/tools/system/window_tool.py` | Focus an open desktop window by title | [Computer Tools](computer.md), [Wait/Window/Stats Runtime](../frontend/sidecar/tools/system/wait_window_stats_runtime_reference.md) |
| `wait` | computer/system | private backend implementation | `frontend/src/main/python/tools/system/wait_tool.py` | Pause, then capture fresh visual state | [Computer Tools](computer.md), [Wait/Window/Stats Runtime](../frontend/sidecar/tools/system/wait_window_stats_runtime_reference.md) |
| `get_open_windows` | computer/system | private backend implementation | `frontend/src/main/python/tools/system/window_tool.py` | Discover focusable windows before targeting | [Computer Tools](computer.md), `tests/sidecar/test_system_tools.py` |
| `get_system_stats` | system | private backend implementation | `frontend/src/main/python/tools/system/stats_tool.py` | CPU, memory, and battery state | [Filesystem and Shell Tools](filesystem_shell.md), `tests/sidecar/test_system_tools.py` |
| `open_app` | system | private backend implementation | `frontend/src/main/python/tools/system/open_app_tool.py` | Launch a GUI app detached from the current agent turn | [Filesystem and Shell Tools](filesystem_shell.md), `tests/sidecar/test_open_app_tool.py` |
| `run_shell_command` | system | private backend implementation | `frontend/src/main/python/tools/system/shell_tool.py` | Foreground, background, yielding, and post-delay shell execution | [Filesystem and Shell Tools](filesystem_shell.md), [Shell Runtime](../frontend/sidecar/tools/shell_and_process_session_runtime_reference.md), `tests/sidecar/test_shell_process_tool.py` |
| `process` | system | private backend implementation | `frontend/src/main/python/tools/system/process_tool.py` | Manage background shell sessions: list, poll, log, write, send keys, kill, clear, remove | [Shell Runtime](../frontend/sidecar/tools/shell_and_process_session_runtime_reference.md), `tests/sidecar/test_shell_process_registry.py` |
| `read_file` | filesystem | private backend implementation | `frontend/src/main/python/tools/filesystem/read_file_tool.py` | Read text files with pagination, truncation, and binary guards | [Filesystem and Shell Tools](filesystem_shell.md), [Read File Runtime](../frontend/sidecar/tools/filesystem/read_file_window_pagination_binary_guard_and_truncation_contract_reference.md), `tests/sidecar/test_read_file_tool.py` |
| `replace` | filesystem | private backend implementation | `frontend/src/main/python/tools/filesystem/replace_tool.py` | Exact/context-anchored file edits, batch replacements, patch chunks, atomic writes | [Filesystem and Shell Tools](filesystem_shell.md), [Replace Runtime](../frontend/sidecar/tools/filesystem/replace_engine_match_modes_patch_chunks_and_atomic_write_contract_reference.md), `tests/sidecar/test_replace_tool.py` |
| `browser` | browser | private backend implementation, shared browser contract | `frontend/src/main/python/tools/browser/browser_tool.py` | Dedicated browser navigation, extraction, interaction, tabs, screenshots, browser files | [Browser Tool](browser.md), [Browser Hub](../browser/README.md), private backend tests, `tests/sidecar/tools/test_browser_tool.py` |

## Backend-Only Logical Capabilities

Some capabilities are model-visible but are not local-runtime executable actions:

| Capability | Owner | Execution path |
| --- | --- | --- |
| `web_search` | Backend provider policy and provider/native search adapters | OpenAI native web search, Gemini native Google Search grounding, or backend Brave Search fallback when `BRAVE_SEARCH_API_KEY` is set |

`web_search` should not be added to `frontend/src/main/python/tools/manifest.py` unless it becomes a local-runtime executable tool. Today it is backend/provider-owned capability routing.

## Parity Rules

Backend fallback and policy owner:

- private backend implementation
- private backend implementation
- private backend implementation
- remote tool classes under private backend implementation

Local-runtime executable owner:

- `frontend/src/main/python/tools/registry.py`
- `frontend/src/main/python/tools/manifest.py`
- implementation modules under `frontend/src/main/python/tools`

Parity tests should prove:

- every accepted local tool expected by the local runtime exists in the local-runtime executable registry backed by local-runtime Python modules
- accepted client/local-runtime schemas remain model-facing when a client manifest supplies them
- local results normalize into `ToolResult`
- browser shared-contract schema stays aligned across backend and local runtime

## Add-a-Tool Checklist

1. Decide whether the tool is backend-only, local-runtime executed, or provider-native.
2. Add or update the client/local-runtime manifest for local model-visible tools.
3. Add local-runtime executable registration only when local execution is required.
4. Add SDK/main tool-router handling only when payload/result envelopes, artifacts, screenshots, or UI display behavior change.
5. Add policy/profile entries if the tool should appear in `chat`, `coding`, `browser`, `computer`, or `full` profiles.
6. Add backend schema/catalog registration only for backend-executed tools or fallback/default local exposure.
7. Add tests for accepted client schemas, backend policy filtering, local execution, SDK/main result relay, and cross-layer parity.
8. Update [Tools Hub](README.md), this matrix, and feature-specific docs.
