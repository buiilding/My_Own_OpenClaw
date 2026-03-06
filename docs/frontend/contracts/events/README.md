---
summary: "Frontend contracts events docs sub-hub for `from-backend` ingress typing boundaries, audio side-channel parsing, and synthetic renderer-facing query events."
read_when:
  - When changing renderer `from-backend` listeners or backend-event type guards.
  - When changing main-process local query event synthesis (`local-user-message`, send-failure `error`).
title: "Frontend Contracts Events Docs Hub"
---

# Frontend Contracts Events Docs Hub

## Deep Pages

- [From-Backend Event Ingress, Typed Guard, and Audio Side-Channel Reference](from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md)
- [Local User Message and Query Send-Failure Synthesis Reference](local_user_message_and_query_send_failure_synthesis_reference.md)
- [Settings and Model ACK Event Routing Reference](settings_and_model_ack_event_routing_reference.md)
- [Frontend Backend Event Schema Docs Hub](schema/README.md)
- [Backend Event Payload Field Contract and Consumer Ownership Reference](schema/backend_event_payload_field_contract_and_consumer_ownership_reference.md)
- [Tool Runtime Docs Hub](tool_runtime/README.md)
- [Tool-Call and Tool-Output Recovery/Skip-Execution Contract Reference](tool_runtime/tool_call_and_tool_output_recovery_skip_execution_contract_reference.md)

## Code Scope

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/renderer/types/backendEvents.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/utils/backendAudioEvents.js`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/providers/AppStatusProvider.jsx`
