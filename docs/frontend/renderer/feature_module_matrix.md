---
summary: "Renderer feature-module matrix for chat, dashboard, settings, permissions, and voice responsibilities with current hooks/stores/components."
read_when:
  - When deciding where renderer functionality should live.
  - When tracing UI behavior to feature hooks, stores, and infrastructure calls.
title: "Feature Module Matrix"
---

# Feature Module Matrix

Feature root:

- `frontend/src/renderer/features`

## Chat Module

Path:

- `features/chat/*`

Primary responsibilities:

- user input/send lifecycle
- stream event ingestion and partial assistant updates
- SDK-routed tool display/result rendering
- thinking/transparency rendering
- stream telemetry and token-count state tracking

Core hooks:

- `useChatMessageSender`
- `useChatStream`
- `useStreamMessageUpdaters`
- `useTranscription`

Core store:

- `stores/chatStore.ts` (messages, stream tracking, token counts, send/thinking state)

Primary components:

- `ChatInterface`
- `MessageList`, `MessageContent`, `MessageInput`
- `ThinkingDisplay`
- `ChatBox`, `ChatBoxResponse`

## Dashboard Module

Path:

- `features/dashboard/*`

Primary responsibilities:

- main shell + sidebar + modal section orchestration
- conversation history/search/open/rehydrate flows
- memory/models/settings/usage panel UX

Shell:

- `components/DashboardShell.jsx`
- `hooks/useDashboardConversations.js`
- `app/runtime/desktopDashboardNavigationRuntime.js`
- `app/runtime/desktopDashboardConversationGroupRuntime.js`

Sections:

- `MemorySection` (+ `MemoryItem` + `desktopMemoryPresentationRuntime`)
- `ModelsSection` (+ provider/model/API-key components and
  `desktopModelCardPresentationRuntime` / `desktopProviderCredentialRuntime`)
- `SettingsSection` (+ `desktopSettingsTabRuntime`)
- `UsageSection`

## Settings Module

Path:

- `features/settings/*`

Current role:

- settings management hook + runtime-driven model list/event integration

Core runtime facade:

- `DesktopSettingsEventRuntimeClient.useDesktopSettingsEventHandlers(...)`

## Permissions Module

Path:

- `features/permissions/*`

Primary responsibilities:

- permission manifest/status state model and gate-state derivation (`needsOnboarding`, required permission sets, manifest-version completion)
- onboarding and focused settings permission request/probe actions
- shared permission status presentation (`PermissionStatusBadge`)

Core store/components:

- `stores/permissionStore.js`
- `components/PermissionStatusBadge.jsx`

## Voice Module

Path:

- `features/voice/*`

Primary responsibilities:

- wakeword capture/event handling
- voice gateway websocket + transcription flow
- voice status UI

Core hooks/components:

- `useVoiceMode`
- `useWakewordDetection`
- `VoiceStatus`

## Feature-to-Infrastructure Dependencies

Common dependencies:

- `infrastructure/ipc` for renderer/main transport
- `app/runtime/desktopRuntimeTransport.ts` for SDK command transport
- `infrastructure/services/*` for runtime endpoint, artifact image, and
  screenshot attachment display helpers
- `infrastructure/transcript/*` for persisted conversation records
