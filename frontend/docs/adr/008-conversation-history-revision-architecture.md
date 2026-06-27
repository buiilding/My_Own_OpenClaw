---
summary: "ADR 008 for separating full display history, backend-normalized model history, runtime event logs, and revision graph ownership so edit/resend, compaction, rehydrate, and fork share one architecture."
read_when:
  - When changing conversation persistence, SDK display rows, backend rehydrate, model-facing history, compaction, edit/resend, retry, or fork behavior.
  - When debugging drift between visible transcript rows and LLM inference context.
title: "ADR 008: Conversation History Revision Architecture"
---

# ADR 008: Conversation History Revision Architecture

## Status

Implemented as of 2026-06-22.

The implementation keeps the ADR split between display timelines,
model-history checkpoints, runtime events, and revision nodes. The original
implementation plan remains historical context:
`plans/2026-06-22-conversation-history-revision-architecture-plan.md`.

## Context

WindieOS currently treats the SDK `ConversationEvent[]` log as the durable
source for display projection, replay, backend rehydrate, edit/resend, retry,
and conversation resume. That has made the core loop increasingly hard to
reason about.

The product needs multiple truths for different consumers:

- users need a full faithful history, including untruncated tool outputs,
  screenshots, pre-compaction messages, and previous edit/fork ancestors
- models need bounded backend-normalized inference history, including
  truncated tool outputs, provider-safe tool-call linkage, compaction summaries,
  and selected recent tail rows
- runtime/debug tooling needs low-level events, traces, lifecycle state, raw
  tool facts, and attachment metadata
- edit/resend and fork need revision semantics instead of destructive mutation
  of one linear transcript

The existing split is incomplete:

- SDK display rows are useful for UI, but are not the durable editable
  conversation document
- SDK rehydrate reconstructs backend history from SDK events, even though the
  backend already normalizes live model history
- live tool outputs are truncated before backend history commit, while
  rehydrated tool outputs can become full if stored SDK event payloads contain
  full output
- compaction changes model context, but must not remove the user's ability to
  inspect full earlier conversation history
- renderer edit/resend performs special replay preparation, preemptive visible
  mutation, rollback, and query dispatch sequencing

## Decision

WindieOS will split conversation state into four first-class concepts:

```text
ConversationEventLog
  raw runtime/audit facts, lifecycle, traces, full tool results, attachment refs

DisplayTimeline
  user-visible full transcript, editable SDK public document, branch annotations

ModelHistoryLedger
  backend-normalized provider-neutral inference rows/checkpoints

RevisionGraph
  parent/child revisions for send, edit, retry, fork, compaction, and rewrites
```

Current-turn projection remains live streaming state only. It is not durable
history truth.

### Authority Rules

Each document has one owner and one consumer class:

- `ConversationEventLog` is immutable audit/runtime history. It can seed
  legacy display projection only when no display timeline checkpoint exists.
- `DisplayTimeline` is the editable user-visible document. UI edit, retry, and
  fork operations must mutate this document through SDK revision APIs rather
  than rewriting raw events.
- `ModelHistoryLedger` is the LLM-facing document. Normal resume installs the
  selected revision's model-history checkpoint instead of rebuilding inference
  context from display rows or raw events.
- `RevisionGraph` is the current-branch authority. Storage and diagnostics must
  select the active/current branch from revision nodes first, then load display
  and model-history contents by the selected ids.

An empty display timeline is a valid document. `rows: []` means the selected
revision intentionally retained no prior visible rows; it must not be treated
as an absent checkpoint or converted into raw event replay.

### Display Timeline

The display timeline is the public editable conversation document for SDK host
UIs. It preserves full user-visible history, including full tool outputs and
pre-compaction messages.

Renderer and custom UIs may edit display rows/timelines, but they must submit
changes through SDK revision APIs. They must not write backend model history or
raw conversation events directly.

### Model History Ledger

The backend owns model-history normalization. During live turns, compaction,
and display-timeline replacement, the backend emits provider-neutral
model-history rows/checkpoints for SDK/local-runtime persistence.

Model history rows store bounded model-facing content. Full raw tool outputs
belong in display/runtime history, not model history.

Provider adapters convert provider-neutral model history to provider-specific
payloads at prompt time. Provider-specific payloads are not durable local truth.

### Revision Graph

