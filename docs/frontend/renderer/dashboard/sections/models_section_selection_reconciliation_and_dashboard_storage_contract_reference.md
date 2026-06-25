---
summary: "Deep reference for dashboard ModelsSection runtime: provider-first navigation, model/provider reconciliation, app-runtime card projection, and provider API-key config payload contracts."
read_when:
  - When changing `ModelsSection` provider/model selection flow or reconciliation behavior.
  - When modifying model card/provider card app-runtime projection or API-key payload normalization.
title: "Models Section Selection Reconciliation and Dashboard Storage Contract Reference"
---

# Models Section Selection Reconciliation and Dashboard Storage Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/ApiKeysSection.jsx`
- `frontend/src/renderer/app/runtime/desktopModelCardPresentationRuntime.js`
- `frontend/src/renderer/app/runtime/desktopProviderCredentialRuntime.js`
- `frontend/src/renderer/features/dashboard/components/sections/modelCards.jsx`
- `frontend/src/renderer/app/runtime/desktopModelSelectionRuntime.js`
- `tests/frontend/ModelSelectionUtils.test.js`
- `tests/frontend/ModelsSection.test.jsx`
- `tests/frontend/DesktopModelCardPresentationRuntime.test.js`

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
- `provider_api_keys` normalized via
  `DesktopProviderCredentialRuntime.normalizeProviderApiKeys(...)`

## Provider-First Navigation Contract

Surface order:

1. provider list (`ProviderCard` rows)
2. provider-scoped model list (`ModelCard` rows) after provider click

Toolbar behavior in provider-scoped view:

- `Back to providers` resets `activeProviderView` and clears hover state
- provider label shown in toolbar metadata

Provider cards are derived through `DesktopModelCardPresentationRuntime` in
`desktopModelCardPresentationRuntime.js`:

- grouped by normalized provider label
- sorted selected-provider group first, then alphabetical provider order
- count and selected-state shown per provider

## Model Card Mapping Contract

`DesktopModelCardPresentationRuntime.toModelCard(model, isRecommended)` maps
backend model objects to display card shape:

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

Canonicalization rules in `DesktopModelSelectionRuntime`:

- candidate models for same id sorted by provider asc
- first sorted provider chosen for mismatch recovery

Fallback selection:

- `getFallbackModelSelection(currentModels)` returns first model or empty selection

Warning timer behavior:

- `DesktopModelSelectionRuntime.scheduleModelResetWarningClear(...)` owns the
  browser timer used to clear missing-model reset warnings after `5000ms`
- `DesktopModelSelectionRuntime.clearModelResetWarningTimer(...)` owns cleanup
  for replacement and unmount
- `ModelsSection` owns warning state and selection side effects, but does not
  call browser timeout APIs directly

Outbound config update on model select
(`DesktopModelSelectionRuntime.buildModelConfigUpdate`):

- `model_mode`
- `selected_model_id`
- `model_provider`
- `speech_mode_enabled`
- `interaction_mode`

## API Keys Contract

`ApiKeysSection` behavior:

- collapsed by default (`expanded=false`)
- toggles each provider key via
  `DesktopProviderCredentialRuntime.getProviderApiKeySpecs()`
- value/input updates call `onProviderApiKeysChange(...)`

Provider credential runtime normalization
(`DesktopProviderCredentialRuntime.normalizeProviderApiKeys(...)`) guarantees
fixed provider key set:

- `openai`, `anthropic`, `kimi_coding`, `google`, `openrouter`, `mistral`
- each entry shape: `{ enabled: boolean, api_key: string, has_saved_key: boolean, clear_saved_key?: boolean }`
- `has_saved_key` is a non-secret display marker used to show a masked saved-key
  placeholder after restart when `api_key` is intentionally redacted
- saved redacted keys lock the text input and show a `Delete` button; pressing
  it emits transient `clear_saved_key`, removes the encrypted credential, clears
  `has_saved_key`, unlocks the input, and keeps the provider toggle state intact

`ModelsSection` forwards API-key updates as partial config patch:

- `onConfigChange({ provider_api_keys: normalizedKeys })`

Persistence/sync remains owned by the AppConfig provider pipeline and Electron
main config persistence. Renderer localStorage and `frontend-config.json` keep
provider `api_key` fields redacted but may preserve `has_saved_key`; transient
`clear_saved_key` is a renderer-to-main delete signal, not a backend setting.
Electron main persists raw renderer-managed provider keys only in the encrypted
provider credential store and hydrates enabled entries for backend-bound
settings sync.

## Test-Backed Signals

`tests/frontend/ModelSelectionUtils.test.js` verifies:

- mode-scoped model resolution
- update payload normalization
- status matrix (`empty|missing|provider-mismatch|valid`)
- deterministic provider canonicalization and fallback behavior
- model-reset warning timer scheduling, replacement, cleanup, and
  missing-adapter fallback behavior

`tests/frontend/ModelsSection.test.jsx` verifies:

- close button contract
- provider-first list flow + provider-scoped model display
- provider-specific model selection payload
- API-key section expand behavior and provider payload updates
- absence of unsupported OAuth controls

## Drift Hotspots

1. Changing provider normalization rules in one helper only can split provider grouping vs selection matching.
2. Removing provider from selection checks (`id`-only) can select wrong provider variant for duplicate ids.
3. Extending provider API key schema without updating `desktopProviderCredentialRuntime` drops new provider keys from persisted payloads.
4. Moving warning timeout cleanup out of `DesktopModelSelectionRuntime` can
   leak timers on panel unmount or reintroduce raw browser timer calls in the
   section.

## Related Pages

- [Dashboard Sections Docs Hub](README.md)
- [Renderer Dashboard Docs Hub](../README.md)
- [App Provider Coordinator and Save-Status Runtime Reference](../../providers/app_provider_coordinator_and_save_status_runtime_reference.md)
- [Renderer Config Filter, Storage, and Provider Merge Runtime Reference](../../settings/config/frontend_config_filter_storage_and_provider_merge_runtime_reference.md)
