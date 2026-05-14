---
summary: "Convention for WindieOS extensions that contribute local tools, schemas, prompt layers, skills, and docs."
read_when:
  - When adding reusable client-side extensions.
  - When deciding where extension-owned tool schemas and docs should live.
---

# Extension Convention

WindieOS extensions can contribute local sidecar tools, Electron main-process
plugin tools, model-facing schemas, prompt layers, skills, settings surfaces,
required permissions, lifecycle hooks, config schemas, and documentation.
Backend remote tools remain backend-owned.

The extension loader reads `extensions/*/extension.json`. If the extension has a
`plugin.cjs` file, Electron main loads it as trusted local plugin code and calls
its exported register function. Set `WINDIE_AGENT_EXTENSIONS_DIR` to point
Electron main at a different extensions directory.

```text
extensions/
  my-extension/
    extension.json
    plugin.cjs
    tools/
    python/
    skills/
    ui/
    docs/
```

Example `extension.json`:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "description": "Adds local tools for a specific workflow.",
  "main": "plugin.cjs",
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
prompt layers and skills to `client_prompt_layers`. `schema`, `content_path`,
and skill paths are resolved relative to the extension directory. The Python
sidecar also reads the same manifests and loads each sidecar tool `entrypoint`.
For sidecar tools, Electron only advertises entries whose `entrypoint` points to
an existing file inside the extension directory.

`schema` is the hand-written schema the model sees. `entrypoint` is the local
Python function the sidecar executes. `plugin.cjs` can also register
Electron-main tools, prompt layers, skills, settings panels, permissions, and
lifecycle hooks through the runtime API.

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

## Plugin Runtime API

`plugin.cjs` runs in Electron main as trusted local code. Export a function or
an object with `register(api)`:

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
| `registerPermission(permission)` | Declares local authority required by the extension. |
| `beforeToolCall(handler)` | Runs before any local tool call. Return `{args}` to rewrite executable args or `{cancel: true, error}` to block. |
| `afterToolCall(handler)` | Runs after any local tool call. Return `{result}` to rewrite the tool result. |
| `onSessionStart(handler)` | Runs after the backend websocket handshake is sent. |

Use `api.paths.resolve/readText/readJson` for extension-local files. Paths are
confined to the extension directory.

Use Python `entrypoint` tools for OS-level sidecar work. Use
`registerTool(... execute ...)` for Electron-main tools, lightweight local
logic, or tooling that needs the Electron bridge rather than Python sidecar
imports.

## Extension Skills

Skills are instruction packs, not executable tools. Put reusable agent guidance
under `extensions/<id>/skills/<skill-id>/SKILL.md`. Electron main discovers
every `SKILL.md` under an extension `skills/` directory and converts it into a
`client_prompt_layers` entry with type `extension_skill`.

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

Extension checklist:

1. Add the tool schema under the extension `tools/` directory.
2. Add executable Python code under the extension `python/` directory.
3. Reference `schema` and the `file.py:function` entrypoint from
   `extension.json`.
4. Add `plugin.cjs` when the extension needs runtime registration,
   main-process tool execution, settings metadata, permissions, or lifecycle
   hooks.
5. Add reusable instructions under `skills/<skill-id>/SKILL.md` when the
   extension needs prompt guidance instead of executable code.
6. Add or update docs under the extension `docs/` directory and the relevant
   canonical docs.
7. Add tests for the manifest builder, plugin runtime, sidecar extension
   loading, lifecycle hooks, settings metadata, and execution
   path.

Use `passthrough` when model arguments are executable sidecar arguments. Use
`backend_grounding` only when the backend must resolve OCR, vision, or semantic
target descriptions into executable sidecar arguments.

Remote tools such as `web_search` are backend tools. An extension may expose a
settings toggle or docs for them, but it must not claim to execute them through
the local sidecar.
