---
summary: "Deep reference for `RemoteTitleClient`: title-generation payload contract, optional model/provider override shaping, inherited base-client timeout/session behavior, and title error-surface mapping."
read_when:
  - When changing `core/remote_title_client.py` title request/response behavior or timeout defaults.
  - When debugging sidecar conversation-title generation failures, missing override fields, or inconsistent title API error messages.
title: "Remote Title Client Generation Payload, Model-Override, Timeout, and Error-Surface Contract Reference"
---

# Remote Title Client Generation Payload, Model-Override, Timeout, and Error-Surface Contract Reference

## Canonical Modules

- `frontend/src/main/python/core/remote_title_client.py`
- `frontend/src/main/python/core/remote_api_client_base.py`
- `backend/src/api/routes/memory/semantic/router.py`
- `tests/sidecar/test_remote_title_client.py`
- `tests/sidecar/remote_client_test_utils.py`

## Client Surface

Class:

- `RemoteTitleClient(RemoteApiClientBase)`

Primary method:

- `generate_title(user_id, user_message, assistant_message, model_id=None, model_provider=None) -> str`

Constructor:

- `__init__(backend_url=None, timeout_seconds=45)`

## Request Contract (`generate_title`)

Endpoint path:

- `/api/semantic/title`

Required payload fields:

- `user_id`
- `user_message`
- `assistant_message`

Optional payload fields:

- `model_id` included only when non-empty after trim
- `model_provider` included only when non-empty after trim

Transport execution uses inherited `_post_success_json(...)` with:

- `api_label="Title"`
- `network_service_label="title"`
- `request_error_label="conversation title"`

## Timeout and Session Lifecycle Contract

Timeout:

- uses `timeout_seconds` passed to constructor
- default `45s`

Session lifecycle:

- inherited lazy `initialize()` path creates one `aiohttp.ClientSession`
- repeated initialize calls reuse session
- `close()` closes and resets `_session` to `None`

## Success Response Normalization Contract

Expected backend envelope:

- HTTP `200`
- JSON with `success=true`

Data normalization:

- `title = data.get("title", "") or ""`
- returns `title.strip()`

Implication:

- missing/null/whitespace title values become stable empty string

## Error-Surface Contract

Inherited base error mapping produces:

- non-200:
  - `Title API returned {status}: {error_text}`
- success=false:
  - `Title API returned success=false`
- network error (`aiohttp.ClientError`):
  - `Failed to connect to title service: {err}`

Other exceptions are logged with request label context and re-raised.

## Test-Backed Invariants

`tests/sidecar/test_remote_title_client.py` verifies:

- success payload extraction + response title return
- optional override fields included only when non-empty
- trailing-slash URL normalization
- timeout propagation from constructor
- non-200 status error propagation
- success=false envelope error behavior
- network error wrapper text
- initialize/close single-session reuse behavior

Shared lifecycle helper coverage:

- `tests/sidecar/remote_client_test_utils.py`

## Drift Hotspots

1. Including blank override fields can override backend model selection unexpectedly.
2. Changing payload keys can break `/api/semantic/title` request validation.
3. Changing timeout defaults affects perceived title-generation latency/failure behavior.
4. Diverging error labels from title domain can break tests and downstream error-string handling.

## Related Pages

- [Frontend Sidecar Core Docs Hub](README.md)
- [Remote API Client Base Session Lifecycle, Timeout, and Error-Wrapper Contract Reference](remote_api_client_base_session_lifecycle_timeout_and_error_wrapper_contract_reference.md)
- [Backend URL Resolution, Remote Memory Clients, and Thread-Pool Runtime Reference](backend_url_resolution_remote_memory_clients_and_thread_pool_runtime_reference.md)
- [Semantic Title Generation Route, Model-Override, and Parser-Fallback Contract Reference](../../../backend/api/memory/semantic_title_generation_route_model_override_and_parser_fallback_contract_reference.md)
