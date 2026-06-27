---
summary: "Current WindieOS desktop app architecture across Electron main, React renderer, preload IPC boundary, and local-runtime implementation."
read_when:
  - When changing renderer, main, local-runtime, or local-runtime Python implementation ownership boundaries.
  - When changing query, stream, tool, wakeword, or transcript flow across frontend processes.
title: "Frontend Architecture"
---

# Frontend Architecture

See also: [Frontend Functionality Map](../frontend/README.md) and [Frontend Full Functionality Inventory Reference](../frontend/inventory/frontend_full_functionality_inventory_reference.md).

## Runtime Topology

The WindieOS desktop app implementation is a multi-runtime stack:

1. Renderer (React): UX state, chat/dashboard surfaces, tool-stream rendering.
2. Main process (Electron/Node): window lifecycle, thin Electron agent-host wiring, SDK local-runtime bridge, wakeword subprocess bridge.
3. Preload boundary: allowlisted IPC bridge (`window.ipc`) between renderer and main.
4. Local-runtime Python implementation: local tool execution, local transcript/memory store, system-state capture, browser/file/system tool adapters.

## Packaged Install Contract

- End users install one OS-specific WindieOS package (Windows/macOS/Linux).
- Packaged app ships bundled local-runtime Python; no system Python prerequisite.
- SDK local runtime starts/reuses the bundled local-runtime Python daemon; Electron main still starts wakeword and reports clear reinstall errors when runtime assets are missing.
- Bundled runtime is expected to include:
  - wakeword model assets
  - browser Python dependencies
- Runtime bootstrap should not reinstall already-present bundled assets.

## Current Source Layout

```text
frontend/src/
├── main/
│   ├── index.cjs                          # Electron main composition root (wires runtime modules)
│   ├── ipc.cjs                            # Renderer <-> SDK/Electron IPC composition root and event fan-out
│   ├── app/                               # app lifecycle, menus, runtime mode, GPU, VM worker, endpoint/runtime helpers
│   ├── debug/                             # gated main-process trace helpers
│   ├── extensions/                        # extension manifest, MCP runtime, tool manifest helpers
│   ├── ipc/                               # focused IPC helper runtimes and channel contracts
│   ├── permissions/                       # permission service, permission IPC, sudo handler, capability domains, state store
│   ├── sdk/                               # SDK desktop integration helpers and local tool/surface lifecycle hooks
│   ├── sidecar/                           # local-runtime bridge, daemon manager, RPC transports, readiness, stop policy
│   ├── surfaces/                          # BrowserWindow creation, overlays, surface state, window policy, display affinity
│   ├── wakeword/                          # wakeword subprocess bridge and supervisor
│   └── python/                            # Local-runtime Python implementation (tools, memory, system, browser)
├── preload.js                             # Context-isolated channel allowlist bridge
├── renderer/
│   ├── app/                               # App/provider composition + wakeword controller
│   ├── features/chat                      # Chat stream, display-only tool state, message UI
│   ├── features/dashboard                 # Sidebar, memory/models/settings/usage/search panels
│   ├── features/voice                     # Voice mode + wakeword capture hooks
│   └── infrastructure                     # IPC/transcript/tool-exec/audio services
│       └── transcript/                    # SDK-backed conversation store adapters
└── landing/                               # Marketing/landing surface
```

## Runtime Surface Notes (2026-03-11)

Current runtime behavior also relies on these explicit seams:

- **Main-process composition is split by role**: `frontend/src/main/index.cjs` composes `app/main_process_bootstrap_runtime.cjs` (window creation/bootstrap), `app/main_process_lifecycle_runtime.cjs` (ready/activate/quit), and `surfaces/surface_runtime.cjs` (window ownership + overlay phase state).
- **Local runtime bridge lifecycle is SDK-owned**:
  `sidecar/local_runtime_bridge.cjs` is the composition root for scoped host IPC
  registration and Electron-only helper behavior. Desktop launch facts are built
  in `ipc_electron_agent_client_factory.cjs`, passed into one shared
  `AgentClient` as `autoLocalRuntime`, and exposed to bridge code only through
  SDK `getKnownLocalRuntime` / `localRuntime({ reason })` resolvers. The SDK
  owns daemon startup/reuse, RPC unwrapping, and tool execution transport.
  Electron keeps host-only
  screenshot/display/artifact shaping in
  `sidecar/local_runtime_execute_tool_runtime.cjs`.
- **Renderer browser-session control is now runtime-backed**: renderer-side browser session UX should read local runtime readiness from the shared IPC status surface and consume shared browser-session/local-runtime stores rather than issuing ad hoc per-component browser polling directly from UI components. `localRuntimeStatusStore` owns the initial `get-local-runtime-status` bootstrap plus `local-runtime-status` event subscription, app feature code reaches it through `DesktopLocalRuntimeStatusRuntimeClient`, and `browserSessionStore` owns browser status sync, tab normalization, and shared polling cadence for all subscribers.
- **Renderer API access is facade-owned by boundary**: the legacy renderer
  `infrastructure/api/client.ts` bridge and the later
  `infrastructure/api/agentSdkClient.ts` re-export facade have been removed.
  Feature code reaches Electron IPC and SDK-shaped commands through app runtime
  facades such as `app/runtime/desktopLiveTurnRuntimeClient.ts`,
  `app/runtime/desktopSettingsRuntimeClient.ts`,
  `app/runtime/desktopConversationContinuityService.ts`, and
  `app/runtime/desktopConversationLibraryClient.js`. SDK conversation/runtime
  contracts enter renderer app code through the app-runtime conversation
  contracts facade at `app/runtime/desktopConversationRuntimeContracts.ts`,
  which imports only the SDK owner modules for conversation types,
  continuity, command names, model selection, and tool correlation helpers.
  Desktop-specific adapters are allowed behind SDK interfaces such as
  `ConversationStore` and `AgentRuntimeTransport`; the app facades may use
  lower-level SDK modules, but renderer feature code should not reimplement SDK
  conversation, tool-routing, rehydrate, compaction, or projection semantics.
