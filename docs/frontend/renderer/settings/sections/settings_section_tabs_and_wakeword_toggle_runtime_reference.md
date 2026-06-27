---
summary: "Deep reference for current settings-surface runtime: general/memory tab routing, wakeword/STT controls, tool-log visibility, and local destructive reset actions."
read_when:
  - When changing `SettingsSection.jsx` tab layout, initial-tab behavior, or close controls.
  - When debugging wakeword/wakeword-STT settings payloads, retired agent-sudo settings references, or settings tab routing.
title: "Settings Section General + Memory Tabs Runtime Reference"
---

# Settings Section General + Memory Tabs Runtime Reference

## Canonical Modules

- `frontend/src/renderer/features/dashboard/components/sections/SettingsSection.jsx`
- `frontend/src/renderer/app/runtime/desktopSettingsTabRuntime.js`
- `frontend/src/renderer/features/dashboard/components/sections/settings/GeneralSettingsTab.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/settings/AgentSettingsTab.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/settings/MemorySettingsTab.jsx`
- `frontend/src/renderer/features/dashboard/components/sections/settings/useMemorySettingsActions.js`
- `frontend/src/renderer/app/runtime/desktopExtensionRuntimeClient.ts`
- `frontend/src/renderer/app/providers/AppConfigContext.jsx`
- `tests/frontend/SettingsSection.test.jsx`

## Panel and Tab Surface

`SettingsSection` is a settings-surface two-column panel:

- left sidebar tab list
- right content pane
- one back control in sidebar (`onClose`) that returns to the dashboard/chat surface

Current visible tab ids:

- `general`
- `appearance`
- `agent`
- `workspace`
- `browser`
- `memory`
- `onboarding`

The ordered tab descriptors live in
`DesktopSettingsTabRuntime.getSettingsTabDescriptors()`. `SettingsSection`
maps descriptor `iconKey` values to lucide icons, owns active-tab state, and
routes tab ids to concrete tab components through `renderTabContent()`.

Routing model:

- `general` renders live settings controls (`GeneralTab`)
- `appearance` renders renderer-local theme editing controls for the currently
  editable light/dark theme section, including accent, background, foreground,
  user-message pill colors, fonts, translucent sidebar, and contrast values
- `agent` renders system prompt editing, extension runtime diagnostics, and local/remote tool toggles
- `workspace` renders workspace permission/status controls
- `browser` renders skin-named dedicated browser permission/status controls
- `memory` renders destructive local-data controls for memory/chat resets
- `onboarding` renders an action to reopen onboarding
- unknown tabs, including retired `data-controls` links, fall back to `PlaceholderTab` title rendering

`initialTab` behavior:

- local `activeTab` state is reset from `initialTab` via effect
- parent can reopen SettingsSection on a specific tab id; current first-party dashboard menu opens settings with `general`
- dashboard mounts settings as a full main-content view rather than a centered modal so wide controls have the same usable area as the dashboard

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

The skin-provided wakeword STT toggle emits:

- `{ wakeword_stt_enabled: boolean }`

### 3) Local-only presentation state

Current local-only controls do not emit config updates:

- `voice`

### 4) Frontend-only chat transcript presentation toggles

`View tool logs` emits:

- `{ show_tool_logs: boolean }`

This is a renderer-owned presentation preference. It does not alter tool execution or transcript
storage. The dashboard thread uses it to either:

- show raw `tool-call` / `tool-output` rows, or
- hide raw tool rows and derive subdued explanation text plus a collapsed `View actions` summary

### 5) Global stop shortcut config and status presentation

`GeneralSettingsTab` emits local config patches for `global_agent_stop_shortcut`
selection. It reads supported shortcut options, shortcut labels, and fallback /
registration-failure presentation through `DesktopShortcutRuntimeClient`.
`AppConfigProvider` also asks the same runtime client whether an IPC shortcut
status snapshot contains a resolved fallback accelerator that should be saved
back to renderer config.

The tab should keep rendering and copy local, but it should not read raw
`globalAgentStopShortcutStatus` fallback fields such as `usingFallback`,
`requestedAccelerator`, `resolvedAccelerator`, or `registrationFailed` directly.
Config-provider persistence should likewise avoid parsing raw shortcut status
fallback fields directly.

