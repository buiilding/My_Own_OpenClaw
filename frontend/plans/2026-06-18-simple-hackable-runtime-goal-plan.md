---
summary: "Long-running-agent goal plan for making WindieOS structurally simple, intuitive to change, hackable, and debuggable."
title: "Simple Hackable Runtime Goal Plan"
---

# Simple Hackable Runtime Goal Plan

Date: 2026-06-18

## Goal

Make WindieOS feel simple, intuitive, hackable, and debuggable without
reversing the recent ownership cleanup work.

The target is not fewer folders for their own sake. The target is that a
developer can look at a behavior and quickly know which runtime owns it, which
contract carries it, which diagnostic proves it, and which tests protect it.

For long-running agent work, "simple and intuitive" means structurally simple:
owner-correct code paths, clear command routes, fewer duplicate authorities,
current docs, and diagnostics that explain runtime state. It does not mean
unbounded product redesign, broad UI rewrites, or behavior changes without a
named bug, trace, contract, or goal.

This plan should continue the direction of the recent commits: align public
language around runtime ownership, route UI features through app-runtime/SDK
facades, keep local machine authority behind the local runtime, and remove old
sidecar/backend/renderer naming or fallback paths only after verified consumers
have moved.

## Current Mental Model

WindieOS should read as this runtime chain:

```text
renderer UI intent and display
  -> preload/main IPC allowlist and Electron shell policy
  -> SDK agent/conversation/local-runtime contract
  -> backend hosted model orchestration
  -> local runtime for machine authority when tools execute locally
```

The Python sidecar is the current implementation of local runtime authority.
It should stay visible as an implementation detail where process/debugging
requires it, but reusable contracts should use local-runtime terminology.

## Non-Goals

- Do not undo recent `local_runtime`, SDK runtime, app-runtime, or endpoint
  naming changes.
- Do not reintroduce `local_backend` as a public concept.
- Do not move tool execution, transcript replay, backend websocket loops, or
  provider policy into renderer code.
- Do not make Electron main a second agent runtime.
- Do not add renderer/main compatibility aliases unless a verified external or
  persisted dependency requires them.
- Do not collapse all code into fewer files if ownership would become less
  obvious.
- Do not change chat pill, dashboard, overlay, typing-state, animation, or
  interaction behavior unless the change is tied to a named bug, trace,
  contract, or explicit product goal.
- Do not add new user-facing product surfaces because they seem useful. Long
  running work should make existing surfaces easier to reason about and debug.

## Design Principles

- One source of truth per behavior.
- Names should describe the owner, not the historical implementation accident.
- Renderer code should express user intent and render SDK/app-runtime state.
- Electron main should adapt the desktop to the SDK and own OS-sensitive policy.
- SDK code should own reusable agent, conversation, projection, local-runtime,
  and tool-result coordination semantics.
- Backend code should own model/provider/prompt policy and backend remote tools.
- Local runtime code should own local machine authority and executable tools.
- Compatibility paths should have a named reason to remain or a deletion path.
- Debugging should follow one traceable route from user intent to visible UI.

## Long-Running Goal Scope

Long-running agent work should make WindieOS structurally easier to change,
inspect, and trust:

- inventory confusing runtime ownership surfaces
- remove verified stale aliases, fallback paths, and forwarding-only adapters
- align docs, command help, diagnostics, errors, and public names with current
  runtime ownership
- add or improve diagnostics that identify producer, consumer, runtime owner,
  correlation ids, and failure stage
- add focused tests for ownership boundaries, command routing, schema parity,
  replay contracts, and import boundaries
- simplify code paths when behavior is preserved and validation proves it

The long-running goal is not to keep refactoring forever. The goal is to make
each completed slice leave WindieOS easier to debug, easier to extend, and less
likely to route the same behavior through competing owners.

## Long-Running Work Loop

Each autonomous slice should be small enough to finish with evidence:

1. Choose one ownership-confusion candidate, stale compatibility path, missing
   diagnostic, or docs/code mismatch.
2. Reread `AGENTS.md`, relevant docs, current code, and recent related commits.
3. State the current owner, the confusing or duplicate path, and the simpler
   owner-correct path before editing.
4. Make the smallest behavior-preserving change unless the plan names a
   verified bug.
5. Add or update focused tests, docs, or diagnostics at the owning runtime.
6. Update `CHANGELOG.md` with migration and security notes.
7. Record the completion note.
8. Stop if the next step would require product judgment not stated in the goal,
   a verified bug, a trace, or an existing contract.

## Recent-Commit Alignment Guardrails

Before changing a runtime boundary, check the related recent commits and ask:

- Does this continue the same ownership direction?
- Does this remove an old duplicate authority rather than creating a parallel
  bridge?
- Does this keep the public naming aligned with local runtime, SDK runtime,
  app-runtime, or backend ownership?
- Does this avoid restoring removed aliases, stale payload shapes, or old
  sidecar/backend wording?
- Does this preserve behavior unless the change intentionally fixes a verified
  bug?

If a proposed cleanup fails one of these checks, stop and document why the
current direction is insufficient before editing.

## Workstreams

### 1. Runtime Ownership Inventory

Create a lightweight inventory of confusing surfaces by owner:

- renderer feature code importing app-provider or low-level transport internals
- renderer facades that only rename and forward calls
- main IPC helpers that still own SDK conversation semantics
- main modules that know concrete sidecar implementation details unnecessarily
- SDK code that still exposes WindieOS/product-specific names in reusable APIs
- sidecar/local-runtime files whose public docs or errors imply backend or
  renderer ownership

The output should be a short candidate list with an owner, risk, and deletion
condition for each item.

### 2. Main As Thin SDK Host

Continue making `frontend/src/main/ipc.cjs` a composition root:

- keep install auth, endpoint selection, permissions, windows, shortcuts,
  overlay policy, diagnostics, and native shell behavior in main
- keep SDK wake-up and conversation runtime wiring explicit
- move reusable conversation/tool/replay semantics into the SDK when still
  duplicated in main
- extract only when the extracted module has a clear owner and test target
- avoid forwarding-only adapters that hide the actual command path

Success means a developer can read main as "desktop shell plus SDK host," not
"agent runtime plus UI bridge plus sidecar manager."

### 3. Renderer As Replaceable UI

Continue routing feature code through renderer app-runtime clients only where
the facade owns a real UI/runtime boundary:

- keep chat/dashboard/settings components focused on UI state and actions
- consume SDK display rows, current-turn projections, and SDK-normalized
  conversation events
- avoid new backend-wire interpretation in renderer feature code
- collapse or rename facades that only obscure direct SDK-shaped commands
- keep config, session, memory, model, and conversation helpers owned by
  app-runtime contracts rather than feature modules

Success means another UI could render the same SDK state without copying
WindieOS renderer internals.

### 4. SDK As Reusable Agent Runtime

Keep reusable semantics in the SDK:

- agent startup and local-runtime startup/reuse
- backend websocket lifecycle and typed command sends
- conversation event normalization
- display/current-turn/rehydrate projections
- edit, retry, replay, compaction, title, memory invalidation, and store
  continuity semantics
- local tool claim/execution/result-return coordination

Success means Electron, CLI, custom UI, plugin, and tests can share behavior
instead of growing host-specific copies.

### 5. Local Runtime Naming And Authority

Continue the recent local-runtime wording cleanup without hiding concrete
implementation facts:

- public/reusable contracts should say local runtime
- process-specific diagnostics may say Python daemon or sidecar when that is
  the thing being debugged
- local execution, memory/storage, browser, shell/filesystem, screenshots,
  wakeword helpers, and MCP execution stay below the local-runtime boundary
- backend URL injection into local runtime should remain explicit and
  observable

Success means "sidecar" describes the implementation process, not a competing
runtime authority.

### 6. Debuggable End-To-End Trace

This is the highest-priority workstream for long-running agents. For common
failures, provide one canonical route:

```text
renderer action
  -> SDK-shaped command or IPC channel
  -> main shell/permission/endpoint decision
  -> SDK runtime command/session event
  -> backend event or local-runtime tool execution
  -> SDK projection
  -> renderer display state
```

Prefer focused sanitized diagnostics over broad log volume. A useful diagnostic
should identify the producer, consumer, correlation ids, runtime owner, and
failure stage without leaking credentials, raw screenshots, file contents, or
provider payloads.

## Candidate First Slices

1. Document a single debug trace playbook for one user message through send,
   backend stream, local tool execution, SDK projection, and renderer display.
   The playbook should make it obvious which diagnostic command or event proves
   each stage.
2. Inventory renderer app-runtime clients and classify each as real boundary,
   forwarding-only, or migration shim. Delete or rename only one verified
   forwarding-only path per slice.
3. Inventory `ipc.cjs` responsibilities and identify one owner-correct
   extraction or deletion that preserves behavior and has a focused test target.
4. Add or tighten boundary tests that prevent renderer feature modules from
   importing app-provider internals or backend-wire event helpers.
5. Search for stale public `sidecar`/`local_backend` wording and separate
   implementation-process references from reusable local-runtime contracts.
6. Align any stale doctor/status/diagnostics docs with the current `<windie>`
   command surface so agents and humans start from the same runtime evidence.

## Validation Expectations

Each implementation slice should include:

- focused tests at the owning runtime
- a source scan for removed stale names or imports when naming is part of the
  cleanup
- docs updates when a public contract or routing rule changes
- `CHANGELOG.md` entry with migration/security note
- explicit "no migration required" when payload, storage, settings, schema, and
  API contracts are unchanged

Security-sensitive slices must check permission, IPC, credential, tool
execution, and machine-path boundaries.

## Completion Note Template

For each completed slice, record:

- goal pursued
- long-running-agent scope respected
- recent-commit direction preserved
- ownership clarified
- duplicate or compatibility path removed
- behavior change, if any
- validation performed
- migration/security note

## Progress Notes

### 2026-06-20 Local Demo Seed Provider Metadata Cleanup

- Finding: local demo memory seed conversations still used real provider/model
  IDs as decorative metadata.
- Change: replaced that metadata with generic demo provider/model IDs, updated
  seed docs, and added local-runtime Python coverage to keep demo fixtures
  provider-neutral.
- Validation: focused local-runtime Python seed tests, exact provider/model
  seed scan, docs listing, and diff checks.
- Compatibility: no migration required. Seed schemas, cleanup behavior, row
  shape, provider policy, credentials, permissions, IPC, storage paths, and
  local execution behavior are unchanged.

### 2026-06-20 SDK Web Search Projection Provider Label Cleanup

- Finding: synthetic provider-native `web_search` rows in SDK rehydrate
  projection still exposed an OpenAI-specific display label.
- Change: made SDK synthetic web-search labels provider-neutral, kept backend
  docs as the provider-mode source of truth, and added package-boundary
  coverage so the SDK projection label does not drift back.
- Validation: focused SDK conversation/runtime and package-boundary tests,
  exact stale SDK projection label scan, docs listing, and diff checks.
- Compatibility: no migration required. Stored events, synthetic tool ids,
  backend provider policy, tool schemas, IPC, credentials, permissions, hosted
  URLs, storage, and local execution behavior are unchanged.

### 2026-06-20 Renderer Dashboard Shell GPT Token Cleanup

- Finding: generic renderer dashboard shell CSS still kept unreferenced
  provider-specific `cg-gpt-*` selectors and `--ui-gpt-dot-bg` token naming.
- Change: removed the stale selectors/token and added a renderer skin boundary
  assertion so dashboard shell styles stay provider-neutral.
- Validation: focused renderer skin boundary tests, exact stale CSS-token scan,
  docs listing, and diff checks.
- Compatibility: no migration required. Dashboard markup, model/provider
  config, storage, credentials, permissions, hosted backend URLs, provider
  policy, and local execution behavior are unchanged.

### 2026-06-20 SDK Managed Stop Alias Guard Cleanup

- Finding: managed and unmanaged SDK hosted-session transports duplicated the
  removed snake_case stop-query alias rejection.
- Change: `ManagedAgentSession` now reuses the canonical `AgentSession`
  stop-alias guard, with checked-in CJS output and focused source coverage
  updated.
- Validation: focused backend SDK websocket contract tests, docs listing, stale
  inline managed-session alias-guard scan, and diff checks.
- Compatibility: no migration required. Stop-query behavior, backend websocket
  payloads, root SDK exports, storage, credentials, permissions, hosted backend
  URLs, provider policy, and local execution behavior are unchanged.

### 2026-06-20 Main Direct SDK Conversation Alias Cleanup

- Finding: the direct Electron Agent SDK adapter still allowed a removed
  `conversation_ref` alias on SDK library methods even though the main
  `windie:invoke` SDK-command boundary rejects that shape.
- Change: direct adapter SDK library methods now resolve conversation identity
  from `conversationRef` only, while backend-transport send/stop/rehydrate and
  compact commands continue to use canonical snake_case payload fields.
- Validation: focused direct adapter tests, docs listing, stale alias scan, and
  diff checks.
- Compatibility: no migration required. Public renderer commands, backend
  transport payloads, storage, credentials, permissions, hosted backend URLs,
  provider policy, and local execution behavior are unchanged.

- 2026-06-20: completed a renderer attachment metadata shape cleanup by
  removing the duplicate camelCase `attachmentFilenames` copy from prepared
  user-message metadata while preserving top-level renderer attachment state
  and canonical `attachment_filenames` metadata at the SDK/runtime boundary.
  Validation: focused chat sender and renderer chat-runtime boundary tests,
  exact duplicate-shape scan, docs listing, and diff checks. No migration
  required.

- 2026-06-20: completed a validation local-runtime Python test-label slice by
  routing CLI command docs, workflow matrices, release/security docs,
  dashboard guidance, and tool workflows away from sidecar test/pytest owner
  labels. Preserved concrete `<windie> test sidecar`, `python-in-env sidecar`,
  `tests/sidecar`, and `sidecar-runtime` command/path details. Validation:
  focused modular docs boundary test, exact stale validation-label scan, docs
  listing, and diff checks. No migration required.

- 2026-06-20: completed a platform local-runtime Python validation-label slice
  by routing platform validation, window/input, and computer-tool reference
  docs away from sidecar platform-test, shell-probe, switching-logic,
  computer-tool, input-control, and log-line owner labels. Preserved concrete
  `frontend/src/main/python/tools/computer`, `tests/sidecar`,
  `python-in-env sidecar`, `<windie> test sidecar`, and
  `<windie> build sidecar-runtime` command details. Validation: focused
  modular docs boundary test, exact stale platform-label scan, docs listing,
  and diff checks. No migration required.

- 2026-06-20: completed a memory replay conversation-store label slice by
  routing transcript replay, renderer transcript, and conversation identity
  docs through local-runtime Python conversation-store, transcript, handler,
  and RPC wording instead of sidecar conversation/test labels. Validation:
  focused modular docs boundary test, exact stale conversation store-label
  scan, docs listing, and diff checks. No migration required; runtime code,
  JSON-RPC method names, database schema, conversation row shape, search SQL
  behavior, dashboard replay, backend rehydrate payloads, IPC payloads, storage
  files, credentials, permissions, hosted backend URLs, provider policy, and
  trust boundaries are unchanged.

- 2026-06-20: completed a renderer response-overlay trace payload boundary
  slice by moving minimal response-overlay state/render diagnostic field
  shaping from `MinimalResponseOverlay.jsx` into
  `desktopRendererTraceRuntime.ts`. The overlay now passes value-level phase,
  visibility, response layout, entry-count, text-length, send-state, and
  message-count inputs to trace-runtime helpers instead of assembling
  `turn_id`, `is_visible`, `show_awaiting_reply`, `response_layout_mode`,
  `is_sending`, or `message_count` directly. Validation: focused renderer
  app-runtime boundary coverage and stale feature-code trace-field scan. No
  migration required; diagnostic log labels, trace gating, response-surface
  console logging, workspace snapshot enrichment, renderer state behavior, IPC
  payloads, storage, credentials, permissions, hosted URLs, provider policy,
  and local execution behavior are unchanged.

- 2026-06-20: completed an architecture local-runtime route-label slice by
  routing tool-system routing, backend endpoint failure, ownership decision,
  storage RPC, ToolResult validation, and RPC drift docs through
  local-runtime/local-runtime Python wording instead of sidecar routing/default
  labels. Validation: focused modular docs boundary test, exact stale
  architecture route-label scan, docs listing, and diff checks. No migration
  required; no runtime code, JSON-RPC method name, endpoint env var, storage,
  ToolResult payload, IPC payload, credential, permission, hosted URL,
  provider-policy, or trust-boundary behavior changed.
- 2026-06-20: completed a frontend local-runtime route-label slice by routing
  IPC troubleshooting, frontend inventory headings, source-map query labels,
  change-path validation labels, and backend endpoint config docs through
  local-runtime/local-runtime Python wording instead of sidecar public-route
  labels. Validation: focused modular docs boundary test, exact stale
  route-label scan, docs listing, and diff checks. No migration required; no
  runtime code, endpoint env var, Python file path, JSON-RPC payload, IPC
  payload, storage, credential, permission, hosted URL, provider-policy, or
  trust-boundary behavior changed.

- 2026-06-20: completed a renderer chat-pill state trace payload boundary
  slice by moving minimal chat-pill state diagnostic field shaping from
  `MinimalChatPill.jsx` into `desktopRendererTraceRuntime.ts`.
  `MinimalChatPill.jsx` now passes value-level conversation, turn, phase,
  send/busy, stop-availability, and message-count inputs to
  `logRendererChatPillStateTrace(...)` instead of assembling
  `conversation_ref`, `current_turn_phase`, `live_turn_phase`, or
  `message_count` directly. Validation: focused renderer app-runtime boundary
  coverage and stale feature-code trace-field scan. No migration required;
  diagnostic log labels, trace gating, workspace snapshot enrichment, renderer
  state behavior, IPC payloads, storage, credentials, permissions, hosted URLs,
  provider policy, and local execution behavior are unchanged.
- 2026-06-20: completed a first-read local-runtime Python navigation label
  slice by routing top-level docs, frontend docs navigation, architecture
  implementation title, and local-runtime memory doc title through
  local-runtime Python wording instead of Python Sidecar/Sidecar public labels.
  Validation: focused modular docs boundary test, exact stale navigation-label
  scan, docs listing, and diff checks. No migration required; no runtime code,
  doc path, daemon filename, bundled runtime behavior, SDK local-runtime
  behavior, JSON-RPC payload, IPC payload, storage, credential, permission,
  hosted URL, provider-policy, or trust-boundary behavior changed.
- 2026-06-20: completed an active local-runtime Python owner-label sweep by
  routing remaining active API, backend, frontend, operations, security,
  extension, and local-runtime docs through local-runtime Python wording
  instead of Python sidecar owner labels. Validation: focused modular docs
  boundary test, active stale-label scan, docs listing, and diff checks. No
  migration required; no runtime code, doc path, test path, tool schema, auth
  behavior, environment variable, JSON-RPC payload, IPC payload, storage,
  credential, permission, hosted URL, provider-policy, or trust-boundary
  behavior changed.
- 2026-06-20: completed a tool pipeline local-runtime Python label slice by
  routing web-search, tool-schema policy, filesystem/shell flow, credential,
  landing workflow, and agent-visible pipeline docs through local-runtime
  Python/local-runtime wording instead of Python sidecar owner labels.
  Validation: focused modular docs boundary test, exact stale tool/pipeline
  label scan, docs listing, and diff checks. No migration required; no runtime
  code, tool schema, web-search behavior, auth header, environment variable,
  JSON-RPC payload, IPC payload, storage, credential, permission, hosted URL,
  provider-policy, or trust-boundary behavior changed.
- 2026-06-20: completed a source-map local-runtime Python implementation label
  slice by routing renderer, local-runtime Python, and development folder maps
  through local-runtime Python implementation wording instead of Python sidecar
  owner labels. Validation: focused modular docs boundary test, exact stale
  source-map label scan, docs listing, and diff checks. No migration required;
  no runtime code, source path, test path, daemon filename, JSON-RPC payload,
  IPC payload, storage, credential, permission, hosted URL, provider-policy, or
  trust-boundary behavior changed.
- 2026-06-20: completed a platform setup local-runtime Python environment
  label slice by routing the backend/frontend setup guide through
  local-runtime Python environment/dependency/interpreter wording instead of
  mixed local-runtime/sidecar setup and dependency labels. Validation:
  focused modular docs boundary test, docs listing, exact stale platform setup
  label scan, and diff checks. No migration required; no runtime code, venv
  path, dependency file, Electron launch behavior, `WINDIE_PYTHON_PATH`
  behavior, tool execution, IPC payload, storage, credential, permission,
  hosted URL, provider-policy, or trust-boundary behavior changed.
- 2026-06-20: completed a public-route local-runtime Python label slice by
  routing README install/resolution copy, hosted API rules, tool-schema payload
  rejection, source-map ownership, transcript RPC diagrams, and install
  troubleshooting command groups through local-runtime Python wording instead
  of Python sidecar/sidecar route labels. Validation: focused modular docs
  boundary test, docs listing, exact stale public-route label scan, and diff
  checks. No migration required; no runtime code, command name, CLI alias,
  environment variable, daemon filename, JSON-RPC payload, IPC payload,
  storage, credential, permission, hosted URL, provider-policy, or
  trust-boundary behavior changed.
- 2026-06-20: completed a first-read local-runtime Python setup label slice by
  routing concepts, quick-start, installation, and troubleshooting docs through
  local-runtime Python setup/status/log wording instead of Python sidecar
  setup/runtime labels. Validation: focused modular docs boundary test, docs
  listing, exact stale first-read setup label scan, and diff checks. No
  migration required; no runtime code, dependency file, Electron launch
  behavior, tool execution, log sink, IPC payload, storage, credential,
  permission, hosted URL, provider-policy, or trust-boundary behavior changed.
- 2026-06-20: completed a local-runtime execution label slice by routing
  architecture drag execution through local-runtime Python wording and platform
  local-tool execution through local runtime wording instead of sidecar
  execution labels. Validation: focused modular docs boundary test, docs
  listing, exact stale execution label scan, and diff checks. No migration
  required; no runtime code, coordinate normalization, permission behavior, tool
  execution, IPC payload, storage, credential, hosted URL, provider-policy, or
  trust-boundary behavior changed.
- 2026-06-20: completed a local-runtime Python service hub label slice by
  routing service startup/framing and daemon hub labels through local-runtime
  Python service/daemon wording instead of sidecar service/daemon labels.
  Validation: focused modular docs boundary test, docs listing, exact stale
  service label scan, and diff checks. No migration required; no runtime code,
  service framing, wakeword subprocess behavior, daemon launch behavior, IPC
  payload, storage, credential, permission, hosted URL, provider-policy, or
  trust-boundary behavior changed.
- 2026-06-20: completed an IPC local-runtime authority label slice by routing
  the security triage row through local-runtime authority wording instead of
  sidecar authority. Validation: focused modular docs boundary test, docs
  listing, exact stale authority label scan, and diff checks. No migration
  required; no runtime code, permission behavior, IPC payload, preload
  allowlist, local-runtime execution, storage, credential, hosted URL,
  provider-policy, or trust-boundary behavior changed.
- 2026-06-20: completed a local-runtime transcript/memory storage label slice
  by routing transcript replay, memory identity, dashboard, docs hub, and docs
  structure routes through local-runtime transcript storage, local-runtime
  memory storage, and local-runtime Python handler/search wording instead of
  sidecar storage/handler/search/DB labels. Validation: focused modular docs
  boundary test, docs listing, exact stale storage label scan, and diff checks.
  No migration required; no runtime code, database schema, conversation row
  shape, search SQL behavior, dashboard replay, backend rehydrate payload, IPC
  payload, storage file, credential, permission, hosted URL, provider-policy, or
  trust-boundary behavior changed.
- 2026-06-20: completed a frontend architecture local-runtime JSON-RPC method
  label slice by replacing the remaining "Sidecar method names" architecture
  wording with local-runtime JSON-RPC method wording while preserving the SDK
  boundary and local store implementation-detail guidance. Validation covered
  the focused modular docs boundary test, docs listing, exact stale method
  label scans, and diff checks. No migration required; no runtime code,
  JSON-RPC method name, IPC payload, storage, credential, permission, hosted
  URL, provider-policy, or trust-boundary behavior changed.
- 2026-06-20: completed a configuration local-runtime env label slice by
  routing backend config guardrails, operations configuration validation, and
  docs-hub evidence labels through local-runtime env/local-runtime wording
  instead of sidecar env or sidecar evidence labels. The slice preserved
  backend config assembly, Electron endpoint propagation, packaged runtime, and
  local-runtime Python environment behavior while extending the modular docs
  guard against the retired phrases. Validation covered the focused modular
  docs boundary test, docs listing, exact stale config/env label scans, and
  diff checks. No migration required; no runtime code, settings payload,
  endpoint value, env variable name, JSON-RPC/daemon payload, IPC payload,
  storage, credential, permission, hosted URL, provider-policy, or
  trust-boundary behavior changed.
- 2026-06-20: completed a local-runtime Python handler/response label slice by
  routing system-state, IPC, local-runtime JSON-RPC, and local-runtime bridge
  docs through local-runtime Python handler params, protocol tests,
  success/error envelopes, and system-state fallback wording instead of
  sidecar/Python sidecar handler owner labels. The same slice preserved related
  configuration/docs-hub dirty work by routing sidecar env/doctor evidence to
  local-runtime env wording. Validation: focused modular docs boundary test,
  docs listing, exact stale handler/response/env label scan, and diff checks.
  No migration required; no runtime code, JSON-RPC method name, handler
  signature, response envelope, system-state fallback value, config propagation,
  IPC payload, storage, credential, permission, hosted URL, provider-policy, or
  trust-boundary behavior changed.
- 2026-06-20: completed a local-runtime Python diagnostic/process label slice
  by routing docs hub, architecture, diagnostic flags, observability, process
  health, and release-packaging docs through local-runtime Python stdout,
  stderr, spawn-readiness, hosted-helper-client, and platform dependency
  wording instead of Python sidecar process/log labels. The slice preserved
  concrete `sidecar_daemon.py`, `resources/python-runtime`, env flag, and
  packaged-runtime details while extending the modular docs guard against the
  retired phrases. Validation covered the focused modular docs boundary test,
  docs listing, exact stale diagnostic/process label scans, and diff checks. No
  migration required; no runtime code, executable behavior, JSON-RPC/daemon
  payload, IPC payload, storage, credential, permission, hosted URL,
  provider-policy, or trust-boundary behavior changed.
- 2026-06-20: completed a runtime-node local-runtime Python label slice by
  routing runtime-node, transcript replay, desktop, concept, docs-hub,
  workflow, architecture link-label, tool-development, platform, debug,
  tool-catalog, agent-architecture, and mobile-planning docs through
  local-runtime Python implementation wording instead of Python sidecar
  node/subprocess/test/storage labels. The slice preserved concrete
  `frontend/src/main/python`, `tests/sidecar`, and Python subprocess details
  while extending the modular docs guard against the retired phrases.
  Validation covered the focused modular docs boundary test, docs listing,
  exact stale runtime-node label scan, and diff checks. No migration required;
  runtime code, transcript storage, local-runtime process behavior, tool
  execution, JSON-RPC/daemon payloads, IPC payloads, storage files,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.
- 2026-06-20: completed a browser/platform local-runtime Python label slice by
  routing browser workflow/hub, browser automation stack, storage persistence,
  source-map export, runtime ownership, and platform workflow docs through
  local-runtime Python Browser Use adapter, browser action, browser file-store,
  handler, launcher, tool export, tool implementation, and computer-platform
  wording instead of Python sidecar browser/action/launcher/handler,
  sidecar-tool export, and platform-tool labels. The slice preserved concrete
  Browser Use, `local_backend.py`, `frontend/src/main/python`, and
  `tests/sidecar` references while extending the modular docs guard against the
  retired phrases. Validation covered the focused modular docs boundary test,
  docs listing, exact stale browser/platform label scan, and diff checks. No
  migration required; runtime code, browser behavior, Browser Use invocation,
  file-store behavior, platform adapters, tool schemas, JSON-RPC/daemon
  payloads, IPC payloads, storage, credentials, permissions, hosted backend
  URLs, provider policy, and trust boundaries are unchanged.
- 2026-06-20: completed a local-runtime Python internals/backing-label slice by
  routing architecture, browser, voice/wakeword, debug, getting-started, memory,
  plugin, tool, filesystem/shell, permission, IPC, and lifecycle docs through
  local-runtime Python implementation/storage/service/protocol/validation/
  browser-tool/daemon wording instead of presenting Python sidecar or
  sidecar-browser labels as reusable owners. The slice preserved concrete
  `sidecar_daemon.py`, `tests/sidecar`, and `frontend/src/main/python` paths and
  extended the modular docs guard against the retired phrases. Validation
  covered the focused modular docs boundary test, docs listing, exact stale
  internals-label scan, and diff checks. No migration required; runtime code,
  executable behavior, tool schemas, JSON-RPC/daemon payloads, IPC payloads,
  storage, credentials, permissions, hosted backend URLs, provider policy, and
  trust boundaries are unchanged.
- 2026-06-20: completed a local-runtime Python tool-registration label slice by
  routing ADR alternatives, browser parity validation, platform validation,
  overlay/surface workflows, local-runtime memory/tooling notes, and
  local-runtime tool sub-hub read_when labels through local-runtime Python tool
  wording instead of sidecar tool/tooling owner labels. The slice preserved
  concrete `tests/sidecar` validation paths, browser implementation filenames,
  and current local-runtime Python behavior while extending the modular docs
  boundary guard against stale sidecar-tool owner labels. Validation covered the
  focused modular docs boundary test, docs listing, exact active sidecar-tool
  stale-label scan, and diff checks. No migration required; runtime code,
  executable behavior, tool schemas, JSON-RPC/daemon payloads, IPC payloads,
  storage, credentials, permissions, hosted backend URLs, provider policy, and
  trust boundaries are unchanged.

- 2026-06-20: completed a local-runtime Python daemon-label slice by routing
  architecture, local-runtime daemon, local-runtime memory, and error routing
  docs through local-runtime Python daemon/process wording instead of local
  Python sidecar, Python sidecar daemon, or sidecar process helper labels. The
  slice preserved concrete `sidecar_daemon.py`, discovery-file, and frontend
  sidecar path names. Validation covered the focused modular docs boundary
  test, docs listing, exact active daemon/process stale-label scan, and diff
  check. No migration required; runtime code, executable behavior, daemon
  discovery payloads, JSON-RPC/WebSocket payloads, IPC payloads, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

- 2026-06-20: completed a local-runtime Python process-label slice by routing
  runtime configuration, packaged desktop, endpoint setup, and installation
  docs through local-runtime Python process wording instead of Python sidecar
  process or local Python sidecar wording. The slice preserved concrete bundled
  runtime paths, `WINDIE_PYTHON_PATH`, and `WINDIE_BACKEND_HTTP_URL` names.
  Validation covered docs listing, exact public install/config process-label
  scan, and diff check. No migration required; runtime code, packaging
  commands, executable behavior, environment variable names,
  JSON-RPC/daemon payloads, IPC payloads, storage, credentials, permissions,
  hosted backend URLs, provider policy, and trust boundaries are unchanged.

- 2026-06-20: completed a local-runtime Python tool-label slice by routing
  debug, browser, sidecar-tool, and backend bridge docs through local-runtime
  Python tool/result wording instead of Python sidecar tool labels. The slice
  preserved concrete `frontend/src/main/python` paths and current
  `tests/sidecar` validation routes. Validation covered the focused modular
  docs boundary test, docs listing, exact active Python-sidecar-tool stale-label
  scan, and diff check. No migration required; runtime code, executable
  behavior, tool schemas, JSON-RPC/daemon payloads, IPC payloads, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

- 2026-06-20: completed an import-boundary code-owner label slice by routing
  architecture, ADR, getting-started, automation, frontend main, frontend
  inventory, sidecar workflow, backend service, review, and triage docs through
  desktop client/local-runtime Python code wording instead of desktop
  client/Python sidecar code or Python sidecar code labels. The slice kept
  concrete Python sidecar implementation/process details where they identify
  the daemon, current implementation, command names, or file paths, and added a
  focused modular docs boundary guard against reintroducing the stale code-owner
  labels. Validation covered the focused modular docs boundary test, docs
  listing, exact stale import-boundary code-owner label scan, and diff check.
  No migration required; runtime code, executable behavior, tool schemas,
  JSON-RPC/daemon payloads, IPC payloads, storage, credentials, permissions,
  hosted backend URLs, provider policy, and trust boundaries are unchanged.

- 2026-06-20: completed a browser adapter/import-rule label slice by routing
  browser hub, workflow, ADR, backend bridge, routing, local-runtime browser
  docs, and cross-runtime backend-import parity rules through local-runtime
  Python adapter/code wording instead of Python sidecar adapter/code wording.
  The slice preserved Browser Use invocation, concrete
  `frontend/src/main/python` implementation paths, and current browser action
  behavior while updating the modular docs boundary expectations. Validation
  covered the focused modular docs boundary test, docs listing, exact active
  browser-adapter/import-rule stale-label scans, and diff check. No migration
  required; browser runtime code, action schemas, Browser Use invocation, local
  file behavior, JSON-RPC/daemon payloads, IPC payloads, permissions, storage,
  credentials, hosted backend URLs, provider policy, and trust boundaries are
  unchanged.

