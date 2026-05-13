---
summary: "Deep reference for dashboard ModelsSection runtime: provider-first navigation, model/provider reconciliation, helper-module card mapping, and provider API-key config payload contracts."
read_when:
  - When changing `ModelsSection` provider/model selection flow or reconciliation behavior.
  - When modifying model card/provider card helper modules or API-key payload normalization.
title: "Models Section Selection Reconciliation and Dashboard Storage Contract Reference"
---

# Models Section Selection Reconciliation and Dashboard Storage Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/ApiKeysSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/modelCardData.js`
- `frontend/src/renderer/features/dashboard/components/sections/modelCards.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/providerApiKeys.js`
- `frontend/src/renderer/features/dashboard/utils/modelSelectionUtils.js`
- `tests/frontend/ModelSelectionUtils.test.js`
- `tests/frontend/ModelsSection.test.jsx`

## ModelsSection Runtime Contract

Local state:

- `modelResetWarning`
- `hoveredModel`
- `activeProviderView`

Derived config inputs:

- `model_mode` (default `online`)
- `selected_model_id` (default empty)
- `model_provider` (default empty)
- `speech_mode_enabled` (default `false`)
- `interaction_mode` (default `agent`)
- `provider_api_keys` normalized via `normalizeProviderApiKeys(...)`

## Provider-First Navigation Contract

Surface order:

1. provider list (`ProviderCard` rows)
2. provider-scoped model list (`ModelCard` rows) after provider click

Toolbar behavior in provider-scoped view:

- `Back to providers` resets `activeProviderView` and clears hover state
- provider label shown in toolbar metadata

Provider cards are derived by `toProviderCards(...)`:

- grouped by normalized provider label
- sorted selected-provider group first, then alphabetical provider order
- count and selected-state shown per provider

## Model Card Mapping Contract

`toModelCard(model, isRecommended)` maps backend model objects to display card shape:

- `id`, `provider`
- descriptive metadata (`description`, `strengths`) inferred from provider family
- context display from `context_window|contextWindow|context`
- pricing/latency fallbacks (`input_price`, `output_price`, default latency)
- optional `badge` (`Recommended` for first scoped model)

`ModelCard` behavior:

- hover toggles expanded details panel
- click dispatches selection via canonical source model lookup in `currentModels`
- selected dot is shown when both id and provider match config

## Selection Reconciliation Contract

`evaluateModelSelection(...)` statuses drive side effects:

- `empty`: no-op
- `missing`: show warning, auto-select fallback model, clear warning after `5000ms`
- `provider-mismatch`: auto-select canonical provider match for selected id
- `valid`: no-op

Canonicalization rules in `modelSelectionUtils`:

- candidate models for same id sorted by provider asc
- first sorted provider chosen for mismatch recovery

Fallback selection:

- `getFallbackModelSelection(currentModels)` returns first model or empty selection

Outbound config update on model select (`buildModelConfigUpdate`):

- `model_mode`
- `selected_model_id`
- `model_provider`
- `speech_mode_enabled`
- `interaction_mode`

## API Keys Contract

`ApiKeysSection` behavior:

- collapsed by default (`expanded=false`)
- toggles each provider key via `PROVIDER_API_KEY_SPECS`
- value/input updates call `onProviderApiKeysChange(...)`

`providerApiKeys` normalization (`normalizeProviderApiKeys`) guarantees fixed provider key set:

- `openai`, `anthropic`, `kimi_coding`, `google`, `openrouter`, `mistral`
- each entry shape: `{ enabled: boolean, api_key: string }`

`ModelsSection` forwards API-key updates as partial config patch:

- `onConfigChange({ provider_api_keys: normalizedKeys })`

Persistence/sync remains owned by AppConfig provider pipeline.

## OAuth Contract

`ModelsSection` does not expose provider OAuth controls. The renderer config
storage/sync layer may still preserve `provider_oauth` values from older local
state or non-UI sources, but the models settings surface no longer mutates
OAuth state.

## Test-Backed Signals

`tests/frontend/ModelSelectionUtils.test.js` verifies:

- mode-scoped model resolution
- update payload normalization
- status matrix (`empty|missing|provider-mismatch|valid`)
- deterministic provider canonicalization and fallback behavior

`tests/frontend/ModelsSection.test.jsx` verifies:

- close button contract
- provider-first list flow + provider-scoped model display
- provider-specific model selection payload
- API-key section expand behavior and provider payload updates
- absence of unsupported OAuth controls

## Drift Hotspots

1. Changing provider normalization rules in one helper only can split provider grouping vs selection matching.
2. Removing provider from selection checks (`id`-only) can select wrong provider variant for duplicate ids.
3. Extending provider API key schema without updating `normalizeProviderApiKeys` drops new provider keys from persisted payloads.
4. Breaking warning timeout cleanup can leak timers on panel unmount.

## Related Pages

- [Dashboard Sections Docs Hub](README.md)
- [Renderer Dashboard Docs Hub](../README.md)
- [App Provider Coordinator and Save-Status Runtime Reference](../../providers/app_provider_coordinator_and_save_status_runtime_reference.md)
- [Frontend Config Filter, Storage, and Provider Merge Runtime Reference](../../settings/config/frontend_config_filter_storage_and_provider_merge_runtime_reference.md)
