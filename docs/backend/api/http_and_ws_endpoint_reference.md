---
summary: "Backend endpoint reference: FastAPI HTTP routes, WebSocket `/ws` lifecycle and limits, incoming message-to-handler mapping, and route-level validation behavior."
read_when:
  - When adding/changing backend routes, websocket handshake behavior, or message dispatch keys.
  - When debugging endpoint validation failures, healthcheck behavior, or per-connection task limits.
title: "HTTP and WebSocket Endpoint Reference"
---

# HTTP and WebSocket Endpoint Reference

## Router Registration

Registered by `backend/src/api/routes/__init__.py` and attached in `api/app_assembly.py`:

- WebSocket router (`/ws`)
- Transcription router (`/ws/transcription`)
- Runs router (`/api/runs`)
- Artifact router (`/api/artifacts`)
- Embeddings router (`/api/embeddings`)
- Semantic router (`/api/semantic`)

## Dedicated Transcription WebSocket

### `GET /ws/transcription` (WebSocket upgrade)

Owner: `backend/src/api/routes/transcription/router.py:transcription_websocket_endpoint`

Behavior:

- accepts a local STT websocket without the main `/ws` handshake envelope
- immediately emits `{"type":"status","client_id":"<uuid>"}` after accept
- routes text control messages to the active provider session
- routes binary audio frames through `parse_gateway_audio_frame(...)`
- keeps one renderer protocol while backend chooses `stt_provider="nova"` or `stt_provider="openai"`

Renderer-to-backend messages:

- text control: `set_langs`, `start_over`
- binary audio frames: gateway-framed PCM16 audio (`sampleRate` metadata prefix + payload)

Backend-to-renderer messages:

- `status`
- `realtime`
- `utterance_end`
- `error`

OpenAI provider note:

- backend opens `wss://api.openai.com/v1/realtime?model=<openai_realtime_session_model>`
- after connect it sends `session.update`
- `session.update.session.audio.input.transcription.model` uses `openai_realtime_transcription_model`
- audio is resampled to `24000` Hz PCM mono before OpenAI append events

Failure behavior:

- invalid control JSON is ignored with warning
- invalid audio frames are ignored with warning
- unexpected provider/session failures emit websocket `{ "type": "error", "message": "..." }`
- disconnect or provider stream completion closes the route and provider session cleanly

## HTTP Endpoints

### `POST /api/artifacts/`

Owner: `backend/src/api/routes/artifacts/router.py:upload_artifact`

Behavior:

- expects multipart `file`
- stores file via `ArtifactStore.from_config(container.config)`
- response model: `ArtifactUploadResponse`
- returns generated `artifact_id`, content type, byte size, sha256, absolute URL

Failure behavior:

- storage/processing exceptions propagate as HTTP 500 with sanitized detail when needed

### `GET /api/artifacts/{artifact_id}`

Owner: `backend/src/api/routes/artifacts/router.py:get_artifact`

Behavior:

- resolves artifact path/content-type via artifact store
- returns `FileResponse`

Failure behavior:

- unknown artifact -> route raises `HTTPException` from store
- unexpected errors -> HTTP 500 `Artifact lookup failed`

### `POST /api/runs/`

Owner: `backend/src/api/routes/runs/router.py:create_run`

Behavior:

- creates in-memory run state for workspace/agent/query metadata
- enforces per-workspace active run cap (`WINDIE_VM_MAX_ACTIVE_RUNS_PER_WORKSPACE`, default `1`)
- initializes status `awaiting_worker`, control mode `agent_only`
- emits initial `run-created` event

Auth note:

- runs routes require header `x-windie-runs-key`
- when `WINDIE_RUNS_API_KEY` is not set, runs routes fail closed with HTTP `503`

Failure behavior:

- missing backend runs key -> HTTP 503
- missing or invalid request runs key -> HTTP 401
- workspace cap exceeded -> HTTP 409

### `POST /api/runs/workers/heartbeat`

Owner: `backend/src/api/routes/runs/router.py:worker_poll_heartbeat`

Behavior:

- registers worker heartbeat metadata
- may assign one queued run (`assigned_run`) for matching workspace
- returns one-shot `control_commands` for that worker

### `GET /api/runs/{run_id}`

Owner: `backend/src/api/routes/runs/router.py:get_run`

Behavior:

- returns latest run snapshot

Failure behavior:

- unknown run id -> HTTP 404

### `GET /api/runs/{run_id}/events`

Owner: `backend/src/api/routes/runs/router.py:list_run_events`

Behavior:

- returns incremental event window (`seq > after_seq`)
- bounded page size (`limit`: 1..1000)

Failure behavior:

- unknown run id -> HTTP 404

### `POST /api/runs/{run_id}/events`

Owner: `backend/src/api/routes/runs/router.py:ingest_run_event`

Behavior:

- appends worker/backend stream events into run timeline
- updates status (`streaming-complete` -> `completed`, `error` -> `failed`)

Failure behavior:

- unknown run id -> HTTP 404

### `POST /api/runs/{run_id}/control`

Owner: `backend/src/api/routes/runs/router.py:control_run`

Behavior:

- applies control action (`pause`, `resume`, `stop`, `set-control-mode`)
- queues control command for worker pickup
- appends `run-control` timeline event

Failure behavior:

- unknown run id -> HTTP 404
- missing `control_mode` on `set-control-mode` -> HTTP 422

### `POST /api/runs/stop-all`

Owner: `backend/src/api/routes/runs/router.py:stop_all_runs`

Behavior:

- bulk-stops active runs (optionally filtered by workspace)
- queues `stop` control command per stopped run

### `POST /api/runs/{run_id}/worker-dispatched`

