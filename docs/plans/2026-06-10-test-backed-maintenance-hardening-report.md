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
- Current slice: twentieth hardening slice committed.
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
- [x] Select eleventh code slice with a concrete owner and regression test.
- [x] Implement eleventh slice.
- [x] Run focused validation and `git diff --check` for the eleventh slice.
- [x] Update changelog and report with the eleventh slice result.
- [x] Commit the eleventh slice.
- [x] Select twelfth code slice with a concrete owner and regression test.
- [x] Implement twelfth slice.
- [x] Run focused validation and `git diff --check` for the twelfth slice.
- [x] Update changelog and report with the twelfth slice result.
- [x] Commit the twelfth slice.
- [x] Select thirteenth code slice with a concrete owner and regression test.
- [x] Implement thirteenth slice.
- [x] Run focused validation and `git diff --check` for the thirteenth slice.
- [x] Update changelog and report with the thirteenth slice result.
- [x] Commit the thirteenth slice.
- [x] Select fourteenth code slice with a concrete owner and regression test.
- [x] Implement fourteenth slice.
- [x] Run focused validation and `git diff --check` for the fourteenth slice.
- [x] Update changelog and report with the fourteenth slice result.
- [x] Commit the fourteenth slice.
- [x] Select fifteenth code slice with a concrete owner and regression test.
- [x] Implement fifteenth slice.
- [x] Run focused validation and `git diff --check` for the fifteenth slice.
- [x] Update changelog and report with the fifteenth slice result.
- [x] Commit the fifteenth slice.
- [x] Select sixteenth code slice with a concrete owner and regression test.
- [x] Implement sixteenth slice.
- [x] Run focused validation and `git diff --check` for the sixteenth slice.
- [x] Update changelog and report with the sixteenth slice result.
- [x] Commit the sixteenth slice.
- [x] Select seventeenth code slice with a concrete owner and regression test.
- [x] Implement seventeenth slice.
- [x] Run focused validation and `git diff --check` for the seventeenth slice.
- [x] Update changelog and report with the seventeenth slice result.
- [x] Commit the seventeenth slice.
- [x] Select eighteenth code slice with a concrete owner and regression test.
- [x] Implement eighteenth slice.
- [x] Run focused validation and `git diff --check` for the eighteenth slice.
- [x] Update changelog and report with the eighteenth slice result.
- [x] Commit the eighteenth slice.
- [x] Select nineteenth code slice with a concrete owner and regression test.
- [x] Implement nineteenth slice.
- [x] Run focused validation and `git diff --check` for the nineteenth slice.
- [x] Update changelog and report with the nineteenth slice result.
- [x] Commit the nineteenth slice.
- [x] Select twentieth code slice with a concrete owner and regression test.
- [x] Implement twentieth slice.
- [x] Run focused validation and `git diff --check` for the twentieth slice.
- [x] Update changelog and report with the twentieth slice result.
- [x] Commit the twentieth slice.

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
- `cd frontend && npm run test -- OverlayWindowHelpersRuntime --runInBand` -
  passed after eleventh slice; 1 suite and 12 tests passed, including the new
  malformed chat-window bounds regression test.
- `bin/windie docs list` - passed after eleventh-slice changelog/report
  updates; canonical navigation reported 83 page references validated.
- `git diff --check -- frontend/src/main/surfaces/overlay_window_helpers_runtime.cjs tests/frontend/OverlayWindowHelpersRuntime.test.cjs CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `cd frontend && npm run test -- SdkLiveTurnSurfaceController --runInBand` -
  passed after twelfth slice; 1 suite and 10 tests passed, including the new
  invalid SDK live-turn response bounds regression test.
- `bin/windie docs list` - passed after twelfth-slice changelog/report
  updates; canonical navigation reported 83 page references validated.
- `git diff --check -- frontend/src/main/sdk/sdk_live_turn_surface_controller.cjs tests/frontend/SdkLiveTurnSurfaceController.test.cjs CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `cd frontend && npm run test -- ExtensionManifest McpRuntime --runInBand` -
  passed after thirteenth slice; 2 suites and 10 tests passed, including the
  new canonical MCP timeout precedence regressions.
