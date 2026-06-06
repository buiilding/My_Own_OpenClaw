---
summary: "Pre-flight plan for replacing minimal chat pill and response overlay handoff with one first-class SDK live-turn presentation path, deleting renderer stale guards, local send latches, active-workspace overlay reads, and Electron phase visibility ownership from the live overlay path."
read_when:
  - When debugging minimal chat pill typing state, response overlay flicker, dashboard-to-pill handoff, SDK current-turn projection routing, or response overlay native visibility.
  - When changing `windie:current-turn`, live-turn presentation selectors, minimal response overlay view model, responsebox size IPC, or overlay phase visibility behavior.
title: "SDK Live Turn Overlay Handoff Plan"
---

# SDK Live Turn Overlay Handoff Plan

Date: 2026-06-06

Status: implemented.

## User Intent

The user wants the minimal chat pill and response overlay to follow one simple
live-turn rule:

```text
new SDK agent loop starts with no visible assistant content
=> show typing state
=> hide response overlay

same loop gets visible thinking, assistant text, tool call, tool progress,
tool output, or error content
=> hide typing state
=> show response overlay with fresh content for that loop

next user send starts a new SDK loop
=> clear old response overlay
=> show typing state again until new visible content arrives
```

The desired fix is first-class architecture cleanup, not a local workaround for
one visual symptom. The implementation must remove the old competing live
overlay paths instead of keeping them as fallback behavior.

## Current Inspection Findings

The current SDK projection already has the right semantic shape:

- `CurrentTurnProjection.presentation.entries`
- `presentation.hasVisibleContent`
- `presentation.typingVisible`
- `presentation.overlayIntent.mode`: `hidden`, `awaiting`, or `response`
- `presentation.overlayIntent.turnRef`
- `presentation.overlayIntent.staleGuardRef`

The bug class remains because the renderer and Electron main still contain
competing ownership after that SDK intent is emitted:

1. `windie:current-turn` intake still applies a renderer stale-turn guard before
   storing non-awaiting projections. Awaiting projections are accepted before
   local send anchoring, but streaming/tool/content projections can be dropped
   if that renderer window's local stream tracking is cold or points at another
   turn.
2. Minimal pill and response overlay windows each run their own renderer store.
   They read "active workspace" state, so opening the dashboard can change
   conversation/session context in one renderer while the minimal response
   overlay later reads a different local active workspace.
3. The response overlay view model still has a local send latch and legacy
   fallback path. If `isSending` is true while the SDK projection is missing,
   idle, complete, or stored under a different workspace, it can force awaiting
   UI and suppress response entries.
4. The native response window show path depends on renderer DOM measurement.
   If the renderer returns `null` or a one-frame measurement is missed, the
   native window can remain hidden even when SDK intent has become `response`.
5. Renderer cleanup and hidden-size requests can send hides with no current
   guard when `overlayIntent` is absent. Main currently ignores stale hides only
   when both the incoming guard and active guard exist, so an unguarded hide can
   still win over an active response window.
6. Electron overlay phase handling still has native hide/show authority for
   some paths. The completed SDK presentation work demoted active-loop show
   behavior, but idle/terminal phase visibility can still race with SDK-backed
   renderer intent.

This explains the observed behavior:

```text
fresh startup
=> minimal surfaces initialize together
=> SDK awaiting and response updates usually land in the same local state

open dashboard
=> another renderer/session path changes local active workspace/state
=> minimal surfaces can later accept SDK awaiting state but drop/miss/read past
   the SDK response state
=> typing appears, response overlay rarely appears

when both show and hide paths fire
=> response overlay flickers
```

## Owning Runtime Decision

| Concern | Owner after this plan | Rule |
| --- | --- | --- |
| Live turn semantics | SDK runtime | SDK decides awaiting vs response vs hidden and which entries count as visible content. |
| Live turn display cache | Renderer | Renderer may cache the latest SDK projection, but cannot reinterpret turn semantics. |
| Minimal typing state | Renderer, from SDK presentation | Typing is `overlayIntent.mode === "awaiting"` for the latest SDK live turn. |
| Response overlay content | Renderer, from SDK presentation entries | Response overlay is `overlayIntent.mode === "response"` and renders SDK entries. |
| Native response BrowserWindow | Electron main | Main mirrors renderer's SDK-backed visible/size request and protects against stale hides. |
| Overlay phase | Electron main diagnostics/fallback only | Phase must not override SDK-backed current-turn visibility during normal operation. |
| Transcript/workspace rows | SDK display rows plus renderer workspace cache | Transcript selection stays workspace-scoped; live minimal overlay state must not depend on dashboard active workspace. |

