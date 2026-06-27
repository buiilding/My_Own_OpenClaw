---
summary: "Local-runtime Python implementation behind the SDK local-runtime boundary."
read_when:
  - When changing the local-runtime Python implementation or local-runtime IPC.
---

# Local-Runtime Python Implementation

## Overview

The SDK-owned local runtime starts or reuses a **local-runtime Python daemon**
that executes tools, captures system state, and manages local memory. Electron
main supplies desktop launch facts and host-only helpers, but does not own a
standalone local-runtime Python process or stdin/stdout transport.

The local runtime is the local execution boundary, currently backed by the
local-runtime Python implementation. It is not a replacement backend. Its role in the
product boundary is:

- execute actions that must happen on the user's machine
- expose local-runtime tool APIs to the UI and SDK
- call the hosted backend only for local-runtime hosted helper services such as semantic summarization
- call the hosted backend through transport-only clients instead of importing backend Python packages

The intended open-source distribution is UI + local-runtime Python + SDK. Users should not need to run Private hosted services locally in order to use hosted OCR, prediction, or agent APIs.

Release contract:
- End users do not need Python preinstalled.
- Installer ships a bundled runtime under `resources/python-runtime`.
- Local-runtime Python and wakeword services run from bundled runtime in packaged apps.
- The local-runtime Python package now includes a transport-only hosted SDK client in `frontend/src/main/python/windie/sdk.py` for direct developer-facing calls to `/api/artifacts/*`, `/api/sdk/*`, and `/ws`.
- Python SDK callers import `AgentSdkClient` from the public `windie` package. The old `core` package re-export and `WindieSdkClient`/`WindieSdkAgentSession` aliases have been removed.

**Key files:**
- Local-runtime Python daemon entrypoint: `frontend/src/main/python/sidecar_daemon.py`
- LocalRuntimeService implementation: `frontend/src/main/python/local_backend.py`
- Electron bridge: `frontend/src/main/sidecar/local_runtime_bridge.cjs`
- Shared stdout writer: `frontend/src/main/python/core/stdout_json.py`
- Hosted SDK transport client: `frontend/src/main/python/windie/sdk.py`
- Tool implementations: `frontend/src/main/python/tools/`
- Memory system: `frontend/src/main/python/memory/`

## Process Model

```
Electron Main (Node) -- launch facts/host helpers --> SDK local runtime
SDK local runtime -- HTTP /rpc JSON-RPC --> sidecar_daemon.py
sidecar_daemon.py -- in-process dispatch --> LocalRuntimeService
```

The bridge:
- In packaged apps, resolves Python from bundled runtime only (no fallback to user Python/Conda).
- In dev/source runs, resolves `WINDIE_PYTHON_PATH` -> `CONDA_PREFIX` -> `python3`/`py`.
- Frontend npm Electron launchers now snapshot the caller's active `CONDA_PREFIX` into
  `WINDIE_PYTHON_PATH` before entering `bash -lc`, so login-shell startup files cannot
  silently switch local-runtime Python back to a base Conda interpreter.
- Local-runtime Python implementation modules do not import backend Python
  packages at startup. Client-side tool exposure and memory-type normalization
  are kept local to the local-runtime implementation, while tests enforce
  parity against backend tool contracts.
- Backend-bound Python SDK clients require an explicit `backend_url` or injected
  `AGENT_BACKEND_HTTP_URL`; `WINDIE_BACKEND_HTTP_URL` remains a WindieOS
  compatibility alias and there is no hosted URL fallback inside local-runtime Python.
- On Linux, the Electron launcher filters one known harmless Chromium
  `StartTransientUnit ... UnitExists` stderr line during startup; on macOS it also
  filters the Chromium `SetApplicationIsDaemon ... paramErr` LaunchServices warning
  emitted by child processes during startup so real app/runtime errors remain visible
  in dev logs.
- Marks the local runtime ready only after the SDK local runtime provider
  resolves a usable daemon client.
- Workspace-aware path resolution now lives in one shared local-runtime helper so shell and filesystem tools resolve relative paths from the same selected workspace base instead of each tool re-implementing permission-state parsing.

