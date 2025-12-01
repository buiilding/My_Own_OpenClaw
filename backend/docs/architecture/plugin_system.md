# Plugin System Architecture

This comprehensive guide covers the Personal Assistant Backend plugin system, including architecture, development patterns, lifecycle management, and best practices for creating and managing plugins.

## Overview

The plugin system provides a flexible architecture for extending agent functionality without modifying core code. Plugins can intercept and modify the agent's execution flow at various points, enabling custom behaviors, integrations, and extensions.

## Core Architecture

### Plugin Architecture Components

The plugin system consists of several key components working together:

- **Plugin Registry**: Central registry for plugin discovery, registration, and lifecycle management
- **Plugin Config Manager**: Persistent configuration storage and retrieval
- **Plugin State Manager**: Runtime state tracking and enable/disable functionality
- **Plugin Lifecycle Manager**: Initialization, shutdown, and cleanup coordination
- **Plugin Metadata**: Version, author, priority, and capability information

### Plugin Interface

**Location**: `backend/src/agent/plugins/interface.py`

The plugin system is built around a protocol-based interface that defines the contract for plugin implementations:

```python
from typing import Any, Dict, Optional, Protocol
from dataclasses import dataclass

@dataclass
class PluginResult:
    """
    Result from a plugin hook.
    If 'content' is set, it may interrupt the standard flow or append to it.
    """
    content: Optional[str] = None
    stop_execution: bool = False
    artifacts: Optional[Dict[str, Any]] = None

class AgentPlugin(Protocol):
    """Interface for Agent Plugins."""

    name: str

    async def initialize(self, container: Any = None) -> None:
        """Called when the plugin is initialized."""
        ...

    async def on_instruction(self, instruction: str) -> Optional[PluginResult]:
        """Called when a new user query is received."""
        ...

    async def on_llm_response(self, response_text: str) -> Optional[PluginResult]:
        """Called when the LLM generates a text response."""
        ...

    async def on_tool_start(self, tool_name: str, args: Dict[str, Any]) -> Optional[PluginResult]:
        """Called before a tool is executed."""
        ...

    async def on_tool_end(self, tool_name: str, result: Any) -> Optional[PluginResult]:
        """Called after a tool finishes execution."""
        ...
```

### Plugin Lifecycle

**Location**: `backend/src/core/plugins/lifecycle.py`

Plugins follow a well-defined lifecycle managed by the `PluginLifecycleManager`:

```python
class PluginLifecycleManager:
    """Manages plugin lifecycle operations."""

    async def initialize_plugin(self, plugin: AgentPlugin) -> bool:
        """Initialize a plugin with dependency injection."""

    async def shutdown_plugin(self, plugin: AgentPlugin) -> bool:
        """Shutdown a plugin cleanly."""

    async def initialize_all_plugins(self) -> Dict[str, bool]:
        """Initialize all registered plugins."""

    async def shutdown_all_plugins(self) -> Dict[str, bool]:
        """Shutdown all registered plugins."""
```

### Plugin Registry

**Location**: `backend/src/core/plugins/registry.py`

The central registry manages plugin registration, discovery, and state:

```python
class PluginRegistry:
    """Centralized registry for managing agent plugins."""

    def register(self, plugin: AgentPlugin, enabled: bool = True) -> bool:
        """Register a plugin."""

    def unregister(self, name: str) -> bool:
        """Unregister a plugin."""

    def get_plugin(self, name: str) -> Optional[AgentPlugin]:
        """Get plugin by name."""

    def list_plugins(self) -> List[str]:
        """List all registered plugin names."""

    def is_enabled(self, name: str) -> bool:
        """Check if plugin is enabled."""

    def enable_plugin(self, name: str) -> bool:
        """Enable a plugin."""

    def disable_plugin(self, name: str) -> bool:
        """Disable a plugin."""
```

## Plugin State Management

### Configuration Persistence

Plugins support persistent configuration stored in YAML format:

```yaml
plugins:
  enabled:
    - "computer_control"
    - "ocr_plugin"
  disabled:
    - "debug_monitor"
  config:
    computer_control:
      screenshot_quality: 0.8
      click_delay_ms: 100
    ocr_plugin:
      languages: ["en", "es"]
```

### State Management

The plugin system maintains runtime state for each plugin:

