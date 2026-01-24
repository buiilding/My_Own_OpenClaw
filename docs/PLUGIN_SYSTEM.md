# Plugin System

## Overview

The Plugin System allows extending Desktop Assistant functionality without modifying core code. Plugins can add new features, integrate with external services, and customize behavior.

## Architecture

```
┌─────────────────────────────────────────┐
│      PluginRegistry                     │
│  - Register plugins                     │
│  - Manage lifecycle                     │
│  - Handle events                        │
└─────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────┐
│      Plugin Interface                   │
│  - initialize()                         │
│  - shutdown()                           │
│  - handle_event()                       │
└─────────────────────────────────────────┘
              ↕
┌─────────────────────────────────────────┐
│      Plugin Implementations             │
│  - OCRPlugin                            │
│  - CustomPlugin1                        │
│  - CustomPlugin2                        │
└─────────────────────────────────────────┘
```

## Plugin Interface

### Base Plugin

All plugins implement the `Plugin` interface:

```python
from backend.src.core.plugins.interface import Plugin
from backend.src.core.events import AgentStreamingEvent

class MyPlugin(Plugin):
    name = "my_plugin"
    version = "1.0.0"
    
    async def initialize(self) -> None:
        """Initialize plugin."""
        pass
    
    async def shutdown(self) -> None:
        """Shutdown plugin."""
        pass
    
    async def handle_event(
        self,
        event: AgentStreamingEvent
    ) -> None:
        """Handle event."""
        pass
```

## Creating a Plugin

### Step 1: Create Plugin Class

```python
from backend.src.core.plugins.interface import Plugin
from backend.src.core.events import AgentStreamingEvent, ToolExecuted

class MyPlugin(Plugin):
    name = "my_plugin"
    version = "1.0.0"
    description = "My custom plugin"
    
    def __init__(self, config: dict):
        self.config = config
        self._initialized = False
    
    async def initialize(self) -> None:
        """Initialize plugin."""
        if self._initialized:
            return
        
        # Initialize plugin resources
        self._setup_resources()
        self._initialized = True
    
    async def shutdown(self) -> None:
        """Shutdown plugin."""
        if not self._initialized:
            return
        
        # Cleanup plugin resources
        self._cleanup_resources()
        self._initialized = False
    
    async def handle_event(
        self,
        event: AgentStreamingEvent
    ) -> None:
        """Handle event."""
        if isinstance(event, ToolExecuted):
            await self._handle_tool_executed(event)
    
    def _setup_resources(self):
        """Setup plugin resources."""
        pass
    
    def _cleanup_resources(self):
        """Cleanup plugin resources."""
        pass
    
    async def _handle_tool_executed(self, event: ToolExecuted):
        """Handle tool executed event."""
        pass
```

### Step 2: Register Plugin

Register plugin in plugin registry:

```python
from backend.src.core.plugins.registry import PluginRegistry

plugin_registry = PluginRegistry()
plugin_registry.register(MyPlugin(config={}))
```

### Step 3: Initialize Plugin

Plugins are initialized during application startup:

```python
await plugin_registry.initialize_all()
```

## Built-in Plugins

### OCR Plugin

The OCR Plugin provides OCR capabilities:

```python
from backend.src.agent.plugins.ocr_plugin import OCRPlugin

ocr_plugin = OCRPlugin(config={
    "provider": "rapidocr",
    "device": "cuda"
})

plugin_registry.register(ocr_plugin)
```

**Features**:
- Text extraction from images
- Coordinate detection
- GPU acceleration support

## Event Handling

### Event Types

Plugins can handle various event types:

**InteractionCompleted**:
```python
class InteractionCompleted(AgentStreamingEvent):
    session_id: str
    query: str
    response: str
```

**ToolExecuted**:
```python
class ToolExecuted(AgentStreamingEvent):
    tool_name: str
    result: ToolResult
    execution_time: float
```

**MemoryStored**:
```python
class MemoryStored(AgentStreamingEvent):
    memory_id: str
    content: str
```

