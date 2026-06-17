---
summary: "Codebase-wide goal plan for making the desktop UI and host runtime generic SDK consumers while keeping WindieOS-specific behavior in the SDK and backend."
title: "General Agent UI Runtime Boundary Plan"
---

# General Agent UI Runtime Boundary Plan

Date: 2026-06-16

## Goal

Make the application codebase read as a general desktop UI and host runtime for
an agent SDK, while keeping WindieOS-specific agent behavior, orchestration,
memory, tool semantics, and provider policy behind SDK and backend contracts.

The renderer should behave like a normal chatbot UI with desktop presence: it
renders conversation rows, current-turn state, titles, search, text formatting,
settings, and auxiliary windows. It should not encode private knowledge of how
the agent loop, backend, sidecar, tools, storage, memory, or provider replay
work internally.

The desktop host should behave like a general Electron shell for an agent SDK:
it owns windows, overlays, permissions, IPC, shortcuts, process lifecycle, and
local machine integration, but it should not become a second implementation of
the agent runtime.

The SDK should be the reusable contract boundary. It should make agent
implementation, local runtime integration, conversation projection, tool
coordination, storage, and host adaptation simple for any UI or desktop shell.

The backend should remain the WindieOS-specific hosted authority for provider
policy, prompt construction, orchestration, remote tools, deploy/runtime
operations, and server-side trust boundaries.

## Desired End State

- UI code consumes stable SDK projections and commands instead of interpreting
  backend, sidecar, storage, or tool internals.
- Desktop host code adapts the operating system to SDK interfaces instead of
  owning agent-loop semantics.
- SDK code exposes general client/runtime contracts that can support the
  first-party desktop app, a CLI, and third-party UIs without copying behavior.
- Backend code owns hosted policy and provider-specific behavior without
  leaking those details into renderer or host UI code.
- Local machine authority remains explicit, permissioned, observable, and
  separated from model-facing prompt/runtime logic.
- Compatibility shims, duplicate interpretation tables, alias paths, fallback
  bridges, and stale surfaces are deleted when no verified dependency requires
  them.
- Docs describe boundaries by product contract and runtime ownership, not by
  historical implementation accidents.

## Guiding Principles

- Prefer one source of truth for every runtime concept.
- Keep UI state presentational, derived, and replaceable.
- Keep SDK contracts public, typed, and reusable.
- Keep backend policy server-owned and provider-aware.
- Keep local authority near the machine boundary and behind explicit
  permission/manifest contracts.
- Delete duplicate bridges before adding new ones.
- Normalize at boundaries, fail fast on invalid state, and make invalid states
  visible through diagnostics.
- Preserve behavior while moving ownership; do not trade duplication for a
  hidden regression.
- Make every cleanup testable through focused contract, projection, parity, or
  boundary tests.

## Cleanup Direction

The work should proceed as a codebase-wide convergence effort:

1. Identify places where presentation code understands runtime internals.
2. Move durable semantics to SDK or backend contracts as appropriate.
3. Replace private adapters with public SDK-shaped commands, projections, or
   manifests.
4. Remove compatibility paths once callers have converged.
5. Update docs and tests to lock in the new ownership boundary.
6. Repeat until each runtime is small in responsibility, even if not tiny in
   line count.

## Success Criteria

- A new UI can render conversations using SDK-provided display/current-turn
  state without reimplementing WindieOS runtime rules.
- The desktop shell can be understood as an SDK host plus OS integration, not
  as a custom agent runtime.
- Renderer-specific code remains understandable as UI, formatting, interaction,
  and window presentation.
- Runtime semantics are tested at the layer that owns them.
- Cross-runtime contracts are documented and validated.
- Removed surfaces stay removed through tests or docs search routing.
- No migration is required unless a public persisted, API, tool-schema, event,
  settings, or storage contract changes.

## Validation Expectations

For each implementation slice, validate the owning boundary rather than only
the downstream consumer:

- Projection and conversation changes should be covered where the projection is
  built.
- UI changes should prove the UI consumes the public projection/command surface.
- Host changes should prove OS integration behavior without duplicating SDK
  semantics.
- Tool, permission, storage, or event-contract changes should include parity or
  contract tests.
- Security-sensitive changes should check permission, IPC, credential,
  machine-path, and tool-execution boundaries.

## Completion Note Template

Each completed slice should report:

- what ownership moved or was simplified
- what duplicate or obsolete path was removed
- what behavior changed, if any
- validation performed
- migration or compatibility note, including "no migration required"

## Progress Notes

### 2026-06-17 renderer local runtime status store

- Finding: renderer browser-session and dashboard consumers still imported a
  local backend status store even though they only need local runtime readiness.
- Change: renamed the renderer status store and exports to local-runtime
  terminology while preserving the existing IPC channel names and broader
  browser-session snapshot fields.
- Validation: focused Jest run for `LocalRuntimeStatusStore`,
  `BrowserSessionStore`, and `UseDashboardConversations`.
- Compatibility: no migration required. IPC channel names and browser-session
  `localBackendReady` compatibility fields remain unchanged.

### 2026-06-17 main screenshot task seam

- Finding: Electron main still had a screenshot visibility platform module whose
  only behavior was to call the provided task, leaving a duplicate ownership
  hop in the local screenshot execution path.
- Change: deleted the pass-through module and kept
  `local_backend_bridge_window_visibility.cjs` as the direct screenshot task
  seam while updating docs to describe the current owner.
- Validation: focused Jest run for `LocalBackendBridgeWindowVisibility`.
- Compatibility: no migration required. Screenshot tool routing and task error
  propagation remain unchanged.

### 2026-06-17 renderer browser session runtime readiness

- Finding: the renderer browser-session store exposed `localBackendReady` even
  though readiness now comes from the local runtime status store.
- Change: renamed the renderer browser-session snapshot/control field to
  `localRuntimeReady`; diagnostics tests that cover separate app diagnostic
  compatibility payloads remain unchanged.
- Validation: focused Jest run for `BrowserSessionStore` and
  `ChatBrowserSessionControl`.
- Compatibility: no migration required. IPC status channel names remain
  unchanged.

### 2026-06-17 renderer dashboard local runtime reload

- Finding: the dashboard recent-conversation reload hook still used
  local-backend naming while subscribing to the local runtime status store.
- Change: renamed the callback, test wording, and reload reason to
  local-runtime readiness terminology.
- Validation: focused Jest run for `UseDashboardConversations`.
- Compatibility: no migration required. IPC status channel names remain
  unchanged.

### 2026-06-17 renderer conversation list transient errors

- Finding: the desktop conversation library facade still used local-backend
  wording as the primary transient startup error match for recent conversation
  loads.
- Change: added local-runtime transient error wording and updated focused tests,
  while retaining the legacy local-backend phrase as compatibility for older
  error payloads.
- Validation: focused Jest run for `DesktopConversationLibraryClient` and
  `DashboardConversationLoad`.
- Compatibility: no migration required. Existing local-backend error text still
  triggers retry behavior.

### 2026-06-17 main browser automation readiness copy

- Finding: the WindieOS host skin still presented browser automation startup
  failure copy as "local backend" readiness even though the host adapter depends
  on the SDK local runtime.
- Change: updated the user-facing copy to local-runtime wording while preserving
  the then-current permission adapter wiring; a later main host skin slice
  renames the injected key to local-runtime terminology.
- Validation: focused Jest run for `MainHostSkinBoundary`.
- Compatibility: no migration was required for that copy-only slice.

### 2026-06-17 sidecar browser helper copy

- Finding: reusable sidecar browser/tool helper docstrings still described the
  helper layer as Windie-owned or local-backend-specific.
- Change: updated helper copy to local-sidecar-runtime terminology and added a
  source-boundary test for the selected helper modules.
