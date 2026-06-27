---
summary: "LLM Integration"
read_when:
  - When touching model providers or prompts.
---

# LLM Integration

## Overview

WindieOS supports multiple LLM providers through a unified interface. The system uses LiteLLM for provider abstraction and supports both cloud and local models.

System prompt note:
- private backend implementation now carries a fuller Codex-style execution scaffold adapted for WindieOS, including Codex-like repo-instruction scope, preamble/response discipline, final-answer formatting rules, and coding workflow guidance, with WindieOS-specific browser-use, desktop-use, process, and validation rules layered on top.
- Applicable `AGENTS.md` files are injected as separate contextual `user` messages during prompt assembly, following Codex's `# AGENTS.md instructions for ...` wrapper format instead of being inlined into the system prompt.
- In hosted-backend mode, the desktop app resolves `AGENTS.md` locally from the selected workspace and sends those rendered messages with the query payload, because the remote backend cannot read the user's local filesystem path directly.
- The backend still keeps a workspace-path fallback resolver for local/backend-cohosted development flows, so both hosted and local runtimes share one prompt-construction surface.

## Supported Providers

### Cloud Providers

- **OpenAI**: GPT-5.4 and GPT-5.5 with configurable reasoning effort (`none`, `low`, `medium`, `high`, `xhigh`)
- **Anthropic**: Claude 4/3.5 families (Opus, Sonnet, Haiku)
- **Gemini**: Gemini 2.5 and Gemini 3 preview models
- **Kimi Coding**: Kimi coding endpoint (Anthropic-compatible)
- **OpenRouter**: Access to 100+ models via unified API
- **Mistral**: Mistral models

### Local Providers

- **Ollama**: Local model execution
- **LM Studio**: Local model server

Curated online model IDs live in private backend implementation and are returned by `list-models`. The backend catalog is the source of truth for family labels, reasoning modes/defaults, dashboard card metadata, and provider capability flags such as native web-search or Codex OAuth support. Local model lists come from the running Ollama/LM Studio servers.

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
│  - GeminiProvider                        │
│  - KimiCodeProvider                       │
│  - OllamaProvider                        │
│  - OpenRouterProvider                    │
│  - MistralProvider                       │
│  - LMStudioProvider                      │
└─────────────────────────────────────────┘
```

## Configuration

### Provider Configuration

Configure providers in private backend implementation (AppConfig) and set API keys via environment variables:

**Runtime updates**: The frontend sends `update-settings` to update the session’s model/provider. Changes apply on the next query.

```python
from backend.src.core.config.models import (
    AppConfig,
    LLMProviders,
    OpenAIConfig,
    AnthropicConfig,
    GeminiConfig,
    OllamaConfig,
)

APP_CONFIG = AppConfig(
    model_provider="openai",
    model_mode="online",
    selected_model_id="gpt-5.4@@gpt-5-4-none-thinking",
    llm_providers=LLMProviders(
        openai=OpenAIConfig(model="gpt-5.4"),
        anthropic=AnthropicConfig(model="claude-sonnet-4-5-20250929"),
        gemini=GeminiConfig(model="gemini-2.5-flash"),
        ollama=OllamaConfig(base_url="http://localhost:11434/v1"),
    ),
)
```

### Environment Variables

Set API keys via environment variables:

```bash
export OPENAI_API_KEY="your-api-key"
export ANTHROPIC_API_KEY="your-api-key"
export GOOGLE_API_KEY="your-api-key"  # Gemini
export OPENROUTER_API_KEY="your-api-key"
export MISTRAL_API_KEY="your-api-key"
export KIMI_API_KEY="your-api-key"
```

## Usage

### Basic Usage

```python
from backend.src.llm.client import get_llm_client
from backend.src.core.config.models import AppConfig

config = AppConfig(...)
llm_client = get_llm_client(config)

# Non-streaming
response = await llm_client.get_completion(
    model="gpt-5.4",
    messages=[{"role": "user", "content": "Hello"}]
)

