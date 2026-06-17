---
summary: "Frontend IPC contracts docs sub-hub for typed channels, preload allowlists, and renderer-main handler ownership."
read_when:
  - When adding/modifying renderer-main ipc channels or preload exposure lists.
  - When debugging invoke/send/on contract drift between renderer and main.
title: "Frontend Contracts Docs Hub"
---

# Frontend Contracts Docs Hub

## Deep Pages

- [Events Contracts Docs Hub](events/README.md)
- [Frontend Backend Event Schema Docs Hub](events/schema/README.md)
- [Backend Event Payload Field Contract and Consumer Ownership Reference](events/schema/backend_event_payload_field_contract_and_consumer_ownership_reference.md)
- [Settings and Model ACK Event Routing Reference](events/settings_and_model_ack_event_routing_reference.md)
- [Events Tool Runtime Docs Hub](events/tool_runtime/README.md)
- [Tool-Call and Tool-Output Recovery/Skip-Execution Contract Reference](events/tool_runtime/tool_call_and_tool_output_recovery_skip_execution_contract_reference.md)
- [IPC Contracts Docs Hub](ipc/README.md)
- [IPC Channels and Event Contracts](ipc_channels_and_event_contracts.md)
- [IPC Channel and Handler Reference](ipc_channel_and_handler_reference.md)
- [Preload Allowlist and Channel-Constant Parity Reference](ipc/preload_allowlist_and_channel_constant_parity_reference.md)
- [Main-Process IPC Handler Ownership and RPC Mapper Reference](ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)
- [Runtime Event Guard Reference](schema_generation_and_event_guard_reference.md)
- [Memory IPC and RPC Mapping Reference](memory_ipc_and_rpc_mapping_reference.md)
- [Backend Event Consumer Matrix Reference](backend_event_consumer_matrix_reference.md)
- [Overlay and Wakeword Control Channel Reference](overlay_and_wakeword_control_channel_reference.md)

## Code Scope

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc/ipc_renderer_windows.cjs`
- `frontend/src/main/ipc/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`
- `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_visibility_runtime.cjs`
- `frontend/src/main/app/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/permissions/permission_service.cjs`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/*`

## Current Contract Notes (2026-02-26)

- Permission onboarding IPC channels added in `INVOKE_CHANNELS` + preload allowlist:
  - `list-permissions`
  - `check-permissions`
  - `check-permission`
  - `run-permission-probe`
  - `request-permission`
