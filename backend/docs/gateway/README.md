---
summary: "Gateway hub for WindieOS hosted backend ingress, FastAPI route assembly, websocket protocols, install auth, health checks, and deployment troubleshooting."
read_when:
  - When changing hosted backend ingress, FastAPI app assembly, websocket routing, install auth, SDK/artifact/memory/runs APIs, or Cloudflare/self-host behavior.
  - When debugging hosted `api.windieos.com`, websocket close codes, REST auth failures, health endpoints, or API route ownership.
title: "Gateway Hub"
---

# Gateway Hub

WindieOS does not currently have a separate gateway service. The gateway boundary is the FastAPI app that exposes hosted HTTP and websocket ingress:

- main agent websocket: `GET /ws`
- transcription websocket: `GET /ws/transcription`
- hosted REST routes: `/api/*`
- install registration: `POST /api/install/register`
- SDK, artifacts, memory, semantic, and VM runs APIs

Use this hub when a change affects how clients enter the hosted backend, how the backend authenticates them, or how route ownership is assembled.

## Gateway Surfaces

| Surface | Route | Owner | Start docs |
| --- | --- | --- | --- |
| FastAPI app assembly | app startup, CORS, router registration | `backend/src/main.py`, `backend/src/api/app_assembly.py`, `backend/src/api/routes/__init__.py` | [Gateway Protocol Map](gateway_protocol_map.md) |
| Main agent websocket | `GET /ws` | `backend/src/api/routes/websocket/*` | [WebSocket Connection Change Workflow](websocket_connection_change_workflow.md), [WebSocket Connection Lifecycle](websocket_connection_lifecycle.md), [Backend API WebSocket Docs Hub](../backend/api/websocket/README.md) |
| Transcription websocket | `GET /ws/transcription` | `backend/src/api/routes/transcription/router.py`, `backend/src/api/services/transcription/*` | [Voice and Audio Channels](../channels/voice_and_audio_channels.md) |
| Install auth | `POST /api/install/register`, REST middleware, websocket auth | `backend/src/api/auth/*`, websocket connection auth | [Gateway Auth and Health Runbook](gateway_auth_and_health_runbook.md), [Hosted Backend Auth](../operations/hosted_backend_auth.md) |
| Hosted REST APIs | `/api/artifacts/*`, `/api/sdk/*`, `/api/embeddings/*`, `/api/semantic/*`, `/api/runs/*` | backend route packages | [REST Route Auth Matrix](rest_route_auth_matrix.md), [HTTP and WebSocket API Surface](../reference/http_api_surface.md) |
| Deployment edge | `api.windieos.com` via Cloudflare/self-host | scripts and operations docs | [Gateway Troubleshooting](gateway_troubleshooting.md), [Cloudflared Self-Host Runbook](../operations/cloudflared_self_host_windieos.md) |

## Change Paths

### Add or Change a Hosted Route

Read:

- [Gateway Protocol Map](gateway_protocol_map.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)
- [Backend API and Transport](../backend/api/api_and_transport.md)

Likely code:

- `backend/src/api/routes/**`
- `backend/src/api/routes/__init__.py`
- route models/services for the affected package
- SDK client wrappers if public to developers

Validate route/model tests, API reference examples, SDK clients when applicable, and `<windie> docs list`.

### Change Hosted Auth

Read:

- [Gateway Auth and Health Runbook](gateway_auth_and_health_runbook.md)
- [Hosted Backend Auth](../operations/hosted_backend_auth.md)
- [Security Hub](../security/README.md)

Likely code:

- `backend/src/api/auth/*`
- `backend/src/api/routes/websocket/connection.py`
- `backend/src/main.py`
- frontend/SDK token propagation code

Validate install registration, REST middleware, websocket auth, mismatch handling, and same-user connection cleanup tests.

### Change the Main WebSocket Lifecycle

Read:

- [WebSocket Connection Change Workflow](websocket_connection_change_workflow.md)
- [WebSocket Connection Lifecycle](websocket_connection_lifecycle.md)
- [Backend API WebSocket Docs Hub](../backend/api/websocket/README.md)

Likely code:

- `backend/src/api/routes/websocket/router.py`
- `backend/src/api/routes/websocket/connection.py`
- `backend/src/api/routes/websocket/message_parse_runtime.py`
- `backend/src/api/routes/websocket/message_handler.py`
- `backend/src/api/routes/websocket/loop_runtime.py`
- `backend/src/api/routes/websocket/task_manager.py`
- `backend/src/api/transport/websocket.py`

Validate handshake/auth, parse/runtime, route loop, task-manager, handler, and safe-websocket tests for the changed layer.

### Debug Hosted Availability

Read:

- [Gateway Troubleshooting](gateway_troubleshooting.md)
- [Operational Troubleshooting](../operations/operational_troubleshooting.md)
- [Cloudflared Self-Host Runbook](../operations/cloudflared_self_host_windieos.md)
- [Runtime Configuration Matrix](../operations/runtime_configuration_matrix.md)

Likely owners:

- `502`: Cloudflare tunnel or origin backend process
- `401`: install auth or runs key auth
- websocket `1008`: handshake/auth/schema policy violation
- route `404`: router registration or endpoint mismatch
- health endpoint unhealthy: provider/service readiness

## Related Hubs

- [Channels Hub](../channels/README.md)
- [Security Hub](../security/README.md)
- [Operations Hub](../operations/README.md)
- [SDK Hub](../sdk/README.md)
- [Automation Hub](../automation/README.md)
