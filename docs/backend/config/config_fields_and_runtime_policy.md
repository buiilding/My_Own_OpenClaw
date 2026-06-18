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
| `model_provider` | `str` | `"openai"` | Normalized (`-` -> `_`) for config lookup. Kimi uses `kimi_coding` / `kimi-coding`; other Kimi spellings are unavailable provider keys. |
| `selected_model_id` | `str` | `"gpt-5.4@@gpt-5-4-none-thinking"` | Combined with provider into `llm_model` property when online mode. |
| `llm_timeout` | `int` | `300` | Provider completion timeout. |
| `query_timeout` | `int` | `600` | Query-level timeout budget. |
| `debug_litellm` | `bool` | `false` | Enables LiteLLM debug logging path. |
| `llm_providers` | `LLMProviders` | object | Per-provider model, base URL, and API key env metadata. |

Provider defaults in `LLMProviders`:

- `openai.model`: `gpt-5.4`, key env `OPENAI_API_KEY`
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
| `embedding_backend` | `"local" \| "remote-http" \| "vendor" \| "disabled"` | `"vendor"` | Selects the embedding provider backend. `vendor` uses OpenAI through `embedding_api_key_env`; `local` uses the in-process SentenceTransformer provider; `remote-http` calls an embedding service. |
| `embedding_model` | `str` | `text-embedding-3-small` | Used by embedding provider wiring. |
| `ocr_backend` | `"local" \| "remote-http" \| "vendor"` | `"local"` | Selects the OCR provider backend; only `local` is implemented in-process today. |
| `ocr_model` | `str` | `rapidocr-ppocrv5-server` | OCR model identifier surfaced through provider metadata and future remote routing. |
| `interaction_mode` | `"chat" \| "agent"` | `"agent"` | Controls tool allowlist behavior (`get_tool_allowlist`). |
| `vision_backend` | `"local" \| "remote-http" \| "vendor"` | `"local"` | Selects the vision provider backend; only `local` is implemented in-process today. |
| `vision_model_name` | `str \| None` | `OpenGVLab/InternVL3_5-4B` | Vision grounding model selection. |

`interaction_mode` policy:

- `chat`: allowlist is `{"read_file", "replace", "run_shell_command", "open_app", "process", "screenshot"}`.
- `agent`: no allowlist (`None`) so full policy surface is available.

### Conversation History Compaction

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `history_compaction_enabled` | `bool` | `true` | Enables auto compaction gates in pre-query and mid-loop execution paths. |
| `history_compaction_manual_enabled` | `bool` | `true` | Enables manual `compact-history` WebSocket command. |
| `history_compaction_trigger_tokens` | `int \| null` | `null` | Exact threshold to trigger compaction. `null` uses 90% of the active model max input context. |
| `history_compaction_target_tokens` | `int` | `60000` | Post-compaction retained-tail budget. It does not cap the auto-trigger threshold. |
| `history_compaction_keep_recent_user_messages` | `int` | `6` | Keeps tail history anchored on the most recent N user messages. |
| `history_compaction_summary_max_tokens` | `int` | `1200` | Max tokens for generated summary content. |
| `history_compaction_prompt` | `str \| None` | `None` | Optional custom compaction prompt override. |

Execution/event semantics for these fields (decision skip reasons, trigger fallback order, and auto-pre/auto-mid/manual lifecycle emissions) are documented in [History Compaction Engine Decision, Strategy, and Event Contract Reference](../agent/history_compaction_engine_decision_strategy_and_event_contract_reference.md).

### Voice, Wakeword, and TTS

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `wakeword_stt_enabled` | `bool` | `false` | Enables post-wakeword speech-to-text handoff in renderer query entry flow. |
| `stt_provider` | `"nova" \| "openai"` | `"openai"` | Backend-owned transcription provider behind the local `/ws/transcription` route. |
| `stt_language` | `str` | `"en"` | Default transcription language hint applied by backend-owned STT sessions. |
| `nova_voice_gateway_url` | `str` | `"ws://127.0.0.1:5026"` | External Nova-Voice gateway URL used when `stt_provider="nova"`. |
| `openai_realtime_transcription_model` | `str` | `"gpt-4o-transcribe"` | Default OpenAI realtime transcription model used when `stt_provider="openai"`. |
| `stt_vad_threshold` | `float` | `0.5` | Backend-owned server-VAD activation threshold for realtime transcription sessions. |
| `stt_vad_prefix_padding_ms` | `int` | `300` | Backend-owned VAD prefix padding for realtime transcription sessions. |
| `stt_vad_silence_duration_ms` | `int` | `500` | Backend-owned silence duration for end-of-turn detection in realtime transcription sessions. |
| `browser_automation_enabled` | `bool` | `false` | Frontend browser automation UI/permission toggle; model-visible browser tool exposure follows the accepted tool manifest and tool policy. |
| `include_query_screenshot` | `bool` | `true` | Controls screenshot attachment behavior for queries. |
| `wakeword_enabled` | `bool` | `true` | Wakeword runtime toggle. |
| `wakeword_phrase` | `str` | `"hey jarvis"` | Trigger phrase. |
| `wakeword_greetings` | `list[str]` | predefined list | Greeting variants. |
| `tts_enabled` | `bool` | `true` | Runtime policy forcibly keeps this true by default. |
| `speech_provider` | `"local" \| "elevenlabs"` | `"elevenlabs"` | Backend-owned default speech backend selection for query and wakeword TTS. |
| `tts_model_path` | `str \| None` | `None` | Filled at runtime if missing. |
| `speech_mode_enabled` | `bool` | `false` | User speech output mode control. |
| `elevenlabs_api_key_env` | `str` | `"ELEVENLABS_API_KEY"` | Environment variable name used for ElevenLabs auth. `AppConfig` stores the env-var name only, not the secret value. |
| `elevenlabs_voice_id` | `str` | `"EXAVITQu4vr4xnSDxMaL"` | Default ElevenLabs voice id. |
| `elevenlabs_model_id` | `str` | `"eleven_flash_v2_5"` | Default ElevenLabs realtime model. |
| `elevenlabs_output_format` | `str` | `"pcm_16000"` | Output format used by the ElevenLabs websocket provider. |
| `elevenlabs_auto_mode` | `bool` | `false` | Optional ElevenLabs websocket `auto_mode`; WindieOS leaves this off by default because its live LLM/TTS path sends small incremental chunks and relies on manual generation triggers instead. |
| `elevenlabs_inactivity_timeout` | `int` | `60` | ElevenLabs websocket inactivity timeout in seconds for live query/wakeword speech sessions. |
| `elevenlabs_chunk_length_schedule` | `list[int]` | `[50, 80, 120, 160]` | Manual generation schedule retained for fallback when `elevenlabs_auto_mode` is disabled. |

