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
- Runs on a fixed interval and also when the app is idle (to avoid interrupting active sessions).
- Deduplicates summaries using a `summary_hash` over source memory IDs.
- Marks episodic memories as semanticized only after a successful summary write.
- Uses `watermark_state.json` to track progress and resumes safely after restarts.
- Summarizes both legacy episodic rows (`record_kind='memory'`) and transcript
  rows (`record_kind='transcript'`).
- Transcript summarization excludes tool-call/tool-bundle chatter when building
  summary chunks, while still marking the full processed batch semanticized.

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
