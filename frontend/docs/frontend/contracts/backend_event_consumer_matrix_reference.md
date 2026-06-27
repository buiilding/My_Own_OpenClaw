---
summary: "Frontend backend-event consumer matrix for current typed renderer channels after the generic `from-backend` removal: SDK conversation events, settings/capability control events, audio chunk playback, and event-type drift hotspots."
read_when:
  - When adding/changing backend outbound websocket event types.
  - When debugging why a backend event appears on wire but is ignored or partially handled in renderer.
  - When searching for removed `from-backend` or `to-backend` channel behavior.
title: "Backend Event Consumer Matrix Reference"
---

# Backend Event Consumer Matrix Reference

## Canonical Modules

- `packages/windie-sdk-js/src/events/backendEvents.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/app/runtime/desktopAudioRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts`
- `frontend/src/renderer/app/providers/AppStatusProvider.jsx`
- `frontend/src/main/ipc.cjs`

## Event Ingress Source

Main process no longer rebroadcasts every backend websocket payload on one
generic `from-backend` renderer channel. Current fan-out uses specific
renderer channels:

- `windie:conversation-event` for SDK conversation runtime events consumed by
  chat/transcript/session paths
- `windie:rows`, `windie:status`, and `windie:current-turn` for SDK projection
  snapshots
- `backend-settings-event` for model/settings ACK and settings-error control
  events
- `agent-capability-event` for tool-manifest and remote-catalog events
- `audio-chunk` for text-to-speech audio chunks

Historical note: raw renderer `to-backend` sends and generic `from-backend`
listeners are removed from the preload allowlist. Renderer sends enter main
through `window.agentSdk.invoke(...)`.

## Typed Event Union (`backendEvents.ts`)

Renderer typed union currently includes:

- `query-accepted`
- `llm-thought`
- `streaming-response`
- `streaming-complete`
- `context-compaction-started`
- `context-compaction-completed`
- `context-compaction-failed`
- `tool-call`
- `tool-output`
- `tool-bundle`
- `web-search-progress`
- `local-user-message`
- `system-prompt`
- `user-message-full`
- `assistant-message-full`
- `token-count`
- `tool-schemas`
- `model-history-updated`
- `error`

Type guard:

- `isBackendEvent(value)` checks membership in the static event-type set above, validates optional base context fields as strings, and rejects non-object payloads or known payload fields with the wrong primitive/container shape

## Consumer Matrix

### Chat stream consumer (`useChatStream`)

Consumes typed events from `windie:conversation-event` via `isBackendEvent`,
SDK normalization, and explicit renderer consumers.

Core effects:

- thought/chunk/complete -> assistant stream lifecycle
- context-compaction lifecycle events -> compaction status/thinking UI state
- tool-call/tool-output/tool-bundle -> chat message rendering + transcript rows
- system-prompt/tool-schemas/user-message-full/assistant-message-full -> transparency annotations
- token-count -> token display state
- model-history-updated -> SDK hidden model-history checkpoint persistence; it
  does not create chat display rows
- error -> assistant error row (with settings-update error suppression)

### Audio consumer (`ChatInterface`)

Consumes normalized audio chunks from the app-runtime audio client:

- `DesktopAudioRuntimeClient.onAudioChunk(...)` subscribes to `audio-chunk`
  and keeps raw envelope parsing private

Effects:

- enqueues base64 audio chunk payload for playback

Note:

- `audio-chunk` is intentionally outside `backendEvents.ts` typed union and is handled by dedicated parser

### Config/model consumer (`DesktopSettingsEventRuntimeClient`)

Consumes `backend-settings-event` payloads:

- `models-listed`

Effects:

- updates available model list in `AppConfigProvider`

### Save-status consumer (`AppStatusProvider`)

Consumes `backend-settings-event` payloads:

- `settings-updated`
- normalized settings-update failure errors from `DesktopAppConfigRuntimeClient`

Effects:

- transitions save status (`saving -> success/error -> idle`)

### Agent capability consumer (`AgentSettingsTab`)

Consumes `agent-capability-event` payloads through
`DesktopExtensionRuntimeClient.onAgentCapabilityEvent(...)`:

- `client-tool-manifest`
- `remote-tool-catalog`

Effects:

- updates tool and capability settings surfaces from backend catalog state

## Context Field Semantics on Events

Main/backend stream context fields commonly present:

- `id` (message/turn correlation)
- `turn_ref`
- `conversation_ref`
- `session_id`
- `user_id`

Usage highlights:

- chat stream uses `conversation_ref` for active-conversation filtering
- SDK tool coordinator uses request ids for execution-side stale-turn handling
- renderer stream tracking uses `turn_ref` + stream phase for display/transcript
  stale-turn rejection
- transcript writer uses `conversation_ref`/`user_id` to persist event rows

## Drift Hotspots

Potential contract drifts that cause silent drops:

1. backend emits new event type not added to `backendEvents.ts` set
2. backend renames payload keys without updating event-specific handlers
3. event intended for config/status/capability path but only wired in chat
   stream path (or vice versa)
4. audio events changed without updating `DesktopAudioRuntimeClient.onAudioChunk(...)`

## Debug Checklist

If event appears in DevTools but UI ignores it:

1. verify the main-process fan-out routes the event type to the expected
   renderer channel
2. verify event type is in `BACKEND_EVENT_TYPES` when consumed by
   `windie:conversation-event`, or has a dedicated non-typed parser path
3. verify at least one consumer listener handles that type
4. verify payload key names match handler expectations

If settings save status never resolves:

1. verify backend emits `settings-updated` with matching transport path
2. verify errors include expected message fragment for AppStatus error branch
3. verify provider callback wiring (`registerSaveStatusCallback`) exists

If tool events execute on wrong turn:

1. verify event includes `turn_ref`
2. verify stream tracking active turn/phase state transitions
3. inspect stale-turn cancellation payloads sent by the SDK tool coordinator

## Related Pages

- `docs/frontend/contracts/events/README.md`
- `docs/frontend/contracts/events/from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md`
- `docs/frontend/contracts/events/local_user_message_and_query_send_failure_synthesis_reference.md`
- `docs/frontend/contracts/events/settings_and_model_ack_event_routing_reference.md`
- `docs/frontend/contracts/schema_generation_and_event_guard_reference.md`
