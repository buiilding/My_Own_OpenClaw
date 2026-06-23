---
summary: "Plan for making edit/resend supersede the entire old live turn as one inert lane, so replacement sends behave like normal sends without deleting raw audit history."
title: "Superseded Turn Live Lane Plan"
---

# Superseded Turn Live Lane Plan

Date: 2026-06-23

Status: implemented in the SDK runtime.

Related architecture:

- `docs/adr/008-conversation-history-revision-architecture.md`
- `docs/sdk/conversation_runtime.md`
- `docs/debug/core_loop_regression_pack.md`
- `plans/2026-06-22-conversation-history-revision-architecture-plan.md`

## Goal

Make edit/resend behave like a normal send after one explicit handoff:

```text
old turn A is superseded
replacement turn B starts cleanly
B follows the normal send path
late A work is audit-only and cannot affect live UI or inference authority
```

The goal is not to delete old raw events. The goal is to delete old live
authority.

## User-Facing Symptom

After rapid edit/resend, the dashboard can still show an indefinite typing
indicator even after the replacement user row and "full message sent" debug row
exist. Recent traces showed multiple root causes in the same area:

- late old-turn events could retake active-turn ownership
- old completed-turn memory persistence could block later backend stream events
- rehydrate fallback messages could leak model-history-only fields
- an active replacement turn could be stopped/superseded while streaming without
  every live surface clearing typing state

The first three have targeted fixes, but the class of bug remains because old
turn work is still handled as many independent edge cases.

## Invariant

When edit/resend or retry replaces turn `A` with turn `B`, turn `A` becomes
superseded immediately.

After that point, any later event, trace, callback, stop acknowledgement,
memory side effect, model-history checkpoint, tool result, or renderer pending
state associated with `A` must not:

- become current turn
- show typing or awaiting state
- clear, overwrite, or roll back `B`
- append visible live assistant content
- run completed-turn memory persistence
- install model-history authority for the active branch
- trigger renderer pending-turn handoff
- keep dashboard, pill, or overlay busy

Late `A` facts may still be persisted as raw audit/debug events if they are
useful for diagnostics, but they are inert for active display/model/live
authority.

## Non-Goal: Delete Old History

Do not delete old turn events from raw history.

Raw events are the audit/debug log. Deleting them would remove evidence while
not reliably cancelling already-running backend/provider/tool callbacks.

The selected revision's display timeline and model-history checkpoint already
control what the user sees and what the model receives. Supersession should
change live authority, not erase audit facts.

## Target Model

Add one explicit supersession concept to the SDK conversation runtime:

```ts
type SupersededTurnRecord = {
  conversationRef: string;
  supersededTurnRef: string;
  replacementTurnRef: string;
  revisionId: string;
  reason: "user_edit" | "retry" | "manual_rewrite";
  createdAt: string;
};
```

This can be represented either as a hidden conversation event or as runtime
state derived from the display replacement plus replacement send. The important
contract is that every live path has a single question it can ask:

```ts
isTurnSuperseded(turnRef): boolean
```

## Desired Flow

### Normal Send

```text
send(B)
-> create pending turn B
-> emit B user row/current turn
-> send B to backend
-> project B backend events
-> terminalize B on complete/error/stop
```

### Edit/Resend While A Is Active

```text
replaceRows(prefix + replacement user row)
-> create child display/model revision
-> supersede A locally
-> best-effort stop/cancel A
-> create pending turn B
-> send B through the normal send path
-> ignore late A for live authority
```

The stop/cancel request is best-effort. Supersession is local and immediate.
Even if the backend/provider cannot stop A, A is already inert in the SDK and
renderer.

## Owner Boundaries

### SDK Runtime Owns Supersession

`SdkConversationRuntime` should own the superseded-turn ledger and active-turn
gate. It is the only layer with enough context to connect:

- display revision replacement
- replacement turn id
- backend event normalization
- current-turn projection
- pending-turn ledger
- memory persistence
- model-history checkpoint application

### Renderer/Main Are Adapters

Electron main and renderer should not infer supersession by comparing local
rows, old pending state, or visible transcript shape. They should receive SDK
events/projections that already encode the terminal/inert state.

Renderer may initiate edit/resend, but once SDK accepts replacement turn `B`,
renderer should treat SDK current-turn projection as authoritative for live
state.

### Backend Stop Is Best-Effort

Backend `stop-query` remains useful for saving provider/tool work. It is not
the source of truth for whether old turn `A` is allowed to affect UI. The SDK
superseded ledger is the local authority.

## Implementation Steps

### 1. Add Superseded-Turn Ledger

Add SDK runtime state for superseded turns.

The ledger should record at least:

- superseded turn ref
- replacement turn ref
- revision id
- reason
- timestamp

It should be created before the replacement send dispatches.

### 2. Emit Explicit Supersession Event

Prefer a hidden SDK event such as:

```ts
type: "turn_superseded"
source: "sdk"
turnRef: oldTurnRef
payload: {
  replacementTurnRef,
  reason,
  revisionId
}
```

