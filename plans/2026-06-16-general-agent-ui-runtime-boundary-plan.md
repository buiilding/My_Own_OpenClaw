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

### 2026-06-17 SDK local-runtime HTTP client alias

- Finding: the SDK local-runtime HTTP client was still exposed and constructed
  primarily as `SidecarDaemonHttpClient`, making the public local-runtime
  contract read like a sidecar implementation detail.
- Change: promoted `AgentLocalRuntimeHttpClient` and
  `AgentLocalRuntimeHttpClientOptions` as the canonical HTTP client surface,
  kept `SidecarDaemonHttpClient` and `SidecarDaemonClientOptions` as
  compatibility aliases, switched `AgentClient` and focused tests to the generic
  name, updated SDK docs, and regenerated checked-in SDK CJS output.
- Validation: SDK build, focused package-boundary/client tests, docs listing,
  alias/export scan, and diff check.
- Compatibility: no migration required. Existing `SidecarDaemonHttpClient`
  imports construct the same HTTP client through the compatibility alias.

### 2026-06-17 SDK local-runtime conversation store alias

- Finding: the SDK's durable local-runtime conversation store was still exposed
  and instantiated primarily as `SidecarConversationStore`, making the reusable
  store contract read like a sidecar implementation detail.
- Change: promoted `LocalRuntimeConversationStore` as the canonical class and
  option/write-hook type surface, kept `SidecarConversationStore` as a
  compatibility value/type alias, switched the default `AgentClient` store and
  focused tests to the generic name, and regenerated checked-in SDK CJS output.
- Validation: SDK build, focused package-boundary/store/client tests, docs
  listing, alias/export scan, and diff check.
- Compatibility: no migration required. Existing `SidecarConversationStore`
  imports construct the same store through the compatibility alias; new reusable
  SDK code can import `LocalRuntimeConversationStore`.

### 2026-06-17 SDK conversation store local-runtime app diagnostics

- Finding: SDK conversation metadata listing emitted SDK-owned app diagnostic
  stages as `sidecar_rpc` even though the store calls the SDK local-runtime RPC
  contract and only forwards sidecar-origin diagnostics separately.
- Change: routed the SDK-origin start/success/failure diagnostics through the
  `local_runtime_rpc` stage while preserving forwarded sidecar diagnostic
  stages and runtime markers.
- Validation: focused SDK conversation-store API test, diagnostic-stage scan,
  docs listing, and diff check.
- Compatibility: this changes newly emitted SDK app diagnostic stage values for
  conversation metadata list RPC attempts. Existing stored diagnostics keep
  their old stage strings; no migration is required.

### 2026-06-17 SDK local-runtime RPC trace path

- Finding: SDK conversation runtime RPC wrappers still emitted durable trace
  rows under the sidecar-specific `sidecar.rpc` path.
- Change: routed conversation-runtime local RPC traces through the
  `local_runtime.rpc` path, updated the focused conversation-runtime assertion,
  and revised runtime trace docs.
- Validation: focused SDK conversation-runtime test, trace-path scan, docs
  listing, and diff check.
- Compatibility: persisted trace rows from earlier builds keep the old path;
  new SDK local RPC trace rows use `local_runtime.rpc`. No storage migration is
  required because trace paths are append-only diagnostics.

### 2026-06-17 SDK memory local-runtime diagnostic stages

- Finding: SDK memory retrieval and completed-turn memory diagnostics still
  emitted `sidecar_*_failed` stages/messages from the context-enrichment
  boundary, even after trace paths moved to local-runtime naming.
- Change: renamed new memory search and store failure diagnostics to
  `local_runtime_search_failed` and `local_runtime_store_failed`, and updated
  focused context-enrichment tests and wording.
- Validation: focused SDK context-enrichment test, sidecar-stage scan, docs
  listing, and diff check.
- Compatibility: this changes newly emitted SDK diagnostic callback stage values
  for local-runtime memory failures. No storage migration is required because
  these diagnostics are emitted at runtime and not replayed from persisted
  conversation events.

### 2026-06-17 SDK memory local-runtime search trace path

- Finding: SDK context enrichment emitted memory-search trace rows under
  `memory.sidecar_search`, making reusable SDK query enrichment diagnostics
  read like direct sidecar knowledge.
- Change: routed memory search traces through the `memory.local_runtime_search`
  path and updated focused enrichment/conversation assertions and trace docs to
  describe the search as SDK local-runtime work.
- Validation: focused SDK context-enrichment and conversation trace tests, trace
  docs update, path scan, docs listing, and diff check.
- Compatibility: persisted trace rows from earlier builds keep the old path;
  new SDK memory-search trace rows use `memory.local_runtime_search`. No storage
  migration is required because trace paths are append-only diagnostics.

### 2026-06-17 SDK local runtime lifecycle trace path

- Finding: SDK `Agent` local-runtime helpers still emitted lifecycle trace rows
  under the sidecar-specific `sidecar.lifecycle` path even though the public
  boundary is the SDK local runtime.
- Change: routed status, tool-list, and shutdown helper traces through the
  `local_runtime.lifecycle` path while preserving the `sidecar` runtime marker
  for the current sidecar-backed executor.
- Validation: focused SDK trace test, runtime trace docs update, path scan,
  docs listing, and diff check.
- Compatibility: persisted trace rows from earlier builds keep the old path;
  new SDK lifecycle rows use `local_runtime.lifecycle`. No storage migration is
  required because trace paths are append-only diagnostics.

### 2026-06-17 main local runtime bridge headers

- Finding: Electron main sidecar bridge modules still introduced host adapter
  files as local sidecar bridges even though they adapt SDK local runtime
  behavior to Electron windows, status, tools, and diagnostics.
- Change: reworded the active module headers to local-runtime bridge/process
  language while leaving compatibility file names and actual sidecar process
  implementation details unchanged.
- Validation: active header phrase scan, focused bridge module Jest smoke,
  docs listing, and diff check.
- Compatibility: no migration required. This is code commentary only.

### 2026-06-17 renderer transient runtime error pattern table

- Finding: the renderer conversation-list facade still inlined lower-layer
  local-backend and sidecar daemon error text inside the transient retry
  classifier, and one chat stream guard comment described provider packets as
  backend packets.
- Change: moved compatibility transient error text into a named local-runtime
  pattern table, made the classifier consume that table, and reworded the chat
  stream comment to generic runtime packets.
- Validation: focused renderer app-runtime and conversation-library Jest runs,
  renderer runtime wording scan, docs listing, and diff check.
- Compatibility: no migration required. Transient retry classification still
  accepts the same lower-layer messages.

### 2026-06-17 renderer local runtime IPC registry aliases

- Finding: the renderer local-runtime status store still depended on
  local-backend-named IPC registry constants because the shared registry only
  exposed legacy names for the existing channel strings.
- Change: added generic `GET_LOCAL_RUNTIME_STATUS` and `LOCAL_RUNTIME_STATUS`
  aliases to the shared IPC registry and renderer expected-registry parity
  check, then routed the status store through those aliases.
- Validation: focused IPC channel parity and local-runtime status store Jest
  runs, channel alias scan, docs listing, and diff check.
- Compatibility: no migration required. The underlying channel strings remain
  `get-local-backend-status` and `local-backend-status`, so preload/main
  allowlists and handlers stay compatible.

### 2026-06-17 renderer local runtime status channel aliases

- Finding: renderer `localRuntimeStatusStore` was named for local runtime state
  but called the legacy local-backend IPC channel constants directly at each
  subscribe/bootstrap use site.
