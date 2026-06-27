---
summary: "Kimi Coding provider guide for WindieOS covering Anthropic-compatible routing, base URL normalization, streaming tool-call aggregation, provider-name forms, and tests."
read_when:
  - When changing Kimi Coding provider behavior, model prefixes, provider-name forms, base URL normalization, streaming tool-call parsing, or credentials.
  - When debugging Kimi tool calls, thinking streams, or provider factory registration.
title: "Kimi Coding Provider"
---

# Kimi Coding Provider

WindieOS treats Kimi Coding as an Anthropic-compatible online provider with Kimi-specific base URL normalization and stream tool-call aggregation.

## Code Ownership

| Concern | Files |
| --- | --- |
| Provider class | private backend implementation |
| Provider factory routing | private backend implementation |
| Config provider fields and env fallback | private backend implementation |
| Model catalog/variants | private backend implementation |
| Streamed tool-call aggregation | private backend implementation |

## Runtime Behavior

`KimiCodingProvider`:

- defaults to `https://api.kimi.com/coding`,
- strips a trailing `/v1` from configured base URLs,
- maps `kimi-for-coding` to runtime model id `k2p5`,
- strips `kimi-coding/` and `anthropic/` prefixes before sending the model id,
- sets `custom_llm_provider = "anthropic"`,
- supports streaming tool turns through `StreamingToolCallAggregationMixin`.

## Names And Prefixes

Current provider names:

- `kimi-coding`
- `kimi_coding`

Other Kimi spellings are not provider aliases. They fall through the same
unknown-provider path as any unsupported provider key.

Config models use `kimi_coding`; runtime provider keys use `kimi-coding`.

Credential loading checks:

1. Renderer-managed API key override in `provider_api_keys.kimi_coding`.
2. Environment variable from `KimiCodingConfig.api_key_env`, default `KIMI_API_KEY`.

## Change Path

When changing Kimi behavior:

- Keep base URL canonicalization in both config/factory and provider constructor aligned.
- Keep provider names aligned across config, credentials, model catalog, prompt
  cache steering, and factory lookup.
- Preserve `custom_llm_provider = "anthropic"` unless the upstream runtime changes.
- Add tests for stream tool-call parsing when changing payload handling.

## Tests

Focused backend tests:

```bash
private backend tests private backend tests -q
private backend tests private backend tests -q
```

Focused frontend tests:

```bash
cd frontend
<windie> test frontend -- DesktopModelCardPresentationRuntime.test.js RendererApiClientBoundary.test.ts AppConfigProvider.models.test.tsx
```