## Target Architecture

Move from this path:

```text
SDK currentTurn
  -> renderer stores it under active workspace
  -> renderer stale-turn guard may drop it
  -> minimal overlay selector reads active workspace
  -> local send latch may override SDK state
  -> response view model infers awaiting/response
  -> DOM measurement sends native show/hide
  -> Electron phase/size handlers can still hide/show
```

to this path:

```text
SDK currentTurn.presentation.overlayIntent
  -> Electron main mirrors native response BrowserWindow visibility immediately
     with SDK turn guard and fallback bounds
  -> renderer records latest live-turn projection by SDK conversation/turn
  -> minimal pill/response overlay select latest live-turn projection directly
  -> awaiting mode renders typing only
  -> response mode renders SDK entries only
  -> renderer sends guarded native resize/hide refinement
  -> Electron main ignores stale/unguarded hides
```

Dashboard transcript state may remain active-workspace-scoped. Minimal live-turn
surfaces should read the SDK live-turn projection directly because they are a
runtime loop surface, not a dashboard conversation browser.

## Deletion Contract

This plan is not a compatibility-layer plan. The implementation must delete or
fully disconnect these old paths from the normal SDK-backed live overlay flow:

- renderer stale-turn rejection before storing `windie:current-turn`;
- active-workspace-only selectors for minimal pill typing and response overlay
  state;
- local send-latch response/awaiting inference once SDK `turn_started` has
  emitted a current-turn projection;
- renderer reconstruction of live overlay semantics from synthetic
  `ChatMessage[]` when SDK `presentation` exists;
- unguarded response overlay cleanup hides that can affect an active SDK turn;
- Electron phase-owned normal response window visibility for SDK-backed live
  turns.
- active-loop window creation content protection for the chat pill or response
  overlay;
- renderer hover-owned normal pill click-through toggling.

After SDK `turn_started`, there should be one normal path:

```text
SDK presentation.overlayIntent
  -> Electron main native window mirror
  -> minimal renderer presentation state/size refinement
```

Any remaining fallback must be explicitly limited to the pre-SDK gap before
`turn_started` exists or to test fixtures that intentionally do not provide SDK
presentation. No fallback may stay active for a valid SDK current-turn
projection.

## In Scope

### 1. Current-Turn Intake

- Remove renderer stale-turn rejection from the storage path for
  `windie:current-turn`; the SDK projection itself must always be recorded.
- Move stale-turn checks only to derived side effects that still need them, such
  as stream tracking counters or legacy transcript event handling. If a stale
  check is only protecting the old overlay path, delete it instead of moving it.
- Store the latest SDK live-turn projection in a renderer-visible live-turn
  slot independent of active workspace selection.
- Continue storing per-conversation workspace projections where dashboard
  transcript UI still needs them.
- Preserve `CurrentTurnProjection.userMessageRowId`,
  `presentation.awaitingAnchor`, and `presentation.overlayIntent` during SDK
  resource resolution and early awaiting.

### 2. Minimal Surface Selectors

- Add a minimal/live-turn selector for the pill and response overlay that reads
  the latest SDK live-turn projection directly instead of only
  `selectActiveWorkspaceState`.
- Remove active-workspace-only live overlay reads from the minimal surfaces.
- Keep dashboard selectors workspace-scoped.
- Ensure opening the dashboard cannot make the minimal response overlay render
  an empty/default workspace while a SDK live turn is active.

### 3. Response Overlay View Model

- When SDK presentation exists, make it the exclusive source for:
  - awaiting visibility
  - response visibility
  - response entries
  - busy/terminal state
  - turn id
  - native overlay intent
