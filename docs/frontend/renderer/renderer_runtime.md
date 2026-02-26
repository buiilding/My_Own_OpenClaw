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
3. `ChatProvider`

Provider responsibilities:

- `AppConfigProvider`:
  - frontend-owned config state
  - model list loading/refresh
  - backend settings sync
  - disk/localStorage sync
  - wakeword enabled/suppressed state
- `AppStatusProvider`:
  - transient save status/UI status
- `ChatProvider`:
  - initializes `useChatStream` + `useToolRunner`

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

- `PermissionOnboardingWizard`
- `PermissionControlCenter`
- `usePermissionStore`

Current behavior:

- app startup gate blocks dashboard/chat shell until required-now permissions + planned-system-access consent are satisfied
- data-controls settings tab renders live permission status/probe/request surface

### Voice (`features/voice`)

Primary hooks/components:

- `useVoiceMode`
- `useWakewordDetection`
- `VoiceStatus`
- app-level `WakewordController`

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
- agent sudo access policy flag (`agent_full_sudo_enabled`)

Backend remains source of truth for non-frontend runtime fields.

## Related Docs

- [Frontend Renderer Docs Hub](README.md)
- [Renderer Permissions Docs Hub](permissions/README.md)
- [Frontend Renderer Provider Docs Hub](providers/README.md)
- [Frontend Renderer Chat Docs Hub](chat/README.md)
- [Frontend Renderer Dashboard Docs Hub](dashboard/README.md)
