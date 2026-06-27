---
summary: "Local-runtime system-tools docs sub-hub for wait/window/stats runtime semantics, platform window-manager behavior, and system metrics collection contracts backed by local-runtime Python implementations."
read_when:
  - When changing sidecar system tools (`wait`, `switch_window`, `get_open_windows`, `get_system_stats`, `open_app`).
  - When debugging platform-specific window switching behavior or host metrics collection failures.
title: "Local-Runtime System Tools Docs Hub"
---

# Local-Runtime System Tools Docs Hub

## Deep Pages

- [Wait, Window, and Stats Runtime Reference](wait_window_stats_runtime_reference.md)
- [Shell Output Formatting and Response Payload Contract Reference](shell_output_formatting_and_response_payload_contract_reference.md)

## Related Pages

- [Shell and Process Session Runtime Reference](../shell_and_process_session_runtime_reference.md)
- [System-State Collection and Platform Adapter Reference](../../system_state/system_state_collection_and_platform_adapter_reference.md)

## Code Scope

- `frontend/src/main/python/tools/system/shell_output_formatting.py`
- `frontend/src/main/python/tools/system/shell_response_payloads.py`
- `frontend/src/main/python/tools/system/wait_tool.py`
- `frontend/src/main/python/tools/system/window_tool.py`
- `frontend/src/main/python/tools/system/stats_tool.py`
- `frontend/src/main/python/tools/system/open_app_tool.py`
- `frontend/src/main/python/core/system_metrics.py`
- `frontend/src/main/python/core/platform/window_manager.py`
- `frontend/src/main/python/core/platform/base.py`
- `frontend/src/main/python/core/platform/linux.py`
- `frontend/src/main/python/core/platform/windows.py`
- `frontend/src/main/python/core/platform/macos.py`
- `tests/sidecar/test_shell_output_formatting.py`
- `tests/sidecar/test_system_tools.py`
- `tests/sidecar/test_linux_window_manager.py`
