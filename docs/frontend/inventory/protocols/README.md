---
summary: "Frontend inventory protocol sub-hub for renderer/main IPC channels, local-backend JSON-RPC method mappings, and cross-process control-path ownership boundaries."
read_when:
  - When changing preload allowlists, IPC handler ownership, or renderer channel constants.
  - When changing Electron main to sidecar JSON-RPC method maps, request timeout/readiness behavior, or main-to-renderer control-path gating.
title: "Frontend Inventory Protocols Hub"
---

# Frontend Inventory Protocols Hub

## Deep Pages

- [Frontend IPC and Local-Backend Protocol Surface Matrix Reference](frontend_ipc_and_local_backend_protocol_surface_matrix_reference.md)
- [Frontend Protocol Lifecycle Hub](lifecycle/README.md)
- [Frontend Protocol State Hub](state/README.md)
- [Frontend Protocol Compatibility Hub](compatibility/README.md)
- [Frontend Protocol Observability Hub](observability/README.md)
- [Frontend Protocol Errors Hub](errors/README.md)
- [Frontend Protocol Validation Hub](validation/README.md)
- [Frontend Protocol Testing Hub](testing/README.md)

## Related Pages

- [Frontend Inventory Docs Hub](../README.md)
- [Frontend Functionality Capability Catalog Reference](../frontend_functionality_capability_catalog_reference.md)
- [Frontend Capability to File Matrix Reference](../frontend_capability_to_file_matrix_reference.md)
- [Frontend IPC and Sidecar Contract Touchpoints Reference](../frontend_ipc_and_sidecar_contract_touchpoints_reference.md)
- [Frontend Contracts Docs Hub](../../contracts/README.md)
- [Frontend Main Docs Hub](../../main/README.md)

## Code Scope

- `frontend/src/preload.js`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/local_backend_bridge_rpc_mappers.cjs`
- `frontend/src/main/wakeword_bridge.cjs`
- `frontend/src/main/wakeword_bridge_runtime.cjs`
- `frontend/src/main/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/window_controls_ipc_runtime.cjs`
- `frontend/src/main/permission_ipc_runtime.cjs`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/LocalBackendBridge.lifecycle.test.cjs`
- `tests/frontend/LocalBackendBridge.rpc.test.cjs`
- `tests/frontend/WakewordBridge.test.cjs`
- `tests/frontend/WakewordBridgeRuntime.test.cjs`
