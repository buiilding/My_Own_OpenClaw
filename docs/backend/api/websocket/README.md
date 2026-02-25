---
summary: "Backend API websocket docs sub-hub for handshake parsing, per-frame validation/size guards, task-limit scheduling, and disconnect cleanup semantics."
read_when:
  - When changing files under `backend/src/api/routes/websocket/*`.
  - When debugging handshake failures, malformed message errors, or websocket task-limit/timeouts.
title: "Backend API WebSocket Docs Hub"
---

# Backend API WebSocket Docs Hub

## Deep Pages

- [WebSocket Message Parse, Validation Guard, and Task-Scheduling Reference](websocket_message_parse_validation_guard_and_task_scheduling_reference.md)
- [WebSocket Connection Docs Hub](connection/README.md)
- [Handshake Parse, Validation, and Policy-Close Contract Reference](connection/handshake_parse_validation_and_policy_close_contract_reference.md)
- [Task Manager Concurrency Limit, Rejected-Coroutine Close, and Cleanup Contract Reference](connection/task_manager_concurrency_limit_rejected_coroutine_close_and_cleanup_contract_reference.md)

## Related Pages

- [Backend API Docs Hub](../README.md)
- [WebSocket Connection and Task Lifecycle Reference](../websocket_connection_and_task_lifecycle_reference.md)
- [Safe WebSocket and Transport Envelope Reference](../transport/safe_websocket_and_transport_envelope_reference.md)

## Code Scope

- `backend/src/api/routes/websocket/__init__.py`
- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/message_handler.py`
- `backend/src/api/routes/websocket/task_manager.py`
- `backend/src/api/routes/websocket/json_parse.py`
- `tests/backend/test_websocket_route.py`
- `tests/backend/test_websocket_connection.py`
- `tests/backend/test_websocket_message_handler.py`
- `tests/backend/test_websocket_task_manager.py`
- `tests/backend/test_websocket_json_parse.py`
