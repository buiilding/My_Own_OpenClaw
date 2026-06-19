---
summary: "Electron main IPC helper-module split reference for websocket event processing, renderer-window fan-out, and query-local event broadcast boundaries."
read_when:
  - When changing `ipc.cjs` delegation into `ipc_runtime_helpers.cjs`, `ipc_query_runtime.cjs`, `ipc_conversation_status_runtime.cjs`, `ipc_workspace_path_runtime.cjs`, `ipc_transcript_session_sync.cjs`, `ipc_event_replay_state.cjs`, `ipc_overlay_phase_events.cjs`, `ipc_renderer_windows.cjs`, `ipc_query_broadcast.cjs`, or `ipc_settings_sync.cjs`.
  - When debugging renderer fan-out drift, overlay pre-capture hook timing, SDK local-user projection, or query send-failure synthesis.
  - When resolving stale references to removed `ipc_response_overlay_handlers.cjs` or `prime-response-overlay-awaiting`; pending user-turn preflight now uses `windie:pending-turn`.
title: "IPC Helper Module Split and Runtime Boundary Reference"
---

# IPC Helper Module Split and Runtime Boundary Reference

## Canonical Modules

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc/ipc_query_runtime.cjs`
- `frontend/src/main/ipc/ipc_conversation_status_runtime.cjs`
- `frontend/src/main/ipc/ipc_workspace_path_runtime.cjs`
- `frontend/src/main/ipc/ipc_query_send_runtime.cjs`
- `frontend/src/main/ipc/ipc_automated_query_dispatcher.cjs`
- `frontend/src/main/ipc/ipc_startup_state.cjs`
- `packages/windie-sdk-js/src/runtime/AgentClient.ts`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
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
- `frontend/src/main/ipc/ipc_agent_sdk_command_handlers.cjs`
- `frontend/src/main/ipc/ipc_desktop_ui_config.cjs`
- `frontend/src/main/ipc/ipc_artifact_handlers.cjs`
- `frontend/src/main/ipc/ipc_artifact_fetch.cjs`

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
- `uploadArtifact` HTTP form upload helper
- `processBackendMessageData` inbound event normalization:
  - session/user/conversation state updates
  - settings ACK resolution (`settings-updated` / `error` by id)
  - applies response-overlay transitions resolved by `ipc_overlay_phase_events.cjs`
  - typed backend side-channel fan-out through `ipc_backend_event_channels.cjs`

### `ipc_query_runtime.cjs`

Owns query payload shaping helpers used by renderer query sends and automated VM query dispatch:

- `prepareRendererQueryPayload` (attachment/memory toggle/conversation-ref normalization)
- `buildQueryPayload` (backend query field filtering + authenticated user/conversation identity)
- `prepareAutomatedQueryPayload` (automated query option normalization + validation)

### `ipc_conversation_status_runtime.cjs`

Owns SDK conversation terminal-event to renderer status projection:

- `buildConversationTerminalStatus` maps `turn_completed`, `turn_stopped`,
  `turn_error`, and `runtime_error` into renderer-facing phase/status objects.
- `resolveConversationStatusError` keeps SDK error payload interpretation out
  of the `ipc.cjs` relay root.

### `ipc_workspace_path_runtime.cjs`

Owns Agent SDK runtime workspace-path fallback resolution:

- `resolveWorkspacePathForAgentPayload` prefers command payload
  `workspace_path` / `workspacePath`, then cached desktop UI config
  `workspace_path` / `workspacePath`.
- `normalizeOptionalString` keeps the resolver's trim/null semantics testable
  outside the `ipc.cjs` relay root.

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
- loads cached desktop UI config and applies shortcut fallback defaults
- updates the global agent stop shortcut accelerator from cached config
- initializes global stop-shortcut enabled state from the current response-overlay phase
- treats disk-hydration failures as fail-open startup conditions

### `AgentClient.wakeUp(...)` and `agent.conversation(...)`

Own Agent SDK runtime lifecycle construction:

- resolves install identity from the install token and builds the authenticated
  SDK handshake
- starts/reuses the SDK local runtime and discovers executable local tools
- constructs the managed backend runtime once and exposes connection and command
  helpers through the agent plus projection helpers through the conversation
  runtime
- emits normalized conversation events and current-turn projections for Electron
  main to convert into renderer rows/status and forward
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
- `trackRendererWindow`: replays the latest pending renderer-composed user turn
  through `windie:pending-turn` when a secondary renderer mounts before SDK
  current-turn projection has replaced the optimistic row
- `broadcastToRenderers`: channel payload fan-out with optional source-window exclusion

### `ipc_query_broadcast.cjs`

Owns query-scope send-failure event fan-out:

- `broadcastQuerySendFailure`: builds an SDK `turn_error` conversation event
  from query failure context when SDK/backend send fails, fans it out to
  renderer windows, and resets phase to idle

### `ipc_query_events.cjs` (shape builder dependency)

Owns query-context and send-failure context constructors consumed by
`ipc_query_broadcast.cjs`:

- `resolveConversationRef`
- `buildQuerySendFailure`

SDK `ConversationRuntime.send(...)` owns `turn_started` and `user_message`
projection. Electron main must not synthesize a duplicate local user message.

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

### `ipc_desktop_ui_config.cjs`

Owns persisted desktop UI config disk I/O:

- `loadDesktopUiConfigFromDisk`
- `saveDesktopUiConfigToDisk` with tmp-write + rename replacement
- the persisted filename remains `frontend-config.json` for compatibility

### `ipc_desktop_ui_config_handlers.cjs`

Owns desktop UI config IPC handler registration while preserving the legacy
renderer wire channel names:

- `registerDesktopUiConfigHandlers`
- `load-frontend-config`
- `save-frontend-config`
- shortcut fallback application while keeping the latest config cache in
  `ipc.cjs` through injected getters/setters

### SDK-Shaped Conversation Commands

`ipc_agent_sdk_command_handlers.cjs` owns the strict `windie:invoke` command
allowlist and routes conversation commands such as `conversation.send` and
`conversation.stop` into the live SDK runtime. `ipc.cjs` registers the IPC
handler through `handleAgentSdkInvoke(...)` and injects Electron-main state,
settings gates, diagnostics, and Agent SDK runtime functions through generic
dependencies such as `ensureAgent`:

- backend connection gating
- initial settings sync waiting
- SDK query command send
- send-failure recovery
- stop-query phase completion
- global stop target resolution: latest SDK current turn first, latest pending
  turn second, active conversation fallback last
- pending-turn relay: renderer sends `windie:pending-turn` with
  `{ type: "pending", pendingTurn }`; main stores the latest normalized
  pending turn, broadcasts it to sibling renderers, replays it to late windows,
  and clears it on explicit `{ type: "clear" }`, matching SDK current-turn
  projection, or stop of the matching pending turn. Explicit clear filters use
  `conversationRef` and `turnRef`; removed snake_case filter fields are ignored
  instead of being treated as aliases.
- conversation metadata-list diagnostic context and event envelopes are built
  by `ipc_conversation_metadata_diagnostics_runtime.cjs`; command handlers
  choose lifecycle stages and call the helper rather than constructing
  diagnostic rows inline.

Removed preflight invoke path:

- `ipc_response_overlay_handlers.cjs` and `prime-response-overlay-awaiting` are
  no longer current runtime surfaces. Renderer send preflight is represented as
  a pending user turn in chat state and over `windie:pending-turn`; backend/SDK
  current-turn projection remains the authority for active response phases.

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

### SDK Command Forwarding

`ipc.cjs` forwards accepted SDK-shaped runtime commands through explicit
`Agent` and `ConversationRuntime` methods. It does not expose the retired
generic `to-backend` router or direct chat query IPC handlers.

## Delegation Flow in `ipc.cjs`

1. register/broadcast wiring delegates to `ipc_renderer_windows.cjs`.
2. websocket inbound messages append turn-scoped replay state before delegating event processing to `processBackendMessageData`.
3. query pre-capture delegates chatbox-only hook guard to `runBeforeOverlayQueryCapture`.
4. query optimistic/synthetic events delegate to `ipc_query_broadcast.cjs` with builders from `ipc_query_events.cjs` and seed replay state for late-window hydration.
5. query payload shaping delegates to `ipc_query_runtime.cjs`.
6. automated VM query dispatch delegates to `ipc_automated_query_dispatcher.cjs`.
7. startup install-auth/config/shortcut hydration delegates to `ipc_startup_state.cjs`.
8. SDK websocket runtime construction and backend event lifecycle delegate to
   `AgentClient.wakeUp(...)` and `agent.conversation(...)`.
9. backend endpoint candidate and active endpoint state delegates to
   `ipc_backend_endpoint_state.cjs`.
10. settings ACK, initial sync, and queued list-models state delegate to
   `ipc_settings_sync_runtime.cjs`.
11. conversation terminal status projection delegates to `ipc_conversation_status_runtime.cjs`.
12. Agent SDK runtime workspace-path fallback resolution delegates to `ipc_workspace_path_runtime.cjs`.
13. transcript-session-sync normalization and state updates delegate to `ipc_transcript_session_sync.cjs`.
14. desktop UI config load/save handlers delegate to `ipc_desktop_ui_config.cjs`.
15. SDK-shaped renderer commands are handled by the `windie:invoke` allowlist in
   `ipc.cjs` and dispatched to explicit Agent SDK runtime/conversation methods.
16. artifact upload/fetch handler registration delegates to
   `ipc_artifact_handlers.cjs`.

## Drift Hotspots

1. Duplicating overlay phase updates in `ipc.cjs` and `processBackendMessageData` can create inconsistent phase fan-out.
2. Bypassing `ipc_query_broadcast.cjs` for synthetic events can break sender-window exclusion behavior.
3. Changing SDK or Electron `filterBackendPayload(...)` allowlists without the
   generated backend contract check can leak unsupported payload keys or drop
   valid command fields.
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
- [Memory IPC and RPC Mapping Reference](../contracts/memory_ipc_and_rpc_mapping_reference.md)
