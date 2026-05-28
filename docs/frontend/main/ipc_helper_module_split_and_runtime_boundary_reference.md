---
summary: "Electron main IPC helper-module split reference for websocket event processing, renderer-window fan-out, and query-local event broadcast boundaries."
read_when:
  - When changing `ipc.cjs` delegation into `ipc_runtime_helpers.cjs`, `ipc_query_runtime.cjs`, `ipc_transcript_session_sync.cjs`, `ipc_event_replay_state.cjs`, `ipc_overlay_phase_events.cjs`, `ipc_renderer_windows.cjs`, `ipc_query_broadcast.cjs`, or `ipc_settings_sync.cjs`.
  - When debugging renderer fan-out drift, overlay pre-capture hook timing, or synthetic query/local-user message behavior.
title: "IPC Helper Module Split and Runtime Boundary Reference"
---

# IPC Helper Module Split and Runtime Boundary Reference

## Canonical Modules

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/ipc/ipc_automated_query_dispatcher.cjs`
- `frontend/src/main/ipc/ipc_startup_state.cjs`
- `packages/windie-sdk-js/src/runtime/WindieDesktopAgent.ts`
- `frontend/src/main/ipc/ipc_backend_endpoint_state.cjs`
- `frontend/src/main/ipc/ipc_transcript_session_sync.cjs`
- `frontend/src/main/ipc/ipc_event_replay_state.cjs`
- `frontend/src/main/ipc/ipc_overlay_phase_events.cjs`
- `frontend/src/main/ipc/ipc_overlay_phase_contract.cjs`
- `frontend/src/main/ipc/ipc_renderer_windows.cjs`
- `frontend/src/main/ipc/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/ipc/ipc_settings_sync.cjs`
- `frontend/src/main/ipc/ipc_settings_sync_runtime.cjs`
- `frontend/src/main/ipc/ipc_frontend_config.cjs`
- `frontend/src/main/ipc/ipc_artifact_handlers.cjs`
- `frontend/src/main/ipc/ipc_artifact_fetch.cjs`
- `frontend/src/main/ipc/ipc_openai_codex_oauth_handlers.cjs`
- `frontend/src/main/ipc/ipc_sdk_command_forwarding.cjs`
- `frontend/src/main/ipc/ipc_memory_store_persistence.cjs`

## Split Ownership Model

`ipc.cjs` remains relay composition wiring for:

- query relay wiring and overlay phase transition application
- handler registration (`ipcMain.handle/on`)
- shared connection/session state until the remaining relay root is split

Helper modules hold isolated runtime responsibilities.

## Runtime Helper Boundaries

### `ipc_runtime_helpers.cjs`

Owns cross-cutting utilities used by relay hot paths:

- `resolveRendererViewFromWebContents` and `runBeforeOverlayQueryCapture`
- `generateUserId` username sanitize + UUID fallback
- `normalizeBackendPayload` outbound backend-command cleanup through
  `ipc_backend_payload_contract.cjs` allowlists, plus display-only
  `screenshot_url` stripping for query/tool bundle result
- `uploadArtifact` HTTP form upload helper
- `processBackendMessageData` inbound event normalization:
  - session/user/conversation state updates
  - settings ACK resolution (`settings-updated` / `error` by id)
  - applies response-overlay transitions resolved by `ipc_overlay_phase_events.cjs`
  - renderer fan-out to `from-backend`

### `ipc_query_runtime.cjs`

Owns query payload shaping helpers used by renderer query sends and automated VM query dispatch:

- `prepareRendererQueryPayload` (attachment/memory toggle/conversation-ref normalization)
- `buildQueryPayload` (context-type/user-id derivation + `buildQueryPayloadContent` composition)
- `prepareAutomatedQueryPayload` (automated query option normalization + validation)

### `ipc_automated_query_dispatcher.cjs`

Owns VM automated-query dispatch orchestration:

- validates assigned-run query options through `prepareAutomatedQueryPayload`
- connects the managed backend session for `automated-query`
- waits for initial settings sync and any pending settings ACK
- builds the enriched query payload through `buildQueryPayload`
- attaches agent-definition context
- sends the SDK runtime `query` command and advances conversation/first-query state through injected setters

### `ipc_startup_state.cjs`

Owns IPC startup state hydration:

- loads cached install auth and applies it to main-process install/user state
- loads cached frontend config and applies shortcut fallback defaults
- updates the global agent stop shortcut accelerator from cached config
- initializes global stop-shortcut enabled state from the current response-overlay phase
- treats disk-hydration failures as fail-open startup conditions

### `WindieAgent.startDesktop(...)`

Owns Windie SDK runtime lifecycle construction:

- resolves install identity from the install token and builds the authenticated
  SDK handshake
- starts/reuses the local sidecar runtime and discovers executable local tools
- constructs the managed backend runtime once and exposes connection, command,
  projection, and close helpers
- emits SDK rows, normalized conversation events, current-turn projections,
  status, connection, traffic, and fallback events for Electron main to forward
- emits interrupted active-query events when the backend closes during an active loop phase

### `ipc_backend_endpoint_state.cjs`

Owns backend endpoint candidate state:

- initializes from the default endpoint resolver
- refreshes dev/customer/packaged endpoint candidates
- tracks the active endpoint index
- advances to fallback candidates
- exposes current websocket/http URLs for IPC status, artifact helpers, and SDK runtime construction

### `ipc_transcript_session_sync.cjs`

Owns transcript sync payload normalization and next-state derivation:

- `normalizeTranscriptSessionSyncPayload` (alias-key support + trim/null semantics)
- `applyTranscriptSessionSync` (state advance + sibling-window broadcast)

### `ipc_event_replay_state.cjs`

Owns turn-scoped replay buffer primitives used for late renderer mount recovery:

- `createIpcEventReplayState(maxEvents=240)`
- `startTurn(turnRef, seedEvent)` optimistic turn seed
- `appendForActiveTurn` turn-id-gated replay collection
- `snapshot`/`clear` replay lifecycle helpers

### `ipc_overlay_phase_events.cjs`

Owns backend-event to response-overlay transition contract:

- `resolveOverlayCorrelationId`: deterministic id precedence (`request_id` -> `correlation_id` -> `bundle_id` -> event `id`)
- `resolveOverlayPhaseMetadata`: normalized recovery metadata extraction (`attempt`, `max_attempts`, `failure_reason`, `recovery_stage`)
- `resolveBackendOverlayPhaseTransition`: canonical transition mapping for `streaming-response`, `tool-call`, `tool-bundle`, `tool-output`, `streaming-complete`, and phase-guarded `error`

### `ipc_overlay_phase_contract.cjs`

Owns shared overlay phase contract primitives used by both state and event mappers:

- canonical phase set (`RESPONSE_OVERLAY_PHASES`)
- canonical metadata keys (`RESPONSE_OVERLAY_METADATA_KEYS`)
- shared scalar normalizers (`normalizeOverlayString`, `normalizeOverlayNumber`)

### `ipc_renderer_windows.cjs`

Owns renderer-window lifecycle and generic fan-out:

- `trackRendererWindow`: register + prune windows, sync current overlay phase after load
- `trackRendererWindow`: optionally replays buffered in-flight turn events to late windows (`getReplayEvents`)
- `broadcastToRenderers`: channel payload fan-out with optional source-window exclusion

### `ipc_query_broadcast.cjs`

Owns query-scope synthetic event fan-out:

- `broadcastLocalUserMessage`: emits `local-user-message` only when builder returns payload
- `broadcastQuerySendFailure`: emits synthetic `error` event when backend send fails and resets phase to idle

### `ipc_query_events.cjs` (shape builder dependency)

Owns query-context and synthetic envelope constructors consumed by `ipc_query_broadcast.cjs`:

- `resolveConversationRef`
- `buildLocalUserMessage`
- `buildQuerySendFailure`

### `ipc_settings_sync.cjs`

Owns settings ACK gate primitives used by `ipc.cjs`:

- `isValidConfigPayload`
- `waitForSettingsAck`
- `resolveSettingsSync`
- `clearPendingSettingsSyncs`

### `ipc_settings_sync_runtime.cjs`

Owns settings-sync state and command orchestration:

- pending settings ACK map lifecycle
- initial settings sync attempt gating
- renderer/update-settings backend command send
- queued list-models request state and flush after backend open
- backend settings payload filtering for local-only config keys

### `ipc_frontend_config.cjs`

Owns persisted frontend-config disk I/O:

- `loadFrontendConfigFromDisk`
- `saveFrontendConfigToDisk` with tmp-write + rename replacement

### `ipc_frontend_config_handlers.cjs`

Owns frontend-config IPC handler registration:

- `load-frontend-config`
- `save-frontend-config`
- shortcut fallback application while keeping the latest config cache in
  `ipc.cjs` through injected getters/setters

### `ipc_chat_query_handlers.cjs`

Owns typed chat query IPC handler orchestration:

- `windie:send`
- `windie:stop`
- backend connection gating, initial settings sync waiting, SDK query command
  send, send-failure recovery, and stop-query phase completion

### `ipc_response_overlay_handlers.cjs`

Owns response-overlay preflight IPC handler registration:

- `prime-response-overlay-awaiting`
- active-loop phase guard before moving the response overlay into
  `awaiting-first-chunk`

### `ipc_artifact_handlers.cjs`

Owns artifact IPC handler registration:

- `upload-artifact`
- `fetch-artifact-image`
- upload requests receive the current backend HTTP URL and install-auth headers
- protected image fetches refresh install auth before calling
  `ipc_artifact_fetch.cjs`
- fetch errors are returned as structured `{ success: false, error }` payloads

### `ipc_artifact_fetch.cjs`

Owns protected artifact image fetch helpers:

- artifact id inference from canonical artifact URLs
- backend artifact URL construction
- authenticated artifact byte fetch and `data:image/...;base64,...` conversion

### `ipc_openai_codex_oauth_handlers.cjs`

Owns OpenAI Codex OAuth IPC handler registration:

- `openai-codex-oauth-login`
- `openai-codex-oauth-logout`
- browser-launch dependency injection into `loginOpenAICodexOAuth`
- normalized success/failure payloads for renderer settings surfaces

### `ipc_sdk_command_forwarding.cjs`

Owns remaining generic `to-backend` command forwarding:

- rejects chat `query` and `stop-query` payloads so live turns use typed IPC
- routes `update-settings` through the settings sync sender
- queues `list-models` until the managed backend session is connected
- forwards `rehydrate` payloads unchanged after connection/settings gates; query
  and automated-query paths own agent-definition enrichment
- waits for initial settings sync before commands that require backend settings
- forwards accepted SDK runtime commands through explicit SDK desktop agent methods

### `ipc_memory_store_persistence.cjs`

Owns backend `memory-store` event side effect persistence:

- payload-first mapping into `storeMemory(...)` shape
- identity/session fallback (`payload` -> envelope `session_id` -> `conversation_ref`)
- fail-open async write (`void ...catch`) with debug log on rejection

This isolates persistence to main process once per backend event before renderer fan-out.

## Delegation Flow in `ipc.cjs`

1. register/broadcast wiring delegates to `ipc_renderer_windows.cjs`.
2. websocket inbound messages append turn-scoped replay state before delegating event processing to `processBackendMessageData`.
3. query pre-capture delegates chatbox-only hook guard to `runBeforeOverlayQueryCapture`.
4. query optimistic/synthetic events delegate to `ipc_query_broadcast.cjs` with builders from `ipc_query_events.cjs` and seed replay state for late-window hydration.
5. query payload shaping delegates to `ipc_query_runtime.cjs`.
6. automated VM query dispatch delegates to `ipc_automated_query_dispatcher.cjs`.
7. startup install-auth/config/shortcut hydration delegates to `ipc_startup_state.cjs`.
8. SDK websocket runtime construction and backend event lifecycle delegate to
   `WindieAgent.startDesktop(...)`.
9. backend endpoint candidate and active endpoint state delegates to
   `ipc_backend_endpoint_state.cjs`.
10. settings ACK, initial sync, and queued list-models state delegate to
   `ipc_settings_sync_runtime.cjs`.
11. transcript-session-sync normalization and state updates delegate to `ipc_transcript_session_sync.cjs`.
12. frontend config load/save handlers delegate to `ipc_frontend_config.cjs`.
13. remaining non-chat `to-backend` command forwarding delegates to
   `ipc_sdk_command_forwarding.cjs`.
14. artifact upload/fetch handler registration delegates to
   `ipc_artifact_handlers.cjs`.
15. OpenAI Codex OAuth login/logout handler registration delegates to
    `ipc_openai_codex_oauth_handlers.cjs`.

## Drift Hotspots

1. Duplicating overlay phase updates in `ipc.cjs` and `processBackendMessageData` can create inconsistent phase fan-out.
2. Bypassing `ipc_query_broadcast.cjs` for synthetic events can break sender-window exclusion behavior.
3. Changing `normalizeBackendPayload` allowlists without the generated backend
   contract check can leak unsupported payload keys or drop valid command fields.
4. Mutating query-context envelope shape in broadcasters without matching `ipc_query_events.cjs` updates can desync renderer expectations.
5. Changing replay turn gating (`appendForActiveTurn`) can replay stale-turn packets into newly registered windows.
6. Duplicating transcript-session normalization logic outside `ipc_transcript_session_sync.cjs` can desync alias/null handling between channels.

## Related Pages

- [Frontend Main Docs Hub](README.md)
- [Electron Main and IPC](electron_main_and_ipc.md)
- [IPC Event Replay and Transcript Session Sync Reference](ipc_event_replay_and_transcript_session_sync_reference.md)
- [IPC Query Runtime and Transcript Sync Helper Reference](ipc_query_runtime_and_transcript_sync_helper_reference.md)
- [Query Payload and Relay Reference](query_payload_and_relay_reference.md)
- [WebSocket Handshake and Settings Sync Reference](websocket_handshake_and_settings_sync_reference.md)
- [IPC Memory-Store Event Persistence Payload Fallback and Fail-Open Logging Contract Reference](ipc_memory_store_event_persistence_payload_fallback_and_fail_open_logging_contract_reference.md)
