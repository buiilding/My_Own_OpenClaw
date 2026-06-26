---
summary: "Electron main IPC helper-module split reference for websocket event processing, renderer-window fan-out, and query-local event broadcast boundaries."
read_when:
  - When changing `ipc.cjs` delegation into `ipc_runtime_helpers.cjs`, `ipc_query_runtime.cjs`, `ipc_conversation_status_runtime.cjs`, `ipc_workspace_path_runtime.cjs`, `ipc_direct_wake_up_agent_adapter.cjs`, `ipc_direct_wake_up_agent_adapter_deps.cjs`, `ipc_transcript_session_sync.cjs`, `ipc_event_replay_state.cjs`, `ipc_conversation_event_projection.cjs`, `ipc_overlay_phase_events.cjs`, `ipc_response_overlay_phase_runtime.cjs`, `ipc_host_runtime_config.cjs`, `ipc_host_copy_runtime.cjs`, `ipc_host_option_state.cjs`, `ipc_initialization_runtime.cjs`, `ipc_app_diagnostics_runtime.cjs`, `ipc_renderer_windows.cjs`, `ipc_image_interaction_handlers.cjs`, `ipc_process_reset_runtime.cjs`, `ipc_query_broadcast.cjs`, `ipc_settings_sync.cjs`, `ipc_desktop_ui_config_store.cjs`, `ipc_live_turn_state.cjs`, `ipc_global_stop_shortcut_config_runtime.cjs`, `ipc_main_process_trace_runtime.cjs`, `ipc_mcp_refresh_runtime.cjs`, `ipc_agent_connection_events.cjs`, `ipc_agent_backend_close_runtime.cjs`, `ipc_agent_backend_event_runtime.cjs`, `ipc_active_query_context.cjs`, `ipc_backend_session_state.cjs`, `ipc_backend_connection_gate_state.cjs`, `ipc_runtime_conversation_ref.cjs`, `ipc_agent_client_lifecycle.cjs`, `ipc_electron_agent_client_factory.cjs`, `ipc_agent_wakeup_runtime.cjs`, `ipc_agent_runtime_lifecycle.cjs`, `ipc_agent_sdk_runtime_commands.cjs`, `ipc_backend_message_observers.cjs`, `ipc_status_payloads.cjs`, `ipc_session_context_runtime.cjs`, `ipc_install_auth_context_runtime.cjs`, or `ipc_install_auth_identity_runtime.cjs`.
  - When changing `ipc_desktop_host_os_runtime.cjs`, the shared host OS resolver consumed by install registration and agent-definition runtime metadata.
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
- `frontend/src/main/ipc/ipc_chat_query_handlers.cjs`
- `frontend/src/main/ipc/ipc_automated_query_dispatcher.cjs`
- `frontend/src/main/ipc/ipc_startup_state.cjs`
- `frontend/src/main/ipc/ipc_install_auth_runtime.cjs`
- `frontend/src/main/ipc/ipc_direct_wake_up_agent_adapter.cjs`
- `frontend/src/main/ipc/ipc_direct_wake_up_agent_adapter_deps.cjs`
- `frontend/src/main/ipc/ipc_agent_definition_context.cjs`
- `frontend/src/main/ipc/ipc_desktop_host_os_runtime.cjs`
- `packages/windie-sdk-js/src/runtime/AgentClient.ts`
- `packages/windie-sdk-js/src/runtime/ConversationRuntime.ts`
- `frontend/src/main/ipc/ipc_backend_endpoint_state.cjs`
- `frontend/src/main/ipc/ipc_client_session_handlers.cjs`
- `frontend/src/main/ipc/ipc_renderer_diagnostics_handlers.cjs`
- `frontend/src/main/ipc/ipc_pending_turn_handlers.cjs`
- `frontend/src/main/ipc/ipc_live_turn_state.cjs`
- `frontend/src/main/ipc/ipc_stop_target_runtime.cjs`
- `frontend/src/main/ipc/ipc_transcript_session_sync.cjs`
- `frontend/src/main/ipc/ipc_event_replay_state.cjs`
- `frontend/src/main/ipc/ipc_conversation_event_projection.cjs`
- `frontend/src/main/ipc/ipc_overlay_phase_events.cjs`
- `frontend/src/main/ipc/ipc_overlay_phase_contract.cjs`
- `frontend/src/main/ipc/ipc_response_overlay_phase_runtime.cjs`
- `frontend/src/main/ipc/ipc_host_runtime_config.cjs`
- `frontend/src/main/ipc/ipc_host_copy_runtime.cjs`
- `frontend/src/main/ipc/ipc_host_option_state.cjs`
- `frontend/src/main/ipc/ipc_initialization_runtime.cjs`
- `frontend/src/main/ipc/ipc_app_diagnostics_runtime.cjs`
- `frontend/src/main/ipc/ipc_renderer_windows.cjs`
- `frontend/src/main/ipc/ipc_image_interaction_handlers.cjs`
- `frontend/src/main/ipc/ipc_process_reset_runtime.cjs`
- `frontend/src/main/ipc/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/ipc/ipc_settings_sync.cjs`
- `frontend/src/main/ipc/ipc_settings_sync_runtime.cjs`
- `frontend/src/main/ipc/ipc_agent_sdk_command_handlers.cjs`
- `frontend/src/main/ipc/ipc_desktop_ui_config.cjs`
- `frontend/src/main/ipc/ipc_desktop_ui_config_store.cjs`
- `frontend/src/main/ipc/ipc_global_stop_shortcut_config_runtime.cjs`
- `frontend/src/main/ipc/ipc_main_process_trace_runtime.cjs`
- `frontend/src/main/ipc/ipc_mcp_refresh_runtime.cjs`
- `frontend/src/main/ipc/ipc_agent_connection_events.cjs`
- `frontend/src/main/ipc/ipc_agent_backend_close_runtime.cjs`
- `frontend/src/main/ipc/ipc_agent_backend_event_runtime.cjs`
- `frontend/src/main/ipc/ipc_active_query_context.cjs`
- `frontend/src/main/ipc/ipc_backend_session_state.cjs`
- `frontend/src/main/ipc/ipc_backend_connection_gate_state.cjs`
- `frontend/src/main/ipc/ipc_runtime_conversation_ref.cjs`
- `frontend/src/main/ipc/ipc_agent_client_lifecycle.cjs`
- `frontend/src/main/ipc/ipc_electron_agent_client_factory.cjs`
- `frontend/src/main/ipc/ipc_agent_wakeup_runtime.cjs`
- `frontend/src/main/ipc/ipc_agent_runtime_lifecycle.cjs`
- `frontend/src/main/ipc/ipc_agent_sdk_runtime_commands.cjs`
- `frontend/src/main/ipc/ipc_backend_message_observers.cjs`
- `frontend/src/main/ipc/ipc_status_payloads.cjs`
- `frontend/src/main/ipc/ipc_session_context_runtime.cjs`
- `frontend/src/main/ipc/ipc_install_auth_context_runtime.cjs`
- `frontend/src/main/ipc/ipc_install_auth_identity_runtime.cjs`
- `frontend/src/main/ipc/ipc_extension_mcp_handlers.cjs`
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
- `buildRendererBackendQueryPayloadWithAgentDefinition` (agent-definition
  context attachment plus SDK turn resource/metadata preservation for renderer
  query sends)
