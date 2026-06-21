---
summary: "Local-runtime Python daemon HTTP/WebSocket contract behind the SDK local-runtime boundary, discovery token model, dynamic module/plugin/MCP registration, and executor-only responsibility boundary."
read_when:
  - When changing the local-runtime Python daemon, local tool registration, daemon auth, daemon discovery, or SDK local execution.
  - When deciding whether a capability belongs in backend policy or local executor code.
  - When debugging `baseUrl` discovery metadata rejected by daemon discovery reuse.
title: "Sidecar Daemon Runtime Reference"
---

# Sidecar Daemon Runtime Reference

The local-runtime Python daemon is the current local-runtime executor implementation.
It does not own backend policy, model lists, OCR/vision availability, paid
capability gates, or prompt construction.

## Process Contract

The daemon:

- binds an HTTP/WebSocket server on localhost
- generates a random per-process token unless a test explicitly provides one
- writes a discovery file containing `pid`, `host`, `port`, canonical `base_url`,
  `token`, `created_at`, and non-secret launch context for backend URL,
  auth-state path, packaging mode, and local-runtime feature flags
- is started/reused by the SDK auto-local-runtime provider from desktop launch options
  supplied by Electron main
- owns the app-session `LocalRuntimeService` instance and its `LocalMemoryStore`
- exposes built-in local-runtime tools through the existing local-runtime Python
  `ToolRegistry`
- dynamically registers module-path tools, extension/plugin tools, and MCP tools without restart

The daemon is the single local memory owner. Electron should route legacy local JSON-RPC calls through daemon `POST /rpc` instead of spawning standalone `local_backend.py` beside it. A second `LocalRuntimeService` process can race SQLite writes while embedding backfill is running.

Electron desktop launch discovery path:

```text
${TMPDIR}/desktop-runtime/local-runtime-daemon.json
```

Standalone SDK/Python daemon defaults use the same generic local-runtime
discovery path:

```text
${TMPDIR}/desktop-runtime/local-runtime-daemon.json
```

Discovery metadata is daemon-authored and snake_case. SDK discovery readers
require `base_url` and `token`; stale camelCase discovery files using `baseUrl`
are rejected and replaced through the normal launch/reuse flow. The public SDK
`localRuntimeDaemon.baseUrl` is a client constructor option, not a discovery
file field.

Every endpoint requires the token in either:

- `x-agent-local-runtime-token: <token>`
- `Authorization: Bearer <token>`

The SDK auto-local-runtime provider probes the discovery file first. If `/status`
succeeds with the stored token and the discovery launch context matches the
current backend/auth/summarizer launch options, the SDK reuses that daemon. If
discovery is missing, stale, or from a daemon launched with different startup
context, it shuts down the stale daemon best-effort, launches
`sidecar_daemon.py` or the packaged daemon binary from explicit launch options,
and waits for a fresh discovery file before routing local execution.

Discovery reuse is restricted to loopback HTTP(S) origins. Hosts should reject
discovery entries with non-loopback hosts, unsupported schemes, userinfo, paths,
queries, or fragments before sending the daemon token, and delete invalid
reusable discovery files before launching a replacement daemon.

## Local Data Paths

The daemon resolves diagnostics and local-runtime user-data paths through
`core.user_data_paths.app_user_data_root(...)` instead of carrying its own
platform path table. The reusable Python fallback defaults to neutral
`desktop-runtime` paths:

- Windows: `%APPDATA%/desktop-runtime`, or
  `~/AppData/Roaming/desktop-runtime` for daemon
  fallback/test contexts when `%APPDATA%` is absent
- macOS: `~/Library/Application Support/desktop-runtime`
- Linux: `$XDG_CONFIG_HOME/desktop-runtime` for daemon contexts that opt into
  XDG, or `~/.config/desktop-runtime` when no XDG root is provided

`AGENT_USER_DATA_DIR` overrides the daemon user-data root for generic hosts;
Electron main passes the WindieOS host-skinned app-data root through
`WINDIE_USER_DATA_DIR` and `AGENT_USER_DATA_DIR`, so normal WindieOS desktop
launches continue to use the existing `windieos` storage directory. Standalone
daemon callers that need the old path should set either user-data override
explicitly. `AGENT_APP_DIAGNOSTICS_DB` similarly overrides the daemon
diagnostics database path, with `WINDIE_APP_DIAGNOSTICS_DB` preserved as the
WindieOS alias. Tests that need to force platform-specific path behavior should
prefer `AGENT_TEST_PLATFORM`; `WINDIE_TEST_PLATFORM` remains a compatibility
alias. Other Python local-runtime code uses the same helper.

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
POST /rpc
WS   /events
```

`GET /health` returns daemon liveness with the generic `local_runtime_daemon`
service label, pid, and creation time. The response intentionally describes the
runtime owner rather than the historical entrypoint filename.

`/tools` returns the executable local tool manifest. This is local-runtime diagnostic/execution shape, not the backend's policy-filtered model-visible schema.

`POST /rpc` accepts the existing local JSON-RPC envelope and dispatches it through `LocalRuntimeService.protocol.handle_request(...)`. It exists so Electron can keep existing memory/status/system-state IPC handlers while using the daemon as the only Python runtime owner.

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

The daemon imports `module:function`, wraps either raw `args` handlers or keyword handlers, stores the schema in the dynamic manifest, and executes the tool through the same `ToolRegistry.execute_tool` path as built-ins.

Module entrypoints must return native `tools.result.ToolResult` values.

## Plugin Registration

`POST /plugins/register` accepts a local-runtime plugin path. The path can
point at one plugin directory with `plugin.json`, a repo-level `plugins` root,
or a WindieOS repo root containing `plugins/`.

Plugin tools use the local-runtime plugin manifest contract:

- `name`
- `description`
- `entrypoint`
- `schema`

Plugin entrypoints must return native `tools.result.ToolResult` values.

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

Removed camelCase server-spec fields such as `timeoutMs`, `toolPrefix`,
`mcpId`, and `extensionId` are rejected at registration instead of ignored.

MCP execution metadata also rejects removed camelCase fields such as
`requestId`, `toolCallId`, `correlationId`, `bundleId`, `turnRef`, and
`conversationRef`; callers must send the daemon's snake_case execution metadata
keys.

The daemon starts the MCP process over stdio, runs `initialize`, discovers `tools/list`, exposes each MCP tool as a local-runtime tool, and forwards execution to `tools/call`.

## Permissions

The daemon reports local execution needs but does not make user-facing approval decisions. Permission prompting remains with the host application, currently Electron main and renderer UI.

`POST /permissions/request` returns `202 requires_host_prompt` until the host binds an approval UI to the daemon event/control channel.

## Event And Control WebSocket

`WS /events` sends an initial ready event:

```json
{ "type": "ready", "payload": { "pid": 12345 } }
```

The daemon also broadcasts lifecycle events such as:

- `tool-registered`
- `plugin-registered`
- `mcp-registered`
- `tool-executed`
- `shutdown-requested`

The same socket accepts lightweight control messages. Supported commands:

```json
{ "id": "1", "type": "ping" }
{ "id": "2", "type": "status" }
{ "id": "3", "type": "tools/list" }
```

Responses preserve `id` when supplied and use `pong`, `status`, `tools`, or
`error` event types. This channel is intentionally local-runtime only; it does
not expose backend model lists, OCR/vision policy, billing gates, or prompt
state.
