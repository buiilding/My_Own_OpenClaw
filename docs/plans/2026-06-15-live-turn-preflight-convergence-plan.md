---
summary: "Plan to converge minimal chat pill send-preflight typing state onto one renderer resolver while keeping Electron main as the native overlay executor."
read_when:
  - When changing minimal chat pill send acceptance, response-overlay awaiting state, SDK current-turn presentation, or Electron response-overlay window visibility.
  - When debugging typing indicators that appear, disappear, and reappear after pressing send in the minimal chat pill.
title: "Live Turn Preflight Convergence Plan"
---

# Live Turn Preflight Convergence Plan

Status: implemented.

Implementation report:
`docs/plans/2026-06-15-live-turn-preflight-convergence-report.md`.

## User Intent

Pressing send in the minimal chat pill should produce one stable visible state:
the pill becomes busy, the Stop affordance is available, and the response
overlay awaiting/typing surface remains visible until SDK current-turn
presentation replaces it with authoritative awaiting, response, terminal, or
error state.

The current bug shape is a split-brain handoff:

- A local renderer preflight path makes typing appear immediately.
- A hidden or idle SDK current-turn presentation can briefly override one
  renderer consumer.
- Electron main can also hide or suppress the native response-overlay window
  before the SDK publishes the authoritative active turn.
- The SDK then publishes active current-turn presentation and typing appears
  again.

The goal is not to add a delay. The goal is to remove duplicate semantic
decisions and make the preflight handoff explicit and guarded.

## Ownership Target

Keep these owners separate:

- SDK current-turn presentation owns durable live-turn semantics: busy,
  awaiting, response content, terminal state, visible entries, and active turn
  identity.
- Renderer owns display derivation only. It may hold a short-lived send
  preflight state before SDK current-turn exists, but there should be one shared
  resolver for that state.
- Electron main owns native BrowserWindow mechanics: show, hide, bounds,
  focusability, hit testing, content protection, and stale native-window guards.
- Backend and sidecar do not own this UI transition.

## Current Problem

There are two renderer presentation paths that make similar but not identical
decisions:

1. `useResponseOverlayViewModel` has a local send-latch guard. While
   `isSending=true`, a missing or hidden SDK presentation keeps the response
   overlay in local awaiting preflight.
2. `useChatSurfaceController` builds a fallback from
   `resolveLiveTurnPresentationInput`, but then unconditionally prefers SDK
   presentation when `currentTurnProjection.presentation` exists. A hidden SDK
   presentation can therefore report `isBusy=false` and
   `showChatboxAwaitingReply=false` even while local send preflight is still
   supposed to be active.

Electron main has a parallel native-window risk:

- `renderer-send-preflight` can show the response overlay window as an
  awaiting fallback.
- SDK hidden or surface-suppressed intent can hide/suppress the native overlay
  before SDK publishes the active awaiting or response intent.
- The native window therefore has its own opportunity to flicker even if the
  renderer view model stays latched.

## Target State Machine

Introduce one conceptual live-turn surface state:

```text
idle
  -> send-preflight
  -> sdk-awaiting
  -> sdk-response
  -> sdk-terminal
```

Rules:

- `send-preflight` begins when the renderer accepts a minimal-pill send.
- `send-preflight` is local and non-durable. It must not be stored as
  transcript, backend history, replay state, or SDK event history.
- `send-preflight` remains active while `isSending=true` and SDK current-turn
  presentation is missing, hidden, idle, or otherwise not authoritative for the
  accepted turn.
- SDK current-turn presentation supersedes `send-preflight` only when it
  provides an active awaiting/response intent, terminal state for the accepted
  turn, or explicit error/stop state.
- Hidden SDK presentation from stale startup, previous turns, dashboard surface
  ownership, or pre-active snapshots must not clear send preflight.
- User stop, send rejection, transport failure, or terminal SDK state clears
  preflight.

