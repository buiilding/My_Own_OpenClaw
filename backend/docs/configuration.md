# Configuration Management

## Overview

The backend uses a hybrid configuration system:
- **Global Configuration**: Shared settings for all users (LLM providers, timeouts, memory settings, etc.)
- **Per-User Configuration**: User-specific settings for frontend-managed fields (model selection, voice mode, etc.)

This system provides type-safe models, change notifications, and multi-provider support while allowing each user to have their own preferences for frequently-changed settings.

## Configuration Structure

**Location**: `backend/src/core/config/models.py`

### AppConfig

Main configuration model with all application settings:

```python
class AppConfig(BaseModel):
    llm: LLMProviders
    memory: MemoryConfig
    tools: ToolConfig
    tts: TTSConfig
    # ... more settings
```

**Hardcoded Settings**: Some settings are hardcoded in the `AppConfig` class and cannot be changed via config files:
- `tts_enabled`: Always `True` (only changeable by modifying the default value in code)

### LLM Configuration

```python
class LLMProviders(BaseModel):
    openai: Optional[OpenAIConfig] = None
    anthropic: Optional[AnthropicConfig] = None
    google: Optional[GeminiConfig] = None
    # ... more providers
```

## Configuration Loading

**Location**: `backend/src/core/config/manager.py`

### ConfigManager

- **File Loading**: Loads from YAML/JSON file
- **Environment Variables**: Supports env var overrides
- **API Key Loading**: Secure API key management
- **Validation**: Pydantic validation

### Configuration File Locations

#### Global Configuration

- **Windows**: `%APPDATA%\DesktopAssistant\config.yaml`
- **macOS**: `~/Library/Application Support/DesktopAssistant/config.yaml`
- **Linux**: `~/.config/DesktopAssistant/config.yaml`

#### Per-User Configuration

- **Windows**: `%APPDATA%\DesktopAssistant\users\{user_id}\config.yaml`
- **macOS**: `~/Library/Application Support/DesktopAssistant/users/{user_id}/config.yaml`
- **Linux**: `~/.config/DesktopAssistant/users/{user_id}/config.yaml`

Where `{user_id}` is the user identifier from the WebSocket handshake.

## Configuration Service

**Location**: `backend/src/core/config_service.py`

### Features

- **Change Notifications**: Subscribers notified on config changes
- **Type-Safe Access**: Type-safe configuration access
- **Plugin Config**: Plugin configuration management
- **Event Publishing**: Config change events via event bus

### Usage

```python
from backend.src.core.config_service import get_config_service

config_service = get_config_service()
config = config_service.get_config()

# Subscribe to changes
config_service.subscribe(my_subscriber)
```

## Configuration Types

### Global Configuration

Global configuration contains settings shared by all users:
- LLM provider configurations (API keys, base URLs)
- Timeouts (`llm_timeout`, `query_timeout`)
- Memory settings (`memory_enabled`, `embedding_model`, `max_history_length`)
- Agent settings (`max_agent_iterations`)
- Vision model settings
- Wakeword settings
- TTS model paths (`tts_model_path`)
- All other non-user-specific settings

**Note**: `tts_enabled` is **always `True`** (hardcoded in code, not configurable via config file). Only `speech_mode_enabled` controls whether TTS audio is actually generated and sent.

**Storage**: Single `config.yaml` file in the main config directory.

### Per-User Configuration

Per-user configuration contains only the 5 frontend-managed fields:
- `model_mode`: "local" or "online"
- `model_provider`: Provider name (e.g., "openai", "gemini")
- `selected_model_id`: Selected model ID (e.g., "gpt-4o", "gemini-2.5-flash")
- `voice_mode_enabled`: Boolean for voice input mode
- `speech_mode_enabled`: Boolean for text-to-speech output

**Storage**: Per-user `config.yaml` files in `users/{user_id}/` subdirectory.

**Why Per-User?**: These fields are frequently changed via the frontend UI and users may have different preferences. All other settings remain global.

## Configuration Loading

### Load Flow

When a user loads settings:

```
1. Load global config from main config.yaml
   ↓
2. Load user-specific config from users/{user_id}/config.yaml (if exists)
   ↓
3. Merge: Global config + User config (user overrides global)
   ↓
4. Return merged config to frontend
```

### User Config Manager

**Location**: `backend/src/core/config/user_config_manager.py`

The `UserConfigManager` handles:
- Loading user-specific config files
- Saving only frontend-managed fields
- Merging user config with global config
- Filtering to ensure only allowed fields are stored per-user

## Configuration Updates

### Runtime Updates

