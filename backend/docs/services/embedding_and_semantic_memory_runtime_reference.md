---
summary: "Backend memory-service runtime reference: embedding provider lifecycle, provider-routed `/api/embeddings` behavior, semantic summarization pipeline, parser/fallback rules, and config-driven inference rebind semantics."
read_when:
  - When changing embedding model/config behavior, memory-enabled toggles, or embedding/semantic route contracts.
  - When debugging semantic summary quality regressions, embedding service unavailability, or startup latency from model initialization.
title: "Embedding and Semantic Memory Runtime Reference"
---

# Embedding and Semantic Memory Runtime Reference

## Canonical Modules

- `backend/src/embeddings/embeddings.py`
- `backend/src/api/routes/memory/embeddings/router.py`
- `backend/src/api/routes/memory/semantic/router.py`
- `backend/src/api/routes/memory/semantic/service.py`
- `backend/src/api/routes/memory/semantic/parser.py`
- `backend/src/api/routes/memory/health.py`
- `backend/src/core/container/memory_container.py`
- `backend/src/core/container/factories.py`
- `backend/src/core/container/initializer.py`
- `backend/src/core/container/config_updater.py`
- `backend/src/core/config/models.py`
- `frontend/src/main/python/core/remote_semantic_client.py`

## Config and DI Ownership

Memory-related config fields in `AppConfig`:

- `memory_enabled` (default `true`)
- `embedding_backend` (default `"vendor"`)
- `embedding_model` (default `"text-embedding-3-small"`)
- `ocr_backend` (default `"local"`)
- `ocr_model` (default `"rapidocr-ppocrv5-server"`)
- `vision_backend` (default `"local"`)
- `vision_model_name` (default `"OpenGVLab/InternVL3_5-4B"`)

DI ownership:

- `MemoryContainer.embedder` is a singleton created by `_create_embedder(...)`
- `ApplicationContainer.embedding_router` exposes the embedding capability boundary used by routes and local-runtime consumer health probes
- if `memory_enabled` is false, factory returns `None`
- if `embedding_backend == "vendor"`, the backend creates an OpenAI embedding provider using `embedding_api_key_env`
- if `embedding_backend == "remote-http"`, the backend calls `embedding_remote_service_url`
- local provider device selection prefers `cuda`, then `mps`, then `cpu`

Runtime startup:

- `ContainerInitializer` runs the `embedding_router` startup step, which eagerly calls `await embedder.initialize()` when available
- model loading therefore happens during backend startup (not first request)

Config updates:

- `ContainerConfigUpdater.update_config(...)` recreates embedding/OCR/vision providers when capability config changes
- routers stay stable while their underlying providers are rebound capability-by-capability
- when memory is disabled, `container.embedding_router` is rebound to `None`

## Embedding Provider Runtime (`SentenceTransformerProvider`)

Provider characteristics:

- async one-time initialization guarded by `asyncio.Lock` (`_init_lock`)
- model encode operations run through `_run_blocking(...)` to avoid event-loop blocking
- pytest environment disables executor offload for deterministic tests

Caching behavior:

- optional cache manager integration (`cache_manager.embeddings`)
- single-text path caches by `get_embedding_key(text)`
- batch path splits cached vs uncached texts, encodes uncached subset, then reorders by original index

Failure semantics:

- calling `embed_text`/`embed_batch` before initialization raises `RuntimeError`
- `dimension` property raises if model was not initialized

## `/api/embeddings` Endpoint Contract

Route: `POST /api/embeddings/`

Request constraints:

- `text`: 1..8192 chars
- `model_name`: 1..128 chars (currently metadata hint only)

Execution path:

1. resolve `container.embedding_router`
2. return `503` if unavailable
3. `await embedder.embed_text(text)`
4. normalize embedding to JSON-safe list
5. return:
   - `embedding`
   - `provider_id`
   - `model_id`
   - `model_name`
   - `dimension`
   - `embedding_space_version`

