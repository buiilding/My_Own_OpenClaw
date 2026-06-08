---
summary: "Pre-flight plan for adding a dashboard-vs-pill surface ownership gate so the floating response overlay and typing state cannot appear while the dashboard owns live-turn presentation."
read_when:
  - When debugging response overlay or typing state appearing over the dashboard.
  - When changing SDK current-turn overlay intent, Electron main surface ownership, responsebox size IPC, or dashboard-to-pill handoff behavior.
title: "Dashboard Response Overlay Surface Ownership Gate Plan"
---

# Dashboard Response Overlay Surface Ownership Gate Plan

Date: 2026-06-06

Status: implemented.

## User Intent

When the dashboard is present, the floating response overlay must not be
present. This includes the floating typing state because typing is part of the
response overlay surface.

The dashboard should render the active turn inline. The minimal chat pill and
response overlay should render the active turn only after Electron main has
explicitly handed ownership to the floating chat surface.

## Current Inspection Findings

Current live code already has most of the needed ownership vocabulary:

- `surface_runtime.cjs` tracks `primarySurface` and `mainWindowMode`.
- `showMainWindow(...)` sets the primary surface to `dashboard` or
  `onboarding` and hides chat/response overlay windows through
  `hideChatWindow(...)`.
- `showChatWindow(...)` sets the primary surface to `chat`.
- `sdk_live_turn_surface_controller.cjs` mirrors
  `currentTurn.presentation.overlayIntent` directly into native response
  `BrowserWindow` show/hide/resize behavior.
- `overlay_responsebox_handler.cjs` accepts renderer
  `set-responsebox-size` requests and can show the native response window.
- `response_overlay_phase_handler.cjs` still has phase fallback and terminal
  native-window paths.

The bug is that native response overlay show paths do not also ask whether the
floating chat surface currently owns live-turn presentation. So after the
dashboard hides the overlay, a later SDK live-turn intent or renderer size
request can show it again.

## Owning Runtime Decision

| Concern | Owner after this plan | Rule |
| --- | --- | --- |
| Live-turn semantics | SDK runtime | SDK continues to decide awaiting, response, hidden, entries, busy state, terminal state, and turn guards. |
| Surface ownership | Electron main | Main decides whether dashboard/onboarding or chat pill is the active live-turn presenter. |
| Dashboard live display | Renderer dashboard | Dashboard renders SDK current-turn projection inline when it is the primary surface. |
| Floating response display | Minimal response overlay renderer | Renderer displays SDK entries only when the native floating surface is allowed. |
| Native response window | Electron main | Main mirrors SDK/renderer show intent only when the floating chat surface owns presentation. |
| Tool leases | Electron main via SDK local tool lifecycle | Pointer/screenshot leases may adjust native policy, but they must not bypass surface ownership. |

## Target Contract

Introduce one surface-ownership gate for all floating response overlay show
paths:

```text
floating response overlay may show only when:
  primarySurface === "chat"
  and chatWindow is available and visible
  and main dashboard/onboarding window is not the active visible presenter
```

When `primarySurface` is `dashboard` or `onboarding`:

- response overlay `BrowserWindow` stays hidden;
- response overlay visible state is false;
- context label stays hidden;
- floating typing state is hidden with the response overlay;
- SDK current-turn projection is preserved unchanged;
- dashboard remains responsible for visible typing, tool progress, and assistant
  output;
- later SDK overlay intents or renderer size reports are suppressed until a real
  handoff to the chat pill occurs.

When Electron main explicitly shows the chat pill through a user summon,
wakeword, dashboard-close handoff, or approved computer-use handoff:

- `primarySurface` becomes `chat`;
- the same SDK current-turn projection may drive the response overlay;
- native response overlay show/resize is allowed again.

## Design Principle

Do not add a second content source or reinterpret SDK current-turn state.

The SDK still owns `presentation.overlayIntent`. The new gate only answers:

```text
Is the floating response overlay allowed to consume this intent right now?
```

If the answer is no, Electron main suppresses the native floating surface. It
does not mutate SDK presentation, dashboard transcript state, or backend stream
state.

## In Scope

### 1. Surface Gate Policy

- Add a small Electron-main policy helper for floating live-turn surface
  ownership.
- Prefer a pure helper that can be tested without Electron:

```js
function canShowFloatingResponseOverlay({
  primarySurface,
  mainWindow,
  chatWindow,
}): boolean
```

- Treat `dashboard` and `onboarding` as suppressing surfaces.
- Treat `chat` as allowing the response overlay only when the chat window is
  visible and usable.
- Keep the policy near native response overlay/window visibility code, not in
  renderer components.

### 2. SDK Live-Turn Native Mirror

- Gate visible SDK overlay intents in
  `sdk_live_turn_surface_controller.cjs`.
- If the SDK intent is visible but the gate denies floating presentation:
  - hide the response window if it is visible;
  - set response overlay visibility state to false;
  - sync/hide the context label;
  - avoid `setBounds(...)`, `showInactive(...)`, and active guard promotion;
  - emit a trace reason such as `surface-not-owner`.
- Preserve normal SDK hidden-intent and stale-hide behavior.
- Inspect whether the active response overlay guard should be cleared on
  surface suppression so a hidden dashboard-owned state is not treated as a
  protected floating overlay.

### 3. Renderer Size IPC

- Gate visible `set-responsebox-size` requests in
  `overlay_responsebox_handler.cjs`.
- If a renderer response overlay window reports `visible: true` while the
  dashboard owns presentation, return a successful suppressed result and keep
  the native response window hidden.
- Preserve hide requests, stale-hide protection, fullscreen monitor resolution,
  and normal resizing when the chat surface owns presentation.

