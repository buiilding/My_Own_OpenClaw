---
summary: "Web and SDK client integration guide for WindieOS hosted backend APIs, TypeScript/Python clients, websocket query transport, artifacts, SDK routes, and non-Electron boundaries."
read_when:
  - When integrating a non-Electron client with WindieOS hosted backend APIs.
  - When changing SDK transport behavior, artifact access, query websocket clients, or public client docs.
title: "Web Client Integration"
---

# Web Client Integration

WindieOS hosted clients talk directly to the backend. They do not use Electron IPC and they do not execute local desktop tools through the SDK local runtime.

## Client Types

| Client | Current path | Use for | Not for |
| --- | --- | --- | --- |
| TypeScript hosted client | `packages/windie-sdk-js` | artifacts, SDK routes, websocket query transport | Electron-only renderer state |
| Python hosted client | `frontend/src/main/python/windie/sdk.py` | Python SDK hosted backend access | direct local desktop automation without local runtime tool path |
| Electron renderer app-runtime facades | `frontend/src/renderer/app/runtime/*` | app-internal UI/runtime requests | public browser SDK contract |
| VM worker runtime | `frontend/src/main/app/vm_worker_runtime.cjs` | `/api/runs/*` assignment/control and normal websocket dispatch | normal desktop user query routing |

The retired Electron renderer SDK re-export facade has been removed.
First-party Electron renderer code uses app-runtime facades under
`frontend/src/renderer/app/runtime/*`; non-Electron clients should import the
SDK package instead of reaching into renderer infrastructure.

## Integration Checklist

1. Choose the route family: websocket, artifacts, SDK, memory/semantic, or runs.
2. Confirm auth model: install token, runs API key, or unauthenticated registration.
3. Confirm endpoint base URL and websocket URL.
4. Add typed request/response handling in the client.
5. Filter hosted client POST payloads to the route-owned request model before
   JSON serialization when the backend Pydantic model forbids extras.
6. Update [HTTP and WebSocket API Surface](../reference/http_api_surface.md) when routes change.
7. Add backend route/schema tests and client tests.
8. Document whether the client can run outside Electron.

## Boundary Rules

- Hosted clients can call backend APIs.
- Hosted clients cannot directly run local screenshot, mouse, keyboard, file, process, or browser tools.
- Local tools execute through the desktop app's local runtime path.
- SDK perception routes can expose backend OCR/vision/introspection without starting Electron.
- Websocket query clients must handle streamed events and tool-call handoff explicitly if they are not the desktop app.

## Related Docs

- [Hosted Backend Clients](../sdk/hosted_backend_clients.md)
- [SDK Hub](../sdk/README.md)
- [HTTP and WebSocket API Surface](../reference/http_api_surface.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)
- Automation Hub (private backend docs)
