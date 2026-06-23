---
summary: "Plan for separating full user-visible history, backend-normalized model history, runtime events, and conversation revisions so edit/resend, compaction, rehydrate, and fork share one clean architecture."
title: "Conversation History Revision Architecture Plan"
---

# Conversation History Revision Architecture Plan

Date: 2026-06-22

Implementation status: completed as of 2026-06-22. This document remains the
historical implementation plan; the current durable contract is summarized in
`docs/adr/008-conversation-history-revision-architecture.md` and
`docs/sdk/conversation_runtime.md`.

## Goal

Replace the current edit/resend and retry replay path with a foundational
conversation architecture that treats display history, model-facing history,
runtime events, and revisions as separate first-class concepts.

The target is simple:

```text
users see the full conversation
models receive the bounded/compacted inference history
runtime events preserve what actually happened
edits and forks create new revisions instead of mutating one fragile transcript
```

This plan was originally written before the runtime changes landed. It now
records the implementation sequence that delivered the ADR 008 architecture.

## Product Invariant

A WindieOS conversation must preserve all user-visible history while allowing
the LLM-facing history to differ for inference safety and context control.

The user-visible record must retain:

- full user messages
- full assistant messages
- full untruncated tool outputs
- screenshots and visual attachments
- pre-compaction messages
- old edit/fork ancestors when a user wants to inspect them
- tool/runtime diagnostics that are appropriate for debugging views

The model-facing record must retain:

- backend-normalized user, assistant, and tool history
- provider-safe tool-call/tool-output linkage
- bounded model-facing tool output text
- compaction summaries and selected recent tail rows
- multimodal references needed for inference
- enough revision metadata to prove which display revision it belongs to

Current-turn state remains live streaming state only. It must not become
durable history truth.

## Current Problem

Today the durable source of truth is the SDK `ConversationEvent[]` log. SDK
display rows and rehydrate snapshots are projections from that log.

That is workable for replay, but it makes edit/resend and rehydrate brittle:

- display rows are the useful human transcript, but they are not the editable
  durable document
- rehydrate rebuilds backend model history from SDK events, even though the
  backend already knows how to normalize model-facing history during live turns
- live tool outputs are truncated before backend history commit, while
  rehydrated tool outputs can become full if the SDK event payload contains full
  output
- compaction changes model history, but full pre-compaction display history
  should remain inspectable
- edit/resend is implemented as a special replay ritual instead of a general
  revision operation
- fork is not a natural primitive because conversation history is treated like
  a linear mutable transcript

The architecture should stop treating one history shape as sufficient.

## Target Model

Introduce four distinct durable or semi-durable concepts:

```text
ConversationEventLog
  raw runtime/audit facts, full tool results, traces, attachments, lifecycle

DisplayTimeline
  user-visible rows, full outputs, pre-compaction content, branch annotations

ModelHistoryLedger
  backend-normalized provider-neutral inference rows/checkpoints

RevisionGraph
  parent/child revisions, edit/fork/compaction/send operations, pointers to
  display and model-history state
```

Keep current-turn as the live streaming projection:

```text
CurrentTurn
  ephemeral active turn projection for UI streaming, not persistent truth
```

## Ownership

| Concern | Owner | Notes |
| --- | --- | --- |
| Full runtime/audit events | SDK runtime + local-runtime store | Append runtime facts, tool lifecycle, traces, raw/full tool results, attachment refs. |
| Human display timeline | SDK public conversation API | Editable public document for host UIs. Built from events for live turns, persisted as revision display state. |
| Model-facing history | Backend | Backend normalizes, truncates, links tool calls, applies compaction, and emits provider-neutral model-history rows back to SDK for persistence. |
| Revision graph | SDK + local-runtime store | Tracks sends, edits, forks, compactions, parent revisions, child revisions, and active head. |
| Provider conversion | Backend provider adapters | Convert provider-neutral model history to OpenAI/Anthropic/Gemini/etc payloads at prompt time. |
| Renderer | UI adapter | Edits display timelines and calls SDK primitives. It does not rebuild backend history. |

