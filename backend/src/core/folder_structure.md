# Core Module Structure

## Folder Structure

```
backend/src/core/
├── __init__.py                        # Package initialization
│
├── bootstrap/                         # Application initialization & startup coordination
│   ├── __init__.py                    # Package exports
│   ├── coordinator.py                 # InitializationCoordinator - orchestrates startup phases (config → container → services → plugins)
│   ├── handler_initializer.py        # HandlerInitializer - validates WebSocket message handlers are registered via DI container
│   └── plugin_initializer.py         # PluginInitializer - discovers and loads agent plugins
│
├── infrastructure/                    # Cross-cutting infrastructure components
│   ├── __init__.py                    # Re-exports bus, cache, exceptions for backward compatibility
│   ├── bus.py                         # EventBus - pub/sub event system with priority support and filtering
│   ├── cache.py                       # Cache, CacheManager - in-memory caching with TTL and LRU eviction
│   └── exceptions.py                  # Exception hierarchy - BaseAppError and domain-specific exceptions (LLM, Tool, Memory, etc.)
│
├── events/                            # Event system for decoupled communication
│   ├── __init__.py                    # Re-exports all event types
│   ├── base.py                        # Event - base class for all event bus events with timestamp
│   ├── bus_events.py                  # Internal event bus events: InteractionCompleted, ConfigChanged
│   └── streaming_events.py           # Streaming events for WebSocket: ThinkingEvent, ChunkEvent, ToolCallEvent, etc.
│
├── messages/                          # Message structures and conversion utilities
│   ├── __init__.py                    # Re-exports message classes and converters
│   ├── structures.py                  # StoredMessage, MessageContent, TextContent, ImageContent - conversation history structures
│   └── converters.py                  # content_to_message_content() - converts between LLM and internal message formats
│
├── types/                             # Type definitions for type safety
│   ├── __init__.py                    # Re-exports all types
│   ├── enums.py                       # Enum classes: MessageRole, MessageType, StreamingEventType, ContentType, MouseAction, etc.
│   ├── schemas.py                     # TypedDict schemas: LLMMessage, MultimodalContent, ToolResultDict, MemoryItem, etc.
│   └── aliases.py                     # Type aliases: JSONDict, StringDict
│
├── validation/                        # Input validation framework
│   ├── __init__.py                    # Re-exports validation functions
│   └── validators.py                  # ValidationError, validate_message(), validate_dict(), validate_user_id(), etc.
│
├── config/                            # Configuration management system
│   ├── __init__.py                    # Re-exports config classes and functions
│   ├── models.py                      # Pydantic models: AppConfig, LLMProviders, SecurityLimits, OCRConfig, etc.
│   ├── app_config.py                  # APP_CONFIG - default application configuration instance
│   ├── loader.py                      # load_settings_from_file(), load_api_key_for_provider(), get_default_tts_model_path() - config loading logic
│   ├── manager.py                     # ConfigManager - manages config lifecycle (load, get, update, reload) with thread safety
│   ├── service.py                     # ConfigurationService - wraps ConfigManager with change notifications and subscriptions
│   └── subscriptions.py               # ConfigSubscriptionManager - manages subscribers to config change events
│
├── container/                         # Dependency injection container system
│   ├── __init__.py                    # Re-exports ApplicationContainer and Container
│   ├── application.py                 # ApplicationContainer - main DI container composing CoreContainer, ToolContainer, MemoryContainer
│   ├── facade.py                      # Container - backward-compatible facade around ApplicationContainer
│   ├── core_container.py              # CoreContainer - provides config, LLM client, TTS, vision service, event bus
│   ├── tool_container.py              # ToolContainer - provides tool registry, orchestrator, agent factory, context factory
│   ├── memory_container.py            # MemoryContainer - provides embedder (embedding provider)
│   ├── api_container.py               # ApiContainer - provides WebSocket message handlers and handler registry
│   ├── factories.py                   # Factory functions for creating TTS, vision services, embedder, tool registry, and agent factory
│   ├── initializer.py                 # ContainerInitializer - handles async initialization of container components
│   ├── config_updater.py              # ContainerConfigUpdater - updates container dependencies when config changes
│   └── session_factory.py             # AgentSessionFactory - creates AgentSession instances with all dependencies injected
│
├── interfaces/                        # Protocol definitions (interfaces/contracts)
│   ├── __init__.py                    # Package exports
│   ├── config.py                      # ConfigInterface - configuration interface protocol
│   ├── embedding.py                   # EmbeddingProvider - embedding provider abstract base class
│   ├── llm.py                         # LLMClientInterface - LLM client interface protocol
│   ├── tool.py                        # ToolInterface - tool interface protocol with ToolResult and ToolContext
│   └── vision.py                      # IVisionService - vision service interface protocol
│
├── services/                          # Core service implementations
│   ├── __init__.py                    # Package exports
│   ├── agent_factory.py               # AgentFactory - creates sub-agent sessions (scoped AgentSessions) with restricted tools
│   ├── context_factory.py             # ContextFactory - creates execution contexts for tools
│   ├── gpu_memory_manager.py          # GPUMemoryManager - manages GPU memory allocation
│   ├── tts_service.py                 # TTSService - text-to-speech service implementation
│   └── wakeword_service.py            # WakewordService - wakeword activation logic and greeting selection policy
│
├── plugins/                           # Plugin system infrastructure
│   ├── __init__.py                    # Package exports
│   ├── config.py                      # PluginConfigManager - manages plugin-specific configuration
│   ├── discovery_service.py           # PluginDiscoveryService - discovers plugins from filesystem
│   ├── discovery.py                   # PluginDiscoverer abstract base class and implementations (EntryPointPluginDiscoverer, FilesystemPluginDiscoverer)
│   ├── lifecycle.py                   # PluginLifecycleManager - manages plugin lifecycle (load, unload, reload)
│   ├── metadata.py                    # PluginConfig and PluginMetadata - plugin metadata data structures
│   ├── plugin_config.py               # PLUGIN_CONFIG - Python config file with plugin enable/disable states and priorities
│   ├── registry.py                    # PluginRegistry - central registry for plugin registration and retrieval
│   └── state_manager.py               # PluginStateManager - manages in-memory plugin state (enabled/disabled, metadata, config)
│
├── security/                          # Security and trust boundary enforcement
│   ├── __init__.py                    # Package exports
│   ├── policy.py                      # SecurityPolicy - permission checking, resource limits, audit logging
│   └── executor.py                    # ToolExecutor - abstract base class and implementations (DirectToolExecutor, ProcessSandboxedExecutor) for tool execution
│
├── observability/                     # Observability and metrics
│   ├── __init__.py                    # Package exports
│   └── trust_boundary_metrics.py     # MetricsService - tracks trust boundary violations and security events
│
└── utils/                             # Utility functions (currently empty)
    └── __init__.py                    # Package placeholder
```