- `prepareAutomatedQueryPayload` (automated query option normalization + validation)

### `ipc_chat_query_handlers.cjs`

Owns renderer chat query and stop handler construction:

- exposes `createChatQueryHandlerRuntime(...)` so `ipc.cjs` composes query
  state, Agent SDK command, settings, artifact URL, trace, display, and
  send-failure dependencies once
- keeps the lower-level chat query handler factory private to the runtime helper
- uses `ipc_query_send_runtime.cjs` through `createRendererQuerySendRuntime(...)`
  so query preparation and send-failure execution stay behind a composed
  dependency facade
- accepts per-initialization window lookup and overlay pre-capture callbacks
  from `initializeIpc(...)`
- keeps renderer chat send/stop orchestration behind the SDK-shaped
  `windie:invoke` command handler
- waits for initial settings sync and any pending settings ACK before attaching
  query-level agent-definition context, so restart-hydrated Agent settings are
  visible to the first renderer chat turn sent through Electron main

### `ipc_conversation_status_runtime.cjs`

Owns SDK conversation terminal-event to renderer status projection:

- `buildConversationTerminalStatus` maps `turn_completed`, `turn_stopped`,
  `turn_error`, and `runtime_error` into renderer-facing phase/status objects.
- keeps SDK error payload interpretation private inside the terminal-status
  projection instead of exposing a lower-level error helper.

### `ipc_workspace_path_runtime.cjs`

Owns Agent SDK runtime workspace-path fallback resolution:

- exposes `createWorkspacePathRuntime(...)` so `ipc.cjs` composes the cached
  desktop UI config reader once
- keeps workspace-path resolution private behind the runtime facade; resolution
  prefers command payload
  `workspace_path` / `workspacePath`, then cached desktop UI config
  `workspace_path` / `workspacePath`.
- keeps trim/null normalization private behind the workspace-path runtime
  instead of exposing lower-level string or resolver helpers.

### `ipc_automated_query_dispatcher.cjs`

Owns VM automated-query dispatch orchestration:

- exposes `createAutomatedQueryRuntime(...)` so `ipc.cjs` composes VM worker
  query dispatch dependencies once and exports `sendAutomatedQuery(...)` as a
  thin runtime call
- keeps the lower-level automated-query dispatcher private to the runtime
  helper
- validates assigned-run query options through `prepareAutomatedQueryPayload`
- connects the SDK managed hosted session for `automated-query`
- waits for initial settings sync and any pending settings ACK
- builds the enriched query payload through `buildQueryPayload`
- attaches agent-definition context
- sends the SDK runtime `query` command and advances conversation/first-query state through injected setters

### `ipc_startup_state.cjs`

Owns IPC startup state hydration:

- exposes `createIpcStartupStateRuntime(...)` so `ipc.cjs` composes install
  auth, cached config, shortcut fallback, MCP startup refresh, overlay phase,
  and initialize-time shortcut setter dependencies once
- keeps the lower-level startup-state initializer private behind the runtime
  facade
- loads cached install auth and applies it to main-process install/user state
- loads cached desktop UI config and applies shortcut fallback defaults
- updates the global agent stop shortcut accelerator from cached config
- initializes global stop-shortcut enabled state from the current response-overlay phase
- treats disk-hydration failures as fail-open startup conditions

### `ipc_initialization_runtime.cjs`

Owns initialize-time IPC orchestration:

- `createIpcInitializationRuntime`: composes endpoint refresh, host option
  application, renderer-window reset/track, startup hydration, handler
  registration, chat query handler creation, and SDK invoke registration once
  for `ipc.cjs`
- preserves handler registration order for desktop UI config, extension MCP,
  client session, artifacts, image interactions, renderer diagnostics,
  pending-turn, and SDK invoke handlers
- derives per-window lookup from `initializeIpc(...)` options and supplies the
  overlay pre-capture callback from host option state

### `ipc_install_auth_runtime.cjs`

Owns Electron main install-auth runtime orchestration:

- builds bearer headers from the current install token
- shares one pending install-auth ensure operation across concurrent callers
- validates cached disk install auth against backend endpoint candidates
- clears backend-rejected cached tokens before fresh install registration
- registers fresh installs against endpoint candidates and activates the
  winning backend endpoint
- maps host platform names into install registration operating-system metadata

### `ipc_desktop_host_os_runtime.cjs`

Owns shared host operating-system display names used in Electron main
runtime payloads:

- maps Node platform ids (`darwin`, `win32`, `linux`) into the host OS names
  sent to hosted install registration and SDK agent-definition runtime metadata
- preserves unknown non-empty platform strings and returns `null` for empty
  inputs
- keeps install-auth and agent-definition context from exporting duplicate OS
  normalization helpers

### `ipc_install_auth_context_runtime.cjs`

Owns Electron-main install-auth context composition:

- composes install-auth identity normalization with cached/fresh install
  registration orchestration
- exposes current user identity, SDK `installAuth` option shaping, bearer
  headers, and install-state ensure helpers through one main-process context
- keeps `ipc.cjs` from coordinating `ipc_install_auth_identity_runtime.cjs` and
  `ipc_install_auth_runtime.cjs` directly
- resets identity and pending install-auth state through the same context used
  by test shutdown and reconnect cleanup

### `AgentClient.wakeUp(...)` and `agent.conversation(...)`

Own Agent SDK runtime lifecycle construction:

- resolves install identity from the install token and builds the authenticated
  SDK handshake
- starts/reuses the SDK local runtime and discovers executable local tools
- constructs the managed hosted-backend runtime once and exposes connection and
  command helpers through the agent plus projection helpers through the
  conversation runtime
- emits normalized conversation events and current-turn projections for Electron
  main to convert into renderer rows/status and forward
- emits interrupted active-query events when the backend closes during an active loop phase

### `ipc_electron_agent_client_factory.cjs`

Owns Electron-main `AgentClient` constructor option shaping:

- exposes `createElectronAgentClientFactoryRuntime(...)` so `ipc.cjs` composes
  backend endpoints, host websocket options, desktop local-runtime launch
  config, lifecycle callbacks, timeout policy, test mode, and logging once
- keeps lower-level `AgentClient` construction, managed endpoint shaping, and
  local-runtime option building private behind the runtime facade
- maps backend endpoint state into SDK managed backend endpoint options
- builds SDK `autoLocalRuntime` options from desktop launch config, backend HTTP
  URL, user-data root, and optional host websocket implementation
- disables auto local-runtime startup in tests through SDK client options
- attaches backend lifecycle callbacks supplied by `ipc.cjs` while install-auth
  context is composed by `ipc_install_auth_context_runtime.cjs`

### `ipc_agent_client_lifecycle.cjs`

Owns Electron-main `AgentClient` instance lifecycle:

- lazily creates the `AgentClient` through the injected factory
- emits the first-use `client_initialized` main-runtime log
- exposes the initialized client without forcing construction for local-runtime
  discovery
- forwards `shutdownLocalRuntime()` during test shutdown and clears the cached
  client instance
- exposes `createAgentClientLifecycleRuntime(...)` so `ipc.cjs` wires the
  AgentClient cache lifecycle as an explicit runtime helper

### `ipc_agent_wakeup_runtime.cjs`

Owns Electron-main Agent SDK wake-up orchestration:

- exposes `createAgentWakeupRuntime(...)` so `ipc.cjs` composes install auth,
  workspace fallback, AgentClient access, MCP config, local-tool lifecycle,
  direct wake-up adapter dependencies, diagnostics, and logging once
- keeps the lower-level Agent SDK wake-up function private behind the runtime
  facade
- ensures install-auth state exists before wake-up
- resolves explicit or cached workspace paths for the agent runtime
- assembles `AgentClient.wakeUp(...)` options, including host skin agent name,
  test-mode builtins/MCP/memory/persistence disabling, and local tool lifecycle
- constructs the direct wake-up adapter and records wake-up diagnostics

### `ipc_agent_runtime_lifecycle.cjs`

Owns Electron-main active Agent SDK adapter lifecycle state:

- exposes `createAgentRuntimeLifecycleRuntime(...)` so `ipc.cjs` wires active
  Agent SDK adapter lifecycle as an explicit runtime helper
- shares one pending wake-up operation across concurrent callers
- caches and returns the active direct wake-up adapter after startup
- forwards backend traffic and idle-sync notifications into the active adapter
- resolves the known SDK local runtime from the initialized client or active
  adapter fallback
- routes `AgentClient.localRuntime(...)` ensure calls with start/ready/failure
  logging
- routes active adapter `ensureConnected(...)` calls, including
  `ensureCurrentBackendConnection(...)` composition for current conversation-ref
  lookup and default connect timeout
- resets active adapter state for tests and closes the adapter when requested

### `ipc_agent_sdk_runtime_commands.cjs`

Owns Electron-main Agent SDK command execution helpers:

- exposes `createAgentSdkRuntimeCommandsRuntime(...)` so `ipc.cjs` wires SDK
  command execution as an explicit runtime helper
- sends renderer chat payloads through `agent.run(...)` while separating
  resources and metadata from the SDK runtime command payload
- stops active turns through the active adapter and clears pending-turn state
  before dispatch
- routes settings updates, model-list requests, and wakeword-detected events
  through ensured Agent SDK adapters
- converts query dispatch failures into the historical logged `null` result for
  renderer send handling

### `ipc_agent_backend_event_runtime.cjs`

Owns Agent SDK backend event relay bookkeeping:

- exposes `createAgentBackendEventRuntime(...)` so `ipc.cjs` composes active
  query state, event replay, backend traffic, observer fan-out, message
  processing, response-overlay, session setters, trace, renderer broadcast,
  settings ACK, and logging dependencies once
- marks the active query context accepted when `query-accepted` matches the
  active turn
- keeps the lower-level backend-event relay handler private to the runtime
  helper
- keeps active-turn matching and terminal-event classification private to the
  runtime owner while tests exercise those paths through the composed facade
- appends inbound events to turn-scoped replay before processing
- forwards backend traffic labels and backend-message observer notifications
- delegates payload handling into `processBackendMessageData(...)` with injected
  host setters
- clears active query context and replay state when a matching terminal
  `streaming-complete` or `error` arrives

### `ipc_image_interaction_handlers.cjs`

Owns image IPC registration shared by clipboard copy and native image context
menu handlers:

- exposes `createImageInteractionHandlersRuntime(...)` so `ipc.cjs` composes
  Electron primitives, backend URL, and endpoint-candidate callbacks once
- keeps aggregate image interaction registration private behind the runtime
  facade and owns both `copy-image-to-clipboard` and
  `show-image-context-menu` IPC handler registration
- clipboard image copy execution stays behind `createClipboardImageRuntime(...)`
  so direct IPC copy and context-menu copy share the same trusted artifact
  policy boundary
- native image context menu behavior stays behind
  `createImageContextMenuRuntime(...)`, with structured IPC failure payloads
  produced by the aggregate image interaction owner
- builds the trusted backend artifact-origin callback from the active backend
  HTTP URL plus endpoint candidates
- registers `copy-image-to-clipboard` and `show-image-context-menu` with the
  same origin policy
- keeps Electron primitives (`Menu`, `BrowserWindow`, `clipboard`,
  `nativeImage`) injected from the main-process host boundary

### `ipc_process_reset_runtime.cjs`

Owns IPC process reset orchestration used by reconnect and test cleanup paths:

- resets settings-sync state, backend session identity, live-turn caches, and
  trace caches as grouped runtime operations
- preserves test shutdown cleanup order for the renderer-window runtime,
  backend-message observers, install auth, connection gate, MCP refresh,
  pending turns, cached AgentClient lifecycle, and active Agent SDK adapter
- keeps idempotent duplicate resets explicit in one helper instead of
  scattering reset checklists through `ipc.cjs`

### `ipc_active_query_context.cjs`

Owns active query context state for Electron main query/close coordination:

- stores the current query context created by query send
- exposes get/set accessors for backend event accepted/terminal mutation and
  backend close interruption lookup
- clears state for terminal events, backend close interruption handling, and
  test reset
- keeps mutable active-query storage out of the `ipc.cjs` relay root

### `ipc_backend_session_state.cjs`

Owns Electron-main cached backend session identity:

- stores the latest backend `session_id`, server-echoed `user_id`, and
  `conversation_ref`
- exposes individual getters/setters for connection, backend-event, close,
  query, stop-target, status, install-auth, and renderer-window replay wiring
