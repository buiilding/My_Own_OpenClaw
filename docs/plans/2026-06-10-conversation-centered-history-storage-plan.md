---
summary: "Plan for reorganizing WindieOS local history storage around conversation-centered inspection while preserving the existing conversation runtime behavior."
read_when:
  - When changing local chat history storage, conversation event ledgers, conversation revisions, conversation titles, trace-event inspection, or memory links.
  - When deciding how WindieOS should let a developer click a conversation id and inspect everything that happened in that conversation.
title: "Conversation-Centered History Storage Plan"
---

# Conversation-Centered History Storage Plan

Status: complete.

## User Intent

The user wants WindieOS storage to feel organized by conversation.

The current local SQLite viewer exposes `chat_events` as one large table that
contains events for every conversation. That makes the storage hard to inspect:
the developer has to open a raw table, manually filter by `conversation_id`, and
then manually join the meaning of events, traces, revisions, titles, and memory
activity.

The desired workflow is:

```text
Open conversations.
Click one conversation_id.
See everything that happened in that conversation:
  transcript
  turns
  raw events
  traces
  revisions
  title state
  memory writes and retrieval links
  tool/artifact activity
```

The core runtime behavior must not change. SDK conversation stores should still
append events, load events, rewrite a conversation, get revisions, list
metadata, search conversations, delete conversations, and rehydrate backend
history through the same public contracts.

## Current Shape

Current local sidecar storage puts several domains into:

```text
~/Library/Application Support/desktop-assistant/memory/episodic.db
```

Important tables:

```text
chat_events
chat_conversation_revisions
conversation_titles
memories
```

Current behavior is already logically conversation-scoped because most reads use
`conversation_id`. The physical and inspection model is still table-first:

```sql
SELECT *
FROM chat_events
WHERE conversation_id = ?;
```

Problems:

- `chat_events` is a raw implementation table, not a conversation-centered
  inspection surface.
- `episodic.db` now stores conversation history and traces, not only episodic
  memory.
- Trace rows are hidden conversation events, but a developer browsing raw
  SQLite has to know how to filter them.
- Conversation revisions and titles are separate tables, but there is no
  first-class conversation aggregate view that joins the pieces.
- The dashboard/list path repeatedly derives conversation metadata from event
  rows instead of reading a clear conversation index.

## Target Shape

WindieOS should have a conversation-centered history domain. The first target is
not one dynamic table per conversation. Dynamic per-conversation tables make
migrations, indexes, queries, tooling, and cleanup harder.

The target is a stable set of conversation-centered tables:

```text
history.db
  conversations
  conversation_turns
  conversation_events
  conversation_titles
  conversation_revisions
```

The important product model is:

```text
conversation_id -> all inspectable history for that conversation
```

The storage engine remains SQLite. The core change is the division and naming
of data, not the runtime mechanism.

## Source Of Truth

- SDK remains the owner of conversation event semantics and projection.
- Sidecar remains the local durable storage owner for conversation history,
  trace rows, revision pointers, titles, and memory links.
- Renderer/dashboard should not query raw `chat_events` as the user-facing
  model. It should use conversation-centered APIs.
- CLI diagnostics should start from a conversation id and turn id, not from a
  raw table name.
- Backend active history remains separate from local persisted conversation
  history.
- Memory storage remains separate because memory can be sourced from one
  conversation and retrieved into another.

## Recommended Storage Boundary

Keep the first implementation logically compatible with the existing local
SQLite file while designing toward a dedicated history database.

Current physical location:

```text
desktop-assistant/memory/episodic.db
```

Target physical location:

```text
desktop-assistant/history/history.db
```

Do not start with one table per conversation:

```text
bad:
  conv_abc123
  conv_def456
  conv_xyz789
```

Use stable tables keyed by `conversation_id`:

```text
target:
  conversations
  conversation_turns
  conversation_events
  conversation_titles
  conversation_revisions
```

This keeps the developer experience conversation-centered without sacrificing
SQLite migrations and query ergonomics.

## Canonical Model

### `conversations`

One row per conversation.

Fields:

- `user_id`
- `conversation_id`
- `status`
- `title`
- `created_at`
- `updated_at`
- `last_message`
- `event_count`
- `turn_count`
- `workspace_path`
- `workspace_name`
- `latest_revision_id`
- `archived_at`
- `deleted_at`

Purpose:

- dashboard list source
- conversation picker
- first click target for inspection
- cheap metadata read without scanning all events

### `conversation_turns`

One row per turn.

Fields:

- `user_id`
- `conversation_id`
- `turn_ref`
- `status`
- `started_at`
- `completed_at`
- `model_provider`
- `model_id`
- `user_event_id`
- `assistant_event_id`
- `trace_count`
- `tool_call_count`
- `memory_retrieval_status`

Purpose:

- click one turn and see all events and traces for it
- avoid deriving turn summaries by repeatedly scanning the event table
- make runtime diagnostics easier to inspect

### `conversation_events`

Canonical event ledger.

This is the renamed/reorganized equivalent of `chat_events`.

