---
summary: "Realtime execution report for the product-wide architecture cleanup campaign."
read_when:
  - When reviewing implementation status for the product-wide architecture cleanup campaign.
  - When continuing the approved product-wide cleanup after context compaction or a partial implementation slice.
title: "Product-Wide Architecture Cleanup Report"
---

# Product-Wide Architecture Cleanup Report

Plan: [Product-Wide Architecture Cleanup Plan](2026-06-05-product-wide-architecture-cleanup-plan.md)

## Status

Implementation started after user approval. Phase 1 local-backend bridge
ownership cleanup has completed four focused slices: launch planning, stderr
transport, process exit/error events, and shutdown/stop control.

## Orientation Log

- `git status --short --branch`: `main` is ahead of `origin/main` by the local
  Windows cleanup commit and the merge commit from pulling `origin/main`.
- `./bin/docs-list`: passed after the previous Windows cleanup slice and again
  after writing the product-wide plan.
- Updated `AGENTS.md` was reread after pull. New compaction-safe plan execution
  requirements are active: keep this report current, inspect live code before
  each slice, validate, perform a fresh design-inspection pass, and continue or
  record blockers/deferred findings explicitly.

## Inspection Passes

### Pass 0: Startup

Findings:

- The approved plan file exists but is not committed yet.
- The matching report file was created for realtime tracking.
- The first implementation target is Electron main/local-backend bridge
  ownership because prior refactor docs identify it as the largest remaining
  source-owned item.

Next action:

- Read current local-backend bridge docs, recent commits, and adjacent tests
  before editing code.

### Pass 1: Local Backend Startup/Stderr Ownership

Findings:

- `local_backend_bridge.cjs` still owned sidecar launch-target validation,
  packaged/source env assembly, Windows/Unix packaged Python differences, and
  Python stderr filtering inline.
- The bridge integration tests encoded Unix-only packaged runtime assumptions
  (`bin/python3`, `PYTHONHOME`, `PYTHONNOUSERSITE`) that failed on Windows.

Action:

- Extracted launch validation/env construction into
  `local_backend_launch_plan.cjs`.
- Extracted stderr forwarding into `local_backend_stderr_transport.cjs`.
- Normalized touched runtime-path tests so Windows separators and packaged
  Python layout are first-class instead of treated as fallback failures.

### Pass 2: Local Backend Process Event Ownership

Findings:

- `local_backend_bridge.cjs` still owned child-process `exit` and `error`
  policy inline, including stale-process guards, reset reasons, user-facing
  `ENOENT` text, and unavailable-status emission.
- The bridge now composes focused transports, so process-event policy can be
  isolated without changing public behavior.

Action:

- Extracted exit/error handling into `local_backend_process_events.cjs`.
- Added direct process-event unit coverage for non-zero exit, clean exit, stale
  event suppression, Python `ENOENT`, binary `ENOENT`, and attach wiring.
- Renamed the active standalone JSON-RPC transport dependency from
  `legacyTransport` to `standaloneTransport`; this is a terminology cleanup
  only, because the standalone process path remains a supported runtime mode.

### Pass 3: Post-Validation Design Check

Findings:

- No inline `pythonProcess.on(...)`, stderr filtering, sidecar launch-target
  validation, or packaged Python env construction remains in
  `local_backend_bridge.cjs`.
- `local_backend_bridge.cjs` shrank from 559 lines at `HEAD` to 471 lines in
  the working tree after the focused extraction.
- Remaining bridge work in this phase is now daemon lifecycle/stop behavior and
  sidecar method/host-channel composition. These are still in scope for the
  product-wide campaign, but they are separate slices.
- The worktree contains concurrent SDK/memory invalidation changes and generated
  SDK `cjs` output not made by this cleanup slice. They are intentionally not
  staged for this commit.

### Pass 4: Stop/Shutdown Ownership

Findings:

