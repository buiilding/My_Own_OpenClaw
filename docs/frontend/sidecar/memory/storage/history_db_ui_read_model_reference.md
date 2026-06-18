---
summary: "Reference for the history.db conversation_display_messages read model, current conversation_events-backed visible chat inspection, and the boundary between durable transcript storage, SDK display projection, removed legacy chat-history compatibility views, and memory stores."
read_when:
  - When inspecting visible chat rows in history/history.db.
  - When building or debugging a UI that lists or opens stored chats.
  - When deciding whether conversation history belongs in history.db, episodic memory, or semantic memory.
  - When resolving stale searches that claim `conversation_display_messages` was removed or confuse it with removed legacy chat-history compatibility views.
title: "History DB UI Read Model Reference"
---

# History DB UI Read Model Reference

`history/history.db` is the canonical local store for visible conversation
history. It is separate from episodic and semantic memory databases: chat replay
rows are not memories, and memory retrieval rows are not the source of truth for
the sidebar or opened chat transcript.

## Read Model

The sidecar history schema exposes `conversation_display_messages` as a SQLite
view over `conversation_events`.

`conversation_display_messages` is still the supported visible-chat inspection
view. Removed legacy chat-history table migrations and compatibility views must
not be confused with this current read model: current storage is
`conversation_events`, and the display view is derived from that table.

The view includes only:

- `user_message`
- `assistant_message`
- `turn_error`

It excludes trace events, tool internals, lifecycle events, compaction/debug
events, and empty content rows. The stable consumer fields are:

- `event_id`
- `user_id`
- `conversation_id`
- `message_index`
- `timestamp`
- `turn_ref`
- `revision_id`
- `display_role`
- `source_role`
- `event_type`
- `content`
- `metadata`
- `attachments`

Consumers must order by `message_index ASC, timestamp ASC`.

## UI Boundary

First-party UI code should prefer SDK/store display APIs, because the SDK owns
conversation semantics and projection rules. The SQLite view is the durable
inspection and prototyping contract for tools such as:

```bash
<windie> conversation messages <conversation-ref> --json
```

If a UI prototype reads SQLite directly, it should read
`conversation_display_messages`, not raw `conversation_events`. Raw events remain
the append-only ledger for replay, traces, rehydrate, compaction, and debugging.

## Storage Separation

- `history/history.db`: visible conversation history and conversation metadata.
- Episodic memory store: recalled experiences and summarized episode records.
- Semantic memory store: extracted durable facts and embeddings.

Moving visible chat listing into episodic or semantic memory would reintroduce
duplicate ownership. The intended path is history store for durable chat data,
SDK projection for runtime display semantics, and memory stores only for memory
features.