- **Enabled/Disabled Status**: Runtime enable/disable without restart
- **Priority Ordering**: Plugin execution order (lower priority = higher precedence)
- **Metadata Storage**: Version, author, description, and capabilities
- **Lifecycle State**: Initialized, running, or shutdown

### Plugin Metadata

Each plugin includes rich metadata for management and discovery:

```python
@dataclass
class PluginMetadata:
    name: str
    version: str = "1.0.0"
    author: str = "Unknown"
    description: str = ""
    enabled: bool = True
    priority: int = 100  # Lower = higher priority
```

## Plugin Types and Hooks

### Hook Points

Plugins can hook into different stages of agent execution:

1. **on_instruction**: Called when a new user query is received
2. **on_llm_response**: Called when the LLM generates a response
3. **on_tool_start**: Called before tool execution begins
4. **on_tool_end**: Called after tool execution completes

### Plugin Result Handling

Each hook can return a `PluginResult` to modify agent behavior:

```python
@dataclass
class PluginResult:
    content: Optional[str] = None           # Content to add/modify
    stop_execution: bool = False            # Stop further processing
    artifacts: Optional[Dict[str, Any]] = None  # Additional data
```

### Plugin Categories

#### Monitoring Plugins

Monitor agent activities and collect metrics:

```python
class MonitoringPlugin:
    """Plugin that monitors agent activities."""

    async def on_instruction(self, instruction: str) -> Optional[PluginResult]:
        # Log user queries
        await self.metrics.increment("instructions_received")
        await self.logger.info(f"Instruction received: {instruction[:100]}...")
        return None

    async def on_tool_end(self, tool_name: str, result: Any) -> Optional[PluginResult]:
        # Track tool execution metrics
        success = result.get("success", False)
        execution_time = result.get("execution_time", 0)

        await self.metrics.histogram("tool_execution_time", execution_time, tags={
            "tool": tool_name,
            "success": str(success)
        })
        return None
```

#### Security Plugins

Enforce security policies and audit trails:

```python
class SecurityPlugin:
    """Plugin that enforces security policies."""

    async def on_instruction(self, instruction: str) -> Optional[PluginResult]:
        # Check for potentially dangerous instructions
        if self._contains_dangerous_patterns(instruction):
            await self.audit_log_security_event("dangerous_instruction", {
                "instruction": instruction,
                "user_id": self.context.user_id
            })
            return PluginResult(
                content="I'm sorry, but I cannot assist with that request.",
                stop_execution=True
            )
        return None

    async def on_tool_start(self, tool_name: str, args: Dict[str, Any]) -> Optional[PluginResult]:
        # Additional permission checks
        if tool_name == "run_terminal_cmd":
            if not self._user_has_shell_access():
                return PluginResult(
                    content="Shell access denied.",
                    stop_execution=True
                )
        return None
```

#### Enhancement Plugins

Add functionality or modify responses:

```python
class EnhancementPlugin:
    """Plugin that enhances agent responses."""

    async def on_llm_response(self, response_text: str) -> Optional[PluginResult]:
        # Add helpful context or formatting
        enhanced_response = await self._enhance_response(response_text)
        return PluginResult(content=enhanced_response)

    async def on_tool_end(self, tool_name: str, result: Any) -> Optional[PluginResult]:
        # Post-process tool results
        if tool_name == "web_search" and result.get("success"):
            # Add source verification
            verified_result = await self._verify_sources(result)
            return PluginResult(artifacts={"verified_result": verified_result})
        return None
```

## Plugin Development

### Creating a Basic Plugin

```python
from typing import Any, Dict, Optional
from backend.src.agent.plugins.interface import AgentPlugin, PluginResult

class MyCustomPlugin:
    """A custom plugin example."""

    name = "my_custom_plugin"

    async def initialize(self, container: Any = None) -> None:
        """Initialize the plugin."""
        self.container = container
        self.logger = container.logger() if container else None
        print(f"Plugin {self.name} initialized")

    async def on_instruction(self, instruction: str) -> Optional[PluginResult]:
        """Process user instructions."""
        # Add custom logic here
        if "help" in instruction.lower():
            return PluginResult(
                content="Here's some additional help information...",
                artifacts={"help_requested": True}
            )
        return None

    async def on_llm_response(self, response_text: str) -> Optional[PluginResult]:
        """Process LLM responses."""
        # Modify or enhance responses
        enhanced = f"[Enhanced] {response_text}"
        return PluginResult(content=enhanced)

    async def on_tool_start(self, tool_name: str, args: Dict[str, Any]) -> Optional[PluginResult]:
        """Intercept tool execution."""
        print(f"Tool {tool_name} starting with args: {args}")
        return None

    async def on_tool_end(self, tool_name: str, result: Any) -> Optional[PluginResult]:
        """Process tool results."""
        if result.get("success"):
            print(f"Tool {tool_name} completed successfully")
        else:
            print(f"Tool {tool_name} failed: {result.get('error')}")
        return None
```

