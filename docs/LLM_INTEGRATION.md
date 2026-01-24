# LLM Integration

## Overview

Desktop Assistant supports multiple LLM providers through a unified interface. The system uses LiteLLM for provider abstraction and supports both cloud and local models.

## Supported Providers

### Cloud Providers

- **OpenAI**: GPT-4, GPT-3.5, and other OpenAI models
- **Anthropic**: Claude 3 Opus, Sonnet, Haiku
- **Google**: Gemini 2.5 Flash, Gemini Pro
- **OpenRouter**: Access to 100+ models via unified API
- **Mistral**: Mistral models

### Local Providers

- **Ollama**: Local model execution
- **LM Studio**: Local model server

## LLM Client Architecture

```
┌─────────────────────────────────────────┐
│         LLMClient (Abstract)            │
│  - get_completion()                      │
│  - get_completion_stream()                │
└─────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────┐
│      LiteLLMClient (Implementation)     │
│  - Delegates to provider layer           │
│  - Handles streaming                     │
│  - Validates response structure          │
│  - Config stored for provider selection  │
└─────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────┐
│      Provider Factory (Cached)         │
│  - create_provider_factory()            │
│  - LRU cache (maxsize=16)                │
│  - get_provider() - gets from factory   │
│  - Caches provider instances            │
└─────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────┐
│      LLMProvider (Base)                  │
│  - OpenAIProvider                        │
│  - AnthropicProvider                     │
│  - GeminiProvider                        │
│  - OllamaProvider                        │
│  - OpenRouterProvider                    │
│  - MistralProvider                      │
│  - LMStudioProvider                      │
└─────────────────────────────────────────┘
```

### LiteLLMClient

**Implementation**: `llm/client.py`

**Features**:
- Provider-agnostic abstraction
- Stateless: Always fetches provider from factory
- Response validation (structure, content type)
- Error handling (yields ErrorEvent for streaming)

**Configuration Drift**: Client stores AppConfig reference. When config updates at runtime, new client instance must be created (handled by `AgentSession.update_config()`).

### Provider Factory

**Implementation**: `llm/providers/__init__.py`

**Features**:
- **Caching**: LRU cache (maxsize=16) prevents provider recreation
- **Hashable Keys**: Uses primitives (api_key, timeout, URLs) for cache keys
- **Safe Timeout Conversion**: Validates timeout values (1s-3600s range)
- **Fail-Fast**: Clear error messages if provider not configured

**Provider Creation**:
- Cloud providers: Require API key
- Local providers: No API key required (may fail at runtime if not running)
- Graceful degradation: Logs warnings, continues with available providers

## Configuration

### Provider Configuration

Configure providers in `config.yaml`:

```yaml
model_provider: "openai"
model_mode: "online"
selected_model_id: "gpt-4o"

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
```

### Environment Variables

Set API keys via environment variables:

```bash
export OPENAI_API_KEY="your-api-key"
export ANTHROPIC_API_KEY="your-api-key"
export GOOGLE_API_KEY="your-api-key"
```

## Usage

### Basic Usage

```python
from backend.src.llm.client import get_llm_client
from backend.src.core.config import AppConfig

config = AppConfig(...)
llm_client = get_llm_client(config)

# Non-streaming
response = await llm_client.get_completion(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}]
)

# Streaming
async for chunk in llm_client.get_completion_stream(
    model="gpt-4o",
    messages=[{"role": "user", "content": "Hello"}]
):
    print(chunk.content)
```

### Message Format

Messages follow OpenAI format:

```python
messages = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"},
    {"role": "assistant", "content": "Hi there!"},
    {"role": "user", "content": "How are you?"}
]
```

## Provider Details

### Provider Base Class

All providers inherit from `LLMProvider` base class (`llm/providers/base.py`):

**Abstract Methods**:
- `_validate_dependencies()`: Validate required dependencies
- `get_completion()`: Get non-streaming completion
- `_stream_internal()`: Internal streaming implementation
- `list_models()`: List available models
- `_get_full_model_string()`: Construct full model string for LiteLLM

**Shared Features**:
- Uniform error handling (rate limits, API errors)
- Thinking token extraction (Anthropic, Gemini)
- Model string construction
- Request parameter building

