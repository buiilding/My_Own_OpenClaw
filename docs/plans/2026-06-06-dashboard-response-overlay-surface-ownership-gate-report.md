---
summary: "Realtime implementation report for the dashboard response overlay surface ownership gate."
read_when:
  - When continuing or reviewing the dashboard response overlay surface ownership gate implementation.
  - When debugging whether dashboard, onboarding, or chat pill owns floating response overlay visibility.
title: "Dashboard Response Overlay Surface Ownership Gate Report"
---

# Dashboard Response Overlay Surface Ownership Gate Report

Date: 2026-06-06

Plan: [Dashboard Response Overlay Surface Ownership Gate Plan](2026-06-06-dashboard-response-overlay-surface-ownership-gate-plan.md)

Status: complete.

## Current Scope

Implement the approved Electron-main surface ownership gate so SDK live-turn
overlay intent, renderer responsebox size reports, and phase fallback/restore
cannot show the floating response overlay while the dashboard/onboarding surface
owns presentation.

## Worktree Notes

- Pre-existing dirty files observed before implementation:
  - `CHANGELOG.md`
  - `packages/windie-sdk-js/cjs/index.js`
  - `packages/windie-sdk-js/cjs/runtime/ConversationRuntime.js`
  - `packages/windie-sdk-js/cjs/runtime/WindieAgent.js`
  - `packages/windie-sdk-js/cjs/runtime/DefaultTurnResourceResolvers.js`
  - `packages/windie-sdk-js/cjs/runtime/TurnInputPipeline.js`
- This implementation must not touch those SDK/CJS files.

## Checklist

- [x] Recover approved plan.
- [x] Inspect current Electron main SDK live-turn, responsebox, phase, and
      surface-runtime paths.
- [x] Add pure floating response overlay surface gate.
- [x] Gate SDK live-turn native overlay show.
- [x] Gate renderer responsebox size show.
- [x] Gate phase fallback and terminal restore show.
- [x] Gate response-only screenshot restore.
- [x] Add focused tests.
- [x] Update docs.
- [x] Run validation.
- [x] Perform final design inspection.

## Inspection Log

### Initial Inspection

- `surface_runtime.cjs` already tracks `primarySurface` and updates it to
  `dashboard` / `onboarding` on `showMainWindow(...)`, and to `chat` on
  successful `showChatWindow(...)`.
- `sdk_live_turn_surface_controller.cjs` can show the response window from SDK
  `presentation.overlayIntent` without checking `primarySurface`.
- `overlay_responsebox_handler.cjs` can show the response window from renderer
  `set-responsebox-size` without checking `primarySurface`.
- `response_overlay_phase_handler.cjs` can show from renderer-send-preflight
  fallback and terminal restore without checking `primarySurface`.
- The fix should stay in Electron main; SDK projection semantics are already
  correct for content intent.

### Implementation Pass

- Added `canShowFloatingResponseOverlay(...)` in
  `response_overlay_visibility_policy.cjs`.
- Exposed `surfaceRuntime.canShowFloatingResponseOverlay()` from
  `surface_runtime.cjs`, backed by `primarySurface`, `mainWindow`, and
  `chatWindow`.
- Wired the gate into:
  - SDK live-turn native overlay mirroring;
  - renderer `set-responsebox-size` handling;
  - phase fallback and terminal restore;
  - response-only screenshot restore.
- Suppressed visible overlay attempts set native response visibility false, hide
  the response window if needed, sync the context label, and clear the active
  response overlay guard.
- Did not change SDK files or SDK current-turn projection semantics.

### Final Inspection

- Remaining response overlay native show paths were searched with:
  `rg -n "showResponseWindow|showResponseWindowInactive|showResponseWindowWhenChatVisible|showResponseWindowForLiveTurnIntent|responseWindow\\.show|responseWindow\\.showInactive|setResponseOverlayVisibilityState\\(true\\)" frontend/src/main tests/frontend docs`.
- SDK live-turn intent, renderer responsebox size, phase fallback, terminal
  restore, and response-only screenshot restore are now gated.
- `window_visibility_runtime.cjs` can restore response overlay while showing the
  chat window; this is intentionally out of the suppression rule because
  `showChatWindow(...)` is the explicit dashboard-to-pill ownership handoff.
- `main_window_runtime.cjs` debug response-window show is limited to
  `ENABLE_OS_TOOL_GHOST_DEBUG` startup/debug behavior and is outside the normal
  live-turn response overlay path.
- `overlay_window_helpers_runtime.cjs` remains the low-level show helper; its
  normal callers now pass through the gate or explicit chat handoff.

## Validation Log

- `cd frontend && npm run test -- SdkLiveTurnSurfaceController` - pass.
- `cd frontend && npm run test -- OverlayResponseboxHandler` - pass.
- `cd frontend && npm run test -- ResponseOverlayPhaseHandler` - pass.
- `cd frontend && npm run test -- ResponseOverlayVisibilityPolicy SurfaceRuntime WindowVisibilityRuntime` - pass.
- `cd frontend && npm run test -- OverlayVisibilityHandler` - pass.
- `cd frontend && npm run test -- OverlayPhaseIpcRuntime` - pass.
- `cd frontend && npm run test -- SdkLiveTurnSurfaceController OverlayResponseboxHandler ResponseOverlayPhaseHandler ResponseOverlayVisibilityPolicy SurfaceRuntime WindowVisibilityRuntime OverlayVisibilityHandler OverlayPhaseIpcRuntime` - pass, 8 suites / 111 tests.
- `bin/windie docs list` - pass, canonical navigation validated.
- `git diff --check` - pass.

## Decisions

- Do not change SDK files. The gate is native surface policy.
- Clear active response overlay guard on dashboard/onboarding suppression so a
  hidden dashboard-owned state is not treated as a protected floating overlay.
- Gate response-only screenshot restore as part of final inspection because it
  is another native response-window show path, even though the normal screenshot
  hidden-surface resolver should choose `main-window` when the dashboard is
  visible.

## Blockers

None.
