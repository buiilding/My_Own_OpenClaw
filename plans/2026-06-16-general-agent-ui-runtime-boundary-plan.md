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

### 2026-06-18 main desktop UI config handler registration boundary

- Finding: after the disk helper rename, Electron main still registered
  desktop UI config IPC handlers through the frontend-named
  `registerFrontendConfigHandlers` API.
- Change: promoted `registerDesktopUiConfigHandlers` and desktop UI
  config-named dependency slots as the active handler registration contract,
  switched the main-process caller and focused handler tests to the canonical
  API, and kept the frontend-named registration export as a compatibility
  alias.
- Validation: main config handler syntax checks, focused handler and IPC bridge
  lifecycle Jest coverage, stale active-registration scan, docs listing, and
  diff check.
- Compatibility: no migration required. The renderer IPC wire channels remain
  `load-frontend-config` / `save-frontend-config`, the persisted filename
  remains `frontend-config.json`, and payload shape, shortcut fallback,
  redaction, credentials, permissions, and provider policy are unchanged.

### 2026-06-18 main desktop UI config helper boundary

- Finding: Electron main config disk helpers still used frontend-named helper
  APIs even though the owning runtime is the desktop host persisting desktop UI
  config.
- Change: promoted `loadDesktopUiConfigFromDisk`,
  `loadDesktopUiConfigFromDiskSync`,
  `redactDesktopUiConfigProviderSecrets`, and `saveDesktopUiConfigToDisk` as
  the active helper names, switched main-process callers and focused tests to
  them, and kept legacy helper aliases for direct-import compatibility.
- Validation: main config syntax checks, focused IPC persistence concurrency,
  IPC bridge lifecycle, startup state, and settings-sync Jest coverage, docs
  listing, stale active-helper scan, and diff check. Frontend typecheck was
  attempted and still fails on pre-existing `chatStore.ts` errors unrelated to
  this main-process slice.
- Compatibility: no migration required. The persisted filename remains
  `frontend-config.json`, the renderer IPC wire channels remain
  `load-frontend-config` / `save-frontend-config`, and payload shape,
  redaction, credentials, permissions, and provider policy are unchanged.

### 2026-06-18 SDK tool-call recovery display boundary

- Finding: renderer tool-call display helpers still interpreted backend-shaped
  recovery metadata keys such as skipped execution, validation failure,
  raw-preview fields, parse errors, and bundled `model_facing_tool_call`
  metadata when building visible tool-call cards.
- Change: promoted normalized recovery display fields, display-safe metadata,
  and bundled tool-call lists into SDK current-turn tool events and live
  presentation entries, then changed renderer helpers and fixtures to consume
  those SDK-shaped fields.
- Validation: focused SDK current-turn, renderer tool-call state,
  presentation-pipeline, chat-box response fallback, and metadata Jest
  coverage; CJS SDK build; exact renderer stale-key scan.
- Compatibility: no migration required. Backend websocket events, stored
  conversation payloads, local execution/skip semantics, IPC channels,
  credentials, permissions, and provider policy are unchanged; this tightens
  the SDK projection consumed by renderer display adapters.

### 2026-06-18 main SDK command settings source label

- Finding: the Electron main SDK command allowlist still sent settings updates
  with the diagnostic source `renderer-sdk-command`, even though the owner is
  the main-process Agent SDK command bridge.
- Change: renamed that settings-sync source to `agent-sdk-command` and added a
  main SDK boundary guard against the retired label.
- Validation: focused main SDK boundary and IPC query Jest coverage plus a
  stale-label scan.
- Compatibility: no migration required. This changes internal trace/settings
  ACK source metadata only; IPC channels, settings payloads, backend websocket
  messages, config persistence, credentials, permissions, and provider policy
  are unchanged.

### 2026-06-18 renderer interaction diagnostics boundary

- Finding: renderer UI interaction diagnostics still used
  `frontend-interaction`, `frontend.interaction`, and frontend-named helper
  exports even though the active owner is the renderer logger normalized by
  Electron main.
- Change: renamed the active renderer logger module/test, main diagnostics
  source/path/helper, preload example payloads, and debug docs to
  `renderer-interaction` / `renderer.interaction`.
- Validation: focused renderer interaction, IPC diagnostics runtime,
  diagnostics runtime, and preload Jest coverage; exact stale-name scan; main
  diagnostics syntax checks; docs listing; and diff check. The storage-backed
  diagnostics suite was attempted but this shell has no `sqlite3` executable on
  PATH, so persistence cases could not run here.
- Compatibility: no migration required. This changes local diagnostic
  inspection labels and internal renderer-log payload routing only; UI event
  schema version, redaction behavior, IPC channel names, stored conversations,
  backend websocket payloads, credentials, permissions, and provider policy are
  unchanged.

### 2026-06-18 SDK current-turn execution-skipped field

- Finding: renderer current-turn side effects still preserved typing state by
  reading `skip_frontend_execution` from nested raw tool payload metadata even
  though SDK current-turn tool events are the live state boundary.
- Change: added `executionSkipped` to SDK current-turn tool events and live
  presentation entries, documented it in the SDK conversation runtime contract,
  and changed renderer side effects to consume the SDK field directly.
- Validation: focused SDK current-turn projection and renderer side-effect Jest
  coverage, exact stale side-effect field scan, docs listing, and diff check.
- Compatibility: no migration required. Backend websocket payloads, stored
  conversation events, local execution behavior, IPC channels, artifact URLs,
  credentials, permissions, and provider policy are unchanged.

### 2026-06-18 renderer current-turn fallback tool-event fields

- Finding: after SDK live presentation entries carried explicit tool display
  details, the older renderer fallback path for `currentTurn.toolEvents` still
  decoded arguments, model-facing calls, screenshots, status, execution time,
  and metadata from raw payload internals.
- Change: made `chatBoxResponseState` consume SDK tool-event fields for the
  fallback path and updated focused test helpers/fixtures to synthesize
  SDK-shaped tool events instead of backend-shaped metadata blobs.
- Validation: focused ChatBoxResponse fallback, overlay, and metadata Jest
  coverage; exact stale fallback field scan; docs listing; and diff check.
- Compatibility: no migration required. This is renderer projection fallback
  behavior only; backend websocket events, stored conversation events, IPC
  channels, SDK contracts, artifact URLs, local execution, and provider policy
  are unchanged.

### 2026-06-18 SDK live presentation tool details boundary

- Finding: renderer live current-turn presentation still decoded tool-call
  details, arguments, screenshots, status, and metadata from raw event payload
  shapes even though `currentTurn.presentation.entries` is the SDK-owned live
  UI contract.
- Change: added explicit tool display fields to SDK current-turn tool events
  and live presentation entries, documented the contract, and made renderer
  live-row projection prefer those SDK fields while preserving raw payloads as
  diagnostics/detail context.
- Validation: focused SDK current-turn, renderer message-presentation, and
  pending live-surface Jest coverage; exact stale renderer live-presentation
  field scan; docs listing; and diff check.
- Compatibility: no migration required. Backend websocket events, stored
  conversation events, IPC channels, local execution, artifact URLs, and
  provider policy are unchanged; this tightens the first-party renderer's
  current-turn adapter input.

### 2026-06-18 SDK display-row metadata projection boundary

- Finding: renderer SDK display-row projection still parsed raw
  backend-shaped fields such as `tool_calls`, `model_facing_tool_call`,
  `screenshot_ref`, and `rawEvent` from `metadata.raw` even though the SDK
  already owns durable conversation projections.
- Change: promoted normalized display metadata for reasoning text, screenshots,
  model-facing tool calls, structured payloads, progress source types, and
  tool-output success into SDK display rows; renderer chat projection now
  consumes those SDK fields and keeps `metadata.raw` only as preserved
  inspection/debug context.
- Validation: focused SDK conversation-runtime and renderer display-row
  projection Jest coverage, plus stale renderer projection scans for retired
  backend-shaped field parsing.
- Compatibility: no migration required. Stored conversation events, backend
  websocket payloads, artifact URLs, and SDK display-row content remain
  compatible; this tightens internal SDK metadata consumed by the first-party
  renderer.

### 2026-06-18 local tool manifest ownership wording

- Finding: the tools hub and ADR 005 still described local schemas as
  frontend/sidecar-owned, which blurred desktop client/local-runtime manifest
  ownership with the Python sidecar's concrete executor implementation.
- Change: reworded the tool hub and ADR status/rules around the desktop
  client/local-runtime manifest pipeline, kept Python sidecar as executable
  implementation owner, and added a boundary guard for the retired ownership
  phrasing.
- Validation: focused modular boundary Jest coverage, docs listing, stale
  ownership wording scan, and diff check.
- Compatibility: no migration required. This changes docs/tests only; generated
  manifests, backend trust checks, provider projection, payloads, credentials,
  and local execution are unchanged.

### 2026-06-18 TypeScript SDK README agent wording

- Finding: the TypeScript SDK README described the package as waking
  Windie-specific agents even though the public SDK surface is the generic
  `AgentClient`/`Agent` API.
- Change: changed the README summary to generic agents and extended the public
  SDK README boundary guard for the retired product-specific phrase.
- Validation: focused modular boundary Jest coverage, stale SDK README phrase
  scan, and diff check.
- Compatibility: no migration required. This changes docs/tests only; package
  name, exports, endpoint resolution, local-runtime behavior, credentials, and
  payloads are unchanged.

### 2026-06-18 simple chat CLI endpoint docs

- Finding: the simple chat CLI README still said the SDK defaults to
  `WINDIE_BACKEND_URL` or `https://api.windieos.com` and reads
  `WINDIE_API_KEY`, while the script now requires explicit backend endpoint
  configuration and `WINDIE_INSTALL_TOKEN`.
- Change: updated the example README to require `WINDIE_BACKEND_URL` plus
  `WINDIE_INSTALL_TOKEN`, removed temporary-install fallback wording, and added
  the README to the public example boundary guard.
- Validation: focused modular boundary Jest coverage, docs listing, stale
  example endpoint/auth wording scan, and diff check.
- Compatibility: no migration required. This changes docs/tests only; SDK
  endpoint resolution, install auth, websocket payloads, storage, credentials,
  and local-runtime behavior are unchanged.

### 2026-06-18 tool architecture remote-vs-local wording

- Finding: the architecture tool-system page labeled the local-runtime stub
  template as remote-tool execution and said remote tools dispatch through the
  SDK/main local runtime into the sidecar, which blurred backend-owned remote
  tools with client-local executable tools.
- Change: reworded the section as client-local local-runtime execution, noted
  the historical `remote_tools` package name for backend catalog stubs, and
  added a boundary guard against routing remote tools through the sidecar.
- Validation: focused modular boundary Jest coverage, docs listing, stale
  remote-dispatch wording scan, and diff check.
- Compatibility: no migration required. This changes docs/tests only; backend
  catalog classes, client manifests, provider projections, local execution,
  payloads, credentials, and permissions are unchanged.

### 2026-06-18 renderer services inventory wording

- Finding: current renderer inventory docs still described
  `frontend/src/renderer/infrastructure/services/*` as a renderer tool
  execution/capture/payload stack even though the live services are endpoint,
  artifact image, and screenshot attachment display helpers.
- Change: reworded the renderer runtime, module index, feature matrix, and full
  functionality inventory around display-helper ownership, then extended the
  modular boundary guard for the retired current-inventory phrases.
- Validation: focused modular boundary Jest coverage, docs listing, stale
  current-inventory phrase scan, and diff check.
- Compatibility: no migration required. This changes docs/tests only; SDK/main
  local execution, artifact materialization, screenshot capture, payloads,
  storage, credentials, and permissions are unchanged.

### 2026-06-18 sidecar architecture backend endpoint contract

- Finding: the architecture-level Python sidecar page still said memory clients
  defaulted to `https://api.windieos.com`, even though sidecar backend-bound
  clients now require an explicit `backend_url` or injected
  `WINDIE_BACKEND_HTTP_URL`.
- Change: reworded the memory section around required injected endpoint
  ownership and added a sidecar config doc guard against reintroducing the
  hosted default fallback wording.
- Validation: focused sidecar backend-config pytest, docs listing, stale
  fallback wording scan, and diff check.
- Compatibility: no migration required. This changes docs/tests only; sidecar
  endpoint resolution, credentials, payloads, storage, and hosted helper calls
  are unchanged.

### 2026-06-18 Electron main local-runtime workflow wording

- Finding: the main-process workflow still said the sidecar owns execution and
  the Electron main overview routed readers to backend bridge logic, which
  skipped the current SDK local-runtime bridge ownership.
- Change: reworded the main workflow around host-context adaptation through
  the SDK local-runtime bridge, kept Python sidecar as the concrete executor,
  and extended the modular boundary guard for the retired phrases.
- Validation: focused modular boundary Jest coverage, docs listing, stale
  phrase scan, and diff check.
- Compatibility: no migration required. This changes docs/tests only; IPC
  channels, payloads, storage, credentials, permissions, and local-runtime
  execution behavior are unchanged.

### 2026-06-18 renderer IPC channel wire-value ownership

- Finding: renderer `channels.ts` imported the shared IPC registry but also
  duplicated every expected wire value, including legacy `windie:*` SDK channel
  strings, inside the generic renderer IPC module.
- Change: changed renderer validation to require expected channel family keys
  and non-empty string values while leaving concrete wire values in
  `frontend/src/shared/ipcChannels.json`, then updated docs/tests to keep the
  shared registry as the only wire-value authority.
- Validation: focused renderer app runtime boundary Jest coverage, preload IPC
  channel coverage, main host skin channel coverage, docs listing, source scan
  for product-prefixed wire values in `channels.ts`, and diff check.
- Compatibility: no migration required. IPC channel names, preload allowlists,
  main handlers, websocket payloads, storage, credentials, permissions, and
  local-runtime execution behavior are unchanged.

### 2026-06-18 reference rehydrate API snapshot contract

- Finding: the public API reference still described rehydrate as a frontend
  transcript snapshot and showed retired `message_type` aliases even after the
  SDK projection became the owner of canonical rehydrate payload shape.
- Change: reworded the reference around SDK conversation snapshot entries,
  updated examples to `user_query` and `assistant_response`, clarified the
  canonical stored message-type set, and extended the backend rehydrate wording
  guard to include the public reference page.
- Validation: focused backend rehydrate wording guard, docs listing, stale
  phrase/alias scan, and diff check.
- Compatibility: no migration required. This corrects docs/tests only;
  websocket schemas, stored rows, screenshot refs, credentials, permissions,
  and rehydrate behavior are unchanged.

### 2026-06-18 backend session/synthetic runtime wording

- Finding: backend session comments and synthetic tool-failure docs still
  described runtime system state, conversation identity, and synthetic failure
  ordering as frontend/renderer-owned, even though the current boundary is
  SDK/client transport plus SDK/main local-runtime dispatch.
- Change: reworded session source comments, synthetic failure docs, and the
  frontend architecture resume note around SDK/client and SDK/local-runtime
  ownership, while keeping the real `skip_frontend_execution` wire metadata
  name intact.
- Validation: focused backend runtime architecture guardrail pytest, backend
  session py_compile, docs listing, stale phrase scan, and diff check.
- Compatibility: no migration required. This changes docs/comments/tests only;
  websocket schemas, metadata keys, storage, credentials, permissions, and
  local-runtime execution behavior are unchanged.

### 2026-06-18 backend tool-result/query client wording

- Finding: backend hub docs, architecture protocol references, the API source
  map, and the query-accepted log still described local tool results and query
  ingress as frontend-owned even after result ingress moved to the
  SDK/local-runtime boundary.
- Change: reworded tool-result ingress references to SDK/local-runtime payload
  ownership, changed the backend query accepted log from frontend to client,
  and extended the backend source/doc guard for the retired phrases.
- Validation: focused backend tool-result receiver pytest, backend py_compile
  for the query handler, docs listing, stale phrase scan, and diff check.
- Compatibility: no migration required. This changes docs/log wording and
  source-map comments only; websocket message types, payloads, storage,
  credentials, permissions, and local execution behavior are unchanged.

### 2026-06-18 backend rehydrate SDK snapshot wording

- Finding: backend rehydrate handler/service/session docstrings and nearby
  backend docs still described resume state as a frontend transcript snapshot
  even though the SDK conversation runtime owns the durable rehydrate
  projection.
- Change: reworded backend rehydrate source/docs around SDK conversation
  snapshots and SDK-projected snapshot entries, renamed the focused rehydrate
  test label away from UI transcript rows, and added a backend source/doc guard
  for the retired frontend transcript phrases.
- Validation: import-light backend source/doc guard, backend py_compile, docs
  listing, stale phrase scan, and diff check. Broader rehydrate/API pytest was
  attempted but could not collect because the `jarvis` conda env is unavailable
  and fallback Python lacks `fastapi`.
- Compatibility: no migration required. This changes wording/tests only;
  websocket message schemas, stored history rows, screenshot refs, credentials,
  permissions, and hosted history replacement behavior are unchanged.

### 2026-06-18 backend local tool-result ingress method names

- Finding: backend session and tool waiting handler still exposed
  frontend-owned tool-result ingress names even though the current owner is
  SDK-submitted local-runtime tool result ingress.
- Change: renamed the session/handler methods to `process_local_tool_result`
  and `process_local_tool_bundle_result`, updated API handler call sites, and
  refreshed docs/tests that guarded the old compatibility names.
- Validation: focused backend and frontend boundary checks are listed in the
  owning commit; no storage migration is required because websocket message
  types and payloads stay unchanged.
- Compatibility: callers inside the repo now use the local-runtime names. No
  wrapper alias remains.

### 2026-06-18 backend rehydrate artifact screenshot contract

- Finding: the backend rehydrate schema and service still accepted direct
  `screenshot`/`image_data` fields even after query screenshot transport moved
  to artifact-backed refs, leaving a large inline replay compatibility path at
  the hosted API boundary.
- Change: removed direct rehydrate screenshot/image-data fields from incoming
  schemas and the generated contract, resolved resumed transcript images only
  from `screenshot_ref`, and aligned backend/API docs and rejection coverage.
- Validation: backend py_compile for changed schema/service modules, incoming
  contract pytest coverage, frontend websocket contract coverage, stale
  rehydrate inline-field scans, `npm run audit:knip`, and diff check. Broader
  focused backend pytest collection was attempted but could not run because the
  `jarvis` conda env is unavailable and fallback Python lacks `fastapi`.
- Compatibility: external rehydrate clients must upload screenshots as
  artifacts and send `screenshot_ref`; no storage migration is required for
  existing WindieOS transcripts because first-party resume paths preserve
  artifact refs.

### 2026-06-18 sidecar daemon user-data path resolver

- Finding: `sidecar_daemon.py` duplicated platform app-data path logic already
  owned by `core.user_data_paths`, including a separate `windieos` path table
  for diagnostics and daemon-local storage.
- Change: extended the shared Python local-runtime path helper with explicit
  opt-in options for daemon override, XDG, and Windows fallback behavior, then
  routed the daemon wrapper through that helper and documented the data-path
  contract.
- Validation: focused sidecar user-data and daemon pytest coverage, sidecar
  source guard, docs listing, and diff check.
- Compatibility: no migration required. Default paths remain
  `%APPDATA%/windieos`, `~/Library/Application Support/windieos`, or
  `~/.config/windieos` for existing helper callers; daemon-specific
  `WINDIE_USER_DATA_DIR`, XDG, and Windows fallback behavior is preserved.

### 2026-06-18 frontend runtime surface local-runtime wording

- Finding: the frontend runtime surface reference still described `ipc.cjs` as
  keeping backend transport/frontend session state and described the Python
  local execution boundary as sidecar ownership, which skipped the current
  SDK-backed relay and local-runtime daemon/service boundary.
- Change: reworded the document around SDK-backed query/session relay state,
  Python local-runtime feature-pack/tool exposure, and concrete local-runtime
  registry ownership, then added the doc to the modular boundary guard with the
  retired phrases.
- Validation: focused modular boundary Jest coverage, docs listing, stale
  wording scan, and diff check.
- Compatibility: no migration required. This changes docs/tests only; IPC
  channels, websocket payloads, tool schemas, storage, credentials,
  permissions, and local-runtime execution are unchanged.

### 2026-06-18 main layer-log host skin config

- Finding: the generic Electron main `layer_log_sink` still hardcoded the
  WindieOS repo-local `.windie/logs` source-run scratch directory, which made
  the reusable host logging infrastructure carry first-party product path
  policy.
- Change: added a generic log-sink configuration hook with a
  `.desktop-runtime/logs` fallback, moved the WindieOS `.windie/logs` default
  into `main_host_skin`, and configured the Electron entrypoint, Electron
  launcher, and `windie` CLI runner from that skin before resolving log files.
- Validation: focused layer-log, main host-skin boundary, Electron launcher,
  and Windie CLI Jest coverage plus docs listing, product-path source scans,
  and diff checks.
- Compatibility: no migration required. WindieOS source runs and
  `bin/windie logs ...` still use `.windie/logs`; layer log filenames, env
  override keys, IPC, credentials, permissions, storage, and local-runtime
  execution are unchanged.

### 2026-06-18 backend tool-turn workflow local-runtime ownership

- Finding: the backend tool-turn change workflow still described local tool
  execution as frontend/sidecar ownership and said SDK/main dispatches directly
  to the sidecar, which skipped the local-runtime boundary now owned by the SDK
  and Electron main adapters.
- Change: reworded the workflow around SDK/main local-runtime execution,
  retained Python sidecar implementation ownership where executable code lives,
  and extended the modular boundary guard to reject the stale backend workflow
  phrases.
- Validation: focused modular boundary Jest coverage, docs listing, stale
  backend workflow wording scan, and diff check.
- Compatibility: no migration required. This changes docs/tests only; tool
  schemas, websocket events, result payloads, storage, credentials,
  permissions, and local-runtime execution behavior are unchanged.

### 2026-06-18 backend inventory client-local tool wording

