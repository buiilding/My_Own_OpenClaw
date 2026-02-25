---
summary: "Deep backend protocol state reference for handshake identity acceptance, route-level user injection, per-turn stream context assembly, and canonical context-field propagation on outgoing websocket envelopes."
read_when:
  - When changing backend identity/session/correlation fields in websocket message handling.
  - When debugging missing or stale `user_id`, `session_id`, `conversation_ref`, or `turn_ref` on streamed/success/error envelopes.
title: "Backend Protocol Identity and Context-Field Propagation Reference"
---

# Backend Protocol Identity and Context-Field Propagation Reference

## Scope and Sources

Primary runtime sources:

- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/message_handler.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/handlers/query.py`
- `backend/src/api/handlers/stop_query.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/api/infrastructure/errors.py`
- `backend/src/api/transport/envelope.py`
- `backend/src/agent/session/manager.py`

Primary test sources:

- `tests/backend/test_api_handlers.py`
- `tests/backend/test_api_errors.py`
- `tests/backend/test_response_formatter.py`
- `tests/backend/test_transport_envelope.py`
- `tests/backend/test_session_manager.py`

## State Contract Matrix

| State Field | First authority | Propagation owner | Outgoing attach point | Key tests |
|---|---|---|---|---|
| `user_id` | websocket handshake payload validated by `HandshakeMessage` | route injects user into every parsed incoming message | `build_transport_message(..., context=...)` / `attach_context_fields(...)` | `test_query_handler_success`, `test_send_success_response_attaches_context_fields` |
| `session_id` | `AgentSession.session_id` from session manager | query stream context builder / stop-query context builder | formatter output + success helper context | `test_query_handler_success`, `test_stop_query_handler_cancels_active_query_and_emits_streaming_complete` |
| `conversation_ref` | incoming `query.payload.conversation_ref` or canceled active query metadata | query stream context builder / stop-query canceled tuple | formatter output + success helper context | `test_query_handler_success`, `test_stop_query_handler_cancels_active_query_and_emits_streaming_complete` |
| `turn_ref` | incoming message `id` | query stream context builder / active task registry / stop-query cancellation | formatter output + success helper context | `test_query_handler_success`, `test_cancel_active_query_task_cancels_all_tasks_and_returns_last_metadata` |

## Identity Boundary: Handshake and Route Injection

Identity flow is two-stage:

1. `perform_handshake(...)` accepts the first websocket frame and validates `{type:'handshake', user_id}` through `HandshakeMessage`.
2. For all post-handshake frames, `parse_and_validate_message(...)` injects connection `user_id` into parsed JSON before validating `IncomingMessage`.

Result:

- backend treats user identity as connection-context state, not trusted per-frame client payload state.
- handlers receive typed messages with server-injected `user_id` already normalized.

## Query Turn Context Construction

`QueryMessageHandler` registers active query task metadata before execution:

- `turn_ref = message.id`
- `conversation_ref = message.payload.conversation_ref`

`QueryExecutionService._build_stream_context(...)` creates one per-query context map:

- `user_id: agent_instance.user_id`
- `session_id: agent_instance.session_id`
- `conversation_ref: query conversation_ref`
- `turn_ref: msg_id`

That same context object is reused across all streamed events in `StreamPipeline.process(..., context=stream_context)`.

`tests/backend/test_api_handlers.py::test_query_handler_success` verifies:

- context is stable across multiple emitted events in the same turn
- all four correlation fields are present and consistent

## Outgoing Envelope Context Attachment

Two canonical attachment paths exist:

- streaming path:
  - `ResponseFormatter.format(...)`
  - `_attach_context(...)`
  - `attach_context_fields(...)`
- explicit success/error helper path:
  - `send_success_response(...)` / `send_error_response(...)`
  - `build_transport_message(..., context=...)`
  - `attach_context_fields(...)`

`attach_context_fields(...)` rules:

- no context -> no mutation
- only truthy context values are attached
- existing keys can be overwritten by provided context map

Locked by:

- `tests/backend/test_transport_envelope.py`
- `tests/backend/test_response_formatter.py`
- `tests/backend/test_api_errors.py`

## Stop-Query Correlation Semantics

`SessionManager` stores active query task metadata per user:

- `task -> (turn_ref, conversation_ref)`

`cancel_active_query_task(user_id)`:

- cancels all live tasks for user
- returns last canceled tuple `(turn_ref, conversation_ref)` or `None`

`StopQueryHandler` builds response context from:

- `user_id` (always)
- `session_id` (if active session has one)
- `turn_ref` + `conversation_ref` (when cancellation tuple exists)

Then always emits `streaming-complete` with that context, even if no active task exists.

Locked by:

- `tests/backend/test_api_handlers.py::test_stop_query_handler_cancels_active_query_and_emits_streaming_complete`
- `tests/backend/test_session_manager.py::test_cancel_active_query_task_cancels_all_tasks_and_returns_last_metadata`

## Error Path State Behavior

`send_error_response(...)` can include `id` correlation but does not attach context by default unless caller supplies it through message build path.

Security behavior:

- exception detail is sanitized for client payload
- connection-close failures while sending are swallowed (debug-level logging)

This keeps protocol state stable: disconnected sockets do not cause state-corrupting rethrows in handler error paths.

## Drift Checks

When modifying this surface, keep aligned:

- handshake model constraints vs route user injection assumptions
- query stream-context builder fields vs frontend event correlation expectations
- `SessionManager` active task metadata shape vs `StopQueryHandler` context attachment
- `attach_context_fields(...)` truthy-only behavior vs tests and renderer fallback logic

## Related Pages

- [Backend Protocol Lifecycle Hub](../lifecycle/README.md)
- [Backend Protocol Errors Hub](../errors/README.md)
- [Backend Protocol Testing Hub](../testing/README.md)
