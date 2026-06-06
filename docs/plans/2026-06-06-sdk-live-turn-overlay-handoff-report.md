---
summary: "Realtime execution report for the SDK live-turn overlay handoff cleanup."
read_when:
  - When continuing or reviewing the SDK live-turn overlay handoff cleanup.
  - When debugging minimal chat pill typing state, response overlay flicker, dashboard-to-pill handoff, or SDK current-turn overlay ownership.
title: "SDK Live Turn Overlay Handoff Report"
---

# SDK Live Turn Overlay Handoff Report

Plan: [SDK Live Turn Overlay Handoff Plan](2026-06-06-sdk-live-turn-overlay-handoff-plan.md)

Status: complete.

## Intent

Implement the approved deletion-first cleanup so SDK live-turn presentation is
the only normal source for minimal chat pill typing state and response overlay
visibility/content after SDK `turn_started`.

## Checklist

- [x] Create execution report before runtime edits.
- [x] Remove renderer stale-turn rejection from current-turn storage.
- [x] Add latest SDK live-turn store/selector independent of active workspace.
- [x] Move minimal surfaces to the latest SDK live-turn selector.
- [x] Delete local send-latch and synthetic-message semantic fallback from the
  SDK-backed response overlay path.
- [x] Guard native response overlay show/hide with SDK turn guards.
- [x] Remove Electron phase-owned normal visibility for SDK-backed live turns.
- [x] Mirror SDK `overlayIntent` directly in Electron main so native response
  window visibility no longer waits for renderer size measurement.
- [x] Remove active-loop content protection from overlay window creation.
- [x] Remove renderer hover-owned normal chat-pill click-through toggling.
- [x] Stop renderer cleanup from sending same-turn hide requests during SDK
  awaiting-to-response transitions.
- [x] Keep normal macOS overlay windows capturable by using the floating
  topmost level and deleting creation-time overlay content protection.
- [x] Add/update focused tests.
- [x] Run focused validation.
- [x] Perform final design inspection and classify any remaining paths.
- [x] Update docs/changelog if behavior or contracts changed.
- [x] Commit scoped changes.

## Findings

- Pre-existing dirty/untracked work before implementation: `AGENTS.md` and
  `scratch/`.
- The plan file itself was created before this report:
  `docs/plans/2026-06-06-sdk-live-turn-overlay-handoff-plan.md`.
- SDK `CurrentTurnProjection.presentation.overlayIntent` already has the needed
  `awaiting` / `response` / `hidden` contract.
- Renderer `useConversationRuntimeProjectionStream` currently drops non-awaiting
  current-turn projections before storing them when local stream tracking
  considers the turn stale.
- Minimal response overlay currently reads `selectChatBoxState`, which is
  active-workspace scoped.
- Minimal response overlay view model still has a local send latch and
  synthetic-message projection fallback.
- Responsebox native hide currently ignores stale hides only when both incoming
  and active guards exist, so an unguarded hide can still hide an active guarded
  response.
- Follow-up inspection after live dashboard testing found one remaining old
  native show gate: SDK-backed responsebox show/resize requests still called
  `showResponseWindowWhenChatVisible()`, so the native response window could
  stay hidden while the dashboard was visible and the minimal chat pill window
  was hidden.
- Follow-up runtime inspection found a remaining bootstrap deadlock: active SDK
  streaming could be healthy while the hidden response renderer failed to
  measure and send `set-responsebox-size`, so Electron main never showed the
  native response BrowserWindow.
- Follow-up runtime inspection found an old active-loop content-protection
  mapping in overlay window creation. Recreated chat/response overlay windows
  inherited screenshot invisibility from phase state instead of only from the
  screenshot-tool lease.
- The chat pill normal hit-test path was still renderer hover-driven: the
  renderer set the pill pass-through on mount/leave and clickable on hover.
  That made interactivity a renderer-local visual state instead of a narrow
  pointer-tool lease.
- Live log inspection after the main-process SDK mirror showed a same-turn
  race: SDK emitted `overlayIntent.mode=response` and main showed the response
  window, then the response renderer sent `set-responsebox-size` with
  `visible:false` and the same `stale_guard_ref`. The hide came from a React
  cleanup effect that depended on the `reportOverlaySize` callback, so callback
  identity changes during awaiting-to-response transitions looked like an
  unmount.
- Manual macOS screenshot testing showed the chat pill was visible to the user
  but missing from `Shift-Cmd-Ctrl-4` capture. The remaining cause was normal
  overlay topmost policy using the macOS `screen-saver` level, which can be
  compositor-visible but system-screenshot-invisible. Creation-time overlay
  content-protection parameters also kept the old protection path available,
  even though bootstrap passed `false`.