- exposes a snapshot with the legacy main-process field names
  `currentSessionId`, `currentServerUserId`, and `currentConversationRef`
- resets all backend session identity on reconnect close and test shutdown
- keeps backend session identity storage out of the `ipc.cjs` relay root while
  preserving client user/install-auth state in their existing owners

### `ipc_backend_connection_gate_state.cjs`

Owns Electron-main backend connection and first-query gate state:

- stores the current backend transport connected flag
- stores whether the next query should use initial-query context and wait for
  initial settings synchronization
- resets to disconnected/first-query defaults during test reset
- receives open/close updates from `ipc_agent_connection_events.cjs` and
  `ipc_agent_backend_close_runtime.cjs`
- keeps connection/query-gate storage out of the `ipc.cjs` relay root while
  preserving settings ACK semantics in `ipc_settings_sync_runtime.cjs`

### `ipc_runtime_conversation_ref.cjs`

Owns Agent SDK runtime conversation-ref resolution at the Electron main
boundary:

- exposes `createRuntimeConversationRefRuntime(...)` so `ipc.cjs` composes the
  current conversation fallback reader once
- keeps conversation-ref resolution private behind the runtime facade; it
  prefers nested transport `payload.conversation_ref`
- falls back to direct `conversation_ref` and `conversationRef` aliases used by
  SDK runtime command/replay paths
- uses the cached current conversation ref only when the input has no explicit
  conversation identity
- keeps trim/null normalization private behind the conversation-ref runtime

### `ipc_backend_message_observers.cjs`

Owns backend-message observer registration and fan-out for Electron main:

- keeps observer storage out of the IPC relay root
- ignores non-object backend event payloads
- isolates observer exceptions and logs them without stopping remaining fan-out
- returns unsubscribe callbacks and clears observer state during test shutdown

### `ipc_status_payloads.cjs`

Owns Electron-main status payload shaping:

- builds renderer `ipc-status` payloads with connection state, current user,
  runtime websocket/http URLs, and global stop shortcut status
- broadcasts renderer `ipc-status` updates through the injected renderer-window
  fan-out callback and the helper-owned status channel default
- builds client-session snapshots with current user, server user, session,
  conversation, connection, and shortcut status fields
- builds exported backend connection snapshots with backend URL aliases used by
  main-process callers
- keeps endpoint/status field naming and renderer status channel selection in
  one helper while `ipc.cjs` supplies live host state and renderer fan-out

### `ipc_session_context_runtime.cjs`

Owns Electron-main client/backend session context snapshots:

- composes backend session identity, current install-auth user identity,
  connection gate state, first-query state, and active Agent SDK adapter lookup
  into named snapshots
- exposes status, query, and SDK-invoke state readers consumed by focused IPC
  runtimes
- applies transcript-session sync state back to the backend session and
  install-auth context owners
- keeps repeated session snapshot shape decisions out of the `ipc.cjs` relay
  root

### `ipc_install_auth_identity_runtime.cjs`

Owns Electron-main install-auth identity state and shaping:

- stores the current install token, install id, and client user id
- normalizes and trims install token, user id, and install id values before
  applying them to owned main-process host state
- keeps install-auth identity normalization private behind the identity runtime
- initializes the server-user fallback in `ipc_backend_session_state.cjs` only
  when the backend has not supplied a server user id yet
- exposes the current install-auth state to `ipc_install_auth_runtime.cjs`
- exposes current-user accessors for status, connection, backend close, query,
  SDK command, automated-query, and transcript-session-sync wiring
- builds the SDK wake-up `installAuth` option with `autoRegister: false`

### `ipc_direct_wake_up_agent_adapter.cjs`

Owns the Electron-main adapter around a direct `AgentClient.wakeUp(...)` result:

- creates and caches `agent.conversation(...)` runtime handles by conversation
  ref
- subscribes to SDK conversation events and forwards renderer status,
  conversation-event, memory-store, rows, and current-turn channels
- clears renderer pending-turn state when SDK current-turn projection catches
  up to the pending row
- rehydrates stored conversation context before sends, compaction, edit, and
  retry paths that need backend inference context
- invalidates and reloads conversation snapshots after replay/rewrite/append
  commands
- closes selected runtime handles on conversation delete and all runtime
  handles on clear/adapter close
- rejects removed `conversation_ref` aliases for SDK library methods such as
  conversation load/delete/replay/edit/retry while leaving backend-transport
  send/stop/rehydrate/compact commands on canonical snake_case payload fields
- keeps SDK library conversation-ref command resolution private inside the
  adapter so callers exercise alias rejection through adapter methods
- refreshes MCP servers through the SDK local runtime with injected host client
  identity

### `ipc_direct_wake_up_agent_adapter_deps.cjs`

Owns Electron-main dependency construction for the direct wake-up adapter:

- builds the renderer broadcast, conversation-ref, current-turn, pending-turn,
  trace, terminal-status, workspace, backend-event, MCP refresh, and MCP client
  identity dependency map consumed by `ipc_direct_wake_up_agent_adapter.cjs`
- keeps `startAgent(...)` focused on Agent SDK wake-up orchestration instead of
  carrying adapter fan-out wiring inline
- preserves host-owned callbacks as injected dependencies so the adapter remains
  testable without importing `ipc.cjs`

### `ipc_agent_definition_context.cjs`

Owns Electron-main query-level agent-definition context attachment:

- exposes `createAgentDefinitionContextRuntime(...)` so `ipc.cjs` composes the
  latest config reader, platform name, SDK builder, and default-definition
  predicate once
- keeps lower-level context attachment and merge helpers private behind the
  runtime facade
- reads the Agent settings system prompt and disabled/enabled tool policy from
  cached desktop UI config, deriving remote-tool enablement while leaving
  generic tool-list canonicalization to the SDK agent-definition builder
- resolves workspace `AGENTS.md` prompt layers for the query workspace
- loads extension prompt layers once before calling
  `buildElectronAgentDefinitionInputs(...)`
- attaches host OS and workspace facts to SDK builder inputs
- merges generated Electron context with a renderer-supplied
  `agent_definition` without replacing generated arrays accidentally

### `ipc_backend_endpoint_state.cjs`

Owns backend endpoint candidate state:

- exposes `createBackendEndpointRuntime(...)` so `ipc.cjs` composes hosted
  backend configuration, endpoint candidate resolution, and refresh behavior once
- initializes from the default endpoint resolver
- refreshes dev/customer/packaged endpoint candidates
- tracks the active endpoint index
- advances to fallback candidates
- exposes current websocket/http URLs for IPC status, artifact helpers, and SDK runtime construction
- keeps lower-level endpoint state construction private behind the runtime
  facade

