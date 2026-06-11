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
- Current slice: tenth hardening slice committed.
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
- [x] Commit the second slice.
- [x] Select third code/docs slice with a concrete owner and regression test.
- [x] Implement third slice.
- [x] Run focused validation and `git diff --check` for the third slice.
- [x] Update changelog and report with the third slice result.
- [x] Commit the third slice.
- [x] Select fourth code slice with a concrete owner and regression test.
- [x] Implement fourth slice.
- [x] Run focused validation and `git diff --check` for the fourth slice.
- [x] Update changelog and report with the fourth slice result.
- [x] Commit the fourth slice.
- [x] Select fifth code slice with a concrete owner and regression test.
- [x] Implement fifth slice.
- [x] Run focused validation and `git diff --check` for the fifth slice.
- [x] Update changelog and report with the fifth slice result.
- [x] Commit the fifth slice.
- [x] Select sixth code slice with a concrete owner and regression test.
- [x] Implement sixth slice.
- [x] Run focused validation and `git diff --check` for the sixth slice.
- [x] Update changelog and report with the sixth slice result.
- [x] Commit the sixth slice.
- [x] Select seventh code slice with a concrete owner and regression test.
- [x] Implement seventh slice.
- [x] Run focused validation and `git diff --check` for the seventh slice.
- [x] Update changelog and report with the seventh slice result.
- [x] Commit the seventh slice.
- [x] Select eighth code slice with a concrete owner and regression test.
- [x] Implement eighth slice.
- [x] Run focused validation and `git diff --check` for the eighth slice.
- [x] Update changelog and report with the eighth slice result.
- [x] Commit the eighth slice.
- [x] Select ninth code slice with a concrete owner and regression test.
- [x] Implement ninth slice.
- [x] Run focused validation and `git diff --check` for the ninth slice.
- [x] Update changelog and report with the ninth slice result.
- [x] Commit the ninth slice.
- [x] Select tenth code slice with a concrete owner and regression test.
- [x] Implement tenth slice.
- [x] Run focused validation and `git diff --check` for the tenth slice.
- [x] Update changelog and report with the tenth slice result.
- [x] Commit the tenth slice.

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
- `cd frontend && npm run test -- BackendEndpoints --runInBand` - passed after
  third slice; 2 suites and 11 tests passed, including the new active endpoint
  docs regression guard.
- `bin/windie docs list` - passed after third-slice docs changes; canonical
  navigation reported 83 page references validated.
- `git diff --check -- tests/frontend/BackendEndpoints.test.cjs docs/help/doctor_checklist.md docs/operations/runtime_configuration_matrix.md docs/operations/configuration.md docs/getting-started/installation.md docs/install/local_backend_and_endpoint_setup.md CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `rg -n "WINDIE_DEFAULT_PACKAGED_BACKEND" tests/frontend/BackendEndpoints.test.cjs docs/help/doctor_checklist.md docs/operations/runtime_configuration_matrix.md docs/operations/configuration.md docs/getting-started/installation.md docs/install/local_backend_and_endpoint_setup.md`
  - passed for docs; only the regression test itself contains the removed names.
- `cd frontend && npm run test -- OpenAICodexOAuth --runInBand` - initially
  failed because the new callback-error test exposed a socket hang-up and a
  transient unhandled rejection; passed after response completion and promise
  observation fixes. Final result: 2 suites and 8 tests passed.
- `bin/windie docs list` - passed after fourth-slice changelog update;
  canonical navigation reported 83 page references validated.
- `git diff --check -- frontend/src/main/app/openai_codex_oauth.cjs tests/frontend/OpenAICodexOAuth.test.cjs CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `cd frontend && npm run test -- MainProcessLifecycleRuntime --runInBand` -
  passed after fifth slice; 1 suite and 18 tests passed, including the new
  invalid second-instance cooldown regression test.
- `bin/windie docs list` - passed after fifth-slice changelog/report updates;
  canonical navigation reported 83 page references validated.
