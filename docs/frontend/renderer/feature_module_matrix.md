---
summary: "Renderer feature-module matrix: chat, dashboard, settings, and voice responsibilities with primary hooks/stores/components."
read_when:
  - When deciding where renderer functionality should live.
  - When tracing UI behavior to feature hooks or store updates.
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
- stream event rendering and partial updates
- tool execution triggers and output rendering
- thinking/token/transparency displays

Core hooks:

- `useChatMessageSender`
- `useChatStream`
- `useToolRunner`
- `useTranscription`

Core store:

- `stores/chatStore.ts` (message list, stream tracking, token counts, send state)

Primary components:

- `ChatInterface`
- `MessageList`, `MessageContent`, `MessageInput`
- `ThinkingDisplay`, `TokenCountDisplay`
- `ChatBox`, `ChatBoxResponse`

## Dashboard Module

Path:

- `features/dashboard/*`

Primary responsibilities:

- conversation-first dashboard shell with modal settings/memory/model views
- memory management UI for episodic and semantic stores
- model selection and frontend settings controls

Shell:

- `components/ChatGptDashboardShell.jsx`

Sections:

- episodic
- semantic
- models
- settings

## Settings Module

Path:

- `features/settings/*`

Current role:

- focused hook for backend-provided model list updates
- lightweight compatibility layer for settings event wiring

Core hook:

- `useSettingsManagement`

## Voice Module

Path:

- `features/voice/*`

Primary responsibilities:

- wakeword detection bridge management
- voice gateway connection and audio streaming logic
- voice status UI

Core hooks/components:

- `useVoiceMode`
- `useWakewordDetection`
- `VoiceStatus`

## Feature-to-Infrastructure Dependencies

Common dependencies used by feature modules:

- `infrastructure/ipc` for message transport
- `infrastructure/api/client.ts` for backend command dispatch
- `infrastructure/services/*` for tool execution and capture logic
- `infrastructure/transcript/*` for persisted conversation records
