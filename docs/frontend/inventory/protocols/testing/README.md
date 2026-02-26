---
summary: "Frontend protocol testing sub-hub for renderer IPC validation, websocket bridge lifecycle/query contracts, local-backend JSON-RPC lifecycle handling, wakeword STT trigger flow, and dashboard target-routing coverage."
read_when:
  - When changing renderer IPC channel validation behavior, Electron main websocket/query orchestration, or query payload enrichment rules.
  - When changing local-backend bridge JSON-RPC mappings/timeouts or wakeword subprocess status/detection handling.
title: "Frontend Protocol Testing Hub"
---

# Frontend Protocol Testing Hub

## Deep Pages

- [Frontend IPC and Local-Backend Protocol Test Coverage and Runtime Contract Reference](frontend_ipc_and_local_backend_protocol_test_coverage_and_runtime_contract_reference.md)

## Related Pages

- [Frontend Inventory Protocols Hub](../README.md)
- [Frontend Protocol Lifecycle Hub](../lifecycle/README.md)
- [Frontend Protocol Errors Hub](../errors/README.md)
- [Frontend Protocol Validation Hub](../validation/README.md)

## Code Scope

- `tests/frontend/IpcBridgeValidation.test.ts`
- `tests/frontend/IpcMainBridge.query.test.cjs`
- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/QueryPayloadBuilder.test.cjs`
- `tests/frontend/LocalBackendBridge.lifecycle.test.cjs`
- `tests/frontend/LocalBackendBridge.rpc.test.cjs`
- `tests/frontend/WakewordBridge.test.cjs`
- `tests/frontend/ChatGptDashboardShell.test.jsx`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/query_payload_builder.cjs`
- `frontend/src/main/local_backend_bridge.cjs`
- `frontend/src/main/wakeword_bridge.cjs`
