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
