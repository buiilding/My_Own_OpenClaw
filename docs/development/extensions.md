---
summary: "Convention for WindieOS extension packages with separated plugin, MCP, skills, sidecar tool, schema, settings, and docs surfaces."
read_when:
  - When adding reusable client-side extensions.
  - When deciding where extension-owned tool schemas and docs should live.
---

# Extension Convention

WindieOS extensions can contribute local sidecar tools, Electron main-process
plugin tools, MCP servers, model-facing schemas, prompt layers, skills, settings
surfaces, required permissions, lifecycle hooks, config schemas, and
documentation. Backend remote tools remain backend-owned.

Use this file as the canonical authoring guide for developer-added
capabilities. Do not add a new local tool, skill, MCP server, or plugin hook by
editing core registries unless you are changing WindieOS itself.

## Mental Model

An extension is one installable package. The package keeps different
contribution types in different folders:

| Contribution | Folder | Purpose |
| --- | --- | --- |
| Package metadata, sidecar tool declarations, prompt-layer declarations, settings metadata | `extension.json` | Defines what the package contributes. |
| Main-process plugin code | `plugin/index.cjs` | Registers Electron-main tools, hooks, prompt layers, settings panels, runtime MCP servers, permissions, and config behavior. |
| MCP server config and bundled MCP server code | `mcp/servers.json`, `mcp/*` | Connects stdio MCP servers and exposes their tools through the client manifest. |
| Agent instructions | `skills/<skill-id>/SKILL.md` | Adds reusable prompt guidance; not executable. |
| Model-facing schemas | `tools/*.schema.json` | Describes extension sidecar tools to the model. |
| Python sidecar execution | `python/*.py` | Executes local sidecar tools. |
| Developer docs | `docs/*` | Explains package behavior and maintenance. |

The backend sees the final output as normal `client_tool_manifest` and
agent-definition prompt/skill metadata. It should not need custom backend code
for a normal extension package.

## Choose The Right Surface

| Need | Use |
| --- | --- |
| The model needs to call Python code on the local machine | Sidecar tool: `tools/*.schema.json` + `python/*.py` + `extension.json`. |
| The model needs to call lightweight JavaScript/Electron-main code | Plugin tool: `plugin/index.cjs` + `api.registerTool(...)`. |
| The agent needs reusable instructions or workflow guidance | Skill: `skills/<skill-id>/SKILL.md`. |
| The agent needs tools from an external protocol server | MCP: `mcp/servers.json` or `api.registerMcpServer(...)`. |
| The package needs to inspect or rewrite local tool calls | Plugin lifecycle hooks: `beforeToolCall`, `afterToolCall`, `onSessionStart`. |
| The package needs user-visible config metadata | `settings_panels`, `config_schema`, and plugin permissions. |

The extension loader reads `extensions/*/extension.json`. If the extension has
`plugin/index.cjs`, Electron main loads it as trusted local plugin code and
calls its exported register function. If the extension has `mcp/servers.json`,
Electron main loads those MCP server specs. Set `WINDIE_AGENT_EXTENSIONS_DIR`
to point Electron main at a different extensions directory.

## Scaffold An Extension

Use the scaffold command for new extension packages:

```bash
scripts/create-windie-extension repo-agent --name "Repo Agent" --tool inspect_repo
```

By default it writes to `extensions/<extension-id>/` and creates:

```text
extensions/repo-agent/
  extension.json
  tools/inspect_repo.schema.json
  python/inspect_repo.py
  skills/agent/SKILL.md
  README.md
  docs/README.md
```

Use `--dir <path>` to write to another extensions root. The command refuses to
overwrite an existing extension folder unless `--force` is passed and the target
folder is empty.

For a complete runnable extension-first SDK example, see
`examples/repo-agent-extension`.

## Package Layout

```text
extensions/
  my-extension/
    extension.json
    plugin/
      index.cjs
    tools/
    python/
    mcp/
      servers.json
      memory-mcp.cjs
    skills/
    ui/
    docs/
```

`extension.json` is required. Every other folder is optional and should exist
only when the package contributes that surface.

