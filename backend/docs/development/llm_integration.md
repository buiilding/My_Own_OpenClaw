# LLM Integration Guide

This guide provides comprehensive documentation for the Personal Assistant's Large Language Model (LLM) integration system, covering multi-provider support, model management, prompt engineering, and performance optimization.

## Overview

The LLM integration system provides:

- **Multi-Provider Support**: Integration with major LLM providers through LiteLLM
- **Unified Interface**: Consistent API through LiteLLMClient and provider abstraction
- **Provider Abstraction**: Clean provider interface with extensible architecture
- **Prompt Engineering**: Dynamic prompt construction with tool schema integration
- **Response Parsing**: Structured parsing of LLM responses with function call extraction
- **Streaming Support**: Real-time streaming of LLM responses
- **Error Handling**: Robust error handling with provider-specific exceptions

## Architecture

The LLM system uses a provider-based architecture with LiteLLM:

```
┌─────────────────┐    ┌─────────────────┐
│  LiteLLMClient  │    │   LLMProvider   │
│   Interface     │◄──►│   Base Class    │
└─────────────────┘    └─────────────────┘
         │                        │
         ▼                        ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Provider      │    │   Prompt        │    │   Response      │
│ Implementations │    │ Constructor     │    │   Parser        │
│ (OpenAI, etc.)  │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Core Components

### LiteLLMClient

The main interface for LLM operations using LiteLLM.

```python
from backend.src.llm.llm_client import LiteLLMClient, get_llm_client

# Get configured client
client = get_llm_client()

# Make a request
response = await client.get_completion(
    model="gpt-4",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Hello, how are you?"}
    ]
)
```

**Key Features:**
- Unified API across all providers through LiteLLM
- Provider abstraction through provider classes
- Streaming support
- Error handling with provider-specific exceptions

### LLMProvider Base Class

Abstract base class for all LLM provider implementations.

```python
from backend.src.llm.providers.base import LLMProvider

class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    async def get_completion(
        self, model: str, messages: List[LLMMessage]
    ) -> NormalizedLLMResponse:
        """Get completion from provider."""

    @abstractmethod
    async def get_completion_stream(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingChunk, None]:
        """Stream completion from provider."""

    @abstractmethod
    async def list_models(self) -> List[Dict[str, str]]:
        """List available models."""
```

### Provider Implementations

Concrete implementations for each supported LLM provider:

**Supported Providers:**
- **OpenAI**: GPT-4, GPT-4-turbo, GPT-3.5-turbo
- **Anthropic**: Claude 3.7 Sonnet, Claude 3.5 Sonnet, Claude 3 Opus
- **Google Gemini**: Gemini 2.0 Flash, Gemini Pro
- **Ollama**: Local models (Llama, Mistral, etc.)
- **OpenRouter**: Access to additional models
- **Mistral**: Mistral Large, Mistral Medium
- **LMStudio**: Local LMStudio server integration

### Model Configuration

Models are configured through the AppConfig system:

```python
# Configuration example
config = AppConfig(
    model_provider="openai",
    selected_model_id="gpt-4",
    llm_providers=LLMProviders(
        openai=OpenAIConfig(
            model="gpt-4",
            api_key_env="OPENAI_API_KEY"
        ),
        anthropic=AnthropicConfig(
            model="claude-3-haiku-20240307",
            api_key_env="ANTHROPIC_API_KEY"
        )
    )
)
```

## Provider Implementations

### OpenAI Provider

```python
from backend.src.llm.providers.openai import OpenAIProvider

# Provider is instantiated with config
provider = OpenAIProvider(config)

# Get completion
response = await provider.get_completion(
    model="gpt-4",
    messages=messages
)
```

### Anthropic Provider

```python
from backend.src.llm.providers.anthropic import AnthropicProvider

provider = AnthropicProvider(config)

response = await provider.get_completion(
    model="claude-3-haiku-20240307",
    messages=messages
)
```

### Gemini Provider

```python
from backend.src.llm.providers.gemini import GeminiProvider

provider = GeminiProvider(config)

response = await provider.get_completion(
    model="gemini-2.5-flash",
    messages=messages
)
```

### Other Providers

- **Ollama**: Local model serving
- **OpenRouter**: Multi-provider access
- **Mistral**: Mistral AI models
- **LMStudio**: Local LMStudio integration

All providers follow the same interface pattern and use LiteLLM under the hood.

## Prompt Engineering

### Prompt Constructor

Advanced prompt construction and optimization.

```python
from backend.src.llm.prompt_constructor import PromptConstructor

constructor = PromptConstructor()

# Build conversation prompt
prompt = constructor.build_conversation_prompt(
    system_message="You are a helpful coding assistant.",
    conversation_history=history,
    current_query="How do I implement a binary search?",
    context={"language": "python", "difficulty": "intermediate"}
)

