---
summary: "Canonical WindieOS extension contribution package layout for plugin tool registration, repo-level local-runtime plugins, prompt skills, MCP server specs, ignored legacy extensions container behavior, and local-runtime implementation boundaries."
read_when:
  - When adding reusable client-side plugins, skills, or MCP integrations.
  - When registering plugin tools through `plugins/<id>/plugin.json`, schemas, and Python local-runtime entrypoints.
  - When changing extension-owned tool schemas, local-runtime execution, prompt layers, or MCP discovery.
  - When searching for extension package, plugin, MCP, skills, or local-runtime tool contribution layout; this doc owns extension contribution roots, not built-in local-runtime tool behavior.
  - When stale docs, local folders, or prompts mention `extensions/<id>/extension.json`, `plugin/index.cjs`, or an `extensions/` container; the active loader ignores that legacy shape.
---

# Extension Convention

WindieOS contribution roots live directly under the repo root:

```text
plugins/
  <plugin-id>/
    plugin.json
    schemas/
    python/
    docs/
skills/
  <skill-id>/
    SKILL.md
mcps/
  <mcp-id>/
    mcp.json
```

The active loader does not read an `extensions/<id>/extension.json` package
shape, `plugin/index.cjs`, or an Electron-main plugin tool execution surface.
Some local checkouts may still contain an empty legacy `extensions/` directory;
it is not the contribution root and is not tracked as the current authoring
surface. Default discovery uses the WindieOS repo root, or the configured
contribution-root env override. Generic hosts can set
`AGENT_CONTRIBUTIONS_DIR`; WindieOS also supplies
`WINDIE_AGENT_CONTRIBUTIONS_DIR` through the main host skin for existing
launches. Set one of these variables when using a separate contribution root.
The loader does not infer contribution roots from the process working
directory. Plugin tools are local-runtime tools:
Electron main reads `plugin.json` for the model-facing client manifest, and the
local-runtime Python implementation loads the same `plugin.json` to execute the
declared Python entrypoints. Use this page for extension package, plugin, MCP,
skills, and local-runtime tool contribution layout. Use the local-runtime
local-runtime tools docs for built-in computer/system/filesystem/shell/browser
implementation behavior.

## Choose The Surface

| Need | Use |
| --- | --- |
| The model should call local Python code | `plugins/<id>/plugin.json`, `schemas/*.schema.json`, and `python/*.py`. |
| The agent needs reusable instructions only | `skills/<id>/SKILL.md`. |
| A protocol server should expose tools | `mcps/<id>/mcp.json`. |
| A built-in local-runtime tool changes | Core backend, desktop local-runtime, and local-runtime Python implementation files, not the contribution roots. |

The backend receives the final output as normal `client_tool_manifest` entries
and prompt layers. The backend validates and projects those schemas but does not
import plugin, skill, or MCP files.

## Scaffold A Plugin And Skill

Use the scaffold command:

```bash
<windie> extension create repo-agent --name "Repo Agent" --tool inspect_repo
```

It creates:

```text
plugins/repo-agent/
  plugin.json
  schemas/inspect_repo.schema.json
  python/inspect_repo.py
  README.md
  docs/README.md
skills/repo-agent/
  SKILL.md
  README.md
```

Use `--dir <path>` to target another contribution root. The command refuses to
overwrite existing contribution folders unless `--force` is passed and the
target folders are empty.

## Local Runtime Plugin Tool Registration

`plugin.json` is required for a plugin:

```json
{
  "id": "repo-agent",
  "name": "Repo Agent",
  "description": "Repository inspection tools.",
  "tools": [
    {
      "name": "inspect_repo",
      "description": "Read a compact repository snapshot.",
      "schema": "schemas/inspect_repo.schema.json",
      "entrypoint": "python/inspect_repo.py:run",
      "argument_resolution": "passthrough"
    }
  ],
  "required_permissions": []
}
```

Rules:

- `name` is the model-visible tool name.
- `schema` points to a JSON Schema file inside the plugin directory.
- `entrypoint` is `file.py:function` inside the plugin directory.
- `argument_resolution` is usually `passthrough`; use `backend_grounding` only
  when the backend prepares executable local-runtime arguments.
- Contribution manifests use the documented snake_case field names only;
  alternate aliases and camelCase keys are rejected at load time.
- Plugin tools always execute through the local runtime, currently backed by
  local-runtime Python.
- Plugin entrypoints must return native `tools.result.ToolResult` values.
- Local-runtime Python-generated module names for loaded entrypoint files are
  internal loader details; extension contracts are `name`, `schema`, and
  `entrypoint`.
- Do not put a `tools/` folder under plugins; schema files live under
  `schemas/`.

Example Python entrypoint:

```python
from tools.result import ToolResult


async def run(root: str, max_files: int = 20):
    return ToolResult.success_result(
        {
            "output": "Repository snapshot ready",
            "root": root,
            "max_files": max_files,
        }
    )
```

## Skills

Skills are prompt layers, not executable tools. Put each skill under
`skills/<id>/SKILL.md`:

```markdown
---
title: Repo Agent
priority: 75
---

Use `inspect_repo` before making claims about repository structure.
```

Front matter:

| Field | Meaning |
| --- | --- |
| `id` | Optional stable id. Defaults to the skill folder path. |
| `title` or `name` | Optional heading inserted when the body has no heading. |
| `type` | Optional prompt layer type. Defaults to `extension_skill`. |
| `priority` | Optional prompt priority. Defaults to `75`. |

## MCP Servers

Declare MCP servers under `mcps/<id>/mcp.json`:

```json
{
  "id": "memory",
  "command": "node",
  "args": ["server.cjs"],
  "cwd": ".",
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

`tools` is a fallback schema list. When live discovery succeeds, WindieOS uses
the MCP server's `tools/list` response.

Set `"requires_user_enable": true` for MCPs that should be visible in the
dashboard but unavailable to the model until the local user enables them. This
is required for desktop-control integrations such as CUA Driver.

## Runtime Flow

1. Electron main reads `plugins/*/plugin.json` and appends plugin
   tools to `client_tool_manifest`.
2. Electron main reads `skills/**/SKILL.md` and appends prompt
   layers to the agent definition.
3. Electron main reads `mcps/*/mcp.json`, filters user-gated MCPs through the
   local allowlist, discovers enabled MCP tools, reconciles the executable MCP
   registry with enabled specs, and appends visible tools to
   `client_tool_manifest`.
4. The backend validates and policy-projects the client manifest.
5. Local plugin tool calls route through SDK local-runtime execution to the
   local-runtime executable tool registry backed by Python modules.
6. MCP tool calls route through the MCP runtime.

## Validation

For plugin, skill, or MCP contract changes, run:

```bash
cd frontend
npm test -- --runTestsByPath ../tests/frontend/ExtensionManifest.test.cjs ../tests/frontend/McpRuntime.test.cjs ../tests/frontend/AgentSdkClient.test.ts --runInBand
cd ..
./scripts/python-in-env local-runtime python -m pytest tests/sidecar/test_tool_manifest.py tests/sidecar/test_sidecar_daemon.py tests/sidecar/test_repo_agent_example.py -q
```

Run backend client-manifest tests if the manifest shape changes:

```bash
private backend test runner
```
