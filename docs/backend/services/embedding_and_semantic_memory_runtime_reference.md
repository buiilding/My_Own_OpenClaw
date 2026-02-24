---
summary: "Backend memory-service runtime reference: embedding provider lifecycle, `/api/embeddings` behavior, semantic summarization pipeline, parser/fallback rules, and config-driven embedder rebind semantics."
read_when:
  - When changing embedding model/config behavior, memory-enabled toggles, or embedding/semantic route contracts.
  - When debugging semantic summary quality regressions, embedding service unavailability, or startup latency from model initialization.
title: "Embedding and Semantic Memory Runtime Reference"
---

# Embedding and Semantic Memory Runtime Reference

## Canonical Modules

- `backend/src/embeddings/embeddings.py`
- `backend/src/api/routes/memory/embeddings.py`
- `backend/src/api/routes/memory/semantic.py`
- `backend/src/api/routes/memory/semantic_service.py`
- `backend/src/api/routes/memory/semantic_parser.py`
- `backend/src/api/routes/memory/health.py`
- `backend/src/core/container/memory_container.py`
- `backend/src/core/container/factories.py`
- `backend/src/core/container/initializer.py`
- `backend/src/core/container/config_updater.py`
- `backend/src/core/config/models.py`
- `frontend/src/main/python/core/remote_embedding_client.py`
- `frontend/src/main/python/core/remote_semantic_client.py`

## Config and DI Ownership

Memory-related config fields in `AppConfig`:

- `memory_enabled` (default `true`)
- `embedding_model` (default `"all-MiniLM-L6-v2"`)

DI ownership:

- `MemoryContainer.embedder` is a singleton created by `_create_embedder(...)`
- if `memory_enabled` is false, factory returns `None`
- device selection prefers `cuda`, then `mps`, then `cpu`

Runtime startup:

- `ContainerInitializer._initialize_embedder()` eagerly calls `await embedder.initialize()` when available
- model loading therefore happens during backend startup (not first request)

Config updates:

- `ContainerConfigUpdater.update_config(...)` recreates embedder provider when memory remains enabled
- when memory is disabled, `container.embedder` is set to `None`

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

1. resolve `container.embedder`
2. return `503` if unavailable
3. `await embedder.embed_text(text)`
4. normalize embedding to JSON-safe list
5. return `embedding`, `model_name`, `dimension`

Error behavior:

- expected unavailability -> `503`
- unexpected failures -> `500` sanitized message (`"Embedding generation failed: An internal error occurred"`)

Health route: `GET /api/embeddings/health`

- returns `unhealthy` when embedder missing
- performs real probe `embed_text("test")`
- returns model name + computed dimension on success
- wraps unexpected exceptions through `safe_health_check(...)`

## Semantic Summarization Runtime

Route: `POST /api/semantic/summarize`

Request constraints:

- `conversations`: 1..100 list entries
- each conversation max length `32768`
- `user_id` validated with shared `validate_user_id(...)` guard (rejects empty/whitespace/`default_user`)

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

Frontend Python sidecar uses backend HTTP APIs directly:

- `RemoteEmbeddingClient` -> `POST /api/embeddings/`
- `RemoteSemanticClient` -> `POST /api/semantic/summarize`

Operational implications:

- backend embedder unavailability (`503`) disables sidecar semantic memory indexing quality
- semantic route timeout/failure impacts periodic summarization pipeline in sidecar memory service

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