### Event Handling Example

```python
async def handle_event(
    self,
    event: AgentStreamingEvent
) -> None:
    if isinstance(event, ToolExecuted):
        # Log tool execution
        logger.info(f"Tool executed: {event.tool_name}")
        
        # Store in database
        await self._store_tool_execution(event)
    
    elif isinstance(event, InteractionCompleted):
        # Process interaction
        await self._process_interaction(event)
```

## Plugin Configuration

### Configuration Format

Plugins use Python-based configuration in `backend/src/core/plugins/plugin_config.py`:

```python
PLUGIN_CONFIG: Dict[str, Dict[str, Any]] = {
    "my_plugin": {
        "enabled": True,
        "priority": 100,
        "config": {
            "setting1": "value1",
            "setting2": 123
        }
    }
}
```

**Configuration Fields**:
- `enabled`: Whether plugin is enabled (default: True)
- `priority`: Execution priority (lower = higher priority, default: 100)
- `config`: Custom plugin-specific configuration dictionary

**Note**: Changes require application restart to take effect.

### PluginConfigManager (`core/plugins/config.py`)

Manages plugin configuration loaded from Python config file.

**Responsibilities**:
- Load plugin configuration from `plugin_config.PLUGIN_CONFIG`
- Check if plugins are enabled
- Get plugin priorities
- Get plugin custom configs
- Set runtime-only config (not persisted)

**Key Methods**:
- `is_enabled(plugin_name)`: Check if plugin is enabled
- `get_priority(plugin_name, default)`: Get plugin priority
- `get_config(plugin_name)`: Get plugin custom config
- `set_plugin_config(plugin_name, enabled, priority, config)`: Set runtime config (not persisted)

### Accessing Configuration

```python
from backend.src.core.plugins.config import PluginConfigManager

class MyPlugin(Plugin):
    def __init__(self, config_manager: PluginConfigManager):
        self.config_manager = config_manager
        self.enabled = config_manager.is_enabled("my_plugin")
        self.priority = config_manager.get_priority("my_plugin")
        self.custom_config = config_manager.get_config("my_plugin")
```

## Plugin Lifecycle

### Plugin Discovery (`core/plugins/discovery.py`)

Discovers plugins from various sources.

**Discovery Mechanisms**:
- **EntryPointPluginDiscoverer**: Discovers plugins via setuptools entry points
  - Entry point group: `desktop_assistant.plugins`
  - Validates entry points before loading
  - Handles different importlib.metadata APIs across Python versions
- **FilesystemPluginDiscoverer**: Discovers plugins from filesystem directories
  - Uses AST parsing to inspect files statically (security)
  - Prevents arbitrary code execution during discovery
  - Only imports files containing valid plugin classes

**Discovery Flow**:
1. Scan entry points for registered plugins
2. Scan filesystem plugin directory
3. Validate discovered plugins
4. Return list of plugin classes

### Plugin Lifecycle Manager (`core/plugins/lifecycle.py`)

Manages plugin initialization and shutdown.

**Responsibilities**:
- Initialize plugins (call `initialize()` if exists)
- Inject container into plugins that need it
- Shutdown plugins (call `shutdown()` if exists)
- Track initialized plugins

**Key Methods**:
- `initialize_plugin(plugin)`: Initialize a plugin (injects container if available)
- `shutdown_plugin(plugin)`: Shutdown a plugin
- `initialize_all_plugins()`: Initialize all enabled plugins
- `shutdown_all_plugins()`: Shutdown all plugins

**Initialization**:
1. Plugin registered in PluginRegistry
2. `initialize()` called (if exists)
3. Container injected if plugin accepts it
4. Resources setup
5. Event handlers registered

**Runtime**:
1. Events received via EventBus
2. `handle_event()` called
3. Plugin processes events

**Shutdown**:
1. `shutdown()` called (if exists)
2. Resources cleaned up
3. Event handlers unregistered

