---
summary: "Agent-facing matrix of WindieOS runtime config fields, environment variables, owners, defaults, propagation paths, and validation targets."
read_when:
  - When adding, removing, or debugging environment variables or runtime config fields.
  - When deciding whether a setting belongs in backend config, Electron main,
    renderer local storage, or the local-runtime implementation.
title: "Runtime Configuration Matrix"
---

# Runtime Configuration Matrix

WindieOS configuration is intentionally split by runtime boundary. Do not add a config field to every layer by default. Put it where the owner can enforce it, then propagate only the normalized value that downstream layers need.

## Config Owners

| Owner | Stores | Applies when | Primary files |
| --- | --- | --- | --- |
| Backend `AppConfig` | Runtime policy, provider defaults, API keys by env-var name, timeouts, inference provider settings, artifact limits, install-auth settings | Backend startup; selected updates can be applied in memory through config manager/session settings | `backend/src/core/config/app_config.py`, `backend/src/core/config/models.py`, `backend/src/core/config/loader.py`, `backend/src/core/config/runtime.py` |
| Electron main | Backend endpoint selection, local-runtime launch options, local config file, windows/overlays/runtime mode | App startup and selected IPC handlers | `frontend/src/main/app/backend_endpoints.cjs`, `frontend/src/main/ipc.cjs`, `frontend/src/main/sidecar/local_runtime_launch_options.cjs`, `frontend/src/main/sidecar/local_runtime_bridge.cjs`, `frontend/src/main/index.cjs` |
| Renderer | User-facing settings subset and local UI state | Renderer load and settings changes | `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js`, `frontend/src/renderer/app/runtime/desktopRendererConfigFilterRuntime.js`, `frontend/src/renderer/features/settings/**` |
| Local-runtime implementation | Local tool runtime flags, backend URL used by local-runtime memory/API clients, worker counts, browser runtime knobs | Local-runtime Python process startup; tool calls read some env values lazily | `frontend/src/main/python/local_backend.py`, `frontend/src/main/python/windie/_backend_config.py`, `frontend/src/main/python/core/executors.py`, `frontend/src/main/python/tools/**` |
| Release/CI | Signing, notarization, package target behavior | GitHub Actions or local packaging command | `.github/workflows/desktop-release.yml`, `frontend/electron-builder.bundled-python.yml`, `scripts/build-sidecar-runtime` |

## Endpoint Selection

| Setting | Owner | Default | Effect | Edit when |
| --- | --- | --- | --- | --- |
| `BACKEND_HTTP_URL` | Electron main env | unset | Highest-priority HTTP base URL | You need to force a local, staging, or alternate hosted backend |
| `BACKEND_WS_URL` | Electron main env | unset | Highest-priority websocket URL | You need websocket traffic to target a different route than derived `/ws` |
| `BACKEND_HOST` / `BACKEND_PORT` | Electron main env | `127.0.0.1` / `8765` only when explicitly set | Local fallback endpoint pair | You want old-style local endpoint pinning without full URLs |
| `WINDIE_DEFAULT_BACKEND_HTTP_URL` | Electron main env | unset | Hosted default HTTP override when no `BACKEND_*` is set | You are changing the default host for all app modes |
| `WINDIE_DEFAULT_BACKEND_WS_URL` | Electron main env | unset | Hosted default websocket override when no `BACKEND_*` is set | You need a non-derived hosted websocket URL |
| `WINDIE_BACKEND_HTTP_URL` | Local-runtime env injected by Electron main through WindieOS host skin | resolved active backend URL | Backend URL used by local-runtime remote memory/embedding clients | You are debugging local-runtime-to-backend routes, not renderer websocket selection |

Current default with no endpoint env override:

- HTTP: `https://api.windieos.com`
- WebSocket: `wss://api.windieos.com/ws`

Development no longer falls back to `127.0.0.1:8765` unless a local override is explicit.

## Backend Provider and Inference Settings