- `stopLocalBackend()` still owned stopped-tool behavior, daemon shutdown,
  daemon runtime clearing, standalone `SIGTERM`, and stale-guarded force-kill
  timing inline.
- The behavior is lifecycle policy, not IPC registration or bridge composition.

Action:

- Extracted shutdown policy into `local_backend_stop_controller.cjs`.
- Added direct stop-controller tests for stopped tool execution, daemon
  shutdown/reset, standalone `SIGTERM`, stale force-kill suppression, and
  still-active `SIGKILL`.
- Updated local-backend docs and changelog to name the stop controller as the
  shutdown owner.

## Inventory And Classification

- Delete/isolate now:
  - Inline local-backend launch validation/env construction in the bridge.
  - Inline local-backend stderr filtering in the bridge.
  - Inline local-backend process exit/error policy in the bridge.
  - Inline local-backend daemon shutdown and standalone force-kill policy in the
    bridge.
  - Misleading `legacyTransport` terminology for the active standalone sidecar
    JSON-RPC path.
- Keep with owner:
  - Standalone sidecar JSON-RPC transport remains supported through
    `local_backend_bridge_request_transport.cjs`.
  - Daemon-backed sidecar JSON-RPC transport remains supported through
    `sidecar_daemon_manager.cjs` and
    `local_backend_bridge_rpc_transport.cjs`.
- Defer with deletion/consolidation condition:
  - Renderer/SDK memory invalidation changes are present in the worktree from a
    separate concurrent task; do not classify or stage them under this cleanup
    report until that task is intentionally folded into this plan.

## Implementation Notes

- Created `frontend/src/main/local_backend_launch_plan.cjs` as the startup
  source of truth for sidecar command, args, cwd, stdio, env, missing Python
  guidance, missing script guidance, and Windows/Unix packaged Python behavior.
- Created `frontend/src/main/local_backend_stderr_transport.cjs` as the stderr
  filtering/forwarding source of truth.
- Created `frontend/src/main/local_backend_process_events.cjs` as the process
  exit/error source of truth.
- Created `frontend/src/main/local_backend_stop_controller.cjs` as the daemon
  shutdown and standalone process stop/force-kill source of truth.
- Updated `frontend/src/main/local_backend_bridge.cjs` so it wires focused
  modules instead of owning startup/env, stderr, process-event, and shutdown
  policy.
- Updated focused tests under `tests/frontend` for launch planning, stderr
  transport, process events, bridge lifecycle, and Windows path parity.
- Updated the local-backend reference doc and changelog for the new owners.

## Checklist

- [x] User approved this product-wide plan before implementation started.
- [x] Create matching execution report under `docs/plans/`.
- [x] Complete source-only inventory and classify findings for the active
      local-backend bridge slice.
- [x] Split local backend bridge ownership for launch, stderr, and process
      event/shutdown handling.
- [ ] Remove or isolate in-scope renderer raw-event and sidecar-RPC leaks.
- [ ] Tighten diagnostics/logging ownership and redaction policy.
- [ ] Add cross-runtime payload contract tests.
- [x] Improve Windows/script parity for touched commands and packaging paths.
- [ ] Review backend/sidecar retained fallback behavior and delete stale paths.
- [x] Update docs and `read_when` hints for changed boundaries.
- [x] Update `CHANGELOG.md`.
- [x] Run focused validation for every touched runtime in the current slice.
- [x] Run `./bin/docs-list`.
- [x] Run `git diff --check`.
- [ ] Commit completed work in small slices.
- [ ] Keep the report current with commits, validation, deviations, blockers,
      and intentionally remaining debt.

## Success Criteria

- [x] Each runtime has one clear source of truth for touched behavior in the
      current local-backend bridge slice.
- [ ] Renderer feature code does not interpret raw backend events, call sidecar
      RPCs for SDK-owned concepts, or shape backend websocket payload internals.
- [x] Electron main IPC and local-backend bridge files shrink toward
      composition roots with focused owner modules and tests for the current
      slice.
