---
summary: "Web surfaces hub for WindieOS landing page, hosted backend APIs, SDK routes, websocket clients, and dashboard-adjacent surfaces."
read_when:
  - When changing web-facing docs, landing page behavior, SDK HTTP routes, or hosted backend access.
  - When deciding whether a feature is a desktop renderer surface or a web/API surface.
title: "Web Surfaces"
---

# Web Surfaces

WindieOS is primarily a desktop app, but it has web-facing surfaces:

- the public landing page under `frontend/src/landing`
- hosted backend HTTP routes
- hosted websocket query transport
- SDK/introspection routes
- artifact routes
- future dashboard/control surfaces

## Current Surfaces

| Surface | Owner | Code |
| --- | --- | --- |
| Landing page | Frontend Vite/Electron repo | `frontend/src/landing` |
| WebSocket query transport | Backend API | `backend/src/api/routes/websocket/*` |
| Artifacts HTTP API | Backend API/services | `backend/src/api/routes/artifacts/*`, `backend/src/services/artifacts/*` |
| SDK/introspection routes | Backend API | `backend/src/api/routes/sdk/*` |
| Runs/VM control API | Backend API/services | `backend/src/api/routes/runs/*` |

## Rules

- Do not treat renderer dashboard code as a browser-hosted dashboard without checking Electron assumptions.
- Keep hosted REST and websocket auth behavior aligned with install-token auth.
- Keep SDK client docs explicit about direct backend access vs app-internal Electron IPC.

## Related Docs

- [Frontend Landing Docs Hub](../frontend/landing/README.md)
- [Backend API Docs Hub](../backend/api/README.md)
- [API Reference](../reference/api_reference.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)
- [Deployment](../operations/deployment.md)