- **Tool identity normalization is SDK-owned**: renderer chat display helpers may
  map SDK projections into `ChatMessage` state, but request/provider/bundle
  identity precedence for tool-call and tool-output rows comes from SDK
  correlation helpers imported from `packages/windie-sdk-js` through renderer
  app-runtime or adapter-owned contracts. Electron store adapters and feature
  code should not keep separate
  backend-event alias tables for `request_id`, `tool_call_id`,
  `correlation_id`, or `bundle_id`.
- **Settings/model sync is facade-owned**: provider/config helpers build plain renderer config and model-selection data. Backend settings payload shaping and model command dispatch stay behind `app/runtime/desktopSettingsRuntimeClient.ts` and focused conversation runtime facades.
- **Local-runtime Python now has a matching hosted SDK transport client**: `frontend/src/main/python/windie/sdk.py` mirrors the same public backend boundary for Python-side developer tools and local runtime integrations that need `/api/sdk/*`, `/api/artifacts/*`, or `/ws` access without importing backend code.
- **Permission runtime is split by capability domain**: `permissions/permission_service.cjs` remains the public API surface, while focused domain modules own screen capture, accessibility/input control, microphone, automation/app-management, workspace/shell, and browser setup flows.
- **Global stop shortcut is a dedicated runtime**: `frontend/src/main/shortcuts/agent_stop_shortcut_runtime.cjs` owns per-platform accelerator normalization, fallback registration, and phase gating; `ipc.cjs` projects runtime status back to renderer config/status flows.
- **VM worker mode is runtime-flagged and run-API backed**: `app/runtime_mode.cjs` controls `WINDIE_VM_MODE` / `WINDIE_VM_WORKER_MODE` behavior, while `app/vm_worker_runtime.cjs` polls and relays `/api/runs/*` assignments/events over backend HTTP + existing websocket event observer hooks.
- **Local-runtime browser implementation is feature-pack aware**: `frontend/src/main/python/local_backend.py` and `core/feature_pack_installer.py` support on-demand local-runtime Python dependency install into user-writable site-packages with packaged-app specific failure messaging.
- **Local-runtime tool contract is direct-name based**: `frontend/src/main/python/tools/registry.py` exposes concrete tool names from its local `TOOL_CATALOG` plus `switch_window` and `get_open_windows`; parity with backend remote schemas is tracked through `frontend/src/main/python/tools/manifest.py`.
- **Wrapper artifacts are not live local-runtime tool names**: repo-local `model-facing/tool_schema.txt` still contains unified `computer_use` and `system_use` schemas, but the current local-runtime implementation does not register or dispatch those names.

## Runtime Ownership Migration Status

This section distinguishes current behavior from target behavior and known migration debt. Use [Agent Runtime Ownership and Change Routing](../development/agent_runtime_ownership_and_change_routing.md) and the owner-specific workflow docs as the current deletion checklist; the older refactor-plan directory has been removed from active docs navigation.

| Area | Current behavior | Target behavior | Remaining debt / deletion condition | Test target |
| --- | --- | --- | --- | --- |
| Query send | Renderer sends user intent to `DesktopLiveTurnRuntimeClient`; SDK runtime creates the turn; Electron main enriches host-only context and maps through `ipc_query_runtime.cjs`; backend websocket payload keys are checked against the backend-owned incoming contract fixture. | Renderer owns UI intent only; SDK/Electron facades own query command mapping; backend envelope id is the transport turn id. | Keep `turn_ref`, attachment UI fields, and unknown keys out of `query.payload`; delete only historical plan references when no longer useful. | `IpcQueryRuntime`, `IpcMainBridge.query`, `BackendSdkWebsocketContract`, backend incoming contract parity tests. |
| Live turn projection | Agent SDK runtime normalizes backend packets and forwards SDK `windie:current-turn` snapshots through Electron main. Renderer live assistant/tool rows render from SDK `currentTurn`; `useChatStream` remains for transcript, metadata, telemetry, and persistence side effects. | SDK conversation runtime is the only live-turn reducer; renderer display adapters only project SDK state. | Backend-wire traffic must not become a live-row fallback again; remaining renderer side effects must stay scoped to normalized conversation events. | `AgentSdkConversationRuntime`, `RendererChatRuntimeBoundary`, `ChatStreamThinkingStatus`, `ChatBoxResponse.state`, stream event runtime tests. |
| SDK event fan-out | Electron main forwards SDK rows/status/conversation events/current-turn on `windie:rows`, `windie:status`, `windie:conversation-event`, and `windie:current-turn`. | Electron main is a thin Electron agent host and does not expose a generic runtime compatibility relay. | New renderer SDK runtime commands must be explicit `windie:*` invokes or SDK/client methods, not a revived direct backend relay. | `IpcMainSdkRuntimeBoundary`, `IpcChannels`, `RendererChatRuntimeBoundary`. |
| Settings/model sync | `DesktopSettingsRuntimeClient` owns dashboard startup model-list requests and calls SDK-shaped `windie:invoke` commands: `settings.update` and `models.list`. Main owns backend settings ACK gates in `ipc_settings_sync_runtime.cjs` and sends through the Electron agent-host runtime. `AppConfigProvider` is a React store/facade consumer, not the startup policy owner. | One desktop settings/model runtime exposes explicit config-loaded, backend-connected, synced, requested, received, and error states. | Collapse remaining provider-local status derivation only after settings runtime exposes those explicit states without losing UI affordances. | `DesktopSettingsRuntimeClient`, `IpcSettingsSyncRuntime`, `IpcSettingsSync`, `AppConfigProvider.models`, `ModelsSection`. |
| Conversation storage | SDK stores and projection builders own display/rehydrate events; local-runtime-backed `LocalRuntimeConversationStore` is the canonical local persistent store. Renderer dashboard replay adapts SDK display rows to UI state, and continuity services perform backend rehydrate before backend-dependent actions. | SDK projection and store adapters are the only event interpretation tables for display, replay, edit/resend, retry, compaction, and backend rehydrate. | Renderer transcript state remains a cache/projection for visible workspaces; it must not add new event-to-history interpretation tables. | `AgentSdkConversationRuntime`, `AgentSdkFileConversationStore`, `SdkDisplayChatMessageProjection`, dashboard replay/continuity tests. |
| Electron main composition | `ipc.cjs` still wires many dependencies, but query payload construction, backend endpoint state, install-auth context, status broadcasts, backend side-channel classification, model-list queueing, diagnostics, settings ACK state, overlay phase state, event replay state, and transcript sync helpers live in focused modules. | `ipc.cjs` is a composition root with handler registration and dependency wiring only. | Future extraction should move remaining session/lifecycle dependency wiring only when it can be done without changing runtime behavior. | `IpcMainBridge.lifecycle`, `IpcMainBridge.query`, `IpcSettingsSyncRuntime`, `IpcBackendEventChannels`, `IpcDiagnosticsRuntime`. |

