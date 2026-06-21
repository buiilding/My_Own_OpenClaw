---
summary: "OpenRouter provider guide for WindieOS covering OpenAI-compatible routing, base URL config, reasoning payload control, catalog entries, and tests."
read_when:
  - When changing OpenRouter provider behavior, base URL config, reasoning controls, model catalog entries, or credentials.
  - When debugging OpenRouter model selection, reasoning text, or provider request payloads.
title: "OpenRouter Provider"
---

# OpenRouter Provider

WindieOS treats OpenRouter as an online OpenAI-compatible provider with a configurable base URL and provider-specific reasoning payload behavior.

## Code Ownership

| Concern | Files |
| --- | --- |
| Provider class | `backend/src/llm/providers/openrouter.py` |
| Provider factory URL normalization | `backend/src/llm/providers/factory.py` |
| Model catalog/variants | `backend/src/llm/models/models_config.py` |
| Credential/base URL config | `backend/src/core/config/models.py`, `backend/src/core/config/loader.py` |
| Web-search fallback planning | `backend/src/tools/web_search` |

## Runtime Behavior

`OpenRouterProvider` sets:

- `provider_label = "OpenRouter"`
- `model_prefix = "openrouter"`
- `stream_includes_thinking = True`
- default `base_url = "https://openrouter.ai/api/v1"`

The provider request hook checks `resolve_provider_thinking_preference(model_id, "openrouter")`:

- `True`: ensure `params["reasoning"]["exclude"]` is `False`.
- `False`: remove `reasoning` from params.
- `None`: leave params unchanged.

## Credential Resolution

Credential priority is:

1. Renderer-managed API key override in `provider_api_keys.openrouter`.
2. Environment variable from `OpenRouterConfig.api_key_env`, default `OPENROUTER_API_KEY`.

Base URL comes from `OpenRouterConfig.base_url` and is normalized in the provider factory.

## Change Path

When adding an OpenRouter model:

1. Add model metadata under the OpenRouter catalog in `models_config.py`.
2. Add reasoning variant metadata if the model should expose thinking controls.
3. Keep runtime model ids compatible with OpenRouter's upstream naming.
4. Add or adjust tests for default entries and reasoning payload behavior.

## Tests

Focused backend tests:

```bash
<windie> test backend tests/backend/test_openrouter_provider.py tests/backend/test_models_config.py -q
<windie> test backend tests/backend/test_model_service.py tests/backend/test_provider_factory_helpers.py -q
```

Focused frontend tests:

```bash
cd frontend
<windie> test frontend -- DesktopModelCardPresentationRuntime.test.js ChatInterfaceWiring.test.jsx
```

