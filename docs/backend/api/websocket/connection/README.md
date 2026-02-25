---
summary: "Backend API websocket connection docs sub-hub for handshake validation/failure-close semantics and per-connection task-manager concurrency/cleanup contracts."
read_when:
  - When changing `backend/src/api/routes/websocket/connection.py` handshake or cleanup behavior.
  - When changing `backend/src/api/routes/websocket/task_manager.py` task limit, coroutine-close, or cancellation cleanup behavior.
title: "Backend API WebSocket Connection Docs Hub"
---

# Backend API WebSocket Connection Docs Hub

## Deep Pages

- [Handshake Parse, Validation, and Policy-Close Contract Reference](handshake_parse_validation_and_policy_close_contract_reference.md)
- [Task Manager Concurrency Limit, Rejected-Coroutine Close, and Cleanup Contract Reference](task_manager_concurrency_limit_rejected_coroutine_close_and_cleanup_contract_reference.md)

## Related Pages

- [Backend API WebSocket Docs Hub](../README.md)
- [WebSocket Message Parse, Validation Guard, and Task-Scheduling Reference](../websocket_message_parse_validation_guard_and_task_scheduling_reference.md)
- [WebSocket Connection and Task Lifecycle Reference](../../websocket_connection_and_task_lifecycle_reference.md)

## Code Scope

- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/task_manager.py`
- `backend/src/api/routes/websocket/__init__.py`
- `backend/src/api/schemas/common.py`
- `backend/src/core/validation/validators.py`
- `tests/backend/test_websocket_connection.py`
- `tests/backend/test_websocket_task_manager.py`
- `tests/backend/test_websocket_route.py`
