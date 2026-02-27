---
summary: "Backend inventory protocol sub-hub for websocket handshake, incoming/outgoing message contracts, route bindings, formatter alignment, and lifecycle/state control-path ownership."
read_when:
  - When changing backend websocket message types, payload schemas, or route bindings.
  - When debugging frontend/backend contract drift in query, settings, wakeword, tool-result, or context propagation flows.
title: "Backend Inventory Protocols Hub"
---

# Backend Inventory Protocols Hub

## Deep Pages

- [Backend WebSocket Protocol Surface Matrix Reference](backend_websocket_protocol_surface_matrix_reference.md)
- [Backend Protocol Lifecycle Hub](lifecycle/README.md)
- [Backend Protocol State Hub](state/README.md)
- [Backend Protocol Compatibility Hub](compatibility/README.md)
- [Backend Protocol Observability Hub](observability/README.md)
- [Backend Protocol Errors Hub](errors/README.md)
- [Backend Protocol Validation Hub](validation/README.md)
- [Backend Protocol Testing Hub](testing/README.md)

## Related Pages

- [Backend Inventory Docs Hub](../README.md)
- [Backend Functionality Capability Catalog Reference](../backend_functionality_capability_catalog_reference.md)
- [Backend Capability to File Matrix Reference](../backend_capability_to_file_matrix_reference.md)
- [Backend Cross-Layer Contract Touchpoints Reference](../backend_cross_layer_contract_touchpoints_reference.md)
- [Backend Contracts Docs Hub](../../contracts/README.md)
- [Backend API Docs Hub](../../api/README.md)

## Code Scope

- `backend/src/api/routes/websocket/__init__.py`
- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/message_handler.py`
- `backend/src/api/routes/websocket/task_manager.py`
- `backend/src/core/container/incoming_routing.py`
- `backend/src/api/contracts/message_types.py`
- `backend/src/api/contracts/formatter_specs.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/api/transport/envelope.py`
- `backend/src/api/infrastructure/errors.py`
