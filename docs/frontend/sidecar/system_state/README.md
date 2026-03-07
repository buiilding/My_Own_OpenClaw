---
summary: "Frontend sidecar system-state docs hub for field collection semantics, platform adapters, and renderer/main JSON-RPC consumption paths."
read_when:
  - When changing `core/system_state.py` field contracts, fallback behavior, or platform probe logic.
  - When debugging `get-system-state` failures between renderer, Electron main, and Python sidecar.
title: "Sidecar System-State Docs Hub"
---

# Sidecar System-State Docs Hub

## Deep Pages

- [System-State Collection and Platform Adapter Reference](system_state_collection_and_platform_adapter_reference.md)
- [System-State Platform Docs Hub](platform/README.md)
- [System-State Probe Layer and Window-Manager Adapter Boundary Reference](platform/system_state_probe_layer_and_window_manager_adapter_boundary_reference.md)

## Code Scope

- `frontend/src/main/python/core/system_state.py`
- `frontend/src/main/python/core/platform/*`
- `frontend/src/main/python/core/system_metrics.py`
- `frontend/src/main/python/local_backend.py`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/renderer/infrastructure/services/SystemStateCapture.ts`
- `frontend/src/main/query_payload_builder.cjs`
