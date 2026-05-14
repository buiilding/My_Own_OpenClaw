---
summary: "Local sidecar daemon HTTP/WebSocket contract, discovery token model, dynamic module/plugin/MCP registration, and executor-only responsibility boundary."
read_when:
  - When changing the Python sidecar daemon, local tool registration, daemon auth, sidecar discovery, or SDK local execution.
  - When deciding whether a capability belongs in backend policy or local executor code.
title: "Sidecar Daemon Runtime Reference"
---

# Sidecar Daemon Runtime Reference

The Python sidecar daemon is the canonical local executor. It does not own backend policy, model lists, OCR/vision availability, paid capability gates, or prompt construction.

## Process Contract

The daemon:

- binds an HTTP/WebSocket server on localhost
- generates a random per-process token unless a test explicitly provides one
- writes a discovery file containing `pid`, `host`, `port`, `base_url`, `token`, and `created_at`
- exposes built-in sidecar tools through the existing `ToolRegistry`
- dynamically registers module-path tools, extension/plugin tools, and MCP tools without restart

Default discovery path:

```text
${TMPDIR}/windieos/sidecar-daemon.json
```

Every endpoint requires the token in either:

- `x-windie-sidecar-token: <token>`
- `Authorization: Bearer <token>`

## Endpoints

```text
GET  /health
GET  /status
POST /shutdown

GET  /tools
POST /tools/register-module
POST /plugins/register
POST /mcps/register
GET  /permissions
POST /permissions/request

POST /execute-tool
WS   /events
```

`/tools` returns the executable local tool manifest. This is sidecar-owned diagnostic/execution shape, not the backend's policy-filtered model-visible schema.

## Module Tool Registration

Request:

```json
{
  "name": "save_note",
  "description": "Save a local note.",
  "module": "my_project.tools:save_note",
  "workspace_path": "/Users/me/project",
  "schema": {
    "type": "object",
    "properties": {
      "text": { "type": "string" }
    },
    "required": ["text"],
    "additionalProperties": false
  }
}
```

The sidecar imports `module:function`, wraps either raw `args` handlers or keyword handlers, stores the schema in the dynamic manifest, and executes the tool through the same `ToolRegistry.execute_tool` path as built-ins.

## Plugin Registration

`POST /plugins/register` accepts a local extension/plugin path. The path can point at one extension directory with `extension.json` or a root containing multiple extension directories.

Plugin tools use the existing extension manifest contract:

- `name`
- `description`
- `entrypoint`
- `schema`

## MCP Registration

`POST /mcps/register` accepts one MCP server spec or `{ "servers": [...] }`.

Each server spec includes:

- `id`
- `command`
- `args`
- `cwd`
- `env`
- `tool_prefix`
- optional fallback `tools`

The daemon starts the MCP process over stdio, runs `initialize`, discovers `tools/list`, exposes each MCP tool as a sidecar runtime tool, and forwards execution to `tools/call`.

## Permissions

The daemon reports local execution needs but does not make user-facing approval decisions. Permission prompting remains with the host application, currently Electron main and renderer UI.

`POST /permissions/request` returns `202 requires_host_prompt` until the host binds an approval UI to the daemon event/control channel.
