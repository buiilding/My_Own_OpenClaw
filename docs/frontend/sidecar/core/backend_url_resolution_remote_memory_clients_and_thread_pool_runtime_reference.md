---
summary: "Deep reference for sidecar core connectivity/runtime helpers: backend HTTP URL env precedence, remote embedding/semantic/title client request contracts, shared base-client lifecycle semantics, and singleton thread-pool reuse/shutdown behavior."
read_when:
  - When changing `core/backend_config.py`, `core/remote_api_client_base.py`, `core/remote_embedding_client.py`, `core/remote_semantic_client.py`, `core/remote_title_client.py`, or `core/thread_pool.py`.
  - When debugging backend URL drift, memory client HTTP errors, title client failures, base-client error wrappers, or thread-pool reuse/shutdown behavior.
title: "Backend URL Resolution, Remote Memory Clients, and Thread-Pool Runtime Reference"
---

# Backend URL Resolution, Remote Memory Clients, and Thread-Pool Runtime Reference

## Canonical Modules

- `frontend/src/main/python/core/backend_config.py`
- `frontend/src/main/python/core/remote_api_client_base.py`
- `frontend/src/main/python/core/remote_embedding_client.py`
- `frontend/src/main/python/core/remote_semantic_client.py`
- `frontend/src/main/python/core/remote_title_client.py`
- `frontend/src/main/python/core/thread_pool.py`
- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/summarizer.py`
- `tests/sidecar/test_backend_config.py`
- `tests/sidecar/test_remote_embedding_client.py`
- `tests/sidecar/test_remote_semantic_client.py`
- `tests/sidecar/test_remote_title_client.py`
- `tests/sidecar/remote_client_test_utils.py`
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

## Remote Title Client Contract

`RemoteTitleClient` endpoint:

- `POST {backend_url}/api/semantic/title`

Request payload:

- required fields: `user_id`, `user_message`, `assistant_message`
- optional fields (`model_id`, `model_provider`) included only when trimmed non-empty

Response handling:

- requires HTTP 200
- requires `success == true`
- title normalizes to trimmed string, with `None`/missing falling back to `""`
- non-200 raises status-text exception
- `aiohttp.ClientError` mapped to "Failed to connect to title service"

Timeout:

- configurable via ctor `timeout_seconds` (default `45`)

## HTTP Session Lifecycle Pattern

All remote memory clients follow same lifecycle:

- `initialize()` creates one shared `ClientSession` only when absent
- `close()` closes session and resets to `None`
- API methods lazy-initialize when needed

This pattern avoids per-request session creation overhead while keeping explicit shutdown path.

Shared-base note:

- semantic/title clients route request/timeout/success/error handling through `RemoteApiClientBase._post_success_json(...)`
- embedding client currently uses a parallel/manual path (does not inherit the base yet)

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

`tests/sidecar/test_remote_title_client.py` verifies:

- payload shape with/without model/provider overrides
- URL normalization and timeout propagation
- blank/null title normalization
- non-200, success-false, and network-error exception semantics
- initialize/close reuse/reset behavior

`tests/sidecar/test_thread_pool.py` verifies:

- singleton reuse across repeated `get_executor` calls
- shutdown wait argument forwarding
- no-op shutdown when uninitialized
- new executor creation after shutdown

## Drift Hotspots

1. changing backend URL env precedence can silently redirect memory clients to wrong backend instance.
2. dropping trailing-slash normalization can build malformed doubled-slash endpoint URLs.
3. replacing singleton thread-pool reuse with per-call executors can increase thread churn and shutdown complexity.
4. weakening remote-client error wrapping can leak inconsistent exception surfaces to memory-store/summarizer/title-generation callers.

## Related Pages

- [Frontend Sidecar Core Docs Hub](README.md)
- [Remote API Client Base Session Lifecycle, Timeout, and Error-Wrapper Contract Reference](remote_api_client_base_session_lifecycle_timeout_and_error_wrapper_contract_reference.md)
- [Remote Embedding Client Health-Probe, Dimension, and Error-Surface Contract Reference](remote_embedding_client_health_probe_dimension_and_error_surface_contract_reference.md)
- [JSON-RPC Protocol, Stdout Framing, and Shutdown Signal Runtime Reference](json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md)
- [Memory Pipeline and Summarization](../memory_pipeline_and_summarization.md)
