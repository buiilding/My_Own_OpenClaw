---
summary: "Renderer config/settings lifecycle reference across renderer providers, main-process settings ACK gating, local storage + disk persistence, and settings runtime sync timing."
read_when:
  - When changing renderer-managed config fields, settings persistence, or update-settings ACK behavior.
  - When debugging stale settings, save-status drift, or first-query settings sync races.
title: "Config Sync and Settings Lifecycle Reference"
---

# Config Sync and Settings Lifecycle Reference

## Canonical Modules

- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/runtime/desktopSettingsRuntimeClient.ts`
- `frontend/src/renderer/app/providers/AppStatusProvider.jsx`
- `frontend/src/renderer/app/runtime/desktopAppConfigRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopSettingsUpdateErrorRuntime.ts`
- `frontend/src/renderer/app/providers/appConfigEvents.js`
- `frontend/src/renderer/app/providers/appConfigPersistence.js`
- `frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopRendererConfigFilterRuntime.js`
- `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_desktop_ui_config.cjs`

## Config Ownership Boundary

Renderer-managed settings are filtered through `filterRendererConfig(...)`:

- `model_mode`
- `model_provider`
- `selected_model_id`
- `interaction_mode`
- `speech_mode_enabled`
- `wakeword_enabled`
- `wakeword_stt_enabled`
- `browser_automation_enabled`
- `include_query_screenshot`
- `provider_api_keys`

Backend-owned speech/transcription runtime policy is intentionally excluded from this surface:

- `speech_provider`
- `stt_provider`

`global_agent_stop_shortcut` remains renderer-owned and local-only:

- persisted in localStorage + main-process disk config
- intentionally removed from backend `update-settings` payloads
- may be rewritten locally when Electron fails to register the requested accelerator and main resolves a supported fallback

All outbound config updates use this boundary before settings runtime sync.

## Renderer Provider Roles

### `AppConfigProvider`

Responsibilities:

- source config state from localStorage on startup
- request model list once for the main dashboard through `DesktopSettingsRuntimeClient.listModels()` after registering the settings event listener, even when the initial runtime connection snapshot is disconnected; this is the startup signal that makes Electron main open the backend websocket for model metadata
- sync non-model config to the settings runtime on connection availability
- merge disk/local updates with current in-memory config
- persist updates to localStorage and disk
- publish `update-settings` through `DesktopSettingsRuntimeClient.updateSettings(...)`
- leave deferred model/provider selection to `DesktopSettingsRuntimeClient.setModel(...)` on send/manual-compaction paths; replay sends its model selection with the retry/edit command payload
- derive the wakeword preference from persisted `config.wakeword_enabled`

Important guardrails:

- shallow-change check avoids redundant re-renders/network writes
- undefined field stripping via sanitize/merge helpers
- list-model request guard key prevents duplicate initial fetches

### `AppStatusProvider`

Tracks transient save state machine:

- `saving` set when UI triggers config update callback
- transitions to `success` when the app config runtime client emits a
  save-status success action
- transitions to `error` when the app config runtime client emits a
  save-status error action for runtime-normalized settings-update failures
- auto-resets to `idle` after timeout window

## Renderer Persistence Layers

### Browser localStorage (`desktopRendererConfigStorageRuntime.js`)

- immediate startup config source
- stores `windieos-config`
- validates shape and clears corrupted payloads
- includes default renderer config fallback
- drops deprecated or backend-owned keys before the in-memory config is rebuilt
- ignores the removed `desktop-assistant-config` key; renderer-local settings at
  that key are not migrated

### Main-process disk config (`ipc_desktop_ui_config.cjs`)

File path:

- `${app.getPath('userData')}/frontend-config.json`

Behavior:

- load returns `null` when missing/invalid
- save validates object payload
- save redacts provider API keys and OAuth access/refresh tokens before writing
- load redacts provider API keys and OAuth access/refresh tokens before returning
- atomic write (`.tmp` then rename)

Renderer invokes:

- `load-frontend-config`
- `save-frontend-config`

## Main-Process Settings Sync Gate (`ipc.cjs`)

Key runtime state:

- `latestDesktopUiConfig`
- `hasAttemptedInitialSettingsSync`
- `pendingSettingsSyncPromise`
- `pendingSettingsSyncs` map keyed by outbound message ID

`update-settings` flow:

1. renderer sends `to-backend` type `update-settings`
2. main calls `sendSettingsUpdate(...)`
3. main sends websocket message with generated ID
4. main waits for ACK (`settings-updated`) or timeout (`SETTINGS_SYNC_TIMEOUT_MS = 2500`)

ACK resolution:

- `settings-updated` with same `id` -> success
- `error` with same `id` -> failure
- timeout -> failure

## First-Query Settings Synchronization

Before forwarding `query` or `wakeword-detected`, main ensures one-time per-connection settings sync:

1. call `ensureInitialSettingsSync()`
2. lazily load cached disk config when needed
3. send `update-settings` and await pending ACK promise
4. only then continue sending query path

Purpose:

- reduce race where first query reaches backend before renderer-managed settings are applied

## Connection/Status Propagation

Main broadcasts `ipc-status` payload with:

- `isConnected`
- `userId`
- `backendWsUrl`
- `backendHttpUrl`
- `globalAgentStopShortcutStatus`

`globalAgentStopShortcutStatus` carries the renderer-visible shortcut runtime state:

- `requestedAccelerator`
- `resolvedAccelerator`
- `registrationFailed`
- `usingFallback`
- supported accelerator list for the current platform

Renderer uses this to:

- update transcript user identity
- update renderer backend HTTP URL for artifact URL composition
- trigger config re-sync when the runtime connection becomes ready
- persist resolved global-stop fallback bindings back into local config and Settings UI when the requested accelerator is unavailable

Renderer app-runtime clients normalize this host payload before feature code
consumes it. `desktopClientSessionRuntimeClient` exposes app-config status
snapshots through value-level `{ snapshot, transcriptUserId, isConnected,
globalAgentStopShortcutStatus }` updates, exposes chat-loop connection state
through observed `{ isConnected }` updates, and preserves
`{ isConnected, hasConnectionState }` normalization for diagnostics and focused
runtime-client tests. UI hooks and providers do not inspect raw `ipc-status`
payload types.

Wakeword overlay suppression also flows through a renderer app-runtime client:
`DesktopVoiceRuntimeClient.onWakewordToggleState(...)` subscribes to the
host `wakeword-toggle` channel, drops non-boolean payloads, and emits
value-level `{ enabled }` updates for `AppConfigProvider`.

## Event Handling Notes

`routeConfigSettingsEvent(...)` currently handles:

- `models-listed` -> available model list update

`AppStatusProvider` separately consumes
`DesktopAppConfigRuntimeClient.onSettingsSaveStatusAction(...)` for:

- save-status `success` actions derived from `settings-updated`
- save-status `error` actions derived from settings-related `error` events

This split keeps model-list behavior independent from save-status UX behavior.

## Debug Checklist

If first query ignores latest settings:

1. verify `ensureInitialSettingsSync()` runs before query send
2. verify `update-settings` ACK (`settings-updated`) arrives with matching message `id`
3. verify `latestDesktopUiConfig` is populated (memory or disk load path)

If UI save indicator sticks on `saving`:

1. verify `settings-updated` or matching error event is returned by backend
2. inspect timeout path in `AppStatusProvider` and main ACK map cleanup
3. ensure `updateConfig(...)` actually detected a shallow change

If settings revert unexpectedly:

1. inspect storage event cross-window sync path
2. verify disk-loaded config was filtered/sanitized correctly
3. verify renderer only merges renderer-managed fields from backend payloads

## Related Renderer Provider Deep Dives

- `docs/frontend/renderer/providers/README.md`
- `docs/frontend/renderer/providers/entrypoint_view_routing_and_provider_stack_reference.md`
- `docs/frontend/renderer/providers/app_provider_coordinator_and_save_status_runtime_reference.md`
- `docs/frontend/renderer/settings/README.md`
- `docs/frontend/renderer/settings/sections/settings_section_clone_tabs_and_wakeword_toggle_runtime_reference.md`
- `docs/frontend/renderer/settings/config/frontend_config_filter_storage_and_provider_merge_runtime_reference.md`
