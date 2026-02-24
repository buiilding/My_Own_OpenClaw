---
summary: "Deep reference for sidecar stdin/stdout transport internals: JSON-RPC request validation/dispatch, notification suppression semantics, parse/internal error envelopes, stdout JSON-line writes, and signal-driven graceful shutdown flow."
read_when:
  - When changing `core/ipc_protocol.py`, `core/stdout_json.py`, or `core/runtime_shutdown.py`.
  - When debugging malformed sidecar request handling, missing notification suppression, or process exit hangs during SIGINT/SIGTERM.
title: "JSON-RPC Protocol, Stdout Framing, and Shutdown Signal Runtime Reference"
---

# JSON-RPC Protocol, Stdout Framing, and Shutdown Signal Runtime Reference

## Canonical Modules

- `frontend/src/main/python/core/ipc_protocol.py`
- `frontend/src/main/python/core/stdout_json.py`
- `frontend/src/main/python/core/runtime_shutdown.py`
- `frontend/src/main/python/local_backend.py`
- `tests/sidecar/test_json_rpc_protocol.py`
- `tests/sidecar/test_stdout_json.py`
- `tests/sidecar/test_runtime_shutdown.py`

## Request Validation and Dispatch

`JSONRPCProtocol.handle_request(...)` enforces:

- payload must be object (`dict`)
- `jsonrpc == "2.0"`
- `method` exists and is string
- method is registered
- `params` is object when present

If registered handler is callable and signature is introspectable, params are bound against handler signature before execution.

Invalid bindings return `INVALID_PARAMS` before handler invocation.

## Notification Semantics

A request without `id` is treated as notification.

Protocol behavior:

- executes handler normally
- suppresses success response
- suppresses error response (`_notification_aware_error`)

This includes parameter-validation errors for notifications.

## Handler Execution Modes

Registered methods can be:

- async callable
- sync callable
- non-callable literal (constant result value)

Dispatch behavior:

- async callables awaited
- sync callables called directly
- non-callables returned as static result payload

## Error Envelope Mapping

Standard error codes:

- `PARSE_ERROR = -32700`
- `INVALID_REQUEST = -32600`
- `METHOD_NOT_FOUND = -32601`
- `INVALID_PARAMS = -32602`
- `INTERNAL_ERROR = -32603`

Failure mapping:

- `JSONRPCError` -> code/message/data passthrough
- unexpected exceptions -> `INTERNAL_ERROR` with logged traceback

`process_line(...)` parses one line:

- JSON decode failures -> `PARSE_ERROR`
- other processing failures -> `INTERNAL_ERROR`

## Response Construction Utilities

- `create_request(...)` omits optional fields unless provided
- `create_response(...)` prefers explicit `error` payload when both result and error passed
- `create_error_response(...)` omits `data` key when not provided

`send_response(...)` writes via `write_json_line(...)` and swallows write exceptions after logging.

## Stdout JSON-Line Framing

`write_json_line(payload)`:

1. `json.dumps(..., ensure_ascii=False)`
2. append newline
3. UTF-8 encode
4. write bytes to `sys.stdout.buffer`
5. flush

Contract:

- one JSON object/array per line
- encoding/write errors propagate to caller

## Signal-Driven Graceful Shutdown

`register_shutdown_signal_handlers(handler)` installs handlers for `SIGINT` and `SIGTERM`.

`handle_shutdown_signal(signum, active_service, logger)`:

- logs signal
- forwards to `active_service.request_shutdown(signum)` when service exists
- returns bool handled status

`request_stdin_shutdown(service, logger, signum?)`:

- idempotently marks `_shutdown_requested = True`
- sets `service.running = False`
- closes `sys.stdin` when open/callable to unblock read loops
- tolerates missing/already-closed/non-callable/exceptional stdin close path

## Test-Backed Invariants

`tests/sidecar/test_json_rpc_protocol.py` verifies:

- async/sync success dispatch
- notification response suppression (success and error)
- strict invalid-request/method/params/code mapping
- signature-binding errors for missing/unexpected params
- JSONRPCError passthrough and generic internal-error mapping
- non-object payload rejection and parse-error mapping
- response-constructor edge cases

`tests/sidecar/test_stdout_json.py` verifies:

- UTF-8 JSON + newline framing
- array payload support
- encoding/write failures propagate

`tests/sidecar/test_runtime_shutdown.py` verifies:

- stdin-close shutdown path marks service stop flags
- idempotent repeated shutdown
- signal registration for SIGINT/SIGTERM
- fallback behavior for absent/closed/non-callable/failing stdin close

## Drift Hotspots

1. changing notification handling to emit responses can violate JSON-RPC notification contract and confuse main-process pending maps.
2. bypassing signature binding can defer param-shape failures into handler internals and reduce deterministic error envelopes.
3. removing newline framing or flush in stdout writer can deadlock line-oriented bridge readers.
4. failing to close stdin on shutdown can leave sidecar stuck in blocking read loops.

## Related Pages

- [Frontend Sidecar Core Docs Hub](README.md)
- [Backend URL Resolution, Remote Memory Clients, and Thread-Pool Runtime Reference](backend_url_resolution_remote_memory_clients_and_thread_pool_runtime_reference.md)
- [Local Backend JSON-RPC Reference](../local_backend_jsonrpc_reference.md)
