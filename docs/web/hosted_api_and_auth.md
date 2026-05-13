---
summary: "Hosted API and auth guide for WindieOS REST routes, websockets, install tokens, runs API keys, CORS, health checks, and client responsibilities."
read_when:
  - When changing hosted REST/websocket routes, install auth, CORS, health checks, or external API client behavior.
  - When debugging 401, 403, 404, 409, 502, websocket 1008, CORS, or route-registration failures from web/API clients.
title: "Hosted API and Auth"
---

# Hosted API and Auth

Hosted API behavior belongs to the FastAPI gateway boundary. The Electron app, SDK clients, and VM workers consume hosted routes, but route registration, auth, CORS, and websocket handshakes are backend-owned.

## Route Families

| Family | Protocol | Auth | Owner |
| --- | --- | --- | --- |
| install registration | HTTP `POST /api/install/register` | unauthenticated registration | backend install-auth routes/services |
| hosted REST | HTTP `/api/*` | install bearer token except registration | backend auth middleware |
| main agent stream | WebSocket `/ws` | install bearer token when hosted auth enabled | `backend/src/api/routes/websocket/*` |
| transcription stream | WebSocket `/ws/transcription` | backend route/session rules | `backend/src/api/routes/transcription/router.py` |
| SDK routes | HTTP `/api/sdk/*` | install bearer token | `backend/src/api/routes/sdk/*` |
| artifacts | HTTP `/api/artifacts/*` | install bearer token | `backend/src/api/routes/artifacts/*` |
| VM runs | HTTP `/api/runs/*` | runs API key dependency, plus install middleware when enabled | `backend/src/api/routes/runs/*` |

## CORS

Default CORS is assembled in `backend/src/api/app_assembly.py`.

Current default:

- allowed origin: `http://localhost:5173`
- credentials allowed
- all methods and headers allowed

When adding a browser-hosted client, decide whether it is a trusted first-party origin, an SDK/server-side client, or unsupported. Do not broaden CORS without documenting the new caller and auth model.

## Health Checks

Use concrete route health checks instead of assuming a root `/health` endpoint.

Common checks:

```bash
curl -fsSL http://127.0.0.1:8765/api/embeddings/health
curl -fsSL https://api.windieos.com/api/embeddings/health
```

For hosted auth:

```bash
curl -fsSL \
  -H "Authorization: Bearer <install_token>" \
  https://api.windieos.com/api/embeddings/health
```

## Failure Routing

| Failure | Likely owner |
| --- | --- |
| `401` on REST | missing/invalid install bearer token or wrong backend host |
| `404` on route | route registration in `backend/src/api/routes/__init__.py` |
| `409` on runs create | active run cap or conflicting run state |
| websocket `1008` | auth, handshake schema, or policy validation |
| hosted `502` | Cloudflare Tunnel or backend origin service |
| CORS block | allowed-origin policy and client surface decision |

## Related Docs

- [Gateway Protocol Map](../gateway/gateway_protocol_map.md)
- [Gateway Auth and Health Runbook](../gateway/gateway_auth_and_health_runbook.md)
- [Gateway Troubleshooting](../gateway/gateway_troubleshooting.md)
- [Hosted Backend Auth](../operations/hosted_backend_auth.md)
