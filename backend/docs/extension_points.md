# Extension Points Guide

This document describes all the extension points available in the Desktop Assistant backend, allowing developers to extend and customize the system.

## Table of Contents

1. [Plugin System](#plugin-system)
2. [Event Bus](#event-bus)
3. [Tool Development](#tool-development)
4. [Memory System](#memory-system)
5. [Configuration](#configuration)

---

## Plugin System

The plugin system allows you to intercept and modify the agent's execution flow at various points.

### Creating a Plugin

Plugins must implement the `AgentPlugin` protocol:

```python
from backend.src.brain.control.plugin_interface import AgentPlugin, PluginResult

class MyPlugin:
    name = "my_plugin"
    version = "1.0.0"
    author = "Your Name"
    description = "Description of what this plugin does"
    
    async def on_instruction(self, instruction: str) -> Optional[PluginResult]:
        """Called when a new user query is received."""
        # Modify instruction, add context, etc.
        return None  # Return None to continue normal flow
    
    async def on_llm_response(self, response_text: str) -> Optional[PluginResult]:
        """Called when the LLM generates a text response."""
        # Modify response, add formatting, etc.
        return None
    
    async def on_tool_start(self, tool_name: str, args: Dict[str, Any]) -> Optional[PluginResult]:
        """Called before a tool is executed."""
        # Validate args, add logging, etc.
        # Return PluginResult(stop_execution=True) to cancel tool execution
        return None
    
    async def on_tool_end(self, tool_name: str, result: Any) -> Optional[PluginResult]:
        """Called after a tool finishes execution."""
        # Process result, capture screenshots, store memory, etc.
        return PluginResult(artifacts={"custom_data": "value"})
```

### Registering a Plugin

#### Method 1: Using PluginRegistry (Recommended)

```python
from backend.src.core.plugins import plugin_registry
from backend.src.brain.control.plugin_interface import AgentPlugin

# Create plugin instance
plugin = MyPlugin()

# Register with priority (lower = higher priority)
plugin_registry.register(plugin, enabled=True, priority=50)
```

#### Method 2: Using PluginManager (Legacy)

```python
from backend.src.brain.control.plugin_manager import PluginManager

plugin_manager = PluginManager()
plugin_manager.register(MyPlugin(), priority=50)
```

### Plugin Lifecycle

Plugins can implement lifecycle methods:

```python
class MyPlugin:
    async def initialize(self):
        """Called when plugin is registered."""
        # Setup resources, connect to services, etc.
        pass
    
    async def shutdown(self):
        """Called when plugin is unregistered or system shuts down."""
        # Cleanup resources, close connections, etc.
        pass
```

### Plugin Discovery

Plugins can be auto-discovered from a directory:

```python
from backend.src.core.plugins import plugin_registry
from pathlib import Path

plugin_dir = Path("plugins")
plugin_classes = plugin_registry.discover_plugins(plugin_dir)

for plugin_class in plugin_classes:
    plugin = plugin_class()
    plugin_registry.register(plugin)
```

---

## Event Bus

The event bus provides a decoupled way to react to system events.

### Available Events

- `UserMessageReceived`: User sends a message
- `AgentResponseGenerated`: Agent generates a response
- `ToolExecutionStarted`: Tool execution begins
- `ToolExecuted`: Tool execution completes
- `LLMRequestStarted`: LLM request begins
- `LLMRequestCompleted`: LLM request completes
- `MemoryStored`: Memory is stored
- `SessionCreated`: New session created
- `SessionDestroyed`: Session destroyed
- `InteractionCompleted`: Full conversation turn completed
- `ConfigChanged`: Configuration updated
- `ErrorOccurred`: Error occurs

### Subscribing to Events

```python
from backend.src.core.bus import message_bus
from backend.src.core.events import ToolExecuted

async def handle_tool_execution(event: ToolExecuted):
    print(f"Tool {event.tool_name} executed by user {event.user_id}")

# Subscribe with priority (lower = higher priority)
message_bus.subscribe(ToolExecuted, handle_tool_execution, priority=50)

# Subscribe with filter
def filter_computer_tools(event: ToolExecuted) -> bool:
    return event.tool_name.startswith("click_") or event.tool_name.startswith("keyboard_")

message_bus.subscribe(
    ToolExecuted,
    handle_tool_execution,
    priority=50,
    filter_func=filter_computer_tools
)
```

### Publishing Events

```python
from backend.src.core.bus import message_bus
from backend.src.core.events import ToolExecuted

event = ToolExecuted(
    session_id="session_123",
    user_id="user_456",
    tool_name="write_file",
    input_params={"file_path": "test.txt"},
    result={"success": True},
    success=True
)

await message_bus.publish(event)
```

### Event Middleware

Add middleware that runs before all handlers:

```python
async def logging_middleware(event: Event):
    logger.info(f"Event {type(event).__name__} published")

message_bus.add_middleware(logging_middleware)
```

---

## Tool Development

Tools extend the agent's capabilities. See [tool_development.md](./tool_development.md) for detailed information.

### Quick Start

```python
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context
from pydantic import BaseModel, Field

class MyToolArgs(BaseModel):
    input: str = Field(..., description="Input parameter")

class MyTool(Tool[MyToolArgs]):
    name = "my_tool"
    description = "Does something useful"
    args_model = MyToolArgs
    
    async def run(self, args: MyToolArgs, ctx: Context) -> dict:
        # Access services via ctx.services.get("service_name")
        # Access config via ctx.services.get("config")
        result = process(args.input)
        return {
            "success": True,
            "llm_content": f"Processed: {result}",
            "return_display": f"Result: {result}"
        }
```

---

## Memory System

### Custom Memory Stores

Implement `MemoryStoreInterface`:

```python
from backend.src.core.interfaces.memory_store import MemoryStoreInterface

class CustomMemoryStore:
    async def add(self, text: str, user_id: str, metadata: Optional[Dict[str, Any]] = None) -> str:
        # Store memory
        return memory_id
    
    async def search(self, query: str, user_id: str, filters: Optional[Dict[str, Any]] = None, limit: int = 10) -> List[Dict[str, Any]]:
        # Search memories
        return results
    
    # ... implement other methods
```

### Custom Embedding Providers

Implement `EmbeddingProvider`:

```python
from backend.src.core.interfaces.embedding import EmbeddingProvider

class CustomEmbedder:
    @property
    def dimension(self) -> int:
        return 384
    
    def embed_text(self, text: str) -> np.ndarray:
        # Generate embedding
        return embedding
```

---

## Configuration

### Adding Configuration Options

Extend `AppConfig` in `backend/src/core/config.py`:

```python
class AppConfig(BaseModel):
    # ... existing fields
    my_new_option: str = Field(default="default_value", description="My new option")
```

### Reacting to Config Changes

Subscribe to `ConfigChanged` events:

```python
from backend.src.core.events import ConfigChanged

async def handle_config_change(event: ConfigChanged):
    new_config = event.new_config
    # React to config changes
    update_my_component(new_config)

message_bus.subscribe(ConfigChanged, handle_config_change)
```

---

## Best Practices

1. **Error Handling**: Always wrap plugin code in try-except blocks
2. **Logging**: Use the logging module for debugging and monitoring
3. **Priority**: Use appropriate priorities (lower = higher priority)
4. **Performance**: Keep plugin hooks fast; defer heavy work to background tasks
5. **Testing**: Write unit tests for your plugins
6. **Documentation**: Document your plugin's purpose and behavior

---

## Examples

See the `ComputerUsePlugin` in `backend/src/brain/control/plugins/computer.py` for a complete example of a plugin that handles tool execution side-effects.