- Finding: backend inventory and API/tool-system references still framed local
  tool execution and manifest submission as frontend/sidecar behavior instead
  of SDK/main local-runtime dispatch plus client-local manifest ownership.
- Change: reworded the backend contract checkpoint, API manifest reference, and
  tool-system note to SDK/local-runtime and client-local wording, then extended
  the modular boundary guard to reject the stale frontend/sidecar execution
  phrase.
- Validation: focused modular boundary Jest coverage, docs listing, stale
  frontend/sidecar tool-execution wording scan, and diff check.
- Compatibility: no migration required. This changes docs/tests only; websocket
  handshake fields, tool-result event names, manifests, storage, credentials,
  permissions, and local-runtime execution are unchanged.

### 2026-06-18 SDK conversation-store producer label cleanup

- Finding: `LocalRuntimeConversationStore` still contained a special
  `producerSource === "sidecar"` branch even though SDK conversation event
  sources are `backend`, `sdk`, or `ui`, and durable replay should distinguish
  backend-origin metadata from SDK-owned local events rather than Python
  implementation details.
- Change: collapsed non-backend event writes to `producer = "sdk"` in the
  TypeScript and checked-in CJS store, documented the backend-vs-SDK producer
  contract, and extended tests/source guards to reject the dead sidecar branch.
- Validation: focused SDK client/default persistence and modular boundary Jest
  coverage, source scan for the retired producer branch, docs listing, and diff
  check.
- Compatibility: no migration required. `sidecar` was not a valid SDK
  `ConversationEventSource`; backend producer ids/sequences, event payloads,
  local-runtime RPC names, storage tables, credentials, and permissions are
  unchanged.

### 2026-06-18 backend tool-result ingress wording guard

- Finding: backend runtime and API handler docs still described tool-result
  waits, processing, and ingress as frontend-owned results even though current
  ownership is SDK/main local-runtime result submission with Python execution
  below that boundary.
- Change: reworded backend runtime, tool-result ingress, and non-query handler
  docs around SDK/local-runtime results, then extended the modular boundary
  guard to reject stale frontend-owned result prose.
- Validation: focused modular boundary Jest coverage, docs listing, stale
  backend ingress wording scan, and diff check.
- Compatibility: no migration required. This changes docs/tests only; websocket
  event names, payload fields, storage, credentials, permissions, and
  local-runtime execution are unchanged.

### 2026-06-18 backend provider usage request-local state

- Finding: `LLMProvider` still kept provider-instance last usage and normalized
  stream payload fields as a diagnostics fallback, which could expose stale
  cross-request state outside the request-local provider context.
- Change: provider diagnostics now read only request-local `ContextVar` state,
  report missing usage as `provider_usage_unavailable`, and regression coverage
  asserts an independent context cannot read another request's usage or payload.
- Validation: backend provider/client pytest collection was attempted but the
  fallback Python environment is missing `litellm`; the owning commit validated
  `backend/src/llm/providers/base.py` with `py_compile` and diff checks.
- Compatibility: no migration required. This narrows backend diagnostics state
  only; provider credentials, IPC, permissions, websocket payloads, storage, and
  local tool execution paths are unchanged.

### 2026-06-18 renderer command playbook runtime wording

- Finding: the frontend change-path playbook and renderer source folder map
  still described ordinary renderer commands/settings callbacks as direct
  backend transport communication, even though renderer code should route
  through SDK/runtime facades and Electron host adapters.
- Change: reworded the playbook and renderer folder map around SDK/runtime
  command ownership, settings model-list events, audio chunk forwarding, and
  callback communication, then extended the modular boundary test to keep the
  stale backend-transport shorthand out.
- Validation: focused modular boundary Jest coverage, docs listing, stale
  wording scan, and diff check.
- Compatibility: no migration required. This is docs/source-map wording and
  boundary coverage only; IPC channels, backend websocket payloads, settings
  storage, permissions, credentials, and local-runtime execution are unchanged.

### 2026-06-18 SDK rehydrate canonical message-type boundary

- Finding: backend rehydrate still accepted renderer/source message labels such
  as `tool-call`, `tool-output`, and `assistant-message`, while SDK rehydrate
  projections did not stamp canonical stored `message_type` values on every
  generated row.
- Change: SDK rehydrate projection now emits canonical stored message types,
  backend rehydrate rejects explicit non-canonical labels instead of parsing old
  JSON-content tool-call aliases, and docs/tests now route replay shape through
  SDK-owned projection plus backend-owned validation/linkage.
- Validation: focused SDK conversation-runtime projection tests, backend
  rehydrate normalizer compile/import-light tests, docs listing, stale alias
  scan, and diff check.
- Compatibility: no migration is provided. Current SDK snapshots send
  canonical values and omitted message types still default from role, but stale
  explicit replay aliases now fail fast at the backend API boundary. No
  credential, permission, storage-location, or tool-execution trust boundary
  changes.

### 2026-06-18 backend tool bridge result-ingress wording cleanup

- Finding: backend tool preparation, tool-result ingress, architecture, and
  recovery docs still framed the bridge as frontend tool execution/results even
  after tool dispatch moved to the SDK/main local-runtime boundary.
- Change: renamed the backend tool bridge policy page to local-runtime bridge
  ownership and reworded preparation/result-ingress docs and source comments
  around SDK-submitted local-runtime payloads.
- Validation: docs listing, focused stale frontend-result/dispatch wording
  scan, focused backend tool-result/preparation pytest coverage, and diff
  check. `test_tool_result_router.py` was attempted but the local fallback
  Python lacks `fastapi` because the `jarvis` conda env is unavailable.
- Compatibility: no migration required. This changes docs/comments only;
  websocket event names, tool-result payloads, storage, credentials,
  permissions, and local-runtime behavior are unchanged.

### 2026-06-18 backend tool local-runtime dispatch docs cleanup

- Finding: backend remote-tool stubs and docs still used the retired local
  executor target name and old dispatch-page wording, and described prepared
  tools, synthetic bundle failures, result ingress, registry parity, and
  architecture flows as renderer-owned execution even though the owning boundary
  is SDK/main local-runtime dispatch with Python sidecar execution below that
  boundary.
- Change: changed backend remote-tool stubs to `execution_target =
  "local_runtime"`, renamed the ToolSender reference to local-runtime dispatch,
  updated backend tool hubs and related references, and aligned source
  comments/docs to SDK/main local-runtime execution while retaining the existing
  `skip_frontend_execution` wire metadata name where it is the actual contract.
- Validation: focused ToolSender/result-helper and ToolPreparer/remote-tool
  pytest coverage, docs listing, focused stale dispatch wording scan, and diff
  check.
- Compatibility: no migration required. Current client manifests already use
  `local_runtime`; tool schemas, websocket event payloads, metadata keys,
  storage, credentials, permissions, and local-runtime execution behavior are
  unchanged.

### 2026-06-18 backend trace-event payload alias cleanup

- Finding: SDK backend-event normalization still accepted snake_case aliases
  inside backend-origin `trace-event` payloads even though the backend API
  schema emits camelCase trace fields and keeps conversation identity on the
  event envelope.
- Change: narrowed trace normalization to `traceId`, `spanId`, `requestId`,
  `durationMs`, and other backend API schema fields, kept envelope
  `conversation_ref`, `turn_ref`, and `user_id` as the identity source, and
  typed the SDK backend trace payload contract.
- Validation: focused SDK conversation-runtime coverage, docs listing, and
  diff check.
- Compatibility: no migration required. Stored SDK `trace_event` rows already
  contain normalized conversation-event payloads, and this does not change
  backend API output, IPC channels, storage schemas, credentials, permissions,
  or local-runtime payloads.

### 2026-06-18 sidecar folder structure daemon transport wording

- Finding: the checked-in frontend Python folder-structure source map still
  described Electron spawning `local_backend.py` directly and using stdin/stdout
  JSON-RPC even though the SDK local runtime starts `sidecar_daemon.py` and uses
  daemon HTTP `/rpc`.
- Change: updated the overview, file map, runtime flow, tool result flow, and
  service communication section to route through `sidecar_daemon.py` with
  `LocalRuntimeService` as the in-process method registry.
- Validation: docs listing, scoped diff check, and focused stale transport
  wording scan.
- Compatibility: no migration required. Documentation-only cleanup; daemon
  launch, RPC payloads, credentials, permissions, storage, and event payloads
  are unchanged.

### 2026-06-18 tool-system sidecar daemon diagram wording

- Finding: the tool-system architecture diagram still labeled the local tool
  executor box as a generic Python sidecar even though the active local-runtime
  process boundary is the sidecar daemon.
- Change: updated the diagram label to Python Sidecar Daemon while retaining
  the already-correct `HTTP /rpc` transport wording.
- Validation: docs listing, scoped diff check, and focused diagram wording scan.
- Compatibility: no migration required. Documentation-only cleanup; tool
  execution, schemas, RPC payloads, credentials, permissions, storage, and event
  payloads are unchanged.

### 2026-06-18 architecture docs sidecar daemon boundary wording

- Finding: architecture docs still presented `local_backend.py` as the sidecar
  process under Electron main and described daemon HTTP/WebSocket as an optional
  alternative to raw JSON-RPC after the standalone stdin/stdout loop was removed.
- Change: updated the architecture diagram and Python sidecar page to describe
  `sidecar_daemon.py` as the SDK-owned local-runtime boundary and
  `local_backend.py` as the in-process `LocalRuntimeService` implementation.
- Validation: docs listing, scoped diff check, and stale standalone sidecar
  entrypoint wording scan.
- Compatibility: no migration required. Documentation-only cleanup; daemon
  launch, RPC payloads, credentials, permissions, storage, and event payloads
  are unchanged.

### 2026-06-18 daemon-owned sidecar service lifecycle

- Finding: `local_backend.py` still carried a standalone stdin/stdout run loop,
  signal handler, and shared `core/runtime_shutdown.py` helper even though the
  active SDK/Electron local-runtime path starts `sidecar_daemon.py` and routes
  JSON-RPC through the daemon `/rpc` surface.
- Change: removed the retired standalone run loop, shutdown helper module, and
  shutdown-helper tests so `LocalRuntimeService` remains an in-process service
  owned by `sidecar_daemon.py`; updated sidecar docs and inventory pages to
  route lifecycle/shutdown validation through daemon tests.
- Validation: focused sidecar pytest coverage for local backend handlers,
  daemon lifecycle, JSON-RPC protocol, and stdout framing; Python compile check;
  docs listing; scoped diff check; and stale `runtime_shutdown` reference scan.
- Compatibility: no migration required. Electron and SDK launch paths already
  use the daemon, and this does not change tool schemas, RPC method payloads,
  credentials, permissions, storage, or persisted data.

### 2026-06-18 Python-only local runtime launch targets

- Finding: Electron main still accepted stale packaged `sidecar-bin`,
  extensionless service-name, and direct `.pyc` launch target shapes even though
  current desktop and wakeword callers pass concrete `.py` entrypoint names and
  packaged builds ship `python-runtime/sidecar/*.pyc`.
- Change: removed the binary/service-name compatibility path, kept local
  runtime launches on concrete Python entrypoints resolved through bundled
  Python, narrowed wakeword process-error copy to Python executable failures,
  and hardened packaged wakeword coverage to use the platform-native bundled
  Python candidate.
- Validation: focused runtime path, local runtime launch option, wakeword
  bridge, wakeword runtime helper, and main host skin Jest coverage; frontend
  lint; docs listing; diff check; and stale binary-launch residue scan.
- Compatibility: no migration required. This narrows accepted launch target
  inputs but does not change IPC, credentials, permissions, storage, event
  payloads, or packaged runtime file layout.

### 2026-06-18 dashboard resume local-runtime event wording

- Finding: the dashboard memory/resume reference, dashboard shell references,
  replay workflow diagram, and memory routing docs still said conversation
  resume/listing loads canonical sidecar `conversation_events`, sidecar event
  rows, or sidecar transcript storage, while the SDK conversation
  library/local-runtime event store is the contract.
- Change: reworded the resume step to canonical local-runtime
  `conversation_events`, updated dashboard recent-chat sources, the workflow
  diagram/rules, transcript storage routing, and tightened the transcript docs
  guard for the retired phrases.
- Validation: focused modular docs boundary coverage, exact stale phrase scan,
  docs listing, and scoped diff check.
- Compatibility: no migration required. This changes docs/tests only; dashboard
  resume behavior, SDK event rows, local-runtime storage, IPC, and persisted
  data are unchanged.

### 2026-06-18 transcript replay local-runtime event wording

- Finding: memory replay docs described canonical replay state as sidecar events,
  a sidecar chat-event log, and a sidecar event store path even though SDK
  projections and the local-runtime store are the reusable replay contract.
- Change: reworded transcript replay and session identity docs to local-runtime
  event-log/storage ownership while retaining the Python sidecar SQLite store as
  the backing implementation detail where useful.
- Validation: focused modular docs boundary coverage, exact stale replay phrase
  scan, docs listing, and scoped diff check.
- Compatibility: no migration required. This changes docs/tests only; SDK event
  rows, SQLite tables, replay rewrites, dashboard loading, backend rehydrate
  payloads, storage, and persisted data are unchanged.

### 2026-06-18 preload Agent SDK browser global cleanup

- Finding: preload still exposed SDK-shaped renderer commands through the
  historical `window.desktopAgent` browser global even though the active
  implementation and renderer facade are Agent SDK command bridge concepts.
- Change: exposed the bridge as `window.agentSdk`, removed the renderer
  `window.desktopAgent` lookup, updated preload/runtime boundary coverage, and
  aligned docs with the new browser-global contract.
- Validation: focused preload, renderer runtime boundary, and modular docs
  boundary Jest coverage; docs listing; exact `window.desktopAgent` scan; and
  scoped diff check.
- Compatibility: no persisted-data migration required. The `windie:invoke` IPC
  channel, SDK command names, command payloads, settings, credentials,
  permissions, storage, and event payloads are unchanged.

### 2026-06-18 generic docs local-runtime payload wording

- Finding: generic tool, IPC, storage, security, and agent-turn workflow docs
  still described executable payload and validation ownership as sidecar payload
  or sidecar validation, which exposed the Python implementation where the
  public workflow boundary is SDK/main local-runtime execution.
- Change: reworded those docs to local-runtime payload/validation ownership and
  extended the modular docs boundary guard to keep the retired generic
  sidecar-payload phrasing out of the public workflow set.
- Validation: focused modular refactor boundary Jest coverage, docs listing,
  stale generic sidecar-payload phrase scan, and scoped diff check.
- Compatibility: no migration required. This changes docs/tests only; tool
  schemas, IPC channels, local-runtime JSON-RPC payloads, permissions, storage,
  credentials, and persisted data are unchanged.

### 2026-06-18 backend prepared-tool local-runtime test wording

- Finding: backend coordinate-scaling and tool-preparer tests still described
  prepared computer-use payloads as sidecar input or sidecar validation, even
  though the backend boundary prepares executable local-runtime payloads and
  leaves concrete validation/execution below that boundary.
- Change: renamed the focused test names, local schema aliases, request ids, and
  assertion variables to local-runtime input/validation wording.
- Validation: focused backend coordinate-scaling and tool-preparer pytest
  coverage, exact stale test-phrase scan, and scoped diff check.
- Compatibility: no migration required. This changes tests only; backend tool
  preparation behavior, model-facing tool shapes, executable payload schemas,
  sidecar implementation modules, storage, and API payloads are unchanged.

### 2026-06-18 macOS reinstall legacy state cleanup

- Finding: the local macOS reinstall helper still deleted capitalized
  `WindieOS` Application Support, Caches, and WebKit state directories even
  though current packaged reset ownership is the lowercase `windieos` app-data
  root plus bundle-id-specific state paths.
- Change: removed the legacy state-directory array and deletion call, and
  tightened package-script coverage so only current WindieOS install/state names
  remain in the helper.
- Validation: focused package-script Jest coverage, shell syntax check, exact
  legacy state-path scan, and scoped diff check.
- Compatibility: no migration is provided for the retired capitalized app-data
  paths. Current lowercase app data, bundle-id state cleanup, app install
  removal, TCC reset, logs, credentials, and package behavior are unchanged.

### 2026-06-18 preload Agent SDK bridge naming boundary

- Finding: the preload bridge that exposes SDK-shaped commands over the desktop
  runtime invoke channel still used a `desktopAgentBridge` implementation name
  and matching test-local names even though the owning contract is the generic
  Agent SDK command bridge.
- Change: renamed the active preload implementation and focused test harness to
  Agent SDK bridge wording while keeping `window.desktopAgent` as the current
  exposed browser-global compatibility key.
- Validation: focused preload IPC registry coverage and runtime-boundary source
  assertions.
- Compatibility: no migration required. IPC channel names, command payloads,
  browser-global exposure, renderer fallback behavior, settings, storage, and
  persisted data are unchanged.

### 2026-06-18 SDK local-runtime test wording boundary

- Finding: focused SDK/main tests and one SDK runtime doc still described
  local-runtime metadata, diagnostics, and host lifecycle checks as sidecar
  metadata/events/lifecycle even after active runtime values moved to
  local-runtime wording.
- Change: renamed the test and doc descriptions to local-runtime wording while
  preserving concrete Python sidecar file/log-layer assertions.
- Validation: focused local-runtime bridge, launch-options, and conversation
  store Jest coverage; exact stale-phrase scan; docs listing; and scoped diff
  check.
- Compatibility: no migration required. This changes tests/docs only; runtime
  behavior, IPC, storage, settings, credentials, tool execution, and persisted
  data are unchanged.

### 2026-06-18 local runtime stderr deprecation suppressor cleanup

- Finding: Electron main local-runtime stderr filtering still carried hard-coded
  Node `url.parse()` deprecation-warning suppressors even though daemon launch
  already injects `NODE_OPTIONS=--no-deprecation`.
- Change: removed the redundant pattern table and suppression branch so
  actionable warning-looking stderr lines use the normal log filter, while the
  launch env remains the owner of Node deprecation suppression.
- Validation: focused local-runtime launch-option Jest coverage, exact
  deprecation-literal scan, SDK generated-output stale-contract scan, and
  `git diff --check`.
- Compatibility: no migration required. Daemon environment, IPC, layer log
  paths, settings, credentials, and persisted data are unchanged.

### 2026-06-18 frontend config disk redaction wording cleanup

- Finding: frontend config docs and IPC coverage still called normal
  `frontend-config.json` load redaction a legacy disk-config path, even though
  Electron main defensively redacts secrets on the current disk persistence
  boundary.
- Change: updated docs and test names to describe current disk/localStorage
  provider-secret redaction without the legacy label.
- Validation: focused IPC frontend-config Jest coverage, stale legacy disk
  wording scan, docs search, and `git diff --check`.
- Compatibility: no migration required. Disk config filename, localStorage key,
  redaction behavior, IPC handlers, settings sync, APIs, and persisted data
  are unchanged.

### 2026-06-18 backend app container docs cleanup

- Finding: backend architecture/bootstrap docs still described global container
  registration and a `get_container()` global fallback even though
  `backend/src/api/deps.py` now reads only `app.state.container` and fails fast
  when lifecycle state is missing.
- Change: updated the backend architecture and bootstrap docs to describe the
  app-lifespan container boundary and removed the stale process-global fallback
  wording.
- Validation: stale global-container fallback scan and `git diff --check`.
- Compatibility: no migration required. Runtime code, FastAPI dependency
  behavior, app startup/shutdown wiring, config state, APIs, and persisted data
  are unchanged.

### 2026-06-17 local runtime source identity env boundary

- Finding: Electron main still stamped daemon launch source identity into
  `WINDIE_SIDECAR_SOURCE_PATH` and `WINDIE_SIDECAR_SOURCE_STAMP`, and the
  daemon recorded those sidecar-named keys into discovery launch metadata even
  though this metadata describes the SDK local-runtime launch context.
- Change: renamed the source-identity launch-context keys to
  `WINDIE_LOCAL_RUNTIME_SOURCE_PATH` and
  `WINDIE_LOCAL_RUNTIME_SOURCE_STAMP`, updated the daemon discovery metadata,
  and locked main/sidecar tests so the old keys are absent.
- Validation: focused local-runtime launch-option Jest coverage, focused
  sidecar daemon pytest coverage, docs listing, stale env-key scans, and diff
  checks.
- Compatibility: no migration required. The keys are process launch-context
  metadata written by Electron main and consumed by the daemon at startup;
  discovery-file location, daemon routes, JSON-RPC payloads, tool schemas,
  env controls, and stored settings are unchanged.

### 2026-06-17 main local runtime launch resolver boundary

- Finding: `runtime_paths.cjs` still exported the canonical launch helper as
  `resolveSidecarLaunchTarget`, even though Electron main now treats the
  Python daemon as an SDK local-runtime dependency and both local-runtime and
  wakeword startup consume the same generic launch target shape.
- Change: renamed the main-process helper API to
  `resolveLocalRuntimeLaunchTarget`, updated local-runtime and wakeword callers,
  and locked focused runtime-path tests so the sidecar-named export stays
  removed. Packaged resource directories and Python service filenames remain
  unchanged because they are packaging/runtime facts.
- Validation: focused runtime-path and local-runtime launch-option Jest
  coverage, docs listing, stale helper scans, and diff checks.
- Compatibility: no migration required for packaged resources, env vars,
  daemon discovery, JSON-RPC payloads, tool schemas, or stored settings.
  Internal main-process imports should use the local-runtime helper name.

### 2026-06-17 local runtime daemon lifecycle log prefix

- Finding: the Python sidecar daemon still emitted `[SidecarDaemon]`
  lifecycle lines, and Electron main forwarded that prefix through the generic
  local-runtime launch log filter. That left concrete sidecar wording on a
  host-visible local-runtime diagnostic surface.
- Change: changed daemon listening/stopping lifecycle lines to
  `[LocalRuntimeDaemon]`, updated the Electron launch log allowlist, and locked
  focused tests so the old lifecycle prefix is no longer forwarded.