- `useConversationRuntimeProjectionStream` can store SDK current-turn
  projections before stale-turn side-effect guards without changing dashboard
  transcript row ownership.
- Minimal surfaces can read a latest SDK live-turn slot while dashboard
  selectors remain active-workspace scoped.

## Decisions

- Keep dashboard transcript selectors workspace-scoped.
- Add a live-turn-specific renderer store slot for SDK current-turn projection
  so minimal surfaces do not depend on dashboard active workspace.
- Keep stale-turn logic only for derived stream-tracking side effects.
- Treat pre-SDK no-current-turn awaiting as a separate fallback state; valid SDK
  presentation must not use the local latch or synthetic-message semantic path.
- Keep legacy synthetic-message projection only for no-presentation test
  fixtures or pre-SDK fallback. Valid SDK `presentation` now renders only SDK
  entries.
- Treat an active responsebox guard as proof of SDK-backed live overlay
  ownership for native hide protection. Unguarded hides and phase-idle hides are
  ignored while that guard is active.
- SDK-backed responsebox show/resize uses the live-turn response-window intent
  directly via `showResponseWindowInactive`; the old chat-visible gate remains
  only in phase/preflight or chat-window restore paths.
- Electron main now mirrors SDK `currentTurn.presentation.overlayIntent`
  directly on each SDK snapshot. Renderer size IPC remains as guarded bounds
  refinement, not the prerequisite for showing the response BrowserWindow.
- Active-loop phase state no longer enables content protection when chat or
  response overlay windows are created. Content protection is lease-scoped to
  SDK-local `screenshot` execution.
- The chat pill is clickable/draggable by default. SDK-local
  `mouse_control`/`scroll_control` pointer leases are the only normal path that
  makes pill/overlay windows click-through.
- Response overlay renderer cleanup now sends a hide only on actual unmount or
  explicit invisible state. SDK awaiting-to-response transitions keep the same
  turn guard visible and only send guarded resize/show refinement.
- Normal macOS chat/response overlays use the capturable `floating` topmost
  level. Screenshot invisibility is owned only by the SDK screenshot-capture
  lease; overlay creation no longer accepts or applies content protection.

## Validation Log

