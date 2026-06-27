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
- [API WebSocket Docs Hub](websocket/README.md)
- [WebSocket Message Parse, Validation Guard, and Task-Scheduling Reference](websocket/websocket_message_parse_validation_guard_and_task_scheduling_reference.md)

## Router Surface

Registered routers (`api/routes/__init__.py`):

- WebSocket router: `api/routes/websocket`
- Runs router: `api/routes/runs`
- Artifacts router: `api/routes/artifacts`
- Embeddings router: `api/routes/memory/embeddings`
- Semantic summarization router: `api/routes/memory/semantic`

## REST Endpoints

### Artifacts

- `POST /api/artifacts/`: multipart upload, size-limited local disk storage
- `GET /api/artifacts/{artifact_id}`: strict-ID validated retrieval

Implementation:

- `api/routes/artifacts/router.py`
- `services/artifacts/store.py`

### Embeddings

- `POST /api/embeddings/`: text embedding generation
- `GET /api/embeddings/health`: embedding provider readiness

Implementation:

- `api/routes/memory/embeddings/router.py`

### Semantic Summarization

- `POST /api/semantic/summarize`: summarize conversation text list into summary/facts
- `POST /api/semantic/title`: generate a concise conversation title from first user/assistant turn
- `GET /api/semantic/health`: llm-client health for semantic service

Implementation:

- `api/routes/memory/semantic/router.py`

### Runs / VM Control

- `POST /api/runs/`: create run request for workspace queue
- `POST /api/runs/workers/heartbeat`: worker poll + assignment + pending control commands
- `POST /api/runs/{run_id}/worker-dispatched`: worker dispatch acknowledgment
- `POST /api/runs/{run_id}/events`: run event ingest (worker/backend stream relay)
- `POST /api/runs/{run_id}/control`: run control command enqueue
- `POST /api/runs/stop-all`: bulk stop active runs
- `GET /api/runs/{run_id}` + `GET /api/runs/{run_id}/events`: run state/event polling

Implementation:

- `api/routes/runs/router.py`
- `services/vm_run_control.py`

Runtime notes:

- required auth header: `x-windie-runs-key`
- expected key resolved from `WINDIE_RUNS_API_KEY`
- missing backend runs key returns HTTP `503`
- service instance is app-state scoped (`request.app.state.vm_run_control_service`) and lazily initialized

## WebSocket Lifecycle

Entrypoint:

- `api/routes/websocket/router.py` + helpers in `connection.py`, `message_handler.py`, `task_manager.py`

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
- `compact-history`

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
- Compact-history handler

## Outgoing Event Contract

Typed outgoing schemas in `api/schemas/outgoing.py` include:

- Stream events: `llm-thought`, `streaming-response`, `streaming-complete`
- Tool events: `tool-call`, `tool-bundle`, `tool-output`
- Transparency events: `system-prompt`, `tool-schemas`, `user-message-full`, `assistant-message-full`
- Runtime events: `token-count`, `audio-chunk`, errors

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

`QueryExecutionService` runtime helpers are split under `api/services/query_execution_support/*` for:

- screenshot/input resolution
- runtime system-state application
- completion backfill
- cancellation-side cleanup

## Transport Guarantees and Safety

- `SafeWebSocket` centralizes write-path reliability.
- Message parsing includes size checks and object-root validation.
- Task manager prunes completed tasks, caps concurrent tasks, and cancels cleanup on disconnect.
- Error responses are standardized and sanitized (`api/infrastructure/errors.py`).
