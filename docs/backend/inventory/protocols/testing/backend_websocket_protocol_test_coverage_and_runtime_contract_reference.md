---
summary: "Deep backend protocol test reference mapping websocket route/handshake lifecycle, json parse/runtime validation seams, task-limit scheduling safety, transport queue guarantees, and route/schema/envelope compatibility to concrete tests."
read_when:
  - When changing backend websocket receive-loop timeout, handshake validation, message parse/runtime seams, or handler error forwarding paths.
  - When changing task-limit scheduling helpers, outgoing websocket envelope fields, formatter payload shapes, or incoming route table declarations.
title: "Backend WebSocket Protocol Test Coverage and Runtime Contract Reference"
---

# Backend WebSocket Protocol Test Coverage and Runtime Contract Reference

## Coverage Snapshot (2026-03-06)

- Protocol test files in this reference: `12`
- Total test cases across listed files: `136`

## Scope and Sources

Primary runtime modules:

- `backend/src/api/routes/websocket/router.py`
- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/loop_runtime.py`
- `backend/src/api/routes/websocket/message_handler.py`
- `backend/src/api/routes/websocket/message_parse_runtime.py`
- `backend/src/api/routes/websocket/json_parse.py`
- `backend/src/api/routes/websocket/task_manager.py`
- `backend/src/api/transport/websocket.py`
- `backend/src/core/container/incoming_routing.py`
- `backend/src/api/transport/envelope.py`

Primary protocol tests:

- `tests/backend/test_websocket_route.py`
- `tests/backend/test_websocket_message_handler.py`
- `tests/backend/test_websocket_connection.py`
- `tests/backend/test_websocket_message_parse_runtime.py`
- `tests/backend/test_websocket_json_parse.py`
- `tests/backend/test_websocket_loop_runtime.py`
- `tests/backend/test_websocket_task_manager.py`
- `tests/backend/test_safe_websocket.py`
- `tests/backend/test_incoming_routing.py`
- `tests/backend/test_outgoing_schema_contract.py`
- `tests/backend/test_transport_envelope.py`
- `tests/backend/test_compact_history_handler.py`

## Contract Coverage Matrix

| Contract Area | Runtime Owner | Key Tests | Verified Guarantees |
|---|---|---|---|
| receive timeout + cleanup | `router.py`, `loop_runtime.py`, `connection.py` | timeout/cleanup tests in `test_websocket_route.py`, `test_websocket_loop_runtime.py` | timed-out idle sockets close with `1008`; per-user cleanup executes once; timeout close helper swallows close failures safely |
| handshake validation + failure logging | `connection.py` | `test_websocket_connection.py` | handshake accepts only valid object-root `HandshakeMessage`; parse/validation failures close with `1008`; validation/json failures log warning while unexpected failures log error |
| shared JSON parsing policy | `json_parse.py` | `test_websocket_json_parse.py` | UTF-8 byte-size threshold controls inline vs executor parse path; object-root parser rejects non-object roots with typed payload metadata |
| parse runtime + schema validation gate | `message_parse_runtime.py`, `message_handler.py` | `test_websocket_message_parse_runtime.py`, parse tests in `test_websocket_message_handler.py` | size limit enforced before parse; malformed JSON/non-object root map to canonical protocol errors; connection `user_id` injected before union validation; parser dependencies forwarded deterministically |
| prohibited inbound fields | incoming schema + parser | `test_parse_and_validate_message_rejects_removed_screenshot_fields` | client-origin `screenshot_url` rejected for `query`/`tool-bundle-result` payloads and inline query `screenshot` rejected |
| task-limit scheduling and client error fallback | `loop_runtime.py`, `task_manager.py` | `test_websocket_loop_runtime.py`, `test_websocket_task_manager.py`, limit branch tests in `test_websocket_route.py` | limit-exceeded requests close rejected coroutines, emit deterministic `Too many concurrent requests. Please wait.` errors, and avoid coroutine leak warnings |
| handler routing + error sanitization | `handle_message` / `send_error` (`message_handler.py`) | handle/send tests in `test_websocket_message_handler.py` | registry called by validated `message.type`; `ValueError` message can pass through; unexpected exceptions sanitized; send-error failures are swallowed with warning/error logging |
| send serialization and backpressure | `SafeWebSocket` (`websocket.py`) | `test_safe_websocket.py` | bounded queue applies backpressure; sender failure drains pending futures; close flushes queued messages; close idempotent; direct close fallback works without sender task |
| route-table/schema parity | `INCOMING_ROUTES` + helpers (`incoming_routing.py`) | `test_incoming_routing.py` | route message types match `IncomingMessage` literal union; duplicate route types rejected; missing handler keys rejected; route order preserved; non-literal `type` annotations rejected |
| outgoing formatter/schema contract | event formatter modules + schema models | `test_outgoing_schema_contract.py` | formatter outputs validate against canonical websocket schema models (`tool-schemas`, `token-count`, context-compaction) |
| compact-history manual protocol flow | `CompactHistoryHandler` (`api/handlers/compact_history.py`) | `test_compact_history_handler.py` | rejects while query active; emits started+completed envelopes when applied; emits completed with `skipped_reason` when not applied |
| envelope context-field shape | `build_transport_message` / `attach_context_fields` (`envelope.py`) | `test_transport_envelope.py` | canonical `{type,id,payload}` envelope; optional context fields only when truthy; context overwrite semantics are explicit and covered |

## Protocol Control-Path Test Index

| Control path | Runtime owner | Primary test anchors |
|---|---|---|
| websocket idle timeout + cleanup lifecycle | `backend/src/api/routes/websocket/router.py` | `test_websocket_route.py` |
| handshake parse/validation + policy-close behavior | `backend/src/api/routes/websocket/connection.py` | `test_websocket_connection.py` |
| shared JSON parse threshold + object-root enforcement | `backend/src/api/routes/websocket/json_parse.py` | `test_websocket_json_parse.py` |
| parse runtime mapping + inbound schema enforcement | `backend/src/api/routes/websocket/message_parse_runtime.py`, `message_handler.py` | `test_websocket_message_parse_runtime.py`, `test_websocket_message_handler.py` |
| receive-loop task scheduling + limit error fallback | `backend/src/api/routes/websocket/loop_runtime.py`, `task_manager.py` | `test_websocket_loop_runtime.py`, `test_websocket_task_manager.py`, `test_websocket_route.py` |
| route-table parity vs schema discriminators | `backend/src/core/container/incoming_routing.py` | `test_incoming_routing.py` |
| transport sender queue safety + close semantics | `backend/src/api/transport/websocket.py` | `test_safe_websocket.py` |
| outgoing formatter payload compatibility vs schema models | formatter stack + schema registry | `test_outgoing_schema_contract.py` |
| canonical envelope context attachment semantics | `backend/src/api/transport/envelope.py` | `test_transport_envelope.py` |
| manual compaction control protocol | `backend/src/api/handlers/compact_history.py` | `test_compact_history_handler.py` |

## WebSocket Route Lifecycle Test Contract

`tests/backend/test_websocket_route.py` validates high-risk receive-loop control flow:

- idle receive timeout triggers policy close (`1008`, timeout reason string)
- handshake failure returns early without running route cleanup lifecycle
- parse-error frames emit an error and the loop continues for subsequent valid frames
- sequential control-path messages (`stop-query`, `rehydrate-conversation`) dispatch in receive order
- limit-exceeded branch emits correlation-aware client error with the message id
- unexpected receive-loop/runtime errors re-raise after cleanup, preserving crash visibility

This protects against regressions where receive-loop reliability fixes accidentally suppress cleanup, ordering, or error propagation guarantees.

## Handshake and JSON Parse Contract Details

`tests/backend/test_websocket_connection.py` anchors handshake + cleanup behavior:

- valid handshake returns client user identity without closing socket
- handshake parse thresholds use UTF-8 byte size for executor offload decisions
- malformed JSON, non-object roots, missing/blank user ids, and parse runtime failures all close with `1008`
- validation/json failures log at warning level; unexpected runtime failures log at error level
- cleanup path attempts both task cleanup and session-end even when one step raises

`tests/backend/test_websocket_json_parse.py` anchors shared parser semantics:

- inline parse for small payloads and executor offload at/above threshold
- offload path uses `json.loads` and propagates decode/loop-getter failures
- object-root parser raises typed `JsonRootTypeError(payload_type=...)` for list/scalar roots
- default offload threshold contract remains `64 * 1024` bytes

## Parse, Validation, and Handler Contract Details

`tests/backend/test_websocket_message_handler.py` anchors route-layer parser and handler behavior:

- parser success path returns typed `QueryMessage` and injects connection user id
- oversize payload returns explicit `Message too large` rejection
- malformed JSON returns fixed `Malformed JSON` message
- non-object root returns fixed root-type rejection message
- unexpected parse exceptions collapse to generic internal error
- validation failures include `Invalid message format` framing
- structured tool-bundle step output preserves object payloads (no forced string coercion)
- large-payload parse offload seams are delegated through runtime parser dependencies
- tool-result and tool-bundle correlation ids trim padded values and reject whitespace/non-string ids
- bundle step result payload requires `step_results` and preserves structured `output` objects

Handler-side assertions:

- validated message type routes into registry `handle(...)`
- `ValueError` from registry is forwarded as client-safe text
- unexpected registry exceptions route through sanitization (`An internal error occurred`)
- `send_error` delegates to `send_error_response` while preserving optional explicit exception
- if error-send itself fails, message handler does not raise and logs with severity split (`warning` for non-critical, `error` for critical)

`tests/backend/test_websocket_message_parse_runtime.py` locks parser-runtime mapping behavior:

- forwards parser dependencies (`offload_threshold_bytes`, `loop_getter`) without mutation
- maps `JSONDecodeError`, `JsonRootTypeError`, and unexpected exceptions to canonical protocol error strings
- keeps connection user-id injection in runtime parse layer before union validation

## Loop Runtime and Task Manager Contract

`tests/backend/test_websocket_loop_runtime.py` validates helper-layer behavior split out of `router.py`:

- timeout-close helper always uses policy-close code/reason and swallows close failures
- scheduled message path dispatches handler when under limit
- limit-exceeded path emits deterministic client error and does not dispatch handler

`tests/backend/test_websocket_task_manager.py` validates task lifecycle guardrails:

- done-task pruning before limit checks prevents stale completed tasks from consuming capacity
- rejected inputs close coroutine objects to avoid `RuntimeWarning` leaks
- failed task creation closes coroutine and re-raises runtime errors
- cleanup logs timeout/orphaned-task conditions and prunes completed tasks deterministically

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
- context-compaction payloads (`started`, `completed`, `failed`) stay schema-compatible

`tests/backend/test_transport_envelope.py` locks envelope shape:

- context fields (`session_id`, `user_id`, `conversation_ref`, `turn_ref`) are optional additions, not required base keys
- falsy context values are not serialized
- provided context keys can overwrite pre-existing values

## Residual Risk and Suggested Additions

Gaps worth extending if protocol behavior changes:

- no current direct assertion in this suite for handshake policy-close reason text variants per failure class
- no direct test here for simultaneous high-volume control + query message interleaving under real `TaskManager` contention
- no explicit assertion in this suite for websocket error-envelope field ordering (shape is covered, ordering is implicit)

## Recompute Protocol Test Surface Commands

Use this command to inspect protocol-test coverage breadth quickly:

- `python - <<'PY'`
- `import pathlib`
- `import re`
- `roots=[`
- `  'tests/backend/test_websocket_route.py',`
- `  'tests/backend/test_websocket_message_handler.py',`
- `  'tests/backend/test_websocket_connection.py',`
- `  'tests/backend/test_websocket_message_parse_runtime.py',`
- `  'tests/backend/test_websocket_json_parse.py',`
- `  'tests/backend/test_websocket_loop_runtime.py',`
- `  'tests/backend/test_websocket_task_manager.py',`
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