## JSON-RPC Methods

Registered in `LocalRuntimeService._initialize_methods()`:

- `ping`: health check; returns the generic `local_sidecar_runtime` service
  label.
- `get_status`: diagnostics (registered tools, memory status)
- `execute_tool`: execute a named tool with args
- `get_system_state`: capture system state (optional field selection)
- `search_memory_by_embedding`: query local memory using SDK-provided vectors
- `store_memory_by_embedding`: store episodic/semantic memory using SDK-provided vectors

Protocol output notes:
- The active desktop path sends JSON-RPC envelopes over the daemon `/rpc` HTTP
  endpoint.
- `core/stdout_json.py::write_json_line()` remains shared support for
  local-runtime Python service scripts that emit JSON lines. Electron bridge helpers reach
  `LocalRuntimeService` through the daemon, not through a direct stdin/stdout
  `local_backend.py` process.

## Local-Runtime Daemon HTTP Runtime

The SDK-owned local runtime talks to `sidecar_daemon.py` over token-authenticated HTTP/WebSocket endpoints. This daemon is the local-runtime HTTP/WebSocket boundary used by `AgentClient.wakeUp(...)` for local tools, plugins, MCP servers, and SDK examples:

- `GET /health`: daemon liveness, generic `local_runtime_daemon` service label, pid, and creation time.
- `GET /status`: local runtime diagnostics, daemon metadata, registered tool
  names, and the executable local-runtime tool manifest backed by Python
  registry modules.
- `GET /tools`: executable local-runtime tool manifest for built-in and dynamic
  module/plugin/MCP tools.
- `POST /tools/register-module`: register a Python module-path tool without restarting the daemon.
- `POST /tools/register-plugin`: load tools from a local plugin package.
- `POST /tools/register-mcp`: expose MCP server tools as local-runtime tools.
- `POST /execute-tool`: execute a local tool and return the normalized `{ success, data?, error? }` envelope.
- `GET /events`: lightweight event/control websocket for `ping`, `status`, and `tools/list`.
- `POST /shutdown`: signal SDK-owned daemon shutdown.

The daemon does not own LLM inference, prompt policy, provider history, or conversation replay semantics. It only exposes local authority and execution services to the SDK runtime.

## Tools

The local-runtime Python implementation maintains a `ToolRegistry`
(`frontend/src/main/python/tools/registry.py`) with tools for:
- Computer control (mouse, keyboard, scroll, screenshot)
- Filesystem (read/write/list/search)
- System stats and window info
- Detached app launching (`open_app`)
- Shell command execution (`run_shell_command`)
- Background session management (`process`) for polling/logging/writing/killing running shell commands
  - Finished sessions are pruned after ~30 minutes (configurable via `AGENT_SHELL_JOB_TTL_SECONDS`; WindieOS launches may still use `WINDIE_SHELL_JOB_TTL_SECONDS`)

Computer-control execution notes:
- `mouse_control` covers click, double-click, right-click, move, and drag only.
- `scroll_control` is the dedicated scroll tool.
- `scroll_control` vertical actions default to a 5-click amount owned by the
  local-runtime computer-control implementation across Windows, macOS, and
  Linux; optional `clicks` remains available for explicit literal overrides.
- `mouse_control` drag uses source coordinates from `x/y` and destination coordinates from `drag_to_x/drag_to_y`.
- Backend coordinate normalization converts both source and drag destination from screenshot space into desktop space before local-runtime Python executes the drag.

## Memory

Local memory is backed by the local-runtime Python implementation:
- SQLite + FAISS in `frontend/src/main/python/memory/local_store.py`
- Summarization worker in `frontend/src/main/python/memory/summarizer.py`
- Durable title state in `frontend/src/main/python/memory/conversation_title_store.py`
- Uses backend `/api/embeddings`, `/api/semantic/summarize`, and `/api/semantic/title` APIs
- Backend base URL comes from an explicit client `backend_url` or
  `AGENT_BACKEND_HTTP_URL`; WindieOS Electron launches mirror the hosted
  endpoint resolver into that generic env and `WINDIE_BACKEND_HTTP_URL`.
  Missing local-runtime backend endpoint config fails fast instead of falling back to a
  hosted default.
