# Extension Points Guide

This guide explains how to extend the Personal Assistant system through its various extension points. The system is designed with modularity and extensibility in mind, allowing you to add new capabilities without modifying core code.

## Overview

The Personal Assistant follows Clean Architecture principles with clear extension points:

- **Tool Extensions**: Add new capabilities the assistant can use
- **LLM Provider Extensions**: Integrate new language model providers
- **Memory Extensions**: Implement custom memory storage and retrieval
- **Embedding Extensions**: Add new text embedding providers
- **Plugin Extensions**: Extend agent behavior and functionality
- **Message Handler Extensions**: Add new WebSocket message types
- **Service Extensions**: Integrate external services and APIs

## Tool Extensions

Tools are the primary way to extend the assistant's capabilities. See the [Tool Development Guide](tool_development.md) for detailed instructions.

**Key Extension Points**:
- SDK-based tool creation with `Tool[TArgs]` base class
- Automatic schema generation for LLM understanding
- Marketplace system for community tool sharing
- Permission-based security controls

## LLM Provider Extensions

Add support for new language model providers by implementing the `LLMProvider` interface.

### Creating a New LLM Provider

```python
from backend.src.llm.providers.base import LLMProvider
from backend.src.core.config import AppConfig
from backend.src.core.types import LLMMessage, NormalizedLLMResponse, StreamingChunk

class MyLLMProvider(LLMProvider):
    """Custom LLM provider implementation."""

    def __init__(self, cfg: AppConfig):
        super().__init__(cfg)
        # Initialize your provider client here

    async def get_completion(
        self, model: str, messages: List[LLMMessage]
    ) -> NormalizedLLMResponse:
        """Get a complete response from the LLM."""
        # Implement single completion
        response = await self._call_llm_api(model, messages)

        return NormalizedLLMResponse(
            content=response["content"],
            usage=response.get("usage", {}),
            model=model,
            finish_reason=response.get("finish_reason", "stop")
        )

    async def get_completion_stream(
        self, model: str, messages: List[LLMMessage]
    ) -> AsyncGenerator[StreamingChunk, None]:
        """Get a streaming response from the LLM."""
        async for chunk in self._call_llm_api_stream(model, messages):
            yield StreamingChunk(
                content=chunk.get("content", ""),
                usage=chunk.get("usage"),
                finish_reason=chunk.get("finish_reason")
            )

    async def list_models(self) -> List[Dict[str, str]]:
        """List available models from this provider."""
        # Return list of available models
        return [
            {"id": "model-1", "name": "Model One", "context_window": 4096},
            {"id": "model-2", "name": "Model Two", "context_window": 8192}
        ]

    def _get_full_model_string(self, model_id: str) -> str:
        """Construct full model string for LiteLLM."""
        return f"myprovider/{model_id}"

    def _get_base_url(self, provider_config: Any) -> Optional[str]:
        """Get base URL from provider config."""
        return provider_config.get("base_url")
```

### Registering the Provider

Add your provider to the provider registry in `backend/src/llm/providers/__init__.py`:

```python
from .my_provider import MyLLMProvider

# Add to provider mapping
PROVIDER_CLASSES = {
    # ... existing providers
    "myprovider": MyLLMProvider,
}
```

### Configuration

Add provider configuration to the config system:

```yaml
llm_providers:
  myprovider:
    base_url: "https://api.myprovider.com"
    api_key: "your-api-key"
    # Provider-specific settings
```

## Memory Extensions

Implement custom memory storage and retrieval strategies.

### Memory Store Interface

```python
from backend.src.core.interfaces.memory import MemoryStoreInterface
from typing import List, Dict, Any, Optional

class MyMemoryStore(MemoryStoreInterface):
    """Custom memory storage implementation."""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        # Initialize your storage backend

    def add(self, text: str, user_id: str, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Add a memory item."""
        # Implement storage logic
        pass

    def search(self, query: str, user_id: str, limit: int = 5, filters: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Search memories by similarity."""
        # Implement search logic
        return []

    def delete(self, memory_id: str, user_id: str) -> bool:
        """Delete a memory item."""
        # Implement deletion logic
        return True
```

### Memory Manager Interface

```python
from backend.src.core.interfaces.memory import MemoryManagerInterface

class MyMemoryManager(MemoryManagerInterface):
    """Custom memory management implementation."""

    def __init__(self, store: MemoryStoreInterface, embedder: EmbeddingProvider):
        self.store = store
        self.embedder = embedder

    async def store_episodic_memory(self, user_message: str, assistant_reply: str) -> None:
        """Store a conversation turn."""
        combined_text = f"User: {user_message}\nAssistant: {assistant_reply}"
        self.store.add(combined_text, "current_user")

    async def summarize_and_store_semantic_memory(self) -> int:
        """Create semantic memories from recent episodes."""
        # Implement summarization logic
        return 0

    async def retrieve_memories(self, query: str, limit: int = 5) -> Dict[str, List[str]]:
        """Retrieve relevant memories."""
        results = self.store.search(query, "current_user", limit)
        return {
            "episodic": [r["text"] for r in results],
            "semantic": []  # Add semantic memories if implemented
        }

    def format_context(self, memories: Dict[str, List[str]]) -> str:
        """Format memories for LLM context."""
        context_parts = []
        for memory_type, memory_list in memories.items():
            if memory_list:
                context_parts.append(f"{memory_type.title()} memories:")
                context_parts.extend(f"- {memory}" for memory in memory_list)
        return "\n".join(context_parts)
```

