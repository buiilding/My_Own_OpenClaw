---
summary: "Long-running deletion-first cleanup campaign plan for finding and removing non-deterministic code paths across WindieOS."
read_when:
  - When running a broad deterministic-path cleanup campaign across WindieOS backend, SDK, frontend, sidecar, tools, docs, or tests.
  - When looking for cleanup candidates such as fallback ladders, compatibility shims, duplicate producers, unused aliases, no-op adapters, or branch-heavy mixed-state functions.
title: "Deterministic Codebase Cleanup Campaign Plan"
---

# Deterministic Codebase Cleanup Campaign Plan

Date: 2026-06-05

## User Intent

Run a general code cleanup campaign that keeps looking for more real cleanup
work instead of stopping after one narrow deletion.

The desired code shape is:

- fewer `if`s and nested branches
- fewer fallback ladders
- fewer compatibility shims
- fewer duplicate producers for the same behavior
- inputs normalized once at the boundary
- invalid state fails fast instead of silently degrading
- core logic runs through one obvious path
- separate named handlers for real states, not giant mixed functions
- deletion of old paths when they are no longer required
- tests that prove the single intended path

Short version: make the code shape match the runtime truth. One owner, one
path, explicit state, no hidden escape hatches.

## Campaign Shape

This is not a one-feature refactor plan. It is a sustained cleanup campaign.
The agent should keep discovering, ranking, implementing, validating, and
committing cleanup slices until the approved campaign is complete, blocked, or
explicitly stopped.

Each cleanup slice must still be small enough to review. The campaign should be
long-running because it repeats the same disciplined loop across multiple
subsystems, not because it makes one huge unbounded edit.

## Current State And Constraints

- The worktree currently contains unrelated dirty frontend/minimal-chat-pill
  work and an unrelated examples edit. This campaign must not stage, revert, or
  edit those files unless the user explicitly folds that work into this plan.
- A separate minimal-chat-pill plan exists and is not this campaign.
- A separate narrow backend websocket task-admission plan exists and can be used
  as one possible candidate, but this campaign must not stop there.
- The repo has strong runtime ownership boundaries: backend, SDK runtime,
  Electron main, renderer, preload, sidecar, docs, and tests each own different
  responsibilities.
- Cleanup must preserve those ownership boundaries. Deleting a fallback in one
  runtime must not recreate the same fallback in another runtime.

## Architectural Change

The campaign changes the codebase toward a more deterministic ownership model:

- Runtime boundaries become explicit before core logic runs.
- Each behavior has one producer and one consumer path where possible.
- Old aliases, adapters, compatibility exports, optional knobs, and fallback
  ladders are deleted when no verified dependency requires them.
- Boundary code normalizes input once; inner code operates on the normalized
  shape and fails fast on invalid state.
- Tests assert the intended single path instead of preserving legacy branches
  for convenience.
- Docs describe the current owner and path, not historical alternatives.

Conceptually, the campaign is a repeated ownership audit followed by deletion.
It should not add another facade, shim, adapter, or branch unless doing so
unlocks deletion of a larger wrong path in the same approved slice.

## Out Of Scope

- Large product redesigns, UI redesigns, provider rewrites, or new features.
- Breaking public API, persisted-data, tool-schema, or IPC contracts without a
  specific approved slice and migration note.
- Repo-wide search-and-replace scripts.
- Reverting unrelated dirty work.
- Touching vendored dependencies or `node_modules`.
- Creating broad abstractions that do not directly delete or consolidate
  existing code.
- Keeping compatibility shims only because they are easy to keep.
- Treating operational resilience as dead compatibility without proof.

## Cleanup Candidate Signals

During discovery, prioritize code with one or more of these signals:

- return tuple/value where production discards part of it
- parameter accepted only to be ignored
- wrapper that only renames and forwards
- package-root re-export that exposes implementation internals without a
  current documented public contract
- legacy alias or underscore/hyphen/case repair path after boundary
  normalization exists
