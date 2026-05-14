---
summary: "Hosted backend client guide for WindieOS TypeScript and Python SDK wrappers over artifacts, SDK HTTP routes, and websocket query transport."
read_when:
  - When changing SDK client transport behavior.
  - When integrating external tooling with hosted WindieOS backend APIs.
title: "Hosted Backend Clients"
---

# Hosted Backend Clients

WindieOS includes transport-only SDK clients for hosted backend APIs. These clients are intentionally separate from the Electron renderer `ApiClient`, which talks through app-internal IPC.

## TypeScript Client

Path: `frontend/src/renderer/infrastructure/api/windieSdkClient.ts`

Use it for direct backend access to:

- `/api/artifacts/*`
- `/api/sdk/*`
- `/ws`

Custom clients can define the agent they want to run by sending
`agent_definition` in the `/ws` handshake. See
[Agent Definition Contract](agent_definition.md).

## Python Client

Path: `frontend/src/main/python/core/windie_sdk_client.py`

The Python client mirrors the hosted backend access pattern for sidecar/developer tooling.
`connect_agent(..., agent_definition={...})` sends the same first-class agent
definition object used by Electron and future REST agent APIs.

## Auth and Endpoints

- Hosted requests use the active backend base URL.
- Hosted `/api/*` requests require install-token authorization except install registration.
- WebSocket sessions use the same hosted identity rules as the desktop app.

## Not for Local Tool Execution

These clients do not execute local desktop tools. For screenshots, click/type, browser actions, files, and processes, use the desktop app's sidecar tool path.