- `node -c frontend/src/main/overlay_responsebox_handler.cjs && node -c frontend/src/main/response_overlay_phase_handler.cjs && node -c frontend/src/main/surface_runtime.cjs` - passed.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/ChatSelectors.test.js ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx ../tests/frontend/ChatBoxResponse.state.test.jsx ../tests/frontend/OverlayResponseboxHandler.test.cjs ../tests/frontend/ResponseOverlayPhaseHandler.test.cjs --runInBand` - passed, 5 suites / 108 tests.
- `cd frontend && npm run typecheck` - passed.
- `bin/windie docs list` - passed.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/ChatSurfaceController.test.jsx ../tests/frontend/ChatSelectors.test.js ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx ../tests/frontend/ChatBoxResponse.state.test.jsx ../tests/frontend/OverlayResponseboxHandler.test.cjs ../tests/frontend/ResponseOverlayPhaseHandler.test.cjs --runInBand` - passed, 7 suites / 210 tests.
- `git diff --check -- . ':(exclude)AGENTS.md'` - passed.
- `node -c frontend/src/main/overlay_responsebox_handler.cjs && node -c frontend/src/main/overlay_phase_ipc_runtime.cjs && node -c frontend/src/main/index.cjs` - passed after removing the chat-visible gate from SDK-backed responsebox show.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/OverlayResponseboxHandler.test.cjs ../tests/frontend/OverlayPhaseIpcRuntime.test.cjs ../tests/frontend/ResponseOverlayPhaseHandler.test.cjs --runInBand` - passed, 3 suites / 39 tests.
- `node -c frontend/src/main/sdk_live_turn_surface_controller.cjs && node -c frontend/src/main/ipc.cjs && node -c frontend/src/main/index.cjs && node -c frontend/src/main/main_process_bootstrap_runtime.cjs && node -c frontend/src/main/main_window_runtime.cjs && node -c frontend/src/main/surface_runtime.cjs` - passed.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/SdkLiveTurnSurfaceController.test.cjs ../tests/frontend/MainProcessBootstrapRuntime.test.cjs ../tests/frontend/MainWindowRuntime.test.cjs ../tests/frontend/SurfaceRuntime.test.cjs ../tests/frontend/ResponseOverlayPhaseHandler.test.cjs ../tests/frontend/OverlayResponseboxHandler.test.cjs ../tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx --runInBand` - passed, 7 suites / 133 tests.
- `node -c frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayWindowSync.js` - passed.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/ChatBoxResponse.state.test.jsx ../tests/frontend/OverlayResponseboxHandler.test.cjs ../tests/frontend/SdkLiveTurnSurfaceController.test.cjs --runInBand` - passed, 3 suites / 45 tests.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/ChatBoxResponse.state.test.jsx ../tests/frontend/OverlayResponseboxHandler.test.cjs ../tests/frontend/SdkLiveTurnSurfaceController.test.cjs ../tests/frontend/MainProcessBootstrapRuntime.test.cjs ../tests/frontend/MainWindowRuntime.test.cjs ../tests/frontend/SurfaceRuntime.test.cjs ../tests/frontend/ResponseOverlayPhaseHandler.test.cjs ../tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx --runInBand` - passed, 8 suites / 157 tests.
- `cd frontend && npm run typecheck` - passed.
- `bin/windie docs list` - passed.
- `git diff --check -- . ':(exclude)AGENTS.md'` - passed.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/OverlayTopmostRuntime.test.cjs ../tests/frontend/WindowPlatformPolicy.test.cjs ../tests/frontend/MainWindowRuntime.test.cjs ../tests/frontend/MainProcessBootstrapRuntime.test.cjs ../tests/frontend/OverlayWindowHelpersRuntime.test.cjs ../tests/frontend/SurfaceRuntime.test.cjs --runInBand` - passed, 6 suites / 83 tests.
- `node -c frontend/src/main/overlay_topmost_runtime.cjs && node -c frontend/src/main/main_window_runtime.cjs && node -c frontend/src/main/main_process_bootstrap_runtime.cjs` - passed.
- `cd frontend && npm run typecheck` - passed.
- `bin/windie docs list` - passed.

## Commits

- Implementation commit: this report snapshot is included in the scoped commit
  for the SDK live-turn overlay handoff cleanup.

## Inspection Log

- Initial inspection read the approved plan, SDK projection builder, renderer
  current-turn intake, chat store workspace state, minimal response overlay
  view model/window sync, responsebox size handler, phase handler, and focused
  tests.
- Implementation inspection confirmed `windie:current-turn` storage now happens
  before stale-turn side-effect guards.
- Implementation inspection confirmed minimal pill and minimal response overlay
  read `latestCurrentTurnProjection` instead of active-workspace-only
  projection state.
- Implementation inspection confirmed the SDK presentation path in response
  overlay does not use local send latch or synthetic-message entry fallback.
- Implementation inspection confirmed responsebox hides from older or missing
  guards are ignored while an active guard exists.
- Implementation inspection confirmed phase idle hide is ignored while a
  guarded SDK overlay is active; phase active-loop show remains only as
  renderer-send-preflight fallback before SDK intent arrives.
- Follow-up inspection confirmed `handleSetResponseboxSize` no longer accepts
  or calls `showResponseWindowWhenChatVisible`; `overlay_phase_ipc_runtime`
  wires SDK-backed responsebox show/resize to `showResponseWindowInactive`
  instead.
- Follow-up inspection confirmed `sdk_live_turn_surface_controller.cjs` is the
  main-process mirror from SDK `overlayIntent` to native response window
  visibility, bounds, turn guard, and stale-hide protection.
- Follow-up inspection confirmed `createWindowBootstrapRuntime` no longer passes
  creation-time overlay content-protection state, and `createChatWindow` /
  `createResponseWindow` no longer accept or apply that path. Screenshot
  invisibility now comes from `beginScreenshotCaptureLease` only.
- Follow-up inspection confirmed `MinimalChatPill` reports normal hit-test
  active state on mount and no longer toggles click-through on hover or when
  opening settings.
- Follow-up inspection confirmed phase active-loop logs now defer native show
  to SDK overlay intent, not renderer ownership.
- Follow-up inspection confirmed `useResponseOverlayWindowSync` keeps the
  latest size reporter in a ref for unmount cleanup, so callback dependency
  changes no longer send hide requests during same-turn SDK transitions.
- Follow-up inspection confirmed normal macOS overlay promotion uses the
  capturable `floating` level; `screen-saver` remains only in non-mac fallback
  tests and policy.
- Final grep classified remaining old-path names as:
  `selectChatBoxState` for dashboard/legacy selectors only,
  `useLocalSendLatch` for no-SDK/pre-turn fallback only,
  `buildCurrentTurnMessagesFromProjection` for no-presentation fallback/tests
  only, stale-turn guard for derived side effects only, and phase show/hide for
  diagnostics/preflight or unguarded legacy idle only.

## Remaining Risks

- Runtime validation in the actual Electron app is still useful because the
  change targets a multi-window timing race. The focused tests cover the
  ownership and stale-guard failure classes.
