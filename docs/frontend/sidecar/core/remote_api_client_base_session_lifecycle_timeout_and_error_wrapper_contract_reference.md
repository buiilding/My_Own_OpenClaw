---
summary: "Deep reference for sidecar `RemoteApiClientBase`: backend URL normalization, shared aiohttp session lifecycle, timeout wiring, success-envelope enforcement, and standardized network/request error wrappers."
read_when:
  - When changing `core/remote_api_client_base.py` or remote clients that inherit from it (`remote_semantic_client`, `remote_title_client`).
  - When debugging inconsistent HTTP error messages, success=false handling, or repeated session allocation in sidecar remote clients.
title: "Remote API Client Base Session Lifecycle, Timeout, and Error-Wrapper Contract Reference"
---

# Remote API Client Base Session Lifecycle, Timeout, and Error-Wrapper Contract Reference

## Canonical Modules

- `frontend/src/main/python/core/remote_api_client_base.py`
- `frontend/src/main/python/core/remote_semantic_client.py`
- `frontend/src/main/python/core/remote_title_client.py`
- `frontend/src/main/python/core/backend_config.py`
- `tests/sidecar/test_remote_semantic_client.py`
- `tests/sidecar/test_remote_title_client.py`
- `tests/sidecar/remote_client_test_utils.py`

## Scope and Adoption Contract

`RemoteApiClientBase` is shared by:

- `RemoteSemanticClient`
- `RemoteTitleClient`

`RemoteEmbeddingClient` currently does not inherit this base and keeps a parallel/manual implementation with similar lifecycle patterns.

## Constructor and URL Contract

`__init__(backend_url=None, timeout_seconds=60)`:

- resolves backend URL from explicit arg or `get_backend_http_url()`
- strips trailing `/` via `rstrip("/")`
- stores per-instance timeout seconds
- initializes `_session=None`

Implication:

- all inheritors emit endpoint URLs as `"{backend_url}{path}"` without double-slash drift

## Shared Session Lifecycle Contract

`initialize()`:

- creates exactly one `aiohttp.ClientSession` when missing

`close()`:

- closes existing session
- resets `_session` to `None`

Callers may invoke API methods without pre-initialization; `_post_success_json(...)` lazily initializes when needed.

## Shared POST + Success Envelope Contract (`_post_success_json`)

Input parameters:

- `path`
- `payload`
- `api_label`
- `network_service_label`
- `request_error_label`

Execution behavior:

1. lazy session init when absent
2. POST JSON request with timeout `ClientTimeout(total=self.timeout_seconds)`
3. require `HTTP 200`, else raise:
   - `"{api_label} API returned {status}: {text}"`
4. parse JSON body and require `success == true`, else raise:
   - `"{api_label} API returned success=false"`
5. return parsed JSON object

## Error Wrapper Contract

Network error path (`aiohttp.ClientError`):

- logs network error with lowercased API label
- raises:
  - `Failed to connect to {network_service_label} service: {err}`

Other exception path:

- logs:
  - `Error requesting {request_error_label}: {err}`
- re-raises exception unchanged

This keeps service-specific, user-facing error strings stable while preserving original status/failure details.

## Inheritor Parameterization Contract

`RemoteSemanticClient.summarize(...)` uses:

- `api_label="Semantic"`
- `network_service_label="semantic"`
- `request_error_label="semantic summary"`

`RemoteTitleClient.generate_title(...)` uses:

- `api_label="Title"`
- `network_service_label="title"`
- `request_error_label="conversation title"`

Per-client method-level payload shaping (for example optional title overrides) remains inheritor responsibility.

## Test-Backed Invariants

Covered via inheritor tests plus shared test helper:

- `test_remote_semantic_client.py`
- `test_remote_title_client.py`
- `remote_client_test_utils.assert_client_initialize_reuses_session_and_close_resets(...)`

Validated behaviors:

- single-session reuse across repeated `initialize()` calls
- `close()` resets session to `None`
- non-200 and `success=false` envelope errors preserve `api_label` text
- network failures preserve `network_service_label` text
- timeout propagation from client constructor into request timeout

## Drift Hotspots

1. Changing `success` envelope requirement can silently accept malformed backend error payloads.
2. Removing lazy init in `_post_success_json` can break call-sites that rely on implicit initialization.
3. Changing error-string templates can break tests and downstream error matching logic.
4. Diverging inheritor labels from semantics/title domains can produce misleading user-facing failures.

## Related Pages

- [Frontend Sidecar Core Docs Hub](README.md)
- [Remote Semantic Client Summarize Payload, Timeout, and Error-Surface Contract Reference](remote_semantic_client_summarize_payload_timeout_and_error_surface_contract_reference.md)
- [Remote Title Client Generation Payload, Model-Override, Timeout, and Error-Surface Contract Reference](remote_title_client_generation_payload_model_override_timeout_and_error_surface_contract_reference.md)
- [Backend URL Resolution, Remote Memory Clients, and Thread-Pool Runtime Reference](backend_url_resolution_remote_memory_clients_and_thread_pool_runtime_reference.md)
- [Memory Pipeline and Summarization](../memory_pipeline_and_summarization.md)
