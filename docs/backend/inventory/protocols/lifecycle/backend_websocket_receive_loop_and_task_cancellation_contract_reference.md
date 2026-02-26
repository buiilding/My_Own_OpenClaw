---
summary: "Lifecycle-level backend websocket protocol contract from handshake through receive-loop dispatch, task-limit enforcement, cancellation cleanup, and stop-query completion semantics."
read_when:
  - When changing `/ws` receive-loop timeout/concurrency behavior.
  - When investigating stale tasks, cancellation lag, or protocol error responses under load.
title: "Backend WebSocket Receive Loop and Task Cancellation Contract Reference"
---

# Backend WebSocket Receive Loop and Task Cancellation Contract Reference

## Scope and Sources

Lifecycle contract sources:

- Route entrypoint + loop: `backend/src/api/routes/websocket/__init__.py`
- Handshake: `backend/src/api/routes/websocket/connection.py`
- Message parse/validate/dispatch: `backend/src/api/routes/websocket/message_handler.py`
- Per-connection task tracking: `backend/src/api/routes/websocket/task_manager.py`
- Sender serialization/backpressure: `backend/src/api/transport/websocket.py`
- Stop-query terminal behavior: `backend/src/api/handlers/stop_query.py`
- Compact-history control behavior: `backend/src/api/handlers/compact_history.py`
- Shared handler context helper: `backend/src/api/handlers/context.py`
- Runtime config fields: `backend/src/core/config/models.py`

## Connection Timeline

1. `SafeWebSocket(websocket)` wrapper created and accepted.
2. Config snapshot read from `session_manager.config`:
   - `websocket_max_message_size`
   - `websocket_max_concurrent_tasks`
   - `websocket_receive_timeout`
   - `websocket_task_cancellation_timeout`
3. `perform_handshake(...)` waits for first text frame and validates `HandshakeMessage`.
4. Main receive loop starts:
   - `asyncio.wait_for(websocket.receive_text(), timeout=websocket_receive_timeout)`
   - parse/validate payload
   - schedule handler task via `TaskManager`
5. On disconnect or fatal loop error: `cleanup_connection(...)` cancels pending tasks and ends session.

## Handshake Rules

| Input | Validation | Failure action |
|---|---|---|
| First frame must parse to JSON object | root must be object (`parse_json_object_payload`) | close with code `1008` |
| Object must satisfy `HandshakeMessage` | `type="handshake"` + valid `user_id` | close with code `1008` |

Notes:

- JSON parsing offloads to thread pool for payloads >= `64 * 1024` bytes.
- Validation and JSON-root failures log as warning; unexpected runtime failures log as error.

## Receive-Loop Dispatch Contract

Each non-handshake frame path:

1. Message-size guard checks bytes against `websocket_max_message_size`.
2. JSON parsed with object-root requirement.
3. Route layer injects connection `user_id` before schema validation.
4. `TypeAdapter(IncomingMessage)` validates discriminated union by `type`.
5. Handler routing uses `MessageHandlerRegistry.handle(...)` with typed message model.

Error response behavior:

- malformed JSON -> `"Malformed JSON"`
- non-object root -> `"Invalid message format: root must be an object..."`
- schema mismatch -> `"Invalid message format: ..."`
- unexpected internal failures -> sanitized `"An internal error occurred"`

## Concurrency and Task-Limit Contract

`TaskManager.create_task_if_under_limit(...)` guarantees:

- Prunes completed tasks before limit check.
- Enforces per-connection hard cap: `len(active_tasks) < websocket_max_concurrent_tasks`.
- If limit exceeded:
  - incoming coroutine is explicitly closed (prevents `RuntimeWarning` leak),
  - no task is created,
  - route layer sends client error: `"Too many concurrent requests. Please wait."`.
- Accepted tasks are added atomically under lock and tracked with done-callback eviction.

## Disconnect Cleanup Contract

`cleanup_connection(...)` runs in `finally` of route loop:

1. Snapshot pending tasks with lock.
2. `cancel()` each pending task.
3. Await cancellation completion with timeout `websocket_task_cancellation_timeout`.
4. Log warning on cancellation timeout; log error for zombie tasks still not done.
5. Prune task set and call `session_manager.end_session(user_id)`.

Guarantee:

- Session end is attempted even after receive-loop exceptions.
- Task cancellation attempts are bounded; route does not hang forever on shutdown.

## Outbound Send Serialization Contract

`SafeWebSocket` behavior relevant to protocol lifecycle:

- Outbound writes enqueue onto bounded queue (default size `256`).
- Single sender task serializes `send_json`/`send_text`/`close` frames.
- Queue put uses timeout retry loop (`0.1s`) for bounded backpressure.
- Sender failure marks terminal error and fails all queued futures.

Effect:

- Concurrent handlers can emit safely without direct socket write races.
- On connection-close errors, pending send awaiters fail fast rather than hanging.

## Stop-Query Terminal Completion Semantics

`StopQueryHandler` protocol contract:

- Calls `session_manager.cancel_active_query_task(user_id)`.
- Always sends `streaming-complete` success envelope even when no active task existed.
- Includes context fields when available: `user_id`, optional `session_id`, optional `turn_ref`, optional `conversation_ref`.

Reason:

- Frontend stream UI can always exit active/streaming phase after stop request, independent of backend task presence.

## Compact-History Control Lifecycle Semantics

`CompactHistoryHandler` protocol behavior:

- Rejects request when `SessionManager.has_active_query_task(user_id)` is `True`.
- Uses session context from `build_user_session_context(...)`:
  - always `user_id`
  - optional `session_id`
  - optional runtime `conversation_ref`
- Runs `session.run_history_compaction(reason="manual", force=<payload.force>)`.
- Emits:
  - `context-compaction-started` when decision indicates apply
  - `context-compaction-completed` always (applied or skipped)
- Completion payload includes `skipped_reason` when compaction was not applied.

Lifecycle implication:

- Manual compaction is a control-path message in the same receive loop lifecycle as query/stop-query, but it is explicitly blocked during active query execution to avoid turn-state races.

## Shared Handler Context Builder Semantics

`build_user_session_context(...)` centralizes handler response context fields:

- `user_id` from route context (required)
- `session_id` from `session.session_id` when present
- `conversation_ref` from `session.runtime.active_conversation_ref` when present

This helper is shared by stop-query and compact-history handlers so context propagation rules stay consistent across control messages.

## Operational Drift Checks

When changing lifecycle code, keep these aligned:

- `AppConfig` websocket fields and route usage in `websocket_endpoint(...)`.
- Message-size/parse/schema error surfaces expected by frontend error handling.
- Task-limit cap and cancel timeout semantics versus frontend retry/stop behavior.
- `streaming-complete` stop-query guarantee.
- compact-history active-query guard and started/completed emission order.

## Related Deep Dives

- [Backend Protocol Errors Hub](../errors/README.md)
