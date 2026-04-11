---
summary: "Deep reference for sidecar backend endpoint config: env-var precedence, empty-value fallback behavior, default hosted URL contract, and trailing-slash normalization semantics."
read_when:
  - When changing `core/backend_config.py` or introducing new sidecar/backend endpoint env vars.
  - When debugging sidecar requests targeting the wrong backend URL due to env precedence or slash-normalization drift.
title: "Backend Config Env-Precedence, Trailing-Slash Normalization, and Default-URL Contract Reference"
---

# Backend Config Env-Precedence, Trailing-Slash Normalization, and Default-URL Contract Reference

## Canonical Modules

- `frontend/src/main/python/core/backend_config.py`
- `frontend/src/main/python/core/remote_embedding_client.py`
- `frontend/src/main/python/core/remote_api_client_base.py`
- `tests/sidecar/test_backend_config.py`

## Exposed Contract

Constants and function:

- `DEFAULT_BACKEND_HTTP_URL = "https://api.windieos.com"`
- `get_backend_http_urls() -> list[str]`
- `get_backend_http_url() -> str`

`get_backend_http_urls()` is the canonical candidate list for sidecar backend-bound clients
when an explicit URL is not passed. `get_backend_http_url()` returns the first candidate.

## Resolution Precedence Contract

URL resolution order:

1. `WINDIE_BACKEND_HTTP_URL`
2. `BACKEND_HTTP_URL`
3. `DEFAULT_BACKEND_HTTP_URL`

Semantics:

- empty strings are ignored
- trailing slashes are stripped before dedupe
- duplicate URLs are collapsed while preserving first-seen order
- if `WINDIE_BACKEND_HTTP_URL=""`, fallback continues to later candidates

## Normalization Contract

After selecting each source value:

- applies `rstrip("/")`

Effects:

- removes one or more trailing slashes (`/`, `//`, `////`, etc.)
- preserves non-trailing path slashes (for example `/api/v1`)

This ensures stable string concatenation in downstream clients that append endpoint paths directly.

## Consumer Boundary

Current major consumers:

- `RemoteEmbeddingClient` (manual HTTP client path)
- `RemoteApiClientBase` inheritors (`RemoteSemanticClient`, `RemoteTitleClient`)

Each consumer applies additional endpoint-specific path suffixes on top of this base URL.

## Test-Backed Invariants

`tests/sidecar/test_backend_config.py` verifies:

- default hosted backend when both env vars missing
- `WINDIE_BACKEND_HTTP_URL` precedence over `BACKEND_HTTP_URL`
- fallback to `BACKEND_HTTP_URL` when Windie-specific env is empty
- preservation of non-trailing path segments
- stripping of multiple trailing slashes
- ordered dedupe across explicit env values and the hosted default

## Drift Hotspots

1. Reordering env precedence can silently redirect sidecar traffic between intended backends.
2. Removing empty-string fallback behavior can treat blank env values as valid URLs.
3. Dropping trailing-slash stripping or dedupe can create duplicate/double-slash retry targets.
4. Changing default URL without synchronized desktop/runtime defaults can break hosted desktop assumptions.

## Related Pages

- [Frontend Sidecar Core Docs Hub](README.md)
- [Backend URL Resolution, Remote Memory Clients, and Thread-Pool Runtime Reference](backend_url_resolution_remote_memory_clients_and_thread_pool_runtime_reference.md)
- [Remote API Client Base Session Lifecycle, Timeout, and Error-Wrapper Contract Reference](remote_api_client_base_session_lifecycle_timeout_and_error_wrapper_contract_reference.md)
- [Remote Embedding Client Health-Probe, Dimension, and Error-Surface Contract Reference](remote_embedding_client_health_probe_dimension_and_error_surface_contract_reference.md)