## Core Runtime Flows

### Query Send Flow

1. User enters message in `renderer/features/chat/components/MessageInput.jsx`.
2. `useChatMessageSender` builds payload and optional screenshot metadata.
3. The message sender forwards the user intent and attachment metadata through
   `DesktopLiveTurnRuntimeClient.sendQuery()` as the SDK-shaped
   `conversation.send` command; it does not create a renderer-local visible user
   row on the successful send path.
4. The SDK desktop transport adapter maps SDK runtime interface calls to `windie:invoke` command names.
5. Main `ipc.cjs`:
   - Ensures one-time initial settings sync ACK gate.
   - Runs blur-only overlay pre-capture prep for chatbox-surface sends.
   - Resolves sender-window display affinity in main (including virtual desktop bounds) and stores it for follow-on tool screenshots when the dashboard renderer is hidden.
   - Starts the turn replay buffer with the query message id; the SDK runtime
     emits `turn_started`, the renderer-visible `user_message` row, and any
     later `user_message_metadata` merge events.
   - Calls `buildQueryPayload(...)` to filter backend query fields and preserve required identity before SDK context enrichment renders model-facing memory/attachment content.
   - Resolves applicable local `AGENTS.md` files from the active workspace and forwards them as contextual prompt messages, which is required when the backend is hosted remotely and cannot read local repo paths.
   - Sends normalized `query` through the SDK runtime, which owns the hosted backend WebSocket.

### SDK-Shaped Renderer Commands

Renderer feature code expresses user intent through
`window.agentSdk.invoke(command, payload)`, which sends over the existing
`windie:invoke` IPC wire channel.
The command names are SDK-shaped, for example `conversation.send`,
`conversation.stop`, `conversation.rehydrate`, `conversation.compact`,
`settings.update`, `models.list`, `wakeword.detected`, `memories.clearAll`,
and `conversations.clearAll`.
Electron main owns only the IPC hop and strict command allowlist. The handler
calls public `Agent` / `ConversationRuntime` methods on the live SDK
runtime. Renderer code must not call local-runtime JSON-RPC method names or removed direct IPC
aliases such as
`clear-chat-history`, `clear-local-memory`, `list-chat-conversations`,
`conversation_events`, or `conversation_revisions` for user-facing SDK concepts.
Local-runtime JSON-RPC method names may still exist below the SDK boundary as
local-runtime/store implementation details.

Renderer app-runtime transport facades that implement SDK runtime interfaces
should also use SDK-shaped commands through `window.agentSdk.invoke(...)`.
They should not revive the retired direct runtime IPC channel family.

### Stream Receive Flow

1. Backend WebSocket events arrive in the Agent SDK runtime.
2. The SDK normalizes backend events, updates display rows/current-turn projection, and coordinates any local tool execution.
3. Main updates response-overlay phase (`awaiting-first-chunk`/`streaming`/`tool-call`/`complete`/`error`) and forwards SDK outputs on `windie:rows`, `windie:conversation-event`, `windie:current-turn`, and `windie:status`.
4. Renderer dashboard and response-overlay live assistant/tool rows render from
   the SDK `currentTurn` projection and its `presentation` contract. Renderer
   `useConversationRuntimeProjectionStream` subscribes to that projection and
   delegates renderer send-latch, thinking, stream-tracking, tool phase, and
   terminal side effects to `DesktopSdkLiveTurnEffectsRuntime`. Renderer
   `useChatStream` consumes SDK-normalized `windie:conversation-event` payloads
   for scoped transcript/session side effects and metadata; production live row
   shaping and active assistant/reasoning/tool/terminal phase state do not fall
   back to backend-wire events.
5. Renderer `useChatStream`:
   - Filters by active conversation/turn tracking.
   - Keeps transcript-session identity side effects for SDK events when
     session sync is enabled.
   - Dispatches compaction display and compacted replay persistence from SDK compaction events.
   - Dispatches message metadata/transparency projection from SDK metadata events.
   - Dispatches backend error materialization from SDK `turn_error` events.
   - Dispatches token usage telemetry from SDK `usage_updated` events.
   - Updates Zustand store for metadata, completion materialization, error materialization, token usage, and non-text stream tracking.
   - Does not persist live user, assistant, or tool transcript rows. SDK
     `ConversationRuntime` owns durable live event persistence.

