---
summary: "Plan for making the SDK expose one active ConversationView contract so renderer/main consume an authoritative user-facing document instead of reconciling SDK events, internal lanes, and surface intents."
title: "SDK-Owned Conversation View Contract Plan"
---

# SDK-Owned Conversation View Contract Plan

Date: 2026-06-24

Status: proposed.

Related architecture:

- `docs/adr/006-renderer-owned-typing-state.md`
- `docs/adr/008-conversation-history-revision-architecture.md`
- `docs/sdk/conversation_runtime.md`
- `docs/debug/core_loop_regression_pack.md`
- `plans/2026-06-22-conversation-history-revision-architecture-plan.md`
- `plans/2026-06-23-superseded-turn-live-lane-plan.md`

## Goal

Make the frontend simple by making the SDK projection authoritative.

The renderer and Electron main should consume one narrow user-facing contract:

```text
active conversation view document
  display rows
  live turn projection
  surface intent
```

They should not reconcile raw SDK events, internal `conv-agent-*` lanes,
backend traces, rehydrate snapshots, pending-turn echoes, or model-history
checkpoints.

## Current Problem

Recent edit/resend and streaming bugs showed that frontend simplicity fails
when the renderer receives multiple partial authorities:

- SDK display rows are user-facing history, but current-turn projections can
  arrive from multiple conversation lanes.
- Electron main receives SDK overlay intents directly and can accidentally let
  internal lanes resize the user-facing response overlay.
- The renderer has `latestCurrentTurnProjection`, workspace-scoped current
  turn, pending turn, visible lifecycle, and display rows as separate inputs.
- Internal `conv-agent-*` lanes are useful for runtime bookkeeping, but they
  leaked into normal UI projection.
- Fixes have increasingly become ownership gates around each leak instead of
  one explicit public contract.

The durable architecture already separates display history, model history,
raw runtime events, and revisions. The missing next layer is a small SDK-owned
view contract for host UIs.

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

## Target Contract

Add an SDK-owned `ConversationView` projection.

Example shape:

```ts
type ConversationView = {
  conversationRef: string;
  revisionId: string | null;
  branchId?: string | null;

  displayRows: SdkDisplayRow[];

  liveTurn: {
    conversationRef: string;
    turnRef: string | null;
    phase:
      | "idle"
      | "awaiting"
      | "streaming"
      | "tool"
      | "complete"
      | "error";
    isBusy: boolean;
    isTerminal: boolean;
    entries: SdkLiveTurnEntry[];
    lastError?: SdkRuntimeError | null;
  };

  surfaceIntent: {
    responseOverlay: {
      visible: boolean;
      mode: "hidden" | "typing" | "response";
      ownerConversationRef: string;
      turnRef: string | null;
      staleGuardRef: string | null;
    };
    dashboard: {
      isBusy: boolean;
      turnRef: string | null;
    };
    pill: {
      isBusy: boolean;
      turnRef: string | null;
    };
  };
};
```

The exact names can change, but the contract must stay small and
conversation-scoped.

## Ownership

### SDK Owns Projection

The SDK runtime owns:

- raw events to display rows
- raw/current events to live turn
- edit/resend revision selection
- retry/fork branch authority
- pending-turn dedupe
- superseded-turn inertness
- internal-lane filtering
- model-history checkpoint selection
- surface intent for the active user conversation

### Renderer Renders the View

The renderer owns:

- component layout
- text/input state
- click handlers that call SDK/public renderer actions
- display of `ConversationView.displayRows`
- display of `ConversationView.liveTurn`

The renderer should not infer active turn authority from raw events or
internal lanes.

### Electron Main Applies Surface Intent

Electron main owns:

- native window lifecycle
- surface visibility/focusability
- bounds and content-protection policy
- applying `ConversationView.surfaceIntent`

Electron main should not infer user-facing overlay ownership from raw SDK
current-turn events.

### Diagnostics Are Separate

Debug views may request:

- raw event log
- internal lane events
- backend traces
- model-history checkpoints
- revision graph state
- surface visibility diagnostics

Those diagnostic channels must be opt-in and must not feed normal UI
selectors.

## Desired Normal Flow

### Normal Send

```text
renderer sends user input
-> SDK creates/updates active ConversationView
-> renderer displays optimistic user row and live awaiting state from the view
-> backend events update SDK internals
-> SDK emits updated ConversationView snapshots
-> renderer/main apply snapshots
```

### Edit/Resend

```text
renderer requests revision edit/resend
-> SDK creates child revision and replacement turn
-> SDK supersedes old turn internally
-> SDK emits one active ConversationView for the child revision
-> normal send path continues from that view
```

### Internal Agent Lane

```text
SDK/backend internal lane emits trace/current-turn details
-> SDK records diagnostics if useful
-> SDK does not export it through normal ConversationView
-> renderer/main do not see it as active UI state
```

## Implementation Plan

### 1. Define the SDK ConversationView Type

Add a TypeScript type and runtime normalizer in the SDK conversation runtime.

