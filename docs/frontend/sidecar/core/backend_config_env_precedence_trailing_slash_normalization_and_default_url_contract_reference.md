---
summary: "Deep reference for sidecar backend endpoint config: injected endpoint ownership, default hosted URL contract, and trailing-slash normalization semantics."
read_when:
  - When changing `windie/_backend_config.py` or introducing new sidecar/backend endpoint env vars.
  - When debugging sidecar requests targeting the wrong backend URL due to env precedence or slash-normalization drift.
title: "Backend Config Env-Precedence, Trailing-Slash Normalization, and Default-URL Contract Reference"
---

# Backend Config Injected-Endpoint, Trailing-Slash Normalization, and Default-URL Contract Reference

## Canonical Modules

- `frontend/src/main/python/windie/_backend_config.py`
- `frontend/src/main/python/windie/_remote_api_client_base.py`
- `tests/sidecar/test_backend_config.py`

Endpoint resolution logic lives in `windie/_backend_config.py`.

## Exposed Contract

Constants and function:

- `DEFAULT_BACKEND_HTTP_URL = "https://api.windieos.com"`
- `get_backend_http_url() -> str`

`get_backend_http_url()` is the canonical backend URL for sidecar backend-bound clients
when an explicit URL is not passed.

## Resolution Contract

URL resolution order:

1. `WINDIE_BACKEND_HTTP_URL`
2. `DEFAULT_BACKEND_HTTP_URL`

Semantics:

- empty strings are ignored
- trailing slashes are stripped
- Electron main owns `BACKEND_HTTP_URL`, `BACKEND_WS_URL`, host/port, and hosted-default precedence before launching the sidecar
- the sidecar consumes only the resolved `WINDIE_BACKEND_HTTP_URL` value, or the hosted default when that injected value is missing/blank

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

- default hosted backend when injected env is missing
- `WINDIE_BACKEND_HTTP_URL` is the only sidecar endpoint override
- `BACKEND_HTTP_URL` is ignored in the sidecar because Electron main owns endpoint resolution
- preservation of non-trailing path segments
- stripping of multiple trailing slashes

## Drift Hotspots

1. Reintroducing `BACKEND_HTTP_URL` parsing in the sidecar duplicates Electron main endpoint ownership.
2. Treating blank env values as valid URLs can send malformed requests.
3. Dropping trailing-slash stripping can create double-slash endpoint paths.
4. Changing default URL without synchronized desktop/runtime defaults can break hosted desktop assumptions.

## Related Pages

- [Frontend Sidecar Core Docs Hub](README.md)
- [Remote API Client Base Session Lifecycle, Timeout, and Error-Wrapper Contract Reference](remote_api_client_base_session_lifecycle_timeout_and_error_wrapper_contract_reference.md)