- Change: bound the compatibility channel constants once to local-runtime
  aliases inside the store and routed the store through those aliases, with a
  focused source assertion to keep the compatibility detail at the transport
  boundary.
- Validation: focused local-runtime status store Jest assertion, channel-use
  scan, docs listing, and diff check.
- Compatibility: no migration required. IPC channel string values and preload
  allowlists are unchanged.

### 2026-06-17 local runtime bridge utility wording

- Finding: the Electron main sidecar utility docstring and process health
  checklist still called the host-owned readiness path a local sidecar bridge.
- Change: reworded those active docs to local runtime bridge while leaving file
  names, sidecar process terminology, and compatibility diagnostics paths
  unchanged.
- Validation: active source/doc phrase scan, direct Node module smoke, docs
  listing, and diff check.
- Compatibility: no migration required. This is code/doc commentary only.

### 2026-06-17 diagnostics local runtime error code

- Finding: the app diagnostics error classifier still emitted the
  `sidecar_unavailable` code for both local-runtime and sidecar-worded
  failures.
- Change: renamed the emitted classifier code to `local_runtime_unavailable`
  while preserving matching for lower-level sidecar-worded error messages.
- Validation: focused diagnostics source assertion, diagnostic-code scan, docs
  listing, and diff check.
- Compatibility: no migration required. Existing stored diagnostic rows keep
  their original error codes; new local-runtime availability classifier output
  uses the generic code.

### 2026-06-17 conversation diagnostics local runtime owner

- Finding: the conversation metadata diagnostics registry still named the
  sidecar conversation store directly even though the public boundary is SDK
  projection/listing plus local runtime storage.
- Change: reworded the diagnostics owner to `SDK + local runtime conversation
  store` and locked it in the diagnostics owner test.
- Validation: focused diagnostics owner Jest assertion, owner-copy scan, docs
  listing, and diff check.
- Compatibility: no migration required. The diagnostic path and stored row shape
  are unchanged.

### 2026-06-17 diagnostics local runtime owner wording

- Finding: app diagnostics path definitions and trace docs still described the
  generic host boundary as a local sidecar bridge even after lifecycle
  diagnostics moved to local-runtime constants.
- Change: reworded browser-session and local-runtime diagnostics ownership to
  the Electron main local runtime bridge, updated trace and frontend
  architecture docs, and locked the registry owner wording in diagnostics tests.
- Validation: focused diagnostics owner Jest assertion, active source/doc
  bridge-copy scan, docs listing, and diff check.
- Compatibility: no migration required. Persisted diagnostics keep the existing
  `local_backend.lifecycle` path and compatibility alias while registry copy
  now names the generic runtime owner.

### 2026-06-17 diagnostics sidecar readiness field removal

- Finding: after active conversation metadata diagnostics moved to
  `localRuntimeReady`, the diagnostics runtime sanitizer and store allowlist
  still accepted new `sidecarReady` payload fields.
- Change: removed `sidecarReady` from the new-row diagnostics sanitizer and
  allowlist while leaving historical stored rows untouched.
- Validation: targeted diagnostics Jest assertions, direct Node export smoke,
  sidecar readiness field scan, docs listing, and diff check.
- Compatibility: no data migration required. Existing diagnostic rows remain
  readable as stored JSON; new rows use the generic local-runtime readiness
  field.

### 2026-06-17 main diagnostics local runtime export

- Finding: main diagnostics still exported the unused
  `appendLocalBackendLifecycleDiagnostic` alias even though active sidecar
  bridge code already calls `appendLocalRuntimeLifecycleDiagnostic`.
- Change: removed the backend-named diagnostics export and added focused
  diagnostics runtime coverage for the generic local-runtime helper.
- Validation: targeted diagnostics Jest assertion, direct Node export smoke,
  alias source scan, docs listing, and diff check.
- Compatibility: no migration required. Active callers already use the generic
  export, diagnostic path compatibility remains in the store constants, and
  persisted diagnostic rows are unchanged.

### 2026-06-17 renderer conversation-list local runtime error code

- Finding: the renderer conversation library facade classified active
  conversation metadata failures with the diagnostic code
  `sidecar_unavailable`, leaking the local executor implementation name through
  a generic renderer app-runtime diagnostic surface.
- Change: renamed the emitted diagnostic code to `local_runtime_unavailable`
  while preserving transient matching for lower-layer sidecar/local-backend
  error messages.
- Validation: focused desktop conversation library Jest run, diagnostics code
  scan, docs listing, and diff check.
- Compatibility: no migration required. This diagnostic code is emitted for new
  transient renderer diagnostics only; existing matching behavior and user copy
  are unchanged.

### 2026-06-17 conversation metadata diagnostics local runtime field

- Finding: the generic Agent SDK command handler still emitted
  `sidecarReady` in active conversation metadata diagnostics even though current
  diagnostics already use local-runtime readiness wording.
- Change: changed the active `conversations.list` diagnostic producer to emit
  `localRuntimeReady`, updated runtime trace docs, and added main SDK boundary
  coverage to prevent the backend/sidecar readiness name from returning to that
  producer.
- Validation: focused main SDK runtime boundary Jest run, diagnostics field
  scan, docs listing, and diff check.
- Compatibility: no migration required. The diagnostics store still allows
  historical `sidecarReady` data, while new conversation metadata rows use the
  generic local-runtime field.

### 2026-06-17 renderer active skin config facade

- Finding: generic renderer config storage, provider-key helpers, model cards,
  and chat model labels still imported individual WindieOS skin/config modules
  for model selection and provider display defaults.
- Change: added `desktopAgentConfig` as the generic active renderer skin/config
  facade, routed config storage and dashboard/chat model helpers through it,
  and documented the facade in frontend architecture notes.
- Validation: focused renderer skin, settings section, and chat model option
  Jest runs; product-config import scan; docs listing; and diff check.
- Compatibility: no migration required. Persisted frontend config keys, default
  values, provider labels, and rendered model/provider copy are unchanged.

### 2026-06-17 renderer brand icon generic CSS token

- Finding: after the brand icon asset moved into the WindieOS renderer skin,
  the generic dashboard shell stylesheet still referenced the
  product-specific `--windie-desktop-brand-icon-url` variable as a fallback.
- Change: changed the WindieOS skin stylesheet to publish the generic
  `--cg-brand-app-icon-url` token directly and made the dashboard shell consume
  only that generic token.
- Validation: focused renderer skin boundary Jest run, stale token scan, and
  diff check.
- Compatibility: no migration required. The visible brand icon still resolves
  to the same bundled `windieos.app.png` asset through the active WindieOS skin.

### 2026-06-17 SDK package metadata uses generic agent wording

- Finding: TypeScript and Python SDK package descriptions still described the
  public packages as waking "Windie agents" even though the SDK API is now the
  generic Agent SDK boundary with Windie-prefixed exports preserved only as
  compatibility.
- Change: updated JS package metadata and Python package README/pyproject copy
  to say the SDK wakes agents and routes local runtime tools.
- Validation: package JSON parse, Python TOML parse, retired-copy source scan,
  and diff check.
- Compatibility: no migration required. Package names, import paths, keywords,
  and compatibility exports are unchanged.

### 2026-06-17 Backend templates and audio helpers use generic wording

- Finding: the backend SDK tool template and transcription audio-frame helper
  still described generic extension/template and audio parsing code as
  WindieOS-specific.
- Change: reworded the SDK tool template README/manifest and transcription
  audio-frame helper docstring to generic agent-backend/transcription wording.
- Validation: Python syntax compile for the audio helper, retired-copy source
  scan, and diff check.
