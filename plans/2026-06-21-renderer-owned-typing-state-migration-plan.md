---
summary: "Migration plan for implementing ADR 006 renderer-owned typing state, converging dashboard, pill, overlay, Stop/busy, and awaiting UI onto one visible turn lifecycle projection while deleting legacy lifecycle authorities."
title: "Renderer-Owned Typing State Migration Plan"
---

# Renderer-Owned Typing State Migration Plan

Date: 2026-06-21

## Progress Notes

### 2026-06-21 Legacy Presentation Lifecycle Facade Cleanup

- Finding: `useChatSurfaceController(...)` still called
  `resolveSdkCurrentTurnPresentationState(...)` after resolving the renderer
  visible lifecycle, leaving the chat surface with a second SDK presentation
  lifecycle reducer for the same dashboard and pill busy/typing state. The
  old `useOverlayTurnLifecycle(...)` feature hook also kept legacy
  current-turn overlay lifecycle mapping outside the visible lifecycle facade.
- Change: the controller now keeps `useCurrentTurnPresentationState(...)` only
  as the legacy presentation-field adapter and always stamps it from
  `DesktopVisibleTurnLifecycleRuntime.applyVisibleTurnLifecycleToPresentationState(...)`.
  Legacy overlay lifecycle helpers used by that adapter moved behind
  `DesktopVisibleTurnLifecycleRuntime`, and the old feature hook was deleted.
  The response overlay still owns SDK presentation entries and dismissal data
  until its remaining data path is collapsed in a later slice.
- Validation target: `ChatSurfaceController.test.jsx` continues to protect
  visible lifecycle busy/Stop, awaiting anchor, and local pending handoff, while
  `RendererAppRuntimeBoundary.test.ts` rejects a controller import of
  `DesktopCurrentTurnPresentationRuntime` and the deleted overlay lifecycle
  hook. `DesktopVisibleTurnLifecycleRuntime.test.js` covers the legacy overlay
  lifecycle adapter functions now exposed only through the visible lifecycle
  runtime facade.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution,
  trust-boundary, or storage migration required.

### 2026-06-21 Visible Lifecycle Preflight And Overlay Adapter Tightening

- Finding: live-surface local send-preflight handoff still lived beside
  overlay presentation input, and the shared lifecycle-to-presentation adapter
  owned busy and awaiting fields but left the legacy `overlayTurnLifecycle`
  field intact for response-overlay view code to inspect.
- Change: `DesktopVisibleTurnLifecycleRuntime` now owns
  `shouldUseLocalSendPreflight(...)` for live-surface consumers and
  `applyVisibleTurnLifecycleToPresentationState(...)` stamps
  `overlayTurnLifecycle` from the visible lifecycle status, mapping
  `local_pending` to preflight and SDK awaiting/active/terminal/idle to their
  legacy overlay equivalents.
- Validation target: `DesktopVisibleTurnLifecycleRuntime.test.js` asserts the
  local preflight handoff predicate plus adapter overwrites stale lifecycle
  fields for pending, active, and terminal states.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, permission, credential, local execution, trust-boundary, or storage
  migration required.

### 2026-06-21 Dashboard Awaiting Anchor Row-Shape Cleanup

- Finding: dashboard `MessageList` routing had already stopped computing live
  progress suppression locally, but the regression pack did not protect the
  deletion target that durable tool/progress row shape must not veto renderer
  pending typing.
- Change: deleted the live-progress row-shape helper, updated
  `ChatInterfaceWiring.test.jsx` to assert phase-only streaming does not show
  typing without pending or visible content, while renderer pending still shows
  the awaiting dot even when durable tool rows are present, and kept
  `useChatSurfaceController(...)` active when the SDK current-turn conversation
  ref is ahead of the session ref; added the file to `<windie> test core-loop`.
- Validation target: `ChatInterfaceWiring.test.jsx` protects dashboard message
  list awaiting-anchor routing through the visible lifecycle owner instead of
  row-shape suppression.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, permission, credential, local execution, trust-boundary, or storage
  migration required.

### 2026-06-21 Response Overlay Visible Lifecycle Routing

- Finding: `useResponseOverlayViewModel` still reduced live-turn input,
  SDK presentation, and response-overlay phase into awaiting/response state
  independently from the renderer visible lifecycle owner.
- Change: moved the lifecycle-to-presentation adapter into
  `DesktopVisibleTurnLifecycleRuntime`, reused it from both chat surface and
  response overlay hooks, and routed overlay awaiting/response state through
  the same visible lifecycle projection.
