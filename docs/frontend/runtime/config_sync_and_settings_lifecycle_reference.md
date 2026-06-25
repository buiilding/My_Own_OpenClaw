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
- `frontend/src/renderer/app/providers/appConfigPersistence.js`
- `frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopRendererConfigFilterRuntime.js`
- `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js`
- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_agent_definition_context.cjs`
- `frontend/src/main/ipc/ipc_settings_sync_runtime.cjs`
- `frontend/src/main/ipc/ipc_agent_sdk_runtime_commands.cjs`
- `frontend/src/main/ipc/ipc_desktop_ui_config.cjs`
- `frontend/src/main/ipc/ipc_desktop_ui_config_store.cjs`
- `frontend/src/main/ipc/ipc_global_stop_shortcut_config_runtime.cjs`

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
  through `ipc_global_stop_shortcut_config_runtime.cjs`

All outbound config updates use this boundary before settings runtime sync.

Settings-update failure classification is exposed through
`DesktopSettingsUpdateErrorRuntime`; raw classifier helpers stay private to the
renderer app-runtime module so config save status and chat stream error
suppression share one boundary.

## Renderer Provider Roles

### `AppConfigProvider`

Responsibilities:

- source config state from localStorage on startup
- request model list once for the main dashboard through `DesktopSettingsRuntimeClient.listModels()` after registering the settings event listener, even when the initial runtime connection snapshot is disconnected; this is the startup signal that makes Electron main open the backend websocket for model metadata
- sync non-model config to the settings runtime on connection availability
- merge disk/local updates with current in-memory config and save the merged
  startup snapshot back through Electron main so renderer-local Agent settings
  are available to query-time agent-definition assembly
- persist updates to localStorage and disk
- publish `update-settings` through `DesktopSettingsRuntimeClient.updateSettings(...)`
- leave deferred model/provider selection to `DesktopSettingsRuntimeClient.setModel(...)` on send/manual-compaction paths; replay sends its model selection with the retry/edit SDK command payload so `ConversationRuntime.send()` applies it before inference
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
- `${app.getPath('userData')}/provider-credentials.json` for encrypted
  provider API-key secrets

Behavior:

- load returns `null` when missing/invalid
- save validates object payload
- save redacts provider API keys and OAuth access/refresh tokens before writing
- load redacts provider API keys and OAuth access/refresh tokens before returning
- redacted provider key entries may include non-secret `has_saved_key` display
  state so Settings can show a masked saved-key placeholder after restart
- provider API keys are saved encrypted outside `frontend-config.json`; Electron
  main rehydrates them only for backend-bound `update-settings` payloads
- atomic write (`.tmp` then rename)

### Main-process store semantics (`ipc_desktop_ui_config_store.cjs`)

Behavior:

- renderer saves preserve the main-owned `agent_enabled_mcp_servers` allowlist
  from the Electron-main desktop UI config store, or from disk when the store
  has not hydrated that key yet
- explicit MCP enablement toggles disable that preservation so the toggle result
  is the persisted source of truth
- renderer saves and settings-sync updates preserve absent Agent prompt and
  tool-policy fields (`agent_custom_instructions`,
  `agent_disabled_local_tools`, and `agent_disabled_remote_tools`) from the live
  store, or from disk only before the store has hydrated. Explicit empty strings
  or arrays still clear those fields.
- query-local agent-definition assembly uses an Agent-safe config snapshot that
  repairs stale empty live Agent fields from persisted non-empty Agent settings
  before building `agent_definition`, so a restarted app cannot display a saved
  custom prompt in Settings while sending the default prompt on the next turn;
  explicit empty values saved through `save-frontend-config` remain authoritative
  while disk persistence is in flight
- provider secrets are redacted before the disk save helper is called
- the main-process config store advances with the redacted, persistable config
  before awaiting disk save, so query-local agent-definition context sees
  just-edited Agent settings on the next send even when the renderer fires the
  save asynchronously
- query-local agent-definition context builds a filtered replacement client
  tool manifest from the same live store, including an empty manifest when all
  local Agent tools are disabled, so the SDK websocket query cannot resurrect
  startup handshake tool schemas
- query-local agent-definition merge keeps the current Electron-generated Agent
  system prompt and tool policy authoritative over supplied query definitions,
  so edit/resend or replay payloads cannot resurrect stale prompts or client
  tool manifests while still preserving additive supplied prompt layers and
  runtime metadata
- normal renderer sends and SDK replay commands use the same Electron-main
  runtime-turn context helper before SDK dispatch. Replay remains responsible
  for display row replacement, revision creation, and superseding old turns, but
  it receives current `payload.agent_definition` from the live config store
  through the shared helper instead of falling back to startup SDK session
  defaults.
- the direct wake-up adapter must translate Electron main's `AgentQueryInput`
  into `ConversationRuntime.send` input by placing the query-local
  `agent_definition`, screenshots, attachments, workspace state, resources,
  metadata, and model override in the runtime-owned fields. Passing only
  top-level `agentDefinition` or `backendPayload` drops those fields before the
  backend websocket query.
- disk save failures still report save-status errors, but the live Electron
  session keeps using the latest redacted renderer config until the user changes
  or reloads settings
- save diagnostics record the MCP preservation source and enabled-server counts

Renderer invokes:

- `load-frontend-config`
- `save-frontend-config`

## Main-Process Settings Sync Gate

Electron main composes the settings-sync runtime in `ipc.cjs`, but the
settings ACK gate state lives in `ipc_settings_sync_runtime.cjs`.

Key runtime state:

- Electron-main desktop UI config store snapshot
- `hasAttemptedInitialSettingsSync`
- `pendingSettingsSyncPromise`
- `pendingSettingsSyncs` map keyed by outbound message ID

`update-settings` flow:

1. renderer calls `DesktopSettingsRuntimeClient.updateSettings(...)`, which
   invokes the SDK-shaped `settings.update` command over `windie:invoke`
2. Electron main routes that command through
   `ipc_agent_sdk_runtime_commands.cjs` into `sendSettingsUpdate(...)`
3. `ipc_settings_sync_runtime.cjs` filters the backend settings payload,
   rehydrates enabled redacted provider credentials from Electron main's
   encrypted credential store, ensures the Agent SDK runtime is connected, and
   sends backend websocket `update-settings` through the active SDK runtime
4. main waits for ACK (`settings-updated`) or timeout
   (`SETTINGS_SYNC_TIMEOUT_MS = 2500`)

ACK resolution:

- `settings-updated` with same `id` -> success
- `error` with same `id` -> failure
- timeout -> failure

## First-Query Settings Synchronization

Before forwarding `query` or `wakeword-detected`, main ensures one-time per-connection settings sync:

1. call `ensureInitialSettingsSync()` on the settings-sync runtime
2. lazily load cached disk config when needed
3. send backend websocket `update-settings` through the Agent SDK runtime and
   await the pending ACK promise
4. only then continue sending query path

Purpose:

- reduce race where first query reaches backend before renderer-managed settings are applied
- ensure query-level `agent_definition` context is attached to renderer chat
  sends after cached desktop UI config has hydrated, so persisted Agent
  settings system prompt and tool toggles survive app restart before the first
  new turn
- ensure just-edited Agent settings are read from the live Electron-main desktop
  UI config store, not only from a completed disk save, before attaching
  query-level `agent_definition`

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

Electron main normalizes this shortcut status and persists successful fallback
accelerators through `ipc_global_stop_shortcut_config_runtime.cjs`, not through
backend settings sync.

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

`DesktopSettingsEventRuntimeClient.routeDesktopSettingsEvent(...)` currently
handles:

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
3. verify the desktop UI config store is populated (memory or disk hydrate path)

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
- `docs/frontend/renderer/settings/sections/settings_section_tabs_and_wakeword_toggle_runtime_reference.md`
- `docs/frontend/renderer/settings/config/frontend_config_filter_storage_and_provider_merge_runtime_reference.md`