### 4. Phase Fallback and Terminal Restore

- Gate phase-driven native show paths in `response_overlay_phase_handler.cjs`
  or the shared visibility policy.
- `renderer-send-preflight` fallback must not show a floating awaiting overlay
  from a dashboard send.
- Terminal restore must remain tied to the visible chat shell; it must not
  resurrect the response overlay over the dashboard.

### 5. Surface Runtime Wiring

- Pass the gate into the SDK live-turn surface controller, responsebox handler,
  and phase handler from `surface_runtime.cjs` / IPC composition.
- Keep `primarySurface` transitions explicit:
  - `showMainWindow(...)` -> dashboard/onboarding owner;
  - `showChatWindow(...)` -> chat owner;
  - `hideChatWindow(...)` hides floating surfaces but should not by itself make
    the dashboard own presentation unless the main window is shown.
- Avoid renderer-owned visibility timers or component-level dashboard checks.

### 6. Documentation

- Update `docs/desktop/response_overlay.md` to state that the response overlay
  is coupled to the chat pill, not the dashboard.
- Update `docs/desktop/minimal_chat_pill.md` or
  `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md` with the
  surface-ownership gate and dashboard suppression rule.

## Out of Scope

- Redesigning the response overlay visuals.
- Changing SDK current-turn projection semantics.
- Changing backend stream, prompt, provider, or tool execution behavior.
- Reworking dashboard transcript persistence, replay, or conversation browsing.
- Adding a renderer-only "hide overlay if dashboard" workaround.
- Reverting the SDK live-turn presentation path.

## Implementation Workflow

1. Re-read the current code and recent commits for:
   - `frontend/src/main/surface_runtime.cjs`
   - `frontend/src/main/sdk_live_turn_surface_controller.cjs`
   - `frontend/src/main/overlay_responsebox_handler.cjs`
   - `frontend/src/main/response_overlay_phase_handler.cjs`
   - `frontend/src/main/response_overlay_visibility_policy.cjs`
   - `frontend/src/main/window_visibility_runtime.cjs`
   - related frontend tests.
2. Add the pure surface gate helper and focused tests.
3. Wire the gate into SDK live-turn intent handling.
4. Wire the gate into responsebox size IPC.
5. Wire the gate into phase fallback/terminal restore if inspection shows any
   remaining native show path can bypass the gate.
6. Run focused tests after each coherent slice.
7. Reread the affected code paths and search for remaining native
   response-window show calls.
8. Update docs with the new ownership rule.
9. Create/update the matching report file with findings, changes, validation,
   and final inspection status.

## Inspection Checklist

- [ ] Every native response overlay show path has an explicit surface ownership
      gate or is proven unreachable while dashboard owns presentation.
- [ ] Dashboard-visible active turns render inline and do not show floating
      typing state.
- [ ] Chat-pill-visible active turns still show awaiting/response overlay from
      SDK presentation.
- [ ] Dashboard-to-pill handoff intentionally transfers ownership before
      allowing the response overlay.
- [ ] Local pointer and screenshot leases do not bypass the gate.
- [ ] Stale guards still protect newer chat-owned response overlays from older
      hides.
- [ ] Suppressed dashboard-owned overlay intent is logged clearly enough to
      debug future races.
- [ ] No renderer-only duplicate visibility authority is added.

## Success Criteria

- Showing or focusing the dashboard hides the response overlay and keeps it
  hidden even if SDK current-turn snapshots continue to report
  `overlayIntent.visible === true`.
- The floating typing state never appears over the dashboard.
- The response overlay still appears during active chat-pill turns.
- Renderer `set-responsebox-size` reports cannot resurrect the overlay while
  the dashboard owns presentation.
- Phase fallback cannot resurrect the overlay while the dashboard owns
  presentation.
- Focused tests cover dashboard suppression and chat-pill allowance.
- Docs describe the new dashboard-vs-pill ownership rule.

## Validation Commands

Run focused checks first:

```bash
cd frontend && npm run test -- SdkLiveTurnSurfaceController
cd frontend && npm run test -- OverlayResponseboxHandler
cd frontend && npm run test -- ResponseOverlayPhaseHandler
cd frontend && npm run test -- ResponseOverlayVisibilityPolicy
cd frontend && npm run test -- SurfaceRuntime
cd frontend && npm run test -- WindowVisibilityRuntime
```

Then run lightweight repo checks:

```bash
bin/windie docs list
git diff --check
```

If implementation touches renderer presentation code, also run:

```bash
cd frontend && npm run test -- ChatBoxResponse
cd frontend && npm run test -- ResponseOverlayLayoutMode
```

## Migration and Compatibility Note

No storage, API, websocket, tool schema, or persisted-data migration is
expected. This is native desktop surface policy for existing SDK current-turn
presentation.

## Reread Anchors After Compaction

If this work resumes after context compaction, first read:

- this plan;
- the matching report once created;
- `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md`;
- `docs/desktop/minimal_chat_pill.md`;
- `docs/desktop/response_overlay.md`;
- `frontend/src/main/surface_runtime.cjs`;
- `frontend/src/main/sdk_live_turn_surface_controller.cjs`;
- `frontend/src/main/overlay_responsebox_handler.cjs`;
- `frontend/src/main/response_overlay_phase_handler.cjs`;
- `tests/frontend/SdkLiveTurnSurfaceController.test.cjs`;
- `tests/frontend/OverlayResponseboxHandler.test.cjs`;
- `tests/frontend/SurfaceRuntime.test.cjs`.

## Approval Gate

Stop after this plan. Do not edit implementation code until the user approves
the plan or requests changes to it.
