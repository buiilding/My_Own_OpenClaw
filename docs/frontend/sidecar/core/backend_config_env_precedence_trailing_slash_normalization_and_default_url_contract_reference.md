---
summary: "Deep reference for local-runtime backend endpoint config: injected endpoint ownership, missing-config failure, and trailing-slash normalization semantics."
read_when:
  - When changing `windie/_backend_config.py` or introducing new local-runtime/backend endpoint env vars.
  - When debugging local-runtime remote requests targeting the wrong backend URL due to env precedence or slash-normalization drift.
title: "Backend Config Env-Precedence, Trailing-Slash Normalization, and Required-URL Contract Reference"
---

# Backend Config Injected-Endpoint, Trailing-Slash Normalization, and Required-URL Contract Reference

## Canonical Modules

- `frontend/src/main/python/windie/_backend_config.py`
- `frontend/src/main/python/windie/_remote_api_client_base.py`
- `tests/sidecar/test_backend_config.py`

Endpoint resolution logic lives in `windie/_backend_config.py`.

## Exposed Contract

Constants and function:

- `BACKEND_HTTP_URL_ENV = "AGENT_BACKEND_HTTP_URL"`
- `LEGACY_BACKEND_HTTP_URL_ENV = "WINDIE_BACKEND_HTTP_URL"`
- `get_backend_http_url() -> str`

`get_backend_http_url()` is the canonical backend URL for local-runtime Python backend-bound clients
when an explicit URL is not passed.

## Resolution Contract

URL resolution order:

1. `AGENT_BACKEND_HTTP_URL`
2. `WINDIE_BACKEND_HTTP_URL`

Semantics:

- empty strings are invalid and behave like missing config
- trailing slashes are stripped
- Electron main owns `BACKEND_HTTP_URL`, `BACKEND_WS_URL`, host/port, and hosted-default precedence before launching local-runtime Python
- local-runtime Python consumes the resolved `AGENT_BACKEND_HTTP_URL` value when no explicit `backend_url` is passed to a client
- WindieOS Electron launches also mirror the resolved endpoint into `WINDIE_BACKEND_HTTP_URL` for compatibility with existing packaged/runtime env contracts
- missing local-runtime backend endpoint config raises a generic Agent SDK backend URL error

## Normalization Contract

After selecting each source value:

- applies `rstrip("/")`

Effects:

- removes one or more trailing slashes (`/`, `//`, `////`, etc.)
- preserves non-trailing path slashes (for example `/api/v1`)

This ensures stable string concatenation in downstream clients that append endpoint paths directly.

## Consumer Boundary

Current major consumer:

- `RemoteApiClientBase` inheritors such as `RemoteSemanticClient`

Each consumer applies additional endpoint-specific path suffixes on top of this base URL.

## Test-Backed Invariants

`tests/sidecar/test_backend_config.py` verifies:

- missing or blank injected env fails fast
- `AGENT_BACKEND_HTTP_URL` is the primary local-runtime Python backend endpoint override
- `WINDIE_BACKEND_HTTP_URL` remains a legacy compatibility override
- `BACKEND_HTTP_URL` is ignored by local-runtime Python because Electron main owns endpoint resolution
- preservation of non-trailing path segments
- stripping of multiple trailing slashes

## Drift Hotspots

1. Reintroducing `BACKEND_HTTP_URL` parsing in the sidecar duplicates Electron main endpoint ownership.
2. Treating blank env values as valid URLs can send malformed requests.
3. Dropping trailing-slash stripping can create double-slash endpoint paths.
4. Reintroducing a hosted default URL would duplicate endpoint ownership that belongs to Electron main or explicit SDK callers.

## Related Pages

- [Local-Runtime Core Docs Hub](README.md)
- [Remote API Client Base Session Lifecycle, Timeout, and Error-Wrapper Contract Reference](remote_api_client_base_session_lifecycle_timeout_and_error_wrapper_contract_reference.md)
