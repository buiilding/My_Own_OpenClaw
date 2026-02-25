---
summary: "Backend websocket error contract covering handshake failure closes, parse/validation client errors, handler exception sanitization, canonical error envelopes, and closed-socket send fallbacks."
read_when:
  - When modifying backend error response shape or message sanitization policy.
  - When investigating websocket client-visible errors under malformed payloads, handler failures, or disconnect races.
title: "Backend WebSocket Error Surface and Sanitization Contract Reference"
---

# Backend WebSocket Error Surface and Sanitization Contract Reference

## Scope and Sources

Primary sources:

- Error utilities: `backend/src/api/infrastructure/errors.py`
- Message parse/route error path: `backend/src/api/routes/websocket/message_handler.py`
- Handshake failure behavior: `backend/src/api/routes/websocket/connection.py`
- JSON root parse policy: `backend/src/api/routes/websocket/json_parse.py`
- Sender transport seam: `backend/src/api/transport/sender.py`
- Queue sender failure behavior: `backend/src/api/transport/websocket.py`

## Canonical Error Envelope

All backend websocket error responses are expected to follow one envelope pattern:

```json
{
  "type": "error",
  "id": "<msg-id-or-null>",
  "payload": {
    "message": "<client-safe-message>"
  }
}
```

Implementation owner:

- `send_error_response(...)` -> `build_transport_message(...)` -> `WebSocketTransportSender.send(...)`

Contract notes:

- Route/handler code should not handcraft error envelopes.
- `msg_id` may be absent for parse-stage failures before a valid envelope exists.

## Handshake Failure Error Surface

Handshake failures do not emit a websocket `error` envelope first; route closes connection with policy-violation semantics.

| Failure class | Detection point | Logging level | Client effect |
|---|---|---|---|
| JSON root not object | `parse_json_object_payload` | warning | close `1008` |
| Pydantic validation failure (`type`/`user_id`) | `HandshakeMessage.model_validate` | warning | close `1008` |
| malformed JSON text | JSON decode exception | warning | close `1008` |
| unexpected runtime error | generic exception | error | close `1008` |

## Post-Handshake Parse/Validation Error Surface

`parse_and_validate_message(...)` returns `(None, error_message)` for client-visible parse/schema failures.

| Condition | Client-visible message |
|---|---|
| payload bytes > `max_message_size` | `Message too large: <size> bytes (max: <limit> bytes)` |
| JSON root not object | `Invalid message format: root must be an object, got <type>` |
| malformed JSON | `Malformed JSON` |
| schema mismatch | `Invalid message format: <joined pydantic errors>` |
| unexpected parse exception | `An internal error occurred` |

Route loop behavior:

- Calls `send_error(...)` with returned message.
- Continues receive loop (no forced disconnect for these parse errors).

## Handler Exception Sanitization Contract

`handle_message(...)` error branches:

- `ValueError` from registry/validation is forwarded directly as client message.
- Any other exception is sanitized via `sanitize_error_message(...)`.

`sanitize_error_message(...)` rules:

1. `ValidationError` -> expose validation message.
2. `ValueError`/`KeyError` -> expose only when message contains allowlisted validation terms (`invalid`, `required`, `missing`, `expected`, `not found`, `not allowed`).
3. Everything else -> generic `An internal error occurred` (or `<context>: An internal error occurred` when context provided).

## Error Send Fallbacks on Disconnect

`send_error_response(...)` and `send_success_response(...)` share `_send_transport_message(...)`:

- Uses `WebSocketTransportSender` (thread-safe sender protocol).
- Swallows expected close-path exceptions:
  - `WebSocketDisconnect`
  - `RuntimeError`
  - `ConnectionError`
- Logs debug-level failure instead of raising.

Result:

- Route-level error handling does not crash due to already-closed sockets.

## Secondary Error Guard in Route Layer

`_send_error_with_fallback_logging(...)` in `message_handler.py` wraps `send_error(...)` itself:

- If even error-send fails unexpectedly, logs warning/error with `user_id` + `msg_id` context.
- Prevents recursive exception cascades in error path.

## Sender-Level Failure Semantics (SafeWebSocket)

`SafeWebSocket` error/reliability guarantees that affect error delivery:

- Outbound queue + single sender task serializes writes.
- Sender failure stores terminal exception and drains queued futures with same exception.
- Unknown queued message types become terminal runtime errors.
- `close(...)` attempts queued close first, then direct-close fallback.

Impact on error envelopes:

- If socket is already broken, pending error writes fail fast instead of hanging.
- Caller sees connection-closed class exceptions, which are intentionally swallowed by `_send_transport_message(...)`.

## Drift Checks

When changing error behavior, keep aligned:

- Error envelope shape in `errors.py` and frontend event parsers expecting `{ type: 'error', payload.message }`.
- Sanitization rules vs diagnostics needs (do not leak stack/internal paths).
- Parse-stage returned message strings (frontend may assert exact substrings in tests).
- Handshake close policy (`1008`) in connection handler.
