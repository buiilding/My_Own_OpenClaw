---
summary: "Backend contract docs sub-hub for websocket message schemas, incoming route mapping, and formatter alignment guards."
read_when:
  - When changing websocket payload fields or adding new message types.
  - When debugging schema-validation mismatches between runtime events and outbound payloads.
title: "Backend Contracts Docs Hub"
---

# Backend Contracts Docs Hub

## Deep Pages

- [Streaming Events Contracts Docs Hub](events/README.md)
- [WebSocket Message Contracts](websocket_message_contracts.md)
- [Message Schema and Formatter Reference](message_schema_and_formatter_reference.md)

## Code Scope

- `backend/src/api/schema.py`
- `backend/src/core/container/incoming_routing.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/core/events/streaming_events.py`
- `backend/src/core/types/enums.py`
