---
summary: "Python Sidecar"
read_when:
  - When changing the Python sidecar or IPC.
---

# Python Sidecar

## Overview

The Electron app spawns a **local Python sidecar** that executes tools, captures system state, and manages local memory. It communicates with the Electron main process over **JSON-RPC 2.0 via stdin/stdout**.

**Key files:**
- Sidecar entrypoint: `frontend/src/main/python/local_backend.py`
- Electron bridge: `frontend/src/main/local_backend_bridge.cjs`
- Tool implementations: `frontend/src/main/python/tools/`
- Memory system: `frontend/src/main/python/memory/`

## Process Model

```
Electron Main (Node)  ── JSON-RPC (stdin/stdout) ──>  local_backend.py
      │
      ├─ Spawns wakeword_service.py (separate process)
      └─ Uses IPC to forward results to renderer
```

The bridge:
- Spawns Python using `CONDA_PREFIX` if available, otherwise `python3`/`py`.
- Sends `ping` until ready, then marks the sidecar as ready.

## JSON-RPC Methods

Registered in `LocalBackend._initialize_methods()`:

- `ping`: health check
- `get_status`: diagnostics (registered tools, memory status)
- `execute_tool`: execute a named tool with args
- `get_system_state`: capture system state (optional field selection)
- `search_memory`: query local memory
- `store_memory`: store episodic/semantic memory

## Tools

The sidecar maintains a `ToolRegistry` (`frontend/src/main/python/tools/registry.py`) with tools for:
- Computer control (mouse, keyboard, scroll, screenshot)
- Filesystem (read/write/list/search)
- System stats and window info
- Shell command execution

## Memory

Local memory is implemented in the sidecar:
- SQLite + FAISS in `frontend/src/main/python/memory/local_store.py`
- Summarization worker in `frontend/src/main/python/memory/summarizer.py`
- Uses backend `/api/embeddings` and `/api/semantic/summarize` APIs
- Summarizer runs periodically and when idle, deduplicates via summary hashes, and updates `watermark_state.json` safely on shutdown

Memory storage path:
- Linux: `~/.config/desktop-assistant/memory/`
- macOS: `~/Library/Application Support/desktop-assistant/memory/`
- Windows: `%APPDATA%/desktop-assistant/memory/`

## Wakeword

Wakeword detection runs as a separate Python subprocess:
- `frontend/src/main/python/wakeword_service.py`
- Managed by `frontend/src/main/wakeword_bridge.cjs`

## Troubleshooting

- If the sidecar doesn’t start, verify your Python path and dependencies in
  `frontend/src/main/python/requirements.txt`.
- Check `local_backend.py` logs (stderr) for initialization errors.
