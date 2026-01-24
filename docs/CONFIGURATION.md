# Configuration Guide

## Overview

Desktop Assistant uses a YAML configuration file for application settings. The configuration is stored per-user and can be updated at runtime.

## Configuration System

Desktop Assistant uses a Python-based configuration system (`backend/src/core/config/app_config.py`) that is loaded at startup. Configuration is stored in code, not YAML files.

### Configuration File Location

Configuration is stored in Python code:
- **Location**: `backend/src/core/config/app_config.py`
- **Variable**: `APP_CONFIG` (AppConfig instance)
- **Note**: Changes require application restart to take effect

### Configuration Loading

**ConfigManager** (`core/config/manager.py`):
- Loads configuration from Python module
- Handles API key loading from environment variables
- Provides default TTS model path
- Thread-safe configuration access

**ConfigurationService** (`core/config/service.py`):
- Wraps ConfigManager with change notifications
- Manages configuration subscribers
- Publishes ConfigChanged events
- Provides type-safe access

**Default Configuration** (`core/config/app_config.py`):
- Default values for all settings
- Provider configurations
- Security limits
- OCR configuration

## Configuration Structure

### Root Configuration

Configuration is defined in Python (`backend/src/core/config/app_config.py`):

```python
APP_CONFIG = AppConfig(
    # LLM Configuration
    model_provider="openai",  # openai, anthropic, gemini, ollama, openrouter, mistral, lm_studio
    model_mode="online",  # online or local
    selected_model_id="gpt-4o",
    llm_timeout=300,  # seconds
    query_timeout=600,  # seconds
    debug_litellm=False,
    
    # Provider Configurations
    llm_providers=LLMProviders(),
    
    # Memory System Settings
    memory_enabled=True,
    embedding_model="all-MiniLM-L6-v2",
    
    # Agent Execution Settings
    max_history_length=1000,
    max_agent_iterations=1000,
    
    # Vision Model Settings
    vision_model_name="OpenGVLab/InternVL3_5-2B",
    
    # Voice Mode Settings
    voice_mode_enabled=False,
    
    # Wakeword Settings
    wakeword_enabled=True,
    wakeword_phrase="hey jarvis",
    wakeword_greetings=[...],
    
    # TTS Settings
    tts_enabled=True,
    tts_model_path=None,  # Auto-set to default if None
    speech_mode_enabled=False,
    
    # Security Limits
    security_limits=SecurityLimits(),
    
    # OCR Configuration
    ocr_config=OCRConfig(),
    
    # WebSocket Settings
    websocket_max_message_size=10 * 1024 * 1024,  # 10MB
    websocket_max_concurrent_tasks=50,
    websocket_receive_timeout=3600.0,  # 1 hour
    websocket_task_cancellation_timeout=5.0,
)

# Provider-specific configurations
providers:
  openai:
    api_key: "your-api-key"
    base_url: null
    timeout: 60
  
  anthropic:
    api_key: "your-api-key"
    timeout: 60
  
  google:
    api_key: "your-api-key"
    timeout: 60
  
  ollama:
    base_url: "http://localhost:11434"
    timeout: 60
  
  openrouter:
    api_key: "your-api-key"
    base_url: "https://openrouter.ai/api/v1"
    timeout: 60
  
  mistral:
    api_key: "your-api-key"
    timeout: 60
  
  lm_studio:
    base_url: "http://localhost:1234"
    timeout: 60

# Memory Configuration
memory:
  enabled: true
  storage_type: "sqlite"  # sqlite, faiss, hybrid
  max_history_length: 1000
  embedding_model: "sentence-transformers/all-MiniLM-L6-v2"
  similarity_threshold: 0.7
  cleanup_interval_hours: 24
  max_memory_items: 50000

# Embeddings Configuration
embeddings:
  model_name: "sentence-transformers/all-MiniLM-L6-v2"
  device: "cuda"  # cuda or cpu
  cache_size: 1000
  batch_size: 32

# OCR Configuration
ocr:
  enabled: true
  provider: "rapidocr"  # rapidocr
  device: "cuda"  # cuda or cpu
  confidence_threshold: 0.5

# Vision Configuration
vision:
  enabled: true
  provider: "internvl"  # internvl
  device: "cuda"  # cuda or cpu
  model_name: "OpenGVLab/internvl2_1-6b"

# Tool Configuration
tools:
  timeout: 30  # seconds
  max_concurrent: 5
  enable_sandboxing: true
  resource_limits:
    cpu_percent: 50
    memory_mb: 512
    max_execution_time: 30

# Voice Configuration
voice:
  wakeword_enabled: true
  voice_mode_enabled: false
  speech_mode_enabled: false
  wakeword_model: "hey_jarvis"
  wakeword_threshold: 0.5

# UI Configuration (Frontend-managed)
ui:
  theme: "light"  # light or dark
  window_width: 1000
  window_height: 700

# Performance Configuration
performance:
  enable_caching: true
  cache_ttl: 3600  # seconds
  enable_gpu: true
  thread_pool_size: 10

# Security Configuration
security:
  enable_audit_logging: true
  max_message_size: 10485760  # 10MB
  rate_limit_enabled: true
  max_concurrent_tasks: 50
```