## Appearance Tab Ownership Model

`DesktopAppearanceThemeRuntime` owns renderer-local theme editor values and
descriptors:

- light, dark, or system theme mode
- one visible editor section for the active editable theme:
  - light mode edits `appearance_theme.light`
  - dark mode edits `appearance_theme.dark`
  - system mode edits the effective system light/dark section and labels which
    section is currently active
- light and dark accent/background/foreground colors
- light and dark user-message pill background/text colors
- light and dark UI/code font strings
- light and dark translucent sidebar toggles
- light and dark contrast slider values

`AppearanceSettingsTab` consumes descriptor and normalization helpers through
`DesktopAppearanceThemeRuntime`, maps returned icon keys to lucide icons,
renders controls, and emits renderer config patches.

The values are persisted through renderer config as `appearance_mode` and
`appearance_theme` and are local-only. They are not sent to the hosted backend
because they do not affect model behavior, tools, prompt construction, or
provider policy.

The renderer root consumes `appearance_mode` and the active `appearance_theme`
section through `DesktopAppearanceThemeRuntime.applyAppearanceTheme(...)`,
which owns document-level theme attributes, CSS variables, and system
`matchMedia` subscription cleanup. Light/dark/system selection is therefore a
renderer presentation concern: the settings tab produces the config patch, and
the app root asks the runtime facade to apply the effective theme to shared
dashboard/settings tokens.

Settings state controls use shared theme variables for toggle track/thumb/border
states, primary/secondary button disabled states, and destructive button
enabled/hover/disabled states. Disabled toggles, primary/secondary actions, and
destructive actions should remain muted but readable; they should not rely on
opacity over a low-contrast light-mode palette.
Agent extension diagnostics render schema/debug JSON in dark debug panels with
an explicit light foreground, so MCP server and accepted-tool details do not
inherit dark light-mode page text on dark panels.

## Agent Tab Ownership Model

`AgentSettingsTab` owns presentation for:

- system prompt config patches
- extension runtime diagnostics
- local/remote tool enablement controls
- accepted/rejected local tool schema display
- remote tool catalog availability display

Runtime inputs:

- `DesktopExtensionRuntimeClient.listAgentExtensions()`
- `DesktopExtensionRuntimeClient.onAgentCapabilityUpdate(...)`
- `DesktopExtensionRuntimeClient.getPluginRuntimePresentation(...)`
- `DesktopExtensionRuntimeClient.getSkillRuntimePresentation(...)`
- `DesktopExtensionRuntimeClient.getMcpRuntimeMetadataPresentation(...)`
- `DesktopExtensionRuntimeClient.getLocalToolManifestPresentation(...)`
- `DesktopExtensionRuntimeClient.getRemoteToolPresentation(...)`
- `DesktopExtensionRuntimeClient.getExtensionRuntimeErrorPresentation(...)`
- `DesktopExtensionRuntimeClient.isLocalToolEnabled(...)`
- `DesktopExtensionRuntimeClient.isRemoteToolEnabled(...)`
- `DesktopExtensionRuntimeClient.getLocalToolToggleConfigPatch(...)`
- `DesktopExtensionRuntimeClient.getRemoteToolToggleConfigPatch(...)`

The tab should not import desktop IPC channels directly or branch on raw agent
capability event type strings. It consumes extension metadata plus direct
manifest/catalog update values through the runtime client, asks the runtime
client for plugin metadata display, skill/MCP metadata debug display,
local-tool manifest status, remote-tool availability, extension error
presentation, and tool-toggle enabled state/config patches, then keeps
presentation state and user-control rendering local to the settings surface.

## Workspace Tab Ownership Model

`WorkspaceSettingsTab` owns active workspace row layout, folder-pick actions,
and workspace permission affordances. It consumes active workspace selection
values, display presentation, empty-selection defaults, workspace-access
subscriptions, folder-pick commands, and active-workspace selection equality
through `DesktopWorkspaceRuntimeClient`.

The tab should keep rendering and local state synchronization local, but it
should not compare or render raw `activeWorkspaceName` or
`activeWorkspacePath` fields directly before applying workspace updates or
displaying the active workspace. The runtime client owns that value-level
equality predicate and presentation so chat and settings surfaces stay aligned
on which active workspace changes matter.

