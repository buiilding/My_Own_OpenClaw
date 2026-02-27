---
summary: "Frontend backend-event consumer matrix for `from-backend` messages: typed chat stream events, config/status handlers, audio chunk playback, and event-type drift hotspots."
read_when:
  - When adding/changing backend outbound websocket event types.
  - When debugging why a backend event appears on wire but is ignored or partially handled in renderer.
title: "Backend Event Consumer Matrix Reference"
---

# Backend Event Consumer Matrix Reference

## Canonical Modules

- `frontend/src/renderer/types/backendEvents.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/utils/backendAudioEvents.js`
- `frontend/src/renderer/app/providers/appConfigEvents.js`
- `frontend/src/renderer/app/providers/AppStatusProvider.jsx`
- `frontend/src/main/ipc.cjs`

## Event Ingress Source

Main process rebroadcasts backend websocket payloads to renderer on:

- `from-backend`

Renderer has multiple independent listeners on this channel (chat stream, tool runner, config handlers, audio chunk playback, status tracking).

## Typed Event Union (`backendEvents.ts`)

Renderer typed union currently includes:

- `llm-thought`
- `streaming-response`
- `streaming-complete`
- `context-compaction-started`
- `context-compaction-completed`
- `context-compaction-failed`
- `tool-call`
- `tool-output`
- `tool-bundle`
- `local-user-message`
- `system-prompt`
- `user-message-full`
- `assistant-message-full`
- `memory-store`
- `token-count`
- `tool-schemas`
- `error`

Type guard:

- `isBackendEvent(value)` checks membership in the static event-type set above

## Consumer Matrix

### Chat stream consumer (`useChatStream`)

Consumes typed events via `isBackendEvent` + handler map.

Core effects:

- thought/chunk/complete -> assistant stream lifecycle
- context-compaction lifecycle events -> compaction status/thinking UI state
- tool-call/tool-output/tool-bundle -> chat message rendering + transcript rows
- memory-store -> sidecar memory persistence side-effect routing
- system-prompt/tool-schemas/user-message-full/assistant-message-full -> transparency annotations
- token-count -> token display state
- error -> assistant error row (with settings-update error suppression)

### Tool runner consumer (`useToolRunner`)

Consumes subset:

- `tool-call`
- `tool-bundle`

Effects:

- executes tool(s) on frontend sidecar bridge
- posts `tool-result` / `tool-bundle-result` back through IPC
- applies stale-turn cancellation guardrails

### Audio consumer (`ChatInterface`)

Consumes untyped audio event shape:

- `audio-chunk` (parsed by `extractAudioChunkPayload`)

Effects:

- enqueues base64 audio chunk payload for playback

Note:

- `audio-chunk` is intentionally outside `backendEvents.ts` typed union and is handled by dedicated parser

### Config/model consumer (`appConfigEvents`)

Consumes:

- `models-listed`

Effects:

- updates available model list in `AppConfigProvider`

### Save-status consumer (`AppStatusProvider`)

Consumes:

- `settings-updated`
- `error` containing settings-update failure text

Effects:

- transitions save status (`saving -> success/error -> idle`)

## Context Field Semantics on Events

Main/backend stream context fields commonly present:

- `id` (message/turn correlation)
- `turn_ref`
- `conversation_ref`
- `session_id`
- `user_id`

Usage highlights:

- chat stream uses `conversation_ref` for active-conversation filtering
- tool runner uses `turn_ref` + stream phase for stale-turn rejection
- transcript writer uses `conversation_ref`/`user_id` to persist event rows

## Drift Hotspots

Potential contract drifts that cause silent drops:

1. backend emits new event type not added to `backendEvents.ts` set
2. backend renames payload keys without updating event-specific handlers
3. event intended for config/status path but only wired in chat stream path (or vice versa)
4. audio events changed without updating `extractAudioChunkPayload`

## Debug Checklist

If event appears in DevTools but UI ignores it:

1. verify event type is in `BACKEND_EVENT_TYPES` (or dedicated non-typed parser path)
2. verify at least one consumer listener handles that type
3. verify payload key names match handler expectations

If settings save status never resolves:

1. verify backend emits `settings-updated` with matching transport path
2. verify errors include expected message fragment for AppStatus error branch
3. verify provider callback wiring (`registerSaveStatusCallback`) exists

If tool events execute on wrong turn:

1. verify event includes `turn_ref`
2. verify stream tracking active turn/phase state transitions
3. inspect stale-turn cancellation payloads sent by `useToolRunner`

## Related Pages

- `docs/frontend/contracts/events/README.md`
- `docs/frontend/contracts/events/from_backend_event_ingress_typed_guard_and_audio_side_channel_reference.md`
- `docs/frontend/contracts/events/local_user_message_and_query_send_failure_synthesis_reference.md`
- `docs/frontend/contracts/events/settings_and_model_ack_event_routing_reference.md`
- `docs/frontend/contracts/schema_generation_and_event_guard_reference.md`
