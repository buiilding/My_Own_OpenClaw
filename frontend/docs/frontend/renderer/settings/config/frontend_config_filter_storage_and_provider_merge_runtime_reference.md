---
summary: "Deep reference for renderer config ownership boundary: allowlist filtering, localStorage single-key defaults, removed desktop-assistant-config and desktop-assistant-config-version behavior, removed legacy OpenAI selected_model_id migration behavior, and AppConfigProvider sanitize/merge/apply persistence guards."
read_when:
  - When changing renderer-owned config keys (`desktopRendererConfigFilterRuntime`) or local fallback defaults (`desktopRendererConfigStorageRuntime`).
  - When debugging why settings updates are skipped, cross-window storage sync applies unexpectedly, or disk config merges differ from memory state.
  - When resolving stale references to `desktop-assistant-config`, `desktop-assistant-config-version`, `saveConfigToStorage` version arguments, or `Date.now()` storage-version writes.
  - When resolving stale references to removed legacy model id migration behavior, hardcoded OpenAI selected-model ids, `LEGACY_MODEL_ID_MIGRATIONS`, or renderer localStorage selected_model_id rewrites.
title: "Renderer Config Filter, Storage, and Provider Merge Runtime Reference"
---

# Renderer Config Filter, Storage, and Provider Merge Runtime Reference

## Canonical Modules

- `frontend/src/renderer/app/runtime/desktopRendererConfigFilterRuntime.js`
- `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js`
- `frontend/src/renderer/app/runtime/desktopRendererConfigRuntimeClient.js`
- `frontend/src/renderer/app/runtime/desktopAppearanceThemeRuntime.js`
- `frontend/src/renderer/app/runtime/desktopProviderCredentialRuntime.js`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/runtime/desktopAppConfigRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopClientSessionRuntimeClient.ts`
- `frontend/src/renderer/app/providers/appConfigPersistence.js`
- `frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts`
- `tests/frontend/configFilter.test.js`
- `tests/frontend/configStorage.test.js`
- `tests/frontend/AppConfigProvider.models.test.tsx`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`

## Renderer-Owned Config Allowlist (`DesktopRendererConfigFilterRuntime`)

`RENDERER_CONFIG_FIELDS` currently allows:

- `model_mode`
- `model_provider`
- `selected_model_id`
- `interaction_mode`
- `speech_mode_enabled`
- `wakeword_enabled`
- `wakeword_stt_enabled`
- `show_tool_logs`
- `agent_custom_instructions`
- `agent_disabled_local_tools`
- `agent_disabled_remote_tools`
- `agent_enabled_mcp_servers`
- `browser_automation_enabled`
- `global_agent_stop_shortcut`
- `include_query_screenshot`
- `provider_api_keys`
- `appearance_mode`

`agent_custom_instructions` is a legacy persisted key. The Agent settings UI
labels and sends it as the next-turn system prompt replacement; the key remains
unchanged to avoid a renderer config migration.
- `appearance_theme`

Intentionally excluded backend-owned speech/transcription runtime policy:

- `speech_provider`
- `stt_provider`

`DesktopRendererConfigFilterRuntime.filterRendererConfig(config)` behavior:

- non-object input -> `{}`
- includes only keys in the renderer-owned allowlist
- ignores extra runtime, backend-owned, or non-renderer local-runtime config fields

## Local Config Persistence (`DesktopRendererConfigStorageRuntime`)

Storage keys:

- `windieos-config`

Removed storage keys:

- `desktop-assistant-config`
- `desktop-assistant-config-version`

Renderer config persistence is intentionally single-key: config payload changes
are broadcast by the `windieos-config` localStorage write itself, not by
a separate version timestamp.
`DesktopRendererConfigStorageRuntime` owns both the active key accessor and
the storage-event predicate, so provider code routes cross-window sync through
`DesktopRendererConfigStorageRuntime.isRendererConfigStorageEvent(...)`
instead of importing raw skin storage keys.

Storage compatibility note:

- no migration is provided from `desktop-assistant-config`; old renderer-local
  settings at that key are ignored and the UI starts from defaults plus disk
  config if available
- no migration is provided for `desktop-assistant-config-version`; timestamp
  writes remain removed

Default config surface:

The generic storage runtime assembles defaults through the
`desktopRuntimeConfig` facade and imports them from the
`DesktopRuntimeConfig` object. Concrete provider/model defaults, provider key
specs, and appearance palettes live in the active renderer skin so another
desktop skin can replace them without changing
`desktopRendererConfigStorageRuntime.js`.

