---
summary: "Frontend contract reference for generated schema types vs runtime event guards: source schema files, preload/main channel enforcement, backend-event typed union, and known drift boundaries."
read_when:
  - When changing `frontend/schema.json`, `frontend/src/types/schema.ts`, or runtime backend-event/type guards.
  - When debugging channel/event contract drift between preload, renderer type guards, and main-process forwarding.
title: "Schema Generation and Event Guard Reference"
---

# Schema Generation and Event Guard Reference

## Canonical Modules

- `frontend/schema.json`
- `frontend/src/types/schema.ts`
- `frontend/src/renderer/types/backendEvents.ts`
- `frontend/src/preload.js`
- `frontend/src/renderer/infrastructure/ipc/channels.ts`
- `frontend/src/renderer/infrastructure/ipc/bridge.ts`
- `frontend/src/main/ipc.cjs`

## Contract Layers (What Is Authoritative)

### Generated schema layer

- `frontend/src/types/schema.ts` is generated from `frontend/schema.json`.
- File header explicitly marks it as generated (`json-schema-to-typescript`).

### Runtime guard layer

- Renderer runtime uses `backendEvents.ts` discriminated event-type set + `isBackendEvent(...)`.
- IPC channel constants are in `channels.ts`.
- Preload allowlists in `preload.js` are the hard security gate for exposed channels.

Current practical authority for live runtime behavior:

1. `preload.js` allowlists
2. `ipc.cjs` runtime handling/forwarding logic
3. `backendEvents.ts` typed union + `isBackendEvent` filter

## Generated Schema Usage Boundary

`frontend/src/types/schema.ts` is currently not imported by frontend runtime modules (no direct call sites).

Implication:

- schema generation provides reference/legacy typing value, but does not directly enforce renderer behavior at runtime today.

## Backend Event Typed Union Contract

`backendEvents.ts` includes event types:

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

`isBackendEvent(value)` accepts only this static set.

Notable intentional exception:

- `audio-chunk` is handled by dedicated parser path in chat UI and is not part of `backendEvents.ts` union.

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

- accepts `to-backend` payloads with string `type`
- handles `update-settings` as a dedicated path with ACK tracking/timeouts
- `query` and `wakeword-detected` are gated through initial settings sync logic
- normalizes outbound payloads:
  - strips `screenshot_url` for `query` and `tool-bundle-result`
- rebroadcasts backend websocket payloads to renderer over `from-backend`

## Drift Boundaries to Watch

1. `schema.json` / generated `schema.ts` updated, but runtime guards (`backendEvents.ts`, preload, `ipc.cjs`) not updated.
2. backend starts emitting a new event type not included in `BACKEND_EVENT_TYPES`.
3. channel constants updated in renderer but missing in preload allowlist.
4. main process forwards payload shape changes that consumer handlers do not expect.

## Regeneration and Sync Checklist

When changing contract fields:

1. update `frontend/schema.json`
2. regenerate `frontend/src/types/schema.ts` (using `json-schema-to-typescript` flow)
3. update `backendEvents.ts` union + payload typing if runtime event shape changed
4. update `channels.ts` and `preload.js` allowlists together
5. update `ipc.cjs` normalization/dispatch rules for new message types
6. update contracts docs and consumer matrix docs

## Related Pages

- `docs/frontend/contracts/ipc/README.md`
- `docs/frontend/contracts/ipc/preload_allowlist_and_channel_constant_parity_reference.md`
- `docs/frontend/contracts/ipc_channel_and_handler_reference.md`
- `docs/frontend/contracts/events/README.md`
