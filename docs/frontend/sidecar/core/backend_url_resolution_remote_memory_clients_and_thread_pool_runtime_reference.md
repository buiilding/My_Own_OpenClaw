---
summary: "Deep reference for sidecar core connectivity/runtime helpers: backend HTTP URL env precedence, remote embedding/semantic/title client request contracts, and bounded interactive/background executor lifecycle behavior."
read_when:
  - When changing `core/backend_config.py`, `core/remote_api_client_base.py`, `core/remote_embedding_client.py`, `core/remote_semantic_client.py`, `core/remote_title_client.py`, or `core/thread_pool.py`.
  - When debugging backend URL drift, memory client HTTP errors, title client failures, base-client error wrappers, or executor routing/reuse/shutdown behavior.
title: "Backend URL Resolution, Remote Memory Clients, and Thread-Pool Runtime Reference"
---

# Backend URL Resolution, Remote Memory Clients, and Thread-Pool Runtime Reference

## Canonical Modules

- `frontend/src/main/python/core/backend_config.py`
- `frontend/src/main/python/core/remote_api_client_base.py`
- `frontend/src/main/python/core/remote_embedding_client.py`
- `frontend/src/main/python/core/remote_semantic_client.py`
- `frontend/src/main/python/core/remote_title_client.py`
- `frontend/src/main/python/core/executors.py`
- `frontend/src/main/python/core/thread_pool.py`
- `frontend/src/main/python/memory/local_store.py`
- `frontend/src/main/python/memory/summarizer.py`
- `tests/sidecar/test_backend_config.py`
- `tests/sidecar/test_remote_embedding_client.py`
- `tests/sidecar/test_remote_semantic_client.py`
- `tests/sidecar/test_remote_title_client.py`
- `tests/sidecar/remote_client_test_utils.py`
- `tests/sidecar/test_executors.py`
- `tests/sidecar/test_thread_pool.py`

## Backend HTTP URL Resolution

`get_backend_http_url()` resolution order:

1. `WINDIE_BACKEND_HTTP_URL`
2. `BACKEND_HTTP_URL`
3. default `https://api.windieos.com`

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

## Executor Routing and Singleton Semantics

`core/executors.py` owns two process-global pools:

- interactive executor (`get_interactive_executor`) for latency-sensitive tool/system-state offloads
- background executor (`get_background_executor`) for memory/index persistence jobs

Worker-count behavior:

- first creation controls worker count for that pool lifecycle
- env overrides:
  - `WINDIE_INTERACTIVE_WORKERS`
  - `WINDIE_BACKGROUND_WORKERS`
- defaults:
  - interactive: macOS `3`, other platforms `4`
  - background: macOS `1`, other platforms `2`

Loop binding:

- sidecar boot binds loop default executor to the interactive pool via `configure_event_loop_default_executor(...)`
- uncategorized `run_in_executor(None, ...)` calls therefore remain bounded

Compatibility:

- `core/thread_pool.get_executor(max_workers=10)` now aliases the background executor for legacy memory paths
- `core/thread_pool.shutdown_executor(...)` shuts down only that background executor

Related runtime knobs:

- `WINDIE_INTERACTIVE_WORKERS`
- `WINDIE_BACKGROUND_WORKERS`
- `WINDIE_SIDECAR_LOG_LEVEL` (default sidecar Python logger level is `WARNING`)
- `WINDIE_VERBOSE_SIDECAR_STDERR=1` (forward all sidecar stderr lines through Electron main; default is severity-filtered forwarding)

## Test-Backed Invariants

`tests/sidecar/test_backend_config.py` verifies:

- env precedence and hosted-default behavior
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

- background-executor singleton compatibility via `core.thread_pool`
- shutdown safety and re-create behavior for legacy imports

`tests/sidecar/test_executors.py` verifies:

- interactive/background singleton behavior and first-call worker-count lock-in
- background shutdown isolation from interactive pool
- loop default-executor binding to interactive pool
- interactive env worker override handling

## Drift Hotspots

1. changing backend URL env precedence can silently redirect memory clients to wrong backend instance.
2. dropping trailing-slash normalization can build malformed doubled-slash endpoint URLs.
3. routing latency-sensitive tool calls through background executors can increase user-visible lag.
4. eager browser tool imports during sidecar startup can increase initial boot latency; keep browser runtime import lazy.
5. duplicate sync+async FAISS index reads during startup can increase local memory bootstrap time.
6. weakening remote-client error wrapping can leak inconsistent exception surfaces to memory-store/summarizer/title-generation callers.
7. returning inline screenshot base64 in sidecar JSON-RPC responses can bloat stdout lines and main-process parse work; keep screenshot transport on temp-file-ref + artifact-upload path.
8. parsing oversized sidecar JSON-RPC lines on the Electron main thread can stall UI responsiveness; keep the worker-thread parse offload path for lines >=128KB.

## Related Pages

- [Frontend Sidecar Core Docs Hub](README.md)
- [Backend Config Env-Precedence, Trailing-Slash Normalization, and Default-URL Contract Reference](backend_config_env_precedence_trailing_slash_normalization_and_default_url_contract_reference.md)
- [Remote API Client Base Session Lifecycle, Timeout, and Error-Wrapper Contract Reference](remote_api_client_base_session_lifecycle_timeout_and_error_wrapper_contract_reference.md)
- [Remote Embedding Client Health-Probe, Dimension, and Error-Surface Contract Reference](remote_embedding_client_health_probe_dimension_and_error_surface_contract_reference.md)
- [Remote Semantic Client Summarize Payload, Timeout, and Error-Surface Contract Reference](remote_semantic_client_summarize_payload_timeout_and_error_surface_contract_reference.md)
- [Remote Title Client Generation Payload, Model-Override, Timeout, and Error-Surface Contract Reference](remote_title_client_generation_payload_model_override_timeout_and_error_surface_contract_reference.md)
- [JSON-RPC Protocol, Stdout Framing, and Shutdown Signal Runtime Reference](json_rpc_protocol_stdout_framing_and_shutdown_signal_runtime_reference.md)
- [Memory Pipeline and Summarization](../memory_pipeline_and_summarization.md)
