# Developer Guide

Welcome to the Personal Assistant Backend Developer Guide. This comprehensive guide will help you understand, extend, and contribute to the codebase.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Architecture Overview](#architecture-overview)
3. [Core Concepts](#core-concepts)
4. [Development Workflow](#development-workflow)
5. [Extension Points](#extension-points)
6. [Testing](#testing)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Prerequisites

- Python 3.9+
- pip or poetry
- Git
- IDE with Python support (VS Code, PyCharm, etc.)

### Setup

1. **Clone the repository:**
```bash
git clone <repository-url>
cd codebase
```

2. **Install dependencies:**
```bash
cd backend
pip install -r requirements.txt
```

3. **Set up environment variables:**
```bash
# Windows PowerShell
$env:OPENAI_API_KEY = "your-api-key"

# Linux/Mac
export OPENAI_API_KEY="your-api-key"
```

4. **Run the application:**
```bash
python -m backend.src.main
```

### Project Structure

```
backend/
├── src/
│   ├── agent/          # Agent domain (sessions, executor, plugins)
│   ├── api/            # API layer (routes, handlers, schema)
│   ├── core/           # Core infrastructure (DI, config, events)
│   ├── llm/            # LLM domain (client, parser, prompts)
│   ├── memory/         # Memory domain (storage, retrieval, embeddings)
│   ├── sdk/            # SDK for tool development
│   └── tools/          # Tools domain (registry, loader, discovery)
├── docs/               # Documentation
├── tests/              # Test suite
└── requirements.txt    # Dependencies
```

---

## Architecture Overview

The Personal Assistant follows a **layered architecture** with clear separation of concerns:

### Layer Structure

```
┌─────────────────────────────────────┐
│         API Layer (FastAPI)         │  ← WebSocket, HTTP endpoints
├─────────────────────────────────────┤
│         Agent Domain                │  ← Session management, execution
├─────────────────────────────────────┤
│    LLM / Tools / Memory Domains     │  ← Core capabilities
├─────────────────────────────────────┤
│      Core Infrastructure            │  ← DI, Config, Events, Interfaces
└─────────────────────────────────────┘
```

### Key Architectural Patterns

1. **Dependency Injection**: All components wired via DI container
2. **Event-Driven**: Decoupled communication via event bus
3. **Protocol-Based**: Interfaces define contracts (not implementations)
4. **Strategy Pattern**: Pluggable strategies for tool execution, discovery
5. **Registry Pattern**: Centralized registration for plugins, tools, handlers

### Data Flow

```
User Query
    ↓
WebSocket Handler
    ↓
Agent Session
    ↓
Agent Executor
    ├─→ Memory Manager (retrieve context)
    ├─→ Prompt Constructor (build prompt)
    ├─→ LLM Client (get completion)
    ├─→ Response Parser (extract tool calls)
    └─→ Tool Orchestrator (execute tools)
         └─→ Tool Registry (get tool)
              └─→ Tool.run() (execute)
```

---

## Core Concepts

### 1. Dependency Injection

All major components are provided via the DI container (`ApplicationContainer`):

```python
from backend.src.core.container import ApplicationContainer

container = ApplicationContainer()
container.config.override(mock_config)
tool_registry = container.tool_registry()
```

**Benefits:**
- Loose coupling
- Easy testing (mock dependencies)
- Single source of truth
- Lifecycle management

### 2. Event System

Components communicate via events:

```python
from backend.src.core.bus import message_bus
from backend.src.core.events import ToolExecuted

# Subscribe
async def handle_tool(event: ToolExecuted):
    print(f"Tool {event.tool_name} executed")

message_bus.subscribe(ToolExecuted, handle_tool)

# Publish
await message_bus.publish(ToolExecuted(...))
```

### 3. Tool System

Tools extend agent capabilities:

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

### 4. Plugin System

Plugins intercept agent execution:

```python
from backend.src.agent.plugins.interface import AgentPlugin

class MyPlugin:
    name = "my_plugin"
    
    async def on_instruction(self, instruction: str):
        # Modify instruction before processing
        return None
    
    async def on_tool_end(self, tool_name: str, result: Any):
        # Process tool results
        return PluginResult(artifacts={"data": "value"})
```

### 5. Configuration Management

Centralized configuration with change notifications:

```python
from backend.src.core.config_service import ConfigurationService

config_service = ConfigurationService(config_manager)

# Subscribe to changes
class MySubscriber(ConfigSubscriber):
    async def on_config_changed(self, old_config, new_config):
        # React to config changes
        pass

config_service.subscribe(MySubscriber())
```

---

## Development Workflow

### 1. Creating a New Tool

See [Tool Development Guide](./tool_development.md) for detailed instructions.

**Quick Steps:**
1. Create tool class inheriting from `Tool[ArgsModel]`
2. Define Pydantic args model
3. Implement `run()` method
4. Register in `CORE_TOOLS` or create marketplace tool

### 2. Creating a Plugin

See [Extension Points Guide](./extension_points.md) for details.

**Quick Steps:**
1. Implement `AgentPlugin` protocol
2. Register with `plugin_registry`
3. Implement lifecycle methods if needed

### 3. Adding a New Message Handler

1. Create handler class inheriting from `BaseMessageHandler`
2. Implement `handle()` method
3. Register in `MessageHandlerRegistry`

```python
from backend.src.api.handlers.base import BaseMessageHandler

class MyHandler(BaseMessageHandler):
    def __init__(self):
        super().__init__("my-message-type")
    
    async def handle(self, data, websocket, session_manager, user_id, config_service):
        # Handle message
        pass

# Register
registry.register("my-message-type", MyHandler())
```

### 4. Adding a New Tool Discovery Source

1. Create discoverer class inheriting from `ToolDiscoverer`
2. Implement `discover()` method
3. Register with `ToolDiscoveryService`

```python
from backend.src.tools.discovery.base import ToolDiscoverer

class MyDiscoverer(ToolDiscoverer):
    async def discover(self) -> List[DiscoveredTool]:
        # Discover tools
        return []
    
    def get_source_name(self) -> str:
        return "my_source"

# Register
discovery_service.register_discoverer(MyDiscoverer())
```

---

## Extension Points

The system provides multiple extension points:

1. **Tools**: Extend agent capabilities
2. **Plugins**: Intercept execution flow
3. **Event Handlers**: React to system events
4. **Message Handlers**: Handle custom WebSocket messages
5. **Tool Discoverers**: Add new tool discovery sources
6. **Execution Strategies**: Customize tool execution pipeline
7. **Memory Stores**: Custom storage backends
8. **Embedding Providers**: Custom embedding models

See [Extension Points Catalog](./EXTENSION_POINTS_CATALOG.md) for complete details.

---

## Testing

### Running Tests

```bash
# All tests
pytest

# Specific test file
pytest tests/backend/test_tool_registry.py

# With coverage
pytest --cov=backend.src --cov-report=html
```

### Writing Tests

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

@pytest.mark.asyncio
async def test_my_component():
    # Arrange
    mock_dependency = AsyncMock()
    component = MyComponent(mock_dependency)
    
    # Act
    result = await component.do_something()
    
    # Assert
    assert result == expected_value
    mock_dependency.method.assert_called_once()
```

### Test Fixtures

Common fixtures are available in `tests/conftest.py`:
- `mock_app_config`: Mock application configuration
- `mock_config_service`: Mock configuration service
- `mock_llm_client`: Mock LLM client
- `mock_tool_registry`: Mock tool registry
- `mock_session_manager`: Mock session manager

---

## Best Practices

### 1. Code Organization

- **Single Responsibility**: Each class/function has one clear purpose
- **Separation of Concerns**: Domain logic separate from infrastructure
- **DRY**: Don't repeat yourself - extract common logic
- **Clear Naming**: Use descriptive names for classes, functions, variables

### 2. Type Safety

- Use type hints everywhere
- Use `Protocol` for interfaces
- Use `TypeVar` for generic types
- Run `mypy` regularly

### 3. Error Handling

- Use custom exceptions from `backend.src.core.exceptions`
- Provide clear error messages
- Log errors with context
- Handle errors at appropriate levels

### 4. Async Programming

- Use `async`/`await` for I/O operations
- Don't block the event loop
- Use `asyncio.gather()` for concurrent operations
- Handle async context managers properly

### 5. Documentation

- Document public APIs
- Use docstrings (Google style)
- Include examples in docstrings
- Keep README files updated

### 6. Testing

- Write tests for new features
- Aim for >80% coverage
- Test edge cases
- Use fixtures for common setup
- Mock external dependencies

---

## Troubleshooting

### Common Issues

#### Import Errors

**Problem**: `ModuleNotFoundError` or import errors

**Solution**:
```bash
# Ensure PYTHONPATH includes project root
export PYTHONPATH="${PYTHONPATH}:$(pwd)"
# Or run from project root
python -m backend.src.main
```

#### Configuration Not Loading

**Problem**: Config file not found or not loading

**Solution**:
- Check config file location (see `backend/src/core/config.py`)
- Verify file permissions
- Check YAML syntax
- Review logs for specific errors

#### Tool Not Registering

**Problem**: Tool not appearing in available tools

**Solution**:
- Verify tool inherits from `Tool[ArgsModel]`
- Check tool is in `CORE_TOOLS` or marketplace directory
- Review tool loader logs
- Verify tool name is unique

#### Plugin Not Executing

**Problem**: Plugin hooks not being called

**Solution**:
- Verify plugin is registered with `plugin_registry`
- Check plugin is enabled
- Verify plugin implements correct methods
- Review plugin priority (lower = higher priority)

#### Memory Not Storing

**Problem**: Memories not being stored or retrieved

**Solution**:
- Check memory is enabled in config
- Verify database file exists and is writable
- Check embedding model is loading correctly
- Review memory manager logs

---

## Additional Resources

- [Architecture Documentation](./architecture.md)
- [Tool Development Guide](./tool_development.md)
- [Extension Points Guide](./extension_points.md)
- [API Reference](./api_reference.md)
- [Architecture Decision Records](./adr/)

---

## Contributing

When contributing:

1. **Follow code style**: Use `black` and `isort`
2. **Write tests**: New features need tests
3. **Update docs**: Update relevant documentation
4. **Add ADRs**: Document architectural decisions
5. **Review checklist**: Check all items before PR

---

## Getting Help

- **Documentation**: Check `backend/docs/`
- **Code Examples**: See `backend/src/tools/` for tool examples
- **Issues**: Open an issue on GitHub
- **Discussions**: Use GitHub Discussions

---

*Last updated: [Current Date]*

