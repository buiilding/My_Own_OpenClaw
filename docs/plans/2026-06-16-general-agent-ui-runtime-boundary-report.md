---
summary: "Realtime execution report for the general agent UI runtime boundary convergence work."
title: "General Agent UI Runtime Boundary Report"
---

# General Agent UI Runtime Boundary Report

Plan: [General Agent UI Runtime Boundary Execution Plan](2026-06-16-general-agent-ui-runtime-boundary-execution-plan.md)
User plan: [`plans/2026-06-16-general-agent-ui-runtime-boundary-plan.md`](../../plans/2026-06-16-general-agent-ui-runtime-boundary-plan.md)

## Current Status

- Status: in progress
- Latest inspected plan checkpoint: `11d0fe9e6` (`docs(channels): align local tool runtime routing`)
- Current behavior: renderer product copy is skin-owned, Electron main product
  copy is host-skin-owned, voice capture internals use generic naming, and SDK
  default agent display names are generic unless a host supplies product
  identity. SDK helper symbols that are not part of the public package boundary
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
  unchanged. Preload SDK-command validation failures use generic Agent SDK
  wording while the `window.windie` bridge contract remains stable. Python SDK
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
  local-runtime sidecar executor ownership.

## Inspection Log

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
- Finding: `main/index.cjs` still embedded WindieOS browser automation and macOS automation permission fallback copy inside the Electron composition root.
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
- Finding: wakeword and SDK sidecar launch helpers still embedded WindieOS reinstall guidance for missing packaged Python/runtime assets.
- Decision: keep launch helpers generic and inject WindieOS packaged-runtime copy from `mainHostSkin` through main composition paths.
- Change: bundled Python and wakeword executable reinstall guidance now lives in `mainHostSkin.bundledRuntime`.
- Change: wakeword startup/process-error helpers and SDK sidecar launch options use generic app fallbacks unless host copy is provided.
- Change: main window wakeword wiring and SDK sidecar launch planning pass the WindieOS bundled-runtime copy on app paths.
- Validation: focused wakeword, sidecar launch, main-window runtime, and host-skin boundary tests pass.

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
- Change: renderer chat runtime boundary tests now assert the old no-op hook remains deleted and that current-turn projection side effects still own tool rows.

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
  and kept the exported `formatProviderLabel(...)` helper as the generic UI
  facade.
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

## Remaining Findings

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
