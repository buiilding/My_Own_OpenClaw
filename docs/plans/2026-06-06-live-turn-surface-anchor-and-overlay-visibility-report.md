# Live Turn Surface Anchor and Overlay Visibility Report

Date: 2026-06-06

Plan: `docs/plans/2026-06-06-live-turn-surface-anchor-and-overlay-visibility-plan.md`

## Status

Complete.

## Checklist

- [x] Recover state from approved plan and inspect current code.
- [x] Add SDK `awaitingAnchor` and `overlayIntent` presentation contract.
- [x] Update dashboard adapter to consume SDK awaiting anchor.
- [x] Update response overlay renderer/window sync to consume SDK overlay intent.
- [x] Demote Electron main phase handling from normal response-window visibility owner.
- [x] Run focused validation.
- [x] Perform final design-inspection pass and classify remaining phase paths.
- [x] Update docs/changelog.
- [ ] Commit completed work.

## Findings

- The approved plan was created at
  `docs/plans/2026-06-06-live-turn-surface-anchor-and-overlay-visibility-plan.md`.
- Pre-existing dirty/untracked work before implementation:
  `AGENTS.md`, `CHANGELOG.md`,
  `tests/frontend/ConversationReplayDatabaseIntegration.test.tsx`,
  `docs/plans/2026-06-06-sdk-turn-input-pipeline-refactor-plan.md`, and
  `scratch/`.
- SDK display rows already have stable user row ids. `user_message` rows use
  `displayRowId(event, index)`, which falls back to `event.eventId`.
- Current `LiveTurnPresentation` has `typingVisible` and `overlayVisible`, but
  no user-row anchor and no explicit overlay intent.
- Dashboard and response-overlay adapters were already partially SDK-shaped, but
  `overlayVisible` still overloaded response content visibility and awaiting
  shell visibility.
- Electron main active phase handling still showed the response BrowserWindow
  directly for streaming/tool phases, competing with renderer content state.
- Legacy/no-presentation current-turn projections still need a renderer fallback
  for tests and older local paths; the fallback must not make phase events the
  native-window visibility owner again.

## Decisions

- Additive SDK presentation fields are the first slice. This preserves current
  consumers while giving dashboard/overlay a stronger contract.
- Use the current turn's `user_message` event id as `awaitingAnchor.rowId`.
  This matches SDK display-row identity and avoids renderer scanning.
- Preserve legacy projection support in the response overlay by projecting
  `assistantText`, `lastError`, and `toolEvents` into overlay entries when SDK
  presentation entries are unavailable.
- Treat the local send latch as stronger than a stale completed SDK projection
  until the SDK acknowledges the new turn.
- Keep phase-driven native window show only for the renderer send-preflight
  awaiting fallback. Normal active phases now defer to SDK overlay intent and
  renderer size IPC only refines bounds after the native window is primed.
- Use `turnRef` as the response overlay stale guard. Main records it after a
  successful show/resize and ignores hide requests from older guards.

## Validation Log

- `bin/windie docs list` - passed before implementation.
- `node -c frontend/src/main/surface_runtime.cjs` - passed.
- `node -c frontend/src/main/overlay_responsebox_handler.cjs` - passed.
- `node -c frontend/src/main/response_overlay_phase_handler.cjs` - passed.
- `cd frontend && npm test -- --runTestsByPath ../tests/frontend/WindieSdkConversationRuntime.test.ts ../tests/frontend/ChatSurfaceController.test.jsx ../tests/frontend/OverlayResponseboxHandler.test.cjs ../tests/frontend/ResponseOverlayPhaseHandler.test.cjs ../tests/frontend/ChatStreamThinkingStatus.state.test.tsx ../tests/frontend/ChatBoxResponse.state.test.jsx --runInBand` - passed, 6 suites / 197 tests.
- `git diff --check` - blocked by pre-existing trailing whitespace in
  `AGENTS.md:266`, which was unrelated to this implementation.

## Commits

Pending.

## Remaining Work

- Commit completed work after final user-facing handoff if repository policy
  still requires including this change in the current dirty worktree.

## Final Inspection

- SDK projection now carries `userMessageRowId`, `presentation.awaitingAnchor`,
  and `presentation.overlayIntent`.
- Dashboard consumes `awaitingAnchor.rowId` for the typing dot when SDK
  presentation is present; legacy fallback is used only when the SDK field is
  absent.
- Response overlay renderer derives awaiting/response/hidden state from
  `overlayIntent.mode` and sends `turn_ref`/`stale_guard_ref` with size IPC.
- Electron main active phases no longer show the response window directly except
  for renderer send-preflight awaiting fallback.
- Responsebox size handling owns the native show/resize/hide request and
  ignores stale hide requests from older turn guards.
