---
summary: "Memory System"
read_when:
  - When editing memory storage or retrieval.
---

# Memory System

## Overview

Memory is owned by the **SDK local-runtime memory boundary**, not the backend. The current desktop implementation is backed by local-runtime Python modules that store episodic and semantic memory locally using SQLite + FAISS, while SDK/local-runtime clients request embeddings, semantic summaries, and conversation titles from the backend over HTTP.

**Key locations:**
- Local-runtime memory implementation (local-runtime Python-backed): `frontend/src/main/python/memory/`
- Bulk destructive maintenance ops: `frontend/src/main/python/memory/admin.py`
- Local-runtime JSON-RPC orchestration: `frontend/src/main/python/local_backend.py`
- Embeddings API (backend): `backend/src/api/routes/memory/embeddings/router.py`
- Semantic summary API (backend): `backend/src/api/routes/memory/semantic/router.py`

## Architecture

```
+--------------------------------------------------+
| Local Runtime Memory (local-runtime Python-backed)    |
|  - LocalMemoryStore (SQLite + FAISS)            |
|  - MemorySummarizer (semantic rollups)          |
|  - LocalRuntimeService memory RPC handlers      |
+--------------------------------------------------+
                 | HTTP              ^ JSON-RPC
                 v                   |
+--------------------------------------------------+
| Backend API (FastAPI)                           |
|  - /api/embeddings/ (EmbeddingRouter)           |
|  - /api/semantic/summarize (LLM summary)        |
|  - /api/semantic/title (conversation title)     |
+--------------------------------------------------+
```

Backend embeddings are provider-routed. `embedding_backend` selects:

- `local`: in-process SentenceTransformer provider.
- `remote-http`: HTTP embedding service provider.
- `vendor`: OpenAI embedding provider using `embedding_api_key_env`
  (defaults to `OPENAI_API_KEY`).
- `disabled`: no embedding provider.

The embedding route returns structured provider errors when a provider is
disabled, unavailable, or circuit-broken after repeated failures. The
local-runtime memory implementation treats those errors as non-fatal: memory
search returns no prompt memories, memory writes are still stored in SQLite
without vector IDs, and startup backfills/rebuilds wait until embeddings
become available again.

## Storage Layout

The local-runtime memory implementation stores memory in a local user data
directory:
- **Linux**: `~/.config/windieos/memory/`
- **macOS**: `~/Library/Application Support/windieos/memory/`
- **Windows**: `%APPDATA%/windieos/memory/`

Files created per user:
- `episodic.db` (SQLite)
- `semantic.db` (SQLite)
- `episodic.faiss.index`
- `semantic.faiss.index`
- `watermark_state.json` (summarization progress)

## Developer Reset (Nuke Local Memory)

Use when you need a full local-memory reset in dev (episodic + semantic + FAISS + watermark).

1. Stop Electron/local-runtime processes first.
2. Run one command:

Linux/macOS (auto-detect path):
```bash
if [[ "$OSTYPE" == "darwin"* ]]; then MEM="$HOME/Library/Application Support/windieos/memory"; else MEM="$HOME/.config/windieos/memory"; fi; rm -f "$MEM"/{episodic.db,semantic.db,episodic.faiss.index,semantic.faiss.index,watermark_state.json} && ls -la "$MEM"
```

Windows PowerShell:
```powershell
$mem = Join-Path $env:APPDATA "windieos\\memory"; Remove-Item -Force `
  (Join-Path $mem "episodic.db"), `
  (Join-Path $mem "semantic.db"), `
  (Join-Path $mem "episodic.faiss.index"), `
  (Join-Path $mem "semantic.faiss.index"), `
  (Join-Path $mem "watermark_state.json"); Get-ChildItem $mem
