---
summary: "Deep reference for Browser Use extraction LLM resolution helpers: provider normalization aliases, env/runtime config precedence, API-key/base-url fallback order, and provider-to-adapter mapping for OpenAI-compatible, Google, and Mistral chat clients."
read_when:
  - When changing Browser Use extraction LLM setup in `browser_runtime.py` or `browser_runtime_extraction.py`.
  - When debugging extraction/read_long_content failures caused by provider aliasing, missing API keys, unsupported provider mapping, or wrong base URL defaults.
title: "Browser Runtime Extraction Provider, Model Resolution, and LLM Adapter Mapping Reference"
---

# Browser Runtime Extraction Provider, Model Resolution, and LLM Adapter Mapping Reference

## Canonical Modules

- `frontend/src/main/python/tools/browser/browser_runtime.py`
- `frontend/src/main/python/tools/browser/browser_runtime_extraction.py`
- `tests/sidecar/tools/test_browser_runtime_extraction.py`

## Runtime Role

`browser_runtime_extraction.py` provides pure helper functions used by `_BrowserUseActionBridge` in `browser_runtime.py`:

- normalize provider names
- resolve extraction target tuple `(provider, model_id, api_key, base_url)` from env + runtime config
- build provider-specific Browser Use chat client instance

These helpers are the bridge between WindieOS model settings and Browser Use extraction actions (`extract`, `read_long_content`).

## Provider Normalization Contract

`normalize_provider_name(provider_name)` rules:

- non-string or blank -> `None`
- trim, lowercase, replace `-` with `_`
- aliases:
  - `kimi_code` -> `kimi_coding`
  - `gemini` -> `google`

Output provider names are canonicalized for downstream mapping.

## Extraction Target Resolution Contract

`resolve_windie_extraction_target(...)` reads explicit extraction envs first:

- `WINDIE_BROWSER_USE_EXTRACTION_PROVIDER`
- `WINDIE_BROWSER_USE_EXTRACTION_MODEL_ID`
- `WINDIE_BROWSER_USE_EXTRACTION_API_KEY`
- `WINDIE_BROWSER_USE_EXTRACTION_BASE_URL`

Then attempts runtime fallback via `backend.src.core.config.loader.load_settings_from_file()`:

- provider fallback from runtime `model_provider` (normalized)
- model fallback from runtime `selected_model_id`
- base URL fallback from provider config `base_url`
- API key fallback order:
  1. runtime `api_key` when runtime provider matches resolved provider
  2. provider config `api_key_env` resolved from process env
  3. legacy `KIMICODE_API_KEY` when provider is `kimi_coding`

If loader import/read fails, helper returns env-derived values without raising.

## OpenAI-Compatible Default Base URL Contract

`OPENAI_COMPAT_EXTRACTION_DEFAULT_BASE_URLS` supplies default base URL only when caller did not provide `base_url`:

- `openrouter` -> `https://openrouter.ai/api/v1`
- `ollama` -> `http://localhost:11434/v1`
- `lmstudio` -> `http://localhost:1234/v1`
- `kimi_coding` -> `https://api.kimi.com/coding`

No default base URL is injected for `openai`.

## LLM Adapter Build Contract

`build_windie_extraction_llm(...)` behavior:

- missing `provider_name` or `model_id` -> `(None, None)`
- OpenAI-compatible providers (`openai`, `openrouter`, `ollama`, `lmstudio`, `kimi_coding`):
  - import `browser_use.llm.openai.chat.ChatOpenAI`
  - kwargs: `model`, optional `api_key`, optional `base_url` (explicit or default)
- `google`:
  - import `browser_use.llm.google.chat.ChatGoogle`
  - kwargs: `model`, optional `api_key`
- `mistral`:
  - import `browser_use.llm.mistral.chat.ChatMistral`
  - kwargs: `model`, optional `api_key`, optional `base_url`
- unsupported provider:
  - returns `(None, "WindieOS extraction provider '<name>' is not mapped...")`

Adapter import/class lookup failures raise runtime errors from `_load_chat_model_type(...)`.

## Integration with Browser Runtime Selection

In `_BrowserUseActionBridge._ensure_page_extraction_llm()`:

1. if `WINDIE_BROWSER_USE_EXTRACTION_MODEL` is set, Browser Use `get_llm_by_name(...)` path wins
2. otherwise use WindieOS helper tuple + adapter build path above
3. if unresolved, runtime raises actionable config error mentioning required envs

This guarantees deterministic extraction LLM resolution order.

## Test-Backed Invariants

`tests/sidecar/tools/test_browser_runtime_extraction.py` validates:

- provider alias normalization (`kimi-code`, `gemini`, mixed-case provider names)
- env-first tuple resolution when loader is unavailable
- runtime config fallback for provider/model/api key/base URL
- OpenRouter default base URL injection for OpenAI-compatible adapter path
- unsupported provider path returns explanatory error text

## Drift Hotspots

1. Removing alias normalization can break `gemini` and `kimi-code` extraction compatibility.
2. Changing env/runtime precedence can silently override explicit extraction overrides.
3. Dropping provider-config `api_key_env` fallback can break shared provider credential setups.
4. Adding provider names without adapter mapping causes runtime extraction failures with unsupported-provider errors.

## Related Pages

- [Frontend Sidecar Browser Docs Hub](README.md)
- [Browser Runtime Provider, Vendoring, and Native Handler Bridge Reference](browser_runtime_provider_vendoring_and_native_handler_bridge_reference.md)
- [Browser Action Compatibility and Runtime Reference](../browser_action_compatibility_and_runtime_reference.md)