## Embedding Extensions

Add new text embedding providers for vectorizing text.

```python
from backend.src.core.interfaces.embedding import EmbeddingProvider
import numpy as np
from typing import List

class MyEmbeddingProvider(EmbeddingProvider):
    """Custom embedding provider."""

    def __init__(self, model_name: str = "my-model"):
        self.model_name = model_name
        # Initialize your embedding model
        self._dimension = 384  # Set based on your model

    def embed_text(self, text: str) -> np.ndarray:
        """Embed a single text."""
        # Implement single text embedding
        return np.random.rand(self._dimension)  # Replace with real embedding

    def embed_batch(self, texts: List[str]) -> List[np.ndarray]:
        """Embed multiple texts."""
        # Implement batch embedding for efficiency
        return [self.embed_text(text) for text in texts]

    @property
    def dimension(self) -> int:
        """Return embedding dimension."""
        return self._dimension
```

## Plugin Extensions

Extend agent behavior through the plugin system.

### Agent Plugin Interface

```python
from backend.src.agent.plugins.interface import AgentPlugin
from backend.src.core.bus import Message
from typing import Dict, Any, Optional

class MyAgentPlugin(AgentPlugin):
    """Custom agent plugin."""

    def __init__(self):
        self.name = "my_plugin"
        self.version = "1.0.0"
        self.description = "My custom plugin"

    async def initialize(self, config: Dict[str, Any]) -> None:
        """Initialize the plugin."""
        pass

    async def shutdown(self) -> None:
        """Clean up plugin resources."""
        pass

    async def on_message(self, message: Message) -> Optional[Message]:
        """Process messages passing through the agent."""
        # Modify or react to messages
        if message.type == "some_event":
            # Handle specific message type
            pass
        return message

    def get_config_schema(self) -> Dict[str, Any]:
        """Return configuration schema."""
        return {
            "type": "object",
            "properties": {
                "enabled": {"type": "boolean", "default": True},
                "setting1": {"type": "string"}
            }
        }
```

### Plugin Registration

Register your plugin in the plugin system:

```python
from backend.src.core.plugins.registry import PluginRegistry

registry = PluginRegistry()
await registry.register(MyAgentPlugin(), enabled=True)
```

## Message Handler Extensions

Add new WebSocket message types to the API.

### Creating a Message Handler

```python
from backend.src.api.handlers.base import MessageHandler
from backend.src.api.schema import BaseMessage
from pydantic import BaseModel
from typing import Dict, Any
from fastapi import WebSocket

class MyMessagePayload(BaseModel):
    action: str
    data: Dict[str, Any]

class MyMessage(BaseMessage):
    type: str = "my-message"
    payload: MyMessagePayload

class MyMessageHandler(MessageHandler):
    """Handler for custom messages."""

    def validate_message(self, data: Dict[str, Any]) -> bool:
        """Validate message structure."""
        try:
            MyMessage(**data)
            return True
        except ValidationError:
            return False

    async def handle(
        self, data: Dict[str, Any], websocket: WebSocket, user_id: str
    ) -> None:
        """Handle the message."""
        validated = MyMessage(**data)

        # Process the message
        result = await self.process_my_action(
            validated.payload.action,
            validated.payload.data
        )

        # Send response
        await websocket.send_json({
            "type": "my-response",
            "id": validated.id,
            "payload": result
        })

    async def process_my_action(self, action: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Process the custom action."""
        # Implement your logic
        return {"status": "success", "result": f"Processed {action}"}
```

### Registering the Handler

Add your handler to the message registry:

```python
from backend.src.api.handlers.base import get_handler_registry

registry = get_handler_registry()
registry.register("my-message", MyMessageHandler())
```

## Service Extensions

Integrate external services through the service container.

### Service Interface

```python
from backend.src.core.interfaces.services import ServiceInterface
from typing import Any, Dict, Optional

class MyService(ServiceInterface):
    """Custom service integration."""

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        # Initialize service client

    async def initialize(self) -> None:
        """Initialize the service."""
        pass

    async def shutdown(self) -> None:
        """Clean up service resources."""
        pass

    async def health_check(self) -> bool:
        """Check if service is healthy."""
        return True

    # Add service-specific methods
    async def do_something(self, param: str) -> Dict[str, Any]:
        """Service-specific functionality."""
        return {"result": f"Processed {param}"}
```

