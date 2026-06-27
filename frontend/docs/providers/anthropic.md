---
summary: "Anthropic provider guide for WindieOS covering LiteLLM routing, native thinking payloads, stream thinking extraction, model catalog variants, and tests."
read_when:
  - When changing Anthropic request parameters, thinking support, stream parsing, model catalog entries, or credentials.
  - When debugging Claude model selection, thinking text, or provider-specific payloads.
title: "Anthropic Provider"
---

# Anthropic Provider

WindieOS routes Anthropic through the shared online provider path with provider-specific thinking request parameters and thinking-content extraction.

## Code Ownership

| Concern | Files |
| --- | --- |
| Provider class | private backend implementation |
| Native thinking helpers | private backend implementation |
| Shared online provider | private backend implementation |
| Model catalog/variants | private backend implementation |
| Credential loading | private backend implementation |
| Dashboard model UI | `frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx` |

## Runtime Behavior

`AnthropicProvider` sets:

- `provider_label = "Anthropic"`
- `model_prefix = "anthropic"`
- `stream_includes_thinking = True`

The request hook calls `apply_provider_native_thinking_request_params` with `provider_name="anthropic"`. Stream deltas use `extract_anthropic_thinking_content`.

## Credential Resolution

Credential priority is:

1. Renderer-managed API key override in `provider_api_keys.anthropic`.
2. Environment variable from `AnthropicConfig.api_key_env`, default `ANTHROPIC_API_KEY`.

Provider code should not read env vars directly.

## Model Catalog

Anthropic model entries and reasoning variants live in private backend implementation. The frontend receives model-list output from backend model service; do not duplicate Anthropic reasoning-mode logic in the renderer.

When adding an Anthropic model:

1. Add catalog metadata.
2. Add thinking/non-thinking variants if the model supports the shared reasoning controls.
3. Confirm `resolve_provider_thinking_preference` and `resolve_provider_thinking_budget_tokens` return the expected values.
4. Update dashboard tests if the model family should expose reasoning controls.

## Tests

Focused backend tests:

```bash
private backend tests private backend tests -q
private backend tests private backend tests -q
```

Focused frontend tests:

```bash
cd frontend
<windie> test frontend -- ChatInterfaceWiring.test.jsx ModelThinkingCapabilities.test.ts DesktopModelCardPresentationRuntime.test.js
```