- 2026-06-20: completed a local-runtime Python implementation-label slice by
  routing Python sidecar architecture, memory, workflow, and tool-catalog docs
  through local-runtime Python implementation wording instead of Python sidecar
  implementation labels. The slice preserved concrete Python sidecar process
  facts where they identify the daemon or file paths and added a focused docs
  guard against reintroducing the stale phrase. Validation covered the focused
  modular docs boundary test, docs listing, exact stale
  Python-sidecar-implementation label scan, and diff check. No migration
  required; runtime code, executable behavior, tool schemas,
  JSON-RPC/daemon payloads, IPC payloads, storage, credentials, permissions,
  hosted backend URLs, provider policy, and trust boundaries are unchanged.

- 2026-06-20: completed a local-runtime Python validation-label slice by
  routing channel, data-pipeline, development, JSON-RPC, settings,
  main-process, sidecar-tool, node, configuration, and tool-lifecycle docs
  through local-runtime Python
  test and implementation wording instead of Python sidecar test or sidecar
  implementation owner labels. Validation covered the focused modular docs
  boundary test, docs listing, exact stale Python-sidecar-test label scan, and
  diff check. No migration required; runtime code, test commands, executable
  tool behavior, JSON-RPC/daemon payloads, IPC payloads, tool schemas, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

- 2026-06-20: completed a local-runtime Python module-backing label slice by
  routing architecture, tool, MCP, storage, memory, artifact, JSON-RPC,
  reference, and developer docs through local-runtime Python modules and
  desktop client/local-runtime schema wording instead of Python sidecar module
  or generic client-local labels. Validation covered the focused modular docs
  boundary test, docs listing, exact stale module-backing label scan, and diff
  check. No migration required; runtime code, tool schemas,
  client-manifest payloads, local storage files, JSON-RPC/daemon payloads, IPC
  payloads, credentials, permissions, hosted backend URLs, provider policy, and
  trust boundaries are unchanged.

- 2026-06-20: completed a boundary-hub local-runtime Python label slice by
  routing getting-started, security, onboarding, IPC, observability,
  backend-tool, frontend inventory, system-state, architecture, and node hub
  docs through local-runtime Python implementation wording instead of Python
  sidecar implementation boundary labels. Validation covered the focused
  modular docs boundary test, docs listing, exact stale boundary-hub label
  scan, and diff check. No migration required; runtime code, tool schemas,
  local runtime process behavior, JSON-RPC/daemon payloads, IPC payloads,
  storage, credentials, permissions, hosted backend URLs, provider policy, and
  trust boundaries are unchanged.

- 2026-06-20: completed an import-boundary local-runtime Python label slice by
  routing channel, security, runtime-model, tool-schema, and runtime-node docs
  through local-runtime Python implementation wording instead of Python sidecar
  implementation owner labels for import-boundary rules, schema parity, local
  action execution, and node ownership. Validation covered the focused modular
  docs boundary test, docs listing, exact stale import-boundary/node-owner label
  scan, and diff check. No migration required; runtime code, schema contracts,
  local-runtime process names, JSON-RPC/daemon payloads, IPC payloads, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

- 2026-06-20: completed a source-map/reference local-runtime Python polish
  slice by routing residual source-map navigation, source-map deep page,
  configuration endpoint-policy, code-change owner table, and validation labels
  through local-runtime Python implementation wording instead of Python sidecar
  implementation route-owner labels. Validation covered the focused modular
  docs boundary test, docs listing, exact stale source-map/reference label
  scan, and diff check. No migration required; runtime code, config variables,
  endpoint propagation, local tool execution, JSON-RPC/daemon payloads, IPC
  payloads, storage, credentials, permissions, hosted backend URLs, provider
  policy, and trust boundaries are unchanged.

- 2026-06-20: completed a bundled local-runtime Python packaging/source label
  slice by routing packaged process startup, bytecode-only sources, package
  topology, validation, debug rows, and local-tool exercise checks through
  local-runtime Python process/bundle/package wording instead of Sidecar
  runtime/process or Python sidecar route-owner labels while preserving
  existing `sidecar-runtime` command names and build script paths.
  Validation covered the focused modular docs boundary test, docs listing,
  exact stale packaging/source-label scan, and diff check. No migration
  required; package command names, build script paths, bundled runtime paths,
  Electron Builder config, packaged startup, package import surfaces,
  feature-pack behavior, browser extraction behavior, JSON-RPC/daemon payloads,
  IPC payloads, storage, credentials, permissions, hosted backend URLs,
  provider policy, and trust boundaries are unchanged.

- 2026-06-20: completed a browser local-runtime adapter label slice by routing
  browser control architecture and dedicated-browser runtime state docs through
  SDK/main local-runtime dispatch and the local-runtime Python browser adapter
  instead of Sidecar section, diagram, or actor labels. Validation covered the
  focused modular docs boundary test, docs listing, exact stale browser-label
  scan, and diff check. No migration required; browser action names, Browser
  Use daemon behavior, CDP host/port policy, dedicated profile paths,
  feature-pack installation, JSON-RPC/daemon payloads, IPC payloads, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

- 2026-06-20: completed a plugin/inventory local-runtime label slice by
  routing plugin, extension, validation, browser, frontend inventory, and
  tool-system docs through SDK local-runtime client, local-runtime Python
  implementation, browser adapter wording, and backend-only tools not going
  through the local runtime instead of sidecar client or Python sidecar
  implementation route-owner labels. Validation covered the focused modular
  docs boundary test, docs listing, exact stale plugin/browser/inventory label
  scan, and diff check. No migration required; runtime
  code, plugin loading, local tool execution, JSON-RPC/daemon payloads, IPC
  payloads, tool-result envelopes, storage, credentials, permissions, hosted
  backend URLs, provider policy, and trust boundaries are unchanged.

- 2026-06-20: completed a debug/runbook local-runtime Python label slice by
  routing debug traces, failure routing, incident/evidence runbooks, security
  hub, filesystem/shell, MCP, tool-development, computer-tool, platform, and
  tool-schema workflow docs through local-runtime Python implementation wording
  instead of Python sidecar implementation/backing route-owner labels.
  Validation covered the focused modular docs boundary test, docs listing,
  exact stale debug/runbook/development/tool-workflow label scan, and diff
  check. No migration required; runtime code, local tool execution,
  JSON-RPC/daemon payloads, IPC payloads, tool-result envelopes, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

- 2026-06-20: completed a tool data-flow local-runtime Python label slice by
  routing public architecture data-flow, communication, backend overview,
  reference, mobile-planning, computer-tool, platform, tool-lifecycle, and
  tool-registry, local-memory, inventory, docs-hub, and local-runtime Python
  sub-hub docs through local-runtime Python implementation/executor wording
  instead of Python sidecar execution/backing route-owner labels. Validation
  covered the focused modular docs boundary test, docs listing, exact stale
  tool data-flow label scan, and diff check. No migration required; runtime
  code, local tool execution,
  JSON-RPC/daemon payloads, IPC payloads, tool-result envelopes, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

- 2026-06-20: completed a first-read local-runtime execution-flow label slice
  by routing the README SDK runtime diagram, install topology copy, docs hub
  summaries, browser route labels, routing quick cards, system architecture
  flow steps, tool execution lifecycle, and compact docs directory through
  local-runtime Python implementation/executor wording instead of Python
  sidecar execution/backing route-owner labels. Validation covered the focused
  modular docs boundary test, docs listing, exact stale first-read
  execution-label scan, and diff check. No migration required; runtime code,
  local tool execution,
  JSON-RPC/daemon payloads, IPC payloads, tool-result envelopes, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

- 2026-06-20: completed a channel local-runtime executor-label slice by routing
  channel maps, local-tool failure routing, gateway troubleshooting, and
  browser-tool runtime split docs through SDK/main local-runtime routing and
  local-runtime Python executor/daemon wording instead of Python sidecar
  executor/daemon route-owner labels. Validation covered the focused modular
  docs boundary test, docs listing, exact stale channel executor-label scan,
  and diff check. No migration required; runtime code, tool execution,
  JSON-RPC/daemon payloads, IPC payloads, browser action behavior, tool-result
  envelopes, storage, credentials, permissions, hosted backend URLs, provider
  policy, and trust boundaries are unchanged.

- 2026-06-20: completed a first-read local-runtime authority label slice by
  routing first-read, tool hub, operations security, and development
  architecture docs through local-runtime authority, local-runtime execution,
  local-runtime Python implementation, and local-runtime Python test wording
  instead of Python sidecar or sidecar test route-owner shorthand. Validation
  covered the focused modular docs boundary test, docs listing, exact stale
  first-read/security/tool label scan, and diff check. No migration required;
  runtime code, local tool execution, local storage, IPC payloads, tool schemas,
  storage, credentials, permissions, hosted backend URLs, provider policy, and
  trust boundaries are unchanged.

- 2026-06-20: completed a local-runtime JSON-RPC and plugin route-label slice
  by routing agent-visible pipeline, browser workflow/tool docs, debug observability,
  node routing, and plugin hub docs through local-runtime Python JSON-RPC,
  local-runtime Python browser adapter, SDK/main local-runtime plugin dispatch,
  and local-runtime Python protocol-test wording instead of Python-side or
  sidecar executor/adapter/plugin/stdout route-owner labels. Validation covered
  the focused modular docs boundary test, docs listing, exact stale
  JSON-RPC/plugin route-label scan, and diff check. No migration required;
  runtime code, JSON-RPC payloads, IPC payloads, browser action behavior,
  plugin execution, tool-result envelopes, storage, credentials, permissions,
  hosted backend URLs, provider policy, and trust boundaries are unchanged.

- 2026-06-20: completed a local-runtime JSON-RPC route-label slice by routing
  local-runtime JSON-RPC reference/workflow, lifecycle read hints,
  backend-tool lane notes, and runtime ownership routing through
  local-runtime daemon, local-runtime Python process/stdout/validation,
  local-runtime dispatch, and local-runtime daemon client/lifecycle wording
  instead of sidecar daemon or Python sidecar process route-owner labels.
  Validation covered the focused modular docs boundary test, docs listing,
  exact stale JSON-RPC route-label scan, and diff check. No migration required;
  runtime code, JSON-RPC endpoints, request/response envelopes, daemon startup,
  timeout policy, backend tool dispatch behavior, IPC payloads, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

- 2026-06-20: completed a public tool-system local-runtime executor label
  slice by routing public tool-system, node matrix, help, and API/reference
  docs through local-runtime Python executor/daemon and local-runtime daemon
  contract wording instead of presenting the Python sidecar daemon as the
  public local tool owner. Validation covered the focused modular docs
  boundary test, docs listing, exact stale public daemon-label scan, and diff
  check. No migration required; runtime code, SDK/main local-runtime dispatch,
  Python executor behavior, JSON-RPC payloads, tool schemas, storage,
  credentials, permissions, hosted backend URLs, provider policy, and trust
  boundaries are unchanged.

- 2026-06-20: completed a frontend inventory local-runtime daemon label slice
  by routing inventory, main-process, websocket, protocol, and renderer
  transcript references through SDK-owned local-runtime daemon,
  local-runtime exposed tools, local-runtime Python spawn/readiness, and
  local-runtime chat-event/JSON-RPC wording instead of sidecar-daemon or
  sidecar-exposed public-owner labels. Validation covered the focused modular
  docs boundary test, docs listing, exact stale frontend daemon-label scan,
  and diff check. No migration required; runtime code, local-runtime daemon
  startup, JSON-RPC request dispatch, tool argument validation, chat-event
  storage, IPC payloads, storage, credentials, permissions, hosted backend
  URLs, provider policy, and trust boundaries are unchanged.

- 2026-06-20: completed a frontend inventory local-runtime label slice by
  routing frontend inventory, main, transcript, protocol, and domain ownership
  daemon/chat-event/tool-exposed/arg-validation wording through local-runtime
  labels; routing renderer ownership through UI intent/display state; cleaning
  mojibake quote text; and extending the modular docs guard to cover the
  retired phrases and matrix. Validation covered the focused modular docs
  boundary test, docs listing, exact mojibake marker scan, stale ownership
  phrase scan, and diff check. No migration required; runtime code, renderer
  behavior, IPC payloads, tool execution routing, local-runtime Python
  behavior, storage, credentials, permissions, hosted backend URLs, provider
  policy, and trust boundaries are unchanged.

- 2026-06-20: completed a local-runtime screenshot label follow-up by routing
  coordinate-resolution, artifact payload, platform, screenshot overlay, and
  tool lifecycle docs through local-runtime screenshot result, invocation,
  task, implementation, and tool wording instead of sidecar screenshot owner
  labels. Validation covered the focused modular docs boundary test, docs
  listing, exact stale screenshot-label scan, and diff check. No migration
  required; runtime code, screenshot capture behavior, capture metadata, IPC
  payloads, tool-result payloads, storage, credentials, permissions, hosted
  backend URLs, provider policy, and trust boundaries are unchanged.

- 2026-06-20: completed a communication-flow mojibake cleanup slice by
  replacing unreadable user-query, tool-execution, error-flow, and transport
  arrows plus memory debugging quotes with ASCII runtime-flow text. Validation
  covered the focused modular docs boundary test, docs listing, exact mojibake
  marker scan, and diff check. No migration required; runtime code, IPC
  payloads, websocket events, local-runtime process startup, storage,
  credentials, permissions, hosted backend URLs, provider policy, and tool
  execution behavior are unchanged.

- 2026-06-20: completed a frontend architecture local-runtime label slice by
  routing frontend architecture overview/implementation notes,
  communication-flow diagrams and flows, plus platform/window-lifecycle
  screenshot references for local-runtime Python implementation, daemon
  startup, hosted SDK client, dependency install, chat-event RPC names,
  screenshot capture, title updates, memory flow, and exposed tool surface
  through local-runtime wording instead of sidecar public-owner labels.
  The slice also cleaned hosted memory debugging quote mojibake and guarded
  core architecture docs against mojibake markers. Validation covered the
  focused modular docs boundary test, docs listing, exact stale
  frontend-architecture label scan, and diff check. No migration required;
  runtime code, SDK local-runtime startup, screenshot behavior, conversation
  store metadata, tool registry behavior, IPC channels, storage, credentials,
  permissions, hosted backend URLs, and provider policy are unchanged.

- 2026-06-20: completed a first-read architecture local-runtime label slice by
  routing the architecture hub, communication overview, and development
  source-map line through local-runtime Python implementation wording instead
  of presenting the Python sidecar as a peer runtime owner. Validation covered
  the focused modular docs boundary test, docs listing, exact stale first-read
  phrase scan, and diff check. No migration required; runtime code, process
  startup, IPC payloads, storage, credentials, permissions, hosted backend URLs,
  provider policy, and local-runtime behavior are unchanged.

- 2026-06-20: completed a packaged/local-runtime launch wording slice by
  routing packaging, install troubleshooting, runtime-path, browser adapter,
  platform validation, and auth-state docs through local-runtime startup or
  launch labels instead of public sidecar launch labels. Validation covered the
  focused modular docs boundary test, docs listing, exact stale launch-label
  scan, and diff check. No migration required; packaged runtime paths,
  launch options, auth-state file format, Python sidecar implementation,
  IPC payloads, storage contents, credentials, permissions, hosted backend
  URLs, and provider policy are unchanged.

- 2026-06-20: completed a diagnostics command-surface slice by routing
  persistent app diagnostics storage discovery through `<windie> diagnostics
  paths` instead of a macOS-only SQLite path and aligning the Runtime Traces
  index wording with local-runtime trace routes. Validation covered the focused
  modular docs boundary test, docs listing, live diagnostics path command,
  stale hardcoded path scan, and diff check. No migration required; diagnostic
  database schema, trace rows, IPC payloads, storage contents, credentials,
  permissions, hosted backend URLs, and provider policy are unchanged.

- 2026-06-20: completed a local-runtime process-label slice by routing
  platform, operations, doctor, protocol-error, packaged-build, and development
  workflow sidecar-process labels through local-runtime startup or Electron
  host-status wording while preserving the packaged Python sidecar entrypoint.
  Validation covered the focused modular docs boundary test, docs listing, exact
  stale sidecar-process label scan, and diff check. No migration required;
  runtime code, packaged startup, local-runtime status payloads, Python
  entrypoints, IPC payloads, storage, credentials, permissions, hosted backend
  URLs, and provider policy are unchanged.

- 2026-06-20: completed a local-runtime debug-label slice by routing logging,
  diagnostic flags, process-health, runtime-trace, observability,
  tool-development, evidence-collection, and docs-index labels through
  local-runtime Python wording instead of sidecar debug labels.
  Validation covered the focused modular docs boundary test, docs listing, exact
  stale debug-label scan, and diff check. No migration required; runtime code,
  log sinks, stderr behavior, diagnostic flags, process startup, IPC payloads,
  storage, credentials, permissions, hosted backend URLs, and provider policy
  are unchanged.

- 2026-06-20: completed a stream-trace SDK route slice by routing the debug
  Stream Event Trace table through SDK backend-event handling, main renderer
  fan-out, and renderer SDK conversation-event consumption instead of
  relay-only stream wording. Validation covered the focused modular docs
  boundary test, docs listing, exact stale stream-trace route scan, and diff
  check. No migration required; runtime code, websocket events, IPC channels,
  SDK projections, renderer state, storage, credentials, permissions, hosted
  backend URLs, and provider policy are unchanged.

- 2026-06-20: completed a local-runtime status/memory label slice by routing IPC
  status, extension executable-tool routing, local-memory title storage, and
  mobile memory-parity risk labels through SDK/local-runtime wording instead of
  sidecar owner labels. Validation covered the focused modular docs boundary
  test, docs listing, exact stale owner-label scan, and diff check. No migration
  required; IPC channels, status payloads, tool registry behavior, title
  storage, memory retrieval, SDK/backend title generation routes, credentials,
  permissions, hosted backend URLs, and provider policy are unchanged.

- 2026-06-20: completed a mobile baseline tool-execution label slice by routing
  the mobile planning baseline through SDK local-runtime execution backed by the
  Python sidecar implementation instead of presenting the local Python sidecar
  as a parallel runtime target. Validation covered the focused modular docs
  boundary test, docs listing, exact stale mobile baseline phrase scan, and diff
  check. No migration required; runtime code, mobile APIs,
  capability-negotiation plans, tool schemas, IPC channels, storage,
  credentials, permissions, hosted backend URLs, and provider policy are
  unchanged.

- 2026-06-20: completed a local-runtime Python process-label slice by routing
  operations configuration, JSON-RPC workflow, and debug failure labels for
  Python executable selection, process exit/error handling, stderr forwarding,
  lifecycle readiness, and bridge failure routing through local-runtime Python
  process/daemon wording. Validation covered the focused modular docs boundary
  test, docs listing, exact stale process-label scan, and diff check. No
  migration required; environment variable names, process launch behavior,
  stdout/stderr forwarding, JSON-RPC request cleanup, IPC channels, storage,
  credentials, permissions, hosted backend URLs, and provider policy are
  unchanged.

- 2026-06-20: completed a local tool channel executor-label slice by routing
  the channel guide and routing matrix through SDK/main local-runtime execution
  and local-runtime Python executor wording instead of making the token-auth
  sidecar daemon the canonical executor. Validation covered the focused modular
  docs boundary test, docs listing, exact stale channel-executor phrase scan,
  and diff check. No migration required; tool execution routing, daemon HTTP
  endpoints, tool-result payloads, renderer display projections, IPC channels,
  storage, credentials, permissions, hosted backend URLs, and provider policy
  are unchanged.

- 2026-06-20: aligned the renderer app-runtime inventory with the live
  `desktopStreamPhaseRuntime.js` state/rule facade and added a renderer
  boundary guard against the stale `desktopStreamPhaseRuntime.ts` filename.
  Validation covered the focused renderer app-runtime boundary test, docs
  listing, live app-runtime inventory scan, stale filename scan, and diff
  check. No migration required; runtime code, IPC channels, SDK dispatch,
  storage, credentials, permissions, hosted backend URLs, and provider policy
  are unchanged.

- 2026-06-20: routed README transcript, prompt/tool boundary, install matrix,
  capture artifact, IPC mapper, channels, packaging, code-surface, and protocol
  surface labels through SDK/main local-runtime dispatch, local-runtime launch
  path, local-runtime bridge, and local-runtime daemon status wording instead
  of public `main/sidecar`, `SDK/main -> sidecar`, `sidecar launch path`,
  `Python sidecar bridge`, or sidecar process/readiness owner labels.
  Validation covered the modular docs boundary guard, docs search, related
  commit search, stale bridge/launch/route phrase scan, docs listing, and diff
  check. No migration required; file paths, JSON-RPC method names, params,
  daemon endpoints, IPC channels, SDK/main dispatch, launch options, transcript
  storage, artifact upload, storage, credentials, permissions, provider policy,
  hosted URLs, and local-runtime behavior are unchanged.

- 2026-06-20: routed tool troubleshooting, schema-policy, backend change-path,
  browser schema, IPC/channel, transcript, packaging, and tool-system docs
  through local-runtime daemon reachability, local-runtime bridge routing,
  local-runtime executable schema, local-runtime validation, and
  backend-vs-local-runtime schema parity instead of public sidecar
  process/schema/route labels. Validation covered the modular docs boundary
  guard, docs search, related commit search, stale schema/process/route phrase
  scan, docs listing, and diff check. No migration required; JSON-RPC method
  names, executable schemas, client manifests, backend tool schemas, IPC
  payloads, launch paths, storage, credentials, permissions, hosted backend
  URLs, and provider policy are unchanged.

- 2026-06-20: routed performance, packaging, ownership-decision,
  system-state, protocol-surface, API-reference, source-map, and Python
  implementation workflow labels through local-runtime JSON-RPC,
  local-runtime backend-config, SDK/main local-runtime dispatch, and
  local-runtime Python wording instead of public `sidecar JSON-RPC`,
  `main/sidecar route`, `sidecar response`, `sidecar API`, `sidecar protocol`,
  and sidecar-tree owner labels. Validation covered the modular docs boundary
  guard, docs search, related commit search, stale route/protocol/API phrase
  scan, docs listing, and diff check. No migration required; JSON-RPC method
  names, params, daemon endpoints, IPC channels, SDK/main dispatch, packaged
  runtime paths, backend endpoint injection, storage, credentials, permissions,
  provider policy, hosted URLs, and local-runtime behavior are unchanged.

- 2026-06-20: routed install troubleshooting, operations, frontend
  architecture, local-runtime JSON-RPC protocol, Python implementation
  workflow, platform, and README index labels through local-runtime
  startup/request wording instead of public `sidecar startup`, `sidecar
  request`, or `Local-runtime sidecar startup` owner labels. Validation covered
  the modular docs boundary guard, docs search, related commit search, stale
  startup/request phrase scan, docs listing, and diff check. No migration
  required; JSON-RPC method names, params, daemon endpoints, IPC channels,
  SDK/main dispatch, packaged runtime paths, install commands, storage,
  credentials, permissions, provider policy, hosted URLs, and local-runtime
  behavior are unchanged.

- 2026-06-20: routed validation-command, local-runtime tool-change, JSON-RPC
  protocol, system-state, and main-process workflow labels through
  local-runtime JSON-RPC/tool routing backed by Python sidecar modules instead
  of unqualified `sidecar JSON-RPC`, `Python sidecar JSON-RPC handlers`, or
  `sidecar call` labels. Validation covered the modular docs boundary guard,
  docs search, related commit search, exact stale JSON-RPC workflow-label scan,
  docs listing, and diff check. No migration required; JSON-RPC method names,
  params, daemon endpoints, IPC channels, SDK/main dispatch, validation
  commands, storage, credentials, permissions, provider policy, hosted URLs,
  and local-runtime behavior are unchanged.

- 2026-06-20: routed local-runtime JSON-RPC reference, Python implementation
  workflow, frontend inventory, and source-map `summary`/`read_when` or
  package-topology labels through local-runtime method/startup wording instead of sidecar
  method/startup owner labels.
  Validation covered the modular docs boundary guard, docs search, related
  commit search, stale JSON-RPC label scan, docs listing, and diff check. No
  migration required; JSON-RPC method names, params, daemon endpoints, IPC
  channels, SDK/main dispatch, storage, credentials, permissions, provider
  policy, hosted URLs, and local-runtime behavior are unchanged.

- 2026-06-20: routed extension surface, install, release packaging,
  shared-schema, browser validation, platform, and historical runtime-design
  docs through local-runtime browser execution, backend/local-runtime schema
  parity, local-runtime Python build and platform-adapter labels, and
  local-runtime HTTP/WebSocket boundaries instead of `sidecar runtime`,
  `backend/sidecar`, `sidecar boundary`, and `main/sidecar` owner labels.
  Validation covered the modular docs boundary guard, docs search, related
  commit search, targeted stale runtime/boundary label scan, docs listing, and
  diff check. No migration required; command names, tool schemas, browser
  action validation, JSON-RPC method names, IPC channels, SDK/main dispatch,
  package scripts, storage, credentials, permissions, provider policy, hosted
  URLs, and local-runtime behavior are unchanged.

- 2026-06-20: routed IPC, memory, node, frontend inventory, main-process
  workflow, browser schema, packaging, platform, extension, and runtime-adapter
  docs through local-runtime JSON-RPC calls, params, response shape, executable
  registry routing, local-runtime implementation labels, and local-runtime
  build/adapter names instead of `sidecar JSON-RPC` and sidecar runtime/schema
  owner labels. Validation covered the modular docs boundary guard, docs
  search, related commit search, stale sidecar JSON-RPC/runtime owner-label
  scans, docs listing, and diff check. No migration required; JSON-RPC method
  names, params, IPC channels, SDK/main dispatch, transcript storage,
  executable tool registry, packaging commands, platform adapter paths,
  storage, credentials, permissions, provider policy, hosted URLs, and
  local-runtime behavior are unchanged.

- 2026-06-20: routed tool workflow, session/transcript, backend remote-tool,
  extension-point, and cross-layer contract wording through local-runtime
  executable actions, local-runtime JSON-RPC boundaries, local-runtime
  adapters, extension-point routing, and local-runtime Python implementation
  parity instead of unqualified `sidecar action`, `sidecar expectations`,
  `sidecar may execute`, and backend/sidecar parity labels. Validation covered
  the modular docs boundary guard, docs search, related commit search, stale
  sidecar action/parity scan, docs listing, and diff check. No migration
  required; tool names, schemas, request/bundle IDs, JSON-RPC method names, IPC
  channels, SDK/main dispatch, storage, credentials, permissions, provider
  policy, hosted URLs, and local-runtime behavior are unchanged.

- 2026-06-20: routed architecture and browser parity import-boundary wording
  through local-runtime Python implementation/import labels instead of `Python
  sidecar runtime`, `Sidecar runtime`, and `sidecar runtime imports` phrases.
  Validation covered the modular docs boundary guard, docs search, related
  commit search, active-doc stale import-label scan, docs listing, and diff
  check. No migration required; import paths, package exports, browser schema
  parity, process launch, JSON-RPC method names, IPC channels, SDK/main
  dispatch, storage, credentials, permissions, provider policy, hosted URLs,
  and local-runtime behavior are unchanged.

- 2026-06-20: routed the frontend architecture source-tree label for
  `frontend/src/main/python/` through `Local-runtime Python implementation
  (tools, memory, system, browser)` instead of `Sidecar runtime (tools, memory,
  system, browser)`. Validation covered the modular docs boundary guard, docs
  search, related commit search, exact stale frontend tree-label scan, docs
  listing, and diff check. No migration required; source paths, process launch,
  JSON-RPC method names, tool schemas, SDK/main dispatch, IPC channels,
  renderer display, storage, credentials, permissions, provider policy, hosted
  URLs, and local-runtime behavior are unchanged.

- 2026-06-20: replaced Windie-agent/WindieOS fixture copy in the local SDK mock
  backend's health metadata, system-prompt event, streamed/completion response,
  and startup log with generic Agent SDK mock-backend wording. Validation
  covered the focused mock-backend Jest test, docs search, related commit
  search, stale mock-backend product-copy scan, and diff check. No migration
  required; mock websocket event shapes, health response fields,
  tool-call/result flow, SDK transport behavior, storage, credentials,
  permissions, provider policy, hosted URLs, and local-runtime behavior are
  unchanged.

- 2026-06-20: routed active tool contract and frontend IPC/local-runtime
  protocol registry table labels through `Local-runtime executable registry`
  and `Python JSON-RPC Method Registry` instead of `Sidecar registry` and
  `Sidecar Method Registry` public owner wording. Validation covered the
  modular docs boundary guard, docs search, related commit search, exact
  active-doc stale registry-label scan, docs listing, and diff check. No
  migration required; tool schemas, executable registry behavior, JSON-RPC
  method names, IPC channels, SDK/main dispatch, renderer display, storage,
  credentials, permissions, provider policy, hosted URLs, and local-runtime
  behavior are unchanged.

- 2026-06-20: routed local-runtime tool catalog and retired renderer
  tool-result envelope docs through local-runtime registry dispatch backed by
  Python modules, backend/local-runtime contracts, and SDK/main local-runtime
  migration wording instead of sidecar registry dispatch, backend/sidecar
  contracts, and SDK main-runtime labels. Validation covered the modular docs
  boundary guard, docs search, related commit search, stale SDK-main-runtime/
  sidecar-registry label scan, docs listing, and diff check. No migration
  required; tool-result payload shape, SDK/main dispatch, local-runtime registry
  behavior, JSON-RPC payloads, IPC channels, renderer display, storage,
  credentials, permissions, provider policy, hosted URLs, and local-runtime
  behavior are unchanged.

- 2026-06-20: routed active tool troubleshooting, websocket reference,
  catalog, contract, architecture, and schema-policy docs through SDK/main
  local-runtime tool routing plus local-runtime executable registry ownership
  backed by Python sidecar modules instead of SDK main-runtime and Python
  sidecar registry owner labels. Validation covered the modular docs boundary
  guard, docs search, related commit search, stale SDK-main-runtime/Python-
  sidecar-registry phrase scan, docs listing, and diff check. No migration
  required; tool schemas, executable registry behavior, SDK/main dispatch,
  JSON-RPC payloads, IPC channels, renderer display, storage, credentials,
  permissions, provider policy, hosted URLs, and local-runtime behavior are
  unchanged.

- 2026-06-20: routed tool policy hidden-tool debugging, validation target
  headings, executable registry references, and SDK/main router troubleshooting
  through the local-runtime built-in tool set, executable registry registration,
  and Python sidecar implementation tests instead of sidecar
  `LOCAL_RUNTIME_BUILTIN_TOOL_NAMES`, bare `Sidecar:` labels, and Python
  sidecar registry/router public-owner wording. Validation covered the modular
  docs boundary guard, docs search, related commit search, stale sidecar
  validation-label scan, docs listing, and diff check. No migration required;
  tool policy, capability gates, executable registry behavior, SDK/main
  dispatch, IPC channels, storage, credentials, permissions, provider policy,
  hosted URLs, and local execution behavior are unchanged.

- 2026-06-20: routed active host-skin product identity wording through agent
  display name ownership instead of SDK agent name labels in architecture and
  IPC helper docs. Validation covered the modular docs boundary guard, docs
  search, related commit search, stale SDK-agent-name phrase scan, docs listing,
  and diff check. No migration required; host-skin config shape, SDK agent
  definition payloads, IPC channels, renderer display, storage, credentials,
  permissions, provider policy, hosted URLs, and local-runtime behavior are
  unchanged.

- 2026-06-20: routed tool catalog, tool development, MCP authoring
  troubleshooting, and JSON-RPC workflow wording through local-runtime
  executable actions, manifest, and registry ownership instead of sidecar local
  action, built-in Python sidecar tool, sidecar `ToolRegistry`, and Python
  sidecar tool registry labels. Python sidecar paths remain visible as the
  current implementation detail. Validation covered the modular docs boundary
  guard, docs search, related commit search, stale sidecar registry/action
  phrase scan, docs listing, and diff check. No migration required; tool schemas,
  local-runtime executable registry behavior, SDK/main dispatch, MCP
  registration, IPC channels, storage, credentials, permissions, provider
  policy, hosted URLs, and local execution behavior are unchanged.

- 2026-06-20: updated the agent development workflow's tool-schema widening
  example to route through backend schema, SDK/main local-runtime dispatch,
  local-runtime executable registry implementation, and renderer projection
  handling instead of sidecar registry plus renderer result handling. Validation
  covered the modular docs boundary guard, docs search, related commit search,
  stale workflow phrase scan, docs listing, and diff check. No migration
  required; tool schemas, executable registry behavior, SDK/main dispatch,
  renderer projections, IPC channels, storage, credentials, permissions,
  provider policy, hosted URLs, and local execution behavior are unchanged.

- 2026-06-20: replaced the Kimi provider doc's deleted `ApiClient.test.ts`
  frontend validation route with the current `RendererApiClientBoundary.test.ts`
  guard and added that provider doc to the guard input set. Validation covered
  the focused renderer ApiClient boundary test, docs search, related commit
  search, stale test-name scan, docs listing, and diff check. No migration
  required; provider config, model catalog, renderer app-runtime behavior, SDK
  facade behavior, IPC channels, storage, credentials, permissions, provider
  policy, hosted URLs, and local execution behavior are unchanged.

