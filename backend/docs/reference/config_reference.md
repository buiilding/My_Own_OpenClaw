# Configuration Reference

This document provides a comprehensive reference for all configuration options available in the Personal Assistant Backend. Configuration is managed through YAML files and environment variables.

## Configuration File Location

The application looks for configuration in the following locations (in order of precedence):

1. **User Config Directory**:
   - **Windows**: `%APPDATA%\DesktopAssistant\config.yaml`
   - **macOS**: `~/Library/Application Support/DesktopAssistant/config.yaml`
   - **Linux**: `~/.config/DesktopAssistant/config.yaml`

2. **Environment Variables**: Override individual settings
3. **Runtime Updates**: Settings can be changed via WebSocket API

## Configuration Structure

The configuration is defined by the `AppConfig` Pydantic model. Here's the complete structure:

```yaml
# Main Application Configuration
model_mode: "online"              # "online" or "local"
model_provider: "openai"          # LLM provider to use
selected_model_id: "gpt-4o"       # Specific model identifier
llm_timeout: 300                  # LLM API timeout (seconds)
query_timeout: 600                # Maximum query execution time (seconds)
debug_litellm: false              # Enable LiteLLM debug logging

# Shell Tool Configuration
allowed_shell_commands:           # Whitelist of allowed shell commands
  - "echo"
  - "pwd"
  - "whoami"
  - "date"
  - "ls"
  - "dir"
  - "cat"
  - "type"

# LLM Provider Configurations
llm_providers:
  openai:
    model: "gpt-4o"
    api_key_env: "OPENAI_API_KEY"
  anthropic:
    model: "claude-3-haiku-20240307"
    api_key_env: "ANTHROPIC_API_KEY"
  gemini:
    model: "gemini-2.5-flash"
    api_key_env: "GOOGLE_API_KEY"
  ollama:
    model: "llama3"
    base_url: "http://localhost:11434/v1"
  openrouter:
    model: "openrouter/auto"
    api_key_env: "OPENROUTER_API_KEY"
  mistral:
    model: "mistral-large-2411"
    api_key_env: "MISTRAL_API_KEY"
  lmstudio:
    model: ""                     # Not used, models discovered automatically
    base_url: "http://localhost:1234/v1"

# Memory System Configuration
memory_enabled: true              # Enable/disable memory system
memory_db_path: null              # Database path (null = auto-detect)
embedding_model: "all-MiniLM-L6-v2"  # Sentence transformer model
summarization_interval: 3600      # Memory summarization interval (seconds)
memory_summarization_batch_size: 10   # Batch size for summarization
memory_summarization_limit: 1000  # Max memories for summarization

# Agent Execution Configuration
max_history_length: 10            # Maximum conversation history messages
max_agent_iterations: 1000        # Maximum tool iterations per query

# Tool Execution Configuration
shell_timeout: 30.0               # Shell command timeout (seconds)
search_file_timeout: 5.0          # File search timeout (seconds)
marketplace_search_limit: 5       # Marketplace search result limit
model_registry_timeout: 2.0       # Model registry API timeout (seconds)

# Computer/Screenshot Configuration
screenshot_delay_after_action: 0.5  # Delay before screenshot (seconds)

# Voice/TTS Configuration
voice_mode_enabled: false         # Enable voice mode
tts_enabled: false                # Enable text-to-speech
tts_model_path: null              # Path to TTS model (null = auto)
tts_use_cuda: false               # Use CUDA for TTS
speech_mode_enabled: false        # Enable speech recognition
```

## Configuration Sections

### LLM Configuration

#### Model Mode
```yaml
model_mode: "online"  # or "local"
```
- **online**: Use cloud-based LLM providers (OpenAI, Anthropic, etc.)
- **local**: Use locally-hosted models (Ollama, LMStudio)

#### Model Provider
```yaml
model_provider: "openai"  # Options: openai, anthropic, gemini, ollama, openrouter, mistral, lmstudio
```
Selects which LLM provider to use as the default.

