---
summary: "Plugins and extensions hub for the current divided WindieOS plugin, skill, and MCP contribution roots."
read_when:
  - When adding tools, local plugins, skills, MCP servers, providers, SDK routes, or renderer features.
  - When deciding whether a plugin-style request belongs in extensions or core runtime code.
title: "Plugins and Extensions Hub"
---

# Plugins and Extensions Hub

WindieOS has three first-class repo-level contribution roots:

| Developer asks to add | Put it here | Canonical instructions |
| --- | --- | --- |
| A local Python tool exposed to the model | `plugins/<id>/plugin.json`, `schemas/`, `python/` | [Extension Convention](../development/extensions.md#local-runtime-plugin-tool-registration) |
| Instructions only | `skills/<id>/SKILL.md` | [Skills](../development/extensions.md#skills) |
| An MCP server | `mcps/<id>/mcp.json` | [MCP Runtime](../development/mcp.md) |
| A built-in local-runtime tool | Core backend, desktop local-runtime, and local-runtime Python implementation files | [Tool Development](../development/tool_development.md) |
| A provider | `backend/src/llm/providers`, model catalog/config | [Providers Hub](../providers/README.md) |

Plugin tools execute through the local-runtime Python implementation. Electron
main only discovers plugin schemas for the client manifest and routes local
calls through SDK/main local-runtime dispatch. Do not add Electron-main
`registerTool` handlers or lifecycle hooks for local plugin tools.

## Current Extension Surfaces

| Surface | Extend here | Start docs |
| --- | --- | --- |
| Local-runtime plugins | `plugins/<id>/plugin.json` | [Extension Convention](../development/extensions.md) |
| Prompt skills | `skills/<id>/SKILL.md` | [Extension Convention](../development/extensions.md#skills) |
| MCP integrations | `mcps/<id>/mcp.json` | [MCP Runtime](../development/mcp.md) |
| Backend model-facing tools | `backend/src/tools`, `backend/src/sdk` | [Extension Surface Matrix](extension_surface_matrix.md), [Tool Authoring](../sdk/tool_authoring.md) |
| Local-runtime built-in tools | `frontend/src/main/python/tools` | [Local Tool Channels](../channels/sidecar_and_tool_channels.md), [Tool Development](../development/tool_development.md) |
| Renderer feature modules | `frontend/src/renderer/features` | [Frontend Renderer Docs Hub](../frontend/renderer/README.md) |

## Rules

- Use `plugins`, `skills`, or `mcps` for normal
  extension contributions.
- Change `frontend/src/main/extensions/extension_manifest.cjs`,
  `frontend/src/main/extensions/mcp_runtime.cjs`, or
  `frontend/src/main/extensions/mcp_control.cjs` only when changing the
  extension platform itself.
- MCP integrations with desktop authority must set `requires_user_enable: true`
  so they stay listed but out of `client_tool_manifest` until explicitly
  enabled.
- Do not make a new backend tool model-visible until it is registered,
  policy-allowed, documented, and tested.
- Do not put provider credentials in plugin docs, fixtures, or code.
- Do not call future marketplace behavior current unless the code exists.

## Common Paths

### Add A Local Runtime Plugin Tool

Read:

- [Extension Convention](../development/extensions.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)

Likely code:

- `plugins/<id>/plugin.json`
- `plugins/<id>/schemas/*.schema.json`
- `plugins/<id>/python/*.py`

Validate extension manifest tests and local-runtime plugin loading tests.

### Add An MCP Integration

Read:

- [MCP Runtime](../development/mcp.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)

Likely code:

- `mcps/<id>/mcp.json`
- bundled MCP server code under the same MCP folder when needed

Validate MCP runtime tests and extension registry tests.

CUA Driver lives at `mcps/cua-driver/mcp.json`. It uses `cua-driver mcp`, has no
committed local checkout path, and relies on live `tools/list` discovery after
explicit enablement.

### Add An Extension Skill

Read:

- [Extension Convention](../development/extensions.md#skills)
- [Prompt and Tool Context](../concepts/prompt_and_tool_context.md)

Likely code:

- `skills/<id>/SKILL.md`

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