- 2026-06-20: routed frontend architecture, domain triage, transcript,
  artifact, and packaging docs through SDK/local-runtime conversation store,
  renderer app-runtime, Electron main Agent SDK host, and local-runtime Python
  tool implementation ownership instead of frontend+sidecar local store,
  renderer API client, sidecar transcript store, and Python sidecar local tool
  labels. Validation covered the modular docs boundary guard, renderer
  ApiClient boundary guard, docs search, related commit search, active-doc
  stale owner-label scan, docs listing, and diff checks. No migration required;
  conversation events, transcript row fields, artifact refs, packaging
  behavior, endpoint propagation, IPC channels, SDK/main dispatch, renderer
  display, storage, credentials, permissions, provider policy, hosted URLs, and
  local execution behavior are unchanged.

- 2026-06-20: routed API reference client-boundary and websocket tool
  call/result wording through the first-party Electron renderer app-runtime
  facades, SDK/main local-runtime dispatch, and SDK/renderer consumers instead
  of the deleted renderer `ApiClient` and frontend-owned execution labels.
  SDK introspection docs now describe independence from the desktop renderer UI
  rather than a customer-facing frontend. This preserves the public SDK/desktop
  split without changing runtime behavior. Validation covered the renderer
  ApiClient boundary guard, docs search, related commit search, stale wording
  scan, docs listing, and diff checks. No migration required; SDK routes,
  websocket message types, payload schemas, IPC channels, renderer app-runtime
  facades, hosted transport behavior, SDK/main local-runtime dispatch, storage,
  credentials, permissions, provider policy, hosted URLs, and local execution
  behavior are unchanged.

- 2026-06-20: aligned the diagnostics first-triage table with current runtime
  ownership so no-response debugging starts at the Electron main Agent SDK host
  plus SDK backend transport traces, and tool-result continuation debugging
  starts at SDK/main tool-result relay before backend ingestion/waiting modules.
  This preserves the long-running goal's debug route focus without changing
  runtime behavior. Validation covered the modular docs boundary guard, docs
  search, related commit search, docs listing, and diff checks. No migration
  required; diagnostic commands, trace paths, websocket behavior, SDK/main
  relay behavior, renderer display, storage, credentials, permissions, hosted
  URLs, provider policy, and local execution behavior are unchanged.

- 2026-06-19: cached docs index metadata and precomputed normalized search
  fields inside `scripts/windie/docs.cjs` so repeated `findDocs(...)` calls used
  by required orientation and `WindieDocsIndex` no longer reload and normalize
  the entire docs corpus each time. Public `loadDocsIndex()` callers still get
  fresh doc objects, covered by a cache mutation guard. Validation passed
  focused docs-index tests plus docs listing/search and diff checks. No
  migration required; docs ranking, docs paths, CLI commands, runtime code,
  IPC, storage, credentials, permissions, hosted URLs, provider policy, and
  local execution behavior are unchanged.

- 2026-06-19: made the Electron main wakeword bridge accept an injected
  `ipcMain`-compatible host adapter while keeping Electron `ipcMain` as the
  default. `initializeWakewordBridge(...)` now fails fast on an invalid adapter
  and the production main-window bootstrap passes Electron `ipcMain` through
  from `index.cjs`. This preserves the existing subprocess lifecycle, audio
  framing, enable/disable semantics, and detection/status payloads. Validation
  passed focused wakeword/main-window bootstrap tests plus docs/search, docs
  listing, and diff checks. No migration required; wakeword IPC channel names,
  local execution, permissions, credentials, hosted URLs, provider policy,
  storage, and subprocess launch behavior are unchanged.

- 2026-06-19: moved Electron main `windie:invoke` handler registration into
  `ipc_agent_sdk_command_handlers.cjs`. `ipc.cjs` now injects Electron-main
  host state, query/stop handlers, settings gates, diagnostics, and Agent SDK
  runtime functions into a focused registration helper instead of calling
  `ipcMain.handle(...)` directly for the SDK command bridge. Validation passed
  focused main SDK runtime boundary tests plus docs/search, stale direct
  `windie:invoke` registration scan, docs listing, and diff checks. No
  migration required; `windie:invoke` wire name, SDK command names, command
  payloads, query/stop behavior, settings/model/memory command routing, IPC
  allowlists, storage, credentials, permissions, hosted URLs, provider policy,
  and local execution behavior are unchanged.

- 2026-06-19: moved Electron main pending renderer turn channel registration
  and payload normalization into `ipc_pending_turn_handlers.cjs`. `ipc.cjs`
  now injects the pending-turn cache setter/clearer and renderer fan-out while
  keeping the cache in the SDK host root for stop/current-turn cleanup.
  Validation passed focused pending-turn handler, bridge lifecycle, main
  runtime boundary, docs-index, docs/search, stale inline pending-turn scan,
  docs listing, and diff checks. No migration required; `windie:pending-turn`
  wire names, pending/clear payloads, removed alias rejection, replay/clear
  semantics, stop-target behavior, IPC allowlists, storage, credentials,
  permissions, hosted URLs, provider policy, and local execution behavior are
  unchanged.

- 2026-06-19: moved Electron main renderer diagnostic channel registration
  into `ipc_renderer_diagnostics_handlers.cjs`. `ipc.cjs` now injects the
  existing renderer log and live-surface trace handlers instead of owning those
  listener bodies inline, while diagnostics runtimes keep normalization and
  redaction. Validation: focused diagnostics handler/runtime tests, main
  runtime boundary, and docs-index passed, with docs/search, stale inline
  handler scan, docs listing, and diff checks also passing. No migration required; `renderer-log` and
  `live-surface-trace` wire names, payloads, redaction, logging behavior, IPC
  allowlists, storage, credentials, permissions, hosted URLs, provider policy,
  and local execution behavior are unchanged.

- 2026-06-19: moved Electron main client session snapshot and
  transcript-session-sync channel registration into
  `ipc_client_session_handlers.cjs`. `ipc.cjs` now injects Agent SDK host
  session state, runtime endpoint URLs, transcript state setters, and renderer
  fan-out instead of owning those renderer-facing channel bodies inline.
  Validation: focused main IPC handler, bridge lifecycle, runtime boundary,
  and docs-index tests passed, with docs/search, stale inline handler scan,
  docs listing, and diff checks also passing; Jest reported its open-handle
  warning after the clean test exit. No migration required; `get-client-user-id` and
  `transcript-session-sync` wire names, payloads, endpoint snapshot fields,
  session semantics, IPC allowlists, storage, credentials, permissions, hosted
  URLs, provider policy, and local execution behavior are unchanged.

- 2026-06-19: deleted the forwarding-only renderer storage adapter
  `desktopStorageRuntimeClient.js`. Permission onboarding storage now imports
  the JSON localStorage helper directly while remaining the purpose-named
  app-runtime owner consumed by permission feature code. Validation passed
  focused permission storage, JSON localStorage, renderer app runtime boundary,
  renderer skin config boundary, and docs-index tests plus docs search, related
  commit search, stale removed storage-facade scan, docs listing, and diff
  checks. No migration required; permission onboarding storage key, persisted
  state shape, malformed JSON behavior, best-effort write behavior, renderer
  feature import boundaries, storage payloads, settings, IPC, permissions,
  credentials, provider policy, hosted URLs, and local execution behavior are
  unchanged.

- 2026-06-19: moved extension and MCP registry IPC channel registration into
  `ipc_extension_mcp_handlers.cjs`. `ipc.cjs` now keeps Agent SDK host state
  and injects extension/MCP registry helpers into a focused handler module
  instead of owning `list-agent-extensions`, `list-mcp-servers`,
  `set-mcp-server-enabled`, and `refresh-mcp-servers` channel bodies inline.
  Validation passed focused extension/MCP IPC handler, desktop MCP runtime
  client, desktop extension runtime client, renderer settings boundary, and
  docs-index tests plus docs search, related commit search, stale inline
  handler scan, docs listing, and diff checks. No migration required; IPC
  channel names, payload shapes, desktop UI config key names, MCP allowlist
  persistence behavior, SDK MCP registration refresh behavior, extension
  registry payloads, storage, provider policy, hosted URLs, permissions,
  credentials, and local-runtime MCP execution behavior are unchanged.

- 2026-06-19: moved browser permission status-map lookup into
  `desktopPermissionPresentationRuntime`. `BrowserSettingsTab` now keeps row
  layout and browser-open actions while consuming a runtime-provided stored
  status for the browser permission id instead of indexing raw
  `statusesByPermissionId` maps before rendering. Validation passed
  focused permission presentation runtime, settings section, renderer settings
  boundary, and docs-index tests plus docs search, related commit search,
  stale raw browser permission status-map scan, docs listing, and diff checks.
  No migration required; permission status map payload shape, browser
  permission id, badge labels/classes, status detail text, browser permission
  request/probe behavior, config update side effects, IPC channels, storage,
  provider policy, hosted URLs, permissions, credentials, and local execution
  behavior are unchanged.

- 2026-06-19: moved Agent settings local/remote tool enabled-state and
  disabled-list config patch construction into `DesktopExtensionRuntimeClient`.
  `AgentSettingsTab` now keeps toggle rendering and custom-instruction patches
  while consuming runtime helpers instead of normalizing
  `agent_disabled_local_tools` / `agent_disabled_remote_tools` arrays or
  computing tool-toggle patches locally. Validation passed focused desktop
  extension runtime client, agent settings, renderer settings boundary, and
  docs-index tests plus docs search, related commit search, stale raw
  disabled-tool config scan, docs listing, and diff checks. No migration
  required; settings key names, disabled-tool list payload shape, local/remote
  tool toggle behavior, capability events, IPC channels, storage, provider
  policy, hosted URLs, permissions, credentials, and local execution behavior
  are unchanged.

- 2026-06-19: moved dashboard conversation row identity and in-memory row/pin
  updates into `desktopDashboardConversationLoadRuntime`.
  `useDashboardConversations` now keeps user prompts, SDK open/delete calls,
  workspace-binding cleanup, active-session reset, and React state side effects
  while consuming runtime-provided row refs, rename prompt values,
  rename/delete list updates, and pin-state updates instead of reading raw
  conversation row ids or mapping/filtering row lists directly. Validation
  passed focused dashboard conversation load, dashboard shell, renderer app
  boundary, and docs-index tests plus docs search, related commit search, stale
  raw dashboard row action-field scan, docs listing, and diff checks. No
  migration required; dashboard row payload shape, recent/search list behavior,
  rename prompt default behavior, pin ordering, delete/reset side effects, SDK
  conversation command names, IPC channels, storage, provider policy, hosted
  URLs, permissions, credentials, and local execution behavior are unchanged.

- 2026-06-19: moved active-workspace display presentation into
  `desktopWorkspaceRuntimeClient`. `WorkspaceSettingsTab` now keeps row layout,
  local sync state, and folder-pick actions while consuming runtime-provided
  empty workspace defaults, path text, and update success text instead of
  reading raw active workspace name/path fields. Validation passed focused
  desktop workspace runtime client, settings section, renderer settings
  boundary, and docs-index tests plus docs search, related commit search, stale
  raw workspace display-field scan, docs listing, and diff checks. No
  migration required; workspace permission payload shape, active workspace
  values, workspace picker behavior, dashboard/chat workspace binding, IPC
  channels, storage, provider policy, hosted URLs, permissions, credentials,
  local execution behavior, and local-runtime tool workspace defaults are
  unchanged.

- 2026-06-19: moved dashboard generated-title poll timing and visibility
  checks into `desktopDashboardConversationLoadRuntime`.
  `useDashboardConversations` now keeps timer setup/cleanup and recent-list
  reload side effects while consuming runtime-provided title-poll schedule and
  continue/visibility rules instead of hard-coding poll numbers or checking raw
  dashboard row ids. Validation passed focused dashboard conversation
  load, dashboard shell, renderer app boundary, and docs-index tests plus docs
  search, related commit search, stale raw title-poll scan, docs listing, and
  diff checks. No migration required; conversation metadata payload shape,
  title-poll timing and attempt limit, recent-list reload behavior, IPC
  channels, storage, provider policy, hosted URLs, permissions, credentials,
  and local execution behavior are unchanged.

- 2026-06-19: moved browser permission manifest lookup into
  `desktopPermissionPresentationRuntime`. `BrowserSettingsTab` now keeps row
  layout and browser-open actions while consuming a runtime-provided permission
  entry for the badge instead of scanning raw `permission_id` rows. Validation
  passed focused permission presentation runtime, settings section, renderer
  app boundary, renderer settings boundary, and docs-index tests plus docs
  search, related commit search, stale raw permission-id scan, docs listing,
  and diff checks. No migration required; permission manifest payload shape,
  browser permission id, badge labels/classes, status detail text, browser
  permission request/probe behavior, config update side effects, IPC channels,
  storage, provider policy, hosted URLs, permissions, credentials, and local
  execution behavior are unchanged.

- 2026-06-19: moved agent skill and MCP metadata debug presentation into
  `DesktopExtensionRuntimeClient`. `AgentSettingsTab` now keeps extension
  layout while rendering runtime-provided skill/MCP counts, summaries, and
  debug specs instead of counting raw skill/MCP arrays or shaping MCP server
  debug metadata. Validation passed focused desktop extension runtime client,
  agent settings, renderer settings boundary, and docs-index tests plus docs
  search, related commit search, stale raw skill/MCP metadata-field scan, docs
  listing, and diff checks. No migration required; extension runtime payload
  shape, skill and MCP debug details for normal entries, settings diagnostics,
  extension metadata display, capability event channels, tool-toggle config
  keys, settings storage, IPC channels, provider policy, hosted URLs,
  permissions, credentials, and local execution behavior are unchanged.

- 2026-06-19: moved agent plugin metadata presentation into
  `DesktopExtensionRuntimeClient`. `AgentSettingsTab` now keeps extension
  layout while rendering runtime-provided plugin names, counts,
  permission/panel text, and debug spec values instead of reading raw plugin
  permission, settings-panel, tool, and config-schema fields. Validation passed
  focused desktop extension runtime client, agent settings, renderer settings
  boundary, and docs-index tests plus docs search, related commit search, stale
  raw plugin metadata-field scan, docs listing, and diff checks. No migration
  required; extension runtime payload shape, plugin names/descriptions/counts
  for normal entries, settings diagnostics, extension metadata display,
  capability event channels, tool-toggle config keys, settings storage, IPC
  channels, provider policy, hosted URLs, permissions, credentials, and local
  execution behavior are unchanged.

- 2026-06-19: moved MCP registry error presentation into
  `desktopMcpRuntimeClient`. `McpsSection` now keeps diagnostics layout while
  rendering runtime-provided registry error key/text values instead of
  formatting raw `kind`, `id`, and `reason` fields. Validation passed focused
  desktop MCP runtime client, MCP dashboard section, renderer chat runtime
  boundary, renderer settings boundary, and docs-index tests plus docs search,
  related commit search, stale raw MCP registry-error field scan, docs listing,
  and diff checks. No migration required; MCP registry payload shape,
  diagnostic text for normal registry error entries, enablement persistence,
  discovery refresh behavior, IPC channels, storage, provider policy, hosted
  URLs, permissions, credentials, and local-runtime MCP execution behavior are
  unchanged.

- 2026-06-19: moved agent local-tool manifest presentation lookup into
  `DesktopExtensionRuntimeClient`. `AgentSettingsTab` now keeps local tool
  layout and toggle config patches while consuming runtime-provided
  accepted/rejected/pending status values instead of building maps from raw
  manifest arrays or reading rejected tool reasons. Validation passed focused
  desktop extension runtime client, agent settings, renderer settings boundary,
  and docs-index tests plus docs search, related commit search, stale raw
  local-tool manifest-field scan, docs listing, and diff checks. No migration
  required; client tool manifest payload shape, accepted schema display,
  rejected reason text, local/remote tool toggle config keys, settings storage,
  capability event channels, IPC channels, provider policy, hosted URLs,
  permissions, credentials, and local execution behavior are unchanged.

- 2026-06-19: moved agent extension runtime error presentation into
  `DesktopExtensionRuntimeClient`. `AgentSettingsTab` now keeps diagnostics
  layout while rendering runtime-provided extension error key/text values
  instead of formatting raw `kind`, `id`, and `reason` fields. Validation
  passed focused desktop extension runtime client, agent settings, renderer
  settings boundary, and docs-index tests plus docs search, related commit
  search, stale raw extension-error field scan, docs listing, and diff checks.
  No migration required; extension runtime payload shape, diagnostic text for
  normal error entries, extension metadata display, capability event channels,
  tool-toggle config keys, settings storage, IPC channels, provider policy,
  hosted URLs, permissions, credentials, and local execution behavior are
  unchanged.

- 2026-06-19: moved memory settings active-user resolution into
  `DesktopMemoryRuntimeClient`. `useMemorySettingsActions` now keeps
  confirmation, pending state, and status copy while the runtime client decides
  whether the transcript session has an actionable user id instead of checking
  the `default_user` sentinel before deleting chat history. Validation passed
  focused desktop memory runtime client, settings section, renderer dashboard
  boundary, and docs-index tests plus docs search, related commit search, stale
  default-user sentinel scan, docs listing, and diff checks. No migration
  required; memory and conversation clear command names, payload
  shapes for actionable users, confirmation behavior, settings status text,
  transcript session state, IPC channels, storage, provider policy, hosted
  URLs, permissions, credentials, and local execution behavior are unchanged.

- 2026-06-19: moved active-workspace selection equality into
  `desktopWorkspaceRuntimeClient`. `WorkspaceSettingsTab` now keeps state and
  rendering while consuming a runtime-owned equality predicate instead of
  comparing raw `activeWorkspaceName` and `activeWorkspacePath` values before
  applying workspace updates. Validation passed focused desktop workspace
  runtime client, permission presentation runtime, settings section, renderer
  settings boundary, and docs-index tests plus docs search, related commit
  search, stale raw workspace equality and permission badge status scans, docs
  listing, and diff checks. No migration required; workspace permission
  payloads, active workspace values, workspace picker behavior, dashboard/chat
  workspace binding, IPC channels, storage, provider policy, hosted URLs,
  permissions, credentials, and local execution behavior are unchanged.

- 2026-06-19: moved browser permission badge status-value extraction into
  `desktopPermissionPresentationRuntime`. `BrowserSettingsTab` now passes the
  effective permission status object to `PermissionStatusBadge` instead of
  reading the raw `status` field before rendering the badge. Validation passed
  focused desktop workspace runtime client, permission presentation runtime,
  settings section, renderer settings boundary, and docs-index tests plus docs
  search, related commit search, stale raw workspace equality and permission
  badge status scans, docs listing, and diff checks. No migration required;
  permission status payload shapes, badge labels/classes, browser settings
  rendering, onboarding rendering, IPC channels, storage, provider policy,
  hosted URLs, permissions, credentials, and local execution behavior are
  unchanged.

- 2026-06-19: moved global stop shortcut fallback persistence resolution into
  `desktopShortcutRuntimeClient`. `AppConfigProvider` now keeps config state and
  persistence orchestration while consuming a runtime-owned fallback accelerator
  value instead of reading raw shortcut fallback and registration fields before
  saving a resolved binding. Validation passed focused desktop shortcut runtime
  client, AppConfigProvider storage/IPC, and renderer settings boundary tests
  plus docs search, related commit search, stale raw shortcut-status field
  scan, docs listing, and diff checks. No migration required; global stop
  shortcut status payloads, local shortcut config persistence format, shortcut
  fallback behavior, focused-window stop-key matching, IPC channels, storage,
  provider policy, hosted URLs, permissions, credentials, and local execution
  behavior are unchanged.

- 2026-06-19: moved global stop shortcut status presentation into
  `desktopShortcutRuntimeClient`. `GeneralSettingsTab` now asks the runtime
  client whether to show fallback or registration-failure notices and which
  fallback label to render instead of reading raw shortcut status fallback and
  registration fields directly. Validation passed focused desktop shortcut
  runtime client, settings section, general settings tab, renderer settings
  boundary, and docs-index tests plus docs search, related commit search, stale
  raw shortcut-status field scan, docs listing, and diff checks. No migration
  required; global stop shortcut status payloads, local shortcut config
  persistence, shortcut fallback behavior, focused-window stop-key matching,
  IPC channels, storage, provider policy, hosted URLs, permissions,
  credentials, and local execution behavior are unchanged.

- 2026-06-19: moved remote-tool catalog availability presentation into
  `desktopExtensionRuntimeClient`. `AgentSettingsTab` now asks the runtime
  client for cloud-tool availability and unavailable-reason values instead of
  searching raw `remote_tools` entries or reading `available` /
  `reason_unavailable` fields while rendering remote tools; the WindieOS skin
  owns the unavailable fallback label. Validation passed focused desktop
  extension runtime client, agent settings tab, renderer settings boundary, and
  docs-index tests plus docs search, related commit search, stale raw
  remote-tool catalog-field scan, docs listing, and diff checks. No migration
  required; agent capability event channel names, remote-tool catalog payload
  shape, tool toggle config keys, settings storage, IPC channels, provider
  policy, hosted URLs, permissions, credentials, and local execution behavior
  are unchanged.

- 2026-06-19: moved MCP server card/status presentation into
  `desktopMcpRuntimeClient`. `McpsSection` now renders display name, status
  label/class/text, enablement state/id, and debug spec values from the runtime
  client instead of reading raw server `status`, `effective_enabled`, command,
  args, or tool fields while rendering cards. Validation passed focused desktop
  MCP runtime client, MCP dashboard section, renderer settings boundary, and
  docs-index tests plus docs search, related commit search, stale raw MCP
  card-field scan, docs listing, and diff checks. No migration required; MCP
  registry payloads, enablement persistence, discovery refresh behavior,
  dashboard card text for normal registry payloads, IPC channels, storage,
  provider policy, hosted URLs, permissions, credentials, and local execution
  behavior are unchanged.

- 2026-06-19: moved response-overlay stream-trace size payload shaping into
  `desktopRendererTraceRuntime`. `useResponseOverlayWindowSync` now keeps
  response-window measurement, dedupe, and visibility re-report timing while
  passing value-level layout, response, thinking, hover, turn, guard, width,
  and height inputs to the trace runtime instead of assembling diagnostic
  `layout_mode`, `show_response`, `thinking_text_length`, `compact_hover`,
  `turn_ref`, and `stale_guard_ref` fields directly. Validation passed focused
  renderer trace runtime, response overlay, chat boundary, and docs-index tests
  plus stale trace-field scan, docs search, commit search, docs listing, and
  diff checks. No migration required; responsebox IPC payload shape,
  live-surface
  trace IPC payload shape, stream-trace log labels, overlay measurement/dedupe
  behavior, storage, provider policy, hosted URLs, permissions, and local
  execution behavior are unchanged.

- 2026-06-19: moved renderer settings-event type dispatch into
  `routeDesktopSettingsEvent(...)` in `desktopSettingsEventRuntimeClient` and
  deleted the retired provider-local `appConfigEvents` router. `AppConfigProvider`
  now keeps provider state, refs, and subscription cleanup while the settings
  event runtime owns raw `models-listed` dispatch to model-list handlers.
  Validation passed focused settings-event runtime, app config provider model,
  renderer settings boundary, and docs-index tests plus stale router reference
  scan, docs listing, and diff checks. No migration required; settings-event
  channel names,
  `models-listed` payload shapes, available-models state, save-status behavior,
  config persistence, storage, IPC, provider policy, hosted URLs, permissions,
  credentials, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer permission status detail presentation
  boundary slice by adding reason/status-class/remediation normalization to
  `desktopPermissionPresentationRuntime`. Onboarding permission slides and
  browser settings now consume normalized detail presentation values instead
  of reading raw status `reason`, `status`, or `details.remediation` fields.
  Validation: passed focused permission presentation runtime, onboarding
  slideshow, settings section, renderer app boundary, renderer settings
  boundary, and docs-index tests plus docs search, related commit search,
  stale raw status-detail field scan, docs listing, and diff checks. No migration
  required; permission status payload shape, label text, CSS class tokens,
  browser settings rendering, onboarding slide rendering, storage, IPC,
  provider policy, hosted URLs, permissions, and local execution behavior are
  unchanged.

- 2026-06-19: completed a renderer permission external grant watch boundary
  slice by moving external-grant watch eligibility and interval-polling policy
  into `desktopPermissionGrantEffectsRuntime`. `useOnboardingPermissionActions`
  now keeps pending/waiting state, timers, focus rechecks, and cleanup while
  consuming runtime-owned permission watch decisions instead of reading raw
  status `details`, `granted`, or `status` fields. Validation passed for
  focused onboarding permission actions, permission grant effects, renderer app
  boundary, and docs-index tests plus docs search, related commit search,
  stale raw status-field scan, docs listing, and diff checks. No migration
  required; permission IPC channel names, status payload shape, grant-effect
  config update behavior, recheck interval and timeout values, onboarding
  waiting state, storage, provider policy, hosted URLs, permissions, and local
  execution behavior are unchanged.

- 2026-06-19: completed a renderer app-status save action boundary slice by
  adding value-level settings save-status action resolution and
  `onSettingsSaveStatusAction(...)` to `DesktopAppConfigRuntimeClient`.
  `AppStatusProvider` now keeps timer cleanup and save-status state
  transitions while consuming only `success` or `error` actions. Validation:
  passed focused desktop app config runtime client, AppStatusProvider,
  renderer settings boundary, and docs-index tests plus docs search, related
  commit search, stale raw settings-event field scan, docs listing, and diff
  checks. No migration required; backend settings-event channel names, raw
  event payload shape, settings-update error text matching, save-status UI
  timing, config persistence, storage, provider policy, hosted URLs,
  permissions, credentials, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer permission status value boundary slice by
  moving permission status normalization and id-indexing into
  `DesktopPermissionRuntimeClient`. `permissionStore` now keeps manifest
  state, gate derivation, onboarding persistence, and action errors while
  consuming normalized status maps. Validation: passed focused desktop
  permission runtime client, permission store, renderer app boundary, and
  docs-index tests plus docs search, related commit search, stale raw
  status-field scan, docs listing, and diff checks. No migration required;
  permission IPC channel names, result envelope shape, normalized status map
  shape, onboarding gate behavior, persisted onboarding state, storage,
  provider policy, hosted URLs, permissions, and local execution behavior are
  unchanged.
- 2026-06-19: completed a renderer IPC status value boundary slice by adding
  value-level status snapshot normalization and `onIpcStatusValues(...)` to
  `DesktopClientSessionRuntimeClient`. `AppConfigProvider` now consumes
  normalized connection, global stop shortcut status, and transcript user-id
  values while preserving runtime endpoint snapshot sync, config re-sync, and
  shortcut fallback persistence. Validation: passed focused desktop client
  session runtime client, AppConfigProvider storage/IPC, app config events,
  renderer settings boundary, and docs-index tests plus docs search, related
  commit search, stale raw IPC status field scan, docs listing, and diff
  checks. No migration
  required; `ipc-status` and `get-client-user-id` channel names, raw snapshot
  shape, runtime endpoint metadata, transcript binding, shortcut fallback
  persistence, config sync, storage, provider policy, hosted URLs, permissions,
  and local execution behavior are unchanged.
- 2026-06-19: completed a renderer wakeword-toggle state boundary slice by
  adding value-level toggle normalization and `onWakewordToggleState(...)` to
  `DesktopVoiceRuntimeClient`. `AppConfigProvider` now consumes boolean
  enabled states while keeping wakeword suppression policy. Validation: passed
  focused desktop voice runtime client, AppConfigProvider storage/IPC, renderer
  settings boundary, renderer voice boundary, and docs-index tests plus docs
  search, related commit search, stale raw wakeword-toggle field scan, docs
  listing, and diff checks. No migration
  required; wakeword-toggle IPC channel names, payload shape, wakeword
  preference/suppression behavior, overlay visibility behavior, config
  persistence, storage, provider policy, hosted URLs, permissions, and local
  wakeword service execution behavior are unchanged.
- 2026-06-19: completed a renderer wakeword detection value boundary slice by
  adding value-level detection normalization and
  `onWakewordDetectedValues(...)` to `DesktopVoiceRuntimeClient`.
  `useWakewordBridgeEvents` now keeps enabled-state, cooldown, threshold,
  immediate disable, and callback policy while the runtime client owns raw
  bridge field extraction for `model`, `confidence`, and `score`. Validation:
  passed focused desktop voice runtime client, wakeword bridge events hook,
  renderer voice boundary, and docs-index tests plus docs search, related
  commit search, stale raw detection field scan, docs listing, and diff checks.
  No migration required; wakeword IPC channel names, detection payload shape,
  confidence threshold/cooldown behavior, immediate disable on accepted
  detection, wakeword callback shape, capture lifecycle, storage, provider
  policy, hosted URLs, permissions, and local wakeword service execution
  behavior are unchanged.
- 2026-06-19: completed a renderer window command option value boundary slice
  by adding value-level show-chatbox, hide-chatbox, show-main-window, and
  text-entry activation option builders to `DesktopWindowRuntimeClient`.
  App startup, wakeword restore, send-surface restore, minimal chat settings
  and hide actions, and main-window controls now pass focus, maximize,
  open-target, and reason values while the runtime client assembles
  host-shaped IPC option payloads. Validation passed for focused desktop window
  runtime client, app startup, permission gate, wakeword controller boundary,
  send-surface preparation, chatbox mouse-ignore, renderer chat boundary,
  renderer voice boundary, and docs-index tests plus docs search, related
  commit search, stale host-shaped window command option scan, docs listing,
  and diff checks. No migration required; `show-chatbox`, `hide-chatbox`,
  `show-main-window`, and
  `activate-chatbox-text-entry` IPC channel names, host payload shapes,
  startup/onboarding/wakeword restore behavior, dashboard handoff behavior,
  text-entry focus timing,
  press-and-hold drag behavior, pointer/mouse-leave/blur policy, storage,
  provider policy, hosted URLs, permissions, and local execution behavior are
  unchanged.
- 2026-06-19: completed a renderer hit-test payload value boundary slice by
  adding `buildChatboxHitTestPayload(...)` /
  `setChatboxHitTestActiveValue(...)` and
  `buildResponseboxHitTestPayload(...)` /
  `setResponseboxHitTestActiveValue(...)`. `MinimalChatPill` and
  `MinimalResponseOverlay` now pass boolean active state while runtime clients
  assemble host-shaped `{ active }` IPC payloads. Validation: passed focused
  desktop window runtime client, response overlay runtime client, chatbox
  mouse-ignore, response overlay state, renderer chat boundary, and docs-index
  tests plus docs search, related commit search, stale host-shaped hit-test
  payload scan, docs listing, and diff checks. No migration required;
  chatbox/responsebox hit-test IPC
  channel names, host payload shape, pointer/mouse-leave/blur policy,
  click-through behavior, overlay sizing, storage, provider policy, hosted
  URLs, permissions, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer voice gateway message dispatch boundary
  slice by adding a value-level transcription gateway dispatcher to
  `DesktopVoiceRuntimeClient`. `useVoiceMode` now keeps connection, reconnect,
  capture, temporary dictation, and callback side effects while the runtime
  client owns gateway message classification and protocol field extraction for
  client id, realtime text/finality, utterance end, trace diagnostics, unknown
  messages, and binary-message handling. Validation passed for focused voice
  runtime client, voice mode hook, renderer voice boundary, and docs-index
  tests plus docs search, related commit search, stale gateway field scan, docs
  listing, and diff checks. No migration required; `/ws/transcription` URL behavior, gateway
  message shapes, language/start-over payloads, audio framing, reconnect
  timing, transcription callbacks, wakeword IPC, provider policy, hosted URLs,
  permissions, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer responsebox size payload boundary slice by
  adding a responsebox size payload builder and value-level method to
  `DesktopResponseOverlayRuntimeClient`. Response overlay window-sync and close
  paths now pass renderer values while the runtime client assembles
  `compact_hover`, `turn_ref`, `stale_guard_ref`, and `dismissed` host payload
  fields. Validation: passed focused response overlay runtime client, response
  overlay state, renderer chat boundary, and docs-index tests plus docs search,
  related commit search, stale responsebox raw payload scan, docs listing, and
  diff checks. No migration required; responsebox IPC channel names, host
  payload shape, visibility re-report timing, fixed-size/awaiting sizing
  policy, dismissal behavior, storage, provider policy, hosted URLs,
  permissions, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer stream ingress value boundary slice by
  routing chat stream ingress conversation identity, turn-map registration, and
  transcript user binding through `desktopChatStreamEventRuntime` and
  `desktopChatStreamEventPayloadRuntime` helper values instead of raw SDK
  `event.conversationRef`, `event.turnRef`, and `event.payload.userId` reads.
  Ingress still owns fail-safe projection sync, turn-map registration,
  transcript session sync, and handler dispatch ordering. Validation: passed
  focused ingress runtime, event payload runtime, event runtime, renderer chat
  boundary, and docs-index tests plus docs search, related commit search, stale
  raw ingress field scan, docs listing, and diff checks. No migration required; SDK
  conversation-event shape, `windie:conversation-event` IPC delivery,
  transcript session storage, turn routing behavior, provider policy, hosted
  URLs, permissions, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer stream event payload access boundary slice
  by adding `resolveConversationStreamEventPayload(...)` to
  `desktopChatStreamEventPayloadRuntime` and routing compaction, local-user,
  metadata, and terminal handlers through that event-level accessor. Chat
  stream handlers keep side effects and row updates without reading raw SDK
  `event.payload` fields directly. Validation: passed focused payload runtime,
  chat stream handler, renderer chat boundary, and docs-index tests plus docs
  search, related commit search, stale raw payload scan, docs listing, and diff
  checks. No migration required; SDK conversation event payload shapes,
  Electron IPC channel names, transcript storage, provider policy, hosted URLs,
  permissions, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer wakeword status value boundary slice by
  adding wakeword ready/error value resolvers and
  `onWakewordReadyStatus(...)` to `desktopVoiceRuntimeClient`.
  `useWakewordBridgeEvents` now keeps cooldown, detection, local capture error
  policy, and UI state updates without reading raw wakeword status event
  `ready` / `error` fields. Validation: passed focused desktop voice runtime
  client, wakeword bridge events hook, renderer voice runtime boundary, and
  docs-index tests plus docs search, related commit search, stale raw wakeword
  status scans, docs listing, and diff checks. No migration required; wakeword IPC
  channel names, raw status event payload shape, wakeword enable/disable/audio
  chunk sends, detection cooldown and threshold behavior, local capture error
  stickiness, settings, storage, credentials, permissions, hosted URLs,
  provider policy, and local wakeword service execution behavior are unchanged.
