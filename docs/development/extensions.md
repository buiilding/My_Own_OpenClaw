---
summary: "Convention for WindieOS extensions that contribute local tools, schemas, prompt layers, and docs."
read_when:
  - When adding reusable client-side extensions.
  - When deciding where extension-owned tool schemas and docs should live.
---

# Extension Convention

WindieOS extensions can contribute local sidecar tools, model-facing schemas,
prompt layers, settings surfaces, required permissions, and documentation.
Backend remote tools remain backend-owned.

The extension loader reads `extensions/*/extension.json`. Set
`WINDIE_AGENT_EXTENSIONS_DIR` to point Electron main at a different extensions
directory.

```text
extensions/
  my-extension/
    extension.json
    tools/
    python/
    ui/
    docs/
```

Example `extension.json`:

```json
{
  "id": "my-extension",
  "name": "My Extension",
  "description": "Adds local tools for a specific workflow.",
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
  "required_permissions": []
}
```

The loader contributes extension tools to `client_tool_manifest` and extension
prompt layers to `client_prompt_layers`. `schema` and `content_path` are
resolved relative to the extension directory. The Python
sidecar also reads the same manifests and loads each sidecar tool `entrypoint`.
For sidecar tools, Electron only advertises entries whose `entrypoint` points to
an existing file inside the extension directory.

`schema` is the hand-written schema the model sees. `entrypoint` is the local
Python function the sidecar executes. For ordinary extension tools, those are
the only tool-authoring fields developers need to provide.

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

Extension checklist:

1. Add the tool schema under the extension `tools/` directory.
2. Add executable Python code under the extension `python/` directory.
3. Reference `schema` and the `file.py:function` entrypoint from
   `extension.json`.
4. Add or update docs under the extension `docs/` directory and the relevant
   canonical docs.
5. Add tests for the manifest builder, sidecar extension loading, and execution
   path.

Use `passthrough` when model arguments are executable sidecar arguments. Use
`backend_grounding` only when the backend must resolve OCR, vision, or semantic
target descriptions into executable sidecar arguments.

Remote tools such as `web_search` are backend tools. An extension may expose a
settings toggle or docs for them, but it must not claim to execute them through
the local sidecar.