- Compatibility: no migration required. This is documentation/template copy and
  helper docstring text only.

### 2026-06-17 Backend module docstrings use role-based wording

- Finding: several backend parser, validation, cache, event bus, transcription,
  token, tool registry, tool orchestrator, and simulation docstrings still
  branded generic backend infrastructure as WindieOS-specific.
- Change: reworded those comments/docstrings to describe the owning backend
  role: agent backend streams, backend API validation, backend cache/event bus,
  local transcription gateway, normalized chat history, flat agent tool specs,
  backend tool registry, and dedicated browser simulation.
- Validation: Python syntax compile, retired-copy source scan, and diff check.
- Compatibility: no migration required. This is source documentation and
  simulation prompt copy only; runtime behavior and public contracts are
  unchanged.

### 2026-06-17 Backend tool descriptions use generic local-runtime copy

- Finding: backend model-visible tool descriptions still referred to the
  "WindieOS workspace", "WindieOS browser", and "hosted WindieOS backend" even
  though these schemas describe generic local runtime workspace, dedicated
  browser, and hosted-backend tool contracts.
- Change: updated system, browser, and remote web-search tool descriptions plus
  focused backend expectations to use generic workspace/browser/backend wording.
- Validation: Python syntax compile, stale-copy source scan, and diff check.
  The focused backend pytest command could not collect in this workspace because
  the `jarvis` conda environment is unavailable and the fallback Python lacks
  `fastapi`.
- Compatibility: no migration required. Tool names, argument schemas,
  validation probes, policy gates, and provider-visible field shapes are
  unchanged.

### 2026-06-17 Current docs route to Agent runtime modules

- Finding: current architecture, routing, debugging, and API docs still pointed
  maintainers at the old `WindieClient.ts` / `WindieAgent.ts` implementation
  modules and taught `WindieClient.wakeUp(...)` in primary examples even after
  the TypeScript SDK runtime moved to `AgentClient.ts` / `Agent.ts`.
- Change: updated current docs to route to `AgentClient`, `Agent`, and the
  generic runtime module paths while leaving compatibility mentions and
  historical plan reports intact.
- Validation: docs listing, stale-reference source scan, and diff check.
- Compatibility: no migration required. This is documentation-only; the
  Windie-prefixed SDK exports remain compatibility aliases.

### 2026-06-17 Permission manifest uses generic desktop-agent copy

- Finding: the shared permission manifest still embedded WindieOS-specific
  onboarding descriptions even though the permission contract is shared runtime
  metadata and the product-specific host/onboarding copy already lives in the
  main and renderer skins.
- Change: made screen capture, input control, macOS automation, and browser
  automation manifest descriptions product-neutral, documented the generic
  manifest/product skin split, and added host-boundary coverage that prevents
  WindieOS copy from returning to the shared manifest.
- Validation: focused frontend host-skin, permission-service, and onboarding
  tests, docs listing, source scan, and diff check.
- Compatibility: no migration required. Permission ids, validation probes,
  grant labels, OS scope, and stored permission state are unchanged.

### 2026-06-17 Python SDK exports AgentSdkClient

- Finding: Python hosted-agent SDK docs and exports still exposed
  `WindieSdkClient` as the only public client name, even though the implementation
  copy and generated identity had already moved toward generic Agent SDK wording.
- Change: added canonical `AgentSdkClient` and `AgentSdkAgentSession` exports,
  kept `WindieSdkClient` / `WindieSdkAgentSession` as compatibility aliases,
  updated package/core exports, README snippets, and current Python SDK docs.
- Validation: Python syntax compile, targeted sidecar SDK/package tests, source
  scan, and diff check. A broader `bin windie test sidecar -- ...` attempt
  ignored the file narrowing and ran unrelated Windows/path-sensitive sidecar
  tests that still fail in this workspace.
- Compatibility: no migration required. Existing Windie-prefixed Python SDK
  imports continue to resolve to the same classes.

### 2026-06-17 SDK runtime modules use Agent filenames

- Finding: after `AgentClient`, `Agent`, and `AgentChatSession` became
  canonical class names, their implementations still lived in
  `WindieClient.ts`, `WindieAgent.ts`, and `WindieChatSession.ts`; docs and
  source-inspection tests also routed maintainers to those compatibility module
  names as primary files.
- Change: moved the runtime implementations to `AgentClient.ts`, `Agent.ts`,
  and `AgentChatSession.ts`, switched SDK internals and root exports to those
  generic modules, kept Windie-prefixed files as compatibility re-exports,
  regenerated checked-in CommonJS output, and updated current routing docs.
- Validation: SDK package build, focused SDK package/client/header tests, CJS
  runtime alias smoke, docs listing, source scan, and diff check.
- Compatibility: no migration required. Existing `WindieClient`, `WindieAgent`,
  and `WindieChatSession` exports and private CJS compatibility module paths
  continue to resolve to the same runtime constructors.

### 2026-06-17 SDK transport modules use AgentSession filenames

- Finding: after `AgentSession` and `ManagedAgentSession` became canonical
  runtime names, the SDK implementation still lived behind
  `WindieAgentSession.ts` and `ManagedWindieAgentSession.ts`, and internal
  imports depended on those compatibility module names.
- Change: moved the transport implementations to `AgentSession.ts` and
  `ManagedAgentSession.ts`, switched SDK internals and root exports to the
  generic modules, kept Windie-prefixed files as compatibility re-exports, and
  regenerated checked-in CommonJS output.
- Validation: SDK package build, focused package/private export/websocket
  contract tests, CJS alias smoke, docs listing, source scan, and diff check.
- Compatibility: no migration required. Existing Windie-prefixed root exports
  and private CJS compatibility module paths continue to resolve to the same
  constructors and factories.

### 2026-06-17 SDK docs and examples use AgentClient

- Finding: after making `AgentClient` canonical, SDK-facing examples and
  Electron-main docs still taught `WindieClient` / `WindieAgent` as the primary
  runtime path instead of compatibility aliases.
- Change: updated runnable SDK examples, custom UI import snippets, docs
  navigation, and Electron-main runtime references to use `AgentClient` and
  `Agent` terminology for reusable host guidance; also made the shared example
  loader use the SDK package ESM build script so local SDK example smoke checks
  can run on this workspace.
- Validation: focused example smoke checks, docs index coverage, docs listing,
  source scan, and diff check.
- Compatibility: no migration required. Existing `WindieClient` and
  `WindieAgent` exports remain available as compatibility aliases.

### 2026-06-17 preload desktop-agent invoke channel alias

- Finding: the preload bridge exposed the generic `desktopAgent` command API but
  still sent through `INVOKE_CHANNELS.WINDIE_INVOKE` directly inside that bridge.
- Change: added a preload-local `DESKTOP_AGENT_INVOKE_CHANNELS` alias, switched
  the bridge to it, and added source-boundary coverage so bridge code cannot
  reach into the Windie-prefixed registry key directly.
- Validation: focused preload IPC channel coverage, docs listing, source scan,
  and diff check.
- Compatibility: no migration required. The exposed `desktopAgent` and
  compatibility `windie` globals still use the same underlying IPC channel.

### 2026-06-17 SDK generic agent client class

- Finding: Electron main and reusable callers could import the generic
  `AgentClient` alias, but the SDK client implementation and docs still treated
  `WindieClient` as the canonical runtime class.
- Change: made `AgentClient` the canonical SDK client class, kept
  `WindieClient` as the compatibility value/type alias, regenerated CJS output,
  and updated SDK runtime docs to teach the generic client path.
