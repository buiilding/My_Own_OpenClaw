---
summary: "Configuration Guide"
read_when:
  - When adding or changing config/env vars.
---

# Configuration Guide

## Overview

Desktop Assistant does **not** use a YAML config file. Configuration is split between:

- **Backend config**: Python `AppConfig` in `backend/src/core/config/app_config.py`.
- **Frontend config**: A small JSON blob stored in Electron’s user data folder and mirrored in `localStorage`.

Backend config is loaded **at startup**. It can be updated or reloaded in memory
via `ConfigManager`, but changes are **not persisted** (edit `app_config.py` and
restart to make permanent changes). Frontend config is updated from the UI,
persisted locally, and used to build **per-query overrides** sent with each request.

## Backend Configuration (Python)

The backend reads configuration from `backend/src/core/config/app_config.py` which instantiates `AppConfig` from `backend/src/core/config/models.py`.

Example (simplified):

```python
from backend.src.core.config.models import AppConfig, LLMProviders, OCRConfig, SecurityLimits
from backend.src.core.config.loader import get_default_tts_model_path

APP_CONFIG = AppConfig(
    model_mode="online",
    model_provider="openai",
    selected_model_id="gpt-5.1",
    llm_timeout=300,
    query_timeout=600,
    llm_providers=LLMProviders(),
    memory_enabled=True,
    embedding_model="all-MiniLM-L6-v2",
    vision_model_name="OpenGVLab/InternVL3_5-4B",
    wakeword_enabled=True,
    tts_enabled=True,
    tts_model_path=get_default_tts_model_path(),
    security_limits=SecurityLimits(),
    ocr_config=OCRConfig(),
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
- `KIMICODE_API_KEY` (legacy fallback for Kimi Coding)

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

## Frontend Configuration (Local)

The UI stores a minimal settings payload (model selection + voice toggles) locally. These values are **not** pushed into backend state. Instead, the frontend includes them in each `query` payload as a `config` override.

### Stored Fields

The frontend only persists these fields:

- `model_mode`
- `model_provider`
- `selected_model_id`
- `voice_mode_enabled`
- `speech_mode_enabled`

### Storage Locations

- **localStorage**: key `desktop-assistant-config`
- **Disk**: `frontend-config.json` in Electron’s `app.getPath('userData')`

See:
- `frontend/src/renderer/utils/configStorage.js`
- `frontend/src/renderer/utils/configFilter.js`
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
- WebSocket messages **include** an optional `config` field in `query` payloads. This is the intended override path and applies **per query** only.
