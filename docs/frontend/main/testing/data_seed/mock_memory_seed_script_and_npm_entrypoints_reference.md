---
summary: "Deep reference for deterministic dashboard mock-memory seeding: npm command entrypoints, target-user resolution, sqlite schema/fts bootstrap, cleanup idempotency, and inserted transcript/episodic/semantic data contracts."
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

`dev_seed_mock_memory.py` seeds deterministic local memory data for dashboard demos.

It writes three data surfaces:

- transcript conversations (`record_kind='transcript'` in episodic DB)
- episodic memory rows (`record_kind='memory'` in episodic DB)
- semantic memory rows (semantic DB)

The script is development/demo tooling only and is not invoked in production runtime paths.

## Entrypoint Contract

NPM script entrypoints (`frontend/package.json`):

- `npm run mock-memory-data`
  - runs Python script via `python` fallback to `python3`
- `npm run electron:mock-memory-data`
  - runs seed script first, then launches Electron app

Execution returns process exit code from the Python script (`0` on success).

## Target User Resolution

`_target_user_ids()` builds target users in order and de-duplicates:

1. `default_user`
2. `WINDIE_MOCK_USER_ID`
3. `WINDIE_USER_ID`
4. shell user ids (`USER`, `USERNAME`, `LOGNAME`)

Behavior notes:

- empty/whitespace ids are skipped
- final list can include multiple user ids
- each target user receives the same deterministic dataset

## Storage Path Resolution by OS

`_memory_dir()` resolves memory DB directory:

- Windows: `%APPDATA%/desktop-assistant/memory`
- macOS: `~/Library/Application Support/desktop-assistant/memory`
- Linux: `~/.config/desktop-assistant/memory`

DB files touched:

- `episodic.db`
- `semantic.db`

## Schema and Index Bootstrap

`_ensure_episodic_schema(...)` ensures:

- `memories` table with transcript + memory columns used by dashboard/chat resume
- `conversation_titles` table for sidebar/chat title rendering
- compatibility columns via `ALTER TABLE` when absent
- core indices for user/timestamp/conversation/message lookup

Best-effort lexical search support:

- creates FTS5 table `transcript_fts`
- creates insert/delete/update triggers mirroring transcript rows
- silently continues if FTS creation fails (`sqlite3.OperationalError`)

`_ensure_semantic_schema(...)` ensures semantic `memories` table + user/timestamp/index ids.

## Idempotent Cleanup Contract

Before inserting, `_clear_existing_mock_data(...)` removes existing mock rows for each target user:

- transcript rows with `conversation_id LIKE 'conv_mock_%'`
- matching `conversation_titles` rows
- episodic rows tagged with metadata source `mock_seed_dashboard`
- semantic rows tagged with metadata source `mock_seed_dashboard`

This keeps repeated runs deterministic and prevents duplicate demo rows.

## Inserted Data Contract

Seed constants define deterministic content mix:

- `MOCK_CONVERSATIONS`: 3 conversations (`conv_mock_*`) with 4 messages each
- `MOCK_EPISODIC_MEMORIES`: 4 rows
- `MOCK_SEMANTIC_MEMORIES`: 3 rows

Timestamp behavior:

- each row timestamp uses current UTC minus per-entry `offset_days` + `offset_minutes`

Transcript row fields include:

- `conversation_id`, `role`, `message_index`, `message_type`
- `model_id`, `model_provider`
- `record_kind='transcript'`, `is_semanticized=0`

Conversation title behavior:

- title derived from first user message (`_derive_title`)
- upsert into `conversation_titles`
- updates existing title only when `is_locked=0`

Episodic row behavior:

- metadata includes `type='episodic'`, `source='mock_seed_dashboard'`, category
- written as non-transcript memory rows with `is_semanticized=1`

Semantic row behavior:

- content formatted as:
  - `Summary: ...`
  - `Facts:` bullet list
- metadata includes `type='semantic'`, `source='mock_seed_dashboard'`, category, creator marker

## Output Contract

On completion script prints:

- memory directory path
- target user ids list
- total removed rows by type
- total inserted rows by type
- per-user totals (`chat_conversations_*`, `episodic_memories_*`, `semantic_memories_*`)

## Drift Hotspots

1. Changing `MOCK_SOURCE` requires updating cleanup predicates or old mock rows will accumulate.
2. Altering transcript row shape without matching sidebar/search assumptions can break demo chat resume/search views.
3. Removing `conversation_titles` upsert can regress deterministic sidebar title behavior in demos.
4. Editing npm script names without docs updates can break onboarding instructions for demo environments.

## Related Pages

- [Frontend Main Testing Data-Seed Docs Hub](README.md)
- [Frontend Main Testing Docs Hub](../README.md)
- [Dashboard Memory Management and Resume Reference](../../../renderer/dashboard_memory_management_and_resume_reference.md)
