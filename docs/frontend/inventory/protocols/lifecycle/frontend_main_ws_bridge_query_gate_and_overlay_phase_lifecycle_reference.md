---
summary: "Lifecycle-level contract for frontend main-process websocket bridge: connection state, settings ACK gate, query enrichment/send path, split IPC registrar ownership, and response-overlay phase transitions."
read_when:
  - When changing `frontend/src/main/ipc.cjs` ws/query/settings sequencing.
  - When tracing phase desync, failed first-query settings sync, reconnect edge cases, or split registrar ownership drift.
title: "Frontend Main WS Bridge, Query Gate, and Overlay Phase Lifecycle Reference"
---

# Frontend Main WS Bridge, Query Gate, and Overlay Phase Lifecycle Reference

## Coverage Snapshot (2026-03-06)

- Lifecycle-focused protocol test files: `8`
- Total test cases across listed files: `90`

## Scope and Sources

Lifecycle contract sources:

- Main websocket bridge/state machine: `frontend/src/main/ipc.cjs`
- Connection/query-gate state:
  `frontend/src/main/ipc/ipc_backend_connection_gate_state.cjs`
- Settings-sync ACK gate helpers: `frontend/src/main/ipc/ipc_settings_sync.cjs`
- Query payload enrichment: `frontend/src/main/ipc/ipc_query_runtime.cjs`
- Query send-failure event context: `frontend/src/main/ipc/ipc_query_events.cjs`
- Main-process IPC registrar split: `frontend/src/main/index.cjs`, `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`, `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`, `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- Overlay phase side-effect application: `frontend/src/main/ipc/ipc_response_overlay_phase_runtime.cjs`
- Overlay phase -> window visibility behavior: `frontend/src/main/surfaces/response_overlay_phase_handler.cjs`, `frontend/src/main/index.cjs`
- Wakeword + overlay signal emitters: `frontend/src/main/surfaces/main_window_runtime.cjs`, `frontend/src/main/surfaces/overlay_signal_runtime.cjs`, `frontend/src/main/wakeword/wakeword_bridge.cjs`, `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`
- Main-window target routing and display inventory invoke handlers: `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`, `frontend/src/main/surfaces/display_query_handler.cjs`, `frontend/src/main/surfaces/main_window_runtime.cjs`, `frontend/src/renderer/features/dashboard/components/DashboardShell.jsx`
- Minimal chat pill wakeword trigger handling: `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx`
- Renderer boundary allowlists: `frontend/src/preload.js`, `frontend/src/renderer/infrastructure/ipc/channels.ts`
- Primary lifecycle tests: `tests/frontend/IpcMainBridge.lifecycle.test.cjs`, `tests/frontend/IpcMainBridge.query.test.cjs`, `tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx`, `tests/frontend/DashboardShell.test.jsx`, `tests/frontend/OverlayPhaseIpcRuntime.test.cjs`, `tests/frontend/WindowControlsIpcRuntime.test.cjs`, `tests/frontend/PermissionIpcRuntime.test.cjs`, `tests/frontend/DisplayQueryHandler.test.cjs`

## Main-Process IPC Registrar Split Lifecycle

`initializeMainProcessIpc()` in `index.cjs` is one-shot (`mainProcessIpcHandlersInitialized` guard) and delegates invoke/event channel registration to three runtime modules:

- `initializeOverlayPhaseHandlersRuntime(...)`:
  - `set-chatbox-visual-anchor-height`
  - `move-chatbox-to`
  - `set-responsebox-size`
  - `show-chatbox`
  - `hide-chatbox`
- `initializeWindowControlHandlersRuntime(...)`:
  - `show-main-window`
  - `get-main-window-visibility`
  - `get-displays`
  - `window-minimize`
  - `window-toggle-maximize`
  - `window-close`
- `initializePermissionHandlersRuntime(...)`:
  - `list-permissions`
  - `check-permissions`
  - `check-permission`
  - `run-permission-probe`
  - `request-permission`

Lifecycle implication: channel ownership drift is now a split-runtime problem, not a monolithic `index.cjs` handler block.

## Main Bridge State Model

Persistent main-process bridge state composed by `ipc.cjs`:

- Connection/session: backend connection gate state, `currentUserId`, and
  backend session identity state
- Query mode: backend connection gate first-query state
- Settings gate: desktop UI config store snapshot, `hasAttemptedInitialSettingsSync`, `pendingSettingsSyncPromise`, `pendingSettingsSyncs`
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

1. backend connection gate state sets connected `true`
2. backend connection gate state sets first-query `true`
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
- Route events to renderer-specific channels: SDK conversation projections on
  `windie:*`, settings/model events on `backend-settings-event`, capability
  events on `agent-capability-event`, audio on `audio-chunk`, and overlay phase
  updates on `response-overlay-phase`

### Close/Error

On close:

1. backend connection gate state sets connected `false`
2. settings gate reset
3. backend session context reset
4. overlay phase -> `idle`
5. `ipc-status` broadcast disconnected
6. reconnect scheduled after `1000ms`

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

`ipc_agent_sdk_command_handlers.cjs` registers the `windie:invoke` handler and
owns SDK command envelope dispatch for query/settings/model commands:

1. Validate SDK command envelope from `window.agentSdk.invoke(command, payload)`.
2. Route `settings.update` and `models.list` commands through the Agent SDK
   runtime settings/model paths.
3. For `conversation.send` and `wakeword.detected`:
   - await settings gate + pending ACK promise when required.
4. For `conversation.send` specifically:
   - optional chatbox pre-capture hook (`onBeforeOverlayQueryCapture`) for overlay focus safety.
   - create `queryMessageId` and set phase `awaiting-first-chunk`.
   - resolve `conversation_ref` from payload or cached current conversation.
   - preserve optimistic renderer user rows until the SDK conversation runtime
     projects the matching user message.
   - normalize backend query fields and preserve required conversation/user identity.
   - leave model-facing memory/attachment content rendering to SDK context enrichment.
5. Send envelope through the SDK runtime query command router.
6. If send fails for query, broadcast SDK/runtime failure projections and reset
   phase to `idle`.
7. After successful first query send, flip `isFirstQuery = false`.

## Outbound Payload Normalization Contract

The SDK managed agent session filters known command payloads through
contract-backed allowlists before websocket send. Electron main direct payloads
import the SDK backend payload contract directly, and
query sends use `ipc_query_runtime.cjs` for query-specific backend field
shaping.

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

## Wakeword -> STT Trigger Lifecycle

Wakeword trigger path contracts:

1. `createMainWindow(...)` wires `initializeWakewordBridge(...)` callback.
2. Wakeword callback attempts `showChatWindow({ focus: true })`.
3. Only when show succeeds (`result.success`) does main emit `wakeword-stt-trigger`.
4. `emitWakewordSttTrigger(...)` sends to chat window only (no main-window broadcast).
5. `ChatBox` listener on `ON_CHANNELS.WAKEWORD_STT_TRIGGER`:
   - when `config.wakeword_stt_enabled !== true`, force session inactive and do nothing else.
   - when enabled, clear transcription/input, mark wakeword STT session active, and focus input.

Guardrails validated in tests:

- `tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx` verifies disabled wakeword setting does not start STT session.
- `tests/frontend/IpcMainBridge.query.test.cjs` verifies overlay pre-capture hook runs only for chatbox view query sends.

## Main-Window Open Target Routing Lifecycle

`show-main-window` invoke routing (`window_controls_ipc_runtime.cjs`):

1. `handleShowMainWindow(...)` executes window open/maximize behavior.
2. Target normalization only accepts one of: `chat`, `memory`, `models`, `settings`.
3. `main-window-open-target` event is emitted only when main-window show succeeded and target is valid.

Renderer consumption contract (`DashboardShell.jsx`):

- `chat` target closes panels and requests composer focus.
- `settings`/`models`/`memory` targets open corresponding modal surfaces.
- Unknown targets are ignored.

Coverage anchors:

- `tests/frontend/DashboardShell.test.jsx` checks settings-target open and chat-target modal-close behavior.
- `tests/frontend/WindowControlsIpcRuntime.test.cjs` checks runtime-owner routing and `show-main-window` target emission boundary.

## Display and Permission Runtime Lifecycle Contracts

Display query lifecycle contracts:

- `window_controls_ipc_runtime.cjs` owns `get-displays` invoke registration.
- `display_query_handler.cjs` maps Electron `screen.getAllDisplays()` to frontend-safe payloads:
  - `id`
  - `label` (`Display N (WxH)`)
  - `isPrimary`
  - `bounds`
  - `scaleFactor`
- Coverage: `tests/frontend/DisplayQueryHandler.test.cjs`.

Permission lifecycle contracts:

- `permission_ipc_runtime.cjs` owns permission invoke channels and shared `permissionDeps` wiring.
- `check-permission` and `run-permission-probe` are intentionally equivalent envelope paths.
- Coverage: `tests/frontend/PermissionIpcRuntime.test.cjs`, `tests/frontend/PermissionService.test.cjs`.

## Overlay Visibility Broadcast Contract

`setResponseOverlayVisibilityState(...)` in main:

- Stores in-memory `responseOverlayVisible` state.
- Broadcasts `response-overlay-visibility` payload `{ visible: boolean }` to all overlay/main windows.

Call sites include:

- `response_overlay_phase_handler.cjs` phase transitions (`idle`, streaming phases, terminal phases).
- response window close flow (`main_window_runtime.cjs`) which forces visibility false.
- overlay hide/show flows in `window_visibility_runtime.cjs` via `showChatWindow(...)` and `hideChatWindow(...)`.

Channel typing surface:

- `frontend/src/renderer/infrastructure/ipc/channels.ts` exports `ON_CHANNELS.RESPONSE_OVERLAY_VISIBILITY`.
- Current renderer runtime has no dedicated listener module for this channel; broadcast remains a main-process synchronization signal.

## Protocol Drift Checks

When changing this lifecycle, keep synchronized:

- `preload.js` allowlists and renderer typed channel constants.
- ACK/control message type assumptions (`settings-updated`, error id correlation).
- Overlay phase literals used by `ipc.cjs` and `response_overlay_phase_handler.cjs`.
- split invoke handler ownership across `overlay_phase_ipc_runtime.cjs`, `window_controls_ipc_runtime.cjs`, and `permission_ipc_runtime.cjs`.
- SDK `user_message` projections and Electron send-failure error envelopes consumed by renderer stream hooks.

## Lifecycle Control-Path Index

| Lifecycle control path | Runtime owner | Lifecycle contract |
|---|---|---|
| websocket open/close transition | `packages/windie-sdk-js/src/runtime/AgentClient.ts`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`, `frontend/src/main/ipc.cjs` | SDK runtime owns socket construction, handshake send, connect waiters, reconnect scheduling, and idle close policy; IPC owns UI/session state callbacks |
| first-query settings ACK gate | `frontend/src/main/ipc.cjs` | first query/wakeword send waits for settings sync outcome, with bounded timeout fallback |
| query send bootstrap + SDK local user projection | `frontend/src/main/ipc.cjs`, `frontend/src/main/ipc/ipc_query_events.cjs`, `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts` | outbound query uses resolved conversation context; SDK emits `turn_started` and `user_message`, and Electron only synthesizes send-failure errors |
| split IPC registrar bootstrap | `frontend/src/main/index.cjs`, `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`, `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`, `frontend/src/main/permissions/permission_ipc_runtime.cjs` | invoke/event registration is one-shot and split by runtime ownership instead of monolithic main handler registration |
| overlay phase transition fan-out | `frontend/src/main/ipc.cjs`, `frontend/src/main/ipc/ipc_response_overlay_phase_runtime.cjs`, `frontend/src/main/surfaces/response_overlay_phase_handler.cjs` | canonical phase set drives renderer/state sync, stop-shortcut gating, backend idle sync, and response-window visibility behavior |
| wakeword callback -> STT trigger | `frontend/src/main/surfaces/main_window_runtime.cjs`, `frontend/src/main/surfaces/overlay_signal_runtime.cjs`, `frontend/src/main/wakeword/wakeword_bridge.cjs`, `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs` | STT trigger emits only after chat window show succeeds and is routed only to chat window; helper runtime normalizes ready/error state inputs used by wakeword bridge |
| show-main-window target routing | `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`, `frontend/src/main/surfaces/main_window_runtime.cjs`, dashboard shell listener | target normalization and event routing remain constrained to supported dashboard surfaces |
| display inventory query mapping | `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`, `frontend/src/main/surfaces/display_query_handler.cjs` | display payload normalization remains stable for renderer selection surfaces |

## Related Deep Dives

- [Frontend Protocol Errors Hub](../errors/README.md)
- [Frontend Protocol Validation Hub](../validation/README.md)
