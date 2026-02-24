---
summary: "Backend contracts message-types docs sub-hub for canonical incoming/outgoing constants, schema-subset boundaries, and handler ACK/control message semantics."
read_when:
  - When adding/removing message type constants in `backend/src/api/contracts/message_types.py`.
  - When deciding whether a new outgoing type belongs in schema-validated stream contracts or handler ACK/control responses.
title: "Backend Contracts Message Types Docs Hub"
---

# Backend Contracts Message Types Docs Hub

## Deep Pages

- [Message-Type Constants, Schema-Subset, and Handler ACK Reference](message_type_constants_schema_subset_and_handler_ack_reference.md)

## Code Scope

- `backend/src/api/contracts/message_types.py`
- `backend/src/api/contracts/registry.py`
- `backend/src/api/infrastructure/errors.py`
- `backend/src/api/handlers/settings.py`
- `tests/backend/test_api_contract_registry.py`
- `tests/backend/test_api_handlers.py`
- `tests/backend/test_transport_envelope.py`

