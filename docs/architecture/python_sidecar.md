---
summary: "Python Sidecar"
read_when:
  - When changing the Python sidecar or IPC.
---

# Python Sidecar

## Overview

The Electron app spawns a **local Python sidecar** that executes tools, captures system state, and manages local memory. It communicates with the Electron main process over **JSON-RPC 2.0 via stdin/stdout**.

The sidecar is the local execution runtime, not a replacement backend. Its role in the product boundary is:

- execute actions that must happen on the user's machine
- expose local tool APIs to the UI and SDK
- call the hosted backend when it needs backend-owned services such as embeddings, semantic summarization, OCR, or vision grounding
- call the hosted backend through transport-only clients instead of importing backend Python packages

The intended open-source distribution is UI + sidecar + SDK. Users should not need to run backend services locally in order to use hosted OCR, prediction, or agent APIs.

Release contract:
- End users do not need Python preinstalled.
- Installer ships a bundled runtime under `resources/python-runtime`.
- Sidecar and wakeword services run from bundled runtime in packaged apps.
- The sidecar now includes a transport-only hosted SDK client in `frontend/src/main/python/core/windie_sdk_client.py` for direct developer-facing calls to `/api/artifacts/*`, `/api/sdk/*`, and `/ws`.
- `frontend/src/main/python/core/__init__.py` now re-exports `WindieSdkClient` so sidecar consumers can import it from `core` instead of reaching into the module file path.

**Key files:**
- Sidecar entrypoint: `frontend/src/main/python/local_backend.py`
- Electron bridge: `frontend/src/main/local_backend_bridge.cjs`
- Shared stdout writer: `frontend/src/main/python/core/stdout_json.py`
- Hosted SDK transport client: `frontend/src/main/python/core/windie_sdk_client.py`
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
- In packaged apps, resolves Python from bundled runtime only (no fallback to user Python/Conda).
- In dev/source runs, resolves `WINDIE_PYTHON_PATH` -> `CONDA_PREFIX` -> `python3`/`py`.
- Frontend npm Electron launchers now snapshot the caller's active `CONDA_PREFIX` into
  `WINDIE_PYTHON_PATH` before entering `bash -lc`, so login-shell startup files cannot
  silently switch the sidecar back to a base Conda interpreter.
- Sidecar runtime modules do not import backend Python packages at startup. Client-side
  tool exposure and memory-type normalization are kept local to the sidecar runtime,
  while tests enforce parity against backend tool contracts.
- On Linux, the Electron launcher filters one known harmless Chromium
  `StartTransientUnit ... UnitExists` stderr line during startup; on macOS it also
  filters the Chromium `SetApplicationIsDaemon ... paramErr` LaunchServices warning
  emitted by child processes during startup so real app/runtime errors remain visible
  in dev logs.
- Sends `ping` until ready, then marks the sidecar as ready.
- Uses bounded exponential-backoff retries and stale-callback guards in readiness checks to avoid old timeout callbacks marking restarted processes incorrectly.
- Workspace-aware path resolution now lives in one shared sidecar helper so shell and filesystem tools resolve relative paths from the same selected workspace base instead of each tool re-implementing permission-state parsing.

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
- Detached app launching (`open_app`)
- Shell command execution (`run_shell_command`)
- Background session management (`process`) for polling/logging/writing/killing running shell commands
  - Finished sessions are pruned after ~30 minutes (configurable via `WINDIE_SHELL_JOB_TTL_SECONDS`)

Computer-control execution notes:
- `mouse_control` covers click, double-click, right-click, move, and drag only.
- `scroll_control` is the dedicated scroll tool.
- `scroll_control` vertical actions default to a 5-click amount owned by the sidecar runtime across Windows, macOS, and Linux; optional `clicks` remains available for explicit literal overrides.
- `mouse_control` drag uses source coordinates from `x/y` and destination coordinates from `drag_to_x/drag_to_y`.
- Backend coordinate normalization converts both source and drag destination from screenshot space into desktop space before the sidecar executes the drag.

## Memory

Local memory is implemented in the sidecar:
- SQLite + FAISS in `frontend/src/main/python/memory/local_store.py`
- Summarization worker in `frontend/src/main/python/memory/summarizer.py`
- Async title generation in `frontend/src/main/python/memory/conversation_title_runtime.py`
- Uses backend `/api/embeddings`, `/api/semantic/summarize`, and `/api/semantic/title` APIs
- Backend base URL comes from `WINDIE_BACKEND_HTTP_URL` (normally injected by Electron main from the hosted endpoint resolver), then `BACKEND_HTTP_URL`, then default `https://api.windieos.com`
- Sidecar backend-backed HTTP clients no longer auto-fall back to frontend-local `127.0.0.1`; remote memory/title/summarization calls stay pinned to the configured hosted endpoint unless an explicit `BACKEND_*` override is provided.
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
- In packaged apps, wakeword runtime model downloads are disabled; missing models are treated as packaging errors.
- Bridge event handlers ignore stdout/stderr/exit events from stale process instances after restart, so old process callbacks cannot flip active service state.
- Bridge clears the wakeword `stderr` parser buffer on stop/start so stale partial log lines cannot suppress the next process ready signal.

## Packaging Expectations

- Runtime build prefetches wakeword models into bundled runtime and verifies required model markers.
- Runtime bundles browser Python dependencies, but does not preinstall Playwright Chromium.
- Runtime packaging should assume a hosted backend is available for backend-owned APIs; bundling the sidecar does not imply bundling a local backend.
- Build is idempotent for bundled assets:
  - If wakeword model assets already exist, prefetch download is skipped.
- Packaged app disables browser feature-pack runtime auto-install and expects the full sidecar runtime deps to be bundled.
- Browser automation uses a system-installed Chrome/Chromium-family browser first and falls back to Playwright-installed Chromium only after explicit user consent.

## Troubleshooting

- If the sidecar doesn’t start, verify your Python path and dependencies in
  `frontend/src/main/python/requirements.txt`.
- Check `local_backend.py` logs (stderr) for initialization errors.

## Testing

- Sidecar unit tests live in `tests/sidecar/`.
- Core coverage:
  - `tests/sidecar/test_local_backend.py` (JSON-RPC handlers, tool execution, memory wiring)
  - `tests/sidecar/test_memory_service.py` (search/store validation, error handling)
  - `tests/sidecar/test_bootstrap_paths.py` (source-run bootstrap for client-local sidecar imports)
  - `tests/sidecar/test_stdout_json.py` (shared JSON-line stdout writer behavior)
- Bridge regression coverage:
  - `tests/frontend/LocalBackendBridge.test.cjs` validates stale readiness retry timers cannot override newer process readiness checks.
  - `tests/frontend/WakewordBridge.test.cjs` validates stale partial wakeword `stderr` buffers are cleared across stop/start restart.
- Shell command sessions:
  - Use `open_app` for detached GUI launches that should survive sidecar/agent exit.
- `run_shell_command` supports `yield_after_seconds`, `env`, and best-effort `pty` (PTY on Unix; fallback on Windows).
  - If `directory` is omitted, `run_shell_command` starts in the user-selected workspace folder when `filesystem_workspace_access` has a stored selected path; otherwise it falls back to the OS user home directory.
  - Relative `directory` values such as `.` or `src/components` resolve from that same default base directory instead of requiring absolute paths.
  - Use `process` to list/poll/log/write/kill backgrounded shell sessions.
- Run: `./scripts/test-sidecar` (preferred), or `./scripts/python-in-env sidecar python -m pytest tests/sidecar`.