- `git diff --check -- frontend/src/main/app/main_process_lifecycle_runtime.cjs tests/frontend/MainProcessLifecycleRuntime.test.cjs CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `cd frontend && npm run test -- WindieAgentConversationStoreApi --runInBand`
  - passed after sixth slice; 1 suite and 5 tests passed, including the new
  sidecar metadata event-count normalization regression test.
- `bin/windie docs list` - passed after sixth-slice changelog/report updates;
  canonical navigation reported 83 page references validated.
- `git diff --check -- packages/windie-sdk-js/src/stores/SidecarConversationStore.ts tests/frontend/WindieAgentConversationStoreApi.test.ts CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `cd frontend && npm run test -- SurfaceRuntime --runInBand` - passed after
  seventh slice; 1 suite and 22 tests passed, including the new invalid Linux
  screenshot settle-delay regression test.
- `bin/windie docs list` - passed after seventh-slice changelog/report updates;
  canonical navigation reported 83 page references validated.
- `git diff --check -- frontend/src/main/surfaces/surface_runtime.cjs tests/frontend/SurfaceRuntime.test.cjs CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `cd frontend && npm run test -- WindieSdkConversationRuntime --runInBand` -
  passed after eighth slice; 1 suite and 125 tests passed, including the new
  metadata pagination limit normalization regression test.
- `bin/windie docs list` - passed after eighth-slice changelog/report updates;
  canonical navigation reported 83 page references validated.
- `git diff --check -- packages/windie-sdk-js/src/conversation/metadata.ts tests/frontend/WindieSdkConversationRuntime.test.ts CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `cd frontend && npm run test -- MainWindowRuntime --runInBand` - passed
  after ninth slice; 1 suite and 47 tests passed, including the new invalid
  overlay capture focus wait regression test.
- `bin/windie docs list` - passed after ninth-slice changelog/report updates;
  canonical navigation reported 83 page references validated.
- `git diff --check -- frontend/src/main/surfaces/main_window_runtime.cjs tests/frontend/MainWindowRuntime.test.cjs CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `cd frontend && npm run test -- OverlayBounds --runInBand` - passed after
  tenth slice; 1 suite and 12 tests passed, including the new non-finite
  display affinity fallback regression test.
- `bin/windie docs list` - passed after tenth-slice changelog/report updates;
  canonical navigation reported 83 page references validated.
- `git diff --check -- frontend/src/main/surfaces/overlay_bounds.cjs tests/frontend/OverlayBounds.test.cjs CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
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
- Slice 3 owner: docs/tests own endpoint configuration contracts that agents and
  operators use to choose runtime env vars. Electron main remains the code
  source of truth for endpoint env handling.
- Slice 3 failure mode: active endpoint setup docs still advertised
  `WINDIE_DEFAULT_PACKAGED_BACKEND_HTTP_URL` and
  `WINDIE_DEFAULT_PACKAGED_BACKEND_WS_URL` even though the endpoint resolver
  ignores them and the existing endpoint test asserts they are removed.
- Slice 3 change: active endpoint docs now point users to
  `WINDIE_DEFAULT_BACKEND_HTTP_URL` and `WINDIE_DEFAULT_BACKEND_WS_URL`, and
  `BackendEndpoints.test.cjs` now guards that selected active endpoint docs do
  not reintroduce the removed packaged default env names.
- Slice 3 inspection: no runtime code changed. Endpoint resolver behavior
  remains as committed in slice 2. A full docs search still finds the removed
  env names in `docs/operations/sidecar_runtime_packaging.md`, but that file had
  unrelated pre-existing dirty edits, so it remains a follow-up rather than
  being mixed into this slice.
- Slice 4 owner: Electron main owns the OpenAI Codex OAuth browser callback
  server, callback response rendering, OAuth state validation, and token payload
  construction.