- Validation: focused pytest run for `test_browser_registry` plus a source scan
  for the old helper-copy phrases.
- Compatibility: no migration required. This is source copy only; tool schemas
  and runtime behavior are unchanged.

### 2026-06-17 main sidecar adapter headers

- Finding: Electron main sidecar adapter modules still introduced themselves as
  local-backend bridges even when their responsibility is host-side sidecar
  process, status, tool, screenshot, and window adaptation.
- Change: updated adapter module headers to local-sidecar/runtime terminology
  while preserving filenames, exported function names, IPC channel names, and
  diagnostic labels.
- Validation: focused Jest run for `MainHostSkinBoundary` plus a sidecar module
  header scan for the old wording.
- Compatibility: no migration required. Public bridge compatibility names and
  runtime behavior remain unchanged.

### 2026-06-17 UI send-failure connection copy

- Finding: renderer and main-process send-failure copy told users to wait for
  "the backend" to reconnect, leaking transport/runtime internals into UI copy.
- Change: changed renderer skin, main host skin, and the generic query-event
  fallback to connection-oriented wording.
- Validation: focused Jest run for `ChatMessageSender`, `IpcMainBridge.query`,
  `MainHostSkinBoundary`, and `RendererSkinConfigBoundary`, plus a source scan
  for the old phrase.
- Compatibility: no migration required. This is user-facing copy only; event
  payload shape and send-failure behavior are unchanged.

### 2026-06-17 dashboard startup retry terminology

- Finding: the dashboard integration test for startup conversation retries used
  the legacy local-backend readiness phrase as its primary scenario even though
  the renderer facade now prefers local-runtime readiness.
- Change: updated the dashboard test name and simulated startup error to
  local-runtime wording while retaining legacy phrase compatibility coverage in
  the conversation library facade tests.
- Validation: focused Jest run for `ChatGptDashboardShell`; the suite passed
  with existing React `act(...)` warnings.
- Compatibility: no migration required. Test-only terminology alignment.

### 2026-06-17 Python sidecar runtime copy

- Finding: Python sidecar runtime docstrings and lifecycle logs still described
  the process as a local backend service even though it is the local sidecar
  runtime boundary for tools, system state, memory, and wake-word operations.
- Change: updated sidecar runtime, memory-handler, and core package copy to
  local-sidecar-runtime terminology while preserving the `LocalBackend` class
  and file names as compatibility surfaces.
- Validation: focused pytest for the sidecar runtime source-copy guard plus a
  source scan for the old lifecycle phrases.
- Compatibility: no migration required. Protocol names, class names, file names,
  and runtime behavior are unchanged.

### 2026-06-17 Python sidecar module docs copy

- Finding: the sidecar entrypoint module docstring and folder-structure doc
  still described `local_backend.py` as a WindieOS/local-backend service.
- Change: updated those descriptions to local-sidecar-runtime terminology and
  extended the sidecar source-copy guard to cover the folder-structure doc.
- Validation: focused pytest for the source-copy guard plus a source scan for
  the old module/doc phrases.
- Compatibility: no migration required. Entrypoint filename and JSON-RPC
  protocol behavior are unchanged.

### 2026-06-17 diagnostics sidecar owner copy

- Finding: main-process diagnostics registry copy still described browser and
  lifecycle diagnostics as owned by a local-backend bridge even though the
  Electron host is adapting the local sidecar runtime.
- Change: updated diagnostics owner and purpose copy to local-sidecar bridge
  terminology while preserving diagnostic path names and payload fields.
- Validation: source scan for the old diagnostics owner/purpose phrases. The
  focused `AppDiagnosticsStore` Jest suite could not run in this environment
  because the `sqlite3` CLI is not installed (`spawnSync sqlite3 ENOENT`).
- Compatibility: no migration required. Diagnostic path ids, event payloads,
  and persisted field names are unchanged.

### 2026-06-17 frontend sidecar docs ownership copy

- Finding: frontend sidecar browser docs still described local browser helpers
  and Browser Use adapters as Windie-owned behavior, and query-send failure docs
  still showed the old "backend reconnects" user-facing copy.
- Change: updated sidecar browser docs to name adapter-owned/local-sidecar
  responsibilities, kept dedicated WindieOS browser profile facts where they
  describe product-specific storage, and aligned query-send failure examples
  with connection-oriented copy.
- Validation: docs navigation listing plus a source scan for the old docs
  phrases; the only remaining `Local backend not ready` mention in this slice
  is the explicit legacy transient-error compatibility note.
- Compatibility: no migration required. Documentation-only boundary alignment.

### 2026-06-17 renderer agent runtime transport naming

- Finding: the renderer SDK-command adapter was still named
  `desktopBackendTransport`, making generic UI/runtime code read as if it owned
  backend transport semantics instead of adapting UI calls into SDK runtime
  commands.
- Change: renamed the renderer facade and focused tests/docs to
  `desktopAgentRuntimeTransport` / `DesktopAgentRuntimeTransport` while
  preserving the SDK `BackendTransport` type and `windie:invoke` wire contract.
- Validation: focused Jest runs for `DesktopAgentRuntimeTransport`,
  `RendererApiClientBoundary`, `RendererAppRuntimeBoundary`,
  `DesktopSettingsRuntimeClient`, `DesktopVoiceRuntimeClient`, targeted
  `WindieDocsIndex` routing, docs listing, and a source scan for the retired
  renderer transport name.
- Compatibility: no migration required. This is an internal renderer module
  rename; SDK transport type names and IPC command strings remain unchanged.

### 2026-06-17 renderer audio chunk event parser naming

- Finding: the renderer chat audio parser still used backend-prefixed naming,
  making a generic chat utility read as if it owned backend event semantics
  instead of validating the renderer `audio-chunk` side-channel payload.
- Change: renamed the parser and focused test/docs references to
  `audioChunkEvents` / `AudioChunkEvents` while preserving the
  `audio-chunk` event name, payload shape, and playback listener path.
- Validation: focused Jest run for `AudioChunkEvents` and
  `ChatInterfaceWiring`, docs listing, `git diff --check`, and a source scan
  for the retired parser name.
- Compatibility: no migration required. This is an internal renderer module
  rename; websocket event names, IPC channels, and playback behavior are
  unchanged.

### 2026-06-17 renderer model catalog metadata wording

- Finding: the renderer model option builder and its route docs still described
  explicit reasoning-mode order and family metadata as backend-owned, even
  though the UI consumes a normalized model catalog shape.
- Change: renamed the internal ordered-mode variable and focused test/docs copy
  to runtime/model-catalog terminology while preserving the snake-case metadata
  fields received from the runtime.
- Validation: focused Jest run for `ChatModelOptions`, docs listing,
  `git diff --check`, and a source scan for the retired model-options wording.
- Compatibility: no migration required. Model metadata fields, settings sync,
  and selected-model behavior are unchanged.

### 2026-06-17 renderer app config runtime sync naming

- Finding: the renderer app config helper and tests were still named
  backend-sync even though the renderer boundary filters config for the desktop
  settings runtime facade and defers model selection to query-time commands.
- Change: renamed the helper/test to `appConfigRuntimeSync`, renamed immediate
  config helpers to runtime-sync terminology, updated renderer imports/docs,
  and tightened stale storage-test expectations around `saveConfigToStorage`.
- Validation: focused Jest run for `AppConfigRuntimeSync`,
  `ManualCompactionRuntime`, `RendererSettingsRuntimeBoundary`, and
  `AppConfigProvider.storageAndIpc`; docs listing; `git diff --check`; and a
  source scan for the retired helper name and sync option names.
- Compatibility: no migration required. Settings payload fields, IPC channels,
  backend ACK events, and selected-model behavior are unchanged.