Fields should preserve the current `chat_events` behavior:

- `id`
- `user_id`
- `conversation_id`
- `turn_ref`
- `event_type`
- `role`
- `content`
- `message_index`
- `timestamp`
- `revision_id`
- tool/correlation fields
- workspace fields
- producer fields
- metadata
- attachments
- `event_payload`
- compaction checkpoint

`message_index` remains conversation-ordered, not turn-local. A single turn can
occupy message indexes such as 37 through 58. Add `turn_event_index` later only
if a real turn-local ordering requirement appears.

Purpose:

- replay
- display projection
- backend rehydrate projection
- edit/resend rewrite
- retry
- raw event inspection
- durable trace rows through `event_type = 'trace_event'`

Example:

```text
conversation_id    turn_ref       event_type              message_index  timestamp               event_payload
conv_65a5...       81325cf0...    turn_started            1              2026-06-10T22:18:21Z     {...}
conv_65a5...       81325cf0...    user_message            2              2026-06-10T22:18:21Z     {"text":"hello"}
conv_65a5...       81325cf0...    trace_event             3              2026-06-10T22:18:21Z     {"path":"memory.retrieval","status":"started"}
conv_65a5...       81325cf0...    trace_event             4              2026-06-10T22:18:22Z     {"path":"memory.embedding","status":"succeeded"}
conv_65a5...       81325cf0...    user_message_metadata   5              2026-06-10T22:18:22Z     {...}
conv_65a5...       81325cf0...    assistant_message       6              2026-06-10T22:18:24Z     {"text":"hey"}
conv_65a5...       81325cf0...    turn_completed          7              2026-06-10T22:18:24Z     {...}
```

### `conversation_revisions`

Renamed/reorganized equivalent of `chat_conversation_revisions`.

Purpose:

- latest revision pointer per conversation
- edit/resend and rewrite safety
- fast SDK `getRevision()`

### `conversation_titles`

Keep title state conversation-scoped.

Fields:

- `user_id`
- `conversation_id`
- `title`
- `source`
- `is_locked`
- `updated_at`

Purpose:

- dashboard labels
- generated title state
- locked title protection

## Required Indexes

Use indexes that match the click-through inspection paths:

```sql
CREATE INDEX idx_conversation_events_order
ON conversation_events(user_id, conversation_id, message_index, timestamp);

CREATE INDEX idx_conversation_events_turn
ON conversation_events(user_id, conversation_id, turn_ref, message_index);

CREATE INDEX idx_conversation_events_type
ON conversation_events(user_id, conversation_id, event_type, timestamp);

CREATE INDEX idx_conversations_updated
ON conversations(user_id, updated_at);
```

## Click-Through Inspection Queries

Clicking a conversation id should run:

```sql
SELECT *
FROM conversation_events
WHERE user_id = ?
  AND conversation_id = ?
ORDER BY message_index, timestamp;
```

Clicking a turn should run:

```sql
SELECT *
FROM conversation_events
WHERE user_id = ?
  AND conversation_id = ?
  AND turn_ref = ?
ORDER BY message_index, timestamp;
```

Clicking traces should run:

```sql
SELECT *
FROM conversation_events
WHERE user_id = ?
  AND conversation_id = ?
  AND turn_ref = ?
  AND event_type = 'trace_event'
ORDER BY message_index, timestamp;
```

## Runtime API Contract

Existing SDK store APIs should remain stable:

```ts
appendEvent(event)
appendEvents(events)
loadEvents(conversationRef)
loadForDisplay(conversationRef)
loadDisplayRows(conversationRef)
loadForRehydrate(conversationRef)
rewriteConversation(plan)
replaceCompactedReplay(snapshot)
listMetadata(options)
searchMetadata(options)
deleteConversation(conversationRef)
clearConversations()
getRevision(conversationRef)
loadCompactedReplay(conversationRef)
```

Sidecar RPC names can remain temporarily for compatibility:

```text
store_chat_event
get_chat_events
list_chat_conversations
search_chat_conversations
replace_chat_conversation
get_chat_conversation_revision
```

New canonical sidecar APIs should be conversation-named:

```text
conversation.append_event
conversation.load_events
conversation.list
conversation.search
conversation.replace
conversation.get_revision
conversation.inspect
conversation.load_turns
conversation.load_traces
```

Compatibility rule:

- old RPC names may call the new implementation
- new code should use conversation-named APIs
- no duplicate writers

## Conversation Inspector

Add a sidecar and renderer/CLI inspection surface that starts from
`conversation_id`.

Target CLI:

```bash
bin/windie conversation list
bin/windie conversation inspect <conversation-id>
bin/windie conversation events <conversation-id>
bin/windie conversation turns <conversation-id>
bin/windie conversation traces <conversation-id> [--turn <turn-ref>] [--path <path>]
```

Target renderer diagnostic model:

```text
Conversation Inspector
  Overview
  Transcript
  Turns
  Events
  Traces
  Memory
  Revisions
```

This makes the storage understandable even if the underlying DB still uses
stable indexed tables.

