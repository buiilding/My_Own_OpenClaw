# Services Documentation

## Overview

This document provides comprehensive documentation for all services in Desktop Assistant, including vision, TTS, wakeword, context factory, agent factory, and GPU memory management.

## Vision Service

### Overview

The Vision Service (`backend/src/services/vision/vision_service.py`) manages the InternVL vision model instance for UI grounding and coordinate prediction. It provides a singleton instance that is initialized at server startup for fast first-time use.

### Architecture

```
VisionService
├── InternVLModel (singleton)
│   ├── Model Loading (async, in thread pool)
│   ├── GPU/CPU Device Selection (auto)
│   └── Trust Remote Code (enabled)
├── Initialization Lock (asyncio.Lock)
│   └── Prevents race conditions
└── State Management
    ├── _initialized (bool)
    ├── _model (InternVLModel | None)
    └── _initialization_error (str | None)
```

### Key Features

- **Thread-Safe Initialization**: Uses `asyncio.Lock` to prevent concurrent initialization (double VRAM usage)
- **Pre-Loading**: Model initialized at startup for fast first-time use
- **GPU Memory Management**: Model unloading support to free VRAM
- **Graceful Fallback**: Returns False if dependencies unavailable

### Usage

```python
from backend.src.services.vision.vision_service import VisionService

# Initialize service
vision_service = VisionService(model_name="OpenGVLab/InternVL3_5-4B")
await vision_service.initialize()

# Use model
if vision_service.is_initialized:
    model = vision_service.model
    # Use model for coordinate prediction
    coordinates = model.predict_coordinates(screenshot, description)
```

### Methods

#### `initialize() -> bool`

Initialize the InternVL model. Should be called during server startup.

- **Thread-Safe**: Uses lock to prevent concurrent initialization
- **Returns**: True if successful, False otherwise
- **Side Effects**: Loads model into GPU/CPU memory

#### `unload_model() -> bool`

Unload the InternVL model to free VRAM/system RAM.

- **Thread-Safe**: Uses lock to prevent conflicts with initialization
- **Returns**: True if model was unloaded, False if no model loaded
- **Side Effects**: Frees GPU memory, triggers garbage collection

#### Properties

- `model`: Get initialized InternVL model instance (None if not initialized)
- `is_initialized`: Check if service is initialized
- `initialization_error`: Get error message if initialization failed

### Integration

Used by:
- `ToolPreparer`: For coordinate resolution with `find_coordinates_by="prediction"`
- `VisionResolver`: For UI element detection from screenshots
- `mouse_control` tool: For intelligent coordinate prediction

### InternVL Model Implementation

**InternVLModel** (`services/vision/internvl.py`):
- Generic Hugging Face vision-language model handler
- Based on CoAct-1's implementation, adapted for desktop assistant
- Supports InternVL models (e.g., InternVL3_5-4B)

**Key Methods**:
- `predict_click_coordinates(screenshot_data, description)`: Predict click coordinates
  - Takes base64 screenshot and text description
  - Returns (x, y) pixel coordinates
  - Uses normalized coordinates (0-1000) internally, scales to pixels

**Coordinate Extraction** (`services/vision/coordinates.py`):
- `extract_first_point(text)`: Extract first [[x,y]] from model output
- `extract_last_bbox(text)`: Extract last [[x1,y1,x2,y2]] from model output
- `scale_norm_to_pixels(x_norm, y_norm, width, height)`: Scale normalized to pixels

**Features**:
- FlashAttention2 support (if available)
- CUDA/CPU device selection (auto)
- BFloat16 precision for GPU, Float32 for CPU
- Device map auto-placement for multi-GPU systems
- Inference lock for thread-safe inference

## TTS Service

### Overview

The TTS Service (`backend/src/core/services/tts_service.py`) provides text-to-speech synthesis using Piper TTS for local, low-latency synthesis. It handles sentence detection from text streams and processes sentences in a background thread.

### Architecture

