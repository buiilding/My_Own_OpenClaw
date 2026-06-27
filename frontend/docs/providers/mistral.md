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
| Provider class | private backend implementation |
| Shared online provider | private backend implementation |
| Provider factory registration | private backend implementation |
| Model catalog | private backend implementation |
| Credential loading | private backend implementation |

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
private backend tests private backend tests -q
private backend tests private backend tests -q
```

Focused frontend tests:

```bash
cd frontend
<windie> test frontend -- DesktopModelCardPresentationRuntime.test.js ChatInterfaceWiring.test.jsx
```

