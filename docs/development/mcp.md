---
summary: "Developer guide for MCP server config and connecting Model Context Protocol servers to WindieOS agents, including MCP discovery, enablement, execution, and raw tool-result preservation."
read_when:
  - When adding MCP server config, MCP servers, MCP-backed tools, or MCP diagnostics to WindieOS.
  - When debugging MCP tool result output, raw MCP result preservation, `data.output`, or `data.mcp_result`.
  - When deciding whether an external integration should be a local-runtime plugin, skill, MCP server, or backend remote tool.
title: "MCP Runtime"
---

# MCP Runtime

MCP servers are declared under the repo-level `mcps` root. They are not nested
inside a plugin package.

```text
mcps/
  memory/
    mcp.json
    server.cjs
```

Electron main reads `mcp.json` for dashboard/config presentation and forwards
enabled server specs to the SDK local runtime. The local runtime starts
configured stdio servers through the local-runtime Python implementation, discovers
`tools/list`, registers discovered tools into the executable local tool
registry, and executes `tools/call` when the model invokes an MCP-backed tool.

The backend does not need MCP-specific tool code. It sees normal client/local-runtime
tools with `execution_target: "local_runtime"` and `argument_resolution:
"passthrough"`, validates the manifest, and emits tool calls back to the
frontend.

Powerful MCP integrations should use explicit enablement. A server can be
visible in the dashboard without becoming model-visible by setting
`"requires_user_enable": true`; Electron main filters those servers out of
discovery, `client_tool_manifest`, `available_tools`, and execution until the
local user enables them.

The renderer MCP dashboard consumes registry and card/status presentation
values from `desktopMcpRuntimeClient.ts`. Dashboard components should not parse
raw server `status`, `effective_enabled`, command, args, or tool fields while
rendering cards; the runtime client keeps that registry-payload presentation
contract centralized.

## Add An MCP Server

Create `mcps/<id>/mcp.json`:

```json
{
  "id": "memory",
  "command": "node",
  "args": ["server.cjs"],
  "cwd": ".",
  "requires_user_enable": true,
  "env": {
    "MEMORY_DB": "notes.sqlite"
  },
  "tools": [
    {
      "name": "search",
      "description": "Search local memory.",
      "schema": {
        "type": "object",
        "properties": {
          "query": { "type": "string" }
        },
        "required": ["query"],
        "additionalProperties": false
      }
    }
  ]
}
```

`tools` is optional. When live MCP discovery succeeds, WindieOS uses the server's
`tools/list` response. Declared tools are fallback schemas for offline
diagnostics and development environments where the MCP server is not running.

`mcp.json` can also contain `{ "servers": [...] }` if one MCP folder needs to
declare multiple server processes.

## Server Spec Fields

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable local server id. Used in generated MCP tool names. |
| `command` | yes | Executable command, such as `node`, `npx`, `python`, or an absolute binary path. |
| `args` | no | Arguments passed to the command. |
| `cwd` | no | Working directory. Relative paths are resolved inside the MCP folder. |
| `env` | no | Extra environment variables for the MCP process. Do not commit real credentials. |
| `enabled` | no | Set `false` to keep a server declared but not loaded. |
| `requires_user_enable` | no | Set `true` for integrations that must be explicitly enabled before discovery or execution. |
| `timeout_ms` | no | Request timeout for initialize, discovery, and calls. |
| `tool_prefix` | no | Override generated model-visible tool prefix. |
| `tools` | no | Fallback tool schemas if live `tools/list` discovery fails. |

The local-runtime registration boundary rejects removed camelCase fields such as
`timeoutMs`, `toolPrefix`, `mcpId`, and `extensionId`; use the snake_case
fields above.

## Tool Naming

MCP tools are exposed to the model as:

```text
mcp_<server_id>__<tool_name>
```

Example: server `memory`, MCP tool `search` becomes `mcp_memory__search`.

Use `tool_prefix` only when a stable public name is needed:

```json
{
  "id": "memory",
  "tool_prefix": "local_memory"
}
```

That exposes `local_memory__search`.

## Runtime Flow

1. Electron main reads `mcps/*/mcp.json`.
2. Dashboard MCPs can list configured servers through the Electron main
   `ipc_extension_mcp_handlers.cjs` IPC helper without enabling or starting
   them.
3. Electron main filters `requires_user_enable` servers against the local
   `agent_enabled_mcp_servers` allowlist.
   WindieOS also supplies the startup-only `WINDIE_ENABLED_MCPS` allowlist env
   key through the main host skin for development and automation runs.
4. When a user enables a gated MCP from the dashboard,
   `ipc_desktop_ui_config_store.cjs` persists the allowlist change with MCP
   preservation disabled for that explicit toggle path, and
   `ipc_mcp_refresh_runtime.cjs` immediately runs a discovery pass. The manual
   refresh action remains the retry path after installing binaries or granting
   permissions.
5. Electron main sends enabled server specs to the SDK local runtime.
6. The local runtime starts each enabled MCP server over stdio through the
   local-runtime Python implementation.
7. The local runtime sends MCP `initialize` and `notifications/initialized`.
8. The local runtime calls `tools/list`.
9. Discovered tools are registered as executable local-runtime tools and
   exposed through the client tool manifest.
10. Backend validates and projects the schemas like any other client/local-runtime tool.
11. When the backend emits an MCP tool call, the SDK routes it to the local
    runtime like any other local tool.
12. The local runtime sends MCP `tools/call`.
13. The MCP result is wrapped into native tool result data.

## MCP Tool Result Contract

MCP adapters must preserve raw MCP tool results for every MCP-backed tool,
current and future. The adapter may wrap the MCP result in the native
`tool-result` envelope, but it must not summarize, flatten, or discard MCP
`content`, `structuredContent`, or other returned fields.