- Local-runtime Python hosted-helper HTTP clients do not parse Electron endpoint env
  aliases or retry alternate backend URLs. Remote memory/title/summarization
  calls stay pinned to the injected backend endpoint.
- Summarizer runs on a fixed interval, deduplicates via summary hashes, and updates `watermark_state.json` safely on shutdown
- Pending summarization cadence is turn-based: watermark pending count increments
  on assistant terminal transcript turns (`llm-text`, `error`, or empty type).
- User transcript rows do not increment pending count. Example: 4 user messages with 4 assistant replies yields pending count `4`.

Memory storage path:
- Linux: `~/.config/windieos/memory/`
- macOS: `~/Library/Application Support/windieos/memory/`
- Windows: `%APPDATA%/windieos/memory/`

## Wakeword

Wakeword detection runs as a separate Python subprocess:
- `frontend/src/main/python/wakeword_service.py`
- Managed by `frontend/src/main/wakeword/wakeword_bridge.cjs`
- In packaged apps, wakeword runtime model downloads are disabled; missing models are treated as packaging errors.
- Bridge event handlers ignore stdout/stderr/exit events from stale process instances after restart, so old process callbacks cannot flip active service state.
- Bridge clears the wakeword `stderr` parser buffer on stop/start so stale partial log lines cannot suppress the next process ready signal.

## Packaging Expectations

- Runtime build prefetches wakeword models into bundled runtime and verifies required model markers.
- Runtime bundles browser Python dependencies, but does not preinstall Playwright Chromium.
- Runtime packaging should assume a hosted backend is available for backend-owned
  APIs; bundling local-runtime Python does not imply bundling a backend server.
- Build is idempotent for bundled assets:
  - If wakeword model assets already exist, prefetch download is skipped.
- Packaged app disables browser feature-pack runtime auto-install and expects the full local-runtime Python deps to be bundled.
- Browser automation uses a system-installed Chrome/Chromium-family browser first and falls back to Playwright-installed Chromium only after explicit user consent.

## Troubleshooting

- If local-runtime Python doesn't start, verify your Python path and dependencies in
  `frontend/src/main/python/requirements.txt`.
- Check `sidecar_daemon.py` stderr and `LocalRuntimeService` logs for
  initialization errors.

## Testing

- Local-runtime Python unit tests live in `tests/sidecar/`.
- Core coverage:
  - `tests/sidecar/test_local_backend.py` (JSON-RPC handlers, tool execution, memory wiring)
  - `tests/sidecar/test_sidecar_daemon.py` (daemon HTTP status, tool manifest, execution, dynamic module/plugin/MCP registration, event-control channel, shutdown)
  - `tests/sidecar/test_bootstrap_paths.py` (source-run bootstrap for client/local-runtime imports)
  - `tests/sidecar/test_stdout_json.py` (shared JSON-line stdout writer behavior)
- Bridge regression coverage:
  - `tests/frontend/LocalRuntimeBridge.lifecycle.test.cjs` validates SDK local-runtime bootstrap and readiness/status transitions.
  - `tests/frontend/WakewordBridge.test.cjs` validates stale partial wakeword `stderr` buffers are cleared across stop/start restart.
- Shell command sessions:
  - Use `open_app` for detached GUI launches that should survive local-runtime/agent exit.
- `run_shell_command` supports `yield_after_seconds`, `env`, and best-effort `pty` (PTY on Unix; fallback on Windows).
  - If `directory` is omitted, `run_shell_command` starts in the user-selected workspace folder when `filesystem_workspace_access` has a stored selected path; otherwise it falls back to the OS user home directory.
  - Relative `directory` values such as `.` or `src/components` resolve from that same default base directory instead of requiring absolute paths.
  - Use `process` to list/poll/log/write/kill backgrounded shell sessions.
- Run: `<windie> test local-runtime` (preferred), or `./scripts/python-in-env local-runtime python -m pytest tests/sidecar`.