**Error Handling**:
- Non-streaming: Raises exceptions (LLMAPIError, LLMRateLimitError, LLMError)
- Streaming: Yields ErrorEvent (never raises exceptions)

### OpenAI

**Models**: `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`, `gpt-5`, `gpt-5-mini`, `gpt-4.1`

**Configuration**:
```yaml
providers:
  openai:
    api_key: "sk-..."
    base_url: null  # Optional custom base URL
    timeout: 60
```

**Features**:
- Function calling support
- Streaming responses
- Token usage tracking
- Direct model ID (no prefix needed)

**Implementation**: `llm/providers/openai.py`

### Anthropic

**Models**: 
- Non-thinking: `claude-3-haiku-20240307`
- Thinking: `claude-3-7-sonnet-20250219`, `claude-sonnet-4-20250522`, `claude-sonnet-4-5-20250929`, `claude-haiku-4-5-20251001`

**Configuration**:
```yaml
providers:
  anthropic:
    api_key: "sk-ant-..."
    timeout: 60
```

**Features**:
- Long context windows
- Thinking tokens (reasoning) - enabled for thinking models
- Streaming responses
- Default thinking token budget: 16384 tokens

**Implementation**: `llm/providers/anthropic.py`

### Google (Gemini)

**Models**: 
- Non-thinking: `gemini-2.0-flash-lite`, `gemini-2.0-flash-exp`, `gemini-2.0-flash`, `computer-use-preview`
- Thinking: `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`

**Configuration**:
```yaml
providers:
  google:
    api_key: "AIza..."
    timeout: 60
```

**Features**:
- Multimodal support (text + images)
- Function calling
- Streaming responses
- Thinking tokens (disabled by default, can be enabled)

**Implementation**: `llm/providers/gemini.py`

### Ollama

**Models**: Any Ollama model (e.g., `llama-2-7b`, `mistral-7b`)

**Configuration**:
```yaml
providers:
  ollama:
    base_url: "http://localhost:11434"
    timeout: 60
```

**Setup**:
```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull model
ollama pull llama-2-7b
```

**Features**:
- Local execution
- No API key required
- Full control

### OpenRouter

**Models**: 100+ models from various providers

**Configuration**:
```yaml
providers:
  openrouter:
    api_key: "sk-or-..."
    base_url: "https://openrouter.ai/api/v1"
    timeout: 60
```

**Features**:
- Unified API for multiple providers
- Model routing
- Cost optimization

### Mistral

**Models**: `mistral-large`, `mistral-medium`, `mistral-small`

**Configuration**:
```yaml
providers:
  mistral:
    api_key: "your-api-key"
    timeout: 60
```

**Features**:
- High performance
- Function calling
- Streaming responses

### LM Studio

**Models**: Any model supported by LM Studio (discovered dynamically)

**Configuration**:
```yaml
providers:
  lm_studio:
    base_url: "http://localhost:1234/v1"
    timeout: 60
```

**Setup**:
1. Install LM Studio
2. Load model
3. Start local server on port 1234

**Features**:
- Local execution
- No API key required
- GPU acceleration
- Dynamic model discovery

**Implementation**: `llm/providers/local.py` (LMStudioProvider)

## Streaming

### Streaming Responses

All providers support streaming:

```python
async for event in llm_client.get_completion_stream(
    model="gpt-4o",
    messages=messages
):
    if event.type == "content":
        print(event.content, end="", flush=True)
    elif event.type == "error":
        print(f"Error: {event.error}")
```

### Streaming Events

**Content Event**:
```python
StreamingEvent(type="content", content="chunk")
```

**Error Event**:
```python
ErrorEvent(type="error", error="error message")
```

## Function Calling

### Tool Definitions

Tools are automatically included in LLM requests:

```python
tools = [
    {
        "type": "function",
        "function": {
            "name": "mouse_control",
            "description": "Control mouse",
            "parameters": {...}
        }
    }
]
```

### Function Calling Flow

1. LLM receives tool definitions
2. LLM generates tool calls
3. Tools executed
4. Results sent back to LLM
5. LLM generates final response