- 2026-06-19: completed a renderer stream event identity value boundary slice
  by adding normalized conversation/turn identity helpers to
  `desktopChatStreamEventRuntime` and routing chat stream dispatcher plus
  sub-handler workspace/tracking identity through those helpers. This keeps
  SDK event identity interpretation in the app runtime facade while preserving
  existing payload projection, UI side effects, IPC channels, storage, and
  provider/local-runtime behavior. Focused stream runtime, handler, boundary,
  and docs-index tests passed, along with docs listing, stale raw identity
  scan, and diff checks. No migration required; SDK conversation-event shape,
  renderer IPC channel names, transcript storage, provider policy, hosted URLs,
  permissions, and local-runtime execution behavior are unchanged.
- 2026-06-19: completed a renderer local-runtime ready value boundary slice by
  adding readiness projection and `onReady(...)` helpers to
  `desktopLocalRuntimeStatusRuntimeClient`. `useDashboardConversations` now
  keeps recent-list reload side effects without reading raw local-runtime
  status snapshot `ready` fields. Validation: passed focused local-runtime
  status runtime client, dashboard conversations, renderer chat runtime
  boundary, and docs-index tests plus docs search, related commit search, stale
  snapshot-ready scans, docs listing, and diff checks. No migration required;
  local-runtime status IPC channels,
  underlying status store snapshots, bootstrap/live-event race behavior,
  dashboard reload timing, SDK conversation list commands, storage, settings,
  credentials, permissions, provider policy, hosted URLs, and local execution
  behavior are unchanged.
- 2026-06-19: completed a renderer permission result value boundary slice by
  adding permission manifest/status/statuses result resolvers and value-level
  helpers to `desktopPermissionRuntimeClient`. `permissionStore` now keeps
  status normalization, gate derivation, onboarding persistence, and action
  errors without reading permission command result envelopes.
  Validation: passed focused permission runtime client, permission store,
  renderer app-runtime boundary, and docs-index tests plus docs search, related
  commit search, stale envelope-field scans, docs listing, and diff checks. No
  migration required; permission IPC
  channel names, raw command helpers, manifest/status payload shapes,
  onboarding storage key, gate formulas, permission probing/request behavior,
  settings, credentials, provider policy, hosted URLs, and local execution
  behavior are unchanged.
- 2026-06-19: completed a renderer transparency content presentation boundary
  slice by adding transparency content presentation and clipboard serialization
  helpers to `desktopMessageTransparencyRuntime`. `TransparencySection` now
  keeps expand/copy UI and metadata rendering without branching on raw
  `json` / `system-prompt` / `xml` transparency type strings. Validation:
  passed focused message transparency runtime, transparency sections, renderer
  chat runtime boundary, and docs-index tests plus docs search, related commit
  search, stale raw type-branch scans, docs listing, and diff checks. No
  migration required; transparency
  section order, keys, titles, `type` values, metadata display,
  collapsed/expanded UI behavior, copy behavior, CSS class names, IPC, storage,
  settings, credentials, permissions, provider policy, hosted URLs, and local
  execution behavior are unchanged.
- 2026-06-19: completed a renderer agent capability update value boundary
  slice by adding `resolveAgentCapabilityUpdate(...)` and
  `DesktopExtensionRuntimeClient.onAgentCapabilityUpdate(...)` so the
  extension runtime client emits direct manifest/catalog update values.
  `AgentSettingsTab` keeps extension/tool presentation, display state, and
  config patch policy without reading normalized agent capability event fields.
  Validation: passed focused desktop extension runtime client, agent settings,
  renderer settings runtime boundary, and docs-index tests plus docs search,
  related commit search, stale capability event-field scans, docs listing, and
  diff checks. No migration required;
  agent capability event channels, normalized full event subscriptions,
  extension metadata loading, manifest/catalog payload shapes, tool toggle
  config keys, IPC, storage, settings, credentials, permissions, provider
  policy, hosted URLs, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer chatbox visual-anchor value boundary slice
  by adding `buildChatboxVisualAnchorHeightPayload(...)` and
  `DesktopWindowRuntimeClient.setChatboxVisualAnchorHeightValue(...)`. Minimal
  chat pill code now keeps measurement, resize scheduling, composer pre-sizing,
  and collapse policy without assembling `height` / `frameHeight` IPC payload
  objects. Validation: passed focused desktop window runtime client, renderer
  chat runtime boundary, minimal chat pill wiring, and docs-index tests plus
  docs search, related commit search, stale visual-anchor payload scans, docs
  listing, and diff checks. No migration required; the
  `set-chatbox-visual-anchor-height` IPC channel, `height` / optional
  `frameHeight` payload fields, native window frame behavior, overlay
  anchoring, resize timing, hit-test behavior, storage, settings, credentials,
  permissions, provider policy, hosted URLs, and local execution behavior are
  unchanged.
- 2026-06-19: completed a renderer workspace value boundary slice by adding
  value-level active-workspace helpers for fetch, granted request,
  selection-update subscription, and active-workspace update subscription to
  `DesktopWorkspaceRuntimeClient`. `ChatInterface` and `WorkspaceSettingsTab`
  now keep refresh, binding, status, and UI state policy without reading
  normalized workspace result/event envelope fields. Validation: passed
  focused workspace runtime client, chat interface wiring, settings section,
  renderer chat/settings runtime boundary, and docs-index tests plus docs
  search, related commit search, stale workspace envelope scans, docs listing,
  and diff checks. No migration required; workspace permission IPC channels,
  workspace-access events, existing full selection result APIs, normalized
  update payload shape, conversation workspace bindings, dashboard resume
  restoration, query `workspace_path` forwarding, storage, settings,
  credentials, permissions, provider policy, hosted URLs, and local execution
  behavior are unchanged.
- 2026-06-19: completed a renderer dashboard host value boundary slice by
  changing `DesktopWindowRuntimeClient.onMainWindowOpenTarget(...)` to emit a
  target string and adding
  `DesktopClientSessionRuntimeClient.loadMainSessionUserId()` for dashboard
  fallback user state. `DashboardShell` now handles wake-up, panel routing,
  recent-list refresh, and fallback assignment without reading normalized
  target/user payload objects. Validation: passed focused window runtime
  client, client-session runtime client, dashboard shell, renderer chat runtime
  boundary, and docs-index tests plus docs search, related commit search, stale
  payload-field scans, docs listing, and diff checks. No migration required;
  main-window open-target events, client-user snapshot commands, full session
  snapshots, endpoint metadata, dashboard routing, IPC, storage, settings,
  credentials, permissions, provider policy, hosted URLs, and local execution
  behavior are unchanged.
- 2026-06-19: completed a renderer chat-loop observed transport connection
  boundary slice by changing the desktop client-session runtime client to emit
  boolean observed connectivity through
  `onObservedIpcTransportConnection(...)` and
  `loadObservedMainTransportConnection(...)`. `useChatLoopUiState` now drives
  disconnect/reconnect recovery from that boolean instead of reading normalized
  `isConnected` status objects. Validation: focused client-session runtime
  client, chat-loop hook, renderer chat runtime boundary, docs-index coverage,
  stale observed-status scans, docs listing, and diff checks. No migration
  required; `get-client-user-id` and `ipc-status` channels, full session
  snapshots, transport status helper shape, storage, settings, credentials,
  permissions, provider policy, hosted URLs, and local execution behavior are
  unchanged.
- 2026-06-19: completed a renderer MCP enablement registry-or-error boundary
  slice by adding `resolveDesktopMcpEnablementRegistry(...)` and changing
  `DesktopMcpRuntimeClient.setMcpServerEnabled(...)` to return a normalized
  registry or throw the normalized enablement error. `McpsSection` now handles
  toggle presentation, registry state, and error display without branching on
  normalized result-envelope fields. Validation: focused MCP runtime client,
  MCP section, renderer chat runtime boundary, and docs-index tests plus docs
  search, related commit search, stale envelope-field scans, and diff checks.
  No migration required; MCP enablement IPC channels, main-process payloads,
  registry normalization, storage, settings, credentials, permissions, provider
  policy, hosted URLs, and local-runtime MCP execution are unchanged.
- 2026-06-19: completed a renderer response-overlay visibility subscription
  boundary slice by changing
  `DesktopResponseOverlayRuntimeClient.onResponseOverlayVisibility(...)` to
  emit a normalized boolean visibility value. `useResponseOverlayWindowSync`
  now resets cached frame state and schedules visible re-reports from that
  boolean instead of reading host-shaped visibility event fields. Validation:
  focused response-overlay runtime client, chat runtime boundary, response
  overlay state, and docs-index tests plus docs search, related commit search,
  stale payload-field scans, docs listing, and diff checks. No migration
  required; response-overlay visibility event names, responsebox size/hit-test
  payloads, visibility re-report timing, IPC, storage, settings, credentials,
  permissions, provider policy, hosted URLs, and local execution behavior are
  unchanged.
- 2026-06-19: completed a renderer thread-presentation current-turn fallback
  boundary slice by moving legacy SDK current-turn projection row derivation
  into `desktopThreadPresentationRuntime`. `ChatInterface` now passes durable
  rows, `currentTurnProjection`, and conversation context to the thread
  presentation facade without importing `desktopCurrentTurnMessageRuntime`,
  while the runtime still prefers SDK presentation entries before falling back
  to legacy projection fields. Validation: focused message-presentation,
  app-runtime boundary, and renderer chat runtime boundary tests plus docs
  search, related commit search, stale feature import scans, and diff checks.
  No migration required; SDK current-turn projection shape, SDK presentation
  entries, durable transcript rows, insertion/dedupe rules, message row shape,
  IPC, storage, settings, credentials, permissions, provider policy, hosted
  URLs, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer thinking source-badge presentation boundary
  slice by moving `ThinkingDisplay` dev-only source badge text/title and SDK
  conversation-event channel formatting into `desktopMessageSourceTagRuntime`
  as `resolveThinkingSourceBadgePresentation(...)`. The component keeps status
  normalization, scroll affordance state, dev-UI gating, and JSX rendering while
  the app runtime owns source label/title formatting. Validation: focused
  thinking display, source tag runtime, renderer chat runtime boundary, and
  docs-index tests plus thinking/source-badge docs search, related commit
  search, stale direct source-label scans, docs listing, and diff checks. No
  migration required; thinking text rendering, scroll thresholds, dev-UI query
  gating, source labels, SDK conversation events, IPC, storage, settings,
  credentials, permissions, provider policy, hosted URLs, and local execution
  behavior are unchanged.

- 2026-06-19: completed a renderer chat stream sub-handler event-predicate
  boundary slice by routing local-user, completion, metadata, and compaction
  handler fail-fast guards through `desktopChatStreamEventRuntime` predicates.
  The app-runtime event facade now owns `user_message`, `turn_completed`,
  metadata, and compaction skipped/completed identity checks for both dispatcher
  routing and sub-handler guard paths, while handlers keep payload projection
  and chat-store side effects. Validation: focused stream event runtime,
  metadata/compaction handler, chat stream thinking/status, and renderer chat
  runtime boundary tests plus docs search, related commit search, stale raw
  handler event-type scans, and diff checks. No migration required; SDK
  conversation event names, backend normalization, stream dispatch ordering,
  chat-store state shape, transcript writes, compaction replay persistence,
  IPC, storage, settings, credentials, permissions, provider policy, hosted
  URLs, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer source-badge presentation boundary slice by
  moving combined source/tag title and badge-text assembly from
  `MessageSourceBadge` into `desktopMessageSourceTagRuntime` as
  `resolveMessageSourceBadgePresentation(...)`. The component now only checks
  the dev-UI gate and renders runtime-provided text/title while the app runtime
  owns raw source-field fallback and token-tag composition. Validation: focused
  message source badge, source tag runtime, renderer chat runtime boundary, and
  docs-index tests plus source-badge docs search, related commit search, stale
  raw source-field scans, and diff checks. No migration required; message row
  shape, dev-UI query gating, token/source labels, SDK display rows, IPC,
  storage, settings, credentials, permissions, provider policy, hosted URLs,
  and local execution behavior are unchanged.

- 2026-06-19: completed a renderer SDK display-row annotation merge boundary
  slice by moving renderer-only annotation merge and pending optimistic user-row
  preservation from `useConversationRuntimeProjectionStream` into
  `desktopConversationDisplayProjection`. The hook now wires projection
  subscriptions, current-turn side effects, and chat-store writes while the
  app-runtime display projection facade owns SDK row to chat-message projection
  plus optimistic user turn dedupe. Validation: focused display projection,
  projection-stream integration, and renderer chat runtime boundary tests plus
  docs search, related commit search, stale hook raw optimistic-row scans, and
  diff checks. No migration required; SDK display rows, `windie:rows`,
  pending-turn payloads, renderer annotation fields, chat store state shape,
  IPC, storage, settings, credentials, permissions, provider policy, hosted
  URLs, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer conversation replay row-selection boundary
  slice by moving edit/resend editable-user lookup and assistant retry
  prior-user lookup from `useConversationReplayActions` into
  `desktopConversationReplayRuntime`. The hook now wires UI callbacks,
  screenshot replay state, continuity calls, and prepared-turn dispatch while
  replay row selection is tested at the app-runtime owner. Validation: focused
  desktop conversation replay runtime, conversation replay action, and renderer
  chat runtime boundary tests plus transcript replay docs search, related
  commit search, stale hook sender-row scans, and diff checks. No migration
  required; replay command payloads, continuity service calls, screenshot refs,
  SDK display rows, IPC, storage, settings, credentials, provider policy,
  hosted URLs, and local execution behavior are unchanged.

- 2026-06-19: completed an SDK API reference local-runtime process wording
  slice by replacing hosted OCR/vision helper-route mentions of "local backend
  process" with "local runtime process" and extending the modular docs boundary
  guard over the API reference. Validation: focused modular docs boundary test
  plus docs search, related commit search, exact stale phrase scan, and diff
  checks. No migration required; runtime code, hosted SDK route paths, API
  payloads, endpoint selection, local-runtime process behavior, storage,
  settings, credentials, permissions, provider-policy, and local execution
  behavior are unchanged.

- 2026-06-19: completed a renderer message-list thinking auto-scroll boundary
  slice by moving the same-row assistant thinking-text update predicate into
  `desktopMessageListRuntime` as `shouldAutoScrollForThinkingTextUpdate(...)`.
  `useMessageListAutoScroll` now composes app-runtime predicates for
  agent-loop and thinking-text scroll decisions instead of checking raw
  assistant `llm-text` row types locally. Validation: focused desktop
  message-list runtime, message-list scroll behavior, and renderer chat
  runtime boundary tests plus docs search, related commit search, stale hook
  row-type scans, and diff checks. No migration required; message rows, scroll
  thresholds, conversation-switch scroll anchoring, rendered thinking text,
  IPC, storage, settings, credentials, provider-policy, hosted URLs, and local
  execution behavior are unchanged.

- 2026-06-19: completed a renderer message-content render-kind boundary slice
  by moving `MessageContent` raw row-type branching into
  `desktopMessageContentRuntime`. The component now consumes a named
  app-runtime presentation kind for error, tool, source, action-summary,
  screenshot, assistant, and generic markdown rows, which keeps SDK/display-row
  interpretation out of the React adapter. Validation: focused message content
  runtime, message content rendering, assistant-thinking rendering, and
  renderer chat runtime boundary tests plus stale component type-branch scans
  and diff checks. No migration required; SDK display rows, markup,
  screenshot/artifact behavior, IPC, storage, settings, credentials,
  permissions, provider policy, hosted URLs, and local execution behavior are
  unchanged.

- 2026-06-19: completed a renderer pending-turn broadcast action boundary
  slice by adding `resolveDesktopPendingTurnBroadcastAction(...)` to
  `desktopPendingTurnRuntimeClient` and routing
  `DesktopConversationRuntimeEventClient.onPendingTurn(...)` through it.
  `chatStore.applyPendingTurnBroadcast(...)` now consumes app-runtime
  pending/clear actions instead of decoding raw `windie:pending-turn` replay
  envelopes. Validation: focused pending-turn runtime client, conversation
  runtime event client, chat store, pending-turn live surface integration, and
  renderer chat runtime boundary tests plus docs search, related commit search,
  stale raw-envelope scans, and diff checks. No migration required; the
  `windie:pending-turn` IPC channel, pending/clear payload shapes, replay
  behavior, optimistic pending-turn UI state, storage, settings, credentials,
  provider-policy, hosted URLs, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer chat-loop transport machine runtime slice by
  moving the disconnect/reconnect recovery reducer, machine event vocabulary,
  and event factory helpers into `desktopChatLoopUiRuntime`.
  `useChatLoopUiState` now owns only runtime-client subscriptions, snapshot
  dispatch, watchdog timer wiring, and returned presentation transport state.
  Validation: focused chat loop UI runtime, chat loop hook, and renderer chat
  runtime boundary tests plus docs search, related commit search, stale hook
  reducer/event-vocabulary scans, and diff checks. No migration required; loop
  UI states, disconnect/reconnect recovery timing, IPC channel names, session
  snapshots, storage, settings, credentials, provider-policy, hosted URLs, and
  local execution behavior are unchanged.

- 2026-06-19: completed a renderer response-overlay row classification slice
  by adding visible-entry, progress-entry, and source-tagged-entry predicates
  to `desktopCurrentTurnMessageRuntime`. `useResponseOverlayViewModel` now
  composes SDK current-turn projection rows through app-runtime predicates
  instead of carrying raw overlay row-type sets. Validation: focused current
  turn message runtime and renderer app-runtime boundary tests plus response
  overlay docs search, related commit search, stale inline overlay row-type
  scans, and diff checks. No migration required; SDK current-turn projection
  shape, response-overlay visibility, closeability, progress-row display, IPC,
  storage, settings, credentials, provider-policy, hosted URLs, and local
  execution behavior are unchanged.

- 2026-06-19: completed a renderer stream dispatch predicate boundary slice by
  adding local-user, turn-error, and usage-update predicates to
  `desktopChatStreamEventRuntime`. `useChatStream` no longer performs direct SDK
  `event.type` comparisons; it maps app-runtime predicates to renderer
  handlers. Validation: focused desktop chat stream event runtime and renderer
  chat runtime boundary tests plus docs listing, related commit search, stale
  inline event-type scans, and diff checks. No migration required; SDK
  conversation event names and payloads, terminal telemetry behavior,
  local-user turn seeding, stream dispatch behavior, IPC, storage, settings,
  credentials, provider-policy, hosted URLs, and local execution behavior are
  unchanged.

- 2026-06-19: completed a renderer metadata stream event classification slice
  by adding system prompt, user message metadata, assistant message, and tool
  schema metadata predicates to `desktopChatStreamEventRuntime`. `useChatStream`
  now asks the app-runtime helper which metadata/transparency handler should
  receive SDK metadata events, while renderer handlers keep payload projection
  into existing rows. Validation: focused desktop chat stream event runtime and
  renderer chat runtime boundary tests plus docs listing, related commit
  search, stale inline metadata event-type scans, and diff checks. No migration
  required; SDK conversation event names and payloads, metadata/transparency row
  projection, stream dispatch behavior, IPC, storage, settings, credentials,
  provider-policy, hosted URLs, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer compaction stream event classification slice
  by adding compaction start, completed, and failed predicates to
  `desktopChatStreamEventRuntime`. `useChatStream` now asks the app-runtime
  helper which compaction handler should receive SDK compaction events, while
  the feature hook keeps handler orchestration and compaction handlers keep
  exact payload validation. Validation: focused desktop chat stream event
  runtime and renderer chat runtime boundary tests plus docs listing, related
  commit search, stale inline compaction event-type scans, and diff checks. No
  migration required; SDK conversation event names and payloads, compaction
  replay/debug behavior, stream dispatch behavior, IPC, storage, settings,
  credentials, provider-policy, hosted URLs, and local execution behavior are
  unchanged.

- 2026-06-19: completed a renderer tool stream display classification slice by
  adding `isToolDisplayOnlyConversationStreamEvent` to
  `desktopChatStreamEventRuntime`. `useChatStream` now asks the app-runtime
  helper whether SDK tool/tool-bundle events should be acknowledged without
  mutating message text, leaving SDK current-turn projection as the display-row
  owner. Validation: focused desktop chat stream event runtime and renderer
  chat runtime boundary tests plus docs listing, related commit search, stale
  inline tool event-type scans, and diff checks. No migration required; SDK
  conversation event names and payloads, tool display projection, stream
  dispatch behavior, IPC, storage, settings, credentials, provider-policy,
  hosted URLs, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer send/stream runtime surface boundary slice
  by moving supported SDK conversation stream event vocabulary classification
  into `desktopChatStreamEventRuntime` before `useChatStream` dispatches
  renderer message updates. The frontend runtime surface reference now describes
  renderer hooks as owning UI intent, presentation state, and local interaction
  coordination while SDK and renderer app-runtime facades own reusable
  send/stream contracts, stale-turn predicates, event normalization, and display
  projections. A modular docs guard rejects the retired broad renderer
  send/stream ownership phrasing. Validation: focused desktop chat stream event
  runtime, renderer chat runtime boundary, and modular docs boundary tests plus
  docs search, related commit search, stale event-type/source-phrase scans, and
  diff checks. No migration required; SDK conversation event names and payloads,
  stream dispatch behavior, IPC, storage, settings, credentials,
  provider-policy, hosted URLs, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer stop target source predicate boundary slice
  by adding `isStopTurnTargetFromCurrentTurn` and
  `isStopTurnTargetFromPendingTurn` to `desktopStopTurnRuntime`.
  `useStopTurnHandler` now consumes those predicates instead of comparing raw
  `sdk-current-turn` / `pending-turn` source strings, while keeping playback
  stop, pending-turn clearing, stopped-turn acceptance, and SDK stop dispatch.
  Validation: focused desktop stop-turn runtime and renderer chat runtime
  boundary tests plus stale source-string scans, docs listing, and diff checks.
  No migration required; stop target values, pending-turn clearing, stopped-turn
  projection, IPC, storage, credentials, provider policy, hosted URLs, and
  local execution behavior are unchanged.

- 2026-06-19: completed a renderer feature import boundary guard slice by
  tightening `RendererAppRuntimeBoundary.test.ts` so active feature source files
  are scanned for direct app-provider internals, renderer infrastructure/IPC
  symbols, and backend-wire helper imports. The guard now reports exact
  file-token offenders while keeping app-runtime facades as the owner-correct
  route for provider state, transport state, and backend-wire normalization.
  Validation: focused renderer app-runtime boundary test, docs listing, related
  commit search, explicit stale-import source scans, and diff checks. No
  migration required; tests only, with runtime behavior, IPC channels, event
  payloads, storage, settings, credentials, provider policy, hosted URLs, and
  local execution unchanged.

- 2026-06-19: completed a renderer dashboard conversation event action
  boundary slice by moving SDK `user_message` / `assistant_message`
  classification for recent-list reloads and title-visibility polling into
  `desktopDashboardConversationLoadRuntime`. `useDashboardConversations` now
  consumes a resolved action while keeping list state, reload execution,
  title-poll timers, open/delete/search side effects, and grouping orchestration.
  Validation: focused dashboard conversation load, dashboard hook, and renderer
  app-runtime boundary tests plus stale raw event-type scans, docs listing, and
  diff checks. No migration required; SDK conversation event names and payloads,
  recent-list reload behavior, title-poll timing, IPC, storage, credentials,
  provider policy, hosted URLs, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer observed transport status boundary slice by
  adding observed transport helpers to `desktopClientSessionRuntimeClient`.
  `useChatLoopUiState` now consumes observed connection updates instead of
  checking the
  `hasConnectionState` sentinel, while keeping disconnect/reconnect recovery
  and watchdog state in the hook. Validation: focused desktop client session
  runtime client, chat loop hook, and renderer chat runtime boundary tests plus
  stale sentinel scans, docs listing, and diff checks. No migration required;
  raw `ipc-status` payloads, existing transport normalizers, recovery timing,
  IPC, storage, credentials, provider policy, hosted URLs, and local execution
  behavior are unchanged.

- 2026-06-19: completed a renderer agent capability event classification slice
  by routing `AgentSettingsTab` through normalized `manifestStatus` and
  `remoteToolCatalog` fields from `desktopExtensionRuntimeClient` instead of
  comparing raw `client-tool-manifest` / `remote-tool-catalog` event type
  strings. The extension runtime client now fully owns capability event type
  classification while the settings tab keeps presentation state, tool-toggle
  projection, and config patching. Validation: focused desktop extension
  runtime client and renderer settings runtime boundary tests, docs search,
  related commit search, stale raw event-type scan, and diff checks. No
  migration required; capability event names, payload shapes, extension
  metadata loading, settings UI behavior, config storage, IPC, credentials,
  provider-policy, hosted URLs, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer workspace picker source classification
  boundary slice by adding `isWorkspacePickerSelection` to normalized workspace
  update payloads in `desktopWorkspaceRuntimeClient`. `ChatInterface` now
  consumes that flag instead of comparing the raw `workspace_picker` host source
  string, while keeping active-workspace refresh, binding comparison, and
  new-chat policy. Focused desktop workspace runtime client, renderer chat
  runtime boundary, and chat interface wiring tests passed with docs listing,
  stale raw source-string scans, and diff checks. No migration required; event
  names, raw source strings, workspace selection, conversation binding, IPC,
  storage, credentials, provider policy, hosted URLs, and local execution are
  unchanged.

- 2026-06-19: completed a process-lifecycle sidecar daemon ownership wording
  slice by changing the local-runtime process lifecycle workflow so the
  sidecar daemon hosts the app-session `LocalRuntimeService` implementation
  behind SDK local-runtime ownership instead of owning local tools, memory, and
  chat-event storage. Validation: focused modular docs boundary guard, docs
  search, related commit search, exact stale lifecycle owner sentence scan, and
  diff checks. No migration required; documentation only, with no runtime, IPC,
  storage, schema, credential, provider-policy, hosted URL, or local execution
  behavior changes.

- 2026-06-19: completed a runtime-node local-runtime ownership wording slice
  by relabeling the node docs from Python-sidecar-as-owner language to
  local-runtime implementation node language. Runtime nodes now say SDK/main
  local runtime owns local executable authority while the Python sidecar remains
  the concrete implementation subprocess for local tools, memory, system state,
  browser automation, and JSON-RPC handlers. Validation: focused modular docs
  boundary guard, docs listing, exact stale node-owner phrase scan, and diff
  checks. No migration required; documentation only, with no runtime, IPC,
  storage, schema, credential, provider-policy, hosted URL, or local execution
  behavior changes.

- 2026-06-19: completed a renderer dashboard layout pulse boundary slice by
  moving the dashboard wake-up browser `resize` pulse into
  `desktopDashboardLayoutRuntime.requestDashboardLayoutPass(...)`.
  `DashboardShell` now keeps animation state and `main-window-open-target`
  routing while the app-runtime helper owns the renderer-only resize dispatch
  timing. Focused desktop dashboard layout runtime, dashboard shell, and
  renderer app-runtime boundary tests passed with docs/history checks, stale
  direct resize-dispatch scans, and diff checks. No migration required; reopen
  animation timing, resize event behavior, IPC, storage, credentials, provider
  policy, hosted URLs, and local execution are unchanged.

- 2026-06-19: completed a renderer desktop new-chat event helper slice by
  moving dashboard-to-chat custom browser event dispatch and subscription into
  `desktopChatEvents` as `dispatchDesktopRuntimeNewChatEvent(...)` and
  `subscribeDesktopRuntimeNewChatEvent(...)`. `DashboardShell` now requests a
  new chat through the app-runtime helper, and `useChatInterfaceBindings`
  subscribes through the same helper instead of spelling out
  `window.dispatchEvent(...)` / `window.addEventListener(...)` for the custom
  event. Validation: focused desktop chat event, chat interface wiring,
  dashboard shell, and renderer app-runtime boundary tests plus stale direct
  event wiring scans, docs search/history checks, and diff checks. No migration
  required; the `desktop-runtime:new-chat` event name, chat reset behavior,
  transcript/session updates, IPC, storage, credentials, provider policy,
  hosted URLs, and local execution behavior are unchanged.

- 2026-06-19: completed an SDK agent runtime transport wording slice by
  replacing stale "requires a backend transport" errors in
  `ConversationContinuityService` and `ConversationRuntime.setModel` with
  agent-runtime-transport wording. TypeScript source, CJS parity, continuity
  tests, package-boundary guards, and the SDK conversation runtime docs now use
  the canonical transport name. Validation: focused conversation continuity
  service, SDK package-boundary, and conversation runtime tests plus stale
  error-message scans, docs listing, and diff checks. No migration required;
  public transport types, backend websocket behavior, rehydrate payload shape,
  model settings updates, IPC, storage, credentials, provider policy, hosted
  URLs, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer continuity search metadata projection slice
  by routing `DesktopConversationContinuityService.searchConversations(...)`
  through `DesktopDashboardConversationLoadRuntime.metadataListToDashboardConversations(...)`
  and deleting its private SDK metadata to dashboard row mapper. The dashboard
  conversation load runtime now owns the row projection used by recent loading,
  the conversation library client, and the continuity-service search facade.
  Validation: focused desktop continuity service, dashboard conversation load,
  and renderer app-runtime boundary tests plus stale mapper scans, docs
  search/history checks, and diff checks. No migration required; SDK
  conversation metadata shapes, dashboard row fields, IPC command payloads,
  storage, credentials, provider policy, hosted URLs, and local execution
  behavior are unchanged.

- 2026-06-19: completed a main conversation metadata diagnostics runtime slice
  by moving app diagnostic context normalization and conversation metadata-list
  event envelope construction out of `ipc_agent_sdk_command_handlers.cjs` into
  `ipc_conversation_metadata_diagnostics_runtime.cjs`. The SDK command handler
  now keeps command orchestration, validation, stage selection, and agent calls
  while the helper owns trace/request/session/conversation propagation and
  request/duration diagnostic data enrichment. Validation: focused IPC
  conversation metadata diagnostics runtime and main SDK runtime boundary tests,
  docs listing, stale inline helper scan, and diff checks. No migration
  required; diagnostic path names, trace/request propagation, conversations.list
  behavior, SDK command payloads, IPC, storage, credentials, provider-policy,
  hosted URLs, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer dashboard conversation metadata projection
  slice by moving SDK `ConversationMetadata` to dashboard row mapping into
  `desktopDashboardConversationLoadRuntime` as
  `metadataToDashboardConversation(...)` and
  `metadataListToDashboardConversations(...)`. Recent conversation loading and
  search now share the same app-runtime projection for `conversation_id`,
  workspace fields, snippets, and matched roles instead of duplicating row
  shaping inside `useDashboardConversations` and
  `DesktopConversationLibraryClient`. Validation: focused dashboard
  conversation load, conversation library client, dashboard hook, and renderer
  app-runtime boundary tests plus stale dashboard metadata mapper scans, docs
  search/history checks, and diff checks. No migration required; SDK
  conversation metadata shapes, dashboard recent/search row shapes, IPC,
  storage, credentials, provider-policy, hosted URLs, and local execution
  behavior are unchanged.

- 2026-06-19: completed a main workspace path runtime slice by moving Agent SDK
  workspace-path fallback resolution from `ipc.cjs` into
  `ipc_workspace_path_runtime.cjs` as
  `resolveWorkspacePathForAgentPayload(...)`. The IPC relay root keeps latest
  desktop config state, SDK startup, command dependency injection, and
  repo-instruction orchestration while the helper owns `workspace_path` /
  `workspacePath` command-payload and cached-config fallback semantics.
  Validation: focused IPC workspace path runtime and main SDK runtime boundary
  tests, stale inline workspace-payload scan, docs listing, and diff checks. No
  migration required; accepted workspace payload aliases, cached config fallback
  behavior, SDK startup, conversation command routing, AGENTS.md lookup, IPC,
  storage, credentials, provider-policy, hosted URLs, and local execution
  behavior are unchanged.

