---
summary: "Deep reference for frontend `from-backend` event ingress: main-process rebroadcast path, renderer typed event guard behavior, and `audio-chunk` side-channel parsing."
read_when:
  - When adding/changing backend event types consumed by renderer hooks.
  - When debugging why a backend event reaches renderer IPC but is ignored.
title: "From-Backend Event Ingress, Typed Guard, and Audio Side-Channel Reference"
---

# From-Backend Event Ingress, Typed Guard, and Audio Side-Channel Reference

## Canonical Modules

- `frontend/src/main/ipc.cjs`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/renderer/types/backendEvents.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/features/chat/hooks/useToolRunner.ts`
- `frontend/src/renderer/features/chat/utils/backendAudioEvents.js`

## Ingress Path

Backend websocket events flow:

1. backend sends JSON over websocket to Electron main (`ipc.cjs`)
2. main parses event, updates connection/session/conversation trackers
3. main rebroadcasts event to renderer windows on `from-backend`
4. renderer listeners independently consume and filter event types

Channel constant source:

- `ON_CHANNELS.FROM_BACKEND = "from-backend"`

## Typed Event Guard Boundary

Renderer typed filtering lives in `backendEvents.ts`:

- `BackendEventType` union
- `BACKEND_EVENT_TYPES` static `Set`
- `isBackendEvent(value)` runtime guard

Current accepted typed event types:

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

Events outside this set are ignored by typed consumers.

Notable control ACK events outside typed union:

- `models-listed`
- `settings-updated`
- `settings-loaded`

These are handled by provider-level non-typed listeners.

## Multi-Consumer Listener Contract

`from-backend` has multiple listeners with different filters:

- `useChatStream`:
  - requires `isBackendEvent(...)`
  - applies conversation filtering (`shouldIgnoreEventForActiveConversation`)
  - updates stream tracking, chat messages, transcript writes
- `useToolRunner`:
  - requires `isBackendEvent(...)`
  - handles only `tool-call` and `tool-bundle`
  - enforces stale-turn cancellation guards
- `ChatInterface` audio path:
  - does not use `isBackendEvent(...)`
  - uses `extractAudioChunkPayload(...)` parser

No single global consumer owns all `from-backend` types.

## Audio Side-Channel Contract

`audio-chunk` handling is intentionally separate from typed union:

- parser location: `backendAudioEvents.js`
- required shape:
  - `type === "audio-chunk"`
  - `payload.audio` string
  - `payload.sample_rate` number

If shape mismatches, parser returns `null` and audio is skipped.

## Main-Process Overlay-Phase Coupling

Before rebroadcast, `ipc.cjs` updates response overlay phase from event type:

- `streaming-response` -> `streaming`
- `tool-call`/`tool-bundle` -> `tool-call`
- `tool-output` -> `awaiting-first-chunk`
- `streaming-complete` -> `complete`
- `error` (when non-idle) -> `error`

These phase transitions are sent over separate channel:

- `response-overlay-phase`

## Context Fields and Turn Filters

Typed event base supports optional context keys:

- `id`
- `session_id`
- `user_id`
- `conversation_ref`
- `turn_ref`

Runtime consumers rely on these fields:

- conversation guard in `useChatStream`
- turn-scoped stale-tool cancellation in `useToolRunner`
- transcript-session updates in `useChatStream`

Missing `conversation_ref` or `turn_ref` can degrade filtering precision.

## Drift Hotspots

1. backend emits new type but `BACKEND_EVENT_TYPES` not updated
2. payload keys changed but per-event handlers still read old keys
3. `audio-chunk` shape changes without updating `extractAudioChunkPayload`
4. overlay-phase mapping in `ipc.cjs` diverges from event semantics

## Debug Checklist

If event appears in main logs but UI ignores it:

1. check `isBackendEvent(...)` membership
2. check conversation filter in `useChatStream`
3. check tool stale-turn guard in `useToolRunner`
4. check whether event is audio side-channel and needs parser path

If audio drops but text stream works:

1. validate `audio-chunk` payload field names/types
2. verify renderer audio listener still subscribes to `from-backend`
3. verify parser returns non-null payload objects

## Related Pages

- [Frontend Contracts Events Docs Hub](README.md)
- [Frontend Backend Event Schema Docs Hub](schema/README.md)
- [Backend Event Payload Field Contract and Consumer Ownership Reference](schema/backend_event_payload_field_contract_and_consumer_ownership_reference.md)
- [Settings and Model ACK Event Routing Reference](settings_and_model_ack_event_routing_reference.md)
- [Backend Event Consumer Matrix Reference](../backend_event_consumer_matrix_reference.md)
- [Schema Generation and Event Guard Reference](../schema_generation_and_event_guard_reference.md)
- [IPC Channel and Handler Reference](../ipc_channel_and_handler_reference.md)
