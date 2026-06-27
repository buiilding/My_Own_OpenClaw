---
summary: "Workflow for adding or changing WindieOS LLM providers across provider classes, factory registration, config loading, model catalog metadata, renderer settings, and tests."
read_when:
  - When adding a new LLM provider or changing provider runtime behavior.
  - When provider credentials, streaming, native tool calls, reasoning, web search, or error mapping changes.
  - When deciding whether provider work belongs in backend LLM code, config, renderer settings, or model catalog metadata.
title: "Provider Change Workflow"
---

# Provider Change Workflow

WindieOS provider work is backend-owned first. The renderer can display provider/model state, but the backend owns runtime provider creation, request normalization, streaming, native feature handling, model metadata, and credential loading.

## Provider Layers

| Layer | Code roots | Owns |
| --- | --- | --- |
| Provider factory | `backend/src/llm/providers/factory.py` | Provider registration, provider id routing, local/cloud provider construction. |
| Provider base/runtime | `backend/src/llm/providers/base.py`, `online.py`, provider-specific modules | Common request/stream contract, API key handling, tool-call streaming, response parsing. |
| Provider utilities | `message_normalization.py`, `stream_event_pipeline.py`, `streaming_tool_call_aggregation.py`, `provider_native_reasoning.py`, `usage_diagnostics.py`, `error_mapping.py` | Shared normalization and cross-provider behavior. |
| Model catalog | `backend/src/llm/models/models_config.py`, `model_service.py` | Display metadata, runtime ids, capabilities, thinking/reasoning variants, model-list output. |
| Config and credentials | `backend/src/core/config/app_config.py`, `models.py`, `loader.py` | Env var names, default URLs, credential loading, renderer-managed client settings fields. |
| Renderer settings | `frontend/src/renderer/features/settings`, app config providers | Displaying and persisting model/provider choices and credential overrides. |

## Add a New Cloud Provider

1. Decide provider id, env var names, base URL defaults, and whether the provider is generic OpenAI-compatible or needs custom request/stream behavior.
2. Add the provider runtime class under `backend/src/llm/providers/`.
3. Register provider construction in `backend/src/llm/providers/factory.py`.
4. Add credential/config fields in `backend/src/core/config/models.py`, `app_config.py`, and `loader.py` when the provider needs new env vars or renderer-managed settings.
5. Add model catalog entries in `backend/src/llm/models/models_config.py`.
6. Add provider docs, credentials docs, model docs, and renderer settings docs if the user can select or configure the provider.
7. Add backend tests for factory registration, config loading, request kwargs, streaming/tool-call behavior, error mapping, and model-list output.
8. Add frontend tests only when the settings/model picker surface changes.

Prefer the generic online provider path when the provider is plain text/multimodal chat over an OpenAI-compatible HTTP API. Add a custom provider only when request shape, stream parsing, native reasoning/search, tool calls, usage extraction, or error mapping needs provider-specific behavior.

## Change an Existing Provider

| Change type | Primary files | Tests |
| --- | --- | --- |
| API key/env var name | `backend/src/core/config/*`, provider constructor | `tests/backend/test_config_loader.py`, `tests/backend/test_config_models.py`, provider factory tests |
| Base URL or local server default | provider module, config defaults, local provider docs | `tests/backend/test_local_llm_providers.py`, provider-specific tests |
| Request payload shape | provider module, `request_kwargs.py`, provider helpers | Provider-specific tests and `tests/backend/test_llm_request_kwargs.py` |
| Streaming chunks | provider module, stream pipeline helpers | `tests/backend/test_llm_provider_stream_event_pipeline.py`, provider-specific streaming tests |
| Tool-call aggregation | provider module, `streaming_tool_call_aggregation.py` | Provider-specific tool-call tests |
| Native reasoning/search | provider module, `provider_native_reasoning.py`, model catalog flags | `tests/backend/test_provider_native_reasoning.py`, `tests/backend/test_web_search_capabilities.py` |
| Usage diagnostics | provider module, `usage_diagnostics.py` | Provider-specific usage tests and token-count event tests |
| Error mapping | provider module, `error_mapping.py` | Provider-specific failure tests |

## Frontend Surface Rules

| Frontend behavior | Backend source |
| --- | --- |
| Model appears in picker | Backend `list-models` output from model catalog/service. |
| Thinking/reasoning controls appear | Catalog capability flags and selected model metadata. |
| Provider credential field appears | Frontend config/settings surface plus backend config field. |
| Web-search toggle appears | Provider/model capability and backend tool policy. |
| Local provider status is meaningful | Backend provider runtime or model service must be able to report/handle local availability. |

Do not hard-code provider capability only in the renderer. The frontend should reflect backend model/provider metadata.

## Validation Matrix

| Scope | Minimum validation |
| --- | --- |
| Provider factory registration | `./scripts/python-in-env backend pytest tests/backend/test_provider_factory_helpers.py` |
| Model catalog change | `./scripts/python-in-env backend pytest tests/backend/test_models_config.py tests/backend/test_model_service.py` |
| Config/credential change | `./scripts/python-in-env backend pytest tests/backend/test_config_loader.py tests/backend/test_config_models.py` |
| OpenAI-like provider change | Provider-specific tests plus `test_llm_request_kwargs.py` and stream/tool-call tests if streaming changed. |
| Renderer settings/model UI change | `cd frontend && npm run test -- AppConfigProvider.models ModelSelectionUtils ModelsSection SettingsSection` |
| Docs-only provider update | `<windie> docs list`, `git diff --check`, and focused Markdown link checks. |

## Common Mistakes

- Adding a provider class without registering it in the factory.
- Adding catalog entries without a provider id that can route at runtime.
- Adding renderer settings fields without backend config validation.
- Treating local-provider connection failure as a startup failure instead of runtime unavailability.
- Duplicating stream aggregation logic instead of using shared helpers.
- Exposing native web-search or reasoning controls without catalog capability flags.

## Related Docs

- [Providers Hub](README.md)
- [Models and LLM Providers](models.md)
- Provider Credentials (private backend docs)
- [Provider Extension Guide](../plugins/provider_extension_guide.md)
- Backend LLM Provider Docs Hub (private backend docs)
- [Code Change Surface Index](../reference/code_change_surface_index.md)
