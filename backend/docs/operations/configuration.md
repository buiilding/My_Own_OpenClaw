---
summary: "Configuration Guide"
read_when:
  - When adding or changing config/env vars.
---

# Configuration Guide

## Overview

WindieOS does **not** use a YAML config file. Configuration is split between:

- **Backend config**: Python `AppConfig` in `backend/src/core/config/app_config.py`.
- **Frontend config**: A small JSON blob stored in Electron’s user data folder and mirrored in `localStorage`.

For an agent-facing matrix of every major owner, environment variable group,
default, propagation path, and validation target, see
`docs/operations/runtime_configuration_matrix.md`.

Backend config is loaded **at startup**. It can be updated or reloaded in memory
via `ConfigManager`, but changes are **not persisted** (edit `app_config.py` and
restart to make permanent changes). Frontend config is updated from the UI,
persisted locally, and sent to the backend via `update-settings` to update the
user session (applies on next query). Speech backend selection stays backend-owned:
the frontend can enable or disable speech playback for the session, but it does not
choose `local` versus `elevenlabs`. The same rule now applies to transcription:
the frontend can enable voice mode, but it does not choose `nova` versus `openai`.

Important secret-handling rule:
- `AppConfig` stores defaults, runtime policy, and env-var names.
- Provider secrets such as `OPENAI_API_KEY` and `ELEVENLABS_API_KEY` are read from the process environment at runtime.
- Do not place real API keys in `app_config.py`.

Runtime normalization logic is centralized in `backend/src/core/config/runtime.py`
so loader/manager/service paths apply the same policy sequence.

Current runtime policies:
- `tts_enabled` is forced to `true` during runtime config assembly.
- If `tts_model_path` is unset, backend fills an OS-default path via `get_default_tts_model_path()`.
- TTS audio streaming still depends on `speech_mode_enabled` at request time.
- `speech_provider` defaults to `elevenlabs`; the API layer falls back to local Piper if ElevenLabs cannot initialize.
- `stt_provider` defaults to `openai`; the backend-owned `/ws/transcription` gateway can still proxy to Nova or translate to OpenAI Realtime without exposing provider choice to the renderer.
- OpenAI realtime transcription connects with OpenAI's transcription-session websocket intent and uses `gpt-4o-transcribe` by default inside `session.update`.

## Backend Configuration (Python)

The backend reads configuration from `backend/src/core/config/app_config.py` which instantiates `AppConfig` from `backend/src/core/config/models.py`.

Example (simplified):

```python
from backend.src.core.config.models import AppConfig, LLMProviders, SecurityLimits
from backend.src.core.config.loader import get_default_tts_model_path

APP_CONFIG = AppConfig(
    model_mode="online",
    model_provider="openai",
    selected_model_id="gpt-5.4@@gpt-5-4-none-thinking",
    interaction_mode="agent",
    llm_timeout=300,
    query_timeout=600,
    llm_providers=LLMProviders(),
    memory_enabled=True,
    embedding_backend="vendor",
    embedding_model="text-embedding-3-small",
    speech_mode_enabled=False,
    stt_provider="openai",
    speech_provider="elevenlabs",
    include_query_screenshot=True,
    vision_model_name="OpenGVLab/InternVL3_5-4B",
    wakeword_enabled=True,
    tts_enabled=True,
    tts_model_path=get_default_tts_model_path(),
    security_limits=SecurityLimits(),
)
```

**Embedding device note**: The embedding provider is created in
`backend/src/core/container/factories.py` with `device="cuda"` by default.
If you do not have CUDA, change this to `device="cpu"` or set `memory_enabled=False`.

### API Keys

