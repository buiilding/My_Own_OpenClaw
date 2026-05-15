---
summary: "SDK hub for WindieOS hosted backend clients, SDK routes, query planning, tracing, artifacts, OCR, vision, and tool authoring."
read_when:
  - When integrating with WindieOS programmatically.
  - When changing SDK clients, SDK routes, or hosted developer-facing APIs.
title: "SDK Hub"
---

# SDK Hub

WindieOS SDK docs cover the canonical client runtime for hosted backend access and local sidecar execution. Electron, future CLIs, and SDK users should share this runtime instead of owning separate backend websocket loops.

## SDK Pages

- [Hosted Backend Clients](hosted_backend_clients.md)
- [WindieClient Runtime Contract](windie_client_runtime.md)
- [Agent Definition Contract](agent_definition.md)
- [SDK Route Change Workflow](sdk_route_change_workflow.md)
- [SDK Auth and Error Handling](sdk_auth_and_error_handling.md)
- [Query Planning and Trace](query_planning_and_trace.md)
- [OCR and Vision SDK](ocr_and_vision.md)
- [Tool Authoring](tool_authoring.md)

## Client Implementations

- TypeScript package: `packages/windie-sdk-js` publishes as `@windie/sdk`.
- TypeScript compatibility export: `frontend/src/renderer/infrastructure/api/windieSdkClient.ts`
- Python package: `packages/windie-sdk-python` publishes as `windie-sdk` and imports as `windie`.
- Python compatibility export: `frontend/src/main/python/core/windie_sdk_client.py`
- Renderer API barrel: `frontend/src/renderer/infrastructure/api/index.ts`
- Sidecar package export: `frontend/src/main/python/core/__init__.py`

## API Owners

- SDK routes: `backend/src/api/routes/sdk/*`
- Artifact routes: `backend/src/api/routes/artifacts/*`
- Websocket: `backend/src/api/routes/websocket/*`
- Agent definition schema: `backend/src/api/schemas/agent_definition.py`

## Rule

Use `WindieClient.wakeUp(...)` for agent sessions. The SDK runtime owns the hosted backend websocket and delegates local execution to the sidecar daemon. The backend remains the owner of model lists, provider policy, OCR/vision availability, and paid capability gates.
