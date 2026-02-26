---
summary: "Deep reference for clone-style SettingsSection runtime: tab routing, general-tab toggle payload ownership, Data-controls permission-center routing, and local-only control state boundaries."
read_when:
  - When changing `SettingsSection.jsx` tab layout, initial-tab behavior, or close controls.
  - When debugging wakeword/wakeword-STT/show-additional-models settings update payloads or Data-controls permission-center mounting.
title: "Settings Section Clone Tabs and Wakeword Toggle Runtime Reference"
---

# Settings Section Clone Tabs and Wakeword Toggle Runtime Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`
- `frontend/src/renderer/features/permissions/components/PermissionControlCenter.jsx`
- `frontend/src/renderer/app/providers/AppContextHooks.js`
- `tests/frontend/SettingsSection.test.jsx`

## Panel and Tab Surface

`SettingsSection` is a clone-style two-column panel:

- left sidebar tab list
- right content pane
- close controls on both columns (`onClose`)

Tab ids:

- `general`
- `notifications`
- `personalization`
- `apps`
- `schedules`
- `orders`
- `data-controls`
- `security`
- `parental-controls`
- `account`

Routing model:

- only `general` renders live settings controls
- `data-controls` renders live `PermissionControlCenter`
- remaining tabs render placeholder content via `PlaceholderTab`

`initialTab` behavior:

- local `activeTab` state is reset from `initialTab` via effect
- parent can reopen SettingsSection on a specific tab (for example personalization)

## General Tab Ownership Model

`GeneralTab` owns three control classes:

### 1) AppConfigContext-driven wakeword preference

From `useAppConfigContext()`:

- `wakewordEnabled`
- `wakewordSuppressed`
- `setWakewordEnabled`

Wakeword listening toggle writes through context setter directly, not `onConfigChange`.

Suppression helper text appears only when:

- `wakewordEnabled === true`
- `wakewordSuppressed === true`

### 2) Config patch toggles via `onConfigChange`

`Speech-To-Text After "Hey Jarvis"` toggle emits:

- `{ wakeword_stt_enabled: boolean }`

`Show additional models` toggle emits merged config payload:

- `{ ...(config || {}), show_additional_models: boolean }`

### 3) Local-only presentation state

Current local-only controls do not emit config updates:

- `appearance`
- `accentColor`
- `language`
- `spokenLanguage`
- `voice`
- `separateVoice`

These are UI state only in current implementation.

## Payload and Persistence Boundary

`SettingsSection` never calls backend APIs directly.

All config persistence/sync side effects are delegated through parent `onConfigChange` -> provider pipeline.

Exception:

- `GeneralTab` invokes `IpcBridge.invoke('set-agent-sudo-access', { enabled })` for passwordless sudo toggle handshake before persisting `agent_full_sudo_enabled`.
- `data-controls` tab mounts `PermissionControlCenter`, which calls permission probe/request channels through shared permission store.

## Test-Backed Invariants

`tests/frontend/SettingsSection.test.jsx` verifies:

- wakeword listening toggle calls `setWakewordEnabled`
- suppression helper message render condition
- wakeword STT toggle emits exact payload `{ wakeword_stt_enabled: true }`
- agent full sudo toggle confirm/invoke/failure handling behavior

## Drift Hotspots

1. Treating local-only appearance/voice selectors as persisted settings without wiring provider updates.
2. Changing `show_additional_models` payload from merged object to partial patch can drop fields if provider merge semantics change.
3. Replacing context-driven wakeword setter with direct patch writes can desync suppression-aware wakeword state.
4. Adding live controls under placeholder tabs without updating tests and docs leaves hidden runtime contracts.
5. Breaking `data-controls` route to `PermissionControlCenter` silently removes live permission recheck/request UX from settings.

## Related Pages

- [Renderer Settings Sections Docs Hub](README.md)
- [Renderer Settings Config Docs Hub](../config/README.md)
- [App Provider Coordinator and Save-Status Runtime Reference](../../providers/app_provider_coordinator_and_save_status_runtime_reference.md)