- Validation: focused SDK package-boundary/type/CJS checks, docs listing, CJS
  alias smoke, and diff check.
- Compatibility: no migration required. Existing `WindieClient` imports and
  `new WindieClient(...)` calls continue to construct the same SDK client.

### 2026-06-17 SDK generic high-level agent class

- Finding: `WindieClient` and package callers could use the generic `Agent`
  alias, but the high-level SDK runtime object was still declared as the
  `WindieAgent` class.
- Change: made `Agent` the canonical high-level SDK class, kept `WindieAgent`
  as the compatibility value/type alias, regenerated CJS output, and reused the
  package-boundary alias coverage.
- Validation: focused SDK package-boundary/type/CJS checks, docs listing, CJS
  alias smoke, and diff check.
- Compatibility: no migration required. Existing `WindieAgent` imports and
  `new WindieAgent(...)` calls continue to construct the same SDK agent object.

### 2026-06-17 SDK generic agent session class

- Finding: the SDK transport factory exposed generic session type aliases, but
  its concrete websocket session class was still `WindieAgentSession` with
  `AgentSession` layered on as an alias.
- Change: made `AgentSession` the canonical session class, kept
  `WindieAgentSession` as the compatibility value/type alias, regenerated CJS
  output, and tightened package-boundary coverage for the alias relationship.
- Validation: focused SDK package-boundary/type/CJS checks, docs listing, and
  diff check.
- Compatibility: no migration required. Existing `WindieAgentSession` and
  `createWindieAgentSession` imports continue to resolve to the same runtime
  implementation.

### 2026-06-17 main local runtime metadata invalidation channel

- Finding: the main local-runtime status broadcaster still sent conversation
  metadata invalidation events on a literal `windie:conversation-metadata-invalidated`
  string even though the generic main desktop-agent channel facade owns that
  renderer-facing SDK event name.
- Change: switched the broadcaster to `DESKTOP_AGENT_ON_CHANNELS` and updated
  focused coverage to assert the generic channel alias.
- Validation: focused local-runtime broadcaster and main host boundary tests,
  docs listing, and diff check.
- Compatibility: no migration required. The underlying IPC channel string is
  unchanged.

### 2026-06-17 renderer SDK facade model-selection alias

- Finding: the renderer SDK facade re-exported the compatibility
  `WindieModelSelection` type as `AgentModelSelection` even though the SDK now
  exports the generic `AgentModelSelection` name directly.
- Change: removed the redundant compatibility-name re-export and added renderer
  boundary coverage to keep the facade using generic SDK type names directly.
- Validation: focused renderer API boundary test, docs listing, and diff check.
- Compatibility: no migration required. The facade still re-exports the full SDK
  surface, including both `AgentModelSelection` and the compatibility
  `WindieModelSelection` type.

### 2026-06-17 SDK generic agent alias

- Finding: the SDK had generic client, option, stream, chat, and hosted
  transport aliases, but `AgentClient.wakeUp(...)` still returned only the
  Windie-prefixed `WindieAgent` type.
- Change: added `Agent` as the generic value/type alias for the high-level SDK
  agent object, switched `WindieClient` internals and return typing to the
  generic alias, and kept `WindieAgent` as a compatibility export.
- Validation: focused SDK package-boundary/type/CJS checks and docs listing.
- Compatibility: no migration required. Existing `WindieAgent` imports and
  instances continue to work because `Agent` and `WindieAgent` reference the
  same constructor.

### 2026-06-17 SDK hosted backend HTTP client aliases

- Finding: SDK runtime internals still typed hosted HTTP route access through
  the Windie-prefixed `WindieSdkClient` surface even though model listing,
  prompt/query-plan introspection, artifacts, OCR, vision, embeddings, and
  install identity are reusable agent SDK hosted-backend contracts.
- Change: added `AgentHostedBackendClient` plus generic option/query/install
  identity type aliases, switched SDK runtime internals to the generic names,
  and kept `WindieSdkClient` and matching Windie-prefixed types as
  compatibility aliases.
- Validation: focused SDK package-boundary/type/CJS checks and docs listing.
- Compatibility: no migration required. Existing `WindieSdkClient`,
  `WindieSdkClientOptions`, `WindieSdkQueryOptions`, and
  `WindieInstallIdentityResponse` imports continue to work.

### 2026-06-17 main layer log default path

- Finding: generic Electron main layer-log resolution still defaulted to the
  product-specific `.windie/logs` repo directory even though the log sink is a
  desktop-agent host utility.
- Change: changed the default layer log directory to `.desktop-agent/logs`,
  aligned launcher/CLI/log-sink tests, and updated developer docs to describe
  the generic default plus existing environment overrides for legacy or
  externally managed paths.
- Validation: focused frontend log sink, launcher, and CLI tests plus docs
  listing and diff checks.
- Compatibility: no automatic migration. Existing `WINDIE_<LAYER>_LOG_FILE`
  and `WINDIE_RENDERER_VERBOSE_LOG_FILE` overrides can continue to point at
  `.windie/logs` or any other managed path; log payloads and CLI commands are
  unchanged.

### 2026-06-17 main sidecar bridge console labels

- Finding: Electron main sidecar bridge modules still emitted
  `[Main][LocalBackendBridge]` console labels even though the host adapter now
  represents a generic sidecar/local-runtime bridge.
- Change: changed new console output from the bridge, tool-execution, and
  screenshot materialization helpers to `[Main][SidecarBridge]`, leaving module
  filenames, exports, IPC channels, and diagnostic path ids unchanged.
- Validation: focused main host-skin boundary source scan, docs listing,
  `git diff --check`, and source scan for the retired console prefix.
- Compatibility: no migration required. This affects diagnostic log copy only;
  bridge behavior, error envelopes, screenshot artifact handling, and status
  channels are unchanged.

### 2026-06-17 local sidecar log prefix

- Finding: the sidecar daemon still emitted a `[LocalBackend]` layer log for
  daemon status requests, and Electron launch-option tests/docs treated that as
  the primary sidecar log prefix.
- Change: changed the daemon status log to `[LocalSidecar]`, added the prefix to
  the Electron sidecar log allowlist, kept `[LocalBackend]` accepted for legacy
  helper output, and updated logging docs/tests to prefer local-sidecar wording.
- Validation: focused sidecar daemon source-copy pytest, focused
  `SdkSidecarLaunchOptions` Jest coverage, docs listing, `git diff --check`,
  and source scan for emitted legacy status-prefix usage.
- Compatibility: no migration required. Environment flag names, diagnostic path
  ids, sidecar launch behavior, and legacy `[LocalBackend]` log forwarding
  remain unchanged.

### 2026-06-17 SDK hosted default endpoint helper

- Finding: SDK auto-registration used an internal
  `isHostedWindieBackendUrl` helper name even though the check is for the
  configured hosted default endpoint boundary.
- Change: renamed the TypeScript source and checked-in CJS helper to
  `isHostedDefaultBackendUrl`, updated SDK docs wording, and added a source
  boundary test for the helper name.
- Validation: focused `WindieSdkClient` hosted default helper and install-auth
  Jest tests, docs listing, `git diff --check`, and source scan for the retired
  helper name.
- Compatibility: no migration required. The default URL, auto-registration
  conditions, install-auth routes, and public SDK symbols are unchanged.

### 2026-06-17 SDK install auth error copy

- Finding: SDK install-auth failures still used Windie-specific wording in
  reusable client error and fallback log messages, even though the install-auth
  flow is part of the generic agent SDK runtime contract.
