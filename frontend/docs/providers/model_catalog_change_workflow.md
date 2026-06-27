---
summary: "Workflow for changing WindieOS model catalog entries, model-list output, capability flags, frontend model selection, and provider routing metadata."
read_when:
  - When adding, removing, renaming, or changing a model entry.
  - When model picker behavior, reasoning modes, web-search capability, Codex OAuth support, or provider routing changes.
  - When debugging a model that appears in the frontend but routes to the wrong provider or capabilities.
title: "Model Catalog Change Workflow"
---

# Model Catalog Change Workflow

The model catalog is not just display text. It controls provider routing, visible model names, model ids, capability flags, thinking/reasoning variants, context limits, web-search support, and some frontend model-picker behavior.

## Ownership

| Surface | Owner | Rule |
| --- | --- | --- |
| Catalog definitions | private backend implementation | Source of truth for model metadata and capability flags. |
| Model listing service | private backend implementation | Converts catalog/config/provider availability into model-list responses. |
| Provider runtime routing | private backend implementation and provider modules | Provider id must resolve to a concrete runtime provider. |
| Default selected model | private backend implementation, config docs | Defaults must be valid catalog ids. |
| Frontend selected model state | Renderer settings/app config providers | Should consume backend metadata and persist user choice. |
| Model picker rendering | `frontend/src/renderer/features/settings`, chat model controls | Should not invent capabilities missing from backend metadata. |

## Add a Model

1. Confirm the provider runtime already exists and can route the runtime model id.
2. Add the catalog entry in private backend implementation.
3. Set capability flags explicitly: reasoning/thinking, multimodal support, tool support, native web search, OAuth support, and latency/strength labels.
4. Add or update default config only if the new model should become the default.
5. Update provider-specific docs if the model is part of a provider page.
6. Update frontend tests only if model-picker grouping, labels, badges, or controls should change.
7. Run backend model catalog/service tests and any provider-specific tests for runtime routing.

## Change Capability Flags

| Capability | Check |
| --- | --- |
| Reasoning/thinking | Frontend thinking controls, provider request kwargs, provider-native reasoning tests. |
| Web search | Backend web-search capability policy and provider-native search behavior. |
| Tool calling | Provider stream/tool-call parser and backend tool-call tests. |
| Multimodal/image input | Request payload builder, provider image support, screenshot/artifact docs. |
| Codex OAuth | OpenAI/Codex-specific frontend controls and backend provider support. |
| Local availability | Local provider docs and model service behavior when the local server is offline. |

Changing a flag can change prompt/tool visibility, frontend controls, and request payloads. Treat flag changes as behavioral changes, not docs-only edits.

## Rename or Remove a Model

| Change | Required handling |
| --- | --- |
| Display-name rename | Update catalog, docs, and frontend snapshots if labels are asserted. |
| Runtime id change | Update provider routing tests and verify existing saved config is still valid or intentionally migrated. |
| Catalog id rename | Add a migration or explicit compatibility decision; persisted selected model ids may break. |
| Removal | Update defaults, docs, frontend selection fallback, and tests for unknown/deleted selected model ids. |

Do not remove a model id without checking persisted renderer config and backend defaults.

## Debugging

| Symptom | First check |
| --- | --- |
| Model missing from picker | `list-models` response, model service filters, catalog entry, frontend model grouping. |
| Model appears but calls wrong provider | Provider id in catalog and provider factory registration. |
| Reasoning control missing | Catalog capability flag and frontend model capability tests. |
| Web-search unavailable | Catalog flag, provider-native search docs, effective session policy. |
| Default model fails on startup | Default selected model id and provider credential/local server availability. |
| Frontend shows stale model after settings save | Settings sync ACK path and AppConfig provider state. |

## Test Targets

| Behavior | Tests |
| --- | --- |
| Catalog shape and ids | private backend tests |
| Model list service | private backend tests |
| Provider routing | private backend tests, provider-specific tests |
| Reasoning/native capability flags | private backend tests, `tests/frontend/ModelThinkingCapabilities.test.ts` |
| Frontend model picker | `tests/frontend/DesktopModelCardPresentationRuntime.test.js`, `tests/frontend/ModelSelectionUtils.test.js`, `tests/frontend/ModelsSection.test.jsx`, `tests/frontend/DesktopChatModelOptionsRuntime.test.js` |
| Settings persistence/sync | `tests/frontend/AppConfigProvider.models.test.tsx`, `tests/frontend/IpcSettingsSync.test.cjs` |

## Related Docs

- [Models and LLM Providers](models.md)
- [Provider Change Workflow](provider_change_workflow.md)
- Provider Credentials (private backend docs)
- [Model Provider Selection](../concepts/model_provider_selection.md)
- [Frontend Model Settings Change Workflow](../frontend/renderer/settings/model_settings_change_workflow.md)
- [Configuration Reference](../reference/configuration_reference.md)
