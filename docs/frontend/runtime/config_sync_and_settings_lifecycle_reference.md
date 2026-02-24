---
summary: "Frontend config/settings lifecycle reference across renderer providers, main-process settings ACK gating, local storage + disk persistence, and backend sync timing."
read_when:
  - When changing frontend-managed config fields, settings persistence, or update-settings ACK behavior.
  - When debugging stale settings, save-status drift, or first-query settings sync races.
title: "Config Sync and Settings Lifecycle Reference"
---

# Config Sync and Settings Lifecycle Reference

## Canonical Modules

- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/providers/AppStatusProvider.jsx`
- `frontend/src/renderer/app/providers/appConfigEvents.js`
- `frontend/src/renderer/app/providers/appConfigPersistence.js`
- `frontend/src/renderer/utils/configFilter.js`
- `frontend/src/renderer/utils/configStorage.js`
- `frontend/src/renderer/features/settings/hooks/useSettingsManagement.ts`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc_frontend_config.cjs`

## Config Ownership Boundary

Frontend-managed settings are filtered through `filterFrontendConfig(...)`:

- `model_mode`
- `model_provider`
- `selected_model_id`
- `interaction_mode`
- `voice_mode_enabled`
- `speech_mode_enabled`
- `include_query_screenshot`

All outbound config updates use this boundary before backend sync.

## Renderer Provider Roles

### `AppConfigProvider`

Responsibilities:

- source config state from localStorage on startup
- request model list (`list-models`) once for main view
- sync config to backend on connection availability
- merge disk/local updates with current in-memory config
- persist updates to localStorage and disk
- publish `update-settings` through `ApiClient`

Important guardrails:

- shallow-change check avoids redundant re-renders/network writes
- undefined field stripping via sanitize/merge helpers
- list-model request guard key prevents duplicate initial fetches

### `AppStatusProvider`

Tracks transient save state machine:

- `saving` set when UI triggers config update callback
- transitions to `success` when backend emits `settings-updated`
- transitions to `error` on backend settings-update failure message
- auto-resets to `idle` after timeout window

## Renderer Persistence Layers

### Browser localStorage (`configStorage.js`)

- immediate startup config source
- stores `desktop-assistant-config`
- validates shape and clears corrupted payloads
- includes default frontend config fallback

### Main-process disk config (`ipc_frontend_config.cjs`)

File path:

- `${app.getPath('userData')}/frontend-config.json`

Behavior:

- load returns `null` when missing/invalid
- save validates object payload
- atomic write (`.tmp` then rename)

Renderer invokes:

- `load-frontend-config`
- `save-frontend-config`

## Main-Process Settings Sync Gate (`ipc.cjs`)

Key runtime state:

- `latestFrontendConfig`
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

- reduce race where first query reaches backend before frontend-owned settings are applied

## Connection/Status Propagation

Main broadcasts `ipc-status` payload with:

- `isConnected`
- `userId`
- `backendWsUrl`
- `backendHttpUrl`

Renderer uses this to:

- update transcript user identity
- update artifact uploader backend HTTP base URL
- trigger config re-sync when connection becomes ready

## Event Handling Notes

`routeConfigBackendEvent(...)` currently handles:

- `models-listed` -> available model list update

`AppStatusProvider` separately listens on backend stream for:

- `settings-updated`
- settings-related `error`

This split keeps model-list behavior independent from save-status UX behavior.

## Debug Checklist

If first query ignores latest settings:

1. verify `ensureInitialSettingsSync()` runs before query send
2. verify `update-settings` ACK (`settings-updated`) arrives with matching message `id`
3. verify `latestFrontendConfig` is populated (memory or disk load path)

If UI save indicator sticks on `saving`:

1. verify `settings-updated` or matching error event is returned by backend
2. inspect timeout path in `AppStatusProvider` and main ACK map cleanup
3. ensure `updateConfig(...)` actually detected a shallow change

If settings revert unexpectedly:

1. inspect storage event cross-window sync path
2. verify disk-loaded config was filtered/sanitized correctly
3. verify frontend only merges frontend-owned fields from backend payloads

## Related Renderer Provider Deep Dives

- `docs/frontend/renderer/providers/README.md`
- `docs/frontend/renderer/providers/entrypoint_view_routing_and_provider_stack_reference.md`
- `docs/frontend/renderer/providers/app_provider_coordinator_and_save_status_runtime_reference.md`
- `docs/frontend/renderer/settings/README.md`
- `docs/frontend/renderer/settings/settings_section_display_selection_and_config_toggle_reference.md`
