---
summary: "Execution report for behavior-preserving, test-backed maintenance hardening across WindieOS."
read_when:
  - When resuming the long-running maintenance hardening goal.
  - When checking completed commits, validation, and remaining candidates for test-backed refactor work.
title: "Test-Backed Maintenance Hardening Report"
---

# Test-Backed Maintenance Hardening Report

Plan: `docs/plans/2026-06-10-test-backed-maintenance-hardening-plan.md`

## Current Status

- Status: active.
- Current slice: second hardening slice complete; commit pending.
- Repo state at start: `main` is ahead of `origin/main` with existing dirty
  docs and frontend sidecar bridge changes not created by this report.

## Checklist

- [x] Created durable plan and report for the long-running maintenance goal.
- [x] Ran docs listing and read ownership routing docs before selecting a code
  slice.
- [x] Select first code slice with a concrete owner and regression test.
- [x] Implement first slice.
- [x] Run focused validation and `git diff --check`.
- [x] Update changelog and report with the first slice result.
- [x] Commit the first slice.
- [x] Select second code slice with a concrete owner and regression test.
- [x] Implement second slice.
- [x] Run focused validation and `git diff --check` for the second slice.
- [x] Update changelog and report with the second slice result.
- [ ] Commit the second slice.

## Validation Log

- `bin/windie docs list` - passed; canonical navigation reported 83 page
  references validated.
- `cd frontend && npm run test -- VmWorkerRuntime --runInBand` - passed; 6
  tests passed, including the new strict heartbeat interval regression test.
- `git diff --check -- frontend/src/main/app/vm_worker_runtime.cjs tests/frontend/VmWorkerRuntime.test.cjs docs/frontend/main/vm_worker_runs_bridge_and_openai_codex_oauth_runtime_reference.md docs/debug/diagnostic_flags.md docs/operations/configuration.md docs/nodes/vm_worker_node.md CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-plan.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `bin/windie docs list` - passed after docs changes; canonical navigation
  reported 83 page references validated.
- `cd frontend && npm run test -- BackendEndpoints --runInBand` - passed; 2
  suites and 10 tests passed, including endpoint-state coverage selected by
  the test runner pattern.
- `bin/windie docs list` - passed after second-slice docs changes; canonical
  navigation reported 83 page references validated.
- `git diff --check -- frontend/src/main/app/backend_endpoints.cjs tests/frontend/BackendEndpoints.test.cjs docs/operations/configuration.md CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.

## Inspection Log

- Initial ownership read: runtime ownership matrix confirms docs/tests own
  durable contracts and regression evidence; code slices must route to backend,
  SDK, Electron main, renderer, preload, or sidecar before editing.
- Initial worktree read: existing dirty docs and frontend sidecar bridge files
  are present before this report. Avoid staging or rewriting those paths unless
  a selected slice intentionally works with them.
- Initial commit read: recent commits are focused on durable trace diagnostics,
  local history storage, screenshot trace capture, and SDK/frontend trace
  propagation. First slice should inspect related commits for its chosen files
  before editing.
- Slice 1 owner: Electron main VM worker runtime owns heartbeat polling cadence
  and backend endpoint selection for `/api/runs/*` worker polling.
- Slice 1 failure mode: `WINDIE_VM_WORKER_HEARTBEAT_MS=2500ms` and decimal
  values were accepted because `parseInt` consumed numeric prefixes. That was
  looser than docs describing an integer millisecond interval and could hide
  malformed config.
- Slice 1 change: replaced prefix parsing with strict trimmed `Number(...)`
  plus `Number.isInteger(...)`, preserving valid integer strings and the
  documented default fallback for malformed, decimal, or too-small values.
- Slice 1 inspection: no source-of-truth boundary moved. The worker still owns
  polling cadence locally; backend run-control APIs and dispatch behavior are
  unchanged. Adjacent tests still cover assignment dispatch, stream relay, stop
  controls, and pending dispatch dedupe.
- Slice 2 owner: Electron main endpoint resolution owns desktop backend HTTP
  and websocket endpoint selection from environment variables.
- Slice 2 failure mode: malformed `BACKEND_HOST` or `BACKEND_PORT` local
  overrides could normalize into zero endpoint candidates. `resolveBackendEndpoints`
  then dereferenced an undefined fallback endpoint during Electron startup.
- Slice 2 change: when explicit local host/port overrides produce no valid
  candidate, endpoint resolution continues to the hosted-default candidate path
  instead of returning an empty candidate set.
- Slice 2 inspection: no backend transport contract changed. Explicit full
  `BACKEND_HTTP_URL` / `BACKEND_WS_URL` priority is unchanged, valid local
  host/port overrides still win when full URLs are absent, and artifact URL
  selection remains covered by existing tests.

## Decisions

- Use small, independently reviewable slices. Do not attempt repo-wide cleanup
  in one commit.
- Prefer untouched or clearly owned paths for early slices to avoid mixing with
  existing dirty worktree changes.
- Treat heartbeat interval parsing as a config-boundary hardening fix, not a
  behavior migration. No persisted data shape or API payload changed, so no
  migration is required.
- Treat malformed local endpoint fallback as a startup hardening fix. No
  persisted data, IPC payload, or backend API shape changed, so no migration is
  required.
- Defer the separate docs drift where `docs/operations/configuration.md` still
  mentions removed packaged backend override names that tests assert are
  ignored. That cleanup should be its own slice.

## Commits

- `185899229` - `fix(frontend-vm-worker): harden heartbeat interval parsing`

## Remaining Candidates

- Continue with another focused hardening target outside the existing dirty
  sidecar bridge changes unless that bridge work becomes the highest-evidence
  path.
- Clean up stale packaged backend override docs after confirming the current
  replacement contract in endpoint docs and tests.
