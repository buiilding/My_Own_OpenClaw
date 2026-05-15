# Extensions

This directory is reserved for reusable Windie Agent extension contributions.

Create a starter sidecar plugin plus paired skill with:

```bash
scripts/create-windie-extension repo-agent --name "Repo Agent" --tool inspect_repo
```

Use this shape:

```text
extensions/
  plugins/
    my-plugin/
      plugin.json
      schemas/
      python/
      docs/
  skills/
    my-skill/
      SKILL.md
  mcps/
    my-server/
      mcp.json
```

See [Extension Convention](../docs/development/extensions.md) for the current
contract. Plugins declare model-facing schemas and Python sidecar entrypoints
in `plugin.json`; skills and MCP servers are separate first-class roots.