### `ipc_transcript_session_sync.cjs`

Owns transcript sync payload normalization and next-state derivation:

- `normalizeTranscriptSessionSyncPayload` (alias-key support + trim/null semantics)
- `applyTranscriptSessionSync` (state advance + sibling-window broadcast)

### `ipc_client_session_handlers.cjs`

Owns client session IPC handler registration:

- `get-client-user-id`
- `transcript-session-sync`
- exposes `createClientSessionHandlersRuntime(...)` so `ipc.cjs` composes
  session snapshot, endpoint snapshot, transcript-session state update, and
  renderer broadcast dependencies once
- keeps lower-level client-session registration and snapshot construction
  helpers private to the runtime helper
- client snapshot payload construction from injected Electron agent-host state and
  runtime endpoint URLs
- transcript-session sync state updates through `ipc_transcript_session_sync.cjs`
  while keeping mutable session state in `ipc.cjs`

### `ipc_renderer_diagnostics_handlers.cjs`

Owns renderer diagnostics IPC handler registration:

- `renderer-log`
- `live-surface-trace`
- exposes `createRendererDiagnosticsHandlersRuntime(...)` so `ipc.cjs`
  composes renderer log and live-surface trace callbacks once
- keeps the lower-level renderer diagnostics registration helper private to the
  runtime helper
- renderer log payloads still normalize and redact through
  `ipc_diagnostics_runtime.cjs`
- live-surface trace payloads still normalize and redact through
  `live_surface_trace_runtime.cjs`

### `ipc_pending_turn_handlers.cjs`

Owns pending renderer turn IPC handler registration and payload acceptance:

- `windie:pending-turn`
- exposes `createPendingTurnRuntime(...)` so `ipc.cjs` composes pending-turn
  live state and renderer fan-out once
- keeps lower-level pending-turn handler registration private behind the
  runtime facade
- keeps lower-level pending-turn clear execution private behind the
  `createPendingTurnRuntime(...).clear()` facade
- keeps pending-turn payload normalization and required identity checks private
  behind handler registration, preserving only conversation ref, turn ref, user
  row id, text, and timestamp while dropping typed `attachments[]`, attachment
  filenames, screenshot descriptors, preview bytes, and ready artifact refs
- removed snake_case clear alias rejection
- SDK-current-turn matching is supplied through
  `createPendingTurnRuntime(...).matchesCurrentTurn()` for SDK current-turn
  cleanup paths, while explicit target matching remains private inside the
  clear path
- pending/clear broadcasts through the shared SDK desktop transport pending-turn
  channel constant

### `ipc_live_turn_state.cjs`

Owns Electron-main cached SDK live-turn and pending-turn state:

- stores the latest SDK current-turn projection for late-window sync and stop
  target selection
- stores the latest renderer-composed pending turn for late-window sync and SDK
  current-turn catch-up cleanup
- resets both caches on backend/session/test reset, with pending-only reset for
  shutdown cleanup
- keeps mutable live-turn cache storage out of the `ipc.cjs` relay root

### `ipc_stop_target_runtime.cjs`

Owns main-process stop target resolution and stop execution:

- `createMainStopTargetRuntime`: composes live current-turn reads, pending-turn
  reads, active conversation-ref reads, SDK stop execution, and overlay phase
  completion for `ipc.cjs`
- chooses stoppable SDK current turns before renderer pending turns
- falls back to the active conversation only when no current or pending turn is
  available
- sends SDK-shaped `conversation_ref` / `turn_ref` stop payloads through the
  injected Agent SDK stop function
- completes the response overlay phase only after a successful stop result
- keeps executable stop trigger, projection, and target-resolution helpers
  private behind `createMainStopTargetRuntime(...).resolve()` and
  `createMainStopTargetRuntime(...).trigger()`

### `ipc_event_replay_state.cjs`

Owns turn-scoped replay buffer primitives used for late renderer mount recovery:

- `createIpcEventReplayState(maxEvents=240)`
- `startTurn(turnRef, seedEvent)` optimistic turn seed
- `appendForActiveTurn` turn-id-gated replay collection
- `snapshot`/`clear` replay lifecycle helpers

### `ipc_conversation_event_projection.cjs`

Owns backend-event to SDK conversation-event projection for replay fan-out:

- `createConversationEventProjectionRuntime`: composes replay fallback
  conversation/revision/turn refs once for `ipc.cjs`
- rejects invalid backend event envelopes before invoking the SDK normalizer
- delegates canonical event conversion to the SDK backend event normalizer
- passes replay fallback conversation, revision, and turn refs for scoped
  backend errors
- keeps backend-event builder details and SDK backend normalizer imports out of
  the `ipc.cjs` composition root

### `ipc_overlay_phase_events.cjs`

Owns backend-event to response-overlay transition contract:

- `createOverlayPhaseEventRuntime`: exposes backend-event to overlay transition
  resolution for `ipc_runtime_helpers.cjs`
- keeps correlation-id precedence (`request_id` -> `correlation_id` ->
  `bundle_id` -> event `id`) private behind the runtime facade
- keeps recovery metadata extraction (`attempt`, `max_attempts`,
  `failure_reason`, `recovery_stage`) private behind the runtime facade
- maps `streaming-response`, `tool-call`, `tool-bundle`, `tool-output`,
  `streaming-complete`, terminal fallback events, and phase-guarded `error`

### `ipc_overlay_phase_contract.cjs`

Owns shared overlay phase contract primitives used by both state and event mappers:

- canonical phase set (`RESPONSE_OVERLAY_PHASES`)
- canonical metadata keys (`RESPONSE_OVERLAY_METADATA_KEYS`)
- `createResponseOverlayPhaseContractRuntime(...)` for supported-phase checks,
  event scalar normalization, response-overlay metadata normalization, and
  metadata equality; state and event helpers consume this facade instead of
  importing lower-level scalar normalizers.

### `ipc_response_overlay_phase_runtime.cjs`

Owns Electron-main response-overlay phase application side effects:

- emits chat-pill main trace rows for phase changes
- applies phase state through `ipc_overlay_phase_state.cjs`, including native
  phase callbacks and renderer fan-out
- updates global stop shortcut enablement from the current phase
- syncs the SDK backend idle-disconnect timer after phase changes

### `ipc_host_runtime_config.cjs`

Owns IPC host skin/config fan-out:

- `createIpcHostRuntimeConfig`: composes backend endpoint runtime and debug env
  runtime configuration once for `ipc.cjs`
- configures hosted backend defaults before debug env names so endpoint state is
  refreshed before later runtime consumers inspect URLs
- keeps `configureIpcHostRuntime(...)` as a thin exported main-process host API

### `ipc_host_copy_runtime.cjs`

