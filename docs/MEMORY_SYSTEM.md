---
summary: "Memory System"
read_when:
  - When editing memory storage or retrieval.
---

# Memory System

## Overview

Memory is implemented in the **frontend Python sidecar**, not the backend. The sidecar stores episodic and semantic memory locally using SQLite + FAISS, and requests embeddings/summaries from the backend over HTTP.

**Key locations:**
- Sidecar implementation: `frontend/src/main/python/memory/`
- Memory orchestration: `frontend/src/main/python/local_backend.py`
- Embeddings API (backend): `backend/src/api/routes/memory/embeddings.py`
- Semantic summary API (backend): `backend/src/api/routes/memory/semantic.py`

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
│  └─ /api/semantic/summarize (LLM summary)     │
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

## Core Components

### LocalMemoryStore

`frontend/src/main/python/memory/local_store.py`
- Manages SQLite + FAISS indices
- Supports search, add, update, delete
- Generates embeddings via `RemoteEmbeddingClient`
- Transcript-aware indexing behavior:
  - `record_kind='transcript'` rows are stored in episodic SQLite.
  - Only semantic-candidate transcript rows are embedded for retrieval
    (user turns + assistant `llm-text` / `error` turns).
  - Tool-call/tool-bundle transcript rows remain unembedded to avoid low-signal
    JSON chatter in episodic retrieval.
  - On startup, sidecar backfills missing embeddings for existing transcript
    semantic-candidate rows.

### MemorySummarizer

`frontend/src/main/python/memory/summarizer.py`
- Periodically converts episodic memory into semantic summaries
- Calls backend `/api/semantic/summarize` via `RemoteSemanticClient`

**Behavior notes**:
- Runs on a fixed interval; summarization only proceeds when pending count reaches the configured threshold (`min_batch_size`, default `6`).
- Deduplicates summaries using a `summary_hash` over source memory IDs.
- Marks episodic memories as semanticized only after a successful summary write.
- Uses `watermark_state.json` to track progress and resumes safely after restarts.
- Summarizes transcript episodic rows only (`record_kind='transcript'`).
- Transcript summarization excludes tool-call/tool-output chatter (single and
  bundled) when building summary chunks, while still marking the full processed
  batch semanticized.

### Summarization and Deletion FAQ (Current Behavior)

#### Does deleting memory in the UI delete it from the database?

- Yes.
- Deleting an episodic conversation removes matching rows from `episodic.db`.
- Deleting a semantic memory removes the matching row from `semantic.db`.
- There is no cross-delete cascade between episodic and semantic memory.
- FAISS vectors are not compacted immediately; DB rows and in-memory ID mappings are removed so deleted records are no longer resolvable.

#### Does pending count increase for every assistant message?

- No.
- Pending count increments only for assistant terminal transcript entries:
  - `role="assistant"` and `message_type` in `""`, `"llm-text"`, or `"error"`.
- Tool-call/tool-output entries do not increment pending count.

#### Does idle mode trigger summarization?

- No.
- Run gate now only checks pending count threshold (`pending_message_count >= min_batch_size`, default `6`).
- Batch gate still applies after run gate: a conversation batch is summarized only if batch size and age checks pass.
- Batch gate defaults:
  - Immediate summarize when batch size `>= min_batch_size` (`6`).
  - Otherwise requires `>= min_batch_size_idle` (`6`) plus age checks.
- Because both defaults are `6`, the effective per-conversation requirement is typically at least 6 unsemanticized transcript rows.

#### If pending count is 10, are exactly those 10 rows sent to one prompt?

- Not necessarily.
- Pending count is only a cadence signal; it is not a direct batch size.
- Actual summarization input is fetched per conversation window, up to `max_batch_size=30`, ordered oldest to newest by timestamp.
- Tool chatter may be filtered out before prompt chunks are built.

#### Can one summarization request mix different conversation histories?

- No.
- Summarization batches are scoped to a single `conversation_id`.
- Pending count can include activity from multiple conversations, but each request summarizes one conversation window at a time.

#### Are messages ordered like conversation history?

- Yes.
- Rows are loaded in ascending timestamp order for each conversation window.
- After filtering tool chatter, remaining rows keep chronological order in summary chunks.

#### Is low-signal filtering currently implemented?

- No.
- Current logic skips write only when both summary and facts are empty.
- If summary/facts are non-empty (even if low value), a semantic memory is written.

#### Idle-trigger removal status

- Implemented.
- Summarization runs only when pending count reaches threshold.
- With current defaults, pending `>= 6` is required even after long idle periods.

### MemoryTool

`frontend/src/main/python/tools/memory/memory_tool.py`
- Tool-access to memory (store/search/stats)
- Wraps `LocalMemoryStore` for tool execution

## Dashboard Read APIs

The Electron renderer reads memory through sidecar JSON-RPC handlers exposed over IPC:
- `list_conversations` + `get_conversation` for episodic/transcript browsing.
- `list_semantic_memories` for semantic-memory browsing in the Semantic Memory tab.

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