## Browser Tab Ownership Model

`BrowserSettingsTab` owns browser permission row layout and browser-settings
config patches. Permission manifest lookup, permission status-map lookup,
badge labels/classes, and status detail presentation come from
`DesktopPermissionPresentationRuntime`.

The tab should pass full effective permission status objects into
`PermissionStatusBadge` and detail helpers. It should not scan raw
`permission_id` rows, index raw `statusesByPermissionId` maps, or extract raw
`status`, `reason`, or `details.remediation` fields before rendering
permission presentation.

## Memory Tab Ownership Model

`MemorySettingsTab` owns two destructive local-data actions:

1. `Nuke memory`
   - invokes SDK-shaped `memories.clearAll` through the memory runtime client
   - deletes user-local episodic interaction memory plus semantic memory
   - preserves transcript chat history

2. `Nuke chats`
   - invokes SDK-shaped `conversations.clearAll` through the memory runtime client
   - deletes transcript chat history, display timeline checkpoints,
     model-history checkpoints, revisions, titles, turns, and conversation
     metadata only
   - receives the dashboard effective user id, with `default_user` treated as
     non-actionable, so destructive deletion targets the same user whose
     conversations are listed in the sidebar
   - on success, calls parent `onChatsCleared` so dashboard chat state and
     recent-chat lists are reset and force-reloaded without reusing stale
     in-flight metadata requests

These are user-facing SDK commands. The settings tab owns presentation and user
intent only; Electron main owns the IPC hop and calls public SDK APIs.
Browser confirmation for these destructive actions is owned by
`DesktopMemorySettingsDialogRuntime`, so `useMemorySettingsActions()` does not
call `window.confirm` directly.

## Payload and Persistence Boundary

`SettingsSection` never calls backend APIs directly.

All config persistence/sync side effects are delegated through parent `onConfigChange` -> provider pipeline.

Exception:

- `useMemorySettingsActions()` invokes memory and chat reset through
  `DesktopMemoryRuntimeClient`, which sends SDK-shaped `memories.clearAll` and
  `conversations.clearAll` commands over `window.agentSdk.invoke`.
  `DesktopMemoryRuntimeClient` also owns active-user resolution for destructive
  chat-history deletion, including the non-actionable `default_user` sentinel.
  `DashboardShell` passes its effective non-sentinel user id into the memory
  settings surface so listing and destructive deletion share one user boundary.
  `DesktopMemorySettingsDialogRuntime` owns browser confirmation for the
  destructive settings actions.
- retired `data-controls` links fall through to the generic placeholder instead of mounting hidden permission UI.

## Test-Backed Invariants

`tests/frontend/SettingsSection.test.jsx` verifies:

- wakeword listening toggle calls `setWakewordEnabled`
- only one left sidebar close button is rendered
- suppression helper message render condition
- wakeword STT toggle emits exact payload `{ wakeword_stt_enabled: true }`
- tool log visibility toggle emits exact payload `{ show_tool_logs: true }`
- memory-tab destructive actions call the correct IPC channels and success callbacks
- memory-tab chat deletion prefers the dashboard effective user id over a
  `default_user` transcript-session fallback
- memory-tab destructive confirmation stays behind the app-runtime dialog
  facade instead of direct browser-dialog calls in the settings hook
- dashboard chat-clear success force-reloads recent chats without reusing older
  in-flight metadata requests

## Drift Hotspots

1. Replacing context-driven wakeword setter with direct config patches can desync suppression-aware wakeword state.
2. Adding new settings tabs requires updating both
   `DesktopSettingsTabRuntime` descriptors and `renderTabContent()` routing
   in `SettingsSection.jsx`.
3. Theme editor values should remain renderer-local unless a future runtime theme engine explicitly consumes them.
4. Treating local-only `voice` selector as persisted config without wiring provider updates.

## Related Pages

- [Renderer Settings Sections Docs Hub](README.md)
- [Settings Surface Change Workflow](../settings_surface_change_workflow.md)
- [Renderer Settings Config Docs Hub](../config/README.md)
- [App Provider Coordinator and Save-Status Runtime Reference](../../providers/app_provider_coordinator_and_save_status_runtime_reference.md)
