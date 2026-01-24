# Backend Architecture

## Overview

The backend is built using Python 3.9+ with FastAPI, following clean architecture principles. It uses dependency injection, protocol-based interfaces, and a plugin system for extensibility.

## Directory Structure

```
backend/src/
├── agent/              # Agent domain (core intelligence)
│   ├── core/          # Core agent state & execution
│   │   ├── core.py    # AgentSession
│   │   ├── executor.py  # AgentExecutor
│   │   ├── interaction_loop.py  # InteractionLoop
│   │   ├── state.py   # ConversationHistory
│   │   └── session_manager.py  # SessionManager
│   ├── llm/           # LLM interaction, prompts, events
│   │   ├── prompt_coordinator.py
│   │   ├── llm_interaction_handler.py
│   │   └── event_presenter.py
│   ├── tools/         # Tool orchestration & preparation
│   │   ├── tool_executor.py
│   │   ├── tool_preparer.py
│   │   ├── result_transformer.py
│   │   ├── screenshot_manager.py
│   │   ├── ocr_coordinator.py
│   │   ├── vision_service_provider.py
│   │   └── resolvers/  # Coordinate resolution
│   ├── history/       # Agent memory & state mutation
│   │   └── history_committer.py
│   └── plugins/      # Plugin system
│       ├── manager.py
│       ├── interface.py
│       └── ocr_plugin.py
├── tools/             # Tools domain (registry, loader, tools)
│   ├── registry.py   # ToolRegistry
│   ├── orchestrator.py  # ToolOrchestrator
│   ├── remote.py     # Remote tool stubs
│   └── schema_registry.py  # Tool schema management
├── memory/            # Memory domain (storage, retrieval)
│   ├── embeddings.py  # EmbeddingsService
│   └── README.md     # Memory system documentation
├── llm/               # LLM domain (client, prompts)
│   ├── client.py     # LLMClient abstraction
│   ├── parser.py     # ResponseParser
│   ├── prompts/      # Prompt construction
│   └── providers/   # LLM provider implementations
├── api/               # API layer (routes, dependencies)
│   ├── routes/       # FastAPI routes
│   ├── handlers/     # Message handlers
│   ├── schema.py     # Pydantic models
│   └── deps.py       # Dependency injection
├── core/              # Core infrastructure
│   ├── container.py   # DI container
│   ├── config/        # Configuration management
│   ├── bootstrap/     # System initialization
│   ├── plugins/       # Plugin registry
│   ├── services/      # Core services
│   └── interfaces/    # Protocol interfaces
├── sdk/               # SDK for tool development
│   ├── tool.py        # Base Tool class
│   ├── context.py     # Context classes
│   └── errors.py      # SDK exceptions
└── main.py            # Application entry point
```

## Core Components

### Agent System

#### AgentSession (`agent/core/core.py`)

The main agent class for orchestrating tasks with tool support.

**Responsibilities**:
- Manage conversation history and context
- Coordinate LLM interactions with tool calls
- Stream responses back to clients
- Persist conversation memory
- Handle session lifecycle events
- Use centralized tool result storage

**Key Methods**:
- `process_query()`: Process user query and yield events
- `update_config()`: Update configuration at runtime
- `get_screenshot()`: Get current screenshot
- `get_current_screenshot_id()`: Get screenshot ID

**Tool Result Storage**:
- Uses centralized `ToolResultStorage` class for managing pending results
- Automatic TTL-based cleanup (5 minutes) to prevent memory leaks
- Weak references for futures to allow garbage collection

#### AgentExecutor (`agent/core/executor.py`)

Orchestrates the execution of agent interactions.

**Responsibilities**:
- Format user messages with context
- Process user message screenshots
- Run interaction loop
- Handle errors and cleanup

**Key Methods**:
- `process_query()`: Main entry point for query processing
- `_is_first_user_message()`: Check if first message

#### InteractionLoop (`agent/core/interaction_loop.py`)

Main interaction loop for agent reasoning.

**Responsibilities**:
- Run agent reasoning loop
- Handle tool calls and results
- Manage conversation state
- Stream events to clients

**Key Methods**:
- `run_loop()`: Main interaction loop
- `_handle_tool_results()`: Process tool execution results

#### ToolResultStorage (`agent/core/tool_result_storage.py`)

Centralized storage for tool execution results.

**Responsibilities**:
- Manage pending tool results
- Manage tool result futures for async waiting
- Manage bundled results
- Automatic TTL-based cleanup (5 minutes default)
- Memory leak prevention with weak references

**Key Methods**:
- `store_pending_result()`: Store pending result
- `get_pending_result()`: Retrieve pending result
- `create_result_future()`: Create future for async waiting
- `set_result()`: Set result and resolve future
- `store_bundled_result()`: Store bundled result
- `cleanup_old_results()`: Clean up expired results

**Performance Features**:
- Weak references for futures to allow garbage collection
- Automatic cleanup prevents memory leaks in long-running sessions
- Single source of truth for all tool result storage

### Tool System

#### ToolRegistry (`tools/registry.py`)

Registry for managing tools in the Desktop Assistant.

**Responsibilities**:
- Register and manage tool instances
- Provide tool schemas for LLM
- Manage remote tool stubs
- Create tool execution contexts

**Key Methods**:
- `register_tool()`: Register a tool
- `get_tool()`: Get tool by name
- `get_all_tool_schemas()`: Get all tool schemas
- `create_context()`: Create execution context

#### ToolOrchestrator (`tools/orchestrator.py`)

Orchestrates tool execution requests.

