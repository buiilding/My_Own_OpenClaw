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
- tool execution dispatch/result rendering
- thinking/transparency rendering
- stream telemetry and token-count state tracking

Core hooks:

- `useChatMessageSender`
- `useChatStream`
- `useStreamMessageUpdaters`
- `useToolRunner`
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

- `components/ChatGptDashboardShell.jsx`
- `hooks/useDashboardConversations.js`
- `utils/conversationGroups.js`

Sections:

- `MemorySection` (+ `MemoryItem` + section data helpers)
- `ModelsSection` (+ provider/model/api-key helper components)
- `SettingsSection`
- `UsageSection`

## Settings Module

Path:

- `features/settings/*`

Current role:

- settings management hook + backend-driven model list/event integration

Core hook:

- `useSettingsManagement`

## Permissions Module

Path:

- `features/permissions/*`

Primary responsibilities:

- permission manifest/status state model and gate-state derivation (`needsOnboarding`, required permission sets, manifest-version completion)
- settings-surface permission visibility and maintenance actions (`Re-run checks`, per-row `Re-check`)
- shared permission status presentation (`PermissionRowMain`, `PermissionStatusBadge`)

Core store/components:

- `stores/permissionStore.js`
- `components/PermissionControlCenter.jsx`
- `components/PermissionRowMain.jsx`
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
- `infrastructure/api/client.ts` for backend message dispatch
- `infrastructure/services/*` for tool execution and capture
- `infrastructure/transcript/*` for persisted conversation records
