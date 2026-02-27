---
summary: "Deep backend protocol test reference mapping websocket route lifecycle, parse/validation error surfaces, queued sender safety, route-table/schema alignment, formatter-schema compatibility, and envelope context semantics to concrete tests."
read_when:
  - When changing backend websocket receive-loop timeout, message parsing/validation, or handler error forwarding paths.
  - When changing outgoing websocket envelope fields, formatter payload shapes, or incoming route table declarations.
title: "Backend WebSocket Protocol Test Coverage and Runtime Contract Reference"
---

# Backend WebSocket Protocol Test Coverage and Runtime Contract Reference

## Coverage Snapshot (2026-02-26)

- Protocol test files in this reference: `7`
- Total test cases across listed files: `52`

## Scope and Sources

Primary runtime modules:

- `backend/src/api/routes/websocket/__init__.py`
- `backend/src/api/routes/websocket/message_handler.py`
- `backend/src/api/transport/websocket.py`
- `backend/src/core/container/incoming_routing.py`
- `backend/src/api/transport/envelope.py`

Primary protocol tests:

- `tests/backend/test_websocket_route.py`
- `tests/backend/test_websocket_message_handler.py`
- `tests/backend/test_safe_websocket.py`
- `tests/backend/test_incoming_routing.py`
- `tests/backend/test_outgoing_schema_contract.py`
- `tests/backend/test_transport_envelope.py`
- `tests/backend/test_compact_history_handler.py`

## Contract Coverage Matrix

| Contract Area | Runtime Owner | Key Tests | Verified Guarantees |
|---|---|---|---|
| receive timeout + cleanup | `websocket_endpoint` (`__init__.py`) | `test_websocket_endpoint_timeout_cleans_up_once` | timed-out idle sockets close with `1008`; per-user cleanup executes once; accepted connection still closes safely |
| parse + schema validation gate | `parse_and_validate_message` (`message_handler.py`) | parse/validate tests in `test_websocket_message_handler.py` | size limit enforced before parse; malformed JSON returns canonical message; non-object root rejected; user_id injected from connection context before model validation |
| prohibited inbound fields | incoming schema + parser | `test_parse_and_validate_message_rejects_screenshot_url_field` | client-origin `screenshot_url` rejected for `query` and `tool-bundle-result` payloads |
| parse offload threshold behavior | `parse_json_object_payload` call path | small/large payload executor tests in `test_websocket_message_handler.py` | small payload parses inline; large payload uses executor path when threshold crossed |
| handler routing + error sanitization | `handle_message` / `send_error` (`message_handler.py`) | handle/send tests in `test_websocket_message_handler.py` | registry called by validated `message.type`; `ValueError` message can pass through; unexpected exceptions sanitized; send-error failures are swallowed with warning/error logging |
| send serialization and backpressure | `SafeWebSocket` (`websocket.py`) | `test_safe_websocket.py` | bounded queue applies backpressure; sender failure drains pending futures; close flushes queued messages; close idempotent; direct close fallback works without sender task |
| route-table/schema parity | `INCOMING_ROUTES` + helpers (`incoming_routing.py`) | `test_incoming_routing.py` | route message types match `IncomingMessage` literal union; duplicate route types rejected; missing handler keys rejected; route order preserved; non-literal `type` annotations rejected |
| outgoing formatter/schema contract | event formatter modules + schema models | `test_outgoing_schema_contract.py` | formatter outputs validate against canonical websocket schema models (`tool-schemas`, `token-count`, `memory-store`) |
| compact-history manual protocol flow | `CompactHistoryHandler` (`api/handlers/compact_history.py`) | `test_compact_history_handler.py` | rejects while query active; emits started+completed envelopes when applied; emits completed with `skipped_reason` when not applied |
| envelope context-field shape | `build_transport_message` / `attach_context_fields` (`envelope.py`) | `test_transport_envelope.py` | canonical `{type,id,payload}` envelope; optional context fields only when truthy; context overwrite semantics are explicit and covered |

## Protocol Control-Path Test Index

| Control path | Runtime owner | Primary test anchors |
|---|---|---|
| websocket idle timeout + cleanup lifecycle | `backend/src/api/routes/websocket/__init__.py` | `test_websocket_route.py` |
| parse/validation gate + inbound schema enforcement | `backend/src/api/routes/websocket/message_handler.py` | `test_websocket_message_handler.py` |
| route-table parity vs schema discriminators | `backend/src/core/container/incoming_routing.py` | `test_incoming_routing.py` |
| transport sender queue safety + close semantics | `backend/src/api/transport/websocket.py` | `test_safe_websocket.py` |
| outgoing formatter payload compatibility vs schema models | formatter stack + schema registry | `test_outgoing_schema_contract.py` |
| canonical envelope context attachment semantics | `backend/src/api/transport/envelope.py` | `test_transport_envelope.py` |
| manual compaction control protocol | `backend/src/api/handlers/compact_history.py` | `test_compact_history_handler.py` |