Owns generic Electron agent-host copy defaults and app-skin copy state:

- stores default agent display name, MCP client identity, and query-event copy
  fallbacks for generic hosts
- normalizes host-skin identity and query-event copy sections independently
- exposes agent display name, MCP client identity, and query-event copy accessors to
  the IPC composition root
- keeps generic default copy private behind the host-copy runtime facade
- keeps WindieOS-specific copy supplied by `main_host_skin.cjs` out of generic
  runtime helpers

### `ipc_host_option_state.cjs`

Owns Electron-main IPC host initialization option state:

- normalizes optional initialize callbacks such as response-overlay application,
  overlay pre-capture, global stop shortcut setters, SDK live-turn sync, and
  injected websocket implementation
- stores the optional local-tool lifecycle object supplied by the host
- builds the desktop local-runtime launch config from `initializeIpc(...)`
  options for the Electron AgentClient factory
- keeps normalization and launch-config construction private behind the
  host-option state facade
- exposes getters for startup hydration, config handlers, response-overlay
  phase side effects, query pre-capture, AgentClient construction, and SDK
  wake-up wiring
- resets all host option handles during test shutdown

### `ipc_app_diagnostics_runtime.cjs`

Owns IPC-facing app diagnostic append error handling:

- forwards app diagnostic events to `app_diagnostics_store.cjs`
- catches append failures and logs the diagnostic path plus sanitized reason
- returns stable `{ stored: false, reason }` results on persistence failure
- keeps diagnostic persistence fallback policy out of the `ipc.cjs` relay root

### `ipc_renderer_windows.cjs`

Owns renderer-window lifecycle and generic fan-out:

- `createRendererWindowRuntime`: composes renderer window registry, overlay
  phase, SDK current-turn sync, pending-turn sync, buffered replay, and
  conversation-event projection dependencies once for `ipc.cjs`
- keeps lower-level window tracking and fan-out helpers private behind the
  runtime facade
- keeps renderer window registry construction private behind the runtime facade
  while preserving track, broadcast, reset, and size accessors
- runtime track: register + prune windows, sync current overlay phase after load
- runtime track: optionally replays buffered in-flight turn events to late windows (`getReplayEvents`)
- runtime track: replays the latest pending renderer-composed user turn
  through `windie:pending-turn` when a secondary renderer mounts before SDK
  current-turn projection has replaced the optimistic row
- runtime broadcast: channel payload fan-out with optional source-window exclusion

### `ipc_query_broadcast.cjs`

Owns query-scope send-failure event fan-out:

- `broadcastQuerySendFailure`: builds an SDK `turn_error` conversation event
  from query failure context when SDK/backend send fails, fans it out to
  renderer windows, and resets phase to idle

### `ipc_query_events.cjs`

Owns query-context, send-failure, interruption, and conversation-ref extraction
behind a runtime facade consumed by `ipc.cjs`, `ipc_query_send_runtime.cjs`,
`ipc_query_broadcast.cjs`, and backend-close cleanup:

- `createQueryEventsRuntime`

The lower-level conversation-ref resolver and event builders stay private inside
the runtime facade. The facade applies dynamic host-skinned query-event copy
while preserving the SDK-shaped error/interruption event envelope.

SDK `ConversationRuntime.send(...)` owns `turn_started` and `user_message`
projection. Electron main must not synthesize a duplicate local user message.

### `ipc_settings_sync.cjs`

Owns the shared settings payload contract used by Electron main config
callers:

- `isValidConfigPayload`

### `ipc_settings_sync_runtime.cjs`

Owns settings-sync state and command orchestration:

- pending settings ACK map lifecycle, including private wait/resolve/clear
  mechanics and timeout logging
- initial settings sync attempt gating
- renderer/update-settings backend command send
- queued list-models request state and flush after backend open
- backend settings payload filtering for local-only config keys

### `ipc_desktop_ui_config.cjs`

Owns persisted desktop UI config disk I/O:

- `loadDesktopUiConfigFromDisk`
- `saveDesktopUiConfigToDisk` with tmp-write + rename replacement
- the persisted filename remains `frontend-config.json` for compatibility

### `ipc_desktop_ui_config_store.cjs`

Owns the Electron-main desktop UI config store around the disk I/O helper:

- hydrates the live redacted snapshot from disk and keeps disk as persistence
  rather than query-time authority
- returns cloned validated snapshots for settings sync, MCP registry, global
  shortcut fallback, workspace resolution, browser automation checks, and
  agent-definition context
- preserves main-owned MCP enablement across renderer saves unless an explicit
  MCP toggle disables preservation
- falls back to the disk config allowlist when the store has not yet hydrated
  the MCP allowlist
- redacts provider secrets before saving and advances the live store before
  awaiting persistence
- records MCP enablement diagnostics for save success/failure, preservation
  source, and enabled-server counts
- resets stored config during test shutdown/reset and keeps mutable desktop UI
  config storage out of the `ipc.cjs` relay root

### `ipc_desktop_ui_config_handlers.cjs`

Owns desktop UI config IPC handler registration while preserving the legacy
renderer wire channel names:

- exposes `createDesktopUiConfigHandlersRuntime(...)` so `ipc.cjs` composes
  config load/save, validation, store persistence, and initialize-time shortcut
  setter dependencies once
- keeps lower-level desktop UI config handler registration private behind the
  runtime facade
- `load-frontend-config`
- `save-frontend-config`
- store hydration for load and store persistence for save while preserving the
  legacy renderer wire channel names

### `ipc_global_stop_shortcut_config_runtime.cjs`

Owns Electron-main global stop shortcut status/config adaptation:

- normalizes native shortcut runtime status before it is included in renderer
  IPC status snapshots
- applies successful fallback accelerators into desktop UI config for
  persistence
- skips fallback persistence when registration failed or the fallback is already
  saved
- broadcasts connection/status snapshots after shortcut status changes
- keeps raw status normalization and fallback application helpers private behind
  the shortcut config runtime facade

### `ipc_main_process_trace_runtime.cjs`

Owns Electron-main trace event routing:

- routes idle permission-probe events without conversation context into app
  diagnostics
- rejects non-permission trace events that lack conversation or turn context
- writes conversation-scoped trace events through the SDK `TraceRecorder` and
  hidden `trace_event` conversation events
- keeps trace input string/duration sanitization out of the IPC relay root
- keeps trace input normalization helpers private behind the trace runtime

### `ipc_mcp_refresh_runtime.cjs`

Owns Electron-main MCP refresh orchestration:

- refreshes the latest desktop UI config through the Agent SDK when the agent
  is awake and supports `refreshMcpServers(...)`
