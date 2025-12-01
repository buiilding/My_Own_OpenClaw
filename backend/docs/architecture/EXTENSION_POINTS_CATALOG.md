# Extension Points Catalog

This catalog provides a comprehensive reference of all extension points available in the Personal Assistant system. Each extension point includes interface definitions, implementation examples, and integration details.

## Table of Contents

- [Tool Extensions](#tool-extensions)
- [LLM Provider Extensions](#llm-provider-extensions)
- [Memory System Extensions](#memory-system-extensions)
- [Embedding Provider Extensions](#embedding-provider-extensions)
- [Plugin System Extensions](#plugin-system-extensions)
- [Message Handler Extensions](#message-handler-extensions)
- [Service Extensions](#service-extensions)
- [Event System Extensions](#event-system-extensions)
- [Configuration Extensions](#configuration-extensions)
- [Storage Extensions](#storage-extensions)

## Tool Extensions

### Tool Interface

**Location**: `backend/src/sdk/tool.py`

```python
from abc import ABC, abstractmethod
from typing import Any, Dict, Generic, Type, TypeVar
from pydantic import BaseModel

TArgs = TypeVar("TArgs", bound=BaseModel)

class Tool(ABC, Generic[TArgs]):
    """Base class for all tools."""

    # Must be defined by subclasses
    name: str
    description: str
    args_model: Type[TArgs]

    @abstractmethod
    async def run(self, args: TArgs, ctx: Context) -> Dict[str, Any]:
        """Execute the tool."""
        pass

    def get_json_schema(self) -> dict[str, Any]:
        """Returns JSON Schema for LLM."""
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.args_model.model_json_schema()
        }
```

### Tool Context

**Location**: `backend/src/sdk/context.py`

```python
@dataclass
class UserContext:
    user_id: str
    username: Optional[str] = None
    permissions: list[str] = field(default_factory=list)

@dataclass
class SessionContext:
    session_id: str
    created_at: float
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class ExecutionRuntime:
    workspace_root: str
    services: Dict[str, Any] = field(default_factory=dict)

@dataclass
class ToolContext:
    user: UserContext
    session: SessionContext
    runtime: ExecutionRuntime
```

### Tool Registration

**Location**: `backend/src/tools/registry.py`

Tools are automatically registered through:
- Filesystem scanning of `tools/` directories
- Marketplace tool loading
- Manual registration via `ToolRegistry.register_tool()`

### Marketplace Tools

**Structure**:
```
tools/verified/my_tool/
├── tool.py              # Tool implementation
├── manifest.json        # Metadata
├── README.md           # Documentation
└── __init__.py         # Package init
```

**Manifest Format**:
```json
{
  "name": "tool_name",
  "version": "1.0.0",
  "description": "Tool description",
  "author": "Author Name",
  "category": "utility",
  "tool_class": "MyTool",
  "permissions": ["file_read"],
  "is_destructive": false,
  "tags": ["tag1", "tag2"],
  "homepage": "https://github.com/...",
  "license": "MIT"
}
```

## LLM Provider Extensions

### LLM Provider Interface

**Location**: `backend/src/llm/providers/base.py`

```python
from abc import ABC, abstractmethod
from typing import Any, AsyncGenerator, Dict, List, Optional

class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    def __init__(self, cfg: AppConfig):
        self.config = cfg

    @abstractmethod
    async def get_completion(
        self, model: str, messages: List[LLMMessage]
    ) -> NormalizedLLMResponse:
        """Get completion from LLM."""
        pass

    @abstractmethod
    async def get_completion_stream(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingChunk, None]:
        """Get streaming completion."""
        pass

    @abstractmethod
    async def list_models(self) -> List[Dict[str, str]]:
        """List available models."""
        pass

    @abstractmethod
    def _get_full_model_string(self, model_id: str) -> str:
        """Get full model string for LiteLLM."""
        pass

    @abstractmethod
    def _get_base_url(self, provider_config: Any) -> Optional[str]:
        """Get base URL from config."""
        pass
```

### LLM Client Interface

**Location**: `backend/src/core/interfaces/llm.py`

```python
@runtime_checkable
class LLMClientInterface(Protocol):
    """Interface for LLM client implementations."""

    async def generate_response(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Generate complete response."""
        ...

    async def generate_stream(
        self,
        messages: List[Dict[str, Any]],
        tools: Optional[List[Dict[str, Any]]] = None,
        temperature: float = 0.7,
        max_tokens: Optional[int] = None,
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Generate streaming response."""
        ...
```

### Built-in Providers

**Location**: `backend/src/llm/providers/`

- `openai.py` - OpenAI GPT models
- `anthropic.py` - Anthropic Claude models
- `gemini.py` - Google Gemini models
- `mistral.py` - Mistral AI models
- `openrouter.py` - OpenRouter unified API
- `local.py` - Local model support

### Provider Registration

**Location**: `backend/src/llm/providers/__init__.py`

```python
PROVIDER_CLASSES = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
    "mistral": MistralProvider,
    "openrouter": OpenRouterProvider,
    "local": LocalProvider,
}
```

## Memory System Extensions

### Memory Store Interface

**Location**: `backend/src/core/interfaces/memory_store.py`

```python
@runtime_checkable
class MemoryStoreInterface(Protocol):
    """Interface for memory storage implementations."""

    def add(self, text: str, user_id: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Add memory item."""
        ...

    def search(self, query: str, user_id: str, limit: int = 5, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Search memories."""
        ...

    def delete(self, memory_id: str, user_id: str) -> bool:
        """Delete memory item."""
        ...
```

### Memory Manager Interface

**Location**: `backend/src/core/interfaces/memory.py`

```python
@runtime_checkable
class MemoryManagerInterface(Protocol):
    """Interface for memory management."""

    async def store_episodic_memory(self, user_message: str, assistant_reply: str) -> None:
        """Store conversation turn."""
        ...

    async def summarize_and_store_semantic_memory(self) -> int:
        """Create semantic memories."""
        ...

    async def retrieve_memories(self, query: str, limit: int = 5) -> Dict[str, List[str]]:
        """Retrieve relevant memories."""
        ...

    def format_context(self, memories: Dict[str, List[str]]) -> str:
        """Format memories for context."""
        ...
```

### Built-in Implementations

**Memory Stores**:
- `SQLiteMemoryStore` - SQLite-based vector storage
- Custom implementations can extend the interface

**Memory Managers**:
- `MemoryManager` - High-level memory operations
- Integrates with embedding providers and storage

## Embedding Provider Extensions

### Embedding Provider Interface

**Location**: `backend/src/core/interfaces/embedding.py`

```python
from abc import ABC, abstractmethod
from typing import List
import numpy as np

class EmbeddingProvider(ABC):
    """Abstract interface for embedding providers."""

    @abstractmethod
    def embed_text(self, text: str) -> np.ndarray:
        """Embed single text."""
        pass

    @abstractmethod
    def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        """Embed batch of texts."""
        pass

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Return embedding dimension."""
        pass
```

### Built-in Providers

**Location**: `backend/src/memory/embeddings.py`

- `SentenceTransformerProvider` - Local sentence transformers
- `OpenAIEmbeddingProvider` - OpenAI embeddings API
- Custom providers can implement the interface

## Plugin System Extensions

### Agent Plugin Interface

**Location**: `backend/src/agent/plugins/interface.py`

```python
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

class AgentPlugin(ABC):
    """Base interface for agent plugins."""

    @property
    @abstractmethod
    def name(self) -> str:
        """Plugin name."""
        pass

    @property
    @abstractmethod
    def version(self) -> str:
        """Plugin version."""
        pass

    @property
    @abstractmethod
    def description(self) -> str:
        """Plugin description."""
        pass

    @abstractmethod
    async def initialize(self, config: Dict[str, Any]) -> None:
        """Initialize plugin."""
        pass

    @abstractmethod
    async def shutdown(self) -> None:
        """Shutdown plugin."""
        pass

    @abstractmethod
    async def on_message(self, message: Message) -> Optional[Message]:
        """Process messages."""
        pass

    def get_config_schema(self) -> Dict[str, Any]:
        """Return config schema."""
        return {}
```

### Plugin Registry

**Location**: `backend/src/core/plugins/registry.py`

```python
class PluginRegistry:
    """Centralized plugin management."""

    def register(self, plugin: AgentPlugin, enabled: bool = True) -> None:
        """Register a plugin."""
        pass

    def unregister(self, name: str) -> bool:
        """Unregister a plugin."""
        pass

    def get_plugin(self, name: str) -> Optional[AgentPlugin]:
        """Get plugin by name."""
        pass

    async def initialize_all(self) -> None:
        """Initialize all enabled plugins."""
        pass
```

### Plugin Lifecycle

**Location**: `backend/src/core/plugins/lifecycle.py`

- **Initialization**: Plugins initialized on startup
- **Configuration**: Plugins receive configuration
- **Message Processing**: Plugins can intercept and modify messages
- **Shutdown**: Clean shutdown on application exit

## Message Handler Extensions

### Message Handler Interface

**Location**: `backend/src/api/handlers/base.py`

```python
from abc import ABC, abstractmethod
from typing import Any, Dict
from fastapi import WebSocket

class MessageHandler(ABC):
    """Base class for message handlers."""

    @abstractmethod
    async def handle(
        self,
        data: Dict[str, Any],
        websocket: WebSocket,
        user_id: str
    ) -> None:
        """Handle message."""
        pass

    def validate_message(self, data: Dict[str, Any]) -> bool:
        """Validate message (optional)."""
        return True
```

### Message Handler Registry

**Location**: `backend/src/api/handlers/base.py`

```python
class MessageHandlerRegistry:
    """Registry for message handlers."""

    def register(self, message_type: str, handler: MessageHandler) -> None:
        """Register handler for message type."""
        pass

    def unregister(self, message_type: str) -> bool:
        """Unregister handler."""
        pass

    async def handle(
        self,
        message_type: str,
        data: Dict[str, Any],
        websocket: WebSocket,
        user_id: str
    ) -> None:
        """Route message to handler."""
        pass
```

### Built-in Message Handlers

**Location**: `backend/src/api/handlers/`

- `ping_handler.py` - Ping/pong health checks
- `query_handler.py` - User queries and streaming responses
- `settings_handler.py` - Settings load/update operations
- Custom handlers can be added for new message types

## Service Extensions

### Service Interface

**Location**: `backend/src/core/interfaces/services.py`

```python
@runtime_checkable
class ServiceInterface(Protocol):
    """Interface for service integrations."""

    async def initialize(self) -> None:
        """Initialize service."""
        ...

    async def shutdown(self) -> None:
        """Shutdown service."""
        ...

    async def health_check(self) -> bool:
        """Check service health."""
        ...
```

### Service Container Integration

**Location**: `backend/src/core/container/core_container.py`

Services are registered in the dependency injection container:

```python
from dependency_injector import providers

class CoreContainer(containers.DeclarativeContainer):
    """Core services container."""

    # Add custom services here
    my_service = providers.Singleton(MyService, config=config)
```

## Event System Extensions

### Event Base Classes

**Location**: `backend/src/core/events.py`

```python
from dataclasses import dataclass
from typing import Any, Dict

@dataclass
class Event:
    """Base event class."""
    event_type: str
    timestamp: float
    data: Dict[str, Any]
```

### Built-in Events

- `InteractionCompleted` - Conversation turn completed
- `ToolExecuted` - Tool execution finished
- `SessionCreated` - New session started
- `ConfigUpdated` - Configuration changed

### Event Bus

**Location**: `backend/src/core/bus.py`

```python
class MessageBus:
    """Asynchronous event bus."""

    def subscribe(self, event_type: Type[T], handler: Callable) -> None:
        """Subscribe to event type."""
        pass

    async def publish(self, event: Event) -> None:
        """Publish event to subscribers."""
        pass
```

### Event Subscription

```python
from backend.src.core.bus import message_bus

@message_bus.subscribe(MyCustomEvent)
async def handle_event(event: MyCustomEvent):
    """Handle custom event."""
    pass
```

## Configuration Extensions

### Configuration Models

**Location**: `backend/src/core/config.py`

```python
from pydantic import BaseModel, Field

class AppConfig(BaseModel):
    """Main configuration model."""

    # Add custom configuration fields
    custom_setting: str = Field(default="value", description="Custom setting")

    # Nested configuration
    custom_provider: CustomProviderConfig = Field(default_factory=CustomProviderConfig)
```

### Configuration Providers

**Location**: `backend/src/core/config_service.py`

```python
class ConfigService:
    """Configuration management service."""

    def get_config(self) -> AppConfig:
        """Get current configuration."""
        pass

    async def update_config(self, config: AppConfig) -> None:
        """Update configuration."""
        pass
```

### Configuration Sources

- YAML files in platform-specific directories
- Environment variables
- Runtime configuration updates
- Default values from Pydantic models

## Storage Extensions

### Storage Backends

The system supports multiple storage backends through abstraction layers.

#### File Storage

**Location**: `backend/src/core/services/file_service.py`

```python
class FileService:
    """Abstract file operations."""

    async def read_file(self, path: str, encoding: str = "utf-8") -> str:
        """Read file content."""
        pass

    async def write_file(self, path: str, content: str, encoding: str = "utf-8") -> None:
        """Write file content."""
        pass

    async def list_directory(self, path: str) -> List[str]:
        """List directory contents."""
        pass
```

#### Database Storage

**Location**: Various storage implementations

- SQLite for memory storage
- Custom database implementations can extend storage interfaces

## Integration Patterns

### Dependency Injection

Extensions integrate through the DI container:

```python
# In container definition
container.my_extension = providers.Singleton(
    MyExtension,
    config=container.config,
    dependency=container.some_dependency
)
```

### Service Locator Pattern

Services available through context objects:

```python
# In tool context
ctx.runtime.services["my_service"]

# In plugin context
self.container.my_service()
```

### Factory Pattern

Extensions can provide factories for dynamic instantiation:

```python
class MyExtensionFactory:
    """Factory for creating extension instances."""

    @staticmethod
    def create(config: Dict[str, Any]) -> MyExtension:
        """Create extension instance."""
        return MyExtension(config)
```

## Extension Metadata

### Version Management

Extensions should follow semantic versioning:

```python
class MyExtension:
    """Extension with version info."""

    VERSION = "1.0.0"
    COMPATIBLE_API_VERSIONS = ["1.0", "1.1"]
```

### Capability Declaration

Extensions declare their capabilities:

```python
class MyTool(Tool[MyArgs]):
    """Tool with capability metadata."""

    capabilities = ["file_read", "network_access"]
    permissions_required = ["file_read"]
    destructive = False
```

## Testing Extensions

### Test Base Classes

**Location**: `tests/`

```python
class TestExtensionBase:
    """Base class for extension tests."""

    @pytest.fixture
    def extension_config(self):
        """Provide test configuration."""
        return {"test_setting": "value"}

    @pytest.mark.asyncio
    async def test_extension_initialization(self, extension_config):
        """Test extension initializes correctly."""
        extension = MyExtension(extension_config)
        await extension.initialize()
        assert extension.is_initialized
```

### Mock Services

```python
@pytest.fixture
def mock_service(self):
    """Provide mock service for testing."""
    service = AsyncMock()
    service.do_something.return_value = {"result": "mocked"}
    return service
```

## Security Considerations

### Permission System

**Location**: `backend/src/core/security/`

Extensions must respect the permission system:

```python
# Check permissions in tools
if "file_read" not in ctx.user.permissions:
    raise PermissionError("File read permission required")

# Declare required permissions
class MyTool(Tool[MyArgs]):
    required_permissions = ["file_read", "network_access"]
```

### Input Validation

All extension inputs must be validated:

```python
from pydantic import BaseModel, validator

class MyArgs(BaseModel):
    path: str

    @validator("path")
    def validate_path(cls, v):
        if ".." in v:
            raise ValueError("Path traversal not allowed")
        return v
```

### Resource Limits

Extensions should respect resource limits:

```python
# In tool execution
async with asyncio.timeout(self.config.tool_timeout):
    result = await self.execute_operation()
```

## Performance Guidelines

### Async Patterns

All extensions should use async/await:

```python
class MyAsyncExtension:
    """Async-first extension."""

    async def process_data(self, data: Any) -> Any:
        """Process data asynchronously."""
        # Use async I/O operations
        result = await self.async_operation(data)
        return result
```

### Connection Pooling

Reuse connections for external services:

```python
class MyService:
    """Service with connection pooling."""

    def __init__(self):
        self.client = None

    async def initialize(self):
        """Create connection pool."""
        self.client = aiohttp.ClientSession()

    async def shutdown(self):
        """Clean up connections."""
        if self.client:
            await self.client.close()
```

### Caching Strategies

Implement appropriate caching:

```python
from backend.src.core.cache import cached

class MyExtension:
    """Extension with caching."""

    @cached(ttl=300)  # Cache for 5 minutes
    async def expensive_operation(self, param: str) -> Any:
        """Cached expensive operation."""
        return await self.compute_result(param)
```

## Migration and Compatibility

### Breaking Changes

When making breaking changes:

1. Update version numbers
2. Provide migration guides
3. Maintain backward compatibility where possible
4. Deprecate old APIs with warnings

### Compatibility Matrix

```python
class MyExtension:
    """Extension with compatibility info."""

    MIN_API_VERSION = "1.0.0"
    MAX_API_VERSION = "2.0.0"

    COMPATIBLE_CORE_VERSIONS = ["1.0.x", "1.1.x"]
```

## Community Extensions

### Marketplace Integration

Extensions can be published to the marketplace:

1. Create GitHub repository
2. Include `manifest.json`
3. Follow marketplace guidelines
4. Submit pull request

### Quality Standards

Marketplace extensions should:

- Include comprehensive tests
- Provide clear documentation
- Follow security best practices
- Maintain active development
- Support multiple platforms

This catalog provides the complete reference for extending the Personal Assistant system. Each extension point includes the necessary interfaces, implementation patterns, and integration details needed to create robust extensions.
