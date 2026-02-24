---
summary: "Deep reference for SafeWebSocket queue message lifecycle, bounded enqueue retry/backpressure behavior, close-path serialization, and terminal sender-error fan-out invariants."
read_when:
  - When modifying SafeWebSocket internals (`_enqueue`, `_sender_loop`, `_send_message`, `close`) or queue tuple contracts.
  - When debugging blocked sends, post-failure hangs, unknown queue message types, or inconsistent close ordering.
title: "SafeWebSocket Queue Lifecycle and Close Serialization Reference"
---

# SafeWebSocket Queue Lifecycle and Close Serialization Reference

## Canonical Modules

- `backend/src/api/transport/websocket.py`
- `backend/src/api/transport/sender.py`
- `backend/src/api/transport/protocol.py`
- `tests/backend/test_safe_websocket.py`
- `tests/backend/test_transport_sender.py`

## Queue Message Contract

SafeWebSocket queue items are 4-tuples:

- `(msg_type, data, mode, future)`

`msg_type` constants:

- `json`
- `text`
- `close`

`future` contract:

- producer path (`send_json`/`send_text`/`close`) awaits this future
- sender loop resolves/rejects the same future once message is sent or fails

Any unknown `msg_type` becomes terminal sender error.

## Bounded Backpressure and Retry

Queue is bounded (`asyncio.Queue(maxsize=max_queue_size)`):

- default max size: `256`
- non-positive size rejected at constructor (`ValueError`)

`_enqueue(...)` behavior:

1. checks closed-state unless `allow_closed=True`
2. checks sender-task terminal state and raises stored sender error if dead
3. attempts queue put with timeout (`0.1s`)
4. on timeout retries loop after liveness re-check

Effect:

- prevents unbounded memory growth
- naturally applies backpressure under slow network I/O

## Sender Task Lifecycle

`_ensure_sender_task()` lazily creates one sender task.

`_sender_loop()` serializes all raw websocket writes:

1. dequeue one tuple
2. branch by `msg_type` to `send_json`, `send_text`, or `close`
3. resolve tuple future on success
4. if `close`, break loop after future resolution
5. on send failure, set terminal sender error, reject current future, break
6. finally: mark closed, reject all still-queued futures, signal close event

Critical invariant:

- all pending queued futures are failed on terminal exit (`_drain_pending_queue`) so awaiters never hang indefinitely

## Terminal Error Fan-out

Terminal failure path stores `_sender_error` once.

After failure:

- current in-flight future rejected
- queued futures rejected in drain step
- later sends immediately raise resolved sender exception (`_resolve_sender_exception`)

Fallback exception if no explicit error:

- `RuntimeError("WebSocket sender stopped")`

## Close Semantics

`close(...)` is idempotent:

- if already closed: returns immediately

Two close modes:

1. sender not created yet:
   - direct raw websocket close
   - set close event
2. sender exists:
   - enqueue `close` tuple with `allow_closed=True`
   - sender loop serializes close after prior queued sends
   - if enqueue/flush fails, fallback direct close
   - always wait on `_close_event`

Ordering guarantee:

- queued sends ahead of close are attempted before close frame when sender loop remains healthy

## WebSocketTransportSender Boundary

`WebSocketTransportSender.send(message)`:

- delegates to `websocket.send_json(message)` with default `mode="text"`
- does not swallow exceptions

Implication:

- stream pipeline receives raw transport exceptions and can stop query streaming on disconnect/runtime failures

## Test-Backed Invariants

`test_safe_websocket.py` locks:

- max queue size validation
- bounded backpressure behavior with `max_queue_size=1`
- sender failure drains pending futures + fails future sends
- close flushes queued sends before close
- close without sender loop does direct close
- close idempotency
- unknown queue message type creates terminal error surface

`test_transport_sender.py` locks:

- wrapper forwards payload via `send_json(..., mode="text")`
- wrapper propagates send failures

## Drift Hotspots

1. queue tuple shape changes without sender-loop update break routing/future handling.
2. removing `allow_closed=True` for enqueued close path can deadlock close after `_closed=True`.
3. skipping `_drain_pending_queue` creates silent awaiter hangs after sender-loop crash.
4. changing close-order behavior can break assumptions in query streaming completion logic.
5. converting protocol usage back to raw websocket writes reintroduces concurrent-send races.

## Change Checklist

When touching SafeWebSocket internals:

1. preserve one-sender-loop serialization model
2. preserve bounded queue + retry re-check behavior
3. keep terminal error fan-out to current + queued + future sends
4. keep close idempotent and close-event signaling reliable
5. re-run `tests/backend/test_safe_websocket.py` and `tests/backend/test_transport_sender.py`