### Plugin Configuration

Plugins can be configured through the plugin system:

```python
from backend.src.core.plugins.metadata import PluginConfig

class ConfigurablePlugin:
    """Plugin with configuration support."""

    name = "configurable_plugin"

    def __init__(self):
        self.config = PluginConfig(
            name=self.name,
            enabled=True,
            settings={
                "max_retries": 3,
                "timeout": 30.0,
                "debug_mode": False
            }
        )

    async def initialize(self, container: Any = None) -> None:
        # Load configuration
        config_manager = container.plugin_config_manager()
        self.settings = await config_manager.get_plugin_config(self.name)

        # Use configuration
        self.max_retries = self.settings.get("max_retries", 3)
        self.debug_mode = self.settings.get("debug_mode", False)
```

### Plugin Registration

```python
# Manual registration
from backend.src.core.plugins.registry import PluginRegistry

registry = PluginRegistry()
plugin = MyCustomPlugin()

# Register and enable
registry.register(plugin, enabled=True)

# Initialize all plugins
await registry.lifecycle_manager.initialize_all_plugins()
```

### Dependency Injection

Plugins can access the DI container for dependencies:

```python
class ServiceUsingPlugin:
    """Plugin that uses injected services."""

    async def initialize(self, container: Any = None) -> None:
        if container:
            self.llm_client = container.llm_client()
            self.memory_manager = container.memory_manager()
            self.tool_registry = container.tool_registry()

    async def on_instruction(self, instruction: str) -> Optional[PluginResult]:
        # Use injected services
        if "remember" in instruction:
            # Store in memory
            await self.memory_manager.store_episodic_memory(
                user_message=instruction,
                assistant_reply="I'll remember that for you."
            )
        return None
```

## Plugin Management

### Configuration Management

**Location**: `backend/src/core/plugins/config_manager.py`

```python
class PluginConfigManager:
    """Manages plugin configuration persistence."""

    async def get_plugin_config(self, plugin_name: str) -> Dict[str, Any]:
        """Get configuration for a plugin."""

    async def set_plugin_config(self, plugin_name: str, config: Dict[str, Any]) -> bool:
        """Set configuration for a plugin."""

    async def reset_plugin_config(self, plugin_name: str) -> bool:
        """Reset plugin configuration to defaults."""
```

### State Management

**Location**: `backend/src/core/plugins/state_manager.py`

```python
class PluginStateManager:
    """Manages plugin state and persistence."""

    async def get_plugin_state(self, plugin_name: str) -> Dict[str, Any]:
        """Get persisted state for a plugin."""

    async def set_plugin_state(self, plugin_name: str, state: Dict[str, Any]) -> bool:
        """Set persisted state for a plugin."""

    async def clear_plugin_state(self, plugin_name: str) -> bool:
        """Clear persisted state for a plugin."""
```

### Plugin Discovery

Plugins can be automatically discovered from the filesystem:

```python
# plugins/my_plugin.py
from backend.src.agent.plugins.interface import AgentPlugin, PluginResult

class MyPlugin(AgentPlugin):
    name = "my_plugin"

    async def on_instruction(self, instruction: str) -> Optional[PluginResult]:
        # Plugin logic
        return None

# Auto-registration through naming convention
# Plugins are discovered by scanning plugin directories
```

## Built-in Plugins

### Computer Control Plugin

**Location**: `backend/src/agent/plugins/computer.py`

Provides computer control capabilities with screenshot and OCR integration:

```python
class ComputerControlPlugin:
    """Plugin for computer control operations."""

    async def on_tool_end(self, tool_name: str, result: Any) -> Optional[PluginResult]:
        """Process computer control tool results."""
        if tool_name.startswith("computer_") and result.get("success"):
            # Process screenshots for context
            if "screenshot" in result.get("data", {}):
                screenshot_data = result["data"]["screenshot"]
                # Extract text using OCR
                ocr_text = await self._extract_text_from_screenshot(screenshot_data)
                return PluginResult(
                    artifacts={"ocr_text": ocr_text}
                )
        return None
```

