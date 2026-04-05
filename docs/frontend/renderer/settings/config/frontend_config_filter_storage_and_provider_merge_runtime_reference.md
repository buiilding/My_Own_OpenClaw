---
summary: "Deep reference for frontend config ownership boundary: allowlist filtering, localStorage default/version handling, and AppConfigProvider sanitize/merge/apply persistence guards."
read_when:
  - When changing frontend-owned config keys (`configFilter`) or local fallback defaults (`configStorage`).
  - When debugging why settings updates are skipped, cross-window storage sync applies unexpectedly, or disk config merges differ from memory state.
title: "Frontend Config Filter, Storage, and Provider Merge Runtime Reference"
---

# Frontend Config Filter, Storage, and Provider Merge Runtime Reference

## Canonical Modules

- `frontend/src/renderer/utils/configFilter.js`
- `frontend/src/renderer/utils/configStorage.js`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/providers/appConfigPersistence.js`
- `frontend/src/renderer/app/providers/appConfigEvents.js`
- `tests/frontend/configFilter.test.js`
- `tests/frontend/configStorage.test.js`
- `tests/frontend/AppConfigProvider.models.test.tsx`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`

## Frontend-Owned Config Allowlist (`configFilter`)

`FRONTEND_CONFIG_FIELDS` currently allows:

- `model_mode`
- `model_provider`
- `selected_model_id`
- `interaction_mode`
- `speech_mode_enabled`
- `wakeword_enabled`
- `wakeword_stt_enabled`
- `agent_full_sudo_enabled`
- `browser_automation_enabled`
- `global_agent_stop_shortcut`
- `include_query_screenshot`
- `provider_api_keys`
- `provider_oauth`

Intentionally excluded backend-owned speech/transcription runtime policy:

- `speech_provider`
- `stt_provider`

`filterFrontendConfig(config)` behavior:

- non-object input -> `{}`
- includes only keys in allowlist
- ignores extra backend/config fields

## Local Config Persistence (`configStorage`)

Storage keys:

- `desktop-assistant-config`
- `desktop-assistant-config-version`

Default config surface:

- `model_mode: "online"`
- `model_provider: "openai"`
- `selected_model_id: "gpt-5.4@@gpt-5-4-none-thinking"`
- `interaction_mode: "agent"`
- `speech_mode_enabled: false`
- `wakeword_enabled: true`
- `wakeword_stt_enabled: false`
- `agent_full_sudo_enabled: false`
- `browser_automation_enabled: false`
- `global_agent_stop_shortcut`: normalized platform default accelerator
- `include_query_screenshot: true`
- `provider_api_keys`:
  - `openai`, `anthropic`, `google`, `openrouter`, `mistral`, `kimi_coding`
  - each entry stores `{ enabled: boolean, api_key: string }`
- `provider_oauth`:
  - `openai_codex` entry stores `{ connected, access_token, refresh_token, expires_at, profile_id }`

Load semantics (`loadConfigFromStorage`):

- missing key -> fresh default object
- parsed object -> known frontend fields merged over defaults
- invalid JSON / non-object payload -> clear keys + return defaults
- deprecated or backend-owned keys are dropped during normalization instead of being re-saved or re-synced

Save semantics (`saveConfigToStorage`):

- rejects non-object/array payloads
- writes config + version (`Date.now()` fallback)
- returns boolean success/failure

## Provider Merge/Apply Guards (`appConfigPersistence`)

`sanitizeFrontendProviderConfig`:

- returns `{}` for non-plain objects
- drops keys whose value is `undefined`

`mergeFrontendProviderConfig(base, patch)`:

- shallow merges sanitized base + patch

`applyConfigIfChanged(next, configRef, setConfig)`:

- no-op for empty payload
- no-op when shallow-equal to current config
- otherwise updates ref and state

This is the central dedupe guard preventing redundant writes and backend updates.

## AppConfigProvider Integration Points

### Startup sources

1. seed state from `loadConfigFromStorage()`
2. invoke `LOAD_FRONTEND_CONFIG` and merge filtered disk config
3. invoke `GET_CLIENT_USER_ID` snapshot
4. subscribe to `IPC_STATUS` and backend stream events

### Update path (`updateConfig`)

1. `buildMergedFrontendConfig(newConfig)` filters + merges with current config
2. `applyConfigIfChanged` gate
3. optional save-status callback fire
4. persist localStorage (`saveConfigToStorage`)
5. async disk save (`SAVE_FRONTEND_CONFIG`)
6. backend sync (`ApiClient.updateSettings`) for non-model settings only

Deferred backend fields:

- `model_provider`
- `selected_model_id`

Those two fields remain renderer-local until an actual query/replay send path runs. This avoids backend session churn while the user changes model selection in the header.

### Connection snapshot behavior

When IPC status reports connected:

- provider sends current non-model config to backend (`ApiClient.updateSettings`)
- deferred model selection is not pushed on connect/reconnect

### Storage-event sync behavior

On `window.storage` for desktop-assistant config keys:

- reload from localStorage
- merge/filter
- apply only when shallow-changed

## Event Router Boundary (`appConfigEvents`)

- only routes `models-listed` backend events to settings handlers
- `extractTranscriptUserId` accepts non-empty string only

## Test-Backed Invariants

`configFilter.test.js`:

- allowlist-only projection
- invalid input -> `{}`
- `interaction_mode` and new keys retained

`configStorage.test.js`:

- default-return behavior when empty
- default merge with stored overrides
- invalid payload cleanup
- version timestamp behavior
- write-failure handling returns false

`AppConfigProvider.models.test.tsx` and `storageAndIpc.test.tsx`:

- single-shot list-model request guard
- disk config merge applies only when changed
- no-op when disk config equals current config
- cross-window storage event sync path
- connected status triggers backend resync
- connected status excludes deferred model selection from backend resync
- disk-save/load failures log warnings without crashing

## Drift Hotspots

1. Adding frontend-owned fields in backend validator without updating `FRONTEND_CONFIG_FIELDS` or defaults causes silent drops.
2. Removing shallow-change guards can create write storms to localStorage/disk/backend.
3. Returning `null` instead of default object from storage loader can break provider assumptions.
4. Changing storage key names without migration can strand stale config state across windows.

## Related Pages

- [Renderer Settings Config Docs Hub](README.md)
- [Config Sync and Settings Lifecycle Reference](../../../runtime/config_sync_and_settings_lifecycle_reference.md)
- [Input Validation and Frontend Patch Guard Reference](../../../../backend/core/validation/input_validation_and_frontend_patch_guard_reference.md)