```
TTSService
├── PiperVoice (model)
│   ├── CUDA/CPU Selection (auto with fallback)
│   └── Model Loading (in thread pool)
├── Background Worker Thread
│   ├── Input Queue (sentences to synthesize)
│   └── Synthesis Loop
├── Async Audio Queue
│   └── Audio chunks for streaming
├── Sentence Buffer
│   ├── Buffer Parts (list)
│   ├── Delimiters (., !, ?, \n, ;, :)
│   └── MAX_BUFFER_SIZE (500 chars, DOS protection)
└── Completion Tracking
    └── Async Event (replaces polling)
```

### Key Features

- **Sentence Detection**: Buffers text and splits on natural delimiters
- **DOS Protection**: Hard limit (500 chars) on buffer size to prevent OOM attacks
- **CUDA Fallback**: Automatic CPU fallback on GPU errors with periodic retry (5 min intervals)
- **Thread-Safe**: Background worker thread for synthesis, async queue for audio chunks
- **Completion Tracking**: Async event-based completion detection (replaces busy-wait polling)

### Usage

```python
from backend.src.core.services.tts_service import TTSService

# Initialize service
tts_service = TTSService(config)
await tts_service.initialize()

# Process text chunks
await tts_service.process_text("Hello world. How are you?")

# Flush remaining text
await tts_service.flush()

# Wait for completion
await tts_service.wait_until_finished(timeout=10.0)

# Stream audio chunks
async for audio_chunk in tts_service.stream_audio():
    # Send to frontend
    await websocket.send(audio_chunk)
```

### Methods

#### `initialize() -> None`

Initialize the TTS service with Piper model.

- Loads model in thread pool (non-blocking)
- Starts background worker thread
- Initializes audio queue and completion event
- Attempts CUDA first, falls back to CPU on error

#### `process_text(text_chunk: str) -> None`

Process a text chunk: buffer -> detect sentences -> queue for synthesis.

- **Thread-Safe**: Uses lock to protect buffer access
- **Sentence Detection**: Splits on delimiters (., !, ?, \n, ;, :)
- **DOS Protection**: Forces split if buffer exceeds 500 chars

#### `flush() -> None`

Flush any remaining text in the buffer.

- Queues remaining text for synthesis
- Sends sentinel to signal end of stream
- Waits for processing to complete (with timeout)

#### `wait_until_finished(timeout: float = 10.0) -> bool`

Wait until all queued text has been processed.

- **Returns**: True if completed, False if timeout
- **Replaces**: Busy-wait polling with async event

#### `stream_audio() -> AsyncGenerator[Dict[str, Any], None]`

Stream generated audio chunks from the queue.

- Yields audio data dictionaries
- Includes: audio (base64), sample_rate, sample_width, channels

### Sentence Detection

The service buffers text and splits on natural delimiters:

- **Delimiters**: `.`, `!`, `?`, `\n`, `;`, `:`
- **Special Handling**: Period (`.`) not split if followed by alphanumeric (handles `.env`, `file.txt`)
- **DOS Protection**: Forces split at 500 chars if no delimiter found
- **Buffer Management**: Remaining text kept in buffer until delimiter found

### CUDA Fallback

The service automatically handles CUDA errors:

1. **Initial Load**: Attempts CUDA first, falls back to CPU on error
2. **Runtime Errors**: Detects CUDA errors during synthesis, reloads with CPU
3. **Periodic Retry**: Background task retries CUDA every 5 minutes
4. **Error Detection**: Checks for ONNXRuntimeError, CUBLAS, CUDNN errors

### Integration

Used by:
- `TTSManager`: Manages TTS lifecycle for query handlers
- `TTSProcessor`: Filters tool calls from speech output
- `WakewordHandler`: Generates TTS audio for greetings

## Wakeword Service

### Overview

The Wakeword Service (`backend/src/core/services/wakeword_service.py`) provides wakeword activation logic and greeting selection policy. It encapsulates policy decisions about how to greet users when wakeword is detected.

### Architecture

```
WakewordService
├── Config (AppConfig)
│   └── wakeword_greetings (list)
└── Methods
    ├── select_greeting() -> str
    └── get_activation_payload() -> Dict
```

### Usage

```python
from backend.src.core.services.wakeword_service import WakewordService

# Initialize service
wakeword_service = WakewordService(config)

# Select greeting
greeting = wakeword_service.select_greeting()

# Get activation payload
payload = wakeword_service.get_activation_payload(greeting)
```

