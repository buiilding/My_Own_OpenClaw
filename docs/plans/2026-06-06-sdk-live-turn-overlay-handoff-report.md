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

## Validation Log

- `node -c frontend/src/main/overlay_responsebox_handler.cjs && node -c frontend/src/main/response_overlay_phase_handler.cjs && node -c frontend/src/main/surface_runtime.cjs` - passed.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/ChatSelectors.test.js ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx ../tests/frontend/ChatBoxResponse.state.test.jsx ../tests/frontend/OverlayResponseboxHandler.test.cjs ../tests/frontend/ResponseOverlayPhaseHandler.test.cjs --runInBand` - passed, 5 suites / 108 tests.
- `cd frontend && npm run typecheck` - passed.
- `bin/windie docs list` - passed.
- `cd frontend && npm run test:ci -- --runTestsByPath ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/ChatSurfaceController.test.jsx ../tests/frontend/ChatSelectors.test.js ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx ../tests/frontend/ChatBoxResponse.state.test.jsx ../tests/frontend/OverlayResponseboxHandler.test.cjs ../tests/frontend/ResponseOverlayPhaseHandler.test.cjs --runInBand` - passed, 7 suites / 210 tests.
- `git diff --check -- . ':(exclude)AGENTS.md'` - passed.

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