**Responsibilities**:
- Coordinate tool execution
- Handle coordinate resolution
- Manage communication with frontend
- Wait for tool results

**Key Methods**:
- `execute_tools_from_response()`: Execute tools from parsed response
- `_wait_for_tool_result()`: Wait for frontend tool result

#### ToolPreparer (`agent/tools/tool_preparer.py`)

Prepares tool calls for execution.

**Responsibilities**:
- Ensure screenshots are available
- Coordinate OCR processing
- Resolve coordinates for visual tools
- Prepare tool calls with metadata
- Use shallow copy optimization for PreparedToolCall creation

**Key Methods**:
- `prepare_tool_calls()`: Prepare tool calls from parsed response
- `_ensure_screenshot()`: Ensure screenshot is available
- `_resolve_coordinates()`: Resolve coordinates for tools

**Performance Optimizations**:
- Shallow copy instead of deep copy for PreparedToolCall parameters
- Parameters are typically simple values (str, int, bool, float)
- Reduces overhead per tool call, especially in multi-tool scenarios

#### OcrCoordinator (`agent/tools/ocr_coordinator.py`)

Coordinates OCR result acquisition and waiting for proactive OCR.

**Responsibilities**:
- Get OCR results for screenshots
- Wait for proactive OCR to complete
- Verify screenshot ID matches to prevent race conditions
- Fallback to on-demand OCR if proactive OCR fails

**Key Methods**:
- `get_ocr_results(session, screenshot_data, screenshot_id)`: Get OCR results
  - Waits for proactive OCR with timeout (5 seconds)
  - Verifies screenshot ID matches to prevent stale results
  - Falls back to on-demand OCR if proactive OCR fails or times out

**Features**:
- **Proactive OCR**: Waits for background OCR triggered by ToolResultHandler
- **Screenshot ID Verification**: Prevents using OCR results from different screenshots
- **Timeout Protection**: 5-second timeout prevents infinite hang if OCR worker fails
- **Fallback OCR**: Runs on-demand OCR if proactive OCR unavailable or failed

#### PreparedToolCall (`agent/tools/prepared_tool_call.py`)

Represents a tool call after preparation (coordinate resolution, etc.).

**Purpose**: Immutable structure containing resolved parameters ready for execution.

**Fields**:
- `original_call`: Original ParsedToolCall (preserved for reference)
- `tool_name`: Tool name
- `parameters`: Resolved parameters (shallow copy for performance)
- `raw_call`: Raw tool call string
- `metadata`: Optional metadata (request_id, etc.)

**Key Methods**:
- `from_parsed_call()`: Create from ParsedToolCall (uses shallow copy)
- `to_parsed_call()`: Convert back to ParsedToolCall format

#### SyntheticResultFactory (`agent/tools/synthetic_result_factory.py`)

Creates synthetic tool results for error handling.

**Purpose**: Pure factory for creating error ToolResult objects.

**Key Methods**:
- `create(tool_call, error_msg)`: Create synthetic error result
  - Creates pre-formatted error result for coordinate resolution failures
  - No system context or screenshot needed for error results

**Features**:
- Pure function: no side effects, deterministic output
- Pre-formatted for history (metadata flag set)
- Used when coordinate resolution fails

### LLM System

#### LLMClient (`llm/client.py`)

Abstraction layer for communicating with LLM providers.

**Responsibilities**:
- Provide unified interface for LLM interactions
- Handle streaming responses
- Manage provider instances
- Handle errors and retries

**Key Methods**:
- `get_completion()`: Get non-streaming completion
- `get_completion_stream()`: Get streaming completion

#### ResponseParser (`llm/parser.py`)

Parses LLM responses and extracts tool calls.

**Responsibilities**:
- Parse LLM response text
- Extract tool calls
- Validate tool call schemas
- Handle parsing errors

**Key Methods**:
- `parse_response()`: Parse LLM response
- `_extract_tool_calls()`: Extract tool calls from text

#### PromptConstructor (`llm/prompts/prompt_constructor.py`)

Constructs prompts for LLM interactions.

**Responsibilities**:
- Format system prompts
- Format user messages with context
- Include memory and system state
- Manage prompt templates

**Key Methods**:
- `format_user_message_content()`: Format user message
- `build_system_prompt()`: Build system prompt
- `_include_memory()`: Include relevant memories

#### PromptCoordinator (`agent/llm/prompt_coordinator.py`)

Manages prompt preparation and caching for the agent interaction loop.

**Responsibilities**:
- Build full prompt with metadata on first iteration
- Cache tool schemas and metadata
- Return cached history on subsequent iterations (O(1) access)

**Key Methods**:
- `get_prompt(iteration)`: Get prompt, tool schemas, and metadata
  - First iteration: Builds full prompt with metadata and caches it
  - Subsequent iterations: Returns cached history directly (O(1))

**Performance**:
- Caches tool schemas and metadata after first iteration
- Uses O(1) history retrieval for subsequent iterations
- Logs timing information for performance monitoring

#### LLMInteractionHandler (`agent/llm/llm_interaction_handler.py`)

Handles LLM streaming, text aggregation, and token counting.

**Responsibilities**:
- Stream LLM responses
- Aggregate text chunks
- Count tokens (input, output, total, conversation)
- Handle rate limiting errors

**Key Methods**:
- `get_response(prompt)`: Stream LLM response and yield events
  - Yields: ChunkEvent, ThinkingEvent, ErrorEvent, FullResponseEvent, TokenCountEvent
  - Aggregates full text for final response
  - Counts tokens using TokenService