Appearance mode descriptors, theme editor section/field descriptors, appearance
mode fallback, theme section normalization, system theme resolution, and
document-level CSS-variable theme application live in
`DesktopAppearanceThemeRuntime` in `desktopAppearanceThemeRuntime.js`.
Storage, `AppProvider`, and the dashboard Appearance tab consume that
app-runtime facade instead of reading the raw skin palette table, browser
document/matchMedia adapters, or tab-local editor descriptor tables directly.

Provider key entry normalization and renderer localStorage secret stripping live
in `desktopProviderCredentialRuntime.js`, which consumes those skin defaults
for both dashboard API-key controls and local config persistence.

Current WindieOS skin defaults:

- `model_mode: "online"`
- `model_provider: "openai"`
- `selected_model_id: "gpt-5.4@@gpt-5-4-none-thinking"`
- `interaction_mode: "agent"`
- `speech_mode_enabled: false`
- `wakeword_enabled: true`
- `wakeword_stt_enabled: false`
- `browser_automation_enabled: false`
- `global_agent_stop_shortcut`: normalized platform default accelerator
- `include_query_screenshot: true`
- `provider_api_keys`:
  - `openai`, `anthropic`, `google`, `openrouter`, `mistral`, `kimi_coding`
  - localStorage stores `{ enabled: boolean, api_key: "" }`; raw API keys are scrubbed at this renderer persistence boundary
- `appearance_mode: "system"`
- `appearance_theme`: WindieOS skin-provided light/dark palette defaults

Load semantics (`DesktopRendererConfigStorageRuntime.loadConfigFromStorage`):

- missing key -> fresh default object
- removed `desktop-assistant-config` key -> ignored
- parsed object -> known frontend fields merged over defaults
- invalid JSON / non-object payload -> clear keys + return defaults
- stored `selected_model_id` values are trimmed and preserved as-is; model
  catalog reconciliation happens in the renderer model-selection UI instead of
  in storage migration code
- the old hardcoded OpenAI selected-model migration map
  (`LEGACY_MODEL_ID_MIGRATIONS`) was removed; config storage does not rewrite
  stale `gpt-5` ids to newer catalog ids during localStorage load
- deprecated or backend-owned keys are dropped during normalization instead of being re-saved or re-synced
- stored localStorage provider secrets are normalized to empty strings on read

Save semantics (`DesktopRendererConfigStorageRuntime.saveConfigToStorage`):

- rejects non-object/array payloads
- writes only `windieos-config`
- strips provider `api_key` before serializing to localStorage
- returns boolean success/failure

Disk persistence is split by owner. `AppConfigProvider` sanitizes the payload
through the renderer allowlist, then `DesktopAppConfigRuntimeClient` sends the
provider key entries to Electron main during an explicit config save. Electron
main writes `frontend-config.json` with provider `api_key` values redacted,
stores raw provider keys only in the `provider-credentials.json` encrypted
`safeStorage` side file, and hydrates enabled redacted provider entries from
that encrypted store on `load-frontend-config`. The main-process desktop UI
config store remains redacted so query assembly and MCP registry reads do not
hold raw provider secrets.

Live provider credential edits still flow to backend settings through
`DesktopSettingsRuntimeClient.updateSettings(...)`. Renderer localStorage and
`frontend-config.json` remain scrubbed; only Electron main's encrypted provider
credential store can persist raw renderer-managed provider API-key overrides.
Existing redacted configs without a matching encrypted provider credential entry
cannot recover the original key and must be re-entered once.

## Provider Merge/Apply Guards (`appConfigPersistence`)

`sanitizeRendererProviderConfig`:

- returns `{}` for non-plain objects
- applies the renderer-owned config allowlist through
  `DesktopRendererConfigFilterRuntime.filterRendererConfig(...)`
- drops keys whose value is `undefined`

`mergeRendererProviderConfig(base, patch)`:

- shallow merges sanitized base + patch

`buildMergedRendererConfig(base, patch)`:

- owns the provider-facing update merge by composing allowlist filtering,
  provider-key deep merge, and final sanitization before `AppConfigProvider`
  applies or persists the next config

`applyConfigIfChanged(next, configRef, setConfig)`:

- no-op for empty payload
- no-op when shallow-equal to current config
- otherwise updates ref and state

This is the central dedupe guard preventing redundant writes and settings runtime updates.