### Plugin State Manager (`core/plugins/state_manager.py`)

Manages plugin enable/disable state and metadata.

**Responsibilities**:
- Track plugin metadata
- Manage plugin configurations
- Enable/disable plugins
- Track enabled plugin list

**Key Methods**:
- `set_metadata(plugin_name, metadata)`: Set plugin metadata
- `get_metadata(plugin_name)`: Get plugin metadata
- `set_config(plugin_name, config)`: Set plugin config
- `get_config(plugin_name)`: Get plugin config
- `enable_plugin(plugin_name)`: Enable a plugin
- `disable_plugin(plugin_name)`: Disable a plugin
- `is_enabled(plugin_name)`: Check if plugin is enabled
- `get_enabled_plugin_names()`: Get list of enabled plugins

### Plugin Metadata (`core/plugins/metadata.py`)

Data structures for plugin configuration and metadata.

**PluginConfig**:
- `enabled`: Enable/disable state
- `priority`: Execution priority
- `config`: Custom configuration dictionary
- `dependencies`: List of plugin dependencies

**PluginMetadata**:
- `name`: Plugin name
- `version`: Plugin version
- `author`: Plugin author
- `description`: Plugin description
- `source`: Discovery source ("entry_point", "filesystem", "manual")
- `config`: PluginConfig instance
- `dependencies`: List of dependencies
- `module_path`: Optional module path

## Best Practices

### Resource Management

- Initialize resources in `initialize()`
- Cleanup resources in `shutdown()`
- Handle errors gracefully

### Event Handling

- Handle events asynchronously
- Don't block event processing
- Log important events

### Error Handling

- Catch and log errors
- Don't crash on errors
- Provide fallback behavior

## Examples

### Example: Logging Plugin

```python
class LoggingPlugin(Plugin):
    name = "logging_plugin"
    
    async def initialize(self) -> None:
        self.logger = logging.getLogger("plugin.logging")
    
    async def handle_event(
        self,
        event: AgentStreamingEvent
    ) -> None:
        self.logger.info(f"Event: {type(event).__name__}")
```

### Example: Analytics Plugin

```python
class AnalyticsPlugin(Plugin):
    name = "analytics_plugin"
    
    async def initialize(self) -> None:
        self.db = await self._setup_database()
    
    async def handle_event(
        self,
        event: AgentStreamingEvent
    ) -> None:
        if isinstance(event, ToolExecuted):
            await self._record_tool_execution(event)
    
    async def _record_tool_execution(self, event: ToolExecuted):
        await self.db.execute(
            "INSERT INTO tool_executions ...",
            event.tool_name,
            event.execution_time
        )
```

## Testing

### Unit Testing

```python
import pytest
from backend.src.core.plugins.interface import Plugin

@pytest.mark.asyncio
async def test_plugin():
    plugin = MyPlugin(config={})
    
    await plugin.initialize()
    assert plugin._initialized
    
    await plugin.shutdown()
    assert not plugin._initialized
```

### Integration Testing

```python
@pytest.mark.asyncio
async def test_plugin_integration():
    plugin_registry = PluginRegistry()
    plugin_registry.register(MyPlugin(config={}))
    
    await plugin_registry.initialize_all()
    
    # Test event handling
    event = ToolExecuted(...)
    await plugin_registry.handle_event(event)
    
    await plugin_registry.shutdown_all()
```

## Troubleshooting

### Plugin Not Loading

1. Check plugin registration
2. Verify plugin class structure
3. Check initialization errors
4. Review error logs

### Plugin Not Handling Events

1. Check event type matching
2. Verify event handler registration
3. Check event bus connection
4. Review event logs

### Plugin Errors

1. Check error messages
2. Verify resource initialization
3. Review plugin logs
4. Check configuration

---

For more information, see:
- [Backend Architecture](BACKEND_ARCHITECTURE.md)
- [Developer Guide](DEVELOPER_GUIDE.md)
- [Extension Points](EXTENSION_POINTS.md)
