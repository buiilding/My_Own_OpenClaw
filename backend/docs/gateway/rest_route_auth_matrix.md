---
summary: "Hosted REST route and auth matrix for WindieOS FastAPI gateway surfaces, route owners, identity source, failure signals, and tests."
read_when:
  - When adding or changing a hosted `/api/*` route.
  - When debugging REST `401`, `403`, `404`, `409`, `422`, or `503` responses from the hosted backend.
  - When changing install-token auth, runs API key behavior, SDK route identity, artifact routes, embedding routes, or semantic routes.
title: "REST Route Auth Matrix"
---

# REST Route Auth Matrix

The WindieOS hosted REST boundary is FastAPI route registration plus install-auth middleware. There is no separate gateway process. Route ownership starts in `backend/src/api/routes/__init__.py`, app assembly lives in `backend/src/api/app_assembly.py`, and hosted HTTP auth is enforced by `backend/src/api/auth/http_middleware.py`.

Use [Credential and Token Change Workflow](../security/credential_token_change_workflow.md) when a route change touches install bearer auth, runs API keys, provider credentials, sidecar auth headers, or secret logging.

## Assembly Contract

| Layer | Owner | Contract |
| --- | --- | --- |
| App factory | `backend/src/api/app_assembly.py` | Creates `FastAPI`, applies CORS, and includes every router in `API_ROUTERS`. |
| Runtime entrypoint | `backend/src/main.py` | Initializes the container, stores `InstallAuthService` on `app.state`, and installs HTTP auth middleware. |
| Router registry | `backend/src/api/routes/__init__.py` | Registers install auth, main websocket, transcription websocket, runs, artifacts, SDK, embeddings, and semantic routers. |
| Auth context | `backend/src/api/auth/context.py` | Carries authenticated install identity through request-local context for route services. |
| Middleware | `backend/src/api/auth/http_middleware.py` | Authenticates `/api/*` requests except `/api/install/register` when install auth is enabled. |

Default CORS is `http://localhost:5173` with credentials, all methods, and all headers. If hosted web clients are added, update CORS docs and app assembly tests instead of silently widening CORS in only one environment.

## REST Routes

| Route family | Router owner | Identity source | Extra auth | Primary tests | Notes |
| --- | --- | --- | --- | --- | --- |
| `POST /api/install/register` | `backend/src/api/auth/router.py` | New server-owned identity from `InstallAuthService` | None | `tests/backend/test_install_auth.py` | Only unauthenticated `/api/*` route. Returns install token once. |
| `/api/artifacts/*` | `backend/src/api/routes/artifacts/router.py` | Required install-auth context | None | `tests/backend/test_artifact_routes.py` | Artifact owner comes from authenticated identity; anonymous upload/fetch is rejected before storage access. |
| `/api/sdk/*` | `backend/src/api/routes/sdk/router.py` | Install-auth context inside SDK service where user identity matters | None | `tests/backend/test_sdk_routes.py` | `POST /api/sdk/ocr/find-text` rejects missing identity before OCR/image resolution. System-prompt and query-plan reject anonymous and cross-user debug access. |
| `/api/embeddings/*` | `backend/src/api/routes/memory/embeddings/router.py` | Install-auth middleware | None | `tests/backend/test_memory_routes.py` | Health reports embedding router/provider readiness. |
| `/api/semantic/*` | `backend/src/api/routes/memory/semantic/router.py` | Required install-auth context for summarize/title behavior | None | `tests/backend/test_memory_routes.py` | Summarize/title reject missing identity and body `user_id` mismatches; health reports semantic client/service readiness. |
| `/api/runs/*` | `backend/src/api/routes/runs/router.py` | Install-auth middleware when enabled | Required `x-windie-runs-key` matching configured runs key; `/api/runs/stop-all` requires privileged `x-windie-runs-control-key` matching `WINDIE_RUNS_CONTROL_API_KEY` | `tests/backend/test_run_control_routes.py`, `tests/backend/test_run_control_route_helpers.py` | Runs key is separate from install token and protects worker/control-plane access; bulk stop uses a distinct destructive-control key. |

## Auth Rules

| Condition | Result | Owner |
| --- | --- | --- |
| Path is not `/api/*` | Middleware passes through | `install_auth_http_middleware` |
| Path is `/api/install/register` | Middleware passes through | `_UNAUTHENTICATED_PATHS` |
| `install_auth_enabled=false` | Middleware passes through | Backend config loaded into app container |
| Install auth service missing | HTTP `503` with `Install auth service not available` | `backend/src/main.py`, middleware |
| Missing bearer token | HTTP `401` with `Missing install bearer token` | Middleware |
| Invalid bearer token | HTTP `401` with `Invalid install bearer token` | `InstallAuthService.authenticate_token` |
| Valid bearer token | Request continues and `request.state.install_identity` is set | Middleware and auth context |
| Runs key missing from backend config | HTTP `503` with `Runs API key is not configured` | `backend/src/api/routes/runs/support.py` |
| Runs key header missing or mismatched | HTTP `401` with `Invalid runs API key` | `backend/src/api/routes/runs/support.py` |

Do not let route handlers trust a request body `user_id` when install auth is enabled. Route code should read authenticated identity from context or request state where ownership matters.

## Failure Routing

| Symptom | First check | Likely owner |
| --- | --- | --- |
| `404` on a known route | Confirm router is in `API_ROUTERS` and prefix/path match docs | Route package or `routes/__init__.py` |
| `401` on all `/api/*` except install register | Check bearer token propagation from Electron/SDK client | Client auth forwarding or install middleware |
| `503` mentioning install auth service | Check lifespan startup and `app.state.install_auth_service` | `backend/src/main.py` or container startup |
| `422` request validation error | Check Pydantic request model and docs examples | Route model |
| `409` or conflict-style run response | Check route-specific service state | Route service, usually runs control |
| Browser CORS preflight fails | Check allowed origins in app assembly and deployment host | `backend/src/api/app_assembly.py` |

## Change Checklist

1. Add or edit the route model/service in the owning route package.
2. Register new routers only through `backend/src/api/routes/__init__.py`.
3. Decide whether the route uses install identity, runs key, or both.
4. Add route tests for auth enabled, auth disabled where applicable, validation errors, and success.
5. Update [HTTP and WebSocket API Surface](../reference/http_api_surface.md) and SDK docs if public.
6. Run `./scripts/python-in-env backend pytest tests/backend/test_app_assembly.py` plus the focused route tests.

## Related Docs

- [Gateway Protocol Map](gateway_protocol_map.md)
- [Gateway Auth and Health Runbook](gateway_auth_and_health_runbook.md)
- [Hosted API and Auth](../web/hosted_api_and_auth.md)
- [Security Boundary Matrix](../security/security_boundary_matrix.md)
- [Credential and Token Change Workflow](../security/credential_token_change_workflow.md)
- [Configuration Reference](../reference/configuration_reference.md)