- Validation target: `ChatBoxResponse.state.test.jsx` now protects pending
  sends through hidden/visible-empty SDK projections and asserts phase-only
  `streaming`/`tool-output` projections do not show typing without renderer
  pending or visible SDK content; the test is registered in
  `<windie> test core-loop`.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, permission, credential, local execution, or storage migration
  required; the slice removes response-overlay phase-only typing authority.

### 2026-06-21 Chat Surface Controller Visible Lifecycle Routing

- Finding: after the visible lifecycle runtime landed, `useChatSurfaceController`
  still let the legacy current-turn presentation hook decide busy, Stop,
  awaiting-dot, and chatbox awaiting state for dashboard and pill consumers.
- Change: routed controller state through
  `DesktopVisibleTurnLifecycleRuntime.resolveVisibleTurnLifecycle(...)`,
  exposed `visibleTurnLifecycle`, and adapted the legacy presentation result
  from lifecycle status so local pending and SDK awaiting use one owner.
- Validation target: `ChatSurfaceController.test.jsx` covers visible lifecycle
  busy/Stop projection, awaiting anchors, and local pending through SDK idle or
  visible-empty handoff; `<windie> test core-loop` covers the broader replay.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, renderer config storage, permission, credential, local execution, or
  storage migration required; this slice routes dashboard/pill presentation
  through the renderer lifecycle owner.

### 2026-06-21 Visible Turn Lifecycle Runtime And Handoff Predicate

- Finding: renderer pending-turn clearing and live-surface preflight handoff
  still used separate predicates, so SDK idle, wrong-turn, or visible-empty
  projections could drift from the visible lifecycle rules in ADR 006.
- Change: added `desktopVisibleTurnLifecycleRuntime` as the renderer app-runtime
  owner for visible lifecycle projection and the
  `hasAuthoritativeSameTurnSdkReplacement(...)` predicate, then routed
  `chatStore.ts` pending clearing and `desktopLiveTurnSurfaceRuntime.js`
  pending-turn handoff through that predicate.
- Validation target: `DesktopVisibleTurnLifecycleRuntime.test.js` protects the
  replay from `local_pending` through SDK idle, visible-empty, awaiting, active,
  terminal, and wrong-turn terminal states, and is registered in
  `<windie> test core-loop`.
- Compatibility/security: no persisted transcript, SDK event payload, IPC
  payload, permission, credential, local execution, or storage migration
  required; this slice changes only renderer projection ownership.

## Goal

Implement [ADR 006](../docs/adr/006-renderer-owned-typing-state.md): make one
renderer app-runtime visible turn lifecycle projection the source of truth for
dashboard, chat pill, response overlay, Stop/busy controls, and typing state.

The target user-visible invariant is:

```text
User send accepted for turn X means desktop surfaces render local_pending for X
until SDK emits an authoritative same-turn state that advances to awaiting,
active, or terminal. SDK idle, stale, wrong-turn, or visible-but-empty
projections must not clear local_pending.
```

The implementation should remove duplicate and legacy lifecycle authorities
instead of adding another fallback around the dashboard typing dot.

## Current Problem

Typing and busy state can currently be inferred from several independent
sources:

- renderer `pendingTurn`
- renderer `isSending`
- renderer `streamTracking.phase`
- renderer `thinkingStatus`
- SDK `currentTurnProjection.phase`
- SDK `currentTurnProjection.presentation.typingVisible`
- SDK `currentTurnProjection.presentation.overlayVisible`
- SDK `currentTurnProjection.presentation.overlayIntent`
- SDK/durable display rows
- dashboard row suppression such as `hasLiveProgressMessages`

Those fields are not all authoritative state. Some are raw input, some are SDK
presentation, some are renderer compatibility state, and some are row-rendering
details. Because dashboard, pill, overlay, and message rows infer lifecycle in
different places, transient SDK idle or visible-but-empty projections can make
typing flicker or busy state drift.

## Desired End State

One renderer app-runtime module owns visible turn lifecycle:

```text
pendingTurn + SDK currentTurnProjection + explicit stop/cancel result
  -> visibleTurnLifecycle
  -> dashboard / pill / overlay / Stop / busy / typing renderers
```

The lifecycle state set is:

| State | Meaning |
| --- | --- |
| `local_pending` | Renderer accepted user send for turn X before SDK/backend authority exists. |
| `awaiting` | Backend accepted turn X and no visible content/progress/error has emitted yet. |
| `active` | Backend emitted visible reasoning, text, tool call, tool output, tool progress, search progress, or error content for X. |
| `terminal` | Backend completed, errored, or stopped X; busy/typing clears while terminal content may remain visible. |
| `idle` | No active turn for the conversation; cannot override `local_pending` for X. |

Surfaces should consume the lifecycle output. They should not independently
decide lifecycle from lower-level fields.

## Non-Goals