### 2026-06-17 renderer settings capability event test naming

- Finding: the Agent settings test named the captured
  `agent-capability-event` callback as a backend handler, and the renderer
  feature matrix described settings integration as backend-driven.
- Change: renamed the test callback to capability-event terminology and aligned
  the feature matrix with runtime-driven model list/event integration.
- Validation: focused Jest run for `AgentSettingsTab`, docs listing,
  `git diff --check`, and a source scan for the retired test callback name.
- Compatibility: no migration required. Event channel names and settings UI
  behavior are unchanged.

### 2026-06-17 renderer browser session runtime status variable

- Finding: the browser session store consumed
  `getLocalRuntimeStatusSnapshot()` but still used backend-prefixed naming for
  the snapshot.
- Change: renamed the local variable to `runtimeStatus` while preserving
  snapshot fields, diagnostics, and browser sync behavior.
- Validation: focused Jest run for `BrowserSessionStore`, `git diff --check`,
  and a source scan for the retired variable name.
- Compatibility: no migration required. Browser-session snapshot shape,
  diagnostic stage names, and IPC behavior are unchanged.

### 2026-06-17 renderer config settings event router naming

- Finding: app config/status providers named settings-channel callbacks and the
  config event router as backend-prefixed events even though the renderer
  boundary consumes settings/model runtime events from the typed settings
  channel.
- Change: renamed the config router and provider callbacks to settings-event
  terminology, updated tests/docs, and tightened stale storage expectations in
  the model provider suite.
- Validation: focused Jest run for `AppConfigEvents`, `AppStatusProvider`, and
  `AppConfigProvider.models`; docs listing; `git diff --check`; and a
  stale-name scan for the retired callback/router names.
- Compatibility: no migration required. Settings channel name, event payloads,
  settings ACK behavior, and model-list handling are unchanged.

### 2026-06-17 renderer app config IPC listener test naming

- Finding: shared AppConfig provider test utilities used backend-prefixed
  listener names even when capturing generic renderer IPC channels such as
  status and wakeword events.
- Change: renamed the shared test listener helpers to IPC-listener terminology
  and renamed settings-event emitters/titles in AppStatus coverage while
  preserving channel constants and payloads.
- Validation: focused Jest run for `AppConfigProvider.models`,
  `AppConfigProvider.storageAndIpc`, and `AppStatusProvider`; `git diff
  --check`; and a stale-name scan for the retired test helper names.
- Compatibility: no migration required. This is test-only naming cleanup; IPC
  channels, provider behavior, and settings status transitions are unchanged.

### 2026-06-17 renderer app config runtime connection snapshot naming

- Finding: `AppConfigProvider` tracked IPC status snapshots with
  backend-prefixed connection names even though the renderer boundary only needs
  to know whether the settings runtime is ready for non-model config sync.
- Change: renamed the connection ref/callback to runtime terminology, updated
  focused AppConfig provider tests, and aligned config lifecycle docs with
  settings-runtime sync wording.
- Validation: focused Jest run for `AppConfigProvider.models` and
  `AppConfigProvider.storageAndIpc`; docs listing; `git diff --check`; and a
  stale-name scan for the retired connection snapshot names.
- Compatibility: no migration required. IPC status payloads, backend URL
  metadata, settings sync behavior, and deferred model-selection behavior are
  unchanged.

### 2026-06-17 renderer UI runtime transport test wording

- Finding: renderer UI tests described `ipc-status` presentation behavior and
  desktop runtime facade failures as backend transport behavior, even when they
  were not exercising the SDK `BackendTransport` contract.
- Change: renamed the focused test titles to runtime transport/settings runtime
  wording while leaving backend-shaped mock errors and SDK transport tests
  unchanged.
- Validation: focused Jest run for `ChatLoopUiStateHook`,
  `ChatInterfaceWiring`, `AppStatusProvider`, and
  `DesktopVoiceRuntimeClient`; `git diff --check`; and a stale-title scan.
- Compatibility: no migration required. This is test-only wording cleanup; UI
  state, IPC status handling, voice runtime commands, and save-status timing are
  unchanged.

### 2026-06-17 renderer voice transcription gateway wording

- Finding: the renderer voice hook and deep reference described voice mode as
  connecting to a backend-owned transcription websocket even though the hook
  now delegates gateway URL creation, websocket creation, protocol messages, and
  inbound normalization to `DesktopVoiceRuntimeClient`.
- Change: updated hook comments, voice runtime boundary test wording, and the
  voice gateway reference to describe the renderer as a desktop transcription
  gateway consumer while keeping backend provider-policy ownership explicit.
- Validation: focused Jest run for `VoiceModeHook` and
  `RendererVoiceRuntimeBoundary`; docs listing; `git diff --check`; and a
  stale-phrase scan for the retired backend-owned websocket wording.
- Compatibility: no migration required. Gateway URL shape, websocket protocol,
  audio framing, reconnect behavior, and backend provider routing are
  unchanged.

### 2026-06-17 main local runtime status broadcaster naming

- Finding: Electron main status broadcaster internals still used
  local-backend function names even though the payload is composed from the
  local runtime supervisor and SDK local runtime daemon snapshot.
- Change: renamed the internal status payload/send helpers and immediate bridge
  call sites to local-runtime terminology while preserving the compatibility
  filename, `local-backend-status` channel, and payload fields.
- Validation: focused Jest run for `LocalBackendStatusBroadcaster` and
  `LocalBackendBridge.lifecycle`; docs listing; `git diff --check`; and a
  stale-name scan for the retired helper names.
- Compatibility: no migration required. IPC channel names, status payload
  shape, lifecycle diagnostics, and renderer readiness behavior are unchanged.

### 2026-06-17 main local runtime ready helper naming

- Finding: `local_backend_bridge.cjs` still named the helper that marks the SDK
  local runtime supervisor ready as backend-ready.
- Change: renamed the helper and focused lifecycle test title to local-runtime
  readiness terminology.
- Validation: focused Jest run for `LocalBackendBridge.lifecycle`;
  `git diff --check`; and a stale-name scan for the retired helper/test wording.
- Compatibility: no migration required. Status supervisor behavior,
  `local-backend-status` payloads, and SDK runtime bootstrap behavior are
  unchanged.

### 2026-06-17 main local runtime bridge failure copy

- Finding: local sidecar bridge fallback errors still described SDK local
  runtime bridge failures as local-backend bridge failures.
- Change: updated initialization/stopped fallback error copy and focused
  lifecycle expectations to local-runtime bridge terminology.
- Validation: focused Jest run for `LocalBackendBridge.lifecycle`; `git diff
  --check`; and a stale-phrase scan for the retired error strings.
- Compatibility: no migration required. Public bridge method names,
  `local-backend-status` compatibility channel names, and failure control flow
  are unchanged.

### 2026-06-17 renderer chat conversation event listener wording

- Finding: renderer chat tests/docs still described `useChatStream`'s
  `windie:conversation-event` subscription with backend-prefixed listener
  wording even though backend websocket packets are normalized before renderer
  ingress.
- Change: renamed focused test/docs wording to conversation-event listener
  terminology while leaving SDK/backend transport tests and backend-shaped
  fixtures unchanged.
- Validation: focused Jest run for `ChatStreamThinkingStatus.transcript`, docs
  listing, `git diff --check`, and a stale-phrase scan for the retired renderer
  listener wording.
- Compatibility: no migration required. `windie:conversation-event` channel,
  SDK conversation-event payloads, turn gating, and transcript behavior are
  unchanged.

### 2026-06-17 renderer provider settings listener wording

- Finding: the App provider coordinator reference still described save-status
  cleanup with backend-prefixed listener wording even though the renderer
  subscribes to the settings-event IPC channel through the app runtime facade.
