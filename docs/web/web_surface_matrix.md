---
summary: "Web-facing surface matrix for WindieOS landing page, hosted backend APIs, websockets, SDK routes, artifacts, VM runs, and future dashboard/control surfaces."
read_when:
  - When deciding whether a change belongs to the landing page, hosted backend API, websocket protocol, SDK client, Electron renderer, or future dashboard surface.
  - When adding public web/API docs or exposing a backend route to non-Electron clients.
title: "Web Surface Matrix"
---

# Web Surface Matrix

WindieOS is desktop-first. Web-facing surfaces are either the public landing page or hosted backend APIs used by the desktop app, SDK clients, and VM workers. Do not assume the Electron renderer dashboard is safe to host in a normal browser without checking Electron IPC and local runtime assumptions.

## Surface Map

| Surface | Current state | Owner | Public contract |
| --- | --- | --- | --- |
| landing page | implemented | `frontend/landing.html`, `frontend/src/landing/*` | static/product web surface |
| main agent websocket | implemented | `backend/src/api/routes/websocket/*` | `/ws` stream protocol |
| transcription websocket | implemented | `backend/src/api/routes/transcription/router.py` | `/ws/transcription` audio transcription gateway |
| install registration | implemented | backend install-auth routes/services | `POST /api/install/register` |
| artifacts API | implemented | `backend/src/api/routes/artifacts/*`, `backend/src/services/artifacts/*` | upload/fetch artifact files |
| SDK/introspection API | implemented | `backend/src/api/routes/sdk/*`, `backend/src/sdk` | OCR, vision, prompt preview, query plan, debug introspection |
| memory/inference API | implemented | `backend/src/api/routes/memory/*` | embeddings, semantic summarize/title, health |
| VM runs API | implemented | `backend/src/api/routes/runs/*`, `backend/src/services/vm_run_control.py` | hosted VM run control plane |
| hosted web dashboard | future/planned | not a standalone web app today | do not document as current product behavior |

## Change Routing

| Change | Start docs | Code roots |
| --- | --- | --- |
| update public landing copy/sections | [Landing Page Change Workflow](landing_page_change_workflow.md), [Landing Page](landing_page.md) | `frontend/src/landing/*` |
| add/change hosted REST route | [Hosted API and Auth](hosted_api_and_auth.md), [Gateway Protocol Map](../gateway/gateway_protocol_map.md) | `backend/src/api/routes/*` |
| add/change websocket event | [HTTP and WebSocket API Surface](../reference/http_api_surface.md), [WebSocket Event Reference](../reference/websocket_event_reference.md) | `backend/src/api/routes/websocket/*`, renderer event consumers |
| expose SDK/client helper | [Web Client Integration](web_client_integration.md), [SDK Hub](../sdk/README.md) | `backend/src/api/routes/sdk/*`, `packages/windie-sdk-js`, `frontend/src/main/python/core` |
| add VM run control feature | [Automation Hub](../automation/README.md) | `backend/src/api/routes/runs/*`, `frontend/src/main/app/vm_worker_runtime.cjs` |
| make a browser-hosted dashboard | planning first | identify Electron IPC, local runtime, auth, and filesystem assumptions before implementation |

## Rules

- Hosted backend APIs should be documented in route-level reference docs, not only in frontend code comments.
- SDK consumers should not need Electron IPC or local-runtime Python for hosted API calls.
- Local desktop tools remain local-runtime executed; do not expose local filesystem/shell/computer control as generic hosted web endpoints.
- New public routes need auth, CORS, payload, client, and test coverage decisions.

## Related Docs

- [Web Surfaces Hub](README.md)
- [Hosted API and Auth](hosted_api_and_auth.md)
- [Web Client Integration](web_client_integration.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)
