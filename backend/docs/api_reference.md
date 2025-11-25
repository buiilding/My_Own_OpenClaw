# API Reference

This document provides a reference for the Desktop Assistant backend API.

## Table of Contents

1. [WebSocket API](#websocket-api)
2. [Core Classes](#core-classes)
3. [Interfaces](#interfaces)
4. [Events](#events)

---

## WebSocket API

### Endpoint

`ws://localhost:8765/ws`

### Message Format

All messages are JSON objects with a `type` field.

### Client → Server Messages

#### `query`

Send a user query to the agent.

```json
{
    "type": "query",
    "session_id": "session_123",
    "user_id": "user_456",
    "message": "Write a file called test.txt"
}
```

#### `update-settings`

Update application settings.

```json
{
    "type": "update-settings",
    "settings": {
        "model_provider": "openai",
        "selected_model_id": "gpt-4"
    }
}
```

#### `load-settings`

Request current settings.

```json
{
    "type": "load-settings"
}
```

### Server → Client Messages

#### `thinking`

Agent is thinking/processing.

```json
{
    "type": "thinking",
    "content": "I'll help you write that file..."
}
```

#### `chunk`

Streaming text chunk from LLM.

```json
{
    "type": "chunk",
    "content": "I'll create"
}
```

#### `tool_call`

Tool is being executed.

```json
{
    "type": "tool_call",
    "tool_name": "write_file",
    "parameters": {
        "file_path": "test.txt",
        "content": "Hello"
    }
}
```

#### `tool_output`

Tool execution result.

```json
{
    "type": "tool_output",
    "tool_name": "write_file",
    "success": true,
    "output": "File created successfully",
    "execution_time": 0.123
}
```

#### `streaming-complete`

Streaming response completed.

```json
{
    "type": "streaming-complete"
}
```

#### `error`

Error occurred.

```json
{
    "type": "error",
    "content": "Error message"
}
```

---

## Core Classes

### ApplicationContainer

**Location**: `backend/src/core/container.py`

Dependency injection container.

```python
container = ApplicationContainer()
container.wire(modules=[...])

# Get services
config = container.config()
tool_registry = container.tool_registry()
```

### AgentSession

**Location**: `backend/src/agent/core.py`

Represents a user session.

```python
session = AgentSession(
    cfg=config,
    memory_manager=memory_manager,
    tool_registry=tool_registry,
    llm_client=llm_client,
    tool_orchestrator=tool_orchestrator,
    user_id="user_123",
    session_id="session_456"
)

# Process query
async for event in session.process_query("Hello"):
    print(event)
```

### ToolRegistry

**Location**: `backend/src/tools/registry.py`

Manages available tools.

```python
registry = ToolRegistry(config=config, tool_loader=loader)

# Register tool
registry.register_tool(my_tool)

# Get tool
tool = registry.get_tool("write_file")

# Execute tool
result = await registry.execute_tool(
    "write_file",
    {"file_path": "test.txt", "content": "Hello"},
    user_id="user_123",
    session_id="session_456"
)
```

### MemoryManager

**Location**: `backend/src/memory/memory_manager.py`

High-level memory operations.

```python
manager = MemoryManager(
    user_id="user_123",
    session_id="session_456",
    memory_store=memory_store,
    retrieval=retrieval,
    summarizer=summarizer,
    cfg=config
)

# Store episodic memory
await manager.store_episodic_memory("User: Hello", "Assistant: Hi")

# Retrieve memories
memories = await manager.retrieve_memories("file operations", limit=5)

# Summarize
count = await manager.summarize_and_store_semantic_memory()
```

### LLMClient

**Location**: `backend/src/llm/llm_client.py`

LLM client wrapper.

```python
client = LiteLLMClient(config=config)

# Get completion
response = await client.get_completion(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello"}]
)

# Stream completion
async for chunk in client.get_completion_stream(
    model="gpt-4",
    messages=[...]
):
    print(chunk)
```

---

## Interfaces

### MemoryStoreInterface

**Location**: `backend/src/core/interfaces/memory_store.py`

Interface for memory storage.

```python
class MemoryStoreInterface(Protocol):
    async def add(
        self,
        text: str,
        user_id: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        ...
    
    async def search(
        self,
        query: str,
        user_id: str,
        filters: Optional[Dict[str, Any]] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        ...
```

### EmbeddingProvider

**Location**: `backend/src/core/interfaces/embedding.py`

Interface for embedding generation.

```python
class EmbeddingProvider(Protocol):
    @property
    def dimension(self) -> int:
        ...
    
    def embed_text(self, text: str) -> np.ndarray:
        ...
```

### AgentPlugin

**Location**: `backend/src/brain/control/plugin_interface.py`

Interface for agent plugins.

```python
class AgentPlugin(Protocol):
    name: str
    
    async def on_instruction(self, instruction: str) -> Optional[PluginResult]:
        ...
    
    async def on_tool_end(self, tool_name: str, result: Any) -> Optional[PluginResult]:
        ...
```

---

## Events

### Event Bus

**Location**: `backend/src/core/bus.py`

```python
from backend.src.core.bus import message_bus
from backend.src.core.events import ToolExecuted

# Subscribe
async def handle_tool(event: ToolExecuted):
    print(f"Tool {event.tool_name} executed")

message_bus.subscribe(ToolExecuted, handle_tool)

# Publish
event = ToolExecuted(
    session_id="session_123",
    user_id="user_456",
    tool_name="write_file",
    success=True
)
await message_bus.publish(event)
```

### Available Events

- `UserMessageReceived`
- `AgentResponseGenerated`
- `ToolExecutionStarted`
- `ToolExecuted`
- `LLMRequestStarted`
- `LLMRequestCompleted`
- `MemoryStored`
- `SessionCreated`
- `SessionDestroyed`
- `InteractionCompleted`
- `ConfigChanged`
- `ErrorOccurred`

---

## Error Handling

All errors use the centralized exception hierarchy:

```python
from backend.src.core.exceptions import (
    ToolExecutionError,
    ToolValidationError,
    ToolNotFoundError,
    LLMError,
    LLMAPIError,
    LLMRateLimitError,
    MemoryError,
    ConfigurationError
)
```

Exceptions include:
- `message`: Error message
- `metadata.code`: Error code
- `metadata.details`: Additional details
- `metadata.user_message`: User-friendly message
- `cause`: Underlying exception