- Slice 4 failure mode: provider-supplied OAuth `error_description` text was
  inserted directly into local callback HTML. The regression test also exposed
  that callback error responses could be observed as socket hang-ups and that a
  callback rejection during `openExternal(...)` could briefly become an
  unhandled promise rejection before the caller awaited it.
- Slice 4 change: callback response text is HTML-escaped, callback responses now
  include content length and settle the OAuth flow after response completion,
  and `waitForCallbackPromise` is observed immediately while preserving the
  later rejection for `loginOpenAICodexOAuth(...)` callers.
- Slice 4 inspection: token exchange, PKCE/state validation, profile id
  derivation, and IPC storage behavior are unchanged. The fix only affects local
  callback response rendering and promise lifecycle around the existing callback
  server.
- Slice 5 owner: Electron main owns single-instance process behavior and native
  focus throttling for duplicate app launches.
- Slice 5 failure mode: malformed `secondInstanceFocusCooldownMs` injection
  values such as `1000ms` normalized to zero because the runtime used
  `Number(...) || 0`, silently disabling the second-instance focus storm guard.
- Slice 5 change: single-instance focus cooldown normalization now preserves
  explicit `0` as the opt-out while falling back to the production default for
  invalid or negative values.
- Slice 5 inspection: no renderer, preload, sidecar, backend, IPC payload, or
  persisted data contract changed. The existing second-instance focus path and
  hidden-pill/dashboard routing remain unchanged.
- Slice 6 owner: SDK conversation store adapters own normalization of
  sidecar-backed conversation metadata before SDK consumers, renderer surfaces,
  or external clients read list/search rows.
- Slice 6 failure mode: malformed sidecar metadata rows could expose negative
  or fractional `eventCount` values because the adapter used `Number(...) || 0`
  instead of enforcing the non-negative integer shape of a count.
- Slice 6 change: sidecar-backed metadata now normalizes `entry_count` /
  `eventCount` to a non-negative integer, preserving valid numeric strings and
  converting invalid, negative, or fractional values to zero.
- Slice 6 inspection: no sidecar storage schema, sidecar RPC method, event
  payload, display projection, rehydrate projection, or persisted conversation
  event shape changed. The fix only tightens the SDK adapter output shape.
- Slice 7 owner: Electron main surface runtime owns overlay screenshot leases,
  Linux hide/restore behavior, and the settle delay between hiding overlays and
  allowing sidecar screenshot capture.
- Slice 7 failure mode: malformed `toolSurfaceSettleMs` injection values such
  as `80ms` normalized to zero because the runtime used `Number(...) || 0`,
  silently skipping the Linux overlay hide-before-capture settle wait.
- Slice 7 change: screenshot settle-delay normalization now preserves explicit
  `0` as the opt-out while falling back to the production default for invalid
  or negative values.
- Slice 7 inspection: no sidecar screenshot RPC payload, IPC channel, renderer
  state shape, platform policy, or persisted data changed. The existing Linux
  hide/restore and macOS/Windows content-protection paths remain unchanged.
- Slice 8 owner: SDK conversation metadata helpers own list/search pagination
  normalization shared by in-memory, file-backed, and sidecar-backed
  conversation stores.
- Slice 8 failure mode: numeric `limit` values were passed directly to
  `Array.slice(...)`, so negative limits returned "all but the tail" and
  fractional or non-finite values depended on JavaScript slice coercion instead
  of an explicit SDK page-size contract.
- Slice 8 change: metadata pagination now normalizes numeric limits to finite
  non-negative integers, preserving omitted limits as unbounded, converting
  invalid/non-finite/negative limits to an empty page, and flooring fractional
  positive limits.
- Slice 8 inspection: no store persistence format, sidecar RPC payload,
  renderer event shape, display projection, or rehydrate projection changed.
  The fix only tightens SDK list/search pagination output.
- Slice 9 owner: Electron main main-window runtime owns overlay query capture
  focus preparation and the settle wait after blurring assistant windows.