# Add tool instructions
tool_prompt = constructor.add_tool_instructions(
    base_prompt=prompt,
    available_tools=tool_schemas,
    tool_format="function_calling"  # or "json", "xml"
)

# Optimize for specific model
optimized = constructor.optimize_for_model(
    prompt=tool_prompt,
    model="gpt-4",
    max_tokens=4000
)
```

**Prompt Components:**
- **System Messages**: Define assistant behavior and capabilities
- **Context Injection**: Add relevant conversation history and context
- **Tool Instructions**: Format tool schemas for function calling
- **Output Formatting**: Specify response structure and format
- **Few-shot Examples**: Include examples for better performance

### Template System

Reusable prompt templates for common tasks.

```python
from backend.src.llm.prompts import PromptTemplates

templates = PromptTemplates()

# Coding assistant template
coding_prompt = templates.get_template("coding_assistant").format(
    language="python",
    task="implement binary search",
    constraints="must be efficient and readable"
)

# Analysis template
analysis_prompt = templates.get_template("data_analysis").format(
    data_description="sales data from Q1",
    analysis_type="trend analysis",
    output_format="json"
)

# Custom template creation
custom_template = templates.create_template(
    name="custom_assistant",
    template="""
You are a {role} assistant specializing in {domain}.

Guidelines:
{guidelines}

Current task: {task}
Context: {context}

Please provide a {response_style} response.
""",
    variables=["role", "domain", "guidelines", "task", "context", "response_style"]
)
```

## Response Parsing

### Response Parser

Robust parsing and validation of LLM responses.

```python
from backend.src.llm.parser import ResponseParser

parser = ResponseParser()

# Parse function calls
parsed = parser.parse_response(response_text)

if parsed.has_function_calls:
    for call in parsed.function_calls:
        print(f"Tool: {call.name}")
        print(f"Args: {call.arguments}")

# Extract structured data
if parsed.response_format == "json":
    data = parser.extract_json(parsed.content)
elif parsed.response_format == "xml":
    data = parser.extract_xml(parsed.content)

# Validate response
validation = parser.validate_response(
    response=parsed,
    expected_format="function_calling",
    required_fields=["function_calls"]
)

if not validation.is_valid:
    print(f"Validation errors: {validation.errors}")
```

**Parsing Capabilities:**
- **Function Calls**: Extract tool calls and arguments
- **JSON/XML**: Parse structured data from responses
- **Code Blocks**: Extract code snippets with language detection
- **Lists/Tables**: Parse formatted lists and tables
- **Error Detection**: Identify and handle parsing errors

## Model Management

### Model Configuration

```python
from backend.src.llm.models_config import ModelConfig, ModelRegistry

# Configure model settings
gpt4_config = ModelConfig(
    name="gpt-4",
    provider="openai",
    context_window=8192,
    max_output_tokens=4096,
    supports_function_calling=True,
    supports_vision=False,
    cost_per_token_input=0.03,
    cost_per_token_output=0.06,
    performance_rating=9.5
)

# Register model
registry = ModelRegistry()
registry.register_model(gpt4_config)

# Get model capabilities
capabilities = registry.get_model_capabilities("gpt-4")
```

### Dynamic Model Selection

```python
# Select model based on task requirements
selector = ModelSelector(registry)

selected_model = selector.select_model(
    task_type="code_generation",
    complexity="high",
    max_cost=0.1,  # max cost per request
    required_features=["function_calling"],
    preferred_providers=["openai", "anthropic"]
)

print(f"Selected: {selected_model.name} from {selected_model.provider}")
```

## Performance Optimization

### Caching System

```python
from backend.src.core.cache import LLMCache

cache = LLMCache(
    ttl_seconds=3600,  # 1 hour
    max_size_mb=500
)

# Cache LLM responses
cache_key = cache.generate_key(messages, model, temperature)

cached_response = await cache.get(cache_key)
if cached_response:
    return cached_response

# Execute and cache
response = await llm.generate(messages, model=model)
await cache.set(cache_key, response)
```

### Concurrent Processing

The system supports concurrent LLM requests with proper resource management:

```python
# Process multiple conversations concurrently
async def process_conversations(conversations):
    tasks = []
    for conv in conversations:
        task = asyncio.create_task(
            llm_client.generate_response(conv.messages, model="gpt-4")
        )
        tasks.append(task)

    # Limit concurrency to prevent overwhelming providers
    semaphore = asyncio.Semaphore(5)  # Max 5 concurrent requests

    async def limited_request(task):
        async with semaphore:
            return await task

    results = await asyncio.gather(*[limited_request(t) for t in tasks])
    return results
```

### Streaming and Async Processing

```python
# Streaming responses
async def stream_response(messages, model):
    stream = await client.stream_generate(
        messages=messages,
        model=model,
        temperature=0.7
    )

    async for chunk in stream:
        if chunk.type == "content":
            print(chunk.content, end="")
        elif chunk.type == "function_call":
            print(f"Function call: {chunk.function_name}")

