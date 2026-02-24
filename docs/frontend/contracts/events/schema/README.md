---
summary: "Frontend backend-event schema docs sub-hub for typed event union, payload field contracts, and consumer ownership boundaries."
read_when:
  - When changing `frontend/src/renderer/types/backendEvents.ts` event payload shapes.
  - When debugging backend event fields that exist on wire but are ignored by renderer consumers.
title: "Frontend Backend Event Schema Docs Hub"
---

# Frontend Backend Event Schema Docs Hub

## Deep Pages

- [Backend Event Payload Field Contract and Consumer Ownership Reference](backend_event_payload_field_contract_and_consumer_ownership_reference.md)

## Related Pages

- [Frontend Contracts Events Docs Hub](../README.md)
- [From-Backend Event Ingress, Typed Guard, and Audio Side-Channel Reference](../from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md)
- [Backend Event Consumer Matrix Reference](../../backend_event_consumer_matrix_reference.md)

## Code Scope

- `frontend/src/renderer/types/backendEvents.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/utils/backendAudioEvents.js`
- `frontend/src/renderer/app/providers/appConfigEvents.js`
- `frontend/src/renderer/app/providers/AppStatusProvider.jsx`
