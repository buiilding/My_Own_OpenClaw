---
summary: "Convention for WindieOS extensions that contribute local tools, schemas, prompt layers, and docs."
read_when:
  - When adding reusable client-side extensions.
  - When deciding where extension-owned tool schemas and docs should live.
---

# Extension Convention

WindieOS extensions can contribute local sidecar tools, model-facing schemas,
executable schemas, prompt layers, settings surfaces, required permissions, and
documentation. Backend remote tools remain backend-owned.

The v1 loader reads `extensions/*/extension.json`. Set
`WINDIE_AGENT_EXTENSIONS_DIR` to point Electron main at a different extensions
directory.

```text
extensions/
  my-extension/
    extension.json
    tools/
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
      "description": "Run my local workflow.",
      "model_schema": "tools/my_tool.model.schema.json",
      "execution_schema": "tools/my_tool.execution.schema.json",
      "argument_resolution": "passthrough"
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
prompt layers to `client_prompt_layers`. Schema paths and `content_path` are
resolved relative to the extension directory.

Extension tool code still needs a sidecar implementation:

1. Implement the local tool under `frontend/src/main/python/tools/`.
2. Register it with the sidecar registry.
3. Add executable schema export coverage in
   `frontend/src/main/python/tools/manifest.py`.
4. Add model-facing and executable schema files under the extension `tools/`
   directory, referenced by `extension.json`.
5. Add or update docs under the extension `docs/` directory and the relevant
   canonical docs.
6. Add tests for the manifest builder, sidecar schema export, and execution
   path.

Use `passthrough` when model arguments are executable sidecar arguments. Use
`backend_grounding` only when the backend must resolve OCR, vision, or semantic
target descriptions into executable sidecar arguments.

Remote tools such as `web_search` are backend tools. An extension may expose a
settings toggle or docs for them, but it must not claim to execute them through
the local sidecar.