- falls back to the local MCP registry refresh in tests or when the live agent
  has no SDK refresh method
- gates startup refresh on enabled MCP server count and skips it in tests
- stores and clears the pending startup refresh promise so startup hydration
  cannot launch duplicate MCP refreshes

### `ipc_agent_connection_events.cjs`

Owns Electron-main Agent SDK backend connection event adaptation:

- exposes `createAgentConnectionEventsRuntime(...)` so `ipc.cjs` injects host
  setters, trace/log callbacks, endpoint state, and close handling once at
  composition time
- maps SDK backend open events into main-process session state callbacks,
  settings-sync reset, overlay idle transition, replay reset, diagnostics, and
  renderer connection-status broadcast
- maps SDK backend error, handshake-error, and message-error events into trace
  diagnostics and human-readable logs
- selects backend fallback endpoint candidates from SDK-provided websocket or
  HTTP endpoint payloads before `ipc.cjs` applies active endpoint state
- keeps handshake user-id extraction and fallback endpoint alias matching
  private to the connection-event runtime owner while tests exercise those
  paths through the composed facade
- keeps the lower-level connection-event and fallback handlers private to the
  runtime helper
- delegates close cleanup to `ipc_agent_backend_close_runtime.cjs`

### `ipc_agent_backend_close_runtime.cjs`

Owns Electron-main Agent SDK backend close cleanup:

- exposes `createAgentBackendCloseRuntime(...)` so `ipc.cjs` composes
  connection state, active query state, response-overlay phase, session
  identity, query interrupted-event builder, backend-event relay, session reset,
  replay clear, logging, and status broadcast dependencies once
- marks the SDK inference contexts stale and resets settings sync on close
- classifies close-time active-query phases that should synthesize an
  interrupted SDK-shaped query event
- keeps interrupted-query close classification private to the runtime owner
  while tests exercise phase behavior through the composed facade
- builds the interrupted event through `ipc_query_events.cjs` and routes it back
  through the backend-event relay callback
- keeps the lower-level backend-close cleanup handler private to the runtime
  helper
- resets backend session state, clears replay state, applies idle overlay
  fallback for non-interrupted closes, and broadcasts disconnected status

### SDK-Shaped Conversation Commands

`ipc_agent_sdk_command_handlers.cjs` owns the strict `windie:invoke` command
allowlist and routes conversation commands such as `conversation.send` and
`conversation.stop` into the live SDK runtime. It also owns the
`windie:invoke` IPC handler registration through
`createAgentSdkInvokeHandlerRuntime(...)`; `ipc.cjs` injects Electron-main
state, settings gates, diagnostics, and Agent SDK runtime functions through
generic dependencies such as `ensureAgent` while `initializeIpc(...)` supplies
only the per-window chat/stop handlers. The lower-level invoke handler and IPC
registration helper stay private to the runtime helper:

- backend connection gating
- initial settings sync waiting
- SDK query command send
- send-failure recovery
- stop-query phase completion
- global stop target resolution: latest SDK current turn first, latest pending
  turn second, active conversation fallback last
- pending-turn relay: renderer sends `windie:pending-turn` with
  `{ type: "pending", pendingTurn }`; main stores the latest normalized
  pending turn with only identity, text, and timestamp, broadcasts it to
  sibling renderers, replays it to late windows, and clears it on explicit
  `{ type: "clear" }`, matching SDK current-turn projection, or stop of the
  matching pending turn. Explicit clear filters use `conversationRef` and
  `turnRef`; removed snake_case filter fields are ignored instead of being
  treated as aliases.
- conversation metadata-list diagnostic context and event envelopes are built
  through `createConversationMetadataDiagnosticsRuntime(...)`; command handlers
  choose lifecycle stages and call the runtime facade rather than constructing
  diagnostic rows inline or importing lower-level context/record helpers.

Removed preflight invoke path:

- `ipc_response_overlay_handlers.cjs` and `prime-response-overlay-awaiting` are
  no longer current runtime surfaces. Renderer send preflight is represented as
  a pending user turn in chat state and over `windie:pending-turn`; backend/SDK
  current-turn projection remains the authority for active response phases.

### `ipc_extension_mcp_handlers.cjs`

Owns extension and MCP IPC handler registration:

- `list-agent-extensions`
- `list-mcp-servers`
- `set-mcp-server-enabled`
- `refresh-mcp-servers`
- exposes `createExtensionMcpHandlersRuntime(...)` so `ipc.cjs` composes
  extension registry, MCP config, persistence, Agent SDK refresh, and
  host-skin MCP client identity dependencies once
- keeps lower-level extension/MCP handler registration private behind the
  runtime facade
- extension listing combines public extension metadata with the current MCP
  registry snapshot
- MCP enablement persists through desktop UI config with MCP allowlist
  preservation disabled for that explicit toggle path
- successful runtime MCP toggles refresh Agent SDK MCP registration and then
  rebuild the latest MCP registry outside tests

### `ipc_artifact_handlers.cjs`

Owns artifact IPC handler registration:

- `upload-artifact`
- `fetch-artifact-image`
- exposes `createArtifactHandlersRuntime(...)` so `ipc.cjs` composes
  artifact upload/fetch, install-auth refresh, backend URL, and auth-header
  dependencies once
- keeps the lower-level artifact registration helper private to the runtime
  helper
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

1. renderer-window registry storage, register, reset, and broadcast wiring
   delegate to `ipc_renderer_windows.cjs`.
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
13. client session snapshot and transcript-session-sync handler registration
   delegate to `ipc_client_session_handlers.cjs`, which uses
   `ipc_transcript_session_sync.cjs` for payload normalization and next-state
   derivation.
14. renderer diagnostics handler registration delegates to
   `ipc_renderer_diagnostics_handlers.cjs`.
15. pending renderer turn handler registration and payload normalization
   delegate to `ipc_pending_turn_handlers.cjs`.
16. latest SDK current-turn and renderer pending-turn cache storage delegates
    to `ipc_live_turn_state.cjs`.
17. response-overlay phase application side effects, including chat-pill phase
    tracing, phase state apply/broadcast, global stop shortcut gating, and
    backend idle-disconnect timer sync, delegate to
    `ipc_response_overlay_phase_runtime.cjs`.
18. generic Electron agent-host copy defaults and app-skin copy state,
    including agent display name, MCP client identity, and query event copy,
    delegate to `ipc_host_copy_runtime.cjs`.
19. host initialization option state, including response-overlay callbacks,
    pre-capture callback, global shortcut setters, local-tool lifecycle,
    injected websocket implementation, SDK live-turn sync, and local-runtime
    launch config, delegates to `ipc_host_option_state.cjs`.