## Implementation Plan

### Phase 1: Centralize Renderer Resolution

Create or extend a shared renderer live-turn surface resolver under the chat
state utilities. It should accept:

- `isSending`
- `messages`
- `currentTurnProjection`
- optional active conversation/turn refs where available
- optional dismissed response id for response overlay consumers

It should return a normalized state with at least:

- `source`: `idle`, `send-preflight`, or `sdk-current-turn`
- `phase`
- `isBusy`
- `showAwaiting`
- `showResponse`
- `overlayIntent`
- `entries`
- `turnRef`
- `conversationRef`
- `guardRef`

Move the hidden-SDK preflight rule out of
`useResponseOverlayViewModel` and into this shared resolver.

### Phase 2: Replace Parallel Renderer Consumers

Route both renderer consumers through the shared resolver:

- `useResponseOverlayViewModel`
- `useChatSurfaceController`

The response overlay may still adapt entries, markdown, dismissal, and layout,
but it should not own a separate "should local send latch beat hidden SDK
presentation" rule.

The minimal pill controller should derive `isBusy`, Stop availability, and
toggle gating from the same resolved state as the response overlay.

### Phase 3: Guard Electron Main Preflight

Make preflight visible to Electron main as a guarded native-window state, not
only as a loose phase fallback:

- When main handles `renderer-send-preflight`, create a temporary preflight
  guard for the current conversation or pending turn if available.
- While that guard is active, ignore SDK hidden native-window intents that are
  not authoritative for the active preflight handoff.
- Let SDK awaiting/response intent replace the preflight guard with the SDK
  guard.
- Clear the preflight guard on terminal, error, stop, send rejection, or
  ownership change that intentionally suppresses floating overlay presentation.

This keeps Electron main in its correct role: it enforces native window
visibility and stale guards, but it does not invent semantic typing state.

### Phase 4: Remove Duplicate Preflight Entrypoints Where Possible

After the shared resolver and main guard are stable, inspect whether both
minimal-pill preflight calls are still needed:

- `MinimalChatPill` currently primes the response overlay immediately on send
  acceptance.
- Shared desktop send preparation can also prime response overlay awaiting for
  overlay-chatbox sends.

Keep only the earliest necessary preflight signal. If both are required for
separate renderer windows, document the reason. If one is redundant, delete it
and update tests.

### Phase 5: Long-Term Deletion Option

If SDK `conversation.send` can synchronously publish an authoritative awaiting
current-turn projection immediately after local send acceptance, remove the
renderer/main preflight path entirely.

That is the cleanest end state, but it is wider because it changes SDK runtime
send semantics and must preserve resource resolution, optimistic rows, replay,
conversation refs, and backend dispatch behavior. Treat that as a follow-up
unless the narrower convergence still leaves duplicate authority.

## Code Anchors

Reread these before implementation:

- `docs/development/agent_runtime_ownership_and_change_routing.md`
- `docs/desktop/minimal_chat_pill.md`
- `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md`
- `frontend/src/renderer/features/chat/utils/state/liveTurnSurfaceState.js`
- `frontend/src/renderer/features/chat/hooks/useChatSurfaceController.js`
- `frontend/src/renderer/features/minimalChatPill/hooks/useResponseOverlayViewModel.js`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalChatPill.jsx`
- `frontend/src/renderer/features/minimalChatPill/components/MinimalResponseOverlay.jsx`
- `frontend/src/main/ipc/ipc_response_overlay_handlers.cjs`
- `frontend/src/main/surfaces/response_overlay_phase_handler.cjs`
- `frontend/src/main/sdk/sdk_live_turn_surface_controller.cjs`
- `frontend/src/main/ipc.cjs`
- `tests/frontend/ChatSurfaceController.test.jsx`
- `tests/frontend/ChatBoxResponse.state.test.jsx`
- `tests/frontend/ResponseOverlayPhaseHandler.test.cjs`
- `tests/frontend/SdkLiveTurnSurfaceController.test.cjs`
- `tests/frontend/ChatBoxOverlayMouseIgnore.test.jsx`

## Tests To Add Or Update

Renderer resolver:

- `isSending=true` with no SDK projection resolves to `send-preflight`.
- `isSending=true` with hidden SDK presentation still resolves to
  `send-preflight`.
- `isSending=true` with SDK awaiting presentation resolves to
  `sdk-current-turn`.
- `isSending=true` with SDK response entries resolves to response state.
- terminal SDK state for the accepted turn clears preflight.
- terminal or hidden SDK state from a stale turn does not clear preflight.

Renderer consumers:

- Response overlay still shows awaiting during hidden SDK presentation.
- Minimal pill controller still reports busy/Stop availability during hidden
  SDK presentation.
- Dashboard/main-window consumers do not inherit floating overlay preflight
  behavior incorrectly.

Electron main:

- `renderer-send-preflight` shows the native response overlay fallback.
- hidden SDK intent with no matching active guard does not hide the preflight
  overlay.
- SDK awaiting intent replaces the preflight guard.
- SDK response intent replaces the preflight guard and sizes the response
  overlay.
- terminal/stop/error clears the preflight guard and permits hide.
- surface ownership suppression still hides floating overlay when dashboard or
  onboarding intentionally owns live-turn presentation.

## Validation Commands

Run focused validation first:

```bash
bin/windie docs list
cd frontend && npm run test -- \
  ChatSurfaceController \
  ChatBoxResponse.state \
  ResponseOverlayPhaseHandler \
  SdkLiveTurnSurfaceController \
  ChatBoxOverlayMouseIgnore \
  --runInBand
```

If shared IPC contracts or channel names change, also run:

```bash
cd frontend && npm run test -- \
  IpcResponseOverlayHandlers \
  IpcOverlayPhaseEvents \
  ResponseOverlayPhasePayload \
  --runInBand
```

Manual validation:

- Start the desktop dev loop.
- Open the minimal chat pill as the primary visible surface.
- Press send with a short text prompt.
- Confirm the typing/awaiting indicator does not disappear before SDK output
  begins.
- Confirm the pill Stop state does not briefly revert to Send.
- Repeat with a prompt that triggers a tool call and with a prompt that streams
  normal text.
- Repeat while dashboard owns the visible surface and verify the floating
  overlay remains suppressed intentionally.

## Out Of Scope

- Changing backend query execution or provider streaming behavior.
- Changing sidecar tool execution.
- Changing transcript persistence, replay, compaction, or history storage.
- Reworking all overlay phase naming.
- Adding timers to mask flicker.

## Migration And Compatibility

No persisted-data migration should be required. The change is runtime
presentation behavior only.

If the implementation changes IPC payload shape, add an explicit compatibility
note in the report. Avoid keeping compatibility aliases unless a verified
caller needs them.

## Success Criteria

- Minimal-pill send has one stable pre-SDK awaiting state.
- Renderer pill controls and response overlay derive preflight from the same
  resolver.
- Electron main preserves preflight native-window visibility until SDK
  current-turn state supersedes it or the turn terminalizes.
- No extra timers, duplicate latch rules, or new renderer/main semantic
  authorities are added.
- Focused tests cover both renderer and Electron main handoff races.
- Existing dashboard-owned surface suppression still works.

## Compaction Reread Anchors

If context is compacted before implementation finishes, reread:

1. This plan.
2. The matching report, once created.
3. `docs/desktop/minimal_chat_pill.md`.
4. `docs/frontend/runtime/overlay_phase_and_surface_change_workflow.md`.
5. The focused tests listed above.
6. `git status --short` and `git diff -- docs/plans frontend/src/renderer/features/chat frontend/src/renderer/features/minimalChatPill frontend/src/main tests/frontend`.