## WebSocket Route Lifecycle Test Contract

`tests/backend/test_websocket_route.py` currently validates the high-risk timeout branch in `websocket_endpoint`:

- idle receive timeout triggers policy close (`1008`, timeout reason string)
- cleanup hook executes for the same user exactly once
- timeout path does not skip initial accept handshake

This protects against regressions where timeout protection exists but session/task cleanup is skipped.

## Parse, Validation, and Handler Contract Details

`tests/backend/test_websocket_message_handler.py` anchors route-layer parser and handler behavior:

- parser success path returns typed `QueryMessage` and injects connection user id
- oversize payload returns explicit `Message too large` rejection
- malformed JSON returns fixed `Malformed JSON` message
- non-object root returns fixed root-type rejection message
- unexpected parse exceptions collapse to generic internal error
- validation failures include `Invalid message format` framing
- structured tool-bundle step output preserves object payloads (no forced string coercion)
- large-payload parse offload uses event-loop executor seam

Handler-side assertions:

- validated message type routes into registry `handle(...)`
- `ValueError` from registry is forwarded as client-safe text
- unexpected registry exceptions route through sanitization (`An internal error occurred`)
- `send_error` delegates to `send_error_response` while preserving optional explicit exception
- if error-send itself fails, message handler does not raise and logs with severity split (`warning` for non-critical, `error` for critical)

## SafeWebSocket Reliability Contract

`tests/backend/test_safe_websocket.py` covers concurrency and disconnect safety in the queue sender:

- rejects non-positive queue size at construction
- enforces bounded queue backpressure under slow senders
- sender failure marks terminal error and fails all queued+future send awaiters
- close flushes queued sends before close frame
- close without sender task uses direct-close path
- send_text and send_json both route through sender loop, including custom JSON mode
- accept delegates to raw websocket
- repeated close is idempotent
- unknown queued message type sets terminal sender error and blocks future sends

These tests define the transport-level guarantee that route handlers can await sends without concurrent-write races.

## Incoming Route Table and Schema Coupling

`tests/backend/test_incoming_routing.py` verifies container wiring consistency:

- route table equals schema-discriminated type set
- `validate_incoming_routes()` is executable as a startup invariant
- shared handler keys intentionally support one handler instance for multiple message types (`tool-result` and `tool-bundle-result`)
- binding order remains deterministic (route table order)
- startup fails fast when handler instances are missing
- duplicate route definitions and schema mismatch (`missing`/`extra`) surface clear errors
- annotated and non-annotated unions are both supported when `type` remains `Literal[...]`

## Outgoing Contract and Envelope Consistency

`tests/backend/test_outgoing_schema_contract.py` verifies formatter -> schema compatibility:

- tool schema payload must remain canonical list format
- token-count payload keeps usage-source + cache diagnostics fields
- memory-store payload keeps required identity/session fields
- context-compaction payloads (`started`, `completed`, `failed`) stay schema-compatible

`tests/backend/test_transport_envelope.py` locks envelope shape:

- context fields (`session_id`, `user_id`, `conversation_ref`, `turn_ref`) are optional additions, not required base keys
- falsy context values are not serialized
- provided context keys can overwrite pre-existing values

## Residual Risk and Suggested Additions

Gaps worth extending if protocol behavior changes:

- no current direct test for handshake failure classes in `connection.py` within this sub-suite
- no direct test here for `stop-query` and `rehydrate-conversation` route execution ordering under concurrent load
- no explicit assertion in this suite for websocket error-envelope field ordering (shape is covered, ordering is implicit)

## Recompute Protocol Test Surface Commands

Use this command to inspect protocol-test coverage breadth quickly:

- `python - <<'PY'`
- `import pathlib`
- `import re`
- `roots=[`
- `  'tests/backend/test_websocket_route.py',`
- `  'tests/backend/test_websocket_message_handler.py',`
- `  'tests/backend/test_safe_websocket.py',`
- `  'tests/backend/test_incoming_routing.py',`
- `  'tests/backend/test_outgoing_schema_contract.py',`
- `  'tests/backend/test_transport_envelope.py',`
- `  'tests/backend/test_compact_history_handler.py',`
- `]`
- `for p in roots:`
- `    text=pathlib.Path(p).read_text()`
- `    count=len(re.findall(r'^\\s*(?:async\\s+def|def)\\s+test_', text, flags=re.M))`
- `    print(p, 'tests=', count)`
- `PY`

## Related Pages

- [Backend Protocol Lifecycle Hub](../lifecycle/README.md)
- [Backend Protocol State Hub](../state/README.md)
- [Backend Protocol Errors Hub](../errors/README.md)
- [Backend Protocol Validation Hub](../validation/README.md)
