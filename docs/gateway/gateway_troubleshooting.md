---
summary: "Gateway troubleshooting guide for hosted backend route, websocket, auth, Cloudflare tunnel, health-check, and endpoint-resolution failures."
read_when:
  - When hosted backend clients fail with 401, 404, 409, 502, websocket 1008, missing stream events, or unhealthy route checks.
  - When deciding whether a gateway issue belongs to Cloudflare, FastAPI route registration, install auth, websocket protocol, provider readiness, SDK clients, or Electron endpoint selection.
title: "Gateway Troubleshooting"
---

# Gateway Troubleshooting

Use this page to route hosted ingress failures before editing code.

## Symptom Map

| Symptom | Likely owner | First checks |
| --- | --- | --- |
| `https://api.windieos.com` returns `502` | Cloudflare tunnel or origin backend | tunnel service, backend service, origin port `127.0.0.1:8765` |
| local route works but hosted route fails | Cloudflare/DNS/tunnel | compare local curl with hosted curl |
| hosted REST returns `401` | install auth header/token | `Authorization: Bearer <install_token>`, token database |
| REST returns install-auth `503` | backend app startup/service state | app lifespan, `app.state.install_auth_service` |
| websocket closes with `1008` | auth/handshake/schema policy | bearer token, handshake JSON, user id format |
| route returns `404` | wrong endpoint or missing router | `backend/src/api/routes/__init__.py`, route prefix |
| `/api/runs/*` returns `401` | runs key | `x-windie-runs-key`, `WINDIE_RUNS_API_KEY` |
| `/api/runs/` returns `409` | active run cap | active workspace runs, `WINDIE_VM_MAX_ACTIVE_RUNS_PER_WORKSPACE` |
| health route is `unhealthy` | provider readiness | embedding/semantic provider config and logs |
| SDK route succeeds but desktop tool fails | hosted SDK route vs SDK/main local-runtime executor split | SDK local-runtime JSON-RPC/tool path |

## Basic Checks

Local origin:

```bash
curl -fsSL http://127.0.0.1:8765/api/embeddings/health
```

Hosted route:

```bash
curl -fsSL https://api.windieos.com/api/embeddings/health
```

With install auth:

```bash
curl -fsSL \
  -H "Authorization: Bearer <install_token>" \
  https://api.windieos.com/api/embeddings/health
```

Cloudflare/user services:

```bash
systemctl --user status windieos-backend.service --no-pager
systemctl --user status windieos-cloudflared.service --no-pager
journalctl --user -u windieos-backend.service -n 100 --no-pager
journalctl --user -u windieos-cloudflared.service -n 100 --no-pager
```

Developer-only live log helper:

```bash
WINDIE_BACKEND_SSH_HOST=windie-prod <windie> logs backend --service both
```

The helper defaults to system services for the hosted DigitalOcean droplet and
supports `--scope user` for user-service installs. Keep live log viewing behind
SSH developer access. Do not expose these streams through hosted client APIs.

## Endpoint Resolution

Electron main chooses backend endpoints using env overrides first, then hosted defaults.

Read:

- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)
- [Communication Flow](../architecture/communication_flow.md)
- [Frontend Main WebSocket Handshake Reference](../frontend/main/websocket_handshake_and_settings_sync_reference.md)

If packaged apps connect to the wrong backend, inspect:

- `BACKEND_HTTP_URL`
- `BACKEND_WS_URL`
- `BACKEND_HOST`
- `BACKEND_PORT`
- `WINDIE_DEFAULT_BACKEND_HTTP_URL`
- `WINDIE_DEFAULT_BACKEND_WS_URL`

Do not use removed packaged-only aliases such as
`WINDIE_DEFAULT_PACKAGED_BACKEND_HTTP_URL` or
`WINDIE_DEFAULT_PACKAGED_BACKEND_WS_URL`; Electron main ignores them.

## Route Registration

Canonical router list:

- `backend/src/api/routes/__init__.py`

If a route returns `404` locally:

1. confirm the router is included in `API_ROUTERS`.
2. confirm route prefix and path.
3. confirm the app entrypoint uses `create_api_app(...)`.
4. add/update route tests.

If it returns locally but not hosted, debug Cloudflare/tunnel/origin reachability instead.

## Auth Debugging

REST:

- registration is the only unauthenticated `/api/*` route.
- all other `/api/*` routes require bearer auth when `install_auth_enabled=true`.
- invalid/missing token returns `401`.

Websocket:

- hosted websocket auth is checked during handshake.
- client-claimed user id is not ownership proof.
- policy-violation close can mean auth, parse, or schema failure.

Runs:

- runs routes require `x-windie-runs-key` and a configured backend runs key.
- VM workers can use `WINDIE_VM_RUNS_API_KEY` to avoid sharing the backend-global key name in worker env.

## When to Update Docs

Update gateway docs when changing:

- FastAPI app assembly or route registration
- auth middleware or websocket auth
- CORS policy
- route prefixes or endpoint payloads
- SDK public routes
- health endpoint behavior
- Cloudflare/self-host runbooks
- endpoint selection defaults

Validation:

- `<windie> docs list`
- route/schema tests for the changed endpoint
- auth/websocket tests for auth changes
- focused SDK/frontend tests for client-visible route changes
