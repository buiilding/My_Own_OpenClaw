---
summary: "Backend protocol lifecycle sub-hub for websocket receive-loop helper splits, handshake validation, task concurrency/cancellation, and disconnect cleanup contracts."
read_when:
  - When changing websocket receive-loop behavior, helper split modules (`loop_runtime`, parse helpers), concurrency limits, or disconnect cleanup.
  - When debugging timeout, task-leak, handshake parse failures, or stop-query completion behavior.
title: "Backend Protocol Lifecycle Hub"
---

# Backend Protocol Lifecycle Hub

## Deep Pages

- [Backend WebSocket Receive Loop and Task Cancellation Contract Reference](backend_websocket_receive_loop_and_task_cancellation_contract_reference.md)

## Related Pages

- [Backend Inventory Protocols Hub](../README.md)
- [Backend WebSocket Protocol Surface Matrix Reference](../backend_websocket_protocol_surface_matrix_reference.md)
- [Backend Protocol State Hub](../state/README.md)
- [Backend Protocol Errors Hub](../errors/README.md)
- [Backend Protocol Validation Hub](../validation/README.md)
- [Backend Protocol Testing Hub](../testing/README.md)
- [Backend WebSocket Connection and Task Lifecycle Reference](../../../api/websocket_connection_and_task_lifecycle_reference.md)

## Code Scope

- `backend/src/api/routes/websocket/router.py`
- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/loop_runtime.py`
- `backend/src/api/routes/websocket/message_handler.py`
- `backend/src/api/routes/websocket/message_parse_runtime.py`
- `backend/src/api/routes/websocket/json_parse.py`
- `backend/src/api/routes/websocket/task_manager.py`
- `backend/src/api/handlers/stop_query.py`
- `backend/src/api/handlers/compact_history.py`
- `backend/src/api/transport/websocket.py`
- `tests/backend/test_websocket_route.py`
- `tests/backend/test_websocket_connection.py`
- `tests/backend/test_websocket_loop_runtime.py`
- `tests/backend/test_websocket_message_parse_runtime.py`
- `tests/backend/test_websocket_task_manager.py`
- `tests/backend/test_safe_websocket.py`
- `tests/backend/test_api_handlers.py`
- `tests/backend/test_compact_history_handler.py`
