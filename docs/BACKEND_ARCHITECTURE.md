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

**Key Methods**:
- `process_query()`: Process user query and yield events
- `update_config()`: Update configuration at runtime
- `get_screenshot()`: Get current screenshot
- `get_current_screenshot_id()`: Get screenshot ID

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

**Key Methods**:
- `prepare_tool_calls()`: Prepare tool calls from parsed response
- `_ensure_screenshot()`: Ensure screenshot is available
- `_resolve_coordinates()`: Resolve coordinates for tools

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

Process different message types.

**Handlers**:
- `QueryMessageHandler`: Process user queries
- `SettingsMessageHandler`: Handle settings requests
- `ToolResultHandler`: Process tool execution results

### Configuration System

#### ConfigManager (`core/config/manager.py`)

Manages application configuration.

**Responsibilities**:
- Load configuration from file
- Save configuration changes
- Validate configuration
- Provide configuration access

**Key Methods**:
- `load_config()`: Load configuration
- `save_config()`: Save configuration
- `get_config()`: Get current config
- `update_config()`: Update config

### Bootstrap System

#### InitializationCoordinator (`core/bootstrap/coordinator.py`)

Coordinates application initialization.

**Responsibilities**:
- Initialize all components in phases
- Handle initialization errors
- Provide rollback on failure
- Thread-safe initialization

**Initialization Phases**:
1. Configuration loading
2. Container setup
3. Service initialization
4. Plugin loading

## Dependency Injection

The backend uses `dependency-injector` for clean architecture:

```python
Container
├── ConfigManager (singleton)
├── ToolRegistry (singleton)
├── LLMClient (factory)
├── MemoryManager (singleton)
├── PluginRegistry (singleton)
└── SessionManager (singleton)
    └── AgentSession (factory)
```

**Container Setup** (`core/container/container.py`):
- Defines all dependencies
- Configures providers
- Manages lifecycle

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

Manages plugin lifecycle.

**Responsibilities**:
- Register plugins
- Initialize plugins
- Shutdown plugins
- Handle plugin events

**Built-in Plugins**:
- `OCRPlugin`: OCR processing plugin

### Plugin Interface (`core/plugins/interface.py`)

Base interface for plugins.

**Methods**:
- `initialize()`: Initialize plugin
- `shutdown()`: Cleanup plugin
- `handle_event()`: Process events

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

- **Local Storage**: All data stored locally
- **Encryption**: Sensitive data encrypted at rest
- **Access Control**: User-based isolation
- **No Cloud Sync**: Everything runs locally

## Performance Optimizations

### Caching

- **LLM Client Caching**: Provider instances cached
- **Embedding Cache**: Avoid re-computing embeddings
- **Tool Schema Cache**: Cached tool definitions
- **Query Result Cache**: Frequent queries cached

### Parallelization

- **Async I/O**: All I/O operations async
- **Parallel Tool Execution**: Multiple tools in parallel
- **Batch Processing**: Batch embeddings and OCR
- **Thread Pool**: Global thread pool for blocking operations

### GPU Acceleration

- **CUDA Support**: GPU-accelerated embeddings
- **OCR Acceleration**: GPU-accelerated OCR processing
- **Vision Models**: GPU-accelerated vision inference

## Testing

### Test Structure

```
tests/backend/
├── test_agent_system.py
├── test_tool_execution.py
├── test_llm_integration.py
└── test_parser_helpers.py
```

### Testing Strategy

- **Unit Tests**: Individual components
- **Integration Tests**: Component interactions
- **Mocking**: External dependencies mocked

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
