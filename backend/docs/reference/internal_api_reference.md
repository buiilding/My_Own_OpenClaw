# Internal API Reference

This document provides comprehensive documentation for internal APIs and interfaces that are used within the Personal Assistant system. These APIs are primarily intended for developers extending or modifying the core system.

## Table of Contents

- [Core Interfaces](#core-interfaces)
- [Protocol Interfaces](#protocol-interfaces)
- [Service Interfaces](#service-interfaces)
- [Internal Data Structures](#internal-data-structures)
- [Event System](#event-system)
- [Dependency Injection](#dependency-injection)

## Core Interfaces

### LLM Client Interface

The `LLMClientInterface` defines the contract for LLM provider implementations.

```python
from backend.src.core.interfaces.llm import LLMClientInterface

class LLMClientInterface(Protocol):
    """Interface for LLM interactions."""

    async def generate_response(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Generate a complete response."""
        ...

    async def generate_stream(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Generate a streaming response."""
        ...
```

#### Method Details

**`generate_response(messages, tools=None, temperature=0.7, max_tokens=None)`**
- **Purpose**: Generate a complete LLM response for a conversation
- **Parameters**:
  - `messages`: List of message dictionaries with 'role' and 'content' keys
  - `tools`: Optional list of tool schemas for function calling
  - `temperature`: Sampling temperature (0.0 to 1.0)
  - `max_tokens`: Maximum tokens to generate
- **Returns**: Dictionary with 'content', 'tool_calls', and metadata
- **Throws**: `LLMProviderError` for provider-specific failures

**`generate_stream(messages, tools=None, temperature=0.7, max_tokens=None)`**
- **Purpose**: Generate a streaming LLM response
- **Parameters**: Same as `generate_response`
- **Yields**: Dictionaries with 'type', 'content', and incremental data
- **Throws**: `LLMProviderError` for streaming failures

#### Response Format

**Complete Response**:
```python
{
    "content": "The response text from the LLM",
    "tool_calls": [
        {
            "id": "call_123",
            "name": "tool_name",
            "arguments": {"param": "value"}
        }
    ],
    "usage": {
        "prompt_tokens": 150,
        "completion_tokens": 50,
        "total_tokens": 200
    },
    "finish_reason": "stop"
}
```

**Streaming Chunks**:
```python
{
    "type": "content",
    "content": " incremental text "
}
{
    "type": "tool_call",
    "tool_call": {
        "id": "call_123",
        "name": "tool_name",
        "arguments": "{\"param\": \"value\"}"
    }
}
{
    "type": "done",
    "usage": {"prompt_tokens": 150, "completion_tokens": 50, "total_tokens": 200}
}
```

### Memory Store Interface

The `MemoryStoreInterface` defines the contract for low-level memory storage implementations.

```python
from backend.src.core.interfaces.memory_store import MemoryStoreInterface

class MemoryStoreInterface(Protocol):
    """Interface for low-level memory storage operations."""

    async def add(
        self, text: str, user_id: str, metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """Store a memory entry and return its ID."""
        ...

    async def search(
        self,
        query: str,
        user_id: str,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Search memories using semantic similarity."""
        ...

    async def update(self, memory_id: str, metadata: Optional[Dict[str, Any]] = None) -> bool:
        """Update memory metadata."""
        ...

    async def delete(self, memory_id: str) -> bool:
        """Delete a memory entry."""
        ...

    async def get_stats(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Get statistics about stored memories."""
        ...
```

#### Method Details

**`add(text, user_id, metadata=None)`**
- **Purpose**: Store a new memory entry with optional metadata
- **Parameters**:
  - `text`: The memory content to store
  - `user_id`: User identifier for data isolation
  - `metadata`: Optional dictionary with additional data (timestamps, types, etc.)
- **Returns**: Unique memory ID string
- **Throws**: `MemoryStorageError` for storage failures

**`search(query, user_id, filters=None, limit=10)`**
- **Purpose**: Perform semantic search over stored memories
- **Parameters**:
  - `query`: Natural language search query
  - `user_id`: User identifier for data isolation
  - `filters`: Optional metadata filters (e.g., `{"type": "episodic"}`)
  - `limit`: Maximum number of results to return
- **Returns**: List of memory dictionaries with 'id', 'text', 'metadata', 'score'
- **Throws**: `MemorySearchError` for search failures

**`update(memory_id, metadata=None)`**
- **Purpose**: Update metadata for an existing memory
- **Parameters**:
  - `memory_id`: Unique identifier of the memory to update
  - `metadata`: New metadata to merge with existing metadata
- **Returns**: `True` if update successful, `False` otherwise
- **Throws**: `MemoryNotFoundError` if memory doesn't exist

**`delete(memory_id)`**
- **Purpose**: Permanently remove a memory entry
- **Parameters**:
  - `memory_id`: Unique identifier of the memory to delete
- **Returns**: `True` if deletion successful, `False` otherwise
- **Throws**: `MemoryNotFoundError` if memory doesn't exist

**`get_stats(user_id=None)`**
- **Purpose**: Get statistics about stored memories
- **Parameters**:
  - `user_id`: Optional user filter (None for global stats)
- **Returns**: Dictionary with statistics like total_count, by_type, storage_size
- **Throws**: `MemoryStorageError` for statistics retrieval failures

#### Memory Entry Format

```python
{
    "id": "mem_123456789",
    "text": "User prefers dark mode interface",
    "metadata": {
        "user_id": "user123",
        "type": "semantic",
        "timestamp": "2024-01-15T10:30:00Z",
        "source": "conversation",
        "session_id": "sess_abc123",
        "importance": 0.8
    },
    "score": 0.95  # Only present in search results
}
```

## Service Interfaces

### Memory Service Interface

The `IMemoryService` provides a high-level interface for memory operations.

```python
class IMemoryService(Protocol):
    """Memory service interface for storing and retrieving memories."""

    async def store_episodic_memory(
        self, user_id: str, session_id: str,
        user_message: str, assistant_response: str
    ) -> str:
        """Store an episodic memory (conversation turn)."""
        ...

    async def summarize_and_store_semantic_memory(
        self, user_id: str, session_id: str
    ) -> int:
        """Summarize recent episodic memories and store as semantic memory."""
        ...

    def retrieve_memories(
        self, user_id: str, query: str, limit: int = 5
    ) -> Dict[str, List[str]]:
        """Retrieve relevant memories for a query."""
        ...

    def format_context(
        self, memories: Dict[str, List[str]]
    ) -> str:
        """Format memories into a string for LLM context."""
        ...
```

#### Method Details

**`store_episodic_memory(user_id, session_id, user_message, assistant_response)`**
- **Purpose**: Store a single conversation turn as episodic memory
- **Parameters**:
  - `user_id`: User identifier
  - `session_id`: Session identifier
  - `user_message`: User's input message
  - `assistant_response`: Assistant's response
- **Returns**: Memory ID string
- **Behavior**: Automatically generates embeddings and stores with metadata

**`summarize_and_store_semantic_memory(user_id, session_id)`**
- **Purpose**: Process recent episodic memories into condensed semantic memories
- **Parameters**:
  - `user_id`: User identifier
  - `session_id`: Session identifier
- **Returns**: Number of semantic memories created
- **Behavior**: Uses LLM to summarize conversation patterns and key information

**`retrieve_memories(user_id, query, limit=5)`**
- **Purpose**: Find relevant memories for a given query
- **Parameters**:
  - `user_id`: User identifier
  - `query`: Search query string
  - `limit`: Maximum results per memory type
- **Returns**: Dictionary with 'semantic' and 'episodic' keys containing memory text lists

**`format_context(memories)`**
- **Purpose**: Format retrieved memories into LLM context string
- **Parameters**:
  - `memories`: Dictionary from `retrieve_memories`
- **Returns**: Formatted context string with semantic and episodic sections

### LLM Service Interface

The `ILLMService` provides a unified interface for LLM operations.

```python
class ILLMService(Protocol):
    """LLM service interface for language model interactions."""

    async def get_completion(
        self, model: str, messages: List[LLMMessage]
    ) -> str:
        """Get a completion from the LLM."""
        ...

    async def get_completion_stream(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Get a streaming completion from the LLM."""
        ...
```

#### Method Details

**`get_completion(model, messages)`**
- **Purpose**: Get a complete text completion from the LLM
- **Parameters**:
  - `model`: Model identifier (e.g., "gpt-4", "claude-3-sonnet")
  - `messages`: List of `LLMMessage` objects
- **Returns**: Complete response text
- **Throws**: `LLMProviderError` for provider failures

**`get_completion_stream(model, messages)`**
- **Purpose**: Get a streaming text completion from the LLM
- **Parameters**: Same as `get_completion`
- **Yields**: Dictionaries with streaming chunks
- **Throws**: `LLMProviderError` for streaming failures

### Tool Service Interface

The `IToolService` provides a high-level interface for tool operations.

```python
class IToolService(Protocol):
    """Tool service interface for tool execution and management."""

    async def execute_tool(
        self, tool_name: str, parameters: Dict[str, Any],
        user_id: str = "default_user", session_id: str = "default_session"
    ) -> Dict[str, Any]:
        """Execute a tool by name."""
        ...

    def get_available_tools(self) -> List[Dict[str, Any]]:
        """Get list of available tools with their schemas."""
        ...

    def is_tool_available(self, tool_name: str) -> bool:
        """Check if a tool is available."""
        ...

    def get_tool_schema(self, tool_name: str) -> Optional[Dict[str, Any]]:
        """Get JSON schema for a tool."""
        ...
```

#### Method Details

**`execute_tool(tool_name, parameters, user_id, session_id)`**
- **Purpose**: Execute a tool with given parameters
- **Parameters**:
  - `tool_name`: Registered name of the tool
  - `parameters`: Dictionary of tool parameters
  - `user_id`: User identifier for context
  - `session_id`: Session identifier for context
- **Returns**: Tool execution result dictionary
- **Throws**: `ToolNotFoundError`, `ToolExecutionError`

**`get_available_tools()`**
- **Purpose**: Get metadata for all available tools
- **Returns**: List of tool dictionaries with name, description, schema
- **Behavior**: Returns cached tool information

**`is_tool_available(tool_name)`**
- **Purpose**: Check if a specific tool is available
- **Parameters**:
  - `tool_name`: Name of the tool to check
- **Returns**: Boolean indicating availability

**`get_tool_schema(tool_name)`**
- **Purpose**: Get JSON schema for tool parameter validation
- **Parameters**:
  - `tool_name`: Name of the tool
- **Returns**: JSON schema dictionary or None if not found

### Session Service Interface

The `ISessionService` manages user session lifecycle.

```python
class ISessionService(Protocol):
    """Session service interface for managing user sessions."""

    async def get_or_create_session(self, user_id: str) -> Any:
        """Get existing session or create a new one."""
        ...

    async def end_session(self, user_id: str) -> None:
        """End a user session and perform cleanup."""
        ...

    async def update_all_sessions_config(self, config: Any) -> None:
        """Update configuration for all active sessions."""
        ...
```

#### Method Details

**`get_or_create_session(user_id)`**
- **Purpose**: Get existing session or create new one for user
- **Parameters**:
  - `user_id`: Unique user identifier
- **Returns**: `AgentSession` instance
- **Behavior**: Creates session if none exists, otherwise returns existing

**`end_session(user_id)`**
- **Purpose**: Clean up and end a user session
- **Parameters**:
  - `user_id`: User identifier
- **Behavior**: Saves final state, cleans up resources, removes from active sessions

**`update_all_sessions_config(config)`**
- **Purpose**: Update configuration for all active sessions
- **Parameters**:
  - `config`: New `AppConfig` instance
- **Behavior**: Applies config changes to all running sessions

### Context Service Interface

The `IContextService` creates execution contexts for tools and operations.

```python
class IContextService(Protocol):
    """Context service interface for creating execution contexts."""

    def create_tool_context(
        self,
        user_id: str,
        session_id: str,
        workspace_root: Optional[str] = None,
        session_ref: Optional[Any] = None,
        additional_services: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """Create a tool execution context."""
        ...
```

#### Method Details

**`create_tool_context(user_id, session_id, workspace_root, session_ref, additional_services)`**
- **Purpose**: Create a context object for tool execution
- **Parameters**:
  - `user_id`: User identifier
  - `session_id`: Session identifier
  - `workspace_root`: Optional workspace root path
  - `session_ref`: Optional session reference object
  - `additional_services`: Optional extra services to inject
- **Returns**: Context instance with services and metadata
- **Behavior**: Injects all necessary services and configuration

## Internal Data Structures

### LLMMessage

Standardized message format for LLM interactions.

```python
from backend.src.core.types import LLMMessage

@dataclass
class LLMMessage:
    """Standardized message format for LLM interactions."""
    role: str  # "system", "user", "assistant", "tool"
    content: str
    name: Optional[str] = None  # For tool messages
    tool_call_id: Optional[str] = None  # For tool result messages
    tool_calls: Optional[List[Dict[str, Any]]] = None  # For assistant messages
```

#### Fields

- **role**: Message role determining behavior
- **content**: Text content of the message
- **name**: Tool name for tool result messages
- **tool_call_id**: ID linking tool results to calls
- **tool_calls**: Function call specifications from assistant

### Tool Execution Result

Standardized format for tool execution outcomes.

```python
{
    "success": bool,           # Whether execution succeeded
    "data": Dict[str, Any],    # Tool-specific structured data
    "llm_content": str,        # Content for LLM consumption
    "return_display": str,     # User-visible output
    "execution_time": float,   # Execution duration in seconds
    "error": Optional[str],    # Error message if failed
    "metadata": Dict[str, Any] # Additional execution metadata
}
```

### Memory Query Result

Standardized format for memory search results.

```python
{
    "semantic": [
        "User prefers concise explanations",
        "User works with Python and React",
        "User prefers dark mode interfaces"
    ],
    "episodic": [
        "Earlier today: Asked about API design patterns",
        "Yesterday: Worked on database optimization",
        "Last week: Implemented user authentication"
    ]
}
```

## Event System

### Core Events

The system uses an event-driven architecture for component communication.

#### Event Types

```python
from backend.src.core.events import (
    InteractionStarted,
    InteractionCompleted,
    ToolExecuted,
    MemoryStored,
    SessionCreated,
    SessionEnded,
    ConfigUpdated,
    ErrorOccurred
)
```

#### Event Structure

All events inherit from a base `Event` class:

```python
@dataclass
class Event:
    """Base event class."""
    type: str
    timestamp: datetime
    data: Dict[str, Any]
    source: Optional[str] = None
```

#### Common Events

**InteractionStarted**
```python
{
    "type": "interaction_started",
    "timestamp": "2024-01-15T10:30:00Z",
    "data": {
        "user_id": "user123",
        "session_id": "sess_abc123",
        "query": "Help me analyze this data"
    }
}
```

**ToolExecuted**
```python
{
    "type": "tool_executed",
    "timestamp": "2024-01-15T10:30:02Z",
    "data": {
        "tool_name": "csv_analyzer",
        "success": True,
        "execution_time": 1.23,
        "user_id": "user123",
        "session_id": "sess_abc123"
    }
}
```

**ErrorOccurred**
```python
{
    "type": "error_occurred",
    "timestamp": "2024-01-15T10:30:05Z",
    "data": {
        "error_type": "ToolExecutionError",
        "error_message": "Tool timed out after 30 seconds",
        "component": "tool_orchestrator",
        "user_id": "user123",
        "session_id": "sess_abc123",
        "traceback": "..."
    }
}
```

### Event Bus

The event bus provides publish-subscribe functionality. **EventBus is now injected via dependency injection** instead of using a global singleton.

```python
# ✅ CORRECT: Inject EventBus via constructor
from backend.src.core.bus import EventBus
from backend.src.core.events import InteractionCompleted

class MyService:
    def __init__(self, event_bus: EventBus):
        self.event_bus = event_bus
        # Subscribe to events
        self.event_bus.subscribe(InteractionCompleted, self._on_interaction_completed)
    
    async def _on_interaction_completed(self, event: InteractionCompleted):
        print(f"Interaction completed: {event.user_message}")
    
    async def publish_event(self):
        # Publish an event
        event = InteractionCompleted(
            session_id="sess_abc123",
            user_id="user123",
            user_message="Hello",
            assistant_response="Hi there!"
        )
        await self.event_bus.publish(event)
```

**Note:** The global `message_bus` singleton has been removed. Always inject `EventBus` via constructor for proper dependency management and testability.

## Dependency Injection

### Container Structure

The system uses dependency injection containers organized by domain.

#### Core Container

```python
from backend.src.core.container.core import CoreContainer

container = CoreContainer()
container.config.from_dict(config_dict)
container.wire()

# Access services
llm_client = container.llm_client()
memory_service = container.memory_service()
```

#### Domain Containers

- **CoreContainer**: Configuration, LLM, TTS, file services
- **ToolContainer**: Tool registry, orchestrator, schemas
- **MemoryContainer**: Memory manager, store, embeddings
- **ApplicationContainer**: Main composition container

### Service Registration

Services are registered in containers with proper dependency resolution.

```python
from dependency_injector import containers, providers

class CoreContainer(containers.DeclarativeContainer):
    """Core services container."""

    config = providers.Configuration()

    # LLM service
    llm_client = providers.Singleton(
        get_llm_client,
        config=config
    )

    # Memory service
    memory_service = providers.Singleton(
        MemoryService,
        llm_client=llm_client,
        config=config
    )
```

### Container Composition

Containers are composed hierarchically for proper dependency management.

```python
class ApplicationContainer(containers.DeclarativeContainer):
    """Main application container."""

    config = providers.Configuration()

    # Include domain containers
    core = providers.Container(CoreContainer, config=config)
    tools = providers.Container(ToolContainer, config=config)
    memory = providers.Container(MemoryContainer, config=config)
```

This internal API reference provides the foundation for understanding and extending the Personal Assistant system's core functionality. All interfaces are designed to be implementation-agnostic, allowing for easy swapping of components and comprehensive testing.