- Change: changed install registration and identity lookup failure copy to
  generic Agent SDK wording in the TypeScript source and checked-in CJS output,
  with focused tests for registration failure and invalid auth payload errors.
- Validation: focused `WindieSdkClient` Jest install-auth copy tests, docs
  listing, `git diff --check`, and source scan for retired install-auth copy.
- Compatibility: no migration required. Hosted URL defaults, install-auth route
  shape, bearer headers, auto-registration conditions, and public SDK symbols
  are unchanged.

### 2026-06-17 main diagnostics local runtime lifecycle alias

- Finding: Electron main diagnostics code still used local-backend constant and
  helper names for the local runtime lifecycle diagnostic path, even though the
  path now represents SDK local-runtime/sidecar lifecycle status.
- Change: introduced generic local-runtime diagnostics constant/helper names for
  main code while preserving the legacy exported names and the durable
  `local_backend.lifecycle` path id for existing diagnostics filters.
- Validation: focused diagnostics alias and local bridge lifecycle Jest tests,
  docs listing, `git diff --check`, and source scan for remaining lifecycle
  helper references.
- Compatibility: no migration required. Stored diagnostic path ids, CLI path
  filters, environment flag names, and legacy module exports remain available.

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

### 2026-06-17 Python SDK generated agent identity

- Finding: Python SDK wake-up defaults still generated `windie-python-agent-*`,
  `Windie Python Agent`, and `conv-windie-python-agent` values even though the
  SDK boundary should expose reusable agent API defaults rather than product
  copy.
- Change: changed Python SDK generated defaults to `python-agent-*`,
  `Python Agent`, and `conv-python-agent`, documented the Python SDK identity
  boundary next to the TypeScript SDK default, and added focused sidecar SDK
  coverage.
- Validation: focused Python SDK identity test, docs listing,
  `git diff --check`, and source scans for the retired generated defaults.
- Compatibility: no migration required. Explicit caller-provided agent ids,
  names, and conversation refs are unchanged; public `WindieSdkClient` package
  and class names remain compatibility API.

### 2026-06-17 main local runtime bridge dependency names

- Finding: the Electron main composition root still imported
  `initializeLocalBackendBridge`, `stopLocalBackend`, and
  `getLocalBackendStatus` from the sidecar adapter, then aliased them into the
  already-generic lifecycle/window runtime dependency shape.
- Change: added generic local-runtime export aliases at the sidecar bridge
  adapter edge, switched `index.cjs` to consume those names directly, and kept
  the backend-prefixed exports as compatibility API for focused bridge tests and
  any remaining adapter-edge consumers.
- Validation: focused main host skin/boundary test coverage, docs listing,
  `git diff --check`, and source scans for retired backend-prefixed names in the
  main composition root.
- Compatibility: no migration required. IPC payload compatibility fields such
  as `backend_status` remain unchanged; only private main-process dependency
  names moved to local-runtime wording.

### 2026-06-17 SDK builtin selection helper alias

- Finding: the SDK builtin tool-selection helper was exposed only as
  `windieBuiltins` with `WindieBuiltin*` types even though builtin selection is
  a reusable agent API concern, not WindieOS skin or hosted-backend policy.
- Change: added `agentBuiltins` plus `AgentBuiltin*` type names as the generic
  SDK surface, changed SDK client internals to depend on the generic type names,
  and kept `windieBuiltins`/`WindieBuiltin*` as compatibility aliases.
- Validation: focused SDK package-boundary Jest coverage, docs listing,
  `git diff --check`, and source scans for the new generic helper export.
- Compatibility: no migration required. Existing SDK callers can continue to
  import `windieBuiltins` and `WindieBuiltin*`; new docs prefer
  `agentBuiltins`.

### 2026-06-17 SDK model selection type alias

- Finding: the SDK model-selection helper exposed only `WindieModelSelection`
  even though the selection shape is a generic agent runtime API contract.
- Change: added `AgentModelSelection` as the generic type name, switched SDK
  runtime internals to use it, and kept `WindieModelSelection` as a
  compatibility alias.
- Validation: focused model-selection Jest coverage, SDK no-emit TypeScript
  check, docs listing, `git diff --check`, and source scans showing the
  Windie-prefixed type remains only as the compatibility alias.
- Compatibility: no migration required. Existing callers can keep importing
  `WindieModelSelection`; new docs prefer `AgentModelSelection`.

### 2026-06-17 SDK runtime event type alias

- Finding: the durable SDK conversation runtime emitted a public
  `WindieRuntimeEvent` type even though the stream event union is a reusable
  agent runtime contract.
- Change: added `AgentRuntimeEvent` as the generic stream event type, switched
  conversation runtime and agent stream projection internals to the generic
  name, and kept `WindieRuntimeEvent` as a compatibility alias.
- Validation: focused conversation runtime Jest coverage, SDK no-emit
  TypeScript check, docs listing, `git diff --check`, and source scans showing
  the Windie-prefixed event type remains only as the compatibility alias.
- Compatibility: no migration required. Runtime event payloads are unchanged,
  and existing `WindieRuntimeEvent` imports continue to type-check.

### 2026-06-17 SDK agent stream type aliases

- Finding: the high-level SDK agent stream projection exposed only
  `WindieAgentStreamEvent` and related `WindieAgent*` tool/state type names
  even though `agent.stream(...)` is a reusable agent API surface.
- Change: added generic `AgentStreamEvent`, `AgentStreamState`,
  `AgentToolCall`, and `AgentToolOutput` type names, switched SDK stream
  internals to those names, and kept the Windie-prefixed names as compatibility
  aliases.
- Validation: focused conversation runtime Jest coverage, SDK no-emit
  TypeScript check, docs listing, `git diff --check`, and source scans showing
  Windie-prefixed stream types remain only as compatibility aliases.
- Compatibility: no migration required. Stream payloads are unchanged, and
  existing `WindieAgentStreamEvent` imports continue to type-check.

### 2026-06-17 SDK local runtime contract type aliases

- Finding: SDK local-runtime contracts still exposed only Windie-prefixed type
  names for local tools, sidecar clients, local runtime providers, local events,
  and auto-sidecar options even though these are reusable SDK agent contracts.
- Change: added generic `Agent*` local-runtime type names, switched SDK
  internals and sidecar-backed store adapters to the generic names, and kept
  matching `Windie*` type names as compatibility aliases.
- Validation: focused SDK package-boundary Jest coverage, SDK no-emit
  TypeScript check, docs listing, `git diff --check`, and source scans showing
  Windie-prefixed local-runtime types remain compatibility aliases.
- Compatibility: no migration required. Runtime payloads and public option
  shapes are unchanged; existing `Windie*` type imports continue to type-check.

### 2026-06-17 SDK local runtime provider factory alias

- Finding: after local-runtime contract types moved to generic `Agent*` names,
  SDK internals still created auto sidecar providers through
  `createWindieLocalRuntimeProvider`.
- Change: added `createAgentLocalRuntimeProvider` as the preferred runtime
  factory, switched source and checked-in CommonJS client internals to use it,
  and kept `createWindieLocalRuntimeProvider` as a compatibility alias.
- Validation: focused SDK package-boundary Jest coverage, SDK no-emit
  TypeScript check, CJS export smoke, docs listing, `git diff --check`, and
  source scans for the compatibility alias boundary.
- Compatibility: no migration required. Provider behavior and options are
  unchanged; existing `createWindieLocalRuntimeProvider` imports keep working.

### 2026-06-17 SDK agent session transport aliases

- Finding: SDK hosted websocket/session transport still exposed only
  Windie-prefixed type and factory names even though this is a reusable agent
  runtime boundary used by SDK callers, Electron main, and future hosts.