API keys are loaded from environment variables defined in `backend/src/core/config/models.py`:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY` (Gemini)
- `OPENROUTER_API_KEY`
- `MISTRAL_API_KEY`
- `KIMI_API_KEY` (Kimi Coding)
- `BRAVE_SEARCH_API_KEY` (backend fallback for logical `web_search` when the active provider lacks native web retrieval)
- `ELEVENLABS_API_KEY` (default speech provider authentication)

ElevenLabs note:
- `speech_provider` and the default ElevenLabs voice/model/output/streaming settings live in backend config.
- `elevenlabs_api_key_env` stores only the environment variable name to read for auth.
- The actual ElevenLabs secret must be provided through `ELEVENLABS_API_KEY` in the environment.

### Web Search Capability Routing

WindieOS exposes one logical capability named `web_search`. Availability is automatic and backend-owned:

- OpenAI supported models fulfill the logical `web_search` tool through a backend-owned provider-native web-search request.
- Gemini supported models fulfill the logical `web_search` tool through a backend-owned native Google Search grounding request.
- Other providers use backend Brave Search only when `BRAVE_SEARCH_API_KEY` is set.
- If neither native support nor Brave fallback is available, `web_search` is hidden from the model.
- Explicit or provider-health capability policy can also disable `web_search`, including provider-native web-search exposure, for the affected session.

No separate runtime toggle is required in v1.

### OCR and Vision Provider Routing

OCR and vision are selected independently with backend-owned config:

- `ocr_backend`: `local`, `remote-http`, `vendor`, or `disabled`
- `ocr_remote_service_url`: base URL for a remote OCR service
- `ocr_remote_health_url`: optional health URL or path; defaults to `/health`
- `ocr_request_timeout_seconds` and `ocr_health_timeout_seconds`
- `vision_backend`: `local`, `remote-http`, `vendor`, or `disabled`
- `vision_remote_service_url`: base URL for a remote vision service
- `vision_remote_health_url`: optional health URL or path; defaults to `/health`
- `vision_request_timeout_seconds` and `vision_health_timeout_seconds`
- `provider_circuit_breaker_failure_threshold`
- `provider_circuit_breaker_cooldown_seconds`

Remote OCR contract:

- `GET /health` returns any 2xx response, optionally with `status: ok|healthy|ready`
  or boolean `ready`, `healthy`, or `available`.
- `POST /ocr/analyze` receives `{"image": "...", "model": "..."}` and returns either
  a result list or an object with `results`, `ocr_results`, `items`, or `data`.

Remote vision contract:

- `GET /health` follows the same health convention.
- `POST /vision/locate` receives `{"image": "...", "description": "...", "model": "..."}`
  and returns coordinates as `center`, `point`, `coordinates`, or `match.center`.
- `POST /vision/describe` receives `{"image": "...", "prompt": "...", "model": "..."}`
  and returns text in `answer`, `description`, `text`, or `result`.

If a provider is known down before prompt construction, backend policy hides the
matching OCR or vision fields from model-visible tool schemas. If it fails during
a turn, the router returns a structured provider error through the normal tool
output path so the agent loop can recover or ask for another method. Repeated
failures open a circuit breaker and temporarily stop advertising the capability.

### Local Providers

Local providers do not require API keys and use base URLs defined in the provider config:

- **Ollama**: default `http://localhost:11434/v1`
- **LM Studio**: default `http://localhost:1234/v1`

### WebSocket Settings

AppConfig controls WebSocket limits and timeouts:

- `websocket_max_message_size` (default 10MB)
- `websocket_max_concurrent_tasks` (default 50)
- `websocket_receive_timeout` (default 3600s)
- `websocket_task_cancellation_timeout` (default 5s)

### Artifact Settings

AppConfig controls HTTP artifact storage used for screenshots:

- `artifact_store_path` (default: persistent user config dir `.../windieos/artifacts`)
- `artifact_max_bytes` (default: 25MB)

Runtime note:
- artifact lookup uses the configured `artifact_store_path` only.

Important execution knobs in `AppConfig` (`backend/src/core/config/models.py`) include:
- `interaction_mode` (`chat` or `agent`) controls tool allowlist behavior.
- history reduction is compaction-only; there is no message-count pruning or loop-step cap in config.
- `speech_mode_enabled`, `wakeword_enabled`, `stt_provider`, `speech_provider`, and `include_query_screenshot` shape chat UX behavior.

## Frontend Configuration (Local)

The UI stores a minimal settings payload (model selection + interaction mode + voice/wakeword/screenshot toggles) locally. These values are pushed to the backend via `update-settings` and applied to the user session on the next query. Backend-owned runtime policy such as `speech_provider` and `stt_provider` is not persisted by the renderer.

### Stored Fields

The frontend only persists these fields:

- `model_mode`
- `model_provider`
- `selected_model_id`
- `interaction_mode`
- `speech_mode_enabled`
- `wakeword_enabled`
- `include_query_screenshot` (defaults to `true`; controls whether user queries include screenshot image context)

### Storage Locations

- **localStorage**: key `windieos-config`
- **Disk**: `frontend-config.json` in Electron’s `app.getPath('userData')`

