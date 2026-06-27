---
summary: "Deep reference for AppProvider/AppConfigProvider/AppStatusProvider coordination: settings save callback bridge, shift-tab mode toggle guardrails, persistence layers, and runtime-client sync behavior."
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
- `frontend/src/renderer/app/runtime/desktopAppProviderRuntime.js`
- `frontend/src/renderer/app/runtime/desktopAppConfigRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopClientSessionRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopConversationSessionRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopSettingsUpdateErrorRuntime.ts`
- `frontend/src/renderer/app/runtime/desktopStartupRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopTranscriptSessionRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopVoiceRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopRendererConfigRuntimeClient.js`
- `frontend/src/renderer/app/providers/appConfigPersistence.js`
- `frontend/src/renderer/app/providers/configComparison.ts`
- `tests/frontend/AppProvider.test.tsx`
- `tests/frontend/AppConfigProvider.models.test.tsx`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`
- `tests/frontend/AppStatusProvider.test.tsx`
- `tests/frontend/DesktopAppProviderRuntime.test.js`

## Provider Split and Coordination

`AppProvider` nesting:

1. `AppConfigProvider`
2. `AppStatusProvider`
3. internal `AppContextCoordinator`

Coordinator responsibilities:

- register `statusContext.setSaving` callback into config provider
- maintain ref snapshots of `config` and `updateConfig`
- own global `Shift+Tab` interaction-mode toggle shortcut
- route global keydown listener setup/cleanup and editable-target checks
  through `DesktopAppProviderRuntime`

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
2. renderer view via
   `DesktopStartupRuntimeClient.shouldSuppressWakewordOnStartup()` for initial
   wakeword suppression seed
3. settings-event listener through `DesktopAppConfigRuntimeClient.onSettingsEvent(...)` for `models-listed`
4. `DesktopClientSessionRuntimeClient.onIpcStatusValues(...)` for normalized connection, session/user, shortcut-status, and runtime HTTP URL snapshot values
5. `DesktopClientSessionRuntimeClient.loadMainSessionSnapshot()` for startup snapshot
6. disk config load through `DesktopAppConfigRuntimeClient.loadRendererConfig()`
7. browser `storage` event cross-window sync

One-time model-list request guard:

- key: `__windie_models_list_requested__`
- request sent only on main view (no `view` query param)

## Config Merge/Persistence Guards

`buildMergedRendererConfig(incoming)`:

- filters to renderer-managed settings keys
- merges with current config
- strips `undefined` keys

`applyConfigIfChanged(...)`:

- rejects empty payloads
- shallow-comparison guard prevents no-op writes/renders

`updateConfig` write path:

1. merge/filter/sanitize
2. shallow-change gate
3. invoke save-status callback if registered
4. build a redacted persistence payload for renderer localStorage and Electron disk config
5. persist localStorage
6. persist through `DesktopAppConfigRuntimeClient.saveRendererConfig(...)` with provider API keys and OAuth tokens scrubbed
7. sync the live, unredacted provider credential patch to SDK runtime settings when runtime-owned settings changed

Shared commit path:

- disk-load reconcile, runtime fallback config writes, and explicit `updateConfig(...)` calls all flow through the same apply/commit helper path
- browser `storage` sync reuses the same apply path but skips disk/backend side effects

## Runtime Client Boundary

`AppConfigProvider` and `AppStatusProvider` own renderer state machines only.
Electron host transport is routed through app runtime clients:

- `DesktopAppConfigRuntimeClient` owns renderer config disk persistence,
  normalized settings-event fan-out, settings-update failure classification,
  and value-level save-status actions for status-provider consumers.
- `DesktopSettingsUpdateErrorRuntime` owns the shared settings-update failure
  text classifier used by settings-event normalization and chat stream error
  suppression while keeping raw classifier helpers private to
  `desktopSettingsUpdateErrorRuntime.ts`.
- `DesktopClientSessionRuntimeClient` owns main-session snapshots and
  value-level IPC status fan-out for transcript user id, connection state, and
  global-stop shortcut status.
- `DesktopConversationSessionRuntimeClient` owns shared session-helper rule routing for runtime clients.
- `DesktopSettingsEventRuntimeClient` owns model-list settings-event payload handling for providers.
- `DesktopSettingsEventRuntimeClient.routeDesktopSettingsEvent(...)` owns raw
  `models-listed` settings-event type dispatch for app config providers.
- `DesktopSettingsEventRuntimeClient.useDesktopSettingsEventHandlers(...)`
  owns provider-facing model-list handler callbacks for app config providers.
- `DesktopTranscriptSessionRuntimeClient` owns transcript-session binding updates derived from connection snapshots.
- `DesktopVoiceRuntimeClient` owns value-level wakeword-toggle state fan-out.
- `DesktopRendererConfigRuntimeClient` owns feature-facing config context access
  and deferred query model-selection projection so chat, onboarding, and
  settings feature code consume app-runtime facade methods instead of provider
  hook exports.
- `DesktopSettingsRuntimeClient` owns SDK settings/model commands.
- `DesktopAppProviderRuntime` owns browser listener adapters for provider
  keydown/storage events, app localStorage access for storage-event filtering,
  editable-target detection, and save-status timeout scheduling/cleanup.

Provider code should not import `IpcBridge`, channel constants, or SDK desktop transport channel names directly.
Provider code should also avoid raw browser listener/timer calls; route those
through `DesktopAppProviderRuntime` while keeping state transition policy in
the provider.

## AppStatusProvider Save-State Machine

State values:

- `idle`
- `saving`
- `success`
- `error`

Transitions:

- `setSaving()` -> `saving`, with 10s timeout fallback to `error`
- runtime save-status `success` action -> `success`, then auto-reset to `idle` after 3s
- runtime save-status `error` action -> `error`, then auto-reset after 3s

Cleanup:

- clears settings-event listener and both timers on unmount
- timer scheduling and cleanup are delegated to `DesktopAppProviderRuntime`

## Wakeword Suppression Wiring

Runtime listener:

- `DesktopVoiceRuntimeClient.onWakewordToggleState(...)`

Value handling:

- runtime client emits boolean `enabled` states only
- provider applies `wakewordSuppressed = !enabled`

Net effect:

- explicit suppression/unsuppression from main process overlays gates detection despite local preference.

## Drift Hotspots

1. changing filter/persistence helpers and bypassing the renderer-managed config boundary
2. registering duplicate model-list fetches across windows
3. removing shallow-change guard and causing write storms
4. changing settings-update failure classification without updating the shared runtime classifier and backend message contract

## Related Pages

- [Renderer Provider Contexts Docs Hub](contexts/README.md)
- [App Config and Status Context Hook Guard and Re-Export Boundary Reference](contexts/app_config_and_status_context_hook_guard_and_reexport_boundary_reference.md)
- [Chat Provider Bootstrap Flag Contract Reference](contexts/chat_provider_bootstrap_flag_contract_reference.md)
- [Renderer Provider Shortcut Docs Hub](shortcuts/README.md)
- [Shift+Tab Mode Toggle and Editable Target Guard Reference](shortcuts/shift_tab_mode_toggle_and_editable_target_guard_reference.md)

## Debug Checklist

If settings button shows perpetual saving:

1. verify `registerSaveStatusCallback` is called by coordinator
2. verify the settings runtime emits a save-status action through `DesktopAppConfigRuntimeClient`
3. inspect timeout path in `AppStatusProvider` and timer cleanup

If updates appear in UI but not backend:

1. verify `DesktopSettingsRuntimeClient.updateSettings` call after `updateConfig` for non-model settings; model selection should wait for `DesktopSettingsRuntimeClient.setModel(...)`
2. inspect `buildMergedRendererConfig` filtering for dropped keys
3. verify connection snapshot path triggers `syncCurrentConfigToRuntime` when connected

If model list fetch fires repeatedly:

1. verify main view detection (`!view`)
2. verify `LIST_MODELS_REQUEST_GUARD_KEY` lifetime in renderer process
3. inspect remount paths that might clear global guard unexpectedly
