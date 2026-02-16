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
- Shared stdout writer: `frontend/src/main/python/core/stdout_json.py`
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
- Uses bounded exponential-backoff retries and stale-callback guards in readiness checks to avoid old timeout callbacks marking restarted processes incorrectly.

## JSON-RPC Methods

Registered in `LocalBackend._initialize_methods()`:

- `ping`: health check
- `get_status`: diagnostics (registered tools, memory status)
- `execute_tool`: execute a named tool with args
- `get_system_state`: capture system state (optional field selection)
- `search_memory`: query local memory
- `store_memory`: store episodic/semantic memory

Protocol output notes:
- JSON-RPC responses are emitted as one JSON line per message.
- `core/stdout_json.py::write_json_line()` is the shared writer used by both JSON-RPC (`local_backend.py`/`core/ipc_protocol.py`) and line-based memory service responses (`memory_service.py`) to keep UTF-8 encoding and flush behavior consistent.

## Tools

The sidecar maintains a `ToolRegistry` (`frontend/src/main/python/tools/registry.py`) with tools for:
- Computer control (mouse, keyboard, scroll, screenshot)
- Filesystem (read/write/list/search)
- System stats and window info
- Shell command execution (`run_shell_command`)
- Background session management (`process`) for polling/logging/writing/killing running shell commands
  - Finished sessions are pruned after ~30 minutes (configurable via `WINDIE_SHELL_JOB_TTL_SECONDS`)

## Memory

Local memory is implemented in the sidecar:
- SQLite + FAISS in `frontend/src/main/python/memory/local_store.py`
- Summarization worker in `frontend/src/main/python/memory/summarizer.py`
- Uses backend `/api/embeddings` and `/api/semantic/summarize` APIs
- Backend base URL comes from `WINDIE_BACKEND_HTTP_URL` (set by Electron main process), then `BACKEND_HTTP_URL`, then default `http://127.0.0.1:8765`
- Summarizer runs on a fixed interval, deduplicates via summary hashes, and updates `watermark_state.json` safely on shutdown
- Pending summarization cadence is turn-based: watermark pending count increments
  on assistant terminal transcript turns (`llm-text`, `error`, or empty type).
- User transcript rows do not increment pending count. Example: 4 user messages with 4 assistant replies yields pending count `4`.

Memory storage path:
- Linux: `~/.config/desktop-assistant/memory/`
- macOS: `~/Library/Application Support/desktop-assistant/memory/`
- Windows: `%APPDATA%/desktop-assistant/memory/`

## Wakeword

Wakeword detection runs as a separate Python subprocess:
- `frontend/src/main/python/wakeword_service.py`
- Managed by `frontend/src/main/wakeword_bridge.cjs`
- Bridge event handlers ignore stdout/stderr/exit events from stale process instances after restart, so old process callbacks cannot flip active service state.
- Bridge clears the wakeword `stderr` parser buffer on stop/start so stale partial log lines cannot suppress the next process ready signal.

## Troubleshooting

- If the sidecar doesn’t start, verify your Python path and dependencies in
  `frontend/src/main/python/requirements.txt`.
- Check `local_backend.py` logs (stderr) for initialization errors.

## Testing

- Sidecar unit tests live in `tests/sidecar/`.
- Core coverage:
  - `tests/sidecar/test_local_backend.py` (JSON-RPC handlers, tool execution, memory wiring)
  - `tests/sidecar/test_memory_service.py` (search/store validation, error handling)
  - `tests/sidecar/test_stdout_json.py` (shared JSON-line stdout writer behavior)
- Bridge regression coverage:
  - `tests/frontend/LocalBackendBridge.test.cjs` validates stale readiness retry timers cannot override newer process readiness checks.
  - `tests/frontend/WakewordBridge.test.cjs` validates stale partial wakeword `stderr` buffers are cleared across stop/start restart.
- Shell command sessions:
  - `run_shell_command` supports `yield_after_seconds`, `env`, and best-effort `pty` (PTY on Unix; fallback on Windows).
  - If `directory` is omitted, `run_shell_command` starts in the OS user home directory.
  - Use `process` to list/poll/log/write/kill backgrounded shell sessions.
- Run: `./scripts/test-sidecar` (preferred), or `./scripts/python-in-env sidecar python -m pytest tests/sidecar`.