```

## Core Components

### LocalMemoryStore

`frontend/src/main/python/memory/local_store.py`
- Manages SQLite + FAISS indices
- Supports search, add, update, delete
- Delegates bulk destructive reset flows to `memory/admin.py`
- Delegates empty-index artifact cleanup to `memory/index_artifact_cleanup.py`
- Stores caller-provided SDK embeddings and searches local FAISS/SQLite indexes
- Chat history is not stored as memory rows. The local-runtime store persists visible chat replay in `conversation_events`.
- Episodic memory rows are durable memory facts/interaction pairs, not the visible chat log.
- The SDK calls backend `/api/embeddings/` for retrieval and completed-turn
  memory writes, then passes embeddings to the local-runtime memory store.
- If backend embeddings fail, SDK memory retrieval/storage is skipped or logged
  as a non-fatal side effect; chat continues.

### MemorySummarizer

`frontend/src/main/python/memory/summarizer.py`
- Periodically converts episodic memory into semantic summaries
- Calls backend `/api/semantic/summarize` via `RemoteSemanticClient`

**Behavior notes**:
- Runs an immediate startup pass, then continues on a fixed interval; summarization proceeds immediately for large backlogs (`min_batch_size`, default `6`) and for smaller idle backlogs (`min_batch_size_idle`, default `1`) when age checks pass.
- Deduplicates summaries using a `summary_hash` over source memory IDs.
- Marks episodic memories as semanticized only after a successful summary write.
- Uses `watermark_state.json` to track progress and resumes safely after restarts.
- Summarizes episodic interaction rows only (`record_kind='interaction'`).
- Chat-event rows are excluded from semantic summarization because they live outside the memory table.

### Summarization and Deletion FAQ (Current Behavior)

#### Does deleting memory in the UI delete it from the database?

- Yes.
- Deleting an episodic conversation removes matching rows from `episodic.db`.
- Deleting a semantic memory removes the matching row from `semantic.db`.
- There is no cross-delete cascade between episodic and semantic memory.
- For partial deletes, stale vectors may remain in existing FAISS index files.
- When a memory type reaches zero indexed rows, WindieOS clears in-memory vector mappings and removes that FAISS index file from disk.

#### Does every assistant message trigger summarization?

- No.
- Summarizer triggering is based on database count of unsemanticized episodic interaction rows (`record_kind='interaction'`).
- Chat-event writes do not affect the run gate.

#### Does idle mode trigger summarization?

- Yes.
- Run gate checks unsemanticized interaction-row count with two paths:
  - immediate run when `count >= min_batch_size` (`6`)
  - idle run when `count >= min_batch_size_idle` (`1`) and the summarizer has been idle long enough
- Batch gate still applies after run gate: a conversation batch is summarized only if batch size and age checks pass.
- Batch gate defaults:
  - Immediate summarize when batch size `>= min_batch_size` (`6`).
  - Otherwise requires `>= min_batch_size_idle` (`1`) plus age checks.
- Effective behavior:
  - active/high-volume conversations summarize at 6 rows.
  - lower-volume conversations can summarize at 1 row after idle/age checks.

#### If there are 10 unsemanticized interaction rows, are exactly those 10 rows sent to one prompt?

- Not necessarily.
- Row count is only a run gate; it is not a direct batch size.
- Actual summarization input is fetched per conversation window, up to `max_batch_size=30`, ordered oldest to newest by timestamp.

#### Can one summarization request mix different conversation histories?

- No.
- Summarization batches are scoped to a single `conversation_id`.
- Unsemanticized row count can include activity from multiple conversations, but each request summarizes one conversation window at a time.

#### Are messages ordered like conversation history?

- Yes.
- Rows are loaded in ascending timestamp order for each conversation window.
- Rows keep chronological order in summary chunks.

#### Is low-signal filtering currently implemented?

- Yes.
- The semantic summarizer now rejects low-value outputs such as greetings, transient UI/app state, and runtime/tool-error facts.
- An explicit backend result of `SUMMARY: NONE` with no extracted facts is treated as a valid "no durable memory" outcome, and the source episodic rows are marked processed without creating a semantic-memory row.
- Rejected batches do not create semantic-memory rows.
- Rejected episodic interaction rows are still marked as processed so the same low-signal batch does not loop forever.

#### Idle-trigger removal status

- Implemented.
- Summarization can run for both high-volume and idle low-volume backlogs.
- With current defaults, aged single-turn conversations are eligible once the summarizer is idle and the memory-age checks pass.

### Memory RPC Handlers

`frontend/src/main/python/local_backend_memory_handlers.py`
- JSON-RPC access to memory and transcript storage operations
- Wraps local memory runtime modules without exposing memory as a model-visible local-runtime tool

## Dashboard Read APIs

The Electron renderer reads local data through SDK-shaped `windie.invoke(...)`
commands. Electron main allowlists those commands and calls public SDK APIs on
the live agent/runtime. The SDK owns local-runtime RPC unwrapping and returns
renderer-facing payload shapes.

- `memories.list` lists completed interaction memories or semantic memories
  through SDK memory APIs. Renderer receives `{ memories, count }`, not the
  local-runtime JSON-RPC envelope.
- `conversation.load` loads chat history display and backend rehydrate
  snapshots through SDK projections over canonical `conversation_events`.
- `conversations.list` and `conversations.search` list/search chat metadata
  through SDK conversation store APIs.

Renderer feature code must not call local-runtime JSON-RPC methods such as
`list_episodic_memories`, `list_semantic_memories`, `conversation.list`, or
`conversation.load_events` for user-facing memory or chat concepts.

Current title behavior for chats:
- A new chat can appear in `Your chats` after the first chat event is stored.
- List/search reads derive the display title from the first user message or latest content in `conversation_events`.
- Hosted debugging note: backend `/api/embeddings`, `/api/semantic/summarize`, and `/api/semantic/title` now emit route-level start/success/failure logs so a hosted `502` can be separated into "request never hit FastAPI" versus "origin app received and failed the request."

## Chat Transcript vs SDK Event State

WindieOS now persists one first-class SDK conversation representation for chat history outside memory rows:

- `conversation_events`: normalized SDK event log used for desktop display, conversation lists, backend rehydrate, edit/resend, retry, and compaction lifecycle.
- `conversation_events.attachments`: JSON image attachment records for user-message screenshots and tool-output screenshot artifacts, kept separate from memory/vector rows while the original SDK event payload remains available for replay.
- `record_kind='interaction'` remains the episodic memory source for completed user+assistant pairs.
- Legacy transcript memory rows are not an active storage path.

SDK event behavior:

- New desktop transcript projections are stored as canonical SDK events.
- SDK historical display projections exclude live-only `assistant_delta` and
  `reasoning_delta` chunks. Those deltas remain canonical events for live
  `currentTurn` projection and backend/replay bookkeeping, but they are not
  rendered as historical assistant rows.
- History compaction stores a complete `compaction_applied` event with replacement history entries.
- Chat delete and replay/edit rewind flows clear canonical chat-event rows before any event rebuild.
- Reopening a chat loads display and rehydrate snapshots from SDK projections over event rows.
- Clearing chat history deletes canonical event rows with saved conversation titles.
- After a global chat-history wipe, the renderer drops backend sync cache and per-conversation workspace bindings so resume state cannot survive the underlying storage reset.

Practical effect:

- users see display projections built from normalized SDK events
- the backend can resume from compacted internal history after a previous compaction
- UI rows are projections; backend rehydrate source is the normalized event log

## User-Facing Reset Controls

Settings now exposes two destructive local-data actions:

- `Nuke memory`: deletes user-local episodic interaction memory plus semantic memory, then rebuilds local indices so chat events remain intact.
- `Nuke chats`: deletes chat-event history plus saved conversation titles so non-chat memory stays intact.

These actions are user-scoped (`user_id`) and run through the local-runtime memory admin module/store boundary, currently backed by local-runtime Python modules, not the backend FastAPI service. In hosted mode, that `user_id` is now a server-issued identity derived from the install token bootstrap flow rather than a client-chosen value.

## Prompt Injection Retrieval

Prompt-time memory injection is not a raw database dump.

- The dashboard Semantic tab reads direct rows from `semantic.db`.
- Query-time prompt enrichment is SDK-owned: the SDK requests a backend
  embedding for the user query, asks the local-runtime memory index to search by that
  embedding, and injects only query-relevant results.
- The prompt path now uses a split retrieval budget:
  - episodic limit `4`
  - semantic limit `2`
  - semantic minimum similarity `0.20`
- Practical effect:
  - semantic memories no longer lose every prompt slot to highly similar episodic rows
  - trivial or low-similarity semantic summaries still stay out of the prompt

## Completed Turn Persistence Contract

- A completed `user -> assistant` turn should persist two different artifacts:
  - chat-event rows in `conversation_events` for visible chat history
  - one completed-turn interaction memory row (`record_kind='interaction'`) for the Episodic Memory view and semantic summarizer input
- The interaction row is triggered by the SDK after terminal assistant
  completion. Backend inference no longer emits or owns a `memory-store` event.
- SDK memory writes are best-effort local side effects and must not fail the
  completed turn.
- If chats appear in `Your chats` but `Episodic` stays empty after a successful turn, first verify that a `record_kind='interaction'` row was written to `episodic.db`.

## Usage (LocalMemoryStore)

```python
from memory.local_store import LocalMemoryStore

store = LocalMemoryStore()
await store.initialize()

memory_id = await store.add(
    content="User asked about project status",
    user_id="default_user",
    metadata={"type": "episodic"}
)

query_embedding = [0.1, 0.2, 0.3]  # SDK-provided query embedding
results = await store.search_by_embedding(
    embedding=query_embedding,
    user_id="default_user",
    filters={"type": "episodic"},
    limit=5
)
```

## Dependencies

Installed via `frontend/src/main/python/requirements.txt`:
- `aiosqlite`
- `faiss-cpu`
- `numpy`

## Future: Multi-Tenant Memory & Retention (Planned)

For hosted mode, memory will move to a per-tenant service with:
- Per-tenant vector indexes
- Retention policies per plan
- Deletion APIs for compliance
- Encryption at rest + audit logging
