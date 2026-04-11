---
summary: "Memory System"
read_when:
  - When editing memory storage or retrieval.
---

# Memory System

## Overview

Memory is implemented in the **frontend Python sidecar**, not the backend. The sidecar stores episodic and semantic memory locally using SQLite + FAISS, and requests embeddings, semantic summaries, and conversation titles from the backend over HTTP.

**Key locations:**
- Sidecar implementation: `frontend/src/main/python/memory/`
- Bulk destructive maintenance ops: `frontend/src/main/python/memory/admin.py`
- Memory orchestration: `frontend/src/main/python/local_backend.py`
- Embeddings API (backend): `backend/src/api/routes/memory/embeddings/router.py`
- Semantic summary API (backend): `backend/src/api/routes/memory/semantic/router.py`

## Architecture

```
┌───────────────────────────────────────────────┐
│ Frontend Python Sidecar                       │
│  ├─ LocalMemoryStore (SQLite + FAISS)         │
│  ├─ MemorySummarizer (semantic rollups)       │
│  └─ MemoryTool (tool access)                  │
└───────────────────────────────────────────────┘
                │                 ▲
                │ HTTP            │ JSON-RPC
                ▼                 │
┌───────────────────────────────────────────────┐
│ Backend API (FastAPI)                         │
│  ├─ /api/embeddings/ (SentenceTransformer)    │
│  ├─ /api/semantic/summarize (LLM summary)     │
│  └─ /api/semantic/title (conversation title) │
└───────────────────────────────────────────────┘
```

## Storage Layout

The sidecar stores memory in a local user data directory:
- **Linux**: `~/.config/desktop-assistant/memory/`
- **macOS**: `~/Library/Application Support/desktop-assistant/memory/`
- **Windows**: `%APPDATA%/desktop-assistant/memory/`

Files created per user:
- `episodic.db` (SQLite)
- `semantic.db` (SQLite)
- `episodic.faiss.index`
- `semantic.faiss.index`
- `watermark_state.json` (summarization progress)

## Developer Reset (Nuke Local Memory)

Use when you need a full local-memory reset in dev (episodic + semantic + FAISS + watermark).

1. Stop Electron/sidecar first.
2. Run one command:

Linux/macOS (auto-detect path):
```bash
if [[ "$OSTYPE" == "darwin"* ]]; then MEM="$HOME/Library/Application Support/desktop-assistant/memory"; else MEM="$HOME/.config/desktop-assistant/memory"; fi; rm -f "$MEM"/{episodic.db,semantic.db,episodic.faiss.index,semantic.faiss.index,watermark_state.json} && ls -la "$MEM"
```

Windows PowerShell:
```powershell
$mem = Join-Path $env:APPDATA "desktop-assistant\\memory"; Remove-Item -Force `
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
- Generates embeddings via `RemoteEmbeddingClient`
- Transcript-aware indexing behavior:
  - `record_kind='transcript'` rows are stored in episodic SQLite.
  - Only semantic-candidate transcript rows are embedded for retrieval
    (user turns + assistant `llm-text` / `error` turns).
  - Tool-call/tool-bundle transcript rows remain unembedded to avoid low-signal
    JSON chatter in episodic retrieval.
  - Tool-related transcript rows can carry a typed metadata `structured_payload`
    snapshot so replay and rehydrate can recover tool semantics without reparsing
    the user-facing display text.
  - On startup, sidecar backfills missing embeddings for existing transcript
    semantic-candidate rows.
  - On retrieval, top-ranked episodic transcript user hits are enriched with the
    next assistant reply from the same conversation (when available), producing
    canonical paired interaction text for prompt injection.

### MemorySummarizer

`frontend/src/main/python/memory/summarizer.py`
- Periodically converts episodic memory into semantic summaries
- Calls backend `/api/semantic/summarize` via `RemoteSemanticClient`

### Conversation Title Generation

`frontend/src/main/python/memory/conversation_title_runtime.py`
- Generates model-backed transcript titles after the first user and first assistant `llm-text` rows exist
- Calls backend `/api/semantic/title` via `RemoteTitleClient`
- Runs best-effort in the background and falls back to heuristic list titles until a saved model title exists

**Behavior notes**:
- Runs an immediate startup pass, then continues on a fixed interval; summarization proceeds immediately for large backlogs (`min_batch_size`, default `6`) and for smaller idle backlogs (`min_batch_size_idle`, default `1`) when age checks pass.
- Deduplicates summaries using a `summary_hash` over source memory IDs.
- Marks episodic memories as semanticized only after a successful summary write.
- Uses `watermark_state.json` to track progress and resumes safely after restarts.
- Summarizes episodic interaction rows only (`record_kind='interaction'`).
- Transcript rows (`record_kind='transcript'`) are excluded from semantic summarization.

