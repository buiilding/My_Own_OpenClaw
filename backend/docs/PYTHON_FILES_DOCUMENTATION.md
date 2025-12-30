# Python Files Documentation

This document provides a comprehensive overview of all Python files in the `backend/src` directory, organized by module structure. Each entry includes the file path and a summary describing its purpose and role in the project.

## Table of Contents

- [Root Module](#root-module)
- [Agent Module](#agent-module)
- [API Module](#api-module)
- [Core Module](#core-module)
- [LLM Module](#llm-module)
- [Memory Module](#memory-module)
- [SDK Module](#sdk-module)
- [Services Module](#services-module)
- [Tools Module](#tools-module)

---

## Root Module

### `backend/src/__init__.py`
Package initialization file for the backend source code. Provides package-level documentation describing the complete backend implementation including agent execution, tool system, memory management, LLM integration, and API layer.

### `backend/src/main.py`
Main application entry point. Initializes the FastAPI application, sets up dependency injection, configures CORS, and manages the application lifecycle including startup and shutdown. Configures logging levels to suppress noisy debug logs from third-party libraries (litellm, httpx, httpcore, urllib3, aiosqlite). Includes the WebSocket router for real-time communication.

---

## Agent Module

### `backend/src/agent/__init__.py`
Agent domain package exports. Exports `AgentSession`, `AgentExecutor`, and `SessionManager` classes for use throughout the application. Provides agent domain functionality including session management and execution.

### `backend/src/agent/core.py`
Core agent session management. Contains the `AgentSession` class which is the main "brain" of the assistant. Manages conversation history, orchestrates execution using `AgentExecutor`, coordinates LLM interactions with tool calls, streams responses, persists conversation memory, and handles session lifecycle events. The `process_query()` method accepts an optional `image_data` parameter for multimodal queries, enabling screenshot and image data to be passed directly to the agent.

### `backend/src/agent/executor.py`
Agent execution loop coordinator. Implements `AgentExecutor` which processes user queries through a complete pipeline: memory retrieval → query processing → LLM interaction → tool execution → response streaming. Delegates to `InteractionLoop` and `ResultProcessor` for actual execution logic. The `process_query()` method accepts an optional `image_data` parameter and passes it to the conversation history, enabling multimodal queries with image data.

### `backend/src/agent/interaction_loop.py`
Main interaction loop implementation. Contains the `InteractionLoop` class that executes the core agent cycle: Prompt → LLM → Parse → Tools → Repeat. Handles LLM streaming, response parsing, tool execution coordination, and decision logic for when to continue or terminate the loop.

### `backend/src/agent/result_processor.py`
Tool execution result processing. Handles processing of tool execution results including artifact extraction (screenshots, OCR results), memory storage, event publishing, and plugin integration. Formats tool outputs for both LLM history and UI display.

### `backend/src/agent/session_manager.py`
User session lifecycle management. Manages the lifecycle of agent sessions including creation, retrieval, cleanup, and periodic memory summarization tasks. Implements configuration change subscriptions to update all active sessions when settings change.

### `backend/src/agent/state.py`
Conversation history manager. Contains the `ConversationHistory` class which manages conversation state with automatic pruning to prevent context window overflow. Stores messages in internal format and converts to LLM message format when retrieving history.

### `backend/src/agent/plugins/__init__.py`
Agent plugins package initialization. Exports `AgentPlugin` interface, `PluginResult` class, `PluginManager` class, and `ComputerUsePlugin` implementation.

### `backend/src/agent/plugins/computer.py`
Computer control plugin. Provides plugin hooks for computer interaction tools, handling screenshots and computer state management.

### `backend/src/agent/plugins/interface.py`
Plugin interface definitions. Defines the base interface and protocols that agent plugins must implement.

### `backend/src/agent/plugins/manager.py`
Plugin manager for agent execution. Manages plugin lifecycle during tool execution, coordinating plugin hooks and artifact collection.

### `backend/src/agent/plugins/ocr_plugin.py`
OCR (Optical Character Recognition) plugin. Provides OCR analysis functionality for screenshots. Tools can use the `perform_ocr()` method to analyze screenshots. The plugin maintains a singleton OCR engine instance for efficient reuse across the application.

---

## API Module

### `backend/src/api/__init__.py`
API layer package initialization. Contains documentation describing the FastAPI application routes, dependencies, and schema definitions for the WebSocket-based API. Empty package initialization file that documents the API layer structure.

### `backend/src/api/schema.py`
API schema definitions. Defines Pydantic models for all WebSocket message types used in the API, including incoming messages (query, settings updates, ping, wakeword detection) and outgoing responses (streaming responses, tool calls, errors, audio chunks).

### `backend/src/api/deps.py`
FastAPI dependencies for dependency injection. Provides dependency injection functions for FastAPI routes, including `get_container()` and `get_session_manager()`. Also provides `set_container()` for container initialization and type aliases (`ContainerDep`, `SessionManagerDep`) for dependency annotations. Uses dependency-injector for proper DI instead of global state.

### `backend/src/api/routes/__init__.py`
API routes package initialization. Empty package initialization file for the API routes module.

### `backend/src/api/routes/websocket.py`
WebSocket API routes. Handles WebSocket connections for real-time communication with the frontend. Manages message routing, session management, handshaking, and streaming responses from the agent. Routes messages to appropriate handlers using the handler registry pattern.

### `backend/src/api/handlers/__init__.py`
WebSocket message handlers package. Provides handler initialization function (`initialize_handlers`) and exports all handler classes. Registers handlers for ping, query, settings, models, and wakeword messages. Exports `MessageHandler`, `MessageHandlerRegistry`, and handler initialization utilities.

### `backend/src/api/handlers/base.py`
Base handler classes and registry. Defines the `MessageHandler` abstract base class and `MessageHandlerRegistry` for WebSocket message handling. Provides a centralized way to register and route messages to appropriate handlers with middleware support.

### `backend/src/api/handlers/ping_handler.py`
Ping message handler. Handles ping/pong messages for WebSocket connection health checks. Validates ping messages and responds with pong messages.

### `backend/src/api/handlers/query_handler.py`
Query message handler. Processes incoming query messages from WebSocket clients, validates them, and orchestrates the complete query processing pipeline. Handles agent session management, LLM interaction, tool execution, streaming responses, text-to-speech integration, and response formatting.

### `backend/src/api/handlers/response_formatter.py`
Response formatter for query handler. Formats agent events into WebSocket response messages, converting internal event types to the standardized WebSocket message format.

### `backend/src/api/handlers/settings_handler.py`
Settings message handlers. Contains handlers for load-settings, update-settings, and list-models messages. Manages configuration updates, validates settings, and notifies subscribers of changes.

### `backend/src/api/handlers/tts_manager.py`
TTS (Text-to-Speech) manager for query handler. Manages TTS initialization, streaming, and cleanup during query processing. Handles audio chunk generation and streaming to WebSocket clients.

### `backend/src/api/handlers/wakeword_handler.py`
Wakeword message handler. Handles wakeword detection and activation messages. When wakeword is detected, enables voice mode, sends greetings, generates TTS audio, and prepares for continuous listening.

---

## Core Module

### `backend/src/core/__init__.py`
Core infrastructure package initialization. Contains documentation describing core infrastructure components including dependency injection, configuration management, event bus, caching, security, and exception handling. Empty package initialization file that documents the core infrastructure structure.

### `backend/src/core/bootstrap/__init__.py`
Bootstrap package initialization. Contains the `Bootstrap` facade class that coordinates application startup by delegating to `InitializationCoordinator`. Also exports `InitializationCoordinator`, `PluginInitializer`, and `HandlerInitializer` classes for use throughout the application. Provides a clean interface for application initialization phases.

### `backend/src/core/bootstrap/coordinator.py`
Initialization coordinator. Coordinates the initialization phases of the application startup process. Manages initialization sequence: Configuration → Container → Services (SessionManager, Handlers) → Plugins.

### `backend/src/core/bootstrap/handler_initializer.py`
Handler initializer. Handles WebSocket message handler initialization. Registers all message handlers with the handler registry during application startup.

### `backend/src/core/bootstrap/plugin_initializer.py`
Plugin initializer. Handles plugin discovery, registration, and initialization. Scans plugin directories, discovers plugins, and initializes the plugin registry.

### `backend/src/core/bus.py`
Enhanced event bus. Provides a robust event bus with priority support, filtering, error handling, and middleware capabilities for decoupling components. Supports both sync and async handlers with priority-based execution.

### `backend/src/core/cache.py`
Caching layer. Provides in-memory caching with TTL support for tool schemas, embeddings, LLM client instances, and other frequently accessed data. Includes `Cache` class for individual caches and `CacheManager` for centralized cache management.

### `backend/src/core/config/__init__.py`
Configuration package initialization. Exports configuration models (`AppConfig`, `LLMProviders`, provider-specific configs including `OpenAIConfig`, `AnthropicConfig`, `GeminiConfig`, etc.), `ConfigManager`, and utility functions (`get_config_manager`, `load_settings_from_file`, `save_settings_to_file`, `load_api_key_for_provider`) for loading and saving configuration files.

### `backend/src/core/config/manager.py`
Configuration manager. Handles loading and saving of application configuration from YAML files. Manages configuration directory location based on OS, loads API keys from environment variables, and provides immutable config access.

### `backend/src/core/config/models.py`
Configuration models. Contains Pydantic models for application configuration including `AppConfig` (main config), provider-specific configs (OpenAI, Anthropic, Gemini, etc.), and `LLMProviders` container. Defines all configuration fields with defaults and validation.

### `backend/src/core/config_service.py`
Configuration service layer. Provides a centralized configuration service with change notifications and type-safe access. Wraps `ConfigManager` and provides a cleaner interface for components that need to react to configuration changes.

### `backend/src/core/config_subscription_manager.py`
Configuration subscription manager. Handles subscription management for configuration change notifications. Supports both protocol-based subscribers and callback functions, separating subscription management from configuration data access.

### `backend/src/core/container/__init__.py`
Container package initialization. Exports container classes including `Container`, `ApplicationContainer`, `CoreContainer`, `ToolContainer`, and `MemoryContainer` for dependency injection. Provides centralized access to all container types used in the dependency injection system.

### `backend/src/core/container/container.py`
Dependency injection container. Main application container using dependency-injector library. Orchestrates the entire application's dependency graph using domain-driven design principles. Composes specialized containers for different functional areas (Core, Tool, Memory).

### `backend/src/core/container/config_updater.py`
Container configuration updater. Handles configuration updates for the container and its dependencies, ensuring all components receive updated configuration.

### `backend/src/core/container/core_container.py`
Core container. Provides foundation services including config, LLM, TTS, and core services. Part of the container composition pattern.

### `backend/src/core/container/factories.py`
Container factories. Provides factory functions for creating container components, including tool instantiator factory.

### `backend/src/core/container/initializer.py`
Container initializer. Handles async initialization of container components, ensuring proper initialization order and dependency resolution. Loads marketplace tools from `tools/verified/` directory during startup. Initializes memory store, loads core tools asynchronously, discovers marketplace tools, and indexes tools for search engine. Loads marketplace tools from `tools/verified/` directory during startup. Initializes memory store, loads core tools asynchronously, discovers marketplace tools, and indexes tools for search engine.

### `backend/src/core/container/memory_container.py`
Memory container. Provides memory system components including embeddings, storage, and retrieval services. Part of the container composition pattern.

### `backend/src/core/container/session_factory.py`
Agent session factory. Creates `AgentSession` instances with all dependencies properly injected. Handles session creation with proper wiring of memory, tools, LLM client, and plugin registry.

### `backend/src/core/container/tool_container.py`
Tool container. Provides tool system components including registry, orchestrator, loaders, and search engine. Part of the container composition pattern.

### `backend/src/core/error_handling.py`
Standardized error handling utilities. Provides utilities for consistent error handling including `Result` type for explicit error handling and error handling decorators. Supports both sync and async error handling patterns.

### `backend/src/core/events.py`
Event system definitions. Defines all event types used throughout the application for decoupled communication between components. Includes events for user messages, agent responses, tool execution, memory storage, configuration changes, and errors.

### `backend/src/core/exceptions.py`
Centralized exception hierarchy. Defines custom exception classes inheriting from `BaseAppError` for consistent error handling. Includes exceptions for configuration errors, LLM errors, tool execution errors, memory errors, and session errors.

### `backend/src/core/interfaces/__init__.py`
Interfaces package initialization. Exports protocol interfaces including `ToolInterface`, `ToolResult`, `ToolContext`, `Kind`, `MemoryStoreInterface`, `MemoryManagerInterface`, and `LLMClientInterface`. Provides centralized access to all protocol-based interfaces used throughout the application.

### `backend/src/core/interfaces/config.py`
Configuration interface definitions. Defines protocols and interfaces for configuration-related components.

### `backend/src/core/interfaces/embedding.py`
Embedding interface definitions. Defines protocols for embedding generation services.

### `backend/src/core/interfaces/llm.py`
LLM interface definitions. Defines protocols for LLM client implementations.

### `backend/src/core/interfaces/memory.py`
Memory interface definitions. Defines protocols for memory management operations.

### `backend/src/core/interfaces/memory_store.py`
Memory store interface. Defines the interface for memory storage backends, specifying methods for adding, searching, and managing memories.

### `backend/src/core/interfaces/services.py`
Services interface definitions. Defines protocols for core service implementations.

### `backend/src/core/interfaces/tool.py`
Tool interface definitions. Defines protocols and data structures for tool execution results, including `ToolResult` class.

### `backend/src/core/plugin_config.py`
Plugin configuration management. Manages configuration for plugins, providing per-plugin configuration storage and access.

### `backend/src/core/plugins/__init__.py`
Plugins package initialization. Exports plugin discovery, registry, and lifecycle management classes including `PluginRegistry`, `PluginDiscoverer` implementations (`EntryPointPluginDiscoverer`, `FilesystemPluginDiscoverer`), `PluginMetadata`, `PluginConfig`, `PluginLifecycleManager`, `PluginStateManager`, `PluginConfigManager`, and `PluginDiscoveryService`. Provides plugin registry, discovery, metadata, and lifecycle management.

### `backend/src/core/plugins/config_manager.py`
Plugin configuration manager. Manages configuration for individual plugins, handling plugin-specific settings and defaults.

### `backend/src/core/plugins/discovery.py`
Plugin discovery base classes. Defines base classes and interfaces for plugin discovery mechanisms, including entry point and filesystem discoverers.

### `backend/src/core/plugins/discovery_service.py`
Plugin discovery service. Coordinates plugin discovery from multiple sources (entry points, filesystem), validates discovered plugins, and registers them with the plugin registry.

### `backend/src/core/plugins/lifecycle.py`
Plugin lifecycle management. Handles plugin initialization, activation, deactivation, and shutdown. Manages plugin state transitions and ensures proper cleanup.

### `backend/src/core/plugins/metadata.py`
Plugin metadata definitions. Defines data structures for plugin metadata including name, version, description, dependencies, and configuration schema.

### `backend/src/core/plugins/registry.py`
Plugin registry. Central registry for managing plugins throughout the application. Handles plugin registration, discovery, lifecycle management, and provides access to enabled/disabled plugins.

### `backend/src/core/plugins/state_manager.py`
Plugin state manager. Manages plugin state persistence and retrieval, handling plugin enable/disable state across application restarts.

### `backend/src/core/security/__init__.py`
Security package initialization. Exports security executor classes (`ToolExecutor`, `DirectToolExecutor`, `ProcessSandboxedExecutor`), security policy classes (`SecurityPolicy`, `Permission`, `ResourceLimits`, `ToolExecutionAudit`), and security utility functions (`get_tool_executor`, `set_tool_executor`, `get_security_policy`, `check_tool_execution_permission`, `audit_tool_execution`). Provides security-related functionality including tool execution sandboxing, isolation, and security boundaries.

### `backend/src/core/security/executor.py`
Security executor. Provides secure tool execution with policy enforcement. Implements security policies for tool execution, validating tool calls against security rules.

### `backend/src/core/security/policy.py`
Security policy definitions. Defines security policies for tool execution, including allowed operations, resource limits, and access controls.

### `backend/src/core/services/__init__.py`
Services package initialization. Exports core service classes including `ContextFactory` (creates execution contexts for tools), `ServiceContainer` (unified service access layer), `WorkspaceService` (workspace operations), `FileService` (file operations), and `StorageService` (storage operations). Provides core services for the application including context creation and service access.

### `backend/src/core/services/agent_factory.py`
Agent factory service. Provides factory methods for creating sub-agent sessions (scoped AgentSessions) with restricted tools and custom system prompts. Creates `RestrictedToolRegistry` wrappers to limit tool access for sub-agents. Ensures sub-agents receive the plugin registry from the parent session, enabling plugins like `ComputerUsePlugin` and `OCRPlugin` to function correctly for all agents.

### `backend/src/core/services/context_factory.py`
Context factory service. Creates execution contexts for tools, providing user context, session context, and runtime information to tool executions. Includes `tool_search_engine` in the services dictionary if available, enabling marketplace search functionality for tools that need it.

### `backend/src/core/services/file_service.py`
File service. Provides file operations including reading, writing, and metadata retrieval. Handles file type detection and content extraction.

### `backend/src/core/services/interfaces.py`
Service interfaces. Defines protocols for core service implementations.

### `backend/src/core/services/service_container.py`
Service container. Provides a container for core services, managing service lifecycle and dependencies.

### `backend/src/core/services/storage_service.py`
Storage service. Provides storage operations for application data, handling file system operations and data persistence.

### `backend/src/core/services/tts_service.py`
Text-to-Speech service. Provides TTS functionality using external TTS libraries. Handles text-to-speech conversion, audio streaming, and TTS model management.

### `backend/src/core/services/workspace_service.py`
Workspace service. Manages workspace-related operations including workspace detection, path resolution, and workspace-specific configuration.

### `backend/src/core/shutdown.py`
Application shutdown module. Handles graceful shutdown of all application components including plugins and background tasks.

### `backend/src/core/types.py`
Type definitions and TypedDict structures. Provides TypedDict definitions for common dictionary structures used throughout the codebase, including LLM messages, streaming chunks, tool results, memory items, and API message formats.

### `backend/src/core/unified_config.py`
Unified configuration service. Provides a single source of truth for all configuration access, consolidating AppConfig, PluginConfig, and runtime configuration. Provides unified interface for application and plugin configuration.

### `backend/src/core/utils/__init__.py`
Utilities package initialization. Empty package initialization file for the core utilities module.

### `backend/src/core/utils/binary_reader.py`
Binary file reader. Provides utilities for reading binary files and extracting metadata.

### `backend/src/core/utils/file_detector.py`
File type detector. Detects file types based on content, extensions, and MIME types.

### `backend/src/core/utils/file_extensions.py`
File extension utilities. Provides mappings and utilities for file extensions and their associated types.

### `backend/src/core/utils/file_metadata.py`
File metadata utilities. Extracts and manages file metadata including size, modification time, and type information.

### `backend/src/core/utils/file_reader.py`
File reader utilities. Provides file reading functionality with support for different file types and encodings.

### `backend/src/core/utils/file_type.py`
File type utilities. Provides file type detection and classification based on content and extensions.

### `backend/src/core/utils/mime_types.py`
MIME type utilities. Provides MIME type detection and mapping utilities.

### `backend/src/core/utils/path_utils.py`
Path utilities. Provides path manipulation and resolution utilities, including workspace-relative path handling.

### `backend/src/core/utils/schema_generator.py`
Schema generator utilities. Generates JSON schemas from Pydantic models for tool definitions and API validation.

### `backend/src/core/utils/text_reader.py`
Text file reader. Provides specialized text file reading with encoding detection and content extraction.

### `backend/src/core/validation.py`
Centralized validation framework. Provides Pydantic-based validation for all API inputs with consistent error handling. Includes validation functions for messages, queries, settings updates, and field-level validation.

---

## LLM Module

### `backend/src/llm/__init__.py`
LLM package initialization. Exports `LLMClient`, `get_llm_client`, `ModelService`, `get_model_service`, `PromptConstructor`, `ResponseParser`, `ParsedResponse`, and `ParsedToolCall` classes for use throughout the application. Provides LLM functionality for the agent.

### `backend/src/llm/llm_client.py`
LLM client abstraction layer. Provides a unified interface for communicating with LLM providers using LiteLLM. Defines abstract `LLMClient` base class and `LiteLLMClient` implementation that delegates to provider-specific implementations.

### `backend/src/llm/model_service.py`
Model service. Manages LLM model discovery, listing, and configuration. Provides model registry functionality for discovering available models from different providers.

### `backend/src/llm/models_config.py`
Model configuration. Defines model configuration structures and model registry settings for different LLM providers.

### `backend/src/llm/parser.py`
LLM response parser. Parses LLM responses to extract tool calls, text content, and structured data. Handles different response formats and extracts tool call information for execution.

### `backend/src/llm/prompt_constructor.py`
Prompt constructor. Builds prompts for LLM interactions including system prompts, conversation history, and tool definitions. Formats messages according to LLM provider requirements. Includes tool schemas in the system prompt on the first iteration (`include_tools=True`), ensuring all marketplace tools are available from the start. Tool schemas are formatted as clean JSON with optimized structure.

### `backend/src/llm/prompts.py`
Prompt templates. Loads and formats the system prompt from `system_prompt.txt` with current context (OS, working directory). Provides the `load_system_prompt()` function that reads the system prompt file and formats it with runtime information.

### `backend/src/llm/system_prompt.txt`
System prompt template file. Contains the complete system prompt text that defines agent behavior, tool usage guidelines, workflow phases, and available tool categories. Includes instructions for marketplace tools, tool schema compliance, and response formatting. This file is loaded by `prompts.py` and formatted with runtime context before being sent to the LLM.

### `backend/src/llm/providers/__init__.py`
LLM providers package initialization. Exports provider factory function (`create_provider_factory`) and provider getter function (`get_provider`) that create and retrieve LLM provider instances. The factory creates instances of all supported providers (OpenAI, Anthropic, Gemini, Ollama, OpenRouter, Mistral, LMStudio, Default) based on configuration.

### `backend/src/llm/providers/anthropic.py`
Anthropic provider implementation. Implements LLM client for Anthropic's Claude models, handling API communication, streaming, and error handling.

### `backend/src/llm/providers/base.py`
Base provider class. Defines abstract base class for LLM providers with common interface for completion and streaming. All provider implementations inherit from this class.

### `backend/src/llm/providers/default.py`
Default provider implementation. Provides fallback provider implementation when specific provider is not available.

### `backend/src/llm/providers/gemini.py`
Google Gemini provider implementation. Implements LLM client for Google's Gemini models, handling API communication and streaming.

### `backend/src/llm/providers/local.py`
Local LLM provider implementation. Implements LLM client for local models (Ollama, LMStudio), handling local API communication and streaming.

### `backend/src/llm/providers/mistral.py`
Mistral AI provider implementation. Implements LLM client for Mistral AI models, handling API communication and streaming.

### `backend/src/llm/providers/openai.py`
OpenAI provider implementation. Implements LLM client for OpenAI models, handling API communication, streaming, and error handling including rate limit management.

### `backend/src/llm/providers/openrouter.py`
OpenRouter provider implementation. Implements LLM client for OpenRouter service which provides access to multiple LLM providers through a unified API.

---

## Memory Module

### `backend/src/memory/__init__.py`
Memory domain package initialization. Exports memory schema classes (`EpisodicMemory`, `SemanticMemory`) and `MemoryManager` class for memory operations. Provides memory domain functionality for the application.

### `backend/src/memory/embeddings.py`
Embedding generation. Provides embedding generation functionality using sentence transformers. Handles text embedding creation for semantic search and memory retrieval.

### `backend/src/memory/memory_manager.py`
High-level memory manager. Manages episodic and semantic memory storage, retrieval, and summarization. Provides unified interface for memory operations including storing interactions, retrieving relevant memories, and formatting memory context for LLM prompts.

### `backend/src/memory/schemas.py`
Memory schemas. Defines Pydantic models for memory data structures including `EpisodicMemory` and `SemanticMemory` with their fields and validation rules.

### `backend/src/memory/retrieval/__init__.py`
Retrieval package initialization. Exports `SemanticRetrieval` and `MemorySummarizer` classes for memory search and summarization functionality. Provides semantic search, retrieval, and summarization capabilities for the memory system.

### `backend/src/memory/retrieval/retrieval.py`
Semantic retrieval service. Provides semantic search functionality for retrieving relevant memories based on query embeddings. Implements hybrid search combining semantic and keyword-based retrieval.

### `backend/src/memory/retrieval/summarizer.py`
Memory summarizer. Summarizes episodic memories into semantic memories using LLM. Processes batches of episodic memories and extracts key facts, preferences, and procedural knowledge.

### `backend/src/memory/storage/__init__.py`
Storage package initialization. Exports `MemoryInterface` protocol and `LocalMemoryStore` implementation class for memory persistence. Provides storage implementations and interfaces for the memory system.

### `backend/src/memory/storage/interface.py`
Memory storage interface. Defines the interface for memory storage backends, specifying methods for adding, searching, and managing memories.

### `backend/src/memory/storage/local_store.py`
Local memory store implementation. Implements memory storage using local database (SQLite with vector search). Handles episodic and semantic memory persistence, vector search, and memory retrieval operations.

---

## SDK Module

### `backend/src/sdk/__init__.py`
SDK package initialization. Exports `Tool` base class, `ToolContext` and related context classes (`UserContext`, `SessionContext`, `ExecutionRuntime`), and `Context` alias for backward compatibility. Provides the base classes and interfaces for developing tools in the Personal Assistant system.

### `backend/src/sdk/agents/base.py`
Agent base classes for SDK. Provides base classes for developing custom agents using the SDK.

### `backend/src/sdk/context.py`
Tool context definitions. Defines `ToolContext` class and related context classes (`UserContext`, `SessionContext`, `ExecutionRuntime`) that provide execution context to tools including user information, session data, and runtime services.

### `backend/src/sdk/errors.py`
SDK error definitions. Defines custom exceptions for SDK-related errors including tool execution errors and validation errors.

### `backend/src/sdk/tool.py`
SDK tool base class. Provides the base `Tool` class that all tools in the system must inherit from. Tools are defined using Pydantic models for argument validation and async execution. Includes optimized JSON schema generation for LLM integration with automatic schema cleaning: removes unnecessary fields (title, additionalProperties, null defaults), simplifies Optional types, and produces compact, token-efficient schemas.

---

## Services Module

### `backend/src/services/vision/__init__.py`
Vision services package initialization. Exports `InternVLModel` class for vision model integration and coordinate utility functions (`extract_first_point`, `extract_last_bbox`, `scale_norm_to_pixels`) for vision-related coordinate transformations. Provides vision model handlers and coordinate utilities for computer vision tasks.

### `backend/src/services/vision/coordinates.py`
Coordinate utilities for vision. Provides utilities for coordinate transformations and screen coordinate handling for computer vision tasks.

### `backend/src/services/vision/internvl.py`
InternVL vision service. Integrates InternVL vision model for image understanding, OCR, and visual question answering capabilities.

---

## Tools Module

### `backend/src/tools/__init__.py`
Tools domain package initialization. Exports `ToolRegistry`, `ToolLoader`, `ToolOrchestrator` classes, and execution result types (`ToolExecutionResult`, `OrchestrationResult`). Contains all tool-related functionality including tool registry, loader, definitions, orchestrator, and individual tool implementations.

### `backend/src/tools/categorization.py`
Tool categorization. Categorizes tools by domain/functionality (filesystem, computer, system, etc.) for organization and filtering.

### `backend/src/tools/definitions.py`
Core tool definitions. Explicitly lists all core tools to be registered by the ToolRegistry in the `CORE_TOOLS` list. Avoids dynamic scanning for better static analysis and performance. Includes computer tools, filesystem tools, system tools, and marketplace tools.

### `backend/src/tools/lifecycle.py`
Tool lifecycle management. Manages tool loading, unloading, and lifecycle events throughout the application runtime.

### `backend/src/tools/loader.py`
Tool loader. Loads tools from filesystem, discovers tool definitions, and instantiates tool classes. Handles both core tools and marketplace tools. Provides robust module loading utilities (`load_module_from_file`, `_find_project_root`, `_ensure_parent_packages`) that handle relative imports correctly by registering parent packages in sys.modules. Supports synchronous marketplace tool loading for schema generation.

### `backend/src/tools/marketplace_manager.py`
Marketplace manager. Manages marketplace tools including discovery, loading, instantiation, and metadata management. Handles lazy loading of marketplace tools.

### `backend/src/tools/orchestrator.py`
Tool orchestrator. Coordinates tool execution, manages tool results, and provides streaming updates during tool operations. Handles execution order, error handling, result aggregation, and progress tracking.

### `backend/src/tools/registry.py`
Tool registry. Central registry for managing SDK tools. Handles tool discovery, registration, schema generation, secure execution, categorization, and runtime tool management. Supports both built-in and marketplace tools. Implements eager schema loading for marketplace tools: loads marketplace tool classes synchronously for schema generation even before first use, ensuring all marketplace tool schemas are included in the initial system prompt. Maintains a schema cache (`_schema_tool_cache`) to avoid redundant loading.

### `backend/src/tools/schema_registry.py`
Schema registry. Manages JSON schema generation for tools, providing caching and schema generation for LLM tool calling.

### `backend/src/tools/computer/__init__.py`
Computer tools package initialization. Exports all computer automation tool classes including `ClickOCRTool`, `ComputerInterface`, `ScreenshotTool`, `MouseTool`, `KeyboardTool`, `PredictClickTool`, and `ScrollTool`. Provides tools for controlling mouse, keyboard, and UI elements through computer use automation capabilities.

### `backend/src/tools/computer/click_ocr_tool.py`
Click OCR tool. Tool for clicking on screen elements identified by OCR text. Takes a screenshot, performs OCR analysis, and searches for matching text using fuzzy matching (0.8 similarity threshold). Accepts `text` (string) parameter to specify the text to search for. If exactly one match is found, clicks on it. If multiple matches are found, returns their coordinates for manual selection. Supports single, double, and right-click types.

### `backend/src/tools/computer/computer_interface.py`
Computer interface abstraction. Provides abstraction layer for computer control operations including mouse, keyboard, and screen capture functionality.

### `backend/src/tools/computer/keyboard_tool.py`
Keyboard control tool. Tool for simulating keyboard input including key presses, text input, and keyboard shortcuts.

### `backend/src/tools/computer/mouse_tool.py`
Mouse control tool. Tool for simulating mouse operations including clicks, movements, and drag operations.

### `backend/src/tools/computer/predict_click_tool.py`
Predict click tool. Tool for predicting click locations based on visual analysis and user intent.

### `backend/src/tools/computer/screenshot_tool.py`
Screenshot tool. Tool for capturing screenshots of the current screen state for visual analysis and context.

### `backend/src/tools/computer/scroll_tool.py`
Scroll control tool. Tool for simulating scroll operations including vertical and horizontal scrolling.

### `backend/src/tools/discovery/__init__.py`
Discovery package initialization. Exports `ToolDiscoverer` class that provides unified interface for discovering tools from various sources (core tools and marketplace tools). Acts as a facade for the tool discovery system.

### `backend/src/tools/discovery/base.py`
Discovery base classes. Defines base classes for tool discovery mechanisms.

### `backend/src/tools/discovery/core_definitions_discoverer.py`
Core definitions discoverer. Discovers tools from core tool definitions in the codebase.

### `backend/src/tools/discovery/marketplace_discoverer.py`
Marketplace discoverer. Discovers tools from the marketplace directory structure (`tools/verified/`). Scans tool directories, validates manifests, performs security scans, and returns tool metadata. Uses the centralized `load_module_from_file()` utility from `ToolLoader` for consistent module loading with proper package context for relative imports.

### `backend/src/tools/discovery/tool_discoverer.py`
Tool discoverer. Coordinates tool discovery from multiple sources and provides unified discovery interface.

### `backend/src/tools/execution/__init__.py`
Execution package initialization. Contains documentation for tool execution strategies module. Provides strategy pattern implementations for composable execution logic (security, auditing, caching, etc.). Empty package initialization file that documents the execution strategies module.

### `backend/src/tools/execution/aggregator.py`
**Note:** `ResultAggregator` has been removed. Aggregation logic is now inlined directly in `ToolOrchestrator.execute_tools_from_response()` for simplicity.

### `backend/src/tools/execution/batch_executor.py`
Batch executor. Implements `BatchExecutor` class that executes multiple tool calls in parallel batches with configurable concurrency control. Manages parallel execution of tools while respecting maximum concurrent execution limits.

### `backend/src/tools/execution/engine.py`
Tool execution engine. Implements `ToolExecutionEngine` class that handles core execution logic for individual tool calls. Manages tool retrieval, parameter validation, context creation, and execution via strategy chain. Separates execution logic from orchestration concerns.

### `backend/src/tools/execution/progress_tracker.py`
Progress tracker. Implements `ProgressTracker` class that tracks progress of tool execution and provides streaming progress updates during long-running operations. Yields progress events as tools execute and generates execution summaries.

### `backend/src/tools/execution/result_converter.py`
Result converter. Converts SDK tool result dictionaries to ToolResult objects for compatibility. Provides `dict_to_tool_result` function that transforms dictionary-based tool results into the standardized ToolResult interface used throughout the execution system.

### `backend/src/tools/execution/summary.py`
Execution summary. Provides `create_execution_summary` function that generates human-readable summaries of tool execution results. Creates formatted summaries including total execution time, success/failure counts, and tool statistics.

### `backend/src/tools/execution/types.py`
Execution types. Defines dataclass data structures for tool execution including `ToolExecutionResult` (result of executing a single tool call with timing and success status) and `OrchestrationResult` (overall result of orchestrating multiple tool calls with aggregated timing and summary).

### `backend/src/tools/execution/strategies/__init__.py`
Execution strategies package initialization. Exports execution strategy classes (`ExecutionStrategy`, `SecurityExecutionStrategy`, `AuditExecutionStrategy`, `ValidationExecutionStrategy`), execution context types (`ExecutionContext`, `ExecutionResult`), and `create_execution_chain` function.

### `backend/src/tools/execution/strategies/audit.py`
Audit strategy. Implements `AuditExecutionStrategy` that provides audit logging for tool execution. Records tool calls and results for security and debugging purposes, logging execution details after tool execution completes.

### `backend/src/tools/execution/strategies/base.py`
Execution strategy base. Defines `ExecutionStrategy` abstract base class and supporting types (`ExecutionContext`, `ExecutionResult`) for implementing the strategy pattern for tool execution. Provides the foundation for composable execution logic with chain-of-responsibility pattern.

### `backend/src/tools/execution/strategies/chain.py`
Execution strategy chain. Provides `create_execution_chain` function that creates standard execution strategy chains. Builds a chain of strategies in order: Validation → Security → Audit → Execute, providing a standard execution pipeline for tool calls.

### `backend/src/tools/execution/strategies/security.py`
Security strategy. Implements `SecurityExecutionStrategy` that performs security checks before tool execution. Validates permissions and resource limits against security policy before allowing tool execution.

### `backend/src/tools/execution/strategies/validation.py`
Validation strategy. Implements `ValidationExecutionStrategy` that validates tool calls before execution. Ensures tool exists in registry and parameters are valid before proceeding to next strategy in chain.

### `backend/src/tools/filesystem/__init__.py`
Filesystem tools package initialization. Exports all filesystem tool classes including `ListDirectoryTool`, `ReadFileTool`, `WriteFileTool`, `GlobTool`, `SearchFileContentTool`, `ReplaceTool`, and `ReadManyFilesTool`. Provides tools for reading, writing, searching, and manipulating files.

### `backend/src/tools/filesystem/data_structures.py`
Filesystem data structures. Defines data structures for filesystem operations including file metadata and directory listings.

### `backend/src/tools/filesystem/glob_tool.py`
Glob tool. Tool for finding files using glob patterns, supporting wildcard matching and pattern-based file discovery.

### `backend/src/tools/filesystem/list_directory_tool.py`
List directory tool. Tool for listing directory contents with filtering and sorting options.

### `backend/src/tools/filesystem/read_file_tool_sdk.py`
Read file tool (SDK). Tool for reading file contents with support for different file types and encodings.

### `backend/src/tools/filesystem/read_many_files_tool.py`
Read many files tool. Tool for reading multiple files in parallel, useful for batch file operations.

### `backend/src/tools/filesystem/replace_tool.py`
Replace tool. Tool for finding and replacing text in files with support for regex patterns.

### `backend/src/tools/filesystem/search_file_content_tool.py`
Search file content tool. Tool for searching file contents using text search or regex patterns across multiple files.

### `backend/src/tools/filesystem/write_file_tool.py`
Write file tool. Tool for writing content to files with support for different encodings and file creation.

### `backend/src/tools/loading/__init__.py`
Loading package initialization. Exports `ToolValidator` class for manifest and security validation, and `ToolInstantiator` class for tool class instantiation with dependency injection. Provides focused services for tool loading operations including validation and instantiation.

### `backend/src/tools/loading/tool_instantiator.py`
Tool instantiator. Instantiates tool classes from definitions, handling dependency injection and tool initialization.

### `backend/src/tools/loading/tool_validator.py`
Tool validator. Validates tool definitions and implementations, checking for required attributes and proper inheritance.

### `backend/src/tools/marketplace/discovery/__init__.py`
Marketplace discovery package initialization. Exports security scanning and validation components including `ToolSecurityScanner`, `SecurityScanResult`, `ToolManifest`, `ToolManifestValidator`, and `ValidationResult` for marketplace tool discovery and validation. Handles tool discovery, validation, and security scanning for marketplace tools.

### `backend/src/tools/marketplace/discovery/security.py`
Marketplace security. Validates marketplace tools for security issues before loading and execution.

### `backend/src/tools/marketplace/discovery/validator.py`
Marketplace validator. Validates marketplace tool metadata and structure, ensuring tools meet marketplace requirements.

### `backend/src/tools/marketplace/search.py`
Marketplace search. Provides search functionality for discovering tools in the marketplace based on name, description, and tags.

### `backend/src/tools/marketplace/search_marketplace_tool.py`
Search marketplace tool. Tool for searching the tool marketplace from within the agent, allowing the LLM to discover and use new tools.

### `backend/src/tools/system/__init__.py`
System tools package initialization. Empty package initialization file for the system tools module.

### `backend/src/tools/system/shell_tool.py`
Shell command tool. Tool for executing shell commands with security restrictions and timeout management.

### `backend/src/tools/templates/sdk_tool_template/tool.py`
SDK tool template. Template file for creating new SDK tools, providing a starting point for tool development.

### `backend/src/tools/validation/validator.py`
Tool validator. Validates tool calls before execution, checking parameters against tool schemas and ensuring tool availability.

---

## Summary

This documentation covers all Python files in the `backend/src` directory, organized by module structure. Each file serves a specific purpose in the Personal Assistant application:

- **Agent Module**: Core agent logic, session management, and execution loops
- **API Module**: WebSocket API, message handlers, and response formatting
- **Core Module**: Infrastructure including DI, configuration, events, security, and utilities
- **LLM Module**: LLM client abstraction and provider implementations
- **Memory Module**: Memory storage, retrieval, and summarization
- **SDK Module**: Tool development SDK and base classes
- **Services Module**: Vision and other external service integrations
- **Tools Module**: Tool registry, execution engine, and individual tool implementations

The codebase follows a modular architecture with clear separation of concerns, dependency injection, and protocol-based interfaces for extensibility.

