---
summary: "Deep frontend observability reference for ipc-status and response-overlay-phase protocol signals, settings-ACK timeout diagnostics, and renderer stream-tracking/token telemetry contracts."
read_when:
  - When changing main-process websocket lifecycle signaling to renderer windows.
  - When changing renderer chat stream telemetry fields, tracking transitions, or token-count update behavior.
title: "Frontend Protocol Status, Phase, and Stream-Telemetry Signal Reference"
---

# Frontend Protocol Status, Phase, and Stream-Telemetry Signal Reference

## Coverage Snapshot (2026-02-27)

- Observability-focused protocol test files: `4`
- Total test cases across listed files: `56`

## Scope and Sources

Primary runtime sources:

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_settings_sync.cjs`
- `frontend/src/renderer/features/chat/hooks/useChatStream.ts`
- `frontend/src/renderer/app/runtime/desktopChatStreamTrackingRuntime.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/app/providers/AppConfigProvider.jsx`
- `frontend/src/renderer/app/runtime/desktopSettingsEventRuntimeClient.ts`

Primary test sources:

- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/DesktopChatStreamTrackingRuntime.test.ts`
- `tests/frontend/ChatStreamThinkingStatus.state.test.tsx`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`

## Observability Surface Matrix

| Surface | Owner | Signal | Contract |
|---|---|---|---|
| backend connection status | `ipc.cjs` | `ipc-status` | broadcasts connection/user/endpoint snapshot to all renderer windows on open/close transitions |
| overlay phase telemetry | `ipc.cjs` | `response-overlay-phase` | emits canonical phase transitions from backend stream events and query send failures |
| settings sync diagnostics | `ipc.cjs` | timeout log + ACK map state | pending settings ACKs resolve true/false on success/error/timeout with timeout-source logging |
| renderer stream telemetry | `chatStore` + `desktopChatStreamTrackingRuntime` | `streamTracking` fields | tracks per-turn timestamps, counts, phase, chunk sizes, and terminal errors |
| token usage telemetry | `useChatStream` | `token-count` handler | updates store token counters from backend protocol event payload |

## Main-Process Status and Phase Signal Contract

### `ipc-status`

`buildIpcStatusPayload(...)` emits:

- `isConnected`
- `userId`
- `runtimeWsUrl`
- `runtimeHttpUrl`

Lifecycle:

- broadcast connected snapshot after handshake send on ws open
- broadcast disconnected snapshot on ws close/reconnect path

Covered by:

- `tests/frontend/IpcMainBridge.lifecycle.test.cjs`
- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`

### `response-overlay-phase`

Allowed phases in `ipc.cjs`:

- `idle`
- `awaiting-first-chunk`
- `streaming`
- `tool-call`
- `tool-output`
- `complete`
- `error`

Triggered by backend events:

- `streaming-response` -> `streaming`
- `tool-call`/`tool-bundle` -> `tool-call`
- `tool-output` -> `awaiting-first-chunk`
- `streaming-complete` -> `complete`
- `error` during active phase -> `error`

Additional transitions:

- ws open/close -> `idle`
- query send failure -> `idle`
- query send start -> `awaiting-first-chunk`

Covered by `tests/frontend/IpcMainBridge.lifecycle.test.cjs`.

## Settings ACK Timeout Diagnostic Contract

`waitForSettingsAck(...)` in `ipc.cjs`:

- starts timer (`SETTINGS_SYNC_TIMEOUT_MS`, currently 2500ms)
- logs timeout with source and message id when expired
- resolves pending ACK promise as failure (`false`)

`resolveSettingsSync(...)` resolves pending entries on:

- backend `settings-updated` with matching id -> success
- backend `error` with matching id -> failure

This provides explicit observability around settings gate stalls without blocking query path indefinitely.

## Renderer Stream-Telemetry Contract

`chatStore.streamTracking` schema in `chatStore.ts`:

- correlation: `activeTurnRef`
- phase: `phase`
- timestamps: `startedAt`, `firstChunkAt`, `completedAt`, `lastEventAt`
- counts: `eventCount`, `chunkCount`, `toolCallCount`, `toolOutputCount`
- diagnostics: `lastEventType`, `lastChunkSize`, `lastError`

`DesktopChatStreamTrackingRuntime.applyTrackingEvent(...)` rules:

- `resetForTurn` seeds fresh state for local user send
- streaming response increments chunk counters and first-chunk timestamp
- tool-call/tool-output increment respective counters and phase
- error marks terminal state and stamps completion timestamp
- complete phase stamps completion timestamp if missing

Covered by `tests/frontend/DesktopChatStreamTrackingRuntime.test.ts`.

## Stream and Token Telemetry Ingress (`useChatStream.ts`)

Key telemetry handlers:

- `token-count` -> `setTokenCounts(...)`
- `llm-thought`/stream/tool/error events -> `recordTrackingEvent(...)` updates tracking state
- `local-user-message` -> tracking reset for new turn (`resetForTurn`)

Compatibility behavior:

- thought text accepts `payload.status` or `payload.content` fallback

Covered by:

- `tests/frontend/ChatStreamThinkingStatus.state.test.tsx`

## AppConfigProvider Signal Consumption

`AppConfigProvider` consumes normalized observability signals through:

- `DesktopClientSessionRuntimeClient.onIpcStatus(...)`
- initial `DesktopClientSessionRuntimeClient.loadMainSessionSnapshot()`

Behavior on snapshots:

- updates transcript session user id (when valid)
- updates artifact backend URL
- triggers config sync when `isConnected === true`

`desktopSettingsEventRuntimeClient.ts` keeps model-listing event routing narrow
(`models-listed`) while transcript user-id extraction stays in
`desktopClientSessionRuntimeClient.ts`.

Covered by:

- `tests/frontend/AppConfigProvider.storageAndIpc.test.tsx`

## Drift Checks

When changing observability surfaces, keep aligned:

- `RESPONSE_OVERLAY_PHASES` literal set vs renderer consumers/tests
- `ipc-status` payload keys vs AppConfigProvider snapshot logic
- stream-tracking field names and semantics vs chat store/test assertions
- token-count handler and payload shape vs backend token-count schema event contract

## Observability Control-Path Index

| Observability control path | Runtime owner | Signal contract |
|---|---|---|
| ws connection snapshot broadcast | `frontend/src/main/ipc.cjs` | `ipc-status` carries connection/user/backend endpoint metadata across open/close lifecycle |
| overlay phase transition broadcast | `frontend/src/main/ipc.cjs` | `response-overlay-phase` stays constrained to canonical phase literals and transition sources |
| settings ACK timeout diagnostics | `frontend/src/main/ipc.cjs` | unresolved ACKs log timeout source + id and resolve without deadlocking query flow |
| stream turn telemetry aggregation | `frontend/src/renderer/app/runtime/desktopChatStreamTrackingRuntime.ts` | per-turn phase/timestamp/counter fields remain coherent across local-user/chunk/tool/error events |
| token usage ingestion | `frontend/src/renderer/features/chat/hooks/useChatStream.ts` | `token-count` events update token counters without mutating turn-phase telemetry semantics |

## Related Pages

- [Frontend Protocol Lifecycle Hub](../lifecycle/README.md)
- [Frontend Protocol State Hub](../state/README.md)
- [Frontend Protocol Validation Hub](../validation/README.md)
- [Frontend Protocol Errors Hub](../errors/README.md)
- [Frontend Protocol Testing Hub](../testing/README.md)
