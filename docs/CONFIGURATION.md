# Configuration Guide

## Overview

Desktop Assistant uses a YAML configuration file for application settings. The configuration is stored per-user and can be updated at runtime.

## Configuration File Location

The configuration file is automatically created on first run:

- **Windows**: `%APPDATA%\DesktopAssistant\config.yaml`
- **macOS**: `~/Library/Application Support/DesktopAssistant/config.yaml`
- **Linux**: `~/.config/DesktopAssistant/config.yaml`

## Configuration Structure

### Root Configuration

```yaml
# Application Configuration
app_name: "Desktop Assistant"
version: "1.0.0"

# LLM Configuration
model_provider: "openai"  # openai, anthropic, google, ollama, openrouter, mistral, lm_studio
model_mode: "online"  # online or local
selected_model_id: "gpt-4o"

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

**enabled**: Enable/disable OCR
- Default: `true`

**provider**: OCR provider
- Options: `rapidocr`
- Default: `rapidocr`

**device**: Device for OCR
- Options: `cuda`, `cpu`
- Default: `cuda` (if available)

**confidence_threshold**: Minimum confidence threshold
- Range: `0.0` to `1.0`
- Default: `0.5`

### Vision Configuration

**enabled**: Enable/disable vision models
- Default: `true`

**provider**: Vision provider
- Options: `internvl`
- Default: `internvl`

**device**: Device for vision models
- Options: `cuda`, `cpu`
- Default: `cuda` (if available)

**model_name**: Vision model name
- Default: `OpenGVLab/internvl2_1-6b`

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

**wakeword_enabled**: Enable wakeword detection
- Default: `true`

**voice_mode_enabled**: Enable voice input mode
- Default: `false`

**speech_mode_enabled**: Enable text-to-speech output
- Default: `false`

**wakeword_model**: Wakeword model name
- Default: `hey_jarvis`

**wakeword_threshold**: Wakeword detection threshold
- Range: `0.0` to `1.0`
- Default: `0.5`

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

**enable_audit_logging**: Enable audit logging
- Default: `true`

**max_message_size**: Maximum message size in bytes
- Default: `10485760` (10MB)

**rate_limit_enabled**: Enable rate limiting
- Default: `true`

**max_concurrent_tasks**: Maximum concurrent tasks per connection
- Default: `50`

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
3. **Via File**: Edit config file directly (requires restart)

### Configuration Validation

Configuration is validated on load:

- **Type Checking**: All values type-checked
- **Range Validation**: Numeric ranges validated
- **Required Fields**: Required fields checked
- **Schema Validation**: Schema validation applied

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
