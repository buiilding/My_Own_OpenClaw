---
summary: "Kimi Coding provider guide for WindieOS covering Anthropic-compatible routing, base URL normalization, streaming tool-call aggregation, aliases, and tests."
read_when:
  - When changing Kimi Coding provider behavior, model aliases, base URL normalization, streaming tool-call parsing, or credentials.
  - When debugging Kimi tool calls, thinking streams, or provider factory registration.
title: "Kimi Coding Provider"
---

# Kimi Coding Provider

WindieOS treats Kimi Coding as an Anthropic-compatible online provider with Kimi-specific base URL normalization and stream tool-call aggregation.

## Code Ownership

| Concern | Files |
| --- | --- |
| Provider class | `backend/src/llm/providers/kimi_coding.py` |
| Provider factory aliases | `backend/src/llm/providers/__init__.py` |
| Config aliases and env fallback | `backend/src/core/config/models.py`, `backend/src/core/config/loader.py` |
| Model catalog/variants | `backend/src/llm/models/models_config.py` |
| Streamed tool-call aggregation | `backend/src/llm/providers/streaming_tool_call_aggregation.py` |

## Runtime Behavior

`KimiCodingProvider`:

- defaults to `https://api.kimi.com/coding`,
- strips a trailing `/v1` from configured base URLs,
- maps `kimi-for-coding` to runtime model id `k2p5`,
- strips `kimi-coding/`, `kimi-code/`, and `anthropic/` prefixes before sending the model id,
- sets `custom_llm_provider = "anthropic"`,
- supports streaming tool turns through `StreamingToolCallAggregationMixin`.

## Names And Aliases

Provider-name aliases are normalized in the factory:

- `kimi-code`
- `kimi_code`
- `kimi-coding`
- `kimi_coding`

Config models use `kimi_coding`; backend provider keys use `kimi-coding`.

Credential loading checks:

1. Frontend-managed API key override in `provider_api_keys.kimi_coding`.
2. Environment variable from `KimiCodingConfig.api_key_env`, default `KIMI_API_KEY`.

## Change Path

When changing Kimi behavior:

- Keep base URL canonicalization in both config/factory and provider constructor aligned.
- Keep provider key aliases compatible across config, model catalog, and factory lookup.
- Preserve `custom_llm_provider = "anthropic"` unless the upstream runtime changes.
- Add tests for stream tool-call parsing when changing payload handling.

## Tests

Focused backend tests:

```bash
./scripts/test-backend tests/backend/test_kimi_coding_provider.py tests/backend/test_models_config.py -q
./scripts/test-backend tests/backend/test_provider_factory_helpers.py tests/backend/test_config_loader.py -q
```

Focused frontend tests:

```bash
cd frontend
npm run test:ci -- ModelCardData.test.js ApiClient.test.ts AppConfigProvider.models.test.tsx
```