### OCR Plugin

**Location**: `backend/src/agent/plugins/ocr_plugin.py`

Provides OCR (Optical Character Recognition) capabilities:

```python
class OCRPlugin:
    """Plugin for OCR operations."""

    async def on_tool_end(self, tool_name: str, result: Any) -> Optional[PluginResult]:
        """Process OCR results."""
        if tool_name == "click_ocr" and result.get("success"):
            # Process OCR text
            ocr_text = result.get("data", {}).get("text", "")
            if ocr_text:
                # Store OCR results for context
                await self._store_ocr_context(ocr_text)
                return PluginResult(
                    content=f"OCR extracted: {ocr_text[:100]}...",
                    artifacts={"ocr_text": ocr_text}
                )
        return None
```

## Plugin Testing

### Unit Testing Plugins

```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from my_plugin import MyPlugin

class TestMyPlugin:
    """Test suite for MyPlugin."""

    @pytest.fixture
    def plugin(self):
        """Create plugin instance."""
        return MyPlugin()

    @pytest.fixture
    def mock_container(self):
        """Mock DI container."""
        container = MagicMock()
        container.logger.return_value = MagicMock()
        return container

    @pytest.mark.asyncio
    async def test_plugin_initialization(self, plugin, mock_container):
        """Test plugin initialization."""
        await plugin.initialize(mock_container)

        # Verify initialization
        assert plugin.container == mock_container
        assert plugin.logger is not None

    @pytest.mark.asyncio
    async def test_on_instruction_hook(self, plugin):
        """Test instruction processing."""
        result = await plugin.on_instruction("test instruction")

        # Verify hook behavior
        assert result is None  # or check specific result

    @pytest.mark.asyncio
    async def test_on_instruction_with_help(self, plugin):
        """Test help instruction processing."""
        result = await plugin.on_instruction("I need help")

        # Verify help response
        assert result is not None
        assert result.content is not None
        assert "help" in result.content.lower()
```

### Integration Testing

```python
@pytest.mark.asyncio
class TestPluginIntegration:
    """Integration tests for plugin system."""

    @pytest.fixture
    async def plugin_registry(self):
        """Create plugin registry for testing."""
        registry = PluginRegistry(use_config_manager=False)
        await registry.initialize()
        yield registry
        await registry.lifecycle_manager.shutdown_all_plugins()

    async def test_plugin_registration_and_execution(self, plugin_registry):
        """Test complete plugin lifecycle."""
        # Register plugin
        plugin = MyPlugin()
        success = plugin_registry.register(plugin, enabled=True)
        assert success

        # Initialize plugin
        init_success = await plugin_registry.lifecycle_manager.initialize_plugin(plugin)
        assert init_success

        # Test plugin hooks
        result = await plugin.on_instruction("test")
        assert result is not None

        # Shutdown plugin
        shutdown_success = await plugin_registry.lifecycle_manager.shutdown_plugin(plugin)
        assert shutdown_success
```

### Plugin Mocking

```python
@pytest.fixture
def mock_plugin():
    """Create mock plugin for testing."""
    plugin = MagicMock(spec=AgentPlugin)
    plugin.name = "mock_plugin"

    # Mock async methods
    plugin.initialize = AsyncMock()
    plugin.on_instruction = AsyncMock(return_value=None)
    plugin.on_llm_response = AsyncMock(return_value=None)
    plugin.on_tool_start = AsyncMock(return_value=None)
    plugin.on_tool_end = AsyncMock(return_value=None)

    return plugin
```

## Plugin Best Practices

### Design Principles

1. **Single Responsibility**: Each plugin should have one clear purpose
2. **Async First**: All plugin methods should be async
3. **Error Resilience**: Plugins should handle errors gracefully
4. **Configuration**: Use configuration for customizable behavior
5. **Documentation**: Document plugin purpose and configuration

### Performance Considerations