Edits, retries, compactions, sends, manual rewrites, and forks create revision
nodes. Editing an old message creates a child revision; it does not corrupt or
delete the parent. Forking creates a new conversation from a selected source
revision and row cut point.

The UI may present active child revisions as normal edits, but storage must
retain ancestry enough to inspect previous paths and support future branch/fork
workflows.

The local-runtime revision ledger stores one durable node per revision with
parent revision id, operation, display timeline id, model-history checkpoint
id, timestamps, and active state. Existing callers that only need the active
head still use `conversation.get_revision`, while revision-specific display
timeline/model-history loaders preserve inactive ancestors.

Local-runtime branch selection must use one current-branch selector. Late
parent checkpoint writes must not reactivate a parent over an edited child, and
read paths must recover stale parent-active rows by preferring an edited child
of the active parent.

### Rehydrate

Rehydrate means installing persisted model history into a backend session.

Normal resume must stop rebuilding backend inference history from display rows
or raw SDK event projections. It should load the selected revision's persisted
model-history checkpoint and install that provider-neutral history into the
backend session.

### Edit/Retry

Edit/resend and retry are no longer special SDK replay concepts. They are
display-timeline replacement plus normal send:

```ts
await conversation.replaceRows({
  rows: revisedDisplayRows,
  baseRevisionId,
  reason: "user_edit",
});

await conversation.send({
  text: revisedUserText,
});
```

Retry uses the same primitive with a revised timeline that ends at the
triggering user message, followed by `send(previousUserText)`.

## Alternatives Considered

| Alternative | Reason not chosen |
| --- | --- |
| Keep `ConversationEvent[]` as the only durable truth | Events are good audit/runtime facts, but poor public edit documents and insufficient for preserving backend-normalized model history without projection drift. |
| Use SDK display rows directly for backend rehydrate | Display rows are human-facing and full-fidelity; using them for inference either sends too much context or turns display rows into provider-history objects. |
| Persist provider-specific prompt payloads | Couples durable local state to OpenAI/Anthropic/Gemini payload details and makes provider changes/migrations harder. |
| Keep edit/resend as special SDK APIs | Preserves the current brittle replay ritual instead of creating reusable primitives for edit, retry, fork, and future conversation surgery. |
| Let compaction mutate visible history | Hides information the user should be able to inspect and conflates context-window management with transcript truth. |

## Consequences

- Local-runtime storage must gain durable model-history and revision-graph
  storage, not only chat-event storage.
- Backend turn completion and compaction must emit provider-neutral
  model-history checkpoint updates.
- SDK rehydrate must load persisted model history instead of building normal
  resume context from display/runtime event projections.
- SDK public conversation APIs must expose foundational timeline/revision
  primitives such as `replaceRows(...)`, `fork(...)`, and revision checkout.
- Renderer resend/retry must migrate to `replaceRows(...) + send(...)`.
- Public or active-path `prepareEditAndResend` and `prepareRetryTurn` should be
  deleted rather than preserved as long-term compatibility.
- Full display history and bounded model history can intentionally diverge, and
  tests must assert that divergence.

## Validation And Docs Impact

Implementation must update:

- SDK conversation runtime docs and tests for display timeline replacement,
  revision graph behavior, model-history loading, and fork behavior.
- Backend rehydrate and conversation-history docs/tests so rehydrate installs
  persisted model history.
- Backend tool-output tests to prove live and resumed inference use the same
  bounded model-facing tool output.
- Compaction docs/tests to prove display history remains inspectable after
  model-history compaction.
- Core Loop Regression Pack and User-Facing Regression Pack for edit/resend,
  retry, resume, compaction, and fork user-visible behavior.
- ADR index and related memory/transcript/replay docs when implementation
  starts.

Storage changes require a migration note. Old conversations must either be
migrated once into model-history checkpoints or first-open normalized before
continuation. The long-term architecture must not silently preserve
reconstruct-model-history-from-display/events as normal resume behavior.

## Security And Privacy

Full tool outputs may include sensitive local data. They should remain local
unless explicitly shared. Model-history rows should contain bounded
model-facing output, not raw full output.

Diagnostics should log ids, counts, statuses, and revision metadata, not full
tool output, screenshot bytes, or provider prompt payloads.

Use `<windie> conversation state <conversation-ref> [--json]` to inspect the
selected revision, display timeline row count, model-history checkpoint row
count, raw event count, and stale parent/child mismatches without dumping
message bodies or tool outputs.
