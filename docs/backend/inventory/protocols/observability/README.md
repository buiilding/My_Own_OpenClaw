---
summary: "Backend protocol observability sub-hub for websocket correlation fields, handshake/parse/query logging semantics, sanitized error-path diagnostics, and token-count signal contract coverage."
read_when:
  - When changing websocket logging severity, transport context attachment, error-path logging/sanitization helpers, or streamed token-count payload fields.
  - When debugging correlation drift across `user_id`/`session_id`/`conversation_ref`/`turn_ref` in backend outbound events.
title: "Backend Protocol Observability Hub"
---

# Backend Protocol Observability Hub

## Deep Pages

- [Backend Protocol Correlation, Logging, and Telemetry Signal Reference](backend_protocol_correlation_logging_and_telemetry_signal_reference.md)

## Related Pages

- [Backend Inventory Protocols Hub](../README.md)
- [Backend Protocol State Hub](../state/README.md)
- [Backend Protocol Compatibility Hub](../compatibility/README.md)
- [Backend Protocol Testing Hub](../testing/README.md)

## Code Scope

- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/message_handler.py`
- `backend/src/api/handlers/query.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/infrastructure/errors.py`
- `backend/src/api/transport/envelope.py`
- `tests/backend/test_api_handlers.py`
- `tests/backend/test_api_errors.py`
- `tests/backend/test_transport_envelope.py`
- `tests/backend/test_outgoing_schema_contract.py`