| Setting or field | Owner | Effect | Primary files |
| --- | --- | --- | --- |
| `model_provider`, `selected_model_id`, `model_mode` | Backend session config plus renderer settings subset | Chooses the LLM provider/model for a session | `backend/src/core/config/app_config.py`, `backend/src/llm/providers/factory.py`, `backend/src/llm/models/models_config.py`, `frontend/src/renderer/features/settings/**` |
| Provider API keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `MISTRAL_API_KEY`, `KIMI_API_KEY`) | Process env | Authenticates LLM providers | `backend/src/core/config/models.py`, provider files under `backend/src/llm/providers` |
| `BRAVE_SEARCH_API_KEY` | Process env | Enables Brave fallback for logical `web_search` when native provider search is unavailable | `backend/src/tools`, `backend/src/llm/providers`, config models |
| `ELEVENLABS_API_KEY` | Process env | Enables ElevenLabs TTS provider | `backend/src/core/config/models.py`, backend TTS services |
| `ocr_backend`, `vision_backend`, `embedding_backend` | Backend `AppConfig` | Chooses local, remote HTTP, vendor, or disabled inference routes | `backend/src/core/config/models.py`, `backend/src/services/ocr`, `backend/src/services/vision`, `backend/src/embeddings`, `backend/src/api/routes/memory/embeddings` |
| Inference remote URLs and health URLs | Backend `AppConfig` | Points OCR, vision, or embeddings at hosted services | `backend/src/core/config/models.py`, provider/router services |
| Circuit breaker thresholds and cooldowns | Backend `AppConfig` | Hides degraded OCR/vision/embedding capabilities after repeated failures | `backend/src/core/config/models.py`, provider routers |

Provider secrets must stay in environment variables. Do not put real keys in docs, tests, fixtures, or `app_config.py`.

## Renderer-Persisted Settings

The renderer persists only the user-facing subset:

- `model_mode`
- `model_provider`
- `selected_model_id`
- `interaction_mode`
- `speech_mode_enabled`
- `wakeword_enabled`
- `include_query_screenshot`

Storage locations:

- `localStorage` key: `windieos-config`
- Electron user data file: `frontend-config.json`

There is no localStorage migration from the removed `desktop-assistant-config`
key; stale renderer-local values at that key are ignored.

Do not add backend-owned provider internals such as `speech_provider`, `stt_provider`, remote inference URLs, or provider API keys to renderer persistence.

## Local Runtime Implementation Variables

| Variable | Owner | Effect | Primary files |
| --- | --- | --- | --- |
| `WINDIE_PYTHON_PATH` | Electron main env | Forces Python executable used in desktop local-runtime launch options | `frontend/src/main/app/runtime_paths.cjs`, `frontend/src/main/sidecar/local_runtime_launch_options.cjs` |
| `AGENT_LOCAL_RUNTIME_LOG_LEVEL` (`WINDIE_SIDECAR_LOG_LEVEL` in WindieOS launches) | Electron main or reinstall helper env | Sets local-runtime Python logging level. `AGENT_SIDECAR_LOG_LEVEL` remains a compatibility alias. | `frontend/src/main/python/local_backend.py`, `frontend/src/main/sidecar/local_runtime_launch_options.cjs` |
| `AGENT_VERBOSE_LOCAL_RUNTIME_STDERR` (`WINDIE_VERBOSE_LOCAL_RUNTIME_STDERR` in WindieOS launches) | Electron main env through host skin | Forwards all local-runtime daemon stderr when `1`; default is severity-filtered. | `frontend/src/main/app/main_host_skin.cjs`, `frontend/src/main/sidecar/local_runtime_launch_options.cjs`, `frontend/src/main/sidecar/local_runtime_utils.cjs` |
| `AGENT_INTERACTIVE_WORKERS` (`WINDIE_INTERACTIVE_WORKERS` in WindieOS launches) | Local-runtime env | Interactive executor max workers. | `frontend/src/main/python/core/executors.py` |
| `AGENT_BACKGROUND_WORKERS` (`WINDIE_BACKGROUND_WORKERS` in WindieOS launches) | Local-runtime env | Background executor max workers. | `frontend/src/main/python/core/executors.py` |
| `AGENT_SHELL_JOB_TTL_SECONDS` (`WINDIE_SHELL_JOB_TTL_SECONDS` in WindieOS launches) | Local-runtime env | Finished shell/process session retention TTL. | `frontend/src/main/python/tools/system/shell_process_registry.py` |
| `AGENT_PERMISSION_STATE_PATH` (`WINDIE_PERMISSION_STATE_PATH` in WindieOS launches) | Local-runtime env injected by Electron main through host skin | Permission-state path for path resolution helpers. | `frontend/src/main/python/tools/path_resolution.py` |
| `AGENT_USER_DATA_DIR` (`WINDIE_USER_DATA_DIR` in WindieOS launches) | Electron main env through host skin and local-runtime daemon env | Daemon user-data root override for diagnostics/local storage. Electron main injects the resolved WindieOS app-data root so desktop launches keep the existing storage directory. | `frontend/src/main/sidecar/local_runtime_launch_options.cjs`, `frontend/src/main/python/sidecar_daemon.py`, `frontend/src/main/python/core/user_data_paths.py` |
| `AGENT_APP_DIAGNOSTICS_DB` (`WINDIE_APP_DIAGNOSTICS_DB` in WindieOS launches) | Local-runtime daemon env | Daemon diagnostics database override. | `frontend/src/main/python/sidecar_daemon.py` |
| `AGENT_TEST_PLATFORM` (`WINDIE_TEST_PLATFORM` in WindieOS test launches) | Local-runtime daemon test env | Test-only platform override for daemon user-data path resolution. | `frontend/src/main/python/sidecar_daemon.py`, `tests/sidecar/test_sidecar_daemon.py` |
| Browser env vars (`AGENT_BROWSER_CDP_PORT`, `AGENT_BROWSER_USE_HOME`, `AGENT_BROWSER_USE_SESSION`, `AGENT_BROWSER_USE_CLI`, `AGENT_BROWSER_USE_COMMAND_TIMEOUT_SECONDS`, `AGENT_BROWSER_FILES_DIR`) | Local-runtime env | Dedicated browser port, Browser Use daemon settings, and browser file storage behavior. WindieOS launches preserve matching `WINDIE_BROWSER_*` aliases. | `frontend/src/main/python/tools/browser/**` |