New-chat behavior:

- starting a new chat resets the visible workspace and creates a fresh `conversationRef`
- it does **not** auto-send `stop-query` for an older in-flight conversation
- switching to another history row is renderer-only browsing; it swaps transcript/UI state without eagerly rebuilding backend session history
- late backend events remain conversation-scoped and continue to route into the original workspace/transcript instead of the newly created chat
- background backend events no longer re-select the active conversation in the renderer; only bootstrap/local-send session projection can move foreground chat focus
- manual `compact-history` requests are sent with the active `conversationRef`, so dev compaction targets the currently selected conversation instead of an arbitrary fallback session

### Tool Turn Flow

1. Backend emits `tool-call` or `tool-bundle`.
2. SDK runtime validates and routes executable calls through its local runtime client to the configured local executor.
3. SDK runtime sends `tool-result`/`tool-bundle-result` back to backend.
4. Renderer receives display-only tool events and renders assistant tool rows
   from SDK projections. Renderer does not persist duplicate live tool rows.

Electron main does not own the local tool-routing algorithm.
`ipc_agent_wakeup_runtime.cjs` starts `AgentClient.wakeUp(...)` with install
auth, the active workspace, default builtins, and Electron's local tool
lifecycle hook.
The SDK owns standalone local-runtime startup/reuse, executable tool manifest
discovery, local tool execution, single and bundled tool-call coordination, display
rows/current-turn projections, and backend tool-result return. Electron main
only forwards SDK outputs to renderer windows and keeps desktop-only query
context, overlay, permission, and window behavior.

### Conversation/Transcript Flow

1. SDK `ConversationRuntime` is the live durable writer for user, assistant,
   tool, and terminal conversation events.
2. Renderer chat hooks cache SDK display rows and render SDK current-turn
   presentation state, but they do not append successful-send or live transcript
   rows.
3. `DesktopTranscriptSessionRuntimeClient` owns active conversation/user identity for app and dashboard surfaces.
4. Dashboard conversation-list/load/delete/search and local snapshot calls go through `DesktopConversationLibraryClient`, which delegates store access to SDK-shaped commands so dashboard feature code does not construct Electron store adapters or import transcript storage/snapshot infrastructure.
5. Renderer-local conversation helpers request SDK snapshots through
   SDK-shaped commands such as `conversations.list`, `conversations.search`,
   `conversation.load`, and `conversations.delete`. Renderer feature code does
   not call local-runtime chat-event RPC channels or select storage table/record
   kinds.
6. `LocalRuntimeConversationStore` is the canonical local-runtime-backed SDK conversation
   store. Local-runtime chat-event RPC names remain below the SDK/local-runtime
   boundary, while the desktop conversation store factory only supplies
   desktop write enrichment such as workspace binding, attachments, and
   compaction checkpoints before invoking SDK-shaped commands.
   Local-runtime rewrites persist the SDK rewrite revision in local-runtime conversation
   revision metadata, not by editing preserved event payloads, so list metadata
   and `getRevision()` stay consistent with file and in-memory stores.
7. Opening a past chat replaces in-memory renderer chat state immediately, but backend conversation history is rehydrated lazily only before the first backend-dependent action for that chat. Chat session helpers call `DesktopConversationContinuityService.loadLocalConversationSnapshot(...)`, `DesktopConversationContinuityService.rehydrateFromStore(...)`, or `DesktopConversationContinuityService.rehydrateMessages(...)`; the continuity runtime loads SDK rehydrate projections and sends backend rehydrate commands through the SDK conversation runtime transport so feature code does not shape provider history or IPC envelopes.
8. Send and stop pass through the renderer live-turn app-runtime client. Edit/resend, retry, rehydrate, manual compaction, and compaction replay persistence pass through the continuity app-runtime. These facades call the SDK conversation runtime boundary before the Electron transport adapter maps commands to explicit `windie:*` IPC. Electron-only store and transport adapters stay isolated behind the SDK interfaces instead of becoming normal feature-code dependencies.
9. Compaction replay persistence also goes through the renderer continuity app-runtime. Chat stream handlers may update visible thinking/debug state, but the continuity runtime owns active compacted replay persistence.

Current ownership boundary:

- SDK/local-runtime conversation store owns durable conversation history, replay state, workspace binding, and history browsing/search; local-runtime Python modules back the current desktop store implementation
- backend sessions are disposable inference state that may be rebuilt from the local transcript before a backend-dependent action
- renderer transcript session state is the conversation authority for the currently selected chat
- `chatStore.activeConversationRef` is a renderer projection/cache used for workspace-scoped UI state, stream routing, and turn fallback lookups; it is not a second user-facing source of truth
- renderer surfaces that need "current conversation" should read the merged session snapshot (`useRendererConversationSessionInfo`) instead of independently picking transcript-session vs chat-store refs

### Wakeword/Voice Flow

1. Renderer wakeword hook captures mic PCM and sends `wakeword-audio-chunk` IPC.
2. Main wakeword bridge forwards framed audio to the local-runtime wakeword helper backed by the Python wakeword subprocess.
3. Detection emits `wakeword-detected` back to renderer + `wakeword-detected` backend event.
4. Renderer shows chatbox/focuses input; optional STT continuation uses voice-mode gateway hook.

### Permission Runtime Flow (Settings + Store Gate State)

