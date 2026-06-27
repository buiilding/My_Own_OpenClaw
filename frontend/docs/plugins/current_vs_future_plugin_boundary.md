---
summary: "Boundary guide for current WindieOS extension surfaces versus future plugin marketplace or dynamic plugin-loader work."
read_when:
  - When a request mentions plugins, marketplace, third-party extensions, dynamic loading, or installable integrations.
  - When documenting future plugin behavior without implying it exists today.
title: "Current vs Future Plugin Boundary"
---

# Current vs Future Plugin Boundary

WindieOS currently supports code-level extension points plus divided local
extension contribution roots for local-runtime plugins, prompt skills, and MCP
server specs. It does not currently support a packaged plugin marketplace,
signed plugin bundles, dependency installation, remote plugin registries, or
hot-loading without app restart.

## Current

Implemented today:

- local-runtime plugins under `plugins/*/plugin.json`
- plugin tools declared with `name`, `schema`, and Python `entrypoint`
- plugin settings-panel metadata, config schemas, and permissions
- MCP servers under `mcps/*/mcp.json`, discovered through MCP `tools/list`, and executed through local MCP `tools/call`
- skills under `skills/**/SKILL.md` forwarded through `agent_definition.prompt_layers`
- backend tool registry and SDK tool base
- local-runtime executable tools backed by local-runtime Python
- LLM provider factory and model catalog
- OCR/vision/embedding capability routers
- hosted SDK routes and clients
- dedicated browser runtime actions
- renderer feature modules
- Electron main IPC/runtime modules

These are implemented as source-code changes and normal repo commits.

## Future

A real plugin system would need at least:

- plugin manifest schema
- package install/update/remove flow
- signature/trust policy
- sandbox/isolation model
- permissions prompt and audit trail
- model-visible tool registration policy
- local-runtime execution registration policy
- provider credential scoping
- compatibility/version constraints
- tests for malicious, malformed, duplicate, and disabled plugins

Do not imply this exists in current docs.

## Decision Rules

| Request | Current answer |
| --- | --- |
| "Add a provider plugin" | implement an LLM/inference provider in current provider paths |
| "Add a desktop action plugin" | implement backend schema + local-runtime tool execution |
| "Add a browser plugin" | extend browser schema/runtime, not a third-party browser extension store |
| "Add a local plugin contribution" | use `plugins/<id>/plugin.json` with a Python entrypoint executed by the local runtime |
| "Connect an MCP server" | add `mcps/<id>/mcp.json` |
| "Let users install marketplace plugins" | planning/design first |
| "Load local-runtime tools from a plugin manifest" | use `plugins/<id>/plugin.json` |
| "Add extension skills" | add `skills/<skill-id>/SKILL.md` |
| "Install plugins from a marketplace" | planning/design first |
| "Expose a new SDK integration" | add SDK route/client docs and tests |

## Planning Path

If a true plugin system is needed, start in `docs/planning/` and include:

- security model
- packaging/install flow
- trust and signing policy
- runtime isolation model
- capability/policy integration
- UI and CLI management surfaces
- migration path from current source-owned extensions

Also read:

- [Security Hub](../security/README.md)
- Security Boundary Matrix (private backend docs)
- [Extension Surface Matrix](extension_surface_matrix.md)