The model-facing `data.output` should contain the serialized MCP result content
so the model can see the same data the MCP server returned, including
structured data such as CUA window lists. When image content is promoted into a
native image field, `data.output` must elide the image bytes so base64 does not
pollute model/display text. The raw MCP object must also remain available as
`data.mcp_result` for inspection and debugging.

When debugging an MCP-backed tool result, inspect both fields. `data.output`
proves what the model-facing history saw, while `data.mcp_result` proves what
the MCP server actually returned before the adapter added native display fields
or elided image bytes from model text.

Image content is additive: when an MCP result includes an image item, promote
that image into WindieOS native image fields such as `data.screenshot` and
`data.screenshot_content_type`, while keeping the original MCP image item in
the preserved raw result.

Each discovery pass reconciles the executable MCP tool registry with the current
enabled server specs. Removed, disabled, duplicate, or manifest-disabled MCP
tools are not left executable through stale registry entries.
Execution also checks the latest local allowlist before calling a gated MCP
tool, so stale model-visible tool calls are refused after disablement.
Execution diagnostics accept snake_case metadata (`request_id`,
`tool_call_id`, `correlation_id`, `bundle_id`, `turn_ref`,
`conversation_ref`) and reject removed camelCase metadata aliases.

## CUA Driver

`mcps/cua-driver/mcp.json` declares CUA Driver as a disabled-by-default MCP:

- command: `cua-driver`
- args: `["mcp"]`
- model-visible prefix after enablement/discovery: `cua_driver__*`
- schema source: live `tools/list`

Do not commit a local checkout path or generated CUA fallback schemas. If the
binary is not on `PATH`, the MCPs dashboard reports `Not installed`; if CUA
starts but macOS automation grants are missing, the status reports
`Needs permission`.

On macOS, the local-runtime Python implementation also resolves `cua-driver`
to the installed `/Applications/CuaDriver.app/Contents/MacOS/cua-driver`
binary, then `~/.local/bin/cua-driver`, before surfacing `Not installed`. This
keeps the GUI app from depending on interactive shell PATH setup after the CUA
installer runs.

MCP enablement, registration, discovery, and execution emit persistent app
diagnostics:

- `mcp.enablement`: dashboard toggle,
  `ipc_desktop_ui_config_store.cjs` desktop UI config persistence, and registry
  refresh/list after enablement changes.
- `mcp.registration`: SDK/local-runtime registration through the local runtime
  `/mcps/register` boundary, including replace/reconcile and registered tool
  counts.
- `mcp.discovery`: local-runtime MCP subprocess startup, initialize, and
  `tools/list`.
- `mcp.execution`: MCP `tools/call` execution after tools are registered.

Inspect recent discovery failures with:

```bash
<windie> diagnostics list --path mcp.discovery --limit 10 --json
```

Inspect persistence or registration gaps with:

```bash
<windie> diagnostics list --path mcp.enablement --limit 10 --json
<windie> diagnostics list --path mcp.registration --limit 10 --json
```

Use the returned `traceId` with `<windie> diagnostics inspect <trace-id>
--json` to see spawn, initialize, `tools/list`, timeout, elapsed-time, and
stderr-tail events, or the enablement/registration lifecycle rows for the same
MCP path.

After an MCP is enabled while an agent is already awake, Electron main should
route the enabled server specs through `Agent.registerMcps(...)`. The SDK
then owns local-runtime registration, backend `replace_client_manifest`
settings update, in-memory agent-definition mutation, and inclusion of the MCP
tool schemas on the next message.

`ipc_mcp_refresh_runtime.cjs` owns the Electron-main refresh decision after
config changes and startup hydration: it prefers the live Agent SDK
`refreshMcpServers(...)` path, falls back to registry refresh in tests or when
the live agent does not expose that method, and skips startup refresh when the
desktop UI config has no enabled MCP servers.

The live manifest refresh has two observable checkpoints:

- `mcp.registration` app diagnostics show local-runtime registration and
  local-runtime MCP tool counts before a conversation turn exists.
- `agent.definition` and `mcp.tool` conversation traces on the next turn show
  whether the SDK MCP client manifest survived the merge with Electron-provided
  workspace/prompt context. `agent.definition` includes SDK-vs-query manifest
  tool counts so a manifest-less Electron agent definition cannot hide a dropped
  SDK MCP manifest.

## What Devs Should Not Edit

For normal MCP integrations, do not edit:

- `frontend/src/main/extensions/mcp_runtime.cjs`
- `frontend/src/main/extensions/extension_manifest.cjs`
- `frontend/src/main/extensions/mcp_control.cjs`
- backend tool registries
- local-runtime executable tool registries backed by local-runtime Python modules

Edit those only when changing the WindieOS MCP platform itself.

## When To Use MCP

Use MCP when the integration already has, or should have, a protocol boundary:

- external developer tools
- databases and knowledge systems
- workspace-specific servers
- language servers
- services that should be reusable outside WindieOS

Use a local-runtime plugin when the integration is WindieOS-local Python execution.
Use a backend remote tool when execution must happen on the hosted backend.

## Validation

Run the focused MCP and registry tests after changing this runtime:

```bash
cd frontend
npm test -- --runTestsByPath ../tests/frontend/McpRuntime.test.cjs ../tests/frontend/ExtensionManifest.test.cjs ../tests/frontend/AgentSdkClient.test.ts --runInBand
```

Also run backend client manifest tests when changing the shape sent to the
backend:

```bash
./scripts/python-in-env backend python -m pytest tests/backend/test_client_tool_manifest.py -q
```
