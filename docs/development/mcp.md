---
summary: "Developer guide for connecting Model Context Protocol servers to WindieOS agents through the local Electron MCP runtime."
read_when:
  - When adding MCP servers, MCP-backed tools, or MCP diagnostics to WindieOS.
  - When deciding whether an external integration should be a sidecar tool, plugin tool, MCP server, or backend remote tool.
---

# MCP Runtime

WindieOS treats MCP servers as local extension runtime inputs. Electron main
starts configured MCP servers, initializes the MCP JSON-RPC session, discovers
`tools/list`, converts those tools into `client_tool_manifest` entries, and
executes `tools/call` locally when the model invokes an MCP-backed tool.

The backend does not need MCP-specific tool code. It sees normal client-local
tools with `execution_target: "sidecar"` and `argument_resolution:
"passthrough"`, validates the manifest, and emits tool calls back to the
frontend.

## Add An MCP Server

Create this package shape:

```text
extensions/github-mcp/
  extension.json
  mcp/
    servers.json
```

`extension.json` only identifies the package:

```json
{
  "id": "github-mcp",
  "name": "GitHub MCP"
}
```

Declare MCP servers in `mcp/servers.json`:

```json
{
  "servers": [
    {
      "id": "memory",
      "command": "node",
      "args": ["mcp/memory-mcp.cjs"],
      "cwd": ".",
      "env": {
        "MEMORY_DB": "notes.sqlite"
      }
    }
  ]
}
```

Use `plugin/index.cjs` only when the MCP server spec needs runtime logic,
config, or permissions:

```js
module.exports = function register(api) {
  api.registerMcpServer({
    id: "memory",
    command: "node",
    args: ["mcp/memory-mcp.cjs"],
    tools: [
      {
        name: "search",
        description: "Search local memory.",
        schema: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
          additionalProperties: false,
        },
      },
    ],
  });
};
```

`tools` is optional. When live MCP discovery succeeds, WindieOS uses the server's
`tools/list` response. Declared tools are fallback schemas for offline
diagnostics and for development environments where the MCP server is not
running yet.

## Server Spec Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable local server id. Used in generated MCP tool names. |
| `command` | yes | Executable command, such as `node`, `npx`, `python`, or an absolute binary path. |
| `args` | no | Arguments passed to the command. |
| `cwd` | no | Working directory. Relative paths are resolved inside the extension package. |
| `env` | no | Extra environment variables for the MCP process. Do not commit real credentials. |
| `enabled` | no | Set `false` to keep a server declared but not loaded. |
| `timeout_ms` | no | Request timeout for initialize, discovery, and calls. |
| `tool_prefix` | no | Override generated model-visible tool prefix. |
| `tools` | no | Fallback tool schemas if live `tools/list` discovery fails. |

## Tool Naming

MCP tools are exposed to the model as:

```text
mcp_<server_id>__<tool_name>
```

Example: server `memory`, MCP tool `search` becomes `mcp_memory__search`.

Use `tool_prefix` on the MCP server spec only when a stable public name is
needed:

```json
{
  "id": "memory",
  "tool_prefix": "local_memory"
}
```

That exposes `local_memory__search`.

## Runtime Flow

1. Extension `mcp/servers.json` files and `plugin/index.cjs` files register MCP servers.
2. Electron main starts each enabled MCP server over stdio.
3. Electron main sends MCP `initialize` and `notifications/initialized`.
4. Electron main calls `tools/list`.
5. Discovered tools are appended to `client_tool_manifest`.
6. Backend validates and projects the schemas like any other client-local tool.
7. When the backend emits an MCP tool call, Electron main intercepts it and
   sends MCP `tools/call`.
8. The MCP result is normalized into WindieOS tool result data.

## What Devs Should Not Edit

For normal MCP integrations, do not edit:

- `frontend/src/main/mcp_runtime.cjs`
- `frontend/src/main/extension_manifest.cjs`
- backend tool registries
- Python sidecar tool registries

Edit those only when changing the WindieOS MCP platform itself. A normal MCP
integration should be added entirely under `extensions/<id>/`.

## When To Use MCP

Use MCP when the integration already has, or should have, a protocol boundary:

- external developer tools
- databases and knowledge systems
- workspace-specific servers
- language servers
- services that should be reusable outside WindieOS

Use a sidecar tool when the integration is WindieOS-local Python execution.
Use `api.registerTool` when the integration is lightweight Electron-main logic.
Use a backend remote tool when execution must happen on the hosted backend.

## Validation

Run the focused MCP and manifest tests after changing this runtime:

```bash
cd frontend
npm test -- --runTestsByPath ../tests/frontend/McpRuntime.test.cjs ../tests/frontend/ExtensionManifest.test.cjs ../tests/frontend/LocalBackendBridgeExtensionRuntime.test.cjs ../tests/frontend/AgentCapabilityHandshake.test.cjs --runInBand
```

Also run backend client manifest tests when changing the shape sent to the
backend:

```bash
./scripts/python-in-env backend pytest tests/backend/test_client_tool_manifest.py
```
