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
- [Settings and Model ACK Event Routing Reference](events/settings_and_model_ack_event_routing_reference.md)
- [Events Tool Runtime Docs Hub](events/tool_runtime/README.md)
- [Tool-Call and Tool-Output Recovery/Skip-Execution Contract Reference](events/tool_runtime/tool_call_and_tool_output_recovery_skip_execution_contract_reference.md)
- [IPC Contracts Docs Hub](ipc/README.md)
- [IPC Channels and Event Contracts](ipc_channels_and_event_contracts.md)
- [IPC Channel and Handler Reference](ipc_channel_and_handler_reference.md)
- [Preload Allowlist and Channel-Constant Parity Reference](ipc/preload_allowlist_and_channel_constant_parity_reference.md)
- [Main-Process IPC Handler Ownership and RPC Mapper Reference](ipc/main_process_ipc_handler_ownership_and_rpc_mapper_reference.md)
- [Schema Generation and Event Guard Reference](schema_generation_and_event_guard_reference.md)
- [Memory IPC and RPC Mapping Reference](memory_ipc_and_rpc_mapping_reference.md)
- [Backend Event Consumer Matrix Reference](backend_event_consumer_matrix_reference.md)
- [Overlay and Wakeword Control Channel Reference](overlay_and_wakeword_control_channel_reference.md)

## Code Scope

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/channels.cjs`
- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/*`
