---
summary: "ADR 009 for making the SDK-owned ConversationView the normal UI authority so renderer/main consume one active conversation projection while raw events, model history, internal lanes, and diagnostics stay behind explicit APIs."
read_when:
  - When changing SDK conversation view projection, renderer current-turn selectors, response overlay ownership, dashboard transcript projection, edit/resend UI state, retry, fork, or core-loop live surface behavior.
  - When debugging drift between display rows, pending turns, current-turn projection, response overlay mode, dashboard busy state, internal conv-agent lanes, or renderer/main surface ownership.
title: "ADR 009: SDK View Authority"
---

# ADR 009: SDK View Authority

## Status

Accepted target as of 2026-06-24.

This ADR merges the previous planning direction from:

- `plans/2026-06-24-sdk-owned-conversation-view-contract-plan.md`
- `plans/2026-06-24-sdk-view-authority-migration-plan.md`

Those plans are now execution context for this ADR, not independent parallel
workstreams.

## Context

WindieOS wants a simple frontend and a useful SDK. Recent edit/resend and
streaming fixes showed that the current boundary still exposes too many
partial truths to renderer and Electron main:

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
model-history ledgers, and revision graphs. This ADR adds the next public
boundary: normal UI consumers should not reconcile those internals. The SDK
should collapse them into one active user-facing view.

## Decision

WindieOS will make an SDK-owned `ConversationView` the normal renderer/main UI
authority.

Normal UI consumers should receive one active conversation projection:

```text
ConversationView
  display rows
  live turn
  surface intent
  actions/capabilities
```

Renderer and Electron main must not derive normal UI authority directly from:

- raw SDK events
- internal `conv-agent-*` lanes
- backend prompt/tool transparency traces
- model-history checkpoints
- rehydrate snapshots
- stale old-turn callbacks
- independent global latest-turn state

Diagnostics may expose those internals through explicit debug APIs, but normal
UI selectors and native surface controllers should consume the SDK view.

## Target Contract

The exact field names can evolve, but the public shape should stay small and
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

North-star SDK API:

```ts
const view = conversation.getView();
conversation.subscribeView((view) => {
  render(view);
});
```

## Authority Rules

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

Those channels must be opt-in and must not feed normal UI selectors.

## Migration Plan

This must be one coordinated implementation program, not two independent
parallel plans. The contract and migration are coupled.

### Phase 0: Build View In Parallel

Add the SDK `ConversationView` builder without changing UI behavior.

Add diagnostics:

```bash
<windie> conversation view <conversation_id>
```

The command should print active revision id, display row count, live turn ref
and phase, response overlay mode and guard ref, pending turn ref, superseded
turn count, filtered internal lane count, model-history checkpoint id, and the
last SDK/backend event refs used to build the view.

### Phase 1: Response Overlay

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

### Phase 2: Chat Pill Busy/Stop

Migrate pill busy and Stop controls:

```text
pill busy = view.surfaces.pill.mode
Stop enabled = view.liveTurn.canStop
```

Delete renderer stop target inference and stale stop acknowledgement filters
once SDK emits the final user-facing view.

### Phase 3: Dashboard Transcript And Busy State

Migrate dashboard:

```text
dashboard transcript = view.displayRows
dashboard busy = view.surfaces.dashboard.mode
```

Delete raw-event fallback display reconstruction when a display timeline
exists, dashboard-specific edit/resend suffix cleanup, and foreground metadata
reloads used only to learn display rows.

### Phase 4: Edit/Resend Actions

Move edit/resend UI actions onto SDK view action metadata and stable row
capabilities:

```text
row can edit = view.actions + row capabilities
resend result = new ConversationView revision
```

Delete renderer-local replay target resolution against mixed display/current
rows once SDK view rows expose stable edit identity and pending replacement
state.

### Phase 5: Fork And Revision Navigation

Add fork and revision checkout to the same view contract:

```ts
conversation.checkoutRevision(revisionId);
conversation.forkFromRevision(revisionId);
conversation.subscribeView(...);
```

Active view follows the selected branch head. Diagnostics can inspect ancestor
raw events, but old branch live lanes must not merge into the active view.

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

## Alternatives Considered

| Alternative | Reason not chosen |
| --- | --- |
| Keep renderer/main reconciliation and add more guards | This preserves multiple UI authorities and keeps producing flicker, stale busy, duplicate row, and resend races. |
| Make renderer smarter about SDK internals | This moves SDK complexity into UI code and weakens the SDK as a reusable public runtime. |
| Expose raw events as the public UI API | Raw events are useful diagnostics, but they are not a stable editable view document or surface authority. |
| Let Electron main infer overlay ownership from current-turn events | Main lacks revision/display/model-history context and should apply one surface intent, not decide conversation truth. |
| Build a full rewrite in one pass | Too risky for the core loop. Surface-by-surface migration allows proof and deletion at each boundary. |

## Consequences

- SDK public API grows a `ConversationView` projection and subscription path.
- Renderer and Electron main become simpler over time, but migration requires
  temporary compare-mode diagnostics.
- Internal lanes remain useful but become private by default for normal UI.
- Core-loop tests must protect view authority, not just component rendering.
- Some existing ADR 006 renderer-owned typing-state details will be superseded
  by SDK view authority as surfaces migrate.
- ADR 008 remains the durable history/revision decision; this ADR owns the UI
  projection authority built on top of that history architecture.

## Validation And Docs Impact

Implementation must update:

- SDK conversation runtime docs with `ConversationView` semantics.
- Core Loop Regression Pack for normal send, rapid resend, internal-lane
  leakage, screenshot resend, stale old-turn events, and forked branch
  selection.
- Renderer/main docs to state that normal UI consumes `ConversationView`.
- Diagnostics docs for `<windie> conversation view`.
- ADR 006 references where renderer-owned typing state is replaced by SDK view
  ownership.

Required test coverage:

- normal send: awaiting -> first assistant delta -> complete
- edit first message while old turn is active
- edit middle message after assistant/tool output
- edit/resend with one or more screenshots
- repeated edit/resend while replacement is streaming
- internal `conv-agent-*` awaiting intent during active user response stream
- late old-turn stop/error after supersession
- model-history checkpoint arrives after a newer revision is active
- fork from older revision creates a separate active view

## Security And Privacy

`ConversationView` is a UI projection, not a diagnostics dump. It must not
expose full raw events, provider payloads, system prompt text, raw tool output,
local paths, credentials, embeddings, or internal lane details unless an
explicit diagnostic API requests them.

Normal view fields should contain user-visible display rows, live assistant
entries appropriate for the UI, sanitized ids, modes, booleans, and action
capabilities.
