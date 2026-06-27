---
summary: "Deep reference for websocket handshake flow: first-frame object-root parsing, HandshakeMessage user-id validation, warning-vs-error logging, and policy-violation close behavior."
read_when:
  - When changing `perform_handshake`, `_fail_handshake`, or `_close_policy_violation`.
  - When debugging `/ws` connections that fail before message-loop start.
title: "Handshake Parse, Validation, and Policy-Close Contract Reference"
---

# Handshake Parse, Validation, and Policy-Close Contract Reference

## Canonical Modules

- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/json_parse.py`
- `backend/src/api/schemas/common.py`
- `backend/src/core/validation/validators.py`
- `tests/backend/test_websocket_connection.py`

## Handshake Entry Contract

`perform_handshake(websocket, safe_ws)` reads exactly one initial frame:

1. `raw_data = await websocket.receive_text()`
2. parse via `parse_json_object_payload(...)`
3. validate via `HandshakeMessage.model_validate(...)`
4. return validated `user_id` string

If handshake fails, function returns `None` and ensures close path is attempted.

## Parse Policy and Offload Threshold

Handshake parse uses:

- `_HANDSHAKE_JSON_PARSE_OFFLOAD_BYTES = DEFAULT_JSON_PARSE_OFFLOAD_BYTES`
- default threshold `64 * 1024` bytes

Behavior:

- payload UTF-8 byte size smaller than threshold parses inline
- payload at/above threshold uses loop executor (`run_in_executor`)
- non-object roots raise `JsonRootTypeError`

## Validation Contract

`HandshakeMessage` rules:

- `type` must be literal `"handshake"`
- `user_id` validated by shared `validate_user_id(...)`

`validate_user_id(...)` rejects:

- empty/whitespace-only user IDs
- literal `"default_user"`

Returned `user_id` is stripped string.

## Failure Classification and Logging

`_fail_handshake(...)` controls severity split:

- validation-style failures (`PydanticValidationError`, `JsonRootTypeError`, `JSONDecodeError`) -> warning
- unexpected runtime failures -> error

All failure classes then call `_close_policy_violation(...)`.

## Policy-Close Semantics

`_close_policy_violation(...)` behavior:

- calls `safe_ws.close(code=1008)`
- swallows close exceptions and logs debug only

Implication:

- handshake failure cannot crash route even if socket close itself fails.

## Cleanup Boundary

Route behavior (`websocket_endpoint`) after handshake:

- `if not user_id: return`

Message loop never starts when handshake fails; normal route `finally` cleanup runs only after successful handshake enters main loop.

## Test-Backed Matrix

`tests/backend/test_websocket_connection.py` verifies:

- valid handshake returns client user_id and does not close socket
- small payload uses inline parse path (no loop getter requirement)
- forced-large payload uses executor parse path
- invalid JSON, missing user_id, blank user_id, non-object root all close with code `1008`
- parse runtime errors close with `1008`
- validation failures log warning; unexpected failures log error
- close failures are swallowed in both direct and helper close paths

## Drift Hotspots

1. Changing handshake to accept non-object payload roots breaks guard parity with runtime message parsing.
2. Relaxing user_id validation allows forbidden `"default_user"` identities to enter session scope.
3. Raising on close failures can crash connection setup during expected disconnect races.

## Related Pages

- [Backend API WebSocket Connection Docs Hub](README.md)
- [Task Manager Concurrency Limit, Rejected-Coroutine Close, and Cleanup Contract Reference](task_manager_concurrency_limit_rejected_coroutine_close_and_cleanup_contract_reference.md)
- [WebSocket Message Parse, Validation Guard, and Task-Scheduling Reference](../websocket_message_parse_validation_guard_and_task_scheduling_reference.md)