- Delete the local send-latch path from SDK-backed minimal response overlay
  rendering. The latch may exist only before a valid SDK current-turn projection
  exists, and that pre-SDK state must be visibly separated from the SDK path in
  code and tests.
- Keep legacy fallback only for a clearly classified no-SDK-projection path,
  such as renderer send preflight before SDK `turn_started` arrives.
- Remove renderer-generated synthetic `ChatMessage[]` as a semantic source for
  live overlay visibility when SDK `presentation` exists.
- Ensure thinking text, tool calls, tool progress, tool outputs, assistant text,
  and errors all count as response overlay content because the SDK entries
  already classify them as visible content.
- Ensure closing/dismissing a completed response cannot hide a busy response for
  a later turn with a different `turnRef`.

### 4. Native Window Sync

- Send show/resize/hide requests with the stable SDK
  `overlayIntent.staleGuardRef` whenever SDK intent is present.
- Keep the last known guard in the renderer sync hook so cleanup hides are
  correlated to the turn that created them.
- Add a deterministic retry/observer path for the visible SDK intent case so a
  missed first-frame measurement does not leave the native window hidden.
- Keep layout sizes stable: awaiting uses the fixed typing frame; response uses
  the fixed response frame.

### 5. Electron Main Visibility Policy

- Change responsebox size handling so an unguarded hide cannot hide an active
  guarded response overlay.
- Keep guarded hides valid when the incoming guard matches the active guard.
- Keep stale hides from older guards ignored.
- Remove normal phase-driven native hide/show from SDK-backed live-turn
  visibility. Phase can remain for diagnostics and early send-preflight
  fallback before SDK `turn_started`, but it must not hide or show an active
  SDK-owned response overlay.
- Preserve tool surface leases for click-through, focusability, and screenshot
  protection. Those are separate native policy concerns.
- Keep the pill clickable/draggable by default. Only SDK local tool lifecycle
  pointer leases may make the pill or response overlay click-through.
- Keep content protection disabled at rest and during ordinary active-loop
  phases. Only SDK local tool lifecycle screenshot leases may enable
  screenshot invisibility/content protection, and the release callback must
  disable it immediately after capture.

### 6. Traceability

- Add or tighten focused trace fields around:
  - current-turn accepted vs side-effect-stale-dropped
  - selected live-turn source for minimal surfaces
  - SDK overlay intent mode
  - native responsebox show/hide guard decision
- Keep logs deterministic and gated behind existing trace flags.

## Out of Scope

- Redesigning the minimal pill or response overlay visuals.
- Changing backend event formats.
- Changing sidecar tool execution, local tool schemas, or screenshot lease
  behavior.
- Reworking dashboard transcript browsing, conversation history persistence, or
  replay semantics beyond the selector boundary needed by this bug.
- Removing all overlay phase machinery in one change. The goal is to remove it
  as a competing normal visibility owner for SDK-backed live turns.
- Reintroducing renderer-owned optimistic user rows, renderer-owned awaiting
  row inference, or Electron phase-owned response content visibility.
- Keeping old live overlay paths as "backup" behavior after SDK current-turn
  presentation is available.

## Implementation Workflow

1. Recover from this plan and inspect the current code paths:
   - SDK projection builder
   - renderer current-turn intake
   - chat store workspace/live state
   - minimal pill and response overlay selectors
   - response overlay view model and window sync
   - responsebox size handler and phase handler
   - existing frontend tests for these paths
2. Add a matching realtime report before code edits.
3. Implement current-turn intake cleanup:
   - always store SDK current-turn projection
   - remove stale-turn checks from current-turn storage
   - move or delete stale-turn checks from derived side effects based on whether
     they still serve a non-overlay purpose
   - add renderer store state for latest SDK live turn independent of active
     workspace.
4. Implement minimal selector cleanup:
   - minimal pill/response overlay read latest SDK live turn directly
   - remove active-workspace live overlay reads from minimal surfaces
   - dashboard remains workspace-scoped.
5. Implement response view-model cleanup:
   - SDK presentation path becomes exact and exclusive
   - local latch is deleted from the SDK-backed path and constrained to the
     pre-SDK no-current-turn gap if still needed
   - synthetic message projection is removed as a semantic fallback for valid
     SDK presentation
   - dismissal is turn-aware.