- fallback chain where only one branch is reachable from current callers
- duplicate normalizer in producer and consumer
- no-op compatibility function or "maybe" helper around a now-explicit state
- branch-heavy function mixing independent states that can be split into named
  state handlers
- tests that only preserve old compatibility behavior without a live dependency
- docs that describe two owners for one behavior

Do not delete a candidate until its live dependency surface is checked with
`rg`, docs, tests, and recent commits.

## Candidate Ledger

The matching report file must maintain a candidate ledger. Each candidate entry
must include:

- candidate id
- subsystem and owning runtime
- suspected stale path
- current producer and consumer
- evidence from code/docs/tests
- recent related commits inspected
- deletion or cleanup concept
- breakage risk
- validation command set
- status: `queued`, `investigating`, `approved-slice`, `implemented`,
  `rejected`, or `blocked`

The agent should add new candidates while implementing previous slices. After
each commit, inspect the touched neighborhood and docs again to find adjacent
dead branches created visible by the cleanup.

## Ordered Campaign Plan

### 1. Create The Report And Baseline

- Create `docs/plans/2026-06-05-deterministic-codebase-cleanup-campaign-report.md`.
- Record initial `git status --short`.
- Record current unrelated dirty files so they are preserved.
- Record docs read and recent commits inspected.
- Record the first candidate ledger with at least five candidates from at least
  two runtimes.

### 2. Build The First Candidate Queue

Run targeted scans, not blind repo-wide rewrites:

- ignored parameters and discarded return values
- explicit compatibility words: `legacy`, `compat`, `alias`, `shim`,
  `fallback`, `deprecated`, `maybe`
- no-op wrapper functions
- package-root implementation re-exports
- duplicate normalizer names
- tests that mention old shapes or compatibility-only behavior
- docs that describe old and new owner paths in the same feature

For each candidate, read the nearest `read_when` docs and recent commits before
deciding whether it is a real cleanup.

### 3. Rank Candidates

Prefer candidates with:

- high deletion value
- low public contract risk
- clear single owner after cleanup
- focused tests already nearby
- docs that can be made simpler
- no unrelated dirty-file collision

Reject or defer candidates where:

- fallback is operational resilience rather than compatibility
- public API migration is needed
- current dirty work makes ownership unclear
- cleanup would cross too many runtime boundaries for one slice

### 4. Execute One Cleanup Slice At A Time

For each approved slice:

1. Restate the exact owner and intended single path in the report.
2. Inspect live call sites, tests, docs, and recent commits.
3. Delete stale code first.
4. Tighten signatures, names, or state handling only as needed to make the
   deletion coherent.
5. Update focused tests to prove the current path rather than old branches.
6. Update docs and changelog.
7. Run focused validation.
8. Run `./bin/docs-list` and `git diff --check`.
9. Commit only files for that slice.
10. Update the report with the commit, validation, and next candidates found.

### 5. Rotate Across Subsystems

Do not spend the whole campaign on one file. Rotate through subsystems when
the candidate ledger supports it:

- backend API and websocket helpers
- backend tool policy, provider projection, and model-visible schema paths
- backend agent loop and history/result processing
- SDK runtime, conversation projection, stores, and tool coordination
- sidecar tool manifests and local execution helpers
- frontend main/renderer/preload only when not colliding with unrelated dirty
  frontend work
- docs/tests that preserve old behavior after runtime paths are deleted

Each subsystem pass should identify whether it has real cleanup candidates or
should be skipped with a reason.

### 6. Escalate When A Candidate Is Actually A Refactor

Pause and update the plan/report before implementation if a candidate requires:

- changing public SDK/API/tool/IPC contracts
- moving ownership across runtimes
- deleting a path still used by a verified dependency
- changing persisted data or migration behavior
- broad frontend flow changes
- provider behavior changes
- security-sensitive permission, credential, or local-authority changes

The campaign is deletion-first cleanup, not a license to make large unplanned
rewrites.

