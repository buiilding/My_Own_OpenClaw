---
summary: "React renderer architecture including provider boundaries, chat/dashboard/permissions/voice runtime, and transcript/config synchronization behavior."
read_when:
  - When changing renderer state boundaries, hooks, or message rendering behavior.
  - When debugging config sync, transcript persistence, or dashboard interactions.
title: "Renderer Runtime"
---

# Renderer Runtime

## App Shell and Providers

Entrypoints:

- `frontend/src/renderer/app/main.jsx`
- `frontend/src/renderer/app/App.jsx`

Provider layering:

1. `AppConfigProvider`
2. `AppStatusProvider`
3. `AppContextCoordinator` (inside `AppProvider`)
4. `ChatProvider`

Provider responsibilities:

- `AppConfigProvider`:
  - renderer-owned config state
  - model list loading/refresh
  - runtime settings sync
  - one-shot `list-models` request guard in main dashboard renderer only
  - IPC status snapshot projection (runtime endpoint sync, transcript user/session wiring, global stop-shortcut fallback status)
  - disk/localStorage sync
  - wakeword enabled/suppressed state
- `AppStatusProvider`:
  - transient save status/UI status
- `AppContextCoordinator`:
  - registers save-status callback from config provider into status provider
  - owns global `Shift+Tab` interaction-mode toggle (`chat <-> agent`) with editable-target guard
- `ChatProvider`:
  - initializes `useChatStream`
  - mirrors transcript-session conversation identity into chat store
  - leaves local tool execution to the Agent SDK runtime

Startup surface routing in `AppContent`:

- VM mode (`vm_mode=1` query param) renders `DashboardShell` directly (`vmModeEnabled=true`)
- non-VM mode renders desktop onboarding slideshow until `permissionStore.needsOnboarding` is false
- onboarding completion persists `windieos-permission-onboarding` (`manifest_version`, `completed`, `completed_at`) then routes to dashboard shell

## Feature Domains

### Chat (`features/chat`)

State:

- `stores/chatStore.ts`: messages, send state, thinking status, token-count telemetry, stream tracking

Primary hooks:

- `useChatMessageSender`
- `useChatStream`
- `useConversationRuntimeProjectionStream`: subscribes to SDK display/current-turn
  projections; `DesktopSdkLiveTurnEffectsRuntime` owns renderer send-latch,
  thinking, and legacy stream-tracking side effects derived from current-turn
  projection cursors; `desktopConversationDisplayProjection.ts` owns SDK
  display-row projection plus renderer annotation and optimistic-row merge rules
- `useStreamMessageUpdaters`
- `useTranscription`

Primary components:

- `ChatInterface`
- `MessageList`, `MessageInput`, `MessageContent`
- `ThinkingDisplay`
- transparency components and overlay-chatbox response components

### Dashboard (`features/dashboard`)

Primary shell + sections:

- `DashboardShell`
- `DashboardSidebar`
- `SearchChatsModal`
- sections: `MemorySection`, `ModelsSection`, `SettingsSection`, `UsageSection`

Current dashboard behavior:

- sidebar owns conversation browsing/open/rename/pin/delete
- memory section is unified (episodic/semantic/procedural)
- models section is provider-first and includes provider API key controls

### Permissions (`features/permissions`)

Primary runtime:

- `usePermissionStore`

Current behavior:

- app startup routes by VM mode + permission-onboarding completion for the current manifest
- desktop onboarding step 1 renders a permission checklist and triggers `requestPermission` per row plus focused rechecks
- Browser settings uses focused permission probe/request actions for Browser automation status
- `permissionStore` derives onboarding/gate state (`needsOnboarding`, `completedForManifest`, required permission sets) and powers onboarding plus focused settings permission surfaces

### Voice (`features/voice`)

Primary hooks/components:

- `useVoiceMode`
- `useWakewordDetection`
- `VoiceStatus`
- dashboard-surface `WakewordController`

## Infrastructure Layer

Core modules:

- `app/runtime/desktopRuntimeTransport.ts`: typed SDK command transport
- `infrastructure/ipc/bridge.ts`: typed IPC wrapper over preload API
- `infrastructure/services/*`: runtime endpoint, artifact image, and screenshot
  attachment display helpers
- `app/runtime/desktopConversationContinuityService.ts`, `app/runtime/desktopConversationLibraryClient.js`, and `infrastructure/transcript/*`: SDK-backed transcript display projection, conversation store access, and session storage
- `infrastructure/audio/PlayerService.ts`: streaming audio playback queue

## Transcript and Session Metadata

Desktop transcript projection runtime guarantees:

- stores user/assistant/tool rows with message type + correlation metadata
- queues writes if session info unavailable and retries when session resolves
- emits local `transcript-entry-stored` event for dashboard refresh logic

## Config Ownership Boundary

Renderer-managed settings are filtered/sanitized before runtime settings sync.

Typical keys:

- model mode/provider/selected model
- interaction mode
- voice/speech mode flags
- query screenshot inclusion
- provider API keys
- provider API-key entries are normalized and scrubbed for renderer persistence
  through `desktopProviderCredentialRuntime.js`
- appearance palettes live in the renderer skin while editor descriptors, mode
  fallback, theme section normalization, effective light/dark resolution, and
  document-level theme application are owned by
  `DesktopAppearanceThemeRuntime` in
  `desktopAppearanceThemeRuntime.js`
- provider OAuth credentials can still be persisted/synced, but no OAuth controls are exposed in the renderer settings UI
- browser automation feature toggle (`browser_automation_enabled`)

Backend remains source of truth for non-renderer runtime fields.

## Related Docs

- [Frontend Renderer Docs Hub](README.md)
- [SDK Desktop Transport Command Contract Reference](desktop_runtime_transport_command_contract_reference.md)
- [App Startup VM-Mode and Permission Onboarding Runtime Reference](app_startup_vm_mode_and_permission_onboarding_runtime_reference.md)
- [Renderer Permissions Docs Hub](permissions/README.md)
- [Frontend Renderer Provider Docs Hub](providers/README.md)
- [Frontend Renderer Chat Docs Hub](chat/README.md)
- [Frontend Renderer Dashboard Docs Hub](dashboard/README.md)
