---
summary: "Deep reference for deterministic dashboard mock-memory seeding: npm command entrypoints, target-user resolution, SQLite schema bootstrap, cleanup idempotency, and inserted chat-event/episodic/semantic data contracts."
read_when:
  - When changing `frontend/src/main/python/dev_seed_mock_memory.py` mock payloads, row-shape assumptions, or cleanup semantics.
  - When changing `frontend/package.json` scripts `mock-memory-data` or `electron:mock-memory-data`.
title: "Mock Memory Seed Script and NPM Entrypoints Reference"
---

# Mock Memory Seed Script and NPM Entrypoints Reference

## Canonical Modules

- `frontend/src/main/python/dev_seed_mock_memory.py`
- `frontend/package.json`

## Purpose and Scope

`dev_seed_mock_memory.py` seeds deterministic local data for dashboard demos.

It writes three data surfaces:

- chat conversations in `conversation_events`
- episodic memory rows in `episodic.db`
- semantic memory rows in `semantic.db`

The script is development/demo tooling only and is not invoked in production runtime paths.

## Entrypoint Contract

NPM script entrypoints:

- `npm run mock-memory-data`
- `npm run electron:mock-memory-data`

Execution returns process exit code from the Python script (`0` on success).

## Target User Resolution

`_target_user_ids()` builds target users in order and de-duplicates:

1. `default_user`
2. `AGENT_MOCK_USER_ID`
3. `WINDIE_MOCK_USER_ID`
4. `AGENT_USER_ID`
5. `WINDIE_USER_ID`
6. shell user ids (`USER`, `USERNAME`, `LOGNAME`)

## Storage Path Resolution by OS

- Windows: `%APPDATA%/windieos/memory`
- macOS: `~/Library/Application Support/windieos/memory`
- Linux: `~/.config/windieos/memory`

DB files touched:

- `episodic.db`
- `semantic.db`

## Schema and Index Bootstrap

`_ensure_episodic_schema(...)` ensures:

- `memories` table for episodic memory rows
- `conversation_events` table for visible chat replay
- `conversation_titles` table for compatibility with chat-history reset paths
- compatibility columns via `ALTER TABLE` when absent
- core indices for user/timestamp/conversation/message lookup

`_ensure_semantic_schema(...)` ensures semantic `memories` table plus user/timestamp/index ids.

## Idempotent Cleanup Contract

Before inserting, `_clear_existing_mock_data(...)` removes existing mock rows for each target user:

- `conversation_events` rows with `conversation_id LIKE 'conv_mock_%'`
- matching `conversation_titles` rows
- episodic rows tagged with metadata source `mock_seed_dashboard`
- semantic rows tagged with metadata source `mock_seed_dashboard`

This keeps repeated runs deterministic.

## Inserted Data Contract

Seed constants define:

- `MOCK_CONVERSATIONS`: 3 conversations (`conv_mock_*`) with 4 messages each
- `MOCK_EPISODIC_MEMORIES`: 4 rows
- `MOCK_SEMANTIC_MEMORIES`: 3 rows

Chat-event rows include:

- `conversation_id`, `event_type`, `role`, `content`, `timestamp`
- `message_index`, `revision_id`, `metadata`, `attachments`, `event_payload`
- metadata `record_kind='chat_event'`
- generic demo `model_provider` / `model_id` values; production provider
  selection and model policy remain backend-owned and are not seeded here

Episodic memory rows include:

- metadata `type='episodic'`, source, and category
- `record_kind='memory'`
- `is_semanticized=1`

Semantic rows include:

- content formatted as summary plus facts
- metadata `type='semantic'`, source, category, and creator marker
