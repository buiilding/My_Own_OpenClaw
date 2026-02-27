---
summary: "Deep reference for websocket route ingress policy: handshake object-root parsing, message size/schema validation, task-limit enforcement, and timeout/disconnect cleanup behavior."
read_when:
  - When changing websocket route parse policy (`json_parse.py`) or message validation (`message_handler.py`).
  - When debugging `Malformed JSON`, object-root errors, concurrency-limit rejections, or timeout-close behavior.
title: "WebSocket Message Parse, Validation Guard, and Task-Scheduling Reference"
---

# WebSocket Message Parse, Validation Guard, and Task-Scheduling Reference

## Canonical Modules

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

## JSON Parse Policy

Shared parser policy lives in `json_parse.py`.

Threshold contract:

- `DEFAULT_JSON_PARSE_OFFLOAD_BYTES = 64 * 1024`

Parse behavior:

- payload length `< threshold` -> inline `json.loads`
- payload length `>= threshold` -> `loop.run_in_executor(None, json.loads, data)`

Object-root guard:

- `parse_json_object_payload(...)` rejects non-dict roots with `JsonRootTypeError(payload_type=<type>)`

Operational implication:

- both handshake and per-message parsing enforce object-root payloads and can report exact non-object type name

## Handshake Validation Path

`perform_handshake(...)` sequence:

1. read first websocket text frame
2. parse via `parse_json_object_payload(...)`
3. validate with `HandshakeMessage.model_validate(...)`
4. return validated `user_id` on success

Failure handling:

- validation/JSON/object-root errors logged as warnings
- unexpected runtime failures logged as errors
- close with policy code `1008`
- close failures are swallowed

Test anchors:

- invalid JSON/missing user/blank user/non-object root all close with `1008`
- parser offload threshold behavior validated for small vs forced-large payloads

## Runtime Message Validation Path

`parse_and_validate_message(data, user_id, max_message_size)` sequence:

1. size guard before parse:
   - if `len(data) > max_message_size`, return `"Message too large: ..."`
   - equality is accepted (`len(data) == max_message_size` remains valid)
2. parse object-root JSON
3. inject connection `user_id` into parsed payload
4. validate through cached `TypeAdapter(IncomingMessage)`
5. return typed message object

Error surface:

- malformed JSON -> `"Malformed JSON"`
- non-object root -> `"Invalid message format: root must be an object, got <type>"`
- schema mismatch -> `"Invalid message format: ..."`
- unexpected parse exceptions -> `"An internal error occurred"` (sanitized)

Validation-detail formatting contract:

- multiple schema issues join with `; `
- each issue renders dotted location paths from Pydantic `loc` entries
- list indices are preserved in paths (for example `payload.step_results.0.tool`)

Contract hardening:

- screenshot-url fields in inbound payloads are rejected by schema validation tests (`screenshot_url` not accepted in query/tool-bundle-result messages)

## Task Scheduling and Limit Guards

Websocket route schedules each validated message through:

- `TaskManager.create_task_if_under_limit(handle_message(...), user_id)`

Limit behavior:

- done tasks pruned before enforcing limit
- if at limit:
  - coroutine input is explicitly closed
  - route sends `"Too many concurrent requests. Please wait."`

Task lifecycle:

- accepted task added to `active_tasks`
- done callback removes task via in-place discard
- cleanup path cancels pending tasks and waits up to `task_cancellation_timeout`

Zombie handling:

- timeout during cleanup logs warning
- tasks still not done after cancellation pass log orphaned-task error

## Receive Timeout Behavior

Route read loop wraps `websocket.receive_text()` with:

- `asyncio.wait_for(..., timeout=websocket_receive_timeout)`

On timeout:

- closes connection with `1008` and reason `"Connection timeout - no data received"`
- exits loop and runs cleanup once

Test anchor:

- timeout path verifies one cleanup call and expected close frame reason

## Error Send Stability

`handle_message(...)` routes typed message to handler registry.

Failure paths:

- `ValueError` from registry -> sends direct client error message
- unexpected exception -> sanitized error message via `sanitize_error_message`

Error-send resilience:

- `_send_error_with_fallback_logging(...)` catches send failures (e.g., disconnect race), logs, and avoids raising from error path

## Drift Hotspots

1. changing offload threshold semantics without updating tests can shift parse latency/CPU behavior unexpectedly.
2. removing object-root guard allows array/string roots to bypass expected schema path.
3. changing message-size guard order (after parse) reopens large-payload CPU pressure.
4. not closing rejected coroutines at task limit can leak `RuntimeWarning: coroutine was never awaited`.
5. weakening timeout close semantics can leave idle sockets consuming connection slots.
6. changing the size comparison from `>` to `>=` would incorrectly reject payloads exactly at configured limit.

## Change Checklist

When touching websocket ingress:

1. preserve object-root parse contract for handshake and message frames
2. preserve pre-parse size guard in `parse_and_validate_message`
3. preserve user-id injection from connection context before schema validate
4. preserve task-limit rejection + coroutine-close behavior
5. re-run websocket route/parse/task-manager test suites

## Related Pages

- [Backend API WebSocket Docs Hub](README.md)
- [WebSocket Connection Docs Hub](connection/README.md)
- [Handshake Parse, Validation, and Policy-Close Contract Reference](connection/handshake_parse_validation_and_policy_close_contract_reference.md)
- [Task Manager Concurrency Limit, Rejected-Coroutine Close, and Cleanup Contract Reference](connection/task_manager_concurrency_limit_rejected_coroutine_close_and_cleanup_contract_reference.md)
- [WebSocket Connection and Task Lifecycle Reference](../websocket_connection_and_task_lifecycle_reference.md)