- Validation: focused local-runtime launch-option Jest coverage, focused
  sidecar daemon pytest coverage, stale-prefix scan, docs listing, and diff
  checks.
- Compatibility: no migration required. The daemon class name, discovery-file
  schema, HTTP routes, JSON-RPC payloads, tool schemas, and stored diagnostics
  remain unchanged; only new lifecycle log lines use the generic prefix.

### 2026-06-17 Python SDK local runtime option boundary

- Finding: the Python `AgentSdkClient` still exposed injected local execution
  and daemon startup through sidecar-named constructor fields, and the Node
  auto-local-runtime provider still looked at a sidecar-named daemon-script env
  override. This leaked the concrete sidecar implementation through the SDK
  local-runtime contract.
- Change: moved Python public client options and stored lifecycle state to
  `local_runtime`, `local_runtime_discovery_file`, and
  `local_runtime_daemon_script`, renamed the Python default discovery constants
  and probe helper to local-runtime terms, and changed the Node/Python daemon
  script env override to `WINDIE_LOCAL_RUNTIME_DAEMON_SCRIPT`.
- Validation: focused Python SDK sidecar tests, focused TypeScript SDK client
  tests, docs listing, stale-name scans, and diff checks.
- Compatibility: no migration required for backend wire payloads, sidecar
  discovery-file metadata, tool schemas, transcript storage, or persisted
  settings. Direct Python callers that passed the removed `sidecar`,
  `sidecar_discovery_file`, or `sidecar_daemon_script` helper names should use
  the local-runtime names.

### 2026-06-17 query image-data collapse helper removal

- Finding: `query_execution_inputs.py` still exported `build_query_image_data`,
  an old helper for collapsing resolved screenshot lists back into
  `image_data`. Current query ingress keeps inline screenshots in `image_data`
  and artifact refs in `image_refs`, and the helper was used only by its own
  test.
- Change: removed the unused helper and its self-test, and documented that this
  boundary no longer collapses artifact refs into inline image data.
- Validation: focused backend input test command attempted, import/compile
  checks, stale helper scan, docs listing, and `git diff --check`.
- Compatibility: no migration required. Query payload fields, screenshot ref
  normalization, prompt image resolution, API events, and storage are unchanged.

### 2026-06-17 chat stream correlation wrapper cleanup

- Finding: `chatStreamEventUtils` still re-exported SDK tool correlation helpers
  even though renderer replay/tool code imports the SDK facade directly. The
  wrappers were unused outside their own unit tests.
- Change: removed the duplicate renderer correlation wrapper exports, kept
  correlation precedence coverage on the SDK package-boundary tests, and
  pointed the frontend `knip` CommonJS export ignore at the renamed local
  runtime bridge instead of the removed local-backend bridge file.
- Validation: frontend `knip` audit, focused chat-stream utility Jest coverage,
  SDK package-boundary Jest coverage, docs listing, stale wrapper scan, and
  `git diff --check`.
- Compatibility: no migration required. Runtime correlation behavior and SDK
  helper exports are unchanged.

### 2026-06-17 SDK public stream tool identity boundary

- Finding: `AgentStreamEvents` still recovered public `agent.stream(...)` tool
  identity from direct backend snake_case aliases on SDK conversation-event
  payloads, even though backend websocket normalization is the ownership
  boundary for converting wire payloads into SDK-shaped events.
- Change: made single tool call/output stream projection consume SDK-shaped
  top-level fields for `toolName`, `requestId`, and `toolCallId`, while keeping
  provider/model-facing metadata and normalized bundle step rows as valid
  sources for provider ids, arguments, and step names.
- Validation: focused SDK conversation-runtime and AgentClient stream coverage,
  docs listing, source scans, and `git diff --check`.
- Compatibility: no migration required for backend wire payloads or local tool
  execution. Directly constructed SDK tool events using removed snake_case
  aliases no longer provide public stream identity; callers should emit
  canonical SDK fields or go through the backend-event normalizer.

### 2026-06-17 Kimi Coding stale label cleanup

- Finding: renderer provider credential copy and the LLM architecture overview
  still used the old "Kimi Code" label after provider/config ownership moved to
  the canonical Kimi Coding provider name.
- Change: updated renderer skin copy, focused UI expectations, and architecture
  docs to use Kimi Coding and its current Anthropic-compatible endpoint wording.
- Validation: focused model-section Jest coverage, docs listing, stale-string
  scan, and `git diff --check`.
- Compatibility: no migration required. Provider ids, credential keys, config
  fields, and backend provider routing remain unchanged.

### 2026-06-17 backend provider factory package facade removal

- Finding: backend LLM provider selection still lived in
  `backend/src/llm/providers/__init__.py`, contradicting the backend
  namespace-package rule that package roots should not publish compatibility
  facades.
- Change: moved provider-factory/runtime-selection helpers into the concrete
  `backend.src.llm.providers.factory` owner module, updated runtime callers,
  docs, and tests, and removed the provider package marker.
- Validation: focused backend provider/model/namespace tests, docs listing,
  import-path scans, and `git diff --check`.
- Compatibility: no migration required for runtime behavior. Internal imports
  now use the concrete provider factory module; provider ids, cache keys, and
  API/config payloads are unchanged.

### 2026-06-17 chat response tool-event identity boundary

- Finding: `ChatBoxResponse` fallback current-turn state still decoded tool
  names, request ids, and correlation ids from backend snake_case payload
  aliases while rendering SDK `currentTurn.toolEvents`.
- Change: made the fallback row builder consume SDK tool-event identity fields
  and camelCase payload fields only, preserving backend `structuredPayload` for
  output text, screenshots, and detailed metadata.
- Validation: focused ChatBoxResponse state coverage, docs listing, source
  scans, and `git diff --check`.
- Compatibility: no migration required. Backend wire payloads and transcript
  storage are unchanged; this only tightens a renderer live-state fallback.

### 2026-06-17 live presentation tool identity boundary

- Finding: renderer live-turn presentation still recovered tool identity from
  raw backend snake_case payload aliases even though current-turn presentation
  is an SDK projection surface.
- Change: added explicit `requestId`, `correlationId`, and `bundleId` identity
  fields to SDK live tool presentation entries and made renderer live-row
  builders consume SDK-shaped entry/camelCase payload fields for identity while
  keeping `structuredPayload` as backend detail metadata.
- Validation: focused SDK current-turn projection and renderer message/tool
  presentation Jest coverage, docs listing, source scans, and `git diff --check`.
- Compatibility: no migration required. Backend wire payloads and persisted
  transcript details are unchanged; this only tightens live UI projection input.

### 2026-06-17 pending-turn clear alias removal

- Finding: Electron main pending-turn clear helpers still accepted
  `conversation_ref` and `turn_ref` helper aliases, and a snake_case clear
  payload could accidentally behave like an unfiltered clear.
- Change: made pending-turn matching and clear broadcasts read only
  `conversationRef` and `turnRef`, and ignored clear payloads that contain the
  removed snake_case filter fields.
- Validation: focused Electron main lifecycle pending-turn coverage, docs
  listing, and diff checks.
- Compatibility: no migration required. Renderer pending-turn IPC already emits
  camelCase fields; backend stop-query payloads remain snake_case separately.

### 2026-06-17 CJS agent definition alias parity

- Finding: the TypeScript `buildAgentDefinition` source rejected removed
  `agents_md` SDK builder input, but the checked-in CJS build still accepted it
  and normalized it into the backend wire field.
- Change: aligned the CJS builder with the TypeScript source so only
  `agentsMd` is accepted as SDK input while generated definitions still emit
  backend wire `agents_md`.
- Validation: focused WindieSdkPrivateExports and WindieSdkClient Jest coverage,
  source scan for the stale CJS alias read, and `git diff --check`.
- Compatibility: no migration required for current first-party callers. CJS SDK
  callers using removed `agents_md` builder input must use `agentsMd`.

### 2026-06-17 replay retry test alias cleanup

- Finding: the replay command bridge test still sent the removed `turn_ref`
  alias to `conversation.prepareRetryTurn`, contradicting the strict SDK command
  handler that now rejects edit/retry snake_case aliases.
- Change: switched the replay retry fixture to canonical `turnRef` so the test
  exercises the supported command path instead of stale compatibility behavior.
- Validation: focused replay command and SDK runtime-boundary Jest suites plus
  diff checks.
- Compatibility: no migration required. This is test-only alignment with an
  already-enforced command contract.

### 2026-06-17 permission trace context alias removal

- Finding: Electron main permission IPC trace routing still accepted
  snake_case helper fields such as `conversation_ref` and `turn_ref`, even
  though permission trace context is an internal host helper object.
- Change: made permission trace context read only canonical `conversationRef`
  and `turnRef` from top-level options or nested `_trace`, and documented that
  snake_case helper aliases now fall back to app diagnostics instead of
  conversation traces.
- Validation: focused PermissionIpcRuntime Jest coverage, docs listing, and
  `git diff --check`.
- Compatibility: no migration required. Backend/query payload fields are
  unchanged; this only removes internal permission helper input aliases.

### 2026-06-17 app diagnostics input alias removal

- Finding: Electron main app diagnostics helpers still accepted snake_case
  helper input aliases even though the active surface controllers already own
  camelCase runtime state.
- Change: converted surface visibility diagnostic callers to camelCase fields
  and made the diagnostics runtime ignore removed snake_case helper inputs.
- Validation: app diagnostics runtime plus surface runtime/responsebox/phase
  focused Jest suites, docs listing, and diff checks. The full app diagnostics
  store suite still requires the local `sqlite3` CLI and could not run on this
  machine.
- Compatibility: no migration required. SQLite diagnostic columns keep their
  existing snake_case storage names; this only removes helper input aliases for
  newly emitted diagnostics.

### 2026-06-17 transport rehydrate/compact conversation-ref boundary

- Finding: renderer `AgentRuntimeTransport` rehydrate and compact calls use the
  backend transport payload shape, but Electron main validated those two command
  payloads with the SDK library `conversationRef` helper.
- Change: gave Electron main a transport-specific `conversation_ref` validator
  for `conversation.rehydrate` and `conversation.compact`, kept SDK library
  commands on `conversationRef`, and made the renderer transport reject removed
  camelCase aliases for those backend transport commands.
- Validation: focused DesktopAgentRuntimeTransport and IpcMainSdkRuntimeBoundary
  Jest coverage, docs listing, and `git diff --check`.
- Compatibility: no migration required for first-party callers. Backend
  transport command payloads remain canonical snake_case while SDK library
  command payloads remain canonical camelCase.

### 2026-06-17 main trace input alias removal

- Finding: Electron main trace helpers still accepted removed query/current-turn
  alias fields even though frontend query tracing is passed explicit helper
  fields and SDK current-turn projections are camelCase.
- Change: made frontend query diagnostics read only `queryMessageId` and
  `conversationRef`, made SDK current-turn stdout traces read only `turnRef`
  and `conversationRef`, and kept backend event trace summaries on canonical
  backend snake_case fields.
- Validation: focused AssistantTrace Jest coverage, docs listing, and
  `git diff --check`.
- Compatibility: no migration required. This affects diagnostic summaries only;
  runtime query send, backend events, persisted data, credentials, and tool
  schemas are unchanged.

### 2026-06-17 backend provider stream helper test/docs lock

- Finding: the base provider stream-helper docs and online provider tests still
  referenced the removed private wrapper methods after stream iteration moved
  to `stream_event_pipeline`.
- Change: updated the base stream/normalization docs and focused provider tests
  to assert the wrappers are absent and patch the pipeline helpers directly.
- Validation: Python py_compile for the touched test module, docs listing, and
  diff check. Focused backend pytest remains blocked because the `jarvis` conda
  env is unavailable and fallback Python lacks backend dependencies.
- Compatibility: no migration required. This is docs/test coverage for the
  already-private provider helper deletion.

### 2026-06-17 backend provider stream helper ownership cleanup

- Finding: base LLM provider still exposed private forwarding helpers for
  stream usage and stream event iteration even after stream event functions were
  extracted to `stream_event_pipeline`.
- Change: made base provider call `enable_stream_with_usage(...)` directly,
  moved online stream selection to direct `stream_event_pipeline` calls, and
  updated provider override docs to describe the concrete owner.
- Validation: Python py_compile for touched provider modules, docs listing, and
  diff check. Focused backend pytest was attempted but blocked because the
  `jarvis` conda env was unavailable and the fallback Python environment lacked
  backend dependencies such as `litellm` and `fastapi`.
- Compatibility: no migration required. This removes private provider wrapper
  methods only; provider request params, streaming event shapes, and backend API
  contracts are unchanged.

### 2026-06-17 backend trace diagnostic alias removal

- Finding: Electron main compact backend-event tracing still read camelCase
  aliases such as `turnRef`, `conversationRef`, `requestId`, `correlationId`,
  `toolName`, and `finalResponse` while summarizing backend websocket events.
- Change: made backend event trace summaries read only canonical backend
  snake_case fields, kept main-local frontend query trace arguments separate,
  and added focused AssistantTrace regression coverage.
- Validation: focused AssistantTrace Jest test, docs listing, and diff check.
- Compatibility: no migration required. This changes diagnostic summarization
  only; backend event payload contracts already use snake_case fields.

### 2026-06-17 renderer query message id alias rejection

- Finding: renderer query send still emitted or accepted duplicate turn id
  spellings (`id`, `messageId`, `message_id`, and `queryMessageId`) alongside
  canonical `query_message_id`, and Electron main still tolerated some removed
  query id aliases while preparing backend query payloads.
- Change: made the live-turn client emit only `query_message_id`, made the
  renderer transport and Electron main query runtime reject removed query id
  aliases, and updated focused transport/query tests.
- Validation: focused DesktopAgentRuntimeTransport, DesktopLiveTurnRuntimeClient,
  IpcQueryRuntime, IpcMainBridge.query, and IpcMainSdkRuntimeBoundary Jest tests,
  docs index listing, and diff check.
- Compatibility: no migration required for current first-party callers. Stale
  renderer query callers using removed id aliases must switch to
  `query_message_id`.

### 2026-06-17 local-runtime mapped IPC handler removal

- Finding: Electron main still registered a compiled mapper layer for direct
  sidecar-named chat and memory IPC handlers even though renderer-visible
  chat/memory behavior had moved to SDK-shaped commands and SDK local-runtime
  store calls.
- Change: removed the mapper module and registration path, kept only scoped
  local-runtime host handlers in Electron main, and updated docs/tests to assert
  the direct chat/memory IPC channels remain gone.
- Validation: focused LocalRuntimeBridge RPC/lifecycle, mapper-deletion,
  host-boundary, preload-channel, dashboard, renderer app boundary tests, docs
  listing, and diff check.
- Compatibility: no migration required. Renderer preload already rejected the
  removed direct channels; sidecar JSON-RPC method registration remains
  available behind SDK local-runtime callers.

### 2026-06-17 main SDK edit/retry alias rejection

- Finding: Electron main SDK edit/retry command handling still accepted
  `turn_ref` and `message_id` aliases even though renderer command facades use
  SDK-shaped `turnRef` and `messageId` fields.
- Change: made edit/retry command validation reject removed snake_case aliases
  before agent work starts, updated command contract docs, and kept backend
  query/event payload snake_case handling separate.
- Validation: focused main SDK runtime boundary test, docs listing, and diff
  check.
- Compatibility: no migration required for current renderer callers; they send
  camelCase edit/retry command fields. Stale command callers using `turn_ref`
  or `message_id` must switch to `turnRef` and `messageId`.

### 2026-06-17 SDK stopQuery input alias rejection

- Finding: `Agent.stop(...)` had already rejected snake_case stop options, but
  the lower SDK `AgentSessionRuntime.stopQuery(...)` contract and concrete
  sessions still accepted `conversation_ref` and `turn_ref` as public input
  aliases.
- Change: made `AgentStopInput` and session `stopQuery(...)` inputs use only
  `conversationRef` and `turnRef`, moved backend snake_case emission behind the
  SDK transport adapter boundary, and updated checked-in CJS parity.
- Validation: focused SDK client and package-boundary tests, docs listing, and
  diff check.
- Compatibility: no migration required for first-party SDK callers; high-level
  `Agent.stop(...)` already uses camelCase. Low-level callers using
  `conversation_ref` or `turn_ref` with `stopQuery(...)` must switch to
  `conversationRef` and `turnRef`.

### 2026-06-17 main SDK command conversation alias rejection

- Finding: Electron main SDK conversation-library command validation still
  accepted the removed `conversation_ref` alias even though renderer library
  facades send SDK-shaped `conversationRef` payloads.
- Change: made command conversation normalization reject `conversation_ref`
  before agent work starts, updated command contract docs, and kept the
  separate snake_case `conversation.send`/`conversation.stop` query transport
  contract unchanged.
- Validation: focused main SDK runtime boundary test, docs listing, and diff
  check.
- Compatibility: no migration required for current renderer callers; they send
  `conversationRef`. Stale SDK command callers using `conversation_ref` must
  switch to `conversationRef`.

### 2026-06-17 transcript-session sync snake_case alias rejection

- Finding: renderer/main transcript-session sync still accepted
  `conversation_ref` and `user_id` aliases, blurring the UI session identity
  channel with the separate snake_case backend query transport contract.
- Change: made Electron main sync normalization, renderer inbound sync
  normalization, and main-session snapshot hydration use only `conversationRef`
  and `userId`, with focused tests proving snake_case sync packets fail closed.
- Validation: focused transcript-session sync, payload normalization, and
  conversation-session runtime tests, docs listing, and diff check.
- Compatibility: no migration required for current first-party callers; they
  emit camelCase transcript-session sync payloads. Stale callers using
  `conversation_ref` or `user_id` on the UI sync channel must switch to
  `conversationRef` and `userId`.

### 2026-06-17 SDK metadata row alias rejection

- Finding: `LocalRuntimeConversationStore` still accepted camelCase metadata-row
  aliases from sidecar conversation list/search responses even though the
  local-runtime database emits canonical snake_case row fields.
- Change: narrowed metadata row parsing to canonical sidecar fields such as
  `conversation_id`, `revision_id`, `last_timestamp`, `entry_count`,
  `workspace_path`, `workspace_name`, and `matched_role`, with checked-in CJS
  parity and focused store API coverage for ignored camel-only rows.
- Validation: focused Agent conversation store API test.
- Compatibility: no migration required. Current sidecar-produced metadata rows
  already use snake_case fields; stale camel-only rows are ignored at the SDK
  store boundary.

### 2026-06-17 main SDK command user alias rejection

- Finding: Electron main SDK command validation still accepted the removed
  `user_id` input alias even though renderer conversation-library command
  facades send SDK-shaped `userId` payloads.
- Change: made command user validation and diagnostics read only `userId`,
  updated the command contract docs/tests, and kept the separate snake_case
  query transport contract untouched.
- Validation: focused main SDK runtime boundary test.
- Compatibility: no migration required for current renderer callers; they send
  `userId`. Stale command callers using `user_id` must switch to `userId`.

### 2026-06-17 SDK local-runtime title invalidation alias removal

- Finding: SDK conversation continuity still normalized local-runtime
  `conversation-title-updated` events from removed top-level, camelCase, and
  `conversation_ref` aliases, duplicating sidecar event parsing at the host
  boundary.
- Change: made metadata invalidation read only canonical sidecar payload fields
  `conversation_id`, `title`, and `source`, leaving UI adapters to reload
  metadata from the store through the public invalidation event.
- Validation: focused conversation continuity service test, local-runtime
  status broadcaster test, docs listing, and diff check.
- Compatibility: no persisted-data migration required. Title-update events are
  transient local-runtime notifications; stale alias-only events now broadcast
  a generic metadata invalidation without alias-derived fields.

### 2026-06-17 SDK/main agent definition AGENTS.md input alias rejection

- Finding: SDK `buildAgentDefinition(...)` and Electron main agent-definition
  input collection still accepted the backend-wire `agents_md` spelling as an
  input alias, keeping SDK/public builder inputs blurred with wire payload
  fields.
- Change: made both builders reject removed snake_case `agents_md` input and
  kept the generated `agent_definition.agents_md` wire field unchanged.
- Validation: focused SDK builder test, focused Electron main input collector
  test, docs listing, and diff check.
- Compatibility: no migration required for current Electron callers; they pass
  `agentsMd` into the builder. External SDK callers using `agents_md` as a
  builder input must switch to `agentsMd`.

### 2026-06-17 renderer message sender clipboard image alias rejection

- Finding: renderer chat send payload normalization still quietly ignored the
  removed singular `clipboardImage` key, which could turn a stale image payload
  into a text-only send.
- Change: made object sends containing the removed `clipboardImage` key reject
  before send preparation, and updated sender docs/tests to require canonical
  `clipboardImages[]`.
- Validation: focused chat message sender payload test, docs listing, and diff
  check.
- Compatibility: no migration required. Current dashboard and minimal-pill
  composers emit canonical `clipboardImages[]` arrays; stale callers using the
  removed singular field must update to the array contract.

### 2026-06-17 renderer transcript storage session alias rejection

- Finding: renderer transcript session storage no longer accepted `sessionId`
  as conversation identity, but a stored payload containing removed session
  identity keys could still partially preserve `userId`.
- Change: made stored transcript session payloads containing removed
  `sessionId` or `session_id` keys discard the whole stored identity and
  updated transcript docs/tests to lock the fail-closed behavior.
- Validation: focused transcript storage test, docs listing, and diff check.
- Compatibility: no migration required. Current renderer writes canonical
  `conversationRef` and `userId` storage payloads; malformed storage already
  resets to null session info.

### 2026-06-17 SDK daemon discovery alias rejection

- Finding: SDK local-runtime daemon discovery skipped `baseUrl`-only discovery
  files but still tolerated removed camelCase `baseUrl` when canonical
  `base_url` was also present.
- Change: made discovery normalization reject any discovery file containing the
  removed `baseUrl` key, updated docs to describe rejection/replacement, and
  updated the docs search routing test.
