---
summary: "Realtime execution report for the general agent UI runtime boundary convergence work."
title: "General Agent UI Runtime Boundary Report"
---

# General Agent UI Runtime Boundary Report

Plan: General Agent UI Runtime Boundary Execution Plan
User plan: [`plans/2026-06-16-general-agent-ui-runtime-boundary-plan.md`](../../plans/2026-06-16-general-agent-ui-runtime-boundary-plan.md)

## Current Status

- Status: in progress
- Latest inspected plan checkpoint: `c164ac7b6` (`docs(renderer): route provider credential runtime inventory`)
- Latest completed slice: Electron main renderer-query backend payload assembly
  now routes SDK turn resource/metadata preservation through the query runtime
  facade, keeping the raw preservation helper private.
- Current behavior: renderer product copy is skin-owned, Electron main product
  copy is host-skin-owned, voice capture internals use generic naming, and SDK
  default agent display names are generic unless a host supplies product
  identity. Generated extension plugin artifacts and scaffold `--dir` help/docs
  use generic local-runtime contribution copy while the `<windie>` CLI command
  remains product-owned. Image interaction handler tests use neutral candidate
  backend endpoint fixtures while keeping WindieOS hosted-default origin
  assertions in host-owned endpoint coverage. Artifact, install-auth, and
  renderer runtime endpoint tests use neutral `.example.test` hosts for
  arbitrary endpoint behavior while real WindieOS hosted defaults remain
  host-skin/config owned. Python SDK client transport tests use neutral explicit
  backend endpoint fixtures while preserving caller-supplied URL and websocket
  derivation behavior. Sidecar remote API and semantic client tests use neutral
  explicit backend endpoint fixtures while preserving generic and legacy env
  alias behavior. Artifact and image IPC helper tests use neutral endpoint
  fixtures while product-hosted defaults stay covered in host-skin and endpoint
  resolver tests. Generic main-window and main-process bootstrap tests use
  neutral injected skin values while real WindieOS app icon, tray tooltip, log
  prefix, bundled runtime copy, env keys, runs header, wakeword model, and
  browser warmup copy remain host-skin owned.
  Renderer composer paste-event clipboard item inspection and image parsing now
  route through `DesktopComposerAttachmentRuntime`; composer hooks keep draft
  state, text-paste fallback, and preview append behavior.
  Renderer transcription paste text extraction now routes through
  `DesktopTranscriptionRegionRuntime`; `useTranscription` keeps React state,
  selection range, region refs, and prevent-default behavior.
  Renderer dashboard composer focus requests now route textarea focus/caret
  placement through `DesktopMessageInputRuntime`; `MessageInput` keeps
  request-token and loop-lock gating.
  Renderer minimal chatbox explicit text-entry focus now routes input
  focus/caret placement through `DesktopChatboxInteractionRuntime`;
  `MinimalChatPill` keeps text-entry active state and loop-lock gating.
  Renderer dashboard thread-find deferred focus now routes input focus/select
  mechanics through `DesktopChatInterfaceBindingsRuntime`; `ChatInterface`
  keeps find-bar state and focus token timing.
  Electron main renderer-query agent-definition payload assembly now routes
  through `buildRendererBackendQueryPayloadWithAgentDefinition(...)`;
  `ipc_query_runtime.cjs` keeps SDK turn resource/metadata preservation private.
  Active local-runtime validation docs use the canonical `local-runtime`
  wrapper, test, and build commands; historical plan/report records and
  CLI-specific compatibility alias rows still mention the old names where the
  alias itself is the subject.
  SDK private-export compatibility tests use local-runtime wording for active
  guard labels while preserving concrete removed sidecar compatibility module
  sentinels so stale public CJS files stay absent.
  The Python local-runtime daemon still launches from the WindieOS
  `sidecar_daemon.py` host-skinned entrypoint, but active runtime help text,
  internal layer-log helper naming, and `/health` service diagnostics identify
  the running service as `local_runtime_daemon`.
  Local-runtime browser docs describe canonical browser payloads as
  local-runtime-owned and keep retired `WindieBrowserRuntime` mentions only as
  removal guards.
  Local-runtime Python dependency manifests use local-runtime wording for dev
  and packaged dependency sets instead of sidecar dependency labels.
  The local-runtime JSON-RPC reference now labels the concrete
  `sidecar_daemon.py` launch module by its active local-runtime daemon owner.
  CLI test routing exposes `test local-runtime` as the owner-correct command
  for local-runtime Python pytest while preserving `test sidecar` and the
  `scripts/test-sidecar.sh` compatibility wrapper.
  CLI build routing exposes `build local-runtime` as the owner-correct command
  for the bundled Python local-runtime payload while preserving
  `build sidecar-runtime` and `npm run build:sidecar-runtime` compatibility.
  The repo Python env wrapper accepts `local-runtime` for local-runtime Python
  commands, and first-party status, doctor, and `test-sidecar.sh` callers use
  that canonical target while the public `<windie> test sidecar` command and
  lower-level `sidecar` env target remain compatibility surfaces.
  CLI deep doctor diagnostics name the backend port and local-runtime import
  checks by their current runtime owners while still probing
  `127.0.0.1:8765` and importing the concrete `local_backend.py` module.
  CLI status output reports the reusable Python environment and test wrappers
  as local-runtime-owned; machine-readable status includes
  `localRuntimePython` while retaining `sidecarPython` as a compatibility
  alias for existing automation.
  CLI `logs sidecar` remains a compatibility alias for the same WindieOS
  local-runtime daemon log file, but its initialized/readback banner now uses
  the canonical local-runtime owner label.
  Diagnostics sanitizer guards use retired local-runtime readiness-field
  wording while preserving `sidecarReady` drift rejection.
  Generic runtime-mode and VM worker runtime tests use sample env maps and runs
  headers while real WindieOS VM env and runs auth names remain host-skin owned.
  Generic GPU runtime tests use sample env maps while the real WindieOS
  software-rendering env name remains host-skin owned.
  Generic IPC helper/live-surface trace tests use sample debug env maps while
  real WindieOS debug env names remain host-skin owned.
  Generic IPC query runtime tests use sample interruption copy while real
  WindieOS query event copy remains host-skin owned.
  Renderer app-runtime boundary tests keep app/features on SDK/runtime facades
  rather than direct SDK-owned transport and conversation/history IPC channels.
  Minimal chat pill native-frame collapse timers and sequence-guarded
  composer-height animation-frame commits now route through
  `DesktopChatboxInteractionRuntime` instead of raw browser scheduling in the
  component.
  Message-list active find-match scrolling, bottom-scroll RAF coalescing,
  cleanup, and resize observation now route through
  `DesktopMessageListRuntime` instead of raw browser scheduling in
  `MessageList` or `useMessageListAutoScroll`.
  Current-turn presentation state no longer passes through the deleted
  `useCurrentTurnPresentationState` hook shim; chat surface and response
  overlay hooks now call the renderer app-runtime facade directly.
  Message action copy-reset and assistant-action reveal timers now route
  through `DesktopMessageActionRuntime` instead of raw browser timeout calls in
  `useCopyMessageAction` or `AssistantMessageActions`.
  App-provider keydown/storage subscriptions, editable-target checks,
  localStorage access, and save-status timers now route through
  `DesktopAppProviderRuntime` instead of raw browser adapters in provider
  components.
  Chat-loop disconnect recovery watchdog scheduling now routes through
  `DesktopChatLoopUiRuntime` instead of raw browser timeout calls in
  `useChatLoopUiState`.
  Debug tool-ghost hide/restart timer scheduling now routes through
  `DesktopToolGhostRuntime` instead of raw browser timeout calls in
  `ToolGhostDebugApp`.
  Dashboard model-reset warning timer scheduling now routes through
  `DesktopModelSelectionRuntime` instead of raw browser timeout calls in
  `ModelsSection`.
  Dashboard shell opening timer and document scroll-lock mechanics now route
  through `DesktopDashboardLayoutRuntime` instead of raw browser timer/document
  calls in `DashboardShell`.
  Dashboard conversation startup retry, generated-title visibility polling, and
  search debounce timers now route through
  `DesktopDashboardConversationLoadRuntime` instead of raw browser timeout calls
  in `useDashboardConversations`.
  Voice-mode reconnect backoff timer scheduling and cleanup now route through
  `DesktopVoiceRuntimeClient` instead of raw browser timeout calls in
  `useVoiceMode`.
  Transcription paste caret restoration now routes through
  `DesktopTranscriptionRegionRuntime` instead of raw browser timeout calls in
  `useTranscription`.
  Conversation replay database tests describe edit/resend display replacement
  as local-runtime SQLite behavior while the renderer owns preparation error
  projection.
  Generic renderer chat-sender and main IPC query bridge tests use sample
  send-failure copy while real WindieOS renderer chat copy and main
  query-event copy remain skin/host-skin owned.
  Generic chat interface wiring tests use sample empty-state copy while real
  WindieOS chat empty-state copy remains renderer-skin owned.
  Generic desktop onboarding slideshow tests use sample onboarding skin and
  permission reasons while real WindieOS onboarding product copy remains
  renderer-skin/permission-copy owned.
  Main permission-service tests describe macOS System Events automation through
  the injected local-runtime automation verifier while Electron main owns
  permission orchestration.
  Generic settings section tests use sample settings skin and browser
  permission copy while real WindieOS settings product copy remains
  renderer-skin/permission-copy owned.
  Dashboard memory runtime-boundary tests require feature code to use the memory
  runtime facade instead of direct local-runtime memory IPC channels.
  Electron main host-skin boundary tests use main local-runtime adapter labels
  for bridge console logging, debug flag, and dependency guards while concrete
  WindieOS sidecar compatibility folders, log aliases, and daemon entrypoints
  remain host-skin-owned assertions.
  Local-runtime Python service/browser registry/bootstrap,
  memory/conversation, executable tool, core/protocol, and
  platform/system-state/wakeword, and hosted-backend client/config tests use
  owner-correct local-runtime service, tool-helper, bootstrap, memory,
  conversation, tool, JSON-RPC, stdout, daemon, helper, platform,
  system-state, wakeword, hosted-client, and backend endpoint labels while
  preserving real `local_backend.py`, `sidecar_daemon.py`, and `tests/sidecar`
  implementation paths.
  The modular completion guard for remote endpoint fixtures names local-runtime
  hosted-client coverage while still reading the concrete implementation tests.
  Agent SDK local-runtime provider and tool-coordinator
  tests use neutral `AGENT_TEST_*` launch env, launch-context, daemon,
  tool-execution failure/unavailable, error, and conversation fixtures while
  Python SDK package/client tests use SDK-owned package labels and real Windie
  compatibility env aliases remain explicitly covered by
  `AGENT_RUNTIME_WINDIE_COMPAT_ENV_KEYS`.
  Generic local-runtime bridge screenshot tests preserve retired namespace
  rejection coverage while avoiding direct legacy WindieOS screenshot temp
  literals.
  Generic onboarding permission action tests describe focus-driven permission
  refresh as desktop app focus behavior while real product identity remains
  skin/config owned.
  Generic local-runtime helper tests use neutral `AGENT_TEST_*` disposable env
  fixtures while real Windie env aliases remain covered in explicit alias
  tests.
  Generic local-runtime browser launcher tests describe injected dedicated
  profile path compatibility through desktop app launch wording while real
  Windie legacy env aliases remain covered explicitly.
  Generic extension scaffold and public example tests keep retired plugin-copy
  regression guards without storing the old WindieOS starter plugin phrases as
  direct literals.
  Generic modular completion and host-skin boundary tests keep retired
  workspace, SDK, CLI, agent, plugin, and local-runtime copy regression guards
  without storing those old WindieOS phrases as direct literals.
  Generic sidecar local-runtime tests keep retired workspace, backend, sidecar,
  permission, user-data, and wakeword copy regression guards without storing
  those old WindieOS phrases as direct literals.
  The generated Electron built-in tool manifest matches the sidecar manifest
  source for browser `output_schema` and numeric field normalization.
  The dashboard memory panel now keeps modal state, fetch orchestration,
  rendering, and delete actions while app-runtime memory presentation helpers
  own episodic transcript parsing, semantic summary/facts projection, runtime
  memory delete-routing fields, procedural placeholders, active-type fallback,
  and search matching policy.
  The dashboard models panel now keeps provider drilldown, hover state,
  selection side effects, catalog refresh, and API-key rendering while
  app-runtime model-card presentation helpers own provider grouping, context
  hint formatting, badges, and renderer-skin provider display fallbacks.
  The Chrome launcher reference names host-skinned desktop launch and dedicated
  desktop connect ownership while documenting the WindieOS browser profile path
  only as the active product-skin configuration.
  The dedicated browser runtime guide routes Browser Use daemon attach/reuse,
  internal URL navigation, and browser state retention through the
  local-runtime browser adapter rather than product ownership wording.
  Renderer appearance storage, theme application, and dashboard Appearance UI
  now share an app-runtime appearance facade for fallback/normalization and
  Appearance editor descriptors instead of interpreting the raw skin palette or
  carrying tab-local mode/field tables independently.
  The Browser Control guide names hosted backend browser policy, Electron UI
  status/readiness, and local-runtime Python Chrome/CDP ownership while keeping
  WindieOS env aliases as product launch configuration.
  The browser hub, browser workflow, and browser tool overview now route their
  first-read ownership summaries through hosted backend, SDK/main, Electron UI,
  local-runtime adapter, and Browser Use responsibilities.
  The browser control source-run guide and browser troubleshooting summary now
  route connect/reuse, CDP port, Electron status, and Browser Use
  result-normalization wording through the desktop connect path, hosted backend
  policy, Electron UI, and local-runtime browser adapter.
  Dashboard provider API-key controls now consume provider display specs through
  `DesktopProviderCredentialRuntime.getProviderApiKeySpecs()` instead of a raw
  skin spec table re-export.
  AppConfigProvider now routes cross-window config storage-event filtering
  through `desktopRendererConfigStorageRuntime.isRendererConfigStorageEvent(...)`
  instead of importing the raw renderer skin storage key.
  Memory retrieval and permission onboarding storage tests now consume
  `getMemoryRetrievalInjectionStorageKey()` and
  `getPermissionOnboardingStorageKey()` from their app-runtime owners instead
  of importing renderer skin storage keys directly.
  Dashboard search modal group labels and order now come from
  `DesktopDashboardConversationGroupRuntime.getDashboardConversationGroupDescriptors()`
  instead of component-local constants, while bucket ids and search metadata
  normalization remain unchanged.
  Appearance settings controls now consume
  `desktopAppearanceThemeRuntime.getAppearanceModeDescriptors()`,
  `getAppearanceThemeSectionDescriptors()`, and
  `getAppearanceThemeFieldDescriptors()` instead of component-local descriptor
  tables.
  Settings sidebar tabs now consume
  `DesktopSettingsTabRuntime.getSettingsTabDescriptors()` and
  `DesktopSettingsTabRuntime.resolveSettingsTabLabel()` instead of a section-local tab registry while
  keeping tab-content routing local to `SettingsSection`.
  Dashboard sidebar navigation now consumes
  `DesktopDashboardNavigationRuntime.getDashboardPrimaryNavItems()` and
  `DesktopDashboardNavigationRuntime.getDashboardPanelNavItems()` instead of component-local nav registries
  while keeping icon mapping, callbacks, and active-state rendering local to
  `DashboardSidebarNavigation`.
  Current renderer conversation session info now consumes
  `desktopConversationSessionRuntime.resolveCurrentRendererConversationSessionInfo(...)`
  for transcript/store fallback projection and stable empty session fallback
  instead of carrying that singleton in the chat feature hook.
  Dashboard search rows now consume
  `DesktopDashboardConversationGroupRuntime.getDashboardSearchSnippetDisplayText(...)`
  for matched-role snippet prefix display instead of recomputing the
  case-insensitive prefix check inside `SearchChatsModal`.
  Dashboard chat and response overlay hooks now consume
  `desktopCurrentTurnPresentationRuntime.resolveSdkCurrentTurnPresentationState(...)`
  for SDK current-turn presentation state instead of duplicating overlay intent,
  lifecycle, awaiting-anchor, and visible-response projection inside feature
  hooks.
  Response overlay dismissal target projection now consumes
  `desktopCurrentTurnPresentationRuntime.resolveResponseOverlayDismissalTarget(...)`
  instead of assembling SDK overlay intent, latest entry id, turn ref,
  conversation ref, and stale guard ref inside the overlay view-model hook.
  Response overlay view-model live-surface trace payload, resolved-event,
  typing-event, intent-event, and reason mapping now consumes
  `desktopRendererTraceRuntime` helpers instead of carrying trace schema
  strings inside the overlay view-model hook.
  Response overlay window-sync live size-report and lifecycle traces now
  consume `desktopRendererTraceRuntime` helpers instead of carrying
  live-surface size-report, mount, unmount, reason, native-mode, or payload
  field mapping inside the window-sync hook.
  Response overlay hit-test and rendered-typing live-surface traces now
  consume `desktopRendererTraceRuntime` helpers instead of carrying
  hit-test/typing-rendered event labels, reason strings, or payload field
  mapping inside `MinimalResponseOverlay`.
  Response overlay response-surface snapshot traces now consume
  `desktopRendererTraceRuntime` helpers instead of calling the raw
  response-surface trace logger or carrying snapshot field mapping inside
  `MinimalResponseOverlay`.
  Minimal chat pill send-reset, mount/unmount, and normal hit-test
  live-surface traces now consume `desktopRendererTraceRuntime` helpers instead
  of carrying live-surface event names, reset reasons, or `ignoreMouseEvents`
  field mapping inside `MinimalChatPill`.
  SDK current-turn applied live-surface traces now consume
  `desktopRendererTraceRuntime` helpers instead of carrying event names,
  overlay/guard projection, visible-content booleans, text lengths,
  tool-event counts, or stale-skip trace field names inside
  `useConversationRuntimeProjectionStream`.
  Chat send lifecycle traces now consume `desktopRendererTraceRuntime` helpers
  instead of carrying send-start, screenshot-decision, query-dispatched,
  `turn_id`, or `include_query_screenshot` field mapping inside
  `desktopChatSendPreparationRuntime`.
  Dashboard memory tabs now consume
  `DesktopMemoryPresentationRuntime.getDashboardMemoryTypes()` for
  episodic/semantic/procedural labels and descriptions.
  The frontend module file index now splits browser ownership across hosted
  backend policy/schema exposure, SDK/main local-runtime dispatch,
  local-runtime Python browser adapter mechanics, and Browser Use session
  behavior instead of broad product-owned browser runtime wording.
  The frontend architecture overview and frontend docs hub now frame Electron
  main, React renderer, preload, and local-runtime implementation surfaces as
  the WindieOS desktop app implementation rather than one monolithic WindieOS
  frontend owner.
  The agent architecture source-map reference now describes Electron main,
  React renderer, preload, and local-runtime behavior as desktop app runtime
  surfaces instead of a monolithic WindieOS frontend, and names Electron main
  as desktop host policy plus local-runtime supervision rather than sidecar
  supervision. Browser, IPC, and main-process first-read summaries now use
  desktop Electron/runtime wording for generic host responsibilities while
  keeping WindieOS product identity in skin/config and launch configuration.
  Browser and local-runtime first-read workflows now use desktop browser,
  local-runtime tool execution, local-runtime Python implementation, and
  local-runtime implementation-root wording for generic local responsibilities.
  Renderer dashboard, settings, model-selection, chat-attachment, and overlay
  first-read workflows now use desktop renderer and desktop overlay wording for
  generic UI responsibilities. Shared tool docs now route model-visible
  schemas, local-runtime execution, backend-owned remote tools, MCP result
  envelopes, extension built-ins, and tool policy through runtime-owned labels
  while keeping WindieOS identity in product skin/config and hosted backend
  policy. Websocket event, observability, error/failure,
  tool schema, tool lifecycle, and local tool channel first-read docs now use
  shared backend/SDK/runtime contract wording for generic pipelines.
  Screenshot/overlay policy, platform routing, validation, computer tool, docs
  hub, and triage docs now use desktop overlay UI/surface wording for generic
  Electron-owned capture policy symptoms.
  Docs hub, repository docs index, and agent routing quick cards now summarize
  websocket event routing through Agent SDK projection and typed Electron
  fan-out instead of generic Electron rebroadcast labels.
  Minimal chat pill, Linux, Windows, and overlay phase workflow docs now
  describe screenshot hide/restore policy through desktop overlay
  surfaces/policy instead of product-owned overlay labels.
  Dashboard and desktop surfaces docs now use generic desktop
  workspace/surface wording instead of product-owned renderer surface labels.
  Agent architecture SDK ownership rules now describe the Electron reference
  host as a desktop UI on top of the SDK instead of a product-owned UI special
  case.
  Minimal chat pill tool-surface lease docs now describe Linux screenshot
  capture as hiding visible desktop surfaces instead of product-owned visible
  surfaces.
  Onboarding permission, plugin, and streaming/event concept docs now route
  first-run capability gates, built-in local tool routing, provider event
  normalization, and agent-loop streaming steps through desktop onboarding,
  built-in local-runtime tool, backend streaming event, and backend websocket
  event wording instead of product-owned generic runtime labels.
  Websocket lifecycle, agent-loop, memory hub, memory workflow, and transcript
  replay docs now route connection lifecycle, hosted agent turns, memory-like
  systems, and visible-chat replay through hosted backend, SDK projection, and
  desktop/backend runtime wording instead of product-owned generic
  conversation/runtime labels.
  Dashboard metadata invalidation and SDK conversation store metadata tests now
  use SDK/product-neutral test names for generic runtime behavior while real
  WindieOS product identity remains covered in host-skin and renderer-skin
  boundary tests.
  Generic diagnostics store tests use sample data-path env config while real
  WindieOS diagnostics data paths remain host-skin owned.
  Generic permission service tests use sample permission copy while real
  WindieOS permission copy remains host-skin owned.
  Generic backend endpoint tests use sample hosted endpoint defaults while real
  WindieOS hosted URLs and default endpoint env names remain host-skin owned.
  Generic layer-log sink tests use sample logging config while real WindieOS log
  env keys, aliases, filenames, and directories remain host-skin owned.
  Generic extension manifest and MCP runtime tests use sample env maps while
  real WindieOS contribution-root and MCP enablement env names remain host-skin
  owned.
  Generic IPC host option state tests use a neutral local-runtime env fixture
  while real WindieOS local-runtime env names remain host-skin owned.
  Generic local-runtime launch-option tests use sample host launch config while
  real WindieOS daemon entrypoint, runtime path, bundled-runtime copy, and
  local-runtime env names remain host-skin owned.
  Generic runtime-path and wakeword bridge tests use sample host config and
  neutral packaged resource roots while real WindieOS env/model/path values
  remain host-skin owned. Local-runtime bridge RPC tests use neutral injected
  browser warmup copy while real WindieOS local-runtime copy remains host-skin
  owned. Generic debug and wakeword runtime helper tests use sample host config
  while real WindieOS debug/wakeword values remain host-skin owned.
  Renderer voice docs name the desktop voice/audio runtime contract and
  backend-owned transcription gateway boundary instead of embedding concrete STT
  provider policy. Renderer config reference docs now keep current OpenAI/GPT default
  model values attached to the active WindieOS skin instead of the generic
  storage runtime, and the renderer workflow summary names desktop renderer
  state rather than WindieOS renderer state. Frontend capability inventory,
  renderer startup, backend runs, IPC protocol, and local-runtime lifecycle docs
  now use desktop app window, Electron main VM worker, Electron main session
  state, and SDK-owned local-runtime wording for the same owner boundaries. SDK
  package README examples now use `https://backend.example.com`,
  `hosted-provider`, and neutral model IDs while preserving the public
  `AgentClient` flow and local-runtime setup example. Electron main direct
  settings sync payloads now use the SDK-owned `filterBackendPayload(...)`
  contract directly instead of an extra main-process forwarding facade. SDK
  examples now use neutral hosted provider/model IDs, rely on backend default
  model selection in the simple chat CLI, and present `AGENT_BACKEND_URL` /
  `AGENT_INSTALL_TOKEN` as the primary env interface; the mock-hosted CLI
  example also disables built-ins, memory, and persistence so it does not need
  a local-runtime daemon path. SDK
  helper symbols that are not part of the public package boundary
  stay private behind higher-level runtime APIs, and renderer/main-private
  guard markers use generic desktop-agent naming. SDK internal diagnostics use
  generic Agent SDK wording while preserving current public Windie API names,
  renderer markdown cleanup no longer depends on provider identity, and the
  obsolete renderer no-op tool-stream shim has been removed. SDK private
  transport listener helpers and session failure diagnostics use generic
  agent-session wording while public Windie transport exports remain stable,
  and managed endpoint configuration failures reject connection waiters
  immediately with generic endpoint wording. SDK-generated default agent IDs
  now use generic `agent-*` values while the existing backend mode remains
  unchanged. Agent SDK client fixtures now use neutral hosted endpoint hosts
  while preserving the same hosted route construction, websocket fallback, and
  environment compatibility coverage. Agent SDK workspace fixtures now use
  neutral project metadata while preserving the same local-runtime store and
  projection contracts. Platform docs describe Electron-owned window and
  screenshot policy through desktop app/app-owned surfaces while keeping product
  identity in skin/config. The architecture overview routes renderer requests
  through desktop runtime clients and SDK command facades instead of a stale
  renderer backend API-client entry. The frontend runtime surface matrix names
  the Electron Agent SDK host and SDK local-runtime result delivery instead of
  backend-bridge or sidecar-callback labels. The frontend architecture SDK
  fan-out table now describes the remaining deletion condition as avoiding a
  direct backend relay rather than a revived backend bridge. Agent SDK
  workspace and native web-search query fixtures now use neutral project
  samples while preserving package names and explicit legacy guards. Renderer
  desktop workspace runtime, conversation-binding, dashboard conversation
  metadata, and live-turn fixtures now use neutral project workspace samples
  while preserving the same value-normalization, session-storage, SDK command,
  and dashboard grouping/loading contracts. Local-runtime chat event store
  fixtures now use the same neutral project workspace samples while preserving
  SQLite conversation listing semantics. Backend query execution, rehydrate,
  prompt manager, and session manager workspace-context fixtures now use neutral
  project samples while preserving workspace forwarding, rehydrate session
  updates, prompt rendering, and active session prompt refresh behavior. Desktop
  conversation continuity search metadata fixtures now use neutral project
  samples while preserving SDK metadata-to-dashboard row projection. Backend raw
  user-query sanitization desktop-context fixtures now use neutral active-window
  samples while preserving strict `<user_query>` extraction semantics.
  Local-runtime window manager, system-state, and MCP structured-result fixtures
  now use neutral window-title samples while preserving matching, fallback, and
  raw-result preservation behavior. Renderer chat and settings workspace UI
  fixtures now use neutral selected-workspace paths while preserving active
  workspace name derivation, permission request, and workspace update behavior.
  Unicode/mojibake repair fixtures now use neutral project document text while
  preserving quote, dash, and lone-surrogate normalization behavior across the
  local-runtime sanitizer and renderer stream-update normalizer.
  Backend web-search/provider fixtures now use neutral query samples while
  preserving native source extraction, source de-duplication, backend
  tool-sender progress ordering, and backend-executed tool-output behavior.
  Renderer browser session fixtures now use neutral tab URLs while preserving
  browser session readiness, active-tab labeling, carousel switching,
  disconnect, polling, and in-flight connect behavior.
  Main permission workspace fixtures now use neutral temp paths while preserving
  workspace picker grants, active-workspace updates, selected-path persistence,
  untrusted-path rejection, and sanitized diagnostics.
  Repo instruction runtime fixtures now use neutral AGENTS.md workspace temp
  paths while preserving file-to-parent resolution and git-root-to-workspace
  prompt layer ordering.
  MCP runtime fixtures now use neutral configured client info while preserving
  MCP initialize payload forwarding.
  Backend web-search tool fixtures now use neutral query samples while
  preserving Brave request parameter construction, Brave result normalization,
  missing config and disabled policy failures, native OpenAI/Gemini routing,
  native source query propagation, and output formatting.
  Main IPC fixtures now use neutral temp paths while preserving local AGENTS.md
  query layer attachment and serialized desktop UI config/install-auth writes.
  Backend container config updater fixtures now use neutral temp TTS paths while
  preserving DI config rebinding through current registry/context owners.
  Extension scaffold tests now use neutral contribution-root temp paths while
  preserving the Windie CLI command name and generated contribution layout.
  Extension scaffold `--dir` help and authoring docs now refer to generic
  contribution roots while preserving the Windie CLI command name and generated
  contribution layout.
  Main-window runtime tests now use neutral injected icon paths while preserving
  host-skin app icon filename coverage.
  Wakeword hook tests now use a neutral audio worklet blob URL while preserving
  renderer capture cleanup behavior.
  Browser Use engine tests now keep legacy Windie env alias coverage while using
  neutral Browser Use session fixture values.
  Public Python SDK package examples now use neutral explicit backend endpoint
  samples while preserving the `windie-sdk` distribution and `windie` import.
  Image interaction handler tests now use neutral candidate backend endpoint
  fixtures while preserving active WindieOS hosted-default origin coverage.
  Artifact, install-auth, and renderer runtime endpoint tests now use neutral
  `.example.test` hosts for arbitrary endpoint behavior while preserving hosted
  default coverage elsewhere.
  Python SDK client transport tests now use neutral explicit backend endpoint
  fixtures while preserving HTTP route, artifact route, websocket URL
  derivation, local-runtime registration, and tool-result routing behavior.
  Sidecar remote API and semantic client tests now use neutral explicit backend
  endpoint fixtures while preserving generic and legacy env alias behavior.
  Artifact and image IPC helper tests now use neutral endpoint fixtures while
  preserving artifact URL construction, trusted-origin checks, clipboard copy,
  context-menu copy, and handler-registration behavior.
  Preload SDK-command validation
  failures use generic Agent SDK wording while the
  `window.windie` bridge contract remains stable. Python SDK
  stream and trace-query fallback failures also use generic Agent SDK wording,
  and JS SDK public stream projections use generic fallback error wording when
  runtime errors omit a message. SDK local-runtime auto-start discovery and
  stop timeout diagnostics use generic local sidecar daemon wording. Electron
  main now calls the desktop local-runtime launch plan API and emits generic
  local-runtime launch logs while preserving the sidecar daemon implementation
  and compatibility launch alias. SDK hosted install registration is now
  explicit caller policy through `installAuth.autoRegister` instead of a
  WindieOS hosted-endpoint hostname inference. SDK hosted endpoint selection is
  now caller-supplied through `backendUrl`, `httpBaseUrl`, or
  `WINDIE_BACKEND_URL` instead of falling back to a hardcoded WindieOS hosted
  URL. Python sidecar/SDK hosted HTTP clients now follow the same explicit
  endpoint boundary through `backend_url` or `WINDIE_BACKEND_HTTP_URL`.
  Backend tool-result receiver and API handler wording now describes
  SDK/local-runtime result ingress instead of stale frontend result ownership.
  Backend lifecycle, stream telemetry, compaction, prompt-transparency,
  credential/debug, and tool-result docs now describe SDK projections, renderer
  consumers, and SDK/main local-runtime dispatch instead of frontend-owned
  runtime semantics. Provider credential and settings docs now describe
  renderer-managed client settings and backend validation ownership instead of
  stale broad frontend terminology. Renderer config-state docs now describe
  renderer config, desktop UI config persistence, and backend client-settings
  validation while preserving legacy-named config channels and filenames.
  Backend event-contract docs now describe SDK/renderer/client consumers rather
  than frontend-specific consumers. Tool manifest, registry, ADR, extension,
  plugin, IPC, and renderer settings docs now describe desktop
  client/local-runtime manifests, backend/client-local parity, desktop
  local-runtime execution, renderer settings, and desktop UI config persistence
  instead of stale frontend manifest, sidecar-executor, and config labels.
  Cross-runtime contract, debug, security, install, incident, evidence,
  validation, sidecar-browser, landing, and reference docs now describe
  backend/client contracts, SDK/renderer consumers, SDK/main local-runtime
  dispatch, desktop host boundaries, and sidecar execution instead of stale
  three-runtime shorthand. Sidecar hub titles and cross-links now expose the
  local-runtime sidecar label while preserving existing
  `docs/frontend/sidecar/...` file paths. The first-read documentation hub now
  separates hosted backend, Electron main desktop host, renderer UI, and Python
  sidecar ownership. Concept, installation, SDK agent-definition, and mobile
  planning docs now use Electron desktop app/main, renderer, and SDK
  local-runtime ownership wording instead of broad Electron frontend labels.
  Tool-development guidance now routes the client-manifest handoff through the
  SDK/Electron desktop host boundary. Renderer stream docs and frontend
  contract test labels now describe backend-wire event ingress, SDK
  source-event boundaries, and SDK/main command ownership instead of stale
  raw-backend and frontend/backend labels. Renderer transcript presentation now
  dedupes same-turn SDK current-turn tool rows against materialized SDK display
  tool rows by SDK-shaped tool identity when correlation ids are absent. SDK
  public docs now describe normal conversation/runtime paths with
  backend-wire/source-event wording while keeping `subscribeRawBackendEvents`
  as the explicit debug listener API. Active concept, frontend runtime,
  architecture, inventory, IPC, and query-relay docs now use backend-wire event
  wording for SDK/main-normalized renderer paths. The websocket incoming
  contract test and current references now use the `BackendSdkWebsocketContract`
  name instead of the stale frontend/backend boundary label. Channel local-tool
  docs now describe SDK/main local-runtime routing plus Python sidecar executor
  ownership instead of SDK desktop/agent runtime labels. Active routing, IPC,
  stream, tool, debug, node, and reference docs now use Agent SDK
  runtime/tool-router wording instead of SDK agent/main runtime labels. The
  remaining sentence-case frontend-sidecar live docs now use local runtime
  sidecar labels, and packaged endpoint fallback docs use desktop-local
  loopback wording. Renderer settings docs now describe local theme editor
  values as renderer-local presentation state. Electron main dev/source
  local-runtime launch fallback copy now describes a generic local-runtime
  Python executable instead of a frontend conda environment while preserving
  the existing `WINDIE_PYTHON_PATH` env var. Electron main query send-failure
  broadcasts now build SDK `turn_error` conversation events directly in the IPC
  helper instead of importing backend event normalization for a synthetic local
  failure. Electron main query/settings/model IPC helper names and user-visible
  send-failure copy now use Agent SDK runtime wording instead of SDK-agent
  wording for generic runtime command routing. The active frontend architecture
  settings/model sync row now uses Agent SDK host runtime wording instead of the
  stale SDK-agent-host label. Active tool routing, channel, gateway, renderer,
  and reference docs now qualify sidecar executor references as Python or
  local-runtime sidecar executor ownership. Tool schema policy validation now
  routes client manifest payload changes to desktop client manifest builder
  tests instead of frontend manifest wording. Browser shared-contract,
  validation, runtime, and tool catalog docs now qualify Python sidecar
  validation/runtime and desktop client/local-runtime manifest ownership
  instead of unqualified sidecar validation/runtime or frontend/sidecar manifest
  wording. Local runtime sidecar diagnostics and the unicode sanitizer helper
  now describe diagnostic values as local-runtime JSON-RPC/payload data instead
  of sidecar payloads. Channel routing, tool lifecycle, stream-event, and
  memory IPC docs now use Agent SDK backend transport/runtime/API wording
  instead of SDK-agent phrasing for command and projection paths. The channel
  routing matrix now names desktop/local owners and desktop client/Python
  sidecar payload ownership instead of frontend/sidecar labels. Local tool
  registry, path-resolution, wait, and PDF dependency diagnostics now qualify
  Python sidecar runtime/tool ownership. Tool authoring, extension, and sidecar
  daemon docs now qualify built-in Python sidecar tool ownership.
  Voice and wakeword routing hubs now label renderer voice capture and Electron
  wakeword bridge ownership explicitly instead of broad frontend labels.
  Tool troubleshooting and schema-policy routing docs now qualify Python sidecar
  registry/runtime ownership in local execution failure rows.
  The agent-visible data pipeline now qualifies Python sidecar and executable
  local-runtime ownership in local tool execution/result rows.
  Tool execution lifecycle and schema policy docs now qualify Python sidecar
  missing-tool/result and executable-argument parity ownership.
  Architecture, review, help, backend service, and frontend routing docs now
  qualify backend-import parity rules as desktop client and Python sidecar
  ownership instead of broad frontend/sidecar wording. Architecture first-read
  docs now route renderer/backend communication through `windie:invoke`, SDK
  projections, `windie:conversation-event`, and typed backend side-channel
  fan-out instead of the retired generic `to-backend`/`from-backend` relay.
  Settings lifecycle docs now route renderer settings saves through the
  SDK-shaped `settings.update` command and Electron main settings-sync runtime
  instead of a removed renderer `to-backend` relay. The system architecture
  overview now describes Electron main as the Agent SDK host and routes the
  backend websocket hop through the Agent SDK runtime instead of a direct main
  WebSocket-client path. Voice/audio channel docs now route TTS playback
  through the typed `audio-chunk` side-channel and renderer audio runtime
  instead of the removed generic `from-backend` relay. The channels hub and
  routing matrix now route dashboard and minimal-pill chat through renderer SDK
  commands, the Electron Agent SDK host, and Agent SDK backend transport
  instead of shortcutting directly from Electron IPC to backend `/ws`.
  Wakeword route docs now name the local-runtime wakeword helper as the
  boundary backed by the Python service implementation instead of routing
  failures directly to the sidecar service. The IPC workflow now routes backend
  relay drift debugging through `windie:invoke`, typed SDK/backend-event
  fan-out, and Agent SDK backend transport instead of a removed non-chat
  `to-backend` path. Renderer voice docs now keep STT provider implementation
  and model config details behind the backend transcription gateway, while the
  renderer topology labels playback through typed audio runtime events.

  Local-runtime JSON-RPC, sidecar tool-change, and tool-turn docs now qualify
  Python sidecar method, handler, daemon, protocol, memory, and tool validation
  labels.
  Cross-runtime navigation, evidence, process-lifecycle, platform, memory, tool,
  and settings docs now qualify Python sidecar ownership for executable actions,
  memory storage, and local-runtime environment readers.
  SDK local-runtime auto-start now requires a host command, explicit daemon
  script, or daemon-script environment override instead of guessing WindieOS
  repository sidecar paths.
  Renderer chat send and stop code now routes desktop pending-turn IPC through
  a renderer app runtime client instead of importing the desktop send channel
  directly from chat hooks and message-send utilities.
  Renderer chat stream debug utilities now route live-surface trace IPC through
  a renderer app runtime client instead of importing the trace send channel
  directly. Local-runtime Python env compatibility constants now distinguish
  generic `AGENT_*` primary names from legacy WindieOS aliases through internal
  `ENV_WINDIE_*` constant names, with a guard to keep future Windie env aliases
  explicit. Active SDK auth/error and conversation-runtime docs now route
  hosted Python client and persistence labels through Python SDK and
  local-runtime wording instead of sidecar-facing SDK labels. Wakeword startup
  now routes the preferred model id from Electron host skin through generic
  wakeword-name env injection while preserving the WindieOS alias and default
  `hey_jarvis` behavior. SDK runtime env compatibility aliases now sit in an
  explicit Windie compatibility map consumed by generic `AGENT_*` key groups,
  keeping alias support out of SDK orchestration call sites. Active SDK
  hub/auth/route/hosted-client docs now route reusable SDK contract wording
  through hosted backend and Agent SDK labels instead of WindieOS-specific
  SDK-route framing. Reusable SDK examples now use neutral hosted endpoint,
  install-token, agent-name, provider, and model placeholders instead of
  production WindieOS endpoint/token and concrete GPT/OpenAI model ids. Active
  SDK tool-authoring, query-planning, and hosted-client docs now route reusable
  capability wording through hosted backend, hosted SDK route, first-party
  desktop app, and renderer skin labels instead of WindieOS-specific SDK
  capability wording. Generic Electron main window, overlay, display-affinity,
  and query-capture docs now route app-owned surfaces through desktop app
  surface/window wording instead of WindieOS-specific surface labels.
  Renderer message-send preparation now routes send-surface chatbox restore
  through a renderer app runtime window client instead of invoking the window
  IPC channel directly.
  Renderer message screenshot resolution and user screenshot presentation now
  route artifact image fetch and native image context-menu calls through a
  renderer app runtime artifact client.
  Renderer chat session bootstrap and loop transport state now route the main
  client snapshot and IPC status subscription through a renderer app runtime
  client.
  Renderer chat stream and SDK projection hooks now route conversation fan-out
  subscriptions through a renderer app runtime conversation event client.
  Renderer chat audio chunk and workspace access update subscriptions now route
  through renderer app runtime clients.
  Renderer app startup, wakeword chatbox restore, and main-window controls now
  route through the renderer app runtime window client.
  Renderer dashboard conversation refresh and title-poll subscriptions now route
  through the renderer app runtime conversation event client.
  Renderer wakeword audio, enable/disable, detected, and status IPC now route
  through the renderer app voice runtime client.
  Renderer minimal chatbox overlay focus, drag, hit-test, visual-anchor,
  text-entry, hide, and dashboard handoff IPC now route through the renderer app
  window runtime client.
  Renderer minimal response overlay size, hit-test, dismiss, and visibility
  re-report IPC now route through a renderer app response overlay runtime
  client.
  Renderer dashboard shell main-window target and user snapshot IPC now route
  through renderer app runtime clients.
  Renderer dashboard provider API-key prop contracts are now provider-id
  agnostic, keeping WindieOS provider identifiers in renderer skin config.
  Renderer settings-update failure classifier wording now reflects renderer
  runtime event ownership while preserving the backend-emitted failure text
  contract.
  Renderer voice transcription socket ready-state checks, close behavior, and
  conditional protocol sends now live behind the desktop voice runtime client.
  Backend result-transformer docs now describe tool-output pass-through as
  SDK/local-runtime owned instead of frontend-owned.
  Backend validation docs now route the input validation/client settings patch
  guard through a client-settings-named docs path instead of the retired
  frontend-named patch guard path.
  Electron main backend endpoint resolution now names its reusable generic
  fallback configuration as endpoint defaults while WindieOS hosted URLs stay
  injected by host skin.
  Electron main backend parse and error-event diagnostics now use generic
  agent-backend wording consistently with connection/close logs.
  The architecture memory overview now routes durable memory ownership through
  SDK/local-runtime memory with Python sidecar modules identified as the
  current backing implementation.
  The architecture extension-points overview now routes local tool extension
  ownership through SDK/main local-runtime dispatch while keeping Python
  sidecar modules as implementation details.
  The architecture tool-system overview now routes the diagram, manifest
  source, schema pairing, local validation, parity, screenshot lifecycle, and
  resource-limit labels through desktop client/local-runtime ownership while
  keeping Python sidecar modules as implementation details.
  The architecture agent-system overview now routes settings through
  renderer-managed client settings and tool sending through SDK/main
  local-runtime dispatch.
  The high-level architecture and backend architecture overviews now route
  error delivery to SDK/renderer consumers, local tool dispatch through the SDK
  local-runtime bridge, security enforcement gaps through local-runtime Python
  implementation wording, and local memory storage through SDK local-runtime
  memory backed by Python sidecar modules.
  The high-level architecture diagram now labels the desktop boundary as the
  desktop client / SDK host instead of an Electron frontend.
  Tool parity docs now route exposed-tool registry/set wording through
  local-runtime ownership backed by Python sidecar modules.
  The getting-started overview diagram now labels the desktop boundary as a
  desktop client / SDK host UI instead of an Electron frontend UI.
  Provider/config workflows and API reference transparency docs now route
  settings through renderer-managed settings and prompt/schema transparency
  through SDK/renderer consumers. Channel local-tool docs and troubleshooting
  maps now route local execution through SDK/main local-runtime and
  local-runtime Python executor wording instead of Python sidecar
  executor/daemon route-owner labels. Electron main direct backend payload
  filtering now delegates to the SDK backend payload contract through a thin
  facade instead of carrying a second websocket allowlist. SDK provider
  credential filtering now preserves syntactically safe provider ids while
  backend validation owns the supported provider list and ignores unsupported
  provider credential entries. The obsolete renderer `agentSdkClient.ts`
  package re-export facade has been deleted; renderer app-runtime contract
  code imports `packages/windie-sdk-js` directly and active docs route hosted
  TypeScript SDK work to the package boundary.

## Inspection Log

### 2026-06-21 Python SDK Package Test Label Boundary

- Finding: active Python SDK package/client tests and the repo-agent extension
  example test still introduced their coverage as sidecar test-suite behavior,
  even though the package boundary belongs to the reusable Python SDK and the
  repo-agent example is exercised through the local-runtime extension/tool
  registry boundary.
- Change: renamed those active test module docstrings to Python SDK package and
  local-runtime repo-agent example wording, and added a focused package-boundary
  guard for the exact active headers.
- Validation: focused Python SDK package/client and repo-agent example pytest
  coverage, exact stale sidecar-suite header scan, docs list, and diff hygiene.
- Compatibility/security: no migration required. Runtime code, Python SDK
  exports, local-runtime discovery, extension tool registration, backend
  endpoint config, IPC, credentials, and trust boundaries are unchanged.

### 2026-06-21 Local-Runtime Hosted Client Test Label Boundary

- Finding: active local-runtime Python hosted-backend client tests still
  introduced backend config, shared remote API client, remote semantic client,
  and remote client helper coverage as sidecar test-suite behavior, while the
  remote API client reference and adjacent backend/provider workflow docs still
  used sidecar remote-client wording.
- Change: renamed those active test module docstrings to local-runtime
  hosted-client/backend-endpoint wording, updated the backend-config docs
  assertion to the current local-runtime missing-config phrase, routed remote
  client docs/workflow labels through local-runtime wording, and added a
  focused backend-config guard for the active hosted-client test headers.
- Validation: focused local-runtime hosted-client/config pytest coverage,
  exact stale hosted-client label scan, docs list, and diff hygiene.
- Compatibility/security: no migration required. Runtime code, backend endpoint
  env precedence, HTTP session lifecycle, semantic summarize payloads, auth
  headers, IPC, credentials, and trust boundaries are unchanged.

### 2026-06-21 Local-Runtime Platform Test Label Boundary

- Finding: active local-runtime Python platform, system-state, and wakeword
  tests still introduced window-manager adapters, macOS automation permission,
  platform module selection, system-state collection, and wakeword service
  coverage as sidecar test-suite behavior, even though docs route these
  surfaces through the local-runtime system-state/platform and wakeword
  boundaries.
- Change: renamed those active test module docstrings to local-runtime
  platform/system-state/wakeword wording and added a focused system-state guard
  for the exact active platform test headers.
- Validation: focused local-runtime platform/system-state/wakeword pytest
  coverage, exact stale platform test-label scan, docs list, and diff hygiene.
- Compatibility/security: no migration required. Runtime code, OS automation
  permission probes, window-manager adapters, system-state payloads, wakeword
  framing/model selection, IPC, storage, credentials, and trust boundaries are
  unchanged.

### 2026-06-21 Local-Runtime Core Protocol Test Label Boundary

- Finding: active local-runtime Python core/protocol tests still introduced
  JSON-RPC, stdout framing, daemon lifecycle, env flag, executor, feature-pack,
  filesystem utility, thread-pool, and Unicode sanitizer coverage as sidecar
  test-suite behavior even though those surfaces are local-runtime support
  contracts behind Electron/SDK adapters.
- Change: renamed those active module docstrings to local-runtime
  core/protocol/helper wording and added a focused JSON-RPC protocol guard for
  the exact active support-test headers while preserving real
  `sidecar_daemon.py` implementation references.
- Validation: focused local-runtime core/protocol pytest coverage, exact stale
  core/protocol test-label scan, docs list, and diff hygiene.
- Compatibility/security: no migration required. Runtime code, JSON-RPC
  envelopes, stdout framing, daemon entrypoint/discovery, env aliases, feature
  pack install paths, IPC, storage, credentials, and trust boundaries are
  unchanged.

### 2026-06-21 Local-Runtime Tool Test Label Boundary

- Finding: active local-runtime executable tool tests still introduced their
  coverage as sidecar test-suite behavior, and the tool registry parity failure
  message still described drift as a sidecar registry problem even though the
  executable tool contract belongs to the local-runtime tool boundary.
- Change: renamed the active tool, schema, manifest, registry, filesystem,
  shell, computer, system, and browser tool test docstrings to local-runtime
  wording, changed the registry parity failure copy to local-runtime wording,
  and added a focused registry-test guard for the exact active tool headers.
- Validation: focused local-runtime tool pytest coverage for the registry
  header guard and selected tool suites, exact stale tool-test label scan, docs
  list, and diff hygiene. A broader run including
  `tests/sidecar/test_shell_process_tool.py` still fails the existing Windows
  heredoc assertions unrelated to this label-only change.
- Compatibility/security: no migration required. Runtime code, executable tool
  schemas, backend schema parity, SDK tool dispatch, IPC, filesystem/shell/
  browser/computer authority, credentials, and trust boundaries are unchanged.

### 2026-06-21 Local-Runtime Memory Test Label Boundary

- Finding: active local-runtime Python memory and conversation tests still
  introduced their coverage as behavior in the sidecar test suite, even though
  docs and code now route conversation storage, memory operations, summarizer,
  and watermark behavior through the local-runtime memory boundary.
- Change: renamed those active test module docstrings to local-runtime
  memory/conversation wording, updated the memory docs hub `read_when` label,
  and added a focused guard in `test_memory_operations.py` for the exact
  memory/conversation test headers.
- Validation: focused local-runtime memory/conversation pytest coverage, exact
  stale memory-test docstring scan, docs list, and diff hygiene.
- Compatibility/security: no migration required. Runtime code, SQLite/FAISS
  storage, local-memory JSON-RPC methods, SDK store contracts, IPC, credentials,
  and trust boundaries are unchanged.

### 2026-06-21 Agent SDK Local-Runtime Unavailable Fixture Boundary

- Finding: `AgentSdkConversationRuntime.test.ts` still used
  `sidecar unavailable` as the active `ToolExecutionCoordinator` local-runtime
  execution exception, backend result output, and stored tool-output error even
  though the reusable SDK boundary is local-runtime execution.
- Change: renamed that active fixture to `local runtime unavailable` and
  broadened the SDK package-boundary guard so conversation-runtime tests reject
  the exact stale unavailable error/output labels.
- Validation: focused Agent SDK conversation-runtime/package-boundary Jest
  coverage and exact stale unavailable-fixture scan over the active SDK tests.
- Compatibility/security: no migration required. Runtime code, SDK exports,
  tool execution ordering, backend tool-result payload shape, IPC, storage,
  credentials, and trust boundaries are unchanged.

### 2026-06-21 Local-Runtime Python Bootstrap Label Boundary

- Finding: `test_bootstrap_paths.py` still described bootstrap path coverage as
  sidecar test-suite behavior and named its local tool registry smoke test after
  local-backend bootstrap, even though the concrete `local_backend.py` file is
  now an implementation detail behind the local-runtime Python bootstrap
  boundary.
- Change: renamed the active bootstrap test docstring and smoke-test name to
  local-runtime Python bootstrap wording and expanded the existing source guard
  to reject the exact retired labels while preserving concrete bootstrap file
  paths.
- Validation: focused bootstrap-path pytest coverage and exact stale bootstrap
  label scan.
- Compatibility/security: no migration required. Runtime code, import
  bootstrap behavior, JSON-RPC methods, local tool schemas, daemon entrypoint,
  IPC, storage, credentials, and trust boundaries are unchanged.

### 2026-06-21 Local-Runtime Python Test Label Boundary

- Finding: active local-runtime Python tests still described the owner boundary
  as local-backend behavior and sidecar tool helpers in docstrings, test names,
  and helper path constants, even though `local_backend.py` and the sidecar
  directory are implementation details behind the local-runtime boundary.
- Change: renamed those active test labels to local-runtime service/tool-helper
  wording and added a focused test-file guard for the exact retired labels while
  preserving concrete `local_backend.py`, `sidecar_daemon.py`, and
  `tests/sidecar` paths where they identify real files or commands.
- Validation: focused sidecar local-backend/browser-registry pytest coverage
  and exact stale active-test label scan.
- Compatibility/security: no migration required. Runtime code, JSON-RPC method
  names, local tool schemas, daemon entrypoint, IPC, storage, credentials, and
  trust boundaries are unchanged.

### 2026-06-21 Agent SDK Tool-Coordinator Failure Fixture Boundary

- Finding: `AgentSdkConversationRuntime.test.ts` still used `sidecar failed`
  as the active `ToolExecutionCoordinator` local-runtime execution failure even
  though the reusable SDK boundary is local-runtime execution and the concrete
  Python sidecar is only the desktop implementation detail.
- Change: renamed that failure fixture to `local runtime failed` and widened
  the SDK package-boundary guard so active SDK client and conversation-runtime
  local-runtime tests reject stale sidecar fixture labels together.
- Validation: focused Agent SDK conversation-runtime/package-boundary Jest
  coverage and exact stale failure-fixture scan over the active SDK tests.
- Compatibility/security: no migration required. Runtime code, SDK exports,
  tool execution ordering, backend tool-result payloads, IPC, storage,
  credentials, and trust boundaries are unchanged.

### 2026-06-21 Agent SDK Local-Runtime Fixture Boundary

- Finding: reusable Agent SDK runtime tests still used active fixture names such
  as `sidecar_daemon.py`, `sidecar failed`, and `conv-sidecar` even though the
  SDK source and public runtime contract now describe local-runtime daemon,
  error, and conversation behavior.
- Change: renamed those active fixtures in `AgentSdkClient.test.ts` to
  local-runtime wording and added `AgentSdkPackageBoundary` coverage for the
  exact stale fixture strings so removal guards can still mention retired
  sidecar modules without active SDK examples teaching the old owner label.
- Validation: focused Agent SDK client/package-boundary Jest coverage and exact
  stale-fixture scan over the SDK client test.
- Compatibility/security: no migration required. Runtime code, SDK exports,
  local-runtime daemon startup, discovery metadata, IPC channels, backend
  transport payloads, storage, credentials, and trust boundaries are unchanged.

### 2026-06-21 Renderer Chat Send Lifecycle Trace Boundary

- Finding: `desktopChatSendPreparationRuntime.ts` owned send lifecycle timing,
  but still assembled chat-pill trace payload fields such as `turn_id` and
  `include_query_screenshot` for send-start, screenshot-decision, and
  query-dispatched diagnostics.
- Change: added chat send lifecycle payload/logging helpers to
  `desktopRendererTraceRuntime.ts` and routed send preparation through them so
  send-prep reports lifecycle values while the trace runtime owns chat-pill
  trace field naming.
- Validation: focused renderer trace runtime, chat message sender/runtime
  boundary coverage, docs listing, stale send-prep trace-field scan, and diff
  checks.
- Compatibility: no migration required. Chat send order, pending-turn
  acceptance, screenshot resource policy, query dispatch payloads, chat-pill
  trace event shape, IPC, storage, permissions, credentials, hosted backend
  URLs, and provider policy are unchanged.

### 2026-06-21 Renderer Current-Turn Applied Trace Boundary

- Finding: `useConversationRuntimeProjectionStream.ts` delegated SDK live-turn
  store side effects to `desktopSdkLiveTurnEffectsRuntime`, but still
  called `logRendererLiveSurfaceTrace(...)` directly for
  `renderer.current_turn.applied` and assembled overlay mode, guard ref,
  visibility, text-length, tool-count, and stale-skip trace fields locally.
- Change: added current-turn applied payload/logging helpers to
  `desktopRendererTraceRuntime.ts` and routed the projection hook through them
  so the hook reports the SDK current-turn object and derived-side-effect skip
  state instead of owning live-surface trace event names or projection fields.
- Validation: focused renderer trace runtime, chat stream current-turn state,
  renderer chat/runtime boundary coverage, docs listing, stale hook-local
  current-turn trace scan, and diff checks.
- Compatibility: no migration required. SDK current-turn application order,
  stale-side-effect gating, chat store mutations, live-surface event name and
  payload shape, IPC, storage, permissions, credentials, hosted backend URLs,
  and provider policy are unchanged.

### 2026-06-21 Renderer Chat Pill Live Trace Boundary

- Finding: `MinimalChatPill.jsx` already consumed app-runtime helpers for chat
  pill state traces, but still called `logRendererLiveSurfaceTrace(...)`
  directly for send reset, mount/unmount lifecycle, and normal hit-test changes
  with event labels such as `turn_surface.reset`, `renderer.chat_pill.*`, and
  `chat_pill.hit_test.set`.
- Change: added chat pill reset, lifecycle, and hit-test payload/logging
  helpers to `desktopRendererTraceRuntime.ts` and routed `MinimalChatPill`
  through them so the component reports send, lifecycle, and pointer-state
  values instead of owning live-surface event names or hit-test field mapping.
- Validation: focused renderer trace runtime, response overlay state, renderer
  app-runtime boundary coverage, docs listing, stale component-local chat pill
  live-trace scan, and diff checks.
- Compatibility: no migration required. Live-surface event names and payload
  shape, chat pill send/reset behavior, hit-test IPC, window lifecycle, storage,
  permissions, credentials, hosted backend URLs, and provider policy are
  unchanged.

### 2026-06-21 Renderer Response Overlay Surface Snapshot Trace Boundary

- Finding: `MinimalResponseOverlay.jsx` consumed app-runtime helpers for
  overlay state/render/live traces, but still called the raw
  `logRendererResponseSurfaceTrace(...)` response-surface stream logger with
  snapshot field names such as `overlayPhase` and `activeResponseType`.
- Change: added response-surface snapshot payload/logging helpers to
  `desktopRendererTraceRuntime.ts` and routed `MinimalResponseOverlay` through
  them so the component reports phase, message-count, response-entry,
  visible-response, and text-length values instead of owning response-surface
  snapshot trace fields locally.
- Validation: focused renderer trace runtime, response overlay state, renderer
  app-runtime boundary coverage, docs listing, stale component-local
  response-surface snapshot scan, and diff checks.
- Compatibility: no migration required. Response-surface stream trace event
  shape, overlay state/render traces, response rendering, IPC, storage,
  permissions, credentials, hosted backend URLs, and provider policy are
  unchanged.

### 2026-06-21 Renderer Response Overlay Rendered Live Trace Boundary

- Finding: `MinimalResponseOverlay.jsx` consumed app-runtime trace helpers for
  overlay state and render traces, but still assembled the live-surface
  `response_overlay.hit_test.set`, `typing.rendered.show`, and
  `typing.rendered.hide` payloads locally.
- Change: added response overlay hit-test and rendered-typing live trace
  payload/logging helpers to `desktopRendererTraceRuntime.ts`, then routed
  `MinimalResponseOverlay` through those helpers so the component reports only
  interaction and rendered-state values instead of owning trace event labels,
  reason strings, or payload field names.
- Validation: focused renderer trace runtime, response overlay state, renderer
  app-runtime boundary coverage, docs listing, stale component-local
  live-trace event scan, and diff checks.
- Compatibility: no migration required. Live-surface event names and payload
  fields, hit-test IPC behavior, rendered typing indicator behavior, overlay
  rendering, storage, permissions, credentials, hosted backend URLs, and
  provider policy are unchanged.

### 2026-06-21 Renderer Response Overlay Window-Sync Live Trace Boundary

- Finding: `useResponseOverlayWindowSync.js` routed stream-style size traces
  through `desktopRendererTraceRuntime`, but still assembled the live-surface
  `response_overlay.renderer.size_report` payload plus response overlay
  mount/unmount event labels locally.
- Change: added response overlay live size payload shaping and lifecycle trace
  logging helpers to `desktopRendererTraceRuntime.ts`, then routed the
  window-sync hook through those helpers so it reports measured frame,
  turn/guard, and visibility values instead of owning trace event labels,
  reason fields, native overlay-mode mapping, or live payload field names.
- Validation: focused renderer trace runtime, response overlay state, renderer
  chat/app-runtime boundary coverage, docs listing, stale hook-local
  live-trace event scan, and diff checks.
- Compatibility: no migration required. Live-surface event names and payload
  fields, stream trace fields, debug query flags, IPC responsebox sizing,
  overlay rendering, storage, permissions, credentials, hosted backend URLs,
  and provider policy are unchanged.

### 2026-06-21 Renderer Response Overlay View-Model Trace Boundary

- Finding: `useResponseOverlayViewModel.js` consumed app-runtime trace helpers
  for adjacent response overlay diagnostics, but still assembled
  `renderer.overlay_view_model.resolved`, `typing.show`/`typing.hide`,
  `response_overlay.intent.*`, and view-model trace reason strings locally.
- Change: added response overlay view-model trace payload, typing/intent event,
  resolved-event logging, and generic log helpers to
  `desktopRendererTraceRuntime.ts`, then routed the overlay view-model through
  those helpers so the hook reports value-level inputs and change detection
  instead of owning live-surface trace schema strings.
- Validation: focused renderer trace runtime, response overlay state, renderer
  app-runtime boundary coverage, docs listing, stale hook-local trace event
  scan, and diff checks.
- Compatibility: no migration required. Live-surface trace event names,
  payload fields, debug query flags, IPC trace forwarding, overlay rendering,
  storage, permissions, credentials, hosted backend URLs, and provider policy
  are unchanged.

### 2026-06-21 Renderer Response Overlay Dismissal Target Boundary

- Finding: `useResponseOverlayViewModel.js` already consumed app-runtime
  current-turn presentation and response-entry helpers, but still built the
  dismissal target locally from SDK overlay intent, latest response entry,
  projection turn/conversation refs, and stale guard ref.
- Change: added
  `resolveResponseOverlayDismissalTarget(...)` to
  `desktopCurrentTurnPresentationRuntime.js` and routed the overlay view-model
  through it so the hook only handles dismissal state lookup and close action
  wiring.
- Validation: focused chatbox surface, response overlay state, renderer
  app-runtime boundary coverage, docs listing, stale hook-local
  dismissal-target scan, and diff checks.
- Compatibility: no migration required. Dismissal key shape, response overlay
  close behavior, SDK overlay intent fields, turn/guard refs, IPC, storage,
  permissions, credentials, hosted backend URLs, and provider policy are
  unchanged.

### 2026-06-21 Renderer SDK Current-Turn Presentation Boundary

- Finding: `useChatSurfaceController.js` and
  `useResponseOverlayViewModel.js` still duplicated SDK current-turn
  presentation-state reduction from overlay intent, awaiting anchor,
  lifecycle, and visible response-entry fields even though current-turn surface
  projection belonged with `desktopCurrentTurnPresentationRuntime.js`.
- Change: added
  `resolveSdkCurrentTurnPresentationState(...)` to the current-turn
  presentation runtime and routed both feature hooks through the shared helper,
  keeping dismissal inputs and UI composition local while moving SDK
  presentation semantics behind the app-runtime facade.
- Validation: focused chatbox surface, chat surface controller, renderer
  app-runtime boundary coverage, docs listing, stale feature-local SDK
  presentation-builder scan, and diff checks.
- Compatibility: no migration required. SDK `currentTurn` payloads, overlay
  intent fields, lifecycle string values, awaiting-dot target selection,
  response overlay dismissal behavior, IPC, storage, permissions, credentials,
  hosted backend URLs, and provider policy are unchanged.

### 2026-06-21 Renderer App-Runtime Helper Export Boundary

- Finding: `desktopDashboardConversationLoadRuntime.js` and
  `desktopOverlayTurnLifecycleRuntime.js` exported internal title/ref matching
  and JSON phase-group tables after earlier runtime extraction work, even
  though no renderer consumer imported those helpers directly.
- Change: made those implementation details private, kept the public
  row-update and lifecycle resolver behavior unchanged, added export-surface
  guards, and updated dashboard/overlay docs plus the renderer source map.
- Validation: focused dashboard conversation load, overlay lifecycle, renderer
  app-runtime boundary coverage, app-runtime stale export scan, docs listing,
  and diff checks.
- Compatibility: no migration required. Dashboard row projection, rename,
  delete, pin, title-poll behavior, overlay lifecycle resolution, shared JSON
  contracts, IPC channels, storage, provider policy, and hosted backend
  behavior are unchanged.

### 2026-06-21 Main SDK Live-Turn Surface Intent Privacy

- Finding: `live_turn_surface_controller.cjs` already owned SDK current-turn
  overlay intent parsing, but exported `resolveOverlayIntent(...)` into
  `frontend/src/main/index.cjs` so the Electron main composition root could
  skip dismissed response-overlay intents.
- Change: moved dismissed-response filtering into
  `handleSdkLiveTurnSurfaceIntent(...)` behind an injected
  `isResponseOverlayGuardDismissed(...)` dependency. The composition root now
  calls the live-turn surface facade only, while lower-level overlay-intent
  parsing remains private to the surface controller.
- Validation: focused live-turn surface controller tests, targeted Electron
  main/surface lint, docs listing, stale export/import scans, and diff checks.
- Compatibility: no migration required. SDK current-turn payloads,
  response-overlay dismissal behavior, diagnostic payloads, native window
  mutation, IPC channels, credentials, permissions, trust boundaries, and
  storage are unchanged.

### 2026-06-21 SDK Agent Stream Event Runtime Facade

- Finding: `runtime/AgentStreamEvents.ts` already owned `agent.stream(...)`
  stream-event projection and tool-output dedupe key derivation, but exposed
  `toAgentStreamEvents(...)`, `toolOutputStreamKey(...)`, and
  `toolOutputStreamKeys(...)` directly to SDK runtime consumers.
- Change: added `createAgentStreamEventRuntime(...)` as the SDK runtime facade
  for stream projection and tool-output dedupe keys. `Agent.stream(...)` and
  `AgentChatSession.stream(...)` now consume that facade while lower-level
  mapper/key helpers stay private to `AgentStreamEvents`; checked-in CJS output
  was regenerated for the changed SDK runtime files.
- Validation: focused Agent SDK conversation-runtime, private-export, and
  package-boundary tests, TypeScript SDK CJS build, SDK type checks, docs
  listing, stale export scans, and diff checks.
- Compatibility: no migration required. Public package-root stream event types,
  `agent.stream(...)` output shape, dedupe behavior, local-runtime execution,
  backend transport, credentials, permissions, trust boundaries, and storage are
  unchanged.

### 2026-06-21 Main Overlay Phase Contract Runtime Facade

- Finding: `ipc_overlay_phase_contract.cjs` already owned the canonical
  response-overlay phase set and metadata keys, but still exported lower-level
  `normalizeOverlayString(...)` and `normalizeOverlayNumber(...)` scalar helpers
  directly into overlay state and backend-event transition mapping.
- Change: added `createResponseOverlayPhaseContractRuntime(...)` as the public
  overlay contract facade for supported-phase checks, event scalar
  normalization, response-overlay metadata normalization, and metadata equality.
  `ipc_overlay_phase_state.cjs` and `ipc_overlay_phase_events.cjs` now consume
  that facade while scalar and metadata normalization stay private to the
  contract owner.
- Validation: focused overlay phase contract, state, events, response-overlay
  runtime, handler, live-turn surface, parity, and main SDK boundary tests,
  targeted main IPC/surface lint, docs listing, stale export scans, and diff
  checks.
- Compatibility: no migration required. Response-overlay phase values,
  metadata payloads, backend-event transitions, renderer fan-out, IPC channels,
  credentials, permissions, trust boundaries, and storage are unchanged.

### 2026-06-21 Main Conversation Metadata Diagnostics Runtime Facade

- Finding: `ipc_conversation_metadata_diagnostics_runtime.cjs` already owned
  conversation metadata-list diagnostic context normalization and event record
  assembly, but `ipc_agent_sdk_command_handlers.cjs` still imported the
  lower-level `normalizeAppDiagnosticContext(...)` and
  `recordConversationMetadataListDiagnostic(...)` helpers directly.
- Change: added `createConversationMetadataDiagnosticsRuntime(...)` as the
  public diagnostics facade and routed renderer diagnostic append plus
  conversation-list lifecycle diagnostics through `createContext(...)` and
  `record(...)`, keeping context normalization and record assembly helpers
  private while preserving trace-id propagation into the mutable context.
- Validation: focused conversation metadata diagnostics, Agent SDK command
  handler, and main SDK boundary tests, targeted main IPC lint, docs listing,
  stale export scans, and diff checks.
- Compatibility: no migration required. App diagnostic event shapes,
  diagnostics path, trace-id propagation, SDK command payloads, credentials,
  permissions, trust boundaries, and storage are unchanged.

### 2026-06-21 Main Runtime Conversation Ref Resolver Privacy

- Finding: `ipc_runtime_conversation_ref.cjs` already exposed the composed
  conversation-ref runtime facade, but `resolveRuntimeConversationRef(...)`
  still leaked the lower-level payload/fallback resolver as a public helper
  export after the string normalizer was made private.
- Change: removed the resolver from the public module surface while preserving
  runtime coverage for nested transport `payload.conversation_ref` precedence,
  direct `conversation_ref` / `conversationRef` aliases, cached current
  conversation fallback, trimming, blank-value rejection, non-string rejection,
  and latest-fallback lookup.
- Validation: focused runtime conversation-ref and main SDK boundary tests,
  targeted main IPC lint, docs listing, stale export scans, and diff checks.
- Compatibility: no migration required. SDK runtime command payloads,
  conversation-ref fallback behavior, replay/edit/retry paths, IPC channels,
  credentials, permissions, trust boundaries, and storage are unchanged.

### 2026-06-21 Main Runtime Conversation Ref Normalizer Privacy

- Finding: `ipc_runtime_conversation_ref.cjs` already exposed the composed
  runtime facade and public conversation-ref resolver, but
  `normalizeOptionalString(...)` still leaked as a lower-level helper export.
- Change: removed the string normalizer from the public module surface while
  preserving resolver coverage for nested transport `payload.conversation_ref`,
  direct snake/camel aliases, cached fallback refs, trimming, blank values, and
  non-string rejection; a later follow-up kept the resolver private behind the
  same runtime facade.
- Validation: focused runtime conversation-ref and main SDK boundary tests,
  targeted main IPC lint, docs listing, stale export scans, and diff checks.
- Compatibility: no migration required. SDK runtime command payloads,
  conversation-ref fallback behavior, replay/edit/retry paths, credentials,
  permissions, trust boundaries, and storage are unchanged.

### 2026-06-21 Main Renderer Window Registry Privacy

- Finding: `ipc_renderer_windows.cjs` already exposed the composed
  renderer-window runtime facade, but `createRendererWindowRegistry(...)` still
  leaked the lower-level mutable window registry helper as a public export and
  `ipc.cjs` still constructed it directly before handing it back to the
  runtime facade.
- Change: removed the registry constructor from the public module surface and
  let `createRendererWindowRuntime(...)` own the default registry while
  preserving runtime coverage for window tracking, broadcast sender exclusion,
  reset/size access, overlay sync, current-turn sync, pending-turn sync,
  buffered replay, and injectable registry composition.
- Validation: focused renderer-window and main SDK boundary tests, targeted
  main IPC lint, docs listing, stale export scans, and diff checks.
- Compatibility: no migration required. IPC channels, renderer fan-out,
  replay, window lifecycle, credentials, permissions, trust boundaries, and
  storage are unchanged.

### 2026-06-21 Main Stop Target Resolver Helper Privacy

- Finding: `ipc_stop_target_runtime.cjs` already exposed the composed
  stop-target runtime facade, but `isStoppableCurrentTurnProjection(...)` and
  `resolveMainStopTarget(...)` still leaked lower-level projection and
  resolution helpers as public exports.
- Change: removed those helpers from the public module surface while preserving
  runtime coverage for SDK-current-turn priority, busy-presentation handling,
  pending-turn fallback, idle conversation fallback, SDK-shaped stop payloads,
  and overlay completion.
- Validation: focused stop-target runtime and main SDK boundary tests, targeted
  main IPC lint, docs listing, stale export scans, and diff checks.
- Compatibility: no migration required. IPC channels, global shortcuts, SDK
  stop payloads, overlay phase behavior, credentials, permissions, trust
  boundaries, and storage are unchanged.

### 2026-06-21 Main Pending Turn Runtime Helper Privacy

- Finding: `ipc_pending_turn_handlers.cjs` already exposed the composed
  pending-turn runtime facade, but `normalizePendingTurnPayload(...)` and
  `pendingTurnMatchesCurrentTurn(...)` still leaked lower-level payload and
  matching helpers as public exports.
- Change: removed those helpers from the public module surface while preserving
  runtime coverage for pending envelope normalization, incomplete-payload
  rejection, attachment filename filtering, clear behavior, renderer fan-out,
  and SDK-current-turn cleanup matching.
- Validation: focused pending-turn handler and main SDK boundary tests,
  targeted main IPC lint, docs listing, stale export scans, and diff checks.
- Compatibility: no migration required. IPC channels, pending-turn payload
  shape, renderer fan-out, SDK current-turn cleanup, credentials,
  permissions, trust boundaries, and storage are unchanged.

### 2026-06-21 Main Electron Agent Client Factory Helper Privacy

- Finding: `ipc_electron_agent_client_factory.cjs` already exposed the composed
  factory runtime facade, but `buildManagedBackendEndpoints(...)`,
  `buildDesktopLocalRuntimeLaunchOptionsForAgent(...)`, and
  `buildDesktopLocalRuntimeOptions(...)` still leaked lower-level option
  shaping helpers as public exports.
- Change: removed those helpers from the public module surface while preserving
  runtime coverage for managed endpoint mapping, desktop auto-local-runtime
  launch-plan construction, launch error behavior, test-mode disable behavior,
  dynamic host option resolution, callbacks, timeout policy, websocket
  injection, and logging.
- Validation: focused Electron agent-client factory and main SDK boundary
  tests, targeted main IPC lint, docs listing, stale export scans, and diff
  checks.
- Compatibility: no migration required. SDK client options, backend endpoints,
  websockets, local-runtime launch behavior, install auth, credentials,
  permissions, trust boundaries, and storage are unchanged.

### 2026-06-21 Main Global Stop Shortcut Config Helper Privacy

- Finding: `ipc_global_stop_shortcut_config_runtime.cjs` already exposed the
  composed shortcut config runtime facade, but
  `normalizeGlobalAgentStopShortcutStatus(...)` and
  `applyGlobalStopShortcutFallbackToConfig(...)` still leaked raw helper
  exports.
- Change: removed the raw helpers from the public module surface while
  preserving runtime coverage for status trim/filter normalization, invalid
  status handling, fallback config application, failed-registration skip
  behavior, persistence, broadcast, and reset.
- Validation: focused global stop shortcut config runtime tests, targeted main
  IPC lint, docs listing, stale export scans, and diff checks.
- Compatibility: no migration required. Desktop config shape, global shortcut
  status, fallback persistence, IPC status broadcasts, credentials,
  permissions, trust boundaries, and storage are unchanged.

### 2026-06-21 Main Host Copy Default Privacy

- Finding: `ipc_host_copy_runtime.cjs` already exposed the composed host-copy
  runtime facade, but `DEFAULT_IPC_HOST_COPY` still leaked the generic fallback
  copy object as a public helper export.
- Change: removed the default copy object from the public module surface while
  preserving runtime coverage for generic identity defaults, MCP client info,
  query-event fallback, independent section fallback, and host-skin
  configuration.
- Validation: focused host-copy runtime and main host-skin boundary tests,
  targeted main IPC lint, docs listing, stale export scans, and diff checks.
- Compatibility: no migration required. Host-skin configuration, SDK agent
  display names, MCP client identity, query-event copy, IPC channels,
  credentials, permissions, trust boundaries, and storage are unchanged.

### 2026-06-21 Main Backend Endpoint State Privacy

- Finding: `ipc_backend_endpoint_state.cjs` already exposed the composed
  endpoint runtime facade, but `createBackendEndpointState(...)` still leaked
  lower-level mutable endpoint state construction as a public helper export.
- Change: removed the endpoint state factory from the public module surface
  while preserving runtime coverage for default initialization, candidate
  refresh, fallback advancement, empty-candidate fallback, hosted-backend
  configuration, and websocket/HTTP URL access.
- Validation: focused backend endpoint state tests, targeted main IPC lint,
  docs listing, stale export scans, and diff checks.
- Compatibility: no migration required. Backend endpoint URLs,
  hosted-backend config, artifact URLs, SDK runtime construction, IPC status,
  credentials, permissions, trust boundaries, and storage are unchanged.

### 2026-06-21 Main Conversation Status Error Helper Privacy

- Finding: `ipc_conversation_status_runtime.cjs` already owned terminal SDK
  conversation-event projection through `buildConversationTerminalStatus(...)`,
  but `resolveConversationStatusError(...)` still leaked as a lower-level
  helper export.
- Change: removed the error-payload interpreter from the public module surface
  while preserving projection coverage for completed, stopped, runtime-error,
  turn-error, non-string error, workspace-path, and non-terminal events.
- Validation: focused conversation-status runtime and main SDK boundary tests,
  targeted main IPC lint, docs listing, stale export scans, and diff checks.
- Compatibility: no migration required. SDK conversation event payloads,
  renderer status objects, workspace paths, IPC channels, credentials,
  permissions, trust boundaries, and storage are unchanged.

### 2026-06-21 Main Workspace Path Resolver Privacy

- Finding: `ipc_workspace_path_runtime.cjs` already exposed the composed
  workspace-path runtime facade, but `resolveWorkspacePathForAgentPayload(...)`
  still leaked the lower-level payload/config resolver as a public helper
  export after the string normalizer was made private.
- Change: removed the resolver from the public module surface while preserving
  runtime coverage for command payload `workspace_path` / `workspacePath`
  precedence, cached desktop UI config fallback, trimming, blank-value
  rejection, non-string rejection, and latest-config lookup.
- Validation: focused workspace-path runtime and main SDK boundary tests,
  targeted main IPC lint, docs listing, stale export scans, and diff checks.
- Compatibility: no migration required. SDK runtime command payloads,
  workspace fallback behavior, IPC channels, credentials, permissions, trust
  boundaries, and storage are unchanged.

### 2026-06-21 Main Workspace Path Normalizer Privacy

- Finding: `ipc_workspace_path_runtime.cjs` already exposed the composed
  runtime facade and public workspace-path resolver, but
  `normalizeOptionalString(...)` still leaked as a lower-level helper export.
- Change: removed the string normalizer from the public module surface while
  preserving resolver coverage for command payload `workspace_path` /
  `workspacePath`, cached desktop UI config fallback, trimming, blank values,
  and non-string rejection; a later follow-up kept the resolver private behind
  the same runtime facade.
- Validation: focused workspace-path runtime and main SDK boundary tests,
  targeted main IPC lint, docs listing, stale export scans, and diff checks.
- Compatibility: no migration required. SDK runtime command payloads,
  workspace fallback behavior, credentials, permissions, trust boundaries, IPC
  channels, and storage are unchanged.

### 2026-06-21 Main Process Trace Normalizer Privacy

- Finding: `ipc_main_process_trace_runtime.cjs` already exposed the composed
  Electron main trace runtime, but `normalizeOptionalString(...)`,
  `normalizePositiveInteger(...)`, and `isPlainObject(...)` still leaked as
  focused-test-only helper exports.
- Change: removed those helpers from the public module surface and moved trim,
  positive-duration, and diagnostic data coverage through
  `createMainProcessTraceRuntime(...).appendMainProcessTraceEvent(...)`.
- Validation: focused main-process trace tests, targeted main IPC lint, docs
  listing, stale export scans, and diff checks.
- Compatibility: no migration required. Permission-probe app diagnostic shape,
  SDK conversation trace events, trace input sanitization, credentials,
  permissions, trust boundaries, and storage are unchanged.

### 2026-06-21 Main Install Auth Identity Normalization Privacy

- Finding: `ipc_install_auth_identity_runtime.cjs` already exposed the composed
  Electron main install-auth identity runtime, but
  `normalizeInstallAuthState(...)` still leaked as a focused-test-only helper
  export.
- Change: removed the normalizer from the public module surface and moved
  token/user/install-id trim plus incomplete-state rejection coverage through
  `createInstallAuthIdentityRuntime(...).applyInstallAuthState(...)`.
- Validation: focused install-auth identity and main SDK boundary tests,
  targeted main IPC lint, docs listing, stale export scans, and diff checks.
- Compatibility: no migration required. Install-auth state shape, SDK
  `installAuth` option, current-user accessors, server-user fallback,
  credentials, permissions, trust boundaries, and storage are unchanged.

### 2026-06-21 Main Host Option State Helper Privacy

- Finding: `ipc_host_option_state.cjs` already exposed the composed Electron
  main host-option state facade, but `normalizeOptionalFunction(...)`,
  `normalizeOptionalObject(...)`, and
  `buildDesktopLocalRuntimeLaunchConfig(...)` still leaked as
  focused-test-only helper exports.
- Change: removed those helpers from the public module surface and moved
  callback/object normalization plus desktop local-runtime launch-config
  coverage through `createIpcHostOptionState(...)`.
- Validation: focused host-option state and main SDK boundary tests, targeted
  main IPC lint, docs listing, stale export scans, and diff checks.
- Compatibility: no migration required. Initialize options, callback handles,
  desktop local-runtime launch config, credentials, permissions, trust
  boundaries, and storage are unchanged.

### 2026-06-21 Main Client Session Snapshot Privacy

- Finding: `ipc_client_session_handlers.cjs` already exposed the composed
  client-session IPC runtime and kept lower-level handler registration
  private, but `buildClientSessionSnapshot(...)` still leaked as a
  focused-test-only helper export.
- Change: removed the snapshot builder from the public module surface and
  moved renderer-facing session payload coverage through the registered
  `get-client-user-id` handler.
- Validation: focused client-session handler and main SDK boundary tests,
  targeted main IPC lint, docs listing, stale export scans, and diff checks.
- Compatibility: no migration required. Client-session IPC channels,
  renderer-facing payload shape, transcript-session sync, runtime endpoint
  snapshot fields, credentials, permissions, trust boundaries, and storage are
  unchanged.

### 2026-06-21 Main Desktop UI Config Diagnostic Trace Privacy

- Finding: `ipc_desktop_ui_config_persistence_runtime.cjs` already owned MCP
  enablement preservation, save diagnostics, and injected deterministic
  clock/random sources, but `createMcpEnablementTraceId(...)` still leaked as a
  focused-test-only helper export.
- Change: removed the trace-id builder from the public module surface and
  moved deterministic ID coverage through
  `createDesktopUiConfigPersistenceRuntime(...)`
  `.recordMcpEnablementDiagnostic(...)`.
- Validation: focused desktop UI config persistence tests, targeted main IPC
  lint, docs listing, stale export scans, and diff checks.
- Compatibility: no migration required. Desktop UI config payloads, MCP
  enablement allowlists, diagnostic event shape, provider-secret redaction,
  credentials, permissions, trust boundaries, and storage are unchanged.

### 2026-06-21 Main Agent Definition Context Merge Privacy

- Finding: `ipc_agent_definition_context.cjs` already exposed the composed
  Electron main agent-definition context runtime and kept lower-level
  attachment private, but `mergeAgentDefinitionContext(...)` still leaked as a
  focused-test-only helper export.
- Change: removed the merge helper from the public module surface and moved
  generated/supplied definition merge coverage through
  `createAgentDefinitionContextRuntime(...).attach(...)`, preserving the
  runtime facade as the only public executable path.
- Validation: focused agent-definition context and main SDK boundary tests,
  targeted main IPC lint, docs listing, stale export scans, and diff checks.
- Compatibility: no migration required. Query IPC payloads, SDK
  `agent_definition` shape, repo `AGENTS.md` prompt layers, extension skill
  prompt layers, workspace facts, host OS facts, credentials, permissions, and
  provider policy are unchanged.

### 2026-06-21 Main Pending-Turn Runtime Export Boundary

- Finding: `ipc_pending_turn_handlers.cjs` already owned pending-turn payload
  normalization, renderer fan-out, and explicit clear filtering, but exported
  the private `pendingTurnMatchesTarget(...)` helper even though no caller used
  it outside the module.
- Change: removed the stale export, kept target matching inside
  `clearPendingTurnState(...)`, and added focused coverage that the public
  helper surface excludes the private matcher while clear filtering still
  rejects mismatched targets.
- Validation: focused pending-turn/main SDK boundary coverage, docs listing,
  stale export scan, and diff checks.
- Compatibility: no migration required. Pending-turn IPC payloads, renderer
  replay/fan-out, stop cleanup, SDK current-turn cleanup, storage contracts,
  provider policy, and hosted backend behavior are unchanged.

### 2026-06-21 Agent Architecture Desktop App Source Map

- Finding: `docs/development/agent_architecture_reference.md` still described
  Electron main, renderer, preload, and local-runtime behavior as "WindieOS
  frontend" and said Electron main owned sidecar supervision, keeping a
  monolithic frontend owner label in a development source-map reference.
- Change: renamed the section to desktop app architecture, described those
  parts as live runtime surfaces, and changed Electron main wording to desktop
  host policy plus local-runtime supervision.
- Validation: focused modular docs boundary coverage, docs listing, exact
  retired phrase scan, and diff checks.
- Migration/security: no migration required. Runtime code, IPC channels, SDK
  command routing, renderer projections, local-runtime daemon behavior,
  storage, credentials, hosted backend URLs, and provider policy are unchanged.

### 2026-06-21 Desktop App Frontend Framing Wording

- Finding: `docs/architecture/frontend_architecture.md` and
  `docs/frontend/README.md` still opened with monolithic "WindieOS frontend"
  wording for Electron main, renderer, preload, and local-runtime
  implementation surfaces.
- Change: reworded the first-read summaries and opening copy to describe the
  WindieOS desktop app implementation across Electron main, React renderer,
  preload IPC, and local-runtime implementation boundaries.
- Validation: focused modular docs boundary coverage, docs listing, exact
  retired phrase scan, and diff checks.
- Migration/security: no migration required. Runtime code, IPC channels, SDK
  command routing, renderer projections, local-runtime behavior, storage,
  credentials, hosted backend URLs, and provider policy are unchanged.

### 2026-06-21 Frontend Browser Inventory Ownership Wording

- Finding: `docs/frontend/inventory/frontend_module_file_index_reference.md`
  still said WindieOS owned browser schema validation, local transport,
  Chrome/CDP launch policy, browser-local files, and result normalization,
  which collapsed hosted backend policy, SDK/main dispatch, local-runtime
  Python adapter, and Browser Use mechanics into a product-level owner.
- Change: reworded the browser ownership section to name hosted backend
  policy/schema exposure, SDK/main local-runtime dispatch, local-runtime Python
  browser adapter launch/files/result normalization, and Browser Use
  browser/session mechanics directly.
- Validation: focused modular docs boundary coverage, docs listing, exact
  retired phrase scan, and diff checks.
- Migration/security: no migration required. Browser schemas, local transport
  commands, Chrome/CDP launch behavior, browser file paths, result payloads,
  storage, credentials, hosted backend URLs, and provider policy are unchanged.

### 2026-06-21 Browser Runbook Connect Wording

- Finding: `docs/browser/browser_control_run.md` and
  `docs/browser/browser_troubleshooting.md` still described Browser Use
  connect/reuse, CDP port selection, Electron status setup, and result
  normalization through WindieOS product ownership wording.
- Change: reworded the source-run guide and troubleshooting summary through the
  desktop connect path, local-runtime browser adapter, hosted backend policy,
  and Electron readiness/status UI while preserving product env aliases as
  launch configuration.
- Validation: focused modular docs boundary coverage, docs listing, exact
  retired phrase scan, and diff checks.
- Migration/security: no migration required. Browser action schemas, Browser
  Use daemon/session behavior, CDP port env names, UI controls, storage,
  credentials, hosted backend URLs, and provider policy are unchanged.

### 2026-06-20 Renderer SDK Re-export Facade Removal

- Finding: `frontend/src/renderer/infrastructure/api/agentSdkClient.ts` had
  converged to a one-line re-export of `packages/windie-sdk-js`, leaving a
  redundant renderer infrastructure API shim after production callers moved to
  app-runtime SDK contract facades.
- Change: deleted the facade, routed
  `desktopConversationRuntimeContracts.ts` directly to the SDK package, updated
  tests that imported the shim, and refreshed active architecture/SDK/web docs
  to name the SDK package or renderer app-runtime contracts facade.
- Validation: focused renderer app/API/chat/transcript boundary tests, exact
  stale active-doc/source scans, docs listing, and diff checks.
- Compatibility: no migration required. SDK exports, IPC command strings,
  renderer feature imports, transcript storage behavior, hosted routes,
  credentials, permissions, provider policy, storage, and local-runtime
  execution are unchanged.

### 2026-06-20 SDK Provider Credential Map Boundary

- Finding: the TypeScript SDK and Python SDK client duplicated the backend
  provider credential id list inside their `update-settings` payload filters,
  which made provider policy a client transport concern.
- Change: changed SDK filtering to preserve syntactically safe provider
  credential keys while still stripping unsupported entry fields, changed
  backend incoming settings validation to ignore unsupported provider ids, and
  recorded the `provider_api_keys` ignore-extra boundary in the incoming
  websocket contract fixture.
- Validation: focused SDK/backend websocket contract coverage, Python SDK
  client settings coverage, and backend incoming/settings validation coverage.
- Compatibility: no migration required. Existing provider ids, credential
  entry fields, renderer settings persistence, IPC channels, hosted URLs,
  storage, permissions, provider runtime selection, and local-runtime execution
  are unchanged. Unsupported provider credential entries remain ignored by the
  backend instead of becoming session config.

### 2026-06-20 Main Backend Payload Contract Facade

- Finding: `frontend/src/main/ipc/ipc_backend_payload_contract.cjs` duplicated
  the SDK backend payload allowlist and still allowed raw query `screenshot`
  even though the backend and SDK websocket contracts require artifact-backed
  `screenshot_ref` and `screenshot_refs`.
- Change: collapsed the main module into a compatibility facade over
  `packages/windie-sdk-js/cjs/transport/backendPayloadContract.js`, keeping
  direct main-process payload filtering on the SDK-owned contract while leaving
  query-specific field shaping in `ipc_query_runtime.cjs`.
- Validation: focused backend websocket contract tests assert the main filter
  is the SDK function and that the main facade does not carry duplicate
  allowlist constants.
- Compatibility: no migration required. Backend payload keys, IPC channels,
  settings sync, query artifact refs, storage, credentials, permissions,
  hosted URLs, provider policy, and local-runtime execution are unchanged.

### 2026-06-20 Local Demo Seed Provider Metadata Cleanup

- Finding: `dev_seed_mock_memory.py` is development/demo local data, but its
  seeded conversation metadata still used real hosted-provider/model IDs even
  though provider selection and model policy are backend-owned runtime details.
- Change: changed the mock conversations to generic demo provider/model
  metadata, documented the seed-data boundary, and added local-runtime Python
  seed coverage so real provider IDs do not return to demo fixtures.
- Validation: focused local-runtime Python seed tests, exact provider/model
  seed scan, docs listing, and diff checks.
- Compatibility: no migration required. The script remains development/demo
  tooling only; SQLite schemas, cleanup semantics, inserted row shape, runtime
  provider policy, hosted URLs, credentials, permissions, IPC payloads, storage
  locations, and local execution behavior are unchanged.

### 2026-06-20 SDK Web Search Projection Provider Label Cleanup

- Finding: SDK conversation projections still labeled synthetic provider-native
  `web_search` rehydrate rows as `OpenAI native` even though provider selection
  and native-search mode policy are backend-owned details.
- Change: changed the synthetic query/output labels to provider-neutral native
  web-search wording in TypeScript and checked-in CJS projections, added SDK
  package-boundary coverage, and updated SDK/tool docs to route provider mode
  explanation to backend web-search docs.
- Validation: focused SDK conversation/runtime and package-boundary tests,
  exact stale SDK projection label scan, docs listing, and diff checks.
- Compatibility: no migration required. Stored event payloads, synthetic
  `web_search` tool-call ids, provider policy, backend capability selection,
  tool schemas, IPC payloads, credentials, permissions, hosted URLs, storage,
  and local execution behavior are unchanged.

### 2026-06-20 Renderer Dashboard Shell GPT Token Cleanup

- Finding: `DashboardShell.css` and `theme.css` still carried unreferenced
  `cg-gpt-*` selectors and the `--ui-gpt-dot-bg` token even though dashboard
  shell layout is now a generic renderer surface and provider/model
  presentation lives in dashboard panel surfaces plus renderer skin config.
- Change: removed the dead provider-specific CSS selectors and token, and
  extended renderer skin boundary coverage so the dashboard shell stylesheet
  stays free of `cg-gpt` / `ui-gpt` names.
- Validation: focused renderer skin boundary tests, exact stale CSS-token scan,
  docs listing, and diff checks.
- Compatibility: no migration required. Runtime behavior, rendered dashboard
  markup, provider/model config, storage, credentials, permissions, hosted
  backend URLs, provider policy, and local execution behavior are unchanged.

### 2026-06-20 SDK Managed Stop Alias Guard Cleanup

- Finding: `ManagedAgentSession.ts` reimplemented the same removed
  `conversation_ref` / `turn_ref` stop-query rejection that `AgentSession.ts`
  already owned, leaving two SDK transport authorities for one input contract.
- Change: exported the `AgentSession` stop-alias guard from its transport owner
  module, reused it from managed sessions, and kept the checked-in CJS output
  aligned.
- Validation: focused backend SDK websocket contract tests, docs listing, stale
  inline managed-session alias-guard scan, and diff checks.
- Compatibility: no migration required. Public stop-query errors, backend
  `stop-query` payloads, SDK exports from the package root, websocket payloads,
  storage, credentials, permissions, hosted backend URLs, provider policy, and
  local execution behavior are unchanged.

### 2026-06-20 Main Direct SDK Conversation Alias Cleanup

- Finding: `ipc_direct_wake_up_agent_adapter.cjs` still accepted
  `conversation_ref` for SDK library methods such as conversation
  load/delete/replay/edit/retry even though the `windie:invoke` SDK-command
  boundary already requires `conversationRef` and rejects the removed alias.
- Change: added a direct-adapter SDK conversation-ref resolver that rejects
  `conversation_ref` for SDK library methods, kept backend-transport
  send/stop/rehydrate/compact on canonical snake_case payload fields, and
  updated focused adapter coverage.
- Validation: focused direct adapter tests, docs listing, stale alias scan, and
  diff checks.
- Compatibility: no migration required. Renderer command payloads, backend
  transport send/stop/rehydrate/compact shapes, SDK command names, storage,
  credentials, permissions, hosted backend URLs, provider policy, and local
  execution behavior are unchanged.

### 2026-06-20 Renderer Attachment Metadata Shape Cleanup

- Finding: `desktopChatSendPreparationRuntime.ts` still wrote attachment
  filenames into user-message metadata twice, as both camelCase
  `attachmentFilenames` and backend-wire `attachment_filenames`, even though
  the UI already carries `attachmentFilenames` as top-level renderer state and
  the SDK/runtime boundary uses `attachment_filenames`.
- Change: removed the duplicate camelCase metadata copy from prepared chat
  turns, kept the top-level renderer attachment filenames and canonical
  metadata field, and added boundary coverage so the duplicate metadata object
  does not return.
- Validation: focused chat sender and renderer chat-runtime boundary tests,
  exact duplicate-shape scan, docs listing, and diff checks.
- Compatibility: no migration required. Visible chat attachment state, SDK
  command names, `attachment_filenames` metadata, resources, IPC payload shape,
  storage, credentials, permissions, hosted backend URLs, provider policy, and
  trust boundaries are unchanged.

### 2026-06-20 Validation Local-Runtime Python Test Labels

- Finding: CLI command docs, workflow matrices, release/security docs,
  dashboard guidance, and tool workflows still used sidecar test/pytest labels
  for validation whose reusable owner is local-runtime Python.
- Change: routed those validation labels through local-runtime Python wording
  while preserving concrete `<windie> test sidecar`, `python-in-env sidecar`,
  `tests/sidecar`, and `sidecar-runtime` command/path details.
- Validation: focused modular docs boundary test, exact stale validation-label
  scan, docs listing, and diff checks.
- Compatibility: no migration required. Runtime code, CLI command names, test
  paths, packaged runtime build target, IPC payloads, storage, credentials,
  permissions, hosted backend URLs, provider policy, and trust boundaries are
  unchanged.

### 2026-06-20 Platform Local-Runtime Python Validation Labels

- Finding: platform validation, window/input, and computer-tool reference docs
  still used sidecar platform-test, shell-probe, switching-logic,
  computer-tool, input-control, and log-line labels even though the reusable
  owner is local-runtime Python platform/input execution.
- Change: routed those labels through local-runtime Python wording while
  preserving concrete `frontend/src/main/python/tools/computer`,
  `tests/sidecar`, `python-in-env sidecar`, `<windie> test sidecar`, and
  `<windie> build sidecar-runtime` command details.
- Validation: focused modular docs boundary test, exact stale platform-label
  scan, docs listing, and diff checks.
- Compatibility: no migration required. Runtime code, OS window/input
  behavior, Python test paths, command names, packaged runtime build target,
  IPC payloads, storage, credentials, permissions, hosted backend URLs,
  provider policy, and trust boundaries are unchanged.

### 2026-06-20 Memory Replay Conversation Store Labels

- Finding: transcript replay, renderer transcript, and conversation identity
  docs still used sidecar chat-event handler, sidecar transcript tests,
  sidecar conversation list/search/title tests, and sidecar write/read RPC
  labels even though the reusable owner is SDK/local-runtime conversation
  storage with local-runtime Python as the current implementation.
- Change: routed those labels through local-runtime Python conversation-store,
  transcript, handler, and RPC wording while preserving concrete
  `conversation.append_event`, `tests/sidecar`, and `python-in-env sidecar`
  command details.
- Validation: focused modular docs boundary test, exact stale conversation
  store-label scan, docs listing, and diff checks.
- Compatibility: no migration required. Runtime code, JSON-RPC method names,
  database schema, conversation row shape, search SQL behavior, dashboard
  replay, backend rehydrate payloads, IPC payloads, storage files, credentials,
  permissions, hosted backend URLs, provider policy, and trust boundaries are
  unchanged.

### 2026-06-20 Architecture Local-Runtime Route Labels

- Finding: active architecture and reference docs still used sidecar routing,
  sidecar endpoint/default, Sidecar storage RPC, and sidecar ToolResult labels
  for routes whose reusable owner is local-runtime/local-runtime Python.
- Change: routed those labels through local-runtime/local-runtime Python
  wording while preserving JSON-RPC method names, endpoint env vars,
  `frontend/src/main/python/tools/result.py`, and concrete implementation docs.
- Validation: focused modular docs boundary test, exact stale architecture
  route-label scan, docs listing, and diff checks.
- Compatibility: no migration required. Runtime code, JSON-RPC method names,
  endpoint env vars, storage behavior, ToolResult payloads, IPC payloads,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

### 2026-06-20 Renderer Response Overlay Trace Payload Boundary

- Finding: `MinimalResponseOverlay.jsx` still assembled response-surface
  diagnostics with snake_case fields such as `turn_id`, `is_visible`,
  `show_awaiting_reply`, `response_layout_mode`, `is_sending`, and
  `message_count` even though `desktopRendererTraceRuntime.ts` owns renderer
  diagnostic field shaping.
- Change: added response-overlay state and render trace payload normalization
  to `desktopRendererTraceRuntime.ts`. The minimal response overlay now passes
  value-level phase, visibility, response layout, entry counts, text length,
  send state, and message-count inputs to trace-runtime helpers.
- Validation: focused renderer app-runtime boundary coverage and stale
  feature-code trace-field scan.
- Compatibility: no migration required. Diagnostic log labels, trace gating,
  response-surface console logging, workspace snapshot enrichment, renderer
  state behavior, IPC payloads, storage, credentials, permissions, hosted URLs,
  provider policy, and local execution behavior are unchanged.

### 2026-06-20 Frontend Local-Runtime Route Labels

- Finding: active IPC troubleshooting, frontend inventory, source-map query,
  change-path validation, and backend endpoint config docs still used Sidecar
  or sidecar labels for public route names even though the owner boundary is
  local runtime/local-runtime Python.
- Change: routed those labels through local-runtime/local-runtime Python
  wording while preserving concrete `frontend/src/main/python/...` paths,
  `AGENT_BACKEND_HTTP_URL`, `WINDIE_BACKEND_HTTP_URL`, and the Python JSON-RPC
  handler implementation detail.
- Validation: focused modular docs boundary test, exact stale route-label scan,
  docs listing, and diff checks.
- Compatibility: no migration required. Runtime code, endpoint env vars,
  Python file paths, JSON-RPC payloads, IPC payloads, storage, credentials,
  permissions, hosted backend URLs, provider policy, and trust boundaries are
  unchanged.

### 2026-06-20 Renderer Chat-Pill State Trace Payload Boundary

- Finding: `MinimalChatPill.jsx` still assembled chat-pill state diagnostics
  with backend-style snake_case fields such as `conversation_ref`,
  `current_turn_phase`, `live_turn_phase`, and `message_count` even though
  `desktopRendererTraceRuntime.ts` owns renderer diagnostic field shaping.
- Change: added chat-pill state trace payload normalization to
  `desktopRendererTraceRuntime.ts`. The minimal chat pill now passes
  value-level conversation, turn, phase, send/busy, stop-availability, and
  message-count inputs to `logRendererChatPillStateTrace(...)`.
- Validation: focused renderer app-runtime boundary coverage and stale
  feature-code trace-field scan.
- Compatibility: no migration required. Diagnostic log labels, trace gating,
  workspace snapshot enrichment, renderer state behavior, IPC payloads,
  storage, credentials, permissions, hosted URLs, provider policy, and local
  execution behavior are unchanged.

### 2026-06-20 First-Read Local-Runtime Python Navigation Labels

- Finding: top-level docs, frontend docs navigation, architecture
  implementation docs, and local-runtime memory docs still exposed Python
  Sidecar/Sidecar labels as public navigation titles even though the intended
  reusable boundary is local-runtime Python.
- Change: routed those headings, links, and evidence notes through
  local-runtime Python wording while preserving concrete `sidecar/` doc paths,
  `sidecar_daemon.py`, and packaged runtime behavior.
- Validation: focused modular docs boundary test, exact stale navigation-label
  scan, docs listing, and diff checks.
- Compatibility: no migration required. Runtime code, doc paths, daemon
  filenames, bundled runtime behavior, SDK local-runtime behavior, JSON-RPC
  payloads, IPC payloads, storage, credentials, permissions, hosted backend
  URLs, provider policy, and trust boundaries are unchanged.

### 2026-06-20 Active Local-Runtime Python Owner Labels

- Finding: active API, backend, frontend, operations, security, extension, and
  local-runtime docs still used Python sidecar labels for implementation owner
  descriptions, local enrichment, query settings validation, remote clients,
  screenshot transport, memory storage, and direct-call guidance.
- Change: routed those owner labels through local-runtime Python wording while
  preserving concrete `sidecar` directory names, doc filenames, test paths,
  and Mermaid participant aliases where the visible label is already
  local-runtime Python.
- Validation: focused modular docs boundary test, active stale-label scan,
  docs listing, and diff checks.
- Compatibility: no migration required. Runtime code, doc paths, test paths,
  tool schemas, auth behavior, environment variables, JSON-RPC payloads, IPC
  payloads, storage, credentials, permissions, hosted backend URLs, provider
  policy, and trust boundaries are unchanged.

### 2026-06-20 Tool Pipeline Local-Runtime Python Labels

- Finding: web-search, tool-schema policy, filesystem/shell flow, credential,
  landing workflow, and agent-visible pipeline docs still used Python sidecar
  or sidecar labels for local-runtime executable absence, helper visibility,
  execute-tool JSON-RPC, remote-client auth, local runtime state, and
  cross-runtime boundary examples.
- Change: routed those labels through local-runtime Python/local-runtime
  wording while preserving concrete Python file paths, sidecar test paths, and
  backend-owned web-search behavior.
- Validation: focused modular docs boundary test, exact stale tool/pipeline
  label scan, docs listing, and diff checks.
- Compatibility: no migration required. Runtime code, tool schemas, web-search
  behavior, auth headers, environment variables, JSON-RPC payloads, IPC
  payloads, storage, credentials, permissions, hosted backend URLs, provider
  policy, and trust boundaries are unchanged.

### 2026-06-20 Source-Map Local-Runtime Python Implementation Labels

- Finding: renderer, local-runtime Python, and development source-map docs
  still described implementation ownership as Python sidecar/sidecar labels in
  folder titles, overview copy, local execution flow, memory RPC notes, and
  repository maps.
- Change: routed those labels through local-runtime Python implementation
  wording while preserving concrete `sidecar_daemon.py`, `frontend/src/main/python`,
  and `tests/sidecar` paths where they remain real source or test names.
- Validation: focused modular docs boundary test, exact stale source-map label
  scan, docs listing, and diff checks.
- Compatibility: no migration required. Runtime code, source paths, test paths,
  daemon filenames, JSON-RPC payloads, IPC payloads, storage, credentials,
  permissions, hosted backend URLs, provider policy, and trust boundaries are
  unchanged.

### 2026-06-20 Platform Setup Local-Runtime Python Environment Labels

- Finding: the backend/frontend platform setup guide still described the
  first-read Python setup path with mixed local-runtime/sidecar Python
  environment and dependency/interpreter labels even though the reusable setup
  owner is local-runtime Python.
- Change: routed the setup guide through local-runtime Python
  environment/dependency/interpreter wording while preserving the existing
  `.venv-sidecar311` compatibility path, requirements file, and
  `WINDIE_PYTHON_PATH` behavior.
- Validation: focused modular docs boundary test, docs listing, exact stale
  platform setup label scan, and diff checks.
- Compatibility: no migration required. Runtime code, venv paths, dependency
  files, Electron launch behavior, environment variables, tool execution, IPC
  payloads, storage, credentials, permissions, hosted backend URLs, provider
  policy, and trust boundaries are unchanged.

### 2026-06-20 Public Route Local-Runtime Python Labels

- Finding: README, web surface, tool-schema, source-map, transcript reference,
  and install troubleshooting docs still used sidecar/Python sidecar route
  labels for local-runtime Python dependencies, resolution, hosted API
  independence, payload rejection, source ownership, transcript RPC diagrams,
  and troubleshooting command groups.
- Change: routed those labels through local-runtime Python wording while
  preserving concrete `sidecar` CLI commands, environment variable names,
  daemon filenames, and executable implementation paths.
- Validation: focused modular docs boundary test, docs listing, exact stale
  public-route label scan, and diff checks.
- Compatibility: no migration required. Runtime code, command names, CLI
  aliases, environment variables, daemon filenames, JSON-RPC payloads, IPC
  payloads, storage, credentials, permissions, hosted backend URLs, provider
  policy, and trust boundaries are unchanged.

### 2026-06-20 First-Read Local-Runtime Python Setup Labels

- Finding: concepts, quick-start, installation, and troubleshooting docs still
  described the public runtime split, dependency install, Electron launch
  target, and tool-execution checks as Python sidecar concepts instead of
  local-runtime Python setup/status/log evidence.
- Change: routed those labels through local-runtime Python wording while
  preserving concrete frontend Python dependency installation, Electron launch,
  and local tool troubleshooting behavior.
- Validation: focused modular docs boundary test, docs listing, exact stale
  first-read setup label scan, and diff checks.
- Compatibility: no migration required. Runtime code, dependency files,
  Electron launch behavior, tool execution, log sinks, IPC payloads, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

### 2026-06-20 Local-Runtime Execution Labels

- Finding: architecture and platform workflow docs still said the sidecar
  executes local drag/tool actions where the reusable execution owner is the
  local runtime and the concrete implementation is local-runtime Python.
- Change: routed drag execution through local-runtime Python wording and
  platform tool execution through local runtime wording while preserving
  backend coordinate normalization, Electron/renderer permission surfacing, and
  OS-authority details.
- Validation: focused modular docs boundary test, docs listing, exact stale
  execution label scan, and diff checks.
- Compatibility: no migration required. Runtime code, coordinate normalization,
  permission behavior, tool execution, IPC payloads, storage, credentials,
  hosted backend URLs, provider policy, and trust boundaries are unchanged.

### 2026-06-20 Local-Runtime Python Service Hub Labels

- Finding: local-runtime service hubs still used sidecar service startup,
  service-script, and sidecar-daemon hub wording where the reusable boundary is
  local-runtime Python service/daemon ownership.
- Change: routed those hub/read_when labels through local-runtime Python
  service and daemon wording while preserving concrete wakeword service paths
  and Electron main bridge framing details.
- Validation: focused modular docs boundary test, docs listing, exact stale
  service label scan, and diff checks.
- Compatibility: no migration required. Runtime code, service framing,
  wakeword subprocess behavior, daemon launch behavior, IPC payloads, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

### 2026-06-20 IPC Local-Runtime Authority Label

- Finding: the IPC change workflow still routed security concerns through
  sidecar authority even though the reusable security boundary is
  local-runtime authority behind Electron IPC/preload checks.
- Change: routed the security triage row through local-runtime authority
  wording and extended the modular docs guard against the retired phrase.
- Validation: focused modular docs boundary test, docs listing, exact stale
  authority label scan, and diff checks.
- Compatibility: no migration required. Runtime code, permission behavior, IPC
  payloads, preload allowlists, local-runtime execution, storage, credentials,
  hosted backend URLs, provider policy, and trust boundaries are unchanged.

### 2026-06-20 Local-Runtime Transcript Storage Labels

- Finding: transcript replay, memory identity, dashboard, docs hub, and docs
  structure routes still used sidecar storage/handler/search/DB labels for
  durable conversation rows where the reusable owner is local-runtime
  transcript/memory storage and local-runtime Python is the current SQLite
  implementation.
- Change: routed those labels through local-runtime transcript storage,
  local-runtime memory storage, and local-runtime Python handler/search wording
  while preserving concrete `conversation.append_event`, `LocalMemoryStore`,
  SQLite, dashboard replay, and backend rehydrate details.
- Validation: focused modular docs boundary test, docs listing, exact stale
  storage label scan, and diff checks.
- Compatibility: no migration required. Runtime code, database schema,
  conversation row shape, search SQL behavior, dashboard replay, backend
  rehydrate payloads, IPC payloads, storage files, credentials, permissions,
  hosted backend URLs, provider policy, and trust boundaries are unchanged.

### 2026-06-20 Frontend Architecture Local-Runtime Method Label

- Finding: the frontend architecture doc still used "Sidecar method names" for
  below-SDK implementation details where the active boundary is local-runtime
  JSON-RPC.
- Change: routed the sentence through local-runtime JSON-RPC method wording
  while preserving the SDK-boundary and local store implementation-detail
  guidance.
- Validation: focused modular docs boundary test, docs listing, exact stale
  method label scans, and diff checks.
- Compatibility: no migration required. Runtime code, JSON-RPC method names,
  IPC payloads, storage, credentials, permissions, hosted backend URLs,
  provider policy, and trust boundaries are unchanged.

### 2026-06-20 Local-Runtime Python Handler Response Labels

- Finding: system-state, IPC, local-runtime JSON-RPC, and local-runtime bridge
  docs plus configuration/docs-hub routes still used sidecar/Python sidecar
  handler and env labels for handler params, protocol tests, success/error
  envelopes, system-state fallback behavior, and packaged/source validation
  where the reusable boundary is local-runtime JSON-RPC and local-runtime env
  backed by local-runtime Python handlers.
- Change: routed those labels through local-runtime Python handler, response,
  platform-probe, and local-runtime env wording while preserving concrete
  `get_system_state`, `LocalRuntimeService._handle_get_system_state(...)`,
  local bridge, endpoint, signing, and bundled-runtime details.
- Validation: focused modular docs boundary test, docs listing, exact stale
  handler/response/env label scan, and diff checks.
- Compatibility: no migration required. Runtime code, JSON-RPC method names,
  handler signatures, response envelopes, system-state fallback values,
  config propagation, IPC payloads, storage, credentials, permissions, hosted
  backend URLs, provider policy, and trust boundaries are unchanged.

### 2026-06-20 Local-Runtime Python Diagnostic Process Labels

- Finding: docs hub, architecture, diagnostic flags, observability, process
  health, and release-packaging docs still used Python sidecar stdout, stderr,
  spawn-readiness, hosted-helper-client, and platform dependency wording where
  the reusable owner is the local-runtime Python implementation.
- Change: routed those labels through local-runtime Python stdout/stderr,
  spawn-readiness, hosted-helper-client, and platform dependency wording while
  preserving concrete `sidecar_daemon.py`, `resources/python-runtime`,
  env-flag, and packaged-runtime details.
- Validation: focused modular docs boundary test, docs listing, exact stale
  diagnostic/process label scans, and diff checks.
- Compatibility: no migration required. Runtime code, executable behavior,
  JSON-RPC/daemon payloads, IPC payloads, storage, credentials, permissions,
  hosted backend URLs, provider policy, and trust boundaries are unchanged.

### 2026-06-20 Runtime Node Local-Runtime Python Labels

- Finding: runtime-node, transcript replay, desktop, concept, docs-hub,
  workflow, architecture link-label, tool-development, platform, debug,
  tool-catalog, agent-architecture, and mobile-planning docs still used Python
  sidecar node/subprocess/test/storage labels where the reusable owner is the
  local runtime and the concrete implementation is local-runtime Python.
- Change: routed node tables, transcript storage validation labels, desktop
  local-execution copy, runtime model copy, docs-hub links, sidecar workflow
  ownership copy, architecture link labels, debug trace copy, tool-catalog
  registry copy, agent-architecture guidance, and mobile planning constraints
  through local-runtime Python implementation wording while preserving concrete
  `frontend/src/main/python`, `tests/sidecar`, and Python subprocess details.
- Validation: focused modular docs boundary test, docs listing, exact stale
  runtime-node label scan, and diff checks.
- Compatibility: no migration required. Runtime code, transcript storage,
  local-runtime process behavior, tool execution, JSON-RPC/daemon payloads, IPC
  payloads, storage files, credentials, permissions, hosted backend URLs,
  provider policy, and trust boundaries are unchanged.

### 2026-06-20 Browser and Platform Local-Runtime Python Labels

- Finding: browser workflow/hub, local-runtime browser automation stack,
  storage persistence, source-map export, runtime ownership, and platform
  workflow docs still used Python sidecar browser/action/launcher/handler,
  sidecar-tool export, and platform-tool labels where the reusable owner is
  local-runtime Python implementation behind SDK/main dispatch.
- Change: routed those labels through local-runtime Python Browser Use adapter,
  browser action, browser file-store, handler, launcher, tool export, tool
  implementation, and computer-platform wording while preserving concrete
  Browser Use, `local_backend.py`, `frontend/src/main/python`, and
  `tests/sidecar` references.
- Validation: focused modular docs boundary test, docs listing, exact stale
  browser/platform label scan, and diff checks.
- Compatibility: no migration required. Runtime code, browser behavior,
  Browser Use invocation, file-store behavior, platform adapters, tool schemas,
  JSON-RPC/daemon payloads, IPC payloads, storage, credentials, permissions,
  hosted backend URLs, provider policy, and trust boundaries are unchanged.

### 2026-06-20 Local-Runtime Python Internals Labels

- Finding: architecture, browser, voice/wakeword, debug, getting-started,
  memory, plugin, tool, filesystem/shell, permission, IPC, and lifecycle docs
  still used Python sidecar or sidecar-browser labels for implementation
  backing, local tool internals, validation, host bridge, daemon, and shell
  behavior.
- Change: routed those labels through local-runtime Python implementation,
  storage, service, protocol, validation, browser-tool, scoped-host-bridge,
  daemon, and shell behavior wording while preserving concrete
  `sidecar_daemon.py`, `tests/sidecar`, and `frontend/src/main/python`
  implementation paths.
- Validation: focused modular docs boundary test, docs listing, exact stale
  internals-label scan, and diff checks.
- Compatibility: no migration required. Runtime code, executable behavior,
  tool schemas, JSON-RPC/daemon payloads, IPC payloads, storage, credentials,
  permissions, hosted backend URLs, provider policy, and trust boundaries are
  unchanged.

### 2026-06-20 Local-Runtime Python Tool Registration Labels

- Finding: ADR alternatives, browser parity validation, platform validation,
  overlay/surface workflows, local-runtime memory/tooling notes, and
  local-runtime tool sub-hub read_when labels still used sidecar tool/tooling
  owner labels where the active owner is local-runtime Python tools.
- Change: routed those labels through local-runtime Python tool wording while
  preserving concrete `tests/sidecar` validation paths, browser implementation
  filenames, and current local-runtime Python behavior.
- Validation: focused modular docs boundary test, docs listing, exact active
  sidecar-tool stale-label scan, and diff checks.
- Compatibility: no migration required. Runtime code, executable behavior,
  tool schemas, JSON-RPC/daemon payloads, IPC payloads, storage, credentials,
  permissions, hosted backend URLs, provider policy, and trust boundaries are
  unchanged.

### 2026-06-20 Local-Runtime Python Daemon Labels

- Finding: architecture, local-runtime daemon, local-runtime memory, and error
  routing docs still used local Python sidecar, Python sidecar daemon, or
  sidecar process helper labels for daemon/process ownership.
- Change: routed those labels through local-runtime Python daemon/process
  wording while preserving concrete `sidecar_daemon.py`, discovery-file, and
  frontend sidecar path names.
- Validation: focused modular docs boundary test, docs listing, exact active
  daemon/process stale-label scan, and diff check.
- Compatibility: no migration required. Runtime code, executable behavior,
  daemon discovery payloads, JSON-RPC/WebSocket payloads, IPC payloads, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

### 2026-06-20 Local-Runtime Python Process Labels

- Finding: runtime configuration, packaged desktop, endpoint setup, and
  installation docs still used Python sidecar process or local Python sidecar
  wording in public install/config paths.
- Change: routed those labels through local-runtime Python process wording
  while preserving concrete bundled runtime paths, `WINDIE_PYTHON_PATH`, and
  `WINDIE_BACKEND_HTTP_URL` names.
- Validation: docs listing, exact public install/config process-label scan, and
  diff check.
- Compatibility: no migration required. Runtime code, packaging commands,
  executable behavior, environment variable names, JSON-RPC/daemon payloads,
  IPC payloads, storage, credentials, permissions, hosted backend URLs,
  provider policy, and trust boundaries are unchanged.

### 2026-06-20 Local-Runtime Python Tool Labels

- Finding: debug, browser, sidecar-tool, and backend bridge docs still used
  Python sidecar tool labels for local error-code, entrypoint, result-model, and
  executable-tool wording.
- Change: routed those labels through local-runtime Python tool/result wording
  while preserving concrete `frontend/src/main/python` paths and current
  `tests/sidecar` validation routes.
- Validation: focused modular docs boundary test, docs listing, exact active
  Python-sidecar-tool stale-label scan, and diff check.
- Compatibility: no migration required. Runtime code, executable behavior,
  tool schemas, JSON-RPC/daemon payloads, IPC payloads, storage, credentials,
  permissions, hosted backend URLs, provider policy, and trust boundaries are
  unchanged.

### 2026-06-20 Browser Adapter And Import-Rule Labels

- Finding: browser hub, workflow, ADR, backend bridge, routing, and
  local-runtime browser docs still described Browser Use adapter ownership as
  Python sidecar adapter wording, and cross-runtime parity docs still used
  Python sidecar code or sidecar import wording for backend-import rules.
- Change: routed those labels through local-runtime Python adapter/code wording
  and updated the focused modular docs boundary expectations.
- Validation: focused modular docs boundary test, docs listing, exact active
  browser-adapter/import-rule stale-label scans, and diff check.
- Compatibility: no migration required. Browser runtime code, action schemas,
  Browser Use invocation, local file behavior, JSON-RPC/daemon payloads, IPC
  payloads, permissions, storage, credentials, hosted backend URLs, provider
  policy, and trust boundaries are unchanged.

### 2026-06-20 Local-Runtime Python Implementation Labels

- Finding: Python sidecar architecture, memory, workflow, and tool-catalog docs
  still used Python sidecar implementation labels where the current boundary is
  the local-runtime Python implementation behind the SDK local runtime.
- Change: routed those labels through local-runtime Python implementation
  wording and added a focused docs boundary guard against reintroducing the
  stale phrase in the active first-read docs set.
- Validation: focused modular docs boundary test, docs listing, exact stale
  Python-sidecar-implementation label scan, and diff check.
- Compatibility: no migration required. Runtime code, executable behavior,
  tool schemas, JSON-RPC/daemon payloads, IPC payloads, storage, credentials,
  permissions, hosted backend URLs, provider policy, and trust boundaries are
  unchanged.

### 2026-06-20 Local-Runtime Python Validation Labels

- Finding: channel, data-pipeline, development, JSON-RPC, settings,
  main-process, sidecar-tool, node, configuration, and tool-lifecycle docs still
  used Python sidecar test or sidecar implementation wording for validation and
  owner labels.
- Change: routed those labels through local-runtime Python tests and
  local-runtime Python implementation wording while preserving concrete
  `<windie> test sidecar`, `tests/sidecar`, and Python implementation paths.
- Validation: focused modular docs boundary test, docs listing, exact stale
  Python-sidecar-test label scan, and diff check.
- Compatibility: no migration required. Runtime code, test commands,
  executable tool behavior, JSON-RPC/daemon payloads, IPC payloads, tool
  schemas, storage, credentials, permissions, hosted backend URLs, provider
  policy, and trust boundaries are unchanged.

### 2026-06-20 Local-Runtime Python Module Backing Labels

- Finding: architecture, tool, MCP, storage, memory, artifact, JSON-RPC,
  reference, and developer docs still described current local-runtime storage,
  registries, transcript stores, and executable paths as backed by Python
  sidecar modules, and some schema docs still used generic client-local labels.
- Change: routed implementation-backing labels through local-runtime Python
  modules and clarified desktop client/local-runtime schema wording while
  preserving concrete `frontend/src/main/python` paths and `tests/sidecar`
  command names.
- Validation: focused modular docs boundary test, docs listing, exact stale
  module-backing label scan, and diff check.
- Compatibility: no migration required. Runtime code, tool schemas,
  client-manifest payloads, local storage files, JSON-RPC/daemon payloads, IPC
  payloads, credentials, permissions, hosted backend URLs, provider policy, and
  trust boundaries are unchanged.

### 2026-06-20 Boundary Hub Local-Runtime Python Labels

- Finding: getting-started, security, onboarding, IPC, observability,
  backend-tool, frontend inventory, system-state, architecture, and node hub
  docs still used Python sidecar implementation labels for local-runtime
  boundary routing, contracts, diagnostics, and add-tool checklist text.
- Change: routed those labels through local-runtime Python implementation
  wording while preserving concrete `frontend/src/main/python` paths,
  Python JSON-RPC protocol names, and `tests/sidecar` command names.
- Validation: focused modular docs boundary test, docs listing, exact stale
  boundary-hub label scan, and diff check.
- Compatibility: no migration required. Runtime code, tool schemas, local
  runtime process behavior, JSON-RPC/daemon payloads, IPC payloads, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

### 2026-06-20 Import-Boundary Local-Runtime Python Labels

- Finding: channel, security, runtime-model, tool-schema, and runtime-node docs
  still used Python sidecar implementation wording for import-boundary rules,
  schema-parity guidance, local action execution, and node ownership labels.
- Change: routed those labels through local-runtime Python implementation
  wording while preserving literal Python sidecar subprocess references where
  docs identify the current process implementation.
- Validation: focused modular docs boundary test, docs listing, exact stale
  import-boundary/node-owner label scan, and diff check.
- Compatibility: no migration required. Runtime code, schema contracts,
  local-runtime process names, JSON-RPC/daemon payloads, IPC payloads, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

### 2026-06-20 Source-Map Reference Local-Runtime Python Polish

- Finding: source-map navigation, the source-map deep page, configuration
  rules, and the code-change surface index still had residual Python sidecar
  implementation labels for folder topology, endpoint policy, ownership, and
  validation routing.
- Change: routed those labels through local-runtime Python implementation
  wording while preserving concrete `frontend/src/main/python` paths and
  sidecar daemon/test command names where they describe current implementation
  files.
- Validation: focused modular docs boundary test, docs listing, exact stale
  source-map/reference label scan, and diff check.
- Compatibility: no migration required. Runtime code, config variables,
  endpoint propagation, local tool execution, JSON-RPC/daemon payloads, IPC
  payloads, storage, credentials, permissions, hosted backend URLs, provider
  policy, and trust boundaries are unchanged.

### 2026-06-20 Bundled Local-Runtime Python Packaging And Source Labels

- Finding: bundled Python packaging, source-map, configuration, and code-change
  reference docs still used Sidecar runtime/process or Python sidecar labels
  for packaged process startup, bytecode-only sources, package topology,
  validation, debug rows, and local-tool exercise checks.
- Change: routed those labels through local-runtime Python process/bundle
  and package wording while preserving existing `sidecar-runtime` command names
  and build script paths.
- Validation: focused modular docs boundary test, docs listing, exact stale
  packaging/source-label scan, and diff check.
- Compatibility: no migration required. Package command names, build script
  paths, bundled runtime paths, Electron Builder config, packaged startup,
  package import surfaces, feature-pack behavior, browser extraction behavior,
  JSON-RPC/daemon payloads, IPC payloads, storage, credentials, permissions,
  hosted backend URLs, provider policy, and trust boundaries are unchanged.

### 2026-06-20 Browser Local-Runtime Adapter Labels

- Finding: browser control and dedicated-browser runtime docs still used
  Sidecar section, diagram, and actor labels for Browser Use invocation and
  browser runtime state.
- Change: routed those labels through SDK/main local-runtime dispatch and the
  local-runtime Python browser adapter, and replaced a box-drawing architecture
  diagram with an ASCII ownership flow.
- Validation: focused modular docs boundary test, docs listing, exact stale
  browser-label scan, and diff check.
- Compatibility: no migration required. Browser action names, Browser Use
  daemon behavior, CDP host/port policy, dedicated profile paths, feature-pack
  installation, JSON-RPC/daemon payloads, IPC payloads, storage, credentials,
  permissions, hosted backend URLs, provider policy, and trust boundaries are
  unchanged.

### 2026-06-20 Plugin Inventory Local-Runtime Labels

- Finding: plugin, extension, validation, browser, frontend inventory, and
  tool-system docs still described built-in local tool changes, validation
  sections, browser adapters, or tool execution clients through Python sidecar
  implementation or sidecar SDK local-runtime labels.
- Change: routed those labels through SDK local-runtime client,
  local-runtime Python implementation, and backend-only tools not going through
  the local runtime while preserving concrete `frontend/src/main/python` paths.
- Validation: focused modular docs boundary test, docs listing, exact stale
  plugin/browser/inventory label scan, and diff check.
- Compatibility: no migration required. Runtime code, plugin loading, local
  tool execution, JSON-RPC/daemon payloads, IPC payloads, tool-result
  envelopes, storage, credentials, permissions, hosted backend URLs, provider
  policy, and trust boundaries are unchanged.

### 2026-06-20 Debug Runbook Local-Runtime Python Labels

- Finding: debug traces, failure routing, incident/evidence runbooks, security
  hub, filesystem/shell, MCP, tool-development, computer-tool, platform, and
  tool-schema workflow docs still routed local execution or tool implementation
  labels through Python sidecar implementation/backing wording.
- Change: routed those labels through local-runtime Python implementation
  wording while preserving concrete Python implementation paths and tests.
- Validation: focused modular docs boundary test, docs listing, exact stale
  debug/runbook/development/tool-workflow label scan, and diff check.
- Compatibility: no migration required. Runtime code, local tool execution,
  JSON-RPC/daemon payloads, IPC payloads, tool-result envelopes, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

### 2026-06-20 Tool Data-Flow Local-Runtime Python Labels

- Finding: public architecture data-flow, communication, backend overview,
  reference, mobile-planning, computer-tool, platform, tool-lifecycle,
  tool-registry, local-memory, inventory, docs-hub, and local-runtime Python
  sub-hub docs still described local action ownership/backing through Python
  sidecar implementation/backing labels.
- Change: routed those labels through local-runtime Python implementation and
  local-runtime Python tool/executor wording while preserving concrete
  `frontend/src/main/python` paths.
- Validation: focused modular docs boundary test, docs listing, exact
  stale tool data-flow label scan, and diff check.
- Compatibility: no migration required. Runtime code, local tool execution,
  JSON-RPC/daemon payloads, IPC payloads, tool-result envelopes, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

### 2026-06-20 First-Read Local-Runtime Execution Flow Labels

- Finding: the README SDK runtime diagram, install topology copy, docs hub
  summaries, browser route labels, routing quick cards, system architecture
  flow steps, tool execution lifecycle, and compact docs directory still used
  Python sidecar execution/backing wording where the reusable route owner is
  the local runtime.
- Change: routed those flow labels through local-runtime Python
  implementation/executor wording while preserving Python implementation
  details where the concrete process matters.
- Validation: focused modular docs boundary test, docs listing, exact stale
  first-read execution-label scan, and diff check.
- Compatibility: no migration required. Runtime code, local tool execution,
  JSON-RPC/daemon payloads, IPC payloads, tool-result envelopes, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

### 2026-06-20 Channel Local-Runtime Executor Labels

- Finding: channel maps, local-tool failure routing, gateway troubleshooting,
  and browser-tool runtime split docs still described reusable local execution
  routes through Python sidecar executor/daemon labels.
- Change: routed those references through SDK/main local-runtime routing and
  local-runtime Python executor/daemon wording while preserving concrete
  `sidecar_daemon.py` and Python tool paths where implementation files are the
  subject.
- Validation: focused modular docs boundary test, docs listing, exact stale
  channel executor-label scan, and diff check.
- Compatibility: no migration required. Runtime code, tool execution,
  JSON-RPC/daemon payloads, IPC payloads, browser action behavior, tool-result
  envelopes, storage, credentials, permissions, hosted backend URLs, provider
  policy, and trust boundaries are unchanged.

### 2026-06-20 First-Read Local-Runtime Authority Labels

- Finding: first-read, tool hub, operations security, and development
  architecture docs still used Python sidecar or sidecar test labels for
  public tool execution, troubleshooting, and local storage/execution
  ownership.
- Change: routed those references through local-runtime authority,
  local-runtime execution, local-runtime Python implementation, and
  local-runtime Python test wording while preserving concrete Python
  implementation paths.
- Validation: focused modular docs boundary test, docs listing, exact stale
  first-read/security/tool label scan, and diff check.
- Compatibility: no migration required. Runtime code, local tool execution,
  local storage, IPC payloads, tool schemas, storage, credentials, permissions,
  hosted backend URLs, provider policy, and trust boundaries are unchanged.

### 2026-06-20 Local-Runtime JSON-RPC and Plugin Route Labels

- Finding: agent-visible pipeline, browser workflow/tool docs, debug observability, node
  routing, and plugin hub docs still used Python-side or sidecar
  executor/adapter/plugin/stdout labels for reusable local-runtime paths.
- Change: routed those references through local-runtime Python JSON-RPC,
  local-runtime Python browser adapter, SDK/main local-runtime plugin dispatch,
  and local-runtime Python protocol-test wording while preserving concrete
  Python sidecar paths where the docs point to implementation modules.
- Validation: focused modular docs boundary test, docs listing, exact stale
  JSON-RPC/plugin route-label scan, and diff check.
- Compatibility: no migration required. Runtime code, JSON-RPC payloads, IPC
  payloads, browser action behavior, plugin execution, tool-result envelopes,
  storage, credentials, permissions, hosted backend URLs, provider policy, and
  trust boundaries are unchanged.

### 2026-06-20 Local-Runtime JSON-RPC Route Labels

- Finding: local-runtime JSON-RPC reference/workflow, lifecycle read hints,
  backend-tool lane notes, and runtime ownership routing still used sidecar
  daemon or Python sidecar process labels for reusable local-runtime
  route-owner behavior.
- Change: routed those labels through local-runtime daemon, local-runtime
  Python process/stdout/validation, local-runtime dispatch, and
  local-runtime daemon client/lifecycle wording while preserving concrete
  Python sidecar implementation tests and paths.
- Validation: focused modular docs boundary test, docs listing, exact stale
  JSON-RPC route-label scan, and diff check.
- Compatibility: no migration required. Runtime code, JSON-RPC endpoints,
  request/response envelopes, daemon startup, timeout policy, backend tool
  dispatch behavior, IPC payloads, storage, credentials, permissions, hosted
  backend URLs, provider policy, and trust boundaries are unchanged.

### 2026-06-20 Public Tool-System Local-Runtime Executor Labels

- Finding: public tool-system, node matrix, help, and API/reference docs still
  presented the Python sidecar daemon as the local tool owner for SDK/main
  local-runtime execution paths.
- Change: routed those labels through local-runtime Python executor/daemon and
  local-runtime daemon contract wording while preserving implementation docs
  and concrete `sidecar_daemon.py` paths for Python-side debugging.
- Validation: focused modular docs boundary test, docs listing, exact stale
  public daemon-label scan, and diff check.
- Compatibility: no migration required. Runtime code, SDK/main local-runtime
  dispatch, Python executor behavior, JSON-RPC payloads, tool schemas,
  storage, credentials, permissions, hosted backend URLs, provider policy, and
  trust boundaries are unchanged.

### 2026-06-20 Frontend Inventory Local-Runtime Daemon Labels

- Finding: frontend inventory, main-process, websocket, protocol, and renderer
  transcript references still used sidecar-daemon or sidecar-exposed labels
  for SDK-owned local-runtime daemon startup, scoped host helper execution,
  JSON-RPC dispatch, chat-event internals, and Python validation failures.
- Change: routed those references through SDK-owned local-runtime daemon,
  local-runtime exposed tools, local-runtime Python spawn/readiness, and
  local-runtime chat-event/JSON-RPC wording while preserving concrete
  `frontend/src/main/sidecar/*` and `main/python/*` paths.
- Validation: focused modular docs boundary test, docs listing, exact stale
  frontend daemon-label scan, and diff check.
- Compatibility: no migration required. Runtime code, local-runtime daemon
  startup, JSON-RPC request dispatch, tool argument validation, chat-event
  storage, IPC payloads, storage, credentials, permissions, hosted backend
  URLs, provider policy, and trust boundaries are unchanged.

### 2026-06-20 Frontend Inventory Local-Runtime Labels

- Finding: frontend inventory, main, transcript, protocol, and domain
  ownership docs still used sidecar daemon/chat-event labels for SDK
  local-runtime lifecycle, execution, and conversation-store internals. The
  domain ownership matrix also described renderer ownership as tool-execution
  orchestration and had mojibake quote text in preload allowlist guidance.
- Change: routed daemon, chat-event, tool-exposed, and arg-validation wording
  through local-runtime labels, routed renderer ownership through UI
  intent/display state, cleaned the quote text, and extended the modular docs
  guard to cover the retired phrases and the matrix.
- Validation: focused modular docs boundary test, docs listing, exact mojibake
  marker scan, stale ownership phrase scan, and diff check.
- Compatibility: no migration required. Runtime code, renderer behavior, IPC
  payloads, tool execution routing, local-runtime Python behavior, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

### 2026-06-20 Local-Runtime Screenshot Label Follow-Up

- Finding: coordinate-resolution, artifact payload, platform, screenshot
  overlay, and tool lifecycle docs still used sidecar screenshot labels for
  reusable local-runtime capture behavior.
- Change: routed those references through local-runtime screenshot result,
  invocation, task, implementation, and tool wording, and added modular docs
  guards for the retired sidecar screenshot phrases.
- Validation: focused modular docs boundary test, docs listing, exact stale
  screenshot-label scan, and diff check.
- Compatibility: no migration required. Runtime code, screenshot capture
  behavior, capture metadata, IPC payloads, tool-result payloads, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

### 2026-06-20 Communication Flow Mojibake Cleanup

- Finding: `docs/architecture/communication_flow.md` still contained mojibake
  arrows in user-query, tool-execution, error, and transport labels, while
  `docs/architecture/memory_system.md` had mojibake quotes in a hosted
  debugging note.
- Change: replaced the damaged flow arrows and debugging quotes with ASCII
  runtime-flow text and added a modular docs guard against mojibake markers in
  the core architecture flow docs.
- Validation: focused modular docs boundary test, docs listing, exact mojibake
  marker scan, and diff check.
- Compatibility: no migration required. Runtime code, IPC payloads, websocket
  events, local-runtime process startup, storage, credentials, permissions,
  hosted backend URLs, provider policy, and tool execution behavior are
  unchanged.

### 2026-06-20 Frontend Architecture Local-Runtime Labels

- Finding: frontend architecture overview and implementation notes,
  communication-flow diagrams and flows, plus platform/window-lifecycle
  screenshot references still used sidecar public-owner labels for
  local-runtime Python implementation, daemon startup, hosted SDK client,
  dependency install, chat-event RPC names, screenshot capture, title updates,
  and exposed tool surface.
- Change: routed those notes and flow references through local-runtime Python
  daemon, local-runtime chat-event/title/screenshot, local-runtime memory, and
  local-runtime exposed-tool wording while preserving concrete
  `frontend/src/main/python` and `main/sidecar/*` paths; cleaned a hosted
  memory debugging quote mojibake path and guarded core architecture docs
  against mojibake markers.
- Validation: focused modular docs boundary test, docs listing, exact stale
  frontend-architecture label scan, and diff check.
- Compatibility: no migration required. Runtime code, SDK local-runtime
  startup, screenshot behavior, conversation store metadata, tool registry
  behavior, IPC channels, storage, credentials, permissions, hosted backend
  URLs, and provider policy are unchanged.

### 2026-06-20 JSON-RPC Validation and Workflow Labels

- Finding: validation-command, local-runtime tool-change, JSON-RPC protocol,
  system-state, and main-process workflow docs still used unqualified
  `sidecar JSON-RPC`, `Python sidecar JSON-RPC handlers`, or `sidecar call`
  labels for reusable local-runtime tool/JSON-RPC routes.
- Change: reworded those labels through local-runtime JSON-RPC/tool routing
  backed by Python sidecar modules while preserving Python sidecar references
  where the docs point at concrete process, protocol, or pytest coverage.
- Validation: focused modular docs boundary guard, docs search, related commit
  search, exact stale JSON-RPC workflow-label scan, docs listing, and diff
  check.
- Compatibility: no migration required. JSON-RPC method names, params, daemon
  endpoints, IPC channels, SDK/main dispatch, validation commands, storage,
  credentials, permissions, provider policy, hosted URLs, and local-runtime
  behavior are unchanged.

### 2026-06-20 Local-Runtime JSON-RPC Reference Labels

- Finding: the local-runtime JSON-RPC reference, Python implementation
  workflow, frontend inventory, and source-map doc still used sidecar
  method/startup labels in `summary`, `read_when`, or package-topology text.
- Change: routed those labels through local-runtime JSON-RPC method and
  startup wording while keeping Python sidecar implementation references where
  the docs point at concrete code.
- Validation: focused modular docs boundary guard, docs search, related commit
  search, stale JSON-RPC label scan, docs listing, and diff check.
- Compatibility: no migration required. JSON-RPC method names, params, daemon
  endpoints, IPC channels, SDK/main dispatch, storage, credentials,
  permissions, provider policy, hosted URLs, and local-runtime behavior are
  unchanged.

### 2026-06-20 Runtime Boundary Owner-Label Follow-Up

- Finding: extension surface, install, release packaging, shared-schema,
  browser validation, platform, and historical runtime-design docs still used
  `sidecar runtime`, `backend/sidecar`, `sidecar boundary`, and
  `main/sidecar` labels in places that describe reusable local-runtime
  contracts or owner routing.
- Change: reworded those docs through local-runtime browser execution,
  backend/local-runtime schema parity, local-runtime Python build and
  platform-adapter labels, and local-runtime HTTP/WebSocket boundaries while
  preserving exact `sidecar-runtime` command names and Python sidecar paths
  where they are implementation details.
- Validation: focused modular docs boundary guard, docs search, related commit
  search, targeted stale runtime/boundary label scan, docs listing, and diff
  check.
- Compatibility: no migration required. Command names, tool schemas, browser
  action validation, JSON-RPC method names, IPC channels, SDK/main dispatch,
  package scripts, storage, credentials, permissions, provider policy, hosted
  URLs, and local-runtime behavior are unchanged.

### 2026-06-20 IPC Local-Runtime JSON-RPC and Runtime Labels

- Finding: IPC, memory, node, frontend inventory, main-process workflow,
  browser schema, packaging, platform, extension, and runtime-adapter docs
  still described public routing through `sidecar JSON-RPC` calls, params,
  response shape, method-payload labels, or sidecar runtime/schema owner labels
  even though SDK/main owns the local-runtime JSON-RPC and implementation
  contract.
- Change: reworded those paths through local-runtime JSON-RPC calls, params,
  response shape, executable registry routing, local-runtime implementation
  labels, and local-runtime build/adapter names while preserving Python
  sidecar references only for implementation-backed tests and protocol details.
- Validation: focused modular docs boundary guard, docs search, related commit
  search, stale sidecar JSON-RPC/runtime owner-label scans, docs listing, and
  diff check.
- Compatibility: no migration required. JSON-RPC method names, params, IPC
  channels, SDK/main dispatch, transcript storage, executable tool registry,
  packaging commands, platform adapter paths, storage, credentials,
  permissions, provider policy, hosted URLs, and local-runtime behavior are
  unchanged.

### 2026-06-20 Tool Request Local-Runtime Contract Labels

- Finding: tool workflow, session/transcript, backend remote-tool,
  extension-point, and cross-layer contract docs still used `sidecar action`,
  `sidecar expectations`, `sidecar may execute`, and backend/sidecar parity
  labels in public routing text.
- Change: reworded those paths through local-runtime executable actions,
  local-runtime JSON-RPC boundaries, local-runtime adapters, extension-point
  routing, and local-runtime Python implementation parity while preserving
  exact Python sidecar filenames and tests where they are implementation
  evidence.
- Validation: focused modular docs boundary guard, docs search, related commit
  search, stale sidecar action/parity scan, docs listing, and diff check.
- Compatibility: no migration required. Tool names, schemas, request/bundle
  IDs, JSON-RPC method names, IPC channels, SDK/main dispatch, storage,
  credentials, permissions, provider policy, hosted URLs, and local-runtime
  behavior are unchanged.

### 2026-06-20 Local-Runtime Python Import Boundary Labels

- Finding: architecture and browser parity docs still described import
  independence through `Python sidecar runtime` and `sidecar runtime imports`
  labels even though the public boundary is the local-runtime Python
  implementation staying independent from backend packages.
- Change: reworded the architecture hub, Python sidecar overview, source-map
  export guidance, and browser contract validation guidance through
  local-runtime Python implementation/import labels, and extended the modular
  stale-label guard for the retired phrases.
- Validation: focused modular docs boundary guard, docs search, related commit
  search, active-doc stale import-label scan, docs listing, and diff check.
- Compatibility: no migration required. Import paths, package exports,
  browser schema parity, process launch, JSON-RPC method names, IPC channels,
  SDK/main dispatch, storage, credentials, permissions, provider policy, hosted
  URLs, and local-runtime behavior are unchanged.

### 2026-06-20 Frontend Python Tree Local-Runtime Label

- Finding: the frontend architecture source-tree still labeled
  `frontend/src/main/python/` as `Sidecar runtime (tools, memory, system,
  browser)`, making the Python implementation read like a peer public runtime
  owner in the first architecture overview.
- Change: renamed the tree label to `Local-runtime Python implementation
  (tools, memory, system, browser)` and extended the modular architecture guard
  so the retired sidecar-runtime tree label stays out of active docs.
- Validation: focused modular docs boundary guard, docs search, related commit
  search, exact stale frontend tree-label scan, docs listing, and diff check.
- Compatibility: no migration required. Source paths, process launch, JSON-RPC
  method names, tool schemas, SDK/main dispatch, IPC channels, renderer
  display, storage, credentials, permissions, provider policy, hosted URLs, and
  local-runtime behavior are unchanged.

### 2026-06-20 Agent SDK Mock Backend Copy

- Finding: the local SDK mock backend still returned Windie-agent/WindieOS copy
  in health metadata, system-prompt fixtures, streamed responses, completion
  fixtures, and startup logs even though it is reusable SDK developer tooling.
- Change: replaced those fixture strings with generic Agent SDK mock-backend
  wording and updated the focused mock-backend contract expectation.
- Validation: focused mock-backend Jest coverage, docs search, related commit
  search, stale mock-backend product-copy scan, and diff check.
- Compatibility: no migration required. Mock websocket event shapes, health
  response fields, tool-call/result flow, SDK transport behavior, storage,
  credentials, permissions, provider policy, hosted URLs, and local-runtime
  behavior are unchanged.

### 2026-06-20 Registry Table Local-Runtime Labels

- Finding: active tool contract and frontend IPC/local-runtime protocol docs
  still used `Sidecar registry` and `Sidecar Method Registry` labels for
  registry tables after public routing moved to local-runtime executable
  registry ownership and Python JSON-RPC implementation details.
- Change: renamed the tool contract file-table row to
  `Local-runtime executable registry`, renamed the protocol heading to
  `Python JSON-RPC Method Registry`, and extended the modular docs guard so
  those retired public owner labels stay out of active docs.
- Validation: focused modular docs boundary guard, docs search, related commit
  search, exact active-doc stale registry-label scan, docs listing, and diff
  check.
- Compatibility: no migration required. Tool schemas, executable registry
  behavior, JSON-RPC method names, IPC channels, SDK/main dispatch, renderer
  display, storage, credentials, permissions, provider policy, hosted URLs, and
  local-runtime behavior are unchanged.

### 2026-06-20 Renderer Envelope and Tool Catalog Route Labels

- Finding: local-runtime tool catalog and retired renderer tool-result envelope
  docs still used sidecar registry dispatch, backend/sidecar contracts, and SDK
  main-runtime migration labels after the active route moved to SDK/main
  local-runtime execution and backend/local-runtime contracts.
- Change: reworded those docs through local-runtime registry dispatch backed by
  Python modules, backend/local-runtime contracts, and SDK/main local-runtime
  migration wording, and expanded the modular docs guard to cover the retired
  renderer envelope reference.
- Validation: focused modular docs boundary guard, docs search, related commit
  search, stale SDK-main-runtime/sidecar-registry label scan, docs listing, and
  diff check.
- Compatibility: no migration required. Tool-result payload shape, SDK/main
  dispatch, local-runtime registry behavior, JSON-RPC payloads, IPC channels,
  renderer display, storage, credentials, permissions, provider policy, hosted
  URLs, and local-runtime behavior are unchanged.

### 2026-06-20 Tool Routing Registry Owner Wording

- Finding: active tool troubleshooting, websocket reference, catalog, contract,
  architecture, and schema-policy docs still used SDK main-runtime tool router
  and Python sidecar registry labels in public routing/parity paths after the
  owner boundary moved to SDK/main local-runtime dispatch plus local-runtime
  executable registry ownership backed by Python sidecar modules.
- Change: reworded those docs through SDK/main local-runtime tool routing and
  local-runtime executable registry labels while preserving Python module paths
  as implementation breadcrumbs, and extended the modular tool-routing guard for
  the retired phrases.
- Validation: focused modular docs boundary guard, docs search, related commit
  search, stale SDK-main-runtime/Python-sidecar-registry phrase scan, docs
  listing, and diff check.
- Compatibility: no migration required. Tool schemas, executable registry
  behavior, SDK/main dispatch, JSON-RPC payloads, IPC channels, renderer
  display, storage, credentials, permissions, provider policy, hosted URLs, and
  local-runtime behavior are unchanged.

### 2026-06-20 Tool Policy and Registry Local-Runtime Labels

- Finding: tool policy debugging still told readers to confirm sidecar
  `LOCAL_RUNTIME_BUILTIN_TOOL_NAMES`, and tool policy plus validation matrix
  target sections used a bare `Sidecar:` heading while active tool docs still
  named the Python sidecar registry/router as the public owner even though the
  public route is local-runtime executable parity backed by Python sidecar
  implementation tests.
- Change: reworded hidden-tool debugging through the local-runtime built-in
  tool set and executable registry registration, renamed validation headings to
  `Local runtime / Python sidecar implementation`, routed executable
  registry/router references through local-runtime ownership, and extended the
  modular docs guard over those active docs.
- Validation: focused modular docs boundary guard, docs search, related commit
  search, stale sidecar validation-label scan, docs listing, and diff check.
- Compatibility: no migration required. Tool policy, capability gates,
  executable registry behavior, SDK/main dispatch, IPC channels, storage,
  credentials, permissions, provider policy, hosted URLs, and local execution
  behavior are unchanged.

### 2026-06-20 Host Skin Agent Display Name Wording

- Finding: active architecture and IPC helper docs still described host-skin
  product identity as an SDK agent name, even though the main boundary owns
  generic Electron host copy and only passes an agent display name into the SDK
  agent-definition path.
- Change: reworded those docs around agent display name ownership and extended
  the modular runtime docs guard so the stale SDK-agent-name label stays out of
  active host-skin routing docs.
- Validation: focused modular docs boundary guard, docs search, related commit
  search, stale SDK-agent-name phrase scan, docs listing, and diff check.
- Compatibility: no migration required. Host-skin config shape, SDK agent
  definition payloads, IPC channels, renderer display, storage, credentials,
  permissions, provider policy, hosted URLs, and local-runtime behavior are
  unchanged.

### 2026-06-20 Tool Authoring Local-Runtime Registry Wording

- Finding: tool catalog, development, MCP, and JSON-RPC workflow docs still
  described backend-only capabilities as not being sidecar local actions and
  sent tool visibility troubleshooting through built-in Python sidecar tools,
  sidecar `ToolRegistry`, and Python sidecar tool registries even though the
  reusable authoring route is local-runtime executable manifest and registry
  ownership.
- Change: reworded the catalog, tool development, and MCP docs through
  local-runtime executable action, manifest, and registry labels while keeping
  Python sidecar module paths visible as the current implementation detail, and
  aligned the `execute_tool` JSON-RPC workflow row with the same registry owner.
- Validation: focused modular docs boundary guard, docs search, related commit
  search, stale sidecar registry/action phrase scan, docs listing, and diff
  check.
- Compatibility: no migration required. Tool schemas, local-runtime executable
  registry behavior, SDK/main dispatch, MCP registration, IPC channels,
  storage, credentials, permissions, provider policy, hosted URLs, and local
  execution behavior are unchanged.

### 2026-06-20 Agent Development Tool-Schema Widening Boundary

- Finding: `docs/development/agent_development_workflow.md` still used a tool
  schema widening example that routed work through sidecar registry and
  renderer result handling, even though the active cross-runtime path is
  backend schema, SDK/main local-runtime dispatch, local-runtime executable
  registry implementation, and renderer projection handling.
- Change: reworded that workflow example through the current owner boundaries
  and extended the modular docs guard so the old sidecar-registry/renderer
  result route stays retired.
- Validation: focused modular docs boundary guard, docs search, related commit
  search, stale workflow phrase scan, docs listing, and diff check.
- Compatibility: no migration required. Tool schemas, executable registry
  behavior, SDK/main dispatch, renderer projections, IPC channels, storage,
  credentials, permissions, provider policy, hosted URLs, and local execution
  behavior are unchanged.

### 2026-06-20 Kimi Provider Frontend Validation Route Cleanup

- Finding: `docs/providers/kimi_coding.md` still listed the deleted
  `ApiClient.test.ts` in its focused frontend validation command after renderer
  API-client behavior moved to the app-runtime facade and boundary guard.
- Change: replaced that stale test route with
  `RendererApiClientBoundary.test.ts` and extended the renderer ApiClient
  boundary guard to cover the Kimi provider doc.
- Validation: focused renderer ApiClient boundary test, docs search, related
  commit search, stale `ApiClient.test.ts` scan, docs listing, and diff check.
- Compatibility: no migration required. Provider config, model catalog,
  renderer app-runtime behavior, SDK facade behavior, IPC channels, storage,
  credentials, permissions, provider policy, hosted URLs, and local execution
  behavior are unchanged.

### 2026-06-20 Frontend Store and Domain Triage Boundary Wording

- Finding: frontend architecture, domain triage, transcript, artifact, and
  packaging docs still carried old labels such as frontend+sidecar local store,
  renderer API client, sidecar transcript store, and Python sidecar local tool
  where the active boundary is SDK/local-runtime conversation storage,
  renderer app-runtime send/endpoint facades, Electron main Agent SDK host, and
  local-runtime Python tool implementation.
- Change: reworded those active docs through SDK/local-runtime conversation
  store ownership, local-runtime transcript storage backed by Python sidecar
  modules, renderer app-runtime send and endpoint/status clients, and
  local-runtime Python tool implementation labels; extended modular and
  renderer ApiClient boundary guards for the retired phrases.
- Validation: focused modular docs boundary guard, renderer ApiClient boundary
  guard, docs search, related commit search, active-doc stale owner-label scan,
  docs listing, and diff checks.
- Compatibility: no migration required. Conversation events, transcript row
  fields, artifact refs, packaging behavior, endpoint propagation, IPC
  channels, SDK/main dispatch, renderer display, storage, credentials,
  permissions, provider policy, hosted URLs, and local execution behavior are
  unchanged.

### 2026-06-20 API Reference SDK/Main Tool Routing Wording

- Finding: `docs/reference/api_reference.md` still contrasted hosted SDK
  clients with a renderer `ApiClient` Electron IPC bridge and described
  websocket tool-call/tool-result traffic as frontend-owned execution even
  though that bridge is deleted and first-party renderer code reaches
  runtime/backend behavior through app-runtime facades, SDK/main local-runtime
  dispatch, and SDK/renderer consumers.
- Change: reworded the API reference around first-party Electron renderer
  app-runtime facades, described SDK introspection as independent from the
  desktop renderer UI, and routed websocket client/server headings plus
  tool-call/tool-result descriptions through SDK/main local-runtime dispatch and
  SDK/renderer consumers.
- Validation: focused renderer ApiClient boundary test, docs search, related
  commit search, stale ApiClient/frontend-owned execution scan, docs listing,
  and diff checks.
- Compatibility: no migration required. SDK routes, websocket message types,
  payload schemas, IPC channels, renderer app-runtime facades, hosted transport
  behavior, SDK/main local-runtime dispatch, storage, credentials, permissions,
  provider policy, hosted URLs, and local execution behavior are unchanged.

### 2026-06-20 Diagnostics First-Triage Runtime Wording

- Finding: `docs/help/diagnostics.md` still routed no-response and tool-result
  continuation failures through broad `ipc.cjs`/frontend wording after Agent
  SDK host and tool-result ingress ownership had moved to narrower routes.
- Change: reworded those diagnostics rows to start with Electron main Agent
  SDK host, SDK backend transport traces, and SDK/main tool-result relay before
  backend websocket or backend ingestion modules.
- Validation: focused modular docs boundary guard, docs search, related commit
  search, docs listing, and diff check.
- Compatibility: no migration required. Diagnostic command names, trace paths,
  websocket behavior, SDK/main relay behavior, renderer display, storage,
  credentials, permissions, hosted URLs, provider policy, and local execution
  behavior are unchanged.

### 2026-06-20 Settings and Transparency Docs Consumer Labels

- Finding: provider/config workflows still described `Frontend settings`, and
  API reference transparency events still said system prompts and tool schemas
  were sent to the frontend even though renderer-managed settings and
  SDK/renderer transparency consumers are the active boundary.
- Change: reworded provider/config workflow settings ownership to
  renderer-managed settings, reworded API transparency event delivery through
  SDK/renderer consumers, and extended modular docs guards for the retired
  phrases.
- Validation: passed focused modular boundary test, docs listing, stale
  frontend-settings/transparency-consumer scan, and diff check.
- Compatibility: no migration required. Settings payloads, credential override
  behavior, provider factory rules, websocket transparency event names/payloads,
  renderer display, storage, credentials, permissions, provider policy,
  local-runtime routing, and hosted URLs are unchanged.

### 2026-06-20 Getting-Started Overview Desktop Host Label

- Finding: `docs/getting-started/overview.md` still labeled the public
  overview diagram desktop box as `Electron Frontend (UI)`, even though the
  current public boundary is renderer UI plus Electron main as an Agent SDK
  host.
- Change: renamed that diagram box to `Desktop Client / SDK Host (UI)` and
  added the retired label to the broad docs inventory guard.
- Validation: passed focused modular boundary test, docs listing, stale
  getting-started frontend-label scan, and diff check.
- Compatibility: no migration required. Public docs routing, runtime topology,
  IPC channels, websocket routes, SDK/main dispatch, renderer display, storage,
  credentials, permissions, provider policy, local-runtime routing, and hosted
  URLs are unchanged.

### 2026-06-20 Tool Parity Exposed-Registry Wording

- Finding: prompt/context debugging docs and backend tool registry/bridge
  references still named the sidecar exposed-tool registry/set as the parity
  surface, even though the current boundary is backend/local-runtime parity
  with Python sidecar modules as the backing implementation.
- Change: reworded those parity labels through local-runtime exposed-tool
  registry/set ownership backed by Python sidecar modules and extended the
  modular tool-routing guard for the retired sidecar-exposed phrases.
- Validation: passed focused modular boundary test, docs listing, stale
  sidecar exposed-tool parity scan, and diff check.
- Compatibility: no migration required. Tool names, schemas, manifest payloads,
  parity tests, Python sidecar registry paths, SDK/main dispatch,
  tool-call/result payloads, renderer display, storage, credentials,
  permissions, provider policy, local-runtime routing, and hosted URLs are
  unchanged.

### 2026-06-20 Architecture Diagram Desktop Host Label

- Finding: `docs/architecture/architecture.md` still labeled the desktop-side
  boundary in its high-level diagram as `Electron Frontend`, even though the
  current split is renderer UI plus Electron main as an Agent SDK host.
- Change: renamed the diagram boundary to `Desktop Client / SDK Host` and
  extended the modular architecture-overview guard for the retired label.
- Validation: passed focused modular boundary test, docs listing, stale
  architecture diagram frontend-label scan, and diff check.
- Compatibility: no migration required. Runtime topology, IPC channels,
  websocket routes, SDK/main dispatch, renderer display, storage, credentials,
  permissions, provider policy, local-runtime routing, and hosted URLs are
  unchanged.

### 2026-06-20 Architecture Overview Local-Runtime Labels

- Finding: `docs/architecture/architecture.md` and
  `docs/architecture/backend_architecture.md` still had stale overview labels
  for frontend-vs-backend separation, direct Python sidecar dispatch, sanitized
  frontend error delivery, unqualified sidecar enforcement gaps, and local
  memory storage directly via the Python sidecar.
- Change: reworded those high-level overview paths around renderer UI,
  Electron main desktop host, SDK local-runtime bridge, SDK/renderer consumers,
  local-runtime Python implementation limits, and SDK local-runtime memory
  backed by Python sidecar modules, with modular guard coverage for the retired
  phrases.
- Validation: passed focused modular boundary test, docs listing, stale
  architecture overview owner-label scan, and diff check.
- Compatibility: no migration required. Websocket events, error payloads,
  permission policy objects, tool schemas, tool-call/result payloads, SDK/main
  dispatch, Python sidecar modules, memory storage files, renderer display,
  storage, credentials, permissions, provider policy, local-runtime routing,
  and hosted URLs are unchanged.

### 2026-06-20 Architecture Agent System Runtime Boundary

- Finding: `docs/architecture/agent_system.md` still described settings as
  frontend-sent and tool calls/bundles as sent to the frontend, even though
  renderer settings now flow through the Agent SDK runtime and tool calls flow
  through SDK/main local-runtime dispatch.
- Change: reworded the settings and tool-lifecycle bullets around
  renderer-managed client settings, backend `update-settings`, and SDK/main
  local-runtime dispatch, and extended the modular tool-routing guard for those
  exact phrases.
- Validation: passed focused modular boundary test, docs listing, stale
  agent-system frontend-routing scan, and diff check.
- Compatibility: no migration required. `update-settings` payload shape,
  session config application, tool schemas, tool-call payloads, SDK/main
  dispatch, Python sidecar modules, renderer display, storage, credentials,
  permissions, provider policy, local-runtime routing, and hosted URLs are
  unchanged.

### 2026-06-20 Architecture Tool System Local-Runtime Boundary

- Finding: `docs/architecture/tool_system.md` still carried a Frontend
  (Electron) diagram and frontend/sidecar owner labels for manifest source,
  schema pairing, local validation, parity, screenshot lifecycle, and
  resource-limit notes even though the active boundary is desktop
  client/local-runtime plus backend policy.
- Change: normalized the diagram to desktop client/local-runtime ownership,
  reworded manifest, validation, parity, screenshot lifecycle, and
  resource-limit labels through local-runtime wording, and extended the modular
  tool-boundary guard for the architecture overview.
- Validation: passed focused modular boundary test, docs listing, stale
  tool-system owner scan, and diff check.
- Compatibility: no migration required. Tool schemas, executable tool names,
  manifests, SDK/main dispatch, Python sidecar modules, renderer display,
  storage, credentials, permissions, provider policy, local-runtime routing,
  and hosted URLs are unchanged.

### 2026-06-20 Architecture Extension-Point Tool Boundary

- Finding: `docs/architecture/extension_points.md` still labeled OS-level
  local tools as `Frontend Python Sidecar Tools` and described execution as
  direct Electron IPC, even though current tool dispatch routes through the
  SDK/main local-runtime boundary with Python sidecar modules as the backing
  implementation.
- Change: reworded the extension-point heading and execution description
  through local-runtime Python tools and SDK/main local-runtime dispatch, and
  extended the modular tool-boundary guard to include the extension-points doc.
- Validation: passed focused modular boundary test, docs listing, stale
  frontend-sidecar tools label scan, and diff check.
- Compatibility: no migration required. Tool schemas, executable tool names,
  IPC channels, SDK/main dispatch behavior, Python sidecar tool modules,
  renderer tool display, storage, credentials, permissions, provider policy,
  local-runtime routing, and hosted URLs are unchanged.

### 2026-06-20 Architecture Memory Overview Local-Runtime Boundary

- Finding: `docs/architecture/memory_system.md` still opened by assigning
  memory ownership to the frontend Python sidecar, even though current docs and
  runtime boundaries route durable memory through SDK/local-runtime memory with
  Python sidecar modules as the backing implementation.
- Change: reworded the overview, key locations, diagram, embedding failure
  behavior, storage layout, and dashboard API notes through local-runtime
  memory ownership while keeping concrete Python sidecar paths where they
  identify implementation modules.
- Validation: passed focused modular boundary test, docs listing, stale
  frontend-sidecar memory-owner scan, and diff check.
- Compatibility: no migration required. SQLite/FAISS paths, JSON-RPC method
  names, SDK memory APIs, backend embedding/semantic routes, renderer memory
  surfaces, storage, credentials, permissions, provider policy, local-runtime
  routing, and hosted URLs are unchanged.

### 2026-06-20 Main Agent Backend Error Log Wording

- Finding: Electron main connection/runtime helpers already used generic
  agent-backend wording for connect and close diagnostics, but backend parse
  and error-event logs still said plain `backend`, making the desktop host
  diagnostic layer read less like an Agent SDK host.
- Change: updated those Electron main diagnostics to `agent backend` wording
  and extended focused IPC/main boundary tests to keep the generic wording.
- Validation: passed focused connection-event, runtime-helper, and main
  host-skin boundary tests, stale plain-backend error-log scan, docs listing,
  and diff check.
- Compatibility: no migration required. Backend websocket event names, SDK
  backend event normalization, settings ACK failure resolution, renderer
  side-channel fan-out, storage, credentials, permissions, provider policy,
  local-runtime routing, and hosted URLs are unchanged.

### 2026-06-20 Main Backend Endpoint Default Naming Boundary

- Finding: `backend_endpoints.cjs` was already generic and received WindieOS
  hosted URLs from `mainHostSkin.hostedBackend`, but its internal fallback
  config was still named `DEFAULT_HOSTED_BACKEND` even though the generic
  default is loopback.
- Change: renamed the generic fallback config and normalization helpers to
  endpoint-default terminology, added an `endpointDefaults` option while
  preserving the existing host-skin `hostedBackend` option, and updated the
  endpoint reference.
- Validation: passed focused backend endpoint tests, main host skin boundary
  test, docs listing, stale hosted-internal naming scan, and diff check.
- Compatibility: no migration required. WindieOS hosted defaults, env
  precedence, explicit endpoint overrides, loopback fallback behavior,
  artifact URL selection, local-runtime env propagation, storage, credentials,
  permissions, provider policy, and hosted URLs are unchanged.

### 2026-06-20 Backend Client Settings Patch Guard Docs Route

- Finding: the backend validation reference title and content already used
  client settings patch ownership, but the docs filename and backlinks still
  exposed the older `frontend_patch_guard` route.
- Change: renamed the reference route to
  `input_validation_and_client_settings_patch_guard_reference.md`, updated
  backlinks, and added a backend guardrail that the old route stays removed.
- Validation: passed focused backend runtime architecture guardrail test, docs
  listing/link validation, stale retired route scan, and diff check.
- Compatibility: no migration required. Documentation paths changed only inside
  repo docs; backend validation code, client settings patch field behavior,
  API payloads, renderer settings sync, storage, credentials, permissions,
  provider policy, and hosted URLs are unchanged.

### 2026-06-20 Backend Tool Result Transformer Output Ownership Wording

- Finding: the backend result transformer reference still described
  `ToolResult.format_for_history` pass-through text as preformatted frontend
  `output`, even though current tool-result ingress and `ToolResult.from_payload`
  route those payloads through SDK/local-runtime ownership.
- Change: reworded the pass-through design intent to preformatted
  SDK/local-runtime `output` and added a backend runtime architecture guardrail
  against the stale frontend-owned output phrase.
- Validation: passed focused backend runtime architecture guardrail test, docs
  listing, stale preformatted frontend output scan, and diff check.
- Compatibility: no migration required. Tool result formatting code, history
  text precedence, screenshot extraction, compaction facts, SDK/local-runtime
  result ingress, IPC, storage, credentials, permissions, provider policy, and
  hosted URLs are unchanged.

### 2026-06-20 Renderer Voice Transcription Socket Lifecycle Boundary

- Finding: `useVoiceMode` already delegated gateway creation, message dispatch,
  and protocol sends to `DesktopVoiceRuntimeClient`, but still interpreted
  socket ready-state, open checks, and close behavior directly in the hook.
- Change: moved transcription socket active/open predicates, close, and
  conditional start-over/audio sends into `DesktopVoiceRuntimeClient`; updated
  the hook and voice reference docs to use those value-level runtime helpers.
- Validation: passed focused voice runtime client test, renderer voice boundary
  test, voice-mode hook test, docs listing, stale direct ready-state scan, and
  diff check.
- Compatibility: no migration required. Transcription gateway URL derivation,
  payload framing, reconnect policy, utterance-end reset, audio capture,
  wakeword IPC, backend transcription behavior, permissions, credentials,
  storage, provider policy, and hosted URLs are unchanged.

### 2026-06-20 Renderer Settings-Update Failure Classifier Wording

- Finding: the renderer settings-update failure classifier and its focused test
  still described the helper as matching backend settings-update failures,
  even though the shared classifier belongs to renderer runtime event handling.
- Change: reworded the module description and test name through renderer
  runtime event failure classification while preserving the exact
  backend-emitted failure substring contract.
- Validation: passed focused settings-update classifier test, renderer settings
  runtime boundary test, stale backend-owned classifier wording scan, docs
  listing, and diff check.
- Compatibility: no migration required. Event payloads, settings error text,
  save-status behavior, stream error suppression, IPC, backend handlers,
  storage, credentials, permissions, provider policy, and hosted URLs are
  unchanged.

### 2026-06-20 Renderer Provider API-Key Prop Contract Boundary

- Finding: the dashboard provider API-key prop contract still enumerated
  WindieOS provider ids, duplicating provider identity that already belongs to
  the renderer skin/config facade.
- Change: changed the provider API-key prop contract to an object-of provider
  entry shape and added a renderer skin/config boundary guard against
  reintroducing hardcoded provider ids in the prop-type module.
- Validation: passed focused renderer skin/config boundary test, dashboard
  model/API-key section test, source stale provider-id prop-type scan, docs
  listing, and diff check.
- Compatibility: no migration required. Provider API-key config shape,
  renderer normalization, credential redaction, storage, IPC, backend settings,
  provider policy, permissions, and hosted URLs are unchanged.

### 2026-06-20 SDK Active Sidecar Wording Boundary

- Finding: SDK docs still exposed sidecar-facing active contract wording for
  OCR/vision process requirements, an older implementation-specific env alias,
  and the current desktop conversation-store implementation detail.
- Change: changed those references to local-runtime process,
  implementation-specific alias, and local-runtime boundary wording, and
  extended the modular SDK docs guard for the retired active phrases.
- Validation: passed focused SDK docs boundary test, docs listing, active SDK
  sidecar wording scan, and diff check.
- Compatibility: no migration required. Runtime code, SDK APIs, local-runtime
  daemon behavior, discovery payloads, persisted conversation rows, OCR/vision
  routes, IPC channels, storage, credentials, permissions, provider policy, and
  hosted URLs are unchanged.

### 2026-06-20 SDK Local Runtime Daemon Docs Boundary

- Finding: the SDK runtime reference still described the reusable
  auto-local-runtime provider as starting `sidecar_daemon.py` and named the
  repo-specific sidecar launcher args, which made the public contract read like
  the WindieOS desktop implementation path.
- Change: described the provider as starting or reusing the configured daemon
  command/script, kept discovery/registration/JSON-RPC/shutdown ownership in
  `AgentClient`, and extended the modular SDK docs guard against the old
  sidecar script and launcher wording.
- Validation: passed focused SDK docs boundary test, docs listing, stale SDK
  sidecar script/launcher scan, and diff check.
- Compatibility: no migration required. Runtime code, SDK auto-local-runtime
  option names, daemon launch behavior, discovery payloads, IPC channels,
  storage, credentials, permissions, provider policy, and hosted URLs are
  unchanged.

### 2026-06-20 Public SDK Local Runtime Example Boundary

- Finding: the public TypeScript SDK README still showed `autoLocalRuntime`
  configured through the repo-specific `scripts/python-in-env sidecar python`
  launcher, and a renderer config persistence test used a sidecar-named fake
  unknown field while asserting renderer allowlist behavior.
- Change: changed the public README example to use an explicit generic daemon
  script and Python command, added a modular docs guard against the old launcher
  args, and renamed the renderer config fixture to `local_runtime_only_state`.
- Validation: passed focused SDK README boundary test, app config persistence
  test, docs listing, stale fixture/launcher scan, and diff check.
- Compatibility: no migration required. Runtime code, SDK local-runtime daemon
  launch behavior, auto-local-runtime option names, renderer config filtering,
  persisted settings, IPC channels, storage, credentials, permissions,
  provider policy, and hosted URLs are unchanged.

### 2026-06-20 Browser Schema Parity Route Filename Boundary

- Finding: the browser schema parity reference had already been reworded to
  backend/local-runtime ownership, but the filename and inbound links still
  carried the old `backend_sidecar` route label.
- Change: renamed the reference to
  `backend_local_runtime_browser_schema_parity_and_validation_boundary_reference.md`
  and updated the backend/browser/tool docs links plus the modular boundary
  fixture so route names match the current owner wording.
- Validation: passed focused browser docs boundary test, docs listing, stale
  old-path/encoding scan, and diff check.
- Compatibility: no migration required. Runtime code, browser schema loading,
  local-runtime validation, model-facing schema emission, tool schemas, IPC,
  storage, settings, credentials, permissions, provider policy, and hosted URLs
  are unchanged.

### 2026-06-20 Main Scripted Provider Debug Env Boundary

- Finding: `frontend/src/main/ipc/ipc_runtime_helpers.cjs` read
  `WINDIE_ENABLE_SCRIPTED_PROVIDER` directly while other main-process debug and
  dev flags route through `debug_env.cjs` plus `main_host_skin.cjs`. That made
  the generic Electron IPC helper own one WindieOS-specific env key.
- Change: introduced the generic `scriptedProvider` debug-env flag, mapped it
  to `WINDIE_ENABLE_SCRIPTED_PROVIDER` in the WindieOS host skin, updated
  scripted model-row augmentation to use `isDebugFlagEnabled(...)`, and
  extended the debug-env/main-host-skin/IP helper tests to guard the boundary.
- Validation: passed focused frontend main/debug-env tests, docs listing,
  scripted-provider env stale scan, and diff check.
- Compatibility: no migration required. Dev startup still uses
  `WINDIE_ENABLE_SCRIPTED_PROVIDER=1`; packaged/customer model pickers remain
  unchanged; backend scripted provider routing, model-list payloads, IPC
  channels, renderer settings/model state, storage, credentials, permissions,
  provider policy, and hosted URLs are unchanged.

### 2026-06-20 Python SDK Package Discovery Boundary

- Finding: `packages/windie-sdk-python/pyproject.toml` used the broad
  `windie*` package discovery pattern. Because the Python SDK source root is
  currently `frontend/src/main/python`, that pattern also matched
  `windie_shared`, the shared browser/local-runtime contract package used by
  backend browser schema loading and local-runtime validation.
- Change: narrowed SDK package discovery to `windie` and `windie.*`, documented
  that `windie_shared` is not part of the public Python SDK distribution, and
  added a sidecar package-boundary test over the `pyproject.toml` include list.
- Validation: passed focused sidecar package-boundary test, docs listing, SDK
  package-discovery stale scan, and diff check.
- Compatibility: no migration required. Runtime code, local checkout imports,
  local-runtime browser validation, backend browser schema loading, package
  import names, SDK websocket payloads, tool schemas, storage, IPC, settings,
  credentials, permissions, provider policy, and hosted URLs are unchanged.

### 2026-06-19 Docs Search Runtime Cache

- Finding: the required docs-search workflow had become slow enough that
  `WindieDocsIndex` could time out because every `findDocs(...)` call reloaded
  the docs index and renormalized every markdown page.
- Change: cached docs metadata and precomputed normalized search fields inside
  `scripts/windie/docs.cjs` while keeping public `loadDocsIndex()` results as
  fresh caller-owned objects.
- Validation: focused docs-index tests, docs list, docs search, diff checks,
  and cache mutation guard coverage.
- Compatibility: no migration required. Docs search ranking, docs file paths,
  docs navigation, CLI commands, runtime code, IPC, storage, credentials,
  permissions, hosted URLs, provider policy, and local execution behavior are
  unchanged.

### 2026-06-19 Main Wakeword IPC Host Adapter Boundary

- Finding: `wakeword_bridge.cjs` owned the right wakeword subprocess and audio
  framing boundary, but it imported and used Electron `ipcMain` directly inside
  `initializeWakewordBridge(...)`, unlike newer main-process handler modules
  that receive host adapters from the composition root.
- Change: added an `ipcMain` option and fail-fast adapter validation so the
  wakeword bridge can register its existing wakeword channels against an
  injected host adapter while keeping Electron `ipcMain` as the default. The
  production main-window bootstrap now passes Electron `ipcMain` from
  `index.cjs` into `initializeWakewordBridge(...)`.
- Validation: focused wakeword bridge tests, docs search, related commit
  search, stale direct registration assumptions in docs, docs listing, and diff
  checks.
- Compatibility: no migration required. Wakeword IPC channel names,
  enable/disable behavior, audio frame format, detection/status payloads,
  subprocess launch behavior, stderr parsing, storage, credentials,
  permissions, hosted URLs, provider policy, and local execution behavior are
  unchanged.

### 2026-06-19 Main Agent SDK Invoke Handler Registration Boundary

- Finding: after the pending-turn extraction, the remaining direct
  `ipcMain.handle(...)` registration in `ipc.cjs` was the SDK-shaped
  `windie:invoke` command bridge even though command dispatch already lived in
  `ipc_agent_sdk_command_handlers.cjs`.
- Change: added `registerAgentSdkInvokeHandler(...)` so
  `ipc_agent_sdk_command_handlers.cjs` owns `windie:invoke` registration and
  the strict SDK command handler envelope. `ipc.cjs` still injects Electron-main
  host state, query/stop handlers, settings gates, diagnostics, and Agent SDK
  runtime functions.
- Validation: passed focused main SDK runtime boundary tests plus docs search,
  related commit search, stale direct `windie:invoke` registration scan, docs
  listing, and diff checks.
- Compatibility: no migration required. `windie:invoke` channel name, SDK
  command names, command payloads, query/stop behavior, settings/model/memory
  command routing, IPC allowlists, storage, provider policy, hosted URLs,
  permissions, credentials, and local execution behavior are unchanged.

### 2026-06-19 Main Pending Turn IPC Handler Boundary

- Finding: renderer pending-turn send/listen calls were already routed through
  renderer runtime clients, but `ipc.cjs` still owned `windie:pending-turn`
  listener registration, pending-turn payload normalization, removed alias
  rejection, cache assignment, and clear broadcast construction inline.
- Change: added `ipc_pending_turn_handlers.cjs` to own pending-turn handler
  registration, pending payload normalization, clear alias rejection, and
  pending-turn match/clear helpers. `ipc.cjs` now injects the latest
  pending-turn cache setter/clearer and renderer fan-out while keeping the
  cache itself in the SDK host root for stop/current-turn cleanup.
- Validation: passed focused pending-turn handler, main bridge lifecycle, main
  SDK runtime boundary, docs-index tests, docs search, related commit search,
  stale inline pending-turn scan, docs listing, and diff checks.
- Compatibility: no migration required. `windie:pending-turn` channel names,
  pending/clear payload shapes, removed alias rejection, pending-turn replay and
  clear semantics, stop-target behavior, IPC allowlists, storage, provider
  policy, hosted URLs, permissions, credentials, and local execution behavior
  are unchanged.

### 2026-06-19 Main Renderer Diagnostics IPC Handler Boundary

- Finding: renderer diagnostics normalization and redaction already lived in
  focused runtimes, but `ipc.cjs` still registered the `renderer-log` and
  `live-surface-trace` channel bodies inline.
- Change: added `ipc_renderer_diagnostics_handlers.cjs` to own renderer
  diagnostics channel registration. `ipc.cjs` now injects the existing renderer
  log and live-surface trace handlers instead of owning those listener bodies.
- Validation: passed focused renderer diagnostics handler, diagnostics
  runtime, live-surface trace runtime, main SDK runtime boundary, and docs-index
  tests plus docs search, related commit search, stale inline diagnostics
  handler scan, docs listing, and diff checks.
- Compatibility: no migration required. `renderer-log` and
  `live-surface-trace` channel names, payload shapes, diagnostic redaction,
  logging behavior, IPC allowlists, storage, provider policy, hosted URLs,
  permissions, credentials, and local execution behavior are unchanged.

### 2026-06-19 Main Client Session IPC Handler Boundary

- Finding: `ipc.cjs` already delegated transcript-session payload
  normalization to `ipc_transcript_session_sync.cjs`, but still owned the
  `get-client-user-id` and `transcript-session-sync` channel bodies inline,
  including renderer-facing snapshot construction and transcript sync state
  mutation.
- Change: added `ipc_client_session_handlers.cjs` to own client session
  snapshot and transcript-session-sync handler registration. `ipc.cjs` now
  injects Agent SDK host state getters/setters, runtime endpoint URLs, and
  renderer fan-out while keeping mutable session state in the host root.
- Validation: passed focused client-session handler, main bridge lifecycle,
  main SDK runtime boundary, and docs-index tests plus docs search, related
  commit search, stale inline client-session handler scan, docs listing, and
  diff checks. Jest reported its open-handle warning after the clean test exit.
- Compatibility: no migration required. `get-client-user-id` and
  `transcript-session-sync` channel names, payload shapes, session/conversation
  state semantics, endpoint snapshot fields, renderer fan-out behavior, IPC
  allowlists, storage, provider policy, hosted URLs, permissions, credentials,
  and local execution behavior are unchanged.

### 2026-06-19 Renderer Storage Forwarding Adapter Deletion

- Finding: the renderer app-runtime inventory identified forwarding/helper
  facades as deletion candidates only after proving the caller and replacement
  owner. `desktopStorageRuntimeClient.js` only re-exported JSON localStorage
  helpers, and its sole production caller was
  `desktopPermissionOnboardingStorageRuntime.js`, another app-runtime module.
- Change: deleted `desktopStorageRuntimeClient.js` and routed permission
  onboarding storage directly to the JSON localStorage helper while keeping the
  purpose-named permission onboarding storage runtime as the feature-facing
  owner.
- Validation: passed focused permission storage, JSON localStorage, renderer
  app runtime boundary, renderer skin config boundary, and docs-index tests
  plus docs search, related commit search, stale removed storage-facade scan,
  docs listing, and diff checks.
- Compatibility: no migration required. Permission onboarding storage key,
  persisted state shape, malformed JSON behavior, best-effort write behavior,
  renderer feature import boundaries, storage payloads, settings, IPC,
  permissions, credentials, provider policy, hosted URLs, and local execution
  behavior are unchanged.

### 2026-06-19 Main Extension MCP IPC Handler Boundary

- Finding: `ipc.cjs` already delegated many Electron main handler groups, but
  extension metadata and MCP registry channels still kept their channel bodies,
  server-id validation, config persistence callback, and post-toggle Agent SDK
  MCP refresh wiring inline in the Agent SDK host root.
- Change: added `ipc_extension_mcp_handlers.cjs` to own
  `list-agent-extensions`, `list-mcp-servers`, `set-mcp-server-enabled`, and
  `refresh-mcp-servers` handler registration. `ipc.cjs` now injects the
  extension/MCP registry helpers plus shared SDK host state instead of owning
  those channel bodies directly.
- Validation: passed focused extension/MCP IPC handler, desktop MCP runtime
  client, desktop extension runtime client, renderer settings boundary, and
  docs-index tests plus docs search, related commit search, stale inline
  handler scan, docs listing, and diff checks.
- Compatibility: no migration required. IPC channel names, payload shapes,
  desktop UI config key names, MCP allowlist persistence behavior, SDK MCP
  registration refresh behavior, extension registry payloads, storage,
  provider policy, hosted URLs, permissions, credentials, and local-runtime MCP
  execution behavior are unchanged.

### 2026-06-19 Renderer Browser Permission Status Lookup Boundary

- Finding: `desktopPermissionPresentationRuntime` owned permission manifest
  lookup, badge projection, and status-detail presentation, but
  `BrowserSettingsTab` still indexed the raw `statusesByPermissionId` map by
  browser permission id before rendering the browser permission row.
- Change: added permission status lookup by normalized id to
  `desktopPermissionPresentationRuntime`. Browser settings now keeps row
  layout and browser-open actions while consuming a runtime-provided stored
  permission status before applying request-time overrides.
- Validation: passed focused permission presentation runtime, settings
  section, renderer settings boundary, and docs-index tests plus docs search,
  related commit search, stale raw browser permission status-map scan, docs
  listing, and diff checks.
- Compatibility: no migration required. Permission status map payload shape,
  browser permission id, badge labels/classes, status detail text, browser
  permission request/probe behavior, config update side effects, IPC channels,
  storage, provider policy, hosted URLs, permissions, credentials, and local
  execution behavior are unchanged.

### 2026-06-19 Renderer Agent Tool Toggle Config Boundary

- Finding: `DesktopExtensionRuntimeClient` owned extension metadata,
  capability-event normalization, remote-tool availability, and manifest
  presentation, but `AgentSettingsTab` still normalized raw
  `agent_disabled_local_tools` / `agent_disabled_remote_tools` arrays and
  computed enablement config patches locally.
- Change: added local/remote tool enabled-state and toggle config-patch helpers
  to `DesktopExtensionRuntimeClient`. Agent settings now keeps toggle rendering
  and custom-instruction patches while delegating disabled-list interpretation
  and tool-toggle config patch construction to the runtime client.
- Validation: passed focused desktop extension runtime client, agent settings,
  renderer settings boundary, and docs-index tests plus docs search, related
  commit search, stale raw disabled-tool config scan, docs listing, and diff
  checks.
- Compatibility: no migration required. Settings key names, disabled-tool list
  payload shape, local/remote tool toggle behavior, capability events, IPC
  channels, storage, provider policy, hosted URLs, permissions, credentials,
  and local execution behavior are unchanged.

### 2026-06-19 Renderer Dashboard Conversation Row Action Boundary

- Finding: `desktopDashboardConversationLoadRuntime` owned recent-list
  projection, event classification, title-poll rules, and retry policy, but
  `useDashboardConversations` still read raw dashboard row ids/titles and
  mapped or filtered recent/search/pin lists while handling rename, pin, open,
  and delete actions.
- Change: added dashboard conversation row identity/title helpers plus
  rename/delete/pin list-update helpers to
  `desktopDashboardConversationLoadRuntime`. The dashboard hook now keeps user
  prompts, confirmations, SDK delete/load calls, workspace cleanup, and active
  session reset side effects while delegating row identity and in-memory row
  mutations to the runtime facade.
- Validation: passed focused dashboard conversation load, dashboard shell,
  renderer app boundary, and docs-index tests plus docs search, related commit
  search, stale raw dashboard row action-field scan, docs listing, and diff
  checks.
- Compatibility: no migration required. Conversation metadata payload shape,
  prompt text, rename/delete/pin UI behavior, recent/search list contents,
  SDK conversation commands, IPC channels, storage, provider policy, hosted
  URLs, permissions, credentials, and local execution behavior are unchanged.

### 2026-06-19 Renderer Workspace Display Presentation Boundary

- Finding: `desktopWorkspaceRuntimeClient` owned active workspace value
  normalization, update subscriptions, granted selection requests, and
  selection equality, but `WorkspaceSettingsTab` still read raw active
  workspace name/path fields while rendering the selected workspace path and
  update success text.
- Change: added empty-selection and active-workspace display presentation
  helpers to `desktopWorkspaceRuntimeClient`. Workspace settings now keeps row
  layout, local sync state, and folder-pick actions while consuming
  runtime-provided empty workspace defaults, path text, and update success
  text.
- Validation: passed focused desktop workspace runtime client, settings
  section, renderer settings boundary, and docs-index tests plus docs search,
  related commit search, stale raw workspace display-field scan, docs listing,
  and diff checks.
- Compatibility: no migration required. Workspace permission payload shape,
  active workspace values, workspace picker behavior, dashboard/chat workspace
  binding, IPC channels, storage, provider policy, hosted URLs, permissions,
  credentials, local execution behavior, and local-runtime tool workspace
  defaults are unchanged.

### 2026-06-19 Renderer Dashboard Title Visibility Poll Boundary

- Finding: `desktopDashboardConversationLoadRuntime` owned recent-list
  projection, retry policy, and SDK event classification, but
  `useDashboardConversations` still hard-coded generated-title poll timing and
  checked raw dashboard row ids while deciding when to stop polling.
- Change: added title-visibility poll schedule, row-visibility, and
  continue-poll helpers to `desktopDashboardConversationLoadRuntime`. The
  dashboard hook now keeps timer setup/cleanup and reload side effects while
  delegating reusable poll rules to the runtime facade.
- Validation: passed focused dashboard conversation load, dashboard shell,
  renderer app boundary, and docs-index tests plus docs search, related commit
  search, stale raw title-poll scan, docs listing, and diff checks.
- Compatibility: no migration required. Conversation metadata payload shape,
  title-poll timing and attempt limit, recent-list reload behavior, IPC
  channels, storage, provider policy, hosted URLs, permissions, credentials,
  and local execution behavior are unchanged.

### 2026-06-19 Renderer Browser Permission Manifest Lookup Boundary

- Finding: `desktopPermissionPresentationRuntime` owned permission badge and
  status-detail presentation, but `BrowserSettingsTab` still scanned raw
  permission manifest rows by `permission_id` before rendering the browser
  permission row.
- Change: added permission manifest entry lookup with fallback values to
  `desktopPermissionPresentationRuntime`. Browser settings now keeps row
  layout and browser-open actions while consuming a runtime-provided permission
  entry for the badge.
- Validation: passed focused permission presentation runtime, settings section,
  renderer app boundary, renderer settings boundary, and docs-index tests plus
  docs search, related commit search, stale raw permission-id scan, docs
  listing, and diff checks.
- Compatibility: no migration required. Permission manifest payload shape,
  browser permission id, badge labels/classes, status detail text, browser
  permission request/probe behavior, config update side effects, IPC channels,
  storage, provider policy, hosted URLs, permissions, credentials, and local
  execution behavior are unchanged.

### 2026-06-19 Renderer Agent Skill and MCP Metadata Presentation Boundary

- Finding: `DesktopExtensionRuntimeClient` owned extension metadata loading and
  plugin diagnostics presentation, but `AgentSettingsTab` still counted raw
  skill/MCP arrays and shaped MCP server debug metadata while rendering
  extension diagnostics.
- Change: added skill and MCP metadata debug presentation to
  `DesktopExtensionRuntimeClient`. Agent settings now keeps extension layout
  while rendering runtime-provided skill/MCP counts, summaries, and debug specs.
- Validation: passed focused desktop extension runtime client, agent settings,
  renderer settings boundary, and docs-index tests plus docs search, related
  commit search, stale raw skill/MCP metadata-field scan, docs listing, and
  diff checks.
- Compatibility: no migration required. Extension runtime payload shape, skill
  and MCP debug details for normal entries, settings diagnostics, extension
  metadata display, capability event channels, tool-toggle config keys,
  settings storage, IPC channels, provider policy, hosted URLs, permissions,
  credentials, and local execution behavior are unchanged.

### 2026-06-19 Renderer Agent Plugin Metadata Presentation Boundary

- Finding: `DesktopExtensionRuntimeClient` owned extension metadata loading and
  settings presentation helpers, but `AgentSettingsTab` still read raw plugin
  permission, settings-panel, tool, and config-schema fields while rendering
  plugin diagnostics.
- Change: added plugin metadata presentation to
  `DesktopExtensionRuntimeClient`. Agent settings now keeps extension layout
  while rendering runtime-provided plugin names, counts, permission/panel text,
  and debug spec values.
- Validation: passed focused desktop extension runtime client, agent settings,
  renderer settings boundary, and docs-index tests plus docs search, related
  commit search, stale raw plugin metadata-field scan, docs listing, and diff
  checks.
- Compatibility: no migration required. Extension runtime payload shape, plugin
  names/descriptions/counts for normal entries, settings diagnostics, extension
  metadata display, capability event channels, tool-toggle config keys,
  settings storage, IPC channels, provider policy, hosted URLs, permissions,
  credentials, and local execution behavior are unchanged.

### 2026-06-19 Renderer MCP Registry Error Presentation Boundary

- Finding: `desktopMcpRuntimeClient` owned MCP registry normalization,
  registry-or-error projection, and MCP card presentation, but `McpsSection`
  still formatted raw registry error `kind`, `id`, and `reason` fields while
  rendering MCP diagnostics.
- Change: added MCP registry error presentation to
  `desktopMcpRuntimeClient`. `McpsSection` now keeps diagnostics layout while
  rendering runtime-provided registry error key/text values.
- Validation: passed focused desktop MCP runtime client, MCP dashboard section,
  renderer chat runtime boundary, renderer settings boundary, and docs-index
  tests plus docs search, related commit search, stale raw MCP registry-error
  field scan, docs listing, and diff checks.
- Compatibility: no migration required. MCP registry payload shape,
  diagnostic text for normal registry error entries, enablement persistence,
  discovery refresh behavior, IPC channels, storage, provider policy, hosted
  URLs, permissions, credentials, and local-runtime MCP execution behavior are
  unchanged.

### 2026-06-19 Renderer Agent Local Tool Manifest Presentation Boundary

- Finding: `DesktopExtensionRuntimeClient` owned agent manifest normalization
  and settings presentation helpers, but `AgentSettingsTab` still built
  accepted/rejected local-tool maps from raw manifest arrays and read rejected
  tool reasons while rendering local tool status.
- Change: added local-tool manifest presentation lookup to
  `DesktopExtensionRuntimeClient`. Agent settings now keeps local tool layout
  and toggle config patches while consuming runtime-provided accepted/rejected
  status values for each displayed tool.
- Validation: passed focused desktop extension runtime client, agent settings,
  renderer settings boundary, and docs-index tests plus docs search, related
  commit search, stale raw local-tool manifest-field scan, docs listing, and
  diff checks.
- Compatibility: no migration required. Client tool manifest payload shape,
  accepted schema display, rejected reason text, local/remote tool toggle
  config keys, settings storage, capability event channels, IPC channels,
  provider policy, hosted URLs, permissions, credentials, and local execution
  behavior are unchanged.

### 2026-06-19 Renderer Agent Extension Error Presentation Boundary

- Finding: `DesktopExtensionRuntimeClient` owned extension runtime payload
  normalization and settings presentation for remote tool availability, but
  `AgentSettingsTab` still formatted raw extension runtime error `kind`, `id`,
  and `reason` fields while rendering diagnostics.
- Change: added extension runtime error presentation to
  `DesktopExtensionRuntimeClient`. Agent settings now keeps diagnostics layout
  while rendering runtime-provided error key/text values.
- Validation: passed focused desktop extension runtime client, agent settings,
  renderer settings boundary, and docs-index tests plus docs search, related
  commit search, stale raw extension-error field scan, docs listing, and diff
  checks.
- Compatibility: no migration required. Extension runtime payload shape,
  diagnostic text for normal error entries, extension metadata display,
  capability event channels, tool-toggle config keys, settings storage, IPC
  channels, provider policy, hosted URLs, permissions, credentials, and local
  execution behavior are unchanged.

### 2026-06-19 Renderer Memory Settings Active User Boundary

- Finding: `DesktopMemoryRuntimeClient` owned SDK-shaped memory and chat-history
  reset commands, but `useMemorySettingsActions` still interpreted transcript
  session `userId` values and the `default_user` sentinel before deleting chat
  history.
- Change: added memory admin user-id resolution to
  `DesktopMemoryRuntimeClient`. Memory settings now keeps confirmation,
  pending state, and status copy while the runtime client decides whether a
  transcript session has an actionable user id.
- Validation: passed focused desktop memory runtime client, settings section,
  renderer dashboard boundary, and docs-index tests plus docs search, related
  commit search, stale default-user sentinel scan, docs listing, and diff
  checks.
- Compatibility: no migration required. Memory and conversation clear command
  names, payload shapes for actionable users, confirmation behavior, settings
  status text, transcript session state, IPC channels, storage, provider
  policy, hosted URLs, permissions, credentials, and local execution behavior
  are unchanged.

### 2026-06-19 Renderer Workspace Selection Equality Boundary

- Finding: `desktopWorkspaceRuntimeClient` owned workspace selection
  normalization/subscriptions, but `WorkspaceSettingsTab` still compared raw
  `activeWorkspaceName` and `activeWorkspacePath` values before applying
  updates.
- Change: added active-workspace selection equality to
  `desktopWorkspaceRuntimeClient`. `WorkspaceSettingsTab` now keeps state and
  rendering while consuming the runtime equality predicate.
- Validation: passed focused desktop workspace runtime client, permission
  presentation runtime, settings section, renderer settings boundary, and
  docs-index tests plus docs search, related commit search, stale raw workspace
  equality and permission badge status scans, docs listing, and diff checks.
- Compatibility: no migration required. Workspace permission payloads, active
  workspace values, workspace picker behavior, dashboard/chat workspace
  binding, IPC channels, storage, provider policy, hosted URLs, permissions,
  credentials, and local execution behavior are unchanged.

### 2026-06-19 Renderer Browser Permission Badge Status Boundary

- Finding: `desktopPermissionPresentationRuntime` owned permission status
  detail presentation and badge pill mapping, but `BrowserSettingsTab` still
  read the raw permission status `status` field before rendering
  `PermissionStatusBadge`.
- Change: made permission badge projection accept full permission status
  objects through `desktopPermissionPresentationRuntime`. Browser settings now
  passes the effective status object to the badge and leaves status-value
  extraction to the runtime helper.
- Validation: passed focused desktop workspace runtime client, permission
  presentation runtime, settings section, renderer settings boundary, and
  docs-index tests plus docs search, related commit search, stale raw workspace
  equality and permission badge status scans, docs listing, and diff checks.
- Compatibility: no migration required. Permission status payload shapes,
  badge labels/classes, browser settings rendering, onboarding rendering, IPC
  channels, storage, provider policy, hosted URLs, permissions, credentials,
  and local execution behavior are unchanged.

### 2026-06-19 Renderer Global Stop Shortcut Fallback Persistence Boundary

- Finding: `desktopShortcutRuntimeClient` owned global stop shortcut labels,
  supported options, accelerator normalization, focused-window stop-key
  matching, and notice presentation, but `AppConfigProvider` still read raw
  shortcut fallback and registration fields before saving a resolved fallback
  binding.
- Change: added fallback-accelerator resolution to
  `desktopShortcutRuntimeClient`. `AppConfigProvider` now keeps config state and
  persistence orchestration while consuming a runtime-owned fallback accelerator
  value.
- Validation: passed focused desktop shortcut runtime client, AppConfigProvider
  storage/IPC, and renderer settings boundary tests plus docs search, related
  commit search, stale raw shortcut-status field scan, docs listing, and diff
  checks.
- Compatibility: no migration required. Global stop shortcut status payloads,
  local shortcut config persistence format, shortcut fallback behavior,
  focused-window stop-key matching, IPC channels, storage, provider policy,
  hosted URLs, permissions, credentials, and local execution behavior are
  unchanged.

### 2026-06-19 Renderer Global Stop Shortcut Status Presentation Boundary

- Finding: `desktopShortcutRuntimeClient` owned global stop shortcut labels,
  supported options, accelerator normalization, and focused-window stop-key
  matching, but `GeneralSettingsTab` still read raw shortcut status fallback and
  registration fields while rendering notices.
- Change: added global stop shortcut status presentation projection to
  `desktopShortcutRuntimeClient`. `GeneralSettingsTab` now asks the runtime
  client whether to show fallback or registration-failure notices and which
  fallback label to render.
- Validation: passed focused desktop shortcut runtime client, settings section,
  general settings tab, renderer settings boundary, and docs-index tests plus
  docs search, related commit search, stale raw shortcut-status field scan, docs
  listing, and diff checks.
- Compatibility: no migration required. Global stop shortcut status payloads,
  local shortcut config persistence, shortcut fallback behavior, focused-window
  stop-key matching, IPC channels, storage, provider policy, hosted URLs,
  permissions, credentials, and local execution behavior are unchanged.

### 2026-06-19 Renderer Remote Tool Availability Presentation Boundary

- Finding: `desktopExtensionRuntimeClient` owned remote-tool catalog payload
  normalization and capability-event fan-out, but `AgentSettingsTab` still
  searched raw `remote_tools` entries and read `available` /
  `reason_unavailable` fields while rendering cloud tool availability.
- Change: added remote-tool availability presentation projection to
  `desktopExtensionRuntimeClient`. `AgentSettingsTab` now asks the runtime
  client for availability and unavailable-reason values, while the WindieOS
  skin owns the unavailable fallback label.
- Validation: passed focused desktop extension runtime client, agent settings
  tab, renderer settings boundary, and docs-index tests plus docs search,
  related commit search, stale raw remote-tool catalog-field scan, docs listing,
  and diff checks.
- Compatibility: no migration required. Agent capability event channel names,
  remote-tool catalog payload shape, tool toggle config keys, settings storage,
  IPC channels, provider policy, hosted URLs, permissions, credentials, and
  local execution behavior are unchanged.

### 2026-06-19 Renderer MCP Server Card Presentation Boundary

- Finding: `desktopMcpRuntimeClient` owned MCP registry, refresh, enablement,
  and registry-or-error normalization, but `McpsSection` still read raw server
  `status`, `effective_enabled`, command, args, and tool fields while rendering
  MCP cards.
- Change: added MCP server card/status presentation projection to
  `desktopMcpRuntimeClient`. `McpsSection` now renders display name, status
  label/class/text, enablement state/id, and debug spec values from the runtime
  client.
- Validation: passed focused desktop MCP runtime client, MCP dashboard section,
  renderer settings boundary, and docs-index tests plus docs search, related
  commit search, stale raw MCP card-field scan, docs listing, and diff checks.
- Compatibility: no migration required. MCP registry payloads, enablement
  persistence, discovery refresh behavior, dashboard card text for normal
  registry payloads, IPC channels, storage, provider policy, hosted URLs,
  permissions, credentials, and local execution behavior are unchanged.

### 2026-06-19 Renderer Response-Surface Trace Payload Boundary

- Finding: `desktopRendererTraceRuntime` owned renderer debug-trace gating and
  live-surface forwarding, but `useResponseOverlayWindowSync` still assembled
  response-surface stream-trace fields such as `layout_mode`,
  `show_response`, `thinking_text_length`, `compact_hover`, `turn_ref`, and
  `stale_guard_ref` while reporting response-window size changes.
- Change: added response-surface size trace payload normalization to the trace
  runtime. The window-sync hook now reports value-level layout, response,
  thinking, hover, turn, guard, width, and height inputs.
- Validation: passed focused renderer trace runtime, response overlay, chat
  boundary, and docs-index tests plus docs search, related commit search,
  stale trace-field scan, docs listing, and diff checks.
- Compatibility: no migration required. Responsebox IPC payload shape,
  live-surface trace IPC payload shape, stream-trace log labels, overlay
  measurement/dedupe behavior, storage, provider policy, hosted URLs,
  permissions, and local execution behavior are unchanged.

### 2026-06-19 Renderer Settings Event Type Dispatch Boundary

- Finding: `DesktopSettingsEventRuntimeClient` owned model-list settings-event
  payload handling, but `AppConfigProvider` still delegated raw
  `models-listed` event type dispatch through the provider-local
  `appConfigEvents` helper.
- Change: moved settings-event type dispatch into
  `routeDesktopSettingsEvent(...)` in `desktopSettingsEventRuntimeClient` and
  deleted the retired provider-local router and test.
- Validation: passed focused settings-event runtime, app config provider model,
  renderer settings boundary, and docs-index tests plus stale router reference
  scan, docs listing, and diff checks.
- Compatibility: no migration required. Settings-event channel names,
  `models-listed` payload shapes, available-models state, save-status behavior,
  config persistence, storage, IPC, provider policy, hosted URLs, permissions,
  credentials, and local execution behavior are unchanged.

### 2026-06-19 Renderer Permission Status Detail Presentation Boundary

- Finding: `desktopPermissionPresentationRuntime` owned shared permission
  labels, granted-state checks, and badge pill projection, but onboarding and
  browser settings still read raw status `reason`, `status`, and
  `details.remediation` fields to render detail text and CSS classes.
- Change: added permission status detail presentation normalization to the
  permission presentation runtime. Onboarding and browser settings now consume
  normalized reason, status-class, and remediation values.
- Validation: passed focused permission presentation runtime, onboarding
  slideshow, settings section, renderer app boundary, renderer settings
  boundary, and docs-index tests plus docs search, related commit search,
  stale raw status-detail field scan, docs listing, and diff checks.
- Compatibility: no migration required. Permission status payload shape, label
  text, CSS class tokens, browser settings rendering, onboarding slide
  rendering, storage, IPC, provider policy, hosted URLs, permissions, and local
  execution behavior are unchanged.

### 2026-06-19 Renderer Permission External Grant Watch Boundary

- Finding: `desktopPermissionGrantEffectsRuntime` owned cross-surface
  permission post-grant effects, but `useOnboardingPermissionActions` still
  read raw status fields such as `details.media_status`, `granted`, and
  `status` to decide whether to keep probing after OS settings opens.
- Change: moved external-grant watch eligibility and interval-polling policy
  into the permission grant effects runtime. The onboarding hook now keeps
  pending/waiting state, timers, focus rechecks, and cleanup while consuming
  runtime-owned permission watch decisions.
- Validation: passed focused onboarding permission actions, permission grant
  effects, renderer app boundary, and docs-index tests plus docs search,
  related commit search, stale raw status-field scan, docs listing, and diff
  checks.
- Compatibility: no migration required. Permission IPC channel names, status
  payload shape, grant-effect config update behavior, recheck interval and
  timeout values, onboarding waiting state, storage, provider policy, hosted
  URLs, permissions, and local execution behavior are unchanged.

### 2026-06-19 Renderer App Status Save Action Boundary

- Finding: `DesktopAppConfigRuntimeClient` owned settings-event normalization
  and settings-update error classification, but `AppStatusProvider` still
  switched on normalized event `type` and `isSettingsUpdateError` fields before
  updating the save-status state machine.
- Change: added value-level settings save-status action resolution and
  subscription to the app config runtime client. `AppStatusProvider` now keeps
  timer cleanup and save-status transitions while consuming only `success` or
  `error` actions.
- Validation: passed focused desktop app config runtime client,
  AppStatusProvider, renderer settings boundary, and docs-index tests plus
  docs search, related commit search, stale raw settings-event field scan,
  docs listing, and diff checks.
- Compatibility: no migration required. Backend settings-event channel names,
  raw event payload shape, settings-update error text matching, save-status UI
  timing, config persistence, storage, provider policy, hosted URLs,
  permissions, credentials, and local execution behavior are unchanged.

### 2026-06-19 Renderer Permission Status Value Boundary

- Finding: `DesktopPermissionRuntimeClient` owned permission IPC command
  envelopes, but `permissionStore` still read raw status fields such as
  `permission_id`, `granted`, `checked_at`, and `details` before deriving gate
  state.
- Change: moved permission status value normalization and id-indexing into the
  permission runtime client. The store now keeps manifest state, gate
  derivation, onboarding persistence, and action errors while consuming
  normalized status maps.
- Validation: passed focused desktop permission runtime client, permission
  store, renderer app boundary, and docs-index tests plus docs search, related
  commit search, stale raw status-field scan, docs listing, and diff checks.
- Compatibility: no migration required. Permission IPC channel names, result
  envelope shape, normalized status map shape, onboarding gate behavior,
  persisted onboarding state, storage, provider policy, hosted URLs,
  permissions, and local execution behavior are unchanged.

### 2026-06-19 Renderer IPC Status Value Boundary

- Finding: `DesktopClientSessionRuntimeClient` already owned desktop
  client/session snapshot normalization, but `AppConfigProvider` still read
  raw `ipc-status` `isConnected`, global stop shortcut status, and transcript
  user-id fields before applying config-sync and Settings UI state.
- Change: added value-level IPC status normalization and subscription to the
  client session runtime client. `AppConfigProvider` now consumes normalized
  connection, shortcut-status, and transcript user-id values while preserving
  runtime endpoint snapshot side effects.
- Validation: passed focused desktop client session runtime client,
  AppConfigProvider storage/IPC, app config events, renderer settings
  boundary, and docs-index tests plus docs search, related commit search,
  stale raw IPC status field scan, docs listing, and diff checks.
- Compatibility: no migration required. `ipc-status` and
  `get-client-user-id` channel names, raw snapshot shape, runtime endpoint
  metadata, transcript binding, shortcut fallback persistence, config sync,
  storage, provider policy, hosted URLs, permissions, and local execution
  behavior are unchanged.

### 2026-06-19 Renderer Wakeword Toggle State Boundary

- Finding: `DesktopVoiceRuntimeClient` owned the wakeword-toggle IPC
  subscription, but `AppConfigProvider` still read the raw bridge `enabled`
  field before updating wakeword suppression state.
- Change: added value-level wakeword-toggle state normalization and
  subscription to the voice runtime client. `AppConfigProvider` now consumes
  boolean enabled states while keeping app-level suppression policy.
- Validation: passed focused desktop voice runtime client, AppConfigProvider
  storage/IPC, renderer settings boundary, renderer voice boundary, and
  docs-index tests plus docs search, related commit search, stale raw
  wakeword-toggle field scan, docs listing, and diff checks.
- Compatibility: no migration required. Wakeword-toggle IPC channel names,
  payload shape, wakeword preference/suppression behavior, overlay visibility
  behavior, config persistence, storage, provider policy, hosted URLs,
  permissions, and local wakeword service execution behavior are unchanged.

### 2026-06-19 Renderer Wakeword Detection Value Boundary

- Finding: `DesktopVoiceRuntimeClient` owned wakeword bridge IPC and readiness
  value projection, but `useWakewordBridgeEvents` still read raw detection
  payload fields such as `model`, `confidence`, and `score` before applying
  cooldown and threshold policy.
- Change: added value-level wakeword detection normalization and subscription
  to the voice runtime client. The bridge hook now keeps enabled-state,
  cooldown, threshold, disable, and callback policy while the runtime client
  owns raw detection field extraction.
- Validation: passed focused desktop voice runtime client, wakeword bridge
  events hook, renderer voice boundary, and docs-index tests plus docs search,
  related commit search, stale raw detection field scan, docs listing, and diff
  checks.
- Compatibility: no migration required. Wakeword IPC channel names, detection
  payload shape, confidence threshold/cooldown behavior, immediate disable on
  accepted detection, wakeword callback shape, capture lifecycle, storage,
  provider policy, hosted URLs, permissions, and local wakeword service
  execution behavior are unchanged.

### 2026-06-19 Renderer Window Command Option Value Boundary

- Finding: app startup, wakeword restore, send-surface restore, minimal chat
  settings/hide actions, and main-window controls routed through
  `DesktopWindowRuntimeClient`, but still assembled or forwarded host-shaped
  chatbox/main-window visibility and text-entry option payloads locally.
- Change: added value-level show-chatbox, hide-chatbox, show-main-window, and
  text-entry activation option builders to the desktop window runtime client.
  Renderer callers now pass focus, maximize, open-target, and reason values
  while the runtime client assembles host payloads.
- Validation: passed focused desktop window runtime client, app startup,
  permission gate, wakeword controller boundary, send-surface preparation,
  chatbox mouse-ignore, renderer chat boundary, renderer voice boundary, and
  docs-index tests plus docs search, related commit search, stale host-shaped
  window command option scan, docs listing, and diff checks.
- Compatibility: no migration required. `show-chatbox`, `hide-chatbox`,
  `show-main-window`, and `activate-chatbox-text-entry` IPC channel names, host
  payload shapes, startup/onboarding/wakeword restore behavior, dashboard
  handoff behavior, text-entry focus timing, press-and-hold drag behavior,
  pointer/mouse-leave/blur policy, storage, provider policy, hosted URLs,
  permissions, and local-runtime execution behavior are unchanged.

### 2026-06-19 Renderer Hit-Test Payload Value Boundary

- Finding: `MinimalChatPill` and `MinimalResponseOverlay` routed through
  app-runtime IPC clients, but still assembled host-shaped `{ active }`
  hit-test command payloads locally.
- Change: added value-level chatbox/responsebox hit-test helpers to the
  desktop runtime clients. Components now pass boolean active state while
  `DesktopWindowRuntimeClient` and `DesktopResponseOverlayRuntimeClient`
  assemble host payloads.
- Validation: passed focused desktop window runtime client, response overlay
  runtime client, chatbox mouse-ignore, response overlay state, renderer chat
  boundary, and docs-index tests plus docs search, related commit search, stale
  host-shaped hit-test payload scan, docs listing, and diff checks.
- Compatibility: no migration required. Chatbox/responsebox hit-test IPC
  channel names, host payload shape, pointer/mouse-leave/blur policy,
  click-through behavior, overlay sizing, storage, provider policy, hosted
  URLs, permissions, and local-runtime execution behavior are unchanged.

### 2026-06-19 Renderer Voice Gateway Message Dispatch Boundary

- Finding: `DesktopVoiceRuntimeClient` parsed transcription gateway messages,
  but `useVoiceMode` still switched on normalized gateway event types and read
  protocol-derived fields such as `clientId`, `text`, `isFinal`, trace fields,
  and unknown message types.
- Change: added a value-level transcription gateway dispatcher to the voice
  runtime client. `useVoiceMode` keeps connection, reconnect, capture, and
  temporary dictation side effects while gateway classification and field
  extraction stay in the runtime client.
- Validation: passed focused voice runtime client, voice mode hook, renderer
  voice boundary, and docs-index tests plus docs search, related commit search,
  stale gateway field scan, docs listing, and diff checks.
- Compatibility: no migration required. `/ws/transcription` URL behavior,
  gateway message shapes, language/start-over payloads, audio framing,
  reconnect timing, transcription callbacks, wakeword IPC, provider policy,
  hosted URLs, permissions, and local-runtime execution behavior are unchanged.

### 2026-06-19 Renderer Responsebox Size Payload Boundary

- Finding: `DesktopResponseOverlayRuntimeClient` owned responsebox IPC channel
  calls and visibility normalization, but response overlay hooks still built
  host-shaped size payloads with `compact_hover`, `turn_ref`,
  `stale_guard_ref`, and `dismissed` fields.
- Change: added a responsebox size payload builder and value-level runtime
  client method. The window-sync and close paths now pass renderer values while
  the runtime client assembles the host IPC payload.
- Validation: passed focused response overlay runtime client, response overlay
  state, renderer chat boundary, and docs-index tests plus docs search, related
  commit search, stale responsebox raw payload scan, docs listing, and diff
  checks.
- Compatibility: no migration required. Responsebox IPC channel names, host
  payload shape, visibility re-report timing, fixed-size/awaiting sizing
  policy, dismissal behavior, storage, provider policy, hosted URLs,
  permissions, and local-runtime execution behavior are unchanged.

### 2026-06-19 Renderer Stream Ingress Value Boundary

- Finding: chat stream ingress orchestration was already centralized in
  `desktopChatStreamIngressRuntime`, but it still read raw SDK
  `event.conversationRef`, `event.turnRef`, and `event.payload.userId` while
  adjacent handlers consumed app-runtime event identity and payload helpers.
- Change: routed ingress conversation identity, turn-map registration, and
  transcript user binding through `desktopChatStreamEventRuntime` and
  `desktopChatStreamEventPayloadRuntime` helper values. Ingress still owns
  fail-safe projection, turn-map, transcript-session, and handler dispatch
  ordering.
- Validation: passed focused ingress runtime, event payload runtime, event
  runtime, renderer chat boundary, and docs-index tests plus docs search,
  related commit search, stale raw ingress field scan, docs listing, and diff
  checks.
- Compatibility: no migration required. SDK conversation-event shape,
  `windie:conversation-event` IPC delivery, transcript session storage, turn
  routing behavior, provider policy, hosted URLs, permissions, and local
  execution behavior are unchanged.

### 2026-06-19 Renderer Stream Event Payload Access Boundary

- Finding: stream payload alias normalization and projection helpers already
  lived in `desktopChatStreamEventPayloadRuntime`, but chat stream feature
  handlers still extracted raw SDK `event.payload` before calling those
  helpers.
- Change: added an event-level payload accessor to the payload runtime and
  routed compaction, local-user, metadata, and terminal handlers through it.
  The handlers keep UI side effects and row updates while the runtime owns raw
  payload access.
- Validation: passed focused payload runtime, chat stream handler, renderer
  chat boundary, and docs-index tests plus docs search, related commit search,
  stale raw payload scan, docs listing, and diff checks.
- Compatibility: no migration required. SDK conversation-event payload shape,
  renderer IPC channel names, transcript storage, provider policy, hosted URLs,
  permissions, and local-runtime execution behavior are unchanged.

### 2026-06-19 Renderer Wakeword Status Value Boundary

- Finding: `desktopVoiceRuntimeClient` owned wakeword bridge IPC, but
  `useWakewordBridgeEvents` still interpreted raw wakeword status event
  `ready` / `error` fields before updating readiness and error UI state.
- Change: added wakeword ready/error value resolvers and
  `onWakewordReadyStatus(...)` to the voice runtime client. The wakeword bridge
  hook now keeps cooldown, detection, local capture error policy, and UI state
  updates while consuming value-level status from the app runtime facade.
- Validation: passed focused desktop voice runtime client, wakeword bridge
  events hook, renderer voice runtime boundary, and docs-index tests plus docs
  search, related commit search, stale raw wakeword status scans, docs listing,
  and diff checks.
- Compatibility: no migration required. Wakeword IPC channel names, raw status
  event payload shape, wakeword enable/disable/audio chunk sends, detection
  cooldown and threshold behavior, local capture error stickiness, settings,
  storage, credentials, permissions, hosted URLs, provider policy, and local
  wakeword service execution behavior are unchanged.

### 2026-06-19 Renderer Stream Event Identity Value Boundary

- Finding: stream event predicates and stale-turn behavior already lived in
  `desktopChatStreamEventRuntime`, but chat stream feature hooks still read
  raw SDK `event.conversationRef` and `event.turnRef` fields while applying
  workspace routing, row targeting, and tracking side effects.
- Change: added normalized conversation and turn identity helpers to the app
  runtime facade, then routed `useChatStream` plus local-user, completion,
  compaction, metadata, and terminal handlers through those helpers. Payload
  projection and handler side effects remain at their existing owners.
- Validation: focused stream event runtime, metadata/compaction handler,
  renderer chat boundary, and docs-index tests passed; docs listing, stale raw
  identity scan, and diff check passed.
- Compatibility: no migration required. SDK conversation-event shape,
  renderer IPC channel names, transcript storage, provider policy, hosted URLs,
  permissions, and local-runtime execution behavior are unchanged.

### 2026-06-19 Renderer Local Runtime Ready Value Boundary

- Finding: `desktopLocalRuntimeStatusRuntimeClient` exposed the shared
  local-runtime status store, but `useDashboardConversations` still read the
  raw status snapshot `ready` field before reloading recent conversations.
- Change: added local-runtime readiness projection and `onReady(...)` helpers
  to `desktopLocalRuntimeStatusRuntimeClient`. The dashboard hook now keeps
  recent-list reload side effects while consuming a value-level ready
  subscription from the runtime client.
- Validation: passed focused local-runtime status runtime client, dashboard
  conversations, renderer chat runtime boundary, and docs-index tests plus docs
  search, related commit search, stale snapshot-ready scans, docs listing, and
  diff checks.
- Compatibility: no migration required. Local-runtime status IPC channels,
  underlying status store snapshots, bootstrap/live-event race behavior,
  dashboard reload timing, SDK conversation list commands, storage, settings,
  credentials, permissions, provider policy, hosted URLs, and local execution
  behavior are unchanged.

### 2026-06-19 Renderer Permission Result Value Boundary

- Finding: `desktopPermissionRuntimeClient` owned permission IPC commands, but
  `permissionStore` still interpreted raw command envelopes before normalizing
  manifest and status state.
- Change: added permission manifest/status/statuses result resolvers and
  value-level runtime client helpers. `permissionStore` now keeps status
  normalization, gate derivation, onboarding persistence, and action errors
  while consuming manifest/status values from the runtime client.
- Validation: passed focused permission runtime client, permission store,
  renderer app-runtime boundary, and docs-index tests plus docs search, related
  commit search, stale envelope-field scans, docs listing, and diff checks.
- Compatibility: no migration required. Permission IPC channel names, raw
  command helpers, manifest/status payload shapes, onboarding storage key,
  gate formulas, permission probing/request behavior, settings, credentials,
  provider policy, hosted URLs, and local execution behavior are unchanged.

### 2026-06-19 Renderer Transparency Content Presentation Boundary

- Finding: `desktopMessageTransparencyRuntime` already owned transparency
  section descriptors, but `TransparencySection` still branched on raw
  `json` / `system-prompt` / `xml` type strings to choose render class,
  string formatting, and JSON pretty-print fallbacks.
- Change: added transparency content presentation and clipboard serialization
  helpers to `desktopMessageTransparencyRuntime`. `TransparencySection` now
  keeps expand/copy UI and metadata rendering while consuming a runtime
  presentation model for content text and CSS class.
- Validation: passed focused message transparency runtime, transparency
  sections, renderer chat runtime boundary, and docs-index tests plus docs
  search, related commit search, stale raw type-branch scans, docs listing, and
  diff checks.
- Compatibility: no migration required. Transparency section order, keys,
  titles, `type` values, metadata display, collapsed/expanded UI behavior,
  copy behavior, CSS class names, IPC, storage, settings, credentials,
  permissions, provider policy, hosted URLs, and local execution behavior are
  unchanged.

### 2026-06-19 Renderer Agent Capability Update Value Boundary

- Finding: `desktopExtensionRuntimeClient` normalized agent capability events,
  but `AgentSettingsTab` still received normalized event objects and read
  `manifestStatus` / `remoteToolCatalog` fields locally.
- Change: added `resolveAgentCapabilityUpdate(...)` and
  `DesktopExtensionRuntimeClient.onAgentCapabilityUpdate(...)` so the runtime
  client emits direct manifest/catalog update values. Agent settings keeps
  extension/tool presentation, display state, and config patch policy.
- Validation: passed focused desktop extension runtime client, agent settings,
  renderer settings runtime boundary, and docs-index tests plus docs search,
  related commit search, stale capability event-field scans, docs listing, and
  diff checks.
- Compatibility: no migration required. Agent capability event channel names,
  normalized full event subscription behavior, extension metadata loading,
  manifest/catalog payload shapes, tool toggle config keys, IPC, storage,
  settings, credentials, permissions, provider policy, hosted URLs, and local
  execution behavior are unchanged.

### 2026-06-19 Renderer Chatbox Visual Anchor Value Boundary

- Finding: the minimal chat pill measured visual-anchor and native-frame sizes,
  but still assembled the `height` / `frameHeight` IPC payload object before
  calling the desktop window runtime client.
- Change: added `buildChatboxVisualAnchorHeightPayload(...)` and
  `DesktopWindowRuntimeClient.setChatboxVisualAnchorHeightValue(...)` so the
  window runtime client owns visual-anchor payload assembly. Minimal pill code
  now keeps measurement, resize scheduling, composer pre-sizing, and collapse
  policy while passing height values to the runtime client.
- Validation: passed focused desktop window runtime client, renderer chat
  runtime boundary, minimal chat pill wiring, and docs-index tests plus docs
  search, related commit search, stale visual-anchor payload scans, docs
  listing, and diff checks.
- Compatibility: no migration required. The `set-chatbox-visual-anchor-height`
  IPC channel, `height` / optional `frameHeight` payload fields, native window
  frame behavior, overlay anchoring, resize timing, hit-test behavior, storage,
  settings, credentials, permissions, provider policy, hosted URLs, and local
  execution behavior are unchanged.

### 2026-06-19 Renderer Workspace Value Boundary

- Finding: `desktopWorkspaceRuntimeClient` already normalized workspace
  selection results and update events, but `ChatInterface` and
  `WorkspaceSettingsTab` still read normalized `workspace` result/event
  envelope fields locally.
- Change: added value-level active-workspace helpers for fetch, granted request,
  selection-update subscription, and active-workspace update subscription.
  Chat and workspace settings now keep refresh, binding, status, and UI state
  policy while consuming workspace values and a picker-selection boolean from
  the runtime client.
- Validation: passed focused desktop workspace runtime client, chat interface
  wiring, settings section, renderer chat/settings runtime boundary, and
  docs-index tests plus docs search, related commit search, stale workspace
  envelope scans, docs listing, and diff checks.
- Compatibility: no migration required. Workspace permission IPC channel names,
  workspace-access event names, existing full selection result APIs, normalized
  update payload shape, conversation workspace bindings, dashboard resume
  workspace restoration, query `workspace_path` forwarding, storage, settings,
  credentials, permissions, provider policy, hosted URLs, and local execution
  behavior are unchanged.

### 2026-06-19 Renderer Dashboard Host Value Boundary

- Finding: `desktopWindowRuntimeClient` and
  `desktopClientSessionRuntimeClient` already normalized dashboard main-window
  target and client-user snapshot payloads, but `DashboardShell` still received
  normalized objects and read `target` / `userId` fields locally.
- Change: changed `DesktopWindowRuntimeClient.onMainWindowOpenTarget(...)` to
  emit the resolved target string and added
  `DesktopClientSessionRuntimeClient.loadMainSessionUserId()` for dashboard
  fallback user state. `DashboardShell` now keeps only wake-up, panel routing,
  recent-list refresh, and fallback state assignment.
- Validation: passed focused desktop window runtime client, desktop client
  session runtime client, dashboard shell, renderer chat runtime boundary, and
  docs-index tests plus docs search, related commit search, stale payload-field
  scans, docs listing, and diff checks.
- Compatibility: no migration required. Main-window open-target event names,
  client-user snapshot command names, full session snapshot behavior, endpoint
  metadata, dashboard panel routing, recent-list loading, IPC, storage,
  settings, credentials, permissions, provider policy, hosted URLs, and local
  execution behavior are unchanged.

### 2026-06-19 Renderer Chat-Loop Observed Transport Connection Boundary

- Finding: `desktopClientSessionRuntimeClient` already filtered IPC status
  snapshots without a boolean connection bit for chat-loop recovery, but
  `useChatLoopUiState` still received and read normalized observed
  `isConnected` status objects.
- Change: replaced the observed status subscription/load API with
  `onObservedIpcTransportConnection(...)` and
  `loadObservedMainTransportConnection(...)`, which emit boolean connectivity
  values only after the runtime client validates that the host snapshot carried
  a real connection field.
- Validation: focused desktop client-session runtime client, chat-loop hook,
  renderer chat runtime boundary, docs-index coverage, stale observed-status
  scans, docs listing, and diff checks.
- Compatibility: no migration required. `get-client-user-id` and `ipc-status`
  channel names, full session snapshots, transport status helper shape,
  disconnect/reconnect behavior, IPC allowlists, storage, settings,
  credentials, permissions, provider policy, hosted URLs, and local execution
  behavior are unchanged.

### 2026-06-19 Renderer MCP Enablement Registry-Or-Error Boundary

- Finding: `desktopMcpRuntimeClient` already normalized MCP enablement results
  away from the main-process `{ success, error, registry }` payload, but
  `McpsSection` still interpreted the normalized `{ ok, errorMessage,
  registry }` envelope in JSX.
- Change: added `resolveDesktopMcpEnablementRegistry(...)` so
  `DesktopMcpRuntimeClient.setMcpServerEnabled(...)` returns a normalized
  registry on success or throws the normalized enablement error. The dashboard
  MCP section now keeps only toggle presentation, registry state, and error
  display.
- Validation: focused MCP runtime client, MCP section, renderer chat runtime
  boundary, and docs-index tests plus docs search, related commit search, stale
  MCP envelope-field scans, and diff checks.
- Compatibility: no migration required. MCP enablement IPC channel names,
  main-process payloads, registry normalization, enablement persistence,
  dashboard rendering, storage, settings, credentials, permissions, provider
  policy, hosted URLs, and local-runtime MCP execution are unchanged.

### 2026-06-19 Renderer Response Overlay Visibility Subscription Boundary

- Finding: `DesktopResponseOverlayRuntimeClient` already normalized
  `response-overlay-visibility` host payloads, but
  `useResponseOverlayWindowSync` still received and inspected the normalized
  payload object shape.
- Change: changed `onResponseOverlayVisibility(...)` to emit a normalized
  boolean visibility value and routed the overlay window-sync hook through that
  boolean so feature code no longer reads the host-event visibility object.
- Validation: focused response-overlay runtime client, chat runtime boundary,
  response overlay state, and docs-index tests plus docs search, related commit
  search, stale payload-field scans, docs listing, and diff checks.
- Compatibility: no migration required. Response-overlay visibility event
  names, responsebox size/hit-test payloads, visibility re-report timing,
  fixed-size/awaiting sizing policy, IPC channels, storage, settings,
  credentials, permissions, provider policy, hosted URLs, and local execution
  behavior are unchanged.

### 2026-06-19 Renderer Thread Presentation Current-Turn Fallback Boundary

- Finding: thread presentation already lived in
  `desktopThreadPresentationRuntime`, but `ChatInterface` still built SDK
  current-turn fallback rows directly through `desktopCurrentTurnMessageRuntime`
  before asking the thread facade to merge visible rows.
- Change: taught `desktopThreadPresentationRuntime` to derive legacy
  projection rows when SDK presentation entries are absent, and removed the
  direct `ChatInterface` import of the lower current-turn row builder.
- Validation: focused message-presentation, app-runtime boundary, and renderer
  chat runtime boundary tests plus docs search, related commit search, stale
  feature import scans, and diff checks.
- Compatibility: no migration required. SDK current-turn projection shape, SDK
  presentation entries, durable transcript rows, insertion/dedupe rules,
  message row shape, IPC, storage, settings, credentials, permissions,
  provider policy, hosted URLs, and local execution behavior are unchanged.

### 2026-06-19 Renderer Thinking Source Badge Presentation Boundary

- Finding: `ThinkingDisplay` already routed source labels through
  `desktopMessageSourceTagRuntime`, but the component still chose the
  `llm-thought` fallback, SDK conversation-event channel, and source badge
  title format locally.
- Change: moved that dev-only thinking badge presentation into
  `resolveThinkingSourceBadgePresentation(...)` in
  `desktopMessageSourceTagRuntime`. The component now owns only status
  normalization, scroll state, dev-UI gating, and JSX rendering.
- Validation: focused thinking display, source tag runtime, renderer chat
  runtime boundary, and docs-index tests plus thinking/source-badge docs search,
  related commit search, stale direct source-label scans, docs listing, and diff
  checks.
- Compatibility: no migration required. Thinking text rendering, scroll
  thresholds, dev-UI query gating, source labels, SDK conversation events, IPC,
  storage, settings, credentials, permissions, provider policy, hosted URLs,
  and local execution behavior are unchanged.

### 2026-06-19 Renderer Stream Sub-Handler Event Predicate Boundary

- Finding: stream dispatcher event identity was already centralized in
  `desktopChatStreamEventRuntime`, but sub-handlers still duplicated raw SDK
  event-type guards for local-user, completion, metadata, and compaction
  side-effect paths.
- Change: added `isTurnCompletedConversationStreamEvent(...)` and
  `isCompactionSkippedConversationStreamEvent(...)`, then routed sub-handler
  fail-fast checks through app-runtime predicates. The handlers still own
  payload projection, chat-store mutation, and replay persistence side effects.
- Validation: focused stream event runtime, metadata/compaction handler, chat
  stream thinking/status, and renderer chat runtime boundary tests plus docs
  search, related commit search, stale raw handler event-type scans, and diff
  checks.
- Compatibility: no migration required. SDK conversation event names, backend
  normalization, stream dispatch ordering, chat-store state shape, transcript
  writes, compaction replay persistence, IPC, storage, settings, credentials,
  permissions, provider policy, hosted URLs, and local execution behavior are
  unchanged.

### 2026-06-19 Renderer Message Source Badge Presentation Boundary

- Finding: source labels and token usage labels were already behind app-runtime
  helpers, but `MessageSourceBadge` still normalized raw `sourceEventType` /
  `sourceChannel` fields and assembled combined badge text/title locally.
- Change: moved that combined dev-badge presentation into
  `resolveMessageSourceBadgePresentation(...)` in
  `desktopMessageSourceTagRuntime`. The component now keeps only dev-UI gating
  and JSX rendering.
- Validation: focused message source badge, source tag runtime, renderer chat
  runtime boundary, and docs-index tests plus source-badge docs search, related
  commit search, stale raw source-field scans, and diff checks.
- Compatibility: no migration required. Message row shape, dev-UI query gating,
  token telemetry labels, source labels, SDK display rows, IPC, storage,
  settings, credentials, permissions, provider policy, hosted URLs, and local
  execution behavior are unchanged.

### 2026-06-19 Renderer Display Projection Annotation Merge Boundary

- Finding: `desktopConversationDisplayProjection` already routed SDK display
  rows through the app-runtime facade, but `useConversationRuntimeProjectionStream`
  still owned renderer-only annotation merge and pending optimistic user-row
  preservation/dedupe logic.
- Change: moved that pure merge rule into
  `mergeRendererAnnotationsIntoSdkMessages(...)` in
  `desktopConversationDisplayProjection`. The hook now keeps subscription,
  current-turn side-effect, and chat-store write orchestration without
  classifying renderer-composed optimistic user rows locally.
- Validation: focused display projection, projection-stream integration, and
  renderer chat runtime boundary tests plus docs search, related commit search,
  stale hook raw optimistic-row scans, and diff checks.
- Compatibility: no migration required. SDK display rows, `windie:rows`,
  pending-turn payloads, renderer annotation fields, chat store state shape,
  IPC, storage, settings, credentials, permissions, provider policy, hosted
  URLs, and local execution behavior are unchanged.

### 2026-06-19 Renderer Conversation Replay Row Selection Boundary

- Finding: `useConversationReplayActions` delegated replay shaping and payload
  preparation to `desktopConversationReplayRuntime`, but still searched raw
  user/assistant rows locally to select edit/resend and retry targets.
- Change: added replay row-index selection helpers to
  `desktopConversationReplayRuntime` and routed edit/resend plus retry
  callbacks through them. The hook still owns UI callbacks, screenshot replay
  state, continuity calls, and prepared-turn dispatch.
- Validation: focused desktop conversation replay runtime, conversation replay
  action, and renderer chat runtime boundary tests plus transcript replay docs
  search, related commit search, stale hook sender-row scans, and diff checks.
- Compatibility: no migration required. Replay command payloads, continuity
  service calls, screenshot refs, SDK display rows, IPC, storage, settings,
  credentials, provider policy, hosted URLs, and local execution behavior are
  unchanged.

### 2026-06-19 SDK API Reference Local-Runtime Process Wording

- Finding: `docs/reference/api_reference.md` correctly split hosted backend
  OCR/vision routes from machine-touching local runtime capabilities, but still
  said SDK consumers should not need to start or spin up a "local backend
  process" for hosted SDK perception routes.
- Change: reworded those SDK API notes to "local runtime process" and extended
  the modular docs boundary guard so SDK/API docs keep hosted helper routes
  separate from local-runtime process terminology without reintroducing public
  local-backend process wording.
- Validation: focused modular docs boundary test plus docs search, related
  commit search, exact stale phrase scan, and diff checks.
- Compatibility: no migration required. Runtime code, hosted SDK route paths,
  API payloads, endpoint selection, local-runtime process behavior, storage,
  settings, credentials, permissions, provider policy, and local execution
  behavior are unchanged.

### 2026-06-19 Renderer Message-List Thinking Auto-Scroll Boundary

- Finding: `useMessageListAutoScroll` delegated general message-list scroll
  rules to `desktopMessageListRuntime`, but still checked raw assistant
  `llm-text` row type locally before auto-scrolling on thinking-text updates.
- Change: moved the same-row assistant thinking-text update predicate into
  `desktopMessageListRuntime` as `shouldAutoScrollForThinkingTextUpdate(...)`.
  The hook now composes runtime predicates for agent-loop and thinking-text
  auto-scroll decisions.
- Validation: focused desktop message-list runtime, message-list scroll
  behavior, and renderer chat runtime boundary tests plus docs search, related
  commit search, stale hook row-type scans, and diff checks.
- Compatibility: no migration required. Message rows, scroll thresholds,
  conversation-switch scroll anchoring, rendered thinking text, IPC, storage,
  settings, credentials, provider policy, hosted URLs, and local execution
  behavior are unchanged.

### 2026-06-19 Renderer Message Content Kind Runtime Boundary

- Finding: `MessageContent` still interpreted raw SDK/display-row message
  types for error, tool call/output, search-source, tool-action summary, and
  assistant LLM-text rows even though related message presentation rules were
  already moving behind app-runtime facades.
- Change: added `desktopMessageContentRuntime` to classify message content
  render kinds and assistant visible-text state, then routed `MessageContent`
  through that runtime so the component stays a React content adapter.
- Validation: focused `DesktopMessageContentRuntime`, `MessageContent`,
  `MessageContentThinking`, and `RendererChatRuntimeBoundary` tests plus stale
  component type-branch scans and diff checks.
- Compatibility: no migration required. SDK display rows, rendered markup,
  screenshot/artifact behavior, IPC, storage, settings, credentials, provider
  policy, hosted URLs, and local execution behavior are unchanged.

### 2026-06-19 Renderer Pending-Turn Broadcast Action Boundary

- Finding: `DesktopConversationRuntimeEventClient` already owned the
  `windie:pending-turn` subscription, but `chatStore` still decoded the raw
  pending-turn replay envelope by checking `source.type === 'clear'` and
  reading `source.pendingTurn`.
- Change: added `resolveDesktopPendingTurnBroadcastAction(...)` to
  `desktopPendingTurnRuntimeClient`, routed `onPendingTurn(...)` through that
  normalizer, and changed `chatStore.applyPendingTurnBroadcast(...)` to consume
  app-runtime pending/clear actions while keeping pending-turn state
  application in the store.
- Validation: focused pending-turn runtime client, conversation runtime event
  client, chat store, pending-turn live surface integration, and renderer chat
  runtime boundary tests plus docs search, related commit search, stale raw
  envelope scans, and diff checks.
- Compatibility: no migration required. The `windie:pending-turn` IPC channel,
  pending/clear payload shapes, replay behavior, optimistic pending-turn UI
  state, storage, settings, credentials, provider policy, hosted URLs, and
  local execution behavior are unchanged.

### 2026-06-19 Renderer Chat-Loop Transport Machine Runtime Boundary

- Finding: docs described the chat-loop disconnect/reconnect reducer as a
  runtime, but `useChatLoopUiState` still owned the reducer, machine event
  vocabulary, and transition rules for transport disconnect recovery.
- Change: moved the chat-loop transport recovery machine into
  `desktopChatLoopUiRuntime` with event factory helpers and a pure
  `reduceChatLoopTransportMachineState(...)`. The hook now owns only runtime
  client subscriptions, snapshot dispatch, watchdog timer wiring, and returned
  presentation transport state.
- Validation: focused chat loop UI runtime, chat loop hook, and renderer chat
  runtime boundary tests plus docs search, related commit search, stale hook
  reducer/event-vocabulary scans, and diff checks.
- Compatibility: no migration required. Loop UI states, disconnect/reconnect
  recovery timing, IPC channel names, session snapshots, storage, settings,
  credentials, provider policy, hosted URLs, and local execution behavior are
  unchanged.

### 2026-06-19 Renderer Response Overlay Row Classification Boundary

- Finding: `useResponseOverlayViewModel` consumed SDK current-turn projection
  rows through app-runtime builders, but still owned raw response-overlay
  visible/progress/source-tagged row-type groups locally.
- Change: added visible-entry, progress-entry, and source-tagged-entry
  predicates to `desktopCurrentTurnMessageRuntime` and routed the overlay view
  model through them. The hook keeps composition, dismissal, tracing, and
  responsebox close orchestration while current-turn message runtime owns row
  classification.
- Validation: focused current turn message runtime and renderer app-runtime
  boundary tests plus response overlay docs search, related commit search,
  stale inline overlay row-type scans, and diff checks.
- Compatibility: no migration required. SDK current-turn projection shape,
  response-overlay visibility, closeability, progress-row display, IPC,
  storage, settings, credentials, provider policy, hosted URLs, and local
  execution behavior are unchanged.

### 2026-06-19 Renderer Stream Dispatch Predicate Boundary

- Finding: after moving supported, tool display-only, compaction, and metadata
  classifications into `desktopChatStreamEventRuntime`, `useChatStream` still
  compared raw SDK event strings for local user rows, terminal errors, and
  usage updates.
- Change: added local user, turn error, and usage update predicates to
  `desktopChatStreamEventRuntime` and routed the hook through them. The feature
  hook no longer performs direct SDK `event.type` comparisons; it maps
  app-runtime predicates to renderer handlers.
- Validation: focused desktop chat stream event runtime and renderer chat
  runtime boundary tests plus docs listing, related commit search, stale inline
  event-type scans, and diff checks.
- Compatibility: no migration required. SDK conversation event names and
  payloads, terminal telemetry behavior, local-user turn seeding, stream
  dispatch behavior, IPC, storage, settings, credentials, provider policy,
  hosted URLs, and local execution behavior are unchanged.

### 2026-06-19 Renderer Metadata Stream Event Classification Boundary

- Finding: `useChatStream` routed supported, tool display-only, and compaction
  stream classifications through `desktopChatStreamEventRuntime`, but still
  compared raw SDK metadata/transparency event strings before choosing the
  metadata handlers.
- Change: added system prompt, user message metadata, assistant message, and
  tool schema metadata predicates to `desktopChatStreamEventRuntime` and routed
  the hook through them. The runtime facade owns metadata event grouping while
  renderer handlers keep payload projection into existing rows.
- Validation: focused desktop chat stream event runtime and renderer chat
  runtime boundary tests plus docs listing, related commit search, stale inline
  metadata event-type scans, and diff checks.
- Compatibility: no migration required. SDK conversation event names and
  payloads, metadata/transparency row projection, stream dispatch behavior,
  IPC, storage, settings, credentials, provider policy, hosted URLs, and local
  execution behavior are unchanged.

### 2026-06-19 Renderer Compaction Stream Event Classification Boundary

- Finding: `useChatStream` used app-runtime helpers for supported stream
  vocabulary and tool display-only events, but still grouped raw SDK compaction
  event strings before choosing start/completed/failed renderer handlers.
- Change: added compaction start, completed, and failed predicates to
  `desktopChatStreamEventRuntime` and routed `useChatStream` through them. The
  runtime facade owns SDK compaction event grouping while the feature hook keeps
  handler orchestration and compaction handlers keep exact payload validation.
- Validation: focused desktop chat stream event runtime and renderer chat
  runtime boundary tests plus docs listing, related commit search, stale inline
  compaction event-type scans, and diff checks.
- Compatibility: no migration required. SDK conversation event names and
  payloads, compaction replay/debug behavior, stream dispatch behavior, IPC,
  storage, settings, credentials, provider policy, hosted URLs, and local
  execution behavior are unchanged.

### 2026-06-19 Renderer Tool Stream Display Classification Boundary

- Finding: `useChatStream` routed general stream vocabulary through
  `desktopChatStreamEventRuntime`, but still carried the raw tool/tool-bundle
  event-type set used to acknowledge SDK tool events without mutating message
  text.
- Change: added `isToolDisplayOnlyConversationStreamEvent` to
  `desktopChatStreamEventRuntime` and routed the hook through it. The runtime
  facade owns tool-display-only event classification while SDK current-turn
  projection remains the display-row owner.
- Validation: focused desktop chat stream event runtime and renderer chat
  runtime boundary tests plus docs search, related commit search, stale inline
  tool event-type scans, and diff checks.
- Compatibility: no migration required. SDK conversation event names and
  payloads, tool display projection, stream dispatch behavior, IPC, storage,
  settings, credentials, provider policy, hosted URLs, and local execution
  behavior are unchanged.

### 2026-06-19 Renderer Send/Stream Runtime Surface Boundary

- Finding: the frontend runtime surface reference still said the renderer owns
  turn-level UI/send/stream behavior, which could read as feature hooks owning
  durable send and stream semantics. `useChatStream` also still carried the
  supported SDK conversation event vocabulary inline before dispatching renderer
  message updates.
- Change: moved supported conversation stream event classification into
  `desktopChatStreamEventRuntime` and rewrote the send/stream section to
  distinguish renderer UI intent and presentation coordination from
  SDK/app-runtime-owned send contracts, stale-turn predicates, event
  normalization, and display projections. Added a modular docs guard for the
  retired broad renderer send/stream ownership phrasing.
- Validation: focused desktop chat stream event runtime, renderer chat runtime
  boundary, and modular docs boundary tests plus docs search, related commit
  search, stale event-type/source-phrase scans, and diff checks.
- Compatibility: no migration required. SDK conversation event names and
  payloads, stream dispatch behavior, IPC, storage, schema, settings,
  credentials, provider policy, hosted URL, and local execution behavior are
  unchanged.

### 2026-06-19 Renderer Stop Target Source Predicate Boundary

- Finding: `useStopTurnHandler` resolved stop targets through
  `desktopStopTurnRuntime`, but still branched on raw `sdk-current-turn` and
  `pending-turn` source strings before current-turn and pending-turn side
  effects.
- Change: added stop-target source predicate helpers to
  `desktopStopTurnRuntime` and routed the hook through them. The runtime facade
  owns source classification; the hook keeps stop orchestration, playback stop,
  pending-turn clear, and SDK stop dispatch.
- Validation: focused desktop stop-turn runtime and renderer chat runtime
  boundary tests plus stale source-string scans, docs listing, and diff checks.
- Compatibility: no migration required. Stop target source values, pending-turn
  clearing, stopped-turn projection, IPC, storage, credentials, provider policy,
  hosted URLs, and local execution behavior are unchanged.

### 2026-06-19 Renderer Feature Import Boundary Guard

- Finding: renderer feature boundary checks covered app-provider, transport,
  and backend-wire escape hatches in targeted tests, but the app-runtime suite
  did not have one feature-source scan that reports the exact forbidden token
  and file when a feature bypasses the app-runtime facade boundary.
- Change: added a shared source-needle offender collector to
  `RendererAppRuntimeBoundary.test.ts` and tightened the renderer feature
  module guard to reject direct app-provider internals, renderer
  infrastructure/IPC symbols, and backend-wire helper imports.
- Validation: focused renderer app-runtime boundary test, docs search, related
  commit search, explicit stale-import scans, and diff checks.
- Compatibility: no migration required. Test-only change; runtime behavior, IPC
  channels, event payloads, storage, settings, credentials, provider policy,
  hosted URLs, and local execution are unchanged.

### 2026-06-19 Renderer Dashboard Conversation Event Action Boundary

- Finding: `useDashboardConversations` subscribed through the conversation
  runtime event client, but still classified raw SDK `user_message` and
  `assistant_message` event type strings before deciding whether to reload
  recent chats or schedule title-visibility polling.
- Change: added recent-conversation event action helpers to
  `desktopDashboardConversationLoadRuntime` and routed the dashboard hook
  through them. The runtime facade owns event classification; the hook keeps
  list state, reload execution, title-poll timers, and open/delete/search side
  effects.
- Validation: focused dashboard conversation load, dashboard hook, and renderer
  app-runtime boundary tests plus stale raw event-type scans, docs listing, and
  diff checks.
- Compatibility: no migration required. SDK conversation event names and
  payload shapes, recent-list reload behavior, title-poll timing, IPC, storage,
  credentials, provider policy, hosted URLs, and local execution behavior are
  unchanged.

### 2026-06-19 Renderer Observed Transport Status Boundary

- Finding: `DesktopClientSessionRuntimeClient` normalized IPC transport status
  snapshots, but `useChatLoopUiState` still checked the normalized
  `hasConnectionState` sentinel before driving disconnect recovery.
- Change: added observed transport-status helpers to the runtime client so it
  filters snapshots without a boolean connection field before the chat loop
  consumes them. The chat hook keeps disconnect/reconnect recovery and watchdog
  state only.
- Validation: focused desktop client session runtime client, chat loop hook,
  and renderer chat runtime boundary tests plus stale sentinel scans, docs
  listing, and diff checks.
- Compatibility: no migration required. Raw `ipc-status` payloads, existing
  transport normalizers, chat loop recovery timing, IPC channel names, storage,
  credentials, provider policy, hosted URLs, and local execution behavior are
  unchanged.

### 2026-06-19 Renderer Agent Capability Event Classification Boundary

- Finding: `desktopExtensionRuntimeClient` normalized agent capability event
  payloads, but `AgentSettingsTab` still branched on raw
  `client-tool-manifest` and `remote-tool-catalog` event type strings before
  consuming normalized manifest/catalog fields.
- Change: routed the settings tab through normalized `manifestStatus` and
  `remoteToolCatalog` fields only. The extension runtime client owns event
  type classification while settings keeps presentation state, tool-toggle
  projection, and config patches.
- Validation: focused desktop extension runtime client and renderer settings
  runtime boundary tests, docs search, related commit search, stale raw
  event-type scan, and diff checks.
- Compatibility: no migration required. Capability event names, payload shapes,
  extension metadata loading, settings UI behavior, config storage, IPC,
  credentials, provider policy, hosted URLs, and local execution behavior are
  unchanged.

### 2026-06-19 Renderer Workspace Picker Source Classification Boundary

- Finding: `DesktopWorkspaceRuntimeClient` normalized workspace update
  selections, but `ChatInterface` still inspected the raw host source string
  `workspace_picker` before deciding whether the update should start a
  workspace-bound new chat.
- Change: added `isWorkspacePickerSelection` to the normalized workspace update
  payload and routed chat through that flag. The runtime client owns source
  classification while chat keeps active-workspace refresh, binding comparison,
  and new-chat policy.
- Validation: focused desktop workspace runtime client, renderer chat runtime
  boundary, and chat interface wiring tests plus stale raw source-string scans,
  docs listing, and diff checks.
- Compatibility: no migration required. Workspace update event names, raw
  source strings, active workspace selection, conversation binding behavior,
  IPC, storage, credentials, provider policy, hosted URLs, and local execution
  behavior are unchanged.

### 2026-06-19 Process Lifecycle Sidecar Daemon Ownership Wording

- Finding: the local-runtime process lifecycle workflow still said the sidecar
  daemon owned the app-session `LocalRuntimeService`, `/rpc` endpoint, local
  tools, memory, and chat-event storage.
- Change: reworded the source-of-truth row so the sidecar daemon hosts the
  app-session `LocalRuntimeService` implementation, local-tool handlers, memory
  handlers, and chat-event storage behind SDK local-runtime ownership.
- Validation: focused modular docs boundary guard, docs search, related commit
  search, exact stale lifecycle owner sentence scan, and diff checks.
- Compatibility: no migration required. Documentation only; runtime behavior,
  IPC, storage, schemas, credentials, provider policy, hosted URLs, and local
  execution behavior are unchanged.

### 2026-06-19 Runtime Nodes Local-Runtime Implementation Boundary

- Finding: the runtime node hub, matrix, and current-vs-future page still
  described the Python sidecar node as owning local executable tools, local
  memory, system state, browser/computer/filesystem actions, and JSON-RPC
  methods.
- Change: relabeled those node docs to describe a local-runtime implementation
  node backed by the Python sidecar subprocess, with SDK/main local runtime
  named as the owner of local executable authority.
- Validation: focused modular docs boundary guard, docs listing, exact stale
  node-owner phrase scan, and diff checks.
- Compatibility: no migration required. Documentation only; runtime behavior,
  IPC, storage, schemas, credentials, provider policy, hosted URLs, and local
  execution behavior are unchanged.

### 2026-06-19 Renderer Dashboard Layout Pulse Runtime Boundary

- Finding: `DashboardShell` still constructed and dispatched the renderer-only
  browser `resize` pulse directly when waking the dashboard from
  `main-window-open-target`, leaving layout observer event timing inside the
  feature component.
- Change: added `desktopDashboardLayoutRuntime.requestDashboardLayoutPass(...)`
  for the resize pulse and routed dashboard wake-up through that helper.
  `DashboardShell` keeps animation state and target routing.
- Validation: focused desktop dashboard layout runtime, dashboard shell, and
  renderer app-runtime boundary tests plus stale direct resize-dispatch scans,
  docs search/history checks, and diff checks.
- Compatibility: no migration required. Dashboard reopen animation timing,
  resize event behavior, main-window target routing, IPC, storage, credentials,
  provider policy, hosted URLs, and local execution behavior are unchanged.

### 2026-06-19 Renderer Desktop New-Chat Event Helper Runtime Boundary

- Finding: `DashboardShell` constructed the renderer-only
  `desktop-runtime:new-chat` browser event directly while
  `useChatInterfaceBindings` subscribed to the same custom event directly,
  leaving the global event wiring split across feature modules.
- Change: added `dispatchDesktopRuntimeNewChatEvent(...)` and
  `subscribeDesktopRuntimeNewChatEvent(...)` to `desktopChatEvents`, then
  routed the dashboard sender and chat hook receiver through those helpers.
- Validation: focused desktop chat event, chat interface wiring, dashboard
  shell, and renderer app-runtime boundary tests plus stale direct event wiring
  scans, docs search/history checks, and diff checks.
- Compatibility: no migration required. The `desktop-runtime:new-chat` event
  name, chat reset behavior, transcript/session updates, IPC, storage,
  credentials, provider policy, hosted URLs, and local execution behavior are
  unchanged.

### 2026-06-19 SDK Agent Runtime Transport Error Wording

- Finding: SDK continuity rehydrate and conversation model-setting failures
  still said they required a backend transport, even though
  `AgentRuntimeTransport` is the canonical reusable injection type.
- Change: updated TypeScript source and CJS parity to report missing agent
  runtime transport, refreshed continuity tests and SDK package-boundary guards,
  and aligned the conversation runtime docs flow.
- Validation: focused conversation continuity service, SDK package-boundary, and
  conversation runtime tests plus stale error-message scans, docs listing, and
  diff checks.
- Compatibility: no migration required. Public transport types, backend
  websocket behavior, rehydrate payload shape, model settings updates, IPC,
  storage, credentials, provider policy, hosted URLs, and local execution
  behavior are unchanged.

### 2026-06-19 Renderer Continuity Search Metadata Projection Runtime Boundary

- Finding: `DesktopConversationContinuityService.searchConversations(...)`
  still carried a private SDK metadata to dashboard row mapper after the
  dashboard recent loader and conversation library client moved to the shared
  load-runtime projection.
- Change: routed continuity search results through
  `DesktopDashboardConversationLoadRuntime.metadataListToDashboardConversations(...)`
  and deleted the local mapper from the continuity service.
- Validation: focused desktop continuity service, dashboard conversation load,
  and renderer app-runtime boundary tests plus stale mapper scans, docs
  search/history checks, and diff checks.
- Compatibility: no migration required. SDK conversation metadata shapes,
  dashboard row fields, IPC command payloads, storage, credentials, provider
  policy, hosted URLs, and local execution behavior are unchanged.

### 2026-06-19 Main Conversation Metadata Diagnostics Runtime Boundary

- Finding: `ipc_agent_sdk_command_handlers.cjs` still built app diagnostic
  context and conversation metadata-list event envelopes inline while the
  command handler should keep SDK command orchestration and stage selection.
- Change: added `ipc_conversation_metadata_diagnostics_runtime.cjs` for
  `normalizeAppDiagnosticContext(...)` and
  `recordConversationMetadataListDiagnostic(...)`, then routed conversations
  list handling and renderer diagnostics append through that helper.
- Validation: focused IPC conversation metadata diagnostics runtime and main
  SDK runtime boundary tests, docs listing, stale inline helper scan, and diff
  checks.
- Compatibility: no migration required. Diagnostic path names, trace/request
  propagation, conversations.list behavior, SDK command payloads, IPC, storage,
  credentials, provider policy, hosted URLs, and local execution behavior are
  unchanged.

### 2026-06-19 Renderer Dashboard Conversation Metadata Projection Runtime Boundary

- Finding: recent conversation loading in `useDashboardConversations` rebuilt
  dashboard row fields from SDK `ConversationMetadata` while
  `DesktopConversationLibraryClient.searchConversations(...)` carried a
  parallel private mapper for the same row shape.
- Change: moved dashboard row projection into
  `desktopDashboardConversationLoadRuntime` as
  `metadataToDashboardConversation(...)` and
  `metadataListToDashboardConversations(...)`. Recent loading and search now
  share the same app-runtime mapper; the hook keeps request lifecycle, stale
  response suppression, title polling, and UI state.
- Validation: focused dashboard conversation load, conversation library client,
  dashboard hook, and renderer app-runtime boundary tests plus stale dashboard
  metadata mapper scans, docs search/history checks, and diff checks.
- Compatibility: no migration required. SDK conversation metadata shapes,
  dashboard recent/search row shapes, IPC, storage, credentials, provider
  policy, hosted URLs, and local execution behavior are unchanged.

### 2026-06-19 Main Workspace Path Runtime Boundary

- Finding: `ipc.cjs` still resolved Agent SDK workspace paths by reading
  command payload `workspace_path` / `workspacePath` and cached desktop UI
  config fields inline before SDK startup and conversation commands consumed
  them.
- Change: added `ipc_workspace_path_runtime.cjs` for workspace-path fallback
  resolution and routed `ipc.cjs` through `resolveWorkspacePathForAgentPayload(...)`.
  The relay root keeps latest config state, SDK startup, command dependency
  injection, and repo-instruction orchestration.
- Validation: focused IPC workspace path runtime and main SDK runtime boundary
  tests, stale inline workspace-payload scan, docs listing, and diff checks.
- Compatibility: no migration required. Accepted workspace payload aliases,
  cached config fallback behavior, SDK startup, conversation command routing,
  AGENTS.md lookup, IPC, storage, credentials, provider policy, hosted URLs, and
  local execution behavior are unchanged.

### 2026-06-19 Main Conversation Terminal Status Runtime Boundary

- Finding: `ipc.cjs` subscribed to SDK conversation runtime events, but still
  owned terminal event-to-renderer status projection inline, including direct
  `event.payload.error` interpretation for runtime error statuses.
- Change: added `ipc_conversation_status_runtime.cjs` for terminal status
  projection and routed `ipc.cjs` through `buildConversationTerminalStatus(...)`.
  The relay root keeps subscription, current-turn fan-out, replay clearing, and
  renderer status broadcast orchestration.
- Validation: focused IPC conversation status runtime and main SDK runtime
  boundary tests, stale inline error-payload scan, docs listing, and diff
  checks.
- Compatibility: no migration required. SDK conversation event shapes,
  renderer status payloads, websocket behavior, IPC channels, storage,
  credentials, provider policy, hosted URLs, and local execution behavior are
  unchanged.

### 2026-06-19 Renderer Conversation Replay Prepared-Turn Runtime Boundary

- Finding: `useConversationReplayActions` still built replay preparation
  payloads and prepared desktop chat turn objects directly, including
  `screenshot_ref`, `screenshot_url`, `screenshot_refs`, and
  `attachment_filenames` payload fields, while replay pairing was already owned
  by `desktopConversationReplayRuntime`.
- Change: moved replay preparation payload construction and prepared replay
  desktop chat turn shaping into `desktopConversationReplayRuntime` as
  `buildReplayPreparationPayload(...)` and
  `buildPreparedReplayDesktopChatTurn(...)`. The replay hook keeps message
  selection, conversation/session selection, continuity calls, and dispatch.
- Validation: focused desktop conversation replay runtime, conversation replay
  actions, conversation replay database integration, and renderer chat runtime
  boundary tests plus stale snake-case replay payload scans, docs search/history
  checks, and diff checks.
- Compatibility: no migration required. Replay behavior, continuity rewrite
  payloads, prepared send fields, IPC, storage, credentials, provider policy,
  hosted URLs, and local execution behavior are unchanged.

### 2026-06-19 Renderer Compaction Failure Error Payload Runtime Boundary

- Finding: `useChatStreamCompactionHandlers` still read
  `event.payload.error` locally for compaction failure status text while
  adjacent compaction payload parsing lived in `desktopChatStreamEventPayloadRuntime`.
- Change: moved compaction failure error-text normalization into
  `desktopChatStreamEventPayloadRuntime` as `resolveCompactionErrorText(...)`.
  The compaction hook keeps lifecycle state, debug state, replay persistence,
  and tracking side effects.
- Validation: focused chat stream payload runtime and renderer chat runtime
  boundary tests, stale compaction error payload scan, docs listing, and diff
  checks.
- Compatibility: no migration required. `compaction_failed` event payloads,
  compaction thinking-status behavior, replay persistence, tracking events,
  IPC, storage, credentials, provider policy, hosted URLs, and local execution
  behavior are unchanged.

### 2026-06-19 Renderer Local-User Stream Payload Runtime Boundary

- Finding: `useChatStreamLocalUserHandler` consumed SDK `user_message` text
  aliases directly from `event.payload`, even though adjacent stream payload
  alias handling already lived in `desktopChatStreamEventPayloadRuntime`.
- Change: moved local-user `text`/`content` alias normalization into
  `desktopChatStreamEventPayloadRuntime` as `resolveLocalUserMessageText(...)`.
  The local-user handler now keeps only model-context capture, thinking-status
  clearing, and tracking side effects.
- Validation: focused desktop chat stream payload runtime and renderer chat
  runtime boundary tests, stale local-user raw-payload scan, docs listing, and
  diff checks.
- Compatibility: no migration required. SDK `user_message` payload shapes,
  text/content alias acceptance, conversation event channel names,
  transcript/session state, IPC, storage, credentials, provider policy, hosted
  URLs, and local execution behavior are unchanged.

### 2026-06-19 Renderer Conversation Projection Event Runtime Boundary

- Finding: `useConversationRuntimeProjectionStream` subscribed through
  `DesktopConversationRuntimeEventClient`, but still owned SDK current-turn and
  display-row payload validation plus conversation-ref extraction locally.
- Change: moved current-turn envelope and display-row projection normalization
  into `desktopConversationRuntimeEventClient` as explicit projection event
  subscriptions. The chat hook now keeps stale-turn policy, projection side
  effects, annotation merging, and store updates.
- Validation: focused desktop conversation runtime event client, conversation
  projection stream, and renderer chat runtime boundary tests, stale projection
  payload guard scan, docs listing, and diff checks.
- Compatibility: no migration required. Conversation runtime fan-out channel
  names, current-turn and display-row payload shapes, SDK projection contracts,
  chat-store merging behavior, IPC, storage, credentials, provider policy,
  hosted URLs, and local execution behavior are unchanged.

### 2026-06-19 Renderer MCP Enablement Result Runtime Boundary

- Finding: `McpsSection` consumed normalized MCP registries from
  `DesktopMcpRuntimeClient`, but still interpreted the main-process
  enablement result envelope fields `success` and `error` locally.
- Change: moved MCP enablement result projection into
  `desktopMcpRuntimeClient` as `{ ok, errorMessage, registry }`, leaving the
  dashboard section to display the normalized error message and registry state.
- Validation: focused desktop MCP runtime client, MCP dashboard section, and
  renderer chat runtime boundary tests, stale MCP result envelope scan, docs
  listing, and diff checks.
- Compatibility: no migration required. MCP enablement IPC channel names,
  main-process `{ success, error, registry }` payloads, registry normalization,
  config persistence, dashboard toggle behavior, storage, credentials,
  provider policy, hosted URLs, and local-runtime MCP execution are unchanged.

### 2026-06-19 Renderer Chat-Loop Transport Status Runtime Boundary

- Finding: `useChatLoopUiState` already routed session/status IPC through
  `DesktopClientSessionRuntimeClient`, but it still consumed the client/session
  snapshot shape directly when deciding whether a transport status payload
  contained a valid connection bit.
- Change: added a normalized transport-status view to
  `desktopClientSessionRuntimeClient` so chat-loop recovery consumes
  `{ isConnected, hasConnectionState }` from `onIpcTransportStatus(...)` and
  `loadMainTransportStatus(...)`. The hook now keeps only disconnect recovery
  and watchdog state.
- Validation: focused desktop client-session runtime client, chat loop UI state
  hook, and renderer chat runtime boundary tests, stale raw connection payload
  scan, docs listing, and diff checks.
- Compatibility: no migration required. `get-client-user-id` and `ipc-status`
  channel names, full session snapshot payloads, endpoint metadata,
  disconnect/reconnect behavior, IPC allowlists, storage, credentials,
  provider policy, hosted URLs, and local execution behavior are unchanged.

### 2026-06-19 Renderer Response Overlay Visibility Runtime Boundary

- Finding: `useResponseOverlayWindowSync` routed visibility fan-out through
  `DesktopResponseOverlayRuntimeClient` but still interpreted the raw host
  event visibility field shape locally.
- Change: added response-overlay visibility payload normalization to
  `desktopResponseOverlayRuntimeClient` so window-sync hooks receive normalized
  visibility state and keep only sizing, re-report, and cached-frame policy.
- Validation: focused desktop response overlay runtime client and renderer chat
  runtime boundary tests, stale optional visibility payload scan, docs listing,
  and diff checks.
- Compatibility: no migration required. Response-overlay visibility event
  names, responsebox size/hit-test payloads, visibility re-report timing,
  fixed-size/awaiting sizing policy, IPC, storage, credentials, provider
  policy, hosted URLs, and local execution behavior are unchanged.

### 2026-06-19 Renderer Dashboard Host Payload Runtime Boundary

- Finding: `DashboardShell` still parsed raw main-window open-target payloads
  and trimmed startup client-session snapshot user ids locally, even though
  `DesktopWindowRuntimeClient` and `DesktopClientSessionRuntimeClient` already
  owned the desktop host event/snapshot boundaries.
- Change: added normalized open-target payloads in
  `desktopWindowRuntimeClient` and normalized client-session snapshots in
  `desktopClientSessionRuntimeClient`. DashboardShell now keeps only panel
  routing and snapshot state updates while consuming normalized runtime values.
- Validation: focused desktop window runtime client, desktop client-session
  runtime client, dashboard shell, and renderer chat runtime boundary tests,
  stale dashboard raw-payload scan, docs listing, and diff checks.
- Compatibility: no migration required. Main-window target channel names,
  accepted target strings, startup session snapshot fields, endpoint metadata,
  dashboard routing behavior, IPC, storage, credentials, provider policy,
  hosted URLs, and local execution behavior are unchanged.

### 2026-06-19 Renderer Settings Status Event Runtime Boundary

- Finding: `AppStatusProvider` still inspected the raw settings-event error
  payload message to decide whether a backend `error` represented a settings
  save failure, even though `DesktopAppConfigRuntimeClient` already owned
  settings-event fan-out for app-level providers.
- Change: added a shared `desktopSettingsUpdateErrorRuntime` classifier plus
  normalized settings-event projection in `desktopAppConfigRuntimeClient` so
  provider listeners receive `isSettingsUpdateError` from the app-runtime
  client. `AppStatusProvider` now keeps only save-status state transitions and
  no longer parses host-shaped settings error payloads; chat stream error
  suppression uses the same classifier.
- Validation: focused desktop settings-update classifier, desktop app-config
  runtime client, app status provider, renderer settings boundary, and chat
  stream payload runtime tests, stale provider error-string scan, docs listing,
  and diff checks.
- Compatibility: no migration required. Settings event channel names, backend
  error text, save-status UI timing, config persistence, IPC, storage,
  credentials, provider policy, hosted URLs, and local execution behavior are
  unchanged.

### 2026-06-19 Renderer Workspace Access Update Runtime Payload Boundary

- Finding: chat and workspace settings still parsed live
  `workspace-access-updated` payload fields such as `workspaceName` and
  `workspacePath` locally, even though `DesktopWorkspaceRuntimeClient` already
  owned workspace selection IPC and fetch/request normalization.
- Change: added `normalizeWorkspaceAccessUpdatedPayload` to the workspace
  runtime client and made the subscription emit normalized workspace selections
  with compatibility fields preserved. Chat and workspace settings now consume
  the normalized workspace selection instead of parsing host-shaped event
  fields.
- Validation: focused desktop workspace runtime client, chat boundary, and
  renderer settings boundary tests, stale workspace live-payload scan, docs
  listing, and diff checks.
- Compatibility: no migration required. Workspace event channel names,
  workspace permission state, active workspace selection behavior, conversation
  workspace bindings, settings UI, chat UI, storage, credentials, provider
  policy, hosted URLs, and local execution behavior are unchanged.

### 2026-06-19 Renderer Agent Settings Extension Runtime Payload Boundary

- Finding: `AgentSettingsTab` still normalized desktop extension metadata and
  capability-event payload arrays such as `plugins`, `mcps`, `accepted`,
  `rejected`, and `remote_tools` even though `DesktopExtensionRuntimeClient`
  owned the app-runtime channel boundary.
- Change: moved extension runtime snapshot normalization, empty defaults,
  client tool-manifest status normalization, and remote tool-catalog
  normalization into `desktopExtensionRuntimeClient`. The agent settings tab now
  consumes normalized extension runtime values and keeps presentation plus
  config patching local.
- Validation: focused desktop extension runtime client, agent settings tab, and
  renderer settings boundary tests, stale agent-settings raw-payload scan,
  docs listing, and diff checks.
- Compatibility: no migration required. Extension metadata payloads,
  capability event names, settings storage, tool toggle behavior, IPC channel
  names, credentials, provider policy, hosted URLs, storage, and local-runtime
  extension/MCP execution behavior are unchanged.

### 2026-06-19 SDK Runtime Transport Factory Boundary

- Finding: `AgentRuntimeTransport` was already the canonical conversation
  runtime transport type, but the SDK's primary factory and internal
  `Agent.conversation(...)` path still used the backend-named
  `createAgentBackendTransport` helper.
- Change: added `createAgentRuntimeTransport` as the primary factory, routed
  SDK internals and focused tests through it, and kept
  `createAgentBackendTransport` as a compatibility alias for existing SDK
  callers.
- Validation: focused SDK package/client tests, docs listing, checked-in CJS
  syntax checks, active-runtime stale factory scan, and diff checks.
- Compatibility: no migration required. The compatibility export remains;
  websocket payloads, hosted backend URLs, AgentSession framing, conversation
  transport behavior, storage, credentials, provider policy, local-runtime
  execution, and renderer IPC are unchanged.

### 2026-06-19 Renderer Dashboard MCP Registry Runtime Boundary

- Finding: `McpsSection` still normalized Electron-main MCP registry payload
  fields such as `mcp_errors` and `enabled_mcp_servers` even though
  `DesktopMcpRuntimeClient` already owned the dashboard MCP command boundary.
- Change: moved MCP registry normalization, empty registry defaults, and nested
  enablement-result registry normalization into `desktopMcpRuntimeClient`,
  leaving the dashboard MCP section to handle loading, toggle presentation, and
  user-visible errors from normalized registry objects.
- Validation: focused MCP runtime client, MCP section, renderer chat runtime
  boundary tests, stale MCP section registry-field scan, docs listing, and diff
  checks.
- Compatibility: no migration required. MCP registry payloads, enablement
  persistence, discovery refresh behavior, dashboard rendering, IPC channel
  names, credentials, provider policy, storage, hosted URLs, and local-runtime
  MCP execution behavior are unchanged.

### 2026-06-19 Renderer Terminal Stream Payload Runtime Boundary

- Finding: the terminal chat stream hook still parsed backend-wire token-count
  fields and terminal error payload fields locally, while adjacent stream
  payload normalization had moved behind `desktopChatStreamEventPayloadRuntime`.
- Change: moved token-count filtering, usage/cache enum validation,
  nullable/finite number handling, and terminal error payload shaping into the
  app runtime payload facade. The terminal hook now asks the runtime helper for
  normalized token counts or error payloads before coordinating chat-store side
  effects.
- Validation: focused payload-runtime and renderer chat runtime boundary tests,
  terminal-hook stale-field scan, and diff checks.
- Compatibility: no migration required. Token-count event fields, error event
  fields, chat-store updates, stream tracking, transcript rows, IPC, backend
  websocket events, credentials, provider policy, storage, hosted URLs, and
  local execution behavior are unchanged.

### 2026-06-19 Bundled Python Runtime Label Boundary

- Finding: CLI, install, operations, platform, development, and local-runtime
  lifecycle docs still described packaged runtime artifacts with sidecar-runtime
  owner labels even though the active packaging boundary is the bundled Python
  runtime and SDK-owned local-runtime daemon lifecycle. The
  `<windie> build sidecar-runtime` command name remains a concrete CLI id.
- Change: relabeled the affected prose to bundled Python runtime,
  local-runtime daemon, and local-runtime smoke wording while preserving command
  names, script paths, Python sidecar daemon implementation details, and
  historical file paths. The modular boundary guard now rejects the retired
  active-doc labels.
- Validation: focused modular boundary test, docs listing, exact retired-label
  scan, and diff checks.
- Compatibility: no migration required. Packaging scripts, runtime resource
  paths, CLI command ids, package smoke behavior, local-runtime launch,
  credentials, provider policy, hosted URLs, storage, and payload shapes are
  unchanged.

### 2026-06-19 Renderer Chat Stream Payload Runtime Boundary

- Finding: chat-stream compaction handlers and metadata handlers still owned
  backend-wire alias parsing for compaction debug/replay payloads and
  `toolSchemas`/`tool_schemas` metadata, even though those shapes are shared
  event-payload normalization rather than hook presentation policy.
- Change: moved compaction debug info, compacted replay snapshot construction,
  compaction skipped/user id parsing, replacement-history extraction, and
  tool-schema metadata alias normalization into
  `desktopChatStreamEventPayloadRuntime`, leaving the chat hooks to coordinate
  side effects and UI updates through app-runtime helpers.
- Validation: focused payload-runtime, compaction-handler, metadata-handler,
  renderer chat runtime boundary tests, and diff checks.
- Compatibility: no migration required. Compaction event payloads, replay
  storage shape, metadata updates, stream tracking, IPC, backend websocket
  events, credentials, provider policy, storage, hosted URLs, and local
  execution behavior are unchanged.

### 2026-06-19 SDK Example Product-Label Boundary

- Finding: runnable SDK examples and the shared local SDK loader still used
  Windie SDK, Windie agent, and Windie local labels for reusable custom UI,
  CLI, module-tool, plugin, and local loader surfaces.
- Change: renamed the example helper exports to `buildLocalAgentSdk` and
  `loadLocalAgentSdk`, updated example copy and smoke checks to Agent SDK
  wording, and kept the package path/name unchanged for compatibility with the
  current repository layout. The modular boundary guard now reads the runnable
  example set and rejects the retired product-shaped SDK example labels.
- Validation: focused modular boundary test, stale example-label scan, and diff
  checks.
- Compatibility: no migration required for shipped runtime behavior. These are
  runnable repository examples and test/docs labels only; SDK package exports,
  backend routes, websocket payloads, local-runtime startup, plugin manifests,
  credentials, storage, provider policy, and hosted URLs are unchanged.

### 2026-06-19 Browser Runtime Label Boundary

- Finding: browser action/runtime docs still used focused product-skinned
  dedicated-browser labels and sidecar-as-browser-runtime wording in public
  action, control, permission warm-up, tool, tool-catalog, and Browser Use
  adapter references.
- Change: reworded those references through local-runtime dispatch, controlled
  browser session, dedicated browser runtime, local-runtime Python entrypoint,
  and local-runtime result labels. Extended the modular docs guard to read the
  affected browser pages and reject the retired focused labels.
- Validation: focused modular boundary test, docs listing, retired
  browser-label scan, and diff checks.
- Compatibility: no migration required. Browser action names, Browser Use
  behavior, CDP port/profile policy, permission request flow, tool schemas,
  local-runtime dispatch, IPC, credentials, provider policy, storage, hosted
  URLs, and payload shapes are unchanged.

### 2026-06-19 Renderer Settings Ownership Shorthand Boundary

- Finding: the settings surface workflow still used the shorthand
  `local-runtime-owned` checklist label, which compressed the owner decision
  into a badge instead of explaining the local-runtime setting path.
- Change: rewrote the checklist item as explicit local-runtime setting
  ownership prose and guarded the renderer settings docs against the shorthand.
- Validation: focused modular boundary test, stale shorthand scan, and diff
  checks.
- Compatibility: no migration required. Settings schemas, renderer state,
  backend patch allowlists, local-runtime launch env, JSON-RPC actions, IPC,
  credentials, provider policy, storage, hosted URLs, and payload shapes are
  unchanged.

### 2026-06-19 Local-Runtime Sidecar Owner-Label Boundary

- Finding: active browser, tool, backend parity, overlay, inventory, planning,
  development, and packaging reference docs still exposed "local-runtime
  sidecar" as a reusable owner label after newer goal guidance separated
  local-runtime contracts from the Python sidecar implementation process.
- Change: reworded those active docs to local-runtime ownership labels and
  Python sidecar implementation wording only where the concrete daemon,
  manifest, registry, stderr logs, or executor is the debug target. The modular
  docs guard now rejects the mixed owner labels in active docs while excluding
  historical plan-report text from that active-doc rule.
- Validation: focused modular boundary test, docs listing, stale active-label
  scan, and diff checks.
- Compatibility: no migration required. Local tool execution, browser adapter
  behavior, registry exposure, manifest generation, packaging paths, IPC,
  credentials, permissions, provider policy, backend APIs, storage, hosted
  URLs, and payload shapes are unchanged.

### 2026-06-19 Sidecar-Backed Tool Section Label Boundary

- Local-tool channels, browser automation stack, Python sidecar/memory,
  configuration reference docs, docs search results, and recent local-runtime
  label commits were inspected after the JSON-RPC public channel slice.
- Finding: active local-tool channel, browser automation, Python sidecar/memory,
  and configuration reference docs still exposed Sidecar Tool/Runtime headings
  or link labels for reusable local-runtime implementation surfaces.
- Change: relabeled those headings and hub links to local-runtime implementation
  wording while retaining Python sidecar wording for concrete daemon,
  JSON-RPC, registry, and protocol references, and extended the modular docs
  guard for the retired public labels.
- Validation: focused modular boundary test, docs listing, stale label scan,
  and diff checks.
- Compatibility: no migration required. Browser tool behavior, registry
  behavior, JSON-RPC methods, local memory, packaging paths, IPC, credentials,
  provider policy, backend APIs, storage, and hosted URLs are unchanged.

### 2026-06-19 Local-Runtime JSON-RPC Public Channel Boundary

- Channel routing, runtime-node, agent-visible pipeline, docs hub, browser
  backend reference docs, docs search results, and recent sidecar/local-runtime
  docs commits were inspected after the architecture local-runtime tool
  ownership slice.
- Finding: public channel, node, architecture-pipeline, docs hub, and browser
  reference labels still exposed sidecar JSON-RPC as the reusable channel name,
  and the desktop node lifecycle diagram still showed renderer-initiated local
  tool execution instead of SDK/main local-runtime coordination.
- Change: relabeled those first-read public routing surfaces to local-runtime
  JSON-RPC, kept Python sidecar JSON-RPC wording where it names the concrete
  implementation protocol, refreshed the desktop-node local tool lifecycle to
  SDK/main execution plus renderer SDK projections, and guarded the retired
  public labels.
- Validation: focused modular boundary test, docs listing, stale public-label
  scan, and diff checks.
- Compatibility: no migration required. JSON-RPC method names, payload shapes,
  IPC channels, SDK local-runtime execution, Python sidecar behavior, backend
  tool-result ingress, credentials, provider policy, storage, and hosted URLs
  are unchanged.

### 2026-06-19 Architecture Local-Runtime Tool Ownership Boundary

- Architecture agent-system, backend-architecture, and tool-system docs, docs
  search results, and recent local-runtime tool-dispatch commits were
  inspected after the renderer permission platform-code label slice.
- Finding: high-level architecture docs still described backend waiting,
  local-machine execution, provider routing, and built-in tool registration
  through sidecar-as-owner wording, even though current ownership routes those
  contracts through SDK/main local-runtime dispatch and local-runtime
  executable ownership backed by the Python sidecar implementation.
- Change: reworded those architecture docs to SDK/main local-runtime dispatch,
  local-runtime/provider routes, local-runtime boundary ownership, and Python
  sidecar registry wiring where implementation detail matters. Extended the
  modular boundary guard to read the affected architecture pages and reject the
  retired sidecar-as-owner phrases.
- Validation: focused modular boundary test, docs listing, stale phrase scan,
  and diff checks.
- Compatibility: no migration required. Backend tool waiting, local execution,
  built-in tool registration, Python sidecar registry behavior, IPC,
  credentials, provider policy, backend APIs, storage, and tool-result payloads
  are unchanged.

### 2026-06-19 Renderer Permission Platform-Code Label Boundary

- Renderer state workflow docs, docs search results, and recent renderer
  permission runtime commits were inspected after the platform adapter
  local-runtime label slice.
- Finding: the renderer state workflow still described permission platform
  probing as Electron main/sidecar platform code even though reusable platform
  authority now routes through Electron main and local-runtime platform code.
- Change: reworded the renderer checklist to Electron main plus local-runtime
  platform code and extended the modular stale-doc guard for the retired
  sidecar platform-code phrase.
- Validation: focused modular boundary test, docs listing, stale phrase scan,
  and diff checks.
- Compatibility: no migration required. Renderer state, permission probing,
  platform adapters, IPC, credentials, provider policy, backend APIs, storage,
  and local execution are unchanged.

### 2026-06-19 Platform Adapter Local-Runtime Label Boundary

- Security permission authority docs, platform hub docs, Windows platform docs,
  docs search results, and recent platform-authority commits were inspected
  after the desktop permission runtime-facade docs slice.
- Finding: active security/platform docs still used sidecar platform adapter
  labels even though current platform authority guidance routes reusable
  ownership through Electron main, local-runtime platform adapters, permission
  services, and packaging scripts.
- Change: reworded those active docs to local-runtime platform adapters while
  preserving concrete Python sidecar implementation paths, and extended the
  modular guard to read the platform hub, Windows page, and permission
  authority workflow.
- Validation: focused modular boundary test, docs listing, stale phrase scan,
  and diff checks.
- Compatibility: no migration required. Platform adapters, permission behavior,
  input/window actions, screenshot policy, packaging scripts, IPC, credentials,
  provider policy, backend APIs, storage, and local execution are unchanged.

### 2026-06-19 Desktop Permission Runtime-Facade Docs Boundary

- Desktop onboarding permission docs, renderer permission runtime references,
  modular stale-doc guard coverage, docs search results, and recent permission
  runtime commits were inspected after the backend protocol correlation wording
  slice.
- Finding: the desktop onboarding permission guide still pointed readers at
  the removed permission utility path even though presentation, grant effects,
  onboarding storage, and runtime-client behavior now route through renderer
  app-runtime permission facades.
- Change: replaced the stale utility path with the current renderer
  app-runtime permission facade files and extended the modular guard to read
  the desktop permissions guide and reject the retired permission utility glob.
- Validation: focused modular boundary test, docs listing, stale path scan,
  and diff checks.
- Compatibility: no migration required. Onboarding UI, settings control-center
  behavior, permission store state, manifest contents, probes, IPC, credentials,
  provider policy, local execution, backend APIs, and storage are unchanged.

### 2026-06-19 Backend Protocol Correlation Wording Boundary

- Backend formatter tests, remote-tool tests, websocket transport docs,
  protocol-state docs, recent frontend-correlation cleanup commits, and current
  source scans were inspected after the local-runtime readiness docs slice.
- Finding: backend protocol docs and backend test names still used retired
  client-correlation wording for request/context correlation, even though the
  owner-correct path is backend context attachment feeding SDK event
  correlation and renderer consumers.
- Change: reworded transport and protocol-state docs to SDK/renderer
  correlation, renamed backend formatter/remote-tool tests to SDK correlation,
  and added backend guard coverage for the retired frontend-correlation
  phrases.
- Validation: focused backend formatter, remote-tool, and architecture
  guardrail tests, docs listing, stale phrase scan, and diff checks.
- Compatibility: no migration required. Websocket envelopes, context fields,
  request IDs, formatter payloads, remote-tool behavior, SDK projections,
  renderer ingress, IPC, credentials, provider policy, backend APIs, and
  storage are unchanged.

### 2026-06-19 Local-Runtime Readiness and Dashboard-Hub Label Boundary

- Local-runtime JSON-RPC workflow docs, Python sidecar memory docs, packaged
  release troubleshooting, dashboard docs hub, docs search results, and recent
  local-runtime wording commits were inspected after the dashboard/evidence
  docs slice.
- Finding: JSON-RPC workflow docs, Python sidecar memory docs, and packaged
  release troubleshooting still used broad sidecar readiness/status/log labels,
  while the dashboard hub summary still used removed utility ownership wording.
- Change: reworded those readiness/status/log labels through SDK local runtime,
  Electron main local-runtime bridge, packaged local-runtime status, and
  Python sidecar implementation detail, and changed the dashboard hub summary
  to app-runtime facade ownership. Extended the modular guard for the retired
  sidecar-readiness/status and dashboard-utility labels.
- Validation: focused modular boundary test, docs listing, stale phrase scan,
  and diff checks.
- Compatibility: no migration required. JSON-RPC methods, readiness behavior,
  packaged runtime behavior, dashboard docs routing, IPC, credentials, provider
  policy, local runtime execution, backend APIs, and storage are unchanged.

### 2026-06-19 Operations Evidence Local-Runtime Label Boundary

- Operations evidence docs, modular boundary guard coverage, and current dirty
  worktree changes were inspected while recording the dashboard utility docs
  slice.
- Finding: the operations evidence runbook still used broad sidecar-readiness,
  sidecar trace-flag, permission/platform, and local-tool failure labels, and
  the browser workflow had the same broad bridge-or-sidecar failure route.
- Change: reworded evidence collection metadata, boundary rows, trace flags,
  first-bad-signal examples, and the browser action hang debug row through
  local-runtime/Python sidecar labels, then extended the modular docs guard for
  the retired evidence phrases.
- Validation: focused modular boundary test, docs listing, stale phrase scan,
  and diff checks.
- Compatibility: no migration required. Evidence commands, log flags, IPC,
  credentials, provider policy, local runtime execution, permission behavior,
  packaging, backend APIs, and storage are unchanged.

### 2026-06-19 Dashboard Section Runtime-Facade Docs Boundary

- Dashboard desktop docs, renderer state workflow docs, current feature
  directories, docs search results, and recent dashboard runtime-facade commits
  were inspected after the tool screenshot/formatter wording slice.
- Finding: dashboard guides still pointed section work at the removed dashboard
  utility glob even though dashboard section state now lives in section
  components plus renderer app-runtime facades.
- Change: reworded the desktop dashboard guide and renderer state workflow to
  section components, `desktopDashboard*Runtime*`, memory, model, and settings
  runtime clients, then extended the modular stale-doc guard for the retired
  dashboard utility glob.
- Validation: focused modular boundary test, docs listing, stale path scan, and
  diff checks.
- Compatibility: no migration required. Dashboard UI behavior, section state,
  memory/model/settings commands, IPC, credentials, provider policy, local
  runtime execution, backend APIs, and storage are unchanged.

### 2026-06-19 Tool Screenshot and Formatter Guard Wording Boundary

- Tool-development docs, backend formatter docs, recent renderer stream-event
  payload and tool-doc local-runtime commits, and screenshot ownership
  references were inspected after the backend default-policy slice.
- Finding: the tool-development guide still described computer-use screenshot
  capture as frontend-runtime service orchestration, and a backend formatter
  debug checklist still routed missing events to frontend-runtime event guards.
- Change: reworded tool screenshot guidance through the Agent SDK tool
  coordinator and desktop local-runtime host, reworded formatter debugging
  through SDK backend-event and renderer conversation-event ingress guards, and
  extended the modular stale-doc guard for the retired frontend-runtime
  phrases.
- Validation: focused modular boundary test, docs listing, stale phrase scan,
  and diff checks.
- Compatibility: no migration required. Tool schemas, screenshot capture
  behavior, formatter output payloads, SDK event guards, renderer ingress
  behavior, IPC, credentials, provider policy, local runtime execution,
  backend APIs, and storage are unchanged.

### 2026-06-19 Debug Diagnostic and Observability Local-Runtime Wording Boundary

- Worktree contained debug diagnostic/process-health wording edits when the
  backend schema pass resumed after compaction; the related observability page
  was inspected after the stale stdout scan found the same owner label there.
- Finding: diagnostic flags, observability, process-health, tool-development,
  and evidence-collection docs still used broad sidecar labels in metadata,
  headings, stdout rules, runtime evidence, and readiness checks where the
  owner-correct boundary is local-runtime Python and the Python sidecar remains
  an implementation detail.
- Change: reworded those debug docs through local-runtime Python labels and
  extended the modular debug-doc guard to cover the observability and evidence
  pages plus the retired sidecar-as-runtime summary/readiness phrases.
- Validation: focused modular boundary test, docs listing, stale phrase scan,
  and diff checks.
- Compatibility: no migration required. This is documentation and guard
  coverage only; diagnostic flags, log streams, JSON-RPC stdout behavior,
  traces, IPC, credentials, local runtime execution, provider policy, backend
  APIs, and storage are unchanged.

### 2026-06-20 Local-Runtime Status and Memory Labels

- Finding: IPC contract, extension authoring, local-memory title, and mobile
  planning docs still used sidecar owner labels for local-runtime status,
  executable tool routing, title storage, and mobile memory-parity risks.
- Change: routed those public labels through SDK local-runtime readiness,
  local-runtime executable registry, local-runtime memory storage, and
  SDK/backend hosted title generation wording while preserving Python
  implementation details where they identify concrete modules.
- Validation: focused modular docs boundary test, docs listing, exact stale
  sidecar owner-label scan, and diff check.
- Compatibility: no migration required. IPC channels, status payloads, tool
  registry behavior, title storage, memory retrieval, SDK/backend title
  generation routes, credentials, permissions, hosted backend URLs, and provider
  policy are unchanged.

### 2026-06-20 Local-Runtime Python Process Labels

- Finding: operations configuration, JSON-RPC workflow, and debug failure docs
  still used sidecar-process owner labels for Python executable selection,
  process exit/error handling, stderr forwarding, lifecycle readiness, and
  local-runtime bridge failure routing.
- Change: routed those public labels through local-runtime Python
  process/daemon wording while preserving `sidecar_daemon.py` and
  `tests/sidecar/*` references where they identify concrete implementation
  files and focused test targets.
- Validation: focused modular docs boundary test, docs listing, exact stale
  process-label scan, and diff check.
- Compatibility: no migration required. Environment variable names, process
  launch behavior, stdout/stderr forwarding, JSON-RPC request cleanup, IPC
  channels, storage, credentials, permissions, hosted backend URLs, and provider
  policy are unchanged.

### 2026-06-20 Local Tool Channel Executor Labels

- Finding: local tool channel docs still described the token-auth sidecar daemon
  as the canonical local executor and the channel matrix routed tool-result
  ingress directly through a Python sidecar daemon step.
- Change: routed the public channel wording through SDK/main local-runtime
  execution and local-runtime Python executor labels while preserving the Python
  daemon as the current concrete implementation detail.
- Validation: focused modular docs boundary test, docs listing, exact stale
  channel-executor phrase scan, and diff check.
- Compatibility: no migration required. Tool execution routing, daemon HTTP
  endpoints, tool-result payloads, renderer display projections, IPC channels,
  storage, credentials, permissions, hosted backend URLs, and provider policy
  are unchanged.

### 2026-06-19 Backend Agent-Definition Default-Policy Wording Boundary

- Worktree contained a separate debug diagnostic/process-health wording slice
  while the backend schema pass started; those changes were preserved,
  inspected, and completed as their own boundary note.
- Backend agent-definition docs, schema tests, stale phrase scans, and the
  recent SDK agent-definition wording slice were inspected.
- Finding: the backend `AgentDefinition` schema docstring still described
  omitted fields with product-named default-agent wording, even though the
  owner-correct boundary is hosted backend default agent policy with client
  overrides through `agent_definition`.
- Change: reworded the schema docstring to hosted backend default agent policy
  and added a focused backend schema guard for the retired product default
  phrase.
- Validation: focused backend schema test, docs listing, stale phrase scan, and
  diff checks.
- Compatibility: no migration required. Agent-definition payloads, validation
  modes, hosted default policy, SDK builders, IPC, credentials, local runtime
  execution, provider policy, backend APIs, and storage are unchanged.

### 2026-06-19 Debug Local-Runtime Wording Boundary

- Worktree was clean after `6c189a96c` except for the debug local-runtime
  wording docs and modular stale-doc guard, with `main` ahead of `origin/main`
  by 274 commits.
- Debug docs, recent local-runtime wording commits, and current modular guard
  coverage were inspected.
- Finding: active debug hub, runtime trace, and symptom playbook docs still
  described sidecar paths as broad runtime owners instead of naming
  local-runtime ownership with Python sidecar implementation details only where
  useful.
- Change: reworded those debug docs around local-runtime Python logs, traces,
  backend URL failures, wakeword service, browser adapter, and tool registry
  implementation labels, then extended the modular stale-doc guard.
- Validation: focused modular boundary test, docs listing, stale phrase scan,
  and diff checks.
- Compatibility: no migration required. This is documentation and guard
  coverage only; commands, diagnostic flags, logs, trace payloads, IPC,
  credentials, local runtime execution, provider policy, backend APIs, and
  storage are unchanged.

### 2026-06-19 Renderer Tool-Ghost Timing Runtime Boundary

- Worktree was clean after `2ea966ba6`, with `main` ahead of `origin/main` by
  273 commits.
- Tool-ghost overlay docs, debug app source, current references, and recent
  renderer runtime-boundary commits were inspected.
- Finding: debug tool-ghost click timing lived under the chat feature constants
  tree even though it is consumed by the renderer app debug entrypoint.
- Change: moved `TOOL_GHOST_CLICK_SYNC_DELAY_MS` into
  `frontend/src/renderer/app/runtime/desktopToolGhostRuntime.ts`, routed
  `ToolGhostDebugApp` and docs through that app-runtime owner, and deleted the
  old `frontend/src/renderer/features/chat/constants/toolGhostRuntime.ts` path.
- Validation: focused renderer app-runtime boundary test, docs listing, stale
  old-path scan, frontend lint, and diff checks.
- Compatibility: no migration required. Debug ghost timing, CSS variable value,
  debug view routing, overlay IPC, production response overlay behavior,
  credentials, local runtime execution, provider policy, backend APIs, and
  storage are unchanged.

### 2026-06-19 Renderer Dashboard Grouping and Permission Presentation Runtime Boundaries

- Worktree was clean after `18c78b4be`, with `main` ahead of `origin/main` by
  272 commits, before this combined dashboard grouping and permission
  presentation runtime-boundary pass started.
- Renderer dashboard, permission, onboarding, transport-contract docs, related
  runtime-boundary commits, current imports, and stale utility references were
  inspected.
- Finding: dashboard time/workspace conversation grouping and permission
  status/presentation mapping still lived in feature utility trees even though
  dashboard hooks, onboarding, and settings consume them as shared renderer
  app-runtime rules.
- Change: moved dashboard conversation grouping into
  `frontend/src/renderer/app/runtime/desktopDashboardConversationGroupRuntime.js`,
  moved permission label/status/pill projection into
  `frontend/src/renderer/app/runtime/desktopPermissionPresentationRuntime.js`,
  routed consumers/tests/docs through those app-runtime owners, and deleted the
  old dashboard and permission utility paths.
- Validation: focused conversation-grouping, permission presentation,
  onboarding, app-runtime boundary, docs listing, stale old-path scan, frontend
  lint, and diff checks passed.
- Compatibility: no migration required. Dashboard grouping buckets, workspace
  grouping, search metadata, matched-role labels, permission labels, badge
  classes, onboarding permission actions, IPC, persisted settings/onboarding
  state, credentials, local runtime execution, provider policy, backend APIs,
  and storage are unchanged.

### 2026-06-19 Renderer Onboarding Slide-State Runtime Boundary

- Worktree was clean after `65f8ef867` except for the onboarding slide-state
  runtime slice, with `main` ahead of `origin/main` by 269 commits.
- App startup/onboarding docs, related onboarding runtime commits, current
  imports, and stale utility references were inspected.
- Finding: permission onboarding slide progression and active slide copy lived
  under the onboarding feature utility tree even though the slideshow consumes
  those values as app startup runtime state.
- Change: moved `buildOnboardingSlideState(...)` into
  `frontend/src/renderer/app/runtime/desktopOnboardingSlideRuntime.js`, routed
  the slideshow/tests/docs through the app-runtime owner, and deleted the old
  `frontend/src/renderer/features/onboarding/utils/onboardingSlides.js` path.
- Validation: focused onboarding slide-state test, focused renderer app-runtime
  boundary test, docs listing, stale old-path scan, frontend lint, and diff
  checks.
- Compatibility: no migration required. Onboarding slide ordering, copy,
  permission state, IPC, persisted onboarding flags, credentials, local runtime
  execution, provider policy, backend APIs, and storage are unchanged.

### 2026-06-19 SDK Agent Definition Client Manifest Wording Boundary

- SDK conversation/runtime docs, agent-definition docs, API reference docs, and
  recent agent-definition boundary commits were inspected after the main
  host-skin hotkey slice.
- Finding: the SDK agent-definition guide still routed removed
  post-handshake tool schemas through `frontend-tool-schemas`, described
  omitted agent definitions with product-named default-agent wording, and
  called SDK builtins WindieOS built-in tools.
- Change: reworded those docs and the API reference to client tool-schema sync,
  hosted backend defaults, and built-in local-runtime tool groups, then added
  stale-phrase guard coverage.
- Validation: focused docs-index route test, focused modular stale-doc guard,
  docs listing, stale phrase scan, and diff checks.
- Compatibility: no migration required. This is documentation and guard
  coverage only; agent-definition payloads, tool modes, client manifest shape,
  SDK builtins behavior, backend defaults, IPC, credentials, permissions, local
  execution, provider policy, and storage are unchanged.

### 2026-06-19 Main Wakeword Hotkey Fallback Host-Skin Boundary

- Worktree was clean after `1be48c1bf`, with `main` ahead of `origin/main` by
  266 commits.
- Electron main host-skin docs, lifecycle runtime, and recent wakeword hotkey
  host-skin history were inspected after the renderer runtime slices.
- Finding: the primary wakeword hotkey lived in the host skin, but the generic
  lifecycle runtime still owned WindieOS's Windows fallback accelerator list.
- Change: added `wakewordFallbackHotkeysByPlatform` to the WindieOS host skin,
  passed those candidates through `index.cjs`, and made the lifecycle runtime
  consume injected fallback accelerators.
- Validation: focused main lifecycle and host-skin boundary tests, docs
  listing, stale accelerator scan, frontend lint, and diff check.
- Compatibility: no migration required. WindieOS keeps the same primary and
  fallback accelerator order; IPC channels, persisted settings, permissions,
  packaging, hosted routes, provider policy, local-runtime launch, and wakeword
  behavior are unchanged.

### 2026-06-18 Main VM Worker Bootstrap Config Boundary

- Worktree was clean after `f32d8d819`, with `main` ahead of `origin/main` by
  53 commits.
- Main-process bootstrap runtime, VM worker startup tests, and host-skin
  boundary coverage were inspected after the local-runtime bridge copy slice.
- Finding: the generic window bootstrap runtime still reached into
  `deps.mainHostSkin.hostedBackend` and `deps.mainHostSkin.vmWorker` to build VM
  worker options.
- Change: passed `runsApiKeyHeader` and `vmWorkerEnv` as narrow dependencies
  from the Electron main composition root, while preserving host-skin handoff to
  window/tray runtimes that still own UI shell copy/assets.
- Validation: focused bootstrap, host-skin boundary, and VM worker Jest
  coverage, CommonJS syntax checks, docs listing, targeted source scan, and
  diff check.
- Compatibility: no migration required. VM worker hosted API auth header, env
  key resolution, worker startup behavior, IPC, storage, credentials, and
  provider policy are unchanged.

### 2026-06-18 Main Local-Runtime Bridge Copy Boundary

- Worktree was clean after `92e59867d`, with `main` ahead of `origin/main` by
  52 commits.
- Local-runtime bridge initialization, main-window composition, and bridge RPC
  tests were inspected after the permission-copy boundary slice.
- Finding: `local_runtime_bridge.cjs` still accepted the full host skin and
  reached into `options.mainHostSkin.localRuntime` for browser warmup copy, so
  generic SDK/local-runtime bridge code knew the host-skin shape.
- Change: routed bridge copy through a generic copy object, then the later
  2026-06-18 copy-narrowing slice reduced that handoff to
  `localRuntimeBridgeCopy.browserWarmupExplanation`; local-runtime bridge upload
  tests configure their hosted endpoint explicitly.
- Validation: focused local-runtime bridge, main-window runtime, and host-skin
  boundary Jest coverage, CommonJS syntax checks, docs listing, targeted source
  scan, and diff check.
- Compatibility: no migration required. Browser warmup copy, local-runtime
  readiness behavior, artifact upload endpoints, tool execution, IPC channels,
  storage, credentials, and provider policy are unchanged.

### 2026-06-18 Main Permission Copy Boundary

- Worktree was clean after `c467eb884`, with `main` ahead of `origin/main` by
  51 commits.
- Permission service modules, IPC runtime wiring, and host-skin boundary tests
  were inspected after the local-runtime entrypoint skin slice.
- Finding: browser, screen-capture, macOS automation, input-control,
  microphone, and workspace permission services still reached into the full
  host-skin object for copy, so generic permission adapters knew the
  WindieOS-specific skin shape instead of receiving local adapter copy.
- Change: routed permission services through generic `permissionCopy`, extracted
  `mainHostSkin.permissions` at the Electron IPC composition root, and kept the
  IPC runtime open to direct `permissionCopy` injection for tests or alternate
  hosts.
- Validation: focused permission and host-skin boundary Jest coverage,
  CommonJS syntax checks, docs listing, targeted source scan, and diff check.
- Compatibility: no migration required. Permission status behavior, prompts,
  remediation copy, OS probes, browser runtime install consent, workspace
  persistence, IPC channels, credentials, and provider policy are unchanged.
  Security boundary is unchanged; this only narrows the dependency shape visible
  to individual permission adapters.

### 2026-06-18 Main Local-Runtime Entrypoint Skin Boundary

- Worktree was clean after `2f3edfec2`, with `main` ahead of `origin/main` by
  50 commits.
- Electron main launch helper history and current launch tests were inspected
  after the shared Python helper wording slice.
- Finding: `local_runtime_launch_options.cjs` still passed
  `sidecar_daemon.py` directly to the generic launch-target resolver, leaving a
  WindieOS Python entrypoint literal inside the reusable Electron local-runtime
  launch helper.
- Change: added a generic `local_runtime_daemon.py` launch-helper default,
  moved WindieOS's active `sidecar_daemon.py` entrypoint into
  `mainHostSkin.localRuntime`, passed it from the IPC composition root, and made
  source-stamp generation derive the entrypoint file from the resolved launch
  target.
- Validation: focused launch, host-skin, runtime-path, and IPC boundary Jest
  coverage, CommonJS syntax checks, docs listing, targeted source scan, and
  diff check.
- Compatibility: no migration required. Current WindieOS desktop startup still
  launches `sidecar_daemon.py`; packaged path resolution, daemon discovery,
  env aliases, source-stamp payload shape, IPC, storage, credentials, and
  provider policy are unchanged.

### 2026-06-18 Python Local-Runtime Helper Wording Boundary

- Worktree was clean after `52722910f`, with `main` ahead of `origin/main` by
  49 commits.
- Remaining Python helper wording scans were inspected after the shared
  user-data helper wording slice.
- Finding: shared stdout JSON, executor, env-flag, memory operation, and
  episodic embedding-policy helpers still described their generic helper scope
  as sidecar service/process ownership.
- Change: updated those helper docstrings and the adjacent Python runtime layout
  note to local-runtime ownership wording, then added focused source guards in
  nearby sidecar tests.
- Validation: focused sidecar pytest coverage, bytecode compilation, docs
  listing, targeted source scan, and diff check.
- Compatibility: no migration required. JSON stdout payloads, executor env
  aliases, memory payload normalization, embedding backfill queries, IPC,
  storage, tool schemas, credentials, and provider policy are unchanged.

### 2026-06-18 Main Layer Log Env Skin Boundary

- Worktree was clean after `3ce9249c0`, with `main` ahead of `origin/main` by
  878 commits.
- Main-process product/env coupling scans were inspected after the MCP
  enablement env-key slice.
- Finding: `layer_log_sink.cjs` had a configurable WindieOS log directory but
  still hardcoded `WINDIE_<LAYER>_LOG_FILE` and
  `WINDIE_RENDERER_VERBOSE_LOG_FILE` inside the generic log sink.
- Change: added configurable log env keys with generic `AGENT_*` fallbacks,
  moved the WindieOS layer prefix and renderer verbose env name into
  `mainHostSkin.logging.env`, and configured the sink from Electron main,
  launcher, and CLI command entrypoints.
- Validation: focused layer log sink, local runtime launch option, Electron
  launcher, Windie CLI, and main host skin boundary Jest coverage, targeted
  source scan, docs listing, and diff check.
- Compatibility: no migration required. WindieOS still honors
  `WINDIE_<LAYER>_LOG_FILE` and `WINDIE_RENDERER_VERBOSE_LOG_FILE`; default
  `.windie/logs` locations, log filenames, console mirroring, and CLI log
  commands are unchanged.

### 2026-06-18 Main MCP Enablement Env Skin Boundary

- Worktree was clean after `ceb7c765c`, with `main` ahead of `origin/main` by
  877 commits.
- Main-process product/env coupling scans were inspected after the extension
  contribution env-key slice.
- Finding: `mcp_runtime.cjs` still hardcoded `WINDIE_ENABLED_MCPS` while
  otherwise acting as the generic MCP discovery and client-tool manifest bridge.
- Change: added configurable MCP env keys with a generic `AGENT_ENABLED_MCPS`
  fallback, moved the WindieOS enabled-server allowlist env name into
  `mainHostSkin.mcp.env`, and configured the MCP runtime from the main startup
  path.
- Validation: focused MCP runtime Jest coverage, main host skin boundary Jest
  coverage, targeted source scan, docs listing, and diff check.
- Compatibility: no migration required. WindieOS still honors
  `WINDIE_ENABLED_MCPS`; explicit `enabledMcpServers`/`enabledMcpServerIds`
  options, dashboard allowlist persistence, MCP discovery, and manifest
  projection behavior are unchanged.

### 2026-06-18 Main Extension Env Skin Boundary

- Worktree was clean after `bf1ebefad`, with `main` ahead of `origin/main` by
  876 commits.
- Main-process product/env coupling scans were inspected after the GPU env-key
  slice.
- Finding: `extension_manifest.cjs` still hardcoded
  `WINDIE_AGENT_CONTRIBUTIONS_DIR` while otherwise acting as the generic
  extension/plugin/skill/MCP contribution loader.
- Change: added configurable extension env keys with a generic
  `AGENT_CONTRIBUTIONS_DIR` fallback, moved the WindieOS contribution-root env
  name into `mainHostSkin.extensions.env`, and configured the loader from the
  main startup path.
- Validation: focused extension manifest Jest coverage, main host skin boundary
  Jest coverage, targeted source scan, docs listing, and diff check.
- Compatibility: no migration required. WindieOS still honors
  `WINDIE_AGENT_CONTRIBUTIONS_DIR`; explicit `contributionsDir` options,
  default repo-root discovery, registry caching, and plugin/skill/MCP manifest
  shapes are unchanged.

### 2026-06-18 Main GPU Env Skin Boundary

- Worktree was clean after `4315644fb`, with `main` ahead of `origin/main` by
  875 commits.
- Main-process product/env coupling scans were inspected after the runtime
  Python env-key slice.
- Finding: `gpu_runtime.cjs` still hardcoded
  `WINDIE_FORCE_SOFTWARE_RENDERING` even though the runtime itself is a generic
  Electron host configuration helper.
- Change: added configurable GPU env keys with a generic
  `AGENT_FORCE_SOFTWARE_RENDERING` fallback, moved the WindieOS env name into
  `mainHostSkin.gpu.env`, and passed that skin config at app startup.
- Validation: focused GPU runtime Jest coverage, main host skin boundary Jest
  coverage, targeted source scan, docs listing, and diff check.
- Compatibility: no migration required. WindieOS still honors
  `WINDIE_FORCE_SOFTWARE_RENDERING`; hardware acceleration defaults and Linux
  software-rendering env side effects are unchanged.

### 2026-06-18 Main Runtime Python Env Skin Boundary

- Worktree was clean after `7029d77e9`, with `main` ahead of `origin/main` by
  874 commits.
- Main-process product/env coupling scans were inspected after the diagnostics
  env-key slice.
- Finding: `runtime_paths.cjs` still hardcoded `WINDIE_PYTHON_PATH` while
  otherwise acting as the generic packaged/source local-runtime launch helper
  for both the sidecar daemon and wakeword service.
- Change: added configurable runtime-path env keys with a generic
  `AGENT_PYTHON_PATH` helper fallback, moved the WindieOS override env name into
  `mainHostSkin.runtimePaths.env`, and passed that skin config through the
  sidecar and wakeword launch composition paths.
- Validation: focused runtime path Jest coverage, main host skin boundary Jest
  coverage, local runtime launch option Jest coverage, targeted source scan,
  docs listing, and diff check.
- Compatibility: no migration required. WindieOS still honors
  `WINDIE_PYTHON_PATH`; packaged bundled-runtime guardrails, conda fallback
  behavior, wakeword launch resolution, and launch-plan shape are unchanged.

### 2026-06-18 Main Diagnostics Env Skin Boundary

- Worktree was clean after `e7f6f109d`, with `main` ahead of `origin/main` by
  873 commits.
- Main-process product/env coupling scans were inspected after the hosted
  endpoint env-key slice.
- Finding: the app diagnostics store already read the WindieOS app-data
  directory name from `mainHostSkin.dataPaths`, but still hardcoded
  `WINDIE_APP_DIAGNOSTICS_DB` and `WINDIE_USER_DATA_DIR` inside the generic
  diagnostics store.
- Change: moved those diagnostics/user-data override env names into
  `mainHostSkin.dataPaths.env`, added generic fallback env names for non-Windie
  hosts, and expanded diagnostics plus host-skin boundary coverage so WindieOS
  data-path env names stay out of the generic diagnostics store source.
- Validation: targeted diagnostics data-path env Jest coverage, main host skin
  Jest coverage, targeted source scan for diagnostics env names, docs listing,
  and diff check. The full app diagnostics persistence suite was attempted but
  could not run in this environment because the `sqlite3` CLI is unavailable.
- Compatibility: no migration required. WindieOS still honors
  `WINDIE_APP_DIAGNOSTICS_DB` and `WINDIE_USER_DATA_DIR` through injected host
  skin config; diagnostics DB location, user-data root fallback behavior, and
  persisted schema are unchanged.

### 2026-06-18 Main Hosted Endpoint Env Skin Boundary

- Worktree was clean after `3286bc018`, with `main` ahead of `origin/main` by
  872 commits.
- Current renderer direct-IPC, sidecar/backend import, main host product/env,
  and stale wording scans were inspected before editing.
- Finding: `backend_endpoints.cjs` already read hosted backend URLs from the
  main host skin, but still hardcoded the WindieOS hosted-default override env
  names `WINDIE_DEFAULT_BACKEND_HTTP_URL` and
  `WINDIE_DEFAULT_BACKEND_WS_URL` inside the generic endpoint resolver.
- Change: moved those override env names into `mainHostSkin.hostedBackend.env`,
  taught the resolver to consume host-supplied hosted-backend env keys, and
  added coverage for a non-Windie host env map plus boundary guards that keep
  WindieOS endpoint names out of the generic resolver source.
- Validation: focused backend endpoint and main host skin Jest coverage plus a
  targeted source scan for hosted endpoint URL/env names.
- Compatibility: no migration required. WindieOS still honors
  `WINDIE_DEFAULT_BACKEND_HTTP_URL` and `WINDIE_DEFAULT_BACKEND_WS_URL` through
  injected host skin config; explicit `BACKEND_*`, loopback override, hosted
  default, endpoint candidate, and artifact URL behavior are unchanged.

### 2026-06-18 Main VM Mode Env Skin Boundary

- Worktree was clean after `ca6bc86db`, with `main` ahead of `origin/main` by
  871 commits.
- The adjacent runtime-mode helper and tests were inspected after the VM worker
  env-key slice.
- Finding: `runtime_mode.cjs` still hardcoded `WINDIE_VM_MODE` and
  `WINDIE_VM_WORKER_MODE`, so the generic Electron runtime-mode helper knew
  WindieOS-specific mode-toggle names while the adjacent VM worker env names
  had moved into host skin config.
- Change: added mode-toggle env keys to `mainHostSkin.vmWorker.env`, passed the
  injected map from `index.cjs` into runtime-mode helpers, and expanded host
  skin boundary coverage so WindieOS mode env names stay out of
  `runtime_mode.cjs`.
- Validation: focused runtime-mode, VM worker, main bootstrap, and main host
  skin Jest coverage plus a targeted source scan for hosted header/env names.
- Compatibility: no migration required. WindieOS still reads the same
  `WINDIE_VM_MODE` and `WINDIE_VM_WORKER_MODE` variables through injected host
  skin config; VM mode and worker-mode fallback behavior are unchanged.

### 2026-06-18 Main VM Worker Env Skin Boundary

- Worktree was clean after `885435c97`, with `main` ahead of `origin/main` by
  870 commits.
- Recent commits, direct renderer IPC scans, sidecar/backend import scans, and
  main-runtime WindieOS coupling scans were inspected before editing.
- Finding: the generic Electron VM worker runtime still read
  `WINDIE_VM_*` and `WINDIE_RUNS_API_KEY` environment variables directly,
  leaving hosted WindieOS worker configuration names inside the reusable worker
  loop even after the runs auth header name moved into the host skin.
- Change: added `mainHostSkin.vmWorker.env`, injected that map through main
  bootstrap into `createVmWorkerRuntime`, and gave the generic worker runtime
  product-neutral default env-key names for non-Windie hosts; expanded boundary
  tests to keep WindieOS env names in the skin and out of the generic worker
  runtime source.
- Validation: focused VM worker, main bootstrap, and main host skin Jest
  coverage plus a targeted source scan for hosted header/env names.
- Compatibility: no migration required. WindieOS still reads the same
  `WINDIE_VM_*`, `WINDIE_VM_RUNS_API_KEY`, and `WINDIE_RUNS_API_KEY`
  variables through the injected host skin config; worker heartbeat, dispatch,
  stop-control, and event relay behavior are unchanged.

### 2026-06-18 Sidecar Shared Tool Schema Boundary

- Worktree was clean after `43c1e4c5b`, with `main` ahead of `origin/main` by
  869 commits.
- Recent commits, the current diff, and the remaining sidecar/backend import
  scan were inspected after context compaction before editing.
- Finding: the remaining sidecar shared-tool-schema parity test imported
  backend computer schema models and the backend browser shared-contract loader
  even though backend tests already cover provider-facing computer schemas and
  browser loader behavior, while sidecar owns local executable schemas and
  generated client manifest metadata.
- Change: rewired the sidecar parity test to assert the shared browser module,
  sidecar executable screenshot schema, and grounded-tool capability vs
  executable schema split through sidecar-owned manifest helpers; added a guard
  so the test file does not reintroduce backend package imports.
- Validation: focused sidecar shared-tool-schema pytest, targeted sidecar
  backend import scan, docs listing, and diff check.
- Compatibility: no migration required. Backend model-facing schemas, browser
  loader behavior, sidecar executable schemas, generated manifest content, and
  runtime execution are unchanged.

### 2026-06-18 Sidecar Browser Schema Shared Contract Boundary

- Worktree was clean after `4395e2e20`, with `main` ahead of `origin/main` by
  868 commits.
- Remaining sidecar backend-import scans were inspected after the tool-registry
  manifest slice.
- Finding: the sidecar browser schema test imported the backend
  shared-contract loader to prove the backend-loaded browser model matched the
  sidecar model, even though both runtimes use the same shared
  `windie_shared.browser_contract` module and backend loader behavior is
  covered in backend tests.
- Change: kept sidecar browser schema coverage on the shared contract module
  directly and removed the backend package import from the sidecar browser
  schema suite.
- Validation: focused sidecar browser schema pytest, targeted sidecar backend
  import scan, docs listing, and diff check.
- Compatibility: no migration required. Shared browser schema output, backend
  loader behavior, generated sidecar manifests, browser tool validation, and
  runtime execution are unchanged.

### 2026-06-18 Sidecar Tool Registry Manifest Boundary

- Worktree was clean after `840468789`, with `main` ahead of `origin/main` by
  867 commits.
- Recent commits and current source scans were inspected before editing; the
  production frontend/renderer/main/SDK scans were clean for direct IPC and
  product-copy leaks outside skin/config.
- Finding: the sidecar tool-registry test imported
  `backend.src.tools.tool_catalog` to compare exposed tool names, even though
  the sidecar/local-runtime boundary already has a generated built-in tool
  manifest artifact and backend-side parity tests cover backend catalog
  alignment.
- Change: rewired the sidecar registry test to compare exposed names against
  `frontend/src/main/generated/builtin_tool_manifest.json` and added a guard so
  that test file does not reintroduce backend package imports.
- Validation: focused sidecar tool-registry pytest, targeted sidecar backend
  import scan, docs listing, and diff check.
- Compatibility: no migration required. Sidecar registry behavior, generated
  manifest content, backend tool catalog, tool schemas, and runtime execution
  are unchanged.

### 2026-06-18 Renderer Models Metadata Refresh Runtime Client

- Worktree was clean after `1f112251a`, with `main` ahead of `origin/main` by
  866 commits.
- Direct IPC scans showed `ModelsSection` already used
  `DesktopSettingsRuntimeClient` for model-catalog metadata refresh, but still
  checked `window.ipc` directly before calling the facade.
- Finding: that left a renderer feature component aware of the low-level IPC
  transport instead of relying on the desktop settings runtime client boundary.
- Change: removed the direct `window.ipc` availability gate, let the desktop
  settings runtime client own transport availability/errors, simplified the
  model-section test fixture, and expanded the renderer settings boundary guard
  to reject direct `window.ipc` access in settings/model callers.
- Validation: focused model-section and renderer settings boundary Jest
  coverage, targeted direct IPC scan, docs listing, and diff check.
- Compatibility: no migration required. Model-list command routing,
  `DesktopSettingsRuntimeClient.listModels()`, backend `models.list`
  transport, settings state, and renderer UI behavior are unchanged.

### 2026-06-18 Agent SDK Runtime Wording In Active Docs

- Worktree was clean after `2bc5e0186`, with `main` ahead of `origin/main` by
  865 commits.
- Recent commits and source/docs scans for product-copy, local-backend, and
  SDK-agent wording were inspected before editing.
- Finding: active hosted-client, frontend architecture, development, and
  runtime-node docs still used "SDK agent" labels for runtime concerns such as
  websocket transport ownership, Electron startup, and backend-bound
  connections, while the current reusable boundary is Agent SDK runtime/host
  ownership.
- Change: reworded those docs to Agent SDK runtime/startup/connection wording
  and expanded the modular boundary guard to cover the active hosted-client
  doc plus exact retired phrases.
- Validation: focused modular boundary Jest coverage, targeted stale wording
  scans for the touched docs, docs listing, and diff check.
- Compatibility: no migration required. Documentation and guard coverage only;
  agent-definition payloads, websocket transport, Electron startup, endpoint
  selection, and renderer behavior are unchanged.

### 2026-06-18 Installation Endpoint Fallback Contract

- Worktree was clean after `7b5f1767a`, with `main` ahead of `origin/main` by
  864 commits.
- Recent commits and stale endpoint/fallback wording scans were inspected
  before editing docs.
- Finding: the first-read installation guide still claimed that hosted backend
  connection failure before websocket open silently falls back to local backend
  candidates, conflicting with the current explicit local-backend endpoint
  contract and main-process lifecycle tests.
- Change: updated the installation guide to say hosted connection failure is
  reported unless the user configures explicit local endpoint overrides, and
  added a modular boundary guard for the obsolete fallback sentence.
- Validation: focused modular boundary Jest coverage, targeted stale fallback
  scan, docs listing, and diff check.
- Compatibility: no migration required. Documentation and guard coverage only;
  endpoint resolution, websocket connection behavior, local-backend override
  variables, and packaged defaults are unchanged.

### 2026-06-18 Websocket Workflow Docs Client Boundary Wording

- Worktree was clean after `2d8f61c4a`, with `main` ahead of `origin/main` by
  863 commits.
- Recent commits, the current plan/report, and repo-wide stale-wording scans
  were inspected before editing docs.
- Finding: active security, operations, gateway, and formatter workflow docs
  still described websocket auth/header, endpoint, and stream-payload drift in
  stale frontend websocket or frontend contract terms, even though the current
  owners are SDK/Electron websocket transport and renderer-facing contract
  consumers.
- Change: reworded those docs to name SDK/Electron client transport, desktop
  client endpoint tests, and SDK/renderer contract updates; expanded the
  modular boundary guard to cover those active docs and retired phrases.
- Validation: focused modular boundary Jest coverage, targeted stale wording
  scans for the touched docs, docs listing, and diff check.
- Compatibility: no migration required. Documentation and guard coverage only;
  auth headers, endpoint selection, websocket payloads, formatter output, and
  renderer stream behavior are unchanged.

### 2026-06-18 Active Contract Docs Boundary Wording

- Worktree was clean after `c9bbb849a`, with `main` ahead of `origin/main` by
  862 commits.
- Recent commits and current stale-wording scans were inspected before editing
  docs.
- Finding: active docs still described contract touchpoints as
  `Frontend-owned` or `Frontend/backend` boundaries even though current
  ownership is split across renderer UI, Electron main host, SDK local-runtime
  callers, Python sidecar execution, and backend hosted contracts.
- Change: reworded the docs index, backend websocket command contract, and
  frontend inventory contract-touchpoint reference to name concrete runtime
  owners; expanded the modular boundary guard to cover those docs.
- Validation: focused modular boundary Jest coverage, targeted stale wording
  scans for the touched docs, docs listing, and diff check.
- Compatibility: no migration required. Documentation and guard coverage only;
  IPC channels, websocket payloads, schema fixtures, provider policy,
  credentials, and local execution are unchanged.

### 2026-06-18 Main VM Worker Runs Auth Boundary Guard

- Worktree was clean after `e47600187`, with `main` ahead of `origin/main` by
  861 commits.
- Recent commits, current source scans, local-runtime naming notes, and hosted
  install/runs auth ownership docs were inspected before adding more coverage.
- Finding: the VM worker runtime now receives the hosted runs API auth header
  from the WindieOS host skin, but the broad main-host skin boundary test did
  not yet guard that ownership next to hosted endpoint URL ownership.
- Change: extended the main host skin boundary test so `x-windie-runs-key`
  must live in `main_host_skin.cjs` and must not be baked into the generic VM
  worker runtime.
- Validation: focused main host skin boundary test, VM worker runtime test,
  targeted `frontend/src/main` source scan for `x-windie-runs-key`, docs
  listing, and diff check.
- Compatibility: no migration required. Runtime behavior, runs key env lookup,
  hosted runs auth, endpoint selection, credentials, and local-runtime
  execution are unchanged.

### 2026-06-18 Main VM Worker Runs Auth Boundary

- Worktree was clean after `03100ed7a`, with `main` ahead of `origin/main` by
  860 commits.
- Recent main VM worker commits, runs API docs, and relevant uncommitted
  changes were inspected before touching hosted runs auth wiring.
- Finding: the generic Electron VM worker runtime still constructed the hosted
  runs API auth header as `x-windie-runs-key`, coupling the reusable worker loop
  to the WindieOS backend contract instead of the host configuration that owns
  hosted endpoint details.
- Change: moved the runs API header name into the WindieOS main host skin and
  injected it when bootstrap creates the VM worker runtime. The worker runtime
  now only emits a runs auth header when the host supplies a header name.
- Validation: focused VM worker and bootstrap Jest coverage, targeted source
  scan proving the WindieOS header string only remains in the main host skin
  under `frontend/src/main`, docs listing, and diff check.
- Compatibility: no migration required. WindieOS still sends
  `x-windie-runs-key` through host skin configuration, and existing
  `WINDIE_VM_RUNS_API_KEY` / `WINDIE_RUNS_API_KEY` env lookup order is
  unchanged.

### 2026-06-18 Python Sidecar Bootstrap Path Naming

- Worktree was clean after `182dcf439`, with `main` ahead of `origin/main` by
  859 commits, and `git pull --ff-only` reported the branch was already up to
  date.
- Recent sidecar runtime commits, sidecar bootstrap docs, and relevant
  uncommitted changes were inspected before touching source-run path bootstrap.
- Finding: Python sidecar source-run bootstrap code still named the sidecar
  entrypoint directory `frontend_python_dir`, even though the owner is the
  Python sidecar runtime and the frontend directory is only the repository
  location.
- Change: renamed the bootstrap locals and focused test names to
  `sidecar_python_dir` while preserving `ensure_sidecar_python_path(...)` and
  the existing source/dev import-path behavior.
- Validation: focused sidecar bootstrap pytest, Python compile checks for the
  touched sidecar files, targeted stale `frontend_python_dir` source scan,
  docs listing, and diff check.
- Compatibility: no migration required. Source/dev `sys.path` promotion,
  packaged paths, JSON-RPC methods, sidecar daemon startup, storage, provider
  policy, credentials, and local-runtime execution are unchanged.

### 2026-06-18 SDK Source Event Diagnostic Metadata

- Worktree was clean after `bc1120989`, with `main` ahead of `origin/main` by
  858 commits.
- Recent SDK transport/projection commits, SDK conversation docs, and relevant
  uncommitted changes were inspected before touching normalized event metadata.
- Finding: SDK-normalized conversation event payloads still exposed backend
  diagnostic packets under `payload.rawEvent`, which made projection consumers
  and docs speak in raw-backend terms even though the conversation event is the
  public SDK boundary.
- Change: renamed the normalized diagnostic field to `payload.sourceEvent`,
  updated SDK runtime internals and checked-in CJS parity, and kept renderer
  boundary coverage from unwrapping either old `rawEvent` or new `sourceEvent`
  diagnostics.
- Validation: focused SDK conversation runtime and renderer chat boundary tests,
  targeted raw-event/source-event scans, docs listing, and diff check.
- Compatibility: intentional SDK normalized event payload field rename. No
  runtime or storage migration is required for live behavior; existing stored
  historical rows with `payload.rawEvent` remain diagnostic-only, while new SDK
  normalized rows use `payload.sourceEvent`. Backend websocket packets,
  projections, raw backend debug subscription, provider policy, credentials,
  and local-runtime execution are unchanged.

### 2026-06-18 SDK Backend-Wire Normalizer Package Boundary

- Worktree was clean after `8d3e0d353`, with `main` ahead of `origin/main` by
  857 commits.
- Recent SDK/main local-runtime commits, main host boundary docs, SDK docs, and
  relevant uncommitted changes were inspected after context compaction before
  touching the SDK package entrypoint.
- Finding: `normalizeBackendEventToConversationEvent(...)` is still the SDK
  transport owner for hosted backend-wire packets, but the root package
  re-export made that internal normalizer look like the normal application
  authoring surface next to conversation projections and chat streams.
- Change: removed the backend-wire normalizer re-export from the TypeScript SDK
  entrypoint and checked-in CJS parity while leaving the transport module in
  place for SDK internals and focused protocol tests. SDK docs now state that
  application code should consume projections/chat streams rather than
  normalizing hosted backend packets directly.
- Validation: focused SDK private-export test, targeted root-export scan, docs
  listing, and diff check.
- Compatibility: intentional SDK public-surface narrowing. No runtime or
  storage migration is required; backend websocket packets, SDK conversation
  projection behavior, raw backend debug subscription, provider policy,
  credentials, and local-runtime execution are unchanged.

### 2026-06-18 Renderer Permission Runtime Client Slice

- Worktree was clean after `b17e9834f`, with `main` ahead of `origin/main` by
  856 commits.
- Recent related commits and renderer permission docs were inspected before
  touching the permission store path.
- Finding: `permissionStore` owned gate derivation and onboarding persistence
  correctly but still invoked list/probe/request/check permission IPC channels
  directly.
- Change: added `DesktopPermissionRuntimeClient` for permission commands and
  routed the store through it while leaving status normalization,
  merge-vs-replace semantics, gate derivation, onboarding persistence, and
  user-facing errors in the store.
- Validation: focused permission store, app permission gate, onboarding action,
  and settings section tests, targeted permission store and renderer feature
  direct IPC scans, docs listing, and diff check. A broader
  `DesktopOnboardingSlideshow` run was attempted but hit an existing
  window-control assertion expecting an explicit `undefined` IPC argument.
- Compatibility: no migration required. Permission manifest/status payloads,
  probe/request/check behavior, onboarding storage, trust boundaries,
  credentials, and provider policy are unchanged.

### 2026-06-18 Renderer Agent Extension Runtime Client Slice

- Worktree was clean after `ff302ffb7`, with `main` ahead of `origin/main` by
  855 commits.
- Recent related commits were inspected before touching the agent settings
  path.
- Finding: `AgentSettingsTab` still imported agent extension metadata and
  capability event IPC channels directly.
- Change: added `DesktopExtensionRuntimeClient` for extension metadata and
  agent capability fan-out, then routed `AgentSettingsTab` through it while
  leaving extension/tool presentation, accepted/rejected manifest state, remote
  catalog state, and config toggles in the tab.
- Validation: focused agent settings and renderer settings boundary tests,
  targeted agent settings direct IPC scan, docs listing, and diff check.
- Compatibility: no migration required. Extension metadata payloads,
  `client-tool-manifest` and `remote-tool-catalog` events, tool toggles,
  storage, credentials, and provider policy are unchanged.

### 2026-06-18 Renderer MCP Runtime Client Slice

- Worktree was clean after `ea8c1d6cd`, with `main` ahead of `origin/main` by
  854 commits.
- Recent related commits were inspected before touching the MCP dashboard
  section.
- Finding: `McpsSection` still invoked MCP registry list, refresh, and
  enablement IPC channels directly.
- Change: added `DesktopMcpRuntimeClient` for MCP registry commands and routed
  the MCP dashboard section through it while leaving registry normalization,
  toggle presentation, and error display in the section.
- Validation: focused MCP section and renderer chat boundary tests, targeted
  MCP section direct IPC scan, docs listing, and diff check.
- Compatibility: no migration required. MCP registry payloads, enablement
  persistence, discovery refresh behavior, storage, credentials, and provider
  policy are unchanged.

### 2026-06-18 Renderer Memory Store Runtime Client Slice

- Worktree was clean after `e235c9e05`, with `main` ahead of `origin/main` by
  853 commits.
- Recent related commits were inspected before touching the memory panel path.
- Finding: `MemorySection` already used `DesktopMemoryRuntimeClient` for
  memory list/delete commands but still subscribed to the memory-store changed
  desktop runtime channel directly.
- Change: widened `DesktopMemoryRuntimeClient` with
  `onMemoryStoreChanged(...)` and routed the dashboard memory refresh
  subscription through it while leaving tab/search/normalization/delete
  presentation in `MemorySection`.
- Validation: focused desktop memory runtime client, memory section, renderer
  chat boundary tests, targeted memory section direct IPC scan, docs listing,
  and diff check.
- Compatibility: no migration required. Memory list/delete commands,
  memory-store change payloads, refresh behavior, storage, credentials, and
  provider policy are unchanged.

### 2026-06-18 Renderer Workspace Settings Runtime Client Slice

- Worktree was clean after `7a8fd3d0a`, with `main` ahead of `origin/main` by
  852 commits.
- Recent related commits were inspected before touching the workspace settings
  path.
- Finding: `WorkspaceSettingsTab` used workspace access helpers for commands
  but still subscribed to workspace-update IPC directly.
- Change: routed workspace-update fan-out through
  `DesktopWorkspaceRuntimeClient.onWorkspaceAccessUpdated` while leaving active
  workspace display, duplicate-state suppression, and folder selection policy in
  the settings tab.
- Validation: focused settings section test, renderer settings boundary test,
  targeted workspace settings direct IPC scan, docs listing, and diff check.
- Compatibility: no migration required. Workspace update payloads, permission
  request/check behavior, settings UI state, storage, credentials, and provider
  policy are unchanged.

### 2026-06-18 Renderer App Config Provider Runtime Clients Slice

- Worktree was clean after `df90a36e7`, with `main` ahead of `origin/main` by
  851 commits.
- Recent commits and the empty diff were inspected after compaction before
  continuing the renderer boundary work.
- Finding: `AppConfigProvider` and `AppStatusProvider` still imported settings,
  config persistence, session snapshot/status, and wakeword-toggle IPC channels
  directly even though adjacent renderer paths already used app runtime clients.
- Change: added `DesktopAppConfigRuntimeClient` for renderer config disk
  persistence and settings-event fan-out, routed session snapshot/status through
  `DesktopClientSessionRuntimeClient`, and routed wakeword-toggle fan-out through
  `DesktopVoiceRuntimeClient` while leaving config merge, save-status, runtime
  sync, and wakeword suppression policy in the providers.
- Validation: focused app config provider, app status provider, renderer
  settings boundary tests, targeted provider direct IPC scan, docs listing, and
  diff check.
- Compatibility: no migration required. Renderer config storage keys, disk
  config payloads, settings events, session snapshot/status payloads,
  wakeword-toggle payloads, provider credential redaction, storage, credentials,
  and provider policy are unchanged.

### 2026-06-18 Renderer Dashboard Shell Runtime Clients Slice

- Worktree was clean after `2ffbd4190`, with `main` ahead of `origin/main` by
  850 commits.
- Finding: `DashboardShell` still imported main-window open-target and
  client-user snapshot IPC channels directly even though adjacent chat/session
  paths already used renderer app runtime clients.
- Change: routed dashboard open-target subscription through
  `DesktopWindowRuntimeClient.onMainWindowOpenTarget` and the snapshot fallback
  through `DesktopClientSessionRuntimeClient.loadMainSessionSnapshot` while
  leaving panel routing, dashboard wake animation, and conversation refresh
  policy in `DashboardShell`.
- Validation: focused dashboard shell test, renderer chat boundary test,
  targeted dashboard shell direct IPC scan, docs listing, and diff check.
- Compatibility: no migration required. Main-window target event payloads,
  client snapshot shape, panel routing, VM-mode gating, storage, credentials,
  and provider policy are unchanged.

### 2026-06-18 Renderer Response Overlay Runtime Client Slice

- Worktree was clean after `9ba282021`, with `main` ahead of `origin/main` by
  849 commits.
- Finding: `MinimalResponseOverlay`, `useResponseOverlayWindowSync`, and
  `useResponseOverlayViewModel` still imported responsebox IPC channels directly
  for hit-test, size reporting, close/dismiss hide, and visibility re-report
  behavior.
- Change: added `DesktopResponseOverlayRuntimeClient` for responsebox size,
  hit-test, and visibility fan-out, then routed the response overlay component,
  window-sync hook, and view-model close path through it while leaving overlay
  selection, stale-turn, sizing, scroll, and dismiss policy in the overlay
  feature.
- Validation: focused chatbox response state tests, renderer chat boundary test,
  targeted response overlay direct IPC scan, docs listing, and diff check.
- Compatibility: no migration required. Responsebox channel strings, payload
  shapes, visibility re-report timing, fixed-size/awaiting sizing policy,
  dismissal behavior, storage, credentials, and provider policy are unchanged.

### 2026-06-18 Renderer Minimal Chatbox Window Runtime Client Slice

- Worktree was clean after `43c21067d`, with `main` ahead of `origin/main` by
  848 commits.
- Finding: `MinimalChatPill` and `useMinimalChatPillBindings` still imported
  chatbox window IPC channels directly for focus, wakeword STT trigger,
  visual-anchor reporting, text-entry activation, hit-test, dashboard handoff,
  hide, and drag move behavior.
- Change: widened `DesktopWindowRuntimeClient` to own those chatbox window
  commands/subscriptions, then routed the minimal pill component and binding
  hook through it while leaving layout, focus, drag, hit-test, and STT policy in
  the overlay feature.
- Validation: focused chatbox overlay mouse-ignore test, renderer chat boundary
  test, targeted minimal pill direct chatbox IPC scan, docs listing, and diff
  check.
- Compatibility: no migration required. Chatbox channel strings, payload shapes,
  overlay drag/focus/hit-test behavior, visual-anchor sizing policy, storage,
  credentials, and provider policy are unchanged.

### 2026-06-18 Renderer Wakeword Bridge Voice Runtime Client Slice

- Worktree was clean after `7f2afb3f0`, with `main` ahead of `origin/main` by
  847 commits.
- Finding: wakeword capture and bridge-event hooks still imported wakeword IPC
  send/on channels directly while transcription and wakeword notification paths
  used `DesktopVoiceRuntimeClient`.
- Change: widened `DesktopVoiceRuntimeClient` to own wakeword audio chunks,
  enable/disable sends, and detected/status subscriptions, then routed
  `useWakewordDetection` and `useWakewordBridgeEvents` through it.
- Validation: focused desktop voice runtime client, renderer voice boundary,
  wakeword detection, wakeword bridge-event hook tests, targeted direct wakeword
  IPC scan, docs listing, and diff check.
- Compatibility: no migration required. Wakeword channel strings, payload
  shapes, capture lifecycle, cooldown/threshold behavior, microphone permission
  flow, storage, credentials, and provider policy are unchanged.

### 2026-06-18 Renderer Dashboard Conversation Event Subscription Slice

- Worktree was clean after `083e49bf4`, with `main` ahead of `origin/main` by
  846 commits.
- Finding: `useDashboardConversations` still subscribed to the desktop runtime
  conversation-event IPC channel directly while chat stream/projection paths used
  `DesktopConversationRuntimeEventClient`.
- Change: routed the dashboard conversation event subscription through
  `DesktopConversationRuntimeEventClient.onConversationEvent` while leaving
  recent-list refresh, SDK metadata invalidation, and assistant-title polling
  policy in the dashboard hook.
- Validation: focused dashboard conversation hook test, renderer chat boundary
  test, targeted dashboard direct conversation-event IPC scan, docs listing, and
  diff check.
- Compatibility: no migration required. Conversation event payloads, SDK
  metadata commands, title polling timing, dashboard list/search/open/delete
  behavior, storage, credentials, and provider policy are unchanged.

### 2026-06-18 Renderer Window Runtime Client Expansion Slice

- Worktree was clean after `3ff4ef4a7`, with `main` ahead of `origin/main` by
  845 commits.
- Finding: app startup, wakeword detection, and shared main-window controls
  still imported desktop window IPC channels directly.
- Change: widened `DesktopWindowRuntimeClient` to cover main-window show,
  minimize, maximize toggle, and close commands, then routed startup,
  wakeword-chatbox, and `useMainWindowControls` call sites through it.
- Validation: focused renderer chat/voice boundary tests, app permission/VM
  startup tests, chat interface wiring test, targeted direct IPC scan, docs
  listing, and diff check.
- Compatibility: no migration required. Window channel strings, payload shapes,
  startup surface policy, wakeword behavior, main-window controls, Electron main
  handlers, storage, credentials, and provider policy are unchanged.

### 2026-06-18 Renderer Chat Side-Channel Runtime Clients Slice

- Worktree was clean after `c07e7e370`, with `main` ahead of `origin/main` by
  844 commits.
- Finding: chat UI code still imported direct IPC subscriptions for the untyped
  audio side channel and workspace access update fan-out.
- Change: added `DesktopAudioRuntimeClient` and
  `DesktopWorkspaceRuntimeClient` under the renderer app runtime layer and
  routed chat audio/workspace subscriptions through them while keeping payload
  parsing, playback handoff, active-workspace refresh, and workspace-picked
  new-chat policy in chat-owned code.
- Validation: focused renderer chat boundary test, chat interface wiring test,
  targeted direct IPC scan, docs listing, and diff check.
- Compatibility: no migration required. `audio-chunk` and
  `workspace-access-updated` channel strings, payload shapes, audio playback
  parsing, workspace permission request/check APIs, conversation workspace
  binding, Electron main fan-out, storage, credentials, and provider policy are
  unchanged.

### 2026-06-18 Renderer Conversation Event Runtime Client Slice

- Worktree was clean after `d3fc4855d`, with `main` ahead of `origin/main` by
  843 commits.
- Finding: chat stream and SDK projection hooks imported conversation runtime
  fan-out channel constants directly for conversation events, pending turns,
  current-turn projections, and display rows.
- Change: added `DesktopConversationRuntimeEventClient` under the renderer app
  runtime layer and routed stream/projection subscriptions through it while
  leaving hook-owned validation, stale-turn policy, side effects, and row merging
  in place. While validating the slice, preserved the previous chat loop startup
  behavior that ignores unavailable/malformed main-session snapshots instead of
  synthesizing a disconnect.
- Validation: focused renderer chat boundary test, chat stream/projection tests,
  response overlay state test, targeted direct IPC scan, docs listing, and diff
  check.
- Compatibility: no migration required. `windie:conversation-event`,
  `windie:pending-turn`, `windie:current-turn`, and `windie:rows` channel
  strings, payload shapes, replay behavior, transcript/session projection,
  Electron main fan-out, main-session snapshot payloads, SDK query commands,
  storage, credentials, and provider policy are unchanged.

### 2026-06-18 Renderer Client Session Runtime Client Slice

- Worktree was clean after `79058f2e2`, with `main` ahead of `origin/main` by
  842 commits.
- Finding: chat session bootstrap and loop transport state imported the main
  client snapshot and IPC status channels directly.
- Change: added `DesktopClientSessionRuntimeClient` under the renderer app
  runtime layer and routed main-session snapshot/status subscriptions through it.
- Validation: focused renderer chat boundary test, chat session bootstrap test,
  chat loop UI state hook test, targeted direct IPC scan, docs listing, and diff
  check.
- Compatibility: no migration required. `get-client-user-id` and `ipc-status`
  channel strings, payload shapes, reconnect watchdog behavior, transcript
  session projection, Electron main handlers, storage, credentials, and provider
  policy are unchanged.

### 2026-06-18 Renderer Artifact Image Runtime Client Slice

- Worktree was clean after `adb1770ed`, with `main` ahead of `origin/main` by
  841 commits.
- Finding: message screenshot resolution and user screenshot presentation
  imported artifact image IPC channels directly for authenticated artifact fetch
  and native image context-menu actions.
- Change: added `DesktopArtifactRuntimeClient` under the renderer app runtime
  layer and routed message artifact image fetch/context-menu calls through it.
- Validation: focused renderer chat boundary test, message content tests,
  targeted direct IPC scan, docs listing, and diff check.
- Compatibility: no migration required. Artifact fetch/context-menu channel
  strings, payload shapes, screenshot replay/cache behavior, clipboard trust
  boundaries, Electron main handlers, SDK query commands, storage, credentials,
  and provider policy are unchanged.

### 2026-06-18 Renderer Chatbox Window Runtime Client Slice

- Worktree was clean after `61fcea72c`, with `main` ahead of `origin/main` by
  840 commits.
- Finding: message-send preparation invoked the desktop `show-chatbox` IPC
  channel directly while applying return-to-chatbox policy.
- Change: added `DesktopWindowRuntimeClient` under the renderer app runtime
  layer and routed send-surface chatbox restore through it.
- Validation: focused renderer chat boundary test, chat message sender tests,
  docs listing, and diff check.
- Compatibility: no migration required. `show-chatbox` channel strings, payload
  shapes, send-surface policy, screenshot/resource handling, SDK query commands,
  Electron main handlers, storage, credentials, and provider policy are
  unchanged.

### 2026-06-18 Renderer Live-Surface Trace Runtime Client Slice

- Worktree was clean after `60b9cae7d`, with `main` ahead of `origin/main` by
  839 commits.
- Finding: chat stream debug utilities imported the live-surface trace IPC send
  channel directly, keeping a desktop host transport detail in chat stream code.
- Change: added `DesktopLiveSurfaceTraceRuntimeClient` under the renderer app
  runtime layer and routed live-surface trace forwarding through it.
- Validation: focused renderer chat boundary test, chat response state trace
  tests, docs listing, and diff check.
- Compatibility: no migration required. Live-surface trace channel strings,
  diagnostic payload shapes, chat presentation behavior, Electron main logging,
  storage, credentials, and provider policy are unchanged.

### 2026-06-18 Renderer Pending-Turn Runtime Client Slice

- Worktree was clean after `44651b3c2`, with `main` ahead of `origin/main` by
  838 commits.
- Finding: chat send and stop feature code imported desktop pending-turn IPC
  channel constants directly, keeping a host transport detail in chat hooks and
  message-send preparation.
- Change: added `DesktopPendingTurnRuntimeClient` under the renderer app
  runtime layer and routed pending-turn set/clear calls through it.
- Validation: focused renderer chat boundary test, pending-turn/send/stop
  integration tests, docs listing, and diff check.
- Compatibility: no migration required. Pending-turn IPC channel strings,
  payload shapes, local store behavior, SDK query commands, Electron main
  handlers, storage, credentials, and provider policy are unchanged.

### 2026-06-18 SDK Local Runtime Launch Boundary Slice

- Worktree was clean after `23bd13669`, with `main` ahead of `origin/main` by
  837 commits.
- Finding: the SDK local-runtime provider still guessed WindieOS repository
  daemon paths (`frontend/src/main/python/sidecar_daemon.py` and
  `src/main/python/sidecar_daemon.py`) when hosts omitted an explicit launch
  command or daemon script.
- Change: removed SDK repo-path guessing so auto-start now requires a host
  command, explicit daemon script, or `WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT`;
  Electron already supplies its concrete launch command through the desktop
  local-runtime launch plan.
- Validation: focused SDK client Jest tests, source-boundary assertions, docs
  listing, and diff check.
- Compatibility: hosts that relied on implicit WindieOS cwd probing must pass
  `autoLocalRuntime.command`, `autoLocalRuntime.daemonScript`, or
  `WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT`. No storage, API, IPC, credential,
  provider-policy, or Python sidecar protocol migration is required.

### 2026-06-18 Python Sidecar Routing Labels Slice

- Worktree was clean after `e8ea6f116`, with `main` ahead of `origin/main` by
  836 commits.
- Finding: navigation, evidence, process-lifecycle, platform, memory, tool, and
  settings workflow docs still used generic sidecar execution or ownership
  phrases where the Python sidecar owns executable actions, memory storage, and
  local-runtime environment readers.
- Change: qualified those descriptions as Python sidecar ownership and added
  exact stale-form guards to the modular boundary test.
- Validation: focused modular boundary Jest test, targeted stale phrase scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only;
  executable tool behavior, SDK local-runtime routing, Electron bridge behavior,
  Python sidecar memory/config readers, storage, credentials, and provider
  policy are unchanged.

### 2026-06-18 JSON-RPC Python Sidecar Test Labels Slice

- Worktree was clean after `cbe877944`, with `main` ahead of `origin/main` by
  835 commits.
- Finding: local-runtime JSON-RPC, sidecar tool-change, and tool-turn docs still used generic
  sidecar method/test labels for Python sidecar handler, daemon, protocol,
  memory, and tool coverage.
- Change: qualified those owner and validation labels as Python sidecar
  ownership and expanded the modular stale-copy guard to include channel/node
  routing docs.
- Validation: focused modular boundary Jest test, targeted stale phrase scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only;
  JSON-RPC behavior, tool-change behavior, SDK local-runtime commands, Electron
  bridge behavior, Python sidecar execution, storage, credentials, and provider
  policy are unchanged.

### 2026-06-18 Import Boundary Desktop/Python Sidecar Labels Slice

- Worktree was clean after `0ccc1c0b8`, with `main` ahead of `origin/main` by
  834 commits.
- Finding: architecture, review, help, backend service, and frontend routing
  docs still described backend-import parity rules as broad frontend/sidecar
  ownership.
- Change: qualified those rules as desktop client, renderer/Electron main, or
  Python sidecar ownership and expanded the modular stale-copy guard to scan
  the affected docs.
- Validation: focused modular boundary Jest test, targeted stale phrase scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only;
  import behavior, schema contracts, SDK runtime dispatch, Electron bridge
  behavior, Python sidecar execution, storage, credentials, and provider policy
  are unchanged.

### 2026-06-18 Tool Lifecycle Python Sidecar Failure Labels Slice

- Worktree was clean after `854f762c3`, with `main` ahead of `origin/main` by
  833 commits.
- Finding: tool execution lifecycle and schema policy docs still used
  unqualified sidecar failure and executable-argument labels.
- Change: qualified missing-tool/result rows, executable-argument parity, and
  validation checklist wording as Python sidecar ownership; the modular tool
  routing guard now covers the lifecycle doc.
- Validation: focused modular boundary Jest test, targeted stale phrase scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only; tool
  schemas, SDK runtime dispatch, Electron bridge behavior, Python sidecar
  execution, storage, credentials, and provider policy are unchanged.

### 2026-06-18 Agent-Visible Pipeline Python Sidecar Labels Slice

- Worktree was clean after `d797bbf52`, with `main` ahead of `origin/main` by
  832 commits.
- Finding: the agent-visible data pipeline still used broad frontend/sidecar
  and plain Sidecar labels for local tool execution/result boundaries.
- Change: qualified those labels as desktop client/Python sidecar,
  Python sidecar `ToolResult`, Python sidecar execution, or executable
  local-runtime args, and extended the modular boundary guard.
- Validation: focused modular boundary Jest test, targeted stale phrase scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only;
  pipeline behavior, tool schemas, SDK local-runtime transport, Electron bridge
  behavior, Python sidecar execution, storage, credentials, and provider policy
  are unchanged.

### 2026-06-18 Tool Troubleshooting Python Sidecar Owner Labels Slice

- Worktree was clean after `18f026baf`, with `main` ahead of `origin/main` by
  831 commits.
- Finding: tool troubleshooting and schema-policy routing docs still used
  unqualified sidecar registry/runtime wording for Python sidecar failure rows.
- Change: qualified those owner labels as Python sidecar registry/runtime,
  Python sidecar registration/import, and Python sidecar executable fields; the
  modular boundary guard now includes those docs.
- Validation: focused modular boundary Jest test, targeted stale phrase scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only; tool
  schemas, SDK/main dispatch, Electron bridge behavior, Python sidecar
  execution, storage, credentials, and provider policy are unchanged.

### 2026-06-18 Voice Routing Renderer/Electron Owner Labels Slice

- Worktree was clean after `d66b6a092`, with `main` ahead of `origin/main` by
  830 commits.
- Finding: voice and wakeword routing docs still labeled renderer voice capture
  and Electron wakeword bridge references with broad frontend wording.
- Change: reworded those link labels to Renderer Voice Capture and Electron
  Wakeword Bridge and added a modular docs guard.
- Validation: focused modular boundary Jest test, targeted stale phrase scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only; voice
  IPC, wakeword bridge behavior, renderer capture behavior, Python wakeword
  service behavior, storage, credentials, and provider policy are unchanged.

### 2026-06-18 Built-In Python Sidecar Tool Docs Wording Slice

- Worktree was clean after `60679a0c5`, with `main` ahead of `origin/main` by
  829 commits.
- Finding: tool authoring, extension, and sidecar daemon docs still used
  unqualified built-in sidecar tool wording.
- Change: qualified those references as built-in Python sidecar tools and
  added a modular docs guard.
- Validation: focused modular boundary Jest test, targeted stale phrase scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only; tool
  manifests, registry behavior, plugin/MCP loading, JSON-RPC, IPC, storage,
  credentials, and provider policy are unchanged.

### 2026-06-18 Python Sidecar Tool Diagnostic Wording Slice

- Worktree was clean after `a86aaf7ee`, with `main` ahead of `origin/main` by
  828 commits.
- Finding: local tool registry, path-resolution, wait, and PDF dependency
  diagnostics/comments still used unqualified sidecar runtime/tool wording.
- Change: qualified those diagnostics/comments as Python sidecar runtime or
  Python sidecar tools and added sidecar source-copy guards.
- Validation: focused sidecar registry tests, targeted stale phrase scan, docs
  listing, and diff check. A broader read-file suite was attempted and hit
  unrelated Windows/current-env path and CRLF expectations.
- Compatibility: no migration required. This is diagnostic/comment/test
  guardrail only; tool registration, execution, read-file behavior, JSON-RPC,
  IPC, storage, credentials, and provider policy are unchanged.

### 2026-06-18 Channel Routing Desktop Local Owner Wording Slice

- Worktree was clean after `22bcf37fd`, with `main` ahead of `origin/main` by
  827 commits.
- Finding: the channel routing matrix still labeled the local owner column and
  payload sections as frontend/sidecar ownership.
- Change: renamed the matrix owner column to desktop/local owner, payload
  sections to desktop client and Python sidecar owners, and guarded the stale
  labels.
- Validation: focused modular boundary Jest test, targeted stale phrase scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only; IPC
  channels, payload shapes, SDK/main routing, Python sidecar JSON-RPC behavior,
  storage, credentials, and provider policy are unchanged.

### 2026-06-18 Agent SDK Runtime Channel Wording Slice

- Worktree was clean after `1ecfffd4a`, with `main` ahead of `origin/main` by
  826 commits.
- Finding: channel routing, tool lifecycle, stream-event, and memory IPC docs
  still used SDK-agent wording for Agent SDK backend transport/runtime/API
  paths.
- Change: reworded those references to Agent SDK backend transport,
  conversation runtime, stream-event module, and public Agent SDK APIs, and
  extended the modular boundary guard for the stale phrases.
- Validation: focused modular boundary Jest test, targeted stale phrase scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only;
  IPC channels, websocket messages, SDK APIs, backend transport behavior,
  storage, credentials, and provider policy are unchanged.

### 2026-06-18 Local Runtime Payload Diagnostic Wording Slice

- Worktree was clean after `6fd248e7c`, with `main` ahead of `origin/main` by
  825 commits.
- Finding: the local runtime sidecar hub and unicode sanitizer helper still
  described diagnostic/sanitized values as sidecar payloads even though the
  relevant contract is local-runtime JSON-RPC/payload sanitation.
- Change: reworded the documentation and helper docstring to local-runtime
  JSON-RPC or local-runtime payload wording and added a modular boundary guard.
- Validation: focused modular boundary Jest test, targeted stale phrase scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is docs/comment/test guardrail
  only; payload shape, JSON-RPC routing, unicode sanitation behavior, IPC,
  storage, credentials, and provider policy are unchanged.

### 2026-06-18 Browser Contract Python Sidecar Validation Wording Slice

- Worktree had only the in-progress browser/tool-catalog wording docs after
  `aef481af9`, with `main` ahead of `origin/main` by 824 commits.
- Finding: browser shared-contract and tool catalog docs still used
  unqualified sidecar validation/runtime labels and `Frontend/sidecar manifest`
  in places where the owner is the Python sidecar or desktop
  client/local-runtime manifest.
- Change: qualified browser validation/runtime as Python sidecar ownership,
  reworded the tool catalog manifest and registry owners to desktop
  client/local-runtime manifest plus Python sidecar registry, and added a
  modular docs guard for stale labels.
- Validation: focused modular boundary Jest test, targeted stale phrase scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only;
  browser schemas, shared contracts, Python sidecar runtime behavior, backend
  projection, IPC, storage, credentials, and provider policy are unchanged.

### 2026-06-18 Desktop Client Manifest Validation Wording Slice

- Worktree was clean after `32381717c`, with `main` ahead of `origin/main` by
  823 commits.
- Finding: the tool schema policy workflow still routed client manifest payload
  generation changes to "frontend manifest builder tests."
- Change: reworded the validation row to desktop client manifest builder tests
  and added a modular docs guard for the stale phrase.
- Validation: focused modular boundary Jest test, targeted stale phrase scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only;
  client manifest shape, builder behavior, SDK/main dispatch, local-runtime
  bridge behavior, credentials, permissions, storage, and provider policy are
  unchanged.

### 2026-06-18 Qualified Tool Sidecar Executor Wording Slice

- Worktree was clean after `51ac9fb02`, with `main` ahead of `origin/main` by
  822 commits.
- Finding: active tool routing, channel, gateway, renderer, and reference docs
  still used unqualified "sidecar executor" wording in local tool execution
  paths.
- Change: qualified those references as Python sidecar executor or
  local-runtime sidecar executor ownership, and added a modular docs guard for
  the stale unqualified phrases.
- Validation: focused modular boundary Jest test, targeted stale phrase scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only; tool
  schemas, manifests, SDK/main dispatch, local-runtime bridge behavior,
  credentials, permissions, storage, and provider policy are unchanged.

### 2026-06-18 Frontend Architecture Agent SDK Host Runtime Wording Slice

- Worktree was clean after `77eb1594e`, with `main` ahead of `origin/main` by
  821 commits.
- Finding: the active frontend architecture settings/model sync row still said
  Electron main sent through the "SDK agent host" for settings/model commands.
- Change: reworded the row to Agent SDK host runtime wording and extended the
  modular boundary guard to reject the stale phrase.
- Validation: focused modular boundary Jest test, targeted stale phrase scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only;
  settings/model IPC commands, SDK calls, backend ACK gates, credentials,
  permissions, storage, and provider policy are unchanged.

### 2026-06-18 Agent SDK Runtime IPC Helper Naming Slice

- Worktree was clean after `414152f23`, with `main` ahead of `origin/main` by
  820 commits.
- Finding: Electron main helper dependencies such as
  `sendQueryThroughSdkAgent` and their failure copy still used SDK-agent
  wording for generic Agent SDK runtime command routing.
- Change: renamed the internal main helper/dependency/test surface to
  `*ThroughAgentSdkRuntime`, changed query send failure copy to "Agent SDK
  runtime", and aligned live query/IPC docs with the same language.
- Validation: focused main IPC/query/VM-worker Jest tests, targeted stale
  helper and docs scans, docs listing, and diff check.
- Compatibility: no migration required. IPC channel names, `windie:invoke`
  command names, SDK API calls, backend websocket payloads, credentials,
  permissions, storage, and provider policy are unchanged.

### 2026-06-18 SDK-Shaped Query Send-Failure Broadcast Slice

- Worktree had only the in-progress query broadcast helper and boundary test
  changes after `463f71e13`, with `main` ahead of `origin/main` by 819
  commits.
- Finding: the query send-failure broadcaster still created a backend-shaped
  local error and called the SDK backend-event normalizer from Electron main
  for a synthetic send failure.
- Change: `ipc_query_broadcast.cjs` now creates the SDK `turn_error`
  conversation event directly with `createConversationEvent`, marks
  `source: "electron-main"`, preserves query context from
  `buildQuerySendFailure(...)`, and keeps the source event marker in
  `payload.sourceEventType`.
- Validation: focused query/main-host Jest tests, targeted backend-normalizer
  import scan, docs listing, and diff check.
- Compatibility: no migration required. Renderer IPC channel names, failure
  copy, turn/conversation context, replay clearing, overlay idle reset,
  storage, credentials, permissions, and provider policy are unchanged.

### 2026-06-18 Generic Local-Runtime Python Guidance Slice

- Worktree was clean after `43da56854` before this slice, with `main` ahead of
  `origin/main` by 818 commits.
- Product-name and runtime-boundary scans showed renderer/main product copy
  largely confined to skins/config, but Electron main's dev/source missing
  Python fallback still named the `frontend_jarvis` environment directly.
- Finding: the generic Electron host adapter should not bake in
  conda-environment-specific setup copy. The `WINDIE_PYTHON_PATH` env var
  remains a compatibility contract, but the guidance can point at the
  local-runtime Python executable generically.
- Change: reworded the fallback in
  `frontend/src/main/sidecar/local_runtime_launch_options.cjs` and added
  focused launch-plan plus main-host-skin boundary tests for the generic copy.
- Validation: focused local-runtime launch and main host skin boundary Jest
  tests, targeted stale-copy scan, docs listing, and diff check.
- Compatibility: no migration required. The env var name, launch target
  resolution order, packaged runtime copy, sidecar daemon startup, endpoint
  selection, IPC channels, credentials, permissions, storage, and provider
  policy are unchanged.

### 2026-06-18 Renderer-Local Theme Settings Wording Slice

- Worktree was clean after `09c7a65cf` before this slice, with `main` ahead of
  `origin/main` by 817 commits.
- Recent scans showed stale frontend/backend and sidecar labels reduced to
  guard strings and report history, with only a live settings reference still
  using broad frontend wording for theme editor values.
- Finding: those theme values are renderer presentation state persisted through
  renderer config; the wording should not imply a broad frontend runtime owner.
- Change: reworded the settings section reference to renderer-local theme
  editor values and added a modular boundary guard for the retired phrase.
- Validation: focused modular boundary test, targeted stale-label scan, docs
  listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only;
  renderer config persistence, theme application, settings IPC, backend
  settings sync, storage, credentials, permissions, and provider policy are
  unchanged.

### 2026-06-18 Local Runtime Sidecar Label Follow-Up Slice

- Worktree was clean after `59877a899` before this slice, with `main` ahead of
  `origin/main` by 816 commits.
- Recent commits showed a prior local runtime sidecar label cleanup, while
  current scans still found sentence-case frontend-sidecar wording in the system-state
  docs hub and setup guide plus one broad frontend packaged endpoint fallback
  label.
- Finding: those labels preserved the old frontend-owned sidecar and endpoint
  mental model in live docs even though the sidecar is the local runtime
  authority behind SDK/Electron host boundaries.
- Change: reworded the live system-state hub and platform setup guide to local
  runtime sidecar labels, changed packaged endpoint fallback wording to
  desktop-local loopback, and widened the modular boundary guard for
  sentence-case frontend-sidecar wording.
- Validation: focused modular boundary test, targeted stale-label scan, docs
  listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only;
  sidecar process startup, Python dependencies, endpoint selection, hosted
  defaults, IPC, credentials, permissions, storage, and provider policy are
  unchanged.

### 2026-06-18 Agent SDK Runtime Routing Wording Slice

- Worktree was clean after `11d0fe9e6` before this slice, with `main` ahead of
  `origin/main` by 815 commits.
- Recent commits showed the codebase already moving docs away from SDK desktop
  and frontend/backend labels, while live routing docs still used "SDK agent
  runtime" and "SDK main runtime" for Agent SDK projection, websocket send, and
  local tool routing paths.
- Finding: those labels blurred the requested split because the reusable Agent
  SDK owns event normalization/projection and tool coordination, while Electron
  main is the desktop host/local-runtime adapter and the Python sidecar is the
  executable local authority.
- Change: reworded active architecture, concepts, IPC, query-relay, renderer,
  tool, node, debug, and reference docs to Agent SDK runtime/tool-router
  wording, with host-local context where Electron main supplies desktop
  context.
- Change: added a modular boundary guard across the touched active docs so
  `SDK agent runtime`, `SDK agent-runtime`, and `SDK main runtime` do not return
  outside historical report notes.
- Validation: focused modular boundary test, targeted retired-label scan, docs
  listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only; SDK
  event normalization, local tool coordination, Electron host adapters, sidecar
  execution, backend tool-result ingress, IPC channels, storage, credentials,
  permissions, and provider policy are unchanged.

### 2026-06-18 Channel Local-Tool Runtime Wording Slice

- Worktree was clean after `21de44601` before this slice, with `main` ahead of
  `origin/main` by 814 commits.
- Recent commits showed channel docs already moving local tools toward SDK
  runtime ownership, while current channel maps still used "SDK desktop
  runtime" and "SDK agent runtime" labels for local tool routes.
- Finding: those labels blurred the requested split: SDK/main owns local-tool
  routing and result return, Python sidecar owns executable machine actions,
  and renderer remains a display consumer.
- Change: reworded `docs/channels/README.md`,
  `docs/channels/sidecar_and_tool_channels.md`, and
  `docs/channels/channel_routing_matrix.md` to SDK/main local-runtime routing
  and Python sidecar executor wording.
- Change: expanded the modular boundary guard so channel docs cannot reintroduce
  `SDK desktop runtime` or `SDK agent runtime` local-tool labels.
- Validation: focused modular boundary test, targeted channel wording scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only; SDK
  local execution, Electron local adapter behavior, sidecar daemon endpoints,
  renderer display projections, backend tool-result ingress, permissions,
  credentials, provider policy, and storage are unchanged.

### 2026-06-18 Backend-to-SDK Websocket Contract Test Naming Slice

- Worktree was clean after `c6c067c15` before this slice, with `main` ahead of
  `origin/main` by 813 commits.
- Recent scans showed active stale backend/frontend wording reduced to guard
  strings and report history, while the websocket incoming contract test file
  and current docs still referenced `FrontendBackendWebsocketContract`.
- Finding: the test behavior and description already cover the backend-to-SDK
  incoming contract, but the filename kept the retired frontend/backend mental
  model visible in docs and test targets.
- Change: renamed the test to `BackendSdkWebsocketContract.test.cjs`, updated
  current docs and boundary guard references, and guarded against the retired
  name in the source-event boundary test.
- Validation: renamed websocket contract test, focused modular boundary test,
  targeted retired-name scan, docs listing, and diff check.
- Compatibility: no migration required. This is test/docs naming cleanup only;
  backend incoming websocket contract fixtures, SDK/main payload filtering,
  renderer query behavior, IPC channels, provider policy, credentials,
  permissions, and storage are unchanged.

### 2026-06-18 Frontend Streaming Backend-Wire Docs Boundary Slice

- Worktree was clean after `799dec51c` before this slice, with `main` ahead of
  `origin/main` by 812 commits.
- Recent commits showed renderer and SDK normal-path docs already moving to
  backend-wire wording, while active concept, frontend runtime, architecture,
  inventory, IPC, and query-relay docs still used "raw backend" labels for
  stream packets/events.
- Finding: those docs described the right behavior but with stale language; the
  active renderer path is SDK/main normalization of backend-wire events before
  renderer rows, current-turn projection, and side effects.
- Change: reworded the docs to backend-wire event terminology and expanded the
  renderer source-event boundary guard to cover the active docs.
- Validation: focused modular boundary test, targeted active-doc stale wording
  scan, docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only;
  SDK/main event normalization, renderer chat projection, IPC channels,
  websocket payloads, debug raw-event listener API, credentials, permissions,
  provider policy, and storage are unchanged.

### 2026-06-18 SDK Backend-Wire Documentation Boundary Slice

- Worktree was clean after `47fd314ad` before this slice, with `main` ahead of
  `origin/main` by 811 commits.
- Recent commits showed SDK raw-event fallbacks and listener aliases already
  removed or narrowed, while SDK docs still used "raw backend" wording for
  normal current-turn projection, transport, and authoring paths.
- Finding: that wording made ordinary SDK consumers look closer to backend
  websocket packet handling than they are; public app authors should consume
  SDK streams, conversation projections, and source-event metadata, reserving
  `subscribeRawBackendEvents(...)` for debug traces and protocol tests.
- Change: reworded SDK docs to backend-wire/source-event terminology for the
  normal path and added a modular boundary guard against raw-backend wording in
  public SDK docs.
- Validation: focused modular boundary test, targeted SDK-doc stale wording
  scan, docs listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only; SDK
  public API names, debug listener behavior, backend event normalization,
  conversation projections, tool/local runtime contracts, IPC channels,
  provider policy, credentials, permissions, and storage are unchanged.

### 2026-06-18 Renderer Backend-Wire Boundary and Tool-Row Presentation Slice

- Worktree was clean after `afe1d4f4b` before this slice, with `main` ahead of
  `origin/main` by 810 commits.
- Recent commits showed renderer raw-event behavior already removed or guarded,
  while live renderer docs and a websocket contract test still used stale
  "raw backend" and "frontend/backend" labels for event ingress and command
  payload ownership.
- Finding: those labels made the renderer look closer to backend-wire event
  contracts than it is; the active path is SDK/main normalization and SDK
  conversation-event projection before renderer chat hooks. Focused validation
  also showed the renderer presentation pipeline could inject a live
  current-turn tool row next to an already-materialized SDK display tool row
  when the current-turn row had SDK tool identity but no correlation id.
- Change: reworded renderer stream docs and related test descriptions to
  backend-wire event ingress, SDK source-event boundaries, and SDK/main command
  ownership.
- Change: added a modular boundary guard that checks the current renderer docs
  and contract tests for the retired labels while preserving the explicit SDK
  raw-event debug listener test.
- Change: updated renderer message presentation dedupe to match same-turn tool
  rows by SDK-shaped tool identity before injecting current-turn live messages.
- Validation: focused modular boundary test, ChatInterface wiring test,
  frontend websocket contract test, targeted stale-label scan, docs listing,
  and diff check.
- Compatibility: no migration required. Websocket payload schemas, SDK event
  projections, IPC channels, debug raw-event listener API, credentials,
  permissions, provider policy, and storage are unchanged. Renderer behavior is
  narrowed to avoid duplicate visible tool rows when SDK display rows already
  represent the same same-turn tool event.

### 2026-06-18 Tool-Development Desktop-Host Wording Slice

- Worktree was clean after `575c24802` before this slice, with `main` ahead of
  `origin/main` by 809 commits.
- Recent scans showed current docs/source mostly reduced to guards or report
  history, with one live tool-development line still describing client-manifest
  handoff as SDK/Electron frontend behavior.
- Finding: that guide blurred the Electron desktop host boundary that assembles
  and sends `agent_definition.tools.client_manifest`.
- Change: reworded the guide to SDK/Electron desktop host and expanded the
  modular boundary guard for the retired phrase.
- Validation: focused modular boundary Jest, targeted stale phrase scan, docs
  listing, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only;
  client manifest shape, Electron host assembly, SDK agent definitions, tool
  schemas, local-runtime dispatch, credentials, permissions, provider policy,
  and storage are unchanged.

### 2026-06-18 Orientation Docs Desktop-Host Wording Slice

- Worktree was clean after `9254ea3e5` before this slice, with `main` ahead of
  `origin/main` by 808 commits.
- Recent commits showed first-read runtime owners split, while concepts,
  installation, SDK agent-definition, and mobile planning docs still used broad
  Electron frontend wording for the desktop app boundary, backend parity
  boundary, or SDK client independence.
- Finding: those docs blurred Electron main host, renderer, and SDK/local
  runtime responsibilities, and the mobile plan still referenced the removed
  renderer `ToolExecutionService` path.
- Change: reworded those docs to Electron desktop app, Electron main host,
  renderer, desktop host/renderer/sidecar parity, and SDK tool coordinator
  ownership; expanded the modular boundary guard for the retired phrases.
- Validation: focused modular boundary Jest, docs listing, targeted stale
  phrase scan, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only;
  SDK agent definitions, Electron main inputs, renderer UI, sidecar execution,
  tool dispatch, IPC channels, credentials, permissions, provider policy, and
  storage are unchanged.

### 2026-06-18 First-Read Runtime Boundary Wording Slice

- Worktree was clean after `998538469` before this slice, with `main` ahead of
  `origin/main` by 807 commits.
- Recent commits showed local-runtime sidecar labels and cross-runtime docs
  aligned, while the documentation hub still described Electron frontend as a
  single owner for desktop windows, renderer UI, preload IPC, config, and SDK
  host context. The browser hub still called the Browser Use adapter the
  old sidecar ownership label.
- Finding: those first-read docs blurred Electron main desktop host duties,
  renderer UI duties, and local-runtime sidecar adapter duties.
- Change: split the docs hub runtime bullets into hosted backend, Electron main
  desktop host, renderer UI, and Python sidecar owners; reworded the browser
  overview to local-runtime sidecar ownership.
- Change: expanded `ModularRefactorCompletionBoundary.test.ts` to guard the
  retired first-read and browser-adapter phrases.
- Validation: focused modular boundary Jest, docs listing, targeted stale
  phrase scan, and diff check.
- Compatibility: no migration required. This is docs/test guardrail only;
  Electron main IPC, renderer UI state, sidecar execution, browser JSON-RPC,
  SDK projections, tool schemas, credentials, permissions, provider policy, and
  storage are unchanged.

### 2026-06-18 Local-Runtime Sidecar Docs Label Slice

- Worktree was clean after `4faa92f42` before this slice, with `main` ahead of
  `origin/main` by 806 commits.
- Recent commits showed cross-runtime ownership and local-runtime wording
  already aligned, while sidecar hub titles, frontmatter, cross-links, routing
  tables, and related tool/memory/browser/channel docs still exposed the
  sidecar as a frontend-owned surface.
- Finding: retired frontend-owned sidecar labels conflicted with the active
  local-runtime sidecar boundary, even though the `docs/frontend/sidecar/...`
  paths remain real repository paths.
- Change: mechanically renamed visible labels and links to "Local Runtime
  Sidecar" across current docs while preserving all existing paths and anchors.
- Change: added a docs-wide modular boundary guard that fails if the retired
  visible label returns to current markdown docs.
- Validation: targeted label scan confirmed no current docs/test markdown kept
  the retired visible label before adding the guard.
- Compatibility: no migration required. This is docs/test label cleanup only;
  docs paths, sidecar process names, JSON-RPC methods, tool schemas,
  local-runtime dispatch, IPC channels, credentials, permissions, provider
  policy, and storage are unchanged.

### 2026-06-18 Cross-Runtime Contract Wording Slice

- Worktree was clean after `4b001585e` before this slice, with `main` ahead of
  `origin/main` by 805 commits.
- Recent commits showed manifest, backend event, renderer config, and provider
  settings wording already aligned, while architecture, backend inventory,
  tool-contract, debug, security, install, incident, evidence, validation,
  sidecar-browser, landing, and reference docs still used retired
  three-runtime shorthand for ownership and drift.
- Finding: those docs flattened SDK/main, renderer, desktop host, sidecar, and
  backend responsibilities into broad client/server labels, including stale
  renderer tool-runner language in incident routing and backend inventory
  contract tables.
- Change: reworded the affected docs to backend/client contracts,
  SDK/renderer consumers, SDK/main local-runtime dispatch, renderer
  display/state, desktop host boundaries, and sidecar execution while
  preserving real source paths and removed-helper filename references.
- Change: expanded `ModularRefactorCompletionBoundary.test.ts` to scan the
  touched docs and guard the retired cross-runtime shorthand and renderer
  tool-runner ownership labels.
- Validation: targeted stale wording scan over docs/tests confirmed the retired
  phrases are limited to the boundary guard or intentional removed-helper
  filename references.
- Compatibility: no migration required. This is docs/test guardrail only;
  websocket schemas, SDK projections, renderer display, desktop host IPC,
  local-runtime dispatch, sidecar JSON-RPC, tool schemas, credentials,
  permissions, provider policy, and storage are unchanged.

### 2026-06-18 Desktop Client/Local-Runtime Tool Manifest Wording Slice

- Worktree was clean after `79ba0450d` before this slice, with `main` ahead of
  `origin/main` by 804 commits.
- Recent commits showed backend event, renderer config, and provider settings
  wording already aligned, while tool manifest hubs, ADR labels, extension and
  plugin routing, IPC config persistence wording, and one renderer settings
  test label still used frontend-specific ownership terminology.
- Finding: those docs and the test label described tool-name parity,
  executable manifests, local execution, and config persistence with stale
  frontend wording even though the current owners are desktop
  client/local-runtime manifests, backend/client-local parity, renderer
  settings, and desktop UI config persistence.
- Change: reworded the affected docs and test label while preserving real
  `frontend/...` source paths and compatibility names such as
  `save-frontend-config` and `frontend-config.json`.
- Change: expanded `ModularRefactorCompletionBoundary.test.ts` to include the
  touched docs and guard the retired manifest/local-execution/config labels.
- Validation: targeted stale wording scan over docs/tests confirmed the retired
  phrases only remain inside the boundary guard.
- Compatibility: no migration required. This is docs/test guardrail only; tool
  schemas, generated manifest artifacts, plugin layout, sidecar execution,
  IPC channels, config storage, credentials, permissions, provider policy, SDK
  projections, and backend validation are unchanged.

### 2026-06-18 Backend Event Consumer Wording Slice

- Worktree was clean after `60bb203f1` before this slice, with `main` ahead of
  `origin/main` by 803 commits.
- Recent commits showed backend stream-consumer and renderer config wording
  already converging, while backend API route, formatter, message-type, and
  tool-turn docs still used frontend-specific event consumer and display
  terminology.
- Finding: backend event-producing docs still described websocket event
  consumers, visible event names, error display, and provider/settings
  validation tests in frontend-specific terms even though the backend owns the
  producer contract and SDK/renderer/client code consumes it.
- Change: reworded those docs to SDK/renderer consumers, client-visible event
  names, renderer display paths, and renderer settings tests.
- Change: expanded `ModularRefactorCompletionBoundary.test.ts` to include the
  touched backend API/formatter/message-type/reference docs and guard the stale
  event-consumer phrases.
- Validation: focused modular boundary Jest coverage; targeted stale
  event-consumer wording scan over current docs; docs listing; `git diff
  --check`.
- Compatibility: no migration required. This is docs/test guardrail only;
  websocket event names, outgoing schemas, SDK projections, renderer display,
  settings payloads, credentials, permissions, provider policy, local-runtime
  dispatch, and storage are unchanged.

### 2026-06-18 Renderer/Desktop UI Config State Wording Slice

- Worktree was clean after `e2217374d` before this slice, with `main` ahead of
  `origin/main` by 802 commits.
- Recent commits showed desktop UI config modules, helpers, and credential
  docs already moved away from broad frontend ownership, while current renderer
  and inventory docs still described config sync, local-runtime argument
  propagation, camera toggles, disk persistence, and patch validation with
  broad frontend config wording.
- Finding: current renderer, frontend inventory, preload, MCP, backend config,
  and self-edit planning docs still blurred renderer-owned settings state,
  Electron desktop UI config persistence, and backend client-settings patch
  validation. Compatibility names such as `frontend-config.json`,
  `load-frontend-config`, and `save-frontend-config` remain real storage/IPC
  contracts.
- Change: reworded those docs to renderer config, desktop UI config handlers,
  desktop UI config persistence, renderer-to-backend settings sync, and
  client-settings patch validation while preserving real legacy-named channels
  and filenames.
- Change: expanded `ModularRefactorCompletionBoundary.test.ts` to include the
  touched config-state docs and guard the stale config-state ownership phrases.
- Validation: focused modular boundary Jest coverage; targeted stale
  config-state wording scan over current docs; docs listing; `git diff --check`.
- Compatibility: no migration required. This is docs/test guardrail only;
  renderer config keys, localStorage, disk filename, IPC channels, backend
  `update-settings` payloads, local-runtime argument shaping, credentials,
  permissions, provider policy, SDK projections, and storage are unchanged.

### 2026-06-18 Renderer/Client-Settings Provider Credential Wording Slice

- Worktree was clean after `1005bdaf9` before this slice, with `main` ahead of
  `origin/main` by 801 commits.
- Recent commits showed renderer/main config naming already moved toward
  desktop UI config and renderer settings ownership, while credential and
  provider docs still used stale broad frontend wording for provider
  API-key overrides and client settings patch routing.
- Finding: provider credential, backend config, security, channel, concept, and
  renderer settings docs still called API-key overrides, settings patch
  routing, and local config persistence broad frontend concerns in places where
  the active owner is renderer settings plus backend client-settings
  validation. Compatibility names such as `frontend-config.json`
  and `load-frontend-config` remain real wire/storage names.
- Change: reworded those docs to renderer-managed provider overrides, renderer
  settings, client settings patches, and desktop UI config persistence while
  preserving real `frontend/src/...` paths and compatibility filenames/channels.
- Change: expanded `ModularRefactorCompletionBoundary.test.ts` to include the
  touched provider/security/config/channel/concept/settings docs and guard the
  stale credential/settings ownership phrases.
- Validation: focused modular boundary Jest coverage; targeted stale
  credential/settings wording scan over docs; docs listing; `git diff --check`.
- Compatibility: no migration required. This is docs/test guardrail only;
  provider API-key fields, backend config validation, renderer config storage,
  IPC channels, persisted filenames, credentials, permissions, provider policy,
  websocket events, SDK projections, and storage are unchanged.

### 2026-06-18 Backend Stream/Runtime Consumer Wording Slice

- Worktree was clean after `b5e57401d` before this slice; `git pull --ff-only`
  reported `Already up to date`.
- Recent commits showed continued SDK/raw-event and docs ownership cleanup, so
  the next progress slice targeted remaining backend docs that still routed
  stream, token, compaction, prompt-transparency, and tool-result consumer
  semantics through stale frontend wording.
- Finding: backend query lifecycle, interaction loop, prompt metadata,
  compaction, observability, sender, formatter, provider, debug, memory, and
  credential docs still used stale frontend-owned wording for stream consumers,
  prompt transparency, request/result ordering, local-runtime result formatting,
  and token tracking.
- Change: reworded those references to backend producer contracts, SDK
  projections, renderer consumers, and SDK/main local-runtime dispatch while
  preserving real `frontend/src/...` source roots and compatibility file names.
- Change: expanded `ModularRefactorCompletionBoundary.test.ts` to include the
  touched backend/security/debug/memory docs and guard the stale frontend-owned
  consumer phrases.
- Validation: focused modular boundary Jest coverage; `bin\windie.cmd docs
  list`; targeted stale consumer-wording scan over docs; `git diff --check`.
- Compatibility: no migration required. This is docs/test guardrail only;
  websocket events, SDK projections, renderer persistence, local-runtime
  dispatch, credentials, permissions, provider policy, and storage are
  unchanged.

### 2026-06-16 Renderer Skin/Config Slice

- Worktree was clean on `main` at `de7713f72`.
- Recent commits show active renderer/backend boundary cleanup, including narrowed SDK exports and current-turn side-effect isolation.
- `docs/architecture/frontend_architecture.md` says renderer should consume app runtime facades and SDK projections, while renderer feature code should remain UI/display oriented.
- Finding: settings feature components embed WindieOS product copy and runtime wording directly, including browser, workspace, tool-log, and tool catalog descriptions. This works today, but it keeps the renderer from reading as a generic chat desktop UI plus a WindieOS skin/config.
- Decision: introduce a renderer skin module and route settings copy through it without changing behavior.
- Change: added `windieDesktopSkin` for renderer settings copy, local/cloud tool catalog presentation, browser/workspace labels, and display-safe tool acceptance runtime labels.
- Change: updated Agent, General, Browser, and Workspace settings tabs to consume the skin/config boundary.
- Change: added a renderer skin/config boundary test to prevent settings components from reintroducing hard-coded product copy or raw sidecar labels.
- Validation: focused settings and skin boundary tests pass.
- Validation: `git diff --check` passes.
- Fresh inspection: old hard-coded settings copy no longer appears in the touched settings tabs. The only matching settings-area product string left by the inspection is `useMemorySettingsActions.js`, which belongs to a later memory settings copy sweep.

### 2026-06-16 Renderer Memory Skin/Config Slice

- Worktree after the previous commit was ahead of origin with unrelated sidecar/computer-tool edits in `frontend/src/main/python/tools/computer/keyboard_tool.py`, `frontend/src/main/python/tools/computer/scroll_tool.py`, and `tests/sidecar/test_keyboard_tool.py`; these are out of scope and preserved.
- Finding: memory settings and the memory panel still hard-coded WindieOS copy and destructive-action labels in renderer feature modules.
- Decision: extend `windieDesktopSkin` for memory settings and panel copy while leaving `DesktopMemoryRuntimeClient` command routing unchanged.
- Change: memory settings destructive confirmation, success, failure, pending, and active-user messages now come from the renderer skin.
- Change: memory panel heading, empty states, search placeholder, close/toggle labels, and load/delete fallback messages now come from the renderer skin.
- Change: renderer skin boundary test now covers memory settings, the memory action hook, and the memory panel.
- Validation: focused renderer skin, memory panel, and settings tests pass.
- Validation: `git diff --check` passes.
- Fresh inspection: old hard-coded memory/product copy is now limited to `windieDesktopSkin` and the boundary test; memory settings and panel consumers read from the skin.

### 2026-06-16 Renderer Onboarding/Chat Skin Slice

- Finding: onboarding, chat empty state, chat send/replay failure messages, and the live-turn runtime fallback still embedded WindieOS product copy directly in renderer modules.
- Decision: extend `windieDesktopSkin` for onboarding, chat, and runtime fallback copy while preserving the same rendered strings and command flow.
- Change: onboarding dialog label, start button, permission-empty, permission-loading, and missing-permissions messages now come from the renderer skin.
- Change: chat empty title and renderer-local send/replay failure messages now come from the renderer skin.
- Change: the live-turn runtime fallback error message now comes from the renderer skin.
- Change: renderer skin boundary test now covers onboarding/chat/runtime copy consumers.
- Validation: focused renderer skin, onboarding, chat send, chat wiring, and live-turn runtime tests pass.
- Validation: `git diff --check` passes.
- Fresh inspection: moved onboarding/chat/runtime product strings no longer appear in renderer consumers; remaining WindieOS strings are the skin plus voice/audio implementation identifiers and comments.

### 2026-06-16 Main Host Permission Skin Slice

- Compaction recovery: recent commits and current uncommitted work were inspected before continuing. Sidecar `process` and screenshot `ToolResult` refactors landed separately while this slice was in progress and were treated as unrelated context.
- Finding: `main/index.cjs` still embedded product browser-automation and macOS automation permission fallback copy inside the Electron composition root.
- Decision: introduce a main host skin/config module for product-specific host copy while keeping OS/window/permission adapter logic in main.
- Change: browser automation local-backend, Chromium install, runtime unavailable, install failure, and browser-open failure messages now come from the main host skin.
- Change: macOS System Events Automation probe and request fallback messages now come from the main host skin.
- Change: added a main host skin boundary test to prevent these product strings from returning to `main/index.cjs`.

### 2026-06-16 Main Permission Service Skin Slice

- Concurrent-work recovery: a sidecar shell-command `ToolResult` refactor landed separately while this slice was in progress and was treated as unrelated context.
- Finding: browser automation and macOS System Events Automation permission service modules still embedded WindieOS dialog, remediation, browser-open, and ready-state copy.
- Decision: pass `mainHostSkin` through the permission IPC dependency boundary and let permission services consume injected skin copy with generic fallback text.
- Change: browser automation install dialog, profile-open prompt, browser-open fallback, retry fallback, and ready-state message now resolve from the main host skin on the app path.
- Change: macOS Automation probe/request remediation text now resolves from the main host skin on the app path.
- Change: main host skin boundary test now covers the browser and automation permission service modules so WindieOS copy stays in the skin.

### 2026-06-16 Main OS Permission Service Skin Slice

- Concurrent-work recovery: sidecar daemon and tool registry docs/code changes were present in the working tree and treated as unrelated context.
- Finding: screen recording, Accessibility/input control, microphone, and workspace picker permission services still embedded WindieOS product copy directly.
- Decision: continue using the injected `mainHostSkin` dependency, with generic service fallbacks, for the remaining OS permission-service messages.
- Change: screen recording System Settings remediation, waiting, registration, and verification messages now resolve from the main host skin on the app path.
- Change: Accessibility/input control remediation, microphone OS privacy remediation, and workspace picker title now resolve from the main host skin on the app path.
- Change: main host skin boundary test now covers these remaining permission service modules.

### 2026-06-16 Main Query Event Skin Slice

- Finding: `ipc_query_events.cjs` builds generic query failure/interruption events but embedded WindieOS disconnect copy directly.
- Decision: keep the event builders generic by accepting optional copy and let `ipc.cjs` supply `mainHostSkin.queryEvents` on the app path.
- Change: query send failure and backend disconnect interruption messages now resolve from the main host skin in `ipc.cjs`.
- Change: direct event-builder fallbacks use generic app wording when no skin copy is injected.
- Change: main host skin boundary test now covers query event builders.

### 2026-06-16 Main Host Identity Skin Slice

- Finding: SDK wake-up agent name and tray tooltip still embedded WindieOS identity directly in main host modules.
- Decision: add host identity copy to `mainHostSkin` and thread it through existing main/bootstrap dependencies.
- Change: SDK `wakeUp` agent name now reads `mainHostSkin.identity.sdkAgentName`.
- Change: tray tooltip now reads `mainHostSkin.identity.trayTooltip` with a generic fallback in the window runtime.
- Follow-up: MCP runtime identity had separate extension-runtime caller implications and was handled in the next slice.

### 2026-06-16 Main MCP Identity Skin Slice

- Finding: the extension MCP runtime default client info still embedded WindieOS identity.
- Decision: make the MCP runtime default generic, add `mainHostSkin.identity.mcpClientInfo`, and thread that copy through main's MCP refresh/toggle paths.
- Change: MCP stdio client initialization now uses generic default client info unless app code injects a product identity.
- Change: Electron main supplies `mainHostSkin.identity.mcpClientInfo` when refreshing MCP servers directly or through the SDK agent adapter.
- Change: MCP runtime tests now prove configured client info reaches the initialize request.
- Validation gap: `McpControl.test.cjs` was attempted but this environment lacks `sqlite3`, which that test's diagnostics helper requires.

### 2026-06-16 Main Log Prefix Skin Slice

- Concurrent-work recovery: backend cache cleanup changes were staged in the working tree and treated as unrelated context.
- Finding: the shared layer log sink embedded `[WindieOS]` as its default session/error prefix.
- Decision: make the log sink default generic and pass `mainHostSkin.identity.logPrefix` through app/runtime call paths that should keep WindieOS log branding.
- Change: main console logging, main-window renderer console banners, and Windie CLI layer-log helpers now pass `[WindieOS]` explicitly.
- Change: layer log sink tests now pass app-specific prefixes explicitly, and the host boundary test guards that the reusable sink no longer embeds `[WindieOS]`.
- Validation gap: `WindieCli.test.cjs` was attempted but this environment lacks `sqlite3`, which its conversation export tests require.

### 2026-06-16 Main Bundled Runtime Guidance Skin Slice

- Compaction recovery: recent commits and the current worktree were inspected before continuing. Existing backend/sdk deletions and docs updates were present and treated as unrelated work.
- Finding: wakeword and SDK local-runtime launch helpers still embedded WindieOS reinstall guidance for missing packaged Python/runtime assets.
- Decision: keep launch helpers generic and inject WindieOS packaged-runtime copy from `mainHostSkin` through main composition paths.
- Change: bundled Python and wakeword executable reinstall guidance now lives in `mainHostSkin.bundledRuntime`.
- Change: wakeword startup/process-error helpers and SDK local-runtime launch options use generic app fallbacks unless host copy is provided.
- Change: main window wakeword wiring and SDK local-runtime launch planning pass the WindieOS bundled-runtime copy on app paths.
- Validation: focused wakeword, local-runtime launch, main-window runtime, and host-skin boundary tests pass.

### 2026-06-16 Main Local Browser/OAuth Skin Slice

- Finding: local browser warmup and OpenAI Codex OAuth token-exchange callback helpers still embedded WindieOS product copy directly.
- Decision: keep helper modules generic and inject WindieOS copy from `mainHostSkin` through existing main composition/IPC paths.
- Change: browser warmup explanation copy now lives in `mainHostSkin.localBackend` and is passed through `initializeLocalBackendBridge`.
- Change: OpenAI Codex OAuth token-exchange callback copy now lives in `mainHostSkin.openAICodexOAuth` and is passed through OAuth IPC handler registration.
- Validation: focused local-backend bridge, OAuth, OAuth IPC handler, main-window runtime, and host-skin boundary tests pass.
- Fresh inspection: `frontend/src/main` now contains WindieOS product naming only in `main_host_skin.cjs`.

### 2026-06-16 SDK Private Helper Export Slice

- Compaction recovery: recent commits and the current worktree were inspected before continuing. A staged SDK export cleanup was present and treated as the active SDK boundary slice; broader generated CJS line-ending noise was left unstaged.
- Finding: websocket URL normalization, capability summarization, and compacted-replay event parsing were exported from their deep SDK modules even though current callers use higher-level SDK contracts.
- Decision: keep those helpers private to their owning modules and protect the public package boundary with a focused CJS export test.
- Change: `normalizeWsUrl`, `summarizeAgentDefinitionCapabilities`, and `compactedReplayFromEvent` are now module-private helpers.
- Change: the CJS package output no longer publishes those helper symbols, while public session, manifest stamping, and compacted replay snapshot APIs remain exported.
- Validation: focused package-boundary/private-export tests pass.

### 2026-06-16 Renderer Voice Naming Slice

- Worktree recovery: new SDK context-enrichment export cleanup edits were present and treated as unrelated to this renderer slice.
- Finding: renderer voice capture internals still used WindieOS naming in an AudioWorklet processor id/class and a voice hook comment.
- Decision: rename those internals to generic desktop-agent terms without changing voice capture behavior.
- Change: the audio capture worklet processor id/class now uses generic desktop-agent naming.
- Change: the voice mode hook describes the backend transcription websocket without product naming.
- Change: renderer skin boundary tests now cover voice capture internals.
- Validation: focused renderer skin, voice runtime boundary, and audio processor tests pass.
- Fresh inspection: `frontend/src/renderer` product naming now appears only in `windieDesktopSkin.js`.

### 2026-06-16 SDK Default Agent Name Slice

- Finding: SDK agent-definition helpers still used WindieOS/Windie display names as defaults even though Electron main now passes product identity from `mainHostSkin`.
- Decision: keep backend contract ids/modes unchanged, but make SDK fallback display names generic so custom hosts do not inherit WindieOS presentation copy.
- Change: `buildAgentDefinition()` now defaults to `Desktop Agent`.
- Change: `WindieClient.wakeUp()` now defaults the handshake agent name to `Agent` unless a caller supplies `name`.
- Validation: focused SDK default-name and package-boundary tests pass.
- Validation gap: the full `WindieSdkClient.test.ts` file was attempted, but two existing local-runtime provider tests failed because their temporary `python-in-env` launcher was unavailable in this environment.

### 2026-06-16 Renderer Browser Control Skin Slice

- Compaction recovery: recent commits, current worktree state, docs routing, and the plan report were inspected before continuing.
- Finding: `ChatBrowserSessionControl` still embedded dedicated Windie browser copy directly in a chat component even though renderer product copy should be skin-owned.
- Decision: extend `windieDesktopSkin.chat` with browser-session labels and titles while preserving the same rendered control behavior.
- Change: chat browser-session title, connect/unavailable/loading labels, tab labels, carousel labels, and disconnect label now read from the renderer skin.
- Change: renderer skin boundary tests now cover the chat browser control so product browser copy does not return to the component.
- Validation: focused browser-control and renderer skin boundary tests pass.
- Fresh inspection: renderer product naming again appears only in `windieDesktopSkin.js`.

### 2026-06-16 Renderer Conversation Retry Boundary Slice

- Finding: dashboard recent-chat retry policy matched local backend and sidecar daemon error strings directly in a feature utility.
- Decision: keep feature retry state generic and let the desktop conversation library facade classify runtime-specific transient metadata-list errors.
- Change: `DesktopConversationLibraryClient.isTransientMetadataListError(...)` owns local-runtime/sidecar transient error matching for conversation metadata loads.
- Change: `shouldRetryRecentConversationsLoad(...)` now accepts an injected transient-error classifier, with only generic network timeout defaults.
- Validation: focused dashboard conversation load, desktop conversation library, and dashboard hook tests pass.

### 2026-06-16 Main Generic Adapter Error Slice

- Finding: main-process adapter code still used product-specific wording for a sidecar launch fallback and trusted artifact-image rejection.
- Decision: make those reusable Electron-host/security-adapter messages generic; product-specific copy remains in `mainHostSkin` where needed.
- Change: sidecar auto-launch fallback now says the desktop sidecar daemon is unavailable.
- Change: clipboard/image context-menu artifact URL validation now reports "trusted artifact image" without Windie branding.
- Validation: focused clipboard image, image context menu, and main host skin boundary tests pass.

### 2026-06-16 Main Agent SDK Command Helper Slice

- Concurrent-work recovery: unrelated backend remote-tool/schema docs changes appeared in the worktree and were treated as out of scope.
- Finding: the strict `windie:invoke` command allowlist helper and dependency surface still used Windie-specific internal names and validation copy even though it is a generic Electron-host adapter over SDK commands.
- Decision: preserve the existing `windie:invoke` wire contract and SDK command constants, but rename the internal helper/dependency surface to generic agent SDK terms.
- Change: Electron main now imports `handleAgentSdkInvoke(...)` and injects its product-specific `ensureWindieAgent(...)` function as the generic `ensureAgent` dependency.
- Change: the command helper's internal table is now `buildAgentSdkCommandHandlers(...)`, validation/fallback errors say "Agent SDK command", and stale helper-name docs route to the current command transport contract.
- Validation: focused SDK IPC boundary, replay command, desktop conversation library, and touched docs-index routing tests pass.
- Validation gap: the full `WindieDocsIndex.test.cjs` suite was attempted and still has unrelated routing failures outside this slice; the single touched docs-index case passes.

### 2026-06-16 Renderer Agent SDK Command Helper Slice

- Concurrent-work recovery: recent commits and uncommitted work were inspected before continuing; a backend remote-wrapper cleanup landed separately and remaining Windows CLI docs edits were treated as out of scope.
- Finding: renderer app-runtime facades and the desktop conversation store imported `windieCommandInvokeClient.ts` / `invokeWindieCommand(...)`, even though the helper is a generic desktop UI adapter over SDK-shaped commands.
- Decision: keep the `window.windie` / `windie:invoke` preload and IPC wire contract unchanged, but rename the renderer helper and facade calls to generic agent SDK wording.
- Change: `windieCommandInvokeClient.ts` is now `agentSdkCommandInvokeClient.ts`; the exported helper is `invokeAgentSdkCommand(...)`, and its fallback error says "Agent SDK command".
- Change: renderer app-runtime clients, the desktop conversation store adapter, focused tests, and renderer transport docs now use the generic helper name and route stale old-helper searches to the current contract doc.
- Validation: focused renderer runtime boundary, desktop runtime transport, live-turn, settings, voice, memory, conversation library, conversation store, and modular completion boundary tests pass.

### 2026-06-16 Renderer Internal Marker Naming Slice

- Compaction recovery: recent commits, current uncommitted work, and the active renderer marker diff were inspected before continuing. The newer backend screenshot-grounding change is out of scope for this renderer-only slice.
- Finding: renderer-private state markers still used Windie-specific names for onboarding readiness, settings model-list request guarding, wakeword capture retry state, and replay-send error tagging.
- Decision: rename only non-contract internal markers to generic desktop-agent terms while preserving public preload/IPC names, product skin copy, and persisted app keys.
- Change: onboarding readiness, dashboard model-list request guarding, wakeword capture guard storage, and replay-send error tagging now use generic local names.
- Change: renderer skin boundary tests now guard these private marker names so product-specific internals do not reappear outside the skin/config boundary.

### 2026-06-16 Main Private Marker Naming Slice

- Finding: Electron main-private object markers still used Windie-specific names for console stream guards, console log wrapping, renderer-console attachment, pending dashboard collapse, and screenshot-suppression restore bounds.
- Decision: rename only host-private markers to generic desktop-agent terms while preserving public IPC channels, environment variables, product data paths, and icon/runtime filenames.
- Change: layer-log guard keys, renderer-console attachment state, pending chat-pill collapse state, and screenshot restore-bound state now use generic private keys.
- Change: the reusable layer-log sink now reports unknown log layers with generic desktop wording.
- Change: main host boundary tests now guard these private marker names and the generic layer-log fallback.

### 2026-06-16 Main Local Runtime Bridge Wording Slice

- Worktree recovery: unrelated backend rehydrate/docs/changelog edits were present while this slice was in progress and were preserved outside the main bridge commit.
- Finding: the local backend bridge is an Electron host adapter over SDK-owned local runtime lifecycle, but its reusable resolver/RPC/tool-execution fallback errors still said "Windie SDK local runtime".
- Decision: keep the SDK lifecycle/resolver contracts, provider ids, IPC channels, hosted endpoints, and product paths unchanged while making fallback wording generic.
- Change: local runtime resolver, RPC-support, and tool-execution fallback errors now say "Agent SDK local runtime".
- Change: the main host boundary test now prevents the old bridge wording from returning outside product skin/config.

### 2026-06-16 Main IPC SDK Runtime Wording Slice

- Finding: main IPC runtime logs still described generic SDK connection, wake-up, and query-send failures with Windie-specific SDK/agent wording.
- Decision: preserve public SDK class names, imports, IPC channels, and runtime function names for this narrow slice, but make reusable main-host log messages generic.
- Change: backend connection, wake-up success, and query-send failure logs now say "Agent SDK runtime".
- Change: the main SDK runtime boundary test now prevents those old branded main-host log strings from returning.

### 2026-06-16 Main IPC SDK Customer Identifier Slice

- Worktree recovery: unrelated backend vision/tool-execution edits were present while this slice was in progress and were preserved outside the main IPC commit.
- Finding: main IPC had already moved behavior behind generic SDK command boundaries, but its local client/agent lifecycle variables and exported local-runtime resolver helpers still used Windie-specific names.
- Decision: rename only Electron-main-local identifiers to generic agent/client terms while preserving public `WindieClient`/`WindieAgent` SDK APIs, the `windie:*` IPC wire contract, backend endpoints, and host skin identity.
- Change: main IPC now uses `agentClient`, `activeAgent`, `pendingAgentStartPromise`, `agentWebSocketImpl`, `createElectronAgentClient`, `getAgentClient`, `startAgent`, `ensureAgent`, `getKnownAgentLocalRuntime`, and `ensureAgentLocalRuntime`.
- Change: the SDK command helper diagnostic state now receives a generic `agent` readiness field.
- Change: main IPC boundary tests now assert the generic local names and prevent old Windie-specific local identifiers from returning.

### 2026-06-16 SDK Diagnostic Wording Slice

- Worktree recovery: after the main IPC commit, recent commits and the clean worktree were inspected; a concurrent backend tool-shape commit had landed and was treated as already integrated context.
- Finding: SDK internals still emitted Windie-specific wording in diagnostics, request failures, local-runtime errors, managed-backend session logs, compaction debug logs, and model-selection validation owner strings.
- Decision: keep public `WindieClient`/`WindieAgent` class, file, and package API names unchanged, but make private/runtime diagnostic text generic so the SDK reads as the reusable agent runtime boundary.
- Change: SDK source and checked-in CJS output now use Agent SDK wording for websocket listener support, managed backend session lifecycle, hosted/local request failures, sidecar discovery/local-tool errors, local runtime capability failures, memory/title/backend processing warnings, compaction debug logs, and model selection validation.
- Change: focused SDK tests now expect the generic diagnostic wording.

### 2026-06-16 Renderer Markdown Provider Boundary Slice

- Worktree recovery: after the SDK diagnostics commit, recent commits and the clean worktree were inspected before continuing.
- Finding: renderer markdown normalization still accepted model/provider identity so it could special-case provider transport artifacts during display rendering.
- Decision: keep markdown and math rendering in the renderer, but make transport-artifact cleanup provider-agnostic and stop threading provider/model identity through `MarkdownMessage`.
- Change: `resolveLlmOutputContract(...)` now normalizes escaped transport artifacts through a generic option and no longer returns provider/model metadata.
- Change: `buildMarkdownRenderModel(...)`, `MarkdownMessage`, and `MessageContent` no longer pass provider/model identity into the markdown display path.
- Change: markdown/output contract tests now cover provider-free assistant rendering and escaped transport cleanup.

### 2026-06-16 Renderer Tool Stream Shim Deletion Slice

- Worktree recovery: unrelated schema/docs/package changes appeared while continuing and were preserved outside this slice.
- Finding: `useChatStreamToolHandlers` was a no-op renderer adapter that only acknowledged SDK tool events after tool display moved to SDK current-turn projections.
- Decision: delete the empty hook/test and keep SDK tool-event acknowledgement directly in `useChatStream`, so the renderer has no separate tool display handler abstraction.
- Change: chat stream dispatch now returns handled for tool call/output/bundle events with an inline SDK-projection ownership note.
- Change: renderer chat runtime boundary tests now assert the old no-op hook remains deleted and that SDK live-turn side effects still own tool rows.

### 2026-06-16 SDK Private Transport Naming Slice

- Worktree recovery: recent commits and remaining unrelated schema/docs/package worktree edits were inspected and preserved outside this SDK slice.
- Finding: SDK transport modules still used Windie-specific private listener helper type names and two Windie-specific internal session failure messages even though public transport export names remain intentionally stable.
- Decision: rename only private event-map/listener helper types and private diagnostics to generic agent-session wording, leaving exported `WindieAgentSession`/`ManagedWindieAgentSession` names untouched.
- Change: `WindieAgentSession.ts` and `ManagedWindieAgentSession.ts` now use `AgentSessionEventMap`, `AgentSessionEventName`, and `AgentSessionListener` for private listener plumbing.
- Change: checked-in CJS output now reports generic Agent SDK session failures for pre-handshake close and managed send failures.

### 2026-06-16 SDK Managed Endpoint Validation Slice

- Worktree recovery: after the SDK private transport naming commit, recent commits and remaining unrelated schema/docs/package worktree edits were inspected and preserved outside this SDK slice.
- Finding: the managed session endpoint validation diagnostic still said "Managed Windie agent endpoint", and the invalid endpoint path left a managed-backend connection waiter timeout alive after synchronous socket creation failure.
- Decision: keep public managed Windie session exports unchanged, make the endpoint diagnostic generic, and let the SDK managed-backend runtime reject connection waiters immediately when socket creation fails.
- Change: managed endpoint validation now reports "Managed agent endpoint requires backendUrl or wsUrl".
- Change: `ManagedBackendSession.ensureConnected(...)` now clears/rejects waiters when `connect({ force: true })` throws before a socket exists.
- Change: the websocket contract test covers the invalid endpoint path and asserts the generic diagnostic without leaking an open connection waiter.

### 2026-06-16 SDK Default Agent ID Slice

- Worktree recovery: recent commits and concurrent backend/client-contract worktree edits were inspected before continuing, and the dirty backend/sidecar/docs contract files were left outside this SDK slice.
- Finding: SDK fallback display names were generic, but generated default agent IDs still used `windie-default` and `windie-agent-*` when callers did not supply an explicit ID.
- Decision: keep public `WindieClient`/`WindieAgent` names and make
  SDK-generated default IDs generic. The temporary backend `windie_default`
  bridge recorded by this slice was later removed, so the live contract now
  accepts only the generic `default` mode.
- Change: `buildAgentDefinition()` now defaults to `agent-default`.
- Change: `WindieClient.wakeUp()` now generates `agent-*` IDs when `agentId` is omitted.
- Change: SDK tests and the hosted runtime docs now describe the generic generated IDs.

### 2026-06-16 Preload SDK Invoke Diagnostic Slice

- Worktree recovery: after the generated-ID commit, recent commits and the clean worktree were inspected before continuing.
- Finding: the preload `window.windie.invoke(...)` bridge preserved the intentional wire contract but still reported invalid command and unavailable invoke-channel failures with Windie-specific SDK wording.
- Decision: preserve the `window.windie` bridge and `windie:invoke` IPC channel as compatibility contracts, but make preload validation diagnostics generic Agent SDK wording.
- Change: invalid command names now reject with "Invalid Agent SDK command".
- Change: missing SDK invoke channel validation now reports "Agent SDK invoke channel is not available".

### 2026-06-16 Python SDK Diagnostic Slice

- Worktree recovery: recent commits and the clean worktree were inspected before continuing.
- Finding: Python SDK stream and trace-query fallback failures still used Windie-specific SDK wording even though they are reusable SDK client diagnostics.
- Decision: keep the public Python `windie` package/API names unchanged, but make fallback runtime diagnostics generic Agent SDK wording.
- Change: stream errors without a backend message now fall back to "Agent SDK stream failed".
- Change: trace query timeout errors now say "Agent SDK trace query timed out...".

### 2026-06-16 JS SDK Stream Projection Diagnostic Slice

- Worktree recovery: recent commits, the clean worktree, docs listing, and SDK runtime ownership docs were inspected before continuing.
- Finding: `AgentStreamEvents.ts` owns public `agent.stream(...)` projection, but its fallback error text still said "Windie stream failed" when backend/runtime errors did not include a message.
- Decision: keep public `WindieAgentStreamEvent` names unchanged, but make the projection fallback diagnostic generic.
- Change: JS SDK stream error projection now falls back to "Agent stream failed".
- Change: the SDK conversation-runtime projection test now covers the fallback path directly.

### 2026-06-16 SDK Local Sidecar Timeout Diagnostic Slice

- Worktree recovery: a concurrent SDK context-enrichment commit landed during the previous slice; recent commits and the clean worktree were inspected before continuing.
- Finding: SDK local-runtime auto-start discovery and stale-daemon stop timeouts still said "Windie sidecar daemon" even though the SDK runtime owns generic local sidecar daemon startup/reuse.
- Decision: keep public `createWindieLocalRuntimeProvider` and Python package names unchanged, but make timeout diagnostics generic local sidecar daemon wording.
- Change: JS SDK local-runtime stop and discovery timeout errors now say "local sidecar daemon".
- Change: Python SDK auto-start discovery timeout now says "local sidecar daemon".
- Change: the SDK client test now covers the generic discovery timeout path.

### 2026-06-18 SDK Install Auth Policy Slice

- Compaction recovery: recent commits, the clean worktree, boundary docs, and SDK install-auth tests were inspected before continuing.
- Finding: `AgentClient` still inferred hosted install auto-registration from the `api.windieos.com` hostname, which made reusable SDK auth behavior depend on a WindieOS backend endpoint name.
- Decision: keep the existing `installAuth.autoRegister` contract and require callers to opt in explicitly; Electron main already passes explicit install auth policy from the desktop host path.
- Change: SDK install auto-registration now runs only when `installAuth.autoRegister === true`.
- Change: the hosted-endpoint helper was removed from TypeScript source and checked-in CJS output, and SDK tests now prove the hosted URL alone does not trigger install registration.

### 2026-06-18 SDK Hosted Endpoint Config Slice

- Finding: `AgentClient.resolveBackendUrl(...)` still fell back to `https://api.windieos.com`, which kept WindieOS hosted backend selection inside the generic SDK runtime.
- Decision: make hosted endpoint selection explicit through caller config or environment while leaving Electron main's host-skin endpoint injection unchanged.
- Change: hosted SDK operations now fail fast unless callers pass `backendUrl`, pass `httpBaseUrl`, or set `WINDIE_BACKEND_URL`.
- Change: the hardcoded WindieOS hosted endpoint was removed from TypeScript source and checked-in CJS output, and public SDK docs now construct `AgentClient` with an explicit hosted endpoint.

### 2026-06-18 Python Sidecar Hosted Endpoint Config Slice

- Finding: the shared Python backend config still fell back to `https://api.windieos.com`, letting sidecar remote semantic clients and Python SDK HTTP clients select the WindieOS hosted backend without caller or host configuration.
- Decision: keep Electron main as the desktop host endpoint owner by requiring `WINDIE_BACKEND_HTTP_URL` or an explicit Python `backend_url` for hosted HTTP clients.
- Change: `get_backend_http_url()` now raises a generic Agent SDK backend URL error when no sidecar backend URL is configured.
- Change: remote semantic/base-client tests now pass explicit local URLs where endpoint selection is not the behavior under test and cover the missing-config failure path.

### 2026-06-18 Backend Tool Result Receiver Wording Slice

- Finding: backend tool-result receiver and API handler docstrings still described inbound tool results as frontend results even though the current ingress owner is SDK/main local-runtime result submission.
- Decision: keep compatibility payload names and method signatures unchanged, but update backend source wording around the local-runtime result boundary.
- Change: `ToolResultReceiver` now documents SDK/local-runtime payload conversion, and `ToolResultHandler` docstrings now describe SDK/local-runtime websocket messages.
- Change: the receiver test now guards the local-runtime wording and prevents the old frontend-result phrasing from returning in this backend path.

## Checklist

- [x] Renderer skin/config boundary introduced.
- [x] Settings components read product copy from the skin module.
- [x] Boundary test covers the skin module and representative settings consumers.
- [x] Main host permission copy reads from the main skin/config boundary.
- [x] Browser and macOS automation permission services consume injected host skin copy.
- [x] Remaining OS permission services consume injected host skin copy.
- [x] Query failure/interruption event builders consume injected host skin copy.
- [x] SDK agent name and tray tooltip read product identity from the host skin.
- [x] MCP client identity reads product identity from the host skin on the app path.
- [x] Layer log product prefix reads product identity from the host skin on app/script paths.
- [x] Bundled wakeword and sidecar reinstall guidance reads from the host skin on app paths.
- [x] Local browser warmup and OAuth callback copy reads from the host skin on app paths.
- [x] SDK deep modules keep unused internal helpers private.
- [x] Renderer voice capture internals use generic naming.
- [x] SDK default agent display names are generic unless hosts pass product identity.
- [x] Chat browser-session copy reads from the renderer skin.
- [x] Dashboard recent-chat retry policy consumes app-runtime transient error classification instead of matching sidecar text directly.
- [x] Reusable main-process adapter errors avoid product-specific fallback wording.
- [x] Main SDK command helper internals use generic agent SDK naming while preserving the `windie:invoke` wire contract.
- [x] Renderer SDK command helper internals use generic agent SDK naming while preserving the `windie:invoke` wire contract.
- [x] Renderer-private onboarding, settings, wakeword, and replay markers use generic desktop-agent naming.
- [x] Renderer markdown transport cleanup is provider-agnostic and display-only.
- [x] Renderer no-op tool stream shim removed; SDK current-turn projection remains the tool display owner.
- [x] Main-private log, renderer-console, collapse, and screenshot-suppression markers use generic desktop-agent naming.
- [x] Main local-runtime bridge fallback wording is generic while preserving SDK-owned runtime lifecycle.
- [x] Main IPC SDK runtime logs use generic Agent SDK wording while preserving public SDK APIs.
- [x] Main IPC SDK customer internals use generic agent/client names while preserving public SDK APIs and wire contracts.
- [x] SDK runtime diagnostics and local-runtime failures use generic Agent SDK wording while preserving public Windie API names.
- [x] SDK private transport listener helpers use generic agent-session naming while preserving public exports.
- [x] SDK managed endpoint validation rejects immediately with generic wording.
- [x] SDK-generated default agent IDs use generic values while preserving backend mode contracts.
- [x] Preload SDK-command bridge diagnostics use generic Agent SDK wording while preserving wire contracts.
- [x] Python SDK stream/trace fallback diagnostics use generic Agent SDK wording while preserving public package names.
- [x] JS SDK stream projection fallback diagnostics use generic Agent wording while preserving public stream event names.
- [x] SDK local-runtime sidecar timeout diagnostics use generic local sidecar daemon wording.
- [x] SDK hosted install registration is explicit caller policy instead of endpoint-hostname inference.
- [x] SDK hosted endpoint selection is caller-supplied instead of hardcoded in `AgentClient`.
- [x] Python sidecar/SDK hosted endpoint selection is caller or host supplied instead of hardcoded in shared config.
- [x] Backend tool-result receiver wording reflects SDK/local-runtime ingress instead of frontend-owned results.
- [x] Docs/changelog updated.
- [x] Targeted validation recorded.
- [x] Fresh design inspection completed after the slice.

## Validation Log

- `npm.cmd test -- --runTestsByPath ../tests/frontend/RendererSkinConfigBoundary.test.cjs ../tests/frontend/AgentSettingsTab.test.jsx ../tests/frontend/GeneralSettingsTab.test.jsx` passed.
- `git diff --check` passed.
- `rg -n "WindieOS|Windie Browser|hosted WindieOS backend|Local sidecar tools|No sidecar plugins loaded|execution_target \|\| 'sidecar'|Opening…" frontend/src/renderer/features/dashboard/components/sections/settings tests/frontend/RendererSkinConfigBoundary.test.cjs frontend/src/renderer/app/skin/windieDesktopSkin.js` found expected skin/test matches plus the out-of-scope memory action message.

- `npm.cmd test -- --runTestsByPath ../tests/frontend/RendererSkinConfigBoundary.test.cjs ../tests/frontend/MemorySection.test.jsx ../tests/frontend/AgentSettingsTab.test.jsx ../tests/frontend/GeneralSettingsTab.test.jsx` passed.
- `git diff --check` passed.
- `rg -n "WindieOS|Windie Browser|Connect WindieOS|WindieOS builds understanding|Memories will appear as you interact with WindieOS|Search memories\\.\\.\\.|Delete saved episodic interaction|Delete saved chat transcripts|Failed to complete destructive action|Failed to load memories" frontend/src/renderer/features/dashboard/components/sections frontend/src/renderer/app/skin/windieDesktopSkin.js tests/frontend/RendererSkinConfigBoundary.test.cjs` found expected skin/test matches only.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/RendererSkinConfigBoundary.test.cjs ../tests/frontend/DesktopOnboardingSlideshow.test.jsx ../tests/frontend/ChatMessageSender.test.tsx ../tests/frontend/ChatInterfaceWiring.test.jsx ../tests/frontend/DesktopLiveTurnRuntimeClient.test.ts` passed.
- `git diff --check` passed.
- `rg -n "WindieOS onboarding|Start WindieOS|Welcome to WindieOS Demo|WindieOS isn't connected|WindieOS could not prepare|WindieOS runtime|WindieOS is still loading|WindieOS could not find" frontend/src/renderer tests/frontend/RendererSkinConfigBoundary.test.cjs` found expected boundary-test matches only.
- `rg -n "WindieOS|Windie Browser|Welcome to WindieOS|WindieOS Demo|WindieOS isn't connected|WindieOS could not|Start WindieOS|WindieOS onboarding|WindieOS runtime" frontend/src/renderer -g "*.js" -g "*.jsx" -g "*.ts" -g "*.tsx"` found only the skin plus voice/audio implementation identifiers and comments.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/MainHostSkinBoundary.test.cjs ../tests/frontend/PermissionIpcRuntime.test.cjs` passed.
- `git diff --check` passed.
- `rg -n "WindieOS local backend|Click Grant to install Chromium|Reinstall WindieOS|Failed to open the WindieOS browser|WindieOS could not verify macOS Automation|WindieOS could not request macOS Automation" frontend/src/main/index.cjs frontend/src/main/app/main_host_skin.cjs tests/frontend/MainHostSkinBoundary.test.cjs` found expected skin/test matches only.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/MainHostSkinBoundary.test.cjs ../tests/frontend/PermissionService.test.cjs ../tests/frontend/PermissionIpcRuntime.test.cjs` passed.
- `git diff --check` passed.
- `rg -n "WindieOS|WindieOS browser|enable WindieOS under System Events" frontend/src/main/permissions/permission_service_browser.cjs frontend/src/main/permissions/permission_service_automation.cjs frontend/src/main/app/main_host_skin.cjs tests/frontend/MainHostSkinBoundary.test.cjs` found expected skin/test matches only.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/MainHostSkinBoundary.test.cjs ../tests/frontend/PermissionService.test.cjs ../tests/frontend/PermissionIpcRuntime.test.cjs` passed.
- `git diff --check` passed.
- `rg -n "WindieOS|WindieOS browser|enable WindieOS|Select workspace folder for WindieOS" frontend/src/main/permissions frontend/src/main/app/main_host_skin.cjs tests/frontend/MainHostSkinBoundary.test.cjs tests/frontend/PermissionService.test.cjs` found expected skin/test fixture matches only.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/MainHostSkinBoundary.test.cjs ../tests/frontend/IpcQueryRuntime.test.cjs ../tests/frontend/IpcMainBridge.query.test.cjs ../tests/frontend/ChatMessageSender.test.tsx` passed.
- `rg -n "WindieOS isn't connected|WindieOS lost connection|Your message wasn't sent because WindieOS" frontend/src/main/ipc frontend/src/main/app/main_host_skin.cjs tests/frontend/MainHostSkinBoundary.test.cjs tests/frontend/IpcQueryRuntime.test.cjs` found expected test fixture matches only.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/MainHostSkinBoundary.test.cjs ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs ../tests/frontend/MainWindowRuntime.test.cjs ../tests/frontend/MainProcessBootstrapRuntime.test.cjs` passed.
- `rg -n "name: 'WindieOS'|tray\\.setToolTip\\('WindieOS'\\)|setToolTip\\('WindieOS'\\)|sdkAgentName|trayTooltip" frontend/src/main tests/frontend/MainHostSkinBoundary.test.cjs tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs tests/frontend/MainWindowRuntime.test.cjs` found expected skin/test matches plus the deferred MCP default.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/McpRuntime.test.cjs ../tests/frontend/McpControl.test.cjs ../tests/frontend/MainHostSkinBoundary.test.cjs ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs` failed only in `McpControl.test.cjs` because local `sqlite3` is unavailable for its diagnostics reader.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/McpRuntime.test.cjs ../tests/frontend/MainHostSkinBoundary.test.cjs ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs` passed.
- `git diff --check` passed.
- `rg -n "name: 'WindieOS'|mcpClientInfo|Desktop Runtime|clientInfo: mainHostSkin.identity.mcpClientInfo" frontend/src/main tests/frontend/MainHostSkinBoundary.test.cjs tests/frontend/McpRuntime.test.cjs` found expected skin/test matches and generic MCP runtime default.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/LayerLogSink.test.cjs ../tests/frontend/MainWindowOverlayRuntime.test.cjs ../tests/frontend/MainWindowRuntime.test.cjs ../tests/frontend/MainProcessBootstrapRuntime.test.cjs ../tests/frontend/WindieRunLayerLog.test.cjs ../tests/frontend/WindieCli.test.cjs ../tests/frontend/MainHostSkinBoundary.test.cjs` failed only in `WindieCli.test.cjs` because local `sqlite3` is unavailable for its conversation export setup.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/LayerLogSink.test.cjs ../tests/frontend/MainWindowOverlayRuntime.test.cjs ../tests/frontend/MainWindowRuntime.test.cjs ../tests/frontend/MainProcessBootstrapRuntime.test.cjs ../tests/frontend/WindieRunLayerLog.test.cjs ../tests/frontend/MainHostSkinBoundary.test.cjs` passed.
- `git diff --check` passed.
- `rg -n "\\[WindieOS\\]|DEFAULT_LOG_PREFIX|logPrefix" frontend/src/main/logging/layer_log_sink.cjs frontend/src/main/app/main_host_skin.cjs frontend/src/main/index.cjs frontend/src/main/surfaces tests/frontend/MainHostSkinBoundary.test.cjs tests/frontend/LayerLogSink.test.cjs scripts/windie` found expected skin/script/test matches and generic log sink default.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WakewordBridgeRuntime.test.cjs ../tests/frontend/LocalRuntimeLaunchOptions.test.cjs ../tests/frontend/MainWindowRuntime.test.cjs ../tests/frontend/MainHostSkinBoundary.test.cjs` passed.
- `rg -n "Reinstall WindieOS|Please reinstall WindieOS|Bundled Python runtime not found|Bundled wakeword executable|Please reinstall this app" frontend/src/main/wakeword frontend/src/main/sidecar/local_runtime_launch_options.cjs frontend/src/main/app/main_host_skin.cjs tests/frontend/WakewordBridgeRuntime.test.cjs tests/frontend/LocalRuntimeLaunchOptions.test.cjs tests/frontend/MainHostSkinBoundary.test.cjs` found expected skin/test matches plus generic helper fallbacks only.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/LocalBackendBridge.rpc.test.cjs ../tests/frontend/OpenAICodexOAuth.test.cjs ../tests/frontend/IpcOpenAICodexOAuthHandlers.test.cjs ../tests/frontend/MainWindowRuntime.test.cjs ../tests/frontend/MainHostSkinBoundary.test.cjs` passed.
- `rg -n "WindieOS|Return to WindieOS|Open the WindieOS browser|Windie Browser" frontend/src/main -g "*.cjs"` found only `main_host_skin.cjs`.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WindieSdkPrivateExports.test.cjs ../tests/frontend/WindieSdkPackageBoundary.test.ts` passed.
- `rg -n "summarizeAgentDefinitionCapabilities|compactedReplayFromEvent|normalizeWsUrl" packages/windie-sdk-js/src packages/windie-sdk-js/cjs tests/frontend -g "*.ts" -g "*.js" -g "*.cjs"` found those helpers only inside their owning modules plus the private-export boundary test.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/RendererSkinConfigBoundary.test.cjs ../tests/frontend/RendererVoiceRuntimeBoundary.test.ts ../tests/frontend/VoiceAudioProcessorNode.test.ts` passed.
- `rg -n "WindieOS|Windie Browser|Welcome to WindieOS|WindieOS Demo|Start WindieOS|WindieOS onboarding|WindieOS runtime|WindieOS isn't connected|WindieOS could not|WindieOS is still loading|windieos-capture-processor|WindieOSCaptureProcessor" frontend/src/renderer -g "*.js" -g "*.jsx" -g "*.ts" -g "*.tsx"` found only `windieDesktopSkin.js`.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WindieSdkClient.test.ts ../tests/frontend/WindieSdkPackageBoundary.test.ts` failed only in two existing local-runtime provider tests because their temporary `python-in-env` launcher was unavailable.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WindieSdkClient.test.ts ../tests/frontend/WindieSdkPackageBoundary.test.ts -t "buildAgentDefinition|auto-registers hosted install auth|package boundary"` passed.
- `rg -n "WindieOS Agent|Windie Agent|Desktop Agent|name: options.name|name: normalizeString" packages/windie-sdk-js/src/runtime/AgentDefinition.ts packages/windie-sdk-js/src/runtime/WindieClient.ts packages/windie-sdk-js/cjs/runtime/AgentDefinition.js packages/windie-sdk-js/cjs/runtime/WindieClient.js tests/frontend/WindieSdkClient.test.ts` found only the new generic defaults and tests.
- `bin\windie.cmd docs list` passed during compaction recovery orientation.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/RendererSkinConfigBoundary.test.cjs ../tests/frontend/ChatBrowserSessionControl.test.jsx` passed.
- `rg -n "dedicated Windie browser|Windie browser|Windie Browser|WindieOS" frontend/src/renderer -g "*.js" -g "*.jsx" -g "*.ts" -g "*.tsx"` found only `windieDesktopSkin.js`.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/DashboardConversationLoad.test.js ../tests/frontend/DesktopConversationLibraryClient.test.ts ../tests/frontend/UseDashboardConversations.test.jsx` passed.
- `rg -n "sidecar daemon|local backend not ready|failed to list stored conversations" frontend/src/renderer/features/dashboard/utils frontend/src/renderer/features/dashboard/hooks frontend/src/renderer/app/runtime/desktopConversationLibraryClient.js` found runtime-specific matches only in `desktopConversationLibraryClient.js`.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/IpcClipboardImageHandler.test.cjs ../tests/frontend/IpcImageContextMenuHandler.test.cjs ../tests/frontend/MainHostSkinBoundary.test.cjs` passed.
- `rg -n "trusted Windie artifact|Windie sidecar daemon|WindieOS local backend|Click Grant to install Chromium for WindieOS|Reinstall WindieOS|Failed to open the WindieOS browser|WindieOS could not" frontend/src/main -g "*.cjs"` found no matches outside the host skin/test guard scope.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs ../tests/frontend/IpcMainReplayCommands.test.cjs ../tests/frontend/DesktopConversationLibraryClient.test.ts` passed.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WindieDocsIndex.test.cjs -t "routes renderer backend transport command-shape queries"` passed.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WindieDocsIndex.test.cjs` was attempted and failed on unrelated docs-search routing cases outside this slice.
- `rg -n "handleWindieSdkInvoke|buildWindieSdkCommandHandlers|Windie SDK command|deps\\.ensureWindieAgent" frontend/src/main/ipc/ipc_agent_sdk_command_handlers.cjs docs/frontend tests/frontend -g "*.cjs" -g "*.ts" -g "*.md"` found only intentional stale-name routing docs/tests plus unrelated preload validation wording.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/RendererAppRuntimeBoundary.test.ts ../tests/frontend/ModularRefactorCompletionBoundary.test.ts ../tests/frontend/DesktopRuntimeTransport.test.ts ../tests/frontend/DesktopLiveTurnRuntimeClient.test.ts ../tests/frontend/DesktopSettingsRuntimeClient.test.ts ../tests/frontend/DesktopVoiceRuntimeClient.test.ts ../tests/frontend/DesktopMemoryRuntimeClient.test.ts ../tests/frontend/DesktopConversationLibraryClient.test.ts ../tests/frontend/DesktopConversationStore.test.ts` passed.
- `rg -n "windieCommandInvokeClient|invokeWindieCommand|WindieCommand|Windie SDK command failed" frontend/src/renderer tests/frontend/RendererAppRuntimeBoundary.test.ts tests/frontend/ModularRefactorCompletionBoundary.test.ts docs/frontend/renderer -g "*.ts" -g "*.tsx" -g "*.js" -g "*.jsx" -g "*.md"` found only intentional stale-name routing docs.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/RendererSkinConfigBoundary.test.cjs ../tests/frontend/DesktopOnboardingSlideshow.test.jsx ../tests/frontend/DesktopSettingsRuntimeClient.test.ts ../tests/frontend/voice/WakewordDetectionHook.test.ts ../tests/frontend/ConversationReplayActions.test.jsx ../tests/frontend/ChatMessageSender.test.tsx ../tests/frontend/ChatInterfaceWiring.test.jsx` passed.
- `git diff --check` passed.
- `rg -n "canStartWindieOs|__windieWakewordCaptureGuard|__windie_models_list_requested__|__windieReplayStep" frontend/src/renderer tests/frontend -g "*.ts" -g "*.tsx" -g "*.js" -g "*.jsx" -g "*.cjs"` found only renderer skin boundary assertions that ban those old private marker names.
- `rg -n "WindieOS|Windie Browser|Windie browser|dedicated Windie browser" frontend/src/renderer -g "*.js" -g "*.jsx" -g "*.ts" -g "*.tsx"` found only `windieDesktopSkin.js`.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/MainHostSkinBoundary.test.cjs ../tests/frontend/LayerLogSink.test.cjs ../tests/frontend/MainWindowOverlayRuntime.test.cjs ../tests/frontend/MainWindowRuntime.test.cjs ../tests/frontend/WindowSuppressionRuntime.test.cjs ../tests/frontend/WindowVisibilityRuntime.test.cjs` passed.
- `git diff --check` passed.
- `rg -n "__windieConsoleStreamErrorGuardInstalled|__windieLayerLogInstalled|__windieLayerLogOriginals|__windieRendererConsoleLoggingAttached|__windiePendingCollapseToChatPill|__windieScreenshotRestoreBounds|Unknown Windie log layer" frontend/src/main tests/frontend -g "*.cjs" -g "*.js" -g "*.ts"` found only main host boundary assertions that ban those old private marker names/copy.
- `rg -n "WindieOS|Windie Browser|Windie browser|Unknown Windie|\\[WindieOS\\]" frontend/src/main -g "*.cjs" -g "*.js" -g "*.ts"` found only `main_host_skin.cjs`.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/LocalBackendBridge.lifecycle.test.cjs ../tests/frontend/LocalBackendBridge.rpc.test.cjs ../tests/frontend/MainHostSkinBoundary.test.cjs` passed.
- `rg -n "Windie SDK local runtime|Agent SDK local runtime" frontend/src/main/sidecar tests/frontend docs -g "*.cjs" -g "*.js" -g "*.ts" -g "*.md"` found the new generic bridge/test wording and the old wording only in the main host boundary assertion that bans it.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs ../tests/frontend/IpcMainBridge.query.test.cjs ../tests/frontend/IpcQueryRuntime.test.cjs` passed.
- `rg -n "Windie SDK runtime|WindieClient wakeUp runtime started|Failed to send query through WindieAgent|Agent SDK runtime|Agent SDK wakeUp" frontend/src/main/ipc.cjs tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs docs/plans/2026-06-16-general-agent-ui-runtime-boundary-report.md` found the new generic main IPC wording and the old wording only in boundary assertions/report history.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs ../tests/frontend/ModularRefactorCompletionBoundary.test.ts ../tests/frontend/IpcMainBridge.query.test.cjs ../tests/frontend/IpcQueryRuntime.test.cjs ../tests/frontend/IpcMainReplayCommands.test.cjs` passed.
- `rg -n "windieAgent|windieClient|pendingWindieAgentStartPromise|windieAgentWebSocketImpl|createDesktopWindieClient|getWindieClient|startWindieAgent|ensureWindieAgent|getKnownWindieLocalRuntime|ensureWindieLocalRuntime|handleWindieAgent" frontend/src/main tests/frontend -g "*.cjs" -g "*.ts"` found old local names only in boundary assertions that ban them.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WindieSdkClient.test.ts ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/WindieAgentConversationStoreApi.test.ts -t "localRuntime does not wake hosted agent when auto-start is disabled|agent.setModel validates SDK model selections|logs compaction debug output|conversation runtime title generation failure|conversation.append_event compaction debug"` passed for the matching SDK client/conversation-runtime cases.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WindieAgentConversationStoreApi.test.ts -t "logs successful compaction event storage after sidecar RPC succeeds"` passed.
- `rg -n "Windie SDK|WindieClient local runtime|WindieAgent\\.setModel|WindieClient could not locate|WindieClient local tools|WindieClient persistence|WindieClient memory|WindieClient install" packages/windie-sdk-js/src packages/windie-sdk-js/cjs tests/frontend -g "*.ts" -g "*.js" -g "*.cjs"` found old diagnostic wording only in public command/test names and boundary assertions.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/LlmOutputContract.test.ts ../tests/frontend/MarkdownMessage.test.jsx ../tests/frontend/MessageContent.test.jsx` passed.
- `rg -n "provider|modelProvider|modelId|Gemini|gemini|google|normalizeGemini|isGeminiProvider" frontend/src/renderer/infrastructure/llmOutputContract.ts frontend/src/renderer/features/chat/utils/message/markdownMessageRendering.js frontend/src/renderer/features/chat/components/message/content/MarkdownMessage.jsx tests/frontend/LlmOutputContract.test.ts tests/frontend/MarkdownMessage.test.jsx` found only a provider-free test title.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/RendererChatRuntimeBoundary.test.ts ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx` passed.
- `rg -n "useChatStreamToolHandlers|ChatStreamToolHandlers" frontend/src/renderer tests/frontend -g "*.ts" -g "*.tsx" -g "*.js" -g "*.jsx" -g "*.cjs"` found only the renderer boundary assertion for the deleted hook path.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WindieSdkClient.test.ts ../tests/frontend/WindieSdkPackageBoundary.test.ts -t "createWindieAgentSession|managed backend|package boundary|WebSocket"` passed.
- `rg -n "type WindieAgentEvent|WindieAgentListener|WindieAgentEventMap|Windie agent session|Windie managed agent session" packages/windie-sdk-js/src packages/windie-sdk-js/cjs tests/frontend -g "*.ts" -g "*.js" -g "*.cjs"` found no matches.
- `git diff --check` passed.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/FrontendBackendWebsocketContract.test.cjs -t "managed agent session endpoint validation uses generic agent wording" --runInBand --detectOpenHandles` passed.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WindieSdkManagedBackendSession.test.ts --runInBand` passed.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/FrontendBackendWebsocketContract.test.cjs --runInBand` was attempted and timed out with no output; the focused endpoint assertion and managed-backend session suite pass.
- `rg -n "Managed Windie agent endpoint requires|Managed agent endpoint requires|Windie agent endpoint|Timed out connecting to backend for agent-session" packages/windie-sdk-js/src packages/windie-sdk-js/cjs tests/frontend -g "*.ts" -g "*.js" -g "*.cjs"` found only the new generic endpoint diagnostic and its focused assertion.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WindieSdkClient.test.ts -t "buildAgentDefinition uses generic display defaults|agent context|agent definition|wakeUp registers local module tools"` passed.
- `rg -n "windie-default|windie-agent-" packages/windie-sdk-js/src packages/windie-sdk-js/cjs tests/frontend/WindieSdkClient.test.ts docs/sdk/windie_client_runtime.md -g "*.ts" -g "*.js" -g "*.cjs" -g "*.md"` found no matches.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/PreloadIpcChannels.test.cjs` passed.
- `rg -n "Invalid Windie SDK command|Windie SDK invoke channel|Invalid Agent SDK command|Agent SDK invoke channel" frontend/src/preload.js tests/frontend/PreloadIpcChannels.test.cjs docs/plans/2026-06-16-general-agent-ui-runtime-boundary-report.md` found only the new generic preload wording.
- `scripts\python-in-env sidecar -m pytest tests/sidecar/test_windie_sdk_client.py::test_trace_query_times_out_and_closes_websocket -q` passed.
- `rg -n "Windie SDK stream failed|Windie SDK trace query|Agent SDK stream failed|Agent SDK trace query" frontend/src/main/python tests/sidecar -g "*.py"` found only the new generic Python SDK fallback wording.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WindieSdkConversationRuntime.test.ts -t "agent stream projection uses generic fallback error wording|agent stream projection exposes memory retrieval diagnostics"` passed.
- `rg -n "Windie stream failed|Agent stream failed" packages/windie-sdk-js/src packages/windie-sdk-js/cjs tests/frontend/WindieSdkConversationRuntime.test.ts -g "*.ts" -g "*.js"` found only the new generic JS SDK fallback wording and assertion.
- `npm.cmd test -- --runTestsByPath ../tests/frontend/WindieSdkClient.test.ts -t "createWindieLocalRuntimeProvider reports generic discovery timeout wording|createWindieLocalRuntimeProvider reuses discovery metadata directly"` passed.
- `rg -n "Windie sidecar daemon|local sidecar daemon discovery|existing local sidecar daemon|existing Windie sidecar" packages/windie-sdk-js/src packages/windie-sdk-js/cjs frontend/src/main/python tests/frontend/WindieSdkClient.test.ts -g "*.ts" -g "*.js" -g "*.py"` found only the new generic sidecar timeout wording and assertion.
- Finding: the SDK hosted HTTP client, local sidecar HTTP client, and backend
  websocket factory still reported missing transport dependencies with
  Windie-specific constructor/helper names, even though these are generic
  SDK-owned transport boundaries.
- Change: updated those dependency diagnostics to generic Agent SDK wording
  while preserving the exported Windie SDK class/function names.
- Finding: the sidecar browser executable manifest and shared connect/profiles
  action metadata still described the local authority surface as the
  Windie/WindieOS browser, even though the current contract boundary is the
  dedicated browser runtime/profile.
- Change: changed model-visible executable browser descriptions and shared
  browser action metadata to generic dedicated-browser wording without changing
  action names, validation, or Browser Use ownership.
- Finding: the sidecar executable shell manifest still described default
  command directory behavior as the "WindieOS workspace folder" even though the
  local tool contract is selected workspace context.
- Change: updated the sidecar shell tool manifest and generated builtin
  manifest snapshot to use generic selected-workspace wording.
- Finding: the Python SDK wake-up and local-runtime preflight failures still
  reported through the public `WindieSdkClient` class name instead of the
  generic Agent SDK runtime boundary.
- Change: changed those Python SDK diagnostics and module docstring to generic
  Agent SDK wording while preserving public package/class exports.
- Finding: sidecar browser launcher/runtime diagnostics and docstrings still
  called the dedicated CDP/profile runtime the WindieOS browser, even though
  the executable sidecar boundary is a product-neutral dedicated browser
  adapter.
- Change: updated browser launcher logs/errors/docstrings and Browser Use
  adapter docstrings to dedicated-browser wording without renaming the existing
  helper functions or environment variables.
- Finding: renderer config storage and the models API-key section each carried
  their own provider credential defaults, keeping provider display metadata in
  generic storage/UI modules and risking drift from the WindieOS skin/config
  boundary.
- Change: added a renderer skin/config provider credential settings module and
  made config storage plus the API-key UI consume that single source without
  changing backend provider policy or persisted config shape.
- Finding: renderer model-card shaping still embedded provider-specific
  fallback descriptions and strengths in a generic UI mapper, even though that
  metadata is display skin/config rather than card projection logic.
- Change: moved provider model-card fallback descriptions and strengths into
  renderer skin/config and made the generic model-card mapper consume that
  resolver while preserving backend catalog metadata precedence.
- Finding: the chat model picker still carried provider label overrides for
  OpenAI/OpenRouter inside generic model-option utilities instead of sharing the
  renderer provider display skin metadata.
- Change: moved chat model provider label overrides into renderer skin/config
  and then routed chat model-option projection through the
  `DesktopChatModelOptionsRuntime` facade.
- Finding: renderer config storage still embedded the default model mode,
  provider, and model id directly in the generic persistence normalizer.
- Change: moved default model selection values into renderer skin/config and
  made config storage initialize from those skin-owned defaults without
  changing the persisted settings shape.
- Finding: the OpenAI Codex OAuth IPC handler still embedded provider-specific
  fallback failure copy inside the generic handler despite already receiving
  main host skin copy for the login flow.
- Change: moved OAuth login/logout fallback copy into main host skin/config and
  made the IPC handler use provider-neutral defaults when no host copy is
  supplied.
- Finding: sidecar packaged browser and wakeword dependency failures still told
  users to reinstall or restart WindieOS from executable local-runtime code.
- Change: changed those sidecar runtime failures to generic bundled-app
  reinstall/restart wording while leaving host/product copy ownership outside
  the sidecar executables.
- Finding: the sidecar macOS System Events automation verifier still embedded
  WindieOS in fallback consent/denial reason strings even though product copy
  should be supplied by host permission surfaces.
- Change: changed the verifier fallback reasons to generic app wording and
  added focused sidecar tests for consent-needed and denied states.
- Finding: the sidecar daemon still advertised itself as the WindieOS sidecar
  in MCP client metadata and CLI help, even though this executable is the local
  sidecar runtime boundary.
- Change: changed the daemon MCP client identity and CLI description to generic
  desktop-runtime/local sidecar wording with a boundary assertion.
- Finding: sidecar helper docstrings and the unsupported-OS user-data path
  error still described local-runtime helpers as WindieOS-specific, even though
  the persisted storage directory name remains the only compatibility-bound
  product identifier there.
- Change: updated those sidecar helper docstrings and unsupported-OS error to
  generic local-runtime wording while preserving the existing `windieos` storage
  path.
- Finding: the OpenAI Codex OAuth callback flow still hard-coded the
  provider-specific login failure prefix inside the main provider helper rather
  than using host skin copy.
- Change: routed that callback error prefix through the host copy object with a
  provider-neutral default while preserving the browser callback response copy.
- Validation: focused SDK install-auth tests passed, including explicit
  auto-registration, hosted-endpoint non-inference, registration failure
  handling, and the source/CJS explicit-policy boundary assertion.
- Validation: focused SDK package-boundary tests passed.
- Validation: `bin\windie.cmd docs list` and `git diff --check` passed.
- Validation: focused SDK backend/endpoint tests passed, including the new
  missing-backend fail-fast path and existing env-backed endpoint path.
- Validation: focused hosted-endpoint tests passed, including the source/CJS
  assertion that endpoint selection is caller supplied.
- Validation: `rg -n "https://api\.windieos\.com|api\.windieos\.com" packages\windie-sdk-js\src packages\windie-sdk-js\cjs` returned no matches.
- Validation: focused sidecar backend-config, remote API base, remote semantic
  client, Python SDK init, and package-boundary tests passed through
  `scripts\python-in-env.cmd sidecar`; the wrapper reported that
  `frontend_jarvis` was unavailable and used the current shell environment.
- Validation: Python compile checks passed for `_backend_config.py`,
  `_remote_api_client_base.py`, and `remote_semantic_client.py`.
- Validation: `rg -n "DEFAULT_BACKEND_HTTP_URL|https://api\.windieos\.com|api\.windieos\.com" frontend\src\main\python\windie frontend\src\main\python\core tests\sidecar\test_backend_config.py` returned no matches.
- Validation: focused backend tool-result receiver and waiting-handler tests
  passed through `scripts\python-in-env.cmd backend`; the wrapper reported that
  `jarvis` was unavailable and used the current shell environment.
- Validation: Python compile checks passed for `receiver.py` and
  `tool_result.py`.
- Validation: source scan found only the new SDK/local-runtime wording and the
  boundary-test assertions in the touched backend result-ingress files.

### 2026-06-18 Dedicated Browser Local-Runtime Wording Slice

- Compaction recovery: inspected `git status --short --branch`, recent commits,
  current diff, the user plan, execution plan, report, changelog, and targeted
  sidecar/SDK browser wording before editing.
- Finding: SDK local-tool examples, sidecar runtime workflow docs, sidecar
  browser automation docs, the Python runtime dependency list, and browser tool
  test docstrings still used WindieOS browser wording inside generic
  dedicated-browser/local-runtime surfaces.
- Decision: keep product ownership and trust-boundary docs where appropriate,
  but make generic local-runtime examples, policy labels, dependency comments,
  and test docstrings describe the dedicated browser without product-specific
  browser naming.
- Change: reworded the SDK `executeTool({ toolName: "browser" })` example,
  sidecar browser/session workflow rule, browser automation profile/connect
  policy bullets, Python dependency comment, and browser tool test docstring.
- Validation: targeted stale wording scan, docs listing, and `git diff --check`
  passed.
- Compatibility: no migration required. This is docs/comments/docstring only;
  browser tool schemas, CDP/profile behavior, environment variables,
  permissions, storage, and SDK local-runtime execution are unchanged.

### 2026-06-18 Backend Comment Client/Local-Runtime Wording Slice

- Finding: focused source scans still found frontend-owned wording in backend
  comments/docstrings for SDK tool screenshot capture, audio playback, session
  active-window metadata, provider API-key overrides, and tool-result display;
  the sidecar browser registry test also used product browser wording for
  import failures.
- Decision: keep these files behaviorally unchanged and update only source
  comments/docstrings so backend policy/runtime code describes client, UI
  projection, and local-runtime ownership accurately.
- Change: reworded the SDK tool template capability comment, speech-service
  stream docstring, context factory session metadata comment, provider API-key
  model docstrings, interaction-loop tool-result display comment, and browser
  registry import-failure comment.
- Validation: targeted stale wording scan, Python compile checks for touched
  backend/sidecar Python files, docs listing, and `git diff --check` passed.
- Compatibility: no migration required. Provider config models, speech
  payloads, ToolContext metadata, tool-result history processing, sidecar
  browser imports, permissions, credentials, and storage are unchanged.

### 2026-06-18 Renderer Terminal Telemetry Raw Diagnostic Boundary Slice

- Finding: `useChatStreamTerminalHandlers.ts` still knew about SDK
  `payload.rawEvent` diagnostics so it could drop raw backend details before
  passing error and token-count telemetry into renderer state/tracking.
- Decision: keep raw backend diagnostics available inside the SDK for
  inspection, but make renderer chat feature code consume only explicit SDK
  terminal fields.
- Change: terminal error handling now passes only normalized `message` and
  `content`; token-count handling now whitelists the public token fields needed
  by renderer state instead of copying the rest of the SDK payload.
- Change: renderer chat runtime boundary coverage now fails if the terminal
  handler mentions `rawEvent` again.
- Validation: focused renderer chat runtime boundary Jest coverage, targeted
  renderer `rawEvent` scan, docs listing, and `git diff --check` passed.
- Compatibility: no migration required. Renderer-visible token counts and error
  tracking behavior are preserved; SDK diagnostic payloads, transcript storage,
  backend websocket events, IPC channels, credentials, permissions, and
  provider policy are unchanged.

### 2026-06-18 Tool Workflow SDK/Main Local-Runtime Wording Slice

- Finding: tool-schema workflow, tool troubleshooting, sidecar-tool workflow,
  and shared parity test comments still used frontend execution wording for
  SDK/main/local-runtime dispatch, local validation, bundle execution, and
  client-local schema ownership.
- Decision: keep real `frontend/src/...` filesystem paths and compatibility
  names, but describe runtime ownership with SDK/main/local-runtime terms.
- Change: reworded local-runtime executable payloads, SDK/main validation and
  dispatch, renderer browser UI setting, local-runtime execution failure, bundle
  execution, transport preservation, and parity-test comments.
- Validation: focused modular boundary Jest coverage, targeted stale wording
  scan, docs listing, and `git diff --check` passed.
- Compatibility: no migration required. This is docs/comments only; tool
  schemas, manifests, backend policy, SDK/main dispatch, sidecar execution,
  renderer display, permissions, credentials, and storage are unchanged.

### 2026-06-18 Backend/Tool Inventory Local-Runtime Wording Slice

- Finding: tool lifecycle docs and backend inventory docs still described
  bundle validation, result waiting/routing, remote tool adapters, settings
  patches, and stale-turn synthetic failures as frontend-owned/executed paths.
- Decision: keep concrete repository paths and frontend test-suite names where
  they identify files, but use SDK/main, local-runtime execution, and client
  settings terminology for runtime ownership.
- Change: reworded tool lifecycle validation, add-a-tool manifest routing,
  tools hub change path, backend capability matrix, backend functionality
  catalog, and backend change-path playbook entries.
- Validation: focused modular boundary Jest coverage, targeted stale wording
  scan, docs listing, and `git diff --check` passed.
- Compatibility: no migration required. This is docs only; tool schemas,
  manifests, backend policy, SDK/main dispatch, sidecar execution, renderer
  display, settings payloads, permissions, credentials, and storage are
  unchanged.

### 2026-06-18 SDK Continuity Metadata Source Event Slice

- Finding: `ConversationMetadataInvalidationEvent` exposed the originating
  local-runtime title update through a `rawEvent` diagnostic field, even though
  the continuity service event is a public SDK surface and the source is a
  local-runtime event rather than a backend raw event contract.
- Decision: keep the source event available for diagnostics, but rename the
  field to `sourceEvent` and remove the raw-prefixed field instead of keeping a
  compatibility alias.
- Change: updated TypeScript SDK and checked-in CJS parity; focused continuity
  service coverage now asserts `sourceEvent` is present and `rawEvent` is not.
- Validation: focused SDK continuity-service Jest coverage, targeted stale
  continuity `rawEvent` scan, docs listing, and `git diff --check` passed.
- Compatibility: intentional SDK metadata field rename. No storage or runtime
  migration is required; local-runtime title update payloads, conversation
  metadata invalidation behavior, renderer subscription flow, transcript
  storage, backend websocket events, IPC channels, credentials, permissions,
  and provider policy are unchanged.

### 2026-06-18 Python Local-Runtime Log-Level Env Slice

- Finding: the Python local-runtime service had accepted
  `AGENT_SIDECAR_LOG_LEVEL`, but the primary reusable env contract and resolver
  helper still used sidecar-specific naming for local-runtime stderr verbosity.
- Decision: keep the sidecar-named Agent env and WindieOS env as compatibility
  aliases, but add a local-runtime-named primary env so generic hosts do not
  need a sidecar-specific setting for reusable runtime logging.
- Change: added `AGENT_LOCAL_RUNTIME_LOG_LEVEL`, renamed the Python resolver to
  local-runtime terms, and made Electron local-runtime launch env mirroring pass
  the WindieOS host-skin log-level key into the generic env key.
- Validation: focused Python local-runtime log-level pytest coverage, focused
  Electron local-runtime launch Jest coverage, docs listing, source scans, and
  `git diff --check` passed.
- Compatibility: no migration required. Existing `AGENT_SIDECAR_LOG_LEVEL` and
  `WINDIE_SIDECAR_LOG_LEVEL` launches continue to work; logging destinations,
  stderr filtering, JSON-RPC stdout behavior, storage, permissions,
  credentials, IPC, hosted backend URL handling, and provider policy are
  unchanged.

### 2026-06-18 Python SDK Runtime Env Fallback Slice

- Finding: the TypeScript SDK now centralizes generic Agent SDK and legacy
  Windie env fallback groups, but the Python SDK still spelled local-runtime
  daemon script, discovery file, and Python executable fallback names inline in
  `windie.sdk`.
- Decision: keep this private to the Python SDK package instead of adding a
  new public export; external callers should keep using constructor arguments
  or the documented env names.
- Change: added private `windie._runtime_env` key groups and first-value
  fallback helper, routed Python SDK local-runtime fallback resolution through
  it, and added package-boundary coverage that the helper is not exported from
  `windie`.
- Validation: focused Python SDK client and package-boundary pytest coverage,
  Python compile checks, docs listing, source scans, and `git diff --check`
  passed.
- Compatibility: no migration required. Existing generic and WindieOS env
  aliases keep their precedence; no public SDK API, daemon discovery file, tool
  routing, IPC, storage, credential, permission, hosted backend URL, or
  provider-policy contract changes.

### 2026-06-18 Python SDK Hosted Helper Wording Slice

- Finding: private Python SDK backend endpoint, hosted HTTP, and install-auth
  helpers still described themselves as sidecar backend clients, which blurred
  the reusable Python SDK hosted-client boundary with the concrete sidecar
  daemon process.
- Decision: keep the helper module names and env names stable; this slice only
  corrects ownership wording and source guards.
- Change: reworded helper docstrings toward Python SDK hosted/local-runtime
  ownership and added focused tests that prevent the retired sidecar-client
  descriptions from returning.
- Validation: focused Python backend-config, auth, and remote-client pytest
  coverage, Python compile checks, docs listing, source scans, and
  `git diff --check` passed.
- Compatibility: no migration required. Backend URL env names, install-auth
  state path env names, bearer-token loading, hosted HTTP request behavior,
  storage, credentials, permissions, IPC, local-runtime launch, and provider
  policy are unchanged.

### 2026-06-18 Renderer Runtime Endpoint Snapshot Slice

- Finding: `AppConfigProvider` still pulled the backend-shaped
  `backendHttpUrl` field out of IPC status snapshots before forwarding it to
  runtime endpoint state, leaving backend transport vocabulary in the generic
  renderer config provider.
- Decision: keep the current IPC payload compatible, but make the renderer
  app-runtime client own status-snapshot endpoint extraction and add a generic
  field name for future hosts.
- Change: added `DesktopRuntimeEndpointClient.syncFromConnectionSnapshot(...)`
  with `runtimeHttpUrl` primary support and `backendHttpUrl` compatibility,
  changed `AppConfigProvider` to pass the whole snapshot to that adapter, and
  added focused coverage for provider delegation plus generic/legacy endpoint
  snapshot handling.
- Validation: focused AppConfigProvider and RuntimeEndpointStore Jest coverage,
  frontend typecheck, docs listing, source scans, and `git diff --check`
  passed.
- Compatibility: no migration required. Existing main-process IPC status
  snapshots that emit `backendHttpUrl` keep working; generic hosts may emit
  `runtimeHttpUrl`. Storage, credentials, permissions, IPC channel names,
  artifact/transcription URL shapes, transcript session binding, local-runtime
  launch, hosted backend URL, and provider policy are unchanged.

### 2026-06-18 Python Local-Runtime User-Data Helper Wording Slice

- Finding: `core/user_data_paths.py` still described the shared app-data path
  helper as sidecar-owned and emitted an unsupported-OS error that named a
  sidecar user-data path, despite the helper now owning generic
  local-runtime storage fallback paths.
- Decision: keep path defaults and env override behavior stable; only correct
  the shared helper ownership wording.
- Change: reworded the helper docstring and unsupported-OS error to
  local-runtime terms and added a source-copy guard to the focused user-data
  path tests.
- Validation: focused user-data path pytest coverage, source scans, docs
  listing, and `git diff --check` passed.
- Compatibility: no migration required. Platform path resolution, the
  `desktop-runtime` default directory, env overrides, Windows fallback behavior,
  storage formats, permissions, credentials, IPC, local-runtime launch, hosted
  backend URL handling, and provider policy are unchanged.

### 2026-06-20 Architecture SDK Event Fan-Out Docs Boundary

- Finding: first-read architecture docs still described renderer/backend IPC
  through the retired generic `to-backend` and `from-backend` relay even though
  the current renderer command path is `windie:invoke` and backend-origin
  renderer fan-out is SDK projections plus typed side-channel events.
- Change: updated the communication-flow and system-architecture pages to route
  user queries through the Electron main Agent SDK host, describe renderer
  display as SDK rows/current-turn/status projection consumption, route
  normalized side effects through `windie:conversation-event`, and list
  settings/capability/audio as typed backend event channels.
- Validation: added a focused modular docs boundary guard for the architecture
  pages so the removed generic relay is not documented as current IPC again.
- Compatibility: no migration required. Runtime IPC channel names, preload
  allowlists, SDK projection payloads, backend websocket payloads, storage,
  credentials, permissions, provider policy, hosted URLs, and local execution
  behavior are unchanged.

### 2026-06-20 Settings Sync SDK Command Docs Boundary

- Finding: the settings lifecycle reference still described renderer settings
  saves as a direct `to-backend` `update-settings` send, and the settings-sync
  workflow read hint still named renderer-to-backend settings payload shape,
  even though live renderer settings updates go through the desktop settings
  runtime facade and SDK-shaped `settings.update` command.
- Change: updated the settings lifecycle and settings-sync workflow docs to
  route renderer saves through SDK command IPC, identify
  `ipc_settings_sync_runtime.cjs` as the ACK gate owner, and reserve backend
  `update-settings` for the backend websocket message sent through the Agent
  SDK runtime from Electron main.
- Validation: added a focused renderer settings boundary guard that requires
  SDK/main command-shape wording and rejects the retired `to-backend` settings
  lifecycle phrases.
- Compatibility: no migration required. Renderer config fields, localStorage
  keys, `frontend-config.json`, `windie:invoke`, backend `update-settings`
  payloads, ACK IDs, settings events, credentials, permissions, provider policy,
  hosted URLs, and local execution behavior are unchanged.

### 2026-06-20 Architecture Agent SDK Host Overview Boundary

- Finding: the system architecture overview still listed Electron main as a
  direct `WebSocket Client` and showed user queries flowing from `Main Process`
  to `WebSocket` to backend, while the current host boundary is Electron main
  invoking the Agent SDK runtime and the SDK owning hosted backend websocket
  transport plus conversation projection.
- Change: updated the overview diagram, main-process responsibility list, and
  user-query flow so Electron main resolves host context and invokes the Agent
  SDK runtime, while the Agent SDK runtime owns the websocket hop to backend.
- Validation: extended the architecture docs boundary guard to require Agent
  SDK host/runtime wording and reject the retired direct WebSocket-client
  architecture phrases.
- Compatibility: no migration required. Runtime code, IPC channels, SDK
  commands, backend websocket payloads, projection events, storage,
  credentials, permissions, provider policy, hosted URLs, and local execution
  behavior are unchanged.

### 2026-06-20 Voice Audio Typed Side-Channel Docs Boundary

- Finding: the voice/audio channel guide still described TTS playback as
  Electron main relaying `audio-chunk` backend events to renderer through the
  removed generic `from-backend` channel, and the channels hub still routed
  websocket event changes through renderer `from-backend` guards.
- Change: updated the voice/audio channel guide and channels hub to route TTS
  playback through the typed `audio-chunk` side-channel,
  `DesktopAudioRuntimeClient`, and renderer audio playback services while
  keeping backend TTS generation on the main query websocket.
- Validation: extended the voice routing boundary guard to require typed audio
  side-channel and renderer audio runtime wording while rejecting the retired
  `from-backend` audio path.
- Compatibility: no migration required. Runtime code, IPC channel names,
  backend `audio-chunk` payloads, SDK conversation events, renderer playback
  behavior, storage, credentials, permissions, provider policy, hosted URLs,
  and local execution behavior are unchanged.

### 2026-06-20 Channel Chat SDK Transport Map Boundary

- Finding: the first-read channels hub still summarized dashboard and
  minimal-pill chat as renderer or overlay IPC going directly to backend `/ws`,
  and the channel routing matrix still described minimal-pill query transport
  as overlay IPC to Electron main to `/ws`.
- Change: updated the channel hub and routing matrix to route desktop chat
  entries through renderer SDK commands, the Electron Agent SDK host, and Agent
  SDK backend transport before the backend websocket query, while keeping
  backend query ownership unchanged.
- Validation: added a focused channel docs boundary guard requiring the Agent
  SDK host/backend-transport path and rejecting the retired direct
  Electron-IPC-to-backend query summaries.
- Compatibility: no migration required. Runtime code, IPC channel names,
  `windie:invoke` command names, backend websocket payloads, SDK projection
  events, storage, credentials, permissions, provider policy, hosted URLs, and
  local execution behavior are unchanged.

### 2026-06-20 Wakeword Local-Runtime Helper Route Docs Boundary

- Finding: renderer voice, voice/audio workflow, runtime-node, and triage docs
  still routed wakeword chunks or failures directly to the sidecar/Python
  wakeword service, even though the reusable boundary is the local-runtime
  wakeword helper backed by the Python service implementation.
- Change: reworded those docs to put renderer capture through
  `DesktopVoiceRuntimeClient`, Electron wakeword bridge framing, and the
  local-runtime wakeword helper, while preserving the Python wakeword service
  as the current concrete implementation and test target.
- Validation: extended the voice routing boundary guard to read the renderer
  voice reference and triage docs, require local-runtime wakeword helper
  wording, and reject retired direct sidecar-service route phrases.
- Compatibility: no migration required. Runtime code, wakeword IPC channels,
  subprocess framing, backend wakeword activation messages, renderer voice
  state, storage, credentials, permissions, provider policy, hosted URLs, and
  local execution behavior are unchanged.

### 2026-06-20 Local Tool Channel Hub Boundary

- Finding: the docs hub still summarized Local Tool Channels as Python sidecar
  daemon execution, which made the route label skip the SDK/main local-runtime
  ownership boundary even though the linked channel docs already use
  local-runtime wording.
- Change: updated the docs hub summary to route through SDK/main local-runtime
  execution with Python sidecar as implementation detail, and extended the
  modular docs guard to reject the old hub wording.
- Validation: passed focused frontend docs boundary test, docs listing, stale
  phrase scan, and diff check.
- Compatibility: no migration required. Runtime code, local-runtime execution,
  Python sidecar implementation, executable tool schemas, IPC channels,
  transcript storage, settings, credentials, permissions, provider policy, and
  hosted URLs are unchanged.

### 2026-06-20 Transcription and Overlay Event Docs Boundary

- Finding: the backend endpoint reference still labeled `/ws/transcription`
  payloads as renderer-to-backend/backend-to-renderer messages, and the
  response-overlay reference still described renderer backend-wire stream
  handlers even though the generic boundary is a client/backend transcription
  gateway plus SDK conversation-event/SDK live-turn side effects.
- Change: renamed the transcription route message headings to
  client-to-backend/backend-to-client transcription messages, reworded overlay
  transcript/history side-effect ownership through SDK conversation events, and
  extended the modular runtime docs guard to reject the stale renderer/backend
  and backend-wire phrases.
- Validation: passed focused frontend docs boundary test, docs listing, stale
  phrase scan, and diff check.
- Compatibility: no migration required. Runtime code, transcription websocket
  paths, message payloads, SDK event shapes, IPC channels, transcript storage,
  settings, credentials, permissions, provider policy, and hosted URLs are
  unchanged.

### 2026-06-20 Tool Result Envelope Docs SDK Boundary

- Finding: current-facing IPC, test-selection, local-runtime tool workflow, and
  capture payload docs still named the retired `ToolResultEnvelope` helper or
  old frontend executable-tool wording, even though result envelope ownership
  now lives in SDK tool coordination plus backend/local-runtime contracts.
- Change: replaced those references with SDK result-envelope, local-runtime
  executable-tool, and renderer tool-display wording, and extended the modular
  boundary guard to reject the retired helper/test names in current docs.
- Validation: passed focused frontend docs boundary test, docs listing, stale
  phrase scan, and diff check.
- Compatibility: no migration required. Runtime code, SDK event shapes,
  local-runtime execution, IPC channels, transcript storage, settings,
  credentials, permissions, provider policy, and hosted URLs are unchanged.

### 2026-06-20 Tool Validation Docs SDK Runtime Boundary

- Finding: current-facing docs hub, evidence, validation, websocket event,
  error/failure, inventory, and architecture guidance still routed tool runtime
  checks through removed renderer ToolRunner state or test targets.
- Change: updated those routes to use SDK/local-runtime coordination and
  renderer tool display/persistence wording, and extended the modular docs
  boundary guard to reject retired ToolRunner validation phrases while leaving
  historical removed-helper references in dedicated reference docs.
- Validation: passed focused frontend docs boundary test, docs listing, stale
  phrase scan, and diff check.
- Compatibility: no migration required. Runtime code, SDK event shapes,
  local-runtime execution, IPC channels, transcript storage, settings,
  credentials, permissions, provider policy, and hosted URLs are unchanged.

### 2026-06-20 Renderer Tool Runtime Docs Boundary

- Finding: renderer/backend event and provider docs still used deleted renderer
  tool-runner wording for stale-turn rejection, validation, and overlay drift
  hotspots even though local execution is now claimed by the SDK
  `ToolExecutionCoordinator` and renderer surfaces only consume display and
  transcript side effects.
- Change: routed the event-consumer matrix, renderer state validation table,
  and provider drift notes through SDK tool coordination plus renderer
  stream/display side-effect wording, then extended the modular docs boundary
  guard to reject the stale tool-runner phrases.
- Validation: passed focused frontend docs boundary test, docs listing, stale
  phrase scan, and diff check.
- Compatibility: no migration required. Runtime code, SDK event shapes,
  local-runtime execution, IPC channels, transcript storage, settings,
  credentials, permissions, provider policy, and hosted URLs are unchanged.

### 2026-06-20 IPC Workflow SDK Relay Drift Boundary

- Finding: the IPC change workflow still told agents to debug backend relay
  drift by inspecting a remaining non-chat `to-backend` send path, even though
  live source has removed that relay and current renderer/backend routing uses
  `windie:invoke`, typed SDK/backend-event fan-out, settings sync gates, and
  Agent SDK backend transport.
- Change: updated the IPC workflow backend-relay drift row to route through
  SDK commands, typed fan-out, query payload building, and Agent SDK backend
  transport send ownership.
- Validation: extended the architecture/IPC docs boundary guard to read the IPC
  workflow, require the current SDK command/fan-out wording, and reject the
  retired non-chat `to-backend` debug route.
- Compatibility: no migration required. Runtime code, preload allowlists, IPC
  channel names, `windie:invoke` command names, backend websocket payloads,
  SDK projection events, storage, credentials, permissions, provider policy,
  hosted URLs, and local execution behavior are unchanged.

## Remaining Findings

- Docs hub and process-health event debugging copy now routes through SDK
  projection events and typed backend side-channel events instead of
  current-facing `from-backend` listener summaries.
- Renderer folder-structure streaming response docs now show Agent SDK runtime
  websocket receive/projection ownership instead of Electron main directly
  receiving backend WebSocket events.
- Frontend architecture and renderer folder-structure wakeword flow docs now
  route wakeword capture through the local-runtime wakeword helper backed by
  the Python service/subprocess instead of a direct Electron-main-to-Python
  service path.
- Websocket event first-read docs now route renderer-visible backend stream
  output through Agent SDK normalization/projection and typed Electron fan-out
  channels instead of the retired generic Electron/main rebroadcast or
  `from-backend` model.
- Renderer product naming is now skin-owned in live renderer source, including chat browser-session copy. Fresh inspection found WindieOS product naming only in `windieDesktopSkin.js` under `frontend/src/renderer`.
- Main process composition root, permission services, query event builders, SDK agent name, tray tooltip, MCP client identity, layer-log prefixes, bundled wakeword/sidecar reinstall guidance, local browser warmup, and OAuth callback copy now read related product copy from a host skin. Fresh inspection found WindieOS product naming only in `main_host_skin.cjs` under `frontend/src/main`.
- Main-private log guard, renderer-console attachment, pending collapse, and
  screenshot-suppression state markers now use generic desktop-agent names; old
  Windie-specific markers remain only in boundary assertions that prevent
  reintroduction.
- Main local-backend bridge fallback errors now describe the generic Agent SDK
  local runtime instead of a Windie-specific SDK runtime; SDK-owned lifecycle
  and public IPC/status contracts are unchanged.
- Main IPC connection, wake-up, and query-send fallback logs now describe the
  generic Agent SDK runtime while preserving public `WindieClient`/`WindieAgent`
  SDK API names.
- Main IPC local SDK customer state now uses generic agent/client identifiers,
  while public SDK API names and `windie:*` wire channels remain unchanged.
- Dashboard recent-chat retry state no longer matches sidecar daemon wording in feature utilities; the desktop conversation library facade owns runtime-specific transient metadata-list error classification.
- Main Electron adapter fallback errors for sidecar launch and artifact-image trust are generic outside the host skin.
- Main's strict SDK command allowlist now exposes generic internal helper/dependency names (`handleAgentSdkInvoke`, `buildAgentSdkCommandHandlers`, `ensureAgent`) while keeping the `windie:invoke` IPC channel as the existing wire contract.
- Renderer app-runtime facades now call `invokeAgentSdkCommand(...)` from `agentSdkCommandInvokeClient.ts` while keeping `window.windie` / `windie:invoke` as the existing preload/IPC wire contract.
- Renderer-private onboarding readiness, model-list request guarding, wakeword
  retry state, and replay-send error tags now use generic desktop-agent marker
  names; old Windie-specific markers remain only in boundary assertions that
  prevent reintroduction.
- Renderer markdown rendering no longer receives provider/model identity for
  display normalization; escaped transport-artifact cleanup is generic and
  assistant-display scoped.
- Renderer tool stream handling no longer has a separate no-op hook; tool
  call/output/bundle display remains owned by SDK current-turn projection side
  effects.
- Voice capture internals now use generic desktop-agent naming. The remaining
  renderer voice references are intentional feature/runtime names, not product
  skin copy.
- SDK default agent display names are generic (`Desktop Agent` from
  `buildAgentDefinition(...)`, `Agent` from `wakeUp(...)`) so host skin/config
  remains the product identity owner.
- SDK deep-module export cleanup is complete for the helpers covered by this
  slice: `normalizeWsUrl`, `summarizeAgentDefinitionCapabilities`,
  `compactedReplayFromEvent`, context-enrichment render helpers, tool-output
  content shapes, capability summaries, and internal diagnostic types are
  private behind their owning entrypoints. Broader public SDK API naming still
  intentionally uses Windie-branded class/type names.
- SDK runtime diagnostics, request/local-runtime failures, managed-session logs,
  and model-selection validation now use generic Agent SDK wording. Public
  `WindieClient`/`WindieAgent` API names remain unchanged.
- SDK transport listener plumbing uses generic private agent-session type names.
  Exported Windie SDK transport names remain unchanged.
- SDK managed endpoint validation now uses generic endpoint wording and rejects
  invalid endpoint configuration without leaving connection waiters alive.
- SDK-generated default agent IDs now use generic `agent-default` and `agent-*`
  values. Explicit caller IDs remain unchanged; the temporary backend
  `windie_default` bridge was later removed so live payloads use `default`.
- Preload SDK-command validation diagnostics now use generic Agent SDK wording.
  The `window.windie` bridge and `windie:invoke` channel remain the existing
  wire contracts.
- Python SDK stream and trace-query fallback diagnostics now use generic Agent
  SDK wording. Public Python package names remain unchanged.
- JS SDK stream projection fallback diagnostics now use generic Agent stream
  wording. Public stream event and SDK package names remain unchanged.
- SDK local-runtime auto-start discovery and stop timeout diagnostics now use
  generic local sidecar daemon wording. Public SDK/Python package names remain
  unchanged.
- SDK hosted install registration now requires explicit
  `installAuth.autoRegister = true`; the SDK no longer infers backend auth
  policy from the WindieOS hosted endpoint hostname.
- SDK hosted endpoint selection now requires caller config or
  `WINDIE_BACKEND_URL`; the generic SDK runtime no longer embeds the WindieOS
  hosted backend URL.
- Python sidecar/SDK hosted endpoint selection now requires caller config or
  `WINDIE_BACKEND_HTTP_URL`; shared Python backend config no longer embeds the
  WindieOS hosted backend URL.
- Backend tool-result receiver and API handler source wording now describes
  SDK/local-runtime result ingress rather than frontend-owned tool results.
- SDK hosted HTTP, local-runtime HTTP, and backend websocket construction
  failures now use generic Agent SDK dependency diagnostics. Exported
  `WindieSdkClient` and `createWindieSdkBackendSocket` names remain unchanged.
- Sidecar browser tool descriptions now refer to the dedicated browser runtime
  instead of embedding Windie/WindieOS product naming in executable tool
  metadata. Browser docs still intentionally describe WindieOS ownership and
  trust boundaries.
- Sidecar shell tool descriptions now refer to the selected workspace folder
  instead of embedding WindieOS product naming in executable tool metadata.
- Python SDK wake-up and local-runtime preflight diagnostics now use generic
  Agent SDK wording. Public Python package and class names remain unchanged.
- Sidecar browser launcher/runtime diagnostics now describe the dedicated
  browser CDP/profile boundary generically. Existing helper names and
  environment variables remain unchanged.
- Renderer provider credential defaults and API-key display specs now live in
  renderer skin/config and are shared by config storage plus settings UI.
- Renderer provider model-card fallback descriptions and strengths now live in
  renderer skin/config; backend catalog metadata still wins when present.
- Renderer chat model provider label overrides now live in the shared provider
  display skin config while the model picker keeps its existing formatter API.
- Renderer default model selection values now live in renderer skin/config;
  config storage still emits the same `model_mode`, `model_provider`, and
  `selected_model_id` settings fields.
- Main OpenAI Codex OAuth IPC fallback copy now comes from main host skin/config
  with generic OAuth defaults in the handler itself.
- Sidecar packaged runtime dependency failures now use generic bundled-app
  reinstall/restart copy instead of embedding WindieOS product naming in local
  executable paths.
- Sidecar macOS System Events automation verifier fallback reasons now use
  generic app wording; host permission copy remains the product-specific layer.
- Sidecar daemon MCP client identity and CLI help now use generic local sidecar
  wording.
- Sidecar helper docstrings and unsupported-OS user-data path errors now use
  generic local-runtime wording while preserving the existing `windieos`
  storage directory.
- Main OpenAI Codex OAuth callback error prefixes now read from host skin copy,
  with a generic OAuth default in the provider helper.
- Public channel/node/docs-hub labels now expose local-runtime JSON-RPC as the
  reusable channel boundary while retaining Python sidecar JSON-RPC wording for
  concrete implementation protocol references. The desktop-node local tool
  lifecycle now shows SDK/main local-runtime execution with renderer SDK
  projection consumption.
- Sidecar-backed tool/runtime hub headings and link labels now use
  local-runtime implementation wording, while concrete Python sidecar daemon,
  JSON-RPC, registry, protocol, and packaging references remain explicit.
- Main local-runtime lifecycle workflow now describes generic daemon ownership,
  packaged local-runtime Python launch options, packaged local-runtime
  behavior, and local-runtime binary paths while preserving concrete
  `sidecar_daemon.py` implementation breadcrumbs.
- Python sidecar architecture packaging expectations now describe bundled
  local-runtime Python dependencies instead of sidecar runtime deps.
- Backend remote-tool parity tests now name the imported executable tool set as
  local-runtime exposed tools instead of frontend exposed tools.
- Backend token-count/tool-schemas formatter docs now identify SDK/renderer
  typed message guards as the consumers for contract-sensitive payloads instead
  of frontend schema guards.
- SDK runtime transport exports now expose only `createAgentRuntimeTransport`;
  the temporary `createAgentBackendTransport` compatibility alias has been
  removed from TypeScript source, checked-in CJS output, docs, and package
  boundary expectations. Public SDK callers that used the alias should rename
  the import; no storage, IPC, websocket payload, credential, permission,
  provider-policy, local-runtime, or renderer migration is required.
- SDK package-root managed-session exports now expose the agent-shaped managed
  hosted session only. `ManagedBackendSession` and
  `createManagedBackendSession` stay as lower-level transport implementation
  module details with focused behavior coverage, while public package callers
  use `ManagedAgentSession` / `createManagedAgentSession`. No storage, websocket
  payload, IPC, credential, permission, provider-policy, renderer, or
  local-runtime migration is required.
- Renderer chat store current-turn state now uses the runtime
  `CurrentTurnProjection` contract directly instead of a store-local
  `SdkCurrentTurnProjection` alias. The state shape, SDK projection payloads,
  IPC channels, persisted transcript data, credentials, permissions, hosted
  backend URLs, provider policy, and local-runtime behavior are unchanged.
- Pure Agent SDK frontend tests now import `packages/windie-sdk-js/src`
  directly instead of routing through the renderer `agentSdkClient` facade,
  with a package-boundary guard keeping those tests on the SDK package surface.
  Renderer integration tests that exercise hooks/store behavior keep using the
  renderer facade. Production code, SDK exports, IPC payloads, credentials,
  permissions, hosted backend URLs, provider policy, storage, and local-runtime
  behavior are unchanged.
- Renderer app-runtime SDK consumers now route command constants and SDK types
  through `desktopConversationRuntimeContracts.ts`; only that contracts facade
  imports the renderer `agentSdkClient` facade. Runtime behavior, SDK exports,
  IPC command strings, settings/model payloads, memory commands, conversation
  continuity, credentials, permissions, hosted backend URLs, provider policy,
  storage, and local-runtime behavior are unchanged.
- Renderer browser-session diagnostics now import the SDK runtime-command
  contract module directly instead of the full renderer `agentSdkClient`
  facade; chat feature code still reaches browser controls through
  `desktopBrowserSessionRuntimeClient.js`. Browser action IPC, the
  `diagnostics.append` command string, readiness handling, tab snapshots,
  credentials, permissions, hosted backend URLs, provider policy, storage, and
  local-runtime behavior are unchanged.
- Renderer architecture/source-map docs now keep the deleted
  `infrastructure/api/client.ts` retired and describe `agentSdkClient.ts` as
  the SDK runtime/hosted transport facade rather than an app-import route.
  Runtime code, SDK exports, IPC channels, hosted backend URLs,
  settings/model payloads, credentials, permissions, storage, provider policy,
  and local-runtime behavior are unchanged.
- Renderer SDK-backed transcript store/projection adapters now import SDK
  contracts from SDK owner modules. Production renderer `agentSdkClient`
  imports are guarded behind
  `desktopConversationRuntimeContracts.ts`; conversation store behavior,
  display-row projection, SDK exports, IPC command strings, persisted
  transcript data, credentials, permissions, hosted backend URLs, provider
  policy, storage, and local-runtime behavior are unchanged.
- Browser extraction docs now match the active local-runtime adapter: `extract`
  is documented as Browser Use HTML plus deterministic markdown/focused-excerpt
  processing instead of a Windie-specific Browser Use extraction model env
  requirement. Browser action schemas, CLI invocation, dedicated CDP/profile
  behavior, tool outputs, storage, credentials, permissions, hosted backend
  URLs, provider policy, and IPC payloads are unchanged.
- Browser schema tests now describe canonical browser actions and
  local-runtime adapter actions without Windie-owned lifecycle labels. Browser
  schemas, model-facing exposure, local-runtime validation, Browser Use
  execution, storage, credentials, permissions, hosted backend URLs, provider
  policy, and IPC payloads are unchanged.
- Runtime configuration docs now list generic `AGENT_*` local-runtime env vars
  as the reusable host contract and document matching `WINDIE_*` keys as
  WindieOS launch/test aliases. Env support, host skin injection, local-runtime
  launch behavior, storage paths, credentials, permissions, hosted backend
  URLs, provider policy, and IPC payloads are unchanged.
- Exposed-tool parity docs now finish routing docs hub, tool schema checklist,
  and Python registry reference wording through the local-runtime exposed tool
  surface backed by Python sidecar modules. Tool names, schemas, executable
  registry behavior, SDK/main dispatch, Python sidecar modules, storage,
  credentials, permissions, provider policy, hosted URLs, and IPC payloads are
  unchanged.
- Web client integration docs now route public TypeScript clients to
  `packages/windie-sdk-js`, app-internal Electron renderer requests to
  app-runtime facades, and `agentSdkClient.ts` to first-party renderer SDK
  facade wording. Runtime code, SDK exports, IPC channels, hosted backend URLs,
  settings/model payloads, credentials, permissions, storage, provider policy,
  and local-runtime behavior are unchanged.
- Renderer state workflow docs now route dispatch ownership through desktop
  app-runtime facades and SDK-shaped command clients instead of legacy
  IPC/backend clients. Runtime code, renderer app-runtime clients, SDK
  commands, IPC channels, hosted backend URLs, settings/model payloads,
  credentials, permissions, storage, provider policy, and local-runtime behavior
  are unchanged.
- Web-search docs now clarify that backend-owned `web_search` is enabled by
  backend provider/model policy and credentials, not renderer settings or
  client/local-runtime manifests. Backend web-search policy, provider-native
  search routing, Brave configuration, SDK/renderer projection, client
  manifests, local-runtime executable tools, credentials, storage, IPC channels,
  and hosted URLs are unchanged.
- Browser policy docs now route registry checks through the local-runtime
  executable registry instead of an unqualified sidecar registry label. Browser
  policy behavior, accepted client manifests, local-runtime executable registry
  behavior, Python sidecar modules, backend tool policy, provider projection,
  credentials, storage, IPC channels, and hosted URLs are unchanged.
- Tool lifecycle, channel, backend tool-turn, renderer overlay, capture, startup,
  packaging, and SDK conversation docs now name SDK/main local-runtime dispatch,
  Python sidecar implementation, Electron main window/overlay ownership,
  local-runtime startup, and backend-wire compatibility handlers explicitly
  instead of broad SDK/main dispatch-runtime, sidecar-startup, or Electron
  main-runtime labels. Runtime code, SDK exports, IPC payloads, local-runtime
  execution, storage, credentials, permissions, hosted backend URLs, and
  provider policy are unchanged.
- ADR 005, tool contract, and local-runtime backend-config docs now describe the
  local-runtime manifest/entrypoint/remote-request contract through
  local-runtime dispatch and Python implementation wording instead of
  sidecar-owned execution or sidecar request labels. Runtime code, extension
  manifest fields, entrypoint arguments, backend URLs, environment-variable
  precedence, trailing-slash normalization, SDK dispatch, storage, credentials,
  permissions, hosted backend URLs, and provider policy are unchanged.
- Tool troubleshooting, schema-policy, backend change-path, browser schema,
  IPC/channel, transcript, packaging, and tool-system docs now describe
  local-runtime daemon reachability, local-runtime bridge routing, and
  local-runtime executable schema/backend-vs-local-runtime parity instead of
  sidecar process/schema/route labels. Runtime code, JSON-RPC method names,
  executable schemas, client manifests, backend tool schemas, IPC payloads,
  storage, credentials, permissions, hosted backend URLs, and provider policy
  are unchanged.
- Backend tool registry docs now route parity labels through
  backend/local-runtime exposed-tool wording, and the local-runtime bridge guide
  describes backend-declared built-ins as locally executable requirements
  instead of backend client-executable names. Runtime code, tool names, schemas,
  client manifests, local-runtime execution, Python sidecar modules, IPC
  payloads, storage, credentials, permissions, hosted backend URLs, and provider
  policy are unchanged.
- Packaged startup/path, auth-state, browser adapter, platform validation, and
  release-packaging docs now describe local-runtime launch/startup boundaries
  instead of sidecar launch labels while keeping Python sidecar implementation
  paths visible where they are concrete debugging evidence. Runtime code,
  packaged path resolution, auth-state env propagation, Browser Use adapter
  behavior, local-runtime startup, storage, credentials, permissions, hosted
  backend URLs, IPC payloads, and provider policy are unchanged.
- Platform, operations, doctor, protocol-error, packaged-build, and development
  workflow docs now route public sidecar-process labels through local-runtime
  startup or Electron host-status wording while keeping the packaged Python
  sidecar entrypoint explicit. Runtime code, packaged startup, local-runtime
  status payloads, Python entrypoints, IPC payloads, storage, credentials,
  permissions, hosted backend URLs, and provider policy are unchanged.
- Logging, diagnostic flags, process-health, runtime-trace, and docs-index
  debug labels now use local-runtime Python wording instead of sidecar debug
  labels. Runtime code, log sinks, stderr behavior, diagnostic flags, process
  startup, IPC payloads, storage, credentials, permissions, hosted backend URLs,
  and provider policy are unchanged.
- The debug Stream Event Trace table now routes stream debugging through SDK
  backend-event handling, main renderer fan-out, and renderer SDK
  conversation-event consumption instead of relay-only stream wording. Runtime
  code, websocket events, IPC channels, SDK projections, renderer state,
  storage, credentials, permissions, hosted backend URLs, and provider policy
  are unchanged.
- The mobile planning baseline now describes desktop tool execution as SDK
  local-runtime execution backed by the Python sidecar implementation instead
  of a parallel local Python sidecar runtime target. Runtime code, mobile APIs,
  capability-negotiation plans, tool schemas, IPC channels, storage,
  credentials, permissions, hosted backend URLs, and provider policy are
  unchanged.
- The private SDK managed websocket lifecycle helper is now named
  `ManagedWebSocketSession`, with `ManagedAgentSession` remaining the public
  managed hosted-session API. Public SDK root exports, websocket payloads,
  hosted backend URLs, credentials, permissions, local-runtime behavior,
  storage, and provider policy are unchanged; no migration is required for
  public callers.
- The renderer folder-structure source map now restores the
  `desktopToolGhostRuntime.ts` tree entry instead of carrying literal `???`
  placeholders. Runtime code, renderer behavior, IPC channels, SDK contracts,
  storage, credentials, permissions, hosted backend URLs, and provider policy
  are unchanged; no migration is required.
- The local-runtime launch-options test helper now uses the
  `createHostSkinLocalRuntimeLaunchPlan` name instead of a Windie-prefixed
  helper while still exercising the same host-skin daemon entrypoint injection.
  Runtime code, launch options, env precedence, local-runtime startup, storage,
  credentials, permissions, hosted backend URLs, and provider policy are
  unchanged; no migration is required.
- The local-runtime tool change workflow file now lives at
  `docs/frontend/local_runtime_tool_change_workflow.md`, with cross-runtime
  links updated away from the sidecar-facing path. Runtime code,
  local-runtime Python implementation, backend tool schemas, SDK/main dispatch,
  IPC channels, storage, credentials, permissions, hosted backend URLs, and
  provider policy are unchanged; no migration is required.
- The local-runtime Python implementation workflow now lives at
  `docs/frontend/sidecar/local_runtime_python_change_workflow.md`, with inbound
  routing links updated away from the sidecar-facing filename. Runtime code,
  local-runtime Python behavior, JSON-RPC methods, executable tool schemas,
  Electron bridge IPC, storage, credentials, permissions, hosted backend URLs,
  and provider policy are unchanged; no migration is required.
- The transcript replay workflow summary now describes generic SDK-backed
  transcript projections instead of a WindieOS-branded SDK projection label.
  Runtime code, SDK projections, transcript storage, backend rehydrate payloads,
  IPC channels, local-runtime Python storage behavior, storage schemas,
  credentials, permissions, hosted backend URLs, and provider policy are
  unchanged; no migration is required.
- The SDK context-enrichment focused test now lives at
  `tests/frontend/AgentSdkContextEnrichment.test.ts`, with validation docs
  routed away from the Windie-prefixed test name. Runtime code, SDK context
  enrichment, model-facing query content, memory embedding/search behavior,
  IPC payloads, local-runtime Python storage behavior, storage schemas,
  credentials, permissions, hosted backend URLs, and provider policy are
  unchanged; no migration is required.
- The private SDK managed websocket focused test now lives at
  `tests/frontend/AgentSdkManagedWebSocketSession.test.ts`, matching the
  generic `ManagedWebSocketSession` helper name after the private transport
  rename. Runtime code, private SDK transport behavior, public SDK exports,
  websocket payloads, reconnect/fallback behavior, local-runtime behavior,
  storage, credentials, permissions, hosted backend URLs, and provider policy
  are unchanged; no migration is required.
- The SDK model-selection focused test now lives at
  `tests/frontend/AgentSdkModelSelection.test.ts`, matching the generic Agent
  SDK settings helper it covers. Runtime code, SDK model-selection patch
  behavior, backend settings payload keys, renderer settings behavior, IPC
  payloads, storage, credentials, permissions, hosted backend URLs, and provider
  policy are unchanged; no migration is required.
- The SDK file conversation store focused test now lives at
  `tests/frontend/AgentSdkFileConversationStore.test.ts`, with active docs and
  package-boundary references routed to the generic Agent SDK store route.
  Runtime code, file conversation store behavior, SDK package exports,
  display/rehydrate projections, storage schemas, credentials, permissions,
  hosted backend URLs, and provider policy are unchanged; no migration is
  required.
- The SDK mock-backend E2E focused test now lives at
  `tests/frontend/AgentSdkMockBackendE2E.test.ts`, with package-boundary
  references routed to the generic Agent SDK E2E route. Runtime code, mock
  backend behavior, SDK websocket flow, local-runtime tool-result return,
  conversation storage, credentials, permissions, hosted backend URLs, and
  provider policy are unchanged; no migration is required.
- The SDK conversation runtime focused test now lives at
  `tests/frontend/AgentSdkConversationRuntime.test.ts`, with active validation
  docs and package-boundary references routed to the generic Agent SDK runtime
  route. Runtime code, SDK conversation runtime behavior, event normalization,
  display/rehydrate projections, tool coordination, transcript storage, backend
  payload shapes, credentials, permissions, hosted backend URLs, and provider
  policy are unchanged; no migration is required.
- The SDK client behavior focused test now lives at
  `tests/frontend/AgentSdkClient.test.ts`, with active validation docs and
  package-boundary references routed to the generic Agent SDK client route.
  Runtime code, SDK client behavior, hosted backend route payloads,
  local-runtime daemon/tool contracts, transcript storage, credentials,
  permissions, hosted backend URLs, provider policy, and Python SDK
  compatibility assertions are unchanged; no migration is required.
- The SDK package-boundary focused test now lives at
  `tests/frontend/AgentSdkPackageBoundary.test.ts`, with active validation docs
  routed to the generic Agent SDK package-boundary route while the test still
  describes the real `@windie/sdk` package name. Public SDK exports, package
  name, runtime behavior, hosted backend payloads, local-runtime contracts,
  credentials, permissions, hosted backend URLs, and provider policy are
  unchanged; no migration is required.
- The public Agent conversation-store API focused test now lives at
  `tests/frontend/AgentConversationStoreApi.test.ts`, with the retired
  `WindieAgentConversationStoreApi` route guarded absent. SDK public Agent
  APIs, conversation-store behavior, local-runtime store RPC payloads,
  transcript storage, credentials, permissions, hosted backend URLs, and
  provider policy are unchanged; no migration is required.
- The SDK private-exports focused test now lives at
  `tests/frontend/AgentSdkPrivateExports.test.cjs`, with the retired
  `WindieSdkPrivateExports` route guarded absent. Public SDK exports, private
  CJS helper boundaries, removed compatibility-module assertions, package name,
  runtime behavior, credentials, permissions, hosted backend URLs, and provider
  policy are unchanged; no migration is required.
- SDK, main, and renderer contract-module headers now name their owner-specific
  jobs directly: SDK backend payload filtering, Electron main overlay phase
  contracts, and renderer LLM output rendering contracts. Backend websocket
  payload keys, overlay phase metadata, renderer markdown/output normalization,
  IPC channels, storage, credentials, permissions, hosted backend URLs, and
  provider policy are unchanged; no migration is required.
- Renderer voice/transcription docs now route provider selection, provider
  session setup, and model config details through the backend-owned
  `/ws/transcription` gateway boundary, while renderer topology describes
  playback as typed `audio-chunk` runtime events. Transcription websocket
  routes, provider selection, provider/model config, audio chunk event payloads,
  renderer playback behavior, IPC channels, storage, credentials, permissions,
  hosted backend URLs, and local-runtime behavior are unchanged; no migration
  is required.
- `<windie> extension create` now generates plugin metadata and README copy
  with generic local-runtime plugin labels, and its success output names the
  generated local-runtime plugin and prompt skill contribution types instead of
  embedding WindieOS identity in the plugin artifact labels. CLI command names,
  generated directory layout, `plugin.json` schema fields, Python entrypoints,
  skill front matter, manifest loading, permissions, credentials, IPC channels,
  local-runtime execution, hosted backend URLs, and provider policy are
  unchanged; no migration is required.
- SDK route/auth docs now label Python validation rows as Python SDK package
  client and Python SDK remote auth/error wrapper coverage while preserving the
  current local-runtime Python test-suite paths and CLI wrapper. Python SDK
  package code, test file locations, CLI test commands, local-runtime Python env
  selection, hosted SDK routes, credentials, permissions, IPC channels, storage,
  provider policy, and local execution are unchanged; no migration is required.
- Agent SDK client behavior tests now use neutral hosted endpoint fixtures for
  HTTP route construction, websocket sessions, managed fallback, SDK client, and
  legacy-env compatibility coverage instead of production WindieOS URLs or
  product-flavored test hosts. SDK source, hosted route construction, websocket
  fallback behavior, package names, environment variable names, credentials,
  permissions, storage, provider policy, hosted backend contracts, and
  local-runtime behavior are unchanged; no migration is required.
- Agent SDK client, public conversation-store API, and conversation-runtime
  tests now use neutral project workspace paths/names instead of WindieOS-named
  workspace fixture data, with a modular guard for those SDK-focused tests.
  Conversation event payload keys, workspace metadata extraction,
  local-runtime conversation-store RPC shapes, SDK projections, storage
  contracts, credentials, permissions, hosted backend URLs, provider policy,
  and local-runtime behavior are unchanged; no migration is required.
- Platform window/input and validation docs now describe Electron-owned policy
  through desktop app/app-owned windows and surfaces instead of WindieOS-window
  ownership labels, and the modular boundary guard now reads those platform
  docs. Electron window policy, overlay behavior, screenshot
  hide/protect/restore flow, permission probes, IPC channels, storage,
  credentials, local-runtime platform adapters, hosted backend URLs, and
  provider policy are unchanged; no migration is required.
- The high-level architecture overview now lists renderer runtime clients and
  SDK command facades instead of a stale renderer API-client backend
  communication entry. Renderer runtime clients, IPC channels, SDK command
  payloads, backend websocket transport, artifact URL helpers, storage,
  credentials, permissions, local-runtime behavior, hosted backend URLs, and
  provider policy are unchanged; no migration is required.
- The frontend runtime surface matrix now names the Electron Agent SDK host,
  typed SDK/backend-event fan-out, and SDK local-runtime result delivery instead
  of stale main-process backend-bridge and sidecar-callback labels. IPC
  channels, SDK command payloads, hosted WebSocket transport, settings ACK
  gates, tool-result routing, local-runtime bridge behavior, storage,
  credentials, permissions, hosted backend URLs, and provider policy are
  unchanged; no migration is required.
- The frontend architecture SDK event fan-out row now warns against a direct
  backend relay instead of a revived generic backend bridge. SDK event fan-out
  channels, renderer SDK commands, Electron main handler registration, hosted
  WebSocket transport, storage, credentials, permissions, local-runtime
  behavior, hosted backend URLs, and provider policy are unchanged; no
  migration is required.
- Remaining Agent SDK project/query fixture samples now use neutral
  `/tmp/project-alpha` and `project docs` values instead of WindieOS-flavored
  sample data. SDK builder payload keys, native web-search projection behavior,
  rehydrate snapshots, package names, legacy compatibility guards, browser
  scope metadata, storage, credentials, permissions, hosted backend URLs,
  provider policy, and local-runtime behavior are unchanged; no migration is
  required.
- Renderer desktop workspace runtime and conversation-binding fixture samples
  now use neutral `project-alpha` workspace paths/names instead of
  WindieOS-flavored sample data. Workspace update normalization, active
  workspace presentation, value-level selection comparison, session-storage
  binding keys, IPC channels, permissions, storage format, credentials, hosted
  backend URLs, provider policy, and local-runtime behavior are unchanged; no
  migration is required.
- Renderer dashboard conversation metadata and live-turn fixture samples now
  use neutral `project-alpha` workspace paths/names instead of
  WindieOS-flavored sample data. Dashboard grouping, recent-conversation
  metadata normalization, conversation library command mapping, desktop
  conversation store metadata passthrough, live-turn `workspace_path`
  normalization, new-chat workspace binding, IPC channels, permissions,
  storage format, credentials, hosted backend URLs, provider policy, and
  local-runtime behavior are unchanged; no migration is required.
- Local-runtime chat event store fixture samples now use neutral
  `project-alpha` workspace paths/names and user-facing text instead of
  WindieOS-flavored sample data. SQLite schema, event append/load behavior,
  conversation visibility filtering, list metadata, title derivation,
  workspace metadata persistence, revision storage, IPC/RPC payload contracts,
  credentials, permissions, hosted backend URLs, provider policy, and
  renderer/SDK behavior are unchanged; no migration is required.
- Unicode/mojibake repair fixture samples now use neutral `Project Alpha`
  active-document text instead of WindieOS-flavored sample data. Unicode repair
  behavior, lone-surrogate replacement, stream-update payload shape, tool schema
  payload mapping, IPC/RPC contracts, storage, credentials, permissions, hosted
  backend URLs, provider policy, and product skin behavior are unchanged; no
  migration is required.
- Backend web-search/provider fixture samples now use neutral `project alpha`
  query text instead of WindieOS-flavored sample data. OpenAI/Gemini native
  source extraction, source de-duplication, backend tool-sender progress
  ordering, backend-executed tool-output behavior, query payload shape,
  credentials, permissions, hosted backend URLs, provider policy, and
  local-runtime behavior are unchanged; no migration is required.
- Renderer browser session fixture samples now use neutral docs, repository,
  and pricing URLs instead of WindieOS-flavored browser tab domains. Browser
  session store readiness, active-tab labeling, carousel switching, disconnect,
  polling, in-flight connect behavior, IPC channels, storage, permissions,
  hosted backend URLs, provider policy, and local-runtime browser behavior are
  unchanged; no migration is required.
- Main permission workspace fixture samples now use neutral `project-alpha`
  temp path prefixes instead of WindieOS-flavored sample directories. Workspace
  picker grants, active-workspace updates, selected-path persistence,
  untrusted-path rejection, sanitized diagnostics, IPC channels, storage,
  permissions, hosted backend URLs, provider policy, and local-runtime behavior
  are unchanged; no migration is required.
- Repo instruction runtime fixture samples now use neutral `project-alpha`
  AGENTS.md temp path prefixes instead of WindieOS-flavored sample directories.
  File-to-parent resolution, git-root-to-workspace prompt layer ordering,
  prompt layer content shape, IPC channels, storage, permissions, hosted backend
  URLs, provider policy, and local-runtime behavior are unchanged; no migration
  is required.
- MCP runtime fixture samples now use neutral configured client info instead of
  WindieOS-flavored arbitrary client identity. MCP initialize payload
  forwarding, manifest discovery, tool registration, IPC channels, storage,
  permissions, hosted backend URLs, provider policy, and local-runtime behavior
  are unchanged; no migration is required.
- Backend web-search tool fixture samples now use neutral `project alpha`
  query text instead of WindieOS-flavored sample data. Brave request parameter
  construction, Brave result normalization, missing config and disabled policy
  failures, native OpenAI/Gemini routing, native source query propagation,
  output formatting, credentials, permissions, hosted backend URLs, provider
  policy, and local-runtime behavior are unchanged; no migration is required.
- Main IPC fixture samples now use neutral `project-alpha` temp path prefixes
  instead of WindieOS-flavored query AGENTS.md and persistence sample
  directories. Local AGENTS.md query layer attachment, serialized desktop UI
  config writes, serialized install-auth writes, IPC channels, storage,
  permissions, hosted backend URLs, provider policy, and local-runtime behavior
  are unchanged; no migration is required.
- Backend container config updater fixture samples now use neutral
  `project-alpha` temp TTS paths instead of WindieOS-flavored sample paths. DI
  config rebinding, LLM client reinitialization, tool orchestrator
  registry/context config resolution, model service config updates, credentials,
  permissions, hosted backend URLs, provider policy, and local-runtime behavior
  are unchanged; no migration is required.
- Create-extension scaffold tests now use neutral contribution-root fixture
  paths (`agent-contribution-scaffold-*` and `/tmp/agent-contributions`)
  instead of Windie-flavored sample paths. The Windie CLI command name,
  generated directory layout, `plugin.json` schema fields, Python entrypoints,
  skill front matter, manifest loading, permissions, credentials, IPC channels,
  local-runtime execution, hosted backend URLs, and provider policy are
  unchanged; no migration is required.
- Main-window runtime tests now use neutral `/tmp/agent-icon.png` samples for
  injected dashboard/tray icon resolver fixtures instead of
  WindieOS-flavored icon path samples. Host-skin app icon filename coverage,
  native-image fallback behavior, BrowserWindow/Tray options, permissions, IPC
  channels, storage, hosted backend URLs, provider policy, and local-runtime
  behavior are unchanged; no migration is required.
- Wakeword hook tests now use neutral `blob:agent-audio-worklet` sample URLs
  instead of WindieOS-flavored audio worklet blob fixtures. Renderer wakeword
  capture cleanup, AudioWorklet setup, IPC channels, permissions, storage,
  hosted backend URLs, provider policy, and local-runtime behavior are
  unchanged; no migration is required.
- Browser Use engine tests now use neutral `legacy-agent-session` samples for
  the legacy `WINDIE_BROWSER_USE_SESSION` env alias instead of a WindieOS-shaped
  session value. Legacy env alias compatibility, generic `AGENT_BROWSER_USE_*`
  precedence, Browser Use CLI invocation, dedicated browser CDP behavior,
  permissions, storage, hosted backend URLs, provider policy, and local-runtime
  behavior are unchanged; no migration is required.
- Public Python SDK package docs and package-boundary tests now use neutral
  `https://backend.example.com` endpoint samples instead of the WindieOS hosted
  URL. The `windie-sdk` distribution name, `windie` import package, explicit
  backend URL contract, install auth behavior, websocket routing, local-runtime
  startup, hosted backend URLs in product-owned docs/config, provider policy,
  and permissions are unchanged; no migration is required.
- Extension scaffold `--dir` help and authoring docs now use generic
  contribution-root wording instead of "WindieOS repo/contribution root". The
  `<windie>` command, scaffold arguments, generated `plugins/` and `skills/`
  layout, local-runtime plugin manifests, prompt skills, MCP discovery,
  permissions, storage, hosted backend URLs, provider policy, and local-runtime
  execution are unchanged; no migration is required.
- Image interaction handler tests now use neutral candidate backend endpoint
  fixtures for trusted-origin construction instead of WindieOS-shaped candidate
  hostnames. The active WindieOS hosted-default origin assertions, endpoint
  candidate selection behavior, clipboard image handler registration, context
  menu handler registration, artifact trust policy, install auth, permissions,
  storage, provider policy, and local-runtime behavior are unchanged; no
  migration is required.
- Artifact handler runtime, install-auth validation, and renderer runtime
  endpoint store tests now use neutral `.example.test` endpoint hosts instead
  of WindieOS-shaped arbitrary test domains. Real WindieOS hosted defaults,
  artifact upload/fetch URL construction, install-auth identity validation,
  runtime artifact URL construction, transcription websocket URL derivation,
  permissions, storage, provider policy, and local-runtime behavior are
  unchanged; no migration is required.
- Python SDK client transport tests now use neutral
  `https://backend.example.com` and `wss://backend.example.com/ws` endpoint
  fixtures instead of the WindieOS hosted URL. Caller-supplied backend URL
  semantics, HTTP route construction, artifact upload route construction,
  websocket URL derivation, local-runtime registration, tool-call/tool-bundle
  result routing, install auth behavior, hosted backend defaults in
  product-owned config/docs, provider policy, permissions, and storage are
  unchanged; no migration is required.
- Sidecar remote API and semantic client tests now use neutral
  `https://backend.example.com` endpoint fixtures instead of the WindieOS hosted
  URL while preserving `AGENT_BACKEND_HTTP_URL` and legacy
  `WINDIE_BACKEND_HTTP_URL` alias coverage. Remote HTTP route construction,
  semantic summarize route construction, explicit endpoint requirement
  behavior, no-local-fallback error behavior, hosted backend defaults in
  product-owned config/docs, provider policy, permissions, storage, and
  local-runtime behavior are unchanged; no migration is required.
- Artifact fetch, artifact handler, clipboard image, image context-menu, and
  image interaction IPC helper tests now use neutral `https://backend.example.com`
  endpoint fixtures instead of WindieOS hosted URL samples. Product-hosted
  endpoint defaults remain covered in host-skin and endpoint resolver tests.
  Artifact URL construction, trusted-origin checks, redirect rejection,
  clipboard copy behavior, native context-menu copy behavior, handler
  registration, install auth header forwarding, permissions, storage, provider
  policy, and local-runtime behavior are unchanged; no migration is required.
- Local-runtime launch option and RPC bridge tests now use neutral
  `https://backend.example.com` endpoint fixtures instead of WindieOS hosted URL
  samples. The WindieOS hosted defaults remain product-owned in the host skin
  and endpoint resolver coverage. Daemon launch env propagation, host env alias
  compatibility, artifact upload URL construction, screenshot temp-path
  ownership, SDK local-runtime routing, permissions, storage, provider policy,
  and hosted backend behavior are unchanged; no migration is required.
- Main IPC lifecycle tests now use neutral explicit endpoint override hosts
  (`backend.example.com` and `hosted.backend.example`) instead of Windie-shaped
  `windie.example.com` fixtures. Real WindieOS hosted defaults remain covered in
  the customer-mode and packaged-default assertions. WebSocket URL derivation,
  origin normalization, renderer endpoint snapshots, VM worker backend state,
  hosted default env-key behavior, permissions, storage, provider policy, and
  local-runtime behavior are unchanged; no migration is required.
- The API reference SDK TypeScript and Python client examples now use neutral
  `https://backend.example.com` constructor samples instead of the WindieOS
  hosted URL. Product-owned prose still documents the real hosted default
  topology. SDK explicit endpoint configuration, hosted route behavior,
  artifacts, OCR/vision routes, install auth, provider policy, permissions,
  storage, and local-runtime behavior are unchanged; no migration is required.
- Getting-started installation, troubleshooting, platform setup, and
  communication-flow docs now describe local backend origins as explicit
  endpoint overrides rather than automatic hosted-to-local fallbacks or
  "hosted-first" candidate lists. Endpoint setup docs already carried the
  current contract, and modular boundary coverage now keeps those docs aligned.
  Endpoint resolution, hosted defaults, explicit local and self-host overrides,
  SDK websocket routing, provider policy, permissions, storage, and
  local-runtime behavior are unchanged; no migration is required.
- Public SDK examples now use neutral `agent-*` sample service names, temporary
  store directories, and note filenames instead of Windie-flavored arbitrary
  fixture data. The real `@windie/sdk`, `windie-sdk`, and repo package paths
  remain unchanged because they are current package names. Example mock backend
  behavior, file conversation store behavior, plugin/module-tool execution,
  local-runtime daemon discovery, provider policy, permissions, storage, and
  hosted backend behavior are unchanged; no migration is required.
- Agent SDK frontend tests now use neutral `agent-*` temporary fixture roots for
  local-runtime provider, daemon, launcher, resource-resolution, and file-store
  coverage instead of Windie-flavored arbitrary temp prefixes. Real package
  paths under `packages/windie-sdk-*` remain unchanged because they are current
  repo/package identifiers. SDK local-runtime discovery, launch, reuse,
  shutdown, resource upload sanitization, file conversation store persistence,
  provider policy, permissions, storage, and hosted backend behavior are
  unchanged; no migration is required.
- Extension manifest tests now use neutral `agent-*` temporary contribution-root
  fixtures instead of Windie-flavored arbitrary temp directories. The real
  WindieOS host-skin env key remains covered separately from the disposable path
  value. Extension contribution discovery, generic `AGENT_CONTRIBUTIONS_DIR`,
  host-skin override support, plugin/skill/MCP manifest loading, local-runtime
  tool registration, provider policy, permissions, storage, and backend
  behavior are unchanged; no migration is required.
- IPC replay command tests now use neutral Project Alpha workspace path fixtures
  instead of Windie-flavored arbitrary workspace paths. Replay command routing
  still flows through the `windie:invoke` bridge into the Agent SDK conversation
  runtime adapter, and workspace path normalization, edit/resend preparation,
  retry preparation, transcript session guards, provider policy, permissions,
  storage, and backend behavior are unchanged; no migration is required.
- App diagnostics store tests now use a neutral `agent-diagnostics-*` temporary
  diagnostics DB root instead of a Windie-flavored arbitrary temp directory.
  The real host-skin diagnostics env key remains unchanged and covered.
  Diagnostic path definitions, sanitization, SQLite persistence, host-skin
  diagnostics DB configuration, provider policy, permissions, storage contracts,
  and backend behavior are unchanged; no migration is required.
- App diagnostics store tests now use a neutral sample wakeword model payload
  instead of the WindieOS wakeword model marker for generic diagnostics
  sanitizer persistence coverage. The real host-skin wakeword model and stderr
  marker remain covered at the host boundary. Diagnostic path definitions,
  sanitization, SQLite persistence, host-skin diagnostics configuration,
  wakeword model injection, provider policy, permissions, storage contracts,
  and backend behavior are unchanged; no migration is required.
- Local-runtime screenshot-related tests now use neutral screenshot path
  fixtures for unowned screenshot temp directories and `open_app` screenshot
  verification payloads instead of Windie-flavored arbitrary paths. Intentional
  legacy-prefix rejection coverage remains in the bridge tests. Trusted
  screenshot ownership checks, artifact materialization, unowned-path rejection,
  sidecar `open_app` screenshot payload propagation, provider policy,
  permissions, storage, and backend behavior are unchanged; no migration is
  required.
- Conversation replay database integration tests now use a neutral
  `agent-replay-db-*` temporary SQLite fixture root instead of a Windie-flavored
  arbitrary temp directory. SDK conversation events, local-runtime store RPC
  behavior, replay/rehydrate projections, edit/resend and retry preparation,
  provider policy, permissions, storage schema, and backend behavior are
  unchanged; no migration is required.
- Local-runtime MCP execution tests now use neutral MCP path/query fixtures for
  non-screenshot result handling instead of Windie-flavored arbitrary data. MCP
  tools still route through SDK/main local-runtime dispatch, non-screenshot
  `screenshot_path` values are still stripped without read/upload/delete,
  provider policy, permissions, storage, and backend behavior are unchanged; no
  migration is required.
- Mock-memory seed tests now use neutral `legacy-*` user-id values for
  WindieOS env-alias compatibility coverage instead of Windie-flavored
  arbitrary users. Generic `AGENT_*` env aliases still take precedence,
  `WINDIE_*` aliases remain supported, mock seed storage/cleanup behavior,
  provider policy, permissions, and backend behavior are unchanged; no migration
  is required.
- Browser Use engine tests now use neutral legacy home/CLI/session values for
  WindieOS env-alias compatibility coverage instead of Windie-flavored
  arbitrary sample values. Generic `AGENT_BROWSER_USE_*` aliases still take
  precedence, `WINDIE_BROWSER_USE_*` aliases remain supported, Browser Use command
  resolution, session handling, provider policy, permissions, storage, and
  backend behavior are unchanged; no migration is required.
- Main logging tests now use neutral `agent-*` disposable temp roots for layer
  log sink and Vite runner log coverage instead of Windie-flavored arbitrary
  temp directories. Host-skin `.windie/logs`, `WINDIE_*` log env keys, and
  WindieOS log prefixes remain covered as product configuration; generic
  layer-log resolution, console mirroring, renderer verbose logs, Vite runner
  log routing, provider policy, permissions, storage, and backend behavior are
  unchanged; no migration is required.
- Local-runtime launch option tests now use neutral user-data and log temp
  fixtures instead of Windie-flavored arbitrary paths. Host-skin
  `WINDIE_USER_DATA_DIR`, local-runtime env-key mapping, sidecar daemon
  entrypoint compatibility, generic launch context construction, log routing,
  provider policy, permissions, storage, and backend behavior are unchanged; no
  migration is required.
- Main helper tests now use neutral user-data and temp-root fixtures in
  chat-pill intent storage, permission IPC runtime setup, and Python env wrapper
  coverage instead of Windie-flavored arbitrary paths. Chat-pill intent
  persistence, permission handler registration, `WINDIE_PYTHON_PATH`
  compatibility, provider policy, permissions, storage, and backend behavior
  are unchanged; no migration is required.
- Committer helper coverage now uses neutral temp repository and Git author
  fixtures instead of Windie-flavored arbitrary test identities. The committer
  body-format guard, scoped staging behavior, provider policy, permissions,
  storage, and backend behavior are unchanged; no migration is required.
- Electron launcher coverage now uses a neutral frontend log override fixture
  while preserving `WINDIE_FRONTEND_LOG_FILE` compatibility-key coverage. The
  launcher env override behavior, default repo-local `.windie/logs` product
  path, provider policy, permissions, storage, and backend behavior are
  unchanged; no migration is required.
- MCP control coverage now uses neutral temporary contribution and diagnostics
  roots instead of Windie-flavored arbitrary temp directories. MCP enablement,
  local-runtime registration, diagnostics payloads, provider policy,
  permissions, storage, and backend behavior are unchanged; no migration is
  required.
- CLI conversation history export coverage now uses neutral temporary home roots
  while preserving product CLI entrypoints, `.windie/logs`, and WindieOS
  user-data path contracts. Conversation export behavior, history schema
  compatibility, provider policy, permissions, storage, and backend behavior are
  unchanged; no migration is required.
- Wakeword service coverage now uses neutral legacy model-directory fixtures
  while preserving `WINDIE_WAKEWORD_MODEL_DIR` alias coverage. Wakeword model
  directory precedence, generic `AGENT_*` env preference, WindieOS alias
  compatibility, provider policy, permissions, storage, and backend behavior are
  unchanged; no migration is required.
- Browser, IPC, and main-process first-read summaries now describe the generic
  desktop Electron/browser runtime boundaries instead of assigning those host
  responsibilities to WindieOS product labels. Runtime code, IPC channel names,
  browser action payloads, SDK local-runtime routing, local-runtime daemon
  behavior, storage, credentials, hosted backend URLs, and provider policy are
  unchanged; no migration is required.
- Browser and local-runtime first-read workflows now describe generic desktop
  browser automation, local-runtime tool execution, local-runtime Python
  implementation, JSON-RPC methods, and local-runtime implementation roots
  without product-owned or sidecar-root labels. Runtime code, IPC channel
  names, JSON-RPC method names, tool schemas, browser action payloads, SDK
  local-runtime routing, local-runtime daemon behavior, storage, credentials,
  hosted backend URLs, and provider policy are unchanged; no migration is
  required.
- Renderer dashboard, settings, model-selection, chat-attachment, and overlay
  first-read workflows now describe generic desktop renderer surfaces and
  desktop overlay UI symptoms instead of product-owned UI workflow labels.
  Runtime code, renderer components, IPC channels, config fields, SDK
  projections, screenshot capture policy, storage, credentials, hosted backend
  URLs, and provider policy are unchanged; no migration is required.
- Websocket event, observability, error/failure, tool schema, tool lifecycle,
  and local tool channel first-read docs now describe shared backend/SDK/runtime
  contracts without product-owned generic pipeline labels. Runtime code,
  websocket event names, formatter schemas, IPC channels, tool schemas, SDK
  projections, tool-result envelopes, storage, credentials, hosted backend URLs,
  and provider policy are unchanged; no migration is required.
- Screenshot/overlay policy, platform routing, validation, computer tool, docs
  hub, and triage docs now describe desktop overlay UI/surface capture behavior
  instead of product-owned overlay surface labels. Runtime code, screenshot
  lease policy, platform adapters, Electron content-protection behavior, IPC
  channels, SDK projections, storage, credentials, hosted backend URLs, and
  provider policy are unchanged; no migration is required.
- Docs hub, repository docs index, and agent routing quick cards now describe
  websocket event routing through Agent SDK projection and typed Electron
  fan-out instead of generic Electron rebroadcast labels. Runtime code,
  websocket event names, formatter schemas, IPC channels, SDK projection
  events, storage, credentials, hosted backend URLs, and provider policy are
  unchanged; no migration is required.
- Minimal chat pill, Linux, Windows, and overlay phase workflow docs now
  describe screenshot hide/restore policy through desktop overlay
  surfaces/policy instead of product-owned overlay labels. Runtime code,
  screenshot lease policy, platform adapters, Electron content-protection
  behavior, IPC channels, SDK projections, storage, credentials, hosted backend
  URLs, and provider policy are unchanged; no migration is required.
- Dashboard and desktop surfaces docs now describe the dashboard as a desktop
  workspace surface and the surfaces hub as the desktop runtime surface map
  instead of product-owned renderer surface labels. Runtime code, renderer
  components, IPC channels, SDK projections, config storage, credentials,
  hosted backend URLs, and provider policy are unchanged; no migration is
  required.
- Agent architecture SDK ownership rules now describe the Electron reference
  host as a desktop UI on top of the SDK instead of a product-owned UI special
  case. Runtime code, SDK APIs, IPC channels, SDK projections, local-runtime
  contracts, storage, credentials, hosted backend URLs, and provider policy are
  unchanged; no migration is required.
- Minimal chat pill tool-surface lease docs now describe Linux screenshot
  capture as hiding visible desktop surfaces instead of product-owned visible
  surfaces. Runtime code, screenshot lease policy, platform adapters, Electron
  content-protection behavior, IPC channels, SDK projections, storage,
  credentials, hosted backend URLs, and provider policy are unchanged; no
  migration is required.
- Logging docs now use a neutral frontend log override path example while
  preserving the `WINDIE_FRONTEND_LOG_FILE` WindieOS override key. Launcher log
  override behavior, default `.windie/logs` source-run paths, provider policy,
  permissions, storage, and backend behavior are unchanged; no migration is
  required.
- IPC wake-up and host-copy runtime tests now use neutral injected agent
  identity fixtures instead of WindieOS product names. The real WindieOS product
  identity remains host-skin owned and covered by `MainHostSkinBoundary`.
  AgentClient wake-up options, MCP client-info propagation, host-copy defaults,
  permissions, provider policy, storage, and backend behavior are unchanged; no
  migration is required.
- Electron AgentClient factory tests now use a neutral injected user-data path
  fixture instead of a WindieOS app-data sample. Product app-data names remain
  host-skin/runtime-path owned. Local-runtime launch option construction,
  managed backend endpoint assembly, AgentClient creation, permissions,
  provider policy, storage, and backend behavior are unchanged; no migration is
  required.
- Wakeword model-directory tests now use a neutral packaged resource path
  fixture instead of a WindieOS install path sample. Product packaged-resource
  paths remain covered in main runtime-path tests. Wakeword model cache
  precedence, known model filename resolution, status messaging, permissions,
  provider policy, storage, and backend behavior are unchanged; no migration is
  required.
- Generic layer log sink tests now use a neutral injected log-prefix fixture
  instead of the WindieOS host-skin prefix. Product log-prefix wiring remains
  host-skin/CLI owned. Layer log file resolution, session banner writing,
  renderer verbose logging, host-skin log configuration, permissions, storage,
  provider policy, and backend behavior are unchanged; no migration is required.
- Generic main-window and main-process bootstrap tests now use neutral injected
  skin, env, and wakeword fixtures instead of WindieOS product skin values. Real
  WindieOS app icon, tray tooltip, log prefix, bundled runtime copy, env keys,
  runs header, wakeword model, and browser warmup copy remain covered by the
  host-skin boundary tests. Window bootstrap delegation, tray icon behavior,
  renderer log-prefix propagation, host-skin configuration, permissions,
  storage, provider policy, and backend behavior are unchanged; no migration is
  required.
- Generic runtime-mode and VM worker runtime tests now use neutral sample env
  maps and runs-header fixtures instead of importing WindieOS host-skin VM
  config. Real WindieOS VM env and hosted runs auth names remain covered by the
  host-skin boundary tests. Runtime-mode flag parsing, worker-mode fallback
  behavior, VM worker heartbeat/claim/event/stop routing, hosted runs auth
  injection, host-skin configuration, permissions, storage, provider policy,
  and backend behavior are unchanged; no migration is required.
- Generic GPU runtime tests now use a neutral sample env map instead of
  importing the WindieOS host-skin GPU env config. Real WindieOS
  software-rendering env ownership remains covered by the host-skin boundary
  tests. GPU env-key normalization, hardware acceleration defaults, Linux
  software-rendering env side effects, host-skin configuration, permissions,
  storage, provider policy, and backend behavior are unchanged; no migration is
  required.
- Generic IPC helper, live-surface trace, overlay responsebox, and SDK
  live-turn surface tests now use neutral sample debug env maps instead of
  importing WindieOS host-skin debug config or product debug env literals. Real
  WindieOS debug env ownership remains covered by the debug env and host-skin
  boundary tests. Debug env-key normalization, scripted provider flag behavior,
  live-surface trace logging, overlay snapshot logging, SDK typing transition
  logging, host-skin configuration, permissions, storage, provider policy, and
  backend behavior are unchanged; no migration is required.
- Generic IPC query runtime tests now use neutral sample interruption copy
  instead of importing WindieOS host-skin query event copy. Real WindieOS query
  copy remains covered by host-skin boundary tests. Query payload normalization,
  interrupted-query event shaping, injected host copy wiring, permissions,
  storage, provider policy, and backend behavior are unchanged; no migration is
  required.
- Generic extension manifest and MCP runtime tests now use neutral sample env
  maps instead of importing WindieOS host-skin env config. Real WindieOS
  contribution-root and MCP enablement env ownership remains covered by
  host-skin boundary tests. Extension contribution-root resolution, MCP
  enablement env resolution, plugin/skill/MCP manifest loading, client tool
  manifest projection, permissions, storage, provider policy, and backend
  behavior are unchanged; no migration is required.
- Generic layer-log sink tests now use neutral sample logging config instead of
  importing WindieOS host-skin logging values. Real WindieOS log env keys,
  aliases, filenames, and directories remain covered by host-skin boundary
  tests. Layer-log env-key resolution, host-provided log directory handling, log
  file resolution, permissions, storage, provider policy, and backend behavior
  are unchanged; no migration is required.
- Generic backend endpoint tests now use neutral sample hosted endpoint defaults
  instead of importing WindieOS host-skin hosted backend values. Real WindieOS
  hosted URLs and default endpoint env names remain covered by host-skin
  boundary tests. Endpoint candidate resolution, explicit endpoint overrides,
  artifact base selection, removed packaged-default env rejection, permissions,
  storage, provider policy, and backend behavior are unchanged; no migration is
  required.
- Generic permission service tests now use neutral sample permission copy
  instead of importing WindieOS host-skin permission copy. Real WindieOS
  permission copy remains covered by host-skin boundary tests. Permission
  manifest listing, probe/request flows, workspace folder selection, stored
  permission state, OS permission prompts, provider policy, storage, and backend
  behavior are unchanged; no migration is required.
- Generic diagnostics store tests now use neutral sample diagnostics data-path
  config instead of importing WindieOS host-skin diagnostics values. Real
  WindieOS diagnostics env names and data directory ownership remain covered by
  host-skin boundary tests. Diagnostics path definitions, source guards,
  data-path env resolution, local-runtime error classification, permissions,
  storage schema, provider policy, and backend behavior are unchanged; no
  migration is required. Full diagnostics persistence validation remains
  blocked in this local environment because the external `sqlite3` executable
  is not installed (`spawnSync sqlite3 ENOENT`).
- Generic runtime-path and wakeword bridge tests now use neutral injected host
  config fixtures instead of importing WindieOS host-skin values. Real WindieOS
  env, wakeword model, packaged-entrypoint, and runtime-path ownership remains
  covered by the host-skin boundary tests. Packaged local-runtime path
  resolution, configured host env forwarding, wakeword subprocess launch
  behavior, host-skin configuration, permissions, storage, provider policy, and
  backend behavior are unchanged; no migration is required.
- Local-runtime bridge RPC tests now use neutral injected browser warmup copy
  instead of WindieOS host-skin copy. Real WindieOS local-runtime copy wiring
  remains covered by the host-skin boundary tests. Browser warmup RPC payload
  shaping, SDK local-runtime routing, host-skin copy wiring, permissions,
  storage, provider policy, and backend behavior are unchanged; no migration is
  required.
- Generic debug-env and wakeword-runtime helper tests now use neutral injected
  host config fixtures instead of WindieOS host-skin values. Real WindieOS
  debug env, wakeword model marker, and bundled-runtime copy ownership remains
  covered by host-skin boundary tests. Debug flag resolution, wakeword startup
  error mapping, stderr marker handling, host-skin wiring, permissions,
  storage, provider policy, and backend behavior are unchanged; no migration is
  required.
- Agent SDK conversation runtime browser trace tests now use the generic
  `dedicated_browser` result scope instead of the retired
  `windie_dedicated_browser` sample. The local-runtime browser adapter already
  emits `dedicated_browser`, and the modular boundary guard now blocks the old
  product-shaped scope from SDK runtime fixtures. Browser tool result tracing,
  sensitive URL/title scrubbing, local-runtime browser adapter behavior,
  provider policy, permissions, storage, and backend behavior are unchanged; no
  migration is required.
- Python SDK package sidecar tests now use Python SDK package wording in their
  generated headers instead of product-branded `windie` SDK/package behavior
  labels. The public `windie` import package and `windie-sdk` distribution name
  remain unchanged and covered by package-boundary tests. Explicit backend URL
  handling, install auth behavior, local-runtime startup, provider policy,
  permissions, and backend behavior are unchanged; no migration is required.
- Renderer docs now route chat attachment readable-file resolution, stream
  local-tool ownership, browser settings, and tool-result output wording
  through SDK/main local-runtime and local-runtime Python boundaries instead of
  sidecar owner labels. Renderer chat projection, attachment-context assembly,
  local-runtime tool execution, browser settings, permissions, storage,
  provider policy, and backend behavior are unchanged; no migration is
  required.
- The shared permission manifest and onboarding slideshow fixtures now use
  generic agent-host permission copy instead of older desktop-runtime wording
  for screen capture, input control, macOS automation, and browser profile
  setup. Permission IDs, OS probes, grant actions, onboarding visibility,
  stored permission state, renderer presentation, provider policy, storage, and
  backend behavior are unchanged; no migration is required.
- SDK conversation/auth docs and the local-runtime browser stack now describe
  reusable host-facing contracts through host UI and Electron agent-host labels
  instead of desktop-runtime labels. SDK conversation projections, continuity
  service behavior, hosted auth, local-runtime browser routing, provider
  policy, permissions, storage, and backend behavior are unchanged; no
  migration is required.
- The SDK runtime command header plus renderer continuity/compaction and
  architecture-flow docs now use UI/host-runtime, renderer app-runtime, and SDK
  desktop transport adapter labels instead of desktop-runtime wording. SDK
  command constants, conversation continuity, replay persistence, compaction
  transport mapping, renderer projection, architecture routing, provider
  policy, permissions, storage, and backend behavior are unchanged; no
  migration is required.
- Architecture, main workflow, runtime audio, provider, IPC helper, and
  inventory docs now use SDK desktop transport adapter/pending-turn/channel-name
  labels instead of desktop-runtime transport ownership wording. SDK command
  constants, renderer runtime clients, `windie:invoke` IPC names,
  pending-turn fan-out, stop-query mapping, provider wiring, storage,
  permissions, provider policy, and backend behavior are unchanged; no
  migration is required.
- The checked-in SDK runtime command CJS artifact now matches the TS source by
  describing SDK-shaped command names as shared by UI and host runtimes, and the
  modular completion guard covers both outputs against the retired
  UI-and-desktop-runtimes phrase. Command names, exports, runtime transport
  behavior, Electron host wiring, renderer clients, backend policy, storage,
  and permissions are unchanged; no migration is required.
- Renderer skin/config comments and frontend architecture skin facade notes now
  describe the active WindieOS skin as the generic chat desktop UI skin/config
  instead of desktop-runtime UI wording, and the renderer app runtime guard
  enforces the new label. Facade filenames, imports, storage keys, persisted
  config, renderer runtime clients, IPC channels, permissions, and backend
  behavior are unchanged; no migration is required.
- Active renderer API/chat boundary test names and the renderer folder
  structure now describe the path as app-runtime clients plus the SDK desktop
  transport adapter instead of desktop runtime facades/clients/adapters, with
  modular completion coverage preventing those plural owner labels in active
  renderer docs/tests. Test assertions, runtime modules, imports, command names,
  IPC channels, storage, permissions, and backend behavior are unchanged; no
  migration is required.
- Active architecture docs, the renderer send-flow source map, and voice
  docs/tests now route renderer ownership through app-runtime clients/facades,
  live-turn/continuity app-runtime, and the voice app-runtime client instead of
  desktop-runtime owner labels; active agent architecture and IPC/transport
  guidance now uses renderer app-runtime facade wording too. Concrete
  `DesktopLiveTurnRuntimeClient` and `DesktopVoiceRuntimeClient` module names,
  runtime modules, imports, command names, IPC channels, voice gateway
  protocol, storage, permissions, provider policy, and backend behavior are
  unchanged; no migration is required.
- Renderer source-map comments, app-runtime client headers, and focused
  settings/memory/voice/client tests now label the settings, memory, and voice
  helpers as app-runtime clients and command transport as the SDK desktop
  transport adapter instead of desktop-runtime owner phrases. Concrete file
  names and exported `Desktop*RuntimeClient` symbols, runtime modules, imports,
  command names, IPC channels, storage keys, provider policy, permissions, and
  backend behavior are unchanged; no migration is required.
- Renderer permission onboarding storage, transcript send/rehydrate docs,
  inventory entries, renderer hub links, and the transport contract title now
  use app-runtime live-turn/continuity and SDK desktop transport wording instead
  of desktop-runtime owner labels. Concrete `desktopRuntimeTransport.ts` and
  `DesktopConversationContinuityService` names, storage keys, runtime modules,
  imports, command names, IPC channels, transcript projection, continuity
  rehydrate behavior, permissions, provider policy, storage, and backend
  behavior are unchanged; no migration is required.
- Active architecture, SDK startup, hosted-client, extension, tool-development,
  handshake, runtime-model, docs hub, VM run-control, renderer transport
  inventory, evidence/security navigation, and install-auth test wording now
  routes reusable owner labels through Electron agent-host, host-UI,
  Electron-host adapter, and host operating-system language instead of generic
  desktop-host or Agent SDK Host ownership labels. Concrete
  `resolveDesktopHostOperatingSystem`, `ipc_desktop_host_os_runtime.cjs`,
  `Desktop Agent`, and `desktop-runtime` compatibility names, IPC channels,
  install registration metadata, agent-definition metadata, OS label values,
  SDK startup behavior, local-runtime launch, permissions, storage paths,
  provider policy, and backend behavior are unchanged; no migration is required.
- The getting-started and architecture overview diagrams now name the combined
  desktop UI/main/SDK layer as `Electron Agent Host + SDK Runtime`, and active
  channel, architecture, inventory, main-process, diagnostics, node, and
  workflow docs now route Electron-main owner labels through Electron
  agent-host wording instead of the older desktop client/SDK host and Agent SDK
  host phrases. The modular boundary guard now requires the current labels
  while rejecting the retired diagram and host wording. Renderer modules,
  Electron main host behavior, SDK runtime contracts, IPC channels,
  permissions, storage, provider policy, and backend behavior are unchanged; no
  migration is required.
- Active tool-schema, ADR, architecture, backend workflow, development,
  frontend inventory, and routing docs now describe local tool schema ownership
  through the client/local-runtime schema boundary and Electron client manifest
  builder instead of the older desktop client/local-runtime owner label. The
  modular boundary guard now expects the current tool-manifest labels and the
  retired phrase is absent from active docs/tests. Concrete
  `client_tool_manifest` payload names, manifest file paths, SDK/main dispatch,
  backend policy/projection ownership, and local-runtime Python implementation
  names are unchanged; no migration is required.
- Cross-cutting channel, architecture, security, review, reference,
  operations, gateway, websocket-contract, and renderer session docs now route
  backend-import, websocket/endpoint, contract-fixture, handshake, and
  session-status wording through Electron client, renderer client-session, and
  local-runtime Python labels instead of older desktop-client owner labels. The
  modular boundary guard now blocks the retired desktop-client import-boundary,
  websocket, contract-test, and session-snapshot phrases. Concrete
  `desktopClientSessionRuntimeClient` names, backend fixture paths, websocket
  payloads, IPC channels, session snapshots, permissions, storage, provider
  policy, and backend behavior are unchanged; no migration is required.
- Backend session/config, prompt-constructor, gateway lifecycle, API,
  deployment, and renderer session-runtime comments now describe
  client-supplied OS/capability metadata, Electron client install/packaging,
  and renderer client-session adapter ownership instead of older
  desktop-client OS/session labels. Boundary coverage now blocks the retired
  desktop-client OS/capability, hosted-client, packaged-client, and renderer
  session comment phrases. Concrete `DesktopClientSessionRuntimeClient` names,
  session config storage, prompt rendering, websocket payloads, install
  registration, IPC channels, permissions, storage, provider policy, and
  backend behavior are unchanged; no migration is required.
- SDK agent-definition docs, mobile planning notes, and backend prompt
  constructor docs now use host-runtime, Electron-hosted mode, and hosted
  Electron runtime labels instead of the remaining desktop-host and hosted
  desktop runtime wording. The modular boundary guard blocks the retired
  phrases. Agent-definition defaults, prompt payloads, SDK builder behavior,
  Electron handoff, hosted API behavior, permissions, storage, provider policy,
  and backend behavior are unchanged; no migration is required.
- Renderer app-runtime helper headers now use renderer app-runtime
  clients/consumers and renderer app-runtime helper wording instead of generic
  renderer runtime clients/consumers. Renderer boundary coverage now scans the
  app-runtime source for the retired comment phrases. Runtime modules, exports,
  imports, IPC channels, SDK command names, renderer projections, permissions,
  storage, provider policy, and backend behavior are unchanged; no migration is
  required.
- The renderer-only new-chat DOM event name is now private to
  `desktopChatEvents.js`; dashboard and chat feature callers continue to use
  the app-runtime dispatch/subscribe helpers. Boundary coverage prevents the
  raw event-name constant from becoming a public app-runtime export again. The
  DOM event name, dashboard dispatch, chat subscription behavior, IPC channels,
  SDK command names, storage, provider policy, permissions, and backend
  behavior are unchanged; no migration is required.
- SDK presentation source-channel string values are now private to
  `desktopPresentationSourceChannels.js`; app-runtime helpers, chat projection
  hooks, and transcript display-row projection use semantic accessors or the
  current-turn predicate instead of raw exported constants. Boundary coverage
  prevents the source-channel constants from becoming public exports again.
  Source-channel values, chat message projection, trace payloads, transcript
  display rows, IPC channels, SDK command names, storage, provider policy,
  permissions, and backend behavior are unchanged; no migration is required.
- The renderer app-runtime `desktopConversationRuntimeContracts.ts` facade now
  re-exports only the SDK owner modules used by renderer app/feature code:
  conversation types, continuity service/listeners, SDK command names,
  model-selection helpers, and tool correlation helpers. Boundary coverage
  prevents the previous full SDK package-root wildcard export from returning.
  Renderer imports from the facade, SDK owner exports, IPC command strings,
  conversation continuity, stream handling, trace/replay correlation,
  settings/model payloads, storage, provider policy, permissions, and backend
  behavior are unchanged; no migration is required.
- Renderer transcript display projection and desktop conversation store
  adapters now import SDK display-row/conversation types, trace projection, and
  command constants from their SDK owner modules instead of the SDK package
  root. Boundary coverage prevents those transcript adapters from returning to
  package-root imports. Display-row projection, conversation store behavior,
  trace timelines, SDK command strings, persisted transcript data, storage,
  provider policy, permissions, and backend behavior are unchanged; no
  migration is required.
- The renderer voice app-runtime client now keeps transcription gateway message
  normalization private to `desktopVoiceRuntimeClient.ts`; public callers use
  `dispatchTranscriptionGatewayMessage(...)` for status, realtime, trace,
  unknown, and binary gateway events. Boundary coverage prevents voice feature
  hooks from reaching for a raw normalizer again. Voice gateway websocket URL
  derivation, setup/start-over messages, realtime text projection, trace event
  projection, wakeword IPC channels, SDK command names, storage, provider
  policy, permissions, and backend behavior are unchanged; no migration is
  required.
- The renderer chatbox layout runtime now keeps compact anchor height and host
  window frame-padding constants private to
  `desktopChatboxLayoutRuntime.js`; minimal-pill callers use
  `resolveChatboxVisualAnchorHeight(...)` and
  `resolveChatboxNativeFrameHeight(...)` instead of importing raw layout
  constants or recomputing frame height. Boundary coverage prevents those raw
  constants from becoming public exports again. Chatbox anchor values, native
  frame sizing, resize/collapse behavior, drag behavior, IPC payloads, storage,
  provider policy, permissions, and backend behavior are unchanged; no
  migration is required.
- The renderer debug tool-ghost timing runtime now keeps the raw click-sync
  duration private to `desktopToolGhostRuntime.ts`; `ToolGhostDebugApp` uses
  `getToolGhostClickSyncDelayMs()` for both CSS motion duration and hide-loop
  timing. Active tool-ghost docs now describe the helper as the public timing
  contract. Debug ghost animation duration, loop-hide timing, CSS
  motion-duration value, tool ghost rendering, IPC payloads, storage, provider
  policy, permissions, and backend behavior are unchanged; no migration is
  required.
- The renderer response-overlay layout runtime now keeps JSON-derived fixed
  heights and layout-mode tables private to
  `desktopResponseOverlayLayoutRuntime.js`; minimal-pill overlay callers and
  the response-overlay view contract use semantic height, hidden/visible,
  awaiting, compact-hover, and native-mode helpers. Boundary coverage prevents
  raw `RESPONSE_OVERLAY_LAYOUT*` exports/imports from returning. Layout-mode
  strings, fixed response/awaiting heights, compact-hover behavior,
  responsebox sizing IPC, overlay visibility, storage, provider policy,
  permissions, and backend behavior are unchanged; no migration is required.
- The renderer chat-stream thinking runtime now keeps generic thinking and
  compaction lifecycle labels private to
  `desktopChatStreamThinkingRuntime.ts`; stream hooks, manual compaction, and
  SDK live-turn side effects use semantic label helpers, failed-status
  fallback resolution, and the generic-status predicate. Boundary coverage
  prevents the raw thinking/compaction status constants from becoming public
  exports again. Thinking placeholder text, compaction lifecycle labels,
  failed-error fallback behavior, stream projection side effects, transcript
  rows, IPC channels, storage, provider policy, permissions, and backend
  behavior are unchanged; no migration is required.
- The renderer message-content runtime now keeps the raw render-kind table
  private to `desktopMessageContentRuntime.js`; `MessageContent` uses semantic
  content-presentation predicates for React routing while the runtime preserves
  the same `renderKind` string values. Boundary coverage prevents
  `MESSAGE_CONTENT_RENDER_KIND` from returning as a public export or component
  dependency. Message content routing, assistant thinking/markdown rendering,
  screenshot user rows, tool row rendering, transcript rows, IPC channels,
  storage, provider policy, permissions, and backend behavior are unchanged; no
  migration is required.
- The renderer current-turn presentation runtime now keeps the default
  visible-assistant reply type set private to
  `desktopCurrentTurnPresentationRuntime.js`; dashboard chat uses the runtime
  default instead of importing `VISIBLE_ASSISTANT_REPLY_TYPE_SET` and passing it
  through `useChatSurfaceController`. The lower-level runtime override remains
  available for focused tests or specialized callers. Visible assistant reply
  filtering still allows `llm-text` and `error`, and awaiting-dot behavior,
  response-pane selection, chatbox surface state, transcript rows, IPC
  channels, storage, provider policy, permissions, and backend behavior are
  unchanged; no migration is required.
- The renderer overlay turn lifecycle runtime now keeps the raw
  `OVERLAY_TURN_LIFECYCLE` table private to
  `desktopOverlayTurnLifecycleRuntime.js`; chat-loop state, current-turn
  presentation, response-overlay stale-response suppression, SDK-derived
  minimal-pill lifecycle mapping, and focused fixtures use semantic lifecycle
  value helpers or predicates instead. Boundary coverage prevents the raw table
  from returning as a public app-runtime export or production dependency.
  Lifecycle string values, chat-loop state, awaiting-dot behavior,
  stale-response suppression, IPC channels, storage, provider policy,
  permissions, and backend behavior are unchanged; no migration is required.
- The renderer response-overlay phase runtime now keeps the raw
  `RESPONSE_OVERLAY_PHASE` map and preflight guard ref private to
  `desktopResponseOverlayPhaseRuntime.js`; stream phase reduction, live-turn
  surface projection, contract tests, and renderer/main parity checks use
  semantic phase helpers, behavior predicates, the preflight guard accessor, or
  explicit parity snapshots instead. Boundary coverage prevents the raw phase
  constants from returning as public app-runtime exports or renderer production
  dependencies. Phase string values, preflight guard identity,
  awaiting/streaming display booleans, IPC channel names, storage, provider
  policy, permissions, and backend behavior are unchanged; no migration is
  required.
- The renderer extension and MCP runtime clients now keep empty extension
  runtime, local-tool manifest, remote-tool catalog, and MCP registry snapshots
  private to `desktopExtensionRuntimeClient.ts` and
  `desktopMcpRuntimeClient.ts`; dashboard settings and MCP sections initialize
  and reset state through semantic empty-state client helpers instead of raw
  exported constants. Boundary coverage prevents the raw empty snapshots from
  returning as public app-runtime exports or feature imports. Empty snapshot
  shapes, extension/MCP list normalization, settings fallback behavior, IPC
  channels, persisted config, provider policy, permissions, and backend
  behavior are unchanged; no migration is required.
- The renderer chat workspace-state owner now keeps the raw default workspace
  key private to `chatWorkspaceState.ts`; `chatStore.ts` initializes workspace
  records through `createInitialWorkspaceRecord()` instead of importing
  `DEFAULT_CHAT_WORKSPACE_REF`. Boundary coverage prevents the raw sentinel
  from returning as a store dependency. The default workspace key string,
  workspace record shape, active-workspace projection, stream state, persisted
  transcript data, IPC channels, provider policy, permissions, and backend
  behavior are unchanged; no migration is required.
- The renderer live-turn runtime client now owns a neutral SDK command failure
  fallback inside `desktopLiveTurnRuntimeClient.ts` instead of importing the
  WindieOS skin for `runtime.sendCommandFailure`; the unused skin field was
  removed and boundary coverage prevents app-runtime modules from importing
  renderer skin copy. SDK command names, send/stop payloads, IPC channels,
  transcript state, storage, provider policy, permissions, and backend behavior
  are unchanged; no migration is required.
- The Windie CLI primary help and command docs now list only canonical
  `local-runtime` log/test/build commands while retaining the existing
  `sidecar`/`sidecar-runtime` aliases as compatibility routes. CLI usage errors
  now point new callers at the canonical commands, and docs mention the aliases
  only in compatibility notes. Existing alias invocations keep routing to the
  same local-runtime log, test, and build behavior; no migration is required.
- Development setup, testing, validation, triage, contribution, review, and
  local-runtime workflow docs now use local-runtime Python as the active owner
  label for setup and validation. Concrete `tests/sidecar` paths and
  compatibility file names remain where they are real filesystem or command
  identifiers. Command behavior, conda env names, test paths, IPC paths,
  storage, provider policy, permissions, and backend behavior are unchanged; no
  migration is required.
- Development architecture and MCP docs now describe frontend/local-runtime
  Python import boundaries and CUA driver lookup with local-runtime owner
  labels instead of sidecar-as-owner wording. Concrete `tests/sidecar` and
  `frontend/src/main/sidecar/...` paths remain unchanged where they are real
  repository identifiers. Import boundaries, MCP discovery, driver resolution,
  storage, provider policy, permissions, and backend behavior are unchanged; no
  migration is required.
- Backend-service and release-packaging workflow docs now route backend import
  and source-inspection boundaries through frontend/client plus local-runtime
  Python implementation labels instead of "Frontend and sidecar" owner wording.
  Backend route contracts, packaged endpoint/auth/default flow, packaging
  behavior, IPC/env boundaries, storage, provider policy, permissions, and
  backend behavior are unchanged; no migration is required.
- Electron main diagnostics now classify both `local runtime` and
  `local-runtime` failure messages as `local_runtime_unavailable` through the
  generic diagnostics store default marker list. This keeps local-runtime error
  classification independent of WindieOS legacy skin markers. Existing
  diagnostic rows, IPC, storage schema, provider policy, permissions, backend
  behavior, and product skin config are unchanged; no migration is required.
  Validation used the focused diagnostics source guard and main host-skin
  boundary test; the full diagnostics persistence suite still requires a local
  `sqlite3` CLI.
- Browser troubleshooting and dedicated browser runtime docs now describe
  Playwright version ownership and browser dependency installation as
  local-runtime Python/local-runtime behavior instead of sidecar-owned behavior.
  Concrete `tests/sidecar` and `frontend/src/main/sidecar/...` paths remain
  unchanged where they are repository identifiers. Browser feature-pack
  installation, Playwright/CDP behavior, IPC, storage, provider policy,
  permissions, and backend behavior are unchanged; no migration is required.
- The local-runtime Python daemon reference now uses daemon/local-runtime
  wording for discovery, feature flags, auth-token handling, and dynamic module
  registration instead of sidecar-as-owner prose. Concrete identifiers such as
  the doc title/path and `sidecar_daemon.py` remain unchanged. Daemon discovery
  shape, token behavior, feature flags, tool registration, IPC, storage,
  provider policy, permissions, and backend behavior are unchanged; no migration
  is required.
- The architecture change-ownership decision tree now routes local machine
  authority through local-runtime Python/Electron main ownership instead of
  sidecar/Electron main wording. The linked local-runtime implementation docs
  and concrete repository identifiers remain unchanged. Local authority
  behavior, IPC, storage, provider policy, permissions, and backend behavior are
  unchanged; no migration is required.
- Python local-runtime MCP diagnostic events now persist `runtime =
  "local_runtime"` instead of `runtime = "sidecar"` for execution and
  registration rows. A named daemon constant owns the value and focused sidecar
  tests assert the persisted runtime label. Existing diagnostic rows retain
  their historical value; no schema migration is required. MCP payloads, IPC,
  provider policy, permissions, and backend behavior are unchanged.
- Active runtime trace, browser validation/extraction, browser error,
  install-decision, and error-failure workflow docs now use local-runtime
  browser/local-runtime Python/log wording instead of sidecar owner labels.
  Concrete repository paths and historical daemon doc identifiers remain
  unchanged. Browser behavior, wakeword launch behavior, trace payloads, logging
  destinations, IPC, storage, provider policy, permissions, and backend behavior
  are unchanged; no migration is required.
- Python SDK package/client tests now name local tool-call and tool-bundle
  routing as local-runtime routing instead of sidecar routing, and the missing
  discovery fixture now uses `missing-local-runtime.json`. The package-boundary
  guard rejects the retired `_to_sidecar` and `missing-sidecar.json` labels.
  Python SDK routing behavior, local-runtime execution payloads, discovery
  behavior, IPC, storage, provider policy, permissions, and backend behavior are
  unchanged; no migration is required.
- Local-runtime browser schema tests now use local-runtime browser function
  names instead of `test_sidecar_*` labels. The shared schema assertions and
  backend-import boundary checks are unchanged, so browser schema generation,
  validation behavior, IPC, storage, provider policy, permissions, and backend
  behavior are unchanged; no migration is required.
- Namespace-package marker tests for `frontend/src/main/python` now use
  local-runtime Python package labels instead of sidecar package/module labels.
  Marker-removal, concrete-module importability, and wildcard-export guards are
  unchanged, so package paths, public exports, local-runtime behavior, IPC,
  storage, provider policy, permissions, and backend behavior are unchanged; no
  migration is required.
- Local backend JSON-RPC change workflow guidance now names renderer-visible
  and main-only helper behavior as local-runtime JSON-RPC, local-runtime Python
  module, and local-runtime capability behavior instead of sidecar
  JSON-RPC/module/capability/params shortcuts. Concrete
  `frontend/src/main/sidecar` and `sidecar_daemon.py` path references remain as
  implementation identifiers. JSON-RPC method names, params, handlers,
  SDK/main command contracts, IPC, storage, provider policy, permissions,
  backend behavior, and trust boundaries are unchanged; no migration is
  required.
- Local-runtime daemon lifecycle tests now use `test_local_runtime_daemon_*`
  function labels instead of `test_sidecar_daemon_*` owner labels. The concrete
  `sidecar_daemon.py` module name and all imports, assertions, fixtures,
  endpoint behavior, discovery files, JSON-RPC methods, dynamic tool/MCP
  handling, diagnostics, IPC, storage, provider policy, permissions, backend
  behavior, and trust boundaries are unchanged; no migration is required.
- The local-runtime status broadcaster now imports conversation metadata
  invalidation projection from the SDK conversation-continuity owner module
  instead of the SDK package root. Focused frontend coverage prevents the root
  import from returning. Local-runtime status payloads, IPC channels,
  conversation metadata invalidation projection, SDK exports, storage, provider
  policy, permissions, backend behavior, and trust boundaries are unchanged; no
  migration is required.
- Main-process SDK command-handler and query-broadcast helpers now import SDK
  command names and conversation-event projection from their SDK owner modules
  instead of the SDK package root. Focused main SDK boundary coverage prevents
  root imports from returning in those helpers. SDK command strings,
  query-send failure event projection, IPC channels, renderer payloads, storage,
  provider policy, permissions, backend behavior, and trust boundaries are
  unchanged; no migration is required.
- Central Electron main IPC composition now imports `AgentClient`,
  agent-definition helpers, `TraceRecorder`, and `createConversationEvent` from
  their SDK owner modules instead of the SDK package root. Focused main SDK
  boundary coverage prevents the root import from returning in `ipc.cjs`.
  Agent client creation, agent-definition building/default checks, trace
  recording, conversation-event projection, IPC wiring, renderer payloads,
  storage, provider policy, permissions, backend behavior, and trust boundaries
  are unchanged; no migration is required.
- IPC replay and conversation-runtime registry tests now mock `AgentClient`
  through the SDK owner module, and the modular boundary assertion now expects
  owner-module imports in `ipc.cjs`. Test behavior remains aligned with the
  central main IPC import split. AgentClient behavior, replay commands,
  conversation runtime registry behavior, IPC wiring, renderer payloads,
  storage, provider policy, permissions, backend behavior, and trust boundaries
  are unchanged; no migration is required.
- Renderer SDK display-row projection and renderer annotation merge now route
  through `DesktopConversationDisplayProjection` instead of standalone helper
  exports. Chat projection streaming, dashboard conversation resume, focused
  display projection tests, and renderer boundary tests consume the facade
  object while the runtime keeps optimistic renderer rows and annotation merge
  rules private. Display rows, chat message shape, dashboard loading, IPC,
  storage, local-runtime execution, provider policy, backend behavior, and
  trust boundaries are unchanged; no migration is required.
- Renderer conversation identity rules now route through
  `DesktopConversationSessionRuntime` instead of standalone helper exports.
  Active-session reset, new-chat creation, chat send preparation, replay,
  dashboard conversation selection, session bootstrap, transcript/user binding,
  and current session-info projection consume the facade object while the
  runtime keeps conversation-ref creation, transcript/chat projection, main
  snapshot hydration, and send-time conversation resolution private. Conversation
  refs, transcript session state, chat workspace selection, dashboard open
  behavior, IPC payloads, storage, local-runtime execution, provider policy,
  backend behavior, and trust boundaries are unchanged; no migration is
  required.
- Renderer SDK-command invocation now routes through
  `AgentSdkCommandInvokeClient` instead of a standalone async helper export.
  Live-turn, desktop transport, memory, conversation library/continuity, and
  transcript conversation-store callers consume the facade object while the
  command helper keeps `window.agentSdk` bridge lookup, `windie:invoke` fallback
  dispatch, result validation, and fallback error text private. SDK command
  names, IPC channel strings, command payloads, command result shapes, storage,
  local-runtime execution, provider policy, backend behavior, and trust
  boundaries are unchanged; no migration is required.
- Renderer SDK desktop runtime transport construction now routes through
  `DesktopRuntimeTransport` instead of a standalone factory export. Conversation
  continuity, settings, voice, and focused transport tests consume the facade
  object while the runtime keeps SDK command transport creation private. SDK
  command names, snake_case query payloads, removed camelCase alias rejection,
  IPC channel usage, storage, local-runtime execution, provider policy, backend
  behavior, and trust boundaries are unchanged; no migration is required.
- Renderer dashboard conversation grouping now routes through
  `DesktopDashboardConversationGroupRuntime` instead of a named helper export
  set. Dashboard conversation hooks, the search modal, and focused grouping
  tests consume the facade object while the runtime keeps time buckets,
  workspace grouping, pinned ordering, and matched-role snippet prefix rules
  private. Dashboard grouping output, search snippets, renderer markup, storage,
  local-runtime execution, provider policy, backend behavior, and trust
  boundaries are unchanged; no migration is required.
- Renderer dashboard sidebar navigation now routes through
  `DesktopDashboardNavigationRuntime` instead of a named helper export set.
  Sidebar navigation and focused runtime tests consume the facade object while
  the runtime keeps primary/panel descriptors, collapsed filtering, ordered item
  ids, and fallback label resolution private. Dashboard nav output, renderer
  markup, storage, local-runtime execution, provider policy, backend behavior,
  and trust boundaries are unchanged; no migration is required.
- Renderer settings tab descriptors now route through
  `DesktopSettingsTabRuntime` instead of a named helper export set.
  SettingsSection and focused runtime tests consume the facade object while the
  runtime keeps tab descriptors, ordered tab ids, and fallback label resolution
  private. Settings tab output, renderer markup, storage, local-runtime
  execution, provider policy, backend behavior, and trust boundaries are
  unchanged; no migration is required.
- Renderer trace payload builders and trace logging now route through
  `DesktopRendererTraceRuntime` instead of standalone helper exports. Chat
  send preparation, ChatProvider, current-turn projection, minimal chat pill,
  response overlay, response overlay view model, response overlay window sync,
  and focused trace tests consume the facade object while the runtime keeps
  debug gating, workspace enrichment, payload field shaping, and live-surface
  forwarding private. Trace event names, payload fields, renderer markup, IPC
  forwarding, storage, local-runtime execution, provider policy, backend
  behavior, and trust boundaries are unchanged; no migration is required.
- The renderer transcript-session singleton is now exported as
  `DesktopTranscriptSessionRuntime` instead of `desktopTranscriptSessionRuntime`.
  `DesktopTranscriptSessionRuntimeClient` remains the feature-facing facade
  while the singleton keeps session-state bootstrap, persistence, browser/main
  sync, and session resolution behind an app-runtime owner name. Transcript
  session state, IPC sync, storage, local-runtime execution, provider policy,
  backend behavior, and trust boundaries are unchanged; no migration is
  required.
- Main query event construction now routes through `createQueryEventsRuntime`
  instead of standalone helper exports. `ipc.cjs`, query-send failure handling,
  Agent SDK command conversation-ref resolution, and backend-close interruption
  synthesis consume the facade object while the module keeps conversation-ref
  extraction, send-failure event construction, interruption event construction,
  and dynamic host-copy fallback private. Query payloads, SDK conversation-event
  envelopes, IPC channels, renderer projection, storage, local-runtime
  execution, provider policy, permissions, backend behavior, and trust
  boundaries are unchanged; no migration is required.
- Main replay conversation-event projection now routes through
  `createConversationEventProjectionRuntime` instead of a standalone backend
  event builder export. Renderer-window replay consumes the facade object while
  the module keeps backend-event envelope validation, SDK backend normalizer
  delegation, and dynamic fallback conversation/revision/turn refs private.
  Replay event shapes, SDK conversation-event envelopes, IPC channels, renderer
  projection, storage, local-runtime execution, provider policy, permissions,
  backend behavior, and trust boundaries are unchanged; no migration is
  required.
- Main overlay phase backend-event mapping now routes through
  `createOverlayPhaseEventRuntime` instead of a standalone transition resolver
  export. `ipc_runtime_helpers.cjs` consumes the facade object while the module
  keeps transition mapping, correlation-id precedence, terminal fallback
  handling, and recovery metadata extraction private. Backend event shapes,
  overlay phase payloads, renderer fan-out, IPC channels, storage,
  local-runtime execution, provider policy, permissions, backend behavior, and
  trust boundaries are unchanged; no migration is required.