- `bin/windie docs list` - passed after thirteenth-slice changelog/report
  updates; canonical navigation reported 83 page references validated.
- `git diff --check -- frontend/src/main/extensions/extension_manifest.cjs frontend/src/main/extensions/mcp_runtime.cjs tests/frontend/ExtensionManifest.test.cjs tests/frontend/McpRuntime.test.cjs CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `cd frontend && npm run test -- OverlayChatboxHandler --runInBand` - passed
  after fourteenth slice; 1 suite and 7 tests passed, including the new
  malformed chat-window dimension regression test.
- `bin/windie docs list` - passed after fourteenth-slice changelog/report
  updates; canonical navigation reported 83 page references validated.
- `git diff --check -- frontend/src/main/surfaces/overlay_chatbox_handler.cjs tests/frontend/OverlayChatboxHandler.test.cjs CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `cd frontend && npm run test -- OverlayWindowHelpersRuntime --runInBand` -
  passed after fifteenth slice; 1 suite and 14 tests passed, including the new
  malformed response-window size regressions.
- `bin/windie docs list` - passed after fifteenth-slice changelog/report
  updates; canonical navigation reported 83 page references validated.
- `git diff --check -- frontend/src/main/surfaces/overlay_window_helpers_runtime.cjs tests/frontend/OverlayWindowHelpersRuntime.test.cjs CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `cd frontend && npm run test -- OverlayWindowHelpersRuntime --runInBand` -
  passed after sixteenth slice; 1 suite and 16 tests passed, including the new
  malformed chat visual-anchor resize regressions.
- `bin/windie docs list` - passed after sixteenth-slice changelog/report
  updates; canonical navigation reported 83 page references validated.
- `git diff --check -- frontend/src/main/surfaces/overlay_window_helpers_runtime.cjs tests/frontend/OverlayWindowHelpersRuntime.test.cjs CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `cd frontend && npm run test -- WindowSuppressionRuntime --runInBand` -
  passed after seventeenth slice; 1 suite and 10 tests passed, including the
  new malformed screenshot suppression bounds regressions.
- `bin/windie docs list` - passed after seventeenth-slice changelog/report
  updates; canonical navigation reported 83 page references validated.
- `git diff --check -- frontend/src/main/surfaces/window_suppression_runtime.cjs tests/frontend/WindowSuppressionRuntime.test.cjs CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `cd frontend && npm run test -- DisplayAffinityRuntime --runInBand` -
  passed after eighteenth slice; 1 suite and 19 tests passed, including the
  new malformed display-affinity bounds regressions.
- `bin/windie docs list` - passed after eighteenth-slice changelog/report
  updates; canonical navigation reported 83 page references validated.
- `git diff --check -- frontend/src/main/surfaces/display_affinity_runtime.cjs tests/frontend/DisplayAffinityRuntime.test.cjs CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `cd frontend && npm run test -- SdkLiveTurnSurfaceController --runInBand` -
  passed after nineteenth slice; 1 suite and 11 tests passed, including the
  new non-positive SDK live-turn response bounds regression.
- `bin/windie docs list` - passed after nineteenth-slice changelog/report
  updates; canonical navigation reported 83 page references validated.
