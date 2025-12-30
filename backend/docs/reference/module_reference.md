# Module Reference

This document provides a comprehensive reference for all modules in the Personal Assistant Backend codebase, organized by package.

## Table of Contents

- [Agent System](#agent-system)
- [API Layer](#api-layer)
- [Core Infrastructure](#core-infrastructure)
- [LLM Integration](#llm-integration)
- [Memory System](#memory-system)
- [SDK](#sdk)
- [Services](#services)
- [Tools System](#tools-system)

## Agent System

### `backend.src.agent`

The agent system manages conversation sessions and orchestrates task execution.

#### `core.py` - AgentSession

**Purpose**: Core session class managing conversation state, memory integration, and tool orchestration.

**Key Classes**:
- `AgentSession`: Main agent class for orchestrating tasks with tool support
  - Manages conversation history and context
  - Coordinates LLM interactions with tool calls
  - Streams responses back to clients
  - Persists conversation memory
  - Handles session lifecycle events

**Key Methods**:
- `process_query(query: str) -> AsyncGenerator[Dict[str, Any], None]`: Processes user queries and yields status updates
- `update_config(new_cfg: AppConfig) -> None`: Updates agent configuration and re-initializes dependencies

**Dependencies**: `AgentExecutor`, `ToolRegistry`, `MemoryManagerInterface`, `LLMClient`, `PluginRegistry`

#### `executor.py` - AgentExecutor

**Purpose**: Executes the agent loop: Prompt → LLM → Parse → Tools → Repeat.

**Key Classes**:
- `AgentExecutor`: Coordinates query processing, LLM interaction, and tool execution

**Key Methods**:
- `process_query(query: str) -> AsyncGenerator[StreamingEvent, None]`: Main execution entry point
- `_retrieve_and_format_memories(query: str) -> str`: Retrieves and formats memories for context
- `_publish_completion_event(query: str, response: str) -> None`: Publishes interaction completion events

**Dependencies**: `InteractionLoop`, `ResultProcessor`, `PluginManager`

#### `interaction_loop.py` - InteractionLoop

**Purpose**: Main interaction loop handling LLM generation, parsing, and tool execution cycles.

**Key Classes**:
- `InteractionLoop`: Executes the agent loop with iteration limits

**Key Methods**:
- `run_loop() -> AsyncGenerator[StreamingEvent, None]`: Main loop execution
- `_stream_llm_response(prompt: List[LLMMessage]) -> AsyncGenerator[StreamingEvent, None]`: Streams LLM responses
- `_execute_tools(parsed_response: ParsedResponse) -> AsyncGenerator[StreamingEvent, None]`: Executes tool calls

**Dependencies**: `AgentSession`, `LLMClient`, `ToolOrchestrator`, `ResponseParser`, `ResultProcessor`

#### `result_processor.py` - ResultProcessor

**Purpose**: Processes tool execution results, including artifact extraction, memory storage, and event publishing.

**Key Classes**:
- `ResultProcessor`: Handles tool result processing and formatting

**Key Methods**:
- `process_results(tool_name: str, result: ToolResult) -> dict`: Processes tool execution results
- `_extract_screenshot_data(tool_result: ToolResult, plugin_result: Optional[Any]) -> Optional[str]`: Extracts screenshot data
- `_process_tool_memories(tool_result: ToolResult, tool_name: str) -> None`: Stores memories from tool results

**Dependencies**: `AgentSession`, `PluginManager`

#### `session_manager.py` - SessionManager

**Purpose**: Manages user agent sessions lifecycle, including creation, retrieval, cleanup, and periodic memory summarization.

**Key Classes**:
- `SessionManager`: Manages the lifecycle of user sessions

**Key Methods**:
- `get_or_create_session(user_id: str) -> AgentSession`: Retrieves or creates a session
- `end_session(user_id: str) -> None`: Ends a session and performs cleanup
- `update_all_sessions_config(config: AppConfig) -> None`: Updates configuration for all sessions
- `run_summarization_periodically() -> None`: Periodically runs memory summarization

**Dependencies**: `Container`, `AgentSession`, `AppConfig`

#### `state.py` - ConversationHistory

**Purpose**: Manages conversation history with automatic pruning to prevent context window overflow.

**Key Classes**:
- `ConversationHistory`: Manages conversation history with configurable limits

**Key Methods**:
- `add_user_message(message: str, image_data: Optional[str] = None) -> None`: Adds user message
- `add_tool_output(message: str, image_data: Optional[str] = None) -> None`: Adds tool execution result
- `add_assistant_message(message: str) -> None`: Adds assistant response
- `get_history() -> List[LLMMessage]`: Gets history in LLM format

**Dependencies**: `LLMMessage`, `MultimodalContent`

### `backend.src.agent.plugins`

Plugin system for extending agent functionality.

#### `interface.py` - AgentPlugin Protocol

**Purpose**: Defines the Protocol interface for agent plugins.

**Key Classes**:
- `AgentPlugin`: Protocol interface for agent plugins
- `PluginResult`: Result from plugin hooks

**Key Methods**:
- `on_instruction(instruction: str) -> Optional[PluginResult]`: Called when new user query received
- `on_llm_response(response_text: str) -> Optional[PluginResult]`: Called when LLM generates response
- `on_tool_start(tool_name: str, args: Dict[str, Any]) -> Optional[PluginResult]`: Called before tool execution
- `on_tool_end(tool_name: str, result: Any) -> Optional[PluginResult]`: Called after tool execution

#### `manager.py` - PluginManager

**Purpose**: Orchestrates plugin execution during agent operations.

**Key Classes**:
- `PluginManager`: Manages plugin lifecycle and execution

**Key Methods**:
- `on_instruction(instruction: str) -> Optional[PluginResult]`: Executes instruction hooks
- `on_llm_response(response_text: str) -> Optional[PluginResult]`: Executes LLM response hooks
- `on_tool_start(tool_name: str, args: Dict[str, Any]) -> Optional[PluginResult]`: Executes tool start hooks
- `on_tool_end(tool_name: str, result: Any) -> Optional[PluginResult]`: Executes tool end hooks

**Dependencies**: `PluginRegistry`, `AgentPlugin`

#### `computer.py` - ComputerUsePlugin

**Purpose**: Handles automatic screenshot capture after computer control tool execution.

**Key Classes**:
- `ComputerUsePlugin`: Plugin for computer use capabilities like auto-screenshots

**Key Methods**:
- `on_tool_end(tool_name: str, result: Any) -> Optional[PluginResult]`: Captures screenshots after computer control tools

**Dependencies**: `ToolRegistry`, `ToolExecutionEngine`

#### `ocr_plugin.py` - OCRPlugin

**Purpose**: Provides OCR analysis functionality for screenshots.

**Key Classes**:
- `OCRPlugin`: Plugin that provides OCR analysis functionality

**Key Methods**:
- `perform_ocr(screenshot_b64: str) -> Optional[List[Dict[str, Any]]]`: Performs OCR analysis (public method for tools to use)

**Dependencies**: `RapidOCR` (optional)

## API Layer

### `backend.src.api`

FastAPI-based real-time API with WebSocket support.

#### `deps.py` - FastAPI Dependencies

**Purpose**: Provides dependency injection for FastAPI routes.

**Key Functions**:
- `get_container() -> Container`: Gets application container
- `get_session_manager(container: Container) -> SessionManager`: Gets session manager

#### `schema.py` - API Schemas

**Purpose**: Defines Pydantic models for all WebSocket message types.

**Key Classes**:
- `BaseMessage`: Base message class
- `PingMessage`: Ping/pong messages
- `QueryMessage`: User query messages
- `LoadSettingsMessage`: Settings loading messages
- `UpdateSettingsMessage`: Settings update messages
- `ListModelsMessage`: Model listing messages
- `ErrorResponse`: Error responses
- `StreamingResponse`: Streaming responses
- `ToolCallMessage`: Tool call notifications
- `ToolOutputMessage`: Tool output notifications

#### `routes/websocket.py` - WebSocket Routes

**Purpose**: Handles WebSocket connections for real-time communication.

**Key Functions**:
- `websocket_endpoint(websocket: WebSocket, session_manager: SessionManager) -> None`: Main WebSocket endpoint
- `handle_message(websocket: WebSocket, data: Dict[str, Any], session_manager: SessionManager, user_id: str) -> None`: Routes messages to handlers

**Dependencies**: `MessageHandlerRegistry`, `SessionManager`

### `backend.src.api.handlers`

Message handlers for WebSocket messages.

#### `base.py` - Base Handler Classes

**Purpose**: Defines base handler interface and registry pattern.

**Key Classes**:
- `MessageHandler`: Abstract base class for message handlers
- `MessageHandlerRegistry`: Registry for routing messages to handlers

**Key Methods**:
- `MessageHandler.handle(data: Dict[str, Any], websocket: WebSocket, user_id: str) -> None`: Handles a message
- `MessageHandlerRegistry.handle(message_type: str, data: Dict[str, Any], websocket: WebSocket, user_id: str) -> None`: Routes message to handler

#### `ping_handler.py` - PingMessageHandler

**Purpose**: Handles ping/pong messages for connection health checks.

**Key Classes**:
- `PingMessageHandler`: Handler for ping messages

#### `query_handler.py` - QueryMessageHandler

**Purpose**: Handles user query messages and streams responses.

**Key Classes**:
- `QueryMessageHandler`: Handler for query messages

**Key Methods**:
- `handle(data: Dict[str, Any], websocket: WebSocket, user_id: str) -> None`: Processes query and streams responses

**Dependencies**: `SessionManager`, `TTSManager`, `ResponseFormatter`

#### `response_formatter.py` - ResponseFormatter

**Purpose**: Formats agent events into WebSocket response messages.

**Key Classes**:
- `ResponseFormatter`: Formats events for WebSocket transport

**Key Methods**:
- `format(event: Dict[str, Any], msg_id: str) -> Optional[Dict[str, Any]]`: Formats event into response

#### `settings_handler.py` - Settings Handlers

**Purpose**: Handles settings-related messages (load, update, list models).

**Key Classes**:
- `LoadSettingsHandler`: Handler for loading settings
- `UpdateSettingsHandler`: Handler for updating settings
- `ListModelsHandler`: Handler for listing available models

#### `tts_manager.py` - TTSManager

**Purpose**: Manages TTS lifecycle during query processing.

**Key Classes**:
- `TTSManager`: Manages TTS initialization, streaming, and cleanup

**Key Methods**:
- `initialize_if_enabled(config: AppConfig) -> Optional[TTSService]`: Initializes TTS if enabled
- `start_streaming_task(tts_service: TTSService, websocket: WebSocket, msg_id: str) -> asyncio.Task`: Starts audio streaming
- `process_event(tts_service: TTSService, event: Dict[str, Any]) -> None`: Processes events for TTS
- `cleanup(tts_service: Optional[TTSService], audio_task: Optional[asyncio.Task]) -> None`: Cleans up TTS resources

## Core Infrastructure

### `backend.src.core`

Core infrastructure components including dependency injection, configuration, events, and utilities.

#### `bus.py` - Event Bus

**Purpose**: Enhanced event bus with priority support, filtering, and middleware.

**Key Classes**:
- `EventBus`: Central event dispatcher
- `EventHandlerWrapper`: Wrapper for event handlers with metadata

**Key Methods**:
- `subscribe(event_type: Type[Event], handler: EventHandler, priority: int = 100, filter_func: Optional[Callable] = None) -> None`: Subscribe to events
- `publish(event: Event) -> None`: Publish event to subscribers

**Dependencies**: `Event` types from `events.py`

#### `cache.py` - Caching Layer

**Purpose**: Multi-level caching system for performance optimization.

**Key Classes**:
- `Cache`: Simple in-memory cache with TTL support
- `CacheManager`: Centralized cache manager for different cache types

**Key Methods**:
- `Cache.get(key: str) -> Optional[Any]`: Get cached value
- `Cache.set(key: str, value: Any, ttl: Optional[float] = None) -> None`: Set cached value
- `CacheManager.get_tool_schema_key(tool_name: str) -> str`: Generate cache key for tool schema
- `CacheManager.get_embedding_key(text: str) -> str`: Generate cache key for embedding

#### `events.py` - Event System

**Purpose**: Defines all event types for decoupled component communication.

**Key Classes**:
- `Event`: Base class for all events
- `UserMessageReceived`: Event fired when user sends message
- `AgentResponseGenerated`: Event fired when agent generates response
- `ToolExecuted`: Event fired when tool finishes execution
- `InteractionCompleted`: Event fired when conversation turn completes
- `ConfigChanged`: Event fired when configuration updates
- `MemoryStored`: Event fired when memory is stored
- `SessionCreated`: Event fired when session is created
- `ErrorOccurred`: Event fired when error occurs

#### `exceptions.py` - Exception Hierarchy

**Purpose**: Centralized exception hierarchy for consistent error handling.

**Key Classes**:
- `BaseAppError`: Base exception for all application errors
- `ConfigurationError`: Configuration-related errors
- `LLMError`, `LLMAPIError`, `LLMRateLimitError`: LLM-related errors
- `ToolExecutionError`, `ToolValidationError`, `ToolNotFoundError`: Tool execution errors
- `MemoryError`, `MemoryStoreError`, `EmbeddingError`: Memory-related errors
- `SessionError`: Session-related errors

#### `types.py` - Type Definitions

**Purpose**: TypedDict definitions for common dictionary structures.

**Key Types**:
- `LLMMessage`: Standard LLM message format
- `MultimodalContent`: Content with text and images
- `StreamingEvent`: Streaming event dictionary
- `ToolResultDict`: Tool execution result dictionary
- `MemoryItem`: Memory item dictionary
- `WebSocketMessage`: WebSocket message format

#### `error_handling.py` - Error Handling Utilities

**Purpose**: Utilities for consistent error handling.

**Key Classes**:
- `Result[T, E]`: Result type for explicit error handling

**Key Functions**:
- `handle_errors(...)`: Decorator for standardized error handling
- `safe_execute(func, *args, default=None, **kwargs) -> Union[T, None]`: Safely execute function
- `safe_execute_async(func, *args, default=None, **kwargs) -> Union[T, None]`: Safely execute async function

#### `validation.py` - Validation Framework

**Purpose**: Pydantic-based validation for all API inputs.

**Key Classes**:
- `ValidationError`: Custom validation error

**Key Functions**:
- `validate_message(data: Dict[str, Any], message_type: str, model_class: Type[T]) -> T`: Validate WebSocket message
- `validate_query_text(text: str) -> str`: Validate query text input
- `validate_settings_update(settings: Dict[str, Any]) -> Dict[str, Any]`: Validate settings update payload
- `sanitize_string(value: Any, max_length: int = 10000) -> str`: Sanitize string value

#### `shutdown.py` - Shutdown Module

**Purpose**: Handles graceful shutdown of application components.

**Key Classes**:
- `Shutdown`: Handles application shutdown and cleanup

**Key Methods**:
- `shutdown(plugin_registry: Any, background_task: asyncio.Task) -> None`: Shutdown all components

#### `config_service.py` - Configuration Service

**Purpose**: Centralized configuration service with change notifications.

**Key Classes**:
- `ConfigurationService`: Configuration service with change notifications

**Key Methods**:
- `get_config() -> AppConfig`: Get current configuration
- `update_config(new_config: AppConfig) -> AppConfig`: Update configuration and notify subscribers
- `subscribe(subscriber: ConfigSubscriber) -> None`: Subscribe to configuration changes

**Dependencies**: `ConfigManager`, `ConfigSubscriptionManager`

#### `config_subscription_manager.py` - Config Subscription Manager

**Purpose**: Handles subscription management for configuration change notifications.

**Key Classes**:
- `ConfigSubscriber`: Protocol for components subscribing to config changes
- `ConfigSubscriptionManager`: Manages subscriptions

**Key Methods**:
- `subscribe(subscriber: ConfigSubscriber) -> None`: Subscribe to changes
- `notify_subscribers(old_config: AppConfig, new_config: AppConfig) -> None`: Notify all subscribers

#### `config_service.py` - Configuration Service

**Purpose**: Single source of truth for all configuration access (application + plugin config).

**Key Classes**:
- `ConfigurationService`: Centralized configuration service with change notifications

**Key Methods**:
- `get_config() -> AppConfig`: Get application configuration
- `get_plugin_config(plugin_name: str) -> Dict[str, Any]`: Get plugin configuration
- `update_config(new_config: AppConfig) -> AppConfig`: Update application configuration
- `update_plugin_config(plugin_name: str, config: Dict[str, Any])`: Update plugin configuration
- `subscribe(subscriber: ConfigSubscriber)`: Subscribe to configuration changes

**Deprecated**: `UnifiedConfigurationService` in `unified_config.py` is deprecated. Use `ConfigurationService` directly.

#### `plugin_config.py` - Plugin Configuration Management

**Purpose**: Configuration management for plugins.

**Key Classes**:
- `PluginConfigManager`: Manages plugin configuration persistence

**Key Methods**:
- `get_plugin_config(plugin_name: str) -> Dict[str, Any]`: Get plugin configuration
- `set_plugin_config(plugin_name: str, enabled: Optional[bool] = None, priority: Optional[int] = None, config: Optional[Dict[str, Any]] = None) -> None`: Set plugin configuration
- `is_enabled(plugin_name: str) -> bool`: Check if plugin is enabled

### `backend.src.core.bootstrap`

Bootstrap and initialization system.

#### `coordinator.py` - InitializationCoordinator

**Purpose**: Coordinates application initialization phases.

**Key Classes**:
- `InitializationCoordinator`: Coordinates initialization phases

**Key Methods**:
- `initialize(app: FastAPI, config_manager: Optional[ConfigManager] = None) -> Tuple[Container, SessionManager, Any]`: Initialize all components

#### `handler_initializer.py` - HandlerInitializer

**Purpose**: Initializes WebSocket message handlers.

**Key Classes**:
- `HandlerInitializer`: Initializes message handlers

#### `plugin_initializer.py` - PluginInitializer

**Purpose**: Initializes plugin system.

**Key Classes**:
- `PluginInitializer`: Initializes plugins

### `backend.src.core.container`

Dependency injection container system.

#### `container.py` - Application Container

**Purpose**: Main dependency injection container using dependency-injector library.

**Key Classes**:
- `ApplicationContainer`: Main container with domain-specific sub-containers
- `Container`: Thin facade around ApplicationContainer for backward compatibility

**Key Methods**:
- `Container.initialize()`: Async initialization of components
- `Container.update_config(config)`: Runtime configuration updates
- `Container.create_agent_session(user_id, session_id)`: Create agent sessions with DI

**Dependencies**: `CoreContainer`, `ToolContainer`, `MemoryContainer`

#### `core_container.py` - Core Container

**Purpose**: Foundation services container (config, LLM, TTS, services).

**Key Classes**:
- `CoreContainer`: Contains core infrastructure services

**Services Provided**:
- Configuration management
- LLM client factory
- TTS service
- File service
- Workspace service
- Agent factory

#### `tool_container.py` - Tool Container

**Purpose**: Tool system container (registry, orchestrator, loaders).

**Key Classes**:
- `ToolContainer`: Contains tool ecosystem components

**Services Provided**:
- Tool registry
- Tool loader
- Tool orchestrator
- Context factory
- Tool search engine

#### `memory_container.py` - Memory Container

**Purpose**: Memory system container (embeddings, storage, retrieval).

**Key Classes**:
- `MemoryContainer`: Contains memory system components

**Services Provided**:
- Embeddings service
- Memory store (SQLite-based)
- Retrieval engine
- Summarizer

#### `initializer.py` - Container Initializer

**Purpose**: Handles async initialization of container components.

**Key Classes**:
- `ContainerInitializer`: Manages async initialization sequence

**Key Methods**:
- `initialize()`: Initialize memory store, load tools, index search engine

**Dependencies**: `Container`, memory store, tool registry

#### `config_updater.py` - Container Config Updater

**Purpose**: Handles runtime configuration updates for container components.

**Key Classes**:
- `ContainerConfigUpdater`: Manages config updates with dependency cascading

**Key Methods**:
- `update_config(config)`: Update configuration and reinitialize components
- `_reinitialize_memory_components(config)`: Reinitialize memory system on config changes

**Dependencies**: `Container`, `AppConfig`

#### `factories/` - Factory Functions

**Purpose**: Factory functions for creating complex objects with dependencies.

**Key Functions**:
- `_create_tool_instantiator(search_engine)`: Create tool instantiator with search engine
- `_create_embedder(config)`: Create embeddings service
- `_create_memory_store(config, embedder)`: Create memory store with embedder

#### `session_factory.py` - Agent Session Factory

**Purpose**: Factory for creating fully configured agent sessions.

**Key Classes**:
- `AgentSessionFactory`: Creates agent sessions with all dependencies injected

**Key Methods**:
- `create_session(user_id, session_id)`: Create new agent session

**Dependencies**: All major system components (LLM, memory, tools, plugins)

### `backend.src.core.config`

Configuration management.

#### `manager.py` - ConfigManager

**Purpose**: Core configuration loading and management.

**Key Classes**:
- `ConfigManager`: Manages configuration loading from multiple sources

#### `models.py` - Configuration Models

**Purpose**: Pydantic models for configuration.

**Key Classes**:
- `AppConfig`: Comprehensive application configuration model
- `LLMProviders`: Nested configuration for LLM providers

### `backend.src.core.interfaces`

Protocol interfaces for core components.

#### `llm.py` - LLM Interface

**Purpose**: Protocol interface for LLM clients.

**Key Protocols**:
- `LLMClientInterface`: Interface for LLM interactions

#### `memory.py` - Memory Interface

**Purpose**: Protocol interface for memory management.

**Key Protocols**:
- `MemoryManagerInterface`: Interface for memory operations

#### `tool.py` - Tool Interface

**Purpose**: Protocol interface for tools.

**Key Protocols**:
- `ToolInterface`: Interface for tool execution

### `backend.src.core.plugins`

Plugin system infrastructure with lifecycle management and state persistence.

#### `registry.py` - Plugin Registry

**Purpose**: Central registry for plugins with state management and configuration.

**Key Classes**:
- `PluginRegistry`: Manages plugin registration, lifecycle, and state

**Key Methods**:
- `register(plugin, enabled, priority, metadata)`: Register plugin with configuration
- `enable_plugin(name)`, `disable_plugin(name)`: Runtime plugin state management
- `get_enabled_plugins()`: Get plugins sorted by priority
- `initialize_all_plugins()`, `shutdown_all_plugins()`: Lifecycle management

**Dependencies**: `PluginStateManager`, `PluginConfigManager`, `PluginLifecycleManager`

#### `discovery.py` - Plugin Discovery

**Purpose**: Discovers plugins from filesystem and entry points with validation.

**Key Classes**:
- `PluginDiscoveryService`: Discovers and validates plugins

**Key Methods**:
- `discover_plugins(paths)`: Scan directories for plugin modules
- `validate_plugin(plugin_class)`: Validate plugin interface compliance

#### `lifecycle.py` - Plugin Lifecycle Manager

**Purpose**: Handles plugin initialization and cleanup coordination.

**Key Classes**:
- `PluginLifecycleManager`: Manages plugin lifecycle events

**Key Methods**:
- `initialize_plugin(plugin)`: Initialize individual plugin
- `shutdown_plugin(plugin)`: Cleanup plugin resources
- `initialize_all_plugins()`: Initialize all enabled plugins

#### `state_manager.py` - Plugin State Manager

**Purpose**: Manages plugin runtime state and metadata.

**Key Classes**:
- `PluginStateManager`: Tracks plugin enabled/disabled state

**Key Methods**:
- `enable_plugin(name)`, `disable_plugin(name)`: State transitions
- `is_enabled(name)`: Check plugin state
- `get_metadata(name)`: Get plugin metadata

#### `config_manager.py` - Plugin Config Manager

**Purpose**: Persists plugin configuration and state to disk.

**Key Classes**:
- `PluginConfigManager`: JSON-based configuration persistence

**Key Methods**:
- `save_plugin_config(name, enabled, priority, config)`: Persist plugin config
- `load_plugin_config(name)`: Load persisted configuration

#### `metadata.py` - Plugin Metadata

**Purpose**: Defines plugin metadata structures and validation.

**Key Classes**:
- `PluginConfig`: Configuration model for plugins
- `PluginMetadata`: Rich metadata for plugin information

### `backend.src.core.security`

Security framework.

#### `policy.py` - Security Policy

**Purpose**: Defines security policies.

**Key Classes**:
- `SecurityPolicy`: Security policy definitions

#### `executor.py` - Security Executor

**Purpose**: Executes security checks.

**Key Classes**:
- `SecurityExecutor`: Executes security policy checks

### `backend.src.core.services`

Infrastructure services.

#### `file_service.py` - File Service

**Purpose**: File operations service.

**Key Classes**:
- `FileService`: Handles file operations

#### `tts_service.py` - TTS Service

**Purpose**: Text-to-speech service.

**Key Classes**:
- `TTSService`: Provides TTS functionality

#### `workspace_service.py` - Workspace Service

**Purpose**: Workspace management service.

**Key Classes**:
- `WorkspaceService`: Manages workspace operations

#### `agent_factory.py` - Agent Factory

**Purpose**: Factory for creating agent sessions.

**Key Classes**:
- `AgentFactory`: Creates agent sessions

### `backend.src.core.utils`

Utility modules.

#### `file_reader.py` - File Reader

**Purpose**: Reads files with type detection.

**Key Classes**:
- `FileReader`: Reads files with automatic type detection

#### `file_type.py` - File Type Detection

**Purpose**: Detects file types.

**Key Classes**:
- `FileTypeDetector`: Detects file types

#### `schema_generator.py` - Schema Generator

**Purpose**: Generates JSON schemas.

**Key Functions**:
- `generate_json_schema(model: Type) -> Dict[str, Any]`: Generates JSON schema from Pydantic model

## LLM Integration

### `backend.src.llm`

LLM integration with multi-provider support.

#### `llm_client.py` - LLM Client

**Purpose**: Unified LLM client interface.

**Key Classes**:
- `LLMClient`: Unified LLM client

**Key Methods**:
- `get_completion_stream(model: str, messages: List[LLMMessage]) -> AsyncGenerator[Dict[str, Any], None]`: Streams LLM responses

#### `model_service.py` - Model Service

**Purpose**: Model management service.

**Key Classes**:
- `ModelService`: Manages available models

**Key Methods**:
- `get_all_models() -> List[Dict[str, Any]]`: Gets all available models

#### `prompt_constructor.py` - Prompt Constructor

**Purpose**: Constructs prompts with tool schemas and memory context.

**Key Classes**:
- `PromptConstructor`: Builds prompts for LLM

**Key Methods**:
- `build_prompt(history: List[LLMMessage], include_tools: bool = True) -> List[LLMMessage]`: Builds prompt with context

#### `parser.py` - Response Parser

**Purpose**: Parses LLM responses and extracts tool calls.

**Key Classes**:
- `ResponseParser`: Parses LLM responses

**Key Methods**:
- `parse_response(response_text: str) -> ParsedResponse`: Parses response and extracts tool calls

#### `providers/` - LLM Providers

**Purpose**: Provider-specific implementations.

**Key Providers**:
- `openai.py`: OpenAI provider
- `anthropic.py`: Anthropic provider
- `gemini.py`: Google Gemini provider
- `local.py`: Local/Ollama provider
- `openrouter.py`: OpenRouter provider
- `mistral.py`: Mistral provider
- `base.py`: Base provider class

## Memory System

### `backend.src.memory`

Vector-based memory system with episodic and semantic storage.

#### `memory_manager.py` - Memory Manager

**Purpose**: High-level interface for memory operations.

**Key Classes**:
- `MemoryManager`: Coordinates memory operations

**Key Methods**:
- `store_episodic_memory(user_message: str, assistant_response: str) -> None`: Stores episodic memory
- `retrieve_memories(query: str) -> List[Dict[str, Any]]`: Retrieves relevant memories
- `format_context(memories: List[Dict[str, Any]]) -> str`: Formats memories for context

#### `embeddings.py` - Embeddings Service

**Purpose**: Text vectorization using sentence transformers.

**Key Classes**:
- `EmbeddingsService`: Generates text embeddings

**Key Methods**:
- `generate_embedding(text: str) -> List[float]`: Generates embedding for text

#### `storage/` - Storage Backends

**Purpose**: Storage implementations.

**Key Classes**:
- `LocalMemoryStore`: SQLite-based vector storage
- `MemoryStoreInterface`: Abstract storage interface

#### `retrieval/` - Retrieval Engine

**Purpose**: Hybrid search combining semantic similarity and recency.

**Key Classes**:
- `RetrievalEngine`: Retrieves relevant memories
- `Summarizer`: LLM-powered summarization service

## SDK

### `backend.src.sdk`

SDK for tool and agent development.

#### `tool.py` - Tool Base Class

**Purpose**: Base class for all tools.

**Key Classes**:
- `Tool`: Base class for tools

**Key Methods**:
- `run(args: Dict[str, Any], context: ToolContext) -> ToolResult`: Executes tool

#### `context.py` - Execution Context

**Purpose**: Execution context for tools.

**Key Classes**:
- `ToolContext`: Context provided to tools during execution

#### `errors.py` - SDK Exceptions

**Purpose**: SDK-specific exceptions.

**Key Classes**:
- `SDKError`: Base SDK exception
- `ToolError`: Tool execution errors

#### `agents/base.py` - Agent Base Class

**Purpose**: Base class for agent implementations.

**Key Classes**:
- `BaseAgent`: Base class for agents

## Services

### `backend.src.services.vision`

Vision services for AI-powered visual understanding.

#### `internvl.py` - InternVL Service

**Purpose**: InternVL model integration for visual understanding.

**Key Classes**:
- `InternVLService`: Provides vision capabilities

#### `coordinates.py` - Coordinate Utilities

**Purpose**: Coordinate transformation utilities.

**Key Functions**:
- Coordinate transformation functions for UI interaction

## Tools System

### `backend.src.tools`

Enterprise-grade tool management system.

#### `registry.py` - Tool Registry

**Purpose**: Central registry for tools with marketplace integration and schema management.

**Key Classes**:
- `ToolRegistry`: Manages tool registration, lookup, and lifecycle

**Key Methods**:
- `register_tool(tool)`: Register a tool instance
- `get_tool(name)`: Get tool by name (searches built-in + marketplace)
- `load_core_tools_async()`: Load built-in tools asynchronously
- `load_marketplace_tools(dir)`: Load tools from marketplace directory
- `get_function_declarations()`: Get JSON schemas for all tools (cached)

#### `schema_registry.py` - Schema Registry

**Purpose**: Caches and manages tool JSON schemas for LLM integration.

**Key Classes**:
- `SchemaRegistry`: Manages tool schema generation and caching

**Key Methods**:
- `get_schema(tool)`: Get cached schema for tool
- `get_declarations(tools)`: Get function declarations for multiple tools

#### `tool_search_engine.py` - Tool Search Engine

**Purpose**: Provides semantic search capabilities for tool discovery.

**Key Classes**:
- `ToolSearchEngine`: Indexes and searches tools by description and metadata

**Key Methods**:
- `index_tools()`: Index all registered tools
- `search_tools(query)`: Search tools by semantic similarity

#### `orchestrator.py` - Tool Orchestrator

**Purpose**: Coordinates complex multi-tool executions.

**Key Classes**:
- `ToolOrchestrator`: Orchestrates tool execution

#### `loader.py` - Tool Loader

**Purpose**: Dynamic tool loading system.

**Key Classes**:
- `ToolLoader`: Loads tools from filesystem and marketplace

#### `execution/` - Execution Engine

**Purpose**: Secure execution environment with strategy pattern and execution chains.

**Key Classes**:
- `ToolExecutionEngine`: Main execution engine coordinating strategies
- `BatchExecutor`: Parallel execution with concurrency control
- `ToolOrchestrator`: Orchestrates tool execution and aggregates results (aggregation logic inlined)

**Execution Strategies**:
- `SecurityExecutionStrategy`: Permission checks and resource limits
- `ValidationExecutionStrategy`: Input validation
- `AuditExecutionStrategy`: Execution logging and audit trails
- `BaseExecutionStrategy`: Abstract base for custom strategies

**Key Components**:
- `ExecutionContext`: Context passed through execution chain
- `ExecutionResult`: Standardized result format
- `ToolResult`: Tool execution output wrapper

#### `discovery/` - Tool Discovery

**Purpose**: Discovers tools from multiple sources.

**Key Classes**:
- `ToolDiscoverer`: Base discoverer class
- `FilesystemDiscoverer`: Discovers tools from filesystem
- `MarketplaceDiscoverer`: Discovers tools from marketplace

#### `marketplace/` - Marketplace System

**Purpose**: Community tool distribution and management.

**Key Classes**:
- `MarketplaceManager`: Manages tool marketplace loading and caching
- `MarketplaceSearch`: Searches marketplace for tools by keywords
- `MarketplaceLoader`: Loads tools from marketplace directories

#### `categorization.py` - Tool Categorization

**Purpose**: Domain-based tool categorization and organization.

**Key Classes**:
- `ToolDomain`: Enum for tool domain categories (computer, filesystem, system, etc.)
- `ToolCategory`: Dataclass for category metadata
- `ToolCategorizer`: Service for categorizing tools by domain

**Key Methods**:
- `categorize_tool(tool)`: Categorize a tool by its domain
- `get_tools_by_domain(tools, domain)`: Filter tools by domain
- `get_domain_statistics(tools)`: Get statistics by domain

#### `computer/` - Computer Control Tools

**Purpose**: Desktop automation tools.

**Key Tools**:
- `mouse_tool.py`: Mouse control
- `keyboard_tool.py`: Keyboard input
- `screenshot_tool.py`: Screenshot capture
- `click_ocr_tool.py`: OCR-based clicking
- `scroll_tool.py`: Scroll control

#### `filesystem/` - Filesystem Tools

**Purpose**: File system operations.

**Key Tools**:
- `read_file_tool.py`: Read files
- `write_file_tool.py`: Write files
- `list_directory_tool.py`: List directories
- `glob_tool.py`: File globbing
- `search_file_content_tool.py`: Search file content

#### `system/` - System Tools

**Purpose**: System command execution.

**Key Tools**:
- `shell_tool.py`: Shell command execution

## Summary

This module reference provides a comprehensive overview of all modules in the Personal Assistant Backend. Each module is documented with:

- **Purpose**: What the module does
- **Key Classes**: Main classes and their responsibilities
- **Key Methods**: Important methods and their purposes
- **Dependencies**: Other modules this module depends on

### Recently Updated Sections

- **Container System**: Added documentation for `initializer.py`, `config_updater.py`, `factories/`, and `session_factory.py`
- **Tool Execution**: Enhanced documentation for execution strategies and security components
- **Plugin System**: Expanded documentation for lifecycle management, state management, and configuration persistence
- **Vision Services**: Updated to match actual InternVL implementation

For detailed API documentation, see:
- [API Reference](api_reference.md) - WebSocket API documentation
- [Internal API Reference](internal_api_reference.md) - Internal interfaces
- [SDK Reference](sdk_reference.md) - Tool and agent SDK documentation
