---
summary: "Endpoint and network debugging guide for WindieOS backend URL resolution, hosted defaults, Cloudflare tunnel checks, install auth, websocket closes, and local-runtime backend URL drift."
read_when:
  - When WindieOS connects to the wrong backend, hosted/local routes diverge, websocket connect fails, REST returns 401/502/404, or local-runtime memory/API calls hit the wrong endpoint.
  - When changing backend endpoint resolution defaults or Cloudflare/self-host routing.
title: "Endpoint and Network Debugging"
---

# Endpoint and Network Debugging

WindieOS defaults to the hosted backend when no endpoint override is set:

- HTTP: `https://api.windieos.com`
- WebSocket: `wss://api.windieos.com/ws`

Development does not implicitly fall back to `127.0.0.1:8765` unless an override is explicit.

## Endpoint Resolution Order

Electron main owns endpoint selection:

1. `BACKEND_HTTP_URL` and `BACKEND_WS_URL`
2. `BACKEND_HOST` and `BACKEND_PORT`
3. `WINDIE_DEFAULT_BACKEND_HTTP_URL` and `WINDIE_DEFAULT_BACKEND_WS_URL`
4. hosted default

The local-runtime Python process should receive `WINDIE_BACKEND_HTTP_URL` from
Electron main. If local-runtime memory/API calls hit a different backend than
renderer websocket traffic, inspect main-process env injection before editing
local-runtime hosted helper clients.

## Quick Checks

Local origin:

```sh
curl -fsSL http://127.0.0.1:8765/api/embeddings/health
```

Hosted route:

```sh
curl -fsSL https://api.windieos.com/api/embeddings/health
```

Hosted auth route:

```sh
curl -fsSL \
  -H "Authorization: Bearer <install_token>" \
  https://api.windieos.com/api/embeddings/health
```

Cloudflare/user services:

```sh
systemctl --user status windieos-backend.service --no-pager
systemctl --user status windieos-cloudflared.service --no-pager
journalctl --user -u windieos-backend.service -n 100 --no-pager
journalctl --user -u windieos-cloudflared.service -n 100 --no-pager
```

## Symptom Map

| Symptom | Likely owner | First check |
| --- | --- | --- |
| app connects hosted when local expected | Electron endpoint env | `BACKEND_HTTP_URL`, `BACKEND_WS_URL`, `BACKEND_HOST`, `BACKEND_PORT` |
| local route works but hosted returns `502` | Cloudflare/origin service | tunnel service and backend user service |
| REST `/api/*` returns `401` | install auth | bearer token from same backend registration |
| route returns `404` locally | FastAPI route registration | `backend/src/api/routes/__init__.py` |
| websocket closes with `1008` | auth, handshake, or schema policy | bearer token, first handshake message, backend logs |
| local-runtime memory route hits wrong backend | main local-runtime env injection | `WINDIE_BACKEND_HTTP_URL` in local-runtime env |
| `/api/runs/*` returns `401` | runs key | `x-windie-runs-key`, `WINDIE_RUNS_API_KEY`, `WINDIE_VM_RUNS_API_KEY` |

## Related Docs

- [Gateway Troubleshooting](../gateway/gateway_troubleshooting.md)
- [Gateway Auth and Health Runbook](../gateway/gateway_auth_and_health_runbook.md)
- [Operational Troubleshooting](../operations/operational_troubleshooting.md)
- [Configuration Reference](../reference/configuration_reference.md)
- [Runtime Node Matrix](../nodes/runtime_node_matrix.md)