### Summarization and Deletion FAQ (Current Behavior)

#### Does deleting memory in the UI delete it from the database?

- Yes.
- Deleting an episodic conversation removes matching rows from `episodic.db`.
- Deleting a semantic memory removes the matching row from `semantic.db`.
- There is no cross-delete cascade between episodic and semantic memory.
- For partial deletes, stale vectors may remain in existing FAISS index files.
- When a memory type reaches zero indexed rows, WindieOS clears in-memory vector mappings and removes that FAISS index file from disk.

#### Does every assistant transcript message trigger summarization?

- No.
- Summarizer triggering is based on database count of unsemanticized episodic interaction rows (`record_kind='interaction'`).
- Transcript writes do not affect the run gate.

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

### MemoryTool

`frontend/src/main/python/tools/memory/memory_tool.py`
- Tool-access to memory (store/search/stats)
- Wraps `LocalMemoryStore` for tool execution

## Dashboard Read APIs

The Electron renderer reads memory through sidecar JSON-RPC handlers exposed over IPC:
- `list_conversations` + `get_conversation` for episodic/transcript browsing.
- `list_semantic_memories` for semantic-memory browsing in the Semantic Memory tab.

Current title behavior for transcript chats:
- A new chat can appear in `Your chats` immediately after the first user transcript row is stored.
- Until a saved model title exists, list/search reads derive a temporary heuristic title from the first user message.
- After the first assistant `llm-text` transcript row is stored, async model title generation can replace that temporary title.
- Hosted debugging note: backend `/api/embeddings`, `/api/semantic/summarize`, and `/api/semantic/title` now emit route-level start/success/failure logs so a hosted `502` can be separated into “request never hit FastAPI” versus “origin app received and failed the request.”

## Chat Transcript vs Replay State

WindieOS now persists two separate conversation representations for chat history:

- `record_kind='transcript'`: append-only raw transcript rows used for user-visible chat scrollback, search, titles, and conversation lists.
- `record_kind='transcript_replay'`: internal replay-state rows used only to rebuild backend conversation history on reconnect or resume.

Replay-state behavior:

- New transcript writes mirror into replay-state so the backend can resume from a local replay snapshot instead of regenerating from UI-only message rows.
- History compaction rewrites replay-state only; it does not rewrite or delete the raw transcript.
- Chat delete and replay/edit rewind flows clear both raw transcript rows and replay-state rows before any transcript rebuild.
- Reopening a chat prefers replay-state when present. Legacy chats without replay-state still fall back to raw transcript replay.
- Clearing chat history deletes both raw transcript rows and replay-state rows.
- After a global chat-history wipe, the renderer also drops its replay bootstrap cache, backend sync cache, and per-conversation workspace bindings so resume state cannot survive the underlying storage reset.

Practical effect:

- users can still scroll through the full original transcript
- the backend can resume from compacted internal history after a previous compaction
- transcript UI and backend rehydrate source are intentionally no longer the same storage stream

## User-Facing Reset Controls

Settings now exposes two destructive local-data actions:

- `Nuke memory`: deletes user-local episodic interaction memory plus semantic memory, then rebuilds local indices so transcript chats remain searchable.
- `Nuke chats`: deletes transcript chat history plus saved conversation titles, then rebuilds the episodic index so non-chat memory stays intact.

These actions are user-scoped (`user_id`) and run through the frontend sidecar memory admin module/store boundary, not the backend FastAPI service.

## Prompt Injection Retrieval

Prompt-time memory injection is not a raw database dump.

- The dashboard Semantic tab reads direct rows from `semantic.db`.
- Query-time prompt enrichment uses `search_memory`, which retrieves only query-relevant results.
- The prompt path now uses a split retrieval budget:
  - episodic limit `4`
  - semantic limit `2`
  - semantic minimum similarity `0.20`
- Practical effect:
  - semantic memories no longer lose every prompt slot to highly similar episodic transcript rows
  - trivial or low-similarity semantic summaries still stay out of the prompt

## Completed Turn Persistence Contract

- A completed `user -> assistant` turn should persist two different artifacts:
  - transcript rows (`record_kind='transcript'`) for chat history
  - one completed-turn interaction memory row (`record_kind='interaction'`) for the Episodic Memory view and semantic summarizer input
- The interaction row is triggered by the backend `memory-store` stream event after terminal assistant completion.
- Electron main must persist that `memory-store` event even though it arrives after `streaming-complete`.
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

results = await store.search(
    query="project status",
    user_id="default_user",
    filters={"type": "episodic"},
    limit=5
)
```

## Usage (MemoryTool)

```python
from tools.memory.memory_tool import MemoryTool

memory_tool = MemoryTool()
await memory_tool.initialize()

await memory_tool.execute({
    "operation": "add",
    "content": "Remember this",
    "memory_type": "episodic",
})
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