### Methods

#### `select_greeting() -> str`

Select a random greeting from configured greetings.

- **Returns**: Selected greeting string
- **Fallback**: "Hello! I'm listening." if no greetings configured

#### `get_activation_payload(greeting: str) -> Dict[str, Any]`

Build wakeword activation response payload.

- **Returns**: Dictionary with activation settings
- **Fields**: voice_mode_enabled, speech_mode_enabled, greeting, status

### Integration

Used by:
- `WakewordHandler`: When wakeword is detected
- Activates voice mode and speech mode
- Sends greeting to frontend

## Context Factory

### Overview

The Context Factory (`backend/src/core/services/context_factory.py`) provides a centralized service for creating execution contexts. It ensures consistent service injection and context structure across the system.

### Architecture

```
ContextFactory
├── Config (AppConfig)
├── Tool Registry (optional)
├── Session Reference (optional)
├── Agent Factory (optional)
└── Vision Service (optional)
```

### Usage

```python
from backend.src.core.services.context_factory import ContextFactory

# Initialize factory
context_factory = ContextFactory(
    config=config,
    tool_registry=tool_registry,
    session_ref=session,
    agent_factory=agent_factory
)

# Set vision service
context_factory.set_vision_service(vision_service)

# Create tool context
tool_context = context_factory.create_tool_context(
    user_id="user123",
    session_id="session456",
    workspace_root="/path/to/workspace"
)
```

### Methods

#### `create_tool_context(...) -> ToolContext`

Create a tool execution context with all required services.

**Parameters**:
- `user_id`: User identifier
- `session_id`: Session identifier
- `workspace_root`: Optional workspace root path (defaults to current directory)
- `session_ref`: Optional session reference (overrides factory default)
- `additional_services`: Optional additional services to inject

**Services Injected**:
- Config
- Tool registry
- Session reference
- Agent factory
- Vision service
- Additional custom services

#### `set_tool_registry(tool_registry) -> None`

Set the tool registry (for resolving circular dependencies).

#### `set_vision_service(vision_service) -> None`

Set the vision service (pre-initialized InternVL model).

#### `update_session_ref(session_ref) -> None`

Update the default session reference for this factory.

### Integration

Used by:
- `ToolOrchestrator`: For creating tool execution contexts
- `AgentExecutor`: For context creation in agent interactions
- All tool execution: Provides consistent context structure

## Agent Factory

### Overview

The Agent Factory (`backend/src/core/services/agent_factory.py`) provides a factory for creating lightweight, scoped agent sessions (sub-agents) that share heavy resources with their parent but have restricted tools and custom personas.

### Architecture

```
AgentFactory
└── create_agent()
    ├── RestrictedToolRegistry
    │   ├── Parent Registry
    │   └── Allowed Tools (filtered)
    ├── Sub-Session ID
    │   └── Format: {parent_id}_{name}_{uuid}
    └── AgentSession
        ├── Shared Resources
        │   ├── LLM Client
        │   ├── Tool Orchestrator
        │   └── Event Bus
        └── Custom System Prompt
```

### Usage

```python
from backend.src.core.services.agent_factory import AgentFactory

# Initialize factory
agent_factory = AgentFactory()

# Create sub-agent
sub_agent = agent_factory.create_agent(
    name="code_reviewer",
    system_prompt="You are a code review assistant...",
    parent_session=main_session,
    tools=["read_file", "search_file_content"]
)

# Use sub-agent
result = await sub_agent.process_query("Review this code...")
```

### Methods

#### `create_agent(...) -> AgentSession`

Create a new sub-agent session sharing resources with the parent.

**Parameters**:
- `name`: Name of the sub-agent (for logging/identity)
- `system_prompt`: Custom system prompt for the agent's persona
- `parent_session`: The parent AgentSession to inherit resources from
- `tools`: List of allowed tool names (None = no tools)

**Returns**: A new, configured AgentSession ready to run

### Features

- **Resource Sharing**: Sub-agents share LLM client, tool orchestrator, event bus
- **Tool Restriction**: RestrictedToolRegistry filters available tools
- **Custom Personas**: Each sub-agent can have custom system prompt
- **Session Isolation**: Each sub-agent has unique session ID