This makes replay, diagnostics, and tests deterministic. Display projections
must ignore it. Current-turn projection should terminalize the superseded old
turn and move authority to the replacement turn when it starts.

### 3. Gate Live Effects By Supersession

Every live effect path should check `isTurnSuperseded(turnRef)` before doing
anything that affects live authority:

- active-turn ownership updates
- current-turn projection
- backend event acceptance for live state
- pending-turn clearing
- completed-turn memory persistence
- model-history active checkpoint install
- renderer handoff of SDK current-turn projection
- stop acknowledgement handling
- tool result delivery callbacks when they target old turn state

Raw event append may remain allowed, but it should be marked/traceable as
superseded audit data.

### 4. Terminalize Superseded Active Turn Immediately

When an active turn is superseded, SDK should emit a terminal projection for
the old turn before or alongside replacement turn creation.

Visible result:

```text
old typing state clears immediately
old assistant partials remain only if selected display timeline keeps them
replacement pending/send state becomes the only live lane
```

This should not wait for backend `streaming-complete`, `turn_completed`, or
`stop-query` acknowledgement.

### 5. Make Replacement Send Use Normal Send Path

After supersession, the replacement turn should go through the same SDK `send`
path as a normal send:

- same resource resolution
- same user display row metadata handling
- same backend transport dispatch
- same backend event projection
- same terminal handling

Edit/resend should not need special live-state cleanup after this point.

### 6. Keep Display And Model Revision Authority Separate

Supersession must not replace ADR 008 revision rules.

- Display timeline replacement controls visible history.
- Model-history checkpoint controls inference history.
- Supersession only controls live in-flight authority.
- Raw events stay audit/debug facts.

### 7. Add Diagnostics

Extend `conversation state` or trace output to report:

- active turn ref
- superseded turn count
- latest superseded turn pair
- whether the visible typing turn is superseded
- whether a non-terminal current turn has no accepted backend completion after
  being superseded/stopped

Add hidden traces when a late superseded event is stored but ignored for live
authority:

```text
path: "turn.supersession"
stage: "late_event"
status: "ignored_for_live_authority"
```

No message text, screenshot bytes, tool output, raw provider payload, or local
file paths should be logged.

## Regression Tests

Add owner-correct tests before or with implementation.

### SDK Conversation Runtime

Required cases:

- edit/resend supersedes active awaiting turn before backend `query-accepted`
- edit/resend supersedes active streaming turn after `assistant_delta`
- late old `system_prompt`, `tool_schemas`, `assistant_delta`, `turn_stopped`,
  `turn_completed`, and `model_history_updated` do not affect replacement turn
- old completed-turn memory persistence does not run after supersession
- replacement turn uses normal send path and receives backend stream normally
- raw old events can be stored as audit rows without display/current-turn
  authority

### Main/IPC

Required cases:

- direct wake/send does not rebuild supersession from renderer state
- stop acknowledgement for old turn does not clear replacement pending turn
- SDK current-turn projection for replacement turn is the only live handoff

### Renderer/Core Loop

Required cases:

- dashboard/pill/overlay typing clears immediately when active turn is
  superseded
- repeated edit Send clicks cannot leave typing state stuck
- replacement user row remains visible and old assistant suffix is removed by
  display timeline authority

### Diagnostic

Required case:

- `conversation state` reports superseded live state clearly enough to identify
  a stuck manual reproduction without inspecting raw SQL.

## Deletion And Cleanup

After supersession is implemented and covered, delete special-case guards that
only exist because old turns can still affect live state independently:

- scattered stale old-turn projection filters
- stop-ack-specific replacement pending guards
- renderer-local resend cleanup fallbacks
- ad hoc old-turn memory side-effect guards where supersession covers the case

Keep guards that protect general correctness across conversations or malformed
backend event identities.

## Migration

No storage migration should be required for the first implementation if the
superseded ledger is derived at runtime or stored as hidden SDK events.

If a durable supersession table is added later, old conversations can simply
have an empty supersession ledger.

## Security And Privacy

Supersession diagnostics must not log message text, screenshots, raw tool
outputs, local paths, provider payloads, credentials, or embedding vectors.

The change should reduce accidental data exposure by making late old-turn side
effects inert for active model-history authority.

## Open Questions

- Should `turn_superseded` be a first-class public SDK event type, or a hidden
  SDK control event ignored by public display projections?
- Should supersession prevent raw append of late old backend events, or append
  them as audit rows with superseded metadata?
- Should completed-turn memory persistence be cancelled for superseded turns or
  allowed only when the superseded turn had already completed before the
  supersession record?
- Should backend receive an explicit `superseded_by_turn_ref` control message
  in addition to best-effort `stop-query`?

## Definition Of Done

- Edit/resend creates one replacement live lane that behaves like normal send.
- Old live turn effects are inert by a central SDK rule.
- Raw audit history remains available.
- Display/model revision authority remains ADR 008-compliant.
- Core-loop tests cover repeated rapid edit/resend, active streaming
  supersession, late old backend events, old memory side effects, and stop
  acknowledgements.
- `conversation state` can report superseded-turn state for manual debugging.