6. Implement native window sync cleanup:
   - keep last known SDK guard for cleanup
   - retry/observe measurement while SDK intent is visible
   - emit guarded hide/show requests.
7. Implement Electron main policy cleanup:
   - ignore unguarded hides while an active guard exists
   - remove phase-owned normal hide/show for SDK-backed active overlays
   - preserve preflight fallback and terminal cleanup only where classified.
8. Reread the changed paths and search adjacent surfaces for remaining
   renderer-owned live-turn inference, local send-latch response suppression,
   active-workspace minimal overlay reads, unguarded hides, and phase-owned
   normal visibility. Delete any remaining in-scope path rather than documenting
   it as tolerated debt.
9. Run focused validation.
10. Update this plan's matching report with findings, validation, remaining
    risks, and commits.

## Success Criteria

- Minimal response overlay no longer depends on dashboard active workspace to
  see the latest SDK live turn.
- `windie:current-turn` projections with visible content are not dropped before
  being stored for minimal surfaces.
- Typing state appears only when SDK presentation mode is `awaiting`.
- Response overlay appears whenever SDK presentation mode is `response`.
- Response overlay remains visible through thinking, assistant tokens, tool
  calls, tool progress, and tool outputs for the same turn.
- A new user send with a new `turnRef` clears the old response and starts a
  fresh awaiting state.
- Unguarded or older cleanup hides cannot hide a newer active response overlay.
- Electron phase handling no longer competes with SDK-backed normal response
  overlay visibility.
- The old SDK-backed overlay paths listed in the deletion contract are removed
  or disconnected, not merely deprioritized.
- Focused tests cover the dashboard-to-minimal handoff race class.

## Validation Commands

Run the focused commands below during implementation, adjusting file lists if
inspection finds better existing coverage:

```bash
bin/windie docs list
cd frontend && npm run test:ci -- --runTestsByPath \
  ../tests/frontend/WindieSdkConversationRuntime.test.ts \
  ../tests/frontend/ChatBoxResponse.state.test.jsx \
  ../tests/frontend/OverlayResponseboxHandler.test.cjs \
  ../tests/frontend/ResponseOverlayPhaseHandler.test.cjs \
  ../tests/frontend/ChatSurfaceController.test.jsx \
  --runInBand
cd frontend && npm run typecheck
git diff --check -- . ':(exclude)AGENTS.md'
```

Add or update tests for:

- renderer current-turn intake accepts a streaming/tool/content projection even
  when local stream tracking is not anchored yet;
- minimal response overlay renders SDK response mode even when active workspace
  differs from the SDK live turn's conversation;
- local send latch cannot suppress SDK response mode;
- responsebox handler ignores unguarded hide while an active guard exists;
- phase handler does not hide a SDK-visible active overlay during normal
  current-turn rendering.
- valid SDK presentation does not call the legacy synthetic-message overlay
  fallback path.

## Reread Anchors

- `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md`
- `docs/desktop/minimal_chat_pill.md`
- `docs/architecture/frontend_architecture.md`
- `packages/windie-sdk-js/src/projections/conversationProjections.ts`
- `frontend/src/renderer/features/chat/hooks/useConversationRuntimeProjectionStream.ts`
- `frontend/src/renderer/features/chat/stores/chatStore.ts`
- `frontend/src/renderer/features/chat/utils/chatSelectors.js`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayWindowSync.js`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- `frontend/src/main/overlay_responsebox_handler.cjs`
- `frontend/src/main/response_overlay_phase_handler.cjs`

## Assumptions

- The SDK projection contract from `b190e4db6` is still the direction:
  `turn_started` and base `user_message` are emitted before resource resolution,
  and `presentation.overlayIntent` stays valid during resource resolution.
- The minimal response overlay should show the latest active SDK loop, not the
  dashboard's currently selected historical conversation.
- Existing overlay phase events remain useful for diagnostics and fallback, but
  normal content visibility belongs to SDK live-turn presentation.
- No data migration is required because this plan changes ephemeral renderer
  and Electron live surface state, not persisted transcript schema.