Configuration can be updated at runtime via WebSocket messages.

#### Global Config Updates

Global configuration updates affect all users:
1. Update via API/WebSocket
2. ConfigManager validates and saves to global config file
3. ConfigurationService notifies subscribers
4. All active sessions updated

#### Per-User Config Updates

Per-user configuration updates only affect the requesting user:
1. User updates settings via frontend
2. Frontend sends only the 5 frontend-managed fields
3. UserConfigManager saves to user-specific config file
4. Only the requesting user's session is updated
5. Other users' sessions remain unchanged

### Update Flow

#### Global Config Update
```
1. Admin/system updates global configuration
   ↓
2. ConfigManager validates and saves to config.yaml
   ↓
3. ConfigurationService notifies subscribers
   ↓
4. All active sessions updated
```

#### Per-User Config Update
```
1. User updates settings via frontend UI
   ↓
2. Frontend sends update-settings message (only 5 fields)
   ↓
3. UserConfigManager saves to users/{user_id}/config.yaml
   ↓
4. Only requesting user's session updated
   ↓
5. Other users' sessions unchanged
```

## Session Creation

When a new user session is created:

1. Load global config from `ConfigManager`
2. Load user-specific config from `UserConfigManager` (if exists)
3. Merge: Global + User config (user overrides)
4. Create session with merged config
5. Session uses user's preferred model, voice settings, etc.

This ensures each user gets their personalized configuration automatically.

## Environment Variables

### API Keys

- `OPENAI_API_KEY`: OpenAI API key
- `ANTHROPIC_API_KEY`: Anthropic API key
- `GOOGLE_API_KEY`: Google API key
- `MISTRAL_API_KEY`: Mistral API key

### Configuration Overrides

Environment variables can override config file values:
- `LLM_PROVIDER`: Override LLM provider
- `LLM_MODEL`: Override LLM model
- `MEMORY_ENABLED`: Override memory enabled flag

## Configuration Validation

### Pydantic Validation

- **Type Checking**: Automatic type validation
- **Required Fields**: Required field validation
- **Defaults**: Default value handling
- **Nested Models**: Nested configuration validation

### Validation Errors

- **Clear Messages**: Descriptive error messages
- **Field-Level**: Field-specific error reporting
- **Early Detection**: Validation at load time

## Best Practices

1. **Type Safety**: Use Pydantic models for type safety
2. **Defaults**: Provide sensible defaults
3. **Validation**: Validate at load time
4. **Secrets**: Store API keys securely
5. **Updates**: Support runtime updates

## Important Notes

1. **Hybrid System**: Global config for shared settings, per-user config for frontend-managed fields
2. **File-Based**: Primary configuration in YAML files
3. **Environment Overrides**: Environment variables can override global config
4. **API Keys**: API keys loaded from environment or secure storage (global only)
5. **Validation**: All configuration validated with Pydantic
6. **Change Notifications**: Components can subscribe to global config changes
7. **User Isolation**: Per-user config updates only affect the requesting user
8. **Frontend Fields**: Only 5 fields are stored per-user; all others remain global
9. **Hardcoded Settings**: `tts_enabled` is always `True` (hardcoded in code, not configurable via config file). Only changeable by modifying the default value in `AppConfig` class.

## Example Configuration Structure

### Global Config (`config.yaml`)
```yaml
model_mode: online
model_provider: gemini
selected_model_id: gemini-2.5-flash
llm_timeout: 300
query_timeout: 600
llm_providers:
  openai:
    model: gpt-4o
    api_key_env: OPENAI_API_KEY
  gemini:
    model: gemini-2.5-flash
    api_key_env: GOOGLE_API_KEY
memory_enabled: true
embedding_model: all-MiniLM-L6-v2
max_history_length: 1000
max_agent_iterations: 1000
vision_model_name: OpenGVLab/InternVL3_5-2B
voice_mode_enabled: false
wakeword_enabled: true
wakeword_phrase: hey jarvis
# Note: tts_enabled is always True (hardcoded, not saved to config file)
tts_model_path: /path/to/tts/model.onnx
speech_mode_enabled: false
```

**Note**: `tts_enabled` is not shown in the config file because it's always `True` (hardcoded in code). The config file only contains `tts_model_path`. `speech_mode_enabled` controls whether TTS audio is actually generated.

### User Config (`users/user_123/config.yaml`)
```yaml
model_mode: local
model_provider: ollama
selected_model_id: llama3
voice_mode_enabled: true
speech_mode_enabled: true
```

**Result for user_123**: Uses local Ollama with llama3, voice mode enabled, while all other settings come from global config.
