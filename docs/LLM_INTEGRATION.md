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
└─────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────┐
│      Provider Factory                   │
│  - Caches provider instances            │
│  - Manages provider lifecycle           │
└─────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────┐
│      LLMProvider (Base)                  │
│  - OpenAIProvider                        │
│  - AnthropicProvider                     │
│  - GoogleProvider                        │
│  - OllamaProvider                        │
│  - OpenRouterProvider                    │
│  - MistralProvider                       │
│  - LMStudioProvider                      │
└─────────────────────────────────────────┘
```

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

### OpenAI

**Models**: `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`

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

### Anthropic

**Models**: `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku`

**Configuration**:
```yaml
providers:
  anthropic:
    api_key: "sk-ant-..."
    timeout: 60
```

**Features**:
- Long context windows
- Thinking tokens (reasoning)
- Streaming responses

### Google

**Models**: `gemini-2.5-flash`, `gemini-pro`

**Configuration**:
```yaml
providers:
  google:
    api_key: "AIza..."
    timeout: 60
```

**Features**:
- Multimodal support
- Function calling
- Streaming responses

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

**Models**: Any model supported by LM Studio

**Configuration**:
```yaml
providers:
  lm_studio:
    base_url: "http://localhost:1234"
    timeout: 60
```

**Setup**:
1. Install LM Studio
2. Load model
3. Start local server

**Features**:
- Local execution
- No API key required
- GPU acceleration

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
