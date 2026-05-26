---
summary: "Hosted backend client guide for WindieOS TypeScript and Python SDK wrappers over artifacts, SDK HTTP routes, and websocket query transport."
read_when:
  - When changing SDK client transport behavior.
  - When integrating external tooling with hosted WindieOS backend APIs.
title: "Hosted Backend Clients"
---

# Hosted Backend Clients

WindieOS includes transport-only SDK clients for hosted backend APIs. These clients are intentionally separate from the Electron desktop runtime facades, which talk through app-internal IPC. Agent sessions should use `WindieClient.wakeUp(...)`, not a direct hosted-client websocket helper.

## TypeScript Client

Package boundary: `packages/windie-sdk-js`

Compatibility path: `frontend/src/renderer/infrastructure/api/windieSdkClient.ts`

The package name is `@windie/sdk`.

Use it for direct backend access to:

- `/api/artifacts/*`
- `/api/sdk/*`

The normal TypeScript agent surface is `WindieClient.wakeUp(...)`. It builds the
low-level `agent_definition`, owns the hosted backend websocket, and routes local
tool calls through the sidecar daemon.

## Python Client

Package boundary: `packages/windie-sdk-python`

Compatibility path: `frontend/src/main/python/core/windie_sdk_client.py`

The distribution name is `windie-sdk`; the import package is `windie`.

The Python client mirrors hosted backend route access for sidecar/developer
tooling. Agent sessions use `WindieSdkClient.wake_up(...)`, which builds the
low-level `agent_definition` from first-class arguments before connecting to the
hosted backend websocket.

When local module tools, plugins, or MCP servers are supplied, the Python client
uses the same sidecar daemon contract as the TypeScript runtime: discover or
start the daemon, register local executable capabilities, include the daemon
tool manifest in `agent_definition`, and route backend `tool-call` /
`tool-bundle` events back through `/execute-tool`.

The Python runtime also exposes `status()`, `list_tools()`, and
`shutdown_local_runtime()` for the resolved local daemon.

Python websocket agent sessions normalize backend-bound payloads before send:

- attachment file bodies are sent as `query_context.attachment_context`;
  attachment filenames remain client/display metadata and are not sent to the
  backend websocket query payload
- `update_settings(...)` filters patches to backend-owned `update-settings`
  keys, including the supported provider API-key and OAuth nested shapes
- sidecar tool-result data keeps complete screenshot `capture_meta` only; partial
  or malformed capture metadata is dropped before the result is returned to the
  backend

## Auth and Endpoints

- Hosted requests use the active backend base URL.
- Hosted `/api/*` requests require install-token authorization except install registration.
- WebSocket sessions use the same hosted identity rules as the desktop app.

## Not for Local Tool Execution

These clients do not execute local desktop tools. For screenshots, click/type, browser actions, files, and processes, use the desktop app's sidecar tool path.