## Migration Strategy

Use additive migration first.

Phase 1: Add conversation-centered read APIs and CLI inspection commands over
the existing tables.

- no data migration
- no table rename
- no deletion
- prove the inspection model

Phase 2: Add canonical table/view names.

- create `conversation_events` as the canonical table in `history.db`, with a
  compatibility read path from existing `chat_events` during migration
- create `conversation_revisions` as a view over `chat_conversation_revisions`,
  or add a new table with dual-read migration
- create `conversations` as the materialized conversation index that backs
  dashboard/list/inspection entry points

Phase 3: Move writers behind new implementation names.

- `store_chat_event` calls `conversation.append_event`
- `get_chat_events` calls `conversation.load_events`
- `list_chat_conversations` calls `conversation.list`
- keep external compatibility until all callers move

Phase 4: Physical history split.

Only after behavior and migration are stable, move history from:

```text
memory/episodic.db
```

to:

```text
history/history.db
```

This migration should keep a compatibility adapter that can read legacy
`memory/episodic.db/chat_events` until user data has been migrated.

## Ordered Plan

1. Inventory all current reads/writes of `chat_events`,
   `chat_conversation_revisions`, and `conversation_titles`.
2. Define the conversation aggregate contract: overview, events, turns, traces,
   revisions, and titles.
3. Add sidecar query helpers that return conversation-centered inspection
   payloads using existing tables.
4. Add CLI inspection commands that use those helpers or direct local SQLite
   reads when renderer health is irrelevant.
5. Add `conversation_events` and `conversation_revisions` compatibility views
   if they improve tooling without changing writers.
6. Add a `conversations` index table only after deciding exactly which fields
   are canonical metadata and how they update on append, rewrite, delete, and
   title generation.
7. Move sidecar internal function names from `chat_*` toward `conversation_*`
   while preserving old RPC compatibility.
8. Update SDK `SidecarConversationStore` only after the sidecar contract is
   stable.
9. Update docs and tests for the new conversation-centered inspection model.
10. Move to `history/history.db` only after the logical model is proven and
    legacy migration coverage exists.

## Validation Plan

Run focused validation during implementation:

```bash
bin/windie docs list
bin/windie test frontend -- WindieSdkClient.test.ts WindieSdkConversationRuntime.test.ts DesktopConversationStore.test.ts DesktopConversationContinuityService.test.ts
bin/windie test frontend -- ConversationReplayDatabaseIntegration.test.tsx LocalBackendBridge.rpc.test.cjs
./scripts/python-in-env sidecar python -m pytest tests/sidecar/test_local_backend.py -q
./scripts/python-in-env sidecar python -m pytest tests/sidecar/test_local_store*.py tests/sidecar/test_memory_operations.py -q
git diff --check
```

Add migration tests before any table rename, view creation, index creation, or
physical file move.

Manual validation:

```bash
bin/windie conversation list
bin/windie conversation inspect <conversation-id>
bin/windie conversation traces <conversation-id> --turn <turn-ref>
bin/windie trace <conversation-id> <turn-ref> --json
```

## Non-Goals

- Do not change SDK conversation semantics.
- Do not change backend provider history behavior.
- Do not move memory rows into conversation history.
- Do not create one SQLite table per conversation.
- Do not physically move data out of `episodic.db` before the conversation
  model and compatibility migration are proven.
- Do not delete `chat_events` compatibility while current callers still depend
  on it.
- Do not build a broad visual dashboard before the sidecar/CLI inspection
  contract is stable.

## Success Criteria

- A developer can start from a conversation id and inspect all relevant local
  history without manually browsing the raw `chat_events` table.
- Existing chat send, replay, edit/resend, retry, rehydrate, title generation,
  memory persistence, memory retrieval, and trace persistence continue to work.
- Trace events remain attached to conversation turns and hidden from normal
  transcript display.
- Conversation metadata listing no longer requires humans to understand raw
  event-table internals.
- New names describe the domain: conversation history, events, revisions,
  traces, turns, memory links.
- Old RPC/table compatibility remains until callers are moved deliberately.

## Completion Notes

Implemented on June 10, 2026:

- local conversation history now initializes in
  `desktop-assistant/history/history.db`
- canonical tables now exist for `conversations`, `conversation_turns`,
  `conversation_events`, `conversation_titles`, and `conversation_revisions`
- startup migration imports legacy `memory/episodic.db` chat history, revision
  pointers, and title rows into `history.db`
- active sidecar history reads and writes use canonical conversation tables
- SDK sidecar conversation writes use canonical `conversation.*` RPC names
- old RPC names and old table names remain as compatibility surfaces
- CLI conversation and trace diagnostics prefer `history/history.db` and fall
  back to legacy `memory/episodic.db` until migration has run
- memory rows remain in `memory/episodic.db` and `memory/semantic.db`

## Approval Gate

Implementation must not start until the user approves this plan. If the user
chooses a physical file split, one table per conversation, or immediate
renaming/deletion of `chat_events`, update this plan first and wait for approval
again.