## AppConfigProvider Integration Points

### Startup sources

1. seed state from `DesktopRendererConfigStorageRuntime.loadConfigFromStorage()`
2. call `DesktopAppConfigRuntimeClient.loadRendererConfig()`, merge filtered disk
   config over the localStorage seed, and save the merged snapshot back through
   Electron main so localStorage-only fields such as Agent system prompt/tool
   policy hydrate the main config store before queries
3. call `DesktopClientSessionRuntimeClient.loadMainSessionSnapshot()`
4. subscribe through `DesktopClientSessionRuntimeClient.onIpcStatus(...)` and `DesktopAppConfigRuntimeClient.onSettingsEvent(...)`

Renderer feature code reads the config provider through
`DesktopRendererConfigRuntimeClient.useDesktopRendererConfigContext()` instead
of importing the provider context hook directly. The runtime client also owns
deferred query model-selection projection through
`DesktopRendererConfigRuntimeClient.buildDeferredQueryModelSelection(...)`, so
chat send/replay code stays on an app-runtime facade rather than the provider
module surface.

### Update path (`updateConfig`)

1. `buildMergedRendererConfig(currentConfig, newConfig)` applies filtering,
   provider-key merge, and final sanitization through app-config persistence
2. `applyConfigIfChanged` gate
3. optional save-status callback fire
4. persist localStorage (`DesktopRendererConfigStorageRuntime.saveConfigToStorage`)
5. async disk save through `DesktopAppConfigRuntimeClient.saveRendererConfig(...)`; Electron main redacts `frontend-config.json` and persists provider API keys in the encrypted provider credential store
6. runtime sync (`DesktopSettingsRuntimeClient.updateSettings`) for non-model settings only

Deferred runtime fields:

- `model_provider`
- `selected_model_id`

Those two fields remain renderer-local until an actual query/replay send path runs. This avoids backend session churn while the user changes model selection in the header.

### Connection snapshot behavior

When IPC status reports connected:

- provider sends current non-model config to the settings runtime (`DesktopSettingsRuntimeClient.updateSettings`)
- deferred model selection is not pushed on connect/reconnect

### Storage-event sync behavior

On `window.storage` for `windieos-config`:

- `DesktopRendererConfigStorageRuntime.isRendererConfigStorageEvent(...)`
  filters events to the active renderer config storage key and localStorage area
- reload from localStorage
- merge/filter
- apply only when changed; `provider_api_keys` uses content-aware comparison so equivalent nested objects from another window are treated as no-ops
- do not write the applied snapshot back to localStorage, disk, or settings runtime; the storage event is already the persistence broadcast from another renderer

## Event Router Boundary (`desktopSettingsEventRuntimeClient`)

- `DesktopSettingsEventRuntimeClient.routeDesktopSettingsEvent(...)` only
  routes `models-listed` settings events to settings handlers
- transcript user-id normalization belongs to `DesktopClientSessionRuntimeClient`
  IPC status value projection

## Test-Backed Invariants

`configFilter.test.js`:

- allowlist-only projection
- invalid input -> `{}`
- `interaction_mode` and new keys retained

`configStorage.test.js`:

- default-return behavior when empty
- default merge with stored overrides
- invalid payload cleanup
- single-key persistence after the removed `desktop-assistant-config` product
  key and `desktop-assistant-config-version` timestamp behavior
- write-failure handling returns false

`AppConfigProvider.models.test.tsx` and `storageAndIpc.test.tsx`:

- single-shot list-model request guard
- disk config merge applies only when changed
- no-op when disk config equals current config
- cross-window storage event sync path
- connected status triggers settings runtime resync
- connected status excludes deferred model selection from settings runtime resync
- disk-save/load failures log warnings without crashing

## Drift Hotspots

1. Adding renderer-managed runtime settings without updating backend `CLIENT_SETTINGS_PATCH_FIELDS` or renderer defaults causes silent drops.
2. Removing change guards or storage-event write suppression can create write storms to localStorage/disk/backend.
3. Returning `null` instead of default object from storage loader can break provider assumptions.
4. Changing storage key names without migration intentionally starts from fresh
   renderer defaults; document this as a persisted-data compatibility break.

## Related Pages

- [Renderer Settings Config Docs Hub](README.md)
- [Config Sync and Settings Lifecycle Reference](../../../runtime/config_sync_and_settings_lifecycle_reference.md)
- Input Validation and Client Settings Patch Guard Reference (private backend docs)
