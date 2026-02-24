---
summary: "Deep reference for renderer SettingsSection behavior: wakeword/audio/screenshot toggle contracts, display list fallback and persistence semantics, and update payload boundaries sent through AppConfig provider."
read_when:
  - When changing settings toggles, display selection, or `onConfigChange` payload construction.
  - When debugging why settings UI state differs from persisted config or why display selection resets between launches.
title: "Settings Section Display Selection and Config Toggle Reference"
---

# Settings Section Display Selection and Config Toggle Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`
- `frontend/src/renderer/features/dashboard/utils/settingsDisplayUtils.js`
- `frontend/src/renderer/utils/displaySelection.ts`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/features/settings/hooks/useSettingsManagement.ts`
- `tests/frontend/SettingsSection.test.jsx`
- `tests/frontend/SettingsDisplayUtils.test.js`
- `tests/frontend/displaySelection.test.ts`
- `tests/frontend/SettingsManagementHook.test.ts`

## SettingsSection Ownership Boundary

`SettingsSection` owns renderer-facing controls but not persistence side effects directly.

Control families:

- wakeword listening toggle -> context setter (`setWakewordEnabled`)
- voice/speech/query-screenshot toggles -> `onConfigChange(...)` payloads
- display dropdown -> local selection state + persisted display id/bounds

The section does not call backend APIs itself.

## Toggle Payload Contracts

Audio/screenshot toggle handlers call utility builders:

- `buildVoiceModeConfigUpdate(...)` -> `{ voice_mode_enabled: boolean }`
- `buildSpeechModeConfigUpdate(...)` -> `{ speech_mode_enabled: boolean }`
- `buildQueryScreenshotConfigUpdate(...)` -> `{ include_query_screenshot: boolean }`

These payloads intentionally include only changed field families, relying on provider merge logic for full config persistence.

## Wakeword Toggle Semantics

Wakeword control uses AppConfig context directly:

- checked state: `wakewordEnabled`
- update path: `setWakewordEnabled`
- supplemental helper text shown when `wakewordSuppressed` is true

So wakeword UI reflects both user preference and runtime suppression from overlay visibility flow.

## Display Discovery and Selection Flow

On mount:

- invokes `IpcBridge.invoke(INVOKE_CHANNELS.GET_DISPLAYS)`
- stores display list on success
- stores error text on failure

Selection normalization:

- `resolveDisplaySelection(displays, selectedDisplayId)` keeps existing id when valid
- if invalid/missing, falls back to primary display (`isPrimary`) else first display
- effect updates `selectedDisplayId` when fallback applied

UI options:

- labels from `display.label` or fallback `Display <id>`
- select value stored as string id

## Display Persistence Contract

`persistDisplaySelection(...)` writes localStorage keys:

- `desktop-assistant-display-id`
- `desktop-assistant-display-bounds`

Behavior:

- null/invalid display clears both keys
- id always stringified
- bounds persisted only when present

Bounds read path (`getStoredDisplayBounds`) validates:

- finite numeric `x/y/width/height`
- positive `width/height`
- malformed JSON safely returns null with warning

## Provider Integration Path

`SettingsSection.onConfigChange` is passed from dashboard/provider tree and eventually reaches `AppConfigProvider.updateConfig(...)`.

Provider then:

1. filters/sanitizes frontend-owned fields
2. applies shallow-change guard
3. saves to localStorage
4. async-invokes disk save (`save-frontend-config`)
5. sends `ApiClient.updateSettings(...)`

So section-level minimal payloads still result in full managed persistence + backend sync.

## Model List Hook Boundary

`useSettingsManagement` is separate from SettingsSection toggles:

- handles backend `models-listed` event by forwarding payload to `setAvailableModels`
- memoizes handlers for stable references

This keeps model-catalog event ingestion decoupled from settings control rendering.

## Test-Backed Invariants

`tests/frontend/SettingsSection.test.jsx` validates:

- wakeword toggle delegates to context setter
- voice/speech/screenshot toggles emit exact payload keys
- wakeword suppression helper text visibility

`tests/frontend/SettingsDisplayUtils.test.js` validates:

- display option mapping + label fallback
- selected-id fallback to primary/first display
- minimal update payload builders for toggle fields

`tests/frontend/displaySelection.test.ts` validates:

- id/bounds persist and reload behavior
- clear semantics when selection removed
- bounds validation for malformed/non-finite/non-positive values

`tests/frontend/SettingsManagementHook.test.ts` validates:

- `models-listed` payload passthrough
- memoized handler stability and dependency refresh behavior

## Drift Hotspots

1. changing toggle builders to include extra keys can bypass minimal-diff assumptions in settings pipeline.
2. removing display fallback behavior can leave invalid stored IDs selected after monitor topology changes.
3. conflating wakeword enabled vs suppressed state can misrepresent effective listening status.
4. bypassing provider update path from section controls can desync storage, disk, and backend config state.

## Related Pages

- [Frontend Renderer Settings Docs Hub](README.md)
- [Config Sync and Settings Lifecycle Reference](../../runtime/config_sync_and_settings_lifecycle_reference.md)
- [App Provider Coordinator and Save-Status Runtime Reference](../providers/app_provider_coordinator_and_save_status_runtime_reference.md)
