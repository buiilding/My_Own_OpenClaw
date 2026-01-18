# Development Guide

## Overview

This guide covers development patterns, best practices, and workflows for backend development.

## Development Setup

### Prerequisites

- Python 3.9+
- Virtual environment
- Dependencies installed

### Setup Steps

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

# Install dependencies
pip install -r requirements.txt

# Run backend
python -m backend.src.main
```

## Code Structure

### Module Organization

```
backend/src/
├── api/              # API routes and handlers
├── agent/            # Agent core logic
├── llm/              # LLM integration
├── tools/            # Tool system
├── services/         # Services (vision, etc.)
├── memory/           # Memory coordination
├── core/             # Core utilities
└── main.py           # Application entry point
```

### Naming Conventions

- **Files**: `snake_case.py`
- **Classes**: `PascalCase`
- **Functions**: `snake_case`
- **Constants**: `UPPER_SNAKE_CASE`

## Development Patterns

### 1. Dependency Injection

**Location**: `backend/src/core/container/`

Use dependency injection for component dependencies:

```python
from dependency_injector import containers, providers

class MyContainer(containers.DeclarativeContainer):
    config = providers.Configuration()
    my_service = providers.Singleton(MyService, config=config)
```

### 2. Protocol-Based Interfaces

**Location**: `backend/src/core/interfaces/`

Use Protocol for loose coupling:

```python
from typing import Protocol

class MyServiceInterface(Protocol):
    async def do_something(self) -> str: ...

class MyService:
    async def do_something(self) -> str:
        return "result"
```

### 3. Async/Await

All I/O operations use async/await:

```python
async def process_query(query: str) -> str:
    result = await llm_client.complete(query)
    return result
```

### 4. Error Handling

Use custom exceptions:

```python
from backend.src.core.exceptions import BaseAppError

class MyError(BaseAppError):
    pass

try:
    # operation
except Exception as e:
    raise MyError(f"Operation failed: {e}") from e
```

## Tool Development

### Adding a New Tool

1. **Define Schema**: Create Pydantic model for tool arguments
2. **Create Remote Tool**: Implement RemoteToolBase
3. **Register Tool**: Add to REMOTE_TOOLS dictionary
4. **Implement Frontend**: Implement tool execution on frontend

See [Tool System Documentation](./tools.md) for details.

## Testing

### Unit Tests

**Location**: `backend/tests/`

```python
import pytest
from backend.src.my_module import MyFunction

def test_my_function():
    result = MyFunction()
    assert result == expected
```

### Integration Tests

Test component integration:

```python
@pytest.mark.asyncio
async def test_tool_execution():
    # Test tool execution flow
    pass
```

## Logging

### Logging Configuration

**Location**: `backend/src/core/` (logging config)

```python
import logging

logger = logging.getLogger(__name__)

logger.info("Information message")
logger.error("Error message", exc_info=True)
```

### Log Levels

- **DEBUG**: Detailed debugging information
- **INFO**: General information
- **WARNING**: Warning messages
- **ERROR**: Error messages
- **CRITICAL**: Critical errors

## Code Quality

### Type Hints

Always use type hints:

```python
from typing import Optional, List

def process_items(items: List[str]) -> Optional[str]:
    # implementation
    pass
```

### Docstrings

Document all public functions and classes:

```python
def my_function(param: str) -> str:
    """
    Brief description.
    
    Args:
        param: Parameter description
        
    Returns:
        Return value description
    """
    pass
```

### Linting

Use `ruff` or `black` for code formatting:

```bash
ruff check .
black .
```

## Best Practices

1. **No Local Execution**: Never execute tools locally
2. **Async First**: Use async/await for all I/O
3. **Type Safety**: Use type hints and Pydantic
4. **Error Handling**: Use custom exceptions
5. **Logging**: Log important events
6. **Testing**: Write tests for new features
7. **Documentation**: Document public APIs

## Important Constraints

1. **No File Operations**: Backend never reads/writes files
2. **No Computer Control**: Backend never controls mouse/keyboard
3. **Tool Delegation**: All tools delegate to frontend
4. **Stateless**: Backend should be stateless where possible
5. **Streaming**: Use streaming for better UX

## Debugging

### Debug Mode

Run with debug logging:

```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

### Common Issues

1. **Import Errors**: Check Python path and virtual environment
2. **Type Errors**: Run type checker (mypy)
3. **Async Errors**: Ensure async/await used correctly
4. **Configuration**: Verify configuration file format

## Performance

1. **Caching**: Use cache for expensive operations
2. **Lazy Loading**: Load resources on demand
3. **Streaming**: Stream responses for better UX
4. **Connection Pooling**: Reuse connections where possible