1. Renderer `App.jsx` startup routes by VM mode + permission-onboarding completion state for the current manifest, but missing permissions no longer hard-block Start.
2. Desktop onboarding step 1 now mounts a permission checklist powered by `permissionStore` (manifest/status bootstrap + per-permission request actions).
3. `permissionStore` remains the canonical place for manifest fetch + permission gate derivation (`needsOnboarding`, required permission sets, manifest-version completion).
4. Onboarding and focused settings surfaces call store helpers for permission runtime updates:
   - onboarding uses `REQUEST_PERMISSION` (per row) and focused re-probes
   - Browser settings uses focused `RUN_PERMISSION_PROBE`/`REQUEST_PERMISSION` paths for Browser automation
5. settings-backed macOS permissions now use a simple onboarding loop: `Grant` triggers the OS handoff, onboarding enters `Waiting...`, and short-lived re-probes flip rows to granted when the user returns from Screen Recording / Accessibility / Automation settings.
6. onboarding is a dedicated primary surface, separate from both the dashboard and minimal chat pill, so main-window close/focus behavior no longer depends on dashboard tab-target state.

### Local Runtime Status Flow

1. Main `local_runtime_bridge.cjs` owns renderer-visible local-runtime readiness state through `local_runtime_supervisor.cjs`; SDK `AgentClient` owns the actual local runtime lifecycle.
2. Main emits `local-runtime-status` renderer events when startup/ready/error state changes and exposes `get-local-runtime-status` for initial snapshot reads.
3. Renderer features that depend on local host capabilities should subscribe to that shared readiness surface instead of racing scoped host IPC calls during startup.
4. `localRuntimeStatusStore` subscribes to live events before starting the bootstrap read, and ignores bootstrap responses if a newer live event arrived first.
5. When the last renderer subscriber detaches, the local-runtime status store drops its IPC listener and resets to an empty snapshot so a later remount always reboots from a fresh readiness read instead of stale cached state.

### Browser Header Session Flow

1. `ChatBrowserSessionControl` is intentionally UI-only. It delegates connect, disconnect, tab switching, and live tab refresh to `useDesktopBrowserSessionControl()`.
2. `browserSessionStore` subscribes to the shared local-runtime status store, blocks browser tool calls until readiness is confirmed, and exposes one snapshot to all renderer consumers.
3. While connected, the browser-session store polls browser status/tab state every 2 seconds by default, and tightens to 1 second while the tab carousel is open.
4. Tab switching from the header uses browser `switch` with `activate=false`, so WindieOS changes the internally controlled tab without bringing that tab to the foreground in the visible browser window.

## Main Process Responsibilities

Primary modules:

- `main/index.cjs`:
  - Main-process composition root: assembles runtime modules and passes shared dependencies only.
  - Installs the native application menu, including `File -> Set active workspace…`, which reuses the workspace-access folder picker and broadcasts the active workspace selection back to renderer windows.
  - Delegates lifecycle boot/activate/quit wiring to `main_process_lifecycle_runtime.cjs`.
  - Delegates split IPC handler registration to `overlay_phase_ipc_runtime.cjs`, `window_controls_ipc_runtime.cjs`, and `permission_ipc_runtime.cjs`.
  - Delegates surface/window ownership to `surface_runtime.cjs` and per-OS activation/protection/topmost policy to `window_platform_policy.cjs`.
  - Reads WindieOS-specific browser and macOS automation permission copy from `main_host_skin.cjs` so generic Electron permission adapters do not own product wording.
  - Preserves sender-display affinity through composition when chat surfaces open the dashboard.
- `main/main_host_skin.cjs`:
  - WindieOS-specific host copy for generic Electron agent-host adapters.
  - Browser automation, macOS automation, screen recording, Accessibility/input
    control, microphone, and workspace picker fallback, dialog, remediation, and
    permission-service messages should read from this skin/config boundary
    instead of being embedded in `main/index.cjs` or permission service modules.
  - Query send/disconnect fallback messages should also read from this boundary
    when main builds renderer-facing query error events.
  - Product identity such as agent display name and tray tooltip should read from
    this boundary instead of being embedded in host/runtime modules.
  - MCP client identity should be supplied by this boundary when Electron main
    refreshes extension MCP tools; the MCP runtime default remains generic.
  - Layer-log product prefixes should be supplied by this boundary on app/script
    paths; the shared log sink default remains generic.
  - Bundled wakeword and local-runtime reinstall guidance should read from this
    boundary on WindieOS app paths; reusable launch helpers keep generic
    fallback wording.
  - Local browser warmup and OpenAI Codex OAuth callback copy should read from
    this boundary on WindieOS app paths; local-runtime and OAuth helper modules
    keep generic fallback wording.
- `main/surface_runtime.cjs`:
  - Single owner for `mainWindow` / `chatWindow` / `responseWindow` refs plus response-overlay visibility + phase state.
  - Composes overlay positioning, wakeword visibility fan-out, blur-only capture prep, and one-time main-process IPC initialization behind one surface lifecycle boundary.
  - Exposes the window operations consumed by bootstrap/lifecycle modules (`showChatWindow`, `hideChatWindow`, `showMainWindow`, `applyResponseOverlayPhase`, `syncWindowDisplayAffinity`, VM worker shutdown).
- `main/response_overlay_visibility_policy.cjs`:
  - Pure shared policy for response-overlay window mode resolution, terminal restore eligibility, and chat-pill response-shell restore rules.
  - Keeps `response_overlay_phase_handler.cjs` and `window_visibility_runtime.cjs` on one shared policy contract instead of duplicating phase/restore branching.
- `main/chat_pill_trace_runtime.cjs`:
  - Gated main-process tracing for chat-pill and response-overlay transitions.
  - Emits `[ChatPillTrace][main]` payloads under `WINDIE_DEBUG_STREAM_EVENTS=1` or `WINDIE_DEBUG_CHAT_PILL=1`.