- Change: updated the provider reference to settings-event listener terminology
  while keeping backend settings acknowledgement ownership explicit elsewhere.
- Validation: focused Jest run for `AppStatusProvider` and
  `AppConfigProvider.models`; docs listing; `git diff --check`; and a stale
  provider-doc phrase scan for the retired listener wording.
- Compatibility: no migration required. `backend-settings-event` channel names,
  save-status timers, settings acknowledgement routing, and model-list handling
  are unchanged.

### 2026-06-17 main local runtime readiness naming

- Finding: browser automation capability verification stored the local runtime
  bridge readiness response in a backend-prefixed local variable, and the
  lifecycle reference still described quit cleanup as stopping a local backend
  sidecar process.
- Change: renamed the immediate runtime-readiness variable to local-runtime
  terminology, renamed the chat stream test utility's conversation-event
  handler variable, and updated the main lifecycle reference to describe SDK
  local runtime bridge shutdown.
- Validation: focused Jest run for `MainHostSkinBoundary` and
  `ChatStreamThinkingStatus.transcript`; docs listing; `git diff --check`; and
  stale-name scans for the retired local handler/status wording.
- Compatibility: no migration required. `get-local-backend-status`,
  `local-backend-status`, and `backend_status` compatibility payload names are
  unchanged.

### 2026-06-17 main host skin local runtime copy

- Finding: the WindieOS main host skin exposed local-runtime readiness and
  browser warmup copy through backend-prefixed skin keys even though the main
  process now adapts an SDK local runtime bridge.
- Change: renamed the internal host-skin copy keys and bridge locals to
  local-runtime terminology, and updated the host-skin boundary test to require
  the new names.
- Validation: focused Jest run for `MainHostSkinBoundary`; docs listing; `git
  diff --check`; and stale-name scans for the retired skin/bridge copy names.
- Compatibility: no migration required. Public bridge filenames, exported
  bridge functions, IPC channel names, and compatibility payload fields are
  unchanged.

### 2026-06-17 renderer voice gateway docs boundary

- Finding: renderer voice references still described `useVoiceMode` as owning a
  backend transcription websocket directly even though the hook delegates
  gateway URL resolution, socket creation, protocol messages, and inbound
  normalization to `DesktopVoiceRuntimeClient`.
- Change: updated renderer voice docs and the renderer folder map to describe
  the desktop voice runtime gateway as the renderer boundary while keeping
  backend provider-policy ownership explicit.
- Validation: focused Jest run for `RendererVoiceRuntimeBoundary` and
  `DesktopVoiceRuntimeClient`; docs listing; `git diff --check`; and a stale
  phrase scan for the retired direct-backend websocket wording.
- Compatibility: no migration required. Gateway URL shape, websocket protocol,
  audio framing, wakeword IPC, and backend provider routing are unchanged.

### 2026-06-17 renderer conversation-event ingress fail-safe

- Finding: `desktopChatStreamIngressRuntime` had lost the documented
  best-effort isolation around active-conversation projection, turn-map
  registration, and transcript session sync after the SDK conversation-event
  migration, so a side-channel exception could suppress primary event dispatch.
- Change: restored best-effort isolation in the SDK `ConversationEvent` ingress
  helper, added focused tests for projection/turn-map/transcript failures, and
  renamed the stale backend-ingress reference to conversation-event ingress
  terminology.
- Validation: focused Jest run for `DesktopChatStreamIngressRuntime` and
  `RendererChatRuntimeBoundary`; docs listing; `git diff --check`; and stale
  scans for removed raw-backend ingress helper/doc references.
- Compatibility: no migration required. `windie:conversation-event`,
  `ConversationEvent` payload shape, transcript-session IPC, and chat store
  workspace routing are unchanged.

### 2026-06-17 docs search runtime-owner routing on Windows

- Finding: `bin/windie docs search` scored docs using Windows-style repo paths,
  but hub/ADR/history path checks only matched forward slashes. This let ADRs
  outrank current hubs and left several boundary-owner queries tied with broad
  workflow docs.
- Change: normalized docs-search paths before hub/ADR/history checks and
  strengthened canonical owner docs for sidecar daemon discovery, OCR vision,
  transcription stream, computer-use screenshots, renderer voice capture
  cleanup, core interface exports, and provider completion parsing.
- Validation: focused Jest run for `WindieDocsIndex`; docs listing; and `git
  diff --check`.
- Compatibility: no migration required. This changes only docs-search routing
  and documentation metadata/headings; runtime behavior and docs paths are
  unchanged.

### 2026-06-17 main lifecycle local runtime shutdown dependency

- Finding: the generic main-process lifecycle runtime still depended on a
  `stopLocalBackend` shutdown hook and logged `cleanup=subprocesses`, even
  though the lifecycle boundary should only know that it is stopping the SDK
  local runtime bridge and VM worker runtime.
- Change: renamed the lifecycle dependency to `stopLocalRuntime`, adapted the
  existing bridge export at `index.cjs`, updated shutdown logging/tests, and
  aligned the lifecycle reference with SDK local runtime shutdown wording.
- Validation: focused Jest run for `MainProcessLifecycleRuntime`; stale-name
  scan confirming `stopLocalBackend` remains only at the bridge adapter edge;
  docs listing; and `git diff --check`.
- Compatibility: no migration required. The bridge export name and shutdown
  behavior are unchanged; only the generic lifecycle dependency name and log
  copy changed.

### 2026-06-17 main window bootstrap local runtime bridge dependency

- Finding: generic main-window/bootstrap runtime wiring still passed
  `initializeLocalBackendBridge` through the window creation surface, even
  though the local-backend name belongs at the sidecar bridge adapter edge.
- Change: renamed the bootstrap and main-window dependency to
  `initializeLocalRuntimeBridge`, adapted the existing compatibility bridge
  export at `index.cjs`, and updated focused bootstrap/window tests and docs.
- Validation: focused Jest run for `MainProcessBootstrapRuntime` and
  `MainWindowRuntime`; stale-name scan confirming the old initializer remains
  only in bridge docs and the `index.cjs` adapter edge; docs listing; and `git
  diff --check`.
- Compatibility: no migration required. The sidecar bridge export and
  initialization behavior are unchanged; only generic main-process dependency
  names moved to local-runtime wording.

### 2026-06-17 renderer settings runtime event wording

- Finding: renderer settings hook/docs still described model-list and
  save-status flows as backend events/listeners even though renderer providers
  consume settings-runtime events through the app runtime facade.
- Change: updated the settings hook comment plus provider/config lifecycle docs
  to use settings-runtime and settings-event listener wording.
- Validation: focused Jest run for `SettingsManagementHook`,
  `AppConfigProvider.models`, and `AppStatusProvider`; stale-phrase scan; docs
  listing; and `git diff --check`.
- Compatibility: no migration required. Settings-event channels, backend
  settings ownership, model-list payloads, and save-status behavior are
  unchanged.

### 2026-06-17 renderer model settings list-models route wording

- Finding: the model settings change workflow still diagrammed model-list
  delivery through the retired raw backend IPC route, even though generic raw
  backend IPC was removed and renderer settings consumes `models-listed`
  through the settings-event route.
- Change: updated the workflow sequence to show
  `DesktopSettingsRuntimeClient.listModels()`, SDK websocket list-models, and
  settings-event `models-listed` delivery.
- Validation: docs listing; `git diff --check`; and a stale scan for retired
  raw-backend model-list wording.
- Compatibility: no migration required. The `backend-settings-event`
  compatibility channel, SDK list-models command, and model-list payload shape
  are unchanged.

### 2026-06-17 frontend typed stream fan-out docs

