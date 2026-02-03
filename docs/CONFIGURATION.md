# Configuration Guide

## Overview

Desktop Assistant does **not** use a YAML config file. Configuration is split between:

- **Backend config**: Python `AppConfig` in `backend/src/core/config/app_config.py`.
- **Frontend config**: A small JSON blob stored in Electron’s user data folder and mirrored in `localStorage`.

Backend config is loaded **at startup** and is immutable during runtime. Frontend config is updated from the UI and persisted locally.

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

## Frontend Configuration (Local)

The UI stores a minimal settings payload (model selection + voice toggles) locally.

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

- The backend does **not** currently persist user config changes at runtime.
- WebSocket messages **include** an optional `config` field in `query` payloads, allowing the frontend to pass model selection for each request.