- `main/main_window_runtime.cjs`:
  - Constructs dashboard/chat/response/tray windows and lazy renderer-view loading.
  - Leaves cross-platform overlay policy to `window_platform_policy.cjs` instead of setting topmost/workspace/content-protection flags inline.
- `main/window_platform_policy.cjs`:
  - Centralizes per-platform `BrowserWindow` policy for overlay topmost level, workspace/fullscreen visibility, content protection, and activation/focus handoff.
  - Current contract keeps macOS/Windows overlay content protection tied to screenshot-capture leases rather than always-on window lifetime protection.
  - Keeps macOS/Windows/Linux window rules in one place so composition/runtime modules do not duplicate Electron platform conditionals.
- `main/ipc.cjs`:
  - Renderer-facing composition root for backend-bound work.
  - Imports `AgentClient` directly, delegates `client.wakeUp(...)` option
    assembly to `ipc_agent_wakeup_runtime.cjs`, keeps active adapter lifecycle
    state in `ipc_agent_runtime_lifecycle.cjs`, routes direct SDK command
    execution through `ipc_agent_sdk_runtime_commands.cjs`, keeps backend-message
    observer fan-out in `ipc_backend_message_observers.cjs`, shapes status
    payloads and broadcasts connection status through `ipc_status_payloads.cjs`,
    composes install-auth identity/registration context through
    `ipc_install_auth_context_runtime.cjs`, composes repeated session snapshots
    through `ipc_session_context_runtime.cjs`, routes backend event relay
    bookkeeping through `ipc_agent_backend_event_runtime.cjs`, applies
    response-overlay phase side effects through
    `ipc_response_overlay_phase_runtime.cjs`, resolves Agent SDK runtime
    conversation refs through `ipc_runtime_conversation_ref.cjs`, reads
    app-skin host copy through `ipc_host_copy_runtime.cjs`, keeps
    initialize-time host option handles in `ipc_host_option_state.cjs`, routes
    app-diagnostic append failure handling through
    `ipc_app_diagnostics_runtime.cjs`, keeps active query context state in
    `ipc_active_query_context.cjs`, projects replayed backend events through
    `ipc_conversation_event_projection.cjs`, keeps desktop UI config authority in
    `ipc_desktop_ui_config_store.cjs`, keeps live-turn cache state in
    `ipc_live_turn_state.cjs`, keeps cached
    AgentClient lifecycle in `ipc_agent_client_lifecycle.cjs`, and uses the returned
    `agent.conversation(...)` runtime for sends and stream projection.
  - Delegates backend websocket lifecycle, reconnect, endpoint fallback, idle
    disconnect, typed sends, local tool coordination, local-runtime startup/reuse,
    display rows, and current-turn projection to the SDK runtime.
  - Keeps Electron-only side effects in main: install-auth persistence,
    endpoint diagnostics, settings ACK gates, overlay phase changes, renderer
    IPC registration, and native window/screenshot policy.
  - Opens the Agent SDK connection on demand for backend-bound work instead of at app startup.
  - Handshake/user/session/conversation context propagation.
  - Settings sync ACK tracking (`settings-updated`/timeout handling).
  - Applies the renderer-owned `global_agent_stop_shortcut` preference locally in main while filtering that key out of backend `update-settings` payloads.
  - Query preprocessing before the `conversation.send` SDK command.
  - Artifact upload HTTP helper.
- `renderer/infrastructure/transcript/desktopConversationStore.ts`:
  - Renderer-side conversation store implementation for transcript projection
    helpers.
  - Calls SDK-shaped commands such as `conversation.appendEvent`,
    `conversation.replaceCompactedReplay`, `conversation.load`,
    `conversation.replaceRows`, and `conversations.list/search/delete`.
  - Local-runtime storage RPC names stay inside SDK store/local-runtime
    implementation code and Electron main local-runtime bridge internals.
- `renderer/app/runtime/desktopConversationSessionRuntime.ts`:
  - Shared renderer policy for conversation selection, local conversation creation, transcript-session sync, and active-chat projection.
  - Owns the normalization rules that decide when transcript session, chat-store projection, and backend bootstrap state may move foreground conversation focus.
- `renderer/features/chat/session/useRendererConversationSessionInfo.js`:
  - Renderer-facing current-conversation reader that prefers transcript session state and falls back to projected chat-store selection.
  - Keeps dashboard/chat controls from independently choosing between transcript session and `chatStore.activeConversationRef`.
- `main/sidecar/local_runtime_bridge.cjs`:
  - Registers scoped host IPC handlers for screenshot attachment, browser controls, and system state.
  - Uses `AgentClient` local-runtime resolvers from `ipc.cjs` as the only local-runtime Python daemon lifecycle and RPC transport path.
  - Uses `local_runtime_supervisor.cjs` only for renderer-visible local-runtime readiness/status snapshots.
  - Keeps Electron-only screenshot display bounds, artifact upload, and window visibility behavior out of the SDK.
  - Screenshot monitor resolution: visible sender-window display wins; otherwise screenshot tools fall back to the active query display affinity stored by `ipc.cjs`.
  - Screenshot args include virtual desktop bounds so local-runtime screenshot capture can keep monitor targeting deterministic; Windows/Linux crop from all-displays captures when needed, while macOS uses direct bounded capture to avoid Retina scaling drift.
  - Screenshot execution routes through `main/local_runtime_window_visibility.cjs`, which currently calls the local-runtime screenshot task directly.
- `main/window_visibility_runtime.cjs`:
  - Dashboard opens from the chat pill now target the sender display work area directly, avoiding Linux window-manager maximize hops that can reopen on the old monitor.