- Finding: several frontend inventory and runtime workflow docs still described
  current stream delivery as generic raw backend fan-out, even though renderer
  stream state now enters through SDK conversation-event projections and typed
  backend side channels.
- Change: updated the inventory, websocket/settings-sync, query-send,
  overlay-phase, audio playback, IPC helper, and replay docs to describe
  `windie:conversation-event`, SDK current-turn/pending-turn snapshots, and
  typed settings/capability/audio side-channel delivery.
- Validation: docs listing; `git diff --check`; stale scan for current-path raw
  backend fan-out wording; code inspection of `ipc_renderer_windows.cjs`,
  `ipc_runtime_helpers.cjs`, and `ipc_backend_event_channels.cjs`.
- Compatibility: no migration required. Channel names, replay behavior,
  settings/capability/audio side channels, and SDK projection payloads are
  unchanged.

### 2026-06-17 frontend user-message and tool-result ownership docs

- Finding: frontend inventory and query workflow docs still said Electron main
  broadcast a synthetic `local-user-message` and renderer tool execution owned
  backend callback fanout, even though SDK `ConversationRuntime` emits the
  authoritative `user_message` projection and SDK tool coordination sends tool
  results.
- Change: updated the inventory, query-send, query-payload, and protocol-state
  docs to route user-message projection and tool-result delivery through the SDK
  runtime boundary, then expanded the modular boundary test stale-doc scan to
  catch those old phrases.
- Validation: docs listing; `git diff --check`; focused stale scans for the old
  local-user-message and backend callback wording; and the modular refactor
  boundary test.
- Compatibility: no migration required. Renderer optimistic rows,
  `windie:conversation-event`, send-failure errors, and SDK tool-result payloads
  are unchanged.

### 2026-06-17 main hosted backend defaults skin config

- Finding: the generic Electron backend endpoint resolver still hardcoded the
  WindieOS hosted HTTP and websocket defaults, even though hosted product
  defaults belong to WindieOS skin/config rather than the generic main host
  resolver.
- Change: moved the canonical hosted backend URLs into `main_host_skin` as
  `hostedBackend` config and changed `backend_endpoints.cjs` to read those
  defaults from the skin while preserving env override behavior.
- Validation: focused backend endpoint tests, main host skin boundary test, docs
  listing, `git diff --check`, and a source scan showing the hosted URLs no
  longer appear in the generic resolver.
- Compatibility: no migration required. Default endpoint values, `BACKEND_*`
  overrides, `WINDIE_DEFAULT_BACKEND_*` overrides, and endpoint output shapes
  are unchanged.

### 2026-06-17 main permission state fallback filename

- Finding: the generic permission state store still used a WindieOS-specific
  hidden filename for its no-user-data fallback path, even though normal app
  storage is already supplied through Electron `userDataPath`.
- Change: changed the fallback filename prefix to generic desktop-agent wording
  and added focused store coverage for the fallback resolver.
- Validation: focused permission state store test, docs listing,
  `git diff --check`, and source scan for the retired fallback filename.
- Compatibility: no migration required. Packaged/source runtime callers pass
  `userDataPath` or explicit `statePath`, so persisted permission state paths
  are unchanged outside the no-user-data fallback.

### 2026-06-17 main install auth fallback directory

- Finding: the install-auth state helper still used a WindieOS-specific temp
  fallback directory when Electron `userData` was unavailable.
- Change: renamed that no-Electron fallback directory to generic
  desktop-agent wording and added focused install-auth coverage for the fallback
  path.
- Validation: focused install-auth state test, docs listing, `git diff --check`,
  and source scan for the retired fallback directory.
- Compatibility: no migration required. Runtime Electron callers still use
  `app.getPath('userData')`, so persisted install auth state remains in the same
  app data directory.

### 2026-06-17 main icon asset skin config

- Finding: the generic main window icon runtime still hardcoded the WindieOS app
  icon filename while resolving dashboard, overlay, and tray icons.
- Change: moved the WindieOS icon filename into the main host skin assets config,
  made icon path resolution generic by configured filename, and kept explicit
  test overrides ahead of skin defaults.
- Validation: focused main-window icon/runtime and host-skin boundary tests,
  docs listing, `git diff --check`, and source scan for the retired hardcoded
  icon filename in the generic resolver.
- Compatibility: no migration required. Packaged/source icon lookup order is
  unchanged for the WindieOS skin because it supplies the same
  `windieos.app.png` asset filename.

### 2026-06-17 renderer brand icon skin stylesheet

- Finding: the generic dashboard shell stylesheet still referenced the WindieOS
  app icon asset directly for the sidebar brand mark.
- Change: moved the concrete WindieOS brand icon URL into a renderer skin
  stylesheet and changed the generic dashboard shell CSS to consume the skin
  custom property.
- Validation: renderer skin boundary test, dashboard sidebar test, docs listing,
  `git diff --check`, and source scan for the retired hardcoded asset reference
  in the generic dashboard shell stylesheet.
- Compatibility: no migration required. The WindieOS skin still points to the
  same bundled app icon asset.

### 2026-06-17 diagnostics local runtime readiness field

- Finding: local sidecar lifecycle diagnostics still only exposed the legacy
  `localBackendReady` readiness field, even though current renderer and main
  terminology is local-runtime readiness.
- Change: added a sanitized `localRuntimeReady` diagnostic field and populated
  it from the local runtime bridge while preserving the legacy field/path for
  existing diagnostics queries.
- Validation: focused local bridge diagnostics test, source scan for readiness
  fields, docs listing, and `git diff --check`. The sqlite-backed
  `AppDiagnosticsStore` suite still cannot run in this environment because the
  `sqlite3` CLI is unavailable (`spawnSync sqlite3 ENOENT`).
- Compatibility: no migration required. Existing `local_backend.lifecycle`
  diagnostic path ids and `localBackendReady` payloads remain accepted.

### 2026-06-17 renderer permission onboarding storage key

- Finding: renderer permission onboarding completion persisted under a
  WindieOS-specific localStorage key inside the generic permission storage
  helper.
- Change: changed writes to the generic
  `desktop-agent-permission-onboarding` key while keeping a read fallback for
  the legacy `windieos-permission-onboarding` key.
- Validation: focused permission storage test, docs listing, `git diff --check`,
  and source scan for the legacy key.
- Compatibility: migrated by read-through compatibility. Existing users with
  only the legacy key keep their onboarding completion state; new saves use the
  generic key.

### 2026-06-17 local screenshot temp ownership directory

- Finding: the local sidecar screenshot temp path and Electron main ownership
  check used a WindieOS-specific temp directory name even though the path is a
  generic local-runtime file handoff contract.
- Change: moved new sidecar temp writes and main-process ownership checks to
  `${os.tmpdir()}/desktop-agent-screenshots`, while keeping
  `${os.tmpdir()}/windieos-screenshots` accepted at the bridge boundary for
  compatibility with in-flight or older sidecar results.
- Validation: focused bridge coverage for screenshot artifact materialization,
  docs listing, `git diff --check`, and a source scan for the old/new screenshot
  temp directory names.
- Compatibility: no persisted migration is required. The old temp directory is
  still read-compatible for returned screenshot paths, and new temp files use
  the generic directory.

### 2026-06-17 removed dormant context-label renderer route

- Finding: the renderer still carried a no-op `chatbox-context-label` route and
  component even though the context-label feature is dormant in main-process
  helper wiring and has no active renderer behavior.
- Change: removed the dead renderer app/component route, left the main-process
  helper references documented as dormant, and updated renderer/provider
  inventory docs to describe only active renderer roots.
- Validation: focused frontend routing/provider and main-window tests, docs
  listing, `git diff --check`, and source scan for deleted context-label
  renderer symbols/routes.
