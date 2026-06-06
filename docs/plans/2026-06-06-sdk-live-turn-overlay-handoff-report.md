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
- [x] Add dev-mode live-surface trace logs for SDK/current-turn ingress,
  renderer projection application, typing/response visibility, window policy,
  tool leases, and screenshot protection.
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
- Follow-up debugging needs one grep-friendly event stream because the relevant
  state crosses SDK current-turn projection, Electron main window policy,
  renderer view-model state, responsebox size IPC, and SDK local-tool leases.
  Existing logs were split across `[AssistantTrace]`, `[ResponseOverlayWindow]`,
  `[ChatPillVisibility]`, and debug-stream renderer logs.
- Startup-log inspection after adding `[LiveSurfaceTrace]` showed healthy main
  idle state for the pill/overlay, but renderer view-model and typing decisions
  were still missing from the `npm run electron:dev` terminal because renderer
  console output was not forwarded there.
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
- `[LiveSurfaceTrace]` is dev-mode telemetry, enabled automatically by
  `npm run electron:dev` and manually by `WINDIE_DEBUG_LIVE_SURFACE=1`. It logs
  ids, lengths, booleans, modes, counts, and window policy state, not raw text,
  file contents, screenshot pixels, or credentials.
- Renderer `[LiveSurfaceTrace]` now crosses the existing preload IPC allowlist
  through `live-surface-trace`, and Electron main prints the sanitized payload.
  The channel is diagnostics-only and must not become a UI state source.
- SDK live-turn surface handling now logs `typing.show` / `typing.hide` from
  SDK current-turn presentation transitions, while the minimal response overlay
  logs `typing.rendered.show` / `typing.rendered.hide` from the actual typing
  indicator render path.
