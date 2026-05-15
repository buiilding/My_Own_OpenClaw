---
summary: "Plugins and extensions hub for the current divided WindieOS plugin, skill, and MCP contribution roots."
read_when:
  - When adding tools, local plugins, skills, MCP servers, providers, SDK routes, or renderer features.
  - When deciding whether a plugin-style request belongs in extensions or core runtime code.
title: "Plugins and Extensions Hub"
---

# Plugins and Extensions Hub

WindieOS does not treat `extensions/` as a single package namespace. It is a
container for three first-class contribution roots:

| Developer asks to add | Put it here | Canonical instructions |
| --- | --- | --- |
| A local Python tool exposed to the model | `extensions/plugins/<id>/plugin.json`, `schemas/`, `python/` | [Extension Convention](../development/extensions.md#sidecar-plugin-tools) |
| Instructions only | `extensions/skills/<id>/SKILL.md` | [Skills](../development/extensions.md#skills) |
| An MCP server | `extensions/mcps/<id>/mcp.json` | [MCP Runtime](../development/mcp.md) |
| A built-in WindieOS tool | Core backend/frontend/sidecar tool files | [Tool Development](../development/tool_development.md) |
| A provider | `backend/src/llm/providers`, model catalog/config | [Providers Hub](../providers/README.md) |

Plugin tools execute in the Python sidecar. Electron main only discovers plugin
schemas for the client manifest and routes local calls to the sidecar. Do not
add Electron-main `registerTool` handlers or lifecycle hooks for local plugin
tools.

## Current Extension Surfaces

| Surface | Extend here | Start docs |
| --- | --- | --- |
| Sidecar plugins | `extensions/plugins/<id>/plugin.json` | [Extension Convention](../development/extensions.md) |
| Prompt skills | `extensions/skills/<id>/SKILL.md` | [Extension Convention](../development/extensions.md#skills) |
| MCP integrations | `extensions/mcps/<id>/mcp.json` | [MCP Runtime](../development/mcp.md) |
| Backend model-facing tools | `backend/src/tools`, `backend/src/sdk` | [Extension Surface Matrix](extension_surface_matrix.md), [Tool Authoring](../sdk/tool_authoring.md) |
| Sidecar built-in tools | `frontend/src/main/python/tools` | [Sidecar and Tool Channels](../channels/sidecar_and_tool_channels.md), [Tool Development](../development/tool_development.md) |
| Renderer feature modules | `frontend/src/renderer/features` | [Frontend Renderer Docs Hub](../frontend/renderer/README.md) |

## Rules

- Use `extensions/plugins`, `extensions/skills`, or `extensions/mcps` for normal
  extension contributions.
- Change `frontend/src/main/extension_manifest.cjs` only when changing the
  extension platform itself.
- Do not make a new backend tool model-visible until it is registered,
  policy-allowed, documented, and tested.
- Do not put provider credentials in plugin docs, fixtures, or code.
- Do not call future marketplace behavior current unless the code exists.

## Common Paths

### Add A Sidecar Plugin Tool

Read:

- [Extension Convention](../development/extensions.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)

Likely code:

- `extensions/plugins/<id>/plugin.json`
- `extensions/plugins/<id>/schemas/*.schema.json`
- `extensions/plugins/<id>/python/*.py`

Validate extension manifest tests and sidecar plugin loading tests.

### Add An MCP Integration

Read:

- [MCP Runtime](../development/mcp.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)

Likely code:

- `extensions/mcps/<id>/mcp.json`
- bundled MCP server code under the same MCP folder when needed

Validate MCP runtime tests and extension registry tests.

### Add An Extension Skill

Read:

- [Extension Convention](../development/extensions.md#skills)
- [Prompt and Tool Context](../concepts/prompt_and_tool_context.md)

Likely code:

- `extensions/skills/<id>/SKILL.md`

Validate extension registry tests and prompt-layer transparency tests when the
payload contract changes.

### Add A Provider-Like Extension

Read:

- [Providers Hub](../providers/README.md)
- [Provider Extension Guide](provider_extension_guide.md)
- [Extension Points](../architecture/extension_points.md)

Likely code:

- `backend/src/llm/providers/**`
- `backend/src/llm/models/models_config.py`
- `backend/src/core/config/**`

Validate provider factory/config/model-list tests and any stream/tool-call
parsing tests.

## Deep Docs

- [Extension Convention](../development/extensions.md)
- [Extension Surface Matrix](extension_surface_matrix.md)
- [Provider Extension Guide](provider_extension_guide.md)
- [Current vs Future Plugin Boundary](current_vs_future_plugin_boundary.md)