- Compatibility: no migration required. Main process does not instantiate a
  context-label window; an accidental old `view=chatbox-context-label` URL now
  falls back to the default app route until a real renderer surface is restored.

### 2026-06-17 main desktop sidecar discovery path

- Finding: the generic Electron desktop launch-plan builder still defaulted its
  sidecar daemon discovery file under a WindieOS-specific temp directory.
- Change: changed the Electron desktop `autoSidecar.discoveryFile` default to
  `${os.tmpdir()}/desktop-agent/sidecar-daemon.json` and added focused launch
  option coverage. Standalone SDK/Python daemon defaults are documented as a
  separate compatibility path.
- Validation: focused sidecar launch-options test, docs listing,
  `git diff --check`, and source scan for desktop/legacy daemon discovery path
  names.
- Compatibility: no persisted migration is required. Electron desktop launches
  own a fresh sidecar (`reuseExisting:false`) and pass an explicit discovery
  file to the SDK provider; public standalone SDK/Python defaults are unchanged.

### 2026-06-17 renderer new-chat event name

- Finding: the generic dashboard-to-chat renderer handoff still used the
  product-named `windie:new-chat` DOM event even though the event is an internal
  desktop UI signal, not an IPC or hosted API contract.
- Change: introduced a shared renderer runtime constant for
  `desktop-agent:new-chat`, updated the dashboard dispatcher and chat listener,
  and refreshed focused chat wiring coverage plus dashboard shell docs.
- Validation: focused `ChatInterfaceWiring` Jest run, docs listing,
  `git diff --check`, and stale scan for the retired `windie:new-chat` literal.
- Compatibility: no migration required. This event is renderer-process local
  and does not cross preload, Electron main, SDK, or backend boundaries.

### 2026-06-17 renderer appearance theme attributes

- Finding: the generic renderer theme applier and CSS selectors still exposed
  product-named `data-windie-theme*` DOM attributes for appearance state.
- Change: renamed the internal DOM attributes to `data-agent-theme`,
  `data-agent-theme-preference`, and `data-agent-translucent-sidebar`, then
  updated the appearance CSS selectors and focused provider/theme tests.
- Validation: focused appearance/theme/provider Jest run, docs listing,
  `git diff --check`, and stale scan for the retired product-named theme
  attributes.
- Compatibility: no migration required. The attributes are runtime DOM state,
  not persisted storage, IPC, SDK, or backend contracts.

### 2026-06-17 renderer appearance palette variables

- Finding: generic renderer styles still used product-named `--windie-*`
  palette custom properties for accent, neutral, and glow colors.
- Change: renamed the shared palette variables to `--agent-*` names while
  preserving the same values and leaving the WindieOS skin asset variable in
  the skin stylesheet.
- Validation: focused appearance, onboarding, app provider, dashboard/chat CSS,
  permission gate, and settings Jest run; docs listing; `git diff --check`; and
  stale scan for retired product-named palette variables.
- Compatibility: no migration required. The custom properties are runtime CSS
  implementation details and do not affect stored appearance settings.

### 2026-06-17 main context-label surface removal

- Finding: after the renderer context-label route was removed, Electron main
  still carried dormant context-label window state, geometry, visibility, and
  z-order helpers through the generic surface runtime.
- Change: removed the context-label window from main surface ownership,
  overlay helper wiring, IPC/window visibility handlers, bounds helpers, tests,
  and docs. The active main overlay set is now main, chat pill, and response
  overlay only.
- Validation: focused overlay/main Jest suite, docs listing, `git diff
  --check`, and stale scan for context-label runtime symbols.
- Compatibility: no migration required. No context-label window is created in
  the active startup path, and accidental old renderer URLs already fall back to
  the default route.

### 2026-06-17 main preload IPC registry argument

- Finding: the generic main/preload IPC allowlist bootstrap still used the
  product-named private launch argument `--windie-ipc-channels=`.
- Change: renamed the private bootstrap marker to
  `--desktop-agent-ipc-channels=` in main and preload, then updated focused
  tests and IPC workflow docs.
- Validation: focused preload/main-window Jest run, docs listing,
  `git diff --check`, and stale scan for the retired argument name.
- Compatibility: no migration required. The marker is supplied by Electron main
  to the matching bundled preload script at window creation time.

### 2026-06-17 renderer SDK facade filename

- Finding: the generic renderer UI imported SDK contracts through the
  product-named local facade path `windieSdkClient.ts`.
- Change: renamed the renderer-local facade to `agentSdkClient.ts`, updated
  renderer imports, tests, and docs, and kept exported SDK symbol names
  unchanged. The mock backend E2E fixture was also brought back into the
  current SDK runtime contract by emitting backend event identity/sequence
  fields and providing a minimal local-runtime RPC mock.
- Validation: focused renderer SDK/runtime Jest run, docs listing,
  `git diff --check`, and stale scan for the retired facade path.
- Compatibility: no migration required. The module path is internal to the
  renderer/tests/docs; persisted data, IPC channels, backend routes, and public
  SDK exports are unchanged.

### 2026-06-17 main diagnostics local backend readiness removal

- Finding: after the diagnostics path began emitting `localRuntimeReady`, main
  diagnostics still accepted and persisted the legacy `localBackendReady`
  payload key.
- Change: removed `localBackendReady` from the app diagnostics allowlist and
  stopped mapping it into local sidecar lifecycle diagnostics; tests now assert
  only the local-runtime readiness field.
- Validation: focused local bridge diagnostics Jest run, docs listing,
  `git diff --check`, and source scan for remaining `localBackendReady`
  references. The sqlite-backed `AppDiagnosticsStore` suite remains blocked in
  this environment because the `sqlite3` CLI is unavailable
  (`spawnSync sqlite3 ENOENT`).
- Compatibility: no migration required. App diagnostics are append-only
  transient records, and current producers/consumers now use
  `localRuntimeReady`; older stored diagnostic payloads are historical data.

### 2026-06-17 renderer presentation source channels

- Finding: renderer message presentation metadata reused product-named
  `windie:*` IPC channel names as dev/source labels for SDK current-turn and
  conversation-event rows.
- Change: introduced generic renderer source-channel constants
  `sdk:current-turn` and `sdk:conversation-event`, updated current-turn
  projections, dev source badges, and presentation tests to use them, while
  leaving actual IPC wire channels unchanged.
- Validation: focused chat presentation/source badge Jest run, docs listing,
  `git diff --check`, and source scan confirming product-named channel labels
  remain only where they describe real IPC channels or historical plan notes.
- Compatibility: no migration required. These labels are renderer presentation
  metadata and dev UI text; IPC names, persisted transcript payloads, SDK
  events, and backend contracts are unchanged.

### 2026-06-17 SDK current-turn presentation source channel

- Finding: the SDK live-turn presentation builder still emitted
  `windie:current-turn` as `presentation.entries[*].sourceChannel`, leaking a
  desktop IPC channel name into the reusable SDK projection contract.
- Change: changed SDK current-turn presentation entries to emit
  `sdk:current-turn`, documented the source-channel contract, and tightened
  current-turn projection tests.
- Validation: focused SDK conversation-runtime and renderer presentation Jest
  runs, docs listing, `git diff --check`, and source scan for remaining
  product-named source-channel literals.
- Compatibility: no migration required. The field is presentation metadata on
  in-memory current-turn projections; Electron IPC channels and persisted
  conversation events remain unchanged.

### 2026-06-17 renderer display-row presentation source channel

- Finding: the renderer SDK display-row adapter still stamped retained
  tool-progress rows with `sourceChannel: windie:rows`, mixing an Electron IPC
  channel name into dev/source presentation metadata.
