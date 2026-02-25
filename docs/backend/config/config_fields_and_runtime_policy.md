---
summary: "Canonical backend config reference: AppConfig fields, env var resolution, runtime policy normalization, and frontend-owned patch boundaries."
read_when:
  - When adding/changing backend config fields or defaults.
  - When debugging provider API key resolution, TTS path behavior, or update-settings scope.
title: "Config Fields and Runtime Policy"
---

# Config Fields and Runtime Policy

## Source of Truth and Load Path

Core files:

- `backend/src/core/config/models.py`
- `backend/src/core/config/app_config.py`
- `backend/src/core/config/loader.py`
- `backend/src/core/config/runtime.py`
- `backend/src/core/config/manager.py`

Runtime path:

1. `ConfigManager.load_config()` calls `load_settings_from_file()`.
2. `app_config.APP_CONFIG` is loaded as the base immutable `AppConfig`.
3. `assemble_runtime_config()` applies runtime normalization policies.
4. Provider API key is resolved and copied into `AppConfig.api_key`.
5. Config stays immutable (`frozen=True`) and updates use `model_copy(...)`.

## AppConfig Field Reference

### LLM and Provider Selection

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `model_mode` | `"local" \| "online"` | `"online"` | Local mode skips API key loading. |
| `model_provider` | `str` | `"openai"` | Normalized (`-` -> `_`); `kimi_code` maps to `kimi_coding`. |
| `selected_model_id` | `str` | `"gpt-5.1"` | Combined with provider into `llm_model` property when online mode. |
| `llm_timeout` | `int` | `300` | Provider completion timeout. |
| `query_timeout` | `int` | `600` | Query-level timeout budget. |
| `debug_litellm` | `bool` | `false` | Enables LiteLLM debug logging path. |
| `llm_providers` | `LLMProviders` | object | Per-provider model, base URL, and API key env metadata. |

Provider defaults in `LLMProviders`:

- `openai.model`: `gpt-5.1`, key env `OPENAI_API_KEY`
- `anthropic.model`: `claude-sonnet-4-5-20250929`, key env `ANTHROPIC_API_KEY`
- `gemini.model`: `gemini-2.5-flash`, key env `GOOGLE_API_KEY`
- `openrouter.model`: `openrouter/auto`, key env `OPENROUTER_API_KEY`, base URL `https://openrouter.ai/api/v1`
- `mistral.model`: `mistral-large-latest`, key env `MISTRAL_API_KEY`
- `ollama.model`: `llama3`, base URL `http://localhost:11434/v1`
- `lmstudio.base_url`: `http://localhost:1234/v1`
- `kimi_coding.model`: `k2p5`, key env `KIMI_API_KEY`, base URL `https://api.kimi.com/coding`

### Memory, Agent, and Tooling

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `memory_enabled` | `bool` | `true` | Frontend-side memory services still consume backend config context. |
| `embedding_model` | `str` | `all-MiniLM-L6-v2` | Used by embedding provider wiring. |
| `max_history_length` | `int` | `1000` | Conversation history cap in session history manager. |
| `max_agent_iterations` | `int` | `1000` | Loop upper bound for tool/LLM iterations. |
| `interaction_mode` | `"chat" \| "agent"` | `"chat"` | Controls tool allowlist behavior (`get_tool_allowlist`). |
| `vision_model_name` | `str \| None` | `OpenGVLab/InternVL3_5-4B` | Vision grounding model selection. |

`interaction_mode` policy:

- `chat`: allowlist is `{"read_file", "replace", "run_shell_command", "process", "screenshot"}`.
- `agent`: no allowlist (`None`) so full policy surface is available.

