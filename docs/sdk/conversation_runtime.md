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

Stores expose first-class projection loaders, but they should stay dumb:

```text
store.loadForDisplay(conversationRef)
  -> store.loadEvents(conversationRef)
  -> SDK display projection

store.loadForRehydrate(conversationRef)
  -> complete active replay snapshot, when present
  -> otherwise store.loadEvents(conversationRef)
  -> SDK rehydrate projection
```

Do not implement separate role/message/tool interpretation inside each adapter.
The adapter methods are API conveniences; they must delegate to shared SDK
projection builders or to a complete active compacted replay snapshot. This
keeps desktop, CLI, web, and tests on one interpretation path.

The SDK ships two reusable store adapters:

- `InMemoryConversationStore` for tests, demos, and short-lived processes.
- `FileConversationStore` for Node CLI/custom UI hosts that want durable JSON
  event logs without Electron sidecar storage.

## Compaction Rule

Backend `context-compaction-completed` with `skipped_reason` normalizes to
`compaction_skipped`. It is runtime/debug state, not assistant output.

Only `compaction_applied` with actual replacement history should affect compacted
replay snapshots. A store adapter must activate a compacted replay generation
only after the generation is complete and its entry count matches.

When a complete active compacted replay generation exists, `rehydrate()` uses
that replay snapshot. Otherwise it derives rehydrate messages from normalized
events. Rehydrate projection keeps only complete tool-call/tool-output pairs;
dangling calls, orphan outputs, or incomplete bundle pairs stay available to
display/debug projections but are not sent back to backend provider history.

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

## Stream Rule

`SdkConversationRuntime.stream(input)` is the canonical custom-client loop
surface. It sends the user turn, stores the same normalized events used by
display and rehydrate projections, yields `conversation_event` updates as
backend packets normalize, and exits when the conversation reaches
`completed`, `stopped`, or `error`.

Prefer this over wiring `send()` and `subscribe()` separately in CLI or custom
UI clients. UI components can still use `subscribe()` when they only need
projected snapshots.

Startup surfaces should load metadata before full logs. Use
`agent.listConversations({ limit?, cursor? })` for a conversation list, then
`agent.loadConversation(conversationRef)` when a row is opened. The string
shorthand returns the same projected snapshot as the object form; use
`agent.loadConversation({ conversationRef, store, revisionId })` only when a
host needs a non-default store adapter or revision seed.

Backend events must carry `conversation_ref` or `turn_ref` to enter a
conversation runtime. The runtime drops ambiguous packets and ignores packets
whose `conversationRef` or active `turnRef` does not match the runtime. This is
what keeps two conversations on the same websocket from sharing streamed chunks
or stale tool events.

## Tool Rule

When the SDK claims a local tool call or bundle:

1. execute through the local runtime adapter
2. send `tool-result` or `tool-bundle-result` to backend
3. append normalized `tool_output` or `tool_bundle_output`
4. notify UI subscribers through projections

Malformed or unclaimable tool events should remain unclaimed or become explicit
failures; they should not be marked display-only without a backend result path.

`SdkConversationRuntime` can be constructed with a `localRuntime` adapter. In
that mode, normalized backend `tool_call` and `tool_bundle_call` events are
handed to `ToolExecutionCoordinator`, which executes the local runtime, sends
the result back through the transport, and appends the corresponding normalized
output event through the same store/projection path.

Projection builders collapse duplicate tool outputs that share the same
`requestId`, `bundleId`, `correlationId`, or `toolCallId`. This handles the
common local-runtime flow where the SDK appends the local sidecar result and the
backend later emits an acknowledgement `tool-output` for the same tool wait.

Rehydrate projections preserve provider-safe tool history for both single calls
and bundles. A `tool_call` projection must carry the original `tool_calls` and
`toolCallId` when available. A `tool_bundle_call` projection must preserve the
`bundleId`, executable step list, and any provider-facing calls nested in step
metadata; the matching `tool_bundle_output` becomes one model-visible tool
result with the same bundle id. This keeps restart/edit/resend history valid
without replaying a lossy display transcript.

The desktop local snapshot loader uses this SDK projection path when generating
rehydrate payloads from stored transcript rows. That is the first migration step
away from separate renderer-only replay shaping.

## Desktop Migration Target

Desktop React should call runtime commands and render projections. It should not
directly mutate transcript/replay state, interpret compaction lifecycle events,
or route backend tool results after migration.
