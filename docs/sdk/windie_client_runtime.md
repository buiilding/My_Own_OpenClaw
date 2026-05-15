---
summary: "Final WindieClient runtime contract for SDK callers, Electron main, hosted backend websocket ownership, local sidecar daemon registration, and tool-result routing."
read_when:
  - When changing `WindieClient.wakeUp`, backend websocket ownership, or local sidecar daemon integration.
  - When adding SDK, CLI, Electron, plugin, MCP, or module-tool entrypoints.
title: "WindieClient Runtime Contract"
---

# WindieClient Runtime Contract

## Runtime Boundary

`WindieClient` is the canonical agent client runtime.

```text
Electron main / future CLI / SDK users
        |
        v
TS Windie SDK runtime
        |---------------- hosted backend HTTP/WebSocket
        |
        |---------------- local sidecar daemon HTTP/WebSocket
                              |
                              |-- built-in tools
                              |-- module-path tools
                              |-- plugin tools
                              |-- MCP tools
```

Ownership rules:

- SDK runtime owns hosted backend HTTP/WebSocket connection, handshake, query, stop, settings, event fan-out, and tool-result return.
- sidecar daemon owns local execution only.
- backend owns model/provider selection, paid capability gates, OCR/vision/prediction/web-search availability, prompt construction, session policy, and remote/backend tools.
- Electron owns windows, renderer IPC, overlays, permission prompts, display/screenshot integration, and settings UI.

Local runtime facts must not unlock backend capabilities. In particular, coordinate methods are backend policy/provider outputs. The client can report or narrow local executable tools; it cannot grant OCR, vision, prediction, or paid backend capabilities.

## Public API

```ts
const client = new WindieClient({
  sidecarDaemon: {
    baseUrl: "http://127.0.0.1:43123",
    token: "per-process-token"
  }
});

const agent = await client.wakeUp({
  backendUrl: "https://api.windieos.com",
  systemPrompt: "You are a concise coding agent.",
  workspacePath: "/Users/me/project",
  tools: [
    moduleTool({
      name: "save_note",
      description: "Save a local note.",
      module: "my_project.tools:save_note",
      schema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
        additionalProperties: false
      }
    })
  ],
  skills: [],
  mcps: [],
  plugins: []
});

await agent.ask("Read the repo instructions and summarize the tests.");
```

`wakeUp` performs this sequence:

1. Resolve the hosted backend URL.
2. Ensure a sidecar runtime client is available when local execution is needed.
3. Register module/plugin/MCP tools with the sidecar daemon.
4. Read the sidecar tool manifest.
5. Build the low-level backend `agent_definition`.
6. Connect to the backend websocket.
7. Send the websocket handshake with `agent_definition`.
8. Route backend events to callers and route local `tool-call` events to the sidecar daemon.

## Low-Level Agent Definition

`agent_definition` remains the hosted backend wire contract, not the normal authoring surface.

The SDK builds:

```json
{
  "version": 1,
  "id": "windie-agent-...",
  "name": "Windie Agent",
  "system_prompt": {
    "mode": "replace",
    "content": "You are a concise coding agent."
  },
  "tools": {
    "mode": "default_plus_client",
    "client_manifest": {
      "version": 1,
      "tools": []
    }
  },
  "skills": [],
  "mcps": [],
  "plugins": [],
  "runtime": {
    "workspace_path": "/Users/me/project",
    "operating_system": "macOS"
  }
}
```

`runtime.operating_system` is detected by the SDK runtime. It is not a public wake-up parameter.

## Local Runtime Options

Electron uses `sidecar_daemon_manager.cjs` to start or reuse the daemon and then
passes the daemon client into the SDK runtime. Non-Electron SDK hosts can provide
either:

- `ensureLocalRuntime`: an async provider that starts/reuses a daemon and returns
  a `WindieLocalRuntimeClient` when `wakeUp` needs local execution.
- `sidecar`: a custom `WindieLocalRuntimeClient` implementation.
- `localRuntime`: an alias for the same custom runtime interface.
- `sidecarDaemon`: daemon `baseUrl` and per-process `token`; `WindieClient`
  creates a `SidecarDaemonHttpClient` and uses `/status`, registration endpoints,
  `/tools`, and `/execute-tool`.

`wakeUp` calls `ensureLocalRuntime` only when module tools, plugins, or MCP
servers require local execution and no explicit `sidecar`, `localRuntime`, or
`sidecarDaemon` was configured.

The SDK does not accept raw JavaScript/Python closures as durable tools.
Module tools must be registered by import path, plugin tools by package path, and
MCP tools by server spec.

## Event And Tool Routing

Inbound backend event flow:

```text
backend websocket event -> SDK session -> Electron/UI/SDK listeners
```

For local tool calls:

```text
backend tool-call -> SDK session -> sidecar /execute-tool -> backend tool-result
```

The SDK skips local execution when backend metadata marks the event as `skip_frontend_execution`.

In Electron main, backend `tool-call` and `tool-bundle` events are routed through
the SDK-owned main runtime before renderer fan-out. The renderer still receives
the event for chat, transcript, overlay, and debugging surfaces, but the event is
marked with `metadata.skip_frontend_execution = true` and
`metadata.execution_owner = "sdk-runtime"` so renderer tool runners do not execute
the same local action twice.

## Public Methods

Current canonical surface:

- `wakeUp`
- `ask`
- `query`
- `stop`
- `sleep`
- `run`
- `stream`
- `shutdownLocalRuntime`
- `listModels`
- `listAgents`
- `listTools`
- `status`

`listModels` is backend-owned. `listAgents` is SDK-runtime state for active local agent sessions.
