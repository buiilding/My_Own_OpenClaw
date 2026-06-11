---
summary: "Plan to formalize the canonical history.db UI read model for visible chat messages while preserving SDK-owned conversation projection semantics."
read_when:
  - When changing history.db schema/read models for chat replay or dashboard conversation loading.
  - When deciding whether a UI should read raw SQLite events or use SDK conversation store APIs.
title: "History DB UI Read Model Plan"
---

# History DB UI Read Model Plan

## User Intent

Make the separation between visible conversation history, episodic memory, and semantic memory concrete enough that a future UI can rebuild chat history from the durable local data path without confusing chat rows with memory records.

## Architectural Target

- `history/history.db` remains the canonical durable local transcript store for user-visible conversation history.
- Episodic and semantic memory stores remain separate memory products, not the source of truth for visible chat replay.
- The SDK conversation store remains the preferred UI runtime contract. UI feature code should ask the SDK/store for display rows instead of interpreting raw event rows.
- The SQLite history store should expose a small read model for diagnostics, CLI inspection, and future UI prototyping so callers do not need to know every raw event type.

## In Scope

- Add a stable `conversation_display_messages` read model over `conversation_events`.
- Filter the read model to visible chat messages and terminal turn errors, excluding traces, tool internals, lifecycle rows, and compaction/debug events.
- Add a `bin/windie conversation messages <conversation-ref>` path that reads the display model when present and falls back to equivalent filtering for older databases.
- Document the boundary: raw history event ledger versus display-message read model versus SDK projection API.
- Add focused sidecar and CLI tests.

## Out of Scope

- Replacing dashboard conversation loading in this slice.
- Removing legacy `chat_events` compatibility views.
- Migrating or deleting existing user databases beyond creating a safe view during normal schema initialization.
- Redesigning episodic or semantic memory storage.

## Workflow

1. Re-read the history schema, CLI conversation commands, docs navigation, SDK conversation docs, and sidecar storage docs.
2. Add the SQLite read model in the sidecar history schema initializer.
3. Add a CLI message export path that uses the read model when available.
4. Add focused regression tests for the schema view and CLI output.
5. Update docs and changelog.
6. Run focused validation.
7. Inspect the changed code and docs again, classify remaining findings, and repeat if any in-scope gap remains.

## Success Criteria

- New databases expose `conversation_display_messages` as a view.
- The view returns only user messages, assistant messages, and turn errors with display-safe role/content fields.
- CLI users can run `bin/windie conversation messages <conversation-ref> --json` and get ordered chat-message rows from the canonical history database.
- Older databases without the view still work through the CLI fallback.
- Docs state that UIs should prefer SDK display projection APIs and use the SQLite read model only as a durable inspection/prototyping contract.
- Focused tests and docs listing pass.

## Validation Commands

- `./scripts/python-in-env sidecar python -m pytest tests/sidecar/test_chat_event_store.py -q`
- `npm --prefix frontend run test:ci -- WindieCli`
- `bin/windie docs list`
- `git diff --check`

## Compaction Reread Anchors

- `docs/plans/2026-06-11-history-db-ui-read-model-plan.md`
- `docs/plans/2026-06-11-history-db-ui-read-model-report.md`
- `frontend/src/main/python/memory/chat_event_store.py`
- `scripts/windie/commands.cjs`
- `tests/sidecar/test_chat_event_store.py`
- `tests/frontend/WindieCli.test.cjs`
- `docs/frontend/sidecar/memory/storage/README.md`
- `docs/sdk/conversation_runtime.md`
