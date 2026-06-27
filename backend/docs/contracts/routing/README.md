---
summary: "Backend contracts routing docs sub-hub for incoming message-type route tables, schema-literal parity checks, and DI handler-binding invariants."
read_when:
  - When adding/changing incoming websocket message types or handler keys.
  - When debugging startup failures from `validate_incoming_routes()` or `build_handler_bindings(...)`.
title: "Backend Contracts Routing Docs Hub"
---

# Backend Contracts Routing Docs Hub

## Deep Pages

- [Incoming Route Table, Schema Parity, and Handler-Binding Reference](incoming_route_table_schema_parity_and_handler_binding_reference.md)

## Code Scope

- `backend/src/core/container/incoming_routing.py`
- `backend/src/core/container/api_container.py`
- `backend/src/api/schemas/incoming.py`
- `tests/backend/test_incoming_routing.py`

