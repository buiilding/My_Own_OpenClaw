---
summary: "Implementation migration plan for SDK View Authority: introduce ConversationView alongside current UI state, migrate surfaces one at a time, and delete renderer/main reconciliation paths as each invariant becomes SDK-owned."
title: "SDK View Authority Migration Plan"
---

# SDK View Authority Migration Plan

Date: 2026-06-24

Status: proposed.

Related plans and docs:

- `plans/2026-06-24-sdk-owned-conversation-view-contract-plan.md`
- `plans/2026-06-23-superseded-turn-live-lane-plan.md`
- `plans/2026-06-22-conversation-history-revision-architecture-plan.md`
- `docs/adr/006-renderer-owned-typing-state.md`
- `docs/adr/008-conversation-history-revision-architecture.md`
- `docs/sdk/conversation_runtime.md`
- `docs/debug/core_loop_regression_pack.md`

## Thesis

Frontend simplicity should come from a strict SDK public projection, not from
renderer/main knowing how to reconcile SDK internals.

The SDK can keep complex internals:

- raw event logs
- display timelines
- model-history ledgers
- revision graph heads
- pending turns
- superseded live lanes
- compaction state
- tool execution state
- internal `conv-agent-*` lanes
- diagnostics

But normal UI consumers should see one boring contract:

```text
ConversationView = displayRows + liveTurn + surfaceIntent + actions
```

If frontend code has to ask "which turn wins?", the SDK boundary failed.

## North-Star API

```ts
const view = conversation.getView();
conversation.subscribeView((view) => {
  render(view);
});
```

Minimal shape:

```ts
type ConversationView = {
  conversationRef: string;
  revisionId: string | null;
  displayRows: DisplayRow[];

  liveTurn: {
    turnRef: string | null;
    phase: "idle" | "awaiting" | "streaming" | "tool" | "complete" | "error";
    entries: LiveEntry[];
    isBusy: boolean;
    canStop: boolean;
  };

  surfaces: {
    pill: {
      mode: "idle" | "busy";
    };
    dashboard: {
      mode: "idle" | "busy";
    };
    responseOverlay: {
      mode: "hidden" | "typing" | "response";
      guardRef: string | null;
    };
  };

  actions: {
    canEdit: boolean;
    canRetry: boolean;
    canFork: boolean;
  };
};
```

## Migration Rule

Do not rewrite every surface at once.

Each migration step should:

1. Add the SDK view output needed by one surface.
2. Make the current renderer/main path compare against it in diagnostics.
3. Switch that surface to consume the SDK view.
4. Delete the old renderer/main authority for that surface.
5. Add or update a core-loop invariant test proving the deleted path is no
   longer needed.

No step is complete if it only adds a new SDK projection while leaving the old
frontend reconciliation path as an equal authority.

## Phase 0: View Builder In Parallel

Add a SDK `ConversationView` builder without changing UI behavior.

Inputs:

- active revision head
- display timeline rows
- current-turn projection
- pending turn
- superseded-turn ledger
- model-history checkpoint metadata
- display-row replacement metadata
- internal-lane visibility policy

Outputs:

- `displayRows`
- `liveTurn`
- `surfaces`
- `actions`

Diagnostics:

```bash
<windie> conversation view <conversation_id>
```

The command should print:

- active revision id
- display row count
- live turn ref and phase
- response overlay mode and guard ref
- pending turn ref
- superseded turn count
- filtered internal lane count
- model-history checkpoint id
- last SDK/backend event refs used to build the view

Proof:

- SDK unit test for normal send view sequence.
- SDK unit test for edit/resend view sequence.
- Diagnostic test that internal lanes are counted as filtered, not exported.

## Phase 1: Response Overlay First

Migrate response overlay before dashboard or pill.

Reason:

- It is the most sensitive surface.
- It exposed the recent `conv-agent-*` leakage bug.
- It currently needs visible lifecycle, current-turn projection, surface
  intent, pending state, dismissal state, and main-process ownership.

Target:

```text
MinimalResponseOverlay renders ConversationView.liveTurn.entries.
Electron main applies ConversationView.surfaces.responseOverlay.
```

Delete after migration:

- main-process direct raw SDK current-turn overlay intent consumption
- `conv-agent-*` responsebox filters in main, once SDK view proves internals
  are private at the source
- renderer response-overlay mode guessing from stale SDK phase snapshots
- duplicated visible-content-vs-awaiting reconciliation in overlay hooks

Regression tests:

- internal `conv-agent-*` awaiting snapshot during user streaming response
- first assistant delta switches overlay from typing to response once
- stale awaiting snapshot after visible content does not shrink overlay
- edit/resend while previous turn streams does not re-show old typing

## Phase 2: Chat Pill Busy/Stop State

Migrate pill busy/stop controls to SDK view actions.

Target:

```text
pill busy = view.surfaces.pill.mode
Stop enabled = view.liveTurn.canStop
```

Delete after migration:

- renderer stop target inference from mixed pending/current-turn state
- stale stop acknowledgement filters in renderer, once SDK emits the final
  user-facing view
- local busy fallbacks that exist only to survive SDK idle projections

Regression tests:

- normal send latches busy immediately
- SDK idle cannot clear same-turn pending busy
- superseded old turn stop acknowledgement cannot clear replacement busy
- completed replacement turn clears busy exactly once

## Phase 3: Dashboard Transcript And Busy State

Migrate dashboard rows and busy state to SDK view.

Target:

```text
dashboard transcript = view.displayRows
dashboard busy = view.surfaces.dashboard.mode
```

Delete after migration:

- raw-event fallback display reconstruction when a display timeline exists
- dashboard-specific suffix cleanup after edit/resend
- dashboard recent-chat refresh code paths that reload foreground transcript
  just to learn display rows

Regression tests:

- edit first user message removes stale assistant suffix
- edit middle user message preserves retained prefix and clears suffix
- screenshots remain on replacement pending/display rows
- dashboard does not flash loading state during resend metadata refresh

## Phase 4: Edit/Resend Actions

Move edit/resend UI actions onto SDK view action metadata.

Target:

```text
row can edit = view.actions + row capabilities
resend result = new ConversationView revision
```

Delete after migration:

- renderer-local replay target resolution against mixed display/current rows
- renderer-side original row id fallback once SDK view rows expose stable edit
  identity
- pending replacement row construction in React hooks if SDK view can emit the
  replacement row immediately after accepting the revision operation

Regression tests:

- repeated first-message edit/resend finds the same editable row
- edit with one screenshot persists image reference in display and inference
- edit with multiple screenshots preserves order
- edit while old assistant/tool output exists supersedes old live lane
- failed send after accepted edit keeps child revision visible

## Phase 5: Fork And Revision Navigation

Add fork/read-old-revision behavior to the same view contract.

Target:

```text
conversation.checkoutRevision(revisionId)
conversation.forkFromRevision(revisionId)
conversation.subscribeView(...)
```

Rules:

- active view follows selected branch head
- diagnostics can inspect ancestor raw events
- normal UI does not merge old branch live lanes into the active view

Regression tests:

- fork from old revision creates independent view
- active branch model-history checkpoint cannot be replaced by old branch
- old branch display rows remain inspectable
- active response overlay follows selected branch only

## Deletion Targets

Track these as migration cleanup candidates:

- `latestCurrentTurnProjection` as a global renderer authority
- renderer-side "which current turn wins" logic
- response overlay phase fallback logic that compensates for SDK internals
- main-process raw SDK overlay intent ownership
- renderer replay suffix/pending reconciliation paths duplicated by SDK
- raw event to normal UI display reconstruction when display rows exist
- ad hoc internal `conv-agent-*` filters outside diagnostics
- stale stop/old-turn filters in renderer/main once SDK view owns them

Do not delete a target until the SDK view test and migrated surface test prove
the replacement invariant.

## Diagnostics Strategy

Keep diagnostics separate from normal UI state.

Normal UI:

```text
ConversationView only
```

Diagnostics:

```text
raw events
internal lanes
backend traces
model-history checkpoints
revision graph
filtered lane counts
view build inputs
```

The diagnostic command should make mismatch reports easy:

```text
renderer observed overlay=response
SDK view expected overlay=response
internal conv-agent awaiting filtered=true
pending turn=turn_new
superseded old turn=turn_old
```

## Completion Criteria

The migration is complete when:

- normal renderer/main code consumes `ConversationView` for display rows, live
  turn, busy/stop state, and response overlay mode
- internal lanes are invisible to normal UI APIs by default
- edit/resend, retry, fork, compaction, and rehydrate all update the view
  through one SDK-owned revision path
- core-loop tests cover normal send, rapid resend, internal-lane leakage,
  screenshot resend, stale old-turn events, and forked branch selection
- old frontend/main reconciliation paths listed above are deleted or explicitly
  documented as temporary