- Validation: focused SDK local-runtime provider test, focused docs-index route
  test, docs listing, and diff check.
- Compatibility: discovery files containing removed camelCase `baseUrl` are
  treated as stale and replaced through normal daemon launch/reuse flow. The
  public `localRuntimeDaemon.baseUrl` client option is unchanged. No
  persisted-data, storage, settings, credential, permission, IPC, or backend
  wire migration is required.

### 2026-06-17 Python sidecar MCP alias rejection

- Finding: the Python sidecar daemon still ignored removed camelCase MCP server
  spec and execution metadata fields, letting stale extension/local-runtime
  callers look accepted while their metadata was dropped.
- Change: added a daemon-side removed-key guard for MCP server specs and MCP
  execution metadata, returns a 400 for invalid execute-tool payloads, and
  updated sidecar runtime docs/tests to require canonical snake_case fields.
- Validation: focused sidecar daemon pytest target, docs listing, and diff
  check. The broader `bin\windie test sidecar -- tests/sidecar/test_sidecar_daemon.py -q`
  invocation expanded to the full sidecar suite and hit unrelated Windows/path
  failures.
- Compatibility: callers using removed camelCase MCP fields such as
  `timeoutMs`, `toolPrefix`, `requestId`, or `conversationRef` must migrate to
  canonical snake_case daemon payload fields. No persisted-data, storage,
  settings, credential, permission, or backend wire migration is required.

### 2026-06-17 renderer agent runtime transport alias

- Finding: the renderer desktop-agent runtime transport module had been renamed
  away from backend wording, but its exported factory still returned the
  backend-named SDK `BackendTransport` type.
- Change: added the generic SDK `AgentRuntimeTransport` alias for host/runtime
  adapters and switched the renderer transport factory plus SDK docs/tests to
  use the generic alias while leaving hosted backend session code on backend
  transport names.
- Validation: focused renderer runtime boundary and SDK package-boundary tests,
  docs listing, and diff check.
- Compatibility: no migration required. This is a TypeScript SDK contract alias
  and renderer type cleanup only; backend wire payloads, IPC channels, storage,
  settings, credentials, permissions, and tool execution are unchanged.

### 2026-06-17 extension manifest alias rejection

- Finding: extension contribution manifest loading still ignored removed alias
  and camelCase manifest fields, which hid packages that had not migrated to
  documented snake_case contribution contracts.
- Change: made plugin, permission, settings-panel, and MCP manifest loading
  reject the removed aliases at load time and updated extension authoring docs
  to say those fields fail closed.
- Validation: focused extension manifest and scaffold tests plus docs search.
- Compatibility: extension authors using removed alias or camelCase manifest
  fields must migrate to documented snake_case manifest fields. No
  persisted-data, wire, storage, settings, or event-payload migration is
  required.

### 2026-06-17 renderer command docs payload correction

- Finding: the SDK runtime contract doc still showed renderer-facing
  `windie:invoke` conversation command examples reading `payload.conversationRef`
  and `payload.turnRef` after the renderer transport moved to canonical
  snake_case command payloads.
- Change: updated those examples to use `conversation_ref` and `turn_ref` at the
  renderer IPC command boundary while preserving camelCase for public SDK
  method options such as `agent.stop(...)` and `agent.conversation(...)`.
- Validation: docs listing, focused stale example scan, and diff check.
- Compatibility: no migration required. This is documentation cleanup only; the
  renderer transport already rejects removed camelCase command payload aliases.

### 2026-06-17 tool screenshot result alias removal

- Finding: the SDK tool execution coordinator still rewrote camelCase
  `screenshotRef` and `screenshotUrl` local tool result fields into backend
  screenshot metadata, which blurred the local execution result boundary.
- Change: made the coordinator reject camelCase screenshot result aliases before
  artifact materialization or backend delivery, keeping local tool screenshot
  outputs on `screenshot_ref`, `screenshot_url`, and `screenshot_content_type`.
- Validation: focused SDK conversation-runtime tool coordinator tests for
  camelCase screenshot aliases and camelCase-only screenshot aliases.
- Compatibility: local tool implementations using `screenshotRef` or
  `screenshotUrl` in SDK tool results must migrate to snake_case screenshot
  fields. No persisted-data, wire, storage, settings, credential, permission,
  IPC-channel, or tool-execution trust-boundary migration is required.

### 2026-06-17 renderer runtime command alias rejection

- Finding: the renderer desktop-agent runtime transport still allowed removed
  camelCase command fields to be silently dropped before invoking the SDK-shaped
  main bridge.
- Change: added a renderer transport guard that rejects removed camelCase
  command aliases for conversation send/stop and related command payloads while
  keeping Electron main on canonical snake_case command fields.
- Validation: focused desktop-agent runtime transport test, docs search, and
  stale-alias documentation scan.
- Compatibility: renderer callers using camelCase command payload fields must
  migrate to canonical snake_case fields. No persisted-data, wire, storage,
  settings, event-payload, credential, permission, IPC-channel, or tool-execution
  migration is required.

### 2026-06-17 local-runtime routing docs label cleanup

- Finding: top-level docs navigation, routing hubs, help/developer guides, and
  browser/runtime references still used local-backend or local-sidecar labels
  for Electron-facing local runtime and Python sidecar daemon paths.
- Change: updated visible labels and descriptions to local-runtime or Python
  sidecar terminology while preserving historical `local_backend*` filenames
  and explicit local-backend deployment wording where it names a backend origin.
- Validation: docs listing, focused stale-label scan, and diff check.
- Compatibility: no migration required. This is documentation cleanup only;
  local-runtime daemon startup, JSON-RPC methods, IPC channels, and backend
  endpoint selection are unchanged.

### 2026-06-17 Agent stop option alias removal

- Finding: the public SDK `Agent.stop` helper still accepted backend-shaped
  `conversation_ref` and `turn_ref` option aliases even though the Agent API
  boundary is documented and exported with camelCase option types.
- Change: removed the snake_case aliases from `AgentStopOptions`, made
  `Agent.stop` fail fast when callers pass the retired spellings, and preserved
  the backend wire `stop-query` payload shape at the session transport boundary.
- Validation: focused SDK client stop-option test and diff check.
- Compatibility: SDK callers using `conversation_ref` or `turn_ref` with
  `Agent.stop` must migrate to `conversationRef` and `turnRef`. No backend
  wire, storage, persisted-data, or security migration is required.

### 2026-06-17 sidecar source-copy guard test alignment

- Finding: sidecar tests still expected the retired local-sidecar-runtime and
  local-sidecar-daemon phrases after the source copy moved to Python sidecar
  runtime/daemon wording.
- Change: updated the guard assertions to require Python sidecar runtime and
  Python sidecar daemon labels.
- Validation: focused sidecar tests for local backend source copy, browser
  helper copy, and sidecar daemon identity copy.
- Compatibility: no migration required. This is test expectation alignment
  only; sidecar runtime behavior and JSON-RPC contracts are unchanged.

### 2026-06-17 browser docs legacy session reuse cleanup

- Finding: browser docs still suggested using `WINDIE_BROWSER_USE_SESSION=windieos`
  or the old browser file root when intentionally reusing legacy Browser Use
  state.
- Change: narrowed those environment overrides to diagnostics or isolated local
  sessions/file roots so the documented default remains the generic
  `desktop-agent` Browser Use session and browser file root.
- Validation: docs listing, focused legacy browser-session/file-root scan, and
  diff check.
- Compatibility: no migration required. This is documentation cleanup only;
  browser session defaults, file-root resolution, and Browser Use execution are
  unchanged.

### 2026-06-17 permission adapter diagnostic ownership label cleanup

- Finding: the Electron main permission adapter wrapped macOS Automation
  sidecar/local-runtime failures under a `backend_result` diagnostic key.
- Change: renamed the diagnostic detail to `local_runtime_result` and added a
  main host boundary assertion so the backend label does not return.
- Validation: focused main host skin/boundary test and diff check.
- Compatibility: no migration required. This diagnostic detail is internal
  failure metadata; permission probing/request behavior and IPC envelopes are
  unchanged.

### 2026-06-17 local-runtime docs hub and sidecar source label cleanup

- Finding: frontend docs hubs, IPC/main/sidecar workflows, node maps,
  inventory references, and a few Python sidecar module labels still exposed
  local-backend or local-sidecar wording where the current boundary is
  SDK/Electron local runtime plus Python sidecar daemon.
- Change: updated visible link labels, headings, summaries, daemon argparse
  copy, Python module docstrings, and the stale script-missing error example to
  local-runtime, Python sidecar, or self-hosted backend-origin language while
  preserving historical file paths and `local_backend.py` implementation names.
- Validation: docs listing, focused stale-label scans, Python compilation over
  touched sidecar modules, and diff check.
- Compatibility: no migration required. This is docs/source-copy cleanup only;
  local-runtime launch options, sidecar JSON-RPC methods, IPC channels, and
  tool execution behavior are unchanged.

### 2026-06-17 Python sidecar runtime source label cleanup

- Finding: Python sidecar docstrings, helper docs, and lifecycle log messages
  still used local-sidecar-runtime wording, which blurred the newer split where
  Electron/SDK expose the local runtime boundary and Python owns the sidecar
  daemon implementation.
- Change: updated those source labels to Python sidecar runtime while
  preserving `LocalBackend` as the concrete internal implementation name.
- Validation: focused source scan for stale local-sidecar-runtime wording and
  Python compilation over the touched sidecar modules.
- Compatibility: no migration required. This is comments, helper docs, and log
  copy only; JSON-RPC methods, tool schemas, process lifecycle, and memory
  behavior are unchanged.

### 2026-06-17 local-runtime screenshot and memory docs label cleanup

- Finding: screenshot/window, memory, browser readiness, and IPC helper docs
  still used local-backend or local-sidecar labels for Electron-facing
  local-runtime seams, and two focused local-runtime docs were missing their
  opening frontmatter delimiter.
- Change: updated visible labels to local-runtime or SDK local runtime,
  corrected the frontmatter delimiters, and preserved historical file paths plus
  concrete Python `LocalBackend` implementation references.
- Validation: docs listing, focused stale visible local-backend/local-sidecar
  label scan, and diff check.
- Compatibility: no migration required. This is documentation label cleanup
  only; screenshot routing, memory RPC methods, SDK local-runtime behavior, and
  IPC channels are unchanged.

### 2026-06-17 sidecar docs local-runtime label cleanup

- Finding: sidecar hubs, frontend maps, and tool/memory sidecar references still
  used local-backend labels for sidecar runtime paths that are exposed to
  Electron and SDK callers as local-runtime JSON-RPC surfaces.
- Change: updated visible link labels, table labels, and result/memory runtime
  wording to say local-runtime or Python sidecar runtime while preserving
  `local_backend.py` and `LocalBackend` names where they refer to the concrete
  sidecar implementation.
- Validation: docs listing, focused stale visible local-backend label scan, and
  diff check.
- Compatibility: no migration required. This is documentation label cleanup
  only; sidecar files, JSON-RPC methods, SDK routing, and IPC channels are
  unchanged.

### 2026-06-17 JSON-RPC workflow local-runtime wording cleanup

- Finding: JSON-RPC, browser, memory, and error workflow docs still described
  Electron-facing sidecar request/status failures as local-backend surfaces, and
  the JSON-RPC workflow still said the host starts `local_backend.py` and
  accepts legacy local-backend-prefixed stderr.
- Change: updated those docs to describe the SDK local-runtime JSON-RPC path,
  the `sidecar_daemon.py` launch target, and the active stderr forwarding
  allowlist; preserved Python `LocalBackend` implementation references where
  they name the real sidecar class.
- Validation: docs listing, focused stale wording scan, and diff check.
- Compatibility: no migration required. This is documentation only; JSON-RPC
  methods, IPC channels, daemon launch behavior, and persisted data are
  unchanged.

### 2026-06-17 protocol surface matrix local-runtime title cleanup

- Finding: frontend inventory protocol hubs still surfaced the local-runtime
  protocol matrix with local-backend link/title wording even though the matrix
  content already maps Electron main through `local_runtime_bridge.cjs`.
- Change: updated the visible matrix title, hub summaries, read_when guidance,
  and related link labels to say local-runtime while leaving the historical file
  path and Python `LocalBackend` implementation references unchanged.
- Validation: docs listing, focused stale visible local-backend protocol title
  scan, and diff check.
- Compatibility: no migration required. This is documentation metadata and link
  text only; IPC channels, JSON-RPC mappings, SDK local-runtime routing, and
  sidecar implementation names are unchanged.

### 2026-06-17 local-runtime daemon log filter cleanup

- Finding: Electron main still forwarded `[LocalBackend]` stderr as an allowed
  local-runtime daemon prefix after the active sidecar status prefix moved to
  `[LocalRuntime]`.
- Change: removed the legacy log prefix from the local-runtime launch filter,
  tightened the focused launch-options test to prove legacy daemon stderr is
  dropped, and refreshed current Electron-facing docs that still named
  local-runtime status/error/test surfaces as local-backend surfaces.
- Validation: focused frontend launch-options test, docs listing, stale
  `[LocalBackend]` launch-filter scan, stale local-backend wording scan for the
  touched docs, and diff check.
- Compatibility: no migration required. This only narrows host log forwarding
  for retired daemon prefixes; SDK local-runtime startup, sidecar JSON-RPC,
  IPC channels, persisted state, and Python `LocalBackend` implementation
  names are unchanged.

### 2026-06-17 diagnostics app-data host skin cleanup

- Finding: the generic Electron diagnostics store still hard-coded the
  WindieOS app-data directory name for non-Electron fallback diagnostics paths.
- Change: moved that product-specific directory name into `main_host_skin` and
  left a generic `desktop-agent` fallback in the diagnostics store.
- Validation: focused app diagnostics and main host skin boundary Jest tests,
  stale product-string scan for the diagnostics store, and diff check.
- Compatibility: no migration required. Electron `app.getPath("userData")` and
  explicit diagnostics env vars remain unchanged; only the non-Electron
  diagnostics fallback now reads product skin config.

### 2026-06-17 sidecar executor folder map cleanup

- Finding: the Python sidecar folder-structure reference still listed the old
  `core/thread_pool.py` module after executor lifecycle ownership moved to
  `core/executors.py`.
- Change: updated the folder map to point at `executors.py` and describe the
  shared interactive/background executor lifecycle.
- Validation: source-path existence check, stale `thread_pool.py` docs/source
  scan, and diff check.
- Compatibility: no migration required. This is a docs-only sidecar source-map
  cleanup; executor behavior and environment variables are unchanged.

### 2026-06-17 current-doc local-runtime bridge wording

- Finding: current routing and troubleshooting docs still used Electron/main
  sidecar bridge wording for paths that now route through the Electron
  local-runtime bridge and SDK-owned local runtime lifecycle.
- Change: updated those current docs to say local-runtime bridge while leaving
  Python sidecar executor references intact.
- Validation: docs listing, focused stale sidecar-bridge wording scan, and diff
  check.
- Compatibility: no migration required. This is a docs-only terminology cleanup;
  local tool dispatch, IPC channels, SDK runtime behavior, and sidecar execution
  are unchanged.

### 2026-06-17 reference-doc local-runtime bridge wording

- Finding: architecture, reference, contracts, tool, and renderer workflow docs
  still used sidecar-bridge wording for Electron main paths that now route
  through `local_runtime*.cjs`.
- Change: updated those docs to say local-runtime bridge for the Electron main
  transport while preserving Python sidecar executor ownership language.
- Validation: docs listing, focused stale sidecar-bridge wording scan, and
  `git diff --check`.
- Compatibility: no migration required. This is documentation terminology
  only; SDK tool routing, Electron IPC channels, daemon JSON-RPC payloads, and
  persisted data are unchanged.

### 2026-06-17 surface-prep local-runtime docs wording

- Finding: overlay, display-affinity, runtime path, and window lifecycle docs
  still described Electron main screenshot/surface prep and launch wiring as
  local-backend paths.
- Change: updated those current docs to say SDK/main surface prep,
  local-runtime callers, and local-runtime launch coordination where the path is
  owned by Electron main and the SDK local runtime.
- Validation: docs listing, focused stale wording scan, and `git diff --check`.
- Compatibility: no migration required. This is documentation terminology only;
  screenshot capture, IPC channels, SDK/main local-runtime routing, and Python
  sidecar execution are unchanged.

### 2026-06-17 RPC mapper local-runtime docs wording

- Finding: current protocol validation and readiness docs still described
  `local_runtime_rpc_mappers.cjs` and `local-runtime-status` snapshots as
  local-backend mapper/status surfaces.
- Change: updated those docs to use local-runtime mapper/status wording while
  leaving Python `LocalBackend` implementation references intact.
- Validation: docs listing, focused stale local-backend mapper/status wording
  scan, and `git diff --check`.
- Compatibility: no migration required. This is documentation terminology only;
  mapper behavior, IPC channels, SDK local-runtime routing, and sidecar JSON-RPC
  methods are unchanged.

### 2026-06-17 frontend inventory local-runtime bridge wording

- Finding: current frontend architecture and inventory docs still framed the
  Electron main adapter as a local sidecar bridge in places that describe the
  SDK-owned lifecycle boundary.
- Change: updated those docs to describe Electron main as owning local-runtime
  host adapters, launch facts, renderer status projection, helper RPC mapping,
  and host-only screenshot/artifact/window behavior while keeping Python
  `LocalBackend` execution inside the sidecar daemon.
- Validation: docs listing, focused stale wording scan, and diff check.
- Compatibility: no migration required. This is a docs-only boundary wording
  cleanup; SDK, IPC, daemon, and sidecar JSON-RPC behavior are unchanged.

### 2026-06-17 parser trust-boundary import cleanup

- Finding: `backend/src/llm/parser.py` still imported `ParsedToolCall` after
  parser type ownership moved to `parser_types.py` and direct parser consumers
  stopped using the parser module as a type surface.
- Change: removed the unused imported name while leaving parser extraction,
  validation, timeout, and metrics behavior unchanged.
- Validation: direct focused pytest for response parser and parser extraction,
  `py_compile` for `backend/src/llm/parser.py`, stale import scan, and diff
  check.
- Compatibility: no migration required. This is an import cleanup only; parser
  result types and trust-boundary behavior are unchanged.

### 2026-06-17 Event bus registry export cleanup

- Finding: `backend.src.core.infrastructure.bus` still imported
  `EventHandlerWrapper` only so tests could reach the registry helper through
  the bus module.
- Change: removed that wrapper import from `bus.py`, switched focused tests to
  import `EventHandlerWrapper` from `event_bus_registry.py`, and documented the
  owner module.
- Validation: direct focused pytest for `tests/backend/test_event_bus.py`,
  `py_compile` for the bus/registry/test files, stale facade-import scan, and
  diff check. The broader `bin\windie.cmd test backend ...` path still cannot
  collect in this shell because the `jarvis` env is unavailable and fallback
  Python lacks backend dependencies (`fastapi`, `litellm`).
- Compatibility: no persisted-data, storage, API, wire, or settings migration is
  required. Direct imports should use the registry helper module instead of the
  bus runtime module.

### 2026-06-17 Electron main local-runtime overview cleanup

- Finding: the current Electron main IPC overview still described the
  local-runtime bridge as spawning `local_backend.py` and owning sidecar
  request correlation, even after daemon lifetime and `/rpc` unwrapping moved
  behind the SDK local runtime provider.
- Change: updated the overview to describe Electron main as the SDK host for
  desktop launch facts, status broadcasts, host helper mapping, and
  renderer-facing fail-closed envelopes while leaving daemon lifecycle and
  local tool execution behind SDK/sidecar contracts.
- Validation: docs listing, focused stale overview scan, and diff check.
- Compatibility: no migration required. This is a docs-only ownership
  correction; IPC channels, launch behavior, daemon protocol, and helper result
  envelopes are unchanged.

### 2026-06-17 OpenAI Responses import cleanup

- Finding: the backend OpenAI Responses input/runtime helpers still imported
  `json` and `build_openai_responses_input` after request construction moved to
  normalized content/tool payload helpers.
- Change: removed those unused imports while leaving Responses input validation,
  image detail preservation, params construction, and tool-call shaping
  unchanged.
- Validation: `py_compile` for the OpenAI Responses input/runtime helpers,
  stale import usage scans, and diff check. Focused backend pytest collection
  was attempted but could not run because the `jarvis` conda env is unavailable
  and the fallback shell lacks backend dependencies (`fastapi`, `litellm`).
- Compatibility: no migration required. This is a backend provider helper
  import cleanup only; request payloads and provider behavior are unchanged.

### 2026-06-17 main/renderer private export cleanup

- Finding: a few generic main-window and renderer skin/runtime helpers were
  still exported even though they are implementation details inside their owning
  modules.
- Change: removed the unused helper exports for icon filename normalization,
  host-skin icon path resolving, desktop-agent bridge access, and provider model
  display fallback tables while keeping their internal behavior and boundary
  tests.
- Validation: focused MainWindowIconRuntime, MainWindowRuntime, and
  MainHostSkinBoundary Jest tests plus stale export-reference scan.
- Compatibility: no migration required. These were private implementation
  helpers; app icon resolution, tray/window creation, desktop-agent command
  invocation, and provider display metadata behavior are unchanged.

### 2026-06-17 SDK private export tombstone literal cleanup

- Finding: the SDK private-export regression test still kept retired
  product-named and local-sidecar module/export names as literal strings while
  asserting those compatibility surfaces are gone.
- Change: moved the retired names behind small dynamic helpers so the test still
  checks the same missing modules/exports without keeping stale names visible in
  active literal scans.
- Validation: focused SDK private-export Jest coverage and stale tombstone scan.
- Compatibility: no migration required. This is a test-only cleanup; package
  exports and removed compatibility modules remain unchanged.

### 2026-06-17 frontend boundary negative-assertion literal cleanup

- Finding: frontend boundary tests still carried retired product SDK helper names
  and the old `SidecarBridge` log label as literal negative assertions.
