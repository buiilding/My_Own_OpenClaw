---
summary: "Frontend contract reference for generated schema types vs runtime event guards: removed frontend renderer backendEvents.ts routing, source schema files, preload/main channel enforcement, SDK backend-event typed union, and known drift boundaries."
read_when:
  - When changing `frontend/schema.json`, `frontend/src/types/schema.ts`, or runtime backend-event/type guards.
  - When debugging channel/event contract drift between preload, SDK backend-event guards, renderer conversation-event ingress, and main-process forwarding.
  - When searching for the removed `frontend/src/renderer/types/backendEvents.ts` renderer event contract; current backend event typing lives in `packages/windie-sdk-js/src/events/backendEvents.ts`.
title: "Schema Generation and Event Guard Reference"
---

# Schema Generation and Event Guard Reference

## Canonical Modules

- `frontend/schema.json`
- `frontend/src/types/schema.ts`
- `packages/windie-sdk-js/src/events/backendEvents.ts`
- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/main/ipc.cjs`

## Contract Layers (What Is Authoritative)

### Generated schema layer

- `frontend/src/types/schema.ts` is generated from `frontend/schema.json`.
- File header explicitly marks it as generated (`json-schema-to-typescript`).

### Runtime guard layer

- SDK runtime uses `packages/windie-sdk-js/src/events/backendEvents.ts` for the
  backend websocket event union and `isBackendEvent(...)`.
- SDK transport normalization in `packages/windie-sdk-js/src/transport/backendEventNormalizer.ts`
  converts backend websocket events into SDK conversation events before the
  renderer sees normal chat stream updates.
- IPC channel constants are in `channels.ts`.
- Preload allowlists in `preload.js` are the hard security gate for exposed channels.

Current practical authority for live runtime behavior:

1. `preload.js` allowlists
2. `ipc.cjs` runtime handling/forwarding logic
3. SDK `backendEvents.ts` typed union + `isBackendEvent` filter
4. SDK `backendEventNormalizer.ts` conversation-event projection
5. renderer `desktopChatStreamIngressRuntime.ts` conversation-event routing

## Generated Schema Usage Boundary

`frontend/src/types/schema.ts` is currently not imported by frontend runtime modules (no direct call sites).

Implication:

- schema generation provides reference/legacy typing value, but does not directly enforce renderer behavior at runtime today.

## Removed Frontend Renderer backendEvents.ts Route

`frontend/src/renderer/types/backendEvents.ts` was removed. Current backend
websocket event typing lives in
`packages/windie-sdk-js/src/events/backendEvents.ts`; current backend-event to
chat conversation projection lives in
`packages/windie-sdk-js/src/transport/backendEventNormalizer.ts`.

## Backend Event Typed Union Contract

`backendEvents.ts` includes event types:

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

`isBackendEvent(value)` accepts only the static SDK event-type set before
narrowing to `BackendEvent`. Detailed payload projection happens in the SDK
backend-event normalizer, then renderer chat code consumes `ConversationEvent`
objects on `windie:conversation-event`.

Notable routing boundary:

- `audio-chunk` is part of the SDK backend-event union, but renderer playback
  still uses a dedicated audio parser/channel instead of the normal chat
  conversation-event handlers.

## Preload Channel Gate Contract

`preload.js` exposes `window.ipc` with allowlisted channel sets:

- `send`: outbound one-way channels
- `invoke`: request/response channels
- `on` / `once`: inbound event channels

If channel is outside allowlist:

- `send` silently ignores
- `invoke` rejects with `Invalid invoke channel`
- `on/once` does not subscribe

## Renderer IPC Bridge Guard Contract

`IpcBridge` in renderer:

- reuses channel constants from `channels.ts`
- performs development-only runtime validation (`NODE_ENV=development`)
- relies on preload for production security enforcement

This yields dual-layer safety:

- hard enforcement in preload
- developer feedback in renderer during local development

## Main Process Normalization Contract

`ipc.cjs` bridge behavior:

- accepts SDK command envelopes on `windie:invoke`
- routes `settings.update` through ACK tracking/timeouts
- `conversation.send` and `wakeword.detected` are gated through initial
  settings sync logic
- normalizes outbound payloads:
  - filters known backend command payloads through contract-backed allowlists
  - strips display-only `screenshot_url` for `query` and `tool-bundle-result`
- routes backend websocket events to typed renderer channels such as
  `windie:conversation-event`, `backend-settings-event`,
  `agent-capability-event`, and `audio-chunk`

## Drift Boundaries to Watch

1. `schema.json` / generated `schema.ts` updated, but runtime guards (`backendEvents.ts`, preload, `ipc.cjs`) not updated.
2. backend starts emitting a new event type not included in `BACKEND_EVENT_TYPES`.
3. SDK `backendEventNormalizer.ts` does not project the backend event into the
   conversation event shape expected by renderer handlers.
4. shared channel registry updated without matching preload/main/runtime tests.
5. main process forwards payload shape changes that consumer handlers do not expect.

## Regeneration and Sync Checklist

When changing contract fields:

1. update `frontend/schema.json`
2. regenerate `frontend/src/types/schema.ts` (using `json-schema-to-typescript` flow)
3. update `backendEvents.ts` union + payload typing if runtime event shape changed
4. update `backendEventNormalizer.ts` if the event should reach SDK conversation
   runtime or renderer chat stream consumers
5. update `ipcChannels.json` and `channels.ts` expected-registry validation
   together
6. update `ipc.cjs` normalization/dispatch rules for new message types
7. update contracts docs and consumer matrix docs

## Related Pages

- `docs/frontend/contracts/ipc/README.md`
- `docs/frontend/contracts/ipc/preload_allowlist_and_channel_constant_parity_reference.md`
- `docs/frontend/contracts/ipc_channel_and_handler_reference.md`
- `docs/frontend/contracts/events/README.md`