## Data Flow

### Initialization Flow
```
Bootstrap Coordinator
    ↓
1. Configuration Phase
    ├── ConfigManager.load_config()
    └── load_settings_from_file() → AppConfig
    ↓
2. Container Phase
    ├── ApplicationContainer (composes specialized containers)
    ├── CoreContainer (config, LLM, TTS, event bus)
    ├── ToolContainer (tool registry, orchestrator)
    └── MemoryContainer (embeddings, storage)
    ↓
3. Services Phase
    ├── SessionManager (created from container)
    └── HandlerInitializer (WebSocket handlers)
    ↓
4. Plugins Phase
    ├── PluginDiscoveryService (discovers plugins)
    └── PluginRegistry (registers plugins)
```

### Configuration Flow
```
app_config.py (default config)
    ↓
loader.py
    ├── load_settings_from_file() → AppConfig
    └── load_api_key_for_provider() → AppConfig (with API key)
    ↓
manager.py
    └── ConfigManager.load_config() → cached AppConfig
    ↓
service.py
    └── ConfigurationService.get_config() → AppConfig
    ↓
subscriptions.py
    └── ConfigSubscriptionManager.notify_subscribers() → subscribers updated
    ↓
events/bus_events.py
    └── ConfigChanged event → EventBus
```

### Event Flow
```
events/base.py
    └── Event (base class)
        ↓
events/bus_events.py              events/streaming_events.py
    ├── ConfigChanged                 ├── ThinkingEvent
    └── InteractionCompleted           ├── ChunkEvent
                                        ├── ToolCallEvent
                                        └── ... (all streaming events)
        ↓
infrastructure/bus.py
    └── EventBus.publish() → handlers
        ↓
Handlers/Services (subscribers)
```

### Message Flow
```
messages/structures.py
    ├── StoredMessage (conversation history)
    └── MessageContent (TextContent, ImageContent)
        ↓
messages/converters.py
    └── content_to_message_content() → MessageContent
        ↓
validation/validators.py
    └── validate_message() → validated message
        ↓
Handlers/LLM Client
```

### Container Dependency Flow
```
container/application.py
    └── ApplicationContainer
        ├── core_container.py → CoreContainer
        │   ├── config_manager → ConfigManager
        │   ├── config → AppConfig
        │   ├── llm_client → LLMClient
        │   ├── event_bus → EventBus
        │   └── config_service → ConfigurationService
        │
        ├── tool_container.py → ToolContainer
        │   ├── tool_registry → ToolRegistry
        │   ├── agent_factory → AgentFactory
        │   └── context_factory → ContextFactory
        │
        └── memory_container.py → MemoryContainer
            └── embedder → EmbeddingClient
        ↓
container/facade.py
    └── Container (backward-compatible facade)
        ↓
Application Components
```

### Type System Flow
```
types/enums.py
    └── Enums (MessageRole, StreamingEventType, etc.)
        ↓
types/schemas.py
    └── TypedDicts (LLMMessage, MultimodalContent, etc.)
        ↓
types/aliases.py
    └── Type aliases (JSONDict, StringDict)
        ↓
Application Code (type safety)
```

### Request Processing Flow
```
WebSocket Request
    ↓
validation/validators.py
    └── validate_message() → validated input
        ↓
API Handler
    ↓
Container (dependency injection)
    ├── SessionManager → AgentSession
    └── ToolRegistry → Tool execution
        ↓
events/streaming_events.py
    └── StreamingEvent → EventBus
        ↓
WebSocket Response
```

## Key Design Principles

1. **Single Responsibility**: Each file/module has one clear purpose
2. **Data Flow Clarity**: Folder structure mirrors data flow patterns
3. **Separation of Concerns**: Infrastructure, domain logic, and interfaces are separated
4. **Dependency Injection**: Container system manages all dependencies
5. **Event-Driven**: Decoupled communication via EventBus
6. **Type Safety**: Comprehensive type definitions for IDE support and runtime validation
7. **Thread Safety**: Critical components use locks for concurrent access
8. **Backward Compatibility**: `__init__.py` files provide re-exports for gradual migration