- [ ] SDK remains the owner of conversation events, display/current-turn
      projections, local-tool correlation, result return, replay, rehydrate,
      edit, and retry semantics.
- [x] Sidecar remains the owner of local execution/storage, with bridge method
      mapping isolated at the transport boundary for the current slice.
- [ ] Backend remains the owner of prompt/provider/model-facing
      tool/API/history semantics.
- [ ] Remaining compatibility/fallback paths are documented with owner, reason,
      deletion condition, and test target.
- [x] Windows development commands and platform-specific runtime behavior are
      documented and covered for every touched surface in the current slice.
- [x] Validation covers all touched producer/consumer boundaries before this
      slice commit.

## Validation Log

- `cd frontend; npm.cmd run test -- LocalBackendStderrTransport LocalBackendBridge.lifecycle LocalBackendBridge.rpc LocalBackendStdoutTransport LocalBackendStatusBroadcaster RuntimePaths --runInBand`
  - Result: passed, 6 suites / 67 tests.
  - Note: Jest emitted the existing open-handle warning after completion.
- `cd frontend; npm.cmd run test -- LocalBackendLaunchPlan LocalBackendStderrTransport LocalBackendBridge.lifecycle LocalBackendBridge.rpc LocalBackendStdoutTransport LocalBackendStatusBroadcaster RuntimePaths --runInBand`
  - Result: passed, 7 suites / 72 tests.
  - Note: Jest emitted the existing open-handle warning after completion.
- `cd frontend; npm.cmd run test -- LocalBackendProcessEvents LocalBackendLaunchPlan LocalBackendStderrTransport LocalBackendBridge.lifecycle LocalBackendBridge.rpc LocalBackendStdoutTransport LocalBackendStatusBroadcaster RuntimePaths --runInBand`
  - Result: passed, 8 suites / 78 tests.
  - Note: Jest emitted the existing open-handle warning after completion.
- `cd frontend; npm.cmd run test -- LocalBackendStopController LocalBackendProcessEvents LocalBackendLaunchPlan LocalBackendStderrTransport LocalBackendBridge.lifecycle LocalBackendBridge.rpc LocalBackendStdoutTransport LocalBackendStatusBroadcaster RuntimePaths --runInBand`
  - Result: passed, 9 suites / 82 tests.
  - Note: Jest emitted the existing open-handle warning after completion.
- `./bin/docs-list`
  - Result: passed; canonical navigation validated.
- `git diff --check`
  - Result: passed; only Windows line-ending conversion warnings were reported.

## Commits

- `d22e280f6 refactor(frontend-main): split local backend launch lifecycle`
  - Plan/report creation plus local-backend launch, stderr, process event, and
    standalone transport naming cleanup.
- `70d029cc1 refactor(frontend-main): isolate local backend shutdown`
  - Stop-controller shutdown extraction, direct tests, docs, changelog, and
    report update.

## Decisions, Tradeoffs, Blockers, Deviations

- Decision: Keep standalone sidecar JSON-RPC as a supported transport mode and
  remove only misleading `legacyTransport` naming. This avoids deleting an
  active local runtime path while still removing compatibility language.
- Tradeoff: The first commit remains scoped to Electron-main local-backend
  ownership rather than sweeping renderer/SDK/backend cleanup in the same
  patch. This keeps the staged diff reviewable while the broader plan remains
  active.
- Blocker/coordination note: The worktree contains concurrent SDK memory
  invalidation changes and generated SDK `cjs` output. They are not owned by
  this cleanup slice and must not be staged with this commit unless the user
  explicitly folds that work into this plan.

## Remaining Findings

- The local-backend bridge still registers several host IPC handlers directly;
  the next slices should separate host-channel registration only when doing so
  deletes duplicate authority rather than adding a pass-through adapter.
- Renderer/SDK memory invalidation changes are present as unrelated dirty work
  and should be reconciled separately before Phase 2 raw-event/channel cleanup.