- Change: added generic `AgentSession*` transport contracts,
  `createAgentSession`, `createAgentBackendTransport`,
  `ManagedAgentSession*`, and `createManagedAgentSession`, switched SDK source
  and checked-in CommonJS internals to those names, and kept all matching
  Windie-prefixed names as compatibility aliases.
- Validation: focused SDK package-boundary Jest coverage, SDK no-emit
  TypeScript check, CJS export smoke, docs listing, `git diff --check`, and
  source scans showing Windie-prefixed session names remain compatibility
  aliases.
- Compatibility: no migration required. Websocket payloads, managed-session
  behavior, and existing Windie-prefixed imports are unchanged.

### 2026-06-17 SDK chat session aliases

- Finding: the SDK chat convenience wrapper was documented as reusable runtime
  code but exported only `WindieChatSession` and Windie-prefixed chat input
  types.
- Change: added `AgentChatSession`, `AgentChatSendInput`,
  `AgentChatEditInput`, and `AgentChatRetryInput` as the preferred generic
  names, switched `WindieAgent.chat(...)` and checked-in CommonJS internals to
  construct `AgentChatSession`, and kept the Windie-prefixed names as
  compatibility aliases.
- Validation: focused SDK package-boundary Jest coverage, SDK no-emit
  TypeScript check, CJS export smoke, docs listing, `git diff --check`, and
  source scans showing Windie-prefixed chat names remain compatibility aliases.
- Compatibility: no migration required. Chat-session behavior and payloads are
  unchanged, and existing `WindieChatSession` imports keep working.

### 2026-06-17 SDK agent API option aliases

- Finding: `WindieAgent` still exposed and consumed Windie-prefixed option,
  owner, memory, trace, and prepare-edit/retry type names for generic agent API
  shapes.
- Change: added generic `Agent*` names for query/stop options, owner/MCP
  registration, memory inputs/results, trace options, clear-conversation
  options, and prepare-edit/retry inputs; switched `WindieAgent` internals to
  those names; and kept the matching Windie-prefixed names as compatibility
  aliases.
- Validation: focused SDK package-boundary Jest coverage, SDK no-emit
  TypeScript check, docs listing, `git diff --check`, and source scans showing
  Windie-prefixed agent API types remain compatibility aliases.
- Compatibility: no migration required. Agent method payloads and results are
  unchanged, and existing Windie-prefixed type imports keep working.

### 2026-06-17 SDK client runtime aliases

- Finding: `WindieClient` wake-up, client construction, local-runtime request,
  install-auth, and runtime feature option contracts still exposed only
  Windie-prefixed type names even though they describe reusable SDK client
  runtime behavior.
- Change: added `AgentClient` as a runtime constructor alias plus generic
  `AgentClientOptions`, `AgentWakeUpOptions`, `AgentLocalRuntimeRequest`,
  `AgentRuntimeFeatureOption`, `AgentInstallAuthState`, and
  `AgentInstallAuthOptions`; switched `WindieClient` source internals to those
  generic type names; patched the checked-in CommonJS export; and kept the
  Windie-prefixed names as compatibility aliases.
- Validation: focused SDK package-boundary Jest coverage, SDK no-emit
  TypeScript check, CJS export smoke, docs listing, `git diff --check`, and
  source scans showing Windie-prefixed client runtime names remain
  compatibility aliases.
- Compatibility: no migration required. Client behavior, wake-up payloads, and
  existing `WindieClient`/Windie-prefixed type imports keep working.

### 2026-06-17 Electron main SDK client alias

- Finding: Electron main already acts as a generic SDK host but still
  constructed the runtime through the product-branded `WindieClient` export.
- Change: switched the desktop agent client factory to construct
  `AgentClient`, updated main boundary tests and SDK mocks to enforce/provide
  the generic constructor alias, and updated the SDK runtime doc's Electron
  main example to use `AgentClient`.
- Validation: focused main boundary Jest coverage and replay mock coverage
  passed, docs listing passed, `git diff --check` passed, and source scans show
  Electron main no longer constructs `WindieClient` directly. The broader
  `IpcMainConversationRuntimeRegistry.test.cjs` suite was also attempted, but
  its held-send concurrency test timed out while awaiting the mocked second
  send; that path is outside the constructor alias change.
- Compatibility: no migration required. `AgentClient` is the same SDK
  constructor as `WindieClient`, so runtime behavior and test mocks stay
  unchanged.

### 2026-06-17 Renderer desktop agent bridge alias

- Finding: renderer runtime code still resolved SDK command dispatch through
  `window.windie` directly even though the app runtime is a generic desktop
  agent UI boundary.
- Change: added a generic `DesktopAgentCommandBridge` contract and
  `getDesktopAgentCommandBridge()` accessor, made the renderer prefer
  `window.desktopAgent` with `window.windie` as a compatibility fallback, and
  exposed the same preload bridge object under both `desktopAgent` and
  `windie`.
- Validation: focused renderer runtime boundary coverage, preload IPC bridge
  coverage, docs listing, `git diff --check`, and source scans showing
  `window.windie` remains only as the compatibility fallback inside the
  desktop-agent bridge adapter.
- Compatibility: no migration required. Existing preload consumers can keep
  using `window.windie`; new generic renderer code can use `window.desktopAgent`
  through the desktop-agent bridge accessor.

### 2026-06-17 Renderer desktop agent IPC channel aliases

- Finding: generic renderer SDK command dispatch still imported the
  product-prefixed `INVOKE_CHANNELS.WINDIE_INVOKE` constant even after the
  preload bridge gained a generic `desktopAgent` alias.
- Change: added generic `DESKTOP_AGENT_*_CHANNELS` alias groups over the shared
  IPC registry and switched the SDK command invoke client to use
  `DESKTOP_AGENT_INVOKE_CHANNELS.INVOKE`, leaving the underlying `windie:*`
  protocol strings unchanged.
- Validation: `npm.cmd --prefix frontend test -- --runInBand
  ../tests/frontend/RendererAppRuntimeBoundary.test.ts
  ../tests/frontend/PreloadIpcChannels.test.cjs
  ../tests/frontend/DesktopAgentRuntimeTransport.test.ts
  ../tests/frontend/DesktopLiveTurnRuntimeClient.test.ts`; `npm.cmd --prefix
  frontend test -- --runInBand ../tests/frontend/BrowserSessionStore.test.js`;
  `git diff --check`; `bin\windie docs list`; source scan confirms generic
  renderer code uses `DESKTOP_AGENT_INVOKE_CHANNELS.INVOKE` and the remaining
  `INVOKE_CHANNELS.WINDIE_INVOKE` reference is the alias definition.
- Compatibility: no migration required. Existing IPC channel strings and
  preload validation remain unchanged; generic renderer code can now use
  desktop-agent channel names.

### 2026-06-17 Main desktop agent IPC channel aliases

- Finding: the generic Electron main SDK host still registered and broadcast
  SDK conversation channels through hard-coded `windie:*` strings, even after
  renderer code gained desktop-agent channel aliases.
- Change: added a main-process `DESKTOP_AGENT_*_CHANNELS` facade over the
  shared IPC registry and switched main SDK invoke registration, pending-turn
  intake, conversation/status/current-turn broadcasts, renderer-window replay,
  and query-send failure broadcasts to the generic aliases.
