# LLM Provider Implementations

This document provides detailed documentation for the LLM provider implementations in the Personal Assistant Backend system, covering supported providers, configuration, and integration patterns.

## Overview

The Personal Assistant supports multiple Large Language Model (LLM) providers through a unified abstraction layer. This allows seamless switching between providers and consistent API usage across the system.

## Supported Providers

### OpenAI (`backend/src/llm/providers/openai.py`)

The primary OpenAI provider implementation supporting GPT models.

#### Features
- **Model Support**: GPT-4, GPT-3.5-Turbo, and other OpenAI models
- **Streaming**: Real-time response streaming
- **Error Handling**: Comprehensive error mapping and retry logic
- **Rate Limiting**: Built-in rate limit handling

#### Configuration
```yaml
llm:
  provider: "openai"
  model: "gpt-4"
  api_key: "${OPENAI_API_KEY}"
  temperature: 0.7
  max_tokens: 4096
  timeout: 60
```

#### Usage Example
```python
from backend.src.llm.providers.openai import OpenAIProvider

provider = OpenAIProvider(api_key="your-api-key")

# Non-streaming completion
response = await provider.get_completion(
    model="gpt-4",
    messages=[
        {"role": "user", "content": "Hello, how are you?"}
    ]
)

# Streaming completion
async for chunk in provider.get_completion_stream(
    model="gpt-4",
    messages=[{"role": "user", "content": "Tell me a story"}]
):
    print(chunk.content, end="")
```

### Anthropic Claude (`backend/src/llm/providers/anthropic.py`)

Anthropic's Claude model provider implementation.

#### Features
- **Model Support**: Claude 3 Opus, Sonnet, and Haiku
- **Streaming**: Real-time response streaming
- **Safety**: Built-in safety checks and content filtering
- **Context Window**: Large context windows (up to 200k tokens)

#### Configuration
```yaml
llm:
  provider: "anthropic"
  model: "claude-3-sonnet-20240229"
  api_key: "${ANTHROPIC_API_KEY}"
  temperature: 0.7
  max_tokens: 4096
  timeout: 60
```

### Google Gemini (`backend/src/llm/providers/gemini.py`)

Google's Gemini model provider implementation.

#### Features
- **Model Support**: Gemini Pro and Ultra models
- **Multimodal**: Text and image understanding
- **Safety**: Google's safety classifiers
- **Integration**: Native Google Cloud integration

#### Configuration
```yaml
llm:
  provider: "gemini"
  model: "gemini-pro"
  api_key: "${GOOGLE_API_KEY}"
  temperature: 0.7
  max_tokens: 4096
  timeout: 60
```

### Mistral AI (`backend/src/llm/providers/mistral.py`)

Mistral AI's open-source model provider.

#### Features
- **Model Support**: Mixtral and Mistral 7B models
- **Performance**: High throughput and low latency
- **Open Source**: Community-driven development
- **Customization**: Fine-tuning capabilities

#### Configuration
```yaml
llm:
  provider: "mistral"
  model: "mistral-medium"
  api_key: "${MISTRAL_API_KEY}"
  temperature: 0.7
  max_tokens: 4096
  timeout: 60
```

### Local Models (`backend/src/llm/providers/local.py`)

Local model provider for running models on-premises.

#### Features
- **Privacy**: No data sent to external services
- **Cost**: No API costs
- **Customization**: Full control over model behavior
- **Integration**: Compatible with various local model servers

#### Configuration
```yaml
llm:
  provider: "local"
  model: "local-model-name"
  base_url: "http://localhost:8000"
  api_key: ""  # Not required for local
  temperature: 0.7
  max_tokens: 4096
  timeout: 60
```

### OpenRouter (`backend/src/llm/providers/openrouter.py`)

Unified API for accessing multiple model providers through OpenRouter.

#### Features
- **Multi-Provider**: Access to 20+ providers through one API
- **Load Balancing**: Automatic provider failover
- **Cost Optimization**: Route to cheapest providers
- **Model Discovery**: Access to latest models

#### Configuration
```yaml
llm:
  provider: "openrouter"
  model: "openai/gpt-4-turbo"
  api_key: "${OPENROUTER_API_KEY}"
  temperature: 0.7
  max_tokens: 4096
  timeout: 60
```

### Default Provider (`backend/src/llm/providers/default.py`)

Fallback provider for testing and development.

#### Features
- **Mock Responses**: Deterministic responses for testing
- **No API Keys**: Works without external dependencies
- **Development**: Useful for development and CI/CD

#### Configuration
```yaml
llm:
  provider: "default"
  model: "mock-model"
  temperature: 0.7
  max_tokens: 4096
```

## Provider Architecture

### Base Provider Interface

All providers implement the `LLMProvider` protocol:

```python
from typing import AsyncGenerator, List
from backend.src.core.types import LLMMessage, NormalizedLLMResponse, StreamingChunk

class LLMProvider(Protocol):
    """Base interface for LLM providers."""

    async def get_completion(
        self,
        model: str,
        messages: List[LLMMessage]
    ) -> NormalizedLLMResponse:
        """Get a non-streaming completion."""
        ...

    async def get_completion_stream(
        self,
        model: str,
        messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingChunk, None]:
        """Get a streaming completion."""
        ...
```

### Error Handling

Providers implement consistent error handling:

```python
from backend.src.core.exceptions import (
    LLMAPIError,
    LLMError,
    LLMRateLimitError,
)

# Provider-specific errors are mapped to standard exceptions
try:
    response = await provider.get_completion(model, messages)
except ProviderSpecificError as e:
    raise LLMAPIError("Provider error", model=model, cause=e)
```

### Rate Limiting

All providers implement rate limiting protection:

```python
# Automatic retry with exponential backoff
response = await self._execute_with_retry(
    lambda: self._call_api(params),
    max_retries=3,
    base_delay=1.0
)
```

## Configuration Management

### Environment Variables

Providers support configuration through environment variables:

```bash
# OpenAI
export OPENAI_API_KEY="your-openai-key"

# Anthropic
export ANTHROPIC_API_KEY="your-anthropic-key"

# Google
export GOOGLE_API_KEY="your-google-key"

# Mistral
export MISTRAL_API_KEY="your-mistral-key"

# OpenRouter
export OPENROUTER_API_KEY="your-openrouter-key"
```

### Dynamic Configuration

Providers can be switched at runtime:

```python
# Change provider in configuration
config.llm_provider = "anthropic"
config.selected_model_id = "claude-3-sonnet-20240229"

# Restart or reinitialize LLM client
llm_client = container.llm_client()
```

## Testing and Validation

### Provider Testing

```python
import pytest
from backend.src.llm.providers.openai import OpenAIProvider

@pytest.mark.asyncio
async def test_openai_provider():
    provider = OpenAIProvider(api_key="test-key")

    # Test basic completion
    response = await provider.get_completion(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": "Hello"}]
    )

    assert "content" in response
    assert isinstance(response["content"], str)

@pytest.mark.asyncio
async def test_openai_streaming():
    provider = OpenAIProvider(api_key="test-key")

    chunks = []
    async for chunk in provider.get_completion_stream(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": "Tell a story"}]
    ):
        chunks.append(chunk)

    assert len(chunks) > 0
    assert all(isinstance(chunk.content, str) for chunk in chunks)
```

### Mock Providers

For testing without API calls:

```python
from backend.src.llm.providers.default import DefaultProvider

# Use mock provider for testing
provider = DefaultProvider()
response = await provider.get_completion(
    model="mock",
    messages=[{"role": "user", "content": "Test"}]
)
# Returns deterministic mock response
```

## Performance Optimization

### Connection Pooling

Providers implement connection pooling for better performance:

```python
class OpenAIProvider:
    def __init__(self, api_key: str):
        self.client = AsyncOpenAI(
            api_key=api_key,
            max_retries=3,
            timeout=60.0,
        )
```

### Caching

Response caching reduces API calls:

```python
# Cache identical prompts
cache_key = self._generate_cache_key(model, messages)
cached_response = await self.cache.get(cache_key)

if cached_response:
    return cached_response
```

### Batch Processing

Some providers support batch processing:

```python
# Process multiple requests in batch
batch_responses = await provider.get_batch_completion(
    model=model,
    message_batches=[batch1, batch2, batch3]
)
```

## Security Considerations

### API Key Management

- **Environment Variables**: Never hardcode API keys
- **Key Rotation**: Regularly rotate API keys
- **Access Control**: Limit key access to necessary systems
- **Auditing**: Log API key usage

### Data Protection

- **No Logging**: Don't log sensitive prompts or responses
- **Encryption**: Encrypt cached responses if stored
- **Compliance**: Follow data protection regulations

## Monitoring and Observability

### Metrics Collection

Providers expose metrics for monitoring:

```python
# Request count
metrics.increment("llm_requests_total", tags={"provider": "openai"})

# Response time
metrics.histogram("llm_request_duration", duration, tags={"provider": "openai"})

# Error rate
metrics.increment("llm_errors_total", tags={"provider": "openai", "error_type": "rate_limit"})
```

### Health Checks

Provider health monitoring:

```python
async def health_check(self) -> Dict[str, Any]:
    """Check provider health."""
    try:
        # Quick test request
        await self.get_completion(
            model=self.test_model,
            messages=[{"role": "user", "content": "ping"}]
        )
        return {"status": "healthy", "latency": latency}
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
```

## Troubleshooting

### Common Issues

#### Authentication Errors
```python
# Check API key is set
if not self.api_key:
    raise LLMAPIError("API key not configured", model=model)

# Verify key format
if not self._is_valid_api_key(self.api_key):
    raise LLMAPIError("Invalid API key format", model=model)
```

#### Rate Limiting
```python
# Implement exponential backoff
for attempt in range(max_retries):
    try:
        return await self._call_api(params)
    except RateLimitError:
        delay = base_delay * (2 ** attempt)
        await asyncio.sleep(delay)
```

#### Network Issues
```python
# Add timeout and retry logic
try:
    async with asyncio.timeout(timeout):
        response = await self.client.chat.completions.create(**params)
        return response
except asyncio.TimeoutError:
    raise LLMAPIError("Request timeout", model=model)
```

## Future Enhancements

### Planned Features

- **Model Auto-Scaling**: Automatic model selection based on complexity
- **Multi-Modal Support**: Enhanced image and video understanding
- **Fine-Tuning**: Custom model training capabilities
- **Federated Learning**: Distributed model training
- **Edge Deployment**: On-device model execution

This documentation provides comprehensive guidance for working with LLM providers in the Personal Assistant Backend system.