## Durable Shapes

### Display Timeline

The display timeline is the public editable conversation document.

It should contain user-facing rows:

```ts
type DisplayTimelineRow = {
  id: string;
  conversationRef: string;
  revisionId: string;
  turnRef?: string | null;
  role: "user" | "assistant" | "tool" | "system";
  type: string;
  content: unknown;
  attachments?: SdkDisplayAttachment[];
  metadata?: Record<string, unknown>;
};
```

It may include full tool output and full pre-compaction history. It should not
need to carry provider-specific prompt payloads.

### Model History Ledger

The model history ledger is the backend-normalized inference source. It is
provider-neutral, not OpenAI/Anthropic/Gemini-specific.

Example:

```ts
type ModelHistoryRow = {
  id: string;
  conversationRef: string;
  revisionId: string;
  role: "system" | "user" | "assistant" | "tool";
  messageType:
    | "user_query"
    | "assistant_response"
    | "tool_output"
    | "context_compaction";
  content: unknown;
  toolCallId?: string | null;
  toolCalls?: unknown[] | null;
  toolName?: string | null;
  imageRefs?: string[] | null;
  compactionFacts?: Record<string, unknown> | null;
  sourceDisplayRowIds?: string[];
};
```

Tool output rows must store bounded model-facing content. Full raw output
belongs in display/runtime history, not model history.

### Revision Graph

Every durable operation creates or references a revision:

```ts
type ConversationRevisionNode = {
  revisionId: string;
  conversationRef: string;
  parentRevisionId?: string | null;
  operation:
    | "send"
    | "edit"
    | "retry"
    | "fork"
    | "compact"
    | "manual_rewrite";
  displayTimelineId: string;
  modelHistoryCheckpointId: string;
  createdAt: string;
  active?: boolean;
};
```

Edits and forks are not destructive mutations. They create child revisions.
The UI can present the active child as an edit, but storage should retain the
ancestor relationship.

## Core Flows

### Live Send

```text
renderer/SDK send(text, resources)
-> SDK appends runtime events and optimistic display row/current turn
-> backend processes turn
-> backend truncates/normalizes tool outputs into model history
-> backend emits assistant/tool/display events plus model-history checkpoint
-> SDK persists:
   - runtime events
   - display timeline rows with full user-visible output
   - model-history rows/checkpoint with bounded inference output
   - revision node for the completed turn
```

### Rehydrate

Rehydrate should stop reconstructing model history from display rows or raw
events.

Target:

```text
SDK loads ModelHistoryLedger checkpoint for revision
-> backend installs provider-neutral model history into session
-> next send continues from that model history
```

Rehydrate still exists, but its meaning changes:

```text
rehydrate = install persisted model history
```

not:

```text
rehydrate = rebuild model history from display/runtime events
```

### Compaction

Compaction creates a new model-history checkpoint and revision metadata. It
does not delete or hide display history.

```text
DisplayTimeline:
  full old messages remain visible

ModelHistoryLedger:
  old model rows replaced by summary + selected tail

RevisionGraph:
  compact revision points to same or annotated display timeline and new model checkpoint
```

The UI can show a compaction marker, but users must still be able to inspect
the full prior transcript/tool output.

### Edit And Resend

Edit/resend should become:

```ts
const revised = editDisplayTimelineRows(rows);

await conversation.replaceRows({
  rows: revised,
  baseRevisionId,
  reason: "user_edit",
});

await conversation.send({
  text: revisedUserText,
});
```

Under the hood:

```text
replaceRows
-> validate display rows
-> create child revision from base revision
-> mark model history stale from changed point
-> ask backend to normalize revised display suffix into model-history rows
-> persist display timeline + model-history checkpoint + revision node
```

Then `send()` continues from the child revision's model history.