**Features**:
- Real-time streaming with first token latency tracking
- Token counting for all message types
- Rate limit error handling
- Performance timing logs

#### EventPresenter (`agent/llm/event_presenter.py`)

Formats and emits all frontend/UI events for the agent interaction loop.

**Responsibilities**:
- Present prompt metadata events (system prompt, user message, tool schemas)
- Present assistant message events
- Present completion events

**Key Methods**:
- `present_prompt_metadata(metadata)`: Present transparency events (first iteration only)
- `present_assistant_message(content)`: Present full assistant message
- `present_completion(final_response)`: Present completion event

**Events Emitted**:
- SystemPromptEvent: System prompt for transparency
- UserMessageFullEvent: Full user message with metadata
- ToolSchemasEvent: Tool schemas for transparency
- AssistantMessageFullEvent: Full assistant message
- StreamingCompleteEvent: End of stream

### Memory System

#### EmbeddingsService (`memory/embeddings.py`)

Converts text to vector representations.

**Responsibilities**:
- Encode text to embeddings
- Batch encoding for efficiency
- Cache embeddings
- GPU acceleration support

**Key Methods**:
- `encode_text()`: Encode single text
- `encode_batch()`: Encode multiple texts
- `similarity()`: Calculate similarity

### Conversation History

#### ConversationHistory (`agent/core/state.py`)

Manages conversation history with automatic pruning and performance optimizations.

**Responsibilities**:
- Store conversation messages in structured format
- Maintain cached LLM format for O(1) retrieval
- Automatic pruning to prevent context window overflow
- Memory DoS protection (image data cleared after 5 turns)

**Key Methods**:
- `add_user_message()`: Add user message with context
- `add_tool_output()`: Add tool execution result
- `add_assistant_message()`: Add assistant response
- `get_llm_history()`: Get history in LLM format (O(1) access)
- `get_token_count()`: Get approximate token count

**Performance Optimizations**:
- **O(1) LLM Format Access**: Cached conversion instead of O(n) iteration
- **Incremental Updates**: LLM cache updated incrementally when messages added
- **Shallow Copy API**: Optional API for direct access without deep copying
- **Memory Protection**: Image data automatically cleared from old messages

### API Layer

#### WebSocket Routes (`api/routes/websocket.py`)

Handles WebSocket connections.

**Responsibilities**:
- Manage WebSocket connections
- Route messages to handlers
- Handle connection lifecycle
- Thread-safe message sending

**Key Classes**:
- `SafeWebSocket`: Thread-safe WebSocket wrapper

#### Message Handlers (`api/handlers/`)

Process different message types from WebSocket clients.

**Handler Architecture**:
- **Stateless Singletons**: Handlers are stateless (state in SessionManager/AgentSession)
- **Registry Pattern**: MessageHandlerRegistry routes messages by type
- **Base Class**: All handlers inherit from MessageHandler base class
- **Validation**: Each handler validates message structure via `validate_message()`
- **Error Handling**: Standardized error responses via `send_error_response()` utility

**Handler Details**:

##### QueryMessageHandler (`api/handlers/query.py`)

Processes user query messages and orchestrates the complete query processing pipeline.

**Responsibilities**:
- Query validation and sanitization
- Agent session creation/retrieval
- Streaming response handling
- Text-to-speech integration
- Error handling and recovery
- Response formatting for WebSocket transport

**Key Methods**:
- `handle()`: Main handler method that processes query messages
- `validate_message()`: Validates QueryMessage structure
- `_send_error()`: Sends error responses to client

**Processing Flow**:
1. Validate and sanitize query text
2. Extract config dictionary from query payload
3. Get or create agent session with query config
4. Initialize TTS if enabled in config
5. Create StreamPipeline for event processing
6. Process query and stream responses
7. Clean up TTS resources

**Features**:
- Query config override (per-query model selection)
- TTS lifecycle management
- Streaming response pipeline
- Error recovery and cleanup

##### ListModelsHandler (`api/handlers/settings.py`)

Handles model list requests from the frontend.

**Responsibilities**:
- Retrieve all available LLM models
- Format model list response
- Send models-listed event to frontend

**Key Methods**:
- `handle()`: Retrieves models from ModelService and sends response
- `validate_message()`: Validates ListModelsMessage structure

**Integration**:
- Uses `ModelService` to discover available models
- Sends `models-listed` event with model data

##### ToolResultHandler (`api/handlers/tool_result.py`)

Handles tool execution results from the frontend.

**Responsibilities**:
- Route tool results to appropriate session
- Validate and sanitize metadata
- Handle both single tool results and tool bundles
- Delegate processing to AgentSession

**Key Methods**:
- `handle()`: Routes tool result to session
- `_handle_tool_bundle_result()`: Handles bundled tool results
- `_validate_metadata()`: Validates and sanitizes metadata (prevents injection)

**Metadata Validation**:
- Only allows known metadata keys: `is_preformatted`, `is_bundled`, `bundle_request_id`
- Unknown keys are logged and ignored
- Prevents injection of unexpected data into domain layer

**Features**:
- Pure coordinator (delegates to AgentSession)
- Metadata sanitization
- Bundle result support
- Graceful handling of stale sessions

##### WakewordHandler (`api/handlers/wakeword.py`)

Handles wakeword detection and activation.

**Responsibilities**:
- Enable voice mode and speech mode on wakeword detection
- Select and send greeting
- Generate TTS audio for greeting if speech mode enabled
- Prepare for continuous listening

