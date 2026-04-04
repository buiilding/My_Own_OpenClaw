---
summary: "Deep reference for AppProvider/AppConfigProvider/AppStatusProvider coordination: settings save callback bridge, shift-tab mode toggle guardrails, persistence layers, and IPC sync behavior."
read_when:
  - When changing renderer config/status providers or app-level keyboard shortcut behavior.
  - When debugging stale config persistence, duplicate model-list fetches, or save-status stuck states.
title: "App Provider Coordinator and Save-Status Runtime Reference"
---

# App Provider Coordinator and Save-Status Runtime Reference

## Canonical Modules

- `frontend/src/renderer/app/providers/AppProvider.jsx`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/providers/AppStatusProvider.jsx`
- `frontend/src/renderer/app/providers/appConfigEvents.js`
- `frontend/src/renderer/app/providers/appConfigPersistence.js`
- `frontend/src/renderer/app/providers/configComparison.ts`
- `tests/frontend/AppProvider.test.tsx`
- `tests/frontend/AppConfigProvider.models.test.tsx`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`
- `tests/frontend/AppStatusProvider.test.tsx`

## Provider Split and Coordination

`AppProvider` nesting:

1. `AppConfigProvider`
2. `AppStatusProvider`
3. internal `AppContextCoordinator`

Coordinator responsibilities:

- register `statusContext.setSaving` callback into config provider
- maintain ref snapshots of `config` and `updateConfig`
- own global `Shift+Tab` interaction-mode toggle shortcut

This keeps config data and transient save-status state decoupled while still connected for settings save UX.

## Shift+Tab Mode Toggle Contract

Shortcut trigger conditions:

- key is `Tab`
- `shiftKey=true`
- no `alt/ctrl/meta`
- not auto-repeat
- target is not editable element/contenteditable textbox

Toggle behavior:

- current mode from `config.interaction_mode` defaulting to `"agent"`
- switches `chat <-> agent`
- calls `updateConfig({...currentConfig, interaction_mode: nextMode})`

Guard behavior:

- no-op when `updateConfig` is not callable

Test anchors:

- `tests/frontend/AppProvider.test.tsx` validates toggle, non-editable guard, and listener single-bind semantics.

## AppConfigProvider State Ownership

State fields:

- `config`
- `availableModels` (`local`, `online`)
- derived `wakewordEnabled = config.wakeword_enabled !== false`
- `wakewordSuppressed`
- derived `wakewordActive = wakewordEnabled && !wakewordSuppressed`

Callback API:

- `updateConfig(newConfig)`
- `registerSaveStatusCallback(callback)`
- `setWakewordEnabled(boolean)` -> delegates to `updateConfig({ wakeword_enabled })`

## Startup and Sync Sources

Initialization/sync inputs:

1. localStorage (`loadConfigFromStorage`) as initial state seed
2. renderer view (`window.location.search`) for initial wakeword suppression seed
3. backend stream listener for `models-listed`
4. IPC status events (`ipc-status`) for transcript user and backend HTTP URL snapshot
5. initial `get-client-user-id` invoke for startup snapshot
6. disk config load (`load-frontend-config`) merge path
7. browser `storage` event cross-window sync

One-time model-list request guard:

- key: `__windie_models_list_requested__`
- request sent only on main view (no `view` query param)

## Config Merge/Persistence Guards

`buildMergedFrontendConfig(incoming)`:

- filters to frontend-owned keys
- merges with current config
- strips `undefined` keys

`applyConfigIfChanged(...)`:

- rejects empty payloads
- shallow-comparison guard prevents no-op writes/renders

`updateConfig` write path:

1. merge/filter/sanitize
2. shallow-change gate
3. invoke save-status callback if registered
4. persist localStorage
5. async save to disk via IPC invoke
6. send backend `update-settings` via `ApiClient.updateSettings`

Shared commit path:

- disk-load reconcile, runtime fallback config writes, and explicit `updateConfig(...)` calls all flow through the same apply/commit helper path
- browser `storage` sync reuses the same apply path but skips disk/backend side effects

## AppStatusProvider Save-State Machine

State values:

- `idle`
- `saving`
- `success`
- `error`

Transitions:

- `setSaving()` -> `saving`, with 10s timeout fallback to `error`
- backend `settings-updated` -> `success`, then auto-reset to `idle` after 3s
- backend `error` containing `"Failed to update settings"` -> `error`, then auto-reset after 3s

Cleanup:

- clears backend listener and both timers on unmount

## Wakeword Suppression Wiring

Channel listener:

- `ON_CHANNELS.WAKEWORD_TOGGLE`

Payload handling:

- when `enabled` is boolean:
  - `wakewordSuppressed = !enabled`
- non-boolean payload ignored

Net effect:

- explicit suppression/unsuppression from main process overlays gates detection despite local preference.

## Drift Hotspots

1. changing filter/persistence helpers and bypassing frontend-owned config boundary
2. registering duplicate model-list fetches across windows
3. removing shallow-change guard and causing write storms
4. changing save-status error string matching without aligned backend message text

## Related Pages

- [Renderer Provider Contexts Docs Hub](contexts/README.md)
- [App Config and Status Context Hook Guard and Re-Export Boundary Reference](contexts/app_config_and_status_context_hook_guard_and_reexport_boundary_reference.md)
- [Chat Provider Bootstrap Flag and Empty-Context Contract Reference](contexts/chat_provider_bootstrap_flag_and_empty_context_contract_reference.md)
- [Renderer Provider Shortcut Docs Hub](shortcuts/README.md)
- [Shift+Tab Mode Toggle and Editable Target Guard Reference](shortcuts/shift_tab_mode_toggle_and_editable_target_guard_reference.md)

## Debug Checklist

If settings button shows perpetual saving:

1. verify `registerSaveStatusCallback` is called by coordinator
2. verify backend emits `settings-updated` or matching failure error message
3. inspect timeout path in `AppStatusProvider` and timer cleanup

If updates appear in UI but not backend:

1. verify `ApiClient.updateSettings` call after `updateConfig`
2. inspect `buildMergedFrontendConfig` filtering for dropped keys
3. verify connection snapshot path triggers `syncCurrentConfigToBackend` when connected

If model list fetch fires repeatedly:

1. verify main view detection (`!view`)
2. verify `LIST_MODELS_REQUEST_GUARD_KEY` lifetime in renderer process
3. inspect remount paths that might clear global guard unexpectedly