- `main/window_suppression_runtime.cjs`:
  - Owns offscreen screenshot suppression, suppression polling, and restore-bounds bookkeeping for dashboard capture prep.
- `main/overlay_window_helpers_runtime.cjs`:
  - Manual chat-pill drag position is stored in main and reused by later overlay positioning passes so recenter logic cannot fight a user drag.
- `main/wakeword_bridge.cjs`:
  - Wakeword subprocess lifecycle and framed stdout/stderr protocol handling.
  - Uses `wakeword_supervisor.cjs` to track process identity, readiness, enabled state, and terminal errors.
  - Binary length-prefixed detection frame parsing.
  - Enable/disable buffering policy to avoid stale detections.

## Renderer Responsibilities

### Provider and App Composition

- `renderer/app/App.jsx`: Root provider stack and dashboard shell mounting.
  - Startup route gate is VM mode + desktop onboarding slideshow completion.
  - No boot-time renderer permission gate in current `App.jsx`.
- `renderer/app/skin/windieDesktopSkin.js`:
  - WindieOS-specific renderer copy, tool catalog presentation, and display-safe
    runtime labels for the active renderer skin.
- `renderer/app/skin/desktopRuntimeSkin.js`:
  - Generic renderer-facing facade over the active chat desktop UI skin.
  - Exposes `desktopRuntimeSkin` plus helper access through
    `DesktopRuntimeSkin` rather than re-exporting product skin helpers
    directly.
  - Settings, memory, onboarding, and chat feature components should read
    product copy, app-specific tool catalog choices, destructive-action labels,
    panel wording, empty-state text, and renderer-local runtime fallback
    messages from this generic skin facade instead of importing the WindieOS
    skin/config directly or hard-coding WindieOS wording and
    local-runtime/hosted-backend runtime names inline.
- `renderer/app/skin/desktopRuntimeConfig.js`:
  - Generic renderer-facing facade over active model selection, provider
    credential, provider display, storage-key, and appearance-theme defaults
    supplied by the WindieOS chat desktop UI skin/config files.
  - Exposes those defaults and formatters through `DesktopRuntimeConfig` rather
    than passive re-exports from product skin/config modules.
  - Config storage, dashboard settings helpers, model cards, and chat model
    labels should import this facade instead of individual product skin/config
    modules.
- `renderer/app/skin/desktopRuntimeSkin.css`:
  - Generic renderer-facing stylesheet entrypoint for the active skin. The
    WindieOS icon asset remains in the product-specific skin stylesheet behind
    this facade.
- `renderer/app/providers/AppConfigProvider.jsx`:
  - Frontend config load/merge/save.
  - Persists renderer-owned config such as `global_agent_stop_shortcut` locally without syncing that key to the backend.
  - Backend settings sync, backend model-list routing.
  - Wakeword suppression and effective wakeword state.
- `renderer/app/providers/AppProvider.jsx`:
  - Config/status coordination and keyboard interaction-mode toggle.
- `renderer/app/providers/ChatProvider.jsx`:
  - Wires chat stream subscriptions for display projections.

### Chat Runtime

- `features/chat/stores/chatStore.ts`: canonical chat state + stream tracking.
- `renderer/app/runtime/desktopThreadPresentationRuntime.js`: pure
  `DesktopThreadPresentationRuntime` presentation facade that derives visible
  dashboard and overlay message rows from durable transcript state plus SDK
  current-turn presentation entries or legacy projection rows, including
  hidden-tool explanation rows and collapsed action summaries.
- `features/chat/hooks/useChatStream.ts`:
  - SDK-normalized conversation-event routing for transcript/session side effects, metadata, terminal materialization, and token-count handling.
  - Dashboard/response-overlay live assistant and tool rows come from SDK `windie:current-turn` projection state instead of backend-wire stream interpretation.
  - Conversation gating and turn tracking.
  - Dev transparency source tagging: in `electron:dev` (`dev_ui=1`), message/thinking/response surfaces show source badges mapped to stream/event origin (`streaming-response`, `tool-call`, `tool-output`, `llm-thought`, etc.).
  - Stream trace logging is separately gated by `WINDIE_DEBUG_STREAM_EVENTS=1`, which main process fans out as `?debug_stream=1` so renderer consoles stay quiet during normal `electron:dev` runs.
- `renderer/app/runtime/desktopChatPillSessionRuntime.ts`:
  - Pure renderer contract for chat-pill send lifecycle decisions (`query_send_with_capture` vs `query_send_without_capture`) and current overlay turn/view intent.
  - Gives `useChatMessageSender` and `ChatBoxResponse` one shared place to answer “what should the pill/response overlay do for this turn?”
- `renderer/app/runtime/desktopMessageSendUiRuntime.ts`:
  - Pure renderer send-surface policy for main-window vs overlay-chatbox return behavior.
- `renderer/app/runtime/desktopResponseOverlayViewRuntime.ts`:
  - Small renderer contract for `responseVisible` vs `awaitingVisible` vs hidden layout state.
  - Keeps awaiting typing and response overlay mode selection out of `ChatBoxResponse.jsx`.
- Electron main keeps one SDK conversation runtime per active conversation;
  renderer resume/open flows send intent and display rows rather than
  rebuilding provider history in renderer code.
- `renderer/infrastructure/transcript/desktopConversationStore.ts`:
  - Adapts desktop display projections, edit/resend rewrites, and compaction snapshots into canonical SDK conversation events.
  - Delegates local-runtime-backed conversation reads/writes to the SDK `LocalRuntimeConversationStore`.
  - Does not maintain hidden replay rows or legacy transcript fallback.
