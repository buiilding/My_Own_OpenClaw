---
summary: "SDK conversation runtime contract for normalized conversation events, dumb stores, projections, compaction lifecycle handling, edit/retry revisions, and UI adapter boundaries."
read_when:
  - When changing SDK conversation state, store adapters, projections, edit/resend, retry, compaction replay, or desktop chat migration.
  - When debugging skipped compaction display, replay/rehydrate drift, duplicate transcript rows, or custom UI/CLI conversation behavior.
title: "SDK Conversation Runtime"
---

# SDK Conversation Runtime

The TypeScript SDK owns the reusable client-side conversation runtime. The
Electron desktop is the flagship client, but it should consume SDK projections
instead of privately shaping transcript, replay, tool, and compaction state.

## Ownership

| Surface | Owner | Notes |
| --- | --- | --- |
| normalized conversation events | SDK runtime | source of truth for local client-side conversation state |
| event store adapters | SDK-defined interface; adapter implementation owns persistence mechanics | stores append/load events and snapshots, but do not interpret display or rehydrate shape |
| display transcript | SDK projection | React, CLI, and custom UIs render this projection |
| backend rehydrate payload | SDK projection | generated from normalized events, not visible transcript rows |
| tool execution coordination | SDK runtime | claimed local tools must return exactly one backend result or failure |
| sidecar execution | local sidecar | sidecar runs local tools; it does not own conversation replay semantics |
| backend provider history | backend | provider-safe history remains backend-owned after result ingress |

## Event Model

The runtime records normalized events:

- `conversation_created`
- `conversation_loaded`
- `conversation_rewritten`
- `turn_started`
- `turn_completed`
- `turn_stopped`
- `turn_error`
- `user_message`
- `assistant_delta`
- `assistant_message`
- `tool_call`
- `tool_output`
- `tool_bundle_call`
- `tool_bundle_output`
- `compaction_started`
- `compaction_skipped`
- `compaction_applied`
- `compaction_failed`
- `settings_updated`
- `runtime_error`

Every event carries `eventId`, `conversationRef`, `revisionId`, `timestamp`,
`source`, and optional `turnRef`.

## Store Rule

Stores should stay dumb:

```text
store.loadEvents(conversationRef)
  -> SDK projection -> display transcript
  -> SDK projection -> backend rehydrate snapshot
```

Do not implement separate `loadForDisplay` or `loadForRehydrate` logic inside
each adapter. That recreates drift across desktop, CLI, web, and tests.

## Compaction Rule

Backend `context-compaction-completed` with `skipped_reason` normalizes to
`compaction_skipped`. It is runtime/debug state, not assistant output.

Only `compaction_applied` with actual replacement history should affect compacted
replay snapshots. A store adapter must activate a compacted replay generation
only after the generation is complete and its entry count matches.

When a complete active compacted replay generation exists, `rehydrate()` uses
that replay snapshot. Otherwise it derives rehydrate messages from normalized
events.

## Revision Rule

Edit/resend and retry are revision operations:

```text
load events
  -> choose target user turn
  -> preserve events before that user turn
  -> commit conversation_rewritten with new revisionId
  -> send replacement user message as a new turn
```

The old revision remains valid until the rewrite commits. The SDK does not
delete display rows and then reconstruct backend history through a separate
lossy path.

## Tool Rule

When the SDK claims a local tool call or bundle:

1. execute through the local runtime adapter
2. send `tool-result` or `tool-bundle-result` to backend
3. append normalized `tool_output` or `tool_bundle_output`
4. notify UI subscribers through projections

Malformed or unclaimable tool events should remain unclaimed or become explicit
failures; they should not be marked display-only without a backend result path.

## Desktop Migration Target

Desktop React should call runtime commands and render projections. It should not
directly mutate transcript/replay state, interpret compaction lifecycle events,
or route backend tool results after migration.
