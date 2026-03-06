---
summary: "Frontend audio runtime reference for backend `audio-chunk` relay, renderer playback queue behavior, and stop/new-query cancellation semantics."
read_when:
  - When changing backend audio chunk consumption, playback queue behavior, or stop-query/new-chat handling.
  - When debugging overlapping speech, stuck playback, or dropped/invalid audio chunk payloads.
title: "Audio Chunk Playback and Stop Semantics Reference"
---

# Audio Chunk Playback and Stop Semantics Reference

## Canonical Modules

- `frontend/src/main/ipc.cjs`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/features/chat/components/ChatInterface.jsx`
- `frontend/src/renderer/features/chat/hooks/useChatInterfaceBindings.js`
- `frontend/src/renderer/features/chat/utils/state/stopQueryState.js`
- `frontend/src/renderer/features/chat/utils/backendAudioEvents.js`
- `frontend/src/renderer/infrastructure/audio/PlayerService.ts`
- `frontend/src/renderer/features/chat/hooks/useChatMessageSender.ts`
- `frontend/src/renderer/infrastructure/api/client.ts`
- `frontend/src/renderer/types/backendEvents.ts`

## End-to-End Audio Event Path

Audio output from backend follows this route:

1. backend websocket sends event `type: "audio-chunk"`
2. Electron main `ipc.cjs` parses message and relays `from-backend` to all renderer windows
3. renderer chat runtime (`useChatInterfaceAudioChunkStream` used by `ChatInterface`) listens to `ON_CHANNELS.FROM_BACKEND`
4. `extractAudioChunkPayload(...)` filters and validates audio payload shape
5. valid chunk is enqueued in `PlayerService`

Important distinction:

- typed stream handling in `useChatStream` uses `isBackendEvent` and does not include `audio-chunk`
- audio chunk handling is intentionally separate from typed stream handlers and is bound via dedicated `ChatInterface` runtime binding hooks

## Main-Process Relay Semantics

`ipc.cjs` behavior:

- relay is generic for all backend messages via `broadcastToRenderers('from-backend', data)`
- overlay phase transitions are updated for text/tool lifecycle events
- `audio-chunk` does not drive overlay phase transitions

Result:

- audio can continue independently while stream phase machine tracks text/tool states.

## Renderer Audio Payload Gate

`extractAudioChunkPayload(data)` accepts only:

- `data.type === "audio-chunk"`
- `payload.audio` is string (base64 PCM16)
- `payload.sample_rate` is number

Returns normalized object:

- `{ audio, sample_rate }`

Any invalid/missing payload shape is dropped silently (`null`).

## PlayerService Queue and Playback

`PlayerService` runtime model:

- maintains FIFO `audioQueue`
- single active source at a time (`activeSource`)
- lazy `AudioContext` allocation
- sequential playback via source `onended -> playNext()`

Per-chunk decode path:

1. base64 -> bytes (`ArrayBuffer`)
2. `Int16Array` -> `Float32Array` conversion
3. mono `AudioBuffer` creation using chunk sample rate
4. buffer source connected to context destination and started

Error tolerance:

- chunk decode/play errors log and skip to next chunk
- context resume attempts when suspended

## Stop and Reset Semantics

Stop sources:

- before sending a new message (`useChatMessageSender` calls `stopPlayback`)
- explicit stop button (`ChatInterface.handleStopQuery`)
- new chat action when stream active (`handleNewChat`)
- component unmount cleanup

`PlayerService.stopPlayback()` guarantees:

- increments `playbackGeneration` so stale `onended` callbacks are ignored
- clears pending queue immediately
- stops/disconnects active source safely
- closes and nulls audio context

This prevents overlap between old and new response audio.

## Backend-Control Coupling

When user stops query:

1. renderer applies shared stop-state helper (`applyStopQueryUiState`) to mark terminal stop phase
2. playback stops immediately
3. `ApiClient.stopQuery()` sends `stop-query` to backend

When user sends a new query:

1. playback is stopped first
2. user message dispatch proceeds
3. next response audio starts from a clean queue/context state

## Drift and Failure Hotspots

If text streams but no audio plays:

1. verify `audio-chunk` events are arriving on `from-backend`
2. verify payload has both `audio` and `sample_rate`
3. inspect decode/playback errors from `PlayerService`

If old audio keeps playing after stop/new query:

1. verify `stopPlayback()` call path is hit in sender/stop/new-chat handlers
2. verify playback generation increments
3. verify active source is being stopped and disconnected

If audio events are ignored by typed stream hooks:

- expected behavior; `audio-chunk` is intentionally outside `BackendEventType` union.

## Cross-Doc References

- PlayerService internals and test-backed queue contracts: `docs/frontend/renderer/infrastructure/audio/player_service_queue_generation_and_error_recovery_reference.md`
- stream state machine and typed event flow: `docs/frontend/runtime/stream_event_state_machine.md`
- chat stream/tool runtime details: `docs/frontend/renderer/chat_stream_and_tool_execution_reference.md`
- backend speech production details: `docs/backend/services/tts_and_wakeword_audio_runtime_reference.md`