- `features/dashboard/components/DashboardShell.jsx`:
  - Global `Nuke chats` success handling now resets the active chat plus invalidates SDK-runtime hydration and conversation-workspace-binding caches so no local resume state survives a full transcript wipe.
- `features/dashboard/hooks/useDashboardConversations.js`:
  - Single-conversation delete now clears that chat's persisted workspace binding together with transcript/replay state so session-storage workspace metadata does not survive a conversation delete.
- `features/chat/components/ChatInterface.jsx`:
  - Provider + model selectors, stop/new-chat actions, speech toggle, retry/edit message flows.
  - Focused-window `Esc` stop handler wired to the same stop-query path as the stop button.
  - Reads current conversation identity from the merged renderer session snapshot rather than mixing transcript-session and chat-store lookups inline.
- `features/chat/components/MessageList.jsx`:
  - Message rendering + inline user-message editor.

### Permission Runtime

- `features/permissions/stores/permissionStore.js`:
  - Manifest/status fetch + gate-state derivation (`needsOnboarding`, required IDs, missing required permissions, `completedForManifest`).
  - Probe/recheck/request action helpers and onboarding-state persistence utilities.
- `features/permissions/components/PermissionStatusBadge.jsx`:
  - Shared settings-surface permission status pill rendering.

### Dashboard Runtime

- `features/dashboard/components/DashboardShell.jsx`:
  - Sidebar + modal surface orchestration.
  - Conversation search/recent grouping/open/rename/pin/delete actions.
  - `main-window-open-target` IPC target routing (`chat|settings|models|memory`).
- `features/dashboard/components/sections/SettingsSection.jsx`:
  - General settings controls for wakeword, TTS, and the configurable global stop shortcut.
  - Shortcut choices come from a shared platform catalog so the dashboard, onboarding, and main-process global registration stay aligned.
- `features/dashboard/hooks/useDashboardConversations.js`:
  - Extracted conversation runtime state: list/search fetch, open/rehydrate, rename/pin/delete handlers, transcript-entry polling.
  - Refreshes recent-chat metadata from public
    `windie:conversation-metadata-invalidated` events and reloads through
    SDK-shaped `conversations.list`; renderer code does not subscribe to raw
    local-runtime title updates.
- `features/dashboard/components/sections/MemorySection.jsx`:
  - Unified episodic/semantic/procedural view.
  - Fetch/delete memory through SDK-shaped `memories.*` commands.
  - Subscribes to SDK-owned `windie:memory-store-changed` invalidations and
    reloads memory lists for the active authenticated user.
  - Add/edit controls stay hidden until backed by durable memory create/update IPC.
- `features/dashboard/components/sections/ModelsSection.jsx`:
  - Provider-first model selection, fallback reconciliation, API-key section.

### Voice Runtime

- `features/voice/hooks/useWakewordDetection.ts`: wakeword PCM capture + confidence/cooldown gating.
- `features/voice/hooks/useVoiceMode.ts`: gateway websocket + live transcription streaming.
- `app/WakewordController.jsx`: backend wakeword event + chatbox show/focus behavior.

### Shared Infrastructure

- `infrastructure/ipc/bridge.ts`: typed channel wrappers over preload API.
- `app/runtime/desktopConversationRuntimeContracts.ts`: app-runtime
  conversation contracts facade over narrow `packages/windie-sdk-js` owner
  modules, used by renderer feature modules that need SDK conversation/runtime
  types.
- `app/runtime/desktopConversationContinuityService.ts` and `app/runtime/desktopConversationLibraryClient.js`: replay, rehydrate, list/load/delete/search through the SDK `LocalRuntimeConversationStore` via the desktop conversation store factory.
- `app/runtime/desktopTranscriptSessionRuntimeClient.ts`: active transcript conversation/user identity facade.
- `features/chat/session/useRendererConversationSessionInfo.js`: merged renderer current-session reader for user-facing surfaces.
- `infrastructure/services/toolExecution/*`: retained display and capture timing helpers; backend tool execution is owned by the SDK runtime in Electron main and the local-runtime Python executor.
- Electron main owns screenshot-capture window policy through the local tool lifecycle and platform screenshot/content-protection runtimes; renderer surface orchestration is limited to system-capture focus logging.
- `infrastructure/audio/PlayerService.ts`: chunk queue decode/playback.

## Local-Runtime Python Responsibilities (`frontend/src/main/python`)

- `local_backend.py`:
  - JSON-RPC method registry for tool/system-state/transcript/memory operations.
  - Memory summarization watermark logic and transcript routing.
- `tools/registry.py`:
  - Canonical local-runtime exposed tool surface for backend contract parity.
- `memory/local_store.py`:
  - SQLite + FAISS local storage.
  - Separate episodic/semantic stores and vector mapping sync.
  - SDK-provided embedding storage/search and backend semantic summarization integration.
- `core/system_state.py` + `core/platform/*`:
  - OS-aware active-window/mouse/display/system-state probes.

## Current Frontend Refactor Notes (2026-02-26)

Canonical current behavior that replaced older module splits:

- Token counter UI component removed from active renderer surfaces.
- Memory panel consolidated into `MemorySection` + `MemoryItem`; old `EpisodicMemorySection`/`SemanticMemorySection` split is retired.
- Tool ghost lifecycle moved away from old `useToolGhostLifecycle.js` + `toolGhostPreview.js` utility ownership.
- Dashboard utility storage/settings helper split changed; provider/model/memory helpers now live in section-local data/helper files.
- Stream updater logic now centralized in `useStreamMessageUpdaters.ts`; transcript replay, display projection, and stored message shape logic live under renderer transcript infrastructure.

Use inventory docs as source of truth before touching older deep references.
