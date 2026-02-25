---
summary: "Deep reference for dashboard model selection and API-key storage behavior: mode-scoped model lists, id/provider reconciliation, deterministic fallback, warning timeout lifecycle, and local-storage failure handling."
read_when:
  - When changing `ModelsSection` selection/reset behavior or model search filtering semantics.
  - When modifying dashboard storage helpers or API-key persistence key/value lifecycle.
title: "Models Section Selection Reconciliation and Dashboard Storage Contract Reference"
---

# Models Section Selection Reconciliation and Dashboard Storage Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx`
- `frontend/src/renderer/features/dashboard/utils/modelSelectionUtils.js`
- `frontend/src/renderer/features/dashboard/utils/storage.js`
- `tests/frontend/ModelSelectionUtils.test.js`
- `tests/frontend/DashboardStorageUtils.test.js`

## ModelsSection Runtime Contract

State owned locally:

- `modelResetWarning`
- `searchTerm`
- `apiKey` (seeded from `loadLocalValue('desktop-assistant-api-key')`)

Derived inputs from config:

- `model_mode` default `online`
- `selected_model_id` default empty
- `model_provider` default empty
- `speech_mode_enabled` default `false`
- `interaction_mode` default `chat`

## Model List and Search Semantics

`getCurrentModels(availableModels, modelMode)`:

- returns `availableModels.local` for `local`
- returns `availableModels.online` otherwise
- defaults to empty array when buckets missing/non-array

`filterModelsBySearch(models, searchTerm)`:

- trims + lowercases query
- empty query returns original list
- matches against both model `id` and `provider` case-insensitively

## Config Update Shape Contract

`buildModelConfigUpdate(...)` produces backend-facing shape:

- `model_mode`
- `selected_model_id`
- `model_provider`
- `speech_mode_enabled`
- `interaction_mode`

Selection normalization:

- null/undefined selected model fields normalize to empty strings
- numeric identifiers/providers normalize to strings

## Selection Reconciliation Contract

`evaluateModelSelection({ selectedModelId, selectedProvider, currentModels })` returns:

- `empty`: no selected model id
- `missing`: selected id absent in current mode list, includes reset warning string
- `provider-mismatch`: id exists but provider differs; returns canonical model
- `valid`: exact/normalized id+provider match

Canonical provider behavior:

- candidate models for same id are sorted by provider ascending
- fallback canonical model is deterministic first provider after sort

`ModelsSection` reconciliation side effects:

- `missing` -> warn + display warning banner + call `handleModelSelect(fallback)`
- `provider-mismatch` -> auto-select canonical model
- warning banner auto-clears after `5000ms`
- timeout is cleared on unmount

## API-Key Storage Contract

Storage key:

- `desktop-assistant-api-key`

`saveLocalValue` behavior:

- truthy value -> `localStorage.setItem`
- falsy value (`''`, `null`, etc.) -> `localStorage.removeItem`
- storage errors are swallowed and logged with `[Dashboard]` prefix

`loadLocalValue` behavior:

- returns stored value when available
- returns provided fallback when key missing or storage read fails

## Test-Backed Matrix

`tests/frontend/ModelSelectionUtils.test.js` verifies:

- mode-scoped model list resolution
- search filter behavior across id/provider
- config update payload shape/normalization
- selection statuses (`empty`, `missing`, `provider-mismatch`, `valid`)
- deterministic canonical-provider fallback for duplicate model ids

`tests/frontend/DashboardStorageUtils.test.js` verifies:

- storage read fallback path
- truthy write and falsy remove semantics
- read/write/remove exception swallowing

Coverage note:

- no dedicated component-level tests currently assert `ModelsSection` warning timeout lifecycle or provider-mismatch auto-selection side effects end-to-end.

## Drift Hotspots

1. Changing canonical-provider ordering can create non-deterministic auto-resets across sessions.
2. Altering falsy-value removal semantics in `saveLocalValue` can leave stale API keys in storage.
3. Skipping `speech_mode_enabled` or `interaction_mode` in update payload can unintentionally reset unrelated config fields.

## Related Pages

- [Renderer Dashboard Docs Hub](README.md)
- [App Provider Coordinator and Save-Status Runtime Reference](../providers/app_provider_coordinator_and_save_status_runtime_reference.md)
- [Settings Section Clone Tabs and Wakeword Toggle Runtime Reference](../settings/sections/settings_section_clone_tabs_and_wakeword_toggle_runtime_reference.md)
