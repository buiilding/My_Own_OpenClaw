---
summary: "Merged plan for SDK View Authority: define ConversationView as the SDK-owned public UI projection, migrate renderer/main surfaces one at a time, and delete frontend reconciliation paths as each invariant becomes SDK-owned."
title: "SDK View Authority Plan"
---

# SDK View Authority Plan

Date: 2026-06-24

Status: proposed.

This is the single implementation plan for SDK View Authority. It merges the
previous SDK-owned ConversationView contract plan and SDK View Authority
migration plan so one agent can execute one coordinated path.

Related architecture:

- `docs/adr/006-renderer-owned-typing-state.md`
- `docs/adr/008-conversation-history-revision-architecture.md`
- `docs/sdk/conversation_runtime.md`
- `docs/debug/core_loop_regression_pack.md`
- `plans/2026-06-22-conversation-history-revision-architecture-plan.md`
- `plans/2026-06-23-superseded-turn-live-lane-plan.md`

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

Normal UI consumers should see one boring contract:

```text
ConversationView = displayRows + liveTurn + surfaceIntent + actions
```

If frontend code has to ask "which turn wins?", the SDK boundary failed.

## Current Problem

Recent edit/resend and streaming fixes showed that the current boundary still
exposes too many partial truths to renderer and Electron main:

- SDK display rows are user-facing history, but SDK current-turn projections
  can arrive from multiple conversation lanes.
- Internal `conv-agent-*` lanes are useful for runtime bookkeeping, but leaked
  into normal UI projection and could compete with user conversation state.
- Renderer state still reconciles display rows, pending turns, workspace
  current turn, global latest current turn, visible lifecycle, and replay state.
- Electron main has received raw SDK overlay intents and had to infer whether
  they were allowed to control the native responsebox.
- Edit/resend fixes now span SDK runtime, SDK stores, renderer replay, chat
  store, main overlay ownership, rehydrate/model-history resume, and memory
  side effects.

ADR 008 separated durable history into runtime events, display timelines,
model-history ledgers, and revision graphs. This plan adds the next public
boundary: normal UI consumers should not reconcile those internals. The SDK
should collapse them into one active user-facing view.

## Product Invariant

For normal UI rendering, WindieOS must expose exactly one user-facing
conversation authority per active conversation.

Internal runtime lanes may exist, and diagnostics may show them, but they must
not:

- replace the active display timeline
- replace the active current-turn projection
- own or resize floating user-facing surfaces
- clear pending/busy state for the active user conversation
- install model-history or revision authority for the active branch
- appear in normal renderer selectors unless explicitly requested as
  diagnostics

## North-Star API

```ts
const view = conversation.getView();
conversation.subscribeView((view) => {
  render(view);
});
```