### 7. Continue Until Real Stop Conditions

The campaign should continue until one of these conditions is met:

- at least six cleanup slices are implemented and committed, and the remaining
  ledger candidates are low-confidence or require separate approval
- no high-confidence deletion candidates remain after scanning at least four
  distinct subsystems
- validation failure blocks progress and the blocker is documented with exact
  failing commands
- the user explicitly stops or redirects the campaign

Do not stop after the first easy cleanup.

## Checklist

- [ ] Report file exists and links this plan.
- [ ] Initial dirty worktree snapshot is recorded.
- [ ] Candidate ledger starts with at least five candidates across at least two
      runtimes.
- [ ] Candidate scans use docs, `rg`, tests, and recent commits.
- [ ] Each cleanup slice names the owner, stale path, deletion, tests, docs, and
      validation before implementation.
- [ ] Each slice removes or simplifies more code than it adds.
- [ ] No unrelated dirty files are staged or reverted.
- [ ] Changelog is updated for each repo-visible cleanup.
- [ ] Docs are updated when behavior, contracts, or ownership descriptions
      change.
- [ ] Each slice is committed separately.
- [ ] The report records commits, validation results, skipped validation, and
      rejected/blocked candidates.
- [ ] At least four subsystems are scanned before declaring the campaign
      exhausted.
- [ ] The campaign does not stop after one narrow cleanup unless explicitly
      blocked or redirected.

## Success Criteria

- The campaign produces multiple small commits, each with a clear deletion or
  deterministic-path cleanup.
- Cleanup candidates are discovered continuously and tracked in the report.
- Runtime ownership becomes easier to explain after each slice.
- Branch-heavy or compatibility-heavy code is deleted, narrowed, or split into
  explicit states.
- Tests prove current intended paths and stop preserving unneeded legacy paths.
- Docs describe one owner and one path for the touched behavior.
- Unrelated dirty frontend/example work remains untouched unless explicitly
  approved.

## Validation Commands

Always run for the campaign and each slice:

```bash
./bin/docs-list
git diff --check
git status --short
```

Backend slice examples:

```bash
./scripts/python-in-env backend pytest tests/backend/<focused-test-file>.py -q
./scripts/python-in-env backend pytest tests/backend/test_tool_policy.py tests/backend/test_dev_tool_selection.py -q
./scripts/python-in-env backend pytest tests/backend/test_websocket_task_manager.py tests/backend/test_websocket_loop_runtime.py -q
```

SDK slice examples:

```bash
cd packages/windie-sdk-js && npm test -- --runInBand <focused-test-name>
cd frontend && npm run test:ci -- WindieClient ConversationRuntime ToolExecutionCoordinator
```

Frontend slice examples:

```bash
cd frontend && npm run test:ci -- <focused-test-file>
cd frontend && npm run lint
```

Sidecar slice examples:

```bash
./scripts/python-in-env sidecar pytest tests/sidecar/<focused-test-file>.py -q
```

For stale-reference checks, use targeted `rg` commands recorded in the report,
for example:

```bash
rg -n "legacy|compat|shim|fallback|deprecated|maybe" backend/src packages frontend/src tests docs
rg -n "create_task_if_under_limit\\(|normalize_wrappers|builtinTools|image/jpg" backend/src packages frontend/src tests docs
```

Run broader suites only when the slice crosses broader ownership boundaries or
when focused tests cannot prove the contract.

## Assumptions

- The campaign will be approved before implementation starts.
- The agent may create multiple commits under this plan without asking after
  each slice, as long as each slice stays inside the approved campaign scope.
- The agent must still pause before widening into public contract changes,
  storage migrations, large frontend flow rewrites, or security-sensitive
  authority changes.
- Current unrelated dirty frontend/example work is owned by another effort and
  must remain untouched.
- A cleanup that cannot prove deletion safety should be rejected or deferred,
  not patched with another compatibility layer.