- Do not move renderer-local `local_pending` into the SDK in this migration.
- Do not make the dashboard component own lifecycle fixes.
- Do not remove SDK `currentTurnProjection`; it remains the SDK/backend event
  projection source.
- Do not remove durable display rows or SDK presentation entries; they remain
  rendering data.
- Do not change backend provider semantics or websocket event names unless a
  concrete SDK projection bug is found.
- Do not keep compatibility aliases or fallback lifecycle state without a named
  dependency and deletion path.

## Owner Boundary

SDK owns:

- normalized backend conversation events
- `currentTurnProjection`
- display/rehydrate projection from SDK-owned event state
- presentation entries derived from SDK turn content

Renderer app-runtime owns:

- local pending-send acceptance
- same-turn SDK handoff rules
- desktop-visible lifecycle state
- dashboard/pill/overlay/Stop/busy typing projection

Renderer components own:

- rendering layout
- row composition
- anchors and visual placement after lifecycle has already been resolved

## Target Runtime Shape

Create or designate a renderer app-runtime owner, for example:

```text
frontend/src/renderer/app/runtime/desktopVisibleTurnLifecycleRuntime.ts
```

Recommended output shape:

```ts
type DesktopVisibleTurnLifecycleStatus =
  | 'local_pending'
  | 'awaiting'
  | 'active'
  | 'terminal'
  | 'idle';

type DesktopVisibleTurnLifecycle = {
  status: DesktopVisibleTurnLifecycleStatus;
  source: 'local' | 'sdk';
  conversationRef: string | null;
  turnRef: string | null;
  awaitingAnchor: {
    kind: 'user-message';
    rowId: string;
  } | null;
  entries: unknown[];
  terminalReason: 'complete' | 'error' | 'stopped' | null;
  isBusy: boolean;
  showTyping: boolean;
};
```

The exact type can be refined during implementation, but the important rule is
that dashboard, pill, overlay, Stop, busy, and typing should read from this
projection rather than recomputing lifecycle independently.

## Authoritative Handoff Predicate

Centralize the predicate currently duplicated across store and surface logic:

```text
hasAuthoritativeSameTurnSdkReplacement(pendingTurn, currentTurnProjection)
```

It should return true only when SDK projection belongs to the same conversation
and turn and represents one of:

- SDK awaiting acceptance for the turn
- visible reasoning text
- visible assistant text
- tool call
- tool output
- tool progress
- search progress/source progress
- visible error content
- terminal complete/error/stopped for the turn

It should return false for:

- no SDK projection
- wrong conversation
- wrong turn
- SDK idle
- stale previous-turn terminal projection
- visible-but-empty projection with no content, progress, awaiting, or terminal
  authority

This predicate should be used for both pending-turn clearing and visible
lifecycle handoff, so those decisions cannot drift again.

## Cleanup Targets

### Remove As Lifecycle Authorities

These fields may remain temporarily, but they must stop deciding typing/busy
lifecycle:

- `isSending`
- `streamTracking.phase`
- `thinkingStatus`
- `currentTurnProjection.presentation.typingVisible`
- `currentTurnProjection.presentation.overlayVisible`
- `currentTurnProjection.presentation.overlayIntent.mode`
- `hasLiveProgressMessages`
- durable display-row refresh timing
- message row shape

### Keep As Data Or Derived Detail

- `pendingTurn`: authoritative renderer-local raw input.
- `currentTurnProjection`: authoritative SDK raw input.
- `messages`: durable/rendered rows and typing anchor lookup only.
- SDK `presentation.entries`: visible active content/progress rows.
- `thinkingStatus`: compaction/manual status copy only, not core turn typing.
- `streamTracking`: diagnostics or legacy compatibility only until deleted.

### Delete Or Collapse

- Duplicate pending clear/handoff logic between `chatStore.ts` and
  `desktopLiveTurnSurfaceRuntime.js`.
- Dashboard-specific `hasLiveProgressMessages ? null : awaitingDotTargetMessageId`
  lifecycle suppression once visible lifecycle carries `active`.
- `useCurrentTurnPresentationState` as a lifecycle authority. It can become a
  thin renderer of the visible lifecycle or be removed if no longer needed.
- `resolveSdkCurrentTurnPresentationState` as a competing lifecycle reducer.
  SDK presentation fields should be normalized into the visible lifecycle once.
- Direct surface use of `isSending` for Stop/busy where visible lifecycle can
  provide `isBusy`.

## Implementation Phases

### Phase 0: Lock The Bug As An Invariant

Add failing owner tests before refactoring:

- renderer app-runtime replay test:

```text
user_send_accepted
pending_turn_created
sdk_current_turn_idle
sdk_current_turn_visible_empty
sdk_current_turn_awaiting
assistant_delta
streaming_complete
```

