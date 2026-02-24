---
summary: "Backend API dispatch internals: route-table/handler binding validation, middleware fail-closed registry execution, typed handler guards, and canonical sanitized websocket error envelope behavior."
read_when:
  - When adding/changing websocket message types, handler wiring, or registry middleware behavior.
  - When debugging missing handler registration, schema/route drift, or inconsistent client-visible error payloads.
title: "Handler Registry and Error Envelope Reference"
---

# Handler Registry and Error Envelope Reference

## Canonical Modules

- `backend/src/core/container/incoming_routing.py`
- `backend/src/core/container/api_container.py`
- `backend/src/api/infrastructure/registry.py`
- `backend/src/api/infrastructure/handler.py`
- `backend/src/api/infrastructure/errors.py`
- `backend/src/api/routes/websocket/message_handler.py`
- `backend/src/api/transport/sender.py`
- `backend/src/api/transport/envelope.py`
- `backend/src/api/schemas/incoming.py`

## Canonical Incoming Route Table

Incoming type-to-handler wiring is centrally declared in `INCOMING_ROUTES`:

- `query` -> `query_handler`
- `stop-query` -> `stop_query_handler`
- `rehydrate-conversation` -> `rehydrate_conversation_handler`
- `tool-result` / `tool-bundle-result` -> `tool_result_handler`
- `wakeword-detected` -> `wakeword_handler`
- `list-models` -> `list_models_handler`
- `load-settings` -> `load_settings_handler`
- `update-settings` -> `update_settings_handler`

Validation guarantees before binding:

1. no duplicate `message_type` entries
2. exact parity with discriminated-union literals from `IncomingMessage`
3. all referenced handler keys exist in DI handler map

If any check fails, startup wiring raises a hard `ValueError` (fail-fast, no partial registry).

## DI Container Binding Path

`ApiContainer` creates singleton handler instances and builds the registry via:

- `build_handler_bindings(...)` from canonical route table
- `registry.register(message_type, handler)` loop

This removes duplicated manual registration strings and enforces schema-route consistency at startup.

## Registry Dispatch Pipeline

`MessageHandlerRegistry.handle(...)` execution order:

1. run middleware list in registration order
2. resolve handler by message type
3. validate message instance against handler
4. execute handler

Middleware behavior:

- sync and async middleware both supported
- async shape is precomputed once at registration time
- middleware exceptions are logged and re-raised
- re-raise is intentional fail-closed behavior (critical middleware must block handler execution)

Handler lookup failure:

- missing handler raises `ValueError("No handler registered for message type: ...")`
- registry does not expose the full internal handler list

## Typed Handler Guard

`TypedMessageHandler[MessageT]` enforces message type at runtime:

- `validate_message` uses `isinstance(message, message_model)`
- `handle` rechecks type and raises `TypeError` on mismatch
- concrete handlers only implement `handle_typed(...)`

This keeps concrete handlers free from repeated cast/shape checks.

## Route-Level Error Path

Route helper `handle_message(...)` classifies failures:

- `ValueError` (for example missing handler / invalid message): sent directly as client message text
- other exceptions: sanitized via `sanitize_error_message(...)`

Error-send failures (socket already closed) are caught and logged, not re-raised, so the route loop remains stable.

## Canonical Error Envelope Contract

All websocket errors should go through `send_error_response(...)`:

```json
{
  "type": "error",
  "id": "<original_message_id|null>",
  "payload": {
    "message": "<sanitized_text>"
  }
}
```

Send path:

- `build_transport_message(...)` builds base envelope
- `WebSocketTransportSender.send(...)` performs one send
- connection-close failures (`WebSocketDisconnect`, `RuntimeError`, `ConnectionError`) are swallowed at debug level

## Sanitization Rules

`sanitize_error_message(...)` behavior:

- explicit `ValidationError`: safe to expose `message`
- selected user-input-style `ValueError` / `KeyError` with known validation keywords may pass through
- all other exceptions collapse to `"An internal error occurred"`

When exception object is provided:

- full exception + stack trace logged server-side
- sanitized text sent to client

## Context Field Attachment Rules

`build_transport_message(...)` can attach optional context fields:

- `session_id`
- `user_id`
- `conversation_ref`
- `turn_ref`

Fields are attached only when present/truthy in context map.

## Drift and Regression Checklist

When adding a new incoming message type:

1. add literal schema in `api/schemas/incoming.py`
2. add route binding in `INCOMING_ROUTES`
3. add DI handler provider + map entry in `ApiContainer`
4. update handler matrix docs

If client receives inconsistent error payloads:

1. verify handler is using `send_error_response(...)` path
2. verify no custom manual envelope construction in handler
3. verify exception is routed through sanitizer path

If middleware appears ignored:

1. verify middleware was added to registry instance used by runtime container
2. verify middleware is not swallowing its own exceptions for critical policy paths
3. verify exceptions are not converted to success responses downstream

## Related Pages

- `docs/backend/contracts/routing/README.md`
- `docs/backend/contracts/routing/incoming_route_table_schema_parity_and_handler_binding_reference.md`
- `docs/backend/contracts/README.md`
