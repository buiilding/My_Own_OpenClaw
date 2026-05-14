---
summary: "Plugins and extensions hub for current WindieOS extension surfaces and the boundary between implemented extensibility and future plugin marketplace work."
read_when:
  - When adding tools, providers, SDK routes, sidecar tools, renderer features, browser integrations, or inference providers.
  - When deciding whether a requested plugin-style feature belongs in current extension points or future planning.
title: "Plugins and Extensions Hub"
---

# Plugins and Extensions Hub

WindieOS does not currently have a packaged plugin marketplace. It does have a
manifest-based extension loader for local sidecar tools, extension prompt
layers, and extension skills, plus concrete source-level extension surfaces for
providers, SDK routes, inference backends, browser behavior, and renderer
features.

Use this hub when a request sounds like "add a plugin" but the implementation should use existing WindieOS extension points.

## Current Extension Surfaces

| Surface | Extend here | Start docs |
| --- | --- | --- |
| Manifest extension tools and skills | `extensions/<id>/extension.json`, `extensions/<id>/skills/**/SKILL.md` | [Extension Convention](../development/extensions.md) |
| Backend model-facing tools | `backend/src/tools`, `backend/src/sdk` | [Extension Surface Matrix](extension_surface_matrix.md), [Tool Authoring](../sdk/tool_authoring.md) |
| Sidecar executable tools | `frontend/src/main/python/tools` | [Sidecar and Tool Channels](../channels/sidecar_and_tool_channels.md), [Tool Development](../development/tool_development.md) |
| LLM providers | `backend/src/llm/providers`, model catalog/config | [Providers Hub](../providers/README.md), [LLM Provider Docs Hub](../backend/llm/providers/README.md) |
| OCR/vision/embedding providers | `backend/src/core/inference`, `backend/src/services/*` provider adapters | [Inference Providers](../providers/inference.md), [Extension Points](../architecture/extension_points.md) |
| Hosted SDK routes | `backend/src/api/routes/sdk`, SDK clients | [SDK Hub](../sdk/README.md), [Hosted Backend Clients](../sdk/hosted_backend_clients.md) |
| Browser runtime | backend browser schema + sidecar browser runtime | [Browser Hub](../browser/README.md), [Browser Tool](../tools/browser.md) |
| Renderer feature modules | `frontend/src/renderer/features` | [Frontend Renderer Docs Hub](../frontend/renderer/README.md) |

## Rules

- Do not invent marketplace behavior when the current request can be solved with a manifest extension, tool, provider, SDK route, or sidecar extension.
- Do not make a new backend tool model-visible until it is registered, policy-allowed, documented, and tested.
- Do not skip sidecar implementation for a local machine tool; backend schemas alone do not execute local actions.
- Do not put provider credentials in plugin docs, fixtures, or code.
- Do not call future marketplace behavior "current" unless the code exists.

## Common Paths

### Add a Tool-Like Extension

Read:

- [Extension Convention](../development/extensions.md)
- [Extension Surface Matrix](extension_surface_matrix.md)
- [Tool Authoring](../sdk/tool_authoring.md)
- [Tool Development](../development/tool_development.md)
- [Tool Execution Lifecycle](../tools/tool_execution_lifecycle.md)

Likely code:

- `backend/src/tools/**`
- `backend/src/sdk/**`
- `frontend/src/main/python/tools/**`
- renderer tool runner only when display/execution behavior changes

Validate backend tool schema/policy tests, sidecar tool tests, renderer tool-runner tests, and parity tests.

### Add an Extension Skill

Read:

- [Extension Convention](../development/extensions.md)
- [Prompt and Tool Context](../concepts/prompt_and_tool_context.md)

Likely code:

- `extensions/<id>/skills/<skill-id>/SKILL.md`
- `extensions/<id>/extension.json` only when id, priority, or type overrides are needed
- `frontend/src/main/extension_manifest.cjs` only when changing loader behavior

Validate extension-manifest tests and prompt-layer transparency tests when the
payload contract changes.

### Add a Provider-Like Extension

Read:

- [Providers Hub](../providers/README.md)
- [Provider Extension Guide](provider_extension_guide.md)
- [Extension Points](../architecture/extension_points.md)

Likely code:

- `backend/src/llm/providers/**`
- `backend/src/llm/models/models_config.py`
- `backend/src/core/config/**`
- provider-specific tests and docs

Validate provider factory/config/model-list tests and any stream/tool-call parsing tests.

### Plan a Real Plugin System

Read:

- [Current vs Future Plugin Boundary](current_vs_future_plugin_boundary.md)
- [Security Hub](../security/README.md)
- [Planning Hub](../planning/README.md)

Do not land marketplace or third-party plugin claims in current docs until runtime loading, isolation, signing/trust policy, config, and tests exist.

## Deep Docs

- [Extension Surface Matrix](extension_surface_matrix.md)
- [Provider Extension Guide](provider_extension_guide.md)
- [Current vs Future Plugin Boundary](current_vs_future_plugin_boundary.md)
- [Architecture Extension Points](../architecture/extension_points.md)
- [Security Change Playbook](../security/security_change_playbook.md)