### Service Registration

Register your service in the DI container:

```python
from backend.src.core.container.core_container import CoreContainer
from dependency_injector import providers

# Add to container
container = CoreContainer()
container.my_service = providers.Singleton(MyService, config=container.config)
```

## Configuration Extensions

Extend the configuration system for new settings.

### Adding Configuration Fields

```python
from backend.src.core.config import AppConfig
from pydantic import Field
from typing import Optional

class ExtendedAppConfig(AppConfig):
    """Extended configuration with custom fields."""

    # Add your configuration fields
    my_feature_enabled: bool = Field(default=True, description="Enable my feature")
    my_api_key: Optional[str] = Field(default=None, description="API key for my service")
    my_timeout: int = Field(default=30, description="Timeout for my operations")
```

### Configuration Validation

Add custom validation logic:

```python
from pydantic import model_validator

class ExtendedAppConfig(AppConfig):
    @model_validator(mode='after')
    def validate_my_config(self):
        """Validate custom configuration."""
        if self.my_feature_enabled and not self.my_api_key:
            raise ValueError("my_api_key is required when my_feature_enabled is True")
        return self
```

## Event Extensions

Extend the event system for custom event types.

### Custom Events

```python
from backend.src.core.events import Event
from dataclasses import dataclass

@dataclass
class MyCustomEvent(Event):
    """Custom event type."""
    event_type: str = "my_custom_event"
    custom_data: Dict[str, Any]
    user_id: str
```

### Event Handlers

```python
from backend.src.core.bus import message_bus

@message_bus.subscribe(MyCustomEvent)
async def handle_my_event(event: MyCustomEvent):
    """Handle custom events."""
    print(f"Received custom event: {event.custom_data}")
    # Process the event
```

## Best Practices

### Extension Design Principles

1. **Interface Compliance**: Always implement the required interfaces completely
2. **Error Handling**: Provide comprehensive error handling and logging
3. **Configuration**: Make extensions configurable through the config system
4. **Documentation**: Document extension points and usage clearly
5. **Testing**: Include comprehensive tests for extensions
6. **Backwards Compatibility**: Don't break existing functionality

### Performance Considerations

1. **Async Operations**: Use async/await for all I/O operations
2. **Resource Management**: Properly clean up resources in shutdown methods
3. **Caching**: Implement appropriate caching for expensive operations
4. **Timeouts**: Set reasonable timeouts for external service calls
5. **Connection Pooling**: Reuse connections when possible

### Security Considerations

1. **Input Validation**: Always validate inputs from external sources
2. **Permission Checks**: Implement proper permission controls
3. **API Key Management**: Securely handle API keys and credentials
4. **Audit Logging**: Log security-relevant operations
5. **Rate Limiting**: Implement appropriate rate limiting

### Maintenance Guidelines

1. **Version Management**: Use semantic versioning for extensions
2. **Deprecation Notices**: Provide advance notice for breaking changes
3. **Migration Paths**: Offer migration guides for configuration changes
4. **Support Channels**: Provide clear support channels for extensions
5. **Community Engagement**: Engage with the community for feedback

## Extension Discovery

Extensions are discovered through several mechanisms:

- **File System Scanning**: Tools and plugins in designated directories
- **Entry Points**: Python package entry points for automatic discovery
- **Configuration**: Explicit configuration of extension locations
- **Marketplace**: Community extensions through the marketplace system

## Testing Extensions

Create comprehensive tests for your extensions:

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

class TestMyExtension:
    """Test cases for custom extension."""

    @pytest.mark.asyncio
    async def test_extension_functionality(self):
        """Test main extension functionality."""
        extension = MyExtension(config={"setting": "value"})

        result = await extension.do_something("test")

        assert result["status"] == "success"
        assert "test" in result["result"]

    def test_configuration_validation(self):
        """Test configuration validation."""
        # Test valid config
        config = ExtendedAppConfig(my_feature_enabled=True, my_api_key="key")
        assert config.my_feature_enabled is True

        # Test invalid config
        with pytest.raises(ValueError):
            ExtendedAppConfig(my_feature_enabled=True, my_api_key=None)
```

## Distribution

### Packaging Extensions

Create distributable packages for your extensions:

```python
# setup.py
from setuptools import setup

setup(
    name="my-assistant-extension",
    version="1.0.0",
    packages=["my_extension"],
    entry_points={
        "assistant.extensions": [
            "my_extension = my_extension.plugin:MyPlugin",
        ],
    },
)
```

### Marketplace Submission

Submit extensions to the community marketplace:

1. Create a GitHub repository with your extension
2. Include proper manifest.json and documentation
3. Follow the marketplace contribution guidelines
4. Submit a pull request to the marketplace repository

This comprehensive extension system allows the Personal Assistant to grow and adapt to new requirements while maintaining stability and performance.