- Change: added the generic `sdk:display-rows` source-channel constant and used
  it for display-row-derived chat message metadata, while leaving the
  `windie:rows` IPC channel unchanged.
- Validation: focused display-row projection and source-badge Jest coverage,
  docs listing, `git diff --check`, and a stale scan for product-named
  presentation source-channel labels.
- Compatibility: no migration required. The field is renderer presentation
  metadata for dev/source labeling; IPC names and SDK display-row payloads are
  unchanged.

### 2026-06-17 docs SDK facade route references

- Finding: docs still pointed hosted SDK client and runtime-boundary readers to
  the retired renderer-local `windieSdkClient.ts` facade path.
- Change: updated SDK, web, architecture, plugin, and API-reference docs to
  route TypeScript hosted-client work through `agentSdkClient.ts`, while
  preserving public `WindieClient` and `WindieSdkClient` names.
- Validation: docs listing, `git diff --check`, and a stale-path scan for the
  retired renderer facade filename.
- Compatibility: no migration required. This is documentation routing only.

### 2026-06-17 main wrapper tombstone test cleanup

- Finding: main-runtime boundary tests still probed the retired
  `windie_agent_host.cjs` wrapper path directly, keeping a product-named
  tombstone in active test setup even though IPC already asserts that no wrapper
  is imported.
- Change: removed the explicit nonexistent-file access checks and kept the
  active boundary assertions around direct `WindieClient.wakeUp(...)` startup
  plus absence of wrapper imports.
- Validation: focused main SDK boundary Jest coverage, docs listing,
  `git diff --check`, and stale scan for the retired wrapper path.
- Compatibility: no migration required. Test-only cleanup; runtime startup is
  unchanged.

### 2026-06-17 main SDK command handler module filename

- Finding: the generic Electron main SDK command handler lived in a
  product-named `ipc_windie_sdk_command_handlers.cjs` module even though the
  helper already exposes generic agent SDK command names.
- Change: renamed the internal helper module to
  `ipc_agent_sdk_command_handlers.cjs` and updated main imports, tests, and
  docs, while preserving the public `windie:invoke` IPC channel.
- Validation: focused main SDK boundary and IPC bridge Jest coverage, docs
  listing, `git diff --check`, and stale-path scan for the old module name.
- Compatibility: no migration required. This is an internal main-process module
  path; IPC names and renderer command payloads are unchanged.

### 2026-06-17 SDK command test mock terminology

- Finding: renderer/main SDK command tests still named their generic
  `invokeAgentSdkCommand(...)` mocks and helpers as `WindieCommand`, keeping
  stale product-specific terminology in active test code.
- Change: renamed the affected test-local mocks and helper functions to
  `AgentSdkCommand` wording without changing command payloads or IPC channels.
- Validation: focused renderer runtime-client and selected main IPC Jest suites,
  `git diff --check`, and stale-helper scan. `IpcMainConversationRuntimeRegistry`
  still times out in its pre-existing active-send scenario when run in
  isolation; this slice only renames that test's local command helper.
- Compatibility: no migration required. Test-only terminology cleanup.

### 2026-06-17 renderer model-selection type alias

- Finding: generic renderer runtime facades imported the public SDK
  `WindieModelSelection` type directly, leaking the product SDK type name into
  UI-facing runtime code.
- Change: added a renderer-local `AgentModelSelection` type alias in
  `agentSdkClient.ts` and updated desktop live-turn, settings, continuity, and
  send-preparation code to use it.
- Validation: focused renderer runtime/send-preparation Jest coverage, docs
  listing, `git diff --check`, and source scan for remaining renderer
  `WindieModelSelection` imports.
- Compatibility: no migration required. Type-only alias; public SDK exports and
  runtime payloads are unchanged.

### 2026-06-17 replay integration SDK command errors

- Finding: the replay database integration test still mocked preparation
  failures with legacy "Windie SDK command" wording even though the Electron
  main command handler now emits generic "Agent SDK command" errors.
- Change: updated the test fixture and assertions to use the current generic
  command error wording.
- Validation: `git diff --check` and source scan for legacy command-error
  wording. Focused `ConversationReplayDatabaseIntegration` is blocked in this
  shell because its Python SQLite bridge invokes `python`, which resolves to
  the Windows Store alias instead of an installed interpreter.
- Compatibility: no migration required. Test-only wording alignment.

### 2026-06-17 SDK runtime docs command error copy

- Finding: the SDK runtime docs still showed an Electron command-router example
  throwing `Unsupported Windie SDK command`, while the current renderer/main
  command path uses generic Agent SDK wording.
- Change: updated the example error text to `Unsupported Agent SDK command`.
- Validation: docs listing, `git diff --check`, and source scan for active
  "Windie SDK command" wording.
- Compatibility: no migration required. Documentation-only copy alignment.

### 2026-06-17 main diagnostics user-data helper

- Finding: the generic Electron main diagnostics store still exported its
  default app-data path helper as `windieUserDataRoot`, even though the helper
  belongs to main diagnostics rather than the WindieOS skin/runtime specifics.
- Change: renamed the helper to `appUserDataRoot` and updated diagnostics docs
  plus docs-index routing tests. The persisted `windieos` app-data directory
  and `WINDIE_USER_DATA_DIR` override remain unchanged as product compatibility
  surfaces.
- Validation: direct Node export smoke test, focused docs-index Jest route,
  docs listing, `git diff --check`, and stale scan for the renamed helper.
  Focused `AppDiagnosticsStore` remains blocked in this environment because
  the `sqlite3` CLI is unavailable (`spawnSync sqlite3 ENOENT`).
- Compatibility: no migration required. This is an internal helper/export name
  used by diagnostics commands and docs routing; storage paths and environment
  variables are unchanged.

### 2026-06-17 local screenshot temp filename prefix

- Finding: after the screenshot handoff directory moved to the generic
  `${os.tmpdir()}/desktop-agent-screenshots`, the sidecar producer and Electron
  main ownership check still used `windie-shot-` for new temporary screenshot
  filenames.
- Change: new sidecar screenshot temp files now use the
  `desktop-agent-shot-` prefix, and Electron main accepts both the new prefix
  and legacy `windie-shot-` filenames while preserving the existing legacy
  directory compatibility.
- Validation: focused local-backend bridge RPC Jest coverage, sidecar
  `python-in-env` smoke check for the screenshot prefix constant, docs listing,
  `git diff --check`, and source scan for new plus legacy screenshot temp path
  names.
- Compatibility: no persisted migration is required. In-flight or older
  sidecar results using `windie-shot-` remain accepted, including files already
  in the generic temp directory and files from the older WindieOS temp
  directory.

### 2026-06-17 renderer interaction debug globals

- Finding: the generic renderer interaction logger still read product-named
  window globals for opt-in message-text diagnostics and compact stdout
  summaries.
- Change: added generic `__DESKTOP_AGENT_*` debug globals for the renderer
  logger and kept the legacy `__WINDIE_*` globals as read-compatible aliases.
- Validation: focused interaction-logger Jest coverage, docs listing,
  `git diff --check`, and source scan for the generic plus legacy renderer
  debug globals.
- Compatibility: no migration required. These globals are ephemeral dev/test
  toggles on `window`, and the previous names remain accepted.

### 2026-06-17 renderer skin facade

- Finding: generic renderer feature consumers imported the product-named
  `windieDesktopSkin` object directly, even though the intended split is a
  reusable desktop-agent UI package with WindieOS product skin/config behind a
  boundary.
- Change: added a generic `desktopAgentSkin` facade over the WindieOS renderer
  skin and moved chat, dashboard settings, memory, onboarding, and renderer
  runtime fallback consumers to the facade while keeping WindieOS-specific copy
  and assets in the product skin files.
