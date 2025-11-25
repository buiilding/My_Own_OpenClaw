# Extension Points Catalog

This catalog documents all extension points in the Personal Assistant Backend, providing developers with a comprehensive reference for extending the system.

## Table of Contents

1. [Tools](#tools)
2. [Plugins](#plugins)
3. [Message Handlers](#message-handlers)
4. [Tool Discoverers](#tool-discoverers)
5. [Execution Strategies](#execution-strategies)
6. [Event Handlers](#event-handlers)
7. [Memory Stores](#memory-stores)
8. [Embedding Providers](#embedding-providers)
9. [LLM Providers](#llm-providers)

---

## Tools

**Purpose**: Extend agent capabilities with new operations

**Interface**: `backend.src.sdk.tool.Tool[ArgsModel]`

**Registration**:
- Core tools: Add to `backend/src/tools/definitions.py` → `CORE_TOOLS`
- Marketplace tools: Place in `tools/verified/{tool_name}/` with `manifest.json`
- Entry point tools: Register in `setup.py` under `desktop_assistant.tools`

**Example**:
```python
from backend.src.sdk.tool import Tool
from pydantic import BaseModel, Field

class MyToolArgs(BaseModel):
    input: str = Field(..., description="Input parameter")

class MyTool(Tool[MyToolArgs]):
    name = "my_tool"
    description = "Does something useful"
    args_model = MyToolArgs
    
    async def run(self, args: MyToolArgs, ctx: Context) -> dict:
        return {"success": True, "llm_content": "Result"}
```

**Documentation**: [Tool Development Guide](./tool_development.md)

**Key Files**:
- `backend/src/sdk/tool.py` - Base Tool class
- `backend/src/tools/registry.py` - Tool registration
- `backend/src/tools/loader.py` - Tool loading

---

## Plugins

**Purpose**: Intercept and modify agent execution flow

**Interface**: `backend.src.agent.plugins.interface.AgentPlugin`

**Registration**:
```python
from backend.src.core.plugins import plugin_registry

plugin = MyPlugin()
plugin_registry.register(plugin, enabled=True, priority=50)
```

**Hooks**:
- `on_instruction(instruction: str)`: Before query processing
- `on_llm_response(response_text: str)`: After LLM response
- `on_tool_start(tool_name: str, args: Dict)`: Before tool execution
- `on_tool_end(tool_name: str, result: Any)`: After tool execution

**Lifecycle**:
- `initialize()`: Called when plugin is registered
- `shutdown()`: Called when plugin is unregistered

**Discovery**:
- Entry points: `desktop_assistant.plugins`
- Filesystem: `plugins/` directory
- Manual: `plugin_registry.register()`

**Example**:
```python
from backend.src.agent.plugins.interface import AgentPlugin, PluginResult

class MyPlugin:
    name = "my_plugin"
    version = "1.0.0"
    
    async def on_tool_end(self, tool_name: str, result: Any):
        # Process tool results
        return PluginResult(artifacts={"data": "value"})
```

**Documentation**: [Extension Points Guide](./extension_points.md)

**Key Files**:
- `backend/src/agent/plugins/interface.py` - Plugin protocol
- `backend/src/core/plugins.py` - Plugin registry
- `backend/src/agent/plugins/manager.py` - Plugin manager

---

## Message Handlers

**Purpose**: Handle custom WebSocket message types

**Interface**: `backend.src.api.handlers.base.BaseMessageHandler`

**Registration**:
```python
from backend.src.api.handlers import MessageHandlerRegistry

registry = MessageHandlerRegistry()
registry.register("my-message-type", MyHandler())
```

**Implementation**:
```python
from backend.src.api.handlers.base import BaseMessageHandler

class MyHandler(BaseMessageHandler):
    def __init__(self):
        super().__init__("my-message-type")
    
    async def handle(self, data, websocket, session_manager, user_id, config_service):
        # Handle message
        validated = self.validate_message(data, MyMessageSchema)
        # Process and respond
```

**Key Files**:
- `backend/src/api/handlers/base.py` - Base handler
- `backend/src/api/handlers/__init__.py` - Registry
- `backend/src/api/routes/websocket.py` - WebSocket router

---

## Tool Discoverers

**Purpose**: Add new sources for tool discovery

**Interface**: `backend.src.tools.discovery.base.ToolDiscoverer`

**Registration**:
```python
from backend.src.tools.discovery.base import ToolDiscoveryService, ToolDiscoverer

class MyDiscoverer(ToolDiscoverer):
    async def discover(self) -> List[DiscoveredTool]:
        # Discover tools from your source
        return []
    
    def get_source_name(self) -> str:
        return "my_source"

# Register
discovery_service = ToolDiscoveryService()
discovery_service.register_discoverer(MyDiscoverer())
```

**Built-in Discoverers**:
- `EntryPointToolDiscoverer`: Setuptools entry points
- `MarketplaceToolDiscoverer`: Filesystem marketplace
- `FallbackToolDiscoverer`: Hardcoded CORE_TOOLS

**Key Files**:
- `backend/src/tools/discovery/base.py` - Base classes
- `backend/src/tools/discovery/entry_point_discoverer.py`
- `backend/src/tools/discovery/marketplace_discoverer.py`
- `backend/src/tools/discovery/fallback_discoverer.py`

---

## Execution Strategies

**Purpose**: Customize tool execution pipeline

**Interface**: `backend.src.tools.execution.strategies.ToolExecutionStrategy`

**Registration**:
```python
from backend.src.tools.execution.strategies import ToolExecutionStrategy

class MyStrategy(ToolExecutionStrategy):
    def __init__(self, next_strategy: ToolExecutionStrategy):
        self.next_strategy = next_strategy
    
    async def execute(self, tool_name, parameters, user_id, session_id, 
                     tool_registry, config):
        # Pre-execution logic
        result = await self.next_strategy.execute(...)
        # Post-execution logic
        return result
```

**Built-in Strategies**:
- `ValidationExecutionStrategy`: Validates arguments and permissions
- `SecurityExecutionStrategy`: Security checks
- `AuditExecutionStrategy`: Audit logging
- `DefaultToolExecutionStrategy`: Actual tool execution

**Key Files**:
- `backend/src/tools/execution/strategies.py` - Strategy implementations
- `backend/src/tools/orchestrator.py` - Strategy composition

---

## Event Handlers

**Purpose**: React to system events

**Interface**: Async function or callable

**Registration**:
```python
from backend.src.core.bus import message_bus
from backend.src.core.events import ToolExecuted

async def handle_tool(event: ToolExecuted):
    # Handle event
    pass

message_bus.subscribe(ToolExecuted, handle_tool, priority=50)
```

**Available Events**:
- `UserMessageReceived`: User sends a message
- `AgentResponseGenerated`: Agent generates a response
- `ToolExecutionStarted`: Tool execution begins
- `ToolExecuted`: Tool execution completes
- `LLMRequestStarted`: LLM request begins
- `LLMRequestCompleted`: LLM request completes
- `MemoryStored`: Memory is stored
- `SessionCreated`: New session created
- `SessionDestroyed`: Session destroyed
- `ConfigChanged`: Configuration updated
- `ErrorOccurred`: Error occurs

**Key Files**:
- `backend/src/core/bus.py` - Event bus
- `backend/src/core/events.py` - Event definitions

---

## Memory Stores

**Purpose**: Custom storage backends for memories

**Interface**: `backend.src.core.interfaces.memory_store.MemoryStoreInterface`

**Implementation**:
```python
from backend.src.core.interfaces.memory_store import MemoryStoreInterface

class CustomMemoryStore(MemoryStoreInterface):
    async def add(self, text: str, user_id: str, metadata: Optional[Dict] = None) -> str:
        # Store memory
        return memory_id
    
    async def search(self, query: str, user_id: str, filters: Optional[Dict] = None, 
                    limit: int = 10) -> List[Dict[str, Any]]:
        # Search memories
        return results
    
    # Implement other required methods
```

**Built-in**: `LocalMemoryStore` (SQLite + FAISS)

**Key Files**:
- `backend/src/core/interfaces/memory_store.py` - Interface
- `backend/src/memory/storage/local_store.py` - Implementation

---

## Embedding Providers

**Purpose**: Custom embedding models

**Interface**: `backend.src.core.interfaces.embedding.EmbeddingProvider`

**Implementation**:
```python
from backend.src.core.interfaces.embedding import EmbeddingProvider

class CustomEmbedder(EmbeddingProvider):
    @property
    def dimension(self) -> int:
        return 384
    
    def embed_text(self, text: str) -> np.ndarray:
        # Generate embedding
        return embedding
    
    def embed_batch(self, texts: List[str]) -> np.ndarray:
        # Batch embeddings
        return embeddings
```

**Built-in**: `SentenceTransformerEmbedder` (SentenceTransformers)

**Key Files**:
- `backend/src/core/interfaces/embedding.py` - Interface
- `backend/src/memory/embeddings.py` - Implementation

---

## LLM Providers

**Purpose**: Custom LLM providers (via LiteLLM)

**Interface**: LiteLLM abstraction (automatic)

**Configuration**:
```python
# In config.yaml or AppConfig
model_provider: "custom_provider"
selected_model_id: "custom-model"
```

**LiteLLM Support**: All LiteLLM-supported providers are automatically available:
- OpenAI
- Anthropic
- Google
- Cohere
- HuggingFace
- And 100+ more

**Key Files**:
- `backend/src/llm/llm_client.py` - LLM client
- `backend/src/llm/model_registry.py` - Model registry

---

## Extension Point Summary

| Extension Point | Interface | Registration | Use Case |
|----------------|-----------|--------------|----------|
| **Tools** | `Tool[ArgsModel]` | `CORE_TOOLS` or marketplace | Add new agent capabilities |
| **Plugins** | `AgentPlugin` | `plugin_registry.register()` | Intercept execution flow |
| **Message Handlers** | `BaseMessageHandler` | `MessageHandlerRegistry` | Handle WebSocket messages |
| **Tool Discoverers** | `ToolDiscoverer` | `ToolDiscoveryService` | Add tool discovery sources |
| **Execution Strategies** | `ToolExecutionStrategy` | Strategy chain | Customize execution pipeline |
| **Event Handlers** | Async function | `message_bus.subscribe()` | React to system events |
| **Memory Stores** | `MemoryStoreInterface` | DI container | Custom storage backends |
| **Embedding Providers** | `EmbeddingProvider` | DI container | Custom embedding models |
| **LLM Providers** | LiteLLM | Config | Custom LLM providers |

---

## Quick Reference

### Adding a New Tool
1. Create tool class inheriting `Tool[ArgsModel]`
2. Add to `CORE_TOOLS` or create marketplace tool
3. See [Tool Development Guide](./tool_development.md)

### Adding a New Plugin
1. Implement `AgentPlugin` protocol
2. Register with `plugin_registry`
3. See [Extension Points Guide](./extension_points.md)

### Adding a New Message Type
1. Create handler inheriting `BaseMessageHandler`
2. Register with `MessageHandlerRegistry`
3. Add message schema to `backend/src/api/schema.py`

### Adding a New Discovery Source
1. Implement `ToolDiscoverer` interface
2. Register with `ToolDiscoveryService`
3. See `backend/src/tools/discovery/`

### Adding a New Execution Strategy
1. Implement `ToolExecutionStrategy` interface
2. Compose into strategy chain
3. See `backend/src/tools/execution/strategies.py`

---

## Best Practices

1. **Follow Interfaces**: Always implement the provided interfaces/protocols
2. **Type Safety**: Use type hints and validate inputs
3. **Error Handling**: Handle errors gracefully and provide clear messages
4. **Documentation**: Document your extension's purpose and usage
5. **Testing**: Write tests for your extensions
6. **Priority**: Use appropriate priorities (lower = higher priority)
7. **Lifecycle**: Implement lifecycle methods if needed (initialize/shutdown)

---

*Last updated: [Current Date]*