Owner: `backend/src/api/routes/runs/router.py:worker_dispatched`

Behavior:

- worker ack after dispatching query to backend websocket loop
- stores `query_message_id` (`turn_ref`) and updates status to `running`

Failure behavior:

- unknown run id or worker mismatch -> HTTP 404

### `POST /api/embeddings/`

Owner: `backend/src/api/routes/memory/embeddings/router.py:generate_embedding`

Request model (`EmbeddingRequest`):

- `text`: 1..8192 chars
- `model_name`: 1..128 chars (defaults to `default`)

Behavior:

- uses `container.embedding_router.embed_text(...)`
- converts vector to JSON list
- response model includes vector, model name, and dimension
- emits route-level start/success/failure logs with request char count, model, duration, and result dimension so origin-vs-tunnel debugging can confirm whether the request reached FastAPI

Failure behavior:

- no embedder: HTTP 503
- other failures: HTTP 500 with sanitized detail

### `GET /api/embeddings/health`

Owner: `backend/src/api/routes/memory/embeddings/router.py:health_check`

Behavior:

- checks embedder existence
- performs test embedding on `"test"`
- returns canonical healthy/unhealthy payload shape

### `POST /api/semantic/summarize`

Owner: `backend/src/api/routes/memory/semantic/router.py:summarize_conversations`

Request model (`SummarizeRequest`):

- `conversations`: 1..100 items
- each conversation <= 32768 chars
- `user_id`: non-empty, cannot be `default_user`, and must match authenticated install identity

Behavior:

- requires authenticated install identity before service execution
- builds `SemanticSummarizationService` through `_build_semantic_service()`
- resolves provider client via backend config/API-key path
- parses/fallback-extracts semantic facts
- returns `summary`, `facts[]`, `success=true`
- emits route-level start/success/failure logs with user id, request size metadata, fact count, and duration so backend logs show whether summarize/title requests reached the origin app

### `POST /api/semantic/title`

Owner: `backend/src/api/routes/memory/semantic/router.py:generate_conversation_title`

Request model (`GenerateTitleRequest`):

- `user_id`: non-empty and cannot be `default_user`
- `user_message`: 1..32768 chars
- `assistant_message`: 1..32768 chars
- `model_id`: optional model override
- `model_provider`: optional provider override

Behavior:

- requires authenticated install identity and rejects body `user_id` mismatches
- builds `SemanticSummarizationService` through `_build_semantic_service()`
- resolves config from matching session or container defaults
- applies optional override model/provider
- generates one short title string
- returns `title`, `success=true`
- emits route-level start/success/failure logs with user id, user/assistant message sizes, title length, and duration so backend logs show whether title generation reached the origin app

### `GET /api/semantic/health`

Owner: `backend/src/api/routes/memory/semantic/router.py:health_check`

Behavior:

- verifies container LLM client availability
- returns canonical health payload

## WebSocket Endpoint: `/ws`

Owner: `backend/src/api/routes/websocket/router.py:websocket_endpoint`

### Handshake

First frame must be handshake JSON matching `HandshakeMessage`.

- field: `user_id`
- failures (validation/JSON/object root) close with code `1008`

### Connection Runtime Limits

Values pulled from `session_manager.config`:

- `websocket_max_message_size`
- `websocket_max_concurrent_tasks`
- `websocket_receive_timeout`
- `websocket_task_cancellation_timeout`

Enforcement points:

- raw frame size check in `parse_and_validate_message(...)`
- per-connection task cap in `TaskManager.create_task_if_under_limit(...)`
- receive timeout (`asyncio.wait_for`) closes idle connection with code `1008`

### Message Parse/Validation Path

1. parse JSON object payload (`parse_json_object_payload`)
2. inject connection user_id into payload
3. validate discriminated union `IncomingMessage`
4. dispatch by `message.type` through handler registry

Client parse errors are returned as canonical websocket `error` messages.

### Incoming Message -> Handler Key Map

Canonical map (`core/container/incoming_routing.py`):

- `query` -> `query_handler`
- `stop-query` -> `stop_query_handler`
- `rehydrate-conversation` -> `rehydrate_conversation_handler`
- `tool-result` -> `tool_result_handler`
- `tool-bundle-result` -> `tool_result_handler`
- `wakeword-detected` -> `wakeword_handler`
- `list-models` -> `list_models_handler`
- `load-settings` -> `load_settings_handler`
- `update-settings` -> `update_settings_handler`
- `compact-history` -> `compact_history_handler`

The route table is validated against incoming schema literals at startup.

## Important Handler Behaviors at API Surface

- `query`: registers active task by turn_ref, executes stream pipeline, clears task in `finally`.
- `stop-query`: cancels active query task and emits `stop-query-ack` control traffic.
  - `StopQueryPayload.conversation_ref` and `turn_ref` scope cancellation to the intended active turn when supplied.
- `update-settings`: only client settings patch keys are applied to per-session config
  (`model_mode`, `model_provider`, `selected_model_id`, `interaction_mode`,
  `speech_mode_enabled`, `wakeword_enabled`, `wakeword_stt_enabled`,
  `include_query_screenshot`, `provider_api_keys`).
- `compact-history`: runs manual conversation-history compaction when no active query is running,
  emits `context-compaction-started` (if a run starts) and `context-compaction-completed`
  (applied or skipped with `skipped_reason`).
- `tool-result`/`tool-bundle-result`: silently drop stale results when session no longer exists.

## Disconnect and Cleanup Semantics

On disconnect or websocket loop failure:

1. `TaskManager.cleanup(user_id)` cancels active handler tasks with timeout.
2. `SessionManager.end_session(user_id)` cleans runtime and removes user lock/session entries.

This guarantees task/session cleanup even for abrupt client disconnects.