- Validation: focused renderer skin boundary coverage, targeted renderer
  import-touching Jest suites, docs listing, `git diff --check`, and source
  scans for product-skin imports from generic renderer consumers.
- Compatibility: no migration required. Rendered copy, CSS asset loading, and
  runtime payloads are unchanged; only renderer import ownership moved.

### 2026-06-17 sidecar app user-data helper

- Finding: sidecar-owned local storage, wakeword, browser, feature-pack, and
  diagnostics helpers used `windie_user_data_root` as the internal helper name
  even though the helper represents the local app user-data root, not hosted
  WindieOS runtime behavior.
- Change: renamed the sidecar helper and active local consumers to
  `app_user_data_root` while preserving the existing `windieos` directory name
  and `WINDIE_*` environment-variable compatibility surfaces.
- Validation: focused sidecar user-data, memory default-root, wakeword
  directory, and feature-pack tests; smoke import of renamed local consumers;
  docs listing, `git diff --check`, and stale helper-name scan.
- Compatibility: no migration required. Persisted paths, diagnostics database
  location, browser profile location, memory directories, wakeword model
  cache, and env vars remain unchanged.

### 2026-06-17 sidecar dedicated browser CDP names

- Finding: sidecar browser CDP launcher and Browser Use session helpers still
  used `Windie`/`windie` in internal constant, function, session-state helper,
  shutdown, and result-scope names even though the local authority is the
  dedicated browser runtime.
- Change: renamed the internal CDP constants and helpers to dedicated-browser
  terminology and changed browser tool result scope from
  `windie_dedicated_browser` to `dedicated_browser`, while keeping
  `WINDIE_BROWSER_CDP_PORT`, the `windieos` browser profile path, and Browser
  Use session defaults unchanged as compatibility surfaces.
- Validation: focused Browser Use engine tests, Chrome CDP helper tests,
  sidecar source-neutrality guard, docs listing, `git diff --check`, and stale
  scan for the retired internal CDP names in runtime/docs.
- Compatibility: no migration required. Chrome profile location, CDP port env
  override, browser session name, and launch behavior are unchanged; only
  internal helper names and the browser result scope label moved to generic
  dedicated-browser terminology.

### 2026-06-17 sidecar plugin entrypoint module names

- Finding: sidecar extension loading still generated product-named Python
  module keys for plugin entrypoint imports even though plugin execution is a
  local sidecar runtime concern.
- Change: renamed the generated import namespace to `sidecar_plugin_*` and
  documented that these module keys are internal loader details, while the
  extension contract remains `name`, `schema`, and `entrypoint`.
- Validation: focused sidecar plugin manifest test, docs listing,
  `git diff --check`, and stale namespace scan.
- Compatibility: no migration required. Plugin manifests, tool names,
  schemas, entrypoint paths, and execution behavior are unchanged.

### 2026-06-17 sidecar daemon health service label

- Finding: the sidecar daemon `/health` response still reported a
  product-named service id even though the endpoint is local sidecar runtime
  liveness, not hosted WindieOS orchestration.
- Change: changed the health payload service label to `sidecar_daemon`,
  documented the `/health` endpoint, and added focused daemon endpoint
  coverage.
- Validation: focused sidecar daemon health test, docs listing,
  `git diff --check`, and stale service-label scan.
- Compatibility: no migration required. Auth, status payloads, discovery file
  shape, daemon routes, and SDK local-runtime behavior are unchanged.

### 2026-06-17 sidecar JSON-RPC service label

- Finding: the sidecar JSON-RPC `ping` and status payloads still identified
  their service as `local_backend`, even though the active owner is the local
  sidecar runtime behind the SDK.
- Change: changed the diagnostic service label to `local_sidecar_runtime`,
  documented the `ping` label, and added producer plus daemon RPC coverage.
- Validation: focused sidecar ping/status/RPC tests, docs listing,
  `git diff --check`, and stale service-label scan.
- Compatibility: no migration required. JSON-RPC method names, daemon routes,
  status fields, tool execution, and SDK local-runtime behavior are unchanged.

### 2026-06-17 SDK runtime header copy

- Finding: generic SDK transport/runtime modules still described themselves
  with product-specific generated header copy, even though their public
  `Windie*` names are compatibility API and the module roles are generic SDK
  contracts.
- Change: updated the selected SDK runtime file headers to backend-session,
  reusable-agent, reusable-chat, and hosted/local-agent wording, and added a
  source-boundary test for the retired header phrases.
- Validation: focused SDK runtime header Jest coverage, docs listing,
  `git diff --check`, and stale header-copy scan.
- Compatibility: no migration required. Public SDK exports, filenames,
  runtime behavior, and package import paths are unchanged.

### 2026-06-17 renderer skin stylesheet facade

- Finding: the generic renderer app root still imported
  `windieDesktopSkin.css` directly even though renderer copy/config already
  moved behind the generic `desktopAgentSkin` facade.
- Change: added `desktopAgentSkin.css` as the generic stylesheet entrypoint,
  routed `App.jsx` through it, and kept the WindieOS icon asset URL in the
  product-specific skin stylesheet.
- Validation: focused renderer skin boundary Jest coverage, docs listing,
  `git diff --check`, and stylesheet import scans.
- Compatibility: no migration required. CSS variables, icon asset location,
  rendered branding, and skin runtime copy are unchanged.

### 2026-06-17 SDK sidecar discovery default

- Finding: after Electron desktop moved its explicit sidecar discovery path to
  `${TMPDIR}/desktop-agent/sidecar-daemon.json`, standalone SDK and Python
  daemon defaults still fell back to `${TMPDIR}/windieos/sidecar-daemon.json`.
- Change: changed the TypeScript SDK auto-sidecar provider, Python SDK client,
  and Python sidecar daemon default discovery file to the generic
  `${TMPDIR}/desktop-agent/sidecar-daemon.json` path.
- Validation: focused SDK and sidecar discovery-default tests, docs listing,
  `git diff --check`, and source scans for the retired default path.
- Compatibility: no persisted migration required. Electron desktop already
  passes an explicit discovery file, the discovery file is temporary runtime
  state, and callers can still override the path with explicit options.

### 2026-06-17 sidecar browser-use session default

- Finding: the sidecar Browser Use adapter still defaulted its daemon session
  name to `windieos`, even though the Browser Use session is local executor
  state and the dedicated profile path already carries the product boundary.
- Change: changed the Browser Use default session name to `desktop-agent`,
  updated sidecar tests to assert the generic default through the runtime
  constant, and documented the legacy `WINDIE_BROWSER_USE_SESSION=windieos`
  override for callers that intentionally want to reuse an old daemon session.
- Validation: focused Browser Use engine tests, docs listing,
  `git diff --check`, and source scans for the retired default session name.
- Compatibility: no persisted data migration required. Existing dedicated
  Chrome profile paths remain unchanged; an already-running legacy Browser Use
  session can still be selected with `WINDIE_BROWSER_USE_SESSION=windieos`.

### 2026-06-17 sidecar browser file root default

- Finding: browser-owned file actions still defaulted to `~/.windieos/browser`
  inside the sidecar browser file store, even though the helper is generic
  local executor storage rather than product skin or hosted backend policy.
- Change: changed the default browser file root to `~/.desktop-agent/browser`,
  added focused sidecar coverage for the generic default, and documented
  `WINDIE_BROWSER_FILES_DIR=~/.windieos/browser` for callers that intentionally
  want to reuse files written under the legacy root.
- Validation: focused browser file-store tests, docs listing,
  `git diff --check`, and source scans for the retired default root.
- Compatibility: no automatic migration. Browser-owned file paths are local
  sidecar scratch/artifact paths and the existing environment override can
  select the legacy root when needed; absolute-path and parent-escape
  protections are unchanged.