- SDK response-overlay intent application is idempotent for unchanged visible
  window signatures, so repeated token snapshots do not repeatedly call native
  response-window resize/show.

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
- `node -c frontend/src/main/live_surface_trace_runtime.cjs && node -c frontend/src/main/ipc.cjs && node -c frontend/src/main/sdk_live_turn_surface_controller.cjs && node -c frontend/src/main/overlay_responsebox_handler.cjs && node -c frontend/src/main/response_overlay_phase_handler.cjs && node -c frontend/src/main/surface_runtime.cjs && node -c frontend/src/main/window_platform_policy.cjs && node -c frontend/src/main/overlay_topmost_runtime.cjs && node -c frontend/scripts/electron-launcher.cjs` - passed.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/LiveSurfaceTraceRuntime.test.cjs ../tests/frontend/ElectronLauncher.test.cjs ../tests/frontend/SdkLiveTurnSurfaceController.test.cjs ../tests/frontend/OverlayResponseboxHandler.test.cjs ../tests/frontend/ResponseOverlayPhaseHandler.test.cjs ../tests/frontend/SurfaceRuntime.test.cjs ../tests/frontend/ChatBoxResponse.state.test.jsx ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx --runInBand` - passed, 8 suites / 143 tests.
- `node -c frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js && node -c frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayWindowSync.js && node -c frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx` - failed because Node cannot syntax-check `.jsx` files in this package's ESM setup (`ERR_UNKNOWN_FILE_EXTENSION`); renderer coverage comes from Jest and TypeScript checks.
- `cd frontend && npm run lint` - failed on pre-existing unrelated unused-variable errors: `frontend/src/main/ipc.cjs:1401`, `frontend/src/main/ipc/ipc_query_send_runtime.cjs:5`, `frontend/src/main/ipc/ipc_query_send_runtime.cjs:6`, `frontend/src/renderer/features/chat/utils/message/messagePresentationPipeline.js:132`, and `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts:338`. Hook warnings introduced during trace wiring were fixed before final validation.
- `cd frontend && npm run typecheck` - passed after hook dependency cleanup.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/LiveSurfaceTraceRuntime.test.cjs ../tests/frontend/ElectronLauncher.test.cjs ../tests/frontend/SdkLiveTurnSurfaceController.test.cjs ../tests/frontend/OverlayResponseboxHandler.test.cjs ../tests/frontend/ResponseOverlayPhaseHandler.test.cjs ../tests/frontend/SurfaceRuntime.test.cjs ../tests/frontend/ChatBoxResponse.state.test.jsx ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx --runInBand` - passed, 8 suites / 143 tests after hook dependency cleanup.
- `git diff --check -- . ':(exclude)AGENTS.md'` - passed.
- `node -c frontend/src/main/live_surface_trace_runtime.cjs && node -c frontend/src/main/ipc.cjs && node -c frontend/src/preload.js` - passed after adding renderer trace IPC forwarding.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/LiveSurfaceTraceRuntime.test.cjs ../tests/frontend/PreloadIpcChannels.test.cjs ../tests/frontend/IpcChannels.test.ts ../tests/frontend/IpcBridge.test.ts --runInBand` - passed, 4 suites / 26 tests.
- `cd frontend && npm run typecheck` - passed after adding renderer trace IPC forwarding.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/LiveSurfaceTraceRuntime.test.cjs ../tests/frontend/ElectronLauncher.test.cjs ../tests/frontend/SdkLiveTurnSurfaceController.test.cjs ../tests/frontend/OverlayResponseboxHandler.test.cjs ../tests/frontend/ResponseOverlayPhaseHandler.test.cjs ../tests/frontend/SurfaceRuntime.test.cjs ../tests/frontend/ChatBoxResponse.state.test.jsx ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx --runInBand` - passed, 8 suites / 146 tests.
- `bin/windie docs list` - passed.
- `git diff --check -- . ':(exclude)AGENTS.md'` - passed.
- `cd frontend && npm run lint` - failed on pre-existing unrelated unused-variable errors: `frontend/src/main/ipc.cjs:1408`, `frontend/src/main/ipc/ipc_query_send_runtime.cjs:5`, `frontend/src/main/ipc/ipc_query_send_runtime.cjs:6`, `frontend/src/renderer/features/chat/utils/message/messagePresentationPipeline.js:132`, and `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts:338`.
- `node -c frontend/src/main/sdk_live_turn_surface_controller.cjs && node -c frontend/src/main/index.cjs` - passed after adding SDK typing transition logs and overlay-intent idempotency.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/SdkLiveTurnSurfaceController.test.cjs ../tests/frontend/ChatBoxResponse.state.test.jsx --runInBand` - passed, 2 suites / 33 tests.
- `cd frontend && npm run typecheck` - passed after adding SDK typing transition logs and rendered typing traces.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/SdkLiveTurnSurfaceController.test.cjs ../tests/frontend/ChatBoxResponse.state.test.jsx ../tests/frontend/OverlayResponseboxHandler.test.cjs ../tests/frontend/ResponseOverlayPhaseHandler.test.cjs ../tests/frontend/SurfaceRuntime.test.cjs ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx ../tests/frontend/LiveSurfaceTraceRuntime.test.cjs --runInBand` - passed, 7 suites / 132 tests.
- `bin/windie docs list` - passed.
- `git diff --check -- . ':(exclude)AGENTS.md'` - passed.
- `cd frontend && npm run lint` - failed only on pre-existing unrelated unused-variable errors: `frontend/src/main/ipc.cjs:1408`, `frontend/src/main/ipc/ipc_query_send_runtime.cjs:5`, `frontend/src/main/ipc/ipc_query_send_runtime.cjs:6`, `frontend/src/renderer/features/chat/utils/message/messagePresentationPipeline.js:132`, and `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts:338`.
- `node -c frontend/src/main/response_overlay_hit_test_runtime.cjs && node -c frontend/src/main/overlay_responsebox_handler.cjs && node -c frontend/src/main/sdk_live_turn_surface_controller.cjs && node -c frontend/src/main/response_overlay_phase_handler.cjs && node -c frontend/src/main/overlay_visibility_handler.cjs && node -c frontend/src/main/main_window_runtime.cjs` - passed after response-overlay hidden hit-test policy wiring.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/OverlayResponseboxHandler.test.cjs ../tests/frontend/SdkLiveTurnSurfaceController.test.cjs ../tests/frontend/ResponseOverlayPhaseHandler.test.cjs ../tests/frontend/OverlayVisibilityHandler.test.cjs ../tests/frontend/MainWindowRuntime.test.cjs ../tests/frontend/SurfaceRuntime.test.cjs --runInBand` - passed, 6 suites / 119 tests.
- `cd frontend && npm run typecheck` - passed after response-overlay hidden hit-test policy wiring.
- `bin/windie docs list` - passed after documenting response-overlay close/hide native policy.
- `git diff --check -- . ':(exclude)AGENTS.md'` - passed.
- `cd frontend && npm run lint` - failed only on pre-existing unrelated unused-variable errors: `frontend/src/main/ipc.cjs:1408`, `frontend/src/main/ipc/ipc_query_send_runtime.cjs:5`, `frontend/src/main/ipc/ipc_query_send_runtime.cjs:6`, `frontend/src/renderer/features/chat/utils/message/messagePresentationPipeline.js:132`, and `frontend/src/renderer/infrastructure/transcript/desktopConversationStore.ts:338`.

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
- Follow-up inspection confirmed `[LiveSurfaceTrace]` is emitted from SDK
  current-turn ingress, SDK overlay-intent handling, responsebox size IPC,
  phase resolution, renderer projection application, renderer view-model
  resolution, chat-pill mount/hit-test/send reset, pointer leases, screenshot
  leases, content protection, and topmost policy.
- Follow-up inspection confirmed renderer live-surface traces now use an
  allowlisted send channel, and main redacts raw strings, arrays, URLs, paths,
  image/screenshot/file fields, tokens, and content before printing terminal
  entries as `process: 'renderer'`.
- Follow-up inspection confirmed repeated identical SDK overlay intents return
  `idempotent-visible-intent` before native `setBounds` / `showInactive`, while
  mode, guard, turn, visibility, or bounds changes still apply normally.
- Follow-up inspection confirmed response overlay hide routes from renderer
  size dismissal, SDK hidden overlay intent, unguarded phase hidden mode,
  prevented native response-window close, and standalone screenshot-prep hiding
  now apply `setIgnoreMouseEvents(true, { forward: true })` before hiding the
  native response window.
- Follow-up inspection confirmed screenshot-only response overlay restore resets
  response-window hit testing with `setIgnoreMouseEvents(false)` before showing
  the restored overlay, while pointer-control lease behavior remains owned by
  `surface_runtime`.
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
