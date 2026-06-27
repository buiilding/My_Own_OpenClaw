---
summary: "Gateway protocol map for WindieOS FastAPI app assembly, hosted route registration, websockets, REST APIs, auth middleware, and CORS."
read_when:
  - When adding/changing FastAPI routers, websocket protocols, REST route families, CORS, or route registration order.
  - When debugging route ownership, 404s, websocket handshake failures, or SDK/client protocol mismatches.
title: "Gateway Protocol Map"
---

# Gateway Protocol Map

The gateway boundary is assembled by `backend/src/main.py` and `backend/src/api/app_assembly.py`.

## App Assembly

`backend/src/main.py`:

- creates the FastAPI app through `create_api_app(...)`
- initializes the backend container during lifespan startup
- stores the container on app state
- creates `InstallAuthService` from config and stores it on app state
- registers install-auth HTTP middleware after app creation
- clears app-state services on shutdown

`backend/src/api/app_assembly.py`:

- creates `FastAPI(title=..., lifespan=...)`
- applies default CORS
- includes all routers from `API_ROUTERS`

Default CORS:

- allowed origin: `http://localhost:5173`
- credentials allowed
- all methods and headers allowed

Router registration source:

- `backend/src/api/routes/__init__.py`

Registered routers:

- install auth: `/api/install`
- main websocket: `/ws`
- transcription websocket: `/ws/transcription`
- VM runs: `/api/runs`
- artifacts: `/api/artifacts`
- SDK routes: `/api/sdk`
- embeddings: `/api/embeddings`
- semantic summarize/title: `/api/semantic`

## Protocol Families

| Family | Protocol | Auth | Primary docs |
| --- | --- | --- | --- |
| Agent stream | WebSocket `/ws` | hosted bearer token when install auth enabled | [Backend API WebSocket Docs Hub](../backend/api/websocket/README.md) |
| Transcription | WebSocket `/ws/transcription` | backend route/session behavior; provider websocket hidden behind backend | [Voice and Audio Channels](../channels/voice_and_audio_channels.md) |
| Install registration | HTTP `POST /api/install/register` | unauthenticated registration endpoint | [Hosted Backend Auth](../operations/hosted_backend_auth.md) |
| Hosted REST | HTTP `/api/*` | install bearer token except registration | [Gateway Auth and Health Runbook](gateway_auth_and_health_runbook.md) |
| Runs control | HTTP `/api/runs/*` | runs key dependency plus install middleware when enabled | [Runs API Runbook](../automation/runs_api_runbook.md) |
| SDK routes | HTTP `/api/sdk/*` | install bearer token | [SDK Hub](../sdk/README.md) |
| Memory/inference health | HTTP health endpoints under memory routes | install bearer token when auth enabled | [Gateway Auth and Health Runbook](gateway_auth_and_health_runbook.md) |

## Main WebSocket Contract

Entrypoint:

- `backend/src/api/routes/websocket/router.py`

Connection helpers:

- `connection.py`: accept + handshake + install-auth identity
- `message_handler.py`: parse/validate incoming frames and dispatch
- `task_manager.py`: per-connection task cap and cleanup
- `json_parse.py`, `message_parse_runtime.py`, `loop_runtime.py`: parse/runtime helpers

Incoming message families:

- `query`
- `stop-query`
- `rehydrate-conversation`
- `tool-result`
- `tool-bundle-result`
- `wakeword-detected`
- `list-models`
- `load-settings`
- `update-settings`
- `compact-history`

Outgoing message families:

- streamed text/thinking/completion
- tool-call/tool-bundle/tool-output
- transparency events
- token-count events
- audio chunks
- errors

## REST Route Families

| Route family | Owner | Notes |
| --- | --- | --- |
| `/api/install/*` | `backend/src/api/auth/router.py` | registration returns server-owned `user_id`, `install_id`, and one-time token |
| `/api/artifacts/*` | `backend/src/api/routes/artifacts/*` | upload/fetch artifact files, user identity is required from auth context |
| `/api/sdk/*` | `backend/src/api/routes/sdk/*` | hosted developer introspection/perception/query-plan routes |
| `/api/embeddings/*` | `backend/src/api/routes/memory/embeddings/*` | embedding generation and health |
| `/api/semantic/*` | `backend/src/api/routes/memory/semantic/*` | summarize/title and health |
| `/api/runs/*` | `backend/src/api/routes/runs/*` | VM run control plane |

## Change Checklist

When changing gateway protocols:

1. update route owner docs and [HTTP and WebSocket API Surface](../reference/http_api_surface.md).
2. update [Gateway Auth and Health Runbook](gateway_auth_and_health_runbook.md) when auth or health behavior changes.
3. update SDK clients if the route is public to TypeScript/Python SDK users.
4. update websocket contract docs when incoming/outgoing message types change.
5. add route/schema/handler tests.
6. run `<windie> docs list`.