- Validation: `npm.cmd --prefix frontend test -- --runInBand
  ../tests/frontend/MainHostSkinBoundary.test.cjs
  ../tests/frontend/IpcRendererWindows.test.cjs
  ../tests/frontend/IpcQuerySendRuntime.test.cjs
  ../tests/frontend/IpcMainSdkRuntimeBoundary.test.cjs`; `npm.cmd --prefix
  frontend test -- --runInBand ../tests/frontend/IpcMainBridge.lifecycle.test.cjs
  ../tests/frontend/IpcMainBridge.query.test.cjs` passed with the suite's
  existing post-run Jest open-handle warning; `git diff --check`;
  `bin\windie docs list`; source scan confirms the main generic host modules
  use `DESKTOP_AGENT_*_CHANNELS` and the remaining `windie:*` strings live in
  alias/test compatibility assertions.
- Compatibility: no migration required. IPC channel strings, preload
  validation, renderer expectations, and bridge behavior remain unchanged.

### 2026-06-17 Renderer desktop agent listener channel aliases

- Finding: renderer chat, dashboard, memory, and conversation-continuity
  consumers still subscribed to or sent SDK conversation channels through
  product-prefixed `ON_CHANNELS.WINDIE_*` / `SEND_CHANNELS.WINDIE_*` constants
  even though the renderer IPC registry now exposes desktop-agent aliases.
- Change: switched SDK conversation-event, current-turn, rows,
  metadata-invalidation, memory-store, and pending-turn renderer consumers to
  `DESKTOP_AGENT_ON_CHANNELS` / `DESKTOP_AGENT_SEND_CHANNELS`, and updated the
  renderer folder map plus focused listener test utilities.
- Validation: `npm.cmd --prefix frontend test -- --runInBand
  ../tests/frontend/RendererChatRuntimeBoundary.test.ts
  ../tests/frontend/ChatStreamMessageUpdates.test.ts
  ../tests/frontend/ConversationSessionRuntime.test.ts`; `npm.cmd --prefix
  frontend test -- --runInBand ../tests/frontend/UseDashboardConversations.test.jsx
  ../tests/frontend/MemorySection.test.jsx
  ../tests/frontend/DesktopConversationContinuityService.test.ts`; `npm.cmd
  --prefix frontend test -- --runInBand ../tests/frontend/ChatMessageSender.test.tsx
  ../tests/frontend/PendingTurnLiveSurfaceIntegration.test.js
  ../tests/frontend/PendingStopLiveSurfaceIntegration.test.jsx`; `npm.cmd
  --prefix frontend test -- --runInBand
  ../tests/frontend/ChatStreamThinkingStatus.transcript.test.tsx
  ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx
  ../tests/frontend/ChatStreamThinkingStatus.metadata.test.tsx`; `git diff
  --check`; `bin\windie docs list`; source scan confirms remaining direct
  Windie channel constants are alias definitions or negative compatibility
  assertions.
- Compatibility: no migration required. Renderer bridge validation, IPC
  strings, pending-turn behavior, conversation projections, memory refresh, and
  dashboard reload semantics remain unchanged.

### 2026-06-17 SDK backend socket factory alias

- Finding: managed SDK agent sessions now expose generic session/factory names,
  but their hosted websocket construction still depended on the
  Windie-prefixed `createWindieSdkBackendSocket` factory.
- Change: added `AgentBackendSocketOptions` and `createAgentBackendSocket` as
  the preferred SDK socket factory surface, kept the Windie-prefixed names as
  compatibility aliases, and switched managed session internals plus checked-in
  CommonJS output to the generic factory.
- Validation: `npm.cmd --prefix frontend test -- --runInBand
  ../tests/frontend/WindieSdkPackageBoundary.test.ts
  ../tests/frontend/WindieSdkClient.test.ts` passed package-boundary coverage
  but the full `WindieSdkClient` suite hit unrelated local-sidecar launcher
  failures while spawning temp `python-in-env`; focused socket diagnostics
  passed with `npm.cmd --prefix frontend test -- --runInBand
  ../tests/frontend/WindieSdkClient.test.ts --testNamePattern "transport
  constructors use generic agent SDK dependency diagnostics"`; CJS export smoke
  passed; `frontend\node_modules\.bin\tsc.cmd --noEmit -p
  packages/windie-sdk-js/tsconfig.build.json`; `frontend\node_modules\.bin\tsc.cmd
  --noEmit -p packages/windie-sdk-js/tsconfig.cjs.json`; `git diff --check`;
  `bin\windie docs list`; source scan confirms the Windie-prefixed socket
  factory remains only as compatibility API or test coverage.
- Compatibility: no migration required. Existing `createWindieSdkBackendSocket`
  imports keep working, socket options and behavior are unchanged, and the
  public package entrypoint still exports both names.

### 2026-06-17 Frontend architecture Agent SDK wording

- Finding: current frontend architecture docs still described the renderer API
  export surface and local-runtime lifecycle ownership with Windie-prefixed SDK
  client names, even though the implementation now routes those concepts
  through generic Agent SDK modules.
- Change: updated the architecture map to describe Agent SDK client helpers and
  `AgentClient` lifecycle ownership while leaving compatibility docs and
  historical plan/report references untouched.
- Validation: `bin\windie docs list`; `rg -n
  "WindieSdkClient|WindieClient owns"
  docs/architecture/frontend_architecture.md`; `git diff --check --
  docs/architecture/frontend_architecture.md
  plans/2026-06-16-general-agent-ui-runtime-boundary-plan.md`.
- Compatibility: no migration required. This is docs-only terminology cleanup
  for the current architecture boundary.

### 2026-06-17 Frontend websocket contract generic managed session

- Finding: the frontend/backend websocket contract test exercised current
  managed-agent session behavior through the historical
  `ManagedWindieAgentSession` compatibility module.
- Change: switched the contract test to require the generic
  `ManagedAgentSession` CommonJS module and call `createManagedAgentSession`.
  Compatibility module coverage remains in the dedicated private/package
  boundary tests.
- Validation: `npm.cmd --prefix frontend test -- --runInBand
  ../tests/frontend/FrontendBackendWebsocketContract.test.cjs`; `bin\windie
  docs list`; `git diff --check --
  tests/frontend/FrontendBackendWebsocketContract.test.cjs
  plans/2026-06-16-general-agent-ui-runtime-boundary-plan.md`; `rg -n
  "createManagedWindieAgentSession|ManagedWindieAgentSession"
  tests/frontend/FrontendBackendWebsocketContract.test.cjs`.
- Compatibility: no migration required. The compatibility module and aliases
  remain exported for existing callers.

### 2026-06-17 Mock backend E2E AgentClient path

- Finding: the mock-backend end-to-end SDK test covered normal agent runtime
  behavior but still instantiated the historical `WindieClient` compatibility
  alias and used Windie-prefixed local-runtime typing.
- Change: switched the test to import and instantiate `AgentClient`, use
  `AgentLocalRuntimeClient`, and describe the scenario as Agent SDK behavior.
- Validation: `npm.cmd --prefix frontend test -- --runInBand
  ../tests/frontend/WindieSdkMockBackendE2E.test.ts`; `bin\windie docs list`;
  `git diff --check -- tests/frontend/WindieSdkMockBackendE2E.test.ts
  plans/2026-06-16-general-agent-ui-runtime-boundary-plan.md`; `rg -n
  "WindieClient|WindieLocalRuntimeClient|Windie SDK|windie sdk"
  tests/frontend/WindieSdkMockBackendE2E.test.ts`.
- Compatibility: no migration required. Windie-prefixed aliases remain covered
  by package-boundary and compatibility tests.

### 2026-06-17 Main IPC AgentClient test mocks