### Retry

Retry is not a special SDK concept. It is a display-timeline replacement that
removes a suffix and sends again from the previous user row.

```text
retry assistant row
-> build revised display timeline ending at triggering user row
-> replaceRows(reason="retry")
-> send(previous user text)
```

### Fork

Fork is a first-class revision graph operation:

```ts
await conversation.fork({
  sourceRevisionId,
  cutAfterRowId,
  newConversationRef,
});
```

Target behavior:

```text
source conversation keeps original branch
new conversation receives display prefix and matching model-history checkpoint
new conversation continues independently
```

The fork should not copy unbounded raw tool output into model history. It should
copy or reference the display timeline for user inspection and copy the bounded
model-history checkpoint for inference.

## Public SDK API Target

Keep APIs foundational and reusable:

```ts
await conversation.loadDisplayTimeline();
await conversation.loadModelHistory({ revisionId });
await conversation.replaceRows({ rows, baseRevisionId, reason });
await conversation.send({ text });
await conversation.fork({ sourceRevisionId, cutAfterRowId, newConversationRef });
await conversation.checkoutRevision({ revisionId });
```

Delete renderer-specific replay APIs from the active path:

- `prepareEditAndResend`
- `prepareRetryTurn`
- hook-owned rewrite/rehydrate/query sequencing
- visible-row rollback after preemptive resend mutation
- renderer-owned backend rehydrate shaping

If temporary compatibility is needed during migration, keep it small,
internal, and scheduled for deletion in the same workstream. Do not preserve
legacy public APIs as long-term architecture.

## Storage Direction

The local-runtime store should own durable tables for:

- conversation events
- display timeline rows or display checkpoints
- model history rows/checkpoints
- revision graph nodes
- attachments/artifact refs

The existing `conversation.replace` and `conversation.rewrite_after_event`
storage commands are useful, but the target architecture likely needs explicit
model-history and revision commands instead of overloading event replacement.

Candidate commands:

```text
conversation.revision.create
conversation.display.replace
conversation.model_history.replace
conversation.model_history.load
conversation.fork
```

## Backend Contract Direction

The backend should emit normalized model-history updates as part of turn
completion, compaction completion, and rehydrate/replaceRows normalization.

Candidate outbound event:

```json
{
  "type": "model-history-updated",
  "conversation_ref": "conv",
  "revision_id": "rev",
  "checkpoint_id": "mh",
  "rows": []
}
```

The rows must be provider-neutral. Provider adapters remain responsible for
provider-specific payload conversion at prompt time.

## Deletion Targets

This architecture is not complete until these surfaces are removed or reduced
to trivial adapters:

- renderer replay preparation logic in `useConversationReplayActions`
- SDK `prepareEditAndResend` and `prepareRetryTurn` as public concepts
- backend model history reconstruction from display/runtime event projections
  during normal resume
- renderer UI rollback caused by mutating visible state before the SDK accepts a
  revision
- any fallback that treats display rows, backend active history, and runtime
  events as interchangeable truth

## Implementation Sequence

### Phase 1: Document And Guard Existing Drift

- Add focused tests proving current live tool output truncation and rehydrate
  behavior differ when persisted SDK events contain full output.
- Add a failing/expected-failing architecture test or TODO guard for
  `prepareEditAndResend` / `prepareRetryTurn` removal.
- Document that this is an architecture gap, not an accepted invariant.

### Phase 2: Add ModelHistoryLedger

- Define provider-neutral `ModelHistoryRow` SDK/backend contract.
- Teach backend turn completion and tool-result handling to emit model-history
  checkpoint updates.
- Persist model-history rows/checkpoints in local-runtime storage.
- Add load/install command for backend session history from persisted model
  history.

### Phase 3: Make Rehydrate Install Model History