- assert visible lifecycle never leaves `local_pending` or `awaiting` before
  authoritative SDK same-turn handoff
- assert wrong-turn idle/terminal projections do not clear local pending
- assert terminal same-turn stop clears busy/typing for the correct turn

Add these tests to the Core Loop Regression Pack and User-Facing Regression
Pack routes when not already covered.

### Phase 1: Introduce The Renderer App-Runtime Lifecycle Reducer

Add the visible lifecycle runtime with pure reducer tests.

Inputs:

- active conversation ref
- `pendingTurn`
- `currentTurnProjection`
- optional stop/cancel state
- messages only for anchor lookup

Outputs:

- lifecycle status
- same-turn identity
- `showTyping`
- `isBusy`
- entries/progress rows
- awaiting anchor
- terminal reason

Do not route UI through it yet except in tests. This keeps the first step easy
to review.

### Phase 2: Route Chat Surface Controller Through The Reducer

Make `useChatSurfaceController` consume visible lifecycle and expose the same
public shape expected by existing dashboard and pill callers.

Expected effects:

- `composerBusy` derives from visible lifecycle.
- `canStop` derives from visible lifecycle.
- dashboard awaiting dot derives from visible lifecycle.
- SDK idle and visible-but-empty projections cannot clear local pending.

Keep adapter fields only to avoid broad JSX churn in the first routing change.

### Phase 3: Route Response Overlay And Chat Pill Through The Same Projection

Update `useResponseOverlayViewModel`, minimal chat pill, and overlay window sync
to consume visible lifecycle instead of independently interpreting SDK
presentation or live-turn surface input.

Expected effects:

- dashboard, pill, and overlay report the same lifecycle for the same
  conversation/turn
- Stop button and overlay visibility agree
- response overlay uses lifecycle entries and terminal state rather than
  independent `overlayIntent` authority

### Phase 4: Collapse Duplicate Pending Handoff Logic

Move pending-turn handoff into the shared predicate.

Replace:

- `shouldCurrentTurnClearPendingTurn` in `chatStore.ts`
- `shouldUseSendPreflight` handoff checks in `desktopLiveTurnSurfaceRuntime.js`
- any parallel "hidden SDK presentation" checks that duplicate the same
  decision

with a single renderer app-runtime handoff predicate.

The store can still mutate `pendingTurn`, but it should use the same owner
predicate as surface lifecycle.

### Phase 5: Remove Legacy Lifecycle Inputs From Surfaces

Remove or downgrade direct lifecycle use of:

- `isSending`
- `streamTracking.phase`
- `thinkingStatus`
- SDK `presentation.typingVisible`
- SDK `presentation.overlayVisible`
- SDK `presentation.overlayIntent.mode`
- `hasLiveProgressMessages`

Where removal is not immediately possible, leave a documented compatibility
comment and a follow-up deletion test.

### Phase 6: Delete Stale Tests And Update Docs

After the new reducer routes all surfaces:

- delete tests that only protect legacy helper behavior
- update tests to assert lifecycle projection instead of old intermediate
  fields
- update dashboard/pill/overlay docs
- update SDK conversation docs only if SDK current-turn semantics change
- keep ADR 006 as the architectural source of truth

## Validation Plan

During implementation, run narrow tests first:

```bash
<windie> test frontend -- <new-visible-lifecycle-test>
<windie> test frontend -- ChatSurfaceController LiveTurnSurfaceState ChatBoxResponse ChatInterfaceWiring
```

Before each commit that changes visible lifecycle behavior:

```bash
<windie> test core-loop
```

Before finishing a migration slice:

```bash
<windie> test user-facing
<windie> docs list
cd frontend && npm run lint
git diff --check
```

## Migration And Compatibility Notes

No persisted data migration should be required if this remains a renderer
projection cleanup. If any implementation changes SDK event payloads, IPC
payloads, transcript storage, or rehydrate semantics, that slice must include a
specific compatibility note and focused tests.

Security-sensitive behavior should remain unchanged. This plan does not alter
credentials, permissions, local execution authority, provider policy, backend
routes, or local-runtime tool execution.

## Completion Criteria

- One renderer app-runtime reducer owns visible typing and turn lifecycle.
- Dashboard, chat pill, response overlay, Stop, busy, and typing read from that
  reducer.
- Local pending cannot be cleared by SDK idle, stale, wrong-turn, or
  visible-but-empty projections.
- `isSending`, `streamTracking`, `thinkingStatus`, SDK presentation flags,
  display-row refresh timing, and message row shape no longer independently
  decide typing lifecycle.
- Duplicate pending handoff predicates are collapsed into one owner predicate.
- Core Loop Regression Pack includes the replay that originally exposed this
  class of bug.
