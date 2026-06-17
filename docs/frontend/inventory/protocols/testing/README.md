---
summary: "Frontend protocol testing sub-hub for renderer IPC validation, websocket/query lifecycle contracts, split IPC registrar ownership, local-runtime JSON-RPC handling, and wakeword/dashboard routing coverage."
read_when:
  - When changing renderer IPC channel validation behavior, Electron main websocket/query orchestration, or query payload enrichment rules.
  - When changing local-runtime bridge JSON-RPC mappings/timeouts, split IPC registrar ownership, or wakeword subprocess status/detection handling.
title: "Frontend Protocol Testing Hub"
---

# Frontend Protocol Testing Hub

## Deep Pages

- [Frontend IPC and Local Runtime Protocol Test Coverage and Runtime Contract Reference](frontend_ipc_and_local_backend_protocol_test_coverage_and_runtime_contract_reference.md)

## Related Pages

- [Frontend Inventory Protocols Hub](../README.md)
- [Frontend Protocol Lifecycle Hub](../lifecycle/README.md)
- [Frontend Protocol Errors Hub](../errors/README.md)
- [Frontend Protocol Validation Hub](../validation/README.md)

## Code Scope

- `tests/frontend/IpcBridgeValidation.test.ts`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/IpcQueryRuntime.test.cjs`
- `tests/frontend/LocalRuntimeBridge.lifecycle.test.cjs`
- `tests/frontend/LocalRuntimeBridge.rpc.test.cjs`
- `tests/frontend/WakewordBridge.test.cjs`
- `tests/frontend/WakewordBridgeRuntime.test.cjs`
- `tests/frontend/OverlayPhaseIpcRuntime.test.cjs`
- `tests/frontend/WindowControlsIpcRuntime.test.cjs`
- `tests/frontend/PermissionIpcRuntime.test.cjs`
- `tests/frontend/DisplayQueryHandler.test.cjs`
- `tests/frontend/DashboardShell.test.jsx`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`
- `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`
- `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- `frontend/src/main/surfaces/display_query_handler.cjs`
