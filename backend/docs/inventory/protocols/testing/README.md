---
summary: "Backend protocol testing sub-hub for websocket route/handshake validation, parse-runtime helper seams, task-limit scheduling safety, transport guarantees, and schema/envelope contract coverage."
read_when:
  - When changing websocket route/message handling, handshake/parse helper modules, SafeWebSocket send semantics, incoming route-table bindings, or compact-history control messaging.
  - When updating backend outgoing formatter payloads or canonical websocket envelope context fields.
title: "Backend Protocol Testing Hub"
---

# Backend Protocol Testing Hub

## Deep Pages

- [Backend WebSocket Protocol Test Coverage and Runtime Contract Reference](backend_websocket_protocol_test_coverage_and_runtime_contract_reference.md)

## Related Pages

- [Backend Inventory Protocols Hub](../README.md)
- [Backend Protocol Lifecycle Hub](../lifecycle/README.md)
- [Backend Protocol Errors Hub](../errors/README.md)
- [Backend Protocol Validation Hub](../validation/README.md)

## Code Scope

- `tests/backend/test_websocket_route.py`
- `tests/backend/test_websocket_message_handler.py`
- `tests/backend/test_websocket_connection.py`
- `tests/backend/test_websocket_message_parse_runtime.py`
- `tests/backend/test_websocket_json_parse.py`
- `tests/backend/test_websocket_loop_runtime.py`
- `tests/backend/test_websocket_task_manager.py`
- `tests/backend/test_safe_websocket.py`
- `tests/backend/test_incoming_routing.py`
- `tests/backend/test_outgoing_schema_contract.py`
- `tests/backend/test_transport_envelope.py`
- `tests/backend/test_compact_history_handler.py`
- `backend/src/api/routes/websocket/router.py`
- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/loop_runtime.py`
- `backend/src/api/routes/websocket/message_handler.py`
- `backend/src/api/routes/websocket/message_parse_runtime.py`
- `backend/src/api/routes/websocket/json_parse.py`
- `backend/src/api/routes/websocket/task_manager.py`
- `backend/src/api/transport/websocket.py`
- `backend/src/core/container/incoming_routing.py`
- `backend/src/api/transport/envelope.py`
