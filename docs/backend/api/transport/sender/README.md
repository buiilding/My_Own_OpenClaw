---
summary: "Backend API transport sender docs sub-hub for SafeWebSocket queue lifecycle, close-serialization guarantees, and WebSocketTransportSender protocol seam behavior."
read_when:
  - When changing `backend/src/api/transport/websocket.py` queue/backpressure/close behavior.
  - When debugging sender-loop failure fan-out, pending future hangs, or transport wrapper error propagation.
title: "Backend API Transport Sender Docs Hub"
---

# Backend API Transport Sender Docs Hub

## Deep Pages

- [SafeWebSocket Queue Lifecycle and Close Serialization Reference](safe_websocket_queue_lifecycle_and_close_serialization_reference.md)

## Related Pages

- [Backend API Transport Docs Hub](../README.md)
- [Safe WebSocket and Transport Envelope Reference](../safe_websocket_and_transport_envelope_reference.md)

## Code Scope

- `backend/src/api/transport/websocket.py`
- `backend/src/api/transport/sender.py`
- `backend/src/api/transport/protocol.py`
- `tests/backend/test_safe_websocket.py`
- `tests/backend/test_transport_sender.py`