**Key Methods**:
- `handle()`: Processes wakeword detection message
- `validate_message()`: Validates WakewordDetectedMessage structure

**Processing Flow**:
1. Get greeting from WakewordService
2. Initialize TTS if speech mode enabled
3. Send wakeword-activated event
4. Send wakeword-greeting event
5. Generate TTS for greeting
6. Wait for audio completion (prevents cut-off)
7. Clean up TTS resources

**Features**:
- Audio cut-off prevention (waits for audio_task completion)
- TTS integration for greetings
- Voice mode activation

#### Response Formatter (`api/query/formatter.py`)

Formats agent events into WebSocket response messages.

**Responsibilities**:
- Convert agent events to WebSocket message format
- Handle different event types (chunk, thinking, tool-call, tool-output, etc.)
- Validate event structure before formatting

**Event Formatters**:
- `ChunkEventFormatter`: Formats streaming text chunks
- `ThinkingEventFormatter`: Formats LLM thinking tokens
- `ToolCallEventFormatter`: Formats tool execution requests
- `ToolOutputEventFormatter`: Formats tool execution results
- `ToolBundleEventFormatter`: Formats atomic tool bundles
- `ErrorEventFormatter`: Formats error events
- `StreamingCompleteEventFormatter`: Formats completion events
- `SystemPromptEventFormatter`: Formats system prompt events
- `TokenCountEventFormatter`: Formats token count events

**ResponseFormatter**:
- Routes events to appropriate formatter
- Validates event structure
- Returns None for events that should be skipped

#### Stream Pipeline (`api/query/pipeline.py`)

Orchestrates event processing through composable stages.

**Responsibilities**:
- Process events through formatting, transport, and TTS stages
- Decouple TTS processing from text response (latency optimization)
- Track pending TTS tasks to prevent audio loss

