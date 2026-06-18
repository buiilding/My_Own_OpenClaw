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