## Configuration Sections

### LLM Configuration

**model_provider**: LLM provider to use
- Options: `openai`, `anthropic`, `google`, `ollama`, `openrouter`, `mistral`, `lm_studio`
- Default: `openai`

**model_mode**: Model execution mode
- Options: `online` (cloud), `local` (local model)
- Default: `online`

**selected_model_id**: Selected model ID
- Examples: `gpt-4o`, `claude-3-opus`, `gemini-2.5-flash`
- Default: `gpt-4o`

### Provider Configuration

Each provider has specific configuration options:

**OpenAI**:
- `api_key`: OpenAI API key (required)
- `base_url`: Custom base URL (optional)
- `timeout`: Request timeout in seconds

**Anthropic**:
- `api_key`: Anthropic API key (required)
- `timeout`: Request timeout in seconds

**Google**:
- `api_key`: Google API key (required)
- `timeout`: Request timeout in seconds

**Ollama**:
- `base_url`: Ollama server URL (default: `http://localhost:11434`)
- `timeout`: Request timeout in seconds

**OpenRouter**:
- `api_key`: OpenRouter API key (required)
- `base_url`: OpenRouter API URL (default: `https://openrouter.ai/api/v1`)
- `timeout`: Request timeout in seconds

**Mistral**:
- `api_key`: Mistral API key (required)
- `timeout`: Request timeout in seconds

**LM Studio**:
- `base_url`: LM Studio server URL (default: `http://localhost:1234`)
- `timeout`: Request timeout in seconds

### Memory Configuration

**enabled**: Enable/disable memory system
- Default: `true`

**storage_type**: Storage backend type
- Options: `sqlite`, `faiss`, `hybrid`
- Default: `sqlite`

**max_history_length**: Maximum conversation history length
- Default: `1000`

**embedding_model**: Embedding model name
- Default: `sentence-transformers/all-MiniLM-L6-v2`

**similarity_threshold**: Minimum similarity score for retrieval
- Range: `0.0` to `1.0`
- Default: `0.7`

**cleanup_interval_hours**: Automatic cleanup interval
- Default: `24` hours

**max_memory_items**: Maximum memory items
- Default: `50000`

### Embeddings Configuration

**model_name**: Embedding model name
- Default: `sentence-transformers/all-MiniLM-L6-v2`

**device**: Device for embeddings
- Options: `cuda`, `cpu`
- Default: `cuda` (if available)

**cache_size**: Embedding cache size
- Default: `1000`

**batch_size**: Batch size for encoding
- Default: `32`

### OCR Configuration

**OCRConfig** (`ocr_config`):
- **Batch Size Thresholds**: GPU memory-based batch sizes
  - Format: `[min_gpu_memory_gb, rec_batch_num, cls_batch_num]`
  - Default: `[[15.5, 24, 10], [12.0, 10, 6], [8.0, 8, 6], [0.0, 6, 4]]`
