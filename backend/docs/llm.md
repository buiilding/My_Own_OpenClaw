# LLM Integration

## Overview

The backend supports multiple LLM providers with a unified interface, automatic provider selection, and streaming responses.

## Supported Providers

1. **OpenAI**: GPT-4, GPT-3.5, GPT-4 Turbo
2. **Anthropic**: Claude 3 (Opus, Sonnet, Haiku)
3. **Google Gemini**: Gemini Pro, Gemini Ultra
4. **Mistral**: Mistral Large, Mistral Medium
5. **OpenRouter**: Access to multiple models via OpenRouter
6. **Ollama**: Local LLM models
7. **LM Studio**: Local LLM server

## Architecture

### LLM Client

**Location**: `backend/src/llm/llm_client.py`

- **Unified Interface**: Single interface for all providers
- **Automatic Selection**: Selects provider based on configuration
- **Streaming Support**: Real-time response streaming
- **Error Handling**: Provider-specific error handling

### Provider Implementations

**Location**: `backend/src/llm/providers/`

Each provider has its own implementation:
- `openai.py`: OpenAI provider
- `anthropic.py`: Anthropic provider
- `gemini.py`: Google Gemini provider
- `mistral.py`: Mistral provider
- `openrouter.py`: OpenRouter provider
- `ollama.py`: Ollama provider
- `lmstudio.py`: LM Studio provider
- `local.py`: Local model provider

### Base Provider

**Location**: `backend/src/llm/providers/base.py`

All providers inherit from `BaseLLMProvider`:
- Defines common interface
- Handles streaming
- Manages errors

## Configuration

### Provider Selection

**Location**: `backend/src/core/config/models.py`

```python
class LLMProviders(BaseModel):
    openai: Optional[OpenAIConfig] = None
    anthropic: Optional[AnthropicConfig] = None
    google: Optional[GeminiConfig] = None
    # ... more providers
```

### Model Mode

- **online**: Use cloud providers (OpenAI, Anthropic, etc.)
- **local**: Use local providers (Ollama, LM Studio)

### Configuration Example

```yaml
llm:
  provider: openai  # or anthropic, google, etc.
  model: gpt-4
  api_key: your-api-key
  temperature: 0.7
  max_tokens: 2000
```

## Prompt Construction

**Location**: `backend/src/llm/prompt_constructor.py`

### Responsibilities

- Builds system prompts with tool schemas
- Integrates system context
- Formats conversation history
- Handles context types (initial vs sequential)

### System Prompt Structure

```
<system_prompt>
<tool_schemas>
  <!-- JSON schemas for all tools -->
</tool_schemas>
<system_context>
  <!-- OS state from frontend -->
</system_context>
</system_prompt>
```

### Context Types

- **Initial**: Full system context (first message)
- **Sequential**: Minimal context (subsequent messages)

## Streaming

### Streaming Events

**Location**: `backend/src/core/events.py`

- `ThinkingEvent`: Agent thinking process
- `TextEvent`: Text chunks
- `ToolCallEvent`: Tool execution requests
- `ErrorEvent`: Error messages
- `CompleteEvent`: Stream completion

### Streaming Implementation

All providers support streaming:
- OpenAI: Server-Sent Events
- Anthropic: Server-Sent Events
- Gemini: Streaming API
- Others: Provider-specific streaming

## Caching

**Location**: `backend/src/core/cache.py`

- **LLM Clients**: Cached with 24-hour TTL
- **Provider Instances**: Reused across requests
- **Configuration-Based**: Cache key includes provider config

## Error Handling

### Provider Errors

- **Rate Limiting**: Handled per provider
- **API Errors**: Provider-specific error handling
- **Network Errors**: Retry logic
- **Timeout**: Configurable timeouts

### Error Types

**Location**: `backend/src/core/exceptions.py`

- `LLMError`: Base LLM error
- `LLMAPIError`: API-specific errors
- `LLMRateLimitError`: Rate limit errors

## Usage Example

### Basic Usage

```python
from backend.src.llm.client import get_llm_client

llm_client = get_llm_client(config)

# Streaming response
async for chunk in llm_client.stream_completion(messages):
    print(chunk)
```

### With Tool Schemas

```python
from backend.src.llm.prompts import PromptConstructor

prompt_builder = PromptConstructor(config)
prompt, tool_schemas = prompt_builder.build_prompt(
    stored_messages=conversation_history,
    system_context=system_state_xml,
    context_type="initial"
)

# Include tool schemas in messages
messages = [
    {"role": "system", "content": prompt},
    # ... conversation messages
]

# LLM can now use tools
response = await llm_client.stream_completion(messages)
```

## Provider-Specific Features

### OpenAI

- Function calling support
- Streaming with Server-Sent Events
- Multiple model options

### Anthropic

- Tool use support
- Streaming with Server-Sent Events
- Long context windows

### Google Gemini

- Multimodal support (text + images)
- Streaming API
- Function calling

### Ollama

- Local execution
- No API keys required
- Custom model support

### LM Studio

- Local server
- OpenAI-compatible API
- Custom model support

## Best Practices

1. **Provider Selection**: Choose based on use case (speed vs quality)
2. **Streaming**: Always use streaming for better UX
3. **Error Handling**: Handle provider-specific errors
4. **Caching**: Leverage LLM client caching
5. **Configuration**: Use environment variables for API keys

## Performance Considerations

1. **Client Caching**: LLM clients cached per configuration
2. **Connection Pooling**: Provider-specific connection management
3. **Streaming**: Reduces perceived latency
4. **Timeout Configuration**: Set appropriate timeouts
