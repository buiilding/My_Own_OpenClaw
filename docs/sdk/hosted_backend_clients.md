---
summary: "Hosted backend client guide for TypeScript and Python SDK wrappers over artifacts, SDK HTTP routes, and websocket query transport."
read_when:
  - When changing SDK client transport behavior.
  - When integrating external tooling with hosted backend APIs.
title: "Hosted Backend Clients"
---

# Hosted Backend Clients

The SDK includes transport-only clients for hosted backend APIs and
agent-runtime SDK surfaces for local desktop operators. Direct hosted route
clients are useful for artifacts and SDK HTTP routes. Agent sessions should use
`AgentClient.wakeUp(...)`, not a raw websocket helper.

## TypeScript Client

Package boundary: `packages/windie-sdk-js`

Electron renderer app-runtime contracts facade:
`frontend/src/renderer/app/runtime/desktopConversationRuntimeContracts.ts`

The package name is `@windie/sdk`.

Use it for direct backend access to:

- `/api/artifacts/*`
- `/api/sdk/*`

The normal TypeScript agent surface is `AgentClient.wakeUp(...)`. It builds the
low-level `agent_definition`, owns the hosted backend websocket, and routes local
tool calls through the SDK local runtime. Desktop-style clients use the same API and
subscribe to the returned conversation runtime:

```ts
import { AgentClient } from '@windie/sdk';

const client = new AgentClient({
  backendUrl: 'https://backend.example.com',
  backendSession: 'managed',
  installToken: process.env.AGENT_INSTALL_TOKEN,
});

const agent = await client.wakeUp({
  name: 'My Agent App',
  workspacePath: '/path/to/workspace',
  builtins: 'default',
});

const conversation = agent.conversation();
conversation.subscribeEvents((event, snapshot) => {
  renderRows(snapshot.displayRows);
  renderTurn(snapshot.currentTurn);
});

await conversation.send({ text: 'Inspect this workspace and summarize it' });
```

That app-builder contract is: send user intent, receive SDK display rows/current
turns, and let the SDK own websocket normalization, reconnect/idle lifecycle,
local tool execution, tool-result return, and projection state.

Host UIs should use the same agent/conversation methods for the control
commands that a first-party desktop app needs during normal operation:

```ts
await agent.ensureConnected();
await agent.updateSettings({ model_provider: 'hosted-provider' });
await agent.requestModelList();
await conversation.rehydrateMessages({ conversation_ref, messages, rehydrate_mode: 'replace' });
await conversation.compactHistory({ force: false, payload: { conversation_ref } });
await agent.wakewordDetected({ source: 'desktop' });
await conversation.stop();
```

The important boundary is that a host renders rows and forwards user commands.
It should not own a separate backend websocket command router, tool-result loop,
or display-row projection.

For advanced hosts that need the lower transport directly, the SDK exposes
generic agent-session contracts such as `AgentSessionRuntime`,
`createAgentSession`, `createAgentRuntimeTransport`,
`ManagedAgentSession`, and `createManagedAgentSession`. `AgentSession` and
`ManagedAgentSession` are the canonical hosted-session modules. New app-builder code should
prefer the generic names because the hosted websocket transport is an Agent SDK
runtime concern rather than renderer skin state.
The lower-level managed websocket implementation is private to the SDK transport
package; package-root callers should not import `ManagedWebSocketSession` or
`createManagedWebSocketSession`.
The older `createAgentBackendTransport` compatibility alias has been removed so
host adapters use the runtime-named factory directly.
Hosts that inject a transport into `createConversationRuntime(...)` should type
that adapter as `AgentRuntimeTransport`. The older `BackendTransport`
compatibility type has been removed so new app-builder code sees one reusable
conversation-runtime transport name.

`AgentClient.wakeUp(...)` can run on the SDK managed hosted session. A host may
pass backend endpoints and lifecycle hooks to the client when it needs endpoint
fallback, connection status, or idle-close policy:

```ts
const client = new AgentClient({
  backendEndpoints: [
    { backendUrl: 'https://backend.example.com' },
    { backendUrl: 'http://127.0.0.1:8000' },
  ],
  backendSession: 'managed',
  onBackendClose(close) {
    renderConnection(close.shouldReconnect ? 'reconnecting' : 'offline');
  },
});

const agent = await client.wakeUp({ builtins: 'default' });
```

## Python Client

Package boundary: `packages/windie-sdk-python`

Python implementation path: `frontend/src/main/python/windie/sdk.py`

The distribution name is `windie-sdk`; the public import package is `windie`.
Package discovery is intentionally limited to `windie` and `windie.*` even
though the implementation currently lives next to local-runtime Python modules.
Shared browser/local-runtime contracts such as `windie_shared` are not part of
the public Python SDK distribution.

The Python client mirrors hosted backend route access for local-runtime/developer
tooling. Agent sessions use `AgentSdkClient.wake_up(...)`, which builds the
low-level `agent_definition` from first-class arguments before connecting to the
hosted backend websocket. The public package exports `AgentSdkClient` and
`AgentSdkAgentSession`; the old `WindieSdkClient` and `WindieSdkAgentSession`
compatibility aliases have been removed.

When local module tools, plugins, or MCP servers are supplied, the Python client
uses the same local-runtime contract as the TypeScript runtime: discover or
start the local runtime daemon, register local executable capabilities, include the daemon
tool manifest in `agent_definition`, and route backend `tool-call` /
`tool-bundle` events back through `/execute-tool`. Python SDK callers inject a
custom executor with `local_runtime=...`, choose discovery through
`local_runtime_discovery_file`, and override the daemon script with
`local_runtime_daemon_script`, `AGENT_LOCAL_RUNTIME_DAEMON_SCRIPT`, or legacy
`WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT`. The Python SDK also honors generic
`AGENT_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE` and `AGENT_LOCAL_RUNTIME_PYTHON`
env aliases before the legacy `WINDIE_LOCAL_RUNTIME_DAEMON_DISCOVERY_FILE` and
`WINDIE_PYTHON` fallbacks through the private `windie._runtime_env` fallback
groups.

The Python runtime also exposes `status()`, `list_tools()`, and
`shutdown_local_runtime()` for the resolved local runtime.

Python websocket agent sessions normalize backend-bound payloads before send:

- attachment file bodies are rendered into required backend query
  `payload.content`; attachment filenames remain client/display metadata and are
  not sent to the backend websocket query payload
- `update_settings(...)` filters patches to backend-owned `update-settings`
  keys, including the supported provider API-key and OAuth nested shapes
- local runtime tool-result data keeps complete screenshot `capture_meta` only; partial
  or malformed capture metadata is dropped before the result is returned to the
  backend

## Auth and Endpoints

- Hosted requests use the active backend base URL.
- Hosted `/api/*` requests require install-token authorization except install registration.
- WebSocket sessions use the same hosted identity rules as the desktop app.

## Runtime Boundary

The transport-only hosted clients do not execute local desktop tools. For
screenshots, click/type, browser actions, files, and processes, use
`AgentClient.wakeUp(...)` with a local runtime so the SDK coordinates local-runtime
execution and backend tool-result return.
