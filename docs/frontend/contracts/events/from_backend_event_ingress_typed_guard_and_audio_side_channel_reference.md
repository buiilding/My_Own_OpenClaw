---
summary: "Deep reference for current typed backend event fan-out after the generic `from-backend` channel removal: SDK conversation events, settings/capability control channels, renderer typed event guards, and `audio-chunk` side-channel parsing."
read_when:
  - When adding/changing backend event types consumed by renderer hooks.
  - When debugging why a backend event reaches renderer IPC but is ignored.
  - When searching for removed `from-backend` or `to-backend` preload behavior.
title: "Typed Backend Event Fan-Out, Guard, and Audio Side-Channel Reference"
---

# Typed Backend Event Fan-Out, Guard, and Audio Side-Channel Reference

## Canonical Modules

- `frontend/src/main/ipc.cjs`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/renderer/app/runtime/desktopAudioRuntimeClient.ts`
- `frontend/src/renderer/app/runtime/desktopConversationRuntimeEventClient.ts`
- `packages/windie-sdk-js/src/events/backendEvents.ts`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `packages/windie-sdk-js/src/tools/ToolExecutionCoordinator.ts`
- `frontend/src/renderer/app/runtime/desktopAudioRuntimeClient.ts`

## Ingress Path

Current backend websocket and SDK runtime events no longer flow through a
generic renderer `from-backend` channel. Main process fans events out to
specific renderer channels:

1. backend sends JSON over websocket to Electron main (`ipc.cjs`)
2. main parses event, updates connection/session/conversation trackers
3. typed backend control events are routed through
   `ipc_backend_event_channels.cjs`
4. SDK conversation runtime events and projections are emitted on `windie:*`
   channels
5. renderer listeners independently consume and filter event types

Current channel constants:

- `ON_CHANNELS.DESKTOP_RUNTIME_CONVERSATION_EVENT = "windie:conversation-event"`
- `ON_CHANNELS.DESKTOP_RUNTIME_ROWS = "windie:rows"`
- `ON_CHANNELS.DESKTOP_RUNTIME_STATUS = "windie:status"`
- `ON_CHANNELS.DESKTOP_RUNTIME_CURRENT_TURN = "windie:current-turn"`
- `ON_CHANNELS.BACKEND_SETTINGS_EVENT = "backend-settings-event"`
- `ON_CHANNELS.AGENT_CAPABILITY_EVENT = "agent-capability-event"`
- `ON_CHANNELS.AUDIO_CHUNK = "audio-chunk"`

Historical note: `from-backend` and raw renderer `to-backend` are removed from
the preload allowlist. Renderer sends should use `window.agentSdk.invoke(...)`;
renderer receives should use the typed channels above.

## Typed Event Guard Boundary

Renderer typed filtering lives in `backendEvents.ts`:

- `BackendEventType` union
- `BACKEND_EVENT_TYPES` static `Set`
- `isBackendEvent(value)` runtime guard

Current accepted typed event types:

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
- `error`

Events outside this set are ignored by typed consumers. Known event types are also rejected when optional base context fields are not strings, or when a present `payload` is not an object or contains known fields with values outside the typed event contract.

Notable control ACK/capability events outside typed union:

- `models-listed`
- `settings-updated`
- `client-tool-manifest`
- `remote-tool-catalog`

These are handled by provider-level non-typed listeners on
`backend-settings-event` or `agent-capability-event`.
`settings-loaded` remains a backend/SDK event type but is not currently routed
by `ipc_backend_event_channels.cjs` to a renderer provider channel.

## Multi-Consumer Listener Contract

Renderer event channels have separate listeners with different filters:

- `windie:conversation-event` -> `DesktopConversationRuntimeEventClient` ->
  `useChatStream`:
  - requires `isBackendEvent(...)`
  - applies conversation filtering (`shouldIgnoreEventForActiveConversation`)
  - updates stream tracking, chat messages, transcript writes
- SDK tool coordinator:
  - receives normalized backend tool events from the SDK transport
  - handles only executable `tool-call` and `tool-bundle` waits
  - enforces stale-turn cancellation guards
- `backend-settings-event` -> app config/status providers:
  - consumes `models-listed`, `settings-updated`, and settings-update errors
- `agent-capability-event` -> agent settings/capability surfaces:
  - consumes client tool manifest and remote tool catalog updates
- `audio-chunk` -> `ChatInterface` audio path:
  - does not use `isBackendEvent(...)`
  - subscribes through `DesktopAudioRuntimeClient`
  - keeps `extractDesktopAudioChunkPayload(...)` private behind
    `DesktopAudioRuntimeClient.onAudioChunk(...)`

No single global consumer owns all backend event types.

## Audio Side-Channel Contract

`audio-chunk` handling is intentionally separate from typed union:

- parser location: `desktopAudioRuntimeClient.ts`
- required shape:
  - `type === "audio-chunk"`
  - `payload.audio` string
  - `payload.sample_rate` number

If shape mismatches, parser returns `null` and audio is skipped. The audio
listener subscribes through `DesktopAudioRuntimeClient`, which owns the
`ON_CHANNELS.AUDIO_CHUNK` channel constant, not the removed `from-backend`
channel.

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
- turn-scoped stale-tool cancellation in SDK runtime state
- transcript-session updates in `useChatStream`

Missing `conversation_ref` or `turn_ref` can degrade filtering precision.

## Drift Hotspots

1. backend emits new event type but `ipc_backend_event_channels.cjs` does not
   route it to a renderer channel
2. event is routed to `windie:conversation-event` but `BACKEND_EVENT_TYPES` is
   not updated
3. payload keys changed but per-event handlers still read old keys
4. `audio-chunk` shape changes without updating `DesktopAudioRuntimeClient.onAudioChunk(...)`
5. overlay-phase mapping in `ipc.cjs` diverges from event semantics

## Debug Checklist

If event appears in main logs but UI ignores it:

1. check `isBackendEvent(...)` membership
2. check whether `ipc_backend_event_channels.cjs` routes the type to
   `backend-settings-event`, `agent-capability-event`, or `audio-chunk`
3. check conversation filter in `useChatStream`
4. check tool stale-turn guard in SDK runtime state
5. check whether event is audio side-channel and needs parser path

If audio drops but text stream works:

1. validate `audio-chunk` payload field names/types
2. verify renderer audio listener subscribes to `audio-chunk`
3. verify parser returns non-null payload objects

## Related Pages

- [Frontend Contracts Events Docs Hub](README.md)
- [Frontend Backend Event Schema Docs Hub](schema/README.md)
- [Backend Event Payload Field Contract and Consumer Ownership Reference](schema/backend_event_payload_field_contract_and_consumer_ownership_reference.md)
- [Settings and Model ACK Event Routing Reference](settings_and_model_ack_event_routing_reference.md)
- [Backend Event Consumer Matrix Reference](../backend_event_consumer_matrix_reference.md)
- [Runtime Event Guard Reference](../schema_generation_and_event_guard_reference.md)
- [IPC Channel and Handler Reference](../ipc_channel_and_handler_reference.md)
