---
summary: "Gateway auth and hosted backend health runbook for install registration, bearer-token REST/websocket auth, runs API key auth, and provider health endpoints."
read_when:
  - When debugging hosted backend health, hosted REST 401/503 responses, websocket policy closes, missing install identity, runs API auth failures, or unhealthy gateway-adjacent routes.
  - When changing install auth middleware, websocket auth, route health checks, or hosted endpoint readiness behavior.
title: "Gateway Auth and Health Runbook"
---

# Gateway Auth and Health Runbook

This runbook covers the auth and health pieces that sit at the FastAPI gateway boundary.

For code-change steps across install auth, REST bearer tokens, websocket auth, runs keys, provider credentials, sidecar auth headers, and secret logging, use [Credential and Token Change Workflow](../security/credential_token_change_workflow.md).

## Install Registration

Endpoint:

- `POST /api/install/register`

Owner:

- `backend/src/api/auth/router.py`
- `backend/src/api/auth/service.py`

Behavior:

- unauthenticated route
- accepts optional `operating_system`
- creates server-owned `user_id` and `install_id`
- returns `install_token` once
- stores only token hash in SQLite
- returns `503` when install auth service is unavailable

## REST Auth Middleware

Owner:

- `backend/src/api/auth/http_middleware.py`

Applies to:

- all `/api/*` paths except `/api/install/register`

Rules:

- disabled only when backend config `install_auth_enabled=false`
- requires `Authorization: Bearer <install_token>`
- missing token returns `401`
- invalid token returns `401`
- missing install-auth service returns `503`
- successful auth sets request/context identity

## WebSocket Auth

Owner:

- `backend/src/api/routes/websocket/connection.py`

Rules when install auth is enabled:

- websocket headers must include `Authorization: Bearer <install_token>`
- backend authenticates token through `InstallAuthService`
- authenticated `user_id` overrides handshake-claimed `user_id`
- mismatched claimed user id is logged and ignored
- auth/handshake/schema failures close with policy-violation semantics

## Runs API Key

Owner:

- `backend/src/api/routes/runs/support.py`

Header:

```http
x-windie-runs-key: <shared-key>
```

Backend accepted env vars:

- `WINDIE_RUNS_API_KEY`

Worker lookup can use:

- `WINDIE_VM_RUNS_API_KEY`
- `WINDIE_RUNS_API_KEY`

The runs key is separate from install auth. Hosted `/api/runs/*` can pass through both the general install middleware and the runs route dependency. Destructive bulk stop additionally requires `WINDIE_RUNS_CONTROL_API_KEY` via `x-windie-runs-control-key`; the ordinary runs key is not accepted for `/api/runs/stop-all`.

## Health Endpoints

Current route-level health endpoints:

| Endpoint | Owner | Meaning |
| --- | --- | --- |
| `GET /api/embeddings/health` | `backend/src/api/routes/memory/embeddings/router.py` | embedding provider/router readiness |
| `GET /api/semantic/health` | `backend/src/api/routes/memory/semantic/router.py` | semantic summarization client/service readiness |

There is no separate root `/health` endpoint documented in the current route map. For gateway availability, check a concrete route that matches what the client needs.

Common checks:

```bash
curl -fsSL http://127.0.0.1:8765/api/embeddings/health
curl -fsSL https://api.windieos.com/api/embeddings/health
```

If install auth is enabled, include:

```bash
curl -fsSL \
  -H "Authorization: Bearer <install_token>" \
  https://api.windieos.com/api/embeddings/health
```

## Failure Routing

| Signal | First owner |
| --- | --- |
| HTTP `401` on `/api/*` | install bearer token missing/invalid |
| HTTP `503` with install auth detail | app startup/container/auth service wiring |
| websocket close `1008` | auth, handshake parse/schema, or policy failure |
| `/api/runs/*` `401` | runs key mismatch |
| health route `unhealthy` | provider/service readiness, not Cloudflare |
| Cloudflare `502` | tunnel or origin process reachability |
| route `404` | endpoint mismatch or router registration issue |

## Test Targets

- install auth service/router/middleware tests
- websocket handshake/auth tests
- route health tests for embeddings/semantic behavior
- runs route auth tests when runs key behavior changes
- SDK/client auth propagation tests when header behavior changes

## Related Docs

- [Credential and Token Change Workflow](../security/credential_token_change_workflow.md)
- [Credentials and Tokens Matrix](../security/credentials_and_tokens_matrix.md)
- [Hosted Backend Auth](../operations/hosted_backend_auth.md)