- **Global OCR Settings**:
  - `use_detection`: Enable text detection (default: `True`)
  - `use_classification`: Enable text classification (default: `False` - disabled for screenshots)
  - `use_recognition`: Enable text recognition (default: `True`)
  - `text_score_threshold`: Text score threshold (default: `0.5`)
  - `max_side_len`: Max side length (default: `2000`)
  - `min_side_len`: Min side length (default: `30`)
- **Detection Settings**:
  - `det_limit_side_len`: Detection limit side length (default: `736`)
  - `det_limit_type`: Detection limit type (default: `"min"`)
  - `det_thresh`: Detection threshold (default: `0.3`)
  - `det_box_thresh`: Detection box threshold (default: `0.5`)
  - `det_max_candidates`: Max detection candidates (default: `1000`)
  - `det_unclip_ratio`: Detection unclip ratio (default: `1.6`)
  - `det_score_mode`: Detection score mode (default: `"default"`)
- **Classification Settings**:
  - `cls_thresh`: Classification threshold (default: `0.9`)
- **Thread Optimization**:
  - `use_cpu_cores_for_threads`: Use CPU cores for thread optimization (default: `True`)
  - `inter_op_threads_max`: Max inter-op threads (default: `4`)
  - `inter_op_threads_min`: Min inter-op threads (default: `2`)

### Vision Configuration

**vision_model_name**: Vision model name
- Default: `"OpenGVLab/InternVL3_5-2B"`
- Options: `"OpenGVLab/InternVL3_5-4B"`, `"OpenGVLab/InternVL2_5-8B"`, etc.
- If `None`, defaults to `"OpenGVLab/InternVL3_5-4B"`

### Tool Configuration

**timeout**: Tool execution timeout in seconds
- Default: `30`

**max_concurrent**: Maximum concurrent tool executions
- Default: `5`

**enable_sandboxing**: Enable tool sandboxing
- Default: `true`

**resource_limits**:
- `cpu_percent`: Maximum CPU usage (0-100)
- `memory_mb`: Maximum memory in MB
- `max_execution_time`: Maximum execution time in seconds

### Voice Configuration

**voice_mode_enabled**: Enable voice input mode
- Default: `False`

**wakeword_enabled**: Enable wakeword detection
- Default: `True`

**wakeword_phrase**: Wakeword phrase
- Default: `"hey jarvis"`

**wakeword_greetings**: List of greeting messages
- Default: `["Hello! I'm listening.", "Hi there! How can I help you?", ...]`

**tts_enabled**: Enable text-to-speech (hardcoded to `True`, not configurable)
- Default: `True`

**tts_model_path**: TTS model path (auto-set to default if `None`)
- Default: Platform-specific default path (see `get_default_tts_model_path()`)

**speech_mode_enabled**: Enable text-to-speech output during interactions
- Default: `False`

### Performance Configuration

**enable_caching**: Enable caching
- Default: `true`

**cache_ttl**: Cache TTL in seconds
- Default: `3600`

**enable_gpu**: Enable GPU acceleration
- Default: `true`

**thread_pool_size**: Thread pool size
- Default: `10`

### Security Configuration

**SecurityLimits** (`security_limits`):
- **Parser Limits**:
  - `max_response_size`: Max LLM response size (default: 10MB)
  - `max_json_size`: Max JSON object size (default: 1MB)
  - `max_json_nesting_depth`: Max JSON nesting depth (default: 100)
  - `max_tool_name_length`: Max tool name length (default: 256)
  - `max_parameter_count`: Max parameters per tool call (default: 100)
  - `max_parameter_value_size`: Max parameter value size (default: 64KB)
  - `max_tool_calls_per_response`: Max tool calls per response (default: 50)
- **Parser Timeouts**:
  - `parse_timeout_seconds`: Parser timeout (default: 5.0 seconds)
  - `json_load_timeout_seconds`: JSON load timeout (default: 2.0 seconds)