- 2026-06-19: completed a main conversation terminal status runtime slice by
  moving SDK terminal event-to-renderer status projection from `ipc.cjs` into
  `ipc_conversation_status_runtime.cjs` as
  `buildConversationTerminalStatus(...)`. The IPC relay root keeps SDK
  subscription, current-turn fan-out, replay clearing, and renderer status
  broadcast orchestration, while the helper owns `turn_completed`,
  `turn_stopped`, `turn_error`, and `runtime_error` status objects plus error
  payload normalization. Validation: focused IPC conversation status runtime
  and main SDK runtime boundary tests, stale inline error-payload scan, docs
  search/history checks, and diff checks. No migration required; SDK
  conversation event shapes, renderer status payloads, websocket behavior, IPC
  channels, storage, credentials, provider-policy, hosted URLs, and local
  execution behavior are unchanged.

- 2026-06-19: completed a renderer conversation replay prepared-turn runtime
  slice by moving replay preparation payload construction and prepared replay
  desktop chat turn shaping from `useConversationReplayActions` into
  `desktopConversationReplayRuntime` as `buildReplayPreparationPayload(...)`
  and `buildPreparedReplayDesktopChatTurn(...)`. The replay hook now selects
  messages, conversation/session state, and dispatches the prepared turn while
  the runtime helper owns screenshot-ref, screenshot-url, multi-image refs, and
  attachment filename payload fields. Validation: focused desktop conversation
  replay runtime, conversation replay actions, conversation replay database
  integration, and renderer chat runtime boundary tests plus stale snake-case
  payload scans, docs search/history checks, and diff checks. No migration
  required; replay behavior, continuity rewrite payloads, prepared send fields,
  IPC, storage, credentials, provider-policy, hosted URLs, and local execution
  behavior are unchanged.

- 2026-06-19: completed a renderer compaction failure error payload runtime
  slice by moving `compaction_failed` error-text normalization from
  `useChatStreamCompactionHandlers` into `desktopChatStreamEventPayloadRuntime`
  as `resolveCompactionErrorText(...)`. The compaction hook keeps lifecycle
  state, debug state, replay persistence, and tracking side effects. Validation:
  focused chat stream payload runtime and renderer chat runtime boundary tests,
  stale compaction error payload scan, docs listing, and diff checks. No
  migration required; `compaction_failed` event payloads, compaction
  thinking-status behavior, replay persistence, tracking events, IPC, storage,
  credentials, provider-policy, hosted URLs, and local execution behavior are
  unchanged.

- 2026-06-19: completed a renderer local-user stream payload runtime slice by
  moving `user_message` text/content alias normalization into
  `desktopChatStreamEventPayloadRuntime`. `useChatStreamLocalUserHandler` now
  consumes `resolveLocalUserMessageText(...)` while keeping model-context
  capture, thinking-status clearing, and tracking side effects local to the
  handler. Validation: focused desktop chat stream payload runtime and renderer
  chat runtime boundary tests, stale local-user raw-payload scan, docs listing,
  and diff checks. No migration required; SDK `user_message` event payload
  shapes, text/content alias acceptance, conversation event channel names,
  transcript/session state, IPC allowlists, storage, credentials,
  provider-policy, hosted URLs, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer conversation projection event runtime slice
  by moving SDK current-turn and display-row projection payload validation into
  `desktopConversationRuntimeEventClient`. `useConversationRuntimeProjectionStream`
  now consumes normalized `onCurrentTurnProjection(...)` and
  `onDisplayRowsProjection(...)` events while keeping pending-turn replay,
  stale-turn side effects, display-row message merging, and store writes local
  to the hook. Validation: focused desktop conversation runtime event client,
  conversation projection stream, and renderer chat runtime boundary tests,
  stale raw projection payload scan, docs listing, and diff checks. No
  migration required; conversation runtime channel names, SDK current-turn and
  display-row payload shapes, pending-turn fan-out, transcript/display-row
  projection behavior, IPC allowlists, storage, credentials, provider-policy,
  hosted URLs, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer MCP enablement result runtime slice by
  moving toggle-result projection from `McpsSection` into
  `desktopMcpRuntimeClient`. The runtime client now returns
  `{ ok, errorMessage, registry }` for enablement commands, while the dashboard
  MCP section keeps loading, toggle presentation, and normalized error display.
  Validation: focused desktop MCP runtime client, MCP dashboard section, and
  renderer chat runtime boundary tests, stale MCP result envelope scan, docs
  listing, and diff checks. No migration required; MCP enablement IPC channel
  names, main-process result payloads, registry normalization, config
  persistence, dashboard toggle behavior, storage, credentials,
  provider-policy, hosted URLs, and local-runtime MCP execution are unchanged.

- 2026-06-19: completed a renderer chat-loop transport status runtime slice by
  adding normalized and observed transport-status views to
  `desktopClientSessionRuntimeClient`. `useChatLoopUiState` now consumes
  observed connection updates, leaving disconnect recovery and watchdog state in
  the hook while the app-runtime client filters raw `ipc-status`/startup
  snapshots without a boolean connection field. Validation: focused desktop
  client-session runtime client, chat loop UI state hook, and renderer chat
  runtime boundary tests, stale raw connection payload/sentinel scans, docs
  listing, and diff checks.
  No migration required; `get-client-user-id` and `ipc-status` channel names,
  full session snapshot payloads, endpoint metadata, chat-loop
  disconnect/reconnect behavior, IPC allowlists, storage, credentials,
  provider-policy, hosted URLs, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer response overlay visibility runtime slice by
  moving visibility fan-out payload normalization into
  `desktopResponseOverlayRuntimeClient`. `useResponseOverlayWindowSync` now
  receives a normalized boolean `visible` field while keeping sizing,
  re-report, and cached-frame policy local. Validation: focused desktop
  response overlay runtime client and renderer chat runtime boundary tests,
  stale optional visibility payload scan, docs listing, and diff checks. No
  migration required; response-overlay visibility event names, responsebox
  size/hit-test payloads, visibility re-report timing, fixed-size/awaiting
  sizing policy, IPC, storage, credentials, provider-policy, hosted URLs, and
  local execution behavior are unchanged.

- 2026-06-19: completed a renderer dashboard host payload runtime slice by
  moving main-window open-target payload normalization into
  `desktopWindowRuntimeClient` and client-session snapshot user-id
  normalization into `desktopClientSessionRuntimeClient`. `DashboardShell` now
  keeps panel routing and snapshot state updates while consuming normalized
  runtime values instead of interpreting host-shaped target or user fields.
  Validation: focused desktop window runtime client,
  desktop client-session runtime client, dashboard shell, renderer chat runtime
  boundary tests, stale dashboard raw-payload scan, docs listing, and diff
  checks. No migration required; main-window target channel names, accepted
  target strings, startup session snapshot fields, endpoint metadata, dashboard
  routing behavior, IPC, storage, credentials, provider-policy, hosted URLs,
  and local execution behavior are unchanged.

- 2026-06-19: completed a renderer settings status event runtime slice by
  moving settings-update error classification from `AppStatusProvider` into a
  shared `desktopSettingsUpdateErrorRuntime` helper and
  `desktopAppConfigRuntimeClient`, which now emits normalized settings events
  with `isSettingsUpdateError`. The provider keeps only save-status state
  transitions and chat stream error suppression uses the same app-runtime
  classifier. Validation: focused desktop settings-update classifier, desktop
  app-config runtime client, app status provider, renderer settings boundary,
  and chat stream payload runtime tests, stale provider error-string scan, docs
  listing, and diff checks. No migration required;
  settings event channel names, backend error text, save-status UI timing,
  config persistence, IPC, storage, credentials, provider-policy, hosted URLs,
  and local execution behavior are unchanged.

- 2026-06-19: completed a renderer workspace access update payload runtime
  slice by adding `normalizeWorkspaceAccessUpdatedPayload` to
  `desktopWorkspaceRuntimeClient` and routing chat plus workspace settings to
  consume normalized workspace selections from live workspace update events.
  Validation: focused desktop workspace runtime client, chat boundary,
  renderer settings boundary tests, stale workspace live-payload scan, docs
  listing, and diff checks. No migration required; workspace event channel
  names, workspace permission state, active workspace selection behavior,
  conversation workspace bindings, settings UI, chat UI, storage, credentials,
  provider-policy, hosted URLs, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer agent-settings extension payload runtime
  slice by moving extension metadata normalization, empty extension-runtime
  defaults, client tool-manifest status normalization, and remote tool-catalog
  normalization from `AgentSettingsTab` into `desktopExtensionRuntimeClient`.
  The agent settings tab now consumes normalized extension runtime values while
  keeping presentation state and config patches local. Validation: focused
  desktop extension runtime client, agent settings tab, renderer settings
  boundary tests, stale agent-settings raw-payload scan, docs listing, and diff
  checks. No migration required; extension metadata payloads, capability event
  names, settings storage, tool toggle behavior, IPC channel names, credentials,
  provider-policy, hosted URLs, storage, and local-runtime extension/MCP
  execution behavior are unchanged.

- 2026-06-19: completed an SDK runtime transport factory naming slice by
  adding `createAgentRuntimeTransport` as the primary conversation transport
  factory, routing `Agent.conversation(...)` and focused SDK transport tests
  through the runtime-named factory, and preserving
  `createAgentBackendTransport` as an explicit compatibility alias for older
  SDK callers. Validation: focused SDK client and package-boundary tests,
  runtime-factory source scan, and diff checks. No migration required; hosted
  websocket behavior, conversation runtime transport shape, public compatibility
  alias behavior, backend payloads, local-runtime execution, credentials,
  provider-policy, storage, hosted URLs, and renderer IPC behavior are
  unchanged.

- 2026-06-19: completed a renderer dashboard MCP registry payload runtime
  slice by moving MCP registry normalization, empty registry defaults, and
  nested enablement-result registry normalization from `McpsSection` into
  `desktopMcpRuntimeClient`. The dashboard MCP section now owns loading,
  toggle presentation, and error display while consuming normalized registry
  objects from the app-runtime client. Validation: focused MCP runtime client,
  MCP section, and renderer chat runtime boundary tests; stale MCP section
  registry-field scan; docs listing; and diff checks. No migration required;
  MCP registry payloads, enablement persistence, discovery refresh behavior,
  dashboard rendering, IPC channel names, credentials, provider-policy,
  storage, hosted URLs, and local-runtime MCP execution behavior are unchanged.

- 2026-06-19: completed a renderer terminal stream payload runtime slice by
  moving token-count filtering, usage/cache enum validation, nullable/finite
  number handling, and terminal error payload shaping from the terminal chat
  stream hook into `desktopChatStreamEventPayloadRuntime`. The hook now only
  coordinates chat-store side effects using normalized runtime payloads.
  Validation: focused payload-runtime and renderer chat runtime boundary tests,
  terminal-hook stale-field scan, and diff checks. No migration required;
  token-count/error event fields, chat-store updates, stream tracking,
  transcript rows, IPC, backend websocket events, credentials, provider-policy,
  storage, hosted URLs, and local execution behavior are unchanged.

- 2026-06-19: completed a bundled Python runtime label slice by relabeling CLI,
  install, operations, platform, development, and local-runtime lifecycle docs
  from sidecar-runtime owner wording to bundled Python runtime,
  local-runtime daemon, and local-runtime smoke wording while preserving
  `<windie> build sidecar-runtime`, script paths, Python sidecar daemon
  implementation details, and historical file paths. Validation: focused
  modular boundary test, docs listing, exact retired-label scan, and diff
  checks. No migration required; packaging scripts, runtime resource paths, CLI
  command ids, package smoke behavior, local-runtime launch, credentials,
  provider-policy, hosted URLs, storage, and payload shapes are unchanged.

- 2026-06-19: completed a renderer chat stream payload runtime slice by moving
  compaction debug/replay alias parsing, replacement-history extraction,
  compaction skipped/user id normalization, compacted replay snapshot building,
  and tool-schema metadata alias normalization from chat hooks into
  `desktopChatStreamEventPayloadRuntime`. Hooks now coordinate side effects and
  UI updates through app-runtime helpers. Validation: focused payload-runtime,
  compaction-handler, metadata-handler, renderer chat runtime boundary tests,
  and diff checks. No migration required; compaction event payloads, replay
  storage shape, metadata updates, stream tracking, IPC, backend websocket
  events, credentials, provider-policy, storage, hosted URLs, and local
  execution behavior are unchanged.

- 2026-06-19: completed an SDK example product-label slice by renaming the
  runnable example loader helpers to `buildLocalAgentSdk` and
  `loadLocalAgentSdk`, updating custom UI/CLI/local-tool/plugin example copy and
  smoke checks to Agent SDK/runtime wording, and extending the modular guard
  across the runnable example set. Validation: focused modular boundary test,
  stale example-label scan, and diff checks. No migration required; repository
  examples and tests changed only, with no SDK package export, backend route,
  websocket payload, local-runtime startup, plugin manifest shape, credential,
  storage, provider-policy, or hosted-URL change.

- 2026-06-19: completed a browser runtime label slice by replacing focused
  product-skinned dedicated-browser labels and sidecar-as-browser-runtime
  labels in browser action, browser control, permission warm-up, browser tool,
  tool catalog, and Browser Use adapter references with local-runtime dispatch,
  controlled browser session, dedicated browser runtime, local-runtime Python
  entrypoint, and local-runtime result wording. The modular docs guard now
  reads those browser pages and rejects the retired focused labels. Validation:
  focused modular boundary test, docs listing, retired browser-label scan, and
  diff checks. No migration required; documentation/test only, with no browser
  action names, Browser Use behavior, CDP port/profile policy, permission
  request flow, tool schema, local-runtime dispatch, IPC, credential,
  provider-policy, storage, hosted URL, or payload-shape change.

- 2026-06-19: completed a renderer settings ownership shorthand slice by
  replacing the remaining `local-runtime-owned` checklist label in the settings
  surface workflow with explicit local-runtime setting ownership prose. The
  renderer settings docs guard now rejects the shorthand. Validation: focused
  modular boundary test, stale shorthand scan, and diff checks. No migration
  required; documentation/test only, with no settings schema, renderer state,
  backend patch allowlist, local-runtime launch env, JSON-RPC action, IPC,
  credential, provider-policy, storage, hosted URL, or payload-shape change.

- 2026-06-19: completed a local-runtime sidecar owner-label slice by replacing
  remaining active "local-runtime sidecar" labels in browser, tool, backend
  parity, overlay, inventory, planning, development, and packaging reference
  docs with local-runtime ownership labels plus Python sidecar implementation
  wording where the concrete daemon, manifest, registry, stderr logs, or
  executor is the thing being debugged. The modular docs guard now skips
  historical plan reports and rejects the mixed public owner labels in active
  docs. Validation: focused modular boundary test, docs listing, stale active
  label scan, and diff checks. No migration required; documentation/test only,
  with no local tool execution, browser adapter, registry exposure, manifest
  generation, packaging path, IPC, credential, permission, provider-policy,
  backend API, storage, hosted URL, or payload-shape change.

- 2026-06-19: completed a sidecar-backed tool section label slice by relabeling
  local-tool channel, browser automation, Python sidecar/memory, and
  configuration reference headings and hub links from Sidecar Tool/Runtime
  labels to local-runtime implementation wording while preserving Python
  sidecar wording for concrete daemon, JSON-RPC, registry, and protocol
  references. The modular docs guard now rejects the retired public labels.
  Validation: focused modular boundary test, docs listing, stale label scan,
  and diff checks. No migration required; documentation/test only, with no
  browser tool behavior, registry behavior, JSON-RPC method, local memory,
  packaging path, IPC, credential, provider-policy, backend API, storage, or
  hosted URL change.

- 2026-06-19: completed a local-runtime JSON-RPC public channel slice by
  relabeling public channel, node, architecture-pipeline, docs hub, and browser
  reference surfaces from sidecar JSON-RPC and Desktop and Sidecar Node wording
  to local-runtime JSON-RPC and Desktop and Local Runtime Node wording. The
  desktop-node lifecycle diagram now shows SDK/main local-runtime coordination
  with renderer SDK projections instead of renderer-initiated local tool
  execution, while concrete Python sidecar JSON-RPC wording remains where it
  names the implementation protocol. Validation: focused modular boundary
  test, docs listing, stale public-label scan, and diff checks. No migration
  required; documentation/test only, with no JSON-RPC method name, payload
  shape, IPC channel, SDK local-runtime execution, Python sidecar behavior,
  backend tool-result ingress, credential, provider-policy, storage, or hosted
  URL change.

- 2026-06-19: completed an architecture local-runtime tool ownership slice by
  rewording agent-system, backend-architecture, and tool-system docs from
  sidecar-as-owner labels to SDK/main local-runtime dispatch,
  local-runtime/provider routes, local-runtime boundary ownership, and Python
  sidecar registry wiring only where implementation detail matters. The
  modular boundary guard now reads those architecture pages and rejects the
  retired sidecar-as-owner phrases. Validation: focused modular boundary test,
  docs listing, stale phrase scan, and diff checks. No migration required;
  documentation/test only, with no backend tool waiting, local execution,
  built-in tool registration, Python sidecar registry behavior, IPC,
  credential, provider-policy, backend API, storage, or tool-result payload
  change.

- 2026-06-19: completed a renderer permission platform-code label slice by
  rewording the renderer state workflow from Electron main/sidecar platform
  code to Electron main plus local-runtime platform code for permission
  probing. The modular stale-doc guard now rejects the retired sidecar
  platform-code phrase. Validation: focused modular boundary test, docs
  listing, stale phrase scan, and diff checks. No migration required;
  documentation/test only, with no renderer state, permission probing, platform
  adapter, IPC, credential, provider-policy, backend API, storage, or local
  execution change.

- 2026-06-19: completed a platform adapter local-runtime label slice by
  rewording active security permission authority, platform hub, and Windows
  platform docs from sidecar platform adapter labels to local-runtime platform
  adapter ownership while preserving concrete Python sidecar implementation
  paths. The modular stale-doc guard now reads the platform hub, Windows page,
  and permission authority workflow for this retired label. Validation:
  focused modular boundary test, docs listing, stale phrase scan, and diff
  checks. No migration required; documentation/test only, with no platform
  adapter, permission behavior, input/window action, screenshot policy,
  packaging script, IPC, credential, provider-policy, backend API, storage, or
  local execution change.

- 2026-06-19: completed a desktop permission runtime-facade docs slice by
  replacing stale removed-permission-utility guidance in
  `docs/desktop/onboarding_permissions.md` with the current renderer
  app-runtime permission presentation, grant-effects, onboarding-storage, and
  runtime-client facades. The modular stale-doc guard now reads the desktop
  permissions guide and rejects the retired permission utility glob.
  Validation: focused modular boundary test, docs listing, stale path scan, and
  diff checks. No migration required; documentation/test only, with no
  onboarding UI, settings control-center, permission store, manifest, IPC,
  credential, provider-policy, backend API, storage, local execution, or
  platform permission behavior changed.

- 2026-06-19: completed a backend protocol correlation wording slice by
  rewording websocket transport and backend protocol-state docs from frontend
  correlation to SDK/renderer correlation, renaming backend formatter and
  remote-tool tests to SDK correlation, and adding backend guard coverage for
  the retired frontend-correlation phrases. Validation: focused backend
  formatter, remote-tool, and architecture guardrail tests, docs listing, stale
  phrase scan, and diff checks. No migration required; documentation/test only,
  with no websocket envelope, context field, request id, formatter payload,
  remote-tool behavior, SDK projection, renderer ingress, IPC, credential,
  provider-policy, backend API, or storage change.

- 2026-06-19: completed a local-runtime readiness/dashboard-hub label slice by
  routing JSON-RPC workflow readiness/status, Python sidecar memory routing,
  packaged app local-runtime status, and dashboard hub summary wording through
  SDK local runtime, Electron main local-runtime bridge, packaged local-runtime
  status, Python sidecar implementation details, and renderer app-runtime
  facade ownership. The modular guard now rejects the retired broad
  sidecar-readiness/status and dashboard-utility labels. Validation: focused
  modular boundary test, docs listing, stale phrase scan, and diff checks. No
  migration required; documentation/test only, with no JSON-RPC method,
  readiness behavior, packaged runtime behavior, dashboard route, IPC,
  credential, provider-policy, backend API, storage, or local execution change.

- 2026-06-19: completed a dashboard section runtime-facade docs slice by
  replacing stale removed-dashboard-utility guidance in the desktop dashboard
  guide and renderer state workflow with section components plus renderer
  app-runtime facades for dashboard grouping/loading, memory, model, and
  settings state. The modular stale-doc guard now reads the desktop dashboard
  guide and rejects the retired dashboard utility glob. Validation: focused
  modular boundary test, docs listing, stale path scan, and diff checks. No
  migration required; documentation/test only, with no dashboard UI, section
  state, memory/model/settings command, IPC, credential, provider-policy,
  backend API, storage, or local execution change.

- 2026-06-19: completed an operations evidence local-runtime label slice by
  routing `docs/operations/evidence_collection_runbook.md` summary,
  boundary-evidence rows, trace flags, permission/platform tests, and
  local-tool failure examples plus the
  `docs/browser/browser_change_workflow.md` browser action-hang owner row
  through local-runtime/Python sidecar implementation labels instead of
  sidecar-as-runtime labels. The modular docs guard now rejects retired
  evidence phrases such as websocket-state sidecar-readiness, sidecar
  tool/runtime, and broad bridge-or-sidecar local-tool failure routing.
  Validation: focused modular boundary test, docs listing, stale phrase scan,
  and diff checks. No migration required; documentation/test only, with no
  evidence command, log flag, IPC, credential, provider-policy, backend API,
  storage, local execution, permission, or packaging behavior changed.

- 2026-06-19: completed a tool screenshot and formatter-guard wording slice by
  routing tool-development screenshot guidance through the Agent SDK tool
  coordinator plus desktop local-runtime host, and routing backend formatter
  debugging through the SDK backend-event guard and renderer
  conversation-event ingress guard instead of generic frontend runtime labels.
  The modular stale-doc guard now covers the formatter reference and rejects
  the retired frontend-runtime screenshot/guard phrases. Validation: focused
  modular boundary test, docs listing, stale phrase scan, and diff checks. No
  migration required; documentation/test only, with no tool schema, screenshot
  capture behavior, formatter payload, SDK event guard, renderer ingress, IPC,
  credential, provider-policy, backend API, storage, or local execution change.

- 2026-06-19: completed a backend agent-definition default-policy wording slice
  by rewording the backend `AgentDefinition` schema docstring from
  product-named default-agent language to hosted backend default agent policy.
  The backend schema guard now rejects the retired "default WindieOS agent"
  phrase while preserving the existing `agent_definition` payload, validation
  modes, SDK builder contract, hosted defaults, IPC, credentials, provider
  policy, storage, and local execution behavior. Validation: focused backend
  schema test, docs listing, stale phrase scan, and diff checks. No migration
  required.

- 2026-06-19: completed a debug diagnostic/observability/process-health
  local-runtime label slice by routing `docs/debug/diagnostic_flags.md`,
  `docs/debug/observability_change_workflow.md`, and
  `docs/debug/process_health_checklist.md` metadata, headings, stdout rules,
  and readiness checks through local-runtime Python sidecar labels instead of
  presenting sidecar as a peer runtime owner. Concrete Python sidecar
  stdout/stderr and pytest wording remains where the docs debug the actual
  implementation process. The modular docs guard now covers these debug pages
  and rejects the retired sidecar-as-runtime summary/readiness phrases.
  Validation: focused modular docs guard, docs listing, stale phrase scan, and
  diff checks. No migration required; documentation/test only, with no code
  path, payload, storage, IPC, settings, credentials, permissions, hosted
  routes, provider policy, packaging, or local execution behavior changed.

- 2026-06-19: completed a debug-routing local-runtime label slice by routing
  the Debug hub, runtime trace guide, and symptom playbooks from sidecar-as-
  runtime phrasing to local-runtime owner labels for trace paths, backend URL
  drift, tool registration, wakeword service routing, and browser adapter
  triage. Python sidecar wording remains only where the docs name the concrete
  implementation process or registry behind the local-runtime boundary. The
  modular docs guard now rejects the retired sidecar trace-path, sidecar backend
  URL, sidecar wakeword service, sidecar Browser Use adapter, and sidecar debug
  heading phrases in these debug routes. Validation: focused modular docs guard,
  docs listing, exact stale retired-phrase scan, and diff checks. No migration
  required; documentation/test only, with no code path, payload, storage, IPC,
  settings, credentials, permissions, hosted routes, provider policy, packaging,
  or local execution behavior changed.

- 2026-06-19: completed a renderer tool-ghost timing runtime-boundary slice by
  moving `TOOL_GHOST_CLICK_SYNC_DELAY_MS` from
  `frontend/src/renderer/features/chat/constants/toolGhostRuntime.ts` into
  `frontend/src/renderer/app/runtime/desktopToolGhostRuntime.ts`.
  `ToolGhostDebugApp`, active tool-ghost docs, app-runtime inventory, and
  boundary guards now consume the app-runtime owner while the old chat feature
  constant path is deleted. Validation: focused renderer app-runtime boundary
  test, docs listing, stale old-path scan, frontend lint, and diff checks. No
  migration required; debug ghost timing, CSS variable value, debug view
  routing, overlay IPC, production response overlay behavior, credentials,
  hosted routes, provider policy, packaging, and local execution behavior are
  unchanged.

- 2026-06-19: completed a renderer dashboard conversation-grouping
  runtime-boundary slice by moving time-bucket grouping, workspace grouping,
  title fallback, pinned ordering, matched-role labels, and search metadata
  normalization from
  `frontend/src/renderer/features/dashboard/utils/conversationGroups.js` into
  `frontend/src/renderer/app/runtime/desktopDashboardConversationGroupRuntime.js`.
  `useDashboardConversations`, dashboard docs, focused tests, app-runtime
  inventory, and boundary guards now consume the app-runtime owner while the old
  feature utility path is deleted. Validation: focused conversation-grouping
  and renderer app-runtime boundary tests, docs listing, stale old-path scan,
  frontend lint, and diff checks. No migration required; dashboard grouping
  buckets, workspace grouping, title fallbacks, pinned ordering, search
  metadata, matched-role labels, conversation loading, transcript storage,
  session routing, IPC, credentials, permissions, hosted routes, provider
  policy, packaging, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer permission presentation runtime-boundary
  slice by moving access-kind labels, granted/action label defaults,
  granted-status normalization, and permission pill label/class projection from
  `frontend/src/renderer/features/permissions/utils/permissionStatus.js` and
  `frontend/src/renderer/features/permissions/utils/permissionPresentation.js`
  into
  `frontend/src/renderer/app/runtime/desktopPermissionPresentationRuntime.js`.
  Permission status badges, onboarding permission slides, onboarding permission
  actions, active permission docs, app-runtime inventory, and boundary guards
  now consume the app-runtime owner while the old feature utility paths are
  deleted. Validation: focused permission presentation runtime and badge
  rendering tests, focused onboarding slideshow/actions and renderer app-runtime
  boundary tests, docs listing, stale old-path scan, frontend lint, and diff
  checks. No migration required; permission status keywords, labels, CSS class
  tokens, onboarding action labels, status polling, settings badge rendering,
  manifest consumption, storage, IPC, credentials, hosted routes, provider
  policy, packaging, and local execution behavior are unchanged.

- 2026-06-19: completed a renderer onboarding slide-state runtime-boundary
  slice by moving permission-slide counting, active-index clamping,
  permission-vs-stop-slide classification, and onboarding title/body selection
  from `frontend/src/renderer/features/onboarding/utils/onboardingSlides.js`
  into
  `frontend/src/renderer/app/runtime/desktopOnboardingSlideRuntime.js`.
  `DesktopOnboardingSlideshow`, focused tests, active startup/onboarding docs,
  app-runtime inventory, and boundary guards now consume the app-runtime owner
  while the old feature utility path is deleted. Validation: focused
  onboarding slide-state, slideshow, and renderer app-runtime boundary tests,
  docs listing, stale old-path scan, frontend lint, and diff checks. No
  migration required; onboarding slide order, index clamping, title/body copy,
  stop-shortcut slide behavior, permission manifest consumption, storage, IPC,
  credentials, permissions, hosted routes, provider policy, packaging, and local
  execution behavior are unchanged.

- 2026-06-19: completed an agent-definition docs wording slice by routing SDK,
  AgentClient runtime, and API reference client-manifest docs through hosted
  backend, client tool-schema sync, backend default tools, and built-in
  local-runtime tool-group terminology instead of retired WindieOS-agent,
  frontend-tool-schema, and product-specific built-in wording. The modular docs
  guard now covers the retired `frontend-tool-schemas`, planned post-handshake
  frontend tool schema, default WindieOS agent, backend/default WindieOS tools,
  WindieOS built-in tools, hosted WindieOS usable, and WindieOS agents without
  Electron desktop phrases. Validation: focused modular refactor docs guard,
  docs-index agent definition routing test, docs listing, stale retired-phrase
  scan, and diff checks. No migration required; documentation/test only, with
  no code path, payload, storage, IPC, settings, credentials, permissions,
  hosted routes, provider policy, packaging, or local execution behavior
  changed.
- 2026-06-19: completed a dashboard conversation-library docs follow-up by
  replacing active recent-list, search, resume, and transcript-session
  references to legacy direct conversation IPC labels with the current
  `DesktopConversationLibraryClient` and SDK-shaped `conversations.*` /
  `conversation.loadDisplay` route. The dashboard runtime-boundary guard now
  blocks the retired `LIST_CHAT_CONVERSATIONS`, `SEARCH_CHAT_CONVERSATIONS`,
  and `GET_CHAT_EVENTS` labels in those active docs. Validation: focused
  dashboard runtime-boundary test, docs listing, stale old-label scan, and diff
  checks. No migration required; documentation/test only, with no code path,
  payload, storage, IPC, settings, credentials, permissions, hosted routes,
  provider policy, packaging, or local execution behavior changed.
- 2026-06-19: completed a voice docs runtime-path follow-up by replacing
  stale `frontend/src/renderer/features/voice/utils/*` references in active
  channel, desktop, and frontend inventory docs with the current renderer
  app-runtime voice audio, wakeword, and voice debug trace helper paths.
  Validation: docs listing, stale wildcard scan, and diff checks. No migration
  required; documentation only, with no code path, payload, storage, IPC,
  settings, credentials, permissions, hosted routes, provider policy,
  packaging, or local execution behavior changed.
- 2026-06-19: completed a renderer wakeword helper runtime-boundary slice by
  moving missing-device lockout, audio-input probing, wakeword event
  confidence/cooldown normalization, chunk-size warning text, and gated voice
  debug tracing from
  `frontend/src/renderer/features/voice/utils/{wakewordCaptureGuard,wakewordEventUtils,voiceDebugTrace}.ts`
  into
  `frontend/src/renderer/app/runtime/{desktopWakewordCaptureGuardRuntime,desktopWakewordEventRuntime,desktopVoiceDebugTraceRuntime}.ts`.
  Wakeword/voice hooks, focused tests, active voice docs, folder structure,
  app-runtime inventory, and boundary guards now consume the app-runtime owners
  while the old feature utility paths are deleted. Validation: focused
  wakeword event, wakeword detection, voice mode, renderer voice runtime
  boundary, skin/config boundary, docs listing, stale old-path scan, frontend
  lint, and diff checks. No migration required; global wakeword guard key,
  missing-device lockout semantics, audio-input probing, wakeword
  confidence/cooldown predicates, debug trace query flag, IPC payloads,
  storage, credentials, permissions, hosted routes, provider policy, packaging,
  and local execution behavior are unchanged.
- 2026-06-19: completed a renderer dashboard recent-conversation load
  runtime-boundary slice by moving list normalization, pinned-reference pruning,
  retry delay calculation, and retry gating from
  `frontend/src/renderer/features/dashboard/utils/dashboardConversationLoad.js`
  into
  `frontend/src/renderer/app/runtime/desktopDashboardConversationLoadRuntime.js`.
  `useDashboardConversations`, focused tests, active dashboard docs, folder
  structure, app-runtime inventory, and boundary guards now consume the
  app-runtime owner while the old feature utility path is deleted. Validation:
  focused dashboard load and app-runtime boundary tests, docs listing, stale
  old-path scan, frontend lint, and diff checks. No migration required; SDK
  conversation metadata commands, row shape, sorting, pinned-list behavior,
  retry timing, transcript title polling, storage, IPC, credentials,
  permissions, hosted routes, provider policy, packaging, and local execution
  behavior are unchanged.
- 2026-06-19: completed a renderer voice audio capture
  runtime-boundary slice by moving PCM encoding, gateway binary frame
  construction, capture cleanup, and AudioWorklet processor construction from
  `frontend/src/renderer/features/voice/utils/{audioEncoding,audioCaptureCleanup,audioProcessorNode}.ts`
  into
  `frontend/src/renderer/app/runtime/{desktopVoiceAudioEncodingRuntime,desktopVoiceAudioCaptureCleanupRuntime,desktopVoiceAudioProcessorNodeRuntime}.ts`.
  Voice mode and wakeword hooks, focused tests, active voice docs, folder
  structure, app-runtime inventory, and boundary guards now consume the
  app-runtime owners while the old feature utility paths are deleted.
  Validation: focused voice audio encoding, cleanup, processor-node, renderer
  voice runtime boundary, skin/config boundary, docs listing, stale old-path
  scan, frontend lint, and diff checks. No migration required; PCM conversion,
  gateway binary frame layout, chunk-size normalization, cleanup semantics,
  wakeword IPC payloads, transcription gateway path, credentials, permissions,
  hosted routes, provider policy, packaging, and local execution behavior are
  unchanged.