### Voice, Wakeword, and TTS

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `voice_mode_enabled` | `bool` | `false` | Frontend runtime voice mode toggle. |
| `wakeword_stt_enabled` | `bool` | `false` | Enables post-wakeword speech-to-text handoff in frontend query entry flow. |
| `include_query_screenshot` | `bool` | `true` | Controls screenshot attachment behavior for queries. |
| `wakeword_enabled` | `bool` | `true` | Wakeword runtime toggle. |
| `wakeword_phrase` | `str` | `"hey jarvis"` | Trigger phrase. |
| `wakeword_greetings` | `list[str]` | predefined list | Greeting variants. |
| `tts_enabled` | `bool` | `true` | Runtime policy forcibly keeps this true by default. |
| `tts_model_path` | `str \| None` | `None` | Filled at runtime if missing. |
| `speech_mode_enabled` | `bool` | `false` | User speech output mode control. |

### Security/OCR/WebSocket/Artifacts

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `security_limits` | `SecurityLimits` | object | Parser and trust-boundary limits (`max_response_size`, `max_json_size`, nesting depth, timeout caps, etc.). |
| `ocr_config` | `OCRConfig` | object | OCR thresholds, detection settings, batch profiles, thread policy. |
| `websocket_max_message_size` | `int` | `10MB` | Guardrail against oversized frame payloads. |
| `websocket_max_concurrent_tasks` | `int` | `50` | Per-connection task cap in `TaskManager`. |
| `websocket_receive_timeout` | `float` | `3600.0` | Slowloris protection timeout for receive loop. |
| `websocket_task_cancellation_timeout` | `float` | `5.0` | Cleanup timeout on disconnect. |
| `artifact_store_path` | `str` | tempdir path | Default `<temp>/windieos-artifacts`. |
| `artifact_max_bytes` | `int` | `25MB` | Max upload payload accepted by artifact route. |

Runtime-only field:

- `api_key`: populated post-load from provider env vars; not persisted in config file.

## Runtime Normalization Policies

`assemble_runtime_config()` applies two policy layers.

### Policy 1: runtime config normalization

From `apply_runtime_policies(...)`:

- Forces `tts_enabled=True` when `force_tts_enabled=True` (default path).
- If TTS is enabled and `tts_model_path` is empty, fills a platform-specific default path.

Default TTS model path:

- Windows: `%APPDATA%/DesktopAssistant/tts_models/piper/en_GB-jenny_dioco-medium.onnx`
- macOS: `~/Library/Application Support/DesktopAssistant/tts_models/piper/en_GB-jenny_dioco-medium.onnx`
- Linux: `~/.config/DesktopAssistant/tts_models/piper/en_GB-jenny_dioco-medium.onnx`

### Policy 2: provider API key resolution

From `load_api_key_for_provider(...)`:

- In `model_mode="local"`, backend sets `api_key=None`.
- For online mode, provider config drives env var lookup.
- Kimi compatibility fallback: if `KIMI_API_KEY` missing, checks `KIMICODE_API_KEY`.

## Frontend-Owned Update Scope (`update-settings`)

Validated by `FrontendConfigPatch` in `backend/src/core/validation/validators.py`.

Deep validation reference:

- [Input Validation and Frontend Patch Guard Reference](../core/validation/input_validation_and_frontend_patch_guard_reference.md)

Allowed patch keys only:

- `model_mode`
- `model_provider`
- `selected_model_id`
- `interaction_mode`
- `voice_mode_enabled`
- `speech_mode_enabled`
- `wakeword_stt_enabled`
- `include_query_screenshot`

Behavior:

1. Unknown keys are ignored with warning.
2. Valid keys are applied to per-user session config (`SessionManager.update_session_config`).
3. Session config is reassembled through the same runtime policy path (`assemble_runtime_config`).

## Config Mutation and Notification Paths

- Global service-level updates: `ConfigurationService.update_config(...)`.
- Session subscriber propagation: `SessionManager.on_config_changed(...)` -> `update_all_sessions_config(...)`.
- Single-session frontend updates: `UpdateSettingsHandler` -> `SessionManager.update_session_config(...)`.

Threading/locking guarantees:

- `ConfigManager` uses `threading.RLock` for load/get/update/reload.
- `ConfigurationService` uses async single-writer lock (`_update_lock`) + thread lock for state.
- `SessionManager` uses per-user `asyncio.Lock` for create/update/end serialization.
