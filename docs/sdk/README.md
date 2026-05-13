---
summary: "SDK hub for WindieOS hosted backend clients, SDK routes, query planning, tracing, artifacts, OCR, vision, and tool authoring."
read_when:
  - When integrating with WindieOS programmatically.
  - When changing SDK clients, SDK routes, or hosted developer-facing APIs.
title: "SDK Hub"
---

# SDK Hub

WindieOS SDK docs cover direct backend integration. They are separate from Electron app-internal IPC APIs.

## SDK Pages

- [Hosted Backend Clients](hosted_backend_clients.md)
- [SDK Route Change Workflow](sdk_route_change_workflow.md)
- [SDK Auth and Error Handling](sdk_auth_and_error_handling.md)
- [Query Planning and Trace](query_planning_and_trace.md)
- [OCR and Vision SDK](ocr_and_vision.md)
- [Tool Authoring](tool_authoring.md)

## Client Implementations

- TypeScript: `frontend/src/renderer/infrastructure/api/windieSdkClient.ts`
- Python: `frontend/src/main/python/core/windie_sdk_client.py`
- Renderer API barrel: `frontend/src/renderer/infrastructure/api/index.ts`
- Sidecar package export: `frontend/src/main/python/core/__init__.py`

## API Owners

- SDK routes: `backend/src/api/routes/sdk/*`
- Artifact routes: `backend/src/api/routes/artifacts/*`
- Websocket: `backend/src/api/routes/websocket/*`

## Rule

Use SDK clients for hosted backend capabilities. Do not use them as shortcuts for local machine-touching sidecar tools; local tool execution belongs to the desktop app and sidecar runtime.