- **Prompt Constructor Limits**:
  - `max_message_history_size`: Max messages in history (default: 1000)
  - `max_message_content_size`: Max message content size (default: 1MB)
  - `max_prompt_size`: Max total prompt size (default: 50MB)

**WebSocket Settings**:
- `websocket_max_message_size`: Maximum message size (default: 10MB)
- `websocket_max_concurrent_tasks`: Maximum concurrent tasks per connection (default: 50)
- `websocket_receive_timeout`: Receive timeout (default: 3600.0 seconds / 1 hour)
- `websocket_task_cancellation_timeout`: Task cancellation timeout (default: 5.0 seconds)

## Frontend-Managed Configuration

The frontend manages these configuration fields (stored per-user):

- `model_mode`: Model execution mode
- `model_provider`: LLM provider
- `selected_model_id`: Selected model ID
- `voice_mode_enabled`: Voice input mode
- `speech_mode_enabled`: Text-to-speech output

These fields can be updated via the Settings Panel in the UI.

## Environment Variables

Some configuration can be overridden via environment variables:

**API Keys**:
- `OPENAI_API_KEY`: OpenAI API key
- `ANTHROPIC_API_KEY`: Anthropic API key
- `GOOGLE_API_KEY`: Google API key
- `OPENROUTER_API_KEY`: OpenRouter API key
- `MISTRAL_API_KEY`: Mistral API key

**Other**:
- `DESKTOP_ASSISTANT_CONFIG_PATH`: Custom config file path
- `DESKTOP_ASSISTANT_LOG_LEVEL`: Logging level (DEBUG, INFO, WARNING, ERROR)

## Configuration Updates

### Runtime Updates

Configuration can be updated at runtime:

1. **Via UI**: Settings Panel updates frontend-managed fields
2. **Via API**: `update-settings` message updates configuration
3. **Via Code**: Edit `backend/src/core/config/app_config.py` (requires restart)

### Configuration Validation

Configuration is validated on load:

- **Pydantic Validation**: All values validated via Pydantic models
- **Type Checking**: All values type-checked
- **Range Validation**: Numeric ranges validated
- **Required Fields**: Required fields checked
- **Immutable Config**: AppConfig is frozen (immutable) to prevent accidental mutation

### Configuration Subscriptions

Components can subscribe to configuration changes:

```python
from backend.src.core.config.service import ConfigurationService

# Subscribe to config changes
config_service.subscribe(subscriber)  # Protocol-based
config_service.subscribe_callback(callback)  # Function-based

# ConfigChanged events published to EventBus
```

**ConfigSubscriber Protocol**:
- `on_config_changed(old_config, new_config)`: Called when config changes

## Configuration Examples

### Minimal Configuration

```yaml
model_provider: "openai"
selected_model_id: "gpt-4o"
providers:
  openai:
    api_key: "your-api-key"
```

### Full Configuration

See the complete configuration structure above.

### Local Model Configuration

```yaml
model_provider: "ollama"
model_mode: "local"
selected_model_id: "llama-2-7b"
providers:
  ollama:
    base_url: "http://localhost:11434"
```

### GPU-Accelerated Configuration

```yaml
embeddings:
  device: "cuda"
ocr:
  device: "cuda"
vision:
  device: "cuda"
performance:
  enable_gpu: true
```

## Troubleshooting

### Configuration Not Loading

1. Check config file location
2. Verify file permissions
3. Check YAML syntax
4. Review error logs

### Configuration Not Saving

1. Check file permissions
2. Verify disk space
3. Check error logs
4. Try manual file edit

### Invalid Configuration Values

1. Check configuration schema
2. Verify value types
3. Check range constraints
4. Review validation errors

---

For more detailed information, see:
- [Installation Guide](INSTALLATION.md)
- [Developer Guide](DEVELOPER_GUIDE.md)
- [Troubleshooting](TROUBLESHOOTING.md)
