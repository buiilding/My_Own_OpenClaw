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
- Runs on a fixed interval; summarization only proceeds when unsemanticized episodic interaction rows reach the configured threshold (`min_batch_size`, default `6`).
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

- No.
- Run gate only checks unsemanticized interaction-row count (`count >= min_batch_size`, default `6`).
- Batch gate still applies after run gate: a conversation batch is summarized only if batch size and age checks pass.
- Batch gate defaults:
  - Immediate summarize when batch size `>= min_batch_size` (`6`).
  - Otherwise requires `>= min_batch_size_idle` (`6`) plus age checks.
- Because both defaults are `6`, the effective per-conversation requirement is typically at least 6 unsemanticized interaction rows.

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

- No.
- Current logic skips write only when both summary and facts are empty.
- If summary/facts are non-empty (even if low value), a semantic memory is written.

#### Idle-trigger removal status

- Implemented.
- Summarization runs only when unsemanticized interaction-row count reaches threshold.
- With current defaults, at least 6 unsemanticized interaction rows are required even after long idle periods.

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
