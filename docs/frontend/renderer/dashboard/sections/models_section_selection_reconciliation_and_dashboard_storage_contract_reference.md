---
summary: "Deep reference for dashboard model selection and API-key settings behavior: mode-scoped model lists, id/provider reconciliation, deterministic fallback, warning timeout lifecycle, and provider-key override config wiring."
read_when:
  - When changing `ModelsSection` selection/reset behavior or model search filtering semantics.
  - When modifying dashboard storage helpers or API-key persistence key/value lifecycle.
title: "Models Section Selection Reconciliation and Dashboard Storage Contract Reference"
---

# Models Section Selection Reconciliation and Dashboard Storage Contract Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/sections/ModelsSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/ApiKeysSection.jsx`
- `frontend/src/renderer/features/dashboard/utils/modelSelectionUtils.js`
- `frontend/src/renderer/utils/configStorage.js`
- `tests/frontend/ModelSelectionUtils.test.js`
- `tests/frontend/ModelsSection.test.jsx`
- `tests/frontend/configStorage.test.js`

## ModelsSection Runtime Contract

State owned locally (`ModelsSection` + `ApiKeysSection`):

- `modelResetWarning`
- `searchTerm`
- `activeProviderView`
- `expanded` (API Keys collapse/expand state)

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

## API-Key Settings Contract

Frontend config field:

- `provider_api_keys`
- nested provider entries: `openai`, `anthropic`, `google`, `openrouter`, `mistral`, `kimi_coding`
- entry shape: `{ enabled: boolean, api_key: string }`

Behavior:

- API key inputs are rendered as masked password fields.
- Per-provider toggle controls whether runtime should use user input key (`enabled=true`) or backend/default key source (`enabled=false`).
- Section is collapsed by default and user-expandable from `API Keys` row.
- `ModelsSection` forwards API key changes through `onConfigChange({ provider_api_keys: ... })`; persistence/sync handled by `AppConfigProvider`.

## Test-Backed Matrix

`tests/frontend/ModelSelectionUtils.test.js` verifies:

- mode-scoped model list resolution
- search filter behavior across id/provider
- config update payload shape/normalization
- selection statuses (`empty`, `missing`, `provider-mismatch`, `valid`)
- deterministic canonical-provider fallback for duplicate model ids

`tests/frontend/ModelsSection.test.jsx` verifies:

- collapsible `API Keys` section render/expand behavior
- provider toggle/input updates to `provider_api_keys` payload

Coverage note:

- no dedicated component-level tests currently assert `ModelsSection` warning timeout lifecycle or provider-mismatch auto-selection side effects end-to-end.

## Drift Hotspots

1. Changing canonical-provider ordering can create non-deterministic auto-resets across sessions.
2. Altering falsy-value removal semantics in `saveLocalValue` can leave stale API keys in storage.
3. Skipping `speech_mode_enabled` or `interaction_mode` in update payload can unintentionally reset unrelated config fields.

## Related Pages

- [Dashboard Sections Docs Hub](README.md)
- [Renderer Dashboard Docs Hub](../README.md)
- [Dashboard Shell Modal Routing Contract Reference](../shell/dashboard_section_router_and_placeholder_panel_contract_reference.md)
- [Usage Section Placeholder Panel and Modal Contract Reference](usage_section_placeholder_panel_and_modal_contract_reference.md)
- [App Provider Coordinator and Save-Status Runtime Reference](../../providers/app_provider_coordinator_and_save_status_runtime_reference.md)
- [Settings Section Clone Tabs and Wakeword Toggle Runtime Reference](../../settings/sections/settings_section_clone_tabs_and_wakeword_toggle_runtime_reference.md)
