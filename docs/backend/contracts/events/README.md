---
summary: "Backend contracts events docs sub-hub for streaming event dataclass semantics, enum literal conventions, and event-to-formatter/outgoing-schema alignment boundaries."
read_when:
  - When changing `backend/src/core/events/streaming_events.py` or `StreamingEventType` values.
  - When debugging event-type literal drift between agent runtime, formatter specs, and outgoing websocket message types.
title: "Backend Streaming Events Contracts Docs Hub"
---

# Backend Streaming Events Contracts Docs Hub

## Deep Pages

- [Streaming Event Dataclass and Enum Semantics Reference](streaming_event_dataclass_and_enum_semantics_reference.md)
- [Streaming Event to Formatter and Outgoing Contract Alignment Reference](streaming_event_to_formatter_and_outgoing_contract_alignment_reference.md)

## Code Scope

- `backend/src/core/events/streaming_events.py`
- `backend/src/core/types/enums.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/contracts/registry.py`
- `tests/backend/test_events.py`
- `tests/backend/test_api_contract_registry.py`