- 2026-06-19: completed a frontend module inventory runtime-path slice by
  replacing the stale root renderer utility glob
  `frontend/src/renderer/utils/{configFilter,configStorage,displaySelection}.*`
  with the current app-runtime config facades and the remaining
  `frontend/src/renderer/utils/normalizeNonEmptyString.ts` helper. Validation:
  docs listing, current-file existence scan, stale old-path scan, and diff
  checks. No migration required; documentation only, with no code path,
  payload, storage, IPC, settings, credentials, permissions, hosted routes,
  provider policy, packaging, or local execution behavior changed.
- 2026-06-19: completed a renderer permission onboarding storage
  runtime-boundary slice by moving localStorage manifest-completion
  persistence from
  `frontend/src/renderer/features/permissions/utils/permissionStorage.js` to
  `frontend/src/renderer/app/runtime/desktopPermissionOnboardingStorageRuntime.js`.
  `permissionStore`, focused tests, active permission/onboarding/settings docs,
  folder structure, and boundary guards now consume the app-runtime owner while
  the old feature storage utility path is deleted. Validation: focused
  permission storage/store, renderer skin/config boundary, docs listing, stale
  old-path scan, frontend lint, and diff checks. No migration required; the
  permission onboarding localStorage key, persisted payload shape, gate
  semantics, IPC permission actions, storage, credentials, permissions, hosted
  routes, provider policy, packaging, and local execution behavior are
  unchanged.
- 2026-06-19: completed a renderer app-config filter/storage
  runtime-boundary slice by moving renderer-managed config allowlisting and
  localStorage fallback defaults from `frontend/src/renderer/utils/configFilter.js`
  and `frontend/src/renderer/utils/configStorage.js` to
  `frontend/src/renderer/app/runtime/desktopRendererConfigFilterRuntime.js`
  and
  `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js`.
  AppConfigProvider, config persistence helpers, focused tests, active docs,
  folder structure, and boundary guards now consume the app-runtime owners while
  the old root utility paths are deleted. Validation: focused config
  filter/storage, app config provider persistence, settings runtime boundary,
  skin/config boundary, docs listing, stale old-path scan, frontend lint, and
  diff checks. No migration required; renderer-managed setting allowlist,
  localStorage key, default config values, provider-secret stripping, shortcut
  normalization, settings sync payload shape, storage, credentials,
  permissions, hosted routes, provider policy, packaging, and local execution
  behavior are unchanged.
- 2026-06-19: completed a renderer memory retrieval preference
  runtime-boundary slice by moving the persisted retrieval-injection toggle
  helper from `frontend/src/renderer/utils/memoryRetrievalPreference.js` to
  `frontend/src/renderer/app/runtime/desktopMemoryRetrievalPreferenceRuntime.js`.
  Dashboard memory settings and query-send runtime clients now consume the
  app-runtime facade, and the old root renderer utility path is deleted.
  Validation: focused memory retrieval preference, memory section, runtime
  transport, skin/config boundary, docs listing, stale old-path scan, frontend
  lint, and diff checks. No migration required; the persisted storage key,
  default enabled behavior, invalid-value fallback, query payload gating,
  localStorage access, storage, credentials, permissions, hosted routes,
  provider policy, packaging, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer message screenshot resolver
  runtime-boundary slice by moving async artifact screenshot source resolution
  from
  `frontend/src/renderer/features/chat/utils/message/useResolvedMessageScreenshots.js`
  to
  `frontend/src/renderer/app/runtime/desktopResolvedMessageScreenshotsRuntime.js`.
  User/tool message components, active docs, folder structure, and renderer
  boundary guards now route through the app-runtime owner while the old chat
  utility path is deleted. Validation: focused message content, desktop message
  screenshot runtime, renderer chat boundary, docs listing, stale old-path
  scan, frontend lint, and diff checks. No migration required; inline
  screenshot fallback, artifact URL inference, async fetch retry-after-failure
  behavior, image context-menu IPC, transcript rows, storage, credentials,
  permissions, hosted routes, provider policy, packaging, and local execution
  behavior are unchanged.
- 2026-06-19: completed a renderer chat-send preparation and selector
  runtime-boundary slice by moving
  `frontend/src/renderer/features/chat/utils/messageSender/desktopChatSendPreparation.ts`
  to
  `frontend/src/renderer/app/runtime/desktopChatSendPreparationRuntime.ts`
  and moving shared chat-interface/minimal live-surface projection rules from
  `frontend/src/renderer/features/chat/utils/chatSelectors.js` into
  `frontend/src/renderer/app/runtime/desktopChatSurfaceSelectorRuntime.ts`.
  `useChatMessageSender` now injects the few chat-store reads/actions required
  by send preparation, `chatStore` binds selector projection rules to the
  active workspace, and chat/minimal surfaces, focused tests, active docs,
  folder structure, and boundary guards consume the app-runtime owners while
  the old feature utility paths are deleted. Validation: focused chat
  selector, pending-turn live-surface integration, renderer chat boundary, and
  renderer app-runtime boundary tests; docs listing; stale old-path scans;
  frontend lint; and diff checks. No migration required; conversation-ref
  selection, pending-turn acceptance/broadcast, screenshot-resource decisions,
  attachment metadata, deferred model selection, live-turn dispatch payloads,
  active-workspace selector references, IPC payloads, storage, credentials,
  permissions, hosted routes, provider policy, packaging, and local execution
  behavior are unchanged.
- 2026-06-19: completed a renderer new-chat session runtime-boundary slice by
  moving new-chat reset, local conversation creation, transcript session
  selection, and workspace binding orchestration from
  `frontend/src/renderer/features/chat/utils/session/newChatSession.ts` to
  `frontend/src/renderer/app/runtime/desktopNewChatSessionRuntime.ts`.
  `ChatInterface`, focused tests, active docs, folder structure, and renderer
  boundary guards now consume the app-runtime owner, and the old chat utility
  path is deleted. Validation: focused new-chat session runtime, renderer chat
  boundary, renderer app-runtime boundary, docs listing, stale old-path scan,
  frontend lint, and diff checks. No migration required; reset ordering,
  conversation-ref format, transcript session update, workspace binding,
  active-conversation projection, IPC payloads, storage, credentials,
  permissions, hosted routes, provider policy, packaging, and local execution
  behavior are unchanged.
- 2026-06-19: completed a renderer chat-stream model-context
  runtime-boundary slice by collapsing the type-only
  `frontend/src/renderer/features/chat/utils/transcriptModelContext.ts` and
  `frontend/src/renderer/features/chat/utils/chatStream/chatStreamTypes.ts`
  paths into
  `frontend/src/renderer/app/runtime/desktopChatStreamModelContextRuntime.ts`.
  Stream handlers now import the app-runtime model/provider plus thinking
  capability context directly, and the old feature utility paths are deleted.
  Validation: focused renderer chat boundary, docs listing, stale old-path
  scan, frontend lint, and diff checks. No migration required; runtime
  payloads, model/provider values, thinking capability flags, transcript rows,
  IPC payloads, storage, credentials, permissions, hosted routes, provider
  policy, packaging, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer chat-stream message-update
  runtime-boundary slice by moving message target selection and
  system/user/assistant metadata update payload builders from
  `frontend/src/renderer/features/chat/utils/chatStream/chatStreamMessageUpdates.ts`
  to
  `frontend/src/renderer/app/runtime/desktopChatStreamMessageUpdateRuntime.ts`.
  The runtime owner now uses a narrow message-target shape instead of importing
  the chat store type, stream metadata/terminal/updater hooks and focused tests
  consume the app-runtime facade, and the old feature utility path is deleted
  and guarded. Validation: focused desktop chat stream message-update runtime,
  renderer chat boundary, docs listing, stale old-path scan, frontend lint, and
  diff checks. No migration required; message-id targeting, turn-scoped
  no-cross-turn update behavior, incoming text normalization, tool-schema
  update normalization, transcript rows, IPC payloads, storage, credentials,
  permissions, hosted routes, provider policy, packaging, and local execution
  behavior are unchanged.
- 2026-06-19: completed a renderer chat-stream event-payload
  runtime-boundary slice by deleting the duplicate
  `frontend/src/renderer/features/chat/utils/chatStream/chatStreamEventUtils.ts`
  path and routing terminal error filtering, error text fallback, and
  screenshot attachment normalization through
  `frontend/src/renderer/app/runtime/desktopChatStreamEventPayloadRuntime.ts`.
  `useChatStreamTerminalHandlers`, focused tests, active docs, folder
  structure, and renderer chat boundary guards now consume the app-runtime
  owner directly. Validation: focused desktop chat stream event payload
  runtime, chat stream terminal handlers, renderer chat boundary, docs listing,
  stale old-path scan, frontend lint, and diff checks. No migration required;
  settings-update error suppression text, recoverable streamed tool-call parse
  filtering, fallback error text, screenshot ref/url normalization, artifact
  URL construction, IPC payloads, storage, credentials, permissions, hosted
  routes, provider policy, packaging, and local execution behavior are
  unchanged.
- 2026-06-19: completed a renderer trace runtime-boundary slice by moving
  stream, chat-pill, response-surface, and live-surface diagnostic trace
  helpers from
  `frontend/src/renderer/features/chat/utils/chatStream/chatStreamDebugTrace.ts`
  to `frontend/src/renderer/app/runtime/desktopRendererTraceRuntime.ts`.
  Minimal pill, response overlay, current-turn projection, send preparation,
  debug docs, focused tests, folder structure, and renderer chat boundary
  guards now route through the app-runtime trace facade, and ChatProvider
  injects chat workspace snapshots without trace helpers importing chat feature
  state. Validation: focused desktop renderer trace runtime, renderer chat
  boundary, docs listing, stale old-path scan, frontend lint, and diff checks.
  No migration required; debug query flags, console labels, live-surface trace
  IPC forwarding, redacted workspace snapshot fields, trace payload shapes,
  storage, credentials, permissions, hosted routes, provider policy,
  packaging, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer chat-send payload runtime-boundary slice by
  moving outgoing payload normalization and attachment filename deduping from
  `frontend/src/renderer/features/chat/utils/messageSender/chatMessageSenderPayloads.ts`
  to
  `frontend/src/renderer/app/runtime/desktopChatSendPayloadRuntime.ts`, and by
  moving the first-user-message predicate from
  `frontend/src/renderer/features/chat/utils/messageSender/chatMessageSenderUtils.ts`
  to `frontend/src/renderer/app/runtime/desktopChatSendStateRuntime.ts`.
  `useChatMessageSender`, send preparation, focused tests, docs, folder
  structure, and renderer chat boundary guards now route through the
  app-runtime owners, and the old chat utility paths are deleted. Validation:
  focused desktop chat send payload runtime, desktop chat send state runtime,
  chat message sender, pending-turn live surface integration, renderer chat
  boundary, docs listing, stale old-path scan, frontend lint, and diff checks.
  No migration required; string/object send payload handling, removed singular
  `clipboardImage` rejection, clipboard image/readable-file filtering,
  attachment filename deduping, first-user-message screenshot capture
  decisions, pending-turn payloads, SDK turn resources, IPC payloads, storage,
  credentials, permissions, hosted routes, provider policy, packaging, and
  local execution behavior are unchanged.
- 2026-06-19: completed a renderer current-turn projection-effects
  runtime-boundary slice by moving SDK current-turn cursor side effects from
  `frontend/src/renderer/features/chat/utils/state/currentTurnProjectionSideEffects.ts`
  to
  `frontend/src/renderer/app/runtime/desktopCurrentTurnProjectionEffectsRuntime.ts`
  and by moving stream thinking/compaction labels plus thinking text
  accumulation from chat-stream utilities to
  `frontend/src/renderer/app/runtime/desktopChatStreamThinkingRuntime.ts`,
  with manual compaction command orchestration routed through
  `frontend/src/renderer/app/runtime/desktopManualCompactionRuntime.js`.
  Conversation runtime projection hooks, stream compaction/local-user handlers,
  manual compaction, focused tests, docs, folder structure, and renderer chat
  boundary guards now route through the app-runtime owners, and the old chat
  utility paths are deleted. Validation: focused desktop current-turn
  projection-effects runtime, desktop chat stream thinking runtime, projection
  stream, stream compaction handlers, manual compaction, renderer chat boundary,
  docs listing, stale old-path scan, frontend lint, and diff checks. No
  migration required; current-turn cursor keys, reasoning/assistant delta
  tracking, typing/send-latch clearing, tool-event phase tracking,
  thinking/compaction labels, manual compaction model deferral and compact
  command dispatch, stream-tracking event names, transcript rows, IPC payloads,
  storage, credentials, permissions, hosted routes, provider policy, packaging,
  and local execution behavior are unchanged.
- 2026-06-19: completed a renderer conversation replay runtime-boundary slice
  by moving replay tool-call/tool-output pairing from
  `frontend/src/renderer/features/chat/utils/conversationReplayToolMessages.js`
  to
  `frontend/src/renderer/app/runtime/desktopConversationReplayRuntime.js`.
  Conversation replay actions, focused tests, memory/replay docs, folder
  structure, runtime inventory, and renderer chat boundary guards now route
  through the app-runtime owner, and the old chat utility path is deleted.
  Validation: focused desktop conversation replay runtime, conversation replay
  actions, renderer chat boundary, docs listing, stale old-path scan, frontend
  lint, and diff checks. No migration required; replay context row filtering,
  tool-call/tool-output correlation matching, edit/resend and retry
  preparation, transcript/session payloads, IPC payloads, storage,
  credentials, permissions, hosted routes, provider policy, packaging, and
  local execution behavior are unchanged.
- 2026-06-19: completed a renderer conversation-ref runtime-boundary slice by
  moving the local `conv_${crypto.randomUUID()}` generator from the last
  standalone chat session helper into
  `frontend/src/renderer/app/runtime/desktopConversationSessionRuntime.ts`.
  New-chat, send-preparation, replay, focused tests, docs, folder structure,
  and renderer chat boundary guards now route through the app-runtime owner,
  and the old chat utility path is deleted. Validation: focused conversation
  session runtime, new chat session, chat message sender, conversation replay
  actions, renderer chat boundary, docs listing, stale old-path scan, frontend
  lint, and diff checks. No migration required; conversation-ref prefix/UUID
  format, new-chat reset behavior, send-time conversation selection, replay
  conversation selection, transcript session payloads, IPC payloads, storage,
  credentials, permissions, hosted routes, provider policy, packaging, and
  local execution behavior are unchanged.
- 2026-06-19: completed a renderer composer attachment runtime-boundary slice
  by consolidating data URL parsing, clipboard image normalization, and
  selected-file attachment bucketing from chat feature utilities into
  `frontend/src/renderer/app/runtime/desktopComposerAttachmentRuntime.js`.
  `useChatComposerDraft`, focused tests, docs, folder structure, and renderer
  chat boundary guards now route through the app-runtime owner, and the old
  chat utility paths are deleted. Validation: focused desktop composer
  attachment runtime, message input, renderer chat boundary, docs listing,
  stale old-path scan, frontend lint, and diff checks. No migration required;
  FileReader behavior, base64 data URL parsing, clipboard image payload shape,
  selected image/readable-file bucketing, attachment IDs, preview URLs,
  content-type normalization, IPC payloads, storage, credentials, permissions,
  hosted routes, provider policy, packaging, and local execution behavior are
  unchanged.
- 2026-06-19: completed a renderer transcription-region runtime-boundary slice
  by moving voice transcription append/replace and edit/paste offset
  reconciliation helpers from
  `frontend/src/renderer/features/chat/utils/transcriptionRegions.ts` to
  `frontend/src/renderer/app/runtime/desktopTranscriptionRegionRuntime.ts`.
  `useTranscription`, focused tests, docs, folder structure, and renderer chat
  boundary guards now route through the app-runtime owner, and the old chat
  utility path is deleted. Validation: focused desktop transcription-region
  runtime, transcription hook, renderer chat boundary, docs listing, stale
  old-path scan, frontend lint, and diff checks. No migration required;
  transcription append/replace behavior, input-change and paste offset rules,
  cursor placement, voice gateway payloads, IPC payloads, storage,
  credentials, permissions, hosted routes, provider policy, packaging, and
  local execution behavior are unchanged.
- 2026-06-19: completed a renderer message-list and chat model-options
  runtime-boundary slice by
  moving auto-scroll predicates, conversation-switch scroll targeting, action
  visibility, and compaction status labels from
  `frontend/src/renderer/features/chat/utils/message/messageListState.js` to
  `frontend/src/renderer/app/runtime/desktopMessageListRuntime.js`, and by
  moving chat provider/model/reasoning option projection from
  `frontend/src/renderer/features/chat/utils/chatModelOptions.js` to
  `frontend/src/renderer/app/runtime/desktopChatModelOptionsRuntime.js`.
  MessageList, MessageItem, the auto-scroll hook, chat header surfaces, focused
  tests, docs, and renderer chat/skin boundary guards now route through the
  app-runtime owners, and the old chat utility paths are deleted. Validation:
  focused desktop message-list runtime, desktop chat model options runtime,
  message-list scroll behavior, renderer chat boundary, renderer skin/config
  boundary, docs listing, stale old-path scan, frontend lint, and diff checks.
  No migration required; scroll thresholds, conversation-switch target offset,
  assistant/user action visibility, compaction status metadata,
  provider/model/reasoning option ordering, selected-model fallback behavior,
  IPC payloads, storage, credentials, permissions, hosted routes, provider
  policy, packaging, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer markdown, thread-find, and message-input
  runtime-boundary slice by moving markdown render-model construction from
  `frontend/src/renderer/features/chat/utils/message/markdownMessageRendering.js`
  to `frontend/src/renderer/app/runtime/desktopMarkdownMessageRuntime.js` and
  thread-find projection from
  `frontend/src/renderer/features/chat/utils/message/threadFindState.js` to
  `frontend/src/renderer/app/runtime/desktopThreadFindRuntime.js`, plus
  outgoing message payload normalization from
  `frontend/src/renderer/features/chat/utils/message/messageInput.js` to
  `frontend/src/renderer/app/runtime/desktopMessageInputRuntime.js`.
  MarkdownMessage, ChatInterface, the composer draft hook, focused tests, docs,
  and renderer chat boundary guards now route through the app-runtime owners,
  and the old chat utility paths are deleted. Validation: focused markdown
  message, desktop thread-find runtime, desktop message input runtime, message
  input, renderer chat boundary, docs listing, stale old-path scan, frontend
  lint, and diff checks. No migration required; sanitized markdown output, math
  normalization, highlighted find markup, thread-find match indexing, outgoing
  payload shape, attachment-only fallback text, send lockout behavior, IPC
  payloads, storage, credentials, permissions, hosted routes, provider policy,
  packaging, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer message class and screenshot
  runtime-boundary slice by moving row class assembly from
  `frontend/src/renderer/features/chat/utils/message/messageListClasses.js` to
  `frontend/src/renderer/app/runtime/desktopMessageClassRuntime.js` and
  screenshot attachment descriptor resolution from
  `frontend/src/renderer/features/chat/utils/message/messageScreenshots.js` to
  `frontend/src/renderer/app/runtime/desktopMessageScreenshotRuntime.js`.
  MessageItem, MessageContent, the React screenshot resolver hook, focused
  tests, docs, and renderer chat boundary guards now route through the
  app-runtime owners, while the hook-state artifact image fetch cache remains
  UI-owned. Validation: focused desktop message class runtime, desktop message
  screenshot runtime, message content, renderer chat boundary, docs listing,
  stale old-path scan, frontend lint, and diff checks. No migration required;
  message class names, screenshot attachment normalization, artifact URL
  construction, rendered user/tool image behavior, IPC payloads, storage,
  credentials, permissions, hosted routes, provider policy, packaging, and
  local execution behavior are unchanged.
- 2026-06-19: completed a renderer message transparency runtime-boundary slice
  by moving system prompt, tool-schema, full-user-message, and
  full-assistant-message section descriptor helpers from
  `frontend/src/renderer/features/chat/utils/message/messageTransparency.js`
  into
  `frontend/src/renderer/app/runtime/desktopMessageTransparencyRuntime.js`.
  MessageList, MessageTransparencySections, MinimalResponseOverlay, docs,
  focused tests, and renderer chat boundary guards now route through the
  app-runtime owner, and the old chat message utility path is deleted.
  Validation: focused desktop message transparency runtime, transparency
  sections, renderer chat boundary, docs listing, stale old-path scan, frontend
  lint, and diff checks. No migration required; transparency section order,
  tool-schema normalization, conversation-level schema fallback, dev-UI gating,
  IPC payloads, storage, credentials, permissions, hosted routes, provider
  policy, packaging, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer current-turn presentation
  runtime-boundary slice by moving chat-loop UI state, response-overlay
  awaiting-reply stream-phase predicates, and current-turn chatbox/reply
  projection into `frontend/src/renderer/app/runtime/desktopChatLoopUiRuntime.js`,
  `frontend/src/renderer/app/runtime/desktopStreamPhaseRuntime.js`, and
  `frontend/src/renderer/app/runtime/desktopCurrentTurnPresentationRuntime.js`.
  ChatInterface, current-turn presentation hooks, docs, focused tests, and
  renderer app-runtime boundary guards now route through the app-runtime owners,
  and the old chat feature state paths are deleted. Validation: focused chat
  loop UI, current-turn presentation, visible-reply, stream-phase, renderer
  app-runtime boundary, docs listing, stale old-path scan, frontend lint, and
  diff checks. No migration required; loop-state values, awaiting-dot targeting,
  chatbox surface state, overlay phase predicates, current-turn reply
  visibility, IPC payloads, storage, credentials, permissions, hosted routes,
  provider policy, packaging, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer model-thinking runtime-boundary slice by
  moving selected-model thinking and thinking-text-stream capability resolution
  from `frontend/src/renderer/features/chat/utils/modelThinkingCapabilities.ts`
  into `frontend/src/renderer/app/runtime/desktopModelThinkingRuntime.ts`.
  `useChatStream`, docs, focused tests, and renderer chat boundary guards now
  route through the app-runtime owner, and the old chat feature utility path is
  deleted. Validation: focused model-thinking capability, chat stream wiring,
  renderer chat boundary, docs listing, stale old-path scan, frontend lint, and
  diff checks. No migration required; backend model catalog payloads, thinking
  fallback semantics, stream presentation, IPC payloads, storage, credentials,
  permissions, hosted routes, provider policy, packaging, and local execution
  behavior are unchanged.
- 2026-06-19: completed a renderer stop-turn runtime-boundary slice by moving
  stop-target resolution, terminal current-turn projection, and stop tracking
  patch helpers from the chat feature state folder into
  `frontend/src/renderer/app/runtime/desktopStopTurnRuntime.js`. The stop hook,
  chat store, docs, focused tests, and renderer chat boundary guards now route
  through the app-runtime owner, and the old feature state path is deleted.
  Validation: focused desktop stop-turn runtime, pending stop integration, chat store,
  renderer chat boundary, docs listing, stale old-path scan, frontend lint, and
  diff checks. No migration required; stop target shape, current-turn terminal
  projection, stream tracking terminal patch, SDK stop dispatch, IPC payloads,
  storage, credentials, permissions, hosted routes, provider policy, packaging,
  and local execution behavior are unchanged.
- 2026-06-19: completed a renderer message source-tag runtime-boundary slice by
  moving dev/source tag label resolution from
  `frontend/src/renderer/features/chat/utils/message/sourceTags.js` into
  `frontend/src/renderer/app/runtime/desktopMessageSourceTagRuntime.js`.
  Message source badges, thinking labels, docs, focused tests, and renderer
  chat boundary guards now route through the app-runtime owner, and the old
  chat message utility path is deleted. Validation: focused message source
  badge, thinking display, renderer chat boundary, docs listing, stale old-path
  scan, frontend lint, and diff checks. No migration required; source tag
  labels, dev-UI gating, message token usage tags, thinking display labels,
  IPC payloads, storage, credentials, permissions, hosted routes, provider
  policy, packaging, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer message token-usage runtime-boundary slice
  by moving dev token badge formatting from
  `frontend/src/renderer/features/chat/utils/message/messageTokenUsage.js` into
  `frontend/src/renderer/app/runtime/desktopMessageTokenUsageRuntime.js`.
  Message source badges, docs, focused tests, and renderer chat boundary guards
  now route through the app-runtime owner, and the old chat message utility
  path is deleted. Validation: focused message token usage runtime, message
  source badge, renderer chat boundary, docs listing, stale old-path scan,
  frontend lint, and diff checks. No migration required; provider token usage
  labels, approximate user/tool token estimates, source badge rendering,
  dev-UI gating, IPC payloads, storage, credentials, permissions, hosted
  routes, provider policy, packaging, and local execution behavior are
  unchanged.
- 2026-06-19: completed a renderer tool-output wrapper deletion by removing
  the unused `frontend/src/renderer/features/chat/utils/toolOutputMessages.ts`
  path after current-turn and stream message paths converged on
  `desktopChatMessageRuntimeClient`. Boundary tests now guard that the feature
  wrapper stays deleted. Validation: focused renderer chat runtime boundary
  test, stale import/path scan, docs listing, and diff checks. No migration
  required; tool-output chat message shape, transcript rows, current-turn
  projection, IPC payloads, storage, credentials, permissions, hosted routes,
  provider policy, packaging, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer send-surface/chat-pill runtime-boundary
  slice by moving main-window vs overlay-chatbox send policy into
  `app/runtime/desktopMessageSendUiRuntime.ts` and chat-pill send/view intent
  into `app/runtime/desktopChatPillSessionRuntime.ts`. Chat send hooks,
  desktop send preparation, minimal response overlay view models, tests, docs,
  and boundary guards now route through the app-runtime owners, and the old
  chat feature helper paths are deleted. Validation: focused message-send UI,
  chat-pill session, chat sender, response overlay, renderer app-runtime
  boundary tests, docs listing, stale old-path scan, frontend lint, and diff
  checks. No migration required; sender-surface defaults, screenshot capture
  gating, return-to-chatbox behavior, response overlay view intent, IPC
  payloads, storage, credentials, permissions, hosted routes, provider policy,
  packaging, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer overlay-turn lifecycle resolver boundary
  slice by moving `resolveOverlayTurnLifecycle(...)` plus busy/awaiting helper
  predicates into `app/runtime/desktopOverlayTurnLifecycleRuntime.js` and
  deleting the old chat feature wrapper. Chat loop state, overlay lifecycle
  hooks, tests, and docs now import the app-runtime owner directly. Validation:
  focused overlay lifecycle, chat-loop hook, renderer app-runtime boundary
  tests, docs listing, stale old-path scan, frontend lint, and diff checks. No
  migration required; lifecycle values, phase groups, reconnect watchdog
  behavior, overlay visibility behavior, IPC payloads, storage, credentials,
  permissions, hosted routes, provider policy, packaging, and local execution
  behavior are unchanged.
- 2026-06-19: completed a renderer thread-presentation runtime-boundary slice
  by moving the durable-thread plus SDK live-row presentation pipeline out of
  chat feature utilities and into
  `frontend/src/renderer/app/runtime/desktopThreadPresentationRuntime.js`.
  ChatInterface and integration tests now route through the app-runtime facade,
  and the old chat utility path is deleted and guarded. Validation: focused
  message presentation, pending-turn integration, ChatInterface wiring,
  renderer app-runtime boundary, docs listing, stale old-path scan, and diff
  checks. No migration required; durable transcript rows, SDK current-turn row
  projection, duplicate suppression, insertion order, response overlay
  behavior, IPC payloads, storage, credentials, permissions, hosted routes,
  provider policy, packaging, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer live-turn/current-turn runtime-boundary
  slice by moving SDK current-turn message projection, response closeability,
  thinking-text normalization, and live surface/overlay preflight resolution
  out of chat feature utilities and into renderer app-runtime facades. Chat,
  minimal response overlay, message presentation, docs, and boundary tests now
  route through `desktopCurrentTurnMessageRuntime.js` and
  `desktopLiveTurnSurfaceRuntime.js`; the old chat helper paths are deleted and
  guarded against returning. Validation: focused live-turn surface,
  current-turn message projection, response overlay, chat thinking metadata,
  pending-turn integration, renderer app/chat boundary tests, docs listing,
  stale old-path scan, and diff checks. No migration required; SDK projection
  shape, rendered chat rows, response-overlay closeability, screenshot
  attachment URL resolution, IPC payloads, storage, credentials, permissions,
  hosted routes, provider policy, packaging, and local execution behavior are
  unchanged.
- 2026-06-19: completed a debug trace local-runtime wording slice by retitling
  the JSON-RPC trace route and test-selection labels around local-runtime
  Python ownership instead of a public sidecar trace owner, while preserving
  sidecar stdout/stderr and Python sidecar protocol references as concrete
  process details. Validation: focused modular refactor boundary docs test,
  docs listing, stale public trace-label scan, and diff checks. No migration
  required; docs changed only, with no trace payload, diagnostic path,
  JSON-RPC, IPC, storage, credential, permission, hosted route,
  provider-policy, packaging, or local execution behavior changed.
- 2026-06-19: completed a main local-runtime workflow wording slice by routing
  the main-process change workflow and lifecycle hub language through the SDK
  local-runtime bridge instead of public main-to-sidecar labels, while keeping
  concrete Python sidecar daemon/package references where they identify the
  implementation being debugged. Validation: focused modular refactor boundary
  docs test, docs listing, stale public-label scan, and diff checks. No
  migration required; docs changed only, with no IPC, local-runtime launch,
  JSON-RPC, storage, credential, permission, hosted route, provider-policy,
  packaging, or local execution behavior changed.
- 2026-06-19: completed a renderer dev-UI flag boundary slice by moving
  `isDevUiEnabled()` from chat utilities into
  `app/runtime/desktopDevUiRuntime.js`, routing chat message surfaces and the
  minimal pill through that app-runtime owner, deleting the old chat utility
  path, and guarding against it returning. Validation: focused dev-UI runtime,
  message source badge/actions, transparency sections, chat interface wiring,
  chatbox overlay mouse-ignore, renderer app-runtime boundary, docs listing,
  stale old-path scan, and diff checks. No migration required; `dev_ui=1`
  query flag behavior, memoization, visible controls, IPC payloads, storage,
  credentials, permissions, hosted routes, provider policy, packaging, and local
  execution behavior are unchanged.
- 2026-06-19: completed a renderer response-overlay view contract boundary
  slice by moving `resolveResponseOverlayViewContract` from chat overlay
  utilities into `app/runtime/desktopResponseOverlayViewRuntime.ts`, routing
  chat-pill view intent through that app-runtime owner, deleting the old chat
  utility path, and guarding against it returning. Validation: focused response
  overlay view contract and renderer app-runtime boundary tests, docs listing,
  stale old-path scan, and diff checks. No migration required; view visibility
  decisions, layout-mode values, lifecycle handling, IPC payloads, storage,
  credentials, permissions, hosted routes, provider policy, packaging, and local
  execution behavior are unchanged.
- 2026-06-19: completed a renderer response-overlay lifecycle contract
  boundary slice by moving the renderer turn lifecycle constants and phase
  groups from chat overlay utilities into
  `app/runtime/desktopOverlayTurnLifecycleRuntime.js`, routing chat loop state,
  chat turn presentation, response overlay view contracts, and minimal overlay
  view models through that app-runtime owner, and deleting the old chat utility
  path. Validation: focused overlay lifecycle/state tests, renderer app-runtime
  boundary test, docs listing, stale old-path scan, and diff checks. No
  migration required; lifecycle values, phase groups, SDK projection handling,
  overlay visibility policy, IPC payloads, storage, credentials, permissions,
  hosted routes, provider policy, packaging, and local execution behavior are
  unchanged.
- 2026-06-19: completed a response-overlay runtime-doc routing follow-up by
  adding a `read_when` hint for the new phase and layout app-runtime helpers to
  the overlay utility reference. Validation: docs listing and diff checks. No
  migration required; docs changed only, with no phase, layout, IPC, storage,
  credential, permission, hosted route, provider-policy, packaging, or local
  execution behavior changed.
- 2026-06-19: completed a renderer response-overlay presentation contract
  boundary slice by moving the renderer phase enum/preflight guard facade,
  layout constants, layout-mode resolver, and frame-size helper from chat
  overlay utilities into `app/runtime/desktopResponseOverlayPhaseRuntime.js`
  and `app/runtime/desktopResponseOverlayLayoutRuntime.js`, routing chat stream,
  live-surface state, minimal overlay rendering, and window sync through those
  app-runtime owners, deleting the old chat utility paths, and keeping the
  shared JSON plus main-process IPC phase contract unchanged. Validation:
  focused overlay phase parity/runtime tests, live-turn surface state tests,
  response overlay layout/frame tests, renderer app-runtime boundary test, docs
  listing, stale old-path scan, and diff checks. No migration required; overlay
  phase strings, preflight guard identity, layout constants, frame measurement
  math, IPC payloads, window policy, storage, credentials, permissions, hosted
  routes, provider policy, packaging, and local execution behavior are
  unchanged.