- Change SDK rehydrate path to load persisted model-history checkpoint.
- Change backend rehydrate handler to install model history directly.
- Keep display/runtime-event projection out of the normal rehydrate path.
- Validate tool-call/tool-output linkage and bounded tool outputs survive.

### Phase 4: Add DisplayTimeline Revision API

- Promote display rows/timeline to the public editable SDK document.
- Add `conversation.replaceRows(...)`.
- Validate rows, revision ids, attachment refs, tool pairs, and stale model
  history boundaries.
- Persist display timeline revisions separately from raw runtime events.

### Phase 5: Replace Edit/Retry Path

- Rewrite renderer edit/resend to:

```text
build revised display rows
-> replaceRows
-> send
```

- Rewrite try-again to the same primitive.
- Delete replay-specific prepare commands and renderer rollback flow.

### Phase 6: Add Fork

- Add revision graph support for forked child conversations.
- Add SDK `fork(...)`.
- Persist display prefix and matching model-history checkpoint for the new
  conversation.
- Add dashboard/list metadata support for forks without flattening ancestry.

### Phase 7: Delete Legacy Replay/Rehydrate Code

- Remove renderer-specific replay shaping.
- Remove SDK public edit/retry preparation APIs.
- Remove rehydrate-from-display/runtime-event path from normal resume.
- Keep only diagnostic/export paths for raw events.

## Validation Matrix

| Behavior | Owner layer | Required proof |
| --- | --- | --- |
| Full tool output remains visible after restart. | Display timeline + SDK projection | Persist huge tool output, reload display timeline, assert full content is visible/searchable. |
| LLM receives bounded tool output live and after resume. | Backend model history + SDK storage | Same tool result live and rehydrated produce the same bounded model-history row. |
| Compaction does not remove display history. | Model history ledger + display timeline | Compact conversation, reload UI history, assert old rows remain visible while model history uses summary. |
| Edit creates child revision and does not corrupt parent. | Revision graph + display timeline | Edit early user row, assert original revision remains inspectable and child revision continues independently. |
| Retry uses `replaceRows + send`. | Renderer + SDK | Assert retry does not call special prepare replay command and does not pre-mutate visible state before SDK accepts revision. |
| Fork creates independent conversation continuation. | SDK + local-runtime storage | Fork at row N, continue child, assert parent unchanged and child model history starts from fork checkpoint. |
| Backend rehydrate installs persisted model history. | Backend rehydrate service | Rehydrate from model-history rows without rebuilding from SDK event/display projection. |
| Provider adapters remain provider-specific only at prompt time. | Backend providers | Tests assert stored model history is provider-neutral and converted by provider adapter. |

## Migration Notes

No compatibility-first architecture. The migration may temporarily bridge old
storage while the work is in progress, but the end state should delete the
special replay APIs and projection-based rehydrate path.

Storage changes need an explicit migration note. If old conversations cannot
produce model-history checkpoints, choose one owner-correct migration path:

1. one-time local migration that asks backend to normalize old event history
   into model history, or
2. first-open migration that builds and persists model history before allowing
   continuation.

Do not silently continue old conversations by reconstructing provider history
from display rows forever.

## Security And Privacy Notes

- Full tool outputs may include sensitive local file contents. They must remain
  local unless explicitly shared.
- Model-history rows should contain bounded model-facing output, not raw full
  outputs.
- Diagnostic traces must log counts, ids, and statuses, not full tool output or
  raw screenshot data.
- Fork/edit metadata must not leak machine-specific paths beyond existing
  workspace binding rules.
- Provider-specific payloads should not be persisted as durable local truth.

## Open Questions

- Should display timeline rows be stored as row snapshots, event-derived
  checkpoints, or both?
- Should model-history checkpoints be per completed turn, per revision, or both?
- How should the UI expose ancestry: inline edit markers, branch switcher, or
  dashboard-level fork list?
- Should compaction create a visible display marker row, revision metadata only,
  or both?
- What is the exact migration behavior for conversations that predate
  model-history persistence?
