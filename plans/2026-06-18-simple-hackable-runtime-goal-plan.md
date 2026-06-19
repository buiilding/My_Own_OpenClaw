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