## VM Worker and Runs API Variables

See [Automation Hub](../automation/README.md), [VM Runs and Workers](../automation/vm_runs_and_workers.md), and [Runs API Runbook](../automation/runs_api_runbook.md) for the end-to-end control-plane flow behind these variables.

| Variable | Owner | Effect |
| --- | --- | --- |
| `WINDIE_VM_MODE` | Electron main | Boots the app in hosted VM dashboard mode, disables normal tray/overlay/onboarding surfaces |
| `WINDIE_VM_WORKER_MODE` | Electron main | Enables worker heartbeat/poll loop; defaults to VM mode when unset |
| `WINDIE_VM_WORKSPACE_ID` | Electron main worker | Workspace routing key for `/api/runs/workers/heartbeat` |
| `WINDIE_VM_WORKER_ID` | Electron main worker | Optional fixed worker id |
| `WINDIE_VM_ID` | Electron main worker | Optional fixed VM id |
| `WINDIE_VM_AGENT_ID` | Electron main worker | Optional agent identity in worker heartbeat payloads |
| `WINDIE_VM_WORKER_HEARTBEAT_MS` | Electron main worker | Heartbeat interval, minimum 1000ms |
| `WINDIE_RUNS_API_KEY` | Backend and worker env | Shared key for `/api/runs/*`; accepted as `x-windie-runs-key` |
| `WINDIE_VM_RUNS_API_KEY` | Worker env | Worker-specific runs API key override |
| `WINDIE_VM_MAX_ACTIVE_RUNS_PER_WORKSPACE` | Backend env | Active run cap per workspace; active statuses include `awaiting_worker`, `queued`, `running`, `paused` |

Runs API failures often look operational, not UI-related:

- missing or invalid key: auth failure
- active-run cap hit: HTTP `409`
- no heartbeat: worker mode or endpoint selection failure

## Packaging and Signing Variables

| Variable | Owner | Effect |
| --- | --- | --- |
| `WINDIE_PYTHON_BUILD` | Packaging scripts | Python interpreter used to build bundled runtime |
| `WINDIE_REQUIRE_WAKEWORD_PREFETCH` | Runtime build | Set to `0` only to allow wakeword prefetch failure during runtime build |
| `WINDIE_REQUIRE_SIGNING` | CI workflow | Enforces signing where release workflow decides it is required |
| `CSC_LINK`, `CSC_KEY_PASSWORD` | macOS release signing | macOS Developer ID identity |
| `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` | Windows release signing | Windows code-signing identity |
| `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` | macOS notarization | Apple notarization credentials |
| `WINDIE_APP_NAME`, `WINDIE_BUNDLE_ID`, `WINDIE_LOG_FILE` | Local reinstall helpers | Override app name, bundle id, and packaged-run log file |

Local macOS reinstall intentionally clears Apple signing/notarization env before packaging. Do not treat local reinstall behavior as release signing validation.

## Add-a-Config Checklist

1. Choose the owner first: backend, Electron main, renderer, local-runtime implementation, or release CI.
2. Add the field in the owner layer and document its default.
3. Propagate only normalized values to downstream processes.
4. Add tests at the owner boundary and at every protocol boundary that receives the propagated value.
5. Update [Configuration](configuration.md), this matrix, and any feature-specific docs.
6. Run `<windie> docs list`.

For backend `AppConfig`, session-scoped settings, container rebinding, and stale provider/session debugging, use [Backend Config and Container Change Workflow](../backend/config/backend_config_and_container_change_workflow.md).
