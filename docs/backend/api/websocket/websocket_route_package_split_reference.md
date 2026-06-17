---
summary: "Deep reference for WebSocket route package split: `router.py` runtime endpoint ownership, loop-runtime helpers, and direct router registration."
read_when:
  - When changing `backend/src/api/routes/websocket/router.py` receive-loop logic or timeout/cleanup semantics.
  - When changing websocket route registration in `backend/src/api/routes/__init__.py`.
title: "WebSocket Route Package Split Reference"
---

# WebSocket Route Package Split Reference

## Canonical Modules

- `backend/src/api/routes/websocket/router.py`
- `backend/src/api/routes/websocket/loop_runtime.py`
- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/message_handler.py`
- `backend/src/api/routes/websocket/task_manager.py`
- `backend/src/api/transport/websocket.py`
- `tests/backend/test_websocket_route.py`

## Why This Split Exists

`router.py` owns the concrete FastAPI `@router.websocket("/ws")` runtime path
and is imported directly by API router registration. Endpoint tests patch
`backend.src.api.routes.websocket.router` directly so there is one runtime
module for route dependencies.

## Runtime Endpoint Ownership (`router.py`)

`router.py` owns:

- APIRouter construction and route decoration
- WebSocket accept/receive loop
- parse/validate/send-error loop control
- task-manager fanout and limit handling
- final close + connection cleanup sequencing

`loop_runtime.py` owns:

- canonical timeout-close implementation (`close_connection_on_timeout`)
- validated-message task scheduling + task-limit error dispatch (`schedule_validated_message_task`)

Config values read from `session_manager.config`:

- `websocket_max_message_size`
- `websocket_max_concurrent_tasks`
- `websocket_receive_timeout`
- `websocket_task_cancellation_timeout`

## Import Surface

The route endpoint, dependency symbols, and test monkeypatch seam live in `router.py`.

## Timeout and Close Semantics

On receive timeout:

- `close_connection_on_timeout(...)` attempts close with code `1008` and policy-violation reason
- close failures are swallowed (socket may already be closed)
- endpoint sets `close_requested=True` so finally block does not attempt second close

On non-timeout exits:

- finally path attempts `safe_ws.close()` best-effort
- always runs `cleanup_connection(task_manager, session_manager, user_id)` after loop exit

Handshake failure path:

- endpoint returns immediately when `perform_handshake(...)` yields falsy user id
- no task-manager cleanup runs in that path

## Parse and Concurrency Semantics

Per received text frame:

1. parse/validate via `parse_and_validate_message(...)`
2. parse error -> `send_error(...)` and continue loop
3. valid message -> create task via `TaskManager.create_task_if_under_limit(...)`
4. over limit -> send `"Too many concurrent requests. Please wait."` with message id

Unexpected loop exceptions are logged and re-raised after cleanup.

## Test-Backed Invariants

`tests/backend/test_websocket_route.py` locks:

- timeout close code/reason and single cleanup invocation
- handshake-failure early return behavior
- parse-error send-and-continue behavior
- recovery after parse error with later valid dispatch
- sequential control-message dispatch behavior
- limit-exceeded error includes message id
- close-failure swallow in timeout helper
- unexpected receive/send failures re-raise after cleanup

## Drift Hotspots

1. Route tests should patch `backend.src.api.routes.websocket.router` symbols directly.
2. Changing `close_requested` gate can double-close sockets on timeout path.
3. Moving cleanup before close without matching error handling can leave task cleanup skipped when
   close raises.
4. Adding package-root helper exports can reintroduce a second route dependency surface.

## Related Docs

- [WebSocket Connection and Task Lifecycle Reference](../websocket_connection_and_task_lifecycle_reference.md)
- [WebSocket Message Parse, Validation Guard, and Task-Scheduling Reference](websocket_message_parse_validation_guard_and_task_scheduling_reference.md)
- [Task Manager Concurrency Limit, Rejected-Coroutine Close, and Cleanup Contract Reference](connection/task_manager_concurrency_limit_rejected_coroutine_close_and_cleanup_contract_reference.md)