The removed `desktop-assistant-config` localStorage key is not migrated. If only
that old renderer-local key exists, the UI starts from current defaults and then
merges the Electron disk config when present.

See:
- `frontend/src/renderer/app/runtime/desktopRendererConfigStorageRuntime.js`
- `frontend/src/renderer/app/runtime/desktopRendererConfigFilterRuntime.js`
- `frontend/src/main/ipc.cjs` (`load-frontend-config`, `save-frontend-config`)

## Changing Configuration

### Backend
1. Edit `backend/src/core/config/app_config.py`.
2. Restart the backend.

### Frontend
1. Use the Settings panel in the UI.
2. Settings are saved immediately to localStorage and disk.

## Notes

- The backend does **not** persist user config changes at runtime.
- `query` messages do **not** accept config overrides.

## Desktop Runtime Environment Variables

When launching Electron (dev or packaged), these env vars can override defaults:

- `BACKEND_HTTP_URL`: full backend HTTP base URL.
- `BACKEND_WS_URL`: full backend WebSocket URL (`/ws`).
- `BACKEND_HOST` and `BACKEND_PORT`: explicit endpoint override when full URLs are unset; malformed local overrides fall back to hosted defaults instead of producing an empty endpoint set.
- `WINDIE_DEFAULT_BACKEND_HTTP_URL`: hosted-default HTTP URL when no `BACKEND_*` override is set.
- `WINDIE_DEFAULT_BACKEND_WS_URL`: hosted-default WS URL when no `BACKEND_*` override is set.
- `WINDIE_PYTHON_PATH`: explicit Python executable path for local-runtime Python
  startup.
- `WINDIE_VM_MODE`: set to `1` to boot WindieOS in hosted VM dashboard mode.
  - Disables first-run permission/onboarding gates in renderer.
  - Hides dashboard sidebar + settings/models/memory panels.
  - Disables tray + chat/response overlay windows and wakeword global shortcut in Electron main process.
  - Main window close no longer minimizes to tray in this mode.
- `WINDIE_VM_WORKER_MODE`: VM worker loop toggle.
  - Defaults to VM mode (`WINDIE_VM_MODE`) when unset.
  - Set to `1` to enable background worker heartbeat/poll loop in Electron main.
- `WINDIE_VM_WORKSPACE_ID`: workspace routing key sent to `/api/runs/workers/heartbeat`.
- `WINDIE_VM_WORKER_ID`: optional fixed worker identifier (defaults to `worker-<backend-user-id>`).
- `WINDIE_VM_ID`: optional fixed VM identifier (defaults to `vm-<worker-id>`).
- `WINDIE_VM_AGENT_ID`: optional agent identity attached to worker heartbeat payloads.
- `WINDIE_VM_WORKER_HEARTBEAT_MS`: heartbeat interval in strict integer milliseconds (minimum 1000, default 5000).
- `WINDIE_RUNS_API_KEY`: optional shared key protecting all `/api/runs/*` endpoints.
  - If set, every runs API request must include header `x-windie-runs-key: <key>`.
  - VM worker auto-uses `WINDIE_VM_RUNS_API_KEY` or falls back to this key.
- `WINDIE_VM_RUNS_API_KEY`: optional worker-specific runs API key override.
- `WINDIE_VM_MAX_ACTIVE_RUNS_PER_WORKSPACE`: active run cap per workspace (default `1`).
  - Active statuses counted: `awaiting_worker`, `queued`, `running`, `paused`.
  - New runs above cap return HTTP `409`.

Default behavior:

- Dev/source runs default to the hosted backend (`https://api.windieos.com`, `wss://api.windieos.com/ws`) unless `BACKEND_*` explicitly pins a different target.
- Packaged builds also default to the hosted backend and do not auto-fall back to desktop-local `127.0.0.1:8765`.
- `WINDIE_DEFAULT_BACKEND_*` changes that hosted default when `BACKEND_*` is unset.
- Preferred self-hosted setup for serving `api.windieos.com`: keep both the Cloudflare tunnel and the backend available as persistent user services so the hosted endpoint does not intermittently route to an origin with nothing listening on `127.0.0.1:8765`.

For bundled runtime packaging details, see `docs/operations/sidecar_runtime_packaging.md`.

For self-hosting `api.windieos.com` via Cloudflare Tunnel on your own machine,
see `docs/operations/cloudflared_self_host_windieos.md`.

For hosted install-token identity and bearer-token debugging, see
`docs/operations/hosted_backend_auth.md`.