- `git diff --check -- frontend/src/main/sdk/sdk_live_turn_surface_controller.cjs tests/frontend/SdkLiveTurnSurfaceController.test.cjs CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
  - passed.
- `cd frontend && npm run test -- ExtensionManifest AgentCapabilityHandshake --runInBand`
  - passed after twentieth slice; 2 suites and 11 tests passed, including the
    new blank extension skill priority and non-numeric prompt-layer priority
    regressions.
- `bin/windie docs list` - passed after twentieth-slice changelog/report
  updates; canonical navigation reported 83 page references validated.
- `git diff --check -- frontend/src/main/extensions/extension_manifest.cjs frontend/src/main/sdk/agent_definition.cjs tests/frontend/ExtensionManifest.test.cjs tests/frontend/AgentCapabilityHandshake.test.cjs CHANGELOG.md docs/plans/2026-06-10-test-backed-maintenance-hardening-report.md`
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
- Slice 11 owner: Electron main overlay window helpers own dependent response
  overlay and context-label placement from current chat-window geometry and the
  compact visual anchor.
- Slice 11 failure mode: malformed current chat-window bounds with non-finite
  fields such as `height: Infinity` could be used during visual-anchor
  adjustment and propagate invalid dependent overlay coordinates.
- Slice 11 change: dependent overlay placement now normalizes current
  chat-window bounds to finite rounded `x`, `y`, `width`, and `height` fields
  before applying the compact visual anchor. Malformed bounds are dropped so
  response/context overlays use their fallback placement path.
- Slice 11 inspection: no renderer layout contract, IPC channel, screenshot
  lease policy, native window producer, or persisted data shape changed. Valid
  chat-window bounds still keep the existing visual-anchor and bottom-edge
  behavior.
- Slice 12 owner: Electron main SDK live-turn surface controller owns applying
  SDK `currentTurn.presentation.overlayIntent` to the native response overlay
  window while preserving stale-guard and idempotent signature behavior.
- Slice 12 failure mode: malformed response bounds from the injected bounds
  provider could reach `responseWindow.setBounds(...)` because the controller
  only coerced bounds for the idempotency signature, not for native mutation.
- Slice 12 change: visible SDK live-turn intents now normalize response overlay
  bounds to finite numeric `x`, `y`, `width`, and `height` before computing the
  idempotency signature, logging dimensions, or mutating the native window.
  Invalid bounds fail fast with `invalid-response-bounds`.
- Slice 12 inspection: no SDK current-turn projection contract, renderer layout
  state, IPC channel, stale-guard semantics, or persisted data shape changed.
  Valid bounds still apply immediately and repeated identical SDK snapshots
  still no-op through the existing signature path.
- Slice 13 owner: Electron main extension/MCP runtime owns reading repo-level
  `mcps/<id>/mcp.json` specs and normalizing MCP server specs used for tool
  discovery and execution.
- Slice 13 failure mode: MCP timeout normalization used
  `server.timeout_ms || server.timeoutMs`, so an explicit canonical
  `timeout_ms` value such as `0` was discarded when a camelCase fallback was
  present.
- Slice 13 change: MCP timeout normalization now reads canonical `timeout_ms`
  when the key is present and falls back to `timeoutMs` only when it is absent.
  The existing finite-number behavior and runtime defaults are otherwise
  preserved.
- Slice 13 inspection: no MCP manifest shape, client tool manifest shape,
  sidecar tool payload, backend manifest validation, or persisted data changed.
  The fix only tightens Electron main's MCP server-spec normalization boundary.
- Slice 14 owner: Electron main chatbox overlay handler owns user-initiated
  chatbox movement and the display-affinity lookup for the moved native window.
- Slice 14 failure mode: malformed chat-window dimensions from `getSize()`
  such as `Infinity` or `NaN` could pass through move-target display-affinity
  resolution because coordinate validation only covered the requested `x` and
  `y` values.
- Slice 14 change: chatbox move now normalizes current native window width and
  height to finite positive integers before resolving the target display
  affinity, preserving valid sizes and the previous minimum-size fallback.
- Slice 14 inspection: no renderer drag contract, IPC payload, persisted
  position shape, display-affinity producer, or dependent overlay placement
  path changed. The fix only tightens Electron main's geometry input boundary
  during chatbox moves.
- Slice 15 owner: Electron main overlay window helpers own response overlay
  repositioning and fallback response bounds from native response-window and
  chat-window sizes.
- Slice 15 failure mode: malformed response-window sizes from `getSize()` such
  as `Infinity` or `NaN` could flow into response overlay repositioning or
  fallback placement before the overlay bounds helper calculated native
  `setBounds(...)` values.
- Slice 15 change: response overlay repositioning and fallback placement now
  normalize native size reads to finite positive dimensions, preserving valid
  sizes, using the chat/default width fallback for invalid fallback widths, and
  preserving the compact awaiting height floor.
- Slice 15 inspection: no renderer layout contract, IPC payload, SDK
  projection, display-affinity producer, or response overlay visibility policy
  changed. The fix only tightens Electron main's native response-window size
  boundary before bounds calculation.
- Slice 16 owner: Electron main overlay window helpers own chat-window
  visual-anchor frame resizing, bottom-preserving bounds updates, and manual
  drag bottom-edge bookkeeping.
- Slice 16 failure mode: malformed chat-window native sizes, current bounds,
  or visual-anchor heights such as `Infinity` or `NaN` could flow into
  `setBounds(...)`, `setSize(...)`, or manual bottom-edge calculations through
  loose numeric coercion.
- Slice 16 change: chat visual-anchor resize paths now normalize native sizes,
  current bounds coordinates, current bounds dimensions, and requested anchor
  heights before calculating Electron window geometry. Valid values preserve
  existing bottom-anchor and fixed-frame behavior.
- Slice 16 inspection: no renderer layout contract, IPC payload, SDK
  projection, display-affinity producer, response overlay visibility policy, or
  persisted manual position shape changed. The fix only tightens Electron
  main's native chat-window geometry boundary.
- Slice 17 owner: Electron main window suppression runtime owns temporarily
  moving the main window offscreen for screenshot capture and restoring its
  remembered native bounds afterward.
- Slice 17 failure mode: malformed main-window native bounds with non-finite
  coordinates or dimensions could be reused when creating offscreen screenshot
  bounds or remembered for later restore, allowing invalid geometry to reach
  Electron `setBounds(...)`.
- Slice 17 change: screenshot suppression now normalizes native bounds to
  finite rounded coordinates and positive dimensions before offscreen
  placement, offscreen checks, restore storage, or restore mutation. Invalid
  bounds objects still fail quietly without native mutation.
- Slice 17 inspection: no screenshot lease policy, IPC payload, sidecar
  screenshot request shape, renderer state, or persisted data changed. The fix
  only tightens Electron main's temporary native-window geometry boundary.
- Slice 18 owner: Electron main display-affinity runtime owns mapping native
  surface bounds to monitor affinity and positioning main windows inside a
  target display work area.
- Slice 18 failure mode: malformed native surface bounds or caller-provided
  display work areas with non-finite fields could reach Electron display
  matching or native `setBounds(...)` through fallback-to-zero numeric
  coercion.
- Slice 18 change: display-affinity bounds normalization now rejects
  non-finite coordinates or dimensions, normalizes valid fractional window
  bounds before `screen.getDisplayMatching(...)`, and refuses to center windows
  against malformed target display areas.
- Slice 18 inspection: no IPC payload, sidecar screenshot request shape,
  renderer state, stored affinity shape, or display source ordering changed.
  The fix only tightens Electron main's display-affinity geometry boundary.
- Slice 19 owner: Electron main SDK live-turn surface controller owns applying
  SDK current-turn response overlay intent to the native response overlay
  window.
- Slice 19 failure mode: SDK response overlay bounds with finite but
  non-positive dimensions could still reach `responseWindow.setBounds(...)`
  because the existing guard only rejected non-finite fields.
- Slice 19 change: SDK live-turn response bounds now require positive width
  and height before computing the visible intent signature, logging dimensions,
  or mutating the native response window.
- Slice 19 inspection: no SDK current-turn projection contract, renderer
  layout state, IPC payload, stale-guard semantics, or persisted data shape
  changed. The fix only tightens Electron main's native response-window
  dimension boundary for SDK overlay intents.
- Slice 20 owner: Electron main extension discovery owns skill frontmatter
  priority normalization, and the SDK-shaped agent definition builder owns
  client prompt-layer priority normalization before backend prompt assembly.
- Slice 20 failure mode: blank skill frontmatter priorities and non-numeric
  ad hoc prompt-layer priorities could become numeric `0` through JavaScript
  coercion, silently elevating malformed prompt layers above their documented
  default priority.
- Slice 20 change: prompt-layer priority normalization now accepts only finite
  numbers or nonblank numeric strings, defaulting extension skills to `75` and
  ad hoc client prompt layers to `100` for blank, null, boolean, object, or
  non-finite values.
- Slice 20 inspection: no prompt-layer payload shape, backend prompt assembly,
  extension contribution layout, persisted data, sidecar tool manifest, or MCP
  discovery contract changed. The fix only tightens Electron main/SDK prompt
  priority normalization before existing prompt-layer projection.

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
- Treat malformed current chat-window bounds as Electron main geometry boundary
  hardening. No persisted data, IPC payload, sidecar RPC payload, renderer
  layout contract, or native window producer changed, so no migration is
  required.
- Treat malformed SDK live-turn response bounds as Electron main native-window
  boundary hardening. No persisted data, IPC payload, SDK projection shape,
  renderer layout contract, or stale-guard contract changed, so no migration is
  required.
- Treat MCP timeout precedence as Electron main extension-spec normalization
  hardening. No persisted data, MCP manifest shape, client tool manifest shape,
  sidecar payload, or backend validation contract changed, so no migration is
  required.
- Treat malformed chat-window move dimensions as Electron main geometry
  boundary hardening. No persisted data, IPC payload, renderer drag contract,
  display-affinity producer, or dependent overlay placement path changed, so no
  migration is required.
- Treat malformed response-window sizes as Electron main geometry boundary
  hardening. No persisted data, IPC payload, renderer layout contract, SDK
  projection, display-affinity producer, or visibility policy changed, so no
  migration is required.
- Treat malformed chat-window visual-anchor resize geometry as Electron main
  geometry boundary hardening. No persisted data, IPC payload, renderer layout
  contract, SDK projection, display-affinity producer, visibility policy, or
  manual position shape changed, so no migration is required.
- Treat malformed screenshot suppression bounds as Electron main geometry
  boundary hardening. No persisted data, IPC payload, sidecar screenshot
  request shape, renderer state, screenshot lease policy, or restore state
  schema changed, so no migration is required.
- Treat malformed display-affinity bounds as Electron main geometry boundary
  hardening. No persisted data, IPC payload, sidecar screenshot request shape,
  renderer state, stored affinity shape, or display source ordering changed, so
  no migration is required.
- Treat non-positive SDK live-turn response bounds as Electron main
  native-window boundary hardening. No persisted data, IPC payload, SDK
  projection shape, renderer layout contract, or stale-guard contract changed,
  so no migration is required.
- Treat malformed prompt-layer priorities as Electron main/SDK prompt input
  normalization hardening. No persisted data, prompt-layer payload shape,
  backend prompt assembly, sidecar payload, tool manifest, or extension package
  layout changed, so no migration is required.

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
- `28b4a2bdf` - `fix(frontend-overlays): drop malformed chat bounds`
- `87ac1933c` - `fix(frontend-sdk): reject invalid live surface bounds`
- `13bc263d2` - `fix(frontend-extensions): preserve mcp timeout precedence`
- `0283435eb` - `fix(frontend-overlays): normalize chatbox move dimensions`
- `14ecc6bf3` - `fix(frontend-overlays): normalize response window dimensions`
- `1ac295489` - `fix(frontend-overlays): normalize chat anchor resize geometry`
- `6983a65b9` - `fix(frontend-surfaces): normalize screenshot suppression bounds`
- `76c3a3c36` - `fix(frontend-surfaces): normalize display affinity bounds`
- `bb872526e` - `fix(frontend-sdk): reject non-positive live surface bounds`
- `2ebb12860` - `fix(frontend-agent): default malformed prompt priorities`

## Remaining Candidates

- Continue with another focused hardening target outside the existing dirty
  sidecar bridge changes unless that bridge work becomes the highest-evidence
  path.
- Clean up the remaining stale packaged backend override mention in
  `docs/operations/sidecar_runtime_packaging.md` after reconciling that file's
  pre-existing dirty edits.
