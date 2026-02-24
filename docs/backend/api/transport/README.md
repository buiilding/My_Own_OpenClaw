---
summary: "Backend API transport docs sub-hub for SafeWebSocket queue semantics, WebSocketSender protocol boundary, and transport envelope/context attachment behavior."
read_when:
  - When changing websocket send-path concurrency or transport error propagation behavior.
  - When debugging missing/out-of-order outbound events, sender backpressure stalls, or context-field envelope drift.
title: "Backend API Transport Docs Hub"
---

# Backend API Transport Docs Hub

## Deep Pages

- [Safe WebSocket and Transport Envelope Reference](safe_websocket_and_transport_envelope_reference.md)

## Code Scope

- `backend/src/api/transport/websocket.py`
- `backend/src/api/transport/protocol.py`
- `backend/src/api/transport/sender.py`
- `backend/src/api/transport/envelope.py`
- `backend/src/api/infrastructure/errors.py`
- `backend/src/api/processing/formatter.py`
- `backend/src/api/services/query_execution.py`
- `tests/backend/test_safe_websocket.py`
- `tests/backend/test_transport_sender.py`
- `tests/backend/test_transport_envelope.py`
