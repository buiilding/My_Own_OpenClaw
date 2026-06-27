---
summary: "Local-runtime tools docs sub-hub for registry/exposure contracts plus computer, system, shell/process, and filesystem tool runtime semantics backed by local-runtime Python implementations."
read_when:
  - When changing local-runtime Python tool registration/exposure behavior or tool result normalization semantics.
  - When changing local-runtime Python computer/system/filesystem/shell tool behavior or debugging runtime action failures.
title: "Local-Runtime Tools Docs Hub"
---

# Local-Runtime Tools Docs Hub

## Deep Pages

- [Tool Registry Docs Hub](registry/README.md)
- [Computer Tools Docs Hub](computer/README.md)
- [System Tools Docs Hub](system/README.md)
- [Filesystem Tools Docs Hub](filesystem/README.md)
- [Filesystem and Shell Change Workflow](../../../tools/filesystem_shell_change_workflow.md)
- [Shell and Process Session Runtime Reference](shell_and_process_session_runtime_reference.md)
- [Shell Output Formatting and Response Payload Contract Reference](system/shell_output_formatting_and_response_payload_contract_reference.md)
- [Filesystem Read and Replace Runtime Reference](filesystem_read_replace_runtime_reference.md)
- [Browser Runtime Contract and Browser Use Engine Reference](browser_runtime_contract_and_windie_runtime_reference.md)
- [Tool Registry Exposed Schema and Result Contract Reference](registry/tool_registry_exposed_schema_and_result_contract_reference.md)
- [Mouse, Keyboard, Scroll, and Screenshot Runtime Reference](computer/mouse_keyboard_scroll_and_screenshot_runtime_reference.md)
- [Wait, Window, and Stats Runtime Reference](system/wait_window_stats_runtime_reference.md)
- [Read-File Window Pagination, Binary Guard, and Truncation Contract Reference](filesystem/read_file_window_pagination_binary_guard_and_truncation_contract_reference.md)
- [Replace Engine Match Modes, Patch Chunks, and Atomic Write Contract Reference](filesystem/replace_engine_match_modes_patch_chunks_and_atomic_write_contract_reference.md)

## Browser Tool Note

The `browser` local-runtime Python tool runs through `BrowserUseEngineRuntime`, which adapts
canonical local-runtime browser payloads to the maintained Browser Use CLI package.
The local runtime no longer ships or routes browser actions through the retired
`WindieBrowserRuntime` or a vendored `browser_use.browser` session subtree.

## Manifest Note

Built-in local tool schemas are generated from the local-runtime Python manifest. `frontend/src/main/python/tools/manifest.py` generates the Electron-consumed `frontend/src/main/generated/builtin_tool_manifest.json`, including rich browser actions, desktop grounding fields, descriptions, `execution_target`, and `argument_resolution`. Keep `frontend/src/main/extensions/tool_manifest.cjs` as a loader/merger for generated built-ins plus plugin and MCP tools rather than hand-authoring built-in schemas in JavaScript.

## Code Scope

- `frontend/src/main/python/tools/registry.py`
- `frontend/src/main/python/tools/manifest.py`
- `frontend/src/main/python/tools/result.py`
- `frontend/src/main/python/tools/schemas.py`
- `frontend/src/main/generated/builtin_tool_manifest.json`
- `frontend/src/main/extensions/tool_manifest.cjs`
- `frontend/src/main/python/tools/computer/*`
- `frontend/src/main/python/tools/system/wait_tool.py`
- `frontend/src/main/python/tools/system/window_tool.py`
- `frontend/src/main/python/tools/system/stats_tool.py`
- `frontend/src/main/python/tools/system/shell_tool.py`
- `frontend/src/main/python/tools/system/shell_output_formatting.py`
- `frontend/src/main/python/tools/system/shell_response_payloads.py`
- `frontend/src/main/python/tools/system/process_tool.py`
- `frontend/src/main/python/tools/system/shell_process_registry.py`
- `frontend/src/main/python/tools/filesystem/read_file_tool.py`
- `frontend/src/main/python/tools/filesystem/replace_tool.py`
- `frontend/src/main/python/tools/browser/browser_tool.py`
- `frontend/src/main/python/tools/browser/browser_use_engine.py`
- `frontend/src/main/python/tools/browser/content_extraction.py`
- `frontend/src/main/python/tools/browser/file_store.py`
- `frontend/src/main/python/tools/filesystem/replace_engine.py`
- `frontend/src/main/python/tools/filesystem/file_utils.py`
- `frontend/src/main/python/tools/filesystem/gitignore_utils.py`
- `tests/sidecar/test_shell_process_tool.py`
- `tests/sidecar/test_shell_output_formatting.py`
- `tests/sidecar/test_shell_process_registry.py`
- `tests/sidecar/test_read_file_tool.py`
- `tests/sidecar/test_replace_tool.py`
- `tests/sidecar/tools/test_browser_use_engine.py`
- `tests/sidecar/test_tool_registry.py`
- `tests/sidecar/test_system_tools.py`
- `tests/sidecar/test_linux_window_manager.py`
