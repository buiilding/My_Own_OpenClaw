---
summary: "Deep backend observability reference for websocket protocol correlation fields, handshake/parse/error logging severity rules, query timing logs, and token-count telemetry schema guarantees."
read_when:
  - When changing backend websocket route logging, error sanitization send paths, or query timing instrumentation.
  - When changing token-count or context-field emission contracts consumed by frontend stream/tracking views.
title: "Backend Protocol Correlation, Logging, and Telemetry Signal Reference"
---

# Backend Protocol Correlation, Logging, and Telemetry Signal Reference

## Scope and Sources

Primary runtime sources:

- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/message_handler.py`
- `backend/src/api/handlers/query.py`
- `backend/src/api/services/query_execution.py`
- `backend/src/api/infrastructure/errors.py`
- `backend/src/api/transport/envelope.py`

Primary test sources:

- `tests/backend/test_api_handlers.py`
- `tests/backend/test_api_errors.py`
- `tests/backend/test_transport_envelope.py`
- `tests/backend/test_outgoing_schema_contract.py`

## Observability Surface Matrix

| Surface | Owner | Signal | Contract |
|---|---|---|---|
| handshake lifecycle logs | `connection.py` | `logger.info/warning/error` | success logs user identity; validation/json failures log warning; unexpected runtime failures log error |
| parse/route error logs | `message_handler.py` | parser + send-fallback logs | malformed parse internals logged server-side; client gets sanitized message; send-error failures logged with severity split |
| query timing logs | `query.py` + `query_execution.py` | `[Timing]` markers | logs start at query receipt and completion latency on finish |
| correlation field attachment | `envelope.py` + `errors.py` | transport envelope context | optional `user_id`, `session_id`, `conversation_ref`, `turn_ref` attached when truthy |
| telemetry payload emission | formatter chain + outgoing schema | `token-count` payload | token usage/caching counters preserved in schema-validated outbound payload |

## Correlation Field Contract

Canonical outbound envelope base:

- `type`
- `id`
- `payload`

Optional observability/correlation fields:

- `user_id`
- `session_id`
- `conversation_ref`
- `turn_ref`

`attach_context_fields(...)` rules:

- no context: no mutation
- only truthy context values are attached
- provided values overwrite existing keys

Validated by:

- `tests/backend/test_transport_envelope.py`
- `tests/backend/test_api_errors.py::test_send_success_response_attaches_context_fields`
- `tests/backend/test_api_handlers.py::test_query_handler_success`

## Logging Severity and Visibility Rules

### Handshake path (`connection.py`)

- successful handshake: `info`
- validation/root/json failures: `warning`
- unexpected runtime failures: `error`

### Parse path (`message_handler.py`)

- unexpected parser exceptions: `error` with traceback
- handled route errors that cannot be sent to closed socket:
  - non-critical send fallback: `warning`
  - critical send fallback: `error`

### Query lifecycle (`query.py`, `query_execution.py`)

- query accepted: `[Timing] Query received from frontend ...` (`info`)
- query completed: `[Timing] Query processing completed in ...` (`info`)
- stream ends without terminal event: warning with user + turn correlation

These conventions keep noisy expected disconnect classes off high-severity logs while preserving actionable protocol failures.

## Error Path Observability Contract

`send_error_response(...)` in `errors.py`:

- sanitizes exception for client payload
- logs full internal exception server-side (`exc_info=True`) when exception object provided
- swallows closed-connection send failures for both success and error helper paths

Validated by:

- `tests/backend/test_api_errors.py`

This guarantees diagnostic depth server-side without leaking internals over websocket protocol surfaces.

## Token-Count Telemetry Contract

Protocol signal:

- outgoing type `token-count`
- payload includes provider/estimated usage counters plus cache diagnostics fields

Key payload fields validated in tests:

- `prompt_tokens`
- `visible_output_tokens`
- `thinking_tokens`
- `output_tokens_total`
- `total_tokens`
- `conversation_tokens`
- `usage_source`
- `cached_tokens`
- `cache_hit`
- `cache_status`

Validated by:

- `tests/backend/test_outgoing_schema_contract.py::test_token_count_formatter_output_matches_schema`

## Drift Checks

When changing observability behavior, keep aligned:

- logging severity boundaries for expected vs unexpected protocol failures
- correlation field attachment rules (truthy-only context semantics)
- query timing log markers (`[Timing]`) and placement
- token-count payload keys vs frontend token display/tracking consumers

## Related Pages

- [Backend Protocol State Hub](../state/README.md)
- [Backend Protocol Testing Hub](../testing/README.md)