- Slice 9 failure mode: malformed `waitMs` injection values such as `120ms`
  skipped the capture-prep settle wait because the runtime compared the raw
  value directly with zero and let JavaScript coercion decide the branch.
- Slice 9 change: overlay capture focus wait normalization now preserves
  explicit `0` as the no-wait path while falling back to the production default
  for invalid, non-finite, or negative values.
- Slice 9 inspection: no IPC channel, sidecar screenshot RPC payload, renderer
  state shape, platform policy, or persisted data changed. The existing
  blur-only capture prep and macOS no-op path remain unchanged.
- Slice 10 owner: Electron main overlay geometry owns chat pill, response
  overlay, and context-label window bounds derived from display affinity and
  primary display work areas.
- Slice 10 failure mode: malformed display-affinity rectangles with non-finite
  fields such as `Infinity` could pass through `Number(...) || 0` normalization
  and become native overlay window coordinates.
- Slice 10 change: overlay display-affinity bounds now require finite rounded
  coordinate and size fields before placement uses them. Invalid affinity
  work-area values fall back to the next valid affinity bounds or primary
  display work area.
- Slice 10 inspection: no renderer layout contract, IPC channel, screenshot
  lease policy, display-affinity producer, or persisted data shape changed. The
  fix only tightens Electron main's geometry input boundary before native
  window placement.

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
- Treat selected endpoint-doc cleanup as a docs/test contract fix. No runtime,
  persisted data, IPC payload, or backend API shape changed, so no migration is
  required.
- Treat OAuth callback escaping as a security hardening fix. No credential
  storage, provider token payload, IPC payload, backend API, or persisted data
  shape changed, so no migration is required.
- Treat invalid second-instance cooldown normalization as Electron main startup
  hardening. No persisted data, IPC payload, backend API, or user setting shape
  changed, so no migration is required.
- Treat sidecar metadata event-count normalization as SDK adapter hardening. No
  persisted data, sidecar RPC payload, backend API, or renderer event shape
  changed, so no migration is required.
- Treat invalid screenshot settle-delay normalization as Electron main surface
  hardening. No persisted data, IPC payload, sidecar RPC payload, or renderer
  event shape changed, so no migration is required.
- Treat metadata pagination limit normalization as SDK helper hardening. No
  persisted data, sidecar RPC payload, backend API, or renderer event shape
  changed, so no migration is required.
- Treat invalid overlay capture focus wait normalization as Electron main
  capture-prep hardening. No persisted data, IPC payload, sidecar RPC payload,
  or renderer event shape changed, so no migration is required.
- Treat non-finite display-affinity bounds as Electron main geometry boundary
  hardening. No persisted data, IPC payload, sidecar RPC payload, renderer
  layout contract, or display-affinity producer changed, so no migration is
  required.

## Commits

- `185899229` - `fix(frontend-vm-worker): harden heartbeat interval parsing`
- `1fb1cda3b` - `fix(frontend-endpoints): tolerate invalid local backend overrides`
- `e3da2c394` - `docs(endpoints): remove stale packaged backend overrides`
- `6e26bc45e` - `fix(frontend-oauth): escape codex callback responses`
- `a63c5c919` - `fix(frontend-main): harden second-instance cooldown parsing`
- `c014ab059` - `fix(sdk-conversation): normalize sidecar metadata counts`
- `fabd99d9f` - `fix(frontend-surface): harden screenshot settle delay parsing`
- `75a92d4cb` - `fix(sdk-conversation): normalize metadata pagination limits`
- `fb90b5a1f` - `fix(frontend-main): harden overlay capture wait parsing`
- `54c1971e7` - `fix(frontend-overlays): reject non-finite display bounds`

## Remaining Candidates

- Continue with another focused hardening target outside the existing dirty
  sidecar bridge changes unless that bridge work becomes the highest-evidence
  path.
- Clean up the remaining stale packaged backend override mention in
  `docs/operations/sidecar_runtime_packaging.md` after reconciling that file's
  pre-existing dirty edits.
