---
summary: "Backend API transport deep reference for SafeWebSocket bounded-queue sender loop, protocol/sender integration, and canonical transport envelope context-field behavior."
read_when:
  - When changing `SafeWebSocket` queue/close semantics or WebSocket sender wrappers.
  - When debugging transport backpressure, sender-loop failure fan-out, or missing context fields on outbound messages.
title: "Safe WebSocket and Transport Envelope Reference"
---

# Safe WebSocket and Transport Envelope Reference

## Canonical Modules

- `backend/src/api/transport/websocket.py`
- `backend/src/api/transport/protocol.py`
- `backend/src/api/transport/sender.py`
- `backend/src/api/transport/envelope.py`
- `backend/src/api/infrastructure/errors.py`
- `backend/src/api/processing/formatter.py`
- `tests/backend/test_safe_websocket.py`
- `tests/backend/test_transport_sender.py`
- `tests/backend/test_transport_envelope.py`

## Protocol Boundary (`WebSocketSender`)

`api/transport/protocol.py` defines the runtime contract:

- `send_json(data, mode="text")`
- `send_text(data)`
- `close(code=1000, reason=None)`

This protocol is consumed by transport wrappers and error/tts helpers, preventing direct raw websocket writes across handlers.

## `SafeWebSocket` Queue Model

`SafeWebSocket` exists because concurrent writes on raw FastAPI/Starlette websockets are unsafe.

Design:

- single background sender loop serializes all outbound writes
- bounded queue (`asyncio.Queue(maxsize=...)`) provides backpressure
- enqueue side retries with short timeout (`_QUEUE_PUT_TIMEOUT_SECONDS = 0.1`) while re-checking close/sender health

Defaults:

- queue max size default: `256`

### Sender loop behavior

Queue item tuple includes:

- message type (`json`, `text`, `close`)
- payload/mode
- completion future

For each dequeued item:

- performs raw send/close operation
- resolves message future on success
- on connection/runtime failure:
  - stores terminal sender error
  - fails current future
  - exits loop
- on loop exit:
  - marks sender closed
  - fails all pending queued futures (`_drain_pending_queue`)
  - sets close event

## Send and Close Semantics

`send_json` / `send_text`:

- ensure sender task exists
- enqueue message + await completion future
- if sender already failed, propagate stored terminal exception

`close(...)`:

- idempotent if already closed
- no sender task yet -> direct close
- active sender -> enqueue close message so close is serialized after queued sends
- fallback to direct close if enqueue/flush fails
- waits for close event before returning

## Transport Sender Wrapper

`WebSocketTransportSender` is thin:

- wraps a `WebSocketSender`
- `send(message)` delegates to `send_json(message)`
- propagates underlying send exceptions

Primary integrations:

- query stream pipeline output (`QueryExecutionService` via `WebSocketTransportSender`)
- standardized success/error helpers (`api/infrastructure/errors.py`)

## Envelope and Context Attachment

Canonical envelope builder:

- `build_transport_message(type, id, payload, context=...)`

Base shape:

- `type`
- `id`
- `payload`

`attach_context_fields(...)` adds only truthy optional fields:

- `session_id`
- `user_id`
- `conversation_ref`
- `turn_ref`

Used by:

- `send_success_response` / `send_error_response` helpers
- `ResponseFormatter._attach_context(...)`

## Test-Backed Invariants

`tests/backend/test_safe_websocket.py` verifies:

- non-positive queue size rejected
- bounded queue backpressure blocks additional sends until capacity frees
- sender-loop failure propagates to pending + subsequent sends
- close flushes queued messages before close frame
- close without sender loop closes directly
- close is idempotent
- unknown queue message type sets terminal sender error

`tests/backend/test_transport_sender.py` verifies:

- wrapper forwards payload with default `mode="text"`
- wrapper propagates send failures

`tests/backend/test_transport_envelope.py` verifies:

- envelope context field attachment behavior
- no-context no-op
- only truthy context values added
- context keys overwrite prior envelope values when provided

## Drift Hotspots

1. Changing sender-loop queue tuple contract without synchronized handler updates can deadlock futures.
2. Removing pending-future drain on sender failure leaves awaiters hanging indefinitely.
3. Altering context-field attachment truthiness rules can break frontend turn/session correlation.
4. Bypassing `WebSocketSender` protocol and writing to raw websocket reintroduces concurrent-send race conditions.

## Related Pages

- [Backend API Transport Docs Hub](README.md)
- [Backend API Transport Sender Docs Hub](sender/README.md)
- [SafeWebSocket Queue Lifecycle and Close Serialization Reference](sender/safe_websocket_queue_lifecycle_and_close_serialization_reference.md)
