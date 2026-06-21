---
summary: "Mistral provider guide for WindieOS covering shared online-provider routing, catalog entries, credentials, and tests."
read_when:
  - When changing Mistral provider behavior, model catalog entries, credentials, or shared online provider assumptions.
  - When debugging Mistral model availability or request payloads.
title: "Mistral Provider"
---

# Mistral Provider

WindieOS routes Mistral through the shared online provider path with provider registration and catalog metadata in the same flow as other online providers.

## Code Ownership

| Concern | Files |
| --- | --- |
| Provider class | `backend/src/llm/providers/mistral.py` |
| Shared online provider | `backend/src/llm/providers/online.py` |
| Provider factory registration | `backend/src/llm/providers/factory.py` |
| Model catalog | `backend/src/llm/models/models_config.py` |
| Credential loading | `backend/src/core/config/loader.py`, `backend/src/core/config/models.py` |

## Runtime Behavior

Mistral is registered by the provider factory when an API key is available. The default config is:

- provider key: `mistral`
- default model: `mistral-large-latest`
- API key env var: `MISTRAL_API_KEY`

Provider-specific behavior should stay small unless Mistral needs custom request params, stream parsing, or response normalization. Prefer shared `OnlineLLMProvider` behavior while tests prove it works.

## Credential Resolution

Credential priority is:

1. Renderer-managed API key override in `provider_api_keys.mistral`.
2. Environment variable from `MistralConfig.api_key_env`, default `MISTRAL_API_KEY`.

## Change Path

When adding or changing Mistral models:

1. Update `models_config.py`.
2. Verify model service output and dashboard grouping.
3. Add provider-specific request tests only if behavior diverges from `OnlineLLMProvider`.
4. Keep credential behavior in config loading, not in `MistralProvider`.

## Tests

Focused backend tests:

```bash
<windie> test backend tests/backend/test_models_config.py tests/backend/test_model_service.py -q
<windie> test backend tests/backend/test_provider_factory_helpers.py tests/backend/test_llm_provider_base.py -q
```

Focused frontend tests:

```bash
cd frontend
<windie> test frontend -- DesktopModelCardPresentationRuntime.test.js ChatInterfaceWiring.test.jsx
```