- Finding: main-process replay and conversation-runtime registry tests verified
  the generic SDK agent path, but their local Jest helpers still named and
  mocked the historical `WindieClient` alias.
- Change: renamed the helpers and mock constructor to `AgentClient`, kept the
  compatibility export mapped to that same constructor inside the mocked SDK
  module, moved expectations to the canonical client constructor, and made the
  active-send overlap test wait deterministically for the first runtime send.
- Validation: `npm.cmd --prefix frontend test -- --runInBand
  ../tests/frontend/IpcMainReplayCommands.test.cjs
  ../tests/frontend/IpcMainConversationRuntimeRegistry.test.cjs`; `bin\windie
  docs list`; `git diff --check --
  tests/frontend/IpcMainReplayCommands.test.cjs
  tests/frontend/IpcMainConversationRuntimeRegistry.test.cjs
  plans/2026-06-16-general-agent-ui-runtime-boundary-plan.md`; `rg -n
  "installMockWindieClient|const WindieClient|sdk.WindieClient"
  tests/frontend/IpcMainReplayCommands.test.cjs
  tests/frontend/IpcMainConversationRuntimeRegistry.test.cjs`.
- Compatibility: no migration required. Compatibility alias behavior remains
  covered by dedicated SDK package-boundary tests.

### 2026-06-17 Conversation store API Agent test path

- Finding: the conversation store API test covered current SDK agent behavior,
  but instantiated the historical `WindieAgent` compatibility alias and
  described the suite with Windie-prefixed terminology.
- Change: switched the test helper to instantiate `Agent` and updated the
  header/suite copy to describe the Agent conversation store API.
- Validation: `npm.cmd --prefix frontend test -- --runInBand
  ../tests/frontend/WindieAgentConversationStoreApi.test.ts`; `bin\windie
  docs list`; `git diff --check --
  tests/frontend/WindieAgentConversationStoreApi.test.ts
  plans/2026-06-16-general-agent-ui-runtime-boundary-plan.md`; `rg -n
  "WindieAgent|windie agent"
  tests/frontend/WindieAgentConversationStoreApi.test.ts`.
- Compatibility: no migration required. `WindieAgent` alias coverage remains
  in the SDK package-boundary tests.

### 2026-06-17 Agent SDK current architecture docs wording

- Finding: current architecture/channel docs still described the reusable SDK
  boundary as the "Windie SDK runtime", "Windie SDK desktop agent", or an
  Electron main "SDK customer" instead of the generic Agent SDK host/runtime.
- Change: updated the SDK architecture, channel routing matrix, and IPC helper
  boundary reference to use Agent SDK runtime/host wording for current paths.
- Validation: `bin\windie docs list`; `rg -n "Windie SDK runtime|Windie
  SDK desktop agent|Electron main SDK customer|SDK customer"
  docs/development/agent_architecture_reference.md
  docs/channels/channel_routing_matrix.md
  docs/frontend/main/ipc_helper_module_split_and_runtime_boundary_reference.md`;
  `git diff --check -- docs/development/agent_architecture_reference.md
  docs/channels/channel_routing_matrix.md
  docs/frontend/main/ipc_helper_module_split_and_runtime_boundary_reference.md
  plans/2026-06-16-general-agent-ui-runtime-boundary-plan.md`.
- Compatibility: no migration required. This is docs-only terminology cleanup.

### 2026-06-17 Electron main local runtime launch plan alias

- Finding: Electron main still imported and called the desktop launch helper
  through `createDesktopAutoSidecarLaunchPlan` and logged process spawns as
  `[Main][SidecarBridge] spawned sidecar daemon`, even though the host-facing
  boundary is local-runtime launch option assembly.
- Change: added `createDesktopLocalRuntimeLaunchPlan` as the preferred main
  launch helper, switched IPC client wake-up wiring to the generic name, kept
  `createDesktopAutoSidecarLaunchPlan` as a compatibility alias, and changed
  the spawn log marker to `[Main][LocalRuntimeLaunch] spawned local runtime`.
- Validation: focused launch-helper and IPC boundary Jest coverage, docs
  listing, `git diff --check`, and source scans for intentional compatibility
  alias usage.
- Compatibility: no migration required. The SDK `autoSidecar` option shape,
  daemon script target, discovery file, and sidecar log routing are unchanged.

### 2026-06-17 Agent SDK conversation runtime test label

- Finding: the conversation runtime coverage file imported the new generic
  Agent runtime and stream event aliases, but its file header and top-level
  suite still described the reusable runtime as the Windie SDK conversation
  runtime.
- Change: updated the test header and top-level suite label to Agent SDK
  conversation runtime wording while leaving public Windie compatibility alias
  assertions intact.
- Validation: focused conversation runtime Jest coverage, docs listing,
  `git diff --check`, and source scans for the stale test header/suite text.
- Compatibility: no migration required. This is test-only terminology cleanup.

### 2026-06-17 Agent SDK focused test headers

- Finding: focused Agent SDK tests for model selection, managed backend
  sessions, file conversation storage, and context enrichment still had
  generated file headers that described them as "windie sdk" coverage.
- Change: updated those headers to Agent SDK wording without changing the
  intentional compatibility type assertions inside the tests.
- Validation: `npm.cmd --prefix frontend test -- --runInBand
  ../tests/frontend/WindieSdkModelSelection.test.ts
  ../tests/frontend/WindieSdkManagedBackendSession.test.ts
  ../tests/frontend/WindieSdkFileConversationStore.test.ts
  ../tests/frontend/WindieSdkContextEnrichment.test.ts`; `bin\windie docs
  list`; `git diff --check -- tests/frontend/WindieSdkModelSelection.test.ts
  tests/frontend/WindieSdkManagedBackendSession.test.ts
  tests/frontend/WindieSdkFileConversationStore.test.ts
  tests/frontend/WindieSdkContextEnrichment.test.ts
  plans/2026-06-16-general-agent-ui-runtime-boundary-plan.md`; `rg -n
  "Covers windie sdk|windie sdk .* behavior"
  tests/frontend/WindieSdkModelSelection.test.ts
  tests/frontend/WindieSdkManagedBackendSession.test.ts
  tests/frontend/WindieSdkFileConversationStore.test.ts
  tests/frontend/WindieSdkContextEnrichment.test.ts`.
- Compatibility: no migration required. Test behavior and compatibility
  assertions are unchanged.

### 2026-06-17 Agent SDK host wording in runtime docs

- Finding: current streaming, frontend architecture, Electron main, query
  relay, and renderer command-contract docs still described Electron main or
  non-renderer SDK users as "SDK customers".
- Change: updated those current-path docs to use Agent SDK host/caller wording
  while preserving actual `windie:*` channel names.
- Validation: `bin\windie docs list`; `rg -n "SDK customer|SDK
  customers|thin SDK customer" docs/concepts/streaming_and_events.md
  docs/architecture/frontend_architecture.md
  docs/frontend/main/electron_main_and_ipc.md
  docs/frontend/main/query_payload_and_relay_reference.md
  docs/frontend/renderer/desktop_agent_runtime_transport_command_contract_reference.md`;
  `git diff --check -- docs/concepts/streaming_and_events.md
  docs/architecture/frontend_architecture.md
  docs/frontend/main/electron_main_and_ipc.md
  docs/frontend/main/query_payload_and_relay_reference.md
  docs/frontend/renderer/desktop_agent_runtime_transport_command_contract_reference.md
  plans/2026-06-16-general-agent-ui-runtime-boundary-plan.md`.
- Compatibility: no migration required. This is docs-only terminology cleanup.