`embedding_space_version` uses provider/model identity plus the live returned
vector dimension. The dimension component is derived from the serialized vector
or health probe result, not blindly from provider metadata, so sidecar FAISS
compatibility checks match the actual vector shape.

Error behavior:

- expected unavailability -> `503`
- unexpected failures -> `500` sanitized message (`"Embedding generation failed: An internal error occurred"`)

## Internal `/embed` Service Contract

The standalone embedding service (`backend/src/embeddings/service_app.py`) is
used behind remote embedding deployments. `POST /embed` requires the internal
`x-windie-embedding-key` header to match `WINDIE_EMBEDDING_SERVICE_API_KEY`.
If that env var is unset, the route fails closed with `503` before provider
execution. Missing credentials return `401`; mismatched credentials return
`403`.

It accepts a batch payload:

- `texts`: 1..256 strings
- each string: 1..8192 chars
- total request text: max 65536 chars
- response `embeddings` must contain exactly one vector per submitted text

Oversized payloads fail FastAPI/Pydantic validation before queue acquisition or
provider execution.

Health route: `GET /api/embeddings/health`

- returns `unhealthy` when embedder missing
- performs real probe `embed_text("test")`
- returns provider/model identity + computed dimension + `embedding_space_version` on success
- wraps unexpected exceptions through `safe_health_check(...)`

## Semantic Summarization Runtime

Route: `POST /api/semantic/summarize`

Request constraints:

- `conversations`: 1..100 list entries
- each conversation max length `32768`
- `user_id` validated with shared `validate_user_id(...)` guard (rejects empty/whitespace/`default_user`) and checked against authenticated install identity

Auth behavior:

- missing authenticated install identity returns `401`
- body `user_id` mismatch returns `403`
- summarization/title service calls use the authenticated identity after validation

Service flow (`SemanticSummarizationService.summarize`):

1. resolve effective config:
   - active session config when user session exists
   - otherwise global container config
2. if non-local mode without key, load provider API key via `load_api_key_for_provider(...)`
3. create llm client from resolved config
4. build single prompt from merged conversations (`---` delimiters)
5. request completion with `selected_model_id`
6. parse structured summary/facts
7. apply fallback rules when parsing fails

Response:

- `summary`
- `facts[]`
- `success=true`

## Semantic Parser and Fallback Rules

Primary parse (`parse_summarization_response(...)`):

- summary regex targets `SUMMARY:` block (markdown headings/markers tolerated)
- facts parser targets `FACTS:` section and bullet lines (`-` or `*`)

Fallback behavior:

- if summary missing: first 500 chars of raw model response (or fixed failure string)
- if facts missing: secondary bullet extraction over full response (`extract_fallback_facts`)

Failure semantics:

- explicit route/service `HTTPException` preserved
- other exceptions map to `500` with sanitized `"Summarization failed: An internal error occurred"`

## Health and Reliability Utilities

Shared helper `safe_health_check(...)`:

- executes provided check coroutine
- on unexpected exception logs with prefix
- returns canonical unhealthy payload instead of raising

Used by both embeddings and semantic health routes.

## Frontend/Sidecar Consumption Path

Frontend runtimes consume backend memory services through owned boundaries:

- SDK embedding client -> `POST /api/embeddings/`
- `RemoteSemanticClient` -> `POST /api/semantic/summarize`

Operational implications:

- backend embedder unavailability (`503`) disables local-runtime semantic memory indexing quality
- semantic route timeout/failure impacts the local-runtime memory summarization pipeline

## Debug Checklist

If embeddings fail only after config updates:

1. verify `memory_enabled` remained true
2. verify embedder was rebound in `ContainerConfigUpdater`
3. verify re-created embedder was initialized before use

If semantic summaries are empty or low quality:

1. inspect raw model output format against parser expectations (`SUMMARY:` + `FACTS:`)
2. confirm effective session/global model/provider selection
3. inspect fallback summary/facts logs for parser misses

If health says unhealthy but startup succeeded:

1. verify embedder still present on container (not disabled by config update)
2. verify sentence-transformers dependencies available on runtime host
3. verify semantic route has usable LLM client config and API key for online mode
