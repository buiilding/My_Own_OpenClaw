---
summary: "WebSocket and REST backend contracts: routers, message schemas, handler routing, stream formatting, and transport guarantees."
read_when:
  - When adding/changing API message types or handlers.
  - When debugging websocket parsing, task limits, or streaming event formatting.
title: "API and Transport"
---

# API and Transport

Transport deep reference:

- [Safe WebSocket and Transport Envelope Reference](transport/safe_websocket_and_transport_envelope_reference.md)
- [Transport Sender Docs Hub](transport/sender/README.md)
- [SafeWebSocket Queue Lifecycle and Close Serialization Reference](transport/sender/safe_websocket_queue_lifecycle_and_close_serialization_reference.md)

## Router Surface

Registered routers (`api/routes/__init__.py`):

- WebSocket router: `api/routes/websocket`
- Artifacts router: `api/routes/artifacts`
- Embeddings router: `api/routes/memory/embeddings`
- Semantic summarization router: `api/routes/memory/semantic`

## REST Endpoints

### Artifacts

- `POST /api/artifacts/`: multipart upload, size-limited local disk storage
- `GET /api/artifacts/{artifact_id}`: strict-ID validated retrieval

Implementation:

- `api/routes/artifacts.py`
- `services/artifacts/store.py`

### Embeddings

- `POST /api/embeddings/`: text embedding generation
- `GET /api/embeddings/health`: embedding provider readiness

Implementation:

- `api/routes/memory/embeddings.py`

### Semantic Summarization

- `POST /api/semantic/summarize`: summarize conversation text list into summary/facts
- `GET /api/semantic/health`: llm-client health for semantic service

Implementation:

- `api/routes/memory/semantic.py`

## WebSocket Lifecycle

Entrypoint:

- `api/routes/websocket/__init__.py` + helpers in `connection.py`, `message_handler.py`, `task_manager.py`

Lifecycle:

1. Accept connection and run handshake.
2. Parse first frame as `HandshakeMessage`, derive `user_id`.
3. Wrap socket with `SafeWebSocket` for serialized safe sends.
4. Create `TaskManager` for per-connection concurrency control.
5. For each message: parse JSON, validate schema, route to handler.
6. On disconnect/error: cancel pending tasks and end user session.

## Incoming Message Contract

Discriminated union defined in `api/schemas/incoming.py`:

- `query`
- `stop-query`
- `rehydrate-conversation`
- `tool-result`
- `tool-bundle-result`
- `wakeword-detected`
- `list-models`
- `load-settings`
- `update-settings`

Routing table is canonical in `core/container/incoming_routing.py` and must match schema literals.

## Handler Registry

Registry is built by `ApiContainer` (`core/container/api_container.py`) and includes:

- Query handler
- Stop-query handler
- Rehydrate-conversation handler
- Tool-result handler (single + bundle)
- Wakeword handler
- List-models handler
- Load-settings handler
- Update-settings handler

## Outgoing Event Contract

Typed outgoing schemas in `api/schemas/outgoing.py` include:

- Stream events: `llm-thought`, `streaming-response`, `streaming-complete`
- Tool events: `tool-call`, `tool-bundle`, `tool-output`
- Transparency events: `system-prompt`, `tool-schemas`, `user-message-full`, `assistant-message-full`
- Runtime events: `token-count`, `memory-store`, `audio-chunk`, errors

Formatting flow:

- Event objects from agent runtime are converted by `api/processing/formatter.py`
- Formatter dispatch table uses registry specs from `api/contracts/formatter_specs.py`

## Query Streaming Pipeline

Query handler delegates to `QueryExecutionService` then `StreamPipeline`:

- Build stream context once per query (session/user/turn metadata)
- Process each agent event
- Send formatted payload via `WebSocketTransportSender`
- Process TTS asynchronously in parallel without blocking text streaming
- Flush pending TTS tasks before stream close

## Transport Guarantees and Safety

- `SafeWebSocket` centralizes write-path reliability.
- Message parsing includes size checks and object-root validation.
- Task manager prunes completed tasks, caps concurrent tasks, and cancels cleanup on disconnect.
- Error responses are standardized and sanitized (`api/infrastructure/errors.py`).
