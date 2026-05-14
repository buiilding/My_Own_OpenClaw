---
summary: "Boundary guide for current WindieOS extension surfaces versus future plugin marketplace or dynamic plugin-loader work."
read_when:
  - When a request mentions plugins, marketplace, third-party extensions, dynamic loading, or installable integrations.
  - When documenting future plugin behavior without implying it exists today.
title: "Current vs Future Plugin Boundary"
---

# Current vs Future Plugin Boundary

WindieOS currently supports code-level extension points and a manifest-based
local plugin runtime for sidecar tools, Electron main-process tools, prompt
layers, skills, MCP servers, settings-panel metadata, lifecycle hooks, config
schemas, and permissions. It does not currently support a packaged plugin marketplace, signed
plugin bundles, dependency installation, remote plugin registries, or hot-loading
without app restart.

## Current

Implemented today:

- manifest extensions under `extensions/*/extension.json`
- extension local sidecar tools declared with `name`, `schema`, and Python `entrypoint`
- extension `plugin.cjs` modules with `registerTool`, `registerPromptLayer`, `registerSkill`, `registerSettingsPanel`, lifecycle hooks, config, and permissions
- extension MCP servers declared with `mcp_servers` or `api.registerMcpServer(...)`, discovered through MCP `tools/list`, and executed through local MCP `tools/call`
- extension prompt layers and `skills/**/SKILL.md` instructions forwarded as `client_prompt_layers`
- backend tool registry and SDK tool base
- sidecar executable tools
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
- sidecar execution registration policy
- provider credential scoping
- compatibility/version constraints
- tests for malicious, malformed, duplicate, and disabled plugins

Do not imply this exists in current docs.

## Decision Rules

| Request | Current answer |
| --- | --- |
| "Add a provider plugin" | implement an LLM/inference provider in current provider paths |
| "Add a desktop action plugin" | implement backend schema + sidecar tool execution |
| "Add a browser plugin" | extend browser schema/runtime, not a third-party browser extension store |
| "Add a local plugin contribution" | use `extensions/<id>/plugin.cjs` |
| "Connect an MCP server" | add `mcp_servers` or `api.registerMcpServer(...)` in an extension |
| "Let users install marketplace plugins" | planning/design first |
| "Load local sidecar tools from an extension manifest" | use `extensions/<id>/extension.json` |
| "Add extension skills" | add `skills/<skill-id>/SKILL.md` under the extension |
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
- [Security Boundary Matrix](../security/security_boundary_matrix.md)
- [Extension Surface Matrix](extension_surface_matrix.md)
