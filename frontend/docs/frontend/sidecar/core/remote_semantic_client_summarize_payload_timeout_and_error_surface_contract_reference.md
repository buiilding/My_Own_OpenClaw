---
summary: "Deep reference for `RemoteSemanticClient`: summarize payload contract, inherited base-client session/timeout behavior, response normalization rules, and semantic error-surface mapping."
read_when:
  - When changing `core/remote_semantic_client.py` summarize request/response behavior or timeout defaults.
  - When debugging sidecar semantic summarize failures, empty summary/facts normalization, or inconsistent semantic error messages.
title: "Remote Semantic Client Summarize Payload, Timeout, and Error-Surface Contract Reference"
---

# Remote Semantic Client Summarize Payload, Timeout, and Error-Surface Contract Reference

## Canonical Modules

- `frontend/src/main/python/core/remote_semantic_client.py`
- `frontend/src/main/python/windie/_remote_api_client_base.py`
- `backend/src/api/routes/memory/semantic/router.py`
- `tests/sidecar/test_remote_semantic_client.py`
- `tests/sidecar/remote_client_test_utils.py`

## Client Surface

Class:

- `RemoteSemanticClient(RemoteApiClientBase)`

Primary method:

- `summarize(conversations, user_id) -> (summary, facts)`

Constructor:

- `__init__(backend_url=None, timeout_seconds=60)`

## Request Contract (`summarize`)

Endpoint path:

- `/api/semantic/summarize`

Payload:

- `conversations: list[str]`
- `user_id: str`

Transport execution uses inherited `_post_success_json(...)` with:

- `api_label="Semantic"`
- `network_service_label="semantic"`
- `request_error_label="semantic summary"`

## Timeout and Session Lifecycle Contract

Timeout:

- uses `timeout_seconds` passed to constructor
- default `60s`

Session lifecycle:

- inherited lazy `initialize()` path creates one `aiohttp.ClientSession`
- repeated initialize calls reuse session
- `close()` closes and resets `_session` to `None`

## Success Response Normalization Contract

Expected backend envelope:

- HTTP `200`
- JSON with `success=true`

Data normalization:

- `summary = data.get("summary", "") or ""`
- `facts = data.get("facts", []) or []`

Implication:

- null/missing backend fields become stable empty-string/empty-list defaults

## Error-Surface Contract

Inherited base error mapping produces:

- non-200:
  - `Semantic API returned {status}: {error_text}`
- success=false:
  - `Semantic API returned success=false`
- network error (`aiohttp.ClientError`):
  - `Failed to connect to semantic service: {err}`

Other exceptions are logged with request label context and re-raised.

## Test-Backed Invariants

`tests/sidecar/test_remote_semantic_client.py` verifies:

- success tuple extraction
- null summary/facts normalization to `""` and `[]`
- non-200 error text propagation
- success=false envelope error behavior
- network error wrapper text
- lazy init path when session missing
- trailing-slash URL normalization
- timeout propagation from constructor
- initialize/close reuse + noop close behavior

Shared lifecycle helper coverage:

- `tests/sidecar/remote_client_test_utils.py`

## Drift Hotspots

1. Changing payload keys (`conversations`, `user_id`) can break backend route validation.
2. Removing null-field normalization can propagate `None` into callers expecting stable tuple types.
3. Changing timeout defaults affects semantic summarize latency/failure characteristics.
4. Diverging error strings from base-client labels can break tests and downstream message matching.

## Related Pages

- [Local-Runtime Core Docs Hub](README.md)
- [Remote API Client Base Session Lifecycle, Timeout, and Error-Wrapper Contract Reference](remote_api_client_base_session_lifecycle_timeout_and_error_wrapper_contract_reference.md)
- [Backend Config Env-Precedence Reference](backend_config_env_precedence_trailing_slash_normalization_and_default_url_contract_reference.md)
- [Semantic Summarization Service Config Resolution, Prompt Assembly, and Parser-Fallback Contract Reference](../../../backend/api/memory/semantic_summarization_service_config_resolution_prompt_assembly_and_parser_fallback_contract_reference.md)