#### Model Selection
```yaml
selected_model_id: "gpt-4o"
```
Specific model identifier. Available models depend on the provider:

- **OpenAI**: `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-3.5-turbo`
- **Anthropic**: `claude-3-haiku-20240307`, `claude-sonnet-4-20250522`, `claude-sonnet-4-5-20250929`
- **Gemini**: `gemini-2.5-flash`, `gemini-1.5-pro`, `gemini-1.5-flash`
- **Ollama**: Any model pulled via `ollama pull`
- **OpenRouter**: `openrouter/auto` or specific model names
- **Mistral**: `mistral-large-2411`, `mistral-medium`, `mistral-small`
- **LMStudio**: Models loaded in LMStudio interface

#### Timeouts
```yaml
llm_timeout: 300        # LLM API call timeout (seconds)
query_timeout: 600      # Total query execution timeout (seconds)
```
- `llm_timeout`: How long to wait for individual LLM API calls
- `query_timeout`: Maximum time for complete query processing (including tool execution)

#### Debug Logging
```yaml
debug_litellm: false
```
Enables verbose logging for the LiteLLM library, useful for debugging LLM provider issues.

### Provider-Specific Configuration

Each provider has its own configuration section:

#### OpenAI
```yaml
llm_providers:
  openai:
    model: "gpt-4o"                    # Default model
    api_key_env: "OPENAI_API_KEY"      # Environment variable name
```

#### Anthropic
```yaml
llm_providers:
  anthropic:
    model: "claude-3-haiku-20240307"
    api_key_env: "ANTHROPIC_API_KEY"
```

#### Google Gemini
```yaml
llm_providers:
  gemini:
    model: "gemini-2.5-flash"
    api_key_env: "GOOGLE_API_KEY"
```

#### Ollama (Local)
```yaml
llm_providers:
  ollama:
    model: "llama3"                           # Model name in Ollama
    base_url: "http://localhost:11434/v1"     # Ollama API endpoint
```

#### OpenRouter
```yaml
llm_providers:
  openrouter:
    model: "openrouter/auto"              # Use auto-routing
    api_key_env: "OPENROUTER_API_KEY"
```

#### Mistral AI
```yaml
llm_providers:
  mistral:
    model: "mistral-large-2411"
    api_key_env: "MISTRAL_API_KEY"
```

#### LMStudio (Local)
```yaml
llm_providers:
  lmstudio:
    model: ""                             # Not used, auto-discovered
    base_url: "http://localhost:1234/v1"  # LMStudio API endpoint
```

### Memory System Configuration

#### Memory Enable/Disable
```yaml
memory_enabled: true
```
Enable or disable the conversation memory system. When disabled, conversations are not persisted.

#### Database Path
```yaml
memory_db_path: null  # or "/path/to/memory.db"
```
Path to the SQLite database file for memory storage. When `null`, defaults to `memory.db` in the config directory.

#### Embedding Model
```yaml
embedding_model: "all-MiniLM-L6-v2"
```
Sentence transformer model used for text embeddings. Available options:
- `all-MiniLM-L6-v2` (fast, good quality)
- `all-mpnet-base-v2` (slower, higher quality)
- `paraphrase-MiniLM-L3-v2` (fastest, lower quality)

#### Summarization Settings
```yaml
summarization_interval: 3600           # Run every hour
memory_summarization_batch_size: 10    # Process 10 interactions per batch
memory_summarization_limit: 1000       # Max memories to consider
```
Controls automatic memory summarization to prevent unbounded growth:
- `summarization_interval`: How often to run summarization (seconds)
- `memory_summarization_batch_size`: Number of conversation turns to summarize at once
- `memory_summarization_limit`: Maximum memories to fetch for summarization

### Agent Execution Configuration

#### History Length
```yaml
max_history_length: 10
```
Maximum number of conversation messages to keep in context. Longer histories provide more context but use more tokens.

