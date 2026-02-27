---
summary: "Backend protocol state sub-hub for identity boundaries, stream-context propagation, and turn/session/conversation correlation fields across websocket responses."
read_when:
  - When changing handshake user identity rules or websocket route context injection.
  - When changing query/stop-query context fields (`session_id`, `user_id`, `conversation_ref`, `turn_ref`) on outgoing envelopes.
title: "Backend Protocol State Hub"
---

# Backend Protocol State Hub

## Deep Pages

- [Backend Protocol Identity and Context-Field Propagation Reference](backend_protocol_identity_and_context_field_propagation_reference.md)

## Related Pages

- [Backend Inventory Protocols Hub](../README.md)
- [Backend Protocol Lifecycle Hub](../lifecycle/README.md)
- [Backend Protocol Errors Hub](../errors/README.md)
- [Backend Protocol Compatibility Hub](../compatibility/README.md)
- [Backend Protocol Observability Hub](../observability/README.md)
- [Backend Protocol Validation Hub](../validation/README.md)
- [Backend Protocol Testing Hub](../testing/README.md)

## Code Scope

- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/message_handler.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/handlers/query.py`
- `backend/src/api/handlers/stop_query.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/api/transport/envelope.py`
- `backend/src/api/infrastructure/errors.py`
- `backend/src/agent/session/manager.py`
- `tests/backend/test_api_handlers.py`
- `tests/backend/test_api_errors.py`
- `tests/backend/test_response_formatter.py`
- `tests/backend/test_transport_envelope.py`
- `tests/backend/test_session_manager.py`