```python
class EfficientPlugin:
    """Plugin optimized for performance."""

    async def initialize(self, container: Any = None) -> None:
        # Cache expensive resources
        self.cache = container.cache()
        self.llm_client = container.llm_client()

    async def on_instruction(self, instruction: str) -> Optional[PluginResult]:
        # Use caching to avoid expensive operations
        cache_key = f"instruction:{hash(instruction)}"
        cached_result = await self.cache.get(cache_key)

        if cached_result:
            return cached_result

        # Expensive processing
        result = await self._process_instruction(instruction)

        # Cache result
        await self.cache.set(cache_key, result, ttl=300)
        return result
```

### Security Considerations

```python
class SecurePlugin:
    """Plugin with security considerations."""

    async def on_instruction(self, instruction: str) -> Optional[PluginResult]:
        # Validate input
        if not self._is_safe_instruction(instruction):
            await self.audit_security_event("unsafe_instruction", {
                "instruction": instruction,
                "user_id": self.user_id
            })
            return PluginResult(
                content="Instruction contains unsafe content.",
                stop_execution=True
            )

        return None

    async def on_tool_start(self, tool_name: str, args: Dict[str, Any]) -> Optional[PluginResult]:
        # Additional permission checks
        if not self._user_has_permission(tool_name):
            return PluginResult(
                content="Insufficient permissions for this tool.",
                stop_execution=True
            )

        return None

    def _is_safe_instruction(self, instruction: str) -> bool:
        """Check if instruction is safe to process."""
        dangerous_patterns = [
            r"rm\s+-rf\s+/",
            r"sudo\s+.*",
            r"eval\s+.*",
        ]

        for pattern in dangerous_patterns:
            if re.search(pattern, instruction, re.IGNORECASE):
                return False
        return True
```

### Error Handling

```python
class RobustPlugin:
    """Plugin with comprehensive error handling."""

    async def on_instruction(self, instruction: str) -> Optional[PluginResult]:
        try:
            # Plugin logic that might fail
            result = await self._process_instruction(instruction)
            return result

        except ValueError as e:
            # Handle validation errors
            self.logger.warning(f"Validation error in plugin: {e}")
            return PluginResult(
                content=f"I couldn't understand that instruction: {str(e)}",
                stop_execution=True
            )

        except Exception as e:
            # Handle unexpected errors
            self.logger.error(f"Unexpected error in plugin: {e}", exc_info=True)
            # Don't stop execution for unexpected errors
            return None

    async def initialize(self, container: Any = None) -> None:
        try:
            # Initialization logic
            self.container = container
            await self._setup_dependencies()

        except Exception as e:
            self.logger.error(f"Failed to initialize plugin: {e}")
            # Plugin remains in uninitialized state
            self.initialized = False
```

## Plugin Distribution and Marketplace

### Plugin Packaging

```python
# setup.py for plugin distribution
from setuptools import setup

setup(
    name="my-assistant-plugin",
    version="1.0.0",
    description="My custom assistant plugin",
    author="Plugin Author",
    packages=["my_plugin"],
    install_requires=[
        "backend>=1.0.0",
    ],
    entry_points={
        "assistant.plugins": [
            "my_plugin = my_plugin.plugin:MyPlugin",
        ]
    }
)
```

### Marketplace Integration

```json
{
  "name": "my_plugin",
  "version": "1.0.0",
  "description": "A useful plugin for the assistant",
  "author": "Plugin Author",
  "license": "MIT",
  "homepage": "https://github.com/author/my-plugin",
  "keywords": ["assistant", "plugin", "productivity"],
  "compatibility": {
    "min_version": "1.0.0",
    "max_version": "2.0.0"
  },
  "permissions": ["read_filesystem"],
  "config_schema": {
    "type": "object",
    "properties": {
      "enabled": {"type": "boolean", "default": true},
      "max_retries": {"type": "integer", "default": 3}
    }
  }
}
```

### Plugin Validation

```python
def validate_plugin(plugin: AgentPlugin) -> List[str]:
    """Validate plugin implementation."""
    errors = []

    # Check required attributes
    if not hasattr(plugin, 'name') or not plugin.name:
        errors.append("Plugin must have a non-empty name")

    # Check required methods
    required_methods = ['initialize', 'on_instruction', 'on_llm_response',
                       'on_tool_start', 'on_tool_end']

    for method in required_methods:
        if not hasattr(plugin, method):
            errors.append(f"Plugin must implement {method} method")

    # Check method signatures
    # Additional validation logic...

    return errors
```

This comprehensive plugin system documentation provides the foundation for understanding, developing, and managing plugins in the Personal Assistant Backend system.