Example `extension.json`:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "description": "Adds local tools for a specific workflow.",
  "plugin": {
    "entrypoint": "plugin/index.cjs"
  },
  "config_schema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  },
  "tools": [
    {
      "name": "my_tool",
      "entrypoint": "python/my_tool.py:run",
      "schema": "tools/my_tool.schema.json"
    }
  ],
  "prompt_layers": [
    {
      "id": "my-extension-guidance",
      "type": "extension",
      "priority": 70,
      "content_path": "docs/prompt.md"
    }
  ],
  "skills": [
    {
      "path": "skills/review-notes",
      "id": "review-notes",
      "priority": 75
    }
  ],
  "settings_panels": [
    {
      "id": "my-extension",
      "title": "My Extension",
      "description": "Configure local extension behavior.",
      "config_schema": {
        "type": "object",
        "additionalProperties": false,
        "properties": {}
      }
    }
  ],
  "required_permissions": []
}
```

The loader contributes extension tools to `client_tool_manifest` and extension
prompt layers and skills to `agent_definition`. `schema`, `content_path`,
and skill paths are resolved relative to the extension directory. The Python
sidecar also reads the same manifests and loads each sidecar tool `entrypoint`.
For sidecar tools, Electron only advertises entries whose `entrypoint` points to
an existing file inside the extension directory.

`schema` is the hand-written schema the model sees. `entrypoint` is the local
Python function the sidecar executes. `plugin/index.cjs` can also register
Electron-main tools, MCP servers, prompt layers, skills, settings panels,
permissions, and lifecycle hooks through the runtime API.

Extension tool code should live inside the extension:

```python
from tools.result import ToolResult


async def run(args):
    value = args.get("value", "")
    if not value:
        return ToolResult.error_result("value is required")
    return ToolResult.success_result(
        {
            "llm_content": f"Processed: {value}",
            "return_display": "Processed",
        }
    )
```

Normal extension tools should not edit `frontend/src/main/python/tools/registry.py`
or `frontend/src/main/python/tools/manifest.py`. Those files are for built-in
tool wiring. Use core sidecar edits only when changing a built-in tool or adding
a shared sidecar primitive.

## Add A Sidecar Tool

Use this path when the model should call Python code that runs locally.

```text
extensions/notes/
  extension.json
  tools/save-note.schema.json
  python/save_note.py
```

`tools/save-note.schema.json`:

```json
{
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "note": {
      "type": "string",
      "description": "Note text to save."
    }
  },
  "required": ["note"]
}
```

`python/save_note.py`:

```python
from tools.result import ToolResult


async def run(args):
    note = str(args.get("note", "")).strip()
    if not note:
        return ToolResult.error_result("note is required")
    return ToolResult.success_result(
        {
            "llm_content": f"Saved note: {note}",
            "return_display": "Saved note",
        }
    )
