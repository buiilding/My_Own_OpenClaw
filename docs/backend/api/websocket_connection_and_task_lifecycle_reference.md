---
summary: "Deep reference for backend `/ws` connection lifecycle: handshake contract, per-connection task scheduling/limits, query cancellation tracking, sender serialization, and disconnect cleanup guarantees."
read_when:
  - When changing websocket connection-loop behavior, task limits, or disconnect cleanup logic.
  - When debugging leaked handler tasks, stop-query cancellations, or sender failures after client disconnect.
title: "WebSocket Connection and Task Lifecycle Reference"
---

# WebSocket Connection and Task Lifecycle Reference

## Canonical Modules

- `backend/src/api/routes/websocket/__init__.py`
- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/message_handler.py`
- `backend/src/api/routes/websocket/task_manager.py`
- `backend/src/api/transport/websocket.py`
- `backend/src/api/handlers/query.py`
- `backend/src/api/handlers/stop_query.py`
- `backend/src/agent/session/manager.py`
- `backend/src/agent/session/lifecycle.py`

## Connection Initialization Sequence

`websocket_endpoint(...)` performs setup in this order:

1. Wrap raw FastAPI socket in `SafeWebSocket`.
2. Call `safe_ws.accept()`.
3. Read runtime limits from `session_manager.config`:
   - `websocket_max_message_size` (default `10MB`)
   - `websocket_max_concurrent_tasks` (default `50`)
   - `websocket_receive_timeout` (default `3600s`)
   - `websocket_task_cancellation_timeout` (default `5s`)
4. Create per-connection `TaskManager`.
5. Run handshake (`perform_handshake(...)`) to derive `user_id`.
6. Enter receive loop.

If handshake fails, the route returns immediately and no message loop starts.

## Handshake Contract and Failure Mode

Handshake is the first frame and must match `HandshakeMessage`:

- envelope `type` must be `"handshake"`
- `user_id` validated through shared `validate_user_id(...)` path
- `user_id` cannot be empty, whitespace-only, or `"default_user"`

Parsing behavior:

- handshake payload is JSON-decoded through `parse_json_object_payload(...)`
- payloads at or above `64KB` are decoded off-thread via executor
- root must be an object (array/string roots rejected)

Failure behavior:

- validation/json/object-root failures log warning
- unexpected runtime failures log error
- all handshake failures close socket with code `1008` (policy violation)

## Receive Loop and Message Dispatch Path

Each frame follows this route-level path:

1. `websocket.receive_text()` wrapped in `asyncio.wait_for(..., timeout=websocket_receive_timeout)`.
2. Timeout triggers close code `1008` with reason `"Connection timeout - no data received"`.
3. `parse_and_validate_message(...)` enforces:
   - raw frame size <= `websocket_max_message_size`
   - JSON object root only
   - connection-scoped `user_id` injected before schema validation
   - discriminated-union validation via cached `TypeAdapter(IncomingMessage)`
4. Parse/validation errors are sent back as canonical `error` envelopes and loop continues.
5. Validated messages are processed in background tasks via `TaskManager.create_task_if_under_limit(...)`.

Concurrency guard:

- if active task count is at limit, task is not scheduled
- rejected coroutine is explicitly closed to avoid `RuntimeWarning` leaks
- client receives `"Too many concurrent requests. Please wait."`

## `TaskManager` Semantics

`TaskManager` is connection-scoped and tracks only top-level route-dispatch tasks:

- `active_tasks` set + `tasks_lock` guard all task-set mutation
- `_prune_done_tasks_locked()` trims completed tasks before new scheduling
- each created task registers `task_done_callback` to discard itself

Cleanup behavior (`cleanup(user_id)`):

1. snapshot pending tasks under lock
2. cancel all pending tasks
3. `gather(..., return_exceptions=True)` with `websocket_task_cancellation_timeout`
4. log warning on cancellation timeout
5. detect and log zombie/orphan tasks still not done
6. final prune pass under lock

This gives deterministic best-effort cleanup on disconnect or route crash.

## Query Task Tracking vs Route Task Tracking

There are two parallel tracking layers:

- route-level: `TaskManager.active_tasks` (all handler invocations)
- query-level: `SessionManager._active_query_tasks[user_id][task] = (turn_ref, conversation_ref)`

`QueryMessageHandler` behavior:

- captures `asyncio.current_task()` and registers it as active query
- `turn_ref` comes from incoming `message.id`
- clears that exact task in `finally`

`StopQueryHandler` behavior:

- calls `SessionManager.cancel_active_query_task(user_id)`
- cancels every still-running tracked query task for the user
- returns the last canceled `(turn_ref, conversation_ref)` pair for context
- always emits `streaming-complete` so frontend exits active stream state even when nothing was running

## Disconnect Cleanup Chain

Route `finally` block always calls `cleanup_connection(...)`:

1. `TaskManager.cleanup(user_id)`
2. `SessionManager.end_session(user_id)`

`SessionManager.end_session(...)` guarantees:

- per-user lock is held during cleanup
- `session.cleanup()` invoked (`SessionLifecycle.cleanup`)
- session removed from `active_sessions` even if cleanup raised
- query-task metadata cleared
- per-user lock entry removed

`SessionLifecycle.cleanup(...)` additionally:

- unsubscribes session event handlers
- clears conversation history
- drains and cancels session-scoped background tasks
- clears runtime state

## `SafeWebSocket` Serialization and Backpressure

`SafeWebSocket` is the only supported concurrent sender implementation:

- bounded async queue (`max_queue_size` default `256`)
- one sender loop task serializes all write operations
- each enqueued send has a per-send future (caller awaits completion/failure)
- queue put retries with `0.1s` timeout to re-check closed/sender-failed state

Failure handling:

- sender loop captures first send/close failure in `_sender_error`
- pending queued sends are failed immediately via `_drain_pending_queue(...)`
- `_close_event` signals final sender shutdown

Close behavior:

- if no sender task ever started, closes underlying socket directly
- if sender task exists, enqueues `"close"` sentinel so close is write-ordered
- fallback direct close on enqueue/send failure

## Error Envelope Guarantees

Route/handler error responses are normalized through `send_error_response(...)`:

- canonical shape: `{type, id, payload: {message}}`
- transport send path uses `WebSocketTransportSender` -> `SafeWebSocket.send_json(...)`
- connection-close send failures are swallowed at debug level (expected post-disconnect)

## Operational Debug Checklist

If `/ws` clients leak work after disconnect:

1. verify long-running sub-tasks are session-tracked (not only route-tracked)
2. inspect `TaskManager.cleanup` timeout/zombie logs
3. inspect `SessionLifecycle.cleanup` for untracked background tasks

If stop-query appears ignored:

1. confirm query handler registered `current_task`
2. confirm stop-query user_id matches active query user_id
3. confirm frontend received `streaming-complete` fallback

If send path deadlocks/fails under load:

1. inspect SafeWebSocket sender-loop error logs
2. inspect queue backpressure/retry behavior
3. verify no direct raw `WebSocket.send_*` calls bypass `SafeWebSocket`

## Related Pages

- [Backend API WebSocket Docs Hub](websocket/README.md)
- [WebSocket Message Parse, Validation Guard, and Task-Scheduling Reference](websocket/websocket_message_parse_validation_guard_and_task_scheduling_reference.md)
- [Safe WebSocket and Transport Envelope Reference](transport/safe_websocket_and_transport_envelope_reference.md)