### Integration

Used by:
- Main agent: For creating specialized sub-agents
- Multi-agent workflows: For parallel agent execution
- Domain-specific tasks: For focused agent instances

## Token Service

### Overview

The Token Service (`services/token_service.py`) provides token counting functionality for conversation messages using LiteLLM.

### Usage

```python
from backend.src.services.token_service import get_token_service

token_service = get_token_service()

# Count tokens in message list
token_count = token_service.count_tokens(messages, model="gpt-4o")

# Count tokens in single message
message_tokens = token_service.count_message_tokens(message, model="gpt-4o")
```

### Methods

#### `count_tokens(messages, model) -> int`

Count total tokens in a list of messages, including image tokens.

**Parameters**:
- `messages`: List of LLMMessage objects (dict or TypedDict)
- `model`: Model name for token counting (default: "gpt-3.5-turbo")

**Returns**: Total token count including image tokens

**Features**:
- Uses LiteLLM's token counter with image token counting enabled
- Fallback estimation (4 chars per token) if counting fails
- Handles multimodal content (text and images)

#### `count_message_tokens(message, model) -> int`

Count tokens in a single message.

**Parameters**:
- `message`: Single LLMMessage object or dict
- `model`: Model name for token counting

**Returns**: Token count for the message

### Performance Notes

- Message list conversion happens on every call
- For large contexts, consider caching converted message lists
- LiteLLM should handle tokenizer caching internally
- List comprehension used for performance (faster than append loop)

### Integration

Used by:
- `LLMInteractionHandler`: For token counting during streaming
- `ConversationHistory`: For token count tracking
- `TokenCountEvent`: For displaying token usage to users

## GPU Memory Manager

### Overview

The GPU Memory Manager (`backend/src/core/services/gpu_memory_manager.py`) provides centralized GPU memory management to prevent allocation failures when multiple services compete for GPU memory.

### Architecture

```
GPUMemoryManager (static methods)
├── PyTorch Support
│   ├── CUDA Cache Clearing
│   └── Memory Info
└── ONNX Runtime Support
    └── Cache Management
```

### Usage

```python
from backend.src.core.services.gpu_memory_manager import GPUMemoryManager

# Get memory info
info = GPUMemoryManager.get_memory_info()
# Returns: {total_gb, allocated_gb, reserved_gb, free_gb, usage_percent}

# Log memory info
GPUMemoryManager.log_memory_info("Before model load")

# Clear caches (ONLY for OOM recovery or model unloading)
GPUMemoryManager.clear_pytorch_cache()  # Warning: performance impact
GPUMemoryManager.clear_all_caches()
```

### Methods

#### `clear_pytorch_cache() -> None`

Clear PyTorch CUDA cache to free up GPU memory.

**WARNING**: Should ONLY be used for:
- OOM (Out of Memory) recovery
- Model unloading/uninitialization
- Explicit memory management during shutdown

**PERFORMANCE**: Calling this routinely causes GPU cache thrashing:
- Forces PyTorch to release cached memory back to OS
- Next inference triggers expensive cudaMalloc calls
- Significantly slows down subsequent operations

#### `clear_onnxruntime_cache() -> None`

Clear ONNX Runtime CUDA cache (managed internally).

#### `clear_all_caches() -> None`

Clear all GPU memory caches (PyTorch, ONNX Runtime, etc.).

#### `get_memory_info() -> Optional[dict]`

Get current GPU memory usage information.

**Returns**: Dictionary with memory statistics or None if GPU unavailable

#### `log_memory_info(context: str = "") -> None`

Log current GPU memory usage information.

### Important Notes

- **Cache Clearing**: Should ONLY be used for OOM recovery or model unloading
- **Routine Use**: Causes GPU cache thrashing and performance degradation
- **Automatic Management**: PyTorch manages GPU memory automatically and efficiently

### Integration

Used by:
- Vision Service: For model unloading
- TTS Service: For memory management
- Any service using GPU: For memory monitoring

---

For more information, see:
- [Backend Architecture](BACKEND_ARCHITECTURE.md)
- [Tool System](TOOL_SYSTEM.md)
- [Configuration Guide](CONFIGURATION.md)