```

`extension.json`:

```json
{
  "id": "notes",
  "name": "Notes",
  "tools": [
    {
      "name": "save_note",
      "description": "Save a local note.",
      "schema": "tools/save-note.schema.json",
      "entrypoint": "python/save_note.py:run"
    }
  ]
}
```

Rules:

- `schema` is model-facing JSON Schema.
- `entrypoint` is `relative/file.py:function`.
- The file path must stay inside the extension package.
- Use `argument_resolution: "passthrough"` unless backend OCR/vision grounding
  must transform model arguments first.

## Plugin Runtime API

`plugin/index.cjs` runs in Electron main as trusted local code. Export a
function or an object with `register(api)`:

```js
module.exports = function register(api) {
  api.registerPermission({
    id: "filesystem",
    reason: "Read and summarize local notes.",
  });

  api.registerSettingsPanel({
    id: "notes",
    title: "Notes",
    description: "Configure local note behavior.",
    config_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        folder: { type: "string" },
      },
    },
  });

  api.registerMcpServer({
    id: "memory",
    command: "node",
    args: ["mcp/memory-mcp.cjs"],
    tools: [
      {
        name: "search",
        description: "Search local notes through MCP.",
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

  api.registerTool({
    name: "summarize_note",
    description: "Summarize a note in the local extension runtime.",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        note: { type: "string" },
      },
      required: ["note"],
    },
    async execute(args, context) {
      return {
        llm_content: `Summary: ${args.note}`,
        return_display: "Summarized note",
      };
    },
  });

  api.registerPromptLayer({
    id: "notes-style",
    type: "extension",
    priority: 72,
    content: "When summarizing notes, preserve concrete dates and owners.",
  });

  api.registerSkill({
    id: "note-review",
    title: "Note Review",
    priority: 78,
    content: "Extract decisions, open questions, and follow-up tasks.",
  });

  api.beforeToolCall(({ toolName, args }) => {
    if (toolName !== "summarize_note") {
      return null;
    }
    return { args: { ...args, note: args.note.trim() } };
  });

  api.afterToolCall(({ result }) => ({ result }));
  api.onSessionStart(() => ({ started: true }));
};
```

Runtime API methods:

| Method | Use |
| --- | --- |
| `registerTool({ name, description, schema, execute })` | Adds a model-visible local tool executed inside Electron main. Return `{llm_content, return_display}` or `{success, data}`. |
| `registerPromptLayer(layer)` | Adds a client prompt layer. |
| `registerSkill(skill)` | Adds an inline skill or loads a `SKILL.md` path as an `extension_skill` prompt layer. |
| `registerSettingsPanel(panel)` | Adds settings metadata shown in the Agent settings extension inspector. |
| `registerMcpServer(server)` | Adds a stdio MCP server. Discovered MCP tools are exposed through the same client tool manifest. |
| `registerPermission(permission)` | Declares local authority required by the extension. |
| `beforeToolCall(handler)` | Runs before any local tool call. Return `{args}` to rewrite executable args or `{cancel: true, error}` to block. |
| `afterToolCall(handler)` | Runs after any local tool call. Return `{result}` to rewrite the tool result. |
| `onSessionStart(handler)` | Runs after the backend websocket handshake is sent. |

Use `api.paths.resolve/readText/readJson` for extension-local files. Paths are
confined to the extension directory.

## Add A Plugin Tool

Use this path when the model should call JavaScript code in Electron main.

```text
extensions/notes/
  extension.json
  plugin/index.cjs
```

`extension.json`:

```json
{
  "id": "notes",
  "name": "Notes"
}
```

`plugin/index.cjs`:

```js
module.exports = function register(api) {
  api.registerTool({
    name: "summarize_note",
    description: "Summarize a local note.",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        note: { type: "string" },
      },
      required: ["note"],
    },
    async execute(args) {
      const note = String(args.note || "").trim();
      return {
        llm_content: `Summary: ${note}`,
        return_display: "Summarized note",
      };
    },
  });
};
```

Use plugin tools for Electron-main integrations, lightweight local logic, or
runtime behavior that should not live in Python. Use sidecar tools for local
machine operations that belong in the Python sidecar.

## Add Plugin Hooks, Settings, Config, Or Permissions

Add these in `plugin/index.cjs`:

```js
module.exports = function register(api) {
  api.registerPermission({
    id: "filesystem",
    reason: "Read notes selected by the user.",
  });

  api.registerSettingsPanel({
    id: "notes",
    title: "Notes",
    description: "Configure note behavior.",
    config_schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        folder: { type: "string" },
      },
    },
  });

  api.beforeToolCall(({ toolName, args }) => {
    if (toolName !== "summarize_note") {
      return null;
    }
    return { args: { ...args, note: String(args.note || "").trim() } };
  });

  api.afterToolCall(({ result }) => ({ result }));
  api.onSessionStart(({ userId }) => ({ userId }));
};
```

Hooks run for local tool calls. `beforeToolCall` may return `{args}` to rewrite
executable args or `{cancel: true, error: "..."}` to block execution.
`afterToolCall` may return `{result}` to rewrite the result.

Use Python `entrypoint` tools for OS-level sidecar work. Use
`registerTool(... execute ...)` for Electron-main tools, lightweight local
logic, or tooling that needs the Electron bridge rather than Python sidecar
imports.

Use `mcp/servers.json` or `api.registerMcpServer` when the integration should
be portable across agent clients. MCP tools are named
`mcp_<server_id>__<tool_name>` by default and execute locally in Electron main
through MCP `tools/call`. See [MCP Runtime](mcp.md).

## Extension MCP Servers

Put declarative MCP server specs in `mcp/servers.json`, not in
`extension.json`:

```json
{
  "servers": [
    {
      "id": "memory",
      "command": "node",
      "args": ["mcp/memory-mcp.cjs"],
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
  ]
}
```

Use `api.registerMcpServer(...)` from `plugin/index.cjs` only when the server
spec depends on plugin config or runtime registration logic.

Rules:

- Prefer `mcp/servers.json` for static MCP servers.
- Use `tools` entries only as fallback schemas; live `tools/list` discovery is
  used when the MCP server starts successfully.
- MCP tools are exposed as `mcp_<server_id>__<tool_name>` unless `tool_prefix`
  is set.
- MCP tool calls execute locally through MCP `tools/call`; they do not execute
  in the Python sidecar.

## Extension Skills

Skills are instruction packs, not executable tools. Put reusable agent guidance
under `extensions/<id>/skills/<skill-id>/SKILL.md`. Electron main discovers
every `SKILL.md` under an extension `skills/` directory and converts it into a
client-defined agent skill layer with type `extension_skill`.

Example:

```text
extensions/
  my-extension/
    extension.json
    skills/
      review-notes/
        SKILL.md
```

```markdown
---
title: Review Notes
priority: 75
---

When reviewing notes, identify decisions, open questions, and follow-up tasks.
```

The generated layer id is stable:

```text
extension:my-extension:skill:review-notes
```

Use the `skills` array in `extension.json` when a skill needs an explicit id,
priority, or type override. The `path` may point at either a skill directory or
the `SKILL.md` file itself:

```json
{
  "skills": [
    {
      "path": "skills/review-notes",
      "id": "notes-review",
      "priority": 80
    }
  ]
}
```

Skills should contain task-specific operating guidance, examples, and local
workflow notes. If the model needs to call code, add a tool entry with `schema`
and `entrypoint`; do not hide executable behavior inside a skill.

## Add Only Skills

Use this path when no executable code is needed.

```text
extensions/note-review/
  extension.json
  skills/review-notes/SKILL.md
```

`extension.json`:

```json
{
  "id": "note-review",
  "name": "Note Review"
}
```

`skills/review-notes/SKILL.md`:

```markdown
---
title: Review Notes
priority: 75
---

When reviewing notes, identify decisions, open questions, owners, and dates.
```

## Add A Mixed Extension

Use this path when one package needs multiple surfaces:

```text
extensions/research-workbench/
  extension.json
  plugin/index.cjs
  mcp/servers.json
  skills/research/SKILL.md
  tools/format-citations.schema.json
  python/format_citations.py
  docs/README.md
```

Keep each contribution in its own folder. Do not move MCP config into
`extension.json`, do not put skills in plugin code unless the content is
generated at runtime, and do not put Python sidecar execution inside MCP server
config.

Extension checklist:

1. Add the tool schema under the extension `tools/` directory.
2. Add executable Python code under the extension `python/` directory.
3. Reference `schema` and the `file.py:function` entrypoint from
   `extension.json`.
4. Add `plugin/index.cjs` when the extension needs runtime registration,
   main-process tool execution, settings metadata, permissions, or lifecycle
   hooks.
5. Add `mcp/servers.json` or `api.registerMcpServer` when the extension should
   expose tools from an MCP server.
6. Add reusable instructions under `skills/<skill-id>/SKILL.md` when the
   extension needs prompt guidance instead of executable code.
7. Add or update docs under the extension `docs/` directory and the relevant
   canonical docs.
8. Add tests for the manifest builder, plugin runtime, MCP runtime, sidecar
   extension loading, lifecycle hooks, settings metadata, and execution
   path.

Use `passthrough` when model arguments are executable sidecar arguments. Use
`backend_grounding` only when the backend must resolve OCR, vision, or semantic
target descriptions into executable sidecar arguments.

Remote tools such as `web_search` are backend tools. An extension may expose a
settings toggle or docs for them, but it must not claim to execute them through
the local sidecar.

## Validation

For extension package changes, run:

```bash
cd frontend
npm test -- --runTestsByPath ../tests/frontend/ExtensionManifest.test.cjs ../tests/frontend/McpRuntime.test.cjs ../tests/frontend/LocalBackendBridgeExtensionRuntime.test.cjs ../tests/frontend/AgentSettingsTab.test.jsx ../tests/frontend/AgentCapabilityHandshake.test.cjs --runInBand
```

When sidecar Python entrypoints are involved, also run:

```bash
./scripts/python-in-env sidecar pytest tests/sidecar/test_tool_manifest.py
```

When the projected client tool manifest shape changes, also run:

```bash
./scripts/python-in-env backend pytest tests/backend/test_client_tool_manifest.py tests/backend/test_outgoing_schema_contract.py
```