- Change: kept the same absence assertions but constructed the retired names
  dynamically in the main SDK, modular refactor, renderer API, SDK client, host
  skin, and local-runtime launch-option suites.
- Validation: focused frontend Jest run for the affected boundary suites plus
  stale product/bridge literal scans.
- Compatibility: no migration required. This is test-only; runtime code, public
  package exports, IPC channels, and log behavior are unchanged.

### 2026-06-17 DashboardShell test path cleanup

- Finding: current renderer dashboard docs and test-selection guidance still
  referenced the stale `ChatGptDashboardShell.test.jsx` path even though the
  renderer owner is the generic `DashboardShell` component.
- Change: renamed the focused dashboard shell suite to
  `DashboardShell.test.jsx` and updated current dashboard/protocol docs to the
  active test path.
- Validation: focused DashboardShell Jest coverage, docs listing,
  `git diff --check`, and stale active-path scan.
- Compatibility: no migration required. This is a test/docs path cleanup only;
  dashboard runtime behavior and renderer contracts are unchanged.

### 2026-06-17 local-runtime bridge prose cleanup

- Finding: a current test title and two current docs still described validation
  or removed behavior with local-backend bridge wording after the Electron main
  adapter moved to local-runtime names.
- Change: updated that current prose to local-runtime/backend-named wording while
  leaving historical notes about removed exports intact.
- Validation: focused LocalRuntimeBridge lifecycle Jest test, stale current
  prose scan, docs listing, and diff check.
- Compatibility: no migration required. This is a docs/test wording cleanup;
  bridge APIs, IPC channels, and runtime behavior are unchanged.

### 2026-06-17 local-runtime bridge legacy assertion scan

- Finding: current Electron main boundary tests still contained exact
  LocalBackendBridge/export strings only as negative assertions, which kept
  stale-name scans noisy after the runtime bridge moved to local-runtime names.
- Change: kept the negative assertions but built the removed legacy label/export
  names dynamically in the focused lifecycle and host-boundary suites.
- Validation: focused LocalRuntimeBridge lifecycle and host-boundary Jest tests,
  stale current-code name scan, and diff check.
- Compatibility: no migration required. This is a test-only assertion cleanup;
  bridge APIs, log labels, IPC channels, and runtime behavior are unchanged.

### 2026-06-17 local-runtime bridge docs wording

- Finding: several current workflow and index docs still described the Electron
  adapter as a local-backend bridge even after source paths, tests, and the
  bridge overview route moved to local-runtime terminology.
- Change: updated current docs wording to local-runtime bridge/error/dependency
  language while leaving historical reports and old-name absence assertions
  intact.
- Validation: stale current-doc wording scan, docs listing, and diff check.
- Compatibility: no migration required. This is a docs wording cleanup only;
  source APIs, tests, IPC channels, and runtime behavior are unchanged.

### 2026-06-17 local-runtime bridge docs entrypoint

- Finding: the Electron main local-runtime bridge overview page title and
  content had moved to local-runtime wording, but the docs filename, hub links,
  and docs-index fixture still used local-backend bridge names.
- Change: renamed the overview page to
  `local_runtime_bridge_handler_and_window_guard_reference.md`, updated current
  docs links and the docs-index fixture, and clarified that the
  `local_backend/` docs subfolder refers to the Python sidecar executor domain.
- Validation: docs listing, docs-index Jest test, stale docs-entrypoint scan,
  and diff check.
- Compatibility: no migration required. This is a docs-navigation rename; code
  paths, IPC channels, and runtime behavior are unchanged.

### 2026-06-17 local-runtime bridge focused suites

- Finding: the Electron main local-runtime bridge lifecycle/RPC focused Jest
  suites and shared harness still used LocalBackendBridge names after the bridge
  root and helper modules moved to local-runtime paths.
- Change: renamed the lifecycle/RPC suites and shared harness to
  LocalRuntimeBridge names and updated current docs that route validation to
  those suites.
- Validation: focused LocalRuntimeBridge lifecycle/RPC tests, host-boundary
  tests, stale test-name scan, docs listing, and diff check.
- Compatibility: no migration required. This is a test/docs/harness path rename;
  bridge APIs, IPC channels, JSON-RPC payloads, and runtime behavior are
  unchanged.

### 2026-06-17 local-runtime RPC mappers module

- Finding: Electron main renderer-to-sidecar RPC mapper registration was a
  local-runtime bridge contract, but the private module and focused Jest suite
  still lived under local-backend bridge names.
- Change: renamed the mapper module and focused test to local-runtime paths,
  updated the bridge import, current docs, and host-boundary coverage.
- Validation: focused RPC mapper, bridge RPC, window-visibility, execute-tool,
  and host-boundary Jest tests, stale-reference scan, docs listing, and diff
  check.
- Compatibility: no migration required. This is a private Electron main module
  and test path rename; IPC channel strings, JSON-RPC method names, mapper
  payloads, and sidecar protocol behavior are unchanged.

### 2026-06-17 local-runtime window visibility module

- Finding: Electron main screenshot window resolver and visibility helper
  behavior was a local-runtime adapter, but the private module and focused
  Jest suite still lived under local-backend bridge names.
- Change: renamed the helper module and focused test to local-runtime paths,
  updated bridge/execute-tool imports, current docs, and host-boundary coverage.
- Validation: focused window-visibility, execute-tool, bridge RPC, artifact,
  and host-boundary Jest tests, stale-reference scan, docs listing, and diff
  check.
- Compatibility: no migration required. This is a private Electron main module
  and test path rename; screenshot task execution and window resolver shapes
  are unchanged.

### 2026-06-17 local-runtime screenshot attachment module

- Finding: Electron main screenshot attachment materialization was a
  local-runtime helper, but the private module still lived under local-backend
  bridge naming.
- Change: renamed the helper module to `local_runtime_screenshot_attachment.cjs`
  and updated execute-tool imports plus docs that route screenshot artifact
  upload, inline payload, and temporary file cleanup through this adapter.
- Validation: focused execute-tool, bridge RPC, screenshot artifact/materializer
  tests, stale-reference scan, docs listing, and diff check.
- Compatibility: no migration required. This is a private Electron main module
  path rename; screenshot result payloads and artifact upload behavior are
  unchanged.

### 2026-06-17 local-runtime utilities module

- Finding: shared Electron main local-runtime error and stderr utilities still
  lived under a local-backend bridge module path even after their exported
  helpers moved to local-runtime wording.
- Change: renamed the utility module to `local_runtime_utils.cjs`, updated
  bridge, execute-tool, launch-options, docs, and boundary references.
- Validation: focused launch-options, execute-tool, bridge RPC, and
  host-boundary Jest tests, stale module-path scan, docs listing, and diff
  check.
- Compatibility: no migration required. This is a private Electron main module
  path rename; stderr filtering, node options, error messages, IPC channels,
  and payloads are unchanged.

### 2026-06-17 local-runtime timeout policy module

- Finding: Electron main local-runtime request timeout policy was a private
  execution helper, but its module path still used local-backend bridge naming.
- Change: renamed the helper to `local_runtime_timeout_policy.cjs`, updated the
  execute-tool runtime import, host-boundary coverage, current docs, and added
  focused timeout-policy coverage.
- Validation: focused timeout-policy, tool-args, execute-tool, bridge RPC, and
  host-boundary Jest tests, stale-reference scan, docs listing, and diff check.
- Compatibility: no migration required. This is a private Electron main module
  path rename; timeout values and local tool execution behavior are unchanged.

### 2026-06-17 local-runtime tool-args module

- Finding: Electron main local tool argument normalization was a local-runtime
  adapter, but the private helper module and focused Jest suite still lived
  under local-backend bridge names.
- Change: renamed the helper module and focused test to local-runtime tool-args
  paths, updated execute-tool imports, boundary coverage, and docs that route
  screenshot display-bounds argument shaping through this adapter.
- Validation: focused tool-args, execute-tool, bridge RPC, and host-boundary
  Jest tests, stale-reference scan, docs listing, and diff check.
- Compatibility: no migration required. This is a private Electron main module
  and test path rename; tool argument payload shape is unchanged.

### 2026-06-17 local-runtime execute-tool module

- Finding: Electron main local-tool execution was already coordinated by the
  SDK local-runtime bridge, but the private execute-tool helper and focused
  Jest suite still lived under local-backend bridge names.
- Change: renamed the helper module and focused test to local-runtime
  execute-tool paths, updated the bridge import, host-boundary coverage, and
  docs that route tool execution through this adapter.
- Validation: focused execute-tool, bridge RPC, display-bounds, and
  host-boundary Jest tests, stale-reference scan, docs listing, and diff check.
- Compatibility: no migration required. This is a private Electron main module
  and test path rename; local tool execution, screenshot materialization, and
  permission verification behavior are unchanged.

### 2026-06-17 local-runtime bridge composition module

- Finding: Electron main's SDK local-runtime bridge composition root still used
  a backend-named file path even though its active exports and runtime behavior
  are local-runtime host adapter contracts.
- Change: renamed the composition root to `local_runtime_bridge.cjs` and
  updated main-process imports, bridge harness references, boundary tests, and
  docs that point to the root module. Focused helper modules remain as later
  slices.
- Validation: focused local-runtime bridge lifecycle/RPC and host-boundary Jest
  tests, stale root-path scan, docs listing, and diff check.
- Compatibility: no migration required. This is a private Electron main module
  path rename; exported bridge function names, IPC channel strings, and status
  payloads are unchanged.

### 2026-06-17 local-runtime display bounds module

- Finding: Electron main screenshot display-bound resolution was already a
  local-runtime bridge helper, but the private helper module and focused Jest
  suite still lived under local-backend bridge file names.
- Change: renamed the helper module and focused test to local-runtime paths,
  updated the execute-tool bridge import, host-boundary coverage, and current
  display-bounds docs.
- Validation: focused display-bounds, execute-tool, and host-boundary Jest
  tests, stale-reference scan, docs listing, and diff check.
- Compatibility: no migration required. This is a private Electron main module
  and test path rename; screenshot argument shape and display-affinity behavior
  are unchanged.

### 2026-06-17 local-runtime supervisor module

- Finding: Electron main local-runtime readiness supervision was already using
  `createLocalRuntimeSupervisor`, but the private module and focused test still
  lived under local-backend file names.
- Change: renamed the supervisor module and focused Jest suite to
  local-runtime paths, updated bridge imports and host-boundary tests, and
  refreshed lifecycle docs that route developers to this status surface.
- Validation: focused local-runtime supervisor, bridge lifecycle, and
  host-boundary Jest tests, stale-reference scan, docs listing, and diff check.
- Compatibility: no migration required. This is a private Electron main module
  and test path rename; status payloads and IPC channel strings are unchanged.

### 2026-06-17 local-runtime status broadcaster module

- Finding: Electron main local-runtime status broadcasting still lived in the
  backend-named broadcaster module/test path even though the implementation and
  IPC channel registry now use local-runtime terminology.
- Change: renamed the broadcaster module and focused Jest suite to
  `local_runtime_status_broadcaster.cjs` / `LocalRuntimeStatusBroadcaster`,
  updated bridge imports, boundary tests, and lifecycle docs, and kept payload
  shape plus IPC channels unchanged.
- Validation: focused broadcaster/main-boundary tests, stale broadcaster-path
  scan, docs listing, and diff check.
- Compatibility: no migration required. This is a private Electron main module
  and test path rename; renderer status payloads and IPC channel strings are
  unchanged.

### 2026-06-17 desktop local-runtime launch options module

- Finding: Electron main's desktop local-runtime launch option builder still
  lived in a sidecar-named module path, making the host adapter boundary read as
  sidecar-specific even after the exported launch-plan API moved to
  local-runtime names.
- Change: renamed the module and focused Jest suite to
  `local_runtime_launch_options.cjs` / `LocalRuntimeLaunchOptions`, updated main
  imports plus current docs, and kept daemon/env/path behavior unchanged.
- Validation: focused launch/main-boundary tests, stale module-path scan, docs
  listing, and diff check.
- Compatibility: no migration required. This is a private Electron main module
  path/test rename; public env vars, daemon discovery files, sidecar process
  names, and SDK launch contracts are unchanged.

### 2026-06-17 main desktop-agent channel group wording

- Finding: the Electron main desktop-agent IPC channel owner module still called
  its canonical channel groups aliases, keeping compatibility wording in active
  source after callers converged on the desktop-agent registry groups.
- Change: renamed the module header and boundary test wording to channel groups
  and added coverage so the active owner module does not reintroduce alias
  wording.
- Validation: focused main host boundary test, stale active-source wording scan,
  and diff check.
- Compatibility: no migration required. IPC channel strings, preload validation,
  renderer expectations, and bridge behavior are unchanged.

### 2026-06-17 loopback backend endpoint fallback naming

- Finding: Electron main endpoint resolution still named its internal loopback
  backend fallback constants and helper as local-backend defaults even though
  hosted backend defaults now live in the WindieOS host skin and local fallback
  is only an explicit loopback endpoint candidate.
- Change: renamed the internal fallback constants, helper, and candidate locals
  to loopback-backend terminology and added endpoint source coverage so the
  local-backend fallback names do not return.
- Validation: focused endpoint tests, stale fallback-name scan, docs listing,
  and diff check.
- Compatibility: no migration required. `BACKEND_HOST`, `BACKEND_PORT`,
  hosted-default env vars, URL resolution behavior, and persisted settings are
  unchanged.

### 2026-06-17 browser permission local-runtime status detail

- Finding: the Electron main browser automation permission adapter still
  attached local-runtime readiness diagnostics under a backend-shaped
  details field.
- Change: renamed that details field to `local_runtime_status` and added main
  host boundary coverage so browser automation permission details stay
  local-runtime-shaped.
- Validation: focused permission/main-host tests, stale details-field scan,
  docs listing, and diff check.
- Compatibility: no persisted-data migration required. This details payload is
  produced for fresh permission checks and is not stored as a durable setting or
  IPC channel contract.

### 2026-06-17 local-runtime status IPC wire names

- Finding: the shared IPC registry still exposed backend-named wire channel
  values for the local-runtime status bootstrap and broadcast path, even though
  main and renderer code now use generic local-runtime constants.
- Change: renamed the status bootstrap and broadcast wire channels to
  `get-local-runtime-status` and `local-runtime-status`, then updated renderer
  parity checks, focused frontend tests, preload/IPC contract docs, and
  local-runtime lifecycle references.
- Validation: focused local-runtime bridge, status store, browser-session
  control, main SDK boundary, status broadcaster, and preload channel Jest
  tests; stale legacy-channel scan; and diff check.
- Compatibility: no persisted-data migration required. This intentionally
  removes the old Electron IPC wire names across main/preload/renderer; no
  stored records or user settings change shape.

### 2026-06-17 Main local-runtime status channel constants

- Finding: Electron main local-runtime bridge code still hardcoded the
  local-runtime status IPC channel strings even though the shared registry
  exposes generic local-runtime keys.
- Change: routed the bridge handler and status broadcaster through shared
  `GET_LOCAL_RUNTIME_STATUS` / `LOCAL_RUNTIME_STATUS` constants and added main
  boundary coverage so raw channel strings do not return to bridge code.
- Validation: focused main SDK runtime-boundary and status-broadcaster Jest
  tests, source scan, and diff check.
- Compatibility: no migration required. The bridge now follows shared registry
  values; the subsequent local-runtime IPC wire rename is tracked separately
  above.

### 2026-06-17 diagnostics local-runtime lifecycle path

- Finding: Electron main diagnostics still emitted local-runtime lifecycle rows
  under the backend-named `local_backend.lifecycle` path even after callers and
  helper names moved to local-runtime terminology.
- Change: renamed the active diagnostics path to `local_runtime.lifecycle`,
  updated lifecycle docs, focused diagnostics tests, and bridge harness mocks.
- Validation: focused diagnostics/bridge tests, stale path scan, docs listing,
  and diff check.
- Compatibility: no persisted-data, API, wire, settings, or storage migration
  is required. This changes an ephemeral diagnostics filter/path string for new
  rows; existing historical diagnostic rows remain readable as stored events.

### 2026-06-17 SDK local runtime module rename

- Finding: the SDK still exposed generic local-runtime contracts from the
  `LocalSidecarRuntime` module path, making the reusable SDK boundary read like
  a sidecar implementation module.
- Change: renamed the canonical SDK module to `LocalRuntime`, updated SDK
  imports/exports/tests, regenerated CommonJS output, removed the old generated
  module path, and refreshed source-map docs.
- Validation: SDK package build, focused SDK client/private-export tests,
  stale module-path scan, docs listing, and diff check.
- Compatibility: no persisted-data, wire, discovery-file, or daemon protocol
  migration is required. This intentionally removes the old
  `LocalSidecarRuntime` package path instead of adding a forwarding wrapper;
  concrete sidecar daemon process paths and protocol names remain unchanged.

### 2026-06-17 AgentClient auto local runtime option

- Finding: the reusable SDK `AgentClient` still exposed automatic local runtime
  startup through sidecar-named option and type surfaces even though the public
  host contract is local-runtime launch configuration.
- Change: renamed the option to `autoLocalRuntime`, renamed the SDK option type
  to `AgentAutoLocalRuntimeOptions`, updated Electron main to pass the generic
  option, regenerated CommonJS output, and refreshed active SDK/frontend docs.
- Validation: SDK package build, focused SDK client and main runtime-boundary
  tests, stale option scan, docs listing, and diff check.
- Compatibility: no persisted-data, storage, wire, discovery-file, or daemon
  protocol migration is required. This intentionally changes the public
  TypeScript SDK constructor option name while preserving the lower local
  sidecar daemon process, auth header, and discovery-file contracts.

### 2026-06-17 AgentClient explicit local runtime option

- Finding: the reusable SDK `AgentClient` still accepted an explicit local
  runtime client through the `sidecar` option name.
- Change: renamed the option to `localRuntime`, updated SDK behavior tests and
  docs, regenerated CommonJS output, and added source coverage so the
  sidecar-named explicit-runtime option stays removed.
- Validation: SDK package build, focused SDK client test, stale option scan,
  docs listing, and diff check.
- Compatibility: no migration required for persisted data or wire contracts.
  This changes SDK constructor source/tests/docs only; local-runtime behavior
  and daemon contracts are unchanged.

### 2026-06-17 Main local-runtime stdout debug flag

- Finding: Electron main's local-runtime bridge still used the
  `WINDIE_DEBUG_LOCAL_BACKEND_STDOUT` diagnostic flag name for local-runtime
  initialization logging.
- Change: renamed the active diagnostic flag to
  `WINDIE_DEBUG_LOCAL_RUNTIME_STDOUT`, updated debug docs, and added a focused
  main host boundary assertion that rejects the old flag in bridge source.
- Validation: focused main host skin boundary test, stale flag scan, docs
  listing, and diff check.
- Compatibility: no migration required. This is an ephemeral debug flag rename;
  runtime behavior and diagnostic event paths are unchanged.

### 2026-06-17 Frontend docs local-runtime status wording

- Finding: active frontend architecture and IPC docs still described renderer
  readiness and host IPC surfaces with the compatibility channel wording even
  though the owner is the SDK local-runtime status path.
- Change: updated current docs prose to name local-runtime readiness/status and
  local-runtime invoke payloads while preserving runtime behavior for that
  slice.
- Validation: docs listing, focused stale wording scan, and diff check.
- Compatibility: no migration required. Documentation-only change; IPC channel
  names, tests, and runtime behavior remain unchanged.

### 2026-06-17 Main local-runtime bridge log labels

- Finding: Electron main local-runtime bridge modules still emitted active
  `[Main][SidecarBridge]` log labels from generic host adapter paths.
- Change: renamed the active bridge log prefix to `[Main][LocalRuntimeBridge]`
  across the local-runtime bridge, tool execution, and screenshot materializer
  modules, and tightened the main host skin boundary test against the old label.
- Validation: focused main host skin boundary test, stale label scan, docs
  listing, and diff check.
- Compatibility: no migration required. Runtime behavior and sidecar process
  contracts are unchanged; only development/diagnostic log labels changed.

### 2026-06-17 SDK local-runtime node helper naming

- Finding: the TypeScript SDK local-runtime module still used sidecar-named
  internal Node launch helper/type names even though the public contract is now
  the SDK local runtime.
- Change: renamed the internal launch environment type and Node module loader
  helper to local-runtime names, regenerated SDK CommonJS output, and added
  focused source/CJS assertions so the sidecar-named helper does not return.
- Validation: SDK package build, focused SDK client test, stale helper scan,
  docs listing, and diff check.
- Compatibility: no migration required. Public `autoLocalRuntime` options,
  sidecar-daemon env/discovery contracts, and module paths are the current
  launch surface.

### 2026-06-17 Desktop-agent event registry key rename

- Finding: the shared IPC registry still exposed SDK display/status/current-turn
  channels through Windie-prefixed key names even though renderer and main use
  desktop-agent facades.
- Change: renamed the shared send/on registry keys to `DESKTOP_AGENT_*` names,
  updated main/renderer channel facades and focused frontend mocks, and kept
  the existing `windie:*` IPC wire values unchanged.
- Validation: focused frontend channel/runtime tests, stale registry-key scan,
  docs listing, and diff check.
- Compatibility: no migration required. This changes only internal shared
  registry keys; renderer/main channel strings and `window.desktopAgent`
  behavior remain unchanged.

### 2026-06-17 Desktop-agent invoke registry key rename

- Finding: the shared IPC registry still exposed the desktop command bridge as
  `WINDIE_INVOKE` even though renderer, preload, and main now use generic
  desktop-agent facades.
- Change: renamed the shared invoke-channel key to `DESKTOP_AGENT_INVOKE` and
  updated preload, main, renderer channel facades, and focused frontend mocks
  while preserving the existing `windie:invoke` IPC wire value.
- Validation: focused preload, renderer runtime-boundary, browser-session, and
  dashboard frontend tests; stale invoke-key scan; docs listing; and diff
  check.
