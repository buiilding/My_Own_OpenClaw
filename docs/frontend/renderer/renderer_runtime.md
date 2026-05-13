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
  - frontend-owned config state
  - model list loading/refresh
  - backend settings sync
  - one-shot `list-models` request guard in main dashboard renderer only
  - IPC status snapshot projection (`backendHttpUrl`, transcript user/session wiring, global stop-shortcut fallback status)
  - disk/localStorage sync
  - wakeword enabled/suppressed state
- `AppStatusProvider`:
  - transient save status/UI status
- `AppContextCoordinator`:
  - registers save-status callback from config provider into status provider
  - owns global `Shift+Tab` interaction-mode toggle (`chat <-> agent`) with editable-target guard
- `ChatProvider`:
  - initializes `useChatStream` + `useToolRunner`

Startup surface routing in `AppContent`:

- VM mode (`vm_mode=1` query param) renders `ChatGptDashboardShell` directly (`vmModeEnabled=true`)
- non-VM mode renders frontend onboarding slideshow until `permissionStore.needsOnboarding` is false
- onboarding completion persists `windieos-permission-onboarding` (`manifest_version`, `completed`, `completed_at`) then routes to dashboard shell

## Feature Domains

### Chat (`features/chat`)

State:

- `stores/chatStore.ts`: messages, send state, thinking status, token-count telemetry, stream tracking

Primary hooks:

- `useChatMessageSender`
- `useChatStream`
- `useStreamMessageUpdaters`
- `useToolRunner`
- `useTranscription`

Primary components:

- `ChatInterface`
- `MessageList`, `MessageInput`, `MessageContent`
- `ThinkingDisplay`
- transparency components and overlay-chatbox response components

### Dashboard (`features/dashboard`)

Primary shell + sections:

- `ChatGptDashboardShell`
- `DashboardSidebar`
- `SearchChatsModal`
- sections: `MemorySection`, `ModelsSection`, `SettingsSection`, `UsageSection`

Current dashboard behavior:

- sidebar owns conversation browsing/open/rename/pin/delete
- memory section is unified (episodic/semantic/procedural)
- models section is provider-first and includes provider API key controls

### Permissions (`features/permissions`)

Primary runtime:

- `PermissionControlCenter`
- `usePermissionStore`

Current behavior:

- app startup routes by VM mode + permission-onboarding completion for the current manifest
- frontend onboarding step 1 now renders a permission checklist and triggers `requestPermission` per row plus global `recheckAllPermissions`
- `PermissionControlCenter` renders live permission status plus probe/recheck maintenance actions
- `permissionStore` derives onboarding/gate state (`needsOnboarding`, `completedForManifest`, required permission sets) and powers both onboarding + settings permission surfaces

### Voice (`features/voice`)

Primary hooks/components:

- `useVoiceMode`
- `useWakewordDetection`
- `VoiceStatus`
- dashboard-surface `WakewordController`

## Infrastructure Layer

Core modules:

- `infrastructure/api/client.ts`: typed backend command surface
- `infrastructure/ipc/bridge.ts`: typed IPC wrapper over preload API
- `infrastructure/services/*`: tool execution/capture/payload services
- `infrastructure/transcript/*`: transcript queues/session storage/writer
- `infrastructure/audio/PlayerService.ts`: streaming audio playback queue

## Transcript and Session Metadata

`TranscriptWriter` runtime guarantees:

- stores user/assistant/tool rows with message type + correlation metadata
- queues writes if session info unavailable and retries when session resolves
- emits local `transcript-entry-stored` event for dashboard refresh logic

## Config Ownership Boundary

Frontend-managed settings are filtered/sanitized before backend sync.

Typical keys:

- model mode/provider/selected model
- interaction mode
- voice/speech mode flags
- query screenshot inclusion
- provider API keys
- provider OAuth credentials can still be persisted/synced, but no OAuth controls are exposed in the renderer settings UI
- agent sudo access policy flag (`agent_full_sudo_enabled`)
- browser automation feature toggle (`browser_automation_enabled`)

Backend remains source of truth for non-frontend runtime fields.

## Related Docs

- [Frontend Renderer Docs Hub](README.md)
- [App Startup VM-Mode and Frontend Onboarding Runtime Reference](app_startup_vm_mode_and_frontend_onboarding_runtime_reference.md)
- [Renderer Permissions Docs Hub](permissions/README.md)
- [Frontend Renderer Provider Docs Hub](providers/README.md)
- [Frontend Renderer Chat Docs Hub](chat/README.md)
- [Frontend Renderer Dashboard Docs Hub](dashboard/README.md)