# Async batch processing
async def process_conversation_batch(conversations):
    tasks = []
    for conv in conversations:
        task = asyncio.create_task(
            client.generate_response(conv.messages, model="gpt-4")
        )
        tasks.append(task)

    # Process with concurrency limit
    semaphore = asyncio.Semaphore(5)  # Max 5 concurrent requests

    async def limited_generate(task):
        async with semaphore:
            return await task

    results = await asyncio.gather(*[limited_generate(t) for t in tasks])
    return results
```

## Performance Optimization

### Streaming and Async Processing

```python
# Streaming responses for real-time interaction
async def stream_response(messages, model):
    stream = await client.stream_generate(
        messages=messages,
        model=model,
        temperature=0.7
    )

    async for chunk in stream:
        if chunk.type == "content":
            print(chunk.content, end="")
        elif chunk.type == "function_call":
            print(f"Function call: {chunk.function_name}")

# Async batch processing with concurrency limits
async def process_conversation_batch(conversations):
    semaphore = asyncio.Semaphore(5)  # Max 5 concurrent requests

    async def limited_generate(task):
        async with semaphore:
            return await task

    tasks = [asyncio.create_task(client.generate_response(conv.messages, model="gpt-4")) for conv in conversations]
    results = await asyncio.gather(*[limited_generate(t) for t in tasks])
    return results
```

## Configuration

LLM configuration through the AppConfig Pydantic model:

```python
from backend.src.core.config.models import AppConfig, LLMProviders

config = AppConfig(
    # LLM Settings
    model_mode="online",  # "online" or "local"
    model_provider="openai",  # Provider name
    selected_model_id="gpt-4",  # Model identifier
    llm_timeout=300,  # Request timeout
    query_timeout=600,  # Query timeout
    debug_litellm=False,  # LiteLLM debug logging

    # Provider Configurations
    llm_providers=LLMProviders(
        openai=OpenAIConfig(
            model="gpt-4",
            api_key_env="OPENAI_API_KEY"
        ),
        anthropic=AnthropicConfig(
            model="claude-3-haiku-20240307",
            api_key_env="ANTHROPIC_API_KEY"
        ),
        gemini=GeminiConfig(
            model="gemini-2.5-flash",
            api_key_env="GOOGLE_API_KEY"
        ),
        # ... other providers
    )
)
```

## Error Handling

The LLM system includes robust error handling:

```python
from backend.src.core.exceptions import LLMAPIError, LLMRateLimitError

try:
    response = await client.get_completion(model, messages)
    content = response["content"]
except LLMRateLimitError:
    # Handle rate limiting
    await asyncio.sleep(60)
    # Retry request
except LLMAPIError as e:
    # Handle API errors
    logger.error(f"LLM API error: {e}")
    # Fallback to different provider
```

## Usage Examples

### Basic Usage

```python
from backend.src.llm.llm_client import get_llm_client

# Get client
client = get_llm_client()

# Generate response
response = await client.get_completion(
    model="gpt-4",
    messages=[
        {"role": "user", "content": "Hello, how are you?"}
    ]
)

print(response["content"])
```

### Streaming Responses

```python
# Stream response
async for chunk in client.get_completion_stream(model, messages):
    if chunk["type"] == "content":
        print(chunk["content"], end="")
```

### Provider Selection

```python
# Different providers
config.model_provider = "anthropic"
config.selected_model_id = "claude-3-haiku-20240307"

client = get_llm_client()
response = await client.get_completion(model, messages)
```

## API Reference

### LiteLLMClient Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `get_completion()` | Generate text response | `model, messages` | `NormalizedLLMResponse` |
| `get_completion_stream()` | Stream response chunks | `model, messages` | `AsyncGenerator[StreamingChunk]` |

### Provider Methods

| Method | Description | Parameters | Returns |
|--------|-------------|------------|---------|
| `get_completion()` | Get completion | `model, messages` | `NormalizedLLMResponse` |
| `get_completion_stream()` | Stream completion | `model, messages` | `AsyncGenerator[StreamingChunk]` |
| `list_models()` | List available models | - | `List[Dict[str, str]]` |

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model_provider` | str | `"openai"` | Default LLM provider |
| `selected_model_id` | str | `"gpt-4"` | Default model ID |
| `llm_timeout` | int | `300` | Request timeout in seconds |
| `query_timeout` | int | `600` | Query timeout in seconds |
| `debug_litellm` | bool | `False` | Enable LiteLLM debug logging |

This LLM integration system provides a robust, scalable, and cost-effective foundation for powering the Personal Assistant's conversational capabilities across multiple providers and use cases.</contents>
</xai:function_call">