- 2026-06-19: completed a renderer attachment presentation boundary slice by
  moving the shared readable-file type label formatter from chat feature
  utilities into `app/runtime/desktopAttachmentPresentationRuntime.js`, routing
  chat input and minimal pill attachment preview consumers through that
  app-runtime facade, deleting the old chat utility path, and guarding against
  the feature-owned helper returning. Validation: focused attachment
  presentation runtime, renderer app-runtime boundary, renderer chat runtime
  boundary, docs listing, stale old-path scan, and diff checks. No migration
  required; file-label formatting, attachment preview rendering, file picker
  bucketing, outgoing attachment payloads, IPC channels, storage, credentials,
  permissions, hosted routes, provider policy, packaging, and local execution
  behavior are unchanged.
- 2026-06-19: extended the renderer chatbox layout boundary by moving minimal
  pill drag-state, movement-threshold, target-coordinate, and close-bump helpers
  into `app/runtime/desktopChatboxLayoutRuntime.js`, routing the pill and
  focused layout tests through that app-runtime owner, deleting the old minimal
  pill utility path, and guarding against feature-owned layout helpers
  returning. Validation: focused chatbox layout runtime, minimal chat pill
  boundary, renderer app-runtime boundary, docs listing, stale old-path scan,
  and diff checks. No migration required; visual-anchor constants,
  measured-shell height math, drag threshold, target-coordinate math, chatbox
  IPC payloads, window sizing behavior, storage, credentials, permissions,
  hosted routes, provider policy, packaging, and local execution behavior are
  unchanged.
- 2026-06-19: completed a renderer permission grant-effects boundary slice by
  moving shared post-grant config side effects from permission feature
  utilities into `app/runtime/desktopPermissionGrantEffectsRuntime.js`, routing
  onboarding and browser settings through that app-runtime owner, deleting the
  old permission utility path, and guarding against the feature-owned helper
  returning. Validation: focused permission grant effects, onboarding
  permission actions, browser settings, renderer app-runtime boundary, docs
  listing, stale old-path scan, and diff checks. No migration required; the
  `browser_automation_enabled` config field, permission status payloads,
  config update payloads, IPC channels, storage, credentials, permissions,
  hosted routes, provider policy, packaging, and local execution behavior are
  unchanged.
- 2026-06-19: completed a renderer active chat-session reset boundary slice by
  moving `resetActiveChatSession` from chat feature utilities into
  `app/runtime/desktopActiveChatSessionRuntime.ts`, routing chat new-session
  and dashboard delete/clear consumers through that app-runtime owner, deleting
  the old chat utility path, and guarding against dashboard importing chat
  reset helpers again. Validation: focused active-session reset, new-chat,
  dashboard conversation, renderer app-runtime boundary, docs listing, stale
  old-path scan, and diff checks. No migration required; conversation refs,
  transcript-session payloads, chat-store setter behavior, local runtime
  conversation storage, IPC channels, storage, credentials, permissions,
  hosted routes, provider policy, packaging, and local execution behavior are
  unchanged.
- 2026-06-19: completed a voice gateway audio-send runtime facade slice by
  routing `useVoiceMode` framed-audio sends through
  `DesktopVoiceRuntimeClient.sendTranscriptionAudioMessage(...)` instead of
  calling the raw WebSocket directly from the feature hook. Validation: focused
  voice runtime boundary tests, voice mode hook tests, voice audio encoding
  tests, docs listing, exact raw-send scan, and diff checks. No migration
  required; renderer helper ownership, docs, and tests changed only, with no
  websocket URL resolution, gateway payload byte, language/start-over payload,
  transcription event, microphone capture, wakeword IPC, credential,
  permission, hosted route, provider policy, storage, packaging, or local
  execution behavior changed.
- 2026-06-19: completed a renderer model-selection app-runtime facade slice by
  moving shared model selection reconciliation and config patch shaping from
  dashboard utilities into
  `frontend/src/renderer/app/runtime/desktopModelSelectionRuntime.js`, routing
  chat and dashboard consumers through that facade, removing the dashboard
  utility module, and updating renderer docs/guards to keep the deleted
  dashboard utility path from returning. Validation: focused model-selection
  utility tests, renderer chat runtime boundary guard, modular boundary guard,
  docs listing, exact stale path scan, and diff checks. No migration required;
  renderer helper ownership, docs, and tests changed only, with no selected
  model config key, update-settings payload, model catalog data, provider key
  handling, backend validation, IPC channel, storage, credential, permission,
  hosted route, provider policy, packaging, or local execution behavior changed.
- 2026-06-19: completed an install packaging local-runtime Python label slice
  by routing docs hub, frontend architecture packaged-install copy, install
  troubleshooting, and packaging reinstall runbook labels away from sidecar
  runtime packaging wording and through bundled local-runtime Python packaging,
  bundled local-runtime Python build, missing bundled local-runtime Python,
  packaged local-runtime Python, and Python sidecar implementation-source
  wording. Validation: focused modular boundary guard, docs listing, exact
  stale label scan, and diff checks. No migration required; docs and boundary
  tests changed only, with no package command name, build script, bundled
  runtime path, Electron Builder config, reinstall behavior, endpoint setting,
  IPC channel, storage, credential, permission, hosted route, provider policy,
  or local execution behavior changed.
- 2026-06-19: completed a root README local-runtime Python route-label slice by
  routing the root README docs table away from Sidecar Docs, Python sidecar
  runtime, sidecar runtime packaging, and client/sidecar/API labels and through
  Local-Runtime Python Docs, Python implementation behind local-runtime
  behavior, bundled local-runtime Python packaging, and local-runtime Python
  implementation API wording. Validation: focused modular boundary guard, docs
  listing, exact stale label scan, and diff checks. No migration required;
  README copy and boundary tests changed only, with no API surface, packaging
  command, bundled runtime build name, endpoint setting, IPC channel, storage,
  credential, permission, hosted route, provider policy, or local execution
  behavior changed.
- 2026-06-19: completed a JSON-RPC local-runtime method-label slice by routing
  frontend IPC, inventory, channel, and local-runtime JSON-RPC docs away from
  sidecar method labels and through local-runtime RPC or Python JSON-RPC
  method/handler wording while preserving concrete
  `LocalRuntimeService._initialize_methods` implementation breadcrumbs.
  Validation: focused modular boundary guard, docs listing, exact stale label
  scan, and diff checks. No migration required; docs and boundary tests changed
  only, with no JSON-RPC method name, handler registration, IPC channel, payload
  shape, storage, credential, permission, hosted route, provider policy,
  packaging, or local execution behavior changed.
- 2026-06-19: completed an architecture/browser local-runtime route label slice
  by routing docs hub architecture routes, browser extension ADR current
  behavior, safety boundaries, and the doctor checklist away from sidecar
  runtime/adapter/protocol labels and through local execution, local-runtime
  SQLite, local-runtime Python maps, Python JSON-RPC registration,
  local-runtime browser execution/schema/stack, local-runtime execution, and
  bundled local-runtime Python wording. Validation: focused modular boundary
  guard, docs listing, exact stale label scan, and diff checks. No migration
  required; docs and boundary tests changed only, with no browser extension mode
  implementation, browser action schema, safety policy, packaged runtime path,
  JSON-RPC method, IPC channel, storage, credential, permission, hosted route,
  provider policy, packaging, or local execution behavior changed.
- 2026-06-19: completed an install explicit-backend-origin troubleshooting
  label slice by routing install troubleshooting and endpoint setup away from
  local-backend-mode wording and through explicit local backend origin wording.
  Validation: focused modular boundary guard, docs listing, exact stale label
  scan, and diff checks. No migration required; install docs and boundary tests
  changed only, with no endpoint env var name, backend default, websocket URL,
  local-runtime env propagation, credential, permission, hosted route, provider
  policy, packaging, storage, or local execution behavior changed.
- 2026-06-19: completed a tool-validation local-runtime owner-label slice by
  routing backend browser/computer validation docs and the frontend capability
  matrix away from sidecar runtime enforcement/implementation ownership and
  through local-runtime browser enforcement, local-runtime execution, and
  Python implementation behind local-runtime RPC wording. Validation: focused
  modular boundary guard, docs listing, exact stale label scan, and diff checks.
  No migration required; docs and boundary tests changed only, with no
  browser/computer schema, parser validation, local tool execution, JSON-RPC
  method, IPC channel, storage, credential, permission, hosted route, provider
  policy, packaging, or local execution behavior changed.
- 2026-06-19: completed a settings/filesystem local-runtime path label slice by
  routing settings reset and filesystem/shell workflow labels away from sidecar
  method/path/tool wording and through local-runtime method, local runtime
  delete, local-runtime shell tool, local-runtime path handling, and
  IPC/backend/local-runtime path wording. Validation: focused modular boundary
  guard, docs listing, exact stale label scan, and diff checks. No migration
  required; settings/filesystem docs and boundary tests changed only, with no
  settings payload, memory reset behavior, filesystem/shell execution, JSON-RPC
  method, IPC channel, storage, credential, permission, hosted route, provider
  policy, packaging, or local execution behavior changed.
- 2026-06-19: completed a help hub local-runtime first-question slice by
  routing the high-entry failure-runtime list away from sidecar as a peer public
  runtime and through local runtime wording while preserving the concrete Python
  sidecar daemon JSON-RPC readiness check. Validation: focused modular boundary
  guard, docs listing, exact stale label scan, and diff checks. No migration
  required; help docs and boundary tests changed only, with no diagnostic
  command, JSON-RPC readiness check, IPC channel, storage, credential,
  permission, hosted route, provider policy, packaging, or local execution
  behavior changed.
- 2026-06-19: completed a browser help local-runtime triage label slice by
  routing the help triage browser-failure row and browser troubleshooting
  heading away from sidecar browser logs/sidecar-does-nothing labels and
  through local-runtime browser adapter/runtime wording. Validation: focused
  modular boundary guard, docs listing, exact stale label scan, and diff checks.
  No migration required; help/browser docs and boundary tests changed only, with
  no browser action payload, browser runtime behavior, JSON-RPC method, IPC
  channel, storage, credential, permission, hosted route, provider policy,
  packaging, or local execution behavior changed.
- 2026-06-19: completed a backend tool-result handler local-runtime comment
  slice by replacing the remaining SDK sidecar path wording in
  `backend/src/api/handlers/tool_result.py` with SDK local-runtime ownership and
  tightening the backend guardrail. Validation: focused backend tool-result
  receiver coverage, docs listing, exact stale sidecar-path scan, Python compile
  check, and diff checks. No migration required; websocket event names,
  tool-result payloads, session routing, history writes, storage, credentials,
  permissions, hosted routes, provider policy, packaging, and local execution
  behavior are unchanged.
- 2026-06-19: completed a root README local-runtime public label slice by
  routing the product table and docs table away from desktop-sidecar execution,
  SDK/sidecar runtime, sidecar ownership, and sidecar tool-execution labels and
  through SDK local runtime, local-runtime contracts, local-runtime ownership,
  and local-runtime tool execution. Validation: focused modular boundary guard,
  docs listing, exact stale label scan, and diff checks. No migration required;
  root README copy and boundary tests changed only, with no SDK API, local tool
  execution, sidecar process setup, tool schema, IPC channel, credential,
  permission, hosted route, provider policy, packaging, backend schema, or
  storage behavior changed.
- 2026-06-19: completed a renderer voice source-topology gateway slice by
  routing the voice mode section in `frontend/src/renderer/folder_structure.md`
  through the desktop voice runtime gateway facade instead of a direct backend
  websocket label. Validation: focused renderer voice boundary coverage, docs
  listing, exact stale direct-backend voice topology scan, and diff checks. No
  migration required; gateway URL shape, websocket protocol, AudioWorklet
  capture, wakeword IPC, credential, permission, hosted route, provider policy,
  packaging, storage, and local execution behavior are unchanged.
- 2026-06-19: completed a renderer appearance-defaults skin config slice by
  moving the default light/dark palette out of generic config storage into the
  WindieOS renderer skin config, re-exporting it through `desktopRuntimeConfig`,
  and routing storage/theme consumers through that facade. Validation: focused
  renderer skin/config and config-storage tests, docs listing, exact
  stale-import/palette scan, and diff checks. No migration required; persisted
  `appearance_theme` shape, localStorage key, IPC/settings payloads, credentials,
  permissions, hosted routes, provider policy, packaging, and local execution
  behavior are unchanged.
- 2026-06-19: completed a getting-started local-runtime overview label slice by
  routing the project overview and FAQ away from sidecar boundary/storage/
  JSON-RPC execution labels and through local-runtime boundary, storage, and
  execution wording. Validation: focused modular boundary guard, docs listing,
  exact stale label scan, and diff checks. No migration required; entry docs
  and boundary tests changed only, with no memory storage, tool dispatch,
  JSON-RPC method, IPC channel, credential, permission, hosted route, provider
  policy, packaging, backend schema, or local execution behavior changed.
- 2026-06-19: completed a help diagnostics local-runtime troubleshooting label
  slice by routing local tool and browser failure guidance away from sidecar
  JSON-RPC/action compatibility labels and through SDK/main local-runtime
  dispatch plus local-runtime browser adapter/runtime wording. Validation:
  focused modular boundary guard, docs listing, exact stale label scan, and
  diff checks. No migration required; help docs and boundary tests changed
  only, with no tool schema, browser action payload, JSON-RPC method, IPC
  channel, storage, credential, permission, hosted route, provider policy,
  packaging, or local execution behavior changed.
- 2026-06-19: completed an install endpoint local backend origin label slice by
  routing endpoint setup and local development docs away from sidecar
  propagation wording and a Local Backend public section label toward explicit
  local backend origin plus local-runtime backend URL propagation wording.
  Validation: focused modular boundary guard, docs listing, exact stale label
  scan, and diff checks. No migration required; install docs and boundary tests
  changed only, with no endpoint env var name, backend default, websocket URL,
  local-runtime env propagation, credential, permission, hosted route, provider
  policy, packaging, storage, or local execution behavior changed.
- 2026-06-19: completed a renderer source topology local-runtime execution
  label slice by renaming the tool execution diagram stage in
  `frontend/src/renderer/folder_structure.md` from Sidecar execution to
  local-runtime execution while keeping the Python sidecar daemon as concrete
  executor implementation evidence. Validation: focused modular boundary guard,
  exact source topology stale label scan, docs listing, and diff checks. No
  migration required; source topology docs and boundary tests changed only, with
  no renderer projection behavior, SDK tool dispatch, JSON-RPC method, IPC
  channel, storage, credential, permission, hosted route, provider policy,
  packaging, or local execution behavior changed.
- 2026-06-19: completed a development routing local-runtime hub label slice by
  routing contributor-facing local-runtime implementation links and the
  development hub summary away from Local Runtime Sidecar public labels while
  preserving concrete Python sidecar paths and sidecar validation commands as
  implementation evidence. Validation: focused modular boundary guard, docs
  listing, exact stale label scan, and diff checks. No migration required; docs
  and boundary tests changed only, with no contributor-routing behavior,
  JSON-RPC behavior, local tool execution, wakeword service, hosted helper
  client, IPC channel, credential, permission, provider policy, packaging, or
  storage behavior changed.
- 2026-06-19: completed a frontend inventory local-runtime Python file-count
  label slice by routing inventory hub, runtime matrix, functionality
  inventory, and module-index service/count labels away from sidecar public
  wording while preserving concrete `frontend/src/main/python` paths as
  implementation evidence. Validation: focused modular boundary guard, docs
  listing, exact stale label scan, and diff checks. No migration required;
  inventory-only docs changed, with no code path, JSON-RPC method, IPC channel,
  storage, credential, permission, hosted route, provider policy, packaging, or
  local execution behavior changed.
- 2026-06-19: completed a frontend capability matrix local-runtime bridge label
  slice by routing the Main IPC/Backend Relay bridge section and scoped
  host-bridge row away from Sidecar Bridge public wording while preserving
  concrete Python sidecar and main/sidecar implementation paths as evidence.
  Validation: focused modular boundary guard, docs listing, exact stale label
  scan, and diff checks. No migration required; inventory-only docs changed,
  with no code path, JSON-RPC method, IPC channel, storage, credential,
  permission, hosted route, provider policy, packaging, or local execution
  behavior changed.
- 2026-06-19: completed a frontend inventory local-runtime Python label slice
  by routing active inventory section titles and hosted helper-client rows
  away from Local Runtime Sidecar public wording while keeping concrete Python
  sidecar paths visible as implementation evidence. Validation: focused
  modular boundary guard, docs listing, exact stale label scan, and diff
  checks. No migration required; inventory-only docs changed, with no code
  path, JSON-RPC method, IPC channel, storage, credential, permission, hosted
  route, provider policy, packaging, or local execution behavior changed.
- 2026-06-19: completed a frontend transcript-store inventory label slice by
  routing the IPC/local-runtime contract touchpoint inventory through
  Local-runtime transcript store methods instead of a Sidecar transcript store
  owner label. Concrete renderer store/client and Python handler paths remain
  visible as implementation evidence. Validation: focused modular boundary
  guard, docs listing, exact stale label scan, and diff checks. No migration
  required; transcript row storage, renderer projection behavior, SDK command
  routing, IPC channels, JSON-RPC methods, credentials, permissions, hosted
  backend URLs, provider policy, and local execution behavior are unchanged.
- 2026-06-19: completed a public frontend/code-surface navigation label slice
  by routing the top-level frontend hub label through Main/Renderer/Contracts/
  Local-Runtime wording and the local-runtime process row through the
  Local-Runtime Python Implementation Change Workflow label instead of sidecar
  public navigation names. Sidecar daemon symptoms and Python implementation
  paths remain explicit where they identify concrete process evidence.
  Validation: focused modular boundary guard, docs listing, exact stale
  navigation-label scan, and diff checks. No migration required; no IPC
  channel, JSON-RPC method, process lifecycle behavior, storage, credential,
  permission, hosted route, provider policy, packaging, or local execution
  behavior changed.
- 2026-06-19: completed a main host shortcut boundary slice by moving the
  primary wakeword/chat-pill hotkey map into the WindieOS main host skin and
  having the generic Electron composition root consume the configured
  platform/default accelerator. The lifecycle runtime still owns fallback
  registration behavior. Validation: focused main host skin boundary coverage,
  lifecycle hotkey behavior coverage, docs listing, exact source scan, and diff
  checks. No migration required; shortcut values, fallback order, IPC channels,
  permissions, storage, credentials, local-runtime launch, hosted backend URLs,
  provider policy, and packaging behavior are unchanged.
- 2026-06-19: completed a renderer voice/audio wakeword bridge label slice by
  routing renderer voice and audio related-page links through Electron
  Wakeword Bridge wording instead of Local Runtime Sidecar Wakeword public
  navigation labels. Python wakeword service implementation details remain
  explicit where the concrete subprocess matters. Validation: focused modular
  boundary guard, docs listing, exact stale wakeword bridge label scan, and
  diff checks. No migration required; no IPC channel, wakeword framing,
  microphone capture, subprocess lifecycle, storage, credential, permission,
  hosted route, provider policy, packaging, or local execution behavior
  changed.
- 2026-06-19: completed a code-surface local tool hub label slice by routing
  code-change surface local tool links through Local-Runtime Tools Docs Hub
  wording instead of Local Runtime Sidecar Tools Hub public navigation labels.
  Python sidecar implementation paths remain explicit where they identify the
  concrete executor code. Validation: focused modular boundary guard, docs
  listing, exact stale code-surface local tool hub label scan, and diff checks.
  No migration required; no tool name, schema, manifest, IPC channel, JSON-RPC
  method, storage, credential, permission, hosted route, provider policy,
  packaging, or local execution behavior changed.
- 2026-06-19: completed a frontend IPC/summarizer local-runtime label slice by
  routing first-read IPC contract-touchpoint and semantic summarizer labels
  through Local-Runtime wording instead of sidecar public navigation names.
  Python sidecar JSON-RPC method details remain explicit where the concrete
  implementation matters. Validation: focused modular boundary guard, docs
  listing, exact stale frontend IPC/summarizer label scan, and diff checks. No
  migration required; no IPC channel, JSON-RPC method, memory summarizer
  behavior, storage, credential, permission, hosted route, provider policy,
  packaging, or local execution behavior changed.
- 2026-06-19: completed an implementation-hub/core/services/source-map
  local-runtime label slice by routing first-read Python implementation hub,
  core, services, service-protocol, source-map, JSON-RPC, lifecycle, and
  helper-runtime labels through Local-Runtime wording instead of Sidecar or
  Local Runtime Sidecar public navigation names. Python sidecar code scopes,
  wakeword service scripts, and sidecar tests remain as concrete
  implementation evidence. Validation: focused modular boundary guard, docs
  listing, exact stale implementation-hub/core/services/source-map label scan,
  and diff checks. No migration required; no process lifecycle behavior,
  JSON-RPC method, IPC channel, wakeword framing, storage, credential,
  permission, hosted route, provider policy, packaging, or local execution
  behavior changed.
- 2026-06-19: completed a system-state hub local-runtime label slice by routing
  first-read `get-system-state` and platform-adapter labels through
  Local-Runtime System-State wording instead of Sidecar System-State public
  navigation names. Python sidecar code scopes and sidecar tests remain as
  concrete implementation evidence. Validation: focused modular boundary
  guard, docs listing, exact stale system-state label scan, and diff checks. No
  migration required; no JSON-RPC method, IPC channel, platform probe, local
  tool behavior, storage, credential, permission, hosted route, provider policy,
  packaging, or local execution behavior changed.
- 2026-06-19: completed a tool-family hub local-runtime label slice by routing
  first-read browser, computer, system, filesystem, shell, and tool-catalog
  labels through Local-Runtime wording instead of Sidecar or Local Runtime
  Sidecar public navigation names. Python sidecar file paths, code scopes, and
  sidecar tests remain as concrete implementation evidence. Validation: focused
  modular boundary guard, docs listing, exact stale tool-family hub label scan,
  and diff checks. No migration required; no tool name, schema, manifest,
  registry code, IPC channel, JSON-RPC method, storage, credential, permission,
  hosted route, provider policy, packaging, or local execution behavior changed.
- 2026-06-19: tightened the renderer app-provider transport boundary by adding
  a guard over all `app/providers` modules so providers cannot import desktop
  IPC bridges, channel constants, `window.ipc`, `window.agentSdk`, or SDK
  command bridge helpers directly. Provider composition must keep transport
  access behind app-runtime clients. Validation: focused renderer app-runtime
  boundary test, direct provider source scan, and diff checks. No migration
  required; no runtime code, payload, IPC channel, storage, settings,
  credential, permission, hosted route, provider policy, packaging, or local
  execution behavior changed.
- 2026-06-19: tightened the renderer backend-wire import boundary by broadening
  the renderer app/feature guard from the deleted `types/backendEvents` module
  and one subscription shape to backend-event contracts, normalizers, unwrap
  helpers, and legacy `from-backend` channels. Renderer feature code must keep
  consuming SDK conversation events and app-runtime projections instead.
  Validation: focused renderer chat-runtime boundary test, direct source scan,
  and diff checks. No migration required; no runtime code, payload, websocket
  event, IPC channel, storage, settings, credential, permission, hosted route,
  provider policy, packaging, or local execution behavior changed.
- 2026-06-19: tightened the renderer app-runtime import boundary by broadening
  the feature-module guard from direct `AppConfigContext` imports to direct
  `app/providers/*`, app config/status/chat contexts, and provider component
  imports. Renderer features must keep reading provider-owned state through
  app-runtime facades. Validation: focused renderer app-runtime boundary test
  and diff checks. No migration required; no runtime code, payload, IPC
  channel, storage, settings, credential, permission, hosted route, provider
  policy, packaging, or local execution behavior changed.
- 2026-06-19: completed a tool-registry hub local-runtime label slice by
  renaming first-read registry hub labels and the Python sidecar implementation
  overview heading to local-runtime tool-registry wording, and routing backend
  parity failure labels through local-runtime execution. Python sidecar module
  paths and sidecar tests remain as concrete implementation evidence.
  Validation: focused modular boundary guard, docs listing, exact stale
  registry-hub/parity label scan, and diff checks. No migration required; no
  tool name, schema, manifest, registry code, IPC channel, JSON-RPC method,
  storage, credential, permission, hosted route, provider policy, packaging, or
  local execution behavior changed.
- 2026-06-19: completed a workflow-route local-runtime label slice by
  renaming the visible sidecar tool workflow to `Local-Runtime Tool Change
  Workflow`, renaming the sidecar runtime workflow to
  `Local-Runtime Python Implementation Change Workflow`, and updating active
  backend, browser, frontend, getting-started, operations, security, and tool
  workflow links/registry labels plus first-read docs navigation labels while
  keeping file paths stable. Validation: focused modular boundary guard, docs
  listing, exact stale workflow-label scan, and diff checks. No migration
  required; no tool name, schema,
  manifest, IPC channel, JSON-RPC method, runtime code, storage, credential,
  permission, hosted route, provider policy, packaging, or local execution
  behavior changed.
- 2026-06-19: completed a debug-routing local-runtime failure-label slice by
  updating error and symptom playbooks so local-runtime JSON-RPC/process
  failures route to local-runtime lifecycle docs, tool result failures route to
  local-runtime registry/result docs, and tool-execution symptoms describe
  local-runtime tool registration backed by the Python sidecar registry instead
  of a peer sidecar registry owner. Validation: focused modular boundary guard,
  docs listing, exact stale debug-label scan, and diff checks. No migration
  required; no error envelope, ToolResult payload, IPC channel, JSON-RPC
  method, storage, credential, permission, hosted route, provider policy,
  packaging, or local execution behavior changed.
- 2026-06-18: completed a tool-workflow link-label local-runtime slice by
  routing active tool troubleshooting, schema-policy, filesystem/shell workflow,
  and extension docs through local-runtime tool, local-runtime registry/result,
  and local-runtime computer implementation wording instead of Sidecar
  Tool/Runtime/Registry link labels and sidecar tools-doc route text. Python
  sidecar paths and pytest references remain where they identify concrete
  implementation evidence. Validation: `bin\windie.cmd test frontend --
  ModularRefactorCompletionBoundary --runInBand`, `bin\windie.cmd docs list`,
  exact stale tool-workflow link-label scan, and `git diff --check`. No
  migration required; no tool name, schema, manifest, registry, IPC channel,
  JSON-RPC method, runtime code, storage, credential, permission, hosted route,
  provider policy, packaging, or local execution behavior changed.
- 2026-06-19: completed a code-surface owner-label cleanup by routing local
  runtime readiness and packaged-runtime rows through SDK/local-runtime
  lifecycle and local-runtime sidecar bundling wording instead of presenting
  sidecar daemon/runtime as the public owner. Sidecar daemon failure symptoms,
  Python sidecar paths, and sidecar tests remain as concrete debugging
  evidence. Validation: focused modular boundary guard, docs listing, stale
  label scan, and diff checks. No migration required; no code path, payload,
  IPC, settings, storage, local execution, credentials, permissions, hosted
  URLs, packaging behavior, or provider policy changed.
- 2026-06-19: completed an SDK transport compatibility cleanup by removing the
  legacy `BackendTransport` TypeScript alias from the SDK conversation type
  surface and routing SDK docs/tests to the canonical `AgentRuntimeTransport`
  boundary. This deletes one stale backend-named public type without changing
  websocket behavior, payloads, IPC, settings, storage, local-runtime
  execution, credentials, permissions, hosted URLs, or provider policy. No
  migration is required for runtime state; TypeScript SDK callers should import
  `AgentRuntimeTransport` directly.
- 2026-06-18: completed a runtime-guide local-runtime tool-label slice by
  routing runtime node, computer screenshot, memory/data-pipeline, validation,
  install, tool lifecycle, and code-surface guides through local-runtime tool,
  local-runtime implementation, local-runtime screenshot/input, and
  local-runtime executable wording instead of sidecar tool/channel/runtime
  public routing labels. Python sidecar file paths, sidecar pytest commands,
  packaged runtime commands, and implementation rows remain where they identify
  concrete evidence. Validation: `bin\windie.cmd test frontend --
  ModularRefactorCompletionBoundary --runInBand`, `bin\windie.cmd docs list`,
  exact stale runtime-guide label scan, and `git diff --check`. No migration
  required; no CLI command, conda env, install flow, IPC channel, JSON-RPC
  method, tool schema, manifest, registry, runtime code, storage, credential,
  permission, hosted route, provider policy, packaging, or local execution
  behavior changed.
- 2026-06-18: completed an active hub/matrix local-runtime label slice by
  routing CLI validation env labels, install decision rows, the development
  boundary matrix, frontend full inventory, and the IPC pre-commit checklist
  through frontend/local-runtime or main/renderer/local-runtime wording instead
  of frontend/sidecar or main/renderer/sidecar route labels. Validation:
  `bin\windie.cmd test frontend -- ModularRefactorCompletionBoundary
  --runInBand`, `bin\windie.cmd docs list`, exact stale active hub/matrix label
  scan, and `git diff --check`. No migration required; no CLI command, conda
  env, install flow, IPC channel, runtime code, storage, tool schema,
  credential, permission, hosted route, provider policy, packaging, or local
  execution behavior changed.
- 2026-06-18: completed an inventory tool-owner local-runtime label slice by
  routing SDK route, architecture/debug/development references, frontend
  inventory, domain playbook, node, plugin, and tool lifecycle docs through
  Electron/local-runtime tool paths,
  local-runtime executable schemas, local-runtime tool registries, and
  local-runtime tool implementation wording. Python sidecar pytest and
  implementation-file references remain where they identify evidence. The
  modular boundary guard now rejects retired sidecar tool path/schema/registry/
  module labels across those docs. Validation: `bin\windie.cmd test frontend
  -- ModularRefactorCompletionBoundary --runInBand`, `bin\windie.cmd docs
  list`, exact stale inventory/tool owner-label scan, and `git diff --check`.
  No migration required; no SDK route, IPC channel, JSON-RPC method, tool
  schema, manifest, registry, test command, credential, permission, hosted
  route, provider policy, storage, packaging, or local execution behavior
  changed.
- 2026-06-18: completed a CLI/mobile planning local-runtime capability label
  slice by routing future CLI UI-control actions, CLI action tests, mobile V1
  parity, mobile capability negotiation, and mobile connection acceptance
  criteria through local-runtime tool/capability wording instead of sidecar
  runtime, registry, or assumption labels. The modular boundary guard now reads
  the CLI plan and rejects the retired planning phrases. Validation:
  `bin\windie.cmd test frontend -- ModularRefactorCompletionBoundary
  --runInBand`, `bin\windie.cmd docs list`, exact stale planning
  sidecar-runtime/assumption label scan, and `git diff --check`. No migration
  required; no runtime code, tool schema, manifest, backend route, mobile API,
  CLI command, IPC, credential, permission, storage, provider policy, or local
  execution behavior changed.
- 2026-06-18: completed a frontend/planning/reference boundary-label slice by
  routing active frontend inventory, IPC, JSON-RPC workflow, renderer-state
  workflow, CLI/mobile planning, session/transcript, and docs-structure
  reference wording through renderer/main/local-runtime boundaries instead of
  the old sidecar-as-boundary and sidecar-control wording. Python sidecar
  remains visible only where the text names implementation methods. Validation:
  `bin\windie.cmd test frontend -- ModularRefactorCompletionBoundary
  --runInBand`, `bin\windie.cmd docs list`, exact stale frontend/planning/
  reference sidecar-boundary phrase scan, and `git diff --check`. No migration
  required; no IPC channel, JSON-RPC method, transcript identifier, runtime
  code, storage, tool schema, credential, permission, hosted route, provider
  policy, packaging, or local execution behavior changed.
- 2026-06-18: completed an extension/tool parity local-runtime label slice by
  routing tool-system helper rewrite text, extension authoring rules, plugin
  surface validation, and CLI validation commands through local-runtime
  executable argument/parity wording instead of sidecar executable/parity
  ownership. Python sidecar registry and sidecar pytest references remain where
  they identify implementation evidence. The modular boundary guard now rejects
  retired sidecar executable/parity/argument labels. Validation:
  `bin\windie.cmd test frontend --
  ModularRefactorCompletionBoundary --runInBand`, `bin\windie.cmd docs list`,
  exact stale extension/tool parity label scan, and `git diff --check`. No
  migration required; no runtime code, plugin manifest, `argument_resolution`,
  tool schema, executable manifest, registry loading, IPC, credential,
  permission, hosted route, provider policy, or local execution behavior
  changed.
- 2026-06-18: completed a docs-directory and agent-routing quick-card
  owner-label slice by routing first-read runtime/security summaries,
  model-visible tool parity guidance, local screenshot/memory/capability/
  credential/wakeword/packaging cards, and local-runtime process wording through
  local-runtime boundary labels instead of sidecar-as-public-owner wording.
  The guard now rejects the retired sidecar boundary/parity/argument phrases
  while preserving Python sidecar implementation and test references where they
  identify concrete code. Validation: `bin\windie.cmd test frontend --
  ModularRefactorCompletionBoundary --runInBand`, `bin\windie.cmd docs list`,
  exact stale sidecar boundary/parity/argument phrase scan, and
  `git diff --check`. No migration required; no trust-boundary behavior, auth,
  IPC, credential, permission, tool schema, executable payload, storage, hosted
  route, provider policy, packaging, or local execution behavior changed.