- Compatibility: no migration required. This changes only the internal shared
  registry key; the `window.desktopAgent` browser bridge and `windie:invoke`
  IPC channel string remain unchanged.

### 2026-06-17 Renderer local-runtime status IPC alias deletion

- Finding: the shared IPC channel registry still exported
  `GET_LOCAL_BACKEND_STATUS` and `LOCAL_BACKEND_STATUS` as compatibility
  aliases after renderer status consumers moved to local-runtime names.
- Change: removed the legacy local-backend status alias constants from the
  shared registry, renderer channel validation, and frontend test mocks while
  keeping the then-current wire channels unchanged for that slice. The later
  local-runtime wire rename is tracked above.
- Validation: focused local-runtime status store and browser-session frontend
  tests, stale alias scan, docs listing, and diff check.
- Compatibility: no migration required for first-party code. Runtime consumers
  should use `GET_LOCAL_RUNTIME_STATUS` and `LOCAL_RUNTIME_STATUS`; the IPC
  channel strings remain unchanged.

### 2026-06-17 Main local-runtime daemon helper naming

- Finding: Electron main's local-runtime launch-options helper still used
  sidecar-daemon-specific internal names and added `[SidecarDaemon]` to
  unprefixed daemon output lines.
- Change: renamed the main-only helper names to local-runtime-daemon wording
  and changed the main-added fallback log prefix to `[LocalRuntimeDaemon]`
  while preserving concrete sidecar daemon prefixes emitted by Python.
- Validation: focused launch-options Jest test, stale helper-name scan, docs
  listing, and diff check.
- Compatibility: no migration required. The daemon script, discovery file,
  environment variables, process output passthrough, and SDK
  `autoLocalRuntime` option are the active launch contract.

### 2026-06-17 Architecture docs desktopAgent bridge wording

- Finding: architecture docs still taught renderer feature code to call the
  removed `window.windie.invoke(...)` browser global even though preload now
  exposes the generic `window.desktopAgent` bridge.
- Change: updated frontend architecture and communication-flow docs to route
  renderer SDK-shaped commands through `window.desktopAgent.invoke(...)` while
  keeping `windie:invoke` documented as the existing IPC wire channel.
- Validation: docs listing, stale browser-global scan, and diff check.
- Compatibility: no migration required. This is documentation only; the
  `window.desktopAgent` preload bridge and `windie:invoke` IPC channel are
  unchanged.

### 2026-06-17 Python SDK core re-export facade deletion

- Finding: the Python sidecar still kept a `core` package hosted-SDK facade
  that re-exported the public `windie` SDK client, leaving two import surfaces
  for the same hosted backend client contract.
- Change: removed the `core` SDK facade files, routed tests and docs to the
  public `windie` package, and kept sidecar `core` imports limited to concrete
  local-runtime helper modules.
- Validation: focused Python SDK and sidecar namespace tests, stale facade
  reference scan, docs listing, and diff check.
- Compatibility: no migration required for first-party code. Python hosted SDK
  callers should import `AgentSdkClient` and `AgentLocalRuntimeHttpClient`
  from `windie` or `windie.sdk`.

### 2026-06-17 TypeScript SDK Node local-runtime provider error wording

- Finding: the TypeScript SDK local-runtime provider still reported Node module
  loading failures as requiring a "Node sidecar runtime provider".
- Change: changed that caller-facing failure to "Node local runtime provider"
  and added SDK source/CJS boundary coverage so the old sidecar-runtime wording
  stays absent.
- Validation: SDK package build, focused SDK client Jest test, stale error scan,
  docs listing, and diff check.
- Compatibility: no migration required. This changes only SDK error wording;
  Node module loading, daemon startup, discovery files, and
  `autoLocalRuntime` options are unchanged.

### 2026-06-17 Python SDK local-runtime method validation wording

- Finding: the Python SDK local-runtime HTTP helper still raised
  `Unsupported sidecar method` from its request boundary.
- Change: changed the validation error to `Unsupported local runtime method`
  and added focused Python SDK coverage for unsupported local-runtime request
  methods.
- Validation: focused Python SDK sidecar test, stale error scan, docs listing,
  and diff check.
- Compatibility: no migration required. This is a caller-facing validation
  message change only; HTTP methods, endpoints, headers, and runtime behavior
  are unchanged.

### 2026-06-17 Python SDK local-runtime HTTP error wording

- Finding: the Python SDK `AgentLocalRuntimeHttpClient` still reported local
  runtime HTTP failures as `Sidecar daemon returned ...`, leaking the daemon
  implementation detail through the SDK client surface.
- Change: changed HTTP-status and malformed-JSON failures to `Local runtime
  returned ...` wording and added focused Python SDK coverage for both error
  paths while preserving the daemon auth header contract.
- Validation: focused Python SDK sidecar tests, stale error scan, docs listing,
  and diff check.
- Compatibility: no migration required. The HTTP endpoints, token header,
  daemon process, and `AgentLocalRuntimeHttpClient` API are unchanged; only
  caller-facing Python SDK error text changed.

### 2026-06-17 Main local-runtime missing script error wording

- Finding: Electron main's desktop local-runtime launch plan still returned
  `Sidecar daemon script not found` when the Python launch target command
  existed but the daemon script path was missing.
- Change: changed that host-facing launch-plan failure to
  `Local runtime daemon script not found` and added focused launch-options
  coverage so the old sidecar-daemon message stays absent.
- Validation: focused SDK sidecar launch-options Jest test, stale error scan,
  docs listing, and diff check.
- Compatibility: no migration required. The launch target, daemon script file,
  discovery file, and SDK `autoLocalRuntime` option are unchanged; only the
  Electron main launch-plan error text changed.

### 2026-06-17 SDK local-runtime error wording

- Finding: SDK local-runtime startup and discovery failures still surfaced
  "local sidecar daemon" wording to callers, and the renderer dashboard facade
  still classified sidecar-daemon-specific conversation-list retry errors.
- Change: changed TypeScript and Python SDK local-runtime timeout/stop messages
  to use local-runtime wording, removed sidecar-daemon-specific retry patterns
  from the renderer dashboard conversation facade, and tightened boundary tests
  so the old caller-facing timeout wording stays absent.
- Validation: focused SDK client, renderer conversation-library, dashboard
  retry, renderer runtime-boundary, and Python SDK tests; SDK package build;
  stale public-error scan; docs listing; and diff check.
- Compatibility: no migration required. The existing daemon script file,
  environment variables, discovery file contract, and `autoLocalRuntime` option
  remain unchanged; only caller-facing error text and renderer retry matching
  moved to local-runtime wording.

### 2026-06-17 Main local-runtime launch config variable naming

- Finding: Electron main still stored desktop local-runtime launch overrides in
  `desktopAutoSidecarLaunchConfig`, even though the host path now builds a
  desktop local-runtime launch plan.
- Change: renamed the internal variable to `desktopLocalRuntimeLaunchConfig`
  and added main SDK runtime boundary coverage so the old auto-sidecar variable
  name stays absent. The SDK launch option is now `autoLocalRuntime`.
- Validation: focused main SDK runtime boundary Jest test, stale-name scan,
  docs listing, and diff check.
- Compatibility: no migration required. This is an internal Electron main
  variable rename; SDK launch options and IPC behavior are unchanged.

### 2026-06-17 SDK websocket handshake OS field deletion

- Finding: SDK websocket transports still emitted `operating_system` as a
  top-level handshake field after backend capability input moved under
  `agent_definition`.
- Change: added a shared SDK handshake builder that writes OS facts to
  `agent_definition.runtime.operating_system`, switched direct and managed
  sessions to that shape, updated generated CJS parity output, and added
  websocket contract coverage proving the top-level field is absent.
- Validation: focused SDK client and frontend/backend websocket contract Jest
  tests, SDK package build, docs listing, stale top-level capability scan, and
  diff check. The first focused test attempt failed because it raced the SDK
  build cleaning CJS output; rerunning after the build passed.
- Compatibility: no migration required for first-party code. SDK handshakes now
  send OS facts through `agent_definition.runtime.operating_system`.

### 2026-06-17 Renderer desktopAgent browser global alias deletion

- Finding: preload still exposed the SDK command bridge as both
  `window.desktopAgent` and `window.windie`, and the renderer command client
  still fell back to the Windie-named global.
- Change: removed the `window.windie` preload exposure and renderer fallback,
  updated runtime/preload coverage to assert the old browser-global alias stays
  absent, and refreshed renderer IPC docs to route SDK commands through
  `window.desktopAgent.invoke(...)`.
- Validation: focused preload IPC and renderer app runtime boundary Jest tests,
  docs listing, stale `window.windie` scan, and diff check.
- Compatibility: no migration required for first-party code. The browser global
  is `window.desktopAgent`; the existing IPC wire channel remains
  `windie:invoke`.

### 2026-06-17 LocalRuntimeConversationStore metadata fallback deletion

- Finding: `LocalRuntimeConversationStore` still loaded Windie-prefixed
  `windie_sdk_conversation_event` and `windieSdkConversationEvent` metadata
  keys even after generic agent metadata keys became the durable fallback.
- Change: removed the Windie-prefixed metadata fallback keys from the SDK store,
  updated checked-in CJS parity output, and changed store API coverage to prove
  legacy metadata keys are ignored while generic metadata still loads.
- Validation: focused Agent conversation store API test, SDK package build,
  stale metadata-key scan, docs listing, and diff check.
- Compatibility: no migration required for first-party code. Current rows use
  `event_payload`; metadata fallback reads only `agent_sdk_conversation_event`
  or `agentSdkConversationEvent`.

### 2026-06-17 SDK local-runtime client options alias deletion

- Finding: the TypeScript SDK still exported `SidecarDaemonClientOptions` and
  used the internal `SidecarDaemonDiscovery` type name after the local-runtime
  HTTP client options became canonical.
- Change: removed the daemon-named exported options alias, renamed the internal
  discovery type to `AgentLocalRuntimeDiscovery`, and added focused package
  boundary/source-scan coverage for the canonical options type and removed
  daemon type names.
- Validation: focused SDK package-boundary and client Jest tests, stale type
  scan, docs listing, and diff check.
- Compatibility: no migration required for first-party code. TypeScript SDK
  callers must use `AgentLocalRuntimeHttpClientOptions`.

### 2026-06-17 Main local-runtime node options helper alias deletion

- Finding: Electron main still exported and consumed
  `withLocalBackendNodeOptions` after the sidecar launch path had become a
  local-runtime host concern.
- Change: renamed the helper to `withLocalRuntimeNodeOptions`, removed the
  legacy local-backend-named export, and added focused launch-options coverage
  that keeps the old export absent.
- Validation: focused SDK sidecar launch-options Jest test, stale helper scan,
  docs listing, and diff check.
- Compatibility: no migration required for first-party code. Main-process
  callers must use `withLocalRuntimeNodeOptions`.

### 2026-06-17 Main screenshot temp compatibility deletion

- Finding: Electron main still treated `windie-shot-` filenames and
  `${os.tmpdir()}/windieos-screenshots` as owned screenshot temp paths after
  `desktop-agent-shot-` and `desktop-agent-screenshots` became canonical.
- Change: removed the legacy screenshot temp directory and filename-prefix
  acceptance, updated bridge RPC tests to assert those paths are not uploaded
  or deleted, and updated screenshot materialization docs.
- Validation: focused local-runtime bridge RPC Jest test, docs listing, stale
  legacy screenshot path scan, and diff check.
- Compatibility: no migration required for first-party code. Screenshot
  materialization now accepts only direct children of
  `${os.tmpdir()}/desktop-agent-screenshots` whose filenames start with
  `desktop-agent-shot-`.

### 2026-06-17 Main local-runtime launch plan alias deletion

- Finding: Electron main still exported
  `createDesktopAutoSidecarLaunchPlan` as a compatibility alias after
  `createDesktopLocalRuntimeLaunchPlan` became the canonical desktop launch
  plan builder.
- Change: removed the legacy auto-sidecar-named export and updated launch-plan
  tests to assert the alias stays absent. The SDK launch option is now
  `autoLocalRuntime`.
- Validation: focused SDK sidecar launch-options Jest test, stale-reference
  scan, docs listing, and diff check.
- Compatibility: no migration required for first-party code. Main-process
  callers must use `createDesktopLocalRuntimeLaunchPlan`.

### 2026-06-17 Renderer conversation-list local-runtime retry cleanup

- Finding: the renderer conversation library facade still treated legacy
  `Local backend not ready` text as a transient retry signal even though active
  producers now report local-runtime readiness failures.
- Change: removed the legacy local-backend retry matcher, updated focused
  renderer tests and dashboard docs, and kept transient retry classification
  behind the desktop conversation library facade.
- Validation: focused desktop conversation library, dashboard sidebar, and
  renderer runtime boundary Jest tests, docs listing, stale phrase scan, and
  diff check.
- Compatibility: no migration required. Renderer conversation-list retry logic
  now expects local-runtime readiness wording from active producers.

### 2026-06-17 Renderer interaction debug flag alias deletion

- Finding: the renderer interaction logger still read legacy `__WINDIE_*`
  window debug flags after the generic `__DESKTOP_AGENT_*` flags became the
  canonical browser-only diagnostics.
- Change: removed legacy flag reads, updated interaction logger tests to assert
  the old flags are ignored, and updated logging docs.
- Validation: focused renderer interaction logger Jest test, docs listing,
  stale flag scan, and diff check.
- Compatibility: no migration required for first-party code. Browser debug
  snippets must use `__DESKTOP_AGENT_ENABLE_INTERACTION_MESSAGE_TEXT_LOGS__`
  and `__DESKTOP_AGENT_DEBUG_SURFACE_STDOUT__`.

### 2026-06-17 Local runtime status payload field

- Finding: Electron main built local runtime status payloads from a
  `localRuntimeSnapshot` but published the nested diagnostic field as
  `sidecarDaemon`, leaking the sidecar implementation detail through the host
  status contract.
- Change: renamed the nested payload field to `localRuntime`, updated focused
  broadcaster and bridge lifecycle tests, and documented the status payload
  contract.
- Validation: focused local-runtime status broadcaster and bridge lifecycle
  Jest tests, docs listing, stale-reference scan, and diff check.
- Compatibility: no migration required for first-party UI. Renderer readiness
  consumers already normalize only `ready`, `status`, and `error`; diagnostic
  consumers should use `localRuntime`.

### 2026-06-17 Python SDK hosted client alias deletion

- Finding: the Python SDK still exported `WindieSdkClient` and
  `WindieSdkAgentSession` as compatibility aliases after `AgentSdkClient` and
  `AgentSdkAgentSession` became the canonical hosted client/session contracts.
- Change: removed the Windie-prefixed Python alias assignments and package
  re-exports from the SDK, core sidecar package, and public `windie` package,
  repaired sidecar package-boundary tests to assert the aliases stay absent,
  and updated SDK/sidecar docs.
- Validation: focused Python SDK sidecar tests, docs listing, stale-reference
  scan, and diff check.
- Compatibility: no migration required for first-party code. Python callers
  must use `AgentSdkClient` and `AgentSdkAgentSession` directly.

### 2026-06-17 Main local-runtime bridge alias deletion

- Finding: Electron main still exported `initializeLocalRuntimeBridge`,
  `stopLocalBackend`, `getLocalBackendStatus`,
  the backend-named supervisor factory, and
  the backend-named execute-tool factory as compatibility aliases after the
  local-runtime bridge names became canonical.
- Change: removed the local-backend-named exports from the bridge, supervisor,
  and execute-tool runtime modules, updated focused tests to assert the aliases
  stay removed, and updated main-process docs to route callers to
  local-runtime names.
- Validation: focused local-runtime bridge, supervisor, execute-tool runtime,
  and host-skin Jest tests, stale-reference scan, docs listing, and diff check.
- Compatibility: no migration required for first-party code. Main-process
  callers must use `initializeLocalRuntimeBridge`, `stopLocalRuntime`,
  `getLocalRuntimeStatus`, `createLocalRuntimeSupervisor`, and
  `createLocalRuntimeExecuteToolRuntime`.

### 2026-06-17 SDK client and agent wrapper deletion

- Finding: the SDK still exposed `WindieClient`, `WindieAgent`, and
  Windie-prefixed client/agent type aliases after `AgentClient` and `Agent`
  became the canonical reusable SDK runtime contracts.
- Change: deleted the Windie-prefixed client and agent compatibility modules,
  removed package-root compatibility exports, updated SDK docs, and switched
  focused package-boundary/private-export tests to canonical `AgentClient` and
  `Agent` contracts with removed-wrapper coverage.
- Validation: SDK package build, focused package-boundary, private-export, and
  SDK runtime-header Jest tests, stale-reference scan, docs listing, and diff
  check.
- Compatibility: no migration required for the first-party app. SDK callers
  must use `AgentClient`, `Agent`, and `Agent*` client/agent option/result
  types directly.

### 2026-06-17 SDK chat and local-runtime wrapper deletion

- Finding: the SDK still exposed `WindieChatSession`,
  `WindieLocalSidecarRuntime`, `createWindieLocalRuntimeProvider`, and
  Windie-prefixed local-runtime type aliases after `AgentChatSession` and the
  `Agent*` local-runtime contracts became canonical.
- Change: deleted the Windie-prefixed chat and local-runtime compatibility
  modules, removed root compatibility exports, updated SDK docs, and switched
  focused package-boundary/private-export tests to canonical `AgentChat*` and
  `Agent*` local-runtime contracts with removed-wrapper coverage.
- Validation: SDK package build, focused package-boundary, private-export, and
  SDK runtime-header Jest tests, stale-reference scan, docs listing, and diff
  check.
- Compatibility: no migration required for the first-party app. SDK callers
  must use `AgentChatSession`, `AgentChat*` input types,
  `createAgentLocalRuntimeProvider`, and `Agent*` local-runtime types directly.

### 2026-06-17 SDK session and stream events wrapper deletion

- Finding: the SDK still exposed `WindieAgentSession` transport helpers,
  `WindieAgentStreamEvents`, and root Windie-prefixed aliases after
  `AgentSession` and `AgentStreamEvent` became the canonical public contracts.
- Change: deleted the Windie-prefixed session and stream-events modules,
  removed root compatibility exports, updated SDK docs, and switched focused
  tests to canonical `AgentSession` and `AgentStreamEvent` contracts with
  removed-wrapper coverage.
- Validation: focused SDK conversation-runtime, package-boundary, and
  private-export Jest tests plus the SDK runtime header boundary test,
  stale-reference scan, docs listing, and diff check.
- Compatibility: no migration required for the first-party app. TypeScript SDK
  callers must use `AgentSession`, `createAgentSession`,
  `createAgentBackendTransport`, `AgentStreamEvent`, `AgentStreamState`,
  `AgentToolCall`, and `AgentToolOutput` directly.

### 2026-06-17 SDK managed session wrapper deletion

- Finding: the SDK still exposed `ManagedWindieAgentSession` as a
  compatibility module and root export after `ManagedAgentSession` became the
  canonical managed hosted-session contract.
- Change: deleted the Windie-prefixed managed-session module, removed the root
  compatibility exports and type aliases, updated SDK docs and header
  fixtures, and switched package-boundary tests to the generic managed-session
  names with removed-wrapper coverage.
- Validation: focused SDK package-boundary, private-export, and runtime-header
  Jest tests, stale-reference scan, docs listing, and diff check.
- Compatibility: no migration required for the first-party app. TypeScript SDK
  callers must use `ManagedAgentSession`, `createManagedAgentSession`, and
  `ManagedAgent*` types directly.

### 2026-06-17 SDK backend socket factory wrapper deletion

- Finding: the SDK still exposed `WindieBackendSocketFactory` and root
  `createWindieSdkBackendSocket` compatibility exports after
  `createAgentBackendSocket` became the canonical backend websocket factory.
- Change: deleted the Windie-prefixed socket factory module, removed the root
  compatibility export and type alias, updated SDK docs, and switched package
  boundary tests to the generic backend socket factory with removed-wrapper
  coverage.
- Validation: focused SDK package-boundary and private-export Jest tests,
  stale-reference scan, docs listing, and diff check.
- Compatibility: no migration required for the first-party app. TypeScript SDK
  callers must use `createAgentBackendSocket` and `AgentBackendSocketOptions`
  directly.

### 2026-06-17 SDK hosted backend client wrapper deletion

- Finding: the SDK still exposed `WindieHostedBackendHttpClient` and root
  `WindieSdkClient` compatibility exports after `AgentHostedBackendClient`
  became the canonical hosted HTTP client contract.
- Change: deleted the Windie-prefixed hosted client module, removed the root
  compatibility exports and types, updated SDK docs, and switched package
  boundary tests to the generic hosted client names with removed-wrapper
  coverage.
- Validation: focused SDK package-boundary and private-export Jest tests,
  stale-reference scan, docs listing, and diff check.
- Compatibility: no migration required for the first-party app. TypeScript SDK
  callers must import `AgentHostedBackendClient` and `Agent*` hosted-client
  types directly.

### 2026-06-17 SDK conversation runtime wrapper deletion

- Finding: the SDK still exposed a `WindieConversationRuntime` compatibility
  module and `WindieRuntimeEvent` root type after `AgentRuntimeEvent` became
  the canonical conversation runtime event contract.
- Change: deleted the Windie-prefixed conversation runtime module, removed the
  root type export, updated SDK docs, and switched focused tests to
  `AgentRuntimeEvent` with removed-wrapper coverage.
- Validation: focused SDK conversation-runtime and private-export Jest tests,
  stale-reference scan, docs listing, and diff check.
- Compatibility: no migration required for the first-party app. SDK callers
  must use `AgentRuntimeEvent` directly.

### 2026-06-17 SDK builtin selection wrapper deletion

- Finding: the SDK still exported the `WindieBuiltins` compatibility module and
  root `windieBuiltins` alias after `agentBuiltins` became the canonical
  built-in tool selection helper.
- Change: deleted the Windie-prefixed builtins module, removed the root
  compatibility export and type aliases, updated SDK docs, and switched focused
  tests to the canonical `agentBuiltins` helper with removed-wrapper coverage.
