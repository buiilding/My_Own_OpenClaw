---
summary: "Local-runtime system-state platform docs sub-hub for probe-layer vs adapter-layer responsibilities, per-OS dependency requirements, and focus-switch matching semantics backed by local-runtime Python implementations."
read_when:
  - When changing `frontend/src/main/python/core/platform/*` or `core/system_state.py` platform behavior.
  - When debugging OS-specific drift between `get_system_state` capture outputs and `switch_window` window-activation behavior.
title: "Local-Runtime System-State Platform Docs Hub"
---

# Local-Runtime System-State Platform Docs Hub

## Deep Pages

- [System-State Probe Layer and Window-Manager Adapter Boundary Reference](system_state_probe_layer_and_window_manager_adapter_boundary_reference.md)

## Related Pages

- [Local-Runtime System-State Docs Hub](../README.md)
- [System-State Collection and Platform Adapter Reference](../system_state_collection_and_platform_adapter_reference.md)
- [Wait, Window, and Stats Runtime Reference](../../tools/system/wait_window_stats_runtime_reference.md)

## Code Scope

- `frontend/src/main/python/core/system_state.py`
- `frontend/src/main/python/core/platform/window_manager.py`
- `frontend/src/main/python/core/platform/base.py`
- `frontend/src/main/python/core/platform/windows.py`
- `frontend/src/main/python/core/platform/macos.py`
- `frontend/src/main/python/core/platform/linux.py`
- `frontend/src/main/python/tools/system/window_tool.py`
- `tests/sidecar/test_linux_window_manager.py`