- 2026-06-18: completed a Python sidecar architecture local-runtime label
  slice by routing the sidecar architecture page, local-runtime Python
  implementation docs hub, daemon reference, routing quick cards, docs
  directory, and tool-catalog overview through local-runtime
  executable/implementation wording. The concrete Python sidecar daemon,
  registry, memory, hosted-helper client, packaging, and pytest references
  remain visible where they identify implementation evidence. The
  modular boundary guard now rejects retired executable sidecar manifest,
  sidecar-runtime ownership, sidecar tool-catalog, and sidecar-registry
  contract phrases. Validation: `bin\windie.cmd test frontend --
  ModularRefactorCompletionBoundary --runInBand`, `bin\windie.cmd docs list`,
  exact stale sidecar architecture label scan, and `git diff --check`. No
  migration required; no runtime code, JSON-RPC method, daemon endpoint,
  executable manifest, tool payload/result, memory path, packaging path,
  credential, permission, hosted backend URL, provider policy, or local
  execution behavior changed.
- 2026-06-18: completed a security trust-boundary owner-label slice by routing
  the security boundary matrix, security change playbook, docs hub, and docs
  entrypoint through local-runtime trust-boundary wording instead of sidecar as
  the public security boundary. Python sidecar implementation references remain
  where they identify concrete executor code. Validation: `bin\windie.cmd test
  frontend -- ModularRefactorCompletionBoundary --runInBand`,
  `bin\windie.cmd docs list`, exact stale security trust-boundary label scan,
  and `git diff --check`. No migration required; no trust-boundary behavior,
  auth, IPC, credential, permission, tool schema, executable payload, storage,
  hosted route, provider policy, or local execution behavior changed.
- 2026-06-18: completed a tool catalog local-runtime executable label slice by
  routing first-read frontend/docs hub entries, frontend architecture runtime
  notes, ADR/debug/development/plugin workflows, channel/tool-system summaries,
  the tools hub, tool catalog matrix, schema-policy workflow, filesystem/shell
  workflow, and troubleshooting docs through local-runtime executable ownership
  instead of Python-sidecar-as-owner labels. Python sidecar paths, registry
  details, packaging notes, and sidecar tests remain where they identify the
  concrete implementation. The modular docs guard now rejects the retired
  Python sidecar executable owner, executor, registry/runtime, and first-read
  frontend sidecar runtime phrases. Validation: `bin\windie.cmd test frontend
  -- ModularRefactorCompletionBoundary --runInBand`, `bin\windie.cmd docs
  list`, exact stale tool-owner label scan, and `git diff --check`. No
  migration required; no tool name, schema, manifest, IPC, JSON-RPC, parity
  test, credential, permission, storage, hosted route, provider policy,
  packaging, or local execution behavior changed.
- 2026-06-18: completed a public runtime route-map label slice by routing
  architecture overview, communication flow, runtime node matrix, backend
  cross-layer inventory, operations triage, main-process workflows, and
  workspace debugging docs through local-runtime implementation/tool wording
  instead of local-sidecar or sidecar-owner public labels. Python sidecar and
  sidecar JSON-RPC references remain where they name the concrete
  implementation process, protocol, or tests. The modular docs guard now
  rejects the retired public route-map labels for local sidecar calls,
  sidecar-owned triage, sidecar local runtime rows, and sidecar tool runtime
  ownership. Validation: `bin\windie.cmd test frontend --
  ModularRefactorCompletionBoundary --runInBand`, `bin\windie.cmd docs list`,
  exact stale route-map label scan, and `git diff --check`. No migration
  required; no process launch, IPC, JSON-RPC, tool schema, parity test,
  permission, credential, storage, hosted route, provider policy, or local
  execution behavior changed.
- 2026-06-18: completed a tool-contract parity owner-label slice by routing
  tool contracts, schema-policy workflow, prompt-context workflow, and backend
  cross-layer contract inventory through local-runtime executable parity/schema
  labels instead of sidecar parity or sidecar schema ownership wording. Python
  sidecar paths, registry names, and implementation tests remain visible where
  they identify concrete executable code. Validation: `bin\windie.cmd test
  frontend -- ModularRefactorCompletionBoundary --runInBand`,
  `bin\windie.cmd docs list`, exact stale tool-contract parity label scan, and
  `git diff --check`. No migration required; no tool schema, prompt
  construction, provider projection, SDK/main dispatch, IPC, payload,
  credential, permission, storage, or local execution behavior changed.
- 2026-06-18: completed an architecture local-runtime owner-map slice by
  routing failure-domain, runtime-boundary, architecture hub, error/failure,
  platform, help/docs hubs, and tool-system docs through local-runtime
  implementation/tool labels instead of sidecar process/tool/schema owner
  labels. Python sidecar paths and implementation docs remain where they
  identify concrete code. The modular docs guard now rejects retired
  architecture owner labels for sidecar process, sidecar tool registry/schema,
  sidecar platform adapter, and Python-sidecar-as-boundary rows. Validation:
  `bin\windie.cmd test frontend -- ModularRefactorCompletionBoundary
  --runInBand`, `bin\windie.cmd docs list`, exact stale architecture
  owner-label scan, and `git diff --check`. No migration required; no process
  launch, IPC, JSON-RPC, tool schema, parity test, permission, credential,
  storage, hosted route, provider policy, or local execution behavior changed.
- 2026-06-18: completed a first-read runtime/security owner-label slice by
  routing the conceptual runtime model and security hub through local-runtime
  execution, local-runtime remote-client auth, and local-runtime executable tool
  labels instead of sidecar-as-owner wording. Python sidecar remains visible as
  the current implementation process and test/code path where concrete evidence
  matters. The modular docs guard now reads the runtime model and security hub
  and rejects retired sidecar local-execution, sidecar local-work routing,
  sidecar remote-client auth, and sidecar auth-header phrases. Validation:
  `bin\windie.cmd test frontend -- ModularRefactorCompletionBoundary
  --runInBand`, `bin\windie.cmd docs list`, exact stale first-read
  runtime/security label scan, and `git diff --check`. No migration required;
  no code path, payload, storage, IPC, settings, env var name, tool schema,
  credential source, auth header, permission, hosted URL, provider-policy,
  local execution, or endpoint behavior changed.
- 2026-06-18: completed a public local-tool label slice by routing the docs
  hub, agent-loop concept doc, response overlay guide, provider extension guide,
  and agent-development workflow through local-runtime tool wording instead of
  sidecar-tool owner labels. Python sidecar daemon/executor wording remains in
  implementation-specific docs. The modular docs guard now rejects the retired
  first-read sidecar-tool route labels. Validation: focused modular docs
  boundary test, docs listing, exact stale public local-tool label scan, and
  diff checks. No migration required; no tool execution path, IPC name,
  overlay preview behavior, provider routing, extension contract, payload,
  schema, credential, permission, storage, or local execution behavior changed.
- 2026-06-18: completed a channel local-tool label slice by routing channel
  hub and local-tool channel docs through local-runtime tool/channel wording
  instead of sidecar-tool owner labels. Python sidecar daemon and executor
  references remain where they name the implementation. The modular docs guard
  now rejects retired sidecar-tool channel read_when, IPC-facing, failure-row,
  validation, and cross-link title phrases. Validation: `bin\windie.cmd test
  frontend -- ModularRefactorCompletionBoundary --runInBand`,
  `bin\windie.cmd docs list`, exact stale channel-label scan, and
  `git diff --check`. No migration required; no channel path, IPC name,
  SDK/main routing, daemon endpoint, payload, tool schema, tool-result ingress,
  renderer projection, credential, permission, storage, or local execution
  behavior changed.
- 2026-06-18: completed an operations/settings env-label slice by routing
  settings-sync, operations hub, endpoint debugging, and operational
  troubleshooting docs through local-runtime implementation/env owner labels
  instead of sidecar env/runtime wording. Python sidecar files, sidecar startup
  tests, and bundled sidecar runtime packaging terms remain where they name the
  current implementation artifact. The modular docs guard now rejects the
  retired settings/operations sidecar env, sidecar endpoint-injection, and
  sidecar/Electron bridge owner phrases. Validation: `bin\windie.cmd test
  frontend -- ModularRefactorCompletionBoundary --runInBand`,
  `bin\windie.cmd docs list`, exact stale settings/operations label scan, and
  `git diff --check`. No migration required; no env var name, launch option,
  endpoint resolution, storage, IPC, settings payload, credential, hosted URL
  policy, provider policy, permission, packaging artifact, or local execution
  behavior changed.
- 2026-06-18: completed an endpoint/auth/data-flow owner-label slice by routing
  the docs entrypoint, data-flow state ownership map, and credential-token
  workflow through local-runtime endpoint env, remote-client auth, transcript,
  memory, permission, and executable local tool owner labels instead of
  sidecar-as-public-owner wording. Concrete Python sidecar client base paths,
  sidecar remote-client tests, and sidecar implementation notes remain visible
  where they describe the current implementation. The modular docs guard now
  rejects retired sidecar endpoint-env, URL-drift, remote-client auth,
  data-flow state owner, and sidecar parity/client hub labels. Validation:
  `bin\windie.cmd test frontend -- ModularRefactorCompletionBoundary
  --runInBand`, `bin\windie.cmd docs list`, exact stale
  endpoint/auth/data-flow label scan, and `git diff --check`. No migration
  required; no code path, payload, storage, IPC, settings, env var name, tool
  schema, credential source, permission, hosted URL, provider-policy, auth
  header, token persistence, local execution, transcript, memory, or endpoint
  behavior changed.
- 2026-06-18: completed a configuration owner-label slice by routing the
  configuration reference, runtime configuration matrix, configuration change
  workflow, and observability workflow through local-runtime implementation/env
  labels instead of sidecar-as-owner config wording. Concrete Python sidecar
  paths, compatibility env aliases, sidecar tests, and bundled sidecar runtime
  packaging references remain visible where they describe the implementation
  process or artifact. The modular inventory/docs guard now rejects retired
  sidecar config owner rows, sidecar env rows, sidecar endpoint-policy wording,
  sidecar runtime-reader wording, and sidecar observability owner labels.
  Validation: `bin\windie.cmd test frontend -- ModularRefactorCompletionBoundary
  --runInBand`, `bin\windie.cmd docs list`, exact stale config-label scan, and
  `git diff --check`. No migration required; no code path, payload, storage,
  IPC, settings, env var name, tool schema, credential, permission, hosted URL,
  provider-policy, launch option, logging, metrics, or local execution behavior
  changed.
- 2026-06-18: completed a troubleshooting/debug tool-label slice by routing
  getting-started tool permission guidance, error/failure tool-result rows,
  failure-boundary result rules, and frontend inventory tool-domain notes
  through local-runtime tool wording instead of sidecar-as-owner labels.
  Concrete Python sidecar paths and sidecar tool tests remain visible as
  implementation evidence. The modular inventory/docs guard now rejects the
  retired sidecar permission-gate, tool-result failure, result-return,
  sidecar runtime/tool-domain, and sidecar tool-catalog phrases. Validation:
  focused modular docs boundary test, docs listing, exact stale
  troubleshooting/debug/inventory label scan, and diff checks. No migration
  required; no code path, payload, storage, IPC, settings, tool schema,
  credential, permission, hosted URL, provider-policy, result normalization,
  tool catalog, or local execution behavior changed.
- 2026-06-18: completed a development tool-doc owner-label slice by routing
  the contributing edit map, tool development runtime ownership list,
  built-in handler registration heading, result-contract heading, and
  filesystem/shell result-shape rule through local-runtime tool implementation
  wording instead of sidecar-as-owner labels. Concrete Python sidecar paths and
  sidecar stderr/test references remain visible as implementation evidence.
  The modular tool/security docs guard now rejects the retired sidecar tools,
  registry, manifest export, extension loader, handler registration, result
  contract, and failure-heading phrases. Validation: focused modular docs
  boundary test, docs listing, exact stale development/tool label scan, and
  diff checks. No migration required; no code path, payload, storage, IPC,
  settings, tool schema, credential, permission, hosted URL, provider-policy,
  registry loading, plugin entrypoint, shell/filesystem, or local execution
  behavior changed.
- 2026-06-18: completed a security hub trust-boundary label slice by renaming
  the `Sidecar runtime` security area to `Local runtime implementation` while
  keeping the Python sidecar implementation and sidecar docs links visible as
  concrete evidence. The modular tool/security docs guard now rejects the
  retired `| Sidecar runtime |` row label. Validation: focused modular docs
  boundary test, docs listing, exact stale security-row scan, and diff checks.
  No migration required; no code path, payload, storage, IPC, settings,
  tool schema, credential, permission, hosted URL, provider-policy, JSON-RPC,
  local execution, subprocess, browser, filesystem, shell, or computer-use
  behavior changed.
- 2026-06-18: completed a filesystem/shell tool docs owner-label slice by
  routing shell execution, path utilities, shell formatter/session registry,
  and filesystem reader workflow labels through local-runtime tool
  implementation wording instead of sidecar shell/filesystem owner labels. The
  modular tool-routing guard now rejects the retired sidecar tool, shell, and
  filesystem labels. Validation: focused modular docs boundary test, docs
  listing, exact stale filesystem/shell owner-label scan, and diff checks. No
  migration required; no code path, payload, storage, IPC, settings, tool
  schema, credential, permission, hosted URL, provider-policy, shell process,
  path resolution, sudo prompt, file read, or replace behavior changed.
- 2026-06-18: completed a local-runtime JSON-RPC boundary-rule owner-label
  slice by changing the JSON-RPC workflow to name local runtime as the owner of
  method registration, handler signatures, validation, tool dispatch, memory,
  system-state, and utility-call boundaries while keeping Python sidecar as the
  current handler implementation. The modular stale guard now rejects the
  retired `Python sidecar owns method registration` wording. Validation:
  focused modular docs boundary test, docs listing, exact stale JSON-RPC owner
  phrase scan, and diff checks. No migration required; no code path, payload,
  storage, IPC, settings, tool schema, credential, permission, hosted URL,
  provider-policy, JSON-RPC protocol, handler signature, memory, system-state,
  or tool-dispatch behavior changed.
- 2026-06-18: completed a sidecar docs owner-label slice by updating the
  sidecar workflow, daemon runtime reference, Python source-map reference,
  cross-layer contract tables, filesystem/shell tool table, backend tool-turn
  workflow, and Python sidecar architecture endpoint list so executable tools,
  browser automation, memory, wakeword, daemon `/tools`, MCP exposure, topology,
  and owner-table wording use local-runtime implementation labels instead of
  sidecar-owned public ownership labels. Validation: focused modular docs
  boundary test, docs listing, exact stale sidecar owner-label scan, and diff
  checks. No migration required; no code path, payload, storage, IPC, settings,
  tool schema, credential, permission, hosted URL, provider-policy, daemon
  discovery, MCP execution, wakeword, browser, memory, or local tool behavior
  changed.
- 2026-06-18: completed a desktop wakeword main-file label follow-up by naming
  `frontend/src/main/python/wakeword_service.py` as the local-runtime wakeword
  service implementation instead of a sidecar-owned service in the desktop
  voice guide. The voice routing docs guard now blocks the retired
  `Sidecar wakeword service:` label. Validation: focused modular docs boundary
  test, exact stale wakeword main-file label scan, and diff checks. No
  migration required; no code path, payload, storage, IPC, settings, tool
  schema, credential, permission, hosted URL, provider-policy, wakeword
  protocol, microphone capture, or TTS behavior changed.
- 2026-06-18: completed a renderer settings owner-label slice by routing
  settings debug ownership and config filtering docs through renderer,
  Electron main, backend, or local-runtime boundaries instead of sidecar-owned
  settings/config-field labels. The modular inventory-doc stale guard now
  rejects the retired sidecar-owned settings launch/env and config-field
  phrases. Validation: focused modular docs boundary test, docs listing, exact
  stale settings phrase scan, and diff checks. No migration required; no code
  path, payload, storage, IPC, settings schema, tool schema, credential,
  permission, hosted URL, provider-policy, local-runtime launch behavior, or
  Python sidecar JSON-RPC behavior changed.
- 2026-06-18: completed a desktop wakeword label follow-up by naming
  `frontend/src/main/python/wakeword_service.py` as the local-runtime wakeword
  service implementation instead of a sidecar-owned service surface. The voice
  routing docs guard now rejects the stale "Sidecar wakeword service" label.
  Validation: focused modular docs boundary test, docs listing, exact stale
  wakeword-service phrase scan, and diff checks. No migration required; no code
  path, payload, storage, IPC, settings, tool schema, credential, permission,
  hosted URL, provider-policy, wakeword audio framing, or Python service
  bootstrap behavior changed.
- 2026-06-18: completed a frontend runtime inventory owner-label slice by
  updating the runtime surface matrix, frontend domain ownership matrix,
  frontend change-path playbook, debug workflow, and security boundary matrix
  so Python service/tool rows use local-runtime service and implementation
  labels instead of sidecar-as-owner phase names. The modular stale-mention
  guard now blocks retired sidecar local-runtime, sidecar wakeword service,
  sidecar request dispatch, sidecar tool execution, sidecar schema parity, and
  sidecar browser adapter labels. Validation: focused modular docs boundary
  test, docs listing, exact stale inventory phrase scan, and diff checks. No
  migration required; no code path, payload, storage, IPC, settings, tool
  schema, credential, permission, hosted URL, provider-policy, wakeword,
  browser, or local tool execution behavior changed.
- 2026-06-18: completed a frontend browser/local-runtime wording slice by
  updating the sidecar implementation catalog and adjacent browser sidecar docs
  so JSON-RPC hosting, remote semantic clients, and browser adapters are
  described through local-runtime ownership while Python sidecar remains the
  concrete implementation surface. The modular stale-mention guard now rejects
  the retired local-sidecar JSON-RPC host, sidecar remote-client, and
  sidecar-owned browser adapter phrases. Validation: focused modular docs
  boundary test, docs listing, exact stale inventory/browser phrase scan, and
  diff checks. No migration required; no code path, payload, storage, IPC,
  settings, tool schema, credential, permission, hosted URL, provider-policy,
  browser session, or Browser Use behavior changed.
- 2026-06-18: completed an MCP local-runtime owner-label slice by updating the
  runtime trace playbook and MCP runtime guide so `mcp.discovery`,
  `mcp.registration`, and `mcp.execution` use local-runtime MCP ownership labels
  instead of sidecar-owned diagnostics or SDK/sidecar local-runtime flow
  wording. The modular docs stale-mention guard now rejects the retired MCP
  sidecar-owned and sidecar-routes-tool-call phrases. Validation: focused
  modular docs boundary test, docs listing, exact stale MCP-owner phrase scan,
  and diff checks. No migration required; no code path, payload, storage, IPC,
  settings, tool schema, credential, permission, hosted URL, provider-policy,
  MCP process, or raw MCP result preservation behavior changed.
- 2026-06-18: completed a voice/wakeword ownership wording slice by routing
  public wakeword model/protocol ownership through the local-runtime wakeword
  helper while keeping the Python sidecar wakeword service visible as the
  current concrete implementation. The modular docs boundary guard now covers
  the new local-runtime helper wording and blocks the retired Python
  sidecar-as-owner wakeword phrase. Validation: focused modular docs boundary
  test, docs listing, exact stale wakeword-owner phrase scan, and diff checks.
  No migration required; no code path, payload, storage, IPC, settings, tool
  schema, credential, permission, hosted URL, provider-policy, or microphone
  capture behavior changed.
- 2026-06-18: completed a hosted helper client wording slice by updating
  `docs/architecture/python_sidecar.md` and
  `docs/providers/inference_capability_change_workflow.md` so semantic/helper
  backend calls are described as local-runtime hosted helper services consumed
  by local-runtime remote clients, not sidecar-owned hosted helper services.
  The modular docs guard now rejects the retired sidecar-owned helper wording.
  Validation: focused modular docs boundary test, docs listing, exact stale
  phrase scan, and diff checks. No migration required; no code path, payload,
  storage, IPC, settings, tool schema, credential, permission, hosted URL, or
  provider-policy behavior changed.
- 2026-06-18: completed a channel routing matrix ownership label slice by
  updating `docs/channels/channel_routing_matrix.md` so local tool channels and
  payload groups use local-runtime tool and local-runtime implementation labels
  while preserving Python sidecar daemon details in the concrete transport path.
  The modular docs boundary guard now reads the matrix and blocks the retired
  `Local sidecar tool` and `Python sidecar-owned payloads` labels. Validation:
  focused modular docs boundary test, docs listing, exact stale-label scan, and
  diff checks. No migration required; no code path, payload, storage, IPC,
  settings, tool schema, credential, permission, hosted URL, or provider-policy
  behavior changed.
- 2026-06-18: completed a filesystem/platform local-authority wording slice by
  routing the filesystem/shell workflow, window/input matrix, platform change
  workflow, and agent architecture reference through local-runtime authority
  while keeping Python sidecar implementation details explicit. The modular
  stale-mention guard now catches Python-sidecar-as-owner variants for local
  execution, host-window discovery, host OS automation, and local authority.
  Validation: focused modular docs boundary test, docs listing, exact stale
  phrase scan, and diff checks. No migration required; no code path, payload,
  storage, IPC, settings, tool schema, credential, permission, hosted URL, or
  provider-policy behavior changed.
- 2026-06-18: completed a first-read local tool authority wording slice by
  updating `docs/getting-started/docs_hub.md`,
  `docs/frontend/sidecar_tool_change_workflow.md`, and
  `docs/tools/tool_schema_policy_change_workflow.md` so local-runtime
  executable authority owns what can run locally while Python sidecar remains
  the concrete implementation. The modular docs boundary guard now covers the
  new first-read/schema workflow owner phrases and the retired Python
  sidecar-as-owner phrases. Validation: focused modular docs boundary test,
  docs listing, exact stale-owner phrase scan, and diff checks. No migration
  required; no code path, payload, storage, IPC, settings, tool schema,
  credential, permission, hosted URL, or provider-policy behavior changed.
- 2026-06-18: completed a frontend architecture SDK transport wording slice by
  replacing the remaining active `BackendTransport` interface reference with
  `AgentRuntimeTransport` and guarding the architecture overview from
  presenting the compatibility alias as the live desktop adapter boundary.
  Validation: focused SDK package-boundary test, docs listing, source scan, and
  diff checks. No migration required; no code path, payload, storage, IPC,
  settings, tool schema, credential, permission, hosted backend URL, or
  provider-policy behavior changed.
- 2026-06-18: completed a tool-execution ownership wording slice by updating
  `docs/tools/tool_execution_lifecycle.md`, `docs/tools/computer.md`, and
  `docs/channels/sidecar_and_tool_channels.md` so public tool routing says the
  local runtime owns executable desktop/local machine action authority while
  the Python sidecar remains the concrete executor implementation. The modular
  docs boundary guard now covers the new owner wording and the retired
  sidecar-as-owner phrases. Validation: focused modular docs boundary test,
  docs listing, exact stale-owner phrase scan, and diff checks. No migration
  required; no code path, payload, storage, IPC, settings, tool schema,
  credential, permission, hosted URL, or provider-policy behavior changed.
- 2026-06-18: completed a browser docs guard follow-up by extending the modular
  boundary test to read top-level docs, backend tools hubs, the getting-started
  hub, and the tools hub when checking browser schema parity labels. This keeps
  the newly aligned backend/local-runtime browser navigation wording covered
  instead of relying on the deeper browser references alone. Validation:
  focused modular docs boundary test, docs listing, exact stale-label scan, and
  diff checks. No migration required; no runtime behavior, schema, IPC,
  credential, permission, storage, hosted URL, or provider-policy behavior
  changed.
- 2026-06-18: completed a browser docs navigation follow-up by replacing
  backend-sidecar browser parity labels in top-level docs hubs, backend browser
  hubs, tools docs, and local-runtime sidecar browser references with
  backend/local-runtime schema parity wording. Validation: modular docs
  boundary test, docs listing, exact stale-label scan, and diff checks. No
  migration required; browser schema, action validation, local-runtime
  execution, IPC, credentials, permissions, storage, hosted URLs, and provider
  policy are unchanged.
- 2026-06-18: completed a browser shared-contract wording slice by updating
  `backend/src/tools/browser/shared_contract_loader.py`, backend/browser docs,
  browser workflow docs, tool docs, and boundary tests so shared browser schema
  validation is described as backend/local-runtime parity rather than a
  backend-sidecar contract. Python sidecar Browser Use adapters remain named as
  the concrete implementation. Validation: focused backend loader test,
  modular docs boundary test, docs listing, stale wording scan, and diff
  checks. No migration required; browser action names, schema exports, payload
  shapes, tool execution, IPC, credentials, permissions, storage, hosted URLs,
  and provider policy are unchanged.
- 2026-06-18: completed a development-routing wording slice by updating
  `docs/development/README.md`, `docs/development/test_failure_triage.md`, and
  `docs/getting-started/docs_hub.md` to route schema drift guidance through
  local-runtime executable args/results while keeping Python sidecar tests as
  implementation parity evidence. This removes sidecar-runtime wording from
  contributor-facing rules without hiding the concrete sidecar validation path.
  Validation: focused modular docs boundary test, docs listing, source scan,
  and diff checks. No migration required; no code path, payload, storage, IPC,
  settings, tool schema, credential, permission, or provider-policy behavior
  changed.
- 2026-06-18: completed a data-flow ownership wording slice by updating
  `docs/architecture/data_flow_and_state_ownership.md` so the query flow says
  the SDK tool coordinator dispatches local tool calls to local-runtime
  execution and the Python sidecar implementation returns results. This keeps
  the public architecture trace aligned with the SDK/local-runtime owner while
  preserving concrete sidecar implementation visibility. Validation: focused
  modular docs boundary test, docs listing, source scan, and diff checks. No
  migration required; no code path, payload, storage, IPC, settings, tool
  schema, credential, permission, or provider-policy behavior changed.
- 2026-06-18: completed an agent-runtime ownership routing slice by aligning
  `docs/development/agent_runtime_ownership_and_change_routing.md` with the
  browser workflow's local-runtime browser execution plus Python sidecar adapter
  wording. The guide no longer presents sidecar runtime as a peer public owner
  for browser automation while still pointing to concrete Python sidecar tests
  in the browser workflow. Validation: focused modular docs boundary test, docs
  listing, source scan, and diff checks. No migration required; no code path,
  payload, storage, IPC, settings, tool schema, credential, permission, or
  provider-policy behavior changed.
- 2026-06-18: completed a browser workflow owner-label slice by routing
  `docs/browser/browser_change_workflow.md` and adjacent browser hub summaries
  through local-runtime browser execution plus Python sidecar Browser Use
  adapters, instead of presenting the sidecar runtime as a peer public owner.
  Concrete Python sidecar validation/action tests remain visible where they
  debug implementation behavior. Validation: focused modular docs boundary
  test, docs listing, source scan, and diff checks. No migration required; no
  code path, payload, storage, IPC, settings, tool schema, credential,
  permission, or provider-policy behavior changed.
- 2026-06-18: completed the renderer app-runtime inventory slice by adding a
  classification table to
  `docs/frontend/renderer/desktop_runtime_transport_command_contract_reference.md`.
  The inventory separates real SDK-command boundaries, desktop-host adapters,
  state/rule facades, presentation helpers, forwarding helpers with current
  boundary value, and removed migration shims so future cleanup can delete only
  one proven obsolete path at a time. Validation: focused renderer
  app-runtime boundary test, docs listing, diff checks, and docs-search probe.
  No migration required; renderer behavior, IPC channels, SDK command names,
  settings, storage, credentials, permissions, and provider policy are
  unchanged.
- 2026-06-18: completed the first debuggable trace slice by adding a
  one-message runtime trace playbook to `docs/debug/runtime_traces.md`. The
  playbook preserves the recent ownership direction by routing renderer action,
  Electron main handoff, SDK dispatch/projection, backend stream/provider
  policy, local-runtime tool execution, and renderer display through existing
  sanitized diagnostics instead of adding a parallel debug surface. Validation:
  focused docs-index routing test, docs listing, diff checks, and exact route
  scans. No migration required; no payload, storage, IPC, settings, tool
  schema, credential, permission, or provider-policy behavior changed.
- 2026-06-18: completed a focused main-as-SDK-host ownership wording slice by
  naming query/settings connection-gate state and failure logs as Agent SDK
  runtime readiness. The helpers still use the existing backend connection gate
  because the SDK-managed backend runtime remains the underlying transport, but
  local state, failure logs, and query-relay debug docs now describe the Agent
  SDK runtime owner instead of making Electron main read as the backend
  connection authority. Validation: focused main SDK runtime boundary and
  settings-sync runtime tests, docs listing, diff checks, and exact source scan.
  No migration required; no payload, storage, IPC, settings, tool schema,
  credential, permission, or provider-policy behavior changed.
- 2026-06-18: completed a focused SDK runtime-boundary type slice by making
  `AgentRuntimeTransport` the canonical conversation-runtime injection type in
  SDK internals and behavior tests while retaining `BackendTransport` as a
  TypeScript compatibility alias. This keeps reusable host adapters aligned
  with the Agent SDK runtime contract without changing websocket behavior,
  payloads, storage, or public runtime commands. Validation: focused SDK
  package-boundary and conversation-runtime Jest coverage plus docs listing
  and source scans. No runtime or storage migration required.
- 2026-06-18: completed an SDK/backend local-runtime wording slice by replacing
  the remaining "Sidecar owns durable rows" SDK continuity split with
  local-runtime persistence ownership plus an explicit Python sidecar backing
  implementation note, and by routing backend local-runtime tool bridge wording
  through SDK/main dispatch plus Python sidecar adapters. Validation: focused
  modular docs boundary test, docs listing, source scan, and diff checks. No
  migration required; no code path, payload, storage, IPC, settings, tool
  schema, credential, permission, or provider-policy behavior changed.
- 2026-06-18: completed a renderer app-runtime audio boundary slice by moving
  `audio-chunk` envelope validation from chat feature utilities into
  `DesktopAudioRuntimeClient`. Chat bindings now consume normalized audio
  chunks from the app-runtime facade, while the typed channel and payload shape
  remain unchanged. Validation: focused audio parser, chat wiring, and renderer
  app-runtime boundary Jest coverage plus docs listing, source scan, and diff
  checks. No migration required.
- 2026-06-18: completed a browser-tool public wording slice by routing
  `docs/tools/browser.md` and the tools hub through local-runtime execution and
  Python sidecar adapter/executor terminology instead of unqualified
  sidecar-runtime ownership. This preserves the recent local-runtime naming
  direction while still keeping concrete Python sidecar implementation paths
  visible for debugging. Validation: focused modular docs boundary test, docs
  listing, source scan, and diff checks. No migration required; no code path,
  payload, storage, IPC, settings, tool schema, credential, permission, or
  provider-policy behavior changed.
- 2026-06-20: completed an SDK/main runtime label cleanup by routing tool
  lifecycle, channel, backend tool-turn, renderer overlay/capture, startup,
  packaging, and SDK conversation docs through explicit SDK/main local-runtime
  dispatch, Python sidecar implementation, Electron main window/overlay
  ownership, local-runtime startup, and backend-wire compatibility handlers.
  Validation: focused modular docs boundary test, exact stale phrase scan, docs
  listing, and diff checks. No migration required; no runtime code, SDK export,
  IPC payload, local-runtime execution, storage, credential, permission, hosted
  URL, or provider-policy behavior changed.
- 2026-06-20: completed a tool entrypoint/backend-config contract wording slice
  by routing ADR 005, extension entrypoint, and local-runtime backend-config docs
  through local-runtime dispatch, Python implementation wording, and
  local-runtime remote requests instead of sidecar-owned execution/request
  labels. Validation: focused modular docs boundary test, exact stale phrase
  scan, docs listing, and diff checks. No migration required; no runtime code,
  extension manifest field, entrypoint argument, backend URL, env precedence,
  storage, credential, permission, hosted URL, or provider-policy behavior
  changed.
- 2026-06-18: completed the browser workflow hub-routing follow-up by aligning
  Browser Change Workflow links in the docs hub, browser hub, and getting-started
  hub with local-runtime execution and Python sidecar adapter wording. The
  deeper browser workflow still names Python sidecar runtime details where
  concrete handler/action tests are the subject. Validation: focused modular
  docs boundary test, docs listing, source scan, and diff checks. No migration
  required; no code path, payload, storage, IPC, settings, tool schema,
  credential, permission, or provider-policy behavior changed.
- 2026-06-18: plan created after reviewing `AGENTS.md`, runtime ownership docs,
  the existing general runtime-boundary plan, and recent commits around
  local-runtime naming, renderer app-runtime facades, SDK runtime helper
  naming, and endpoint/config boundary cleanup.
- 2026-06-20: completed a backend tool-registry parity wording slice by routing
  backend registry hub/reference labels through backend/local-runtime
  exposed-tool parity and describing backend-declared built-ins as local-runtime
  executable requirements instead of backend client-executable names.
  Validation: focused modular docs boundary test, exact stale phrase scan, docs
  listing, and diff checks. No migration required; no runtime code, tool name,
  schema, client manifest, IPC payload, storage, credential, permission, hosted
  URL, or provider-policy behavior changed.
