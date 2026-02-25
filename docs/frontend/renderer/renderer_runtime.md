---
summary: "React renderer architecture including providers, state domains, chat/dashboard/voice features, and transcript integration."
read_when:
  - When changing renderer state boundaries, hooks, or message rendering behavior.
  - When debugging config sync, transcript persistence, or dashboard interactions.
title: "Renderer Runtime"
---

# Renderer Runtime

## App Shell and Providers

Entrypoints:

- `frontend/src/renderer/app/main.jsx`
- root app: `frontend/src/renderer/app/App.jsx`

Provider layering:

1. `AppConfigProvider`
2. `AppStatusProvider`
3. `ChatProvider`

Key provider responsibilities:

- `AppConfigProvider`: frontend-owned config state, model list requests, backend sync, disk/localStorage sync, wakeword preference state
- `AppStatusProvider`: transient save status and UI state not coupled to config payloads
- `ChatProvider`: initializes stream + tool hooks over shared chat store

## Feature Domains

### Chat (`features/chat`)

State:

- `stores/chatStore.ts` (Zustand): messages, send state, thinking status, token counts, stream tracking

Primary hooks:

- `useChatMessageSender`: user message creation, optional screenshot capture path, query dispatch
- `useChatStream`: backend event ingestion and message update orchestration
- `useToolRunner`: tool event handling and execution service wiring
- `useTranscription`: input/transcription integration

Primary components:

- `ChatInterface`, `MessageList`, `MessageInput`, `MessageContent`
- `ThinkingDisplay`, `TokenCountDisplay`
- transparency sections for system prompt/tool schemas/full messages

### Dashboard (`features/dashboard`)

Primary modal surfaces include:

- Clone-style Memory panel (`MemorySection`) with tabs for episodic/semantic/procedural
- Models panel (`ModelsSection`)
- Settings panel (`SettingsSection`)

Chat history ownership remains in the sidebar `Your chats` list, while the Memory panel surfaces memory records.

Utility modules provide selection formatting, memory formatting, and persisted section-state helpers.

### Voice (`features/voice`)

Includes:

- `useVoiceMode` for voice gateway stream management
- `useWakewordDetection` for local wakeword integration
- `VoiceStatus` UI component

## Infrastructure Layer

Primary modules:

- `infrastructure/api/client.ts`: typed backend command surface
- `infrastructure/ipc/bridge.ts`: validated IPC send/invoke/on abstraction
- `infrastructure/services/*`: tool execution, payload shaping, system capture, artifacts
- `infrastructure/transcript/*`: transcript queues, session info, storage wrappers

## Transcript and Session Metadata

Transcript writer module captures:

- user/assistant/tool rows
- model/provider metadata
- correlation IDs and screenshot references

Session info handling avoids lost writes during startup by queueing pending entries until session metadata is ready.

## Config Ownership Boundary

Frontend-managed settings are explicitly filtered and sanitized before syncing:

- model mode/provider/model id
- interaction mode
- voice/speech modes
- query screenshot inclusion

Backend remains source of truth for non-frontend runtime fields.

## Related Provider Deep Dives

- `docs/frontend/renderer/providers/README.md`
- `docs/frontend/renderer/providers/entrypoint_view_routing_and_provider_stack_reference.md`
- `docs/frontend/renderer/providers/app_provider_coordinator_and_save_status_runtime_reference.md`
