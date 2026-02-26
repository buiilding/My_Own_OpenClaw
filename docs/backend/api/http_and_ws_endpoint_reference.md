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
- Artifact router (`/api/artifacts`)
- Embeddings router (`/api/embeddings`)
- Semantic router (`/api/semantic`)

## HTTP Endpoints

### `POST /api/artifacts/`

Owner: `backend/src/api/routes/artifacts.py:upload_artifact`

Behavior:

- expects multipart `file`
- stores file via `ArtifactStore.from_config(container.config)`
- response model: `ArtifactUploadResponse`
- returns generated `artifact_id`, content type, byte size, sha256, absolute URL

Failure behavior:

- storage/processing exceptions propagate as HTTP 500 with sanitized detail when needed

### `GET /api/artifacts/{artifact_id}`

Owner: `backend/src/api/routes/artifacts.py:get_artifact`

Behavior:

- resolves artifact path/content-type via artifact store
- returns `FileResponse`

Failure behavior:

- unknown artifact -> route raises `HTTPException` from store
- unexpected errors -> HTTP 500 `Artifact lookup failed`

### `POST /api/embeddings/`

Owner: `backend/src/api/routes/memory/embeddings.py:generate_embedding`

Request model (`EmbeddingRequest`):

- `text`: 1..8192 chars
- `model_name`: 1..128 chars (defaults to `default`)

Behavior:

- uses `container.embedder.embed_text(...)`
- converts vector to JSON list
- response model includes vector, model name, and dimension

Failure behavior:

- no embedder: HTTP 503
- other failures: HTTP 500 with sanitized detail

### `GET /api/embeddings/health`

Owner: `backend/src/api/routes/memory/embeddings.py:health_check`

Behavior:

- checks embedder existence
- performs test embedding on `"test"`
- returns canonical healthy/unhealthy payload shape

### `POST /api/semantic/summarize`

Owner: `backend/src/api/routes/memory/semantic.py:summarize_conversations`

Request model (`SummarizeRequest`):

- `conversations`: 1..100 items
- each conversation <= 32768 chars
- `user_id`: non-empty and cannot be `default_user`

Behavior:

- builds `SemanticSummarizationService`
- resolves provider client via backend config/API-key path
- parses/fallback-extracts semantic facts
- returns `summary`, `facts[]`, `success=true`

### `POST /api/semantic/title`

Owner: `backend/src/api/routes/memory/semantic.py:generate_conversation_title`

Request model (`GenerateTitleRequest`):

- `user_id`: non-empty and cannot be `default_user`
- `user_message`: 1..32768 chars
- `assistant_message`: 1..32768 chars
- `model_id`: optional model override
- `model_provider`: optional provider override

Behavior:

- builds `SemanticSummarizationService`
- resolves config from matching session or container defaults
- applies optional override model/provider
- generates one short title string
- returns `title`, `success=true`

### `GET /api/semantic/health`

Owner: `backend/src/api/routes/memory/semantic.py:health_check`

Behavior:

- verifies container LLM client availability
- returns canonical health payload

## WebSocket Endpoint: `/ws`

Owner: `backend/src/api/routes/websocket/__init__.py:websocket_endpoint`

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
- `stop-query`: cancels active query task and always emits `streaming-complete`.
- `update-settings`: only frontend-owned patch keys are applied to per-session config
  (`model_mode`, `model_provider`, `selected_model_id`, `interaction_mode`,
  `voice_mode_enabled`, `speech_mode_enabled`, `wakeword_stt_enabled`, `include_query_screenshot`).
- `compact-history`: runs manual conversation-history compaction when no active query is running,
  emits `context-compaction-started` (if a run starts) and `context-compaction-completed`
  (applied or skipped with `skipped_reason`).
- `tool-result`/`tool-bundle-result`: silently drop stale results when session no longer exists.

## Disconnect and Cleanup Semantics

On disconnect or websocket loop failure:

1. `TaskManager.cleanup(user_id)` cancels active handler tasks with timeout.
2. `SessionManager.end_session(user_id)` cleans runtime and removes user lock/session entries.

This guarantees task/session cleanup even for abrupt client disconnects.