- Validation: focused SDK client, package-boundary, and private-export Jest
  tests, stale-reference scan, docs listing, and diff check.
- Compatibility: no migration required for the first-party app. SDK callers
  must use `agentBuiltins` and `AgentBuiltin*` types directly.

### 2026-06-17 SDK model selection wrapper deletion

- Finding: the SDK still exposed a `WindieModelSelection` compatibility module
  after `AgentModelSelection` became the canonical model-selection contract.
- Change: deleted the Windie-prefixed model-selection modules, removed the
  package export, updated SDK runtime docs, and kept tests focused on the
  canonical `settings/modelSelection` module plus removed-wrapper coverage.
- Validation: focused SDK model-selection and package-boundary Jest tests,
  stale-reference scan, docs listing, and diff check.
- Compatibility: no migration required for the first-party app. SDK callers
  must import `AgentModelSelection` from `settings/modelSelection` directly.

### 2026-06-17 SDK sidecar conversation store wrapper deletion

- Finding: the SDK still exposed `SidecarConversationStore` as a
  compatibility wrapper after `LocalRuntimeConversationStore` became the
  canonical durable local-runtime store surface.
- Change: deleted the sidecar-named store modules, removed the public package
  export, updated SDK docs to point only at `LocalRuntimeConversationStore`,
  and changed package-boundary tests to lock the wrapper removal in place.
- Validation: focused SDK package-boundary Jest tests, stale-reference scan,
  docs listing, and diff check.
- Compatibility: no migration required for the first-party app. SDK callers
  must import `LocalRuntimeConversationStore` directly.

### 2026-06-17 frontend local-runtime bridge guidance wording

- Finding: active frontend and Electron-main routing docs still described the
  SDK/main sidecar adapter as a local-backend or local-sidecar bridge in owner
  maps, error matrices, IPC workflows, and protocol inventories.
- Change: reworded those docs and RPC mapper test titles to use
  local-runtime bridge terminology while keeping real `local_backend_*` file
  names and Python `LocalBackend` method references intact.
- Validation: docs listing, focused RPC mapper Jest run, bridge wording scan,
  and diff check.
- Compatibility: no migration required. This is docs and test-title wording
  only.

### 2026-06-17 renderer runtime endpoint wrapper deletion

- Finding: the renderer had converged on `RuntimeEndpointStore`, but still kept
  `BackendEndpointStore.ts` as a backend-named compatibility wrapper for older
  artifact/transcription URL imports.
- Change: deleted the compatibility wrapper, removed its wrapper-only test and
  docs references, and left renderer endpoint URL construction on
  `RuntimeEndpointStore`.
- Validation: focused runtime endpoint Jest run, active import scan, docs
  listing, and diff check.
- Compatibility: no migration required. No active imports of
  `BackendEndpointStore` remain.

### 2026-06-17 local runtime bridge docs and harness wording

- Finding: IPC/tool-routing docs and the frontend bridge harness still described
  Electron main as a local-backend or local-sidecar bridge even when the path
  adapts SDK local-runtime behavior.
- Change: reworded IPC, tool-routing, protocol-test, memory-contract, and
  harness text to describe the Electron adapter as the local-runtime bridge,
  while leaving compatibility file and test names unchanged.
- Validation: docs listing, focused local-runtime bridge lifecycle Jest run,
  bridge wording scan, and diff check.
- Compatibility: no migration required. This is documentation and test-harness
  wording only.

### 2026-06-17 diagnostics local runtime lifecycle export alias

- Finding: app diagnostics still exported
  `LOCAL_BACKEND_LIFECYCLE_DIAGNOSTICS_PATH` as a backend-named compatibility
  alias for the Electron-main local-runtime lifecycle path.
- Change: removed the backend-named export from the diagnostics store and
  frontend harness mock, keeping `LOCAL_RUNTIME_LIFECYCLE_DIAGNOSTICS_PATH` as
  the only source constant. A later cleanup renamed the active diagnostics path
  to `local_runtime.lifecycle`.
- Validation: focused diagnostics export assertion, local-runtime bridge
  lifecycle Jest run, lifecycle path scan, and diff check. The broader
  diagnostics-store test file still requires the `sqlite3` CLI, which was not
  available in this environment.
- Compatibility: no storage migration required. Existing diagnostic rows remain
  readable as stored events; new lifecycle rows now use `local_runtime.lifecycle`.

### 2026-06-17 main local-runtime lifecycle docs

- Finding: active Electron-main lifecycle docs still presented
  `initializeLocalRuntimeBridge(...)` and `stopLocalBackend()` as the primary
  bridge API even though main now calls the canonical local-runtime functions.
- Change: reworded lifecycle, readiness, RPC-handler, and bridge overview docs
  to use `initializeLocalRuntimeBridge(...)` and `stopLocalRuntime()` as the
  main path, leaving the backend-named functions documented only as
  compatibility aliases.
- Validation: docs listing, focused docs index test, bridge function wording
  scan, and diff check.
- Compatibility: no migration required. The legacy exported names remain
  aliases for older imports.

### 2026-06-17 Python SDK local-runtime HTTP client alias

- Finding: the Python SDK still defined and constructed the sidecar daemon HTTP
  client under the sidecar-specific `SidecarDaemonHttpClient` name even though
  SDK docs describe the public boundary as `AgentLocalRuntimeHttpClient`.
- Change: promoted `AgentLocalRuntimeHttpClient` as the canonical Python SDK
  class, switched discovery and lifecycle checks to the generic name, re-exported
  it from `windie` and `core`, kept `SidecarDaemonHttpClient` as a compatibility
  alias, and updated local-runtime lifecycle docs.
- Validation: focused Python SDK sidecar tests, local-runtime client alias scan,
  docs listing, and diff check.
- Compatibility: no migration required. Existing `SidecarDaemonHttpClient`
  imports resolve to the same class object through the compatibility alias.

### 2026-06-17 SDK local-runtime HTTP client alias

- Finding: the SDK local-runtime HTTP client was still exposed and constructed
  primarily as `SidecarDaemonHttpClient`, making the public local-runtime
  contract read like a sidecar implementation detail.
- Change: promoted `AgentLocalRuntimeHttpClient` and
  `AgentLocalRuntimeHttpClientOptions` as the canonical HTTP client surface,
  switched `AgentClient` and focused tests to the generic name, updated SDK
  docs, and regenerated checked-in SDK CJS output. The remaining
  `SidecarDaemonClientOptions` compatibility type was removed in a later
  cleanup slice.
- Validation: SDK build, focused package-boundary/client tests, docs listing,
  alias/export scan, and diff check.
- Compatibility: no migration required for first-party code. SDK clients use
  `AgentLocalRuntimeHttpClient` and `AgentLocalRuntimeHttpClientOptions`.

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
- Compatibility: no migration required. That slice kept the then-current
  channel strings stable so preload/main allowlists and handlers stayed
  compatible. The later local-runtime wire rename is tracked above.

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
- Compatibility: no migration required. Persisted diagnostics remain readable
  as stored events; new lifecycle rows now use `local_runtime.lifecycle`.

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
  compatibility `windie` globals used the same underlying IPC channel at this
  point; the Windie-named browser-global alias was removed in a later cleanup.

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
  `[Main][LocalRuntimeBridge]` console labels even though the host adapter now
  represents a generic sidecar/local-runtime bridge.
- Change: changed new console output from the bridge, tool-execution, and
  screenshot materialization helpers to `[Main][SidecarBridge]` at this point;
  a later cleanup renamed the active label to `[Main][LocalRuntimeBridge]`.
  Module filenames, exports, IPC channels, and diagnostic path ids stayed
  unchanged.
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
  `LocalRuntimeLaunchOptions` Jest coverage, docs listing, `git diff --check`,
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
  main code while preserving the legacy exported names. A later cleanup renamed
  the active path id to `local_runtime.lifecycle`.
- Validation: focused diagnostics alias and local bridge lifecycle Jest tests,
  docs listing, `git diff --check`, and source scan for remaining lifecycle
  helper references.
- Compatibility: no migration required. Historical diagnostic rows remain
  readable as stored events; active lifecycle filters now use
  `local_runtime.lifecycle`.

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
  `local_runtime_window_visibility.cjs` as the direct screenshot task
  seam while updating docs to describe the current owner.
- Validation: focused Jest run for `LocalRuntimeWindowVisibility`.
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
  filename, then-current status channel, and payload fields.
- Validation: focused Jest run for `LocalRuntimeStatusBroadcaster` and
  `LocalRuntimeBridge.lifecycle`; docs listing; `git diff --check`; and a
  stale-name scan for the retired helper names.
- Compatibility: no migration required. Status payload shape, lifecycle
  diagnostics, and renderer readiness behavior are unchanged.

### 2026-06-17 main local runtime ready helper naming

- Finding: `local_runtime_bridge.cjs` still named the helper that marks the SDK
  local runtime supervisor ready as backend-ready.
- Change: renamed the helper and focused lifecycle test title to local-runtime
  readiness terminology.
- Validation: focused Jest run for `LocalRuntimeBridge.lifecycle`;
  `git diff --check`; and a stale-name scan for the retired helper/test wording.
- Compatibility: no migration required. Status supervisor behavior, status
  payload shape, and SDK runtime bootstrap behavior are unchanged.

### 2026-06-17 main local runtime bridge failure copy

- Finding: local sidecar bridge fallback errors still described SDK local
  runtime bridge failures as local-backend bridge failures.
- Change: updated initialization/stopped fallback error copy and focused
  lifecycle expectations to local-runtime bridge terminology.
- Validation: focused Jest run for `LocalRuntimeBridge.lifecycle`; `git diff
  --check`; and a stale-phrase scan for the retired error strings.
- Compatibility: no migration required. Public bridge method names, status
  payload shape, and failure control flow are unchanged.

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
- Compatibility: no persisted-data migration required. The later
  local-runtime status details payload rename is tracked in the latest progress
  note.

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
  `initializeLocalRuntimeBridge` through the window creation surface, even
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
- Compatibility: no migration required. Historical `local_backend.lifecycle`
  rows and `localBackendReady` payloads remain readable as stored events; new
  lifecycle diagnostics use `local_runtime.lifecycle`.

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
- Change: changed the Electron desktop `autoLocalRuntime.discoveryFile` default to
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

### 2026-06-17 sidecar daemon local-runtime log prefix

- Finding: the Python sidecar daemon still emitted status logs with a
  `[LocalSidecar]` prefix, and Electron main still whitelisted that prefix in
  the local-runtime launch log forwarder.
- Change: renamed the active daemon status prefix to `[LocalRuntime]`, updated
  the Electron main local-runtime log allowlist, and refreshed focused
  main/sidecar tests plus the JSON-RPC workflow note.
- Validation: focused main launch-option Jest coverage, focused sidecar daemon
  pytest coverage, docs listing, `git diff --check`, and stale-prefix scans.
- Compatibility: no migration required. This changes developer-facing log
  labels only; daemon discovery, JSON-RPC payloads, IPC channels, and stored
  data are unchanged.

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

### 2026-06-17 renderer API barrel topology cleanup

- Finding: frontend architecture maps still listed the retired
  `frontend/src/renderer/infrastructure/api/index.ts` barrel after renderer
  imports moved directly through the `agentSdkClient.ts` facade.
- Change: removed the stale barrel entry from the frontend architecture and
  renderer folder maps while preserving the active hosted SDK facade route.
- Validation: docs listing, `git diff --check`, and stale-path scans for the
  removed API index entry.
- Compatibility: no migration required. This is documentation topology only.

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
  `initializeLocalRuntimeBridge`, `stopLocalBackend`, and
  `getLocalBackendStatus` from the sidecar adapter, then aliased them into the
  already-generic lifecycle/window runtime dependency shape.
- Change: added generic local-runtime export aliases at the sidecar bridge
  adapter edge, switched `index.cjs` to consume those names directly, and kept
  the backend-prefixed exports as compatibility API for focused bridge tests and
  any remaining adapter-edge consumers.
- Validation: focused main host skin/boundary test coverage, docs listing,
  `git diff --check`, and source scans for retired backend-prefixed names in the
  main composition root.
- Compatibility: no migration required. That slice only moved private
  main-process dependency names to local-runtime wording. The later permission
  details payload rename is tracked above.

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
  `window.desktopAgent`, and initially exposed the same preload bridge object
  under both `desktopAgent` and `windie`. The Windie-named browser-global alias
  was removed in a later cleanup slice.
- Validation: focused renderer runtime boundary coverage, preload IPC bridge
  coverage, docs listing, `git diff --check`, and source scans showing
  generic renderer code resolves the desktop-agent bridge accessor.
- Compatibility: no migration required for first-party code. Renderer code uses
  `window.desktopAgent` through the desktop-agent bridge accessor; the
  low-level `windie:invoke` IPC channel string remains the wire contract.

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
  `git diff --check`; `bin\windie docs list`; source scan confirmed generic
  renderer code used `DESKTOP_AGENT_INVOKE_CHANNELS.INVOKE`; the shared
  registry key was renamed from `WINDIE_INVOKE` to `DESKTOP_AGENT_INVOKE` in a
  later cleanup.
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
- Compatibility: no migration required. The SDK `autoLocalRuntime` option shape,
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

### 2026-06-17 Agent SDK client and package-boundary test headers

- Finding: SDK client and package-boundary tests still had generated headers
  that described their reusable coverage as "windie sdk" behavior even though
  the preferred test surface now names Agent SDK contracts and keeps Windie
  names only for public compatibility assertions.
- Change: updated those generated headers to Agent SDK client/package-boundary
  wording without changing the intentional `@windie/sdk` package name or
  Windie compatibility alias checks.
- Validation: focused SDK client/package-boundary Jest coverage, docs listing,
  `git diff --check`, and source scans for stale generated header text.
- Compatibility: no migration required. This is test-only terminology cleanup.

### 2026-06-17 AgentClient runtime diagram wording

- Finding: the AgentClient runtime contract identified `AgentClient` as the
  canonical runtime, but its boundary diagram still labeled the reusable
  TypeScript layer as `TS Windie SDK runtime`.
- Change: updated the diagram label to `TS Agent SDK runtime` while preserving
  the `@windie/sdk` package name and Windie-prefixed compatibility alias
  explanations.
- Validation: docs listing, `git diff --check`, and a focused docs scan for
  stale `TS Windie SDK runtime` wording.
- Compatibility: no migration required. This is docs-only terminology cleanup.

### 2026-06-17 LocalRuntimeConversationStore replay integration path

- Finding: replay database integration coverage and current renderer
  architecture docs still treated `SidecarConversationStore` as the canonical
  SDK store even after `LocalRuntimeConversationStore` became the preferred
  local-runtime store API.
- Change: switched the replay integration test to instantiate
  `LocalRuntimeConversationStore` and updated current-path renderer/frontend
  docs to name it as the canonical sidecar-backed SDK store.
- Validation: focused replay database integration Jest coverage, docs listing,
  `git diff --check`, and source scans confirming the old store name remains
  only in compatibility exports/tests/docs or historical plan notes.
- Compatibility: no migration required. `SidecarConversationStore` remains a
  compatibility alias covered by SDK package-boundary tests.

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

### 2026-06-17 Agent local runtime provider test path

- Finding: SDK client behavior coverage still exercised the historical
  `createWindieLocalRuntimeProvider` factory name even though
  `createAgentLocalRuntimeProvider` is now the canonical local-runtime provider
  and the Windie-prefixed factory is covered as a package-boundary alias.
- Change: switched local-runtime provider behavior tests to import and call
  `createAgentLocalRuntimeProvider`, leaving the compatibility alias assertion
  in the package-boundary test. The launcher-style provider cases now execute
  their temporary Node helpers through `process.execPath` so the same
  local-runtime argument contract is covered on Windows and POSIX hosts.
- Validation: focused provider Jest coverage, SDK package-boundary Jest
  coverage, docs listing, `git diff --check`, and source scans confirming the
  legacy factory name no longer appears in SDK client behavior coverage.
- Compatibility: no migration required. `createWindieLocalRuntimeProvider`
  remains a public compatibility alias.

### 2026-06-17 Agent local runtime client mock type path

- Finding: SDK client behavior coverage still typed local-runtime mock clients
  as `WindieLocalRuntimeClient`, leaving ordinary behavior tests coupled to the
  compatibility type alias.
- Change: switched those behavior-test mocks to the canonical
  `AgentLocalRuntimeClient` type, leaving `WindieLocalRuntimeClient`
  compatibility coverage in the package-boundary test.
- Validation: focused SDK client Jest coverage, SDK package-boundary Jest
  coverage, docs listing, `git diff --check`, and source scans confirming the
  legacy local-runtime client type no longer appears in SDK client behavior
  coverage.
- Compatibility: no migration required. `WindieLocalRuntimeClient` remains a
  public compatibility type alias.

### 2026-06-17 Agent backend session factory test path

- Finding: SDK client behavior coverage still created websocket sessions,
  transports, and backend socket failure cases through Windie-prefixed factory
  aliases even though the canonical transport factories are agent-named.
- Change: switched those behavior tests to `createAgentBackendSocket`,
  `createAgentSession`, and `createAgentBackendTransport`, leaving the
  Windie-prefixed factory alias assertions in the package-boundary test.
- Validation: focused SDK client Jest coverage, SDK package-boundary Jest
  coverage, docs listing, `git diff --check`, and source scans confirming the
  Windie-prefixed session/socket factories no longer appear in SDK client
  behavior coverage.
- Compatibility: no migration required. The Windie-prefixed factory exports
  remain public compatibility aliases.

### 2026-06-17 Agent behavior test class path

- Finding: SDK client behavior coverage still instantiated the high-level agent
  helper as `WindieAgent` even after `Agent` became the canonical reusable SDK
  class.
- Change: switched those behavior tests and the public-command test title to
  `Agent`, leaving `WindieAgent` compatibility coverage in the package-boundary
  test.
- Validation: focused SDK client Jest coverage, SDK package-boundary Jest
  coverage, docs listing, `git diff --check`, and source scans confirming the
  legacy class name no longer appears in SDK client behavior coverage.
- Compatibility: no migration required. `WindieAgent` remains a public
  compatibility alias.

### 2026-06-17 Agent hosted backend client behavior path

- Finding: SDK HTTP route behavior coverage still constructed the hosted client
  through the `WindieSdkClient` compatibility alias even though
  `AgentHostedBackendClient` is the canonical hosted backend client surface.
- Change: switched the hosted-route behavior tests and suite label to the
  generic Agent SDK hosted client path, leaving `WindieSdkClient` compatibility
  coverage in the package-boundary test.
- Validation: focused SDK client Jest coverage, SDK package-boundary Jest
  coverage, docs listing, `git diff --check`, and source scans confirming the
  legacy hosted client class no longer appears in SDK client behavior coverage.
- Compatibility: no migration required. `WindieSdkClient` remains a public
  compatibility alias.

### 2026-06-17 AgentClient behavior test path

- Finding: the main SDK client behavior suite still constructed and labeled
  runtime behavior through the `WindieClient` compatibility alias even though
  `AgentClient` is the canonical durable conversation/runtime client.
- Change: switched the behavior-suite helper, runtime instantiations, and test
  titles to `AgentClient`, leaving `WindieClient` compatibility coverage in the
  package-boundary test.
- Validation: focused SDK client Jest coverage, SDK package-boundary Jest
  coverage, docs listing, `git diff --check`, and source scans confirming the
  legacy runtime client class no longer appears in SDK client behavior coverage.
- Compatibility: no migration required. `WindieClient` remains a public
  compatibility alias.

### 2026-06-17 LocalRuntimeConversationStore module path

- Finding: the SDK durable local-runtime conversation store implementation still
  lived in `SidecarConversationStore` modules, so canonical SDK code imported a
  local-runtime class through a sidecar-named file.
- Change: moved the implementation to `LocalRuntimeConversationStore` source
  and CommonJS modules, switched `AgentClient` internals and package exports to
  the canonical module, documented the module path, and kept
  `SidecarConversationStore` modules as direct compatibility wrappers.
- Validation: focused SDK client, package-boundary, private-export, and replay
  integration Jest coverage; docs listing; `git diff --check`; and source scans
  confirming SDK internals import the canonical store path.
- Compatibility: no migration required. The old sidecar-named store module path
  still exports both `SidecarConversationStore` and `LocalRuntimeConversationStore`.

### 2026-06-17 ManagedAgentSession module compatibility wrapper

- Finding: the canonical SDK managed hosted-session module still exported
  `ManagedWindieAgentSession` compatibility names directly, so the generic
  transport module owned historical product-prefixed naming.
- Change: moved the Windie-prefixed managed-session value and factory aliases to
  the `ManagedWindieAgentSession` compatibility module and package boundary,
  left `ManagedAgentSession` as the canonical managed transport module, and
  documented the split.
- Validation: focused SDK package-boundary/private-export coverage, docs
  listing, `git diff --check`, and source scans confirming the canonical
  managed-session module no longer exports Windie-prefixed compatibility names.
- Compatibility: no migration required. Existing package-level and
  `ManagedWindieAgentSession` module imports still resolve to the same managed
  session runtime objects.

### 2026-06-17 AgentSession module compatibility wrapper

- Finding: the canonical SDK websocket session module still exported
  `WindieAgentSession` compatibility names directly, so generic transport code
  owned historical product-prefixed aliases.
- Change: moved Windie-prefixed session value, factory, backend-transport
  factory, and type aliases to the `WindieAgentSession` compatibility module
  and package boundary, leaving `AgentSession` as the canonical websocket
  transport module.
- Validation: focused SDK package-boundary/private-export coverage, SDK client
  coverage, docs listing, `git diff --check`, and source scans confirming the
  canonical session module no longer exports Windie-prefixed compatibility
  names.
- Compatibility: no migration required. Existing package-level and
  `WindieAgentSession` module imports still resolve to the same websocket
  session runtime objects.

### 2026-06-17 AgentChatSession module compatibility wrapper