**Pipeline Stages**:
1. **Format**: Format event to WebSocket message
2. **Transport**: Send message immediately (text appears instantly)
3. **TTS**: Process TTS concurrently (doesn't block text)

**Key Methods**:
- `process(event, tts_service, msg_id)`: Process single event through pipeline
- `wait_for_pending_tts()`: Wait for all pending TTS tasks before flush

**Features**:
- **Stateless Pipeline**: All per-stream state lives in processors
- **Latency Optimization**: Text sent immediately, TTS runs concurrently
- **TTS Race Fix**: Tracks pending TTS tasks to prevent audio loss
- **Error Isolation**: TTS failure doesn't block text streaming

### Configuration System

#### ConfigManager (`core/config/manager.py`)

Manages application configuration persistence.

**Responsibilities**:
- Load configuration from file
- Save configuration changes
- Validate configuration
- Provide configuration access
- API key loading from environment

**Key Methods**:
- `load_config()`: Load configuration from file
- `save_config()`: Save configuration to file
- `update_config()`: Update and save configuration
- `reload_config()`: Reload configuration from file

#### ConfigurationService (`core/config/service.py`)

Centralized configuration service with change notifications.

**Responsibilities**:
- Wrap ConfigManager with change notifications
- Manage configuration subscribers
- Publish config change events
- Provide type-safe config access
- Plugin configuration management

**Key Methods**:
- `initialize()`: Initialize service (load config)
- `get_config()`: Get current configuration
- `update_config()`: Update configuration and notify subscribers
- `reload_config()`: Reload from file and notify subscribers
- `subscribe()`: Subscribe to config changes
- `build_user_config()`: Build complete user config with policies

**Features**:
- Thread-safe config updates (RLock)
- Subscriber notifications (async)
- Event bus integration (ConfigChanged events)
- Plugin config management

#### ConfigSubscriptionManager (`core/config/subscription_manager.py`)

Manages subscriptions to configuration changes.

**Responsibilities**:
- Subscribe/unsubscribe components
- Notify subscribers of changes
- Support both protocol-based and callback subscribers

**Key Methods**:
- `subscribe()`: Subscribe protocol-based subscriber
- `subscribe_callback()`: Subscribe callback function
- `unsubscribe()`: Unsubscribe subscriber
- `notify_subscribers()`: Notify all subscribers

**Features**:
- Thread-safe subscription management
- Protocol-based subscribers (ConfigSubscriber)
- Callback-based subscribers (functions)
- Error isolation (one subscriber failure doesn't block others)

### Bootstrap System

#### InitializationCoordinator (`core/bootstrap/coordinator.py`)

Coordinates application initialization phases.

**Responsibilities**:
- Initialize all components in phases
- Handle initialization errors
- Provide rollback on failure
- Thread-safe initialization (prevents concurrent initialization)

**Initialization Phases**:

1. **Configuration Phase**:
   - Load configuration from file
   - Validate configuration
   - Set up ConfigManager

2. **Container Phase**:
   - Initialize ApplicationContainer
   - Set up dependency injection
   - Wire container dependencies
   - Set container in global state

3. **Services Phase**:
   - Initialize PromptManager
   - Create SessionManager from container
   - Subscribe SessionManager to config changes
   - Initialize WebSocket message handlers

4. **Plugins Phase**:
   - Discover plugins (entry points, filesystem)
   - Register plugins in PluginRegistry
   - Initialize all enabled plugins
   - Set plugin registry in container

**Features**:
- **Thread-Safe**: Uses asyncio.Lock to prevent concurrent initialization
- **Error Handling**: Wraps errors in InitializationError
- **Rollback**: Attempts cleanup of initialized phases on failure
- **Validation**: Validates final state after initialization

**Key Methods**:
- `initialize()`: Initialize all phases (main entry point)
- `_rollback()`: Rollback initialized phases on failure
- `_validate_final_state()`: Validate all required components

#### Handler Initializer (`core/bootstrap/handler_initializer.py`)

Initializes WebSocket message handlers.

**Responsibilities**:
- Create message handlers from container
- Register handlers in HandlerRegistry
- Wire handler dependencies

#### Plugin Initializer (`core/bootstrap/plugin_initializer.py`)

Initializes plugin system.

**Responsibilities**:
- Discover plugins using discovery service
- Register plugins in PluginRegistry
- Initialize plugins via lifecycle manager
- Return initialized PluginRegistry

## Dependency Injection

The backend uses `dependency-injector` for clean architecture with container composition:

### Container Structure

```
ApplicationContainer
├── CoreContainer
│   ├── ConfigManager (singleton)
│   ├── Config (singleton, loaded from ConfigManager)
│   ├── EventBus (singleton)
│   ├── LLMClient (factory)
│   ├── TTSService (singleton)
│   ├── VisionService (singleton)
│   ├── ConfigService (singleton)
│   ├── ModelService (singleton)
│   ├── MetricsService (singleton)
│   └── CacheManager (singleton)
├── ToolContainer
│   ├── ToolRegistry (singleton)
│   ├── ToolOrchestrator (singleton)
│   ├── ContextFactory (singleton)
│   └── AgentFactory (singleton)
├── MemoryContainer
│   ├── EmbeddingsService (singleton)
│   └── MemoryManager (singleton)
└── ApiContainer (created lazily)
    ├── HandlerRegistry (singleton)
    └── Message Handlers (singletons)
```

### Container Composition

**ApplicationContainer** (`core/container/container.py`):
- Main container that composes specialized containers
- Provides clean separation of concerns
- Enables easy testing through container overrides
- Supports runtime reconfiguration

**CoreContainer** (`core/container/core_container.py`):
- Foundation services (config, LLM, TTS, vision)
- Event bus for decoupled communication
- Configuration service with change notifications
- Model service for LLM model management

**ToolContainer** (`core/container/tool_container.py`):
- Tool system (registry, orchestrator)
- Context factory for tool execution contexts
- Agent factory for sub-agent creation

**MemoryContainer** (`core/container/memory_container.py`):
- Memory system (embeddings, storage, retrieval)
- Wired to core container for config and cache

**ApiContainer** (`core/container/api_container.py`):
- API layer (message handlers, handler registry)
- Created lazily after session manager is available
- Wired to core container for dependencies

### Container Initialization

**Container Initializer** (`core/container/initializer.py`):
- Handles async initialization of container components
- Initializes vision service (async model loading)
- Sets up service dependencies
- Manages initialization order

**Container Config Updater** (`core/container/config_updater.py`):
- Handles runtime configuration updates
- Updates all dependent services
- Maintains consistency across components

## Event System

### Event Bus (`core/bus.py`)

Central event bus for component communication.

**Event Types**:
- `InteractionCompleted`: Interaction finished
- `ToolExecuted`: Tool execution completed
- `MemoryStored`: Memory item stored
- `ErrorOccurred`: Error event

**Usage**:
```python
event_bus.emit(InteractionCompleted(session_id=...))
```

## Plugin System

### Plugin Registry (`core/plugins/registry.py`)

Manages plugin lifecycle and state.

**Responsibilities**:
- Register plugins
- Enable/disable plugins
- Initialize plugins
- Shutdown plugins
- Handle plugin events
- Manage plugin state

**Key Methods**:
- `register_plugin()`: Register a plugin
- `get_plugin()`: Get plugin by name
- `get_enabled_plugins()`: Get all enabled plugins
- `enable_plugin()`: Enable a plugin
- `disable_plugin()`: Disable a plugin

**Built-in Plugins**:
- `OCRPlugin`: OCR processing plugin (`agent/plugins/ocr_plugin.py`)

### Plugin Discovery (`core/plugins/discovery.py`)

Discovers plugins from various sources.

**Discovery Mechanisms**:
- **EntryPointPluginDiscoverer**: Discovers plugins via setuptools entry points
- **FilesystemPluginDiscoverer**: Discovers plugins from filesystem directories

**Security Features**:
- **AST Parsing**: Statically inspects files before importing (prevents arbitrary code execution)
- **Validation**: Only imports files containing valid plugin classes
- **Entry Point Validation**: Validates entry points before loading

**Discovery Flow**:
1. Scan entry points (if available)
2. Scan filesystem plugin directory
3. Validate plugin classes (AST inspection for filesystem)
4. Import and register valid plugins

### Plugin Lifecycle (`core/plugins/lifecycle.py`)

Manages plugin initialization and shutdown.

**PluginLifecycleManager**:
- `initialize_plugin()`: Initialize a plugin (injects container if available)
- `shutdown_plugin()`: Shutdown a plugin
- `initialize_all_plugins()`: Initialize all enabled plugins
- `shutdown_all_plugins()`: Shutdown all initialized plugins

**Features**:
- Supports both sync and async initialize/shutdown methods
- Container injection for plugins that need it
- Tracks initialized plugins to prevent double initialization
- Graceful error handling (continues if one plugin fails)

### Plugin Interface (`agent/plugins/interface.py`)

Base interface for plugins.

**AgentPlugin Interface**:
- `name`: Plugin name (required)
- `initialize()`: Initialize plugin (optional, sync or async)
- `shutdown()`: Cleanup plugin (optional, sync or async)
- `handle_event()`: Process events (optional)

**Plugin Configuration**:
- Plugins can have their own configuration sections
- Configuration managed by `PluginConfigManager`
- Plugins can access container for dependency injection

## Error Handling

### Exception Hierarchy

```
BaseException
├── DesktopAssistantException
│   ├── LLMAPIError
│   ├── ToolExecutionError
│   ├── ConfigurationError
│   ├── ValidationError
│   └── MemoryError
```

### Error Handling Flow

1. Error occurs in component
2. Caught and wrapped in domain exception
3. Logged with context
4. Sanitized message sent to frontend
5. User-friendly error displayed

## Security

### Tool Execution Security

- **Permission System**: Tools require explicit permissions
- **Sandboxing**: Isolated execution environment
- **Resource Limits**: CPU, memory, and time limits
- **Audit Logging**: All tool executions logged

### Data Security

- **Local Memory Storage**: Conversation history and memory stored and searched locally
- **LLM API Access**: User input and screenshots sent to LLM providers via internet APIs (required for AI functionality)
- **Encryption**: Sensitive data encrypted at rest
- **Access Control**: User-based isolation
- **No Cloud Sync**: Memory and conversation data are not synced to cloud services

## Performance Optimizations

### Caching

#### Cache System (`core/cache.py`)

In-memory cache with TTL support and LRU eviction.

**Cache Class**:
- TTL-based expiration
- LRU eviction when max_size reached
- Negative caching for errors (configurable TTL)
- Thread-safe operations (RLock)
- Separate sync/async coordination to prevent deadlocks

**Key Methods**:
- `get(key)`: Get value (returns None if expired/not found)
- `set(key, value, ttl)`: Set value with TTL
- `delete(key)`: Delete entry
- `clear()`: Clear all entries
- `cleanup_expired()`: Remove expired entries
- `get_or_compute()`: Get or compute value (prevents duplicate computation)
- `get_or_compute_async()`: Async version

**CacheManager**:
- `tool_schemas`: Tool schema cache (TTL: 1 hour)
- `embeddings`: Embedding cache (TTL: 24 hours)
- `llm_clients`: LLM client cache (TTL: 24 hours)
- `generic`: Generic cache (TTL: 1 hour)

**Features**:
- **Thundering Herd Prevention**: Cached errors raise exceptions to all waiters
- **Negative Caching**: Errors cached for short TTL (5 seconds) to prevent retry storms
- **Statistics**: Hit rate, size, total requests tracking

### Parallelization

- **Async I/O**: All I/O operations async
- **Parallel Tool Execution**: Multiple tools in parallel
- **Batch Processing**: Batch embeddings and OCR
- **Thread Pool**: Global thread pool for blocking operations

### GPU Acceleration

- **CUDA Support**: GPU-accelerated embeddings
- **OCR Acceleration**: GPU-accelerated OCR processing
- **Vision Models**: GPU-accelerated vision inference

## Prompt System

### PromptManager (`llm/prompts/prompts.py`)

Singleton that loads system prompts at startup and fails fast if missing.

**Responsibilities**:
- Load system prompt from file at startup
- Replace placeholders (e.g., `{os}` with current OS)
- Validate prompt file (not empty, valid UTF-8)
- Provide thread-safe access to system prompt

**Key Methods**:
- `initialize()`: Load system prompt at startup (thread-safe)
- `system_prompt`: Property to get system prompt (raises if not initialized)

**Features**:
- **Thread-Safe**: Uses lock to prevent race conditions during initialization
- **Fail-Fast**: Raises RuntimeError if prompt file is missing or invalid
- **Placeholder Replacement**: Replaces `{os}` with current platform
- **Deferred Initialization**: Prevents import-time crashes

**Initialization**:
- Called during bootstrap phase (InitializationCoordinator)
- Default path: `llm/prompts/system_prompt.txt`
- Custom path can be provided

### System Prompt (`llm/prompts/system_prompt.txt`)

The system prompt template that defines the agent's behavior and capabilities.

**Structure**:
- **System Context**: Operating system information and directives
- **Operational Directives**: Agent loop, interaction protocol, system state guidelines
- **Tool Usage Guidelines**: Instructions for using tools effectively
- **Memory Guidelines**: Instructions for using episodic and semantic memory

**Key Sections**:
- `<system_context>`: OS information and main window name
- `<operational_directives>`: Agent loop, interaction protocol, system state guidelines
- `<tool_usage_guidelines>`: Instructions for tool execution
- `<memory_guidelines>`: Instructions for memory usage

**Placeholders**:
- `{os}`: Replaced with current operating system (Windows, Linux, macOS)

### PromptConstructor (`llm/prompts/prompt_constructor.py`)

Constructs LLM prompts with tool schemas and images, enforcing security limits.

**Responsibilities**:
- Build prompts with system prompt, history, and tool schemas
- Enforce size limits (trust boundary)
- Format user messages with context XML
- Validate inputs before sending to LLM

**Key Methods**:
- `build_prompt()`: Build complete prompt with history and tool schemas
- `format_user_message_content()`: Format user message with context XML
- `_validate_prompt_size()`: Validate prompt size against limits

**Security**:
- Enforces prompt size limits (prevents DOS attacks)
- Validates image data size
- Limits tool schema size

## Testing

### Test Structure

```
tests/backend/
├── test_agent_system.py
├── test_tool_execution.py
├── test_llm_integration.py
├── test_parser_helpers.py
├── test_query_handler_pipeline.py
├── test_llm_parser.py
├── test_system_monitor.py
├── test_*_tool_pipeline.py  # Tool-specific integration tests
└── ...
```

### Testing Strategy

- **Unit Tests**: Individual components (parsers, formatters, utilities)
- **Integration Tests**: Component interactions (tool pipelines, query handler)
- **Pipeline Tests**: End-to-end tool execution flows
- **Mocking**: External dependencies mocked (LLM clients, file system)

### Test Categories

#### Tool Pipeline Tests (`test_*_tool_pipeline.py`)

Integration tests for individual tool execution pipelines.

**Coverage**:
- Tool execution flow
- Parameter validation
- Error handling
- Result formatting

**Examples**:
- `test_mouse_control_tool_pipeline.py`
- `test_keyboard_control_tool_pipeline.py`
- `test_read_file_tool_pipeline.py`
- `test_write_file_tool_pipeline.py`
- `test_screenshot_tool_pipeline.py`

#### Parser Tests (`test_llm_parser.py`, `test_parser_helpers.py`)

Tests for LLM response parsing and validation.

**Coverage**:
- JSON parsing
- Tool call extraction
- Text content extraction
- Error handling

#### System Tests (`test_system_monitor.py`, `test_query_handler_pipeline.py`)

Tests for system-level functionality.

**Coverage**:
- Query processing pipeline
- System monitoring
- Session management

## Core Services

### Vision Service (`services/vision/vision_service.py`)

Manages the InternVL vision model for UI grounding and coordinate prediction.

**Responsibilities**:
- Initialize and manage InternVL model instance
- Pre-load model at startup for fast first-time use
- Thread-safe initialization with lock protection
- Model unloading for VRAM management

**Key Methods**:
- `initialize()`: Initialize InternVL model (thread-safe)
- `unload_model()`: Unload model to free VRAM (thread-safe)
- `model`: Property to access initialized model instance
- `is_initialized`: Check initialization status

**Features**:
- Race condition protection with asyncio.Lock
- Automatic GPU memory management
- Graceful fallback if dependencies unavailable
- Used by `mouse_control` tool with `find_coordinates_by="prediction"`

### TTS Service (`core/services/tts_service.py`)

Text-to-speech synthesis using Piper TTS for local, low-latency synthesis.

**Responsibilities**:
- Sentence detection from text stream
- Background thread processing for audio generation
- CUDA/CPU fallback with automatic retry
- Audio chunk streaming to frontend

**Key Methods**:
- `initialize()`: Initialize TTS service with Piper model
- `process_text()`: Process text chunks with sentence detection
- `flush()`: Flush remaining buffer text
- `wait_until_finished()`: Wait for all queued text to be processed
- `stream_audio()`: Stream generated audio chunks

**Features**:
- **Sentence Detection**: Buffers text and splits on delimiters (., !, ?, \n, ;, :)
- **DOS Protection**: Hard limit (500 chars) on buffer size to prevent OOM attacks
- **CUDA Fallback**: Automatic CPU fallback on GPU errors with periodic retry (5 min intervals)
- **Thread-Safe**: Background worker thread for synthesis, async queue for audio chunks
- **Completion Tracking**: Async event-based completion detection (replaces polling)

### TTS Processing (`api/tts/`)

TTS processing components for filtering and managing TTS output.

#### TTSManager (`api/tts/manager.py`)

Manages TTS initialization, streaming, and cleanup for query handlers.

**Responsibilities**:
- Initialize TTS service if enabled in config
- Start background audio streaming task
- Process events for TTS (extract text chunks)
- Clean up TTS service and audio tasks

**Key Methods**:
- `initialize_if_enabled()`: Initialize TTS service if speech_mode_enabled
- `start_streaming_task()`: Start background task to stream audio chunks to WebSocket
- `process_event()`: Process event for TTS (extract text chunks)
- `cleanup()`: Clean up TTS service and audio streaming task
- `_stream_audio()`: Stream audio chunks from TTS service to WebSocket

**Features**:
- Thread-safe audio streaming (uses WebSocketSender protocol)
- Graceful cleanup with timeout handling
- Error isolation (TTS cleanup failure doesn't block audio task cleanup)

#### TTSProcessor (`api/tts/processor.py`)

Processes events for TTS with code block and JSON filtering.

**Responsibilities**:
- Filter code blocks and JSON from TTS output
- Detect content type using heuristic detection
- Buffer chunks until content type can be determined
- Pass through normal text chunks to TTS

**State Machine**:
- `None`: Unknown content type (buffering to detect)
- `False`: Normal text (pass through to TTS)
- `True`: Code block or JSON (filter from TTS)

**Key Methods**:
- `process_event()`: Process event for TTS with filtering
- `_process_chunk()`: Process chunk event with robust context switching
- `_reset_state()`: Reset state machine state

**Features**:
- **Heuristic Detection**: Detects code blocks (```) and JSON ({) using pattern matching
- **Buffer Management**: Buffers chunks up to 4KB to detect content type
- **Context Switching**: Handles mid-chunk transitions between text and code/JSON
- **Recursive Processing**: Recursively splits chunks containing both text and markers
- **State Reset**: Resets on explicit tool boundaries (ToolCallEvent, ToolOutputEvent)

**Architectural Notes**:
- Transitional component compensating for missing event semantics upstream
- Heuristic detection is a protocol smell (should be replaced with explicit event metadata)
- Future improvement: Replace with ChunkEvent metadata (e.g., `kind="code"`)

### Wakeword Service (`core/services/wakeword_service.py`)

Provides wakeword activation logic and greeting selection policy.

**Responsibilities**:
- Select random greeting from configured greetings
- Build activation payload for wakeword detection
- Encapsulate policy decisions about user greeting

**Key Methods**:
- `select_greeting()`: Select random greeting from config
- `get_activation_payload()`: Build activation response payload

**Integration**:
- Used by `WakewordHandler` when wakeword is detected
- Activates voice mode and speech mode
- Sends greeting to frontend

### Context Factory (`core/services/context_factory.py`)

Centralized service for creating execution contexts.

**Responsibilities**:
- Single source of truth for context creation
- Consistent service injection across system
- Tool context creation with workspace management

**Key Methods**:
- `create_tool_context()`: Create ToolContext with all required services
- `set_tool_registry()`: Set tool registry (for circular dependency resolution)
- `set_vision_service()`: Set vision service (pre-initialized InternVL model)
- `update_session_ref()`: Update default session reference

**Services Injected**:
- Config
- Tool registry
- Session reference
- Agent factory
- Vision service
- Additional custom services

### Agent Factory (`core/services/agent_factory.py`)

Factory for creating lightweight, scoped agent sessions (sub-agents).

**Responsibilities**:
- Create sub-agents sharing resources with parent
- Restrict tools via RestrictedToolRegistry
- Custom system prompts for agent personas

**Key Methods**:
- `create_agent()`: Create new sub-agent session

**Features**:
- **Resource Sharing**: Sub-agents share LLM client, tool orchestrator, event bus
- **Tool Restriction**: RestrictedToolRegistry filters available tools
- **Custom Personas**: Each sub-agent can have custom system prompt
- **Session Isolation**: Each sub-agent has unique session ID

### GPU Memory Manager (`core/services/gpu_memory_manager.py`)

Centralized GPU memory management to prevent allocation failures.

**Responsibilities**:
- Clear PyTorch CUDA cache (for OOM recovery only)
- Clear ONNX Runtime cache
- Get GPU memory usage information
- Log memory statistics

**Key Methods**:
- `clear_pytorch_cache()`: Clear PyTorch CUDA cache (warning: performance impact)
- `clear_onnxruntime_cache()`: Clear ONNX Runtime cache
- `get_memory_info()`: Get current GPU memory usage
- `log_memory_info()`: Log memory statistics

**Important Notes**:
- Cache clearing should ONLY be used for OOM recovery or model unloading
- Routine use causes GPU cache thrashing and performance degradation
- PyTorch manages GPU memory automatically and efficiently

## Bootstrap System

### Initialization Coordinator (`core/bootstrap/coordinator.py`)

Coordinates application initialization phases.

**Initialization Phases**:
1. **Configuration**: Load and validate configuration
2. **Container**: Initialize dependency injection container
3. **Services**: Initialize SessionManager and message handlers
4. **Plugins**: Load and initialize plugins

**Features**:
- Thread-safe initialization with lock protection
- Error handling with rollback on failure
- Phase validation before proceeding
- Prevents multiple concurrent initializations

**Key Methods**:
- `initialize()`: Initialize all components in phases
- `_rollback()`: Rollback initialized phases on failure
- `_validate_final_state()`: Validate all required components

## Observability

### Trust Boundary Metrics (`core/observability/trust_boundary_metrics.py`)

Tracks structured metrics for trust boundary violations.

**Responsibilities**:
- Record size limit violations
- Record timeout violations
- Record validation violations
- Provide statistics for monitoring

**Key Classes**:
- `BoundaryViolationMetrics`: Structured metrics for a boundary
- `MetricsService`: Service for managing metrics registry

**Features**:
- Thread-safe metrics collection
- Size distribution tracking (for tuning limits)
- Violation details for analysis
- Structured logging for observability

## Security System

### Security Executor (`core/security/executor.py`)

Abstract base class for executing tools with isolation.

**Implementations**:
- `DirectToolExecutor`: Executes tools directly (no isolation, lowest overhead)
- `ProcessSandboxedExecutor`: Executes tools in separate process (not fully implemented)

**Key Methods**:
- `execute()`: Execute tool with arguments and context

### Security Policy (`core/security/policy.py`)

Defines security policy for tool execution.

**Responsibilities**:
- Permission checking (fail-closed)
- Resource limit enforcement
- Path access control
- Audit logging

**Key Features**:
- **Permission System**: Tools must explicitly declare required permissions
- **Fail-Closed**: Tools without declared permissions are denied
- **Resource Limits**: Timeout, memory, file size, network request limits
- **Audit Logging**: Thread-safe audit log with bounded memory (1000 entries)
- **Memory Protection**: Large parameter values truncated in audit log

**Key Methods**:
- `check_permission()`: Check if tool has required permission
- `check_resource_limits()`: Check if execution would exceed limits
- `check_path_access()`: Check if path is accessible
- `log_execution()`: Log tool execution for audit
- `get_audit_log()`: Get audit log entries (thread-safe)

## Extension Points

### Tool Development

1. Inherit from `Tool` base class (`sdk/tool.py`)
2. Implement `execute()` method
3. Register in tool registry

### Plugin Development

1. Implement `Plugin` interface
2. Register in plugin registry
3. Handle events from event bus

### Custom LLM Provider

1. Implement `LLMProvider` interface
2. Register in provider factory
3. Configure in app config

---

For more detailed information, see:
- [Tool System](TOOL_SYSTEM.md)
- [LLM Integration](LLM_INTEGRATION.md)
- [Memory System](MEMORY_SYSTEM.md)
- [Plugin System](PLUGIN_SYSTEM.md)
