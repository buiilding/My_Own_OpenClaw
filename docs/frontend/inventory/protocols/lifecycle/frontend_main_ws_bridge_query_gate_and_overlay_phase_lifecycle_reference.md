---
summary: "Lifecycle-level contract for frontend main-process websocket bridge: connection state, settings ACK gate, query enrichment/send path, synthetic events, and response-overlay phase transitions."
read_when:
  - When changing `frontend/src/main/ipc.cjs` ws/query/settings sequencing.
  - When tracing phase desync, failed first-query settings sync, or reconnect edge cases.
title: "Frontend Main WS Bridge, Query Gate, and Overlay Phase Lifecycle Reference"
---

# Frontend Main WS Bridge, Query Gate, and Overlay Phase Lifecycle Reference

## Scope and Sources

Lifecycle contract sources:

- Main websocket bridge/state machine: `frontend/src/main/ipc.cjs`
- Query payload enrichment: `frontend/src/main/query_payload_builder.cjs`
- Synthetic local query events: `frontend/src/main/ipc_query_events.cjs`
- Overlay phase -> window visibility behavior: `frontend/src/main/response_overlay_phase_handler.cjs`, `frontend/src/main/index.cjs`
- Renderer boundary allowlists: `frontend/src/preload.js`, `frontend/src/renderer/infrastructure/ipc/channels.ts`

## Main Bridge State Model

Persistent main-process bridge state in `ipc.cjs`:

- Connection/session: `ws`, `isConnected`, `currentUserId`, `currentSessionId`, `currentServerUserId`, `currentConversationRef`
- Query mode: `isFirstQuery`
- Settings gate: `latestFrontendConfig`, `hasAttemptedInitialSettingsSync`, `pendingSettingsSyncPromise`, `pendingSettingsSyncs`
- Overlay phase: `responseOverlayPhase` with allowed literals:
  - `idle`
  - `awaiting-first-chunk`
  - `streaming`
  - `tool-call`
  - `tool-output`
  - `complete`
  - `error`

## WebSocket Lifecycle Contract

### Connect/Open

`connect()` guards against duplicate connect attempts when socket already `OPEN`/`CONNECTING`.

On open:

1. `isConnected = true`
2. `isFirstQuery = true`
3. settings gate reset (`resetSettingsSyncState()`)
4. overlay phase forced to `idle`
5. `currentUserId` generated from OS username (sanitized) or UUID fallback
6. handshake frame sent to backend:
   - `{ type: 'handshake', user_id: currentUserId }`
7. `ipc-status` broadcast to renderer windows

### Message Handling

For each inbound backend frame:

- If envelope has context keys, cache updates:
  - `session_id` -> `currentSessionId`
  - `user_id` -> `currentServerUserId`
  - `conversation_ref` -> `currentConversationRef`
- Settings ACK map resolution:
  - `settings-updated` + `id` => resolve pending settings promise `true`
  - `error` + `id` => resolve pending settings promise `false`
- Response overlay phase transitions:
  - `streaming-response` -> `streaming`
  - `tool-call`/`tool-bundle` -> `tool-call`
  - `tool-output` -> `awaiting-first-chunk`
  - `streaming-complete` -> `complete`
  - `error` (while non-idle) -> `error`
- Re-broadcast raw event via `from-backend`

### Close/Error

On close:

1. `isConnected = false`
2. settings gate reset
3. backend session context reset
4. overlay phase -> `idle`
5. `ipc-status` broadcast disconnected
6. reconnect scheduled after `5000ms`

On socket error while open: explicit `ws.close()` to converge into close path.

## Settings ACK Gate Lifecycle

Core contract:

- First `query`/`wakeword-detected` send path waits on one-time settings sync gate.
- Gate timeout per outbound settings update: `2500ms` (`SETTINGS_SYNC_TIMEOUT_MS`).
- Pending ACKs tracked by message-id map; unresolved entries auto-resolve `false` on timeout.
- Gate is per-connection (`hasAttemptedInitialSettingsSync` resets on reconnect).

State flow:

1. `ensureInitialSettingsSync()` invoked before first query/wakeword message.
2. Loads cached config from disk if in-memory cache missing.
3. Sends `update-settings` to backend and waits for `settings-updated`/`error`/timeout.
4. Subsequent queries skip gate unless reconnect resets state.

## Query Send Lifecycle

`ipcMain.on('to-backend', ...)` behavior:

1. Validate message shape (`type` string + object payload).
2. Fast path: `update-settings` messages call `sendSettingsUpdate(...)` and return.
3. For `query`/`wakeword-detected`:
   - await settings gate + pending ACK promise.
4. For `query` specifically:
   - optional chatbox pre-capture hook (`onBeforeOverlayQueryCapture`) for overlay focus safety.
   - create `queryMessageId` and set phase `awaiting-first-chunk`.
   - resolve `conversation_ref` from payload or cached current conversation.
   - emit synthetic `local-user-message` via `from-backend` (optimistic UX event).
   - choose context type:
     - first query -> `initial`
     - later queries -> `sequential`
   - call `buildQueryPayloadContent(...)` to enrich payload with system-context XML + memory sections.
   - attach `system_state_internal.screen_resolution` when available.
5. Send envelope with `sendMessageToBackend(...)`.
6. If send fails for query, emit synthetic `error` event (`buildQuerySendFailure(...)`) and reset phase to `idle`.
7. After successful first query send, flip `isFirstQuery = false`.

## Outbound Payload Normalization Contract

`normalizeBackendPayload(...)` strips `screenshot_url` from:

- `query`
- `tool-bundle-result`

Purpose: keep websocket payload aligned to backend schema-supported fields.

## Renderer Fan-Out and Late Subscriber Sync

`trackRendererWindow(...)` contract:

- Tracks renderer windows in a set.
- On `did-finish-load`, pushes current `response-overlay-phase` snapshot (`source: 'sync'`).
- Broadcast helper can skip source webContents to avoid duplicate local echo.

Result:

- Newly loaded renderer surfaces converge to current phase without waiting for next backend event.

## Overlay Phase -> Window Visibility Contract

`handleResponseOverlayPhaseEvent(...)` in main:

- `idle`: hide response overlay, visibility false.
- Streaming phases (`awaiting-first-chunk`, `streaming`, `tool-call`, `tool-output`):
  - visibility true,
  - ensure fallback bounds,
  - show response window when chatbox visible.
- Terminal phases (`complete`, `error`) keep/show response overlay when chatbox still visible.
- Context-label visibility sync runs after non-stream transitions.

## Protocol Drift Checks

When changing this lifecycle, keep synchronized:

- `preload.js` allowlists and renderer typed channel constants.
- ACK/control message type assumptions (`settings-updated`, error id correlation).
- Overlay phase literals used by `ipc.cjs` and `response_overlay_phase_handler.cjs`.
- Synthetic `local-user-message` / send-failure error envelopes consumed by renderer stream hooks.

## Related Deep Dives

- [Frontend Protocol Errors Hub](../errors/README.md)
- [Frontend Protocol Validation Hub](../validation/README.md)