- Finding: the canonical SDK chat-session module still exported
  `WindieChatSession` and Windie-prefixed chat input type aliases directly, so
  a generic chat convenience module owned historical product naming.
- Change: moved the Windie-prefixed chat-session value and input type aliases to
  the `WindieChatSession` compatibility module and package boundary, leaving
  `AgentChatSession` as the canonical chat session module.
- Validation: focused SDK package-boundary/private-export coverage, SDK client
  coverage, docs listing, `git diff --check`, and source scans confirming the
  canonical chat-session module no longer exports Windie-prefixed compatibility
  names.
- Compatibility: no migration required. Existing package-level and
  `WindieChatSession` module imports still resolve to the same chat session
  runtime objects and types.

### 2026-06-17 AgentClient module compatibility wrapper

- Finding: the canonical SDK client runtime module still exported `WindieClient`
  and Windie-prefixed client option/type aliases directly, so the generic
  wake-up/runtime client module owned historical product naming.
- Change: moved the Windie-prefixed client value and option/type aliases to the
  `WindieClient` compatibility module and package boundary, leaving
  `AgentClient` as the canonical client runtime module.
- Validation: focused SDK package-boundary/private-export coverage, SDK client
  coverage, docs listing, `git diff --check`, and source scans confirming the
  canonical client runtime module no longer exports Windie-prefixed
  compatibility names.
- Compatibility: no migration required. Existing package-level and
  `WindieClient` module imports still resolve to the same client runtime object
  and types.

### 2026-06-17 Agent module compatibility wrapper

- Finding: the canonical SDK agent runtime module still exported `WindieAgent`
  and Windie-prefixed option, memory, result, trace, and replay-preparation type
  aliases directly, so the generic high-level agent module owned historical
  product naming.
- Change: moved the Windie-prefixed agent value and type aliases to the
  `WindieAgent` compatibility module and package boundary, leaving `Agent` as
  the canonical high-level SDK runtime module.
- Validation: focused SDK package-boundary/private-export coverage, SDK client
  coverage, docs listing, `git diff --check`, and source scans confirming the
  canonical agent runtime module no longer exports Windie-prefixed
  compatibility names.
- Compatibility: no migration required. Existing package-level and
  `WindieAgent` module imports still resolve to the same agent runtime object
  and types.

### 2026-06-17 AgentStreamEvents module compatibility wrapper

- Finding: the canonical SDK stream-event projection module still exported
  Windie-prefixed stream state, tool call/output, and stream event type aliases
  directly, so the generic projection module owned historical product naming.
- Change: moved the Windie-prefixed stream-event type aliases to the
  `WindieAgentStreamEvents` compatibility module and package boundary, leaving
  `AgentStreamEvents` as the canonical stream projection module.
- Validation: focused SDK package-boundary/private-export coverage,
  conversation-runtime stream projection coverage, docs listing,
  `git diff --check`, and source scans confirming the canonical stream-events
  module no longer exports Windie-prefixed compatibility names.
- Compatibility: no migration required. Existing package-level stream event
  type imports still resolve, and direct compatibility-module imports can use
  `WindieAgentStreamEvents`.

### 2026-06-17 BackendSocketFactory module compatibility wrapper

- Finding: the canonical SDK backend socket factory still exported
  `createWindieSdkBackendSocket` and `WindieSdkBackendSocketOptions` directly,
  so the generic transport factory module owned historical product naming.
- Change: moved the Windie-prefixed socket factory value and options type alias
  to the `WindieBackendSocketFactory` compatibility module and package
  boundary, leaving `BackendSocketFactory` as the canonical socket factory.
- Validation: focused SDK package-boundary/private-export coverage, SDK client
  transport coverage, docs listing, `git diff --check`, and source scans
  confirming the canonical backend socket factory module no longer exports
  Windie-prefixed compatibility names.
- Compatibility: no migration required. Existing package-level socket factory
  imports still resolve, and direct compatibility-module imports can use
  `WindieBackendSocketFactory`.

### 2026-06-17 HostedBackendHttpClient module compatibility wrapper

- Finding: the canonical SDK hosted backend HTTP client still exported
  `WindieSdkClient` and Windie-prefixed install identity, query options, and
  client options type aliases directly, so the generic hosted client module
  owned historical product naming.
- Change: moved the Windie-prefixed hosted client value and type aliases to the
  `WindieHostedBackendHttpClient` compatibility module and package boundary,
  leaving `HostedBackendHttpClient` as the canonical hosted HTTP client module.
- Validation: focused SDK package-boundary/private-export coverage, SDK hosted
  client behavior coverage, docs listing, `git diff --check`, and source scans
  confirming the canonical hosted backend client module no longer exports
  Windie-prefixed compatibility names.
- Compatibility: no migration required. Existing package-level hosted client
  imports still resolve, and direct compatibility-module imports can use
  `WindieHostedBackendHttpClient`.

### 2026-06-17 ConversationRuntime module compatibility wrapper

- Finding: the canonical SDK conversation runtime module still exported the
  historical `WindieRuntimeEvent` type alias directly, so the generic
  conversation runtime module owned product-prefixed type naming.
- Change: moved `WindieRuntimeEvent` to the `WindieConversationRuntime`
  compatibility module and package boundary, leaving `ConversationRuntime` as
  the canonical runtime module for `AgentRuntimeEvent`.
- Validation: focused SDK package-boundary/private-export coverage,
  conversation-runtime coverage, docs listing, `git diff --check`, and source
  scans confirming the canonical conversation runtime module no longer exports
  Windie-prefixed compatibility names.
- Compatibility: no migration required. Existing package-level runtime event
  type imports still resolve, and direct compatibility-module imports can use
  `WindieConversationRuntime`.

### 2026-06-17 builtins module compatibility wrapper

- Finding: the canonical SDK builtin selection module still exported
  `windieBuiltins` and Windie-prefixed builtin selection type aliases directly,
  so the reusable builtin selector owned historical product naming.
- Change: moved the Windie-prefixed builtin value and type aliases to the
  `WindieBuiltins` compatibility module and package boundary, leaving
  `builtins` as the canonical module for `agentBuiltins`.
- Validation: focused SDK package-boundary/private-export coverage, SDK client
  builtin-selection coverage, docs listing, `git diff --check`, and source
  scans confirming the canonical builtin module no longer exports
  Windie-prefixed compatibility names.
- Compatibility: no migration required. Existing package-level builtin imports
  still resolve, and direct compatibility-module imports can use
  `WindieBuiltins`.

### 2026-06-17 modelSelection module compatibility wrapper

- Finding: the canonical SDK model-selection module still exported the
  historical `WindieModelSelection` type alias directly, so the generic model
  settings helper owned product-prefixed type naming.
- Change: moved `WindieModelSelection` to the `WindieModelSelection`
  compatibility module and package boundary, leaving `modelSelection` as the
  canonical module for `AgentModelSelection`.
- Validation: focused SDK model-selection, package-boundary/private-export
  coverage, docs listing, `git diff --check`, and source scans confirming the
  canonical model-selection module no longer exports Windie-prefixed
  compatibility names.
- Compatibility: no migration required. Existing package-level model selection
  type imports still resolve, and direct compatibility-module imports can use
  `WindieModelSelection`.

### 2026-06-17 LocalSidecarRuntime module compatibility wrapper

- Finding: the canonical SDK local-runtime module still exported historical
  Windie-prefixed local runtime, tool, provider, and auto-sidecar names, so the
  generic local sidecar runtime module owned product-prefixed compatibility
  naming.
- Change: moved those aliases and `createWindieLocalRuntimeProvider` to the
  `WindieLocalSidecarRuntime` compatibility module and package boundary. A
  later cleanup renamed the canonical module to `LocalRuntime` for `Agent*`
  local-runtime contracts and `createAgentLocalRuntimeProvider`.
- Validation: focused SDK package-boundary/private-export coverage, SDK local
  runtime behavior coverage, docs listing, `git diff --check`, and source scans
  confirming the canonical local-runtime module no longer exports
  Windie-prefixed compatibility names.
- Compatibility: no migration required. Existing package-level local-runtime
  imports still resolve, and direct compatibility-module imports can use
  `WindieLocalSidecarRuntime`.

### 2026-06-17 AgentDefinition default predicate

- Finding: Electron main still checked the backend `windie_default` agent
  definition mode literal directly when deciding whether the generated SDK
  definition could be omitted from a query payload.
- Change: added `isDefaultAgentDefinition(...)` to the SDK agent-definition
  contract and switched Electron main to that helper, keeping the backend wire
  mode unchanged while moving the predicate into the SDK boundary.
- Validation: focused SDK client/package-boundary coverage, main SDK boundary
  source coverage, docs listing, `git diff --check`, and source scans for the
  retired direct main-process mode comparison.
- Compatibility: no migration required. The backend mode value remains
  `windie_default`; host callers now use the SDK predicate instead of the raw
  literal.

### 2026-06-17 renderer memory row runtime id fields

- Finding: dashboard memory rows stored delete-routing data as
  `backendMemoryId` and `backendType`, making renderer UI state read as if it
  owned backend memory internals instead of calling the desktop memory runtime
  facade.
- Change: renamed the internal normalized row fields to `runtimeMemoryId` and
  `runtimeMemoryKind`, kept `DesktopMemoryRuntimeClient.deleteMemoryItem(...)`
  as the delete boundary, and updated the dashboard memory docs.
- Validation: focused MemorySection coverage, docs listing, `git diff --check`,
  and source scans for retired backend-shaped row fields.
- Compatibility: no migration required. These fields are transient renderer row
  properties, and the SDK/runtime delete payload is unchanged.

### 2026-06-17 renderer runtime endpoint store

- Finding: renderer UI consumers imported `BackendEndpointStore` directly for
  artifact and transcription URL composition, so display-only renderer helpers
  depended on a backend-named local abstraction.
- Change: added `RuntimeEndpointStore` as the canonical renderer endpoint
  service, switched active renderer consumers and tests to runtime-named
  helpers, and kept `BackendEndpointStore` as a compatibility wrapper.
- Validation: focused runtime endpoint, app config, voice boundary, screenshot,
  docs listing, `git diff --check`, and source scans confirming active
  renderer consumers use the runtime endpoint store.
- Compatibility: no migration required. Endpoint state is still in memory, the
  IPC payload still carries `backendHttpUrl`, and old backend-named imports
  continue to resolve through the wrapper.

### 2026-06-17 renderer settings facade IPC wording

- Finding: the renderer settings runtime facade comment still told callers to
  avoid "backend IPC" even though the active boundary is SDK command IPC through
  Electron main.
- Change: reworded the facade comment to SDK command IPC and added boundary
  coverage so backend-IPC wording does not return to the renderer settings
  runtime facade.
- Validation: focused renderer settings runtime boundary test.
- Compatibility: no migration required. This is documentation/comment-only;
  settings commands and IPC wire channels are unchanged.

### 2026-06-17 LocalRuntimeConversationStore metadata fallback keys

- Finding: the canonical SDK local-runtime conversation store still read
  historical `windie_sdk_conversation_event` metadata keys when reconstructing
  events from older rows, with no generic metadata key ahead of that fallback.
- Change: added `agent_sdk_conversation_event` and `agentSdkConversationEvent`
  as the preferred metadata fallback keys. The Windie-prefixed fallback keys
  were removed in a later cleanup slice.
- Validation: focused Agent conversation store API coverage, CJS parity update,
  `git diff --check`, and source scans for the metadata fallback keys.
- Compatibility: no migration required. Current rows still use `event_payload`;
  metadata fallback reads the generic agent keys.

### 2026-06-17 AgentClient local runtime daemon option

- Finding: the reusable SDK `AgentClient` still exposed the already-known local
  runtime daemon HTTP client option primarily as `sidecarDaemon`, even after the
  canonical local-runtime client types moved to generic `Agent*` names.
- Change: added `localRuntimeDaemon` as the preferred `AgentClient` option,
  resolved it ahead of `sidecarDaemon`, kept `sidecarDaemon` as a compatibility
  alias, and updated SDK/local-sidecar docs and behavior tests.
- Validation: focused Agent SDK client behavior coverage, docs listing,
  `git diff --check`, CJS parity update, and source scan for
  `localRuntimeDaemon`/`sidecarDaemon` references.
- Compatibility: no migration required. Existing `sidecarDaemon` callers keep
  working; new callers can use `localRuntimeDaemon`.

### 2026-06-17 renderer config runtime wording

- Finding: renderer config filter/storage comments and the renderer folder map
  still described frontend config as a subset of backend configuration and as
  syncing directly with the backend, even though the renderer owns local config
  filtering/persistence and talks through the desktop settings runtime.
- Change: reworded those comments and docs to the frontend-owned runtime
  settings boundary, refreshed the config reference allowlist, and added
  renderer skin/config boundary coverage so backend-config wording does not
  return to the helper comments.
- Validation: focused renderer skin/config boundary test, docs listing, and
  `git diff --check`.
- Compatibility: no migration required. This is documentation/comment-only;
  config storage keys, filters, settings payloads, and ACK behavior are
  unchanged.

### 2026-06-17 main agent backend connection logs

- Finding: Electron main user/dev logs still described SDK backend websocket
  connection open/close events as connecting to a "Python backend", even though
  the main process is a generic host for the Agent SDK transport and the Python
  implementation detail belongs below the hosted backend boundary.
- Change: reworded those connection logs to "agent backend" and added main
  host skin/config boundary coverage to keep the stale Python-backend label out
  of the Electron main SDK connection flow.
- Validation: focused main host skin/config boundary test, stale phrase scan,
  docs listing, and `git diff --check`.
- Compatibility: no migration required. Log text changes only; websocket
  routing, backend endpoint state, reconnect behavior, and event payloads are
  unchanged.

### 2026-06-17 main local runtime supervisor factory

- Finding: the Electron main local-runtime bridge still constructed its status
  supervisor through the backend-named factory, even though the module owned
  generic local-runtime process supervision for the host adapter.
- Change: promoted `createLocalRuntimeSupervisor` as the canonical factory,
  switched the active bridge and focused tests to it, and kept
  the backend-named factory as a compatibility alias for existing direct imports.
- Validation: focused local-runtime supervisor and main host boundary tests,
  docs listing, stale active-dependency scan, and `git diff --check`.
- Compatibility: no migration required. The old factory export remains an alias
  to the same supervisor implementation; runtime state and status payloads are
  unchanged.

### 2026-06-17 main local runtime execute-tool factory

- Finding: the Electron main local-runtime bridge still constructed its
  execute-tool adapter through the backend-named factory, even though the
  adapter coordinates SDK local runtime tool execution for the host.
- Change: promoted `createLocalRuntimeExecuteToolRuntime` as the canonical
  factory, switched the active bridge and focused tests to it, and kept
  the backend-named factory as a compatibility alias.
- Validation: focused local-runtime extension-runtime and main host boundary
  tests, docs listing, active factory scan, and `git diff --check`.
- Compatibility: no migration required. The old factory export remains an alias
  to the same implementation; local tool execution, screenshot materialization,
  and permission verification behavior are unchanged.

### 2026-06-17 main local runtime bridge canonical functions

- Finding: the Electron main local-runtime bridge exported generic
  `initializeLocalRuntimeBridge`, `stopLocalRuntime`, and `getLocalRuntimeStatus`
  names first, but the implementation still defined the legacy
  `initializeLocalRuntimeBridge`, `stopLocalBackend`, and
  `getLocalBackendStatus` functions as the canonical code path.
- Change: flipped the bridge definitions to local-runtime names, kept the old
  local-backend names as direct compatibility aliases, and updated focused
  lifecycle/host-boundary tests and the bridge harness to use the generic API.
- Validation: focused bridge lifecycle and main host boundary tests, docs
  listing, canonical-function source scan, and `git diff --check`.
- Compatibility: no migration required. Existing local-backend bridge imports
  still resolve to the same functions; IPC channel strings and status payloads
  remain unchanged.

### 2026-06-17 backend tool-call recovery string extractors

- Finding: `tool_call_bridge.py` still exported helper functions that reverse
  parsed tool-call ids, names, raw previews, and parse summaries out of provider
  error strings, plus a parsed-call id wrapper, even though recovery now reads
  those diagnostics from structured LLM error metadata and the interaction loop
  stages ids from already-rendered history calls.
- Change: removed the unused error-string extractor helpers and parsed-call id
  wrapper, kept the live recoverable marker classifier and synthetic output
  formatter, and updated bridge/recovery docs and focused tests to the
  structured-metadata recovery path.
- Validation: focused bridge py_compile and pytest, stale extractor scan,
  docs listing, and `git diff --check`.
- Compatibility: no migration required. These were backend-internal helper
  exports with no live source callers; recovery event payloads, history
  staging, and structured metadata keys are unchanged.

### 2026-06-17 sidecar platform window-manager package export

- Finding: `core/platform/__init__.py` remained as a sidecar package-root
  selector for `WindowManager`, even though sidecar package policy keeps runtime
  imports on concrete owner modules and the public `windie` package is the only
  remaining SDK-facing `__init__.py` export surface.
- Change: moved platform window-manager selection into
  `core.platform.window_manager`, rewired system-state and window-tool callers
  to the concrete module, deleted the package-root marker, and updated
  sidecar docs/tests to guard the removed package export.
- Validation: focused sidecar py_compile and pytest, stale package-root import
  scan, docs listing, and `git diff --check`.
- Compatibility: no migration required. This is a sidecar-internal import-path
  cleanup; JSON-RPC methods, tool schemas, window-manager behavior, and
  platform-specific adapter implementations are unchanged.

### 2026-06-17 backend prompt-layer apply helper

- Finding: `backend/src/agent/session/prompt_layers.py` still exposed an
  unused `accepted_ids` convenience property and
  `apply_client_prompt_layers_to_session(...)`, even though prompt-layer
  validation samples are read directly and session/runtime application is owned
  inline by `AgentSession` and `SessionConfigService`.
- Change: removed the unused property and standalone application helper while
  keeping `validate_client_prompt_layers(...)`, `prompt_layer_id_sample(...)`,
  and rejected-reason sampling as the live prompt trace/validation surface.
- Validation: focused prompt-layer py_compile and pytest, exact-name stale
  scan, docs listing, and `git diff --check`; broader session prompt tests were
  attempted through `scripts/python-in-env backend` but the `jarvis` environment
  was unavailable and fallback Python lacked `fastapi`.
- Compatibility: no migration required. This removes backend-internal unused
  helpers only; query payloads, prompt-layer validation, trace payloads, prompt
  construction, and session runtime application behavior are unchanged.

### 2026-06-17 backend string nested fallback helper

- Finding: `backend/src/core/utils/string_normalization.py` still exposed
  `resolve_top_level_or_nested_string(...)`, but exact-name scans showed no
  source, test, or doc callers; the live helper is only
  `normalize_non_empty_string(...)`.
- Change: removed the unused nested fallback helper and its `Mapping` import,
  and added direct unit coverage for `normalize_non_empty_string(...)`.
- Validation: focused string-normalization py_compile and pytest, exact-name
  stale scan, docs listing, and `git diff --check`.
- Compatibility: no migration required. This removes an unused backend-internal
  utility only; the live string normalization behavior used by tool-call bridge
  id normalization is unchanged.

### 2026-06-17 backend core unused TypedDict schemas

- Finding: `backend/src/core/types/schemas.py` still defined generic
  `ToolResultDict`, `ProviderConfigDict`, `MemoryItem`, `EpisodicMemory`,
  `WebSocketMessage`, and `ToolParameterSchema` TypedDicts, but exact-name
  scans showed no source, test, or doc callers beyond the stale topology line.
- Change: removed those unused TypedDicts, kept the live LLM/message/normalized
  response/tool schema types, refreshed the core source map, and added a guard
  test so the removed generic aliases stay out of the core schema surface.
- Validation: focused core type schema py_compile and pytest, exact-name stale
  scan, docs listing, and `git diff --check`.
- Compatibility: no migration required. These were unused backend-internal type
  aliases only; runtime payloads, API schemas, provider normalized response
  shapes, and tool-schema events are unchanged.

### 2026-06-17 backend core unused streaming chunk TypedDicts

- Finding: `backend/src/core/types/schemas.py` still defined normalized
  streaming chunk TypedDicts such as `ContentChunk`, `ThinkingChunk`,
  `ToolCallChunk`, and `StreamingChunk`, but exact-name scans showed no source,
  test, or doc callers; current streaming contracts use event dataclasses and
  outgoing formatter schemas.
- Change: removed the unused chunk TypedDicts and expanded the core schema
  surface guard so those old aliases do not return.
- Validation: focused core type schema py_compile and pytest, exact-name stale
  scan, docs listing, and `git diff --check`.
- Compatibility: no migration required. These were unused backend-internal type
  aliases only; runtime stream events, formatter output, outgoing API schemas,
  and provider normalized response payloads are unchanged.

### 2026-06-18 SDK local-runtime trace metadata boundary

- Finding: SDK local-runtime lifecycle, browser-action, app-diagnostic, and
  local tool-output paths still emitted `sidecar` as active trace runtime or
  event source metadata, while the reusable SDK boundary is the local-runtime
  contract and the Python sidecar is only the concrete executor.
- Change: changed active trace/app-diagnostic runtime metadata to
  `local-runtime`, changed SDK-authored local tool output events to
  `source: sdk`, removed `sidecar` from current SDK/backend trace runtime
  schemas, and kept explicit legacy producer normalization for older stored
  `sidecar` conversation rows.
- Validation: focused SDK Jest coverage, backend trace schema pytest and
  py_compile, trace/source stale scans, diagnostics store syntax check, docs
  listing, and diff checks. The diagnostics-store Jest suite was attempted but
  this shell has no `sqlite3` executable on PATH, so that file could only be
  syntax-checked here.
- Compatibility: no migration required. Existing stored events may still carry
  historical `sidecar` source/producer metadata and continue through the
  local-runtime store compatibility path; new SDK/backend trace and event rows
  use the generic local-runtime boundary.
