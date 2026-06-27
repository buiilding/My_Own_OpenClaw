---
summary: "Electron main process runtime: window orchestration, SDK runtime bridge, SDK local-runtime bridge, IPC contracts, and the `electron_agent_definition_inputs.cjs` collector that feeds the SDK `buildAgentDefinition` builder."
read_when:
  - When changing renderer/main IPC channels or SDK runtime bridge logic.
  - When debugging window overlays, wakeword bridge, SDK runtime connectivity, or backend connectivity.
  - When changing `frontend/src/main/agent/electron_agent_definition_inputs.cjs`, Electron-injected AGENTS.md layers, extension prompt layers, workspace path facts, or OS facts before SDK agent-definition construction.
title: "Electron Main and IPC"
---

# Electron Main and IPC

## Main Entry and Window Orchestration

Primary entrypoint:

- `frontend/src/main/index.cjs`
- `frontend/src/main/surfaces/main_window_runtime.cjs`
- `frontend/src/main/surfaces/main_window_icon_runtime.cjs`
- `frontend/src/main/surfaces/main_window_overlay_runtime.cjs`
- `frontend/src/main/app/main_process_lifecycle_runtime.cjs`
- `frontend/src/main/surfaces/overlay_phase_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_controls_ipc_runtime.cjs`
- `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- `frontend/src/main/surfaces/window_visibility_runtime.cjs`

Responsibilities:

- Creates/manages main window + chat overlay windows.
- Maintains overlay response phases (`idle`, `awaiting-first-chunk`, `streaming`, tool phases).
- Keeps overlay send/capture prep blur-only and avoids cross-app focus restoration.
- Registers tray/shortcuts and always-on-top behavior for overlay windows.
- Delegates BrowserWindow factory/bootstrap helpers to `main_window_runtime.cjs`.
- Delegates lifecycle listeners/startup wiring to `main_process_lifecycle_runtime.cjs`.
- Delegates split IPC handler registration to `overlay_phase_ipc_runtime.cjs`, `window_controls_ipc_runtime.cjs`, and `permission_ipc_runtime.cjs`.
- Delegates chat/main visibility transitions to `window_visibility_runtime.cjs`.

See [Main Window Runtime Factory and Overlay Bootstrap Reference](main_window_runtime_factory_and_overlay_bootstrap_reference.md) for extracted helper boundaries.
See [Main Window Icon and Overlay Runtime Reference](main_window_icon_and_overlay_runtime_reference.md) for icon-path/nativeImage fallback and shared overlay-window/renderer-loader helper contracts.
See [Main Process Lifecycle, Overlay IPC, and Window Visibility Runtime Reference](main_process_lifecycle_overlay_ipc_and_window_visibility_runtime_reference.md) for lifecycle and overlay-runtime split ownership.

## Preload Boundary

- `frontend/src/preload.js`

Responsibilities:

- Exposes allowlisted IPC APIs (`send`, `invoke`, `on`, `once`) to renderer.
- Enforces channel allowlists at the renderer boundary.
- Prevents arbitrary channel usage from renderer code.

## IPC Bridge to SDK Runtime

Main modules:

- `frontend/src/main/ipc.cjs`
- `frontend/src/main/ipc/ipc_settings_sync.cjs`
- `frontend/src/main/ipc/ipc_runtime_helpers.cjs`
- `frontend/src/main/ipc/ipc_agent_sdk_command_handlers.cjs`
- `frontend/src/main/ipc/ipc_renderer_windows.cjs`
- `frontend/src/main/ipc/ipc_conversation_status_runtime.cjs`
- `frontend/src/main/ipc/ipc_workspace_path_runtime.cjs`
- `frontend/src/main/ipc/ipc_query_broadcast.cjs`
- `frontend/src/main/ipc/ipc_query_events.cjs`
- `frontend/src/main/ipc/ipc_client_session_handlers.cjs`
- `frontend/src/main/ipc/ipc_renderer_diagnostics_handlers.cjs`
- `frontend/src/main/ipc/ipc_pending_turn_handlers.cjs`
- `frontend/src/main/ipc/ipc_direct_wake_up_agent_adapter.cjs`
- `frontend/src/main/ipc/ipc_agent_definition_context.cjs`
- `frontend/src/main/ipc/ipc_extension_mcp_handlers.cjs`
- `frontend/src/main/agent/electron_agent_definition_inputs.cjs`

Responsibilities:

- Adapts renderer IPC to the Agent SDK runtime.
- Starts `AgentClient.wakeUp(...)` through `ipc_agent_wakeup_runtime.cjs`,
  keeps active adapter lifecycle state in `ipc_agent_runtime_lifecycle.cjs`,
  routes backend `ensureConnected(...)` calls through that lifecycle helper,
  uses the returned `agent.conversation(...)` runtime, routes SDK command
  execution through `ipc_agent_sdk_runtime_commands.cjs`, keeps backend-message
  observer fan-out in `ipc_backend_message_observers.cjs`, shapes status payloads
  and broadcasts connection status through `ipc_status_payloads.cjs`, composes
  install-auth identity/registration context through
  `ipc_install_auth_context_runtime.cjs`, composes repeated session snapshots
  through `ipc_session_context_runtime.cjs`, routes backend event relay
  bookkeeping through `ipc_agent_backend_event_runtime.cjs`, applies
  response-overlay phase side effects through
  `ipc_response_overlay_phase_runtime.cjs`, resolves Agent SDK runtime
  conversation refs through the `ipc_runtime_conversation_ref.cjs` fallback
  wrapper,
  reads app-skin host copy through `ipc_host_copy_runtime.cjs`, routes
  app-diagnostic append failure handling through
  `ipc_app_diagnostics_runtime.cjs`, keeps active query context state in
  `ipc_active_query_context.cjs`, keeps backend session identity in
  `ipc_backend_session_state.cjs`, keeps backend connection/first-query gate
  state in `ipc_backend_connection_gate_state.cjs`, keeps host initialization
  option state in `ipc_host_option_state.cjs`, projects replayed backend
  events through
  `ipc_conversation_event_projection.cjs`, keeps desktop UI config authority in
  `ipc_desktop_ui_config_store.cjs`, keeps live-turn cache state in
  `ipc_live_turn_state.cjs`, keeps cached AgentClient lifecycle in
  `ipc_agent_client_lifecycle.cjs`, composes Electron AgentClient construction
  through `ipc_electron_agent_client_factory.cjs`, and delegates backend
  websocket construction, SDK local-runtime bootstrap, envelope sends, close,
  reconnect primitives, display rows, and current-turn projection to the SDK.
- Injects backend session context (`userId`, `sessionId`, `conversation_ref`)
  from `ipc_backend_session_state.cjs`.
- Gates first query on settings synchronization ACK using
  `ipc_backend_connection_gate_state.cjs` plus `ipc_settings_sync_runtime.cjs`.
- Broadcasts connection status through `ipc_status_payloads.cjs`.
- Uploads artifacts over HTTP endpoint and injects returned references.
- Delegates startup install-auth/config/shortcut hydration to a focused helper
  runtime while the owning state runtimes receive the hydrated values.
- Delegates desktop UI config load/save handler registration to a focused
  helper runtime while config cache, persistence, and shortcut fallback stay in
  their owning main-process runtimes.
- Delegates client session snapshot and transcript-session sync channel
  registration to a focused helper runtime while keeping Electron agent-host session
  state in `ipc.cjs`.
- Delegates renderer log and live-surface trace channel registration to a
  focused helper runtime while diagnostics runtimes keep normalization and
  redaction.
- Delegates pending renderer turn relay registration to a focused helper while
  `ipc_live_turn_state.cjs` stores the latest pending-turn cache used by
  stop/current-turn cleanup through the helper's runtime wrapper.
- Delegates renderer chat query/stop handler construction to a focused helper
  runtime while `initializeIpc(...)` supplies per-window lookup and overlay
  pre-capture callbacks.
- Delegates artifact upload/fetch handler registration to a focused helper
  runtime while the composition root supplies current backend URL and
  install-auth header callbacks.
- Delegates image clipboard/context-menu IPC registration to a focused helper
  runtime while the composition root supplies Electron primitives and backend
  artifact-origin callbacks.
- Delegates direct wake-up agent adapter behavior to a focused helper that owns
  `agent.conversation(...)` runtime handles, SDK event fan-out, inference
  context rehydration, replay invalidation, and MCP refresh forwarding; the
  adapter dependency map is built by
  `ipc_direct_wake_up_agent_adapter_deps.cjs`.
- Delegates query-level agent-definition context attachment to a focused helper
  that gathers the Agent settings system prompt, derives remote-tool enablement
  from disabled tool policy, collects workspace AGENTS.md layers, extension
  prompt layers, and host OS/workspace facts, then lets the SDK builder own
  generic tool-list canonicalization; its runtime wrapper owns the
  latest-config/platform/SDK-builder injection.
- Delegates extension and MCP registry channel registration to a focused helper
  runtime while `ipc.cjs` supplies Electron agent-host state and
  `ipc_mcp_refresh_runtime.cjs` owns MCP startup/latest-config refresh helpers.

Split boundary:

- `ipc.cjs` is the Electron agent host: it imports `Agent`, starts the desktop
  agent with only normal public startup inputs (`apiKey`, `workspace`,
  `appName`), subscribes to SDK rows/status/events/current-turn/connection
  outputs, and exposes thin `windie:*` IPC handlers that call Agent SDK methods.
- `ipc.cjs` owns renderer-facing lifecycle orchestration and injects host state
  into focused IPC handler registration helpers.
- `ipc_agent_sdk_command_handlers.cjs` owns the strict SDK command allowlist and
  `windie:invoke` handler registration runtime while receiving Electron-main
  state and Agent SDK methods as injected dependencies.
- `ipc_settings_sync.cjs` owns settings ACK wait/resolve/timeout primitives for first-query gating.
- helper modules own event processing, renderer-window fan-out, SDK terminal
  status projection, SDK workspace-path fallback resolution through a cached
  config runtime wrapper, and synthetic query event broadcast paths.
- `electron_agent_definition_inputs.cjs` owns Electron-only collection of custom
  instructions, extension prompt layers, AGENTS.md layers, workspace path, and
  OS facts. The SDK package owns the final `agent_definition` object shape and
  capability metadata stamping. Its input contract uses `agentsMd`; the
  generated backend wire field remains `agent_definition.agents_md`.
- See [IPC Helper Module Split and Runtime Boundary Reference](ipc_helper_module_split_and_runtime_boundary_reference.md) for per-module contract details.

## Query Payload Enrichment

Module:

- `packages/windie-sdk-js/src/runtime/ContextEnrichmentPipeline.ts`

Adds backend-facing context before query send:

- episodic and semantic memory sections
- optional attached-file context
- user query XML payload
- runtime-only system state subset (`screen_resolution`) for backend coordinate normalization

## Local Runtime Bridge

Module:

- `frontend/src/main/sidecar/local_runtime_bridge.cjs`

Responsibilities:

- Supplies desktop launch facts, backend endpoint context, host window helpers,
  and artifact/screenshot adapters to the SDK local runtime provider.
- Wakes/resolves the SDK-owned local-runtime daemon and publishes normalized
  `local-runtime-status` snapshots to renderer windows.
- Routes Electron helper calls through SDK local-runtime `/rpc` and
  `executeTool(...)` APIs while keeping Python `LocalRuntimeService` method execution
  inside the local-runtime daemon.
- Converts local-runtime/provider failures into stable renderer-facing
  `{ success:false, error }` envelopes for helper IPC callers.

Safety behavior:

- Fails closed when no SDK local runtime provider is available.
- Marks the local runtime unavailable and notifies renderer windows when
  provider resolution or helper RPC fails.
- For detailed handler/mapper/window-hide internals, see [Local Runtime Bridge Handler and Window Guard Reference](local_runtime_bridge_handler_and_window_guard_reference.md).

## Wakeword Bridge

Module:

- `frontend/src/main/wakeword/wakeword_bridge.cjs`
- `frontend/src/main/wakeword/wakeword_bridge_runtime.cjs`

Responsibilities:

- Lazily spawns `wakeword_service.py` subprocess on `wakeword-enable`.
- Streams binary audio chunks to Python service.
- Parses framed binary wakeword detection responses.
- Supports wakeword enable/disable state and buffer flushing.
- Registers wakeword IPC channels through an injected `ipcMain`-compatible host
  adapter when supplied, defaulting to Electron `ipcMain`.
- Delegates stderr status parsing/noisy-line suppression, startup/process error message mapping, and audio-chunk normalization to `wakeword_bridge_runtime.cjs`.

See [Wakeword Bridge Runtime Helper Reference](wakeword_bridge_runtime_helper_reference.md) for helper-level contracts and test-backed invariants.

## Permission Runtime

Main modules:

- `frontend/src/main/permissions/permission_service.cjs`
- `frontend/src/main/permissions/permission_ipc_runtime.cjs`
- `frontend/src/main/index.cjs`
- `frontend/src/shared/permissions/permission_manifest.json`

Responsibilities:

- Loads permission manifest metadata and cloned permission definitions.
- Runs per-permission probes for onboarding and focused settings status surfaces.
- Handles permission request flows (notably macOS privacy-pane deep links and microphone access request).
- Exposes renderer invoke handlers:
  - `list-permissions`
  - `check-permissions`
  - `check-permission`
  - `run-permission-probe`
  - `request-permission`

## IPC Channel Taxonomy

From renderer usage perspective:

- send channels: backend messaging, overlay window control, wakeword chunk/control
- invoke channels: tool execution, artifact upload, config load/save, window/display APIs, SDK-shaped `windie:invoke` runtime commands, and host permission/status requests
- direct renderer-facing memory CRUD/search invoke channels were removed from the preload boundary; memory UI now uses SDK-shaped `memories.*` commands through `windie:invoke`.
- invoke channels also include permission/status request channels:
  - `list-permissions`, `check-permissions`, `check-permission`, `run-permission-probe`, `request-permission`
- on channels: backend stream events, connection status, wakeword events (including `wakeword-stt-trigger`), overlay phase updates

Canonical constants are in renderer infra (`frontend/src/renderer/infrastructure/ipc/channels.ts`) and must stay aligned with main-process handlers.

For `get-displays` payload mapping details, see [Display Query Handler Display Inventory Payload Contract Reference](display_query_handler_display_inventory_payload_contract_reference.md).