The exact names can evolve, but the public shape should stay small and
conversation-scoped:

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
    isTerminal: boolean;
    canStop: boolean;
    lastError?: SdkRuntimeError | null;
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
      visible: boolean;
      guardRef: string | null;
      ownerConversationRef: string;
      turnRef: string | null;
    };
  };

  actions: {
    canEdit: boolean;
    canRetry: boolean;
    canFork: boolean;
  };
};
```

## Ownership

### SDK Owns View Projection

The SDK runtime owns the projection from internals to `ConversationView`:

- selected revision head
- display timeline rows
- current-turn projection
- pending turn
- superseded-turn ledger
- model-history checkpoint metadata
- display-row replacement metadata
- retry/fork branch authority
- internal-lane visibility policy
- surface intent for the active user conversation

The SDK is the only layer that should decide which turn wins for normal UI.

### Renderer Renders The View

Renderer owns layout, component state, composer input, and user actions. It
renders:

- `view.displayRows`
- `view.liveTurn.entries`
- `view.surfaces.*`
- `view.actions.*`

Renderer should not infer active turn authority from raw events, internal
lanes, old-turn side effects, or model-history checkpoints.

### Electron Main Applies Surface Intent

Electron main owns native windows, bounds, focusability, visibility,
content-protection, and platform behavior. It applies:

```text
view.surfaces.responseOverlay
```

Main should not infer user-facing overlay ownership from raw SDK current-turn
events. Internal lanes should be private before they reach normal main-process
surface APIs.

### Diagnostics Are Separate

Debug tools may request:

- raw event logs
- internal lane events
- backend traces
- model-history checkpoints
- revision graph state
- surface visibility diagnostics
- view build inputs and filtered lane counts

Those diagnostic channels must be opt-in and must not feed normal UI
selectors.

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

## Phase 0: Build View In Parallel

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

Add diagnostics:

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

- SDK unit test for normal send view sequence
- SDK unit test for edit/resend view sequence
- diagnostic test that internal lanes are counted as filtered, not exported

## Phase 1: Response Overlay

Migrate response overlay first because it is the most sensitive surface and
recently exposed `conv-agent-*` leakage.

Target:

```text
MinimalResponseOverlay renders view.liveTurn.entries.
Electron main applies view.surfaces.responseOverlay.
```

Delete after migration:

- direct raw SDK current-turn overlay intent ownership in Electron main
- ad hoc `conv-agent-*` responsebox filters outside diagnostics
- renderer response-overlay mode guessing from stale SDK phase snapshots
- duplicated visible-content-vs-awaiting reconciliation in overlay hooks

Regression tests:

- internal `conv-agent-*` awaiting snapshot during user streaming response
- first assistant delta switches overlay from typing to response once
- stale awaiting snapshot after visible content does not shrink overlay
- edit/resend while previous turn streams does not re-show old typing

## Phase 2: Chat Pill Busy/Stop

Migrate pill busy and Stop controls:

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

Migrate dashboard:

```text
dashboard transcript = view.displayRows
dashboard busy = view.surfaces.dashboard.mode
```

Delete after migration:

- raw-event fallback display reconstruction when a display timeline exists
- dashboard-specific edit/resend suffix cleanup
- dashboard recent-chat refresh paths that reload foreground transcript just
  to learn display rows

Regression tests:

- edit first user message removes stale assistant suffix
- edit middle user message preserves retained prefix and clears suffix
- screenshots remain on replacement pending/display rows
- dashboard does not flash loading state during resend metadata refresh

## Phase 4: Edit/Resend Actions

Move edit/resend UI actions onto SDK view action metadata and stable row
capabilities:

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

Add fork and revision checkout to the same view contract:

```ts
conversation.checkoutRevision(revisionId);
conversation.forkFromRevision(revisionId);
conversation.subscribeView(...);
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

Track these as migration cleanup targets:

- global renderer `latestCurrentTurnProjection` as UI authority
- renderer-side "which current turn wins" logic
- response overlay fallback logic that compensates for SDK internals
- main-process raw SDK overlay intent ownership
- renderer replay suffix/pending reconciliation duplicated by SDK
- raw-event-to-normal-UI display reconstruction when display rows exist
- ad hoc internal `conv-agent-*` filters outside diagnostics
- stale stop/old-turn filters in renderer/main once SDK view owns them

Do not delete a target until SDK view tests and migrated surface tests prove
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

## Alternatives Considered

| Alternative | Reason not chosen |
| --- | --- |
| Keep renderer/main reconciliation and add more guards | Preserves multiple UI authorities and keeps producing flicker, stale busy, duplicate row, and resend races. |
| Make renderer smarter about SDK internals | Moves SDK complexity into UI code and weakens the SDK as a reusable public runtime. |
| Expose raw events as the public UI API | Raw events are useful diagnostics, but they are not a stable editable view document or surface authority. |
| Let Electron main infer overlay ownership from current-turn events | Main lacks revision/display/model-history context and should apply one surface intent, not decide conversation truth. |
| Build a full rewrite in one pass | Too risky for the core loop. Surface-by-surface migration allows proof and deletion at each boundary. |

## Security And Privacy

`ConversationView` is a UI projection, not a diagnostics dump. It must not
expose full raw events, provider payloads, system prompt text, raw tool output,
local paths, credentials, embeddings, or internal lane details unless an
explicit diagnostic API requests them.

Normal view fields should contain user-visible display rows, live assistant
entries appropriate for the UI, sanitized ids, modes, booleans, and action
capabilities.

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