# Streaming
async for chunk in llm_client.get_completion_stream(
    model="gpt-5.4",
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

## Native Tool-Calling Contract

Migration contract for backend-native SDK tool calling.

### Canonical Tool Schema Object (Strict Replacement)

Tool schemas now use one canonical provider-facing shape:

```python
{
    "type": "function",
    "function": {
        "name": "tool_name",
        "description": "Optional description",
        "parameters": {...}  # JSON Schema object
    }
}
```

Legacy top-level tool schema shape (`{name, description, parameters}`) is removed from runtime-critical paths.

Canonical shape is required in:
- tool registry/schema production paths
- LLM request params (`tools`, optional `tool_choice`, optional `parallel_tool_calls`)
- transparency/event payloads that expose tool schemas
- provider transport boundaries (validation + forwarding)

OpenAI built-in exception:

- OpenAI Responses may still receive provider-native built-ins such as native `web_search`.
- Desktop tools use the same direct function-tool contract on OpenAI as they do on the canonical backend registry and other providers.

### Normalized Completion Response

`LiteLLMClient.get_completion_response()` returns:

- `content: str`
- `tool_calls?: List[{id: str, name: str, arguments: Dict[str, Any]}]`
- `finish_reason?: str | None`
- `response_id?: str`

Notes:
- `content` is always present (`""` when provider omits text).
- `tool_calls` is structured and validated before it leaves the client layer.
- `get_completion()` remains backward-compatible and returns only `content`.
- Runtime behavior: when tool schemas are present for a turn, backend uses non-stream `get_completion_response()` by default, but allows provider/model opt-in for safe stream tool turns. Anthropic, Gemini, Kimi Coding, and OpenAI Responses-native paths can stream `ThinkingEvent`/`ChunkEvent` while still finalizing structured `tool_calls` from the completed stream payload.
- Tool-call streaming invariant: normal and thinking tokens may stream live during
  tool-enabled turns, but partial tool-call deltas stay provider-internal until
  stream completion. The agent loop executes only finalized normalized
  `tool_calls`.
- Safety behavior for streamed tool turns: if streamed tool-call arguments cannot be parsed into valid JSON object arguments, backend emits an error plus synthetic tool output (history + frontend event) and keeps the interaction loop running so the model can self-correct. Backend still aborts turn for non-recoverable/system errors.
- Tool transparency behavior: ToolCall/ToolBundle frontend events include `metadata.model_facing_tool_call` (when available) with canonical `{id?, name, arguments}` so UI can render the exact model-facing tool call even if execution-time arguments were rewritten (for example coordinate resolution).
- OpenAI Responses continuation behavior: when a turn ends in tool outputs and the provider returned a `response_id`, WindieOS now continues the loop with `previous_response_id` and only the trailing tool outputs as standard function-tool outputs.
- OpenAI Responses stream recovery behavior: if OpenAI/LiteLLM streams visible `output_text` deltas but never delivers the terminal final response envelope, WindieOS now synthesizes a minimal normalized final payload from the streamed text instead of aborting the turn; truly empty broken streams still fail.
- OpenAI Responses history replay is role-normalized: `system`/`user` content is sent back as input items, assistant history text is replayed as `output_text`/`refusal` only, and unsupported assistant-only blocks (for example stray reasoning/thinking fragments from partial turns or transcript drift) are dropped instead of being resent as malformed prompt history.
- Text-bearing content normalization is shared across replay, provider payload parsing, converter utilities, and fallback token estimation so `text`, `input_text`, `output_text`, and assistant `refusal` blocks stay visible and countable across cancellation, rehydrate, and provider-specific follow-up turns.
- Stored history now keeps replay-safe structured content alongside its legacy flattened text field where available, so provider replay can preserve assistant `output_text`/`refusal` blocks and structured user/tool multimodal content without forcing compaction, transcript inspection, or token-cache code to stop using the existing string-backed history field.
- Live tool rows with screenshots still use structured multimodal `image_data`; artifact-backed user attachments stay as refs in history and are resolved into bounded image payloads during prompt construction.
- Token usage behavior: backend now captures provider usage for both streaming and non-stream turns and emits `token-count` with split fields (`visible_output_tokens`, `thinking_tokens`, `output_tokens_total`) plus `usage_source` (`provider` or `estimated`). For providers exposing cache diagnostics, it also emits `cached_tokens`, `cache_hit`, and `cache_status`.
- Kimi cache steering: for `kimi-coding`, backend sets a stable `prompt_cache_key` (prefers `conversation_ref`, falls back to `session_id`) to improve automatic context cache hit rates.

### LLM Message Typing (History / Follow-up Turns)

Canonical message union now supports:

- `system` and `user` messages with text/multimodal content.
- `assistant` messages with optional `tool_calls`.
- `tool` role messages with `tool_call_id` + `content` for tool results.

This enables follow-up turns that continue after tool execution without text-JSON parser coupling.

### Cutover Rules

- Native SDK tool-calling is always-on in runtime-critical paths.
- Provider request/response behavior uses structured `tool_calls` only (no parser fallback path).
- Anthropic and Gemini share one provider-native `thinking` request helper so native reasoning enable/disable policy stays aligned across those providers.

## Provider Details

### OpenAI

**Models**: `gpt-5.4` and `gpt-5.5` exposed as reasoning presets for `none`, `low`, `medium`, `high`, and `xhigh`

Native web-search runtime note:
- For OpenAI models that advertise native web-search support, WindieOS now attaches OpenAI Responses `web_search` directly to the main agent request instead of exposing backend logical `web_search` as a model-facing function tool.
- This matches Codex-style behavior: the same OpenAI turn can browse natively, stream search-progress events, and return normalized source metadata without a second backend-owned LLM sub-call.

**Configuration**:
```python
from backend.src.core.config.models import AppConfig, LLMProviders, OpenAIConfig

APP_CONFIG = AppConfig(
    model_provider="openai",
    selected_model_id="gpt-5.4@@gpt-5-4-none-thinking",
    llm_providers=LLMProviders(
        openai=OpenAIConfig(model="gpt-5.4", api_key_env="OPENAI_API_KEY"),
    ),
)
```

**Features**:
- Streaming responses
- Token usage tracking
- All curated OpenAI GPT-5.4/GPT-5.5 presets use the OpenAI Responses API
- Reasoning effort is preset-scoped and maps to `none`, `low`, `medium`, `high`, or `xhigh`
- OpenAI chat-completions and Responses transports now share one schema-compatibility preparation layer for model-facing function tools
- OpenAI Responses reasoning config is fail-closed: curated thinking presets must carry explicit `reasoning_mode` metadata instead of relying on display-name inference
- Provider-native reasoning summary/text stream events are forwarded as `ThinkingEvent` when the model exposes them

### Anthropic

**Models**: `claude-opus-4-1-20250805`, `claude-opus-4-20250514`, `claude-sonnet-4-5-20250929`, `claude-sonnet-4-20250522`, `claude-haiku-4-5-20251001`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`, `claude-3-opus-20240229`, `claude-3-sonnet-20240229`, `claude-3-haiku-20240307`

**Configuration**:
```python
from backend.src.core.config.models import AppConfig, LLMProviders, AnthropicConfig

APP_CONFIG = AppConfig(
    model_provider="anthropic",
    selected_model_id="claude-sonnet-4-5-20250929",
    llm_providers=LLMProviders(
        anthropic=AnthropicConfig(
            model="claude-sonnet-4-5-20250929",
            api_key_env="ANTHROPIC_API_KEY",
        ),
    ),
)
```

**Features**:
- Long context windows
- Thinking tokens (reasoning)
- Streaming responses
- Thinking-capable presets send Anthropic's native `thinking` request payload with a bounded token budget
- Provider-native `thinking` / `thinking_delta` stream content is surfaced as `ThinkingEvent`

### Gemini

**Models**: `gemini-3.1-pro-preview`, `gemini-3-flash-preview`, `gemini-2.5-pro`, `gemini-2.5-flash`, `gemini-2.5-flash-lite`

**Configuration**:
```python
from backend.src.core.config.models import AppConfig, LLMProviders, GeminiConfig

APP_CONFIG = AppConfig(
    model_provider="gemini",
    selected_model_id="gemini-2.5-flash",
    llm_providers=LLMProviders(
        gemini=GeminiConfig(model="gemini-2.5-flash", api_key_env="GOOGLE_API_KEY"),
    ),
)
```

**Features**:
- Streaming responses
- Thinking tokens (Gemini 2.5 models)
- Thinking-capable presets send Gemini's native `thinking` request payload with a bounded token budget
- Provider-native thought blocks are surfaced as `ThinkingEvent`, while thought-tagged text is filtered out of normal visible text chunks

### Kimi Coding

**Models**: `k2p5`

**Configuration**:
```python
from backend.src.core.config.models import AppConfig, LLMProviders, KimiCodingConfig

APP_CONFIG = AppConfig(
    model_provider="kimi-coding",
    selected_model_id="k2p5",
    llm_providers=LLMProviders(
        kimi_coding=KimiCodingConfig(
            model="k2p5",
            api_key_env="KIMI_API_KEY",
            base_url="https://api.kimi.com/coding/v1",
        ),
    ),
)
```

Base URL note:
- `https://api.kimi.com/coding` and `https://api.kimi.com/coding/v1` are both accepted in config; provider canonicalizes to `/coding` at runtime.

**Features**:
- Anthropic-compatible API
- Optimized for coding tasks
- Upstream outage handling: HTTP 520 responses are normalized to retry-friendly API errors (instead of forwarding raw HTML error pages).

### Ollama

**Models**: Any Ollama model (e.g., `llama-2-7b`, `mistral-7b`)

**Configuration**:
```python
from backend.src.core.config.models import AppConfig, LLMProviders, OllamaConfig

APP_CONFIG = AppConfig(
    model_mode="local",
    model_provider="ollama",
    selected_model_id="llama3",
    llm_providers=LLMProviders(
        ollama=OllamaConfig(
            model="llama3",
            base_url="http://localhost:11434/v1",
        ),
    ),
)
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
```python
from backend.src.core.config.models import AppConfig, LLMProviders, OpenRouterConfig

APP_CONFIG = AppConfig(
    model_provider="openrouter",
    selected_model_id="openrouter/auto",
    llm_providers=LLMProviders(
        openrouter=OpenRouterConfig(
            model="openrouter/auto",
            api_key_env="OPENROUTER_API_KEY",
            base_url="https://openrouter.ai/api/v1",
        ),
    ),
)
```

**Features**:
- Unified API for multiple providers
- Model routing
- Cost optimization

### Mistral

**Models**: `mistral-large-latest`, `mistral-small-latest`

**Configuration**:
```python
from backend.src.core.config.models import AppConfig, LLMProviders, MistralConfig

APP_CONFIG = AppConfig(
    model_provider="mistral",
    selected_model_id="mistral-large-latest",
    llm_providers=LLMProviders(
        mistral=MistralConfig(
            model="mistral-large-latest",
            api_key_env="MISTRAL_API_KEY",
        ),
    ),
)
```

**Features**:
- High performance
- Streaming responses

### LM Studio

**Models**: Any model supported by LM Studio

**Configuration**:
```python
from backend.src.core.config.models import AppConfig, LLMProviders, LMStudioConfig

APP_CONFIG = AppConfig(
    model_mode="local",
    model_provider="lmstudio",
    selected_model_id="",
    llm_providers=LLMProviders(
        lmstudio=LMStudioConfig(
            base_url="http://localhost:1234/v1",
        ),
    ),
)
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
from backend.src.core.events.streaming_events import ChunkEvent, ThinkingEvent, ErrorEvent

async for event in llm_client.get_completion_stream(
    model="gpt-5.4",
    messages=messages
):
    if isinstance(event, ChunkEvent):
        print(event.content, end="", flush=True)
    elif isinstance(event, ThinkingEvent):
        print(f"[thinking] {event.content}")
    elif isinstance(event, ErrorEvent):
        print(f"Error: {event.content}")
```

### Streaming Events

**Chunk Event**:
```python
ChunkEvent(content="chunk")
```

**Thinking Event**:
```python
ThinkingEvent(content="reasoning")
```

Provider-native reasoning behavior:
- WindieOS only emits `ThinkingEvent` when the provider actually streams reasoning/thought content.
- OpenAI thinking-capable models use the Responses API runtime and emit provider-native reasoning summary/text events instead of synthetic placeholders.
- Anthropic thinking-capable models emit native thinking blocks.
- Gemini thinking-capable models emit native thought blocks while visible assistant text stays separated into normal chunk events.

**Error Event**:
```python
ErrorEvent(content="error message")
```

## Tool Calling (Native API Tool Objects)

### Tool Schema Injection

Tool schemas are passed to LiteLLM via request params:
- `tools`
- optional `tool_choice`
- optional `parallel_tool_calls`

Canonical schema shape:
```json
{
  "type": "function",
  "function": {
    "name": "read_file",
    "description": "Read file contents",
    "parameters": {
      "type": "object",
      "properties": {
        "file_path": { "type": "string" }
      },
      "required": ["file_path"]
    }
  }
}
```

### Tool Call Format

Provider responses are normalized to:
```json
{
  "content": "",
  "tool_calls": [
    {
      "id": "call_123",
      "name": "read_file",
      "arguments": { "file_path": "/tmp/a.txt" }
    }
  ],
  "finish_reason": "tool_calls"
}
```

### Tool Calling Flow

1. Backend sends canonical `tools[]` to provider.
2. Provider returns structured tool calls.
3. Backend executes tool orchestration path.
4. Tool results are appended to history with `role=tool` + `tool_call_id`.
5. LLM receives follow-up context and returns final response.

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
        model="gpt-5.4",
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
- Configuration Guide (private backend docs)
- [API Reference](../reference/api_reference.md)
- Backend Architecture (private backend docs)