### Security/WebSocket/Artifacts

| Field | Type | Default | Notes |
| --- | --- | --- | --- |
| `security_limits` | `SecurityLimits` | object | Parser and trust-boundary limits (`max_response_size`, `max_json_size`, nesting depth, timeout caps, etc.). |
| `websocket_max_message_size` | `int` | `10MB` | Guardrail against oversized frame payloads. |
| `websocket_max_concurrent_tasks` | `int` | `50` | Per-connection task cap in `TaskManager`. |
| `websocket_receive_timeout` | `float` | `3600.0` | Slowloris protection timeout for receive loop. |
| `websocket_task_cancellation_timeout` | `float` | `5.0` | Cleanup timeout on disconnect. |
| `artifact_store_path` | `str` | user config path | Default `<APPDATA>/windieos/artifacts` (Windows), `~/Library/Application Support/windieos/artifacts` (macOS), `~/.config/windieos/artifacts` (Linux). |
| `artifact_max_bytes` | `int` | `25MB` | Max upload payload accepted by artifact route. |

Artifact compatibility behavior:
- lookup uses only the configured `artifact_store_path`.

Runtime-only field:

- `api_key`: populated post-load from provider env vars; not persisted in config file.

Speech-provider auth rule:

- `speech_provider` and ElevenLabs runtime defaults are part of backend config policy.
- the ElevenLabs API key itself is not stored in `app_config.py` or `AppConfig`
- runtime auth is resolved from the environment variable named by `elevenlabs_api_key_env` (default `ELEVENLABS_API_KEY`)

## Runtime Normalization Policies

`assemble_runtime_config()` applies two policy layers.

### Policy 1: runtime config normalization

From `apply_runtime_policies(...)`:

- Forces `tts_enabled=True` when `force_tts_enabled=True` (default path).
- If TTS is enabled and `tts_model_path` is empty, fills a platform-specific default path.

Default TTS model path:

- Windows: `%APPDATA%/windieos/tts_models/piper/en_GB-jenny_dioco-medium.onnx`
- macOS: `~/Library/Application Support/windieos/tts_models/piper/en_GB-jenny_dioco-medium.onnx`
- Linux: `~/.config/windieos/tts_models/piper/en_GB-jenny_dioco-medium.onnx`

### Policy 2: provider API key resolution

From `load_api_key_for_provider(...)`:

- In `model_mode="local"`, backend sets `api_key=None`.
- For online mode, provider config drives env var lookup.
- Frontend-managed provider API-key overrides are resolved before environment variables when enabled and non-empty.
- Kimi Coding reads the configured `KIMI_API_KEY` env var only.

## Frontend-Owned Update Scope (`update-settings`)

Validated by `FrontendConfigPatch` in `backend/src/core/validation/validators.py`.

Deep validation reference:

- [Input Validation and Frontend Patch Guard Reference](../core/validation/input_validation_and_frontend_patch_guard_reference.md)

Allowed patch keys only:

- `model_mode`
- `model_provider`
- `selected_model_id`
- `interaction_mode`
- `speech_mode_enabled`
- `wakeword_enabled`
- `wakeword_stt_enabled`
- `browser_automation_enabled`
- `include_query_screenshot`
- `provider_api_keys`

Backend-owned config remains outside this patch surface, including `speech_provider` and `stt_provider`.

Behavior:

1. Unknown keys are ignored with warning.
2. Valid keys are applied to per-user session config (`SessionManager.update_session_config`).
3. Session config is reassembled through the same runtime policy path (`assemble_runtime_config`).

## Config Mutation and Notification Paths

- Global service-level updates and reloads:
  `ConfigurationService.update_config(...)` / `ConfigurationService.reload_config(...)`.
- Session subscriber propagation: `SessionManager.on_config_changed(...)` -> `update_all_sessions_config(...)`.
- Single-session frontend updates: `UpdateSettingsHandler` -> `SessionManager.update_session_config(...)`.

Threading/locking guarantees:

- `ConfigManager` uses `threading.RLock` for load/get/update/reload.
- `ConfigurationService` uses async single-writer lock (`_update_lock`) + thread lock for state.
- `SessionManager` uses per-user `asyncio.Lock` for create/update/end serialization.