20. IPC-facing app diagnostic append failure handling, including append
    forwarding, diagnostic path logging, and stable failure results, delegates
    to `ipc_app_diagnostics_runtime.cjs`.
21. desktop UI config disk I/O delegates to `ipc_desktop_ui_config.cjs`, while
    live store state, MCP allowlist preservation, save redaction,
    query-visible store updates, and enablement diagnostics delegate to
    `ipc_desktop_ui_config_store.cjs`.
22. SDK-shaped renderer command handler registration delegates to
   `ipc_agent_sdk_command_handlers.cjs`, which owns the `windie:invoke`
   allowlist and dispatches to explicit Agent SDK runtime/conversation methods.
23. extension and MCP registry handler registration delegates to
   `ipc_extension_mcp_handlers.cjs`.
24. artifact upload/fetch handler registration delegates to
   `ipc_artifact_handlers.cjs`.
25. install-auth context composition, including identity state, header
    construction, cached-token validation, stale-token clearing, registration
    fallback, SDK auth option shaping, and pending ensure-state sharing,
    delegates to `ipc_install_auth_context_runtime.cjs`; the registration
    mechanics remain in `ipc_install_auth_runtime.cjs`.
26. global stop shortcut target selection and SDK-shaped stop execution
    delegate to `ipc_stop_target_runtime.cjs`.
27. direct `AgentClient.wakeUp(...)` adapter behavior, conversation-runtime
    handle caching, SDK event fan-out, inference-context rehydration, replay
    invalidation, and MCP refresh forwarding delegate to
    `ipc_direct_wake_up_agent_adapter.cjs`; its Electron-main dependency map
    delegates to `ipc_direct_wake_up_agent_adapter_deps.cjs`.
28. query-level Electron agent-definition context attachment, including
    custom-instruction trimming, workspace `AGENTS.md` prompt layers, extension
    prompt layers, host OS/workspace facts, and supplied-definition merging,
    delegates to `ipc_agent_definition_context.cjs`.
29. global stop shortcut status projection and fallback desktop UI config
    persistence delegate to `ipc_global_stop_shortcut_config_runtime.cjs`.
30. main-process trace event routing for app diagnostics versus SDK
    conversation trace rows delegates to `ipc_main_process_trace_runtime.cjs`.
31. MCP latest-config refresh and startup enabled-server refresh gating delegate
    to `ipc_mcp_refresh_runtime.cjs`.
32. Agent SDK backend connection open/error/message event adaptation,
    runtime dependency injection, and backend fallback endpoint selection
    delegate to `ipc_agent_connection_events.cjs`.
33. Agent SDK backend close cleanup, including interrupted active-query event
    synthesis, replay reset, overlay idle fallback, session reset, and
    disconnect status broadcast, delegates to
    `ipc_agent_backend_close_runtime.cjs`.
34. active query context state, including query-send setup, backend event
    accepted/terminal mutation, backend close interruption lookup, and test
    reset, delegates to `ipc_active_query_context.cjs`.
35. backend session identity state, including latest session id,
    server-echoed user id, conversation ref, reconnect reset, and status/query
    snapshot access, delegates to `ipc_backend_session_state.cjs`.
36. backend connection and first-query gate state, including transport
    connected snapshots, open/close mutation, and query initial/sequential
    context switching, delegates to `ipc_backend_connection_gate_state.cjs`.
37. Agent SDK backend event relay bookkeeping, including active query
    accepted-state marking, replay append/clear behavior, backend traffic
    labels, observer notification, and `processBackendMessageData(...)`
    forwarding, delegates to `ipc_agent_backend_event_runtime.cjs`.
38. backend-event to SDK conversation-event projection for late-window replay,
    including invalid envelope rejection and scoped error fallback refs,
    delegates to `ipc_conversation_event_projection.cjs`.
39. Agent SDK runtime conversation-ref resolution, including nested transport
    `payload.conversation_ref`, direct snake_case/camelCase aliases, cached
    current-conversation fallback, and trim/null semantics, delegates to
    `ipc_runtime_conversation_ref.cjs`.
40. cached Electron `AgentClient` lifecycle, including lazy construction,
    first-use logging, initialized-client lookup, local-runtime shutdown
    forwarding, and test reset behavior, delegates to
    `ipc_agent_client_lifecycle.cjs`.
41. Electron `AgentClient` constructor option shaping, including managed
    backend endpoints, SDK `autoLocalRuntime` launch options, test-mode
    local-runtime disabling, and backend lifecycle callback attachment,
    delegates to `ipc_electron_agent_client_factory.cjs`.
42. Agent SDK wake-up orchestration, including install-auth gating, wake-up
    option assembly, direct wake-up adapter construction, and wake-up
    diagnostics, delegates to `ipc_agent_wakeup_runtime.cjs`.
43. active Agent SDK adapter lifecycle state, including pending wake-up
    coalescing, active adapter caching, backend traffic/idle forwarding,
    local-runtime ensure logging, connectivity checks, and reset closure,
    delegates to `ipc_agent_runtime_lifecycle.cjs`.
44. Agent SDK command execution helpers, including query payload resource and
    metadata separation, stop pending-turn cleanup, settings update, model list,
    and wakeword-detected dispatch, delegate to
    `ipc_agent_sdk_runtime_commands.cjs`.
45. backend-message observer registration and fan-out, including invalid payload
    ignoring, observer exception isolation, unsubscribe callbacks, and test
    reset cleanup, delegates to `ipc_backend_message_observers.cjs`.
46. IPC status, client-session, and backend connection payload shaping,
    including renderer `ipc-status` broadcast channel selection, runtime URL
    fields, user/session/conversation fields, connection state, and global stop
    shortcut status projection, delegates to `ipc_status_payloads.cjs`.
47. client/backend session context snapshots, including status/query/SDK-invoke
    state and transcript-session sync state application, delegate to
    `ipc_session_context_runtime.cjs`.
48. install-auth identity normalization, including token/user/install
    trimming, server-user fallback initialization, reset behavior, and
    `autoRegister: false`, delegates to
    `ipc_install_auth_identity_runtime.cjs` behind the composed
    `ipc_install_auth_context_runtime.cjs`.

## Drift Hotspots

1. Duplicating overlay phase updates in `ipc.cjs` and `processBackendMessageData` can create inconsistent phase fan-out.
2. Bypassing `ipc_query_broadcast.cjs` for synthetic events can break sender-window exclusion behavior.
3. Changing the SDK `filterBackendPayload(...)` allowlist without the generated
   backend contract check can leak unsupported payload keys or drop valid
   command fields. Electron main should import the SDK contract directly, not
   recreate a second allowlist.
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