Keep the first version minimal:

- `conversationRef`
- `revisionId`
- `displayRows`
- `liveTurn`
- `surfaceIntent`

Do not expose raw event arrays, internal lane ids, backend prompt rows, or
model-history rows in the normal view.

### 2. Add SDK View Projection Builder

Create a single SDK projection function that builds the active
`ConversationView` from:

- selected revision head
- display timeline
- current turn projection
- pending turn
- superseded-turn ledger
- active branch metadata

This should be the only code path that decides whether typing, response
content, or terminal state is active for the user conversation.

### 3. Make Internal Lanes Private By Default

Normalize conversation-lane visibility in the SDK.

Rules:

- `conv-agent-*` and future internal lanes are private unless a diagnostics API
  requests them.
- Internal lanes can still persist audit/debug facts.
- Internal lanes cannot drive `ConversationView.liveTurn` or
  `ConversationView.surfaceIntent`.

This should replace ad hoc renderer/main checks over time.

### 4. Replace Renderer Selectors With View Consumption

Change renderer state to store:

```ts
activeConversationView: ConversationView | null;
conversationViews: Record<string, ConversationView>;
```

Then migrate consumers:

- dashboard transcript reads `displayRows`
- response overlay reads `liveTurn` and `surfaceIntent.responseOverlay`
- chat pill reads `surfaceIntent.pill`
- dashboard busy/Stop state reads `surfaceIntent.dashboard`

Delete redundant selectors once each surface is migrated:

- global `latestCurrentTurnProjection`
- duplicate pending/live response overlay derivation
- cross-workspace current-turn fallback selectors
- visible lifecycle fallbacks that only compensate for multiple authorities

### 5. Route Electron Main Through SurfaceIntent

Make the native responsebox controller consume an active-conversation
surface-intent IPC payload instead of raw SDK current-turn intent.

Main should validate:

- payload belongs to the active conversation
- guard ref matches the current active surface guard
- internal lanes are not accepted through the normal channel

### 6. Keep Diagnostics Available

Add or extend diagnostics:

```bash
<windie> conversation view <conversation_id>
```

It should print:

- active revision
- display row count
- live turn phase/turn ref
- surface intent modes
- whether internal lanes were filtered
- whether stale/internal events attempted to affect the view

This keeps the architecture debuggable without pushing raw internals into the
normal UI.

### 7. Delete Legacy Paths

After migration, delete paths that reconstruct normal UI state from:

- raw event log when a display timeline exists
- internal `conv-agent-*` current-turn projections
- independent `latestCurrentTurnProjection` state
- response overlay phase guesses from stale SDK phase snapshots
- renderer-side replay fallbacks that duplicate SDK revision state

Deletion should happen only after tests prove the view contract owns the
behavior.

## Regression Coverage

Add or update owner-correct tests for these timelines:

- normal send: awaiting -> first assistant delta -> complete
- edit first message while old turn is active
- edit middle message after assistant/tool output
- edit/resend with screenshots
- repeated edit/resend while replacement is streaming
- internal `conv-agent-*` awaiting intent during active user response stream
- late old-turn stop/error after supersession
- model-history checkpoint arrives after a newer revision is active
- fork from older revision creates a separate active view

Expected assertions:

- renderer sees one active `ConversationView`
- response overlay never alternates between typing and response after visible
  content exists
- internal lanes are absent from normal view selectors
- diagnostics can still show filtered internal lane events
- display rows remain editable and full-fidelity
- model history remains separate and bounded

Add the primary tests to `core-loop` when they affect chat pill, dashboard,
response overlay, replay, or live-turn projection.

## Migration Strategy

Use an incremental adapter, not a big-bang rewrite:

1. Build `ConversationView` in SDK while existing selectors remain.
2. Add diagnostics to compare current UI projection and new view projection.
3. Migrate one surface at a time to `ConversationView`.
4. Delete old selectors once no surface consumes them.
5. Make internal lane leakage impossible at the SDK public API boundary.

## Non-Goals

- Do not delete raw events.
- Do not remove internal agent lanes.
- Do not move backend model-history ownership into renderer.
- Do not make Electron main understand revision graphs.
- Do not expose diagnostics as normal UI state.

## Open Questions

- Should `ConversationView` live under `conversation.view()` or as a stream
  event such as `conversation_view_updated`?
- Should surface intent be part of the view or a sibling projection keyed by
  conversation ref?
- What is the exact boundary between SDK view projection and renderer local
  composer state?
- How should third-party SDK consumers opt into internal diagnostics without
  making the normal contract harder to use?

## Completion Criteria

This plan is complete when:

- renderer/main consume one active SDK-owned conversation view for normal UI
  state
- internal lanes cannot affect normal user-facing surfaces
- edit/resend, retry, fork, compaction, and rehydrate update the view through
  one revision-aware path
- core-loop tests cover the observed flicker/stuck/duplicate-row classes
- obsolete fallback selectors and raw-event UI reconstruction paths are deleted
- docs clearly distinguish normal view contract from diagnostics
