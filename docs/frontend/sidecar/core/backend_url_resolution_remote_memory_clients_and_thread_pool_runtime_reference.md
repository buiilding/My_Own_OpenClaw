---
summary: "Deep reference for sidecar core connectivity/runtime helpers: backend HTTP URL env precedence, remote embedding/semantic client request contracts, session lifecycle + timeout defaults, and singleton thread-pool reuse/shutdown semantics."
read_when:
  - When changing `core/backend_config.py`, `core/remote_embedding_client.py`, `core/remote_semantic_client.py`, or `core/thread_pool.py`.
  - When debugging backend URL drift, memory client HTTP errors, or thread-pool reuse/shutdown behavior.
title: "Backend URL Resolution, Remote Memory Clients, and Thread-Pool Runtime Reference"
---

# Backend URL Resolution, Remote Memory Clients, and Thread-Pool Runtime Reference

## Canonical Modules

- `frontend/src/main/python/core/backend_config.py`
- `frontend/src/main/python/core/remote_embedding_client.py`
- `frontend/src/main/python/core/remote_semantic_client.py`
- `frontend/src/main/python/core/thread_pool.py`
- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/summarizer.py`
- `tests/sidecar/test_backend_config.py`
- `tests/sidecar/test_remote_embedding_client.py`
- `tests/sidecar/test_remote_semantic_client.py`
- `tests/sidecar/test_thread_pool.py`

## Backend HTTP URL Resolution

`get_backend_http_url()` resolution order:

1. `WINDIE_BACKEND_HTTP_URL`
2. `BACKEND_HTTP_URL`
3. default `http://127.0.0.1:8765`

Normalization:

- trailing slash(es) stripped with `rstrip("/")`
- internal path slashes preserved (for example `/api/v1`)

## Remote Embedding Client Contract

`RemoteEmbeddingClient` endpoint:

- `POST {backend_url}/api/embeddings/`

Request payload:

- `{"text": <text>, "model_name": "default"}`

Response handling:

- expects HTTP 200 with JSON `embedding` list
- converts to `np.ndarray(dtype=float32)`
- non-200 raises exception with response text
- `aiohttp.ClientError` mapped to "Failed to connect to embedding service"

Operational defaults:

- lazy `ClientSession` initialization
- request timeout total `30s`
- `dimension` property returns constant `384`
- health check uses `GET /api/embeddings/health` and requires `{"status":"healthy"}` + 200

## Remote Semantic Client Contract

`RemoteSemanticClient` endpoint:

- `POST {backend_url}/api/semantic/summarize`

Request payload:

- `{"conversations": [...], "user_id": <id>}`

Response handling:

- requires HTTP 200
- requires `success == true`
- summary/facts normalize to `""` and `[]` when null/missing
- non-200 raises status-text exception
- `aiohttp.ClientError` mapped to "Failed to connect to semantic service"

Timeout:

- configurable via ctor `timeout_seconds` (default `60`)

## HTTP Session Lifecycle Pattern

Both remote clients follow same lifecycle:

- `initialize()` creates one shared `ClientSession` only when absent
- `close()` closes session and resets to `None`
- API methods lazy-initialize when needed

This pattern avoids per-request session creation overhead while keeping explicit shutdown path.

## Thread-Pool Singleton Semantics

`core/thread_pool.py` provides process-global executor:

- `_executor` singleton
- `get_executor(max_workers=10)` creates once and reuses existing instance thereafter
- first creation controls worker-count for that lifecycle
- `shutdown_executor(wait=True)` shuts down and resets singleton

This executor is intended for sidecar-wide blocking/CPU offload reuse.

## Test-Backed Invariants

`tests/sidecar/test_backend_config.py` verifies:

- env precedence and fallback behavior
- trailing-slash normalization
- path preservation semantics

`tests/sidecar/test_remote_embedding_client.py` verifies:

- success ndarray conversion
- endpoint URL normalization (trailing slash stripped)
- error mapping for non-200 and network failures
- health-check true/false behavior
- initialize/close reuse/reset behavior

`tests/sidecar/test_remote_semantic_client.py` verifies:

- success tuple extraction
- null summary/facts normalization defaults
- non-200 and success=false failures
- network error mapping
- initialize/close reuse/reset behavior
- URL normalization and timeout propagation

`tests/sidecar/test_thread_pool.py` verifies:

- singleton reuse across repeated `get_executor` calls
- shutdown wait argument forwarding
- no-op shutdown when uninitialized
- new executor creation after shutdown

## Drift Hotspots

1. changing backend URL env precedence can silently redirect memory clients to wrong backend instance.
2. dropping trailing-slash normalization can build malformed doubled-slash endpoint URLs.
3. replacing singleton thread-pool reuse with per-call executors can increase thread churn and shutdown complexity.
4. weakening remote-client error wrapping can leak inconsistent exception surfaces to memory-store/summarizer callers.

## Related Pages

- [Frontend Sidecar Core Docs Hub](README.md)
- [JSON-RPC Protocol, Stdout Framing, and Shutdown Signal Runtime Reference](json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md)
- [Memory Pipeline and Summarization](../memory_pipeline_and_summarization.md)
