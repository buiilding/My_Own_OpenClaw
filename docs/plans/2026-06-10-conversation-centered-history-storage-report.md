---
summary: "Execution report for the conversation-centered local history storage implementation."
read_when:
  - When reviewing the conversation-centered history storage migration.
  - When extending WindieOS local history inspection, trace inspection, or history.db migration behavior.
title: "Conversation-Centered History Storage Report"
---

# Conversation-Centered History Storage Report

Status: complete.

Plan: `docs/plans/2026-06-10-conversation-centered-history-storage-plan.md`

## Approved Scope

The approved work reorganizes local conversation history around a stable
conversation-centered SQLite domain while preserving existing SDK conversation
runtime behavior.

The implemented shape is:

```text
desktop-assistant/
  history/
    history.db
      conversations
      conversation_turns
      conversation_events
      conversation_titles
      conversation_revisions
  memory/
    episodic.db
    semantic.db
```

Conversation events, traces, titles, revisions, and turn summaries now live in
the history database. Episodic and semantic memory rows remain in the memory
databases.

## Implementation Checklist

- [x] Mark plan approved.
- [x] Add local CLI commands for conversation-centered inspection.
- [x] Add canonical conversation history tables.
- [x] Move sidecar conversation history storage to `history/history.db`.
- [x] Preserve legacy `memory/episodic.db` import on startup.
- [x] Keep `chat_events` and `chat_conversation_revisions` compatibility where
      needed.
- [x] Add canonical `conversation.*` sidecar RPC names.
- [x] Move SDK sidecar store calls to canonical `conversation.*` RPC names.
- [x] Keep old RPC names registered for compatibility.
- [x] Preserve durable hidden `trace_event` rows.
- [x] Update mock seeding to write conversation history into `history.db`.
- [x] Add focused schema, migration, handler, and SDK tests.
- [x] Update changelog.

## Decisions

- Keep SQLite as the local storage engine.
- Do not create one table per conversation.
- Make `conversation_events` the canonical ledger and keep conversation ids as
  the stable partition key.
- Maintain materialized `conversations` and `conversation_turns` tables from the
  canonical event ledger for click-through inspection.
- Keep function names such as `append_chat_event` temporarily inside Python
  modules where they are compatibility implementation details.
- Register both old RPC names and canonical `conversation.*` names so older
  callers keep working while new SDK code uses the new contract.
- Create compatibility views named `chat_events` and
  `chat_conversation_revisions` only when those names do not already exist.
- Leave legacy `episodic.db` tables untouched; import their data into
  `history.db` instead of deleting or rewriting user data.
- Let CLI diagnostics prefer `history/history.db` and fall back to legacy
  `memory/episodic.db` until the sidecar has restarted and migration has run.

## Runtime Path

Startup initializes the memory store directories, creates `memory/episodic.db`,
`memory/semantic.db`, and `history/history.db`, then imports legacy chat history
from `memory/episodic.db` into the canonical history database.

New conversation events are appended through the SDK sidecar store using
`conversation.append_event`. The sidecar writes those rows to
`conversation_events`, updates `conversation_revisions`, and refreshes the
materialized `conversations` and `conversation_turns` inspection tables.

Reads for replay, display, rehydrate, search, list, delete, replace, rewrite,
title state, and revision state now use the history database. Memory search and
memory writes continue to use the memory databases.

## Inspection Commands

```bash
bin/windie conversation list
bin/windie conversation inspect <conversation-id>
bin/windie conversation events <conversation-id>
bin/windie conversation turns <conversation-id>
bin/windie conversation traces <conversation-id> [--turn <turn-ref>] [--path <path>]
bin/windie trace <conversation-id> <turn-ref> [--path <path>]
```

These commands read `history/history.db` when present and fall back to the
legacy `memory/episodic.db` table names when the new database does not exist.

## Validation Log

Passed:

```bash
bin/windie docs list
./scripts/python-in-env sidecar python -m py_compile frontend/src/main/python/memory/chat_event_store.py frontend/src/main/python/memory/local_store.py frontend/src/main/python/memory/admin.py frontend/src/main/python/local_backend_memory_handlers.py frontend/src/main/python/memory/conversation_title_store.py frontend/src/main/python/local_backend.py frontend/src/main/python/dev_seed_mock_memory.py
./scripts/python-in-env sidecar python -m pytest tests/sidecar/test_chat_event_store.py tests/sidecar/test_local_backend.py tests/sidecar/test_local_store_init.py tests/sidecar/test_local_store_delete_cleanup.py -q
node --check scripts/windie/commands.cjs
node --check packages/windie-sdk-js/cjs/stores/SidecarConversationStore.js
bin/windie test frontend -- WindieAgentConversationStoreApi.test.ts ConversationReplayDatabaseIntegration.test.tsx
cd frontend && npm run test:ci -- ../tests/frontend/WindieSdkClient.test.ts -t SidecarConversationStore --runInBand
```

Also run during implementation:

```bash
bin/windie test frontend -- WindieSdkClient.test.ts WindieAgentConversationStoreApi.test.ts ConversationReplayDatabaseIntegration.test.tsx
```

That broader frontend run still had pre-existing fragile failures in unrelated
`WindieSdkClient.test.ts` socket-frame and memory-diagnostic expectations. The
focused SidecarConversationStore subset passed after the storage migration.

## Compatibility Notes

- Old sidecar RPC names remain registered and route to the same implementation.
- Old Python helper names remain as compatibility names, but active storage
  queries target canonical conversation tables.
- Existing local user data is copied into `history.db` on sidecar startup.
- The old `episodic.db` history tables are not deleted.
- `memory/episodic.db` still owns episodic memory rows.
- `memory/semantic.db` still owns semantic memory rows.

## Commits

- `d6151f23e` - `feat(cli): add conversation history inspector`
- `8b62a1811` - `feat(sidecar): move conversation history to history db`