#### Iteration Limit
```yaml
max_agent_iterations: 1000
```
Maximum number of tool execution iterations allowed per query. High limit effectively removes the constraint.

### Tool Execution Configuration

#### Shell Commands
```yaml
allowed_shell_commands:
  - "echo"
  - "pwd"
  - "whoami"
  - "date"
  - "ls"
  - "dir"
  - "cat"
  - "type"
```
Whitelist of shell commands that can be executed by the shell tool. Only commands in this list are allowed.

#### Timeouts
```yaml
shell_timeout: 30.0              # Shell command timeout (seconds)
search_file_timeout: 5.0         # File search timeout (seconds)
model_registry_timeout: 2.0      # Model registry API timeout (seconds)
```
Timeouts for various tool operations to prevent hanging.

#### Marketplace Settings
```yaml
marketplace_search_limit: 5
```
Maximum number of results to return from marketplace searches.

### Computer/Screenshot Configuration

#### Screenshot Delay
```yaml
screenshot_delay_after_action: 0.5
```
Time in seconds to wait after a computer action before taking a screenshot. Allows UI to update.

### Voice/TTS Configuration

#### Voice Mode
```yaml
voice_mode_enabled: false
```
Enable voice input mode (experimental).

#### Text-to-Speech
```yaml
tts_enabled: false           # Enable TTS
tts_model_path: null         # Path to TTS model (null = download automatically)
tts_use_cuda: false          # Use CUDA acceleration for TTS
speech_mode_enabled: false   # Enable speech recognition
```
TTS (Text-to-Speech) and speech recognition settings. TTS requires additional model downloads.

#### Wakeword Detection
```yaml
wakeword_enabled: true          # Enable wakeword detection
wakeword_phrase: "hey jarvis"   # Wakeword phrase to detect
wakeword_greetings:             # Random greetings when wakeword detected
  - "Hello! I'm listening."
  - "Hi there! How can I help you?"
  - "Yes? I'm here to assist."
```
Wakeword detection settings for voice activation. When enabled, the system listens for the specified wakeword phrase and responds with a random greeting.

## Environment Variables

Environment variables override configuration file settings and provide sensitive information:

### API Keys
```bash
# Required for cloud providers
OPENAI_API_KEY="your-openai-key"
ANTHROPIC_API_KEY="your-anthropic-key"
GOOGLE_API_KEY="your-gemini-key"
OPENROUTER_API_KEY="your-openrouter-key"
MISTRAL_API_KEY="your-mistral-key"

# Optional: Logging and debugging
LOG_LEVEL="DEBUG"           # DEBUG, INFO, WARNING, ERROR
ENABLE_HOT_RELOAD="true"    # Enable development hot reload
```

### Configuration Overrides
```bash
# Override specific config values
PA_MODEL_PROVIDER="anthropic"
PA_SELECTED_MODEL="claude-3-haiku-20240307"
PA_MEMORY_ENABLED="false"
```

## Configuration Management

### Loading Configuration

The application loads configuration in this order:

1. **Default Values**: Built-in defaults from `AppConfig` model
2. **Configuration File**: User YAML file
3. **Environment Variables**: Runtime overrides
4. **API Updates**: Settings changed via WebSocket API

### Runtime Configuration Updates

Settings can be updated at runtime via the WebSocket API:

```javascript
// Update model selection
ws.send(JSON.stringify({
  type: 'update-settings',
  payload: {
    selected_model_id: 'claude-3-haiku-20240307',
    temperature: 0.8
  }
}));
```

### Configuration Validation

All configuration is validated using Pydantic models:

- **Type Safety**: Ensures correct data types
- **Required Fields**: Validates mandatory settings
- **Value Ranges**: Checks numeric ranges and enums
- **Custom Validators**: Provider-specific validation

### Configuration Hot Reload

Some settings support hot reloading without restart:

- Model selection
- Temperature and other LLM parameters
- Memory settings
- Tool timeouts

Settings requiring restart:

- Provider configurations
- Database paths
- Network endpoints

## Common Configuration Patterns

### Development Setup
```yaml
model_mode: "local"
model_provider: "ollama"
selected_model_id: "llama3"
memory_enabled: false
debug_litellm: true
max_history_length: 5
```

### Production Setup
```yaml
model_mode: "online"
model_provider: "openai"
selected_model_id: "gpt-4o"
memory_enabled: true
llm_timeout: 60
query_timeout: 300
max_history_length: 20
```

### High-Performance Setup
```yaml
selected_model_id: "gpt-4o-mini"  # Faster, cheaper model
max_history_length: 5             # Shorter context for speed
memory_summarization_interval: 1800  # More frequent summarization
embedding_model: "all-MiniLM-L6-v2"  # Fast embedding model
```

### Memory-Constrained Setup
```yaml
memory_enabled: true
max_history_length: 3
memory_summarization_batch_size: 5
memory_summarization_limit: 500
embedding_model: "paraphrase-MiniLM-L3-v2"  # Smallest model
```

## Configuration Troubleshooting

### Configuration Not Loading
```bash
# Check config file location
python -c "from backend.src.core.config.manager import get_config_dir; print(get_config_dir())"

# Validate YAML syntax
python -c "import yaml; yaml.safe_load(open('config.yaml'))"

# Check file permissions
ls -la config.yaml
```

### Invalid Configuration
```python
# Validate configuration
from backend.src.core.config.models import AppConfig
import yaml

with open('config.yaml') as f:
    config = yaml.safe_load(f)

try:
    app_config = AppConfig(**config)
    print("Configuration is valid")
except Exception as e:
    print(f"Configuration error: {e}")
```

### API Key Issues
```bash
# Test API key validity
curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models

# Check environment variable
echo $OPENAI_API_KEY
```

### Provider-Specific Issues

#### Ollama Connection
```bash
# Check Ollama is running
curl http://localhost:11434/api/tags

# List available models
curl http://localhost:11434/api/tags | jq '.models[].name'
```

#### LMStudio Connection
```bash
# Check LMStudio is running
curl http://localhost:1234/v1/models
```

## Advanced Configuration

### Custom Provider Configuration

To add a new LLM provider:

1. **Add Provider Config Model**:
```python
class CustomProviderConfig(BaseModel):
    model: str = "custom-model"
    api_key_env: str = "CUSTOM_API_KEY"
    base_url: str = "https://api.custom-provider.com/v1"
```

2. **Update LLMProviders**:
```python
class LLMProviders(BaseModel):
    # ... existing providers ...
    custom: CustomProviderConfig = Field(default_factory=CustomProviderConfig)
```

3. **Add Provider Implementation**:
   - Create provider class in `backend/src/llm/providers/`
   - Register in provider registry

### Custom Validation Rules

Add custom configuration validation:

```python
from pydantic import field_validator

class AppConfig(BaseModel):
    # ... existing fields ...

    @field_validator('max_history_length')
    @classmethod
    def validate_history_length(cls, v):
        if v < 1 or v > 100:
            raise ValueError('max_history_length must be between 1 and 100')
        return v
```

### Configuration Profiles

Use different configurations for different environments:

```python
# config/dev.yaml
model_mode: "local"
debug_litellm: true

# config/prod.yaml
model_mode: "online"
debug_litellm: false

# Load specific profile
config = load_config_from_file('config/prod.yaml')
```

## Security Considerations

### Sensitive Data
- API keys are loaded from environment variables only
- Configuration files should not contain secrets
- Use secure credential management systems

### Access Control
- File system access is restricted to workspace
- Shell commands are whitelisted
- Network requests may be restricted based on configuration

### Audit Logging
- Configuration changes can be logged
- API key usage is tracked
- Sensitive operations are audited

This configuration reference covers all available options. For runtime configuration changes, use the WebSocket API settings endpoints. Always test configuration changes in a development environment before deploying to production.
