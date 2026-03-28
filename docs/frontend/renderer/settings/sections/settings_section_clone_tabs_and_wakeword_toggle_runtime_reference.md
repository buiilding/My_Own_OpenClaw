---
summary: "Deep reference for current clone-style SettingsSection runtime: general/memory tab routing, wakeword/STT/sudo control ownership, optional data-controls fallback routing, and local destructive reset actions."
read_when:
  - When changing `SettingsSection.jsx` tab layout, initial-tab behavior, or close controls.
  - When debugging wakeword/wakeword-STT/agent-sudo settings payloads or data-controls permission-center mounting.
title: "Settings Section General + Memory Tabs Runtime Reference"
---

# Settings Section General + Memory Tabs Runtime Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/settings/GeneralSettingsTab.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/settings/MemorySettingsTab.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/settings/useMemorySettingsActions.js`
- `frontend/src/renderer/features/permissions/components/PermissionControlCenter.jsx`
- `frontend/src/renderer/app/providers/AppContextHooks.js`
- `tests/frontend/SettingsSection.test.jsx`

## Panel and Tab Surface

`SettingsSection` is a clone-style two-column panel:

- left sidebar tab list
- right content pane
- one close control in sidebar (`onClose`)

Current visible tab ids:

- `general`
- `memory`

Routing model:

- `general` renders live settings controls (`GeneralTab`)
- `memory` renders destructive local-data controls for memory/chat resets
- `data-controls` branch exists in `renderTabContent()` and renders `PermissionControlCenter`, but there is no current tab button for it in `SETTINGS_TABS`
- unknown tabs fall back to `PlaceholderTab` title rendering

`initialTab` behavior:

- local `activeTab` state is reset from `initialTab` via effect
- parent can reopen SettingsSection on a specific tab id; current first-party dashboard menu opens settings with `general`

## General Tab Ownership Model

`GeneralSettingsTab` owns five control classes:

### 1) AppConfigContext-driven wakeword preference

From `useAppConfigContext()`:

- `wakewordEnabled`
- `wakewordSuppressed`
- `setWakewordEnabled`

Wakeword listening toggle writes through context setter directly, not `onConfigChange`.

Suppression helper text appears only when:

- `wakewordEnabled === true`
- `wakewordSuppressed === true`

### 2) Config patch toggle via `onConfigChange`

`Speech-To-Text After "Hey Jarvis"` toggle emits:

- `{ wakeword_stt_enabled: boolean }`

### 3) Agent sudo access toggle with main-process handshake

`Agent Full Sudo Access` toggle path:

1. user confirmation dialog when enabling
2. invoke `IpcBridge.invoke('set-agent-sudo-access', { enabled })`
3. on success, emit `onConfigChange({ agent_full_sudo_enabled: enabled })`
4. while in flight, toggle is disabled and helper text shows pending OS-auth prompt

### 4) Local-only presentation state

Current local-only controls do not emit config updates:

- `voice`

### 5) Frontend-only chat transcript presentation toggles

`View tool logs` emits:

- `{ show_tool_logs: boolean }`

This is a renderer-owned presentation preference. It does not alter tool execution or transcript
storage. The dashboard thread uses it to either:

- show raw `tool-call` / `tool-output` rows, or
- hide raw tool rows and derive subdued explanation text plus a collapsed `View actions` summary

## Memory Tab Ownership Model

`MemorySettingsTab` owns two destructive local-data actions:

1. `Nuke memory`
   - invokes renderer IPC `clear-local-memory`
   - deletes user-local episodic interaction memory plus semantic memory
   - preserves transcript chat history

2. `Nuke chats`
   - invokes renderer IPC `clear-chat-history`
   - deletes transcript chat history only
   - on success, calls parent `onChatsCleared` so dashboard chat state and recent-chat lists are reset/reloaded

These are UI state only in current implementation.

## Payload and Persistence Boundary

`SettingsSection` never calls backend APIs directly.

All config persistence/sync side effects are delegated through parent `onConfigChange` -> provider pipeline.

Exception:

- `GeneralSettingsTab` invokes `IpcBridge.invoke('set-agent-sudo-access', { enabled })` for passwordless sudo toggle handshake before persisting `agent_full_sudo_enabled`.
- `useMemorySettingsActions()` invokes `clear-local-memory` / `clear-chat-history` over the local-backend IPC bridge for destructive data resets, while `MemorySettingsTab` stays presentation-focused.
- `data-controls` branch mounts `PermissionControlCenter`, which uses permission-store probe/recheck actions.

## Test-Backed Invariants

`tests/frontend/SettingsSection.test.jsx` verifies:

- wakeword listening toggle calls `setWakewordEnabled`
- only one left sidebar close button is rendered
- suppression helper message render condition
- wakeword STT toggle emits exact payload `{ wakeword_stt_enabled: true }`
- tool log visibility toggle emits exact payload `{ show_tool_logs: true }`
- agent full sudo toggle confirm/invoke/failure handling behavior
- memory-tab destructive actions call the correct IPC channels and success callbacks

## Drift Hotspots

1. Replacing context-driven wakeword setter with direct config patches can desync suppression-aware wakeword state.
2. Bypassing sudo toggle confirmation/invoke flow can persist `agent_full_sudo_enabled` without OS-auth success.
3. Adding new settings tabs requires updating both the shared `SETTINGS_TABS` registry and `renderTabContent()` routing in `SettingsSection.jsx`.
4. Treating local-only `voice` selector as persisted config without wiring provider updates.

## Related Pages

- [Renderer Settings Sections Docs Hub](README.md)
- [Renderer Settings Config Docs Hub](../config/README.md)
- [App Provider Coordinator and Save-Status Runtime Reference](../../providers/app_provider_coordinator_and_save_status_runtime_reference.md)