## Error Handling

### Error Types

**LLMAPIError**: LLM API errors
- Invalid API key
- Rate limiting
- Model not found

**TimeoutError**: Request timeout
- Network issues
- Slow responses

**ValidationError**: Invalid request
- Invalid message format
- Missing required fields

### Error Handling

```python
try:
    response = await llm_client.get_completion(...)
except LLMAPIError as e:
    logger.error(f"LLM API error: {e}")
    # Handle error
except TimeoutError as e:
    logger.error(f"Request timeout: {e}")
    # Handle timeout
```

## Performance

### Caching

Provider instances are cached:

```python
# First call creates provider
client1 = get_llm_client(config)

# Second call reuses cached provider
client2 = get_llm_client(config)
# client1 and client2 use same provider instance
```

### Optimization

- **Connection Pooling**: Reuse connections
- **Request Batching**: Batch requests when possible
- **Streaming**: Use streaming for better UX
- **Caching**: Cache provider instances

## Model Service

### Overview

The Model Service (`llm/models/model_service.py`) discovers and aggregates available LLM models from static configuration and dynamic provider discovery.

### Methods

- `get_online_models()`: Return curated list of popular online models (non-thinking)
- `get_thinking_models()`: Return curated list of models that support thinking tokens
- `get_all_online_models()`: Return all online models (deduplicated, thinking preferred)
- `get_vision_models()`: Return curated list of local vision models
- `get_local_models()`: Fetch available models from local providers (Ollama, LM Studio)
- `get_all_models()`: Fetch all available models (local, online, vision)

### Model Configuration

**Static Configuration** (`llm/models/models_config.py`):
- `ONLINE_MODELS`: Curated registry of popular online models
- `ONLINE_THINKING_MODELS`: Models that support thinking tokens
- `LOCAL_VISION_MODELS`: Local HuggingFace vision models

**Model Discovery**:
- Online models: Static configuration (no API calls)
- Local models: Dynamic discovery via provider `list_models()` method
- Vision models: Static configuration

## Response Parser

### Overview

The Response Parser (`llm/parser.py`) parses LLM responses to detect and extract tool calls.

**Security**: This is a trust boundary. All inputs validated with size limits, timeouts, and strict validation.

### Features

- **Robust JSON Extraction**: Bracket-matching JSON extraction (not regex)
- **Configurable Schema**: Supports different JSON schemas via `ToolCallSchema`
- **Default Format**: `{"functionCall": {"name": "...", "args": {...}}}`
- **Timeout Protection**: Parse timeout (5 seconds default)
- **Size Limits**: Max response size (10MB), max JSON size (1MB)
- **Validation**: Tool name validation against registry

### ParsedResponse

**Fields**:
- `original_response`: Original LLM response text
- `tool_calls`: List of ParsedToolCall objects
- `text_content`: Non-tool-call content
- `has_tool_calls`: Boolean flag

### ParsedToolCall

**Fields**:
- `tool_name`: Name of tool
- `parameters`: Tool parameters dictionary
- `raw_call`: Raw tool call string
- `confidence`: Parse confidence (0.0-1.0)

## Testing

### Mock LLM Client

For testing, use mock LLM client:

```python
from backend.src.simulation.mock_llm_client import MockLLMClient

mock_client = MockLLMClient()
response = await mock_client.get_completion(...)
```

### Integration Testing

```python
@pytest.mark.asyncio
async def test_llm_integration():
    config = AppConfig(...)
    client = get_llm_client(config)
    
    response = await client.get_completion(
        model="gpt-4o",
        messages=[{"role": "user", "content": "Hello"}]
    )
    
    assert response is not None
```

## Troubleshooting

### API Key Issues

1. Check API key is set
2. Verify API key is valid
3. Check API key permissions

### Connection Issues

1. Check network connectivity
2. Verify base URL is correct
3. Check firewall settings

### Model Issues

1. Verify model name is correct
2. Check model availability
3. Verify API access

---

For more information, see:
- [Configuration Guide](CONFIGURATION.md)
- [API Reference](API_REFERENCE.md)
- [Backend Architecture](BACKEND_ARCHITECTURE.md)
