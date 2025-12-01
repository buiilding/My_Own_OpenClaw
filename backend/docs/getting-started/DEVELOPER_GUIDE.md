# Developer Guide

This comprehensive guide provides everything developers need to work effectively with the Personal Assistant Backend codebase. From initial setup to advanced development patterns, this guide covers the development workflow, coding standards, testing strategies, and deployment procedures.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Environment](#development-environment)
- [Project Structure](#project-structure)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Strategy](#testing-strategy)
- [Debugging Techniques](#debugging-techniques)
- [Performance Optimization](#performance-optimization)
- [Security Considerations](#security-considerations)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Prerequisites

Ensure you have the following installed:

- **Python 3.9+**: The project requires Python 3.9 or higher
- **Git**: For version control
- **Virtual Environment**: venv or conda for dependency management
- **Code Editor**: VS Code, PyCharm, or your preferred editor with Python support

### Initial Setup

1. **Clone the Repository**
```bash
git clone <repository-url>
cd personal-assistant
```

2. **Set Up Virtual Environment**
```bash
# Using venv
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux
```

3. **Install Dependencies**
```bash
pip install -r backend/requirements.txt
```

4. **Set Up Environment Variables**
```powershell
# Windows PowerShell
$env:OPENAI_API_KEY = "your-openai-api-key"
$env:ANTHROPIC_API_KEY = "your-anthropic-api-key"
```

5. **Verify Installation**
```bash
cd backend
python -c "import backend.src.main; print('Installation successful')"
```

### First Run

```bash
cd backend
python -m backend.src.main
```

The application will:
- Create default configuration files
- Initialize the database
- Start the WebSocket server on port 8765
- Display startup logs

## Development Environment

### Recommended Tools

- **Editor**: VS Code with Python extension
- **Linting**: mypy for type checking, flake8 for style
- **Testing**: pytest with coverage reporting
- **Version Control**: Git with conventional commits
- **Documentation**: MkDocs for building docs

### VS Code Configuration

Create `.vscode/settings.json`:

```json
{
  "python.defaultInterpreterPath": "./venv",
  "python.linting.enabled": true,
  "python.linting.mypyEnabled": true,
  "python.linting.flake8Enabled": true,
  "python.formatting.provider": "black",
  "python.testing.pytestEnabled": true,
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.organizeImports": true
  }
}
```

### Environment Variables

Create `.env` file in the backend directory:

```bash
# API Keys
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key

# Development Settings
LOG_LEVEL=DEBUG
ENABLE_HOT_RELOAD=true

# Database
DATABASE_URL=sqlite:///assistant.db

# Server
HOST=0.0.0.0
PORT=8765
```

## Project Structure

### Backend Architecture

```
backend/
├── src/                          # Main source code
│   ├── agent/                   # Agent system
│   │   ├── core.py             # Agent session management
│   │   ├── executor.py         # Query execution
│   │   ├── plugins/            # Agent plugins
│   │   └── state.py            # Conversation state
│   ├── api/                     # REST/WebSocket API
│   │   ├── routes/             # Route definitions
│   │   ├── handlers/           # Message handlers
│   │   ├── deps.py             # Dependencies
│   │   └── schema.py           # Pydantic schemas
│   ├── core/                    # Core infrastructure
│   │   ├── container/          # DI container
│   │   ├── config.py           # Configuration
│   │   ├── events.py           # Event system
│   │   ├── bus.py              # Message bus
│   │   └── interfaces/         # Protocol interfaces
│   ├── tools/                   # Tool system
│   │   ├── registry.py         # Tool registration
│   │   ├── orchestrator.py     # Tool execution
│   │   ├── loader.py           # Dynamic loading
│   │   └── [categories]/       # Tool implementations
│   ├── memory/                  # Memory system
│   │   ├── memory_manager.py   # Memory operations
│   │   ├── embeddings.py       # Text embeddings
│   │   └── storage/            # Storage backends
│   ├── llm/                     # LLM integration
│   │   ├── llm_client.py       # LLM client
│   │   ├── providers/          # Provider implementations
│   │   └── prompts.py          # Prompt templates
│   └── sdk/                     # Tool development SDK
│       ├── tool.py             # Tool base class
│       ├── context.py          # Execution context
│       └── errors.py           # SDK exceptions
├── docs/                        # Documentation
├── tests/                       # Test suite
└── requirements.txt            # Python dependencies
```

### Key Design Patterns

#### Dependency Injection

The project uses `dependency-injector` for clean architecture:

```python
# Container definition
class ApplicationContainer(containers.DeclarativeContainer):
    config = providers.Singleton(AppConfig)
    llm_client = providers.Singleton(LLMClient, config=config)

# Usage
container = ApplicationContainer()
client = container.llm_client()
```

#### Protocol Interfaces

Clean interfaces using Python protocols:

```python
@runtime_checkable
class LLMClientInterface(Protocol):
    async def generate_response(self, messages: List[Dict]) -> Dict:
        ...
```

#### Async/Await Everywhere

All I/O operations use async/await:

```python
async def process_query(self, query: str) -> AsyncGenerator[Dict, None]:
    async for chunk in self.llm_client.generate_stream(messages):
        yield chunk
```

## Development Workflow

### Branching Strategy

```bash
# Create feature branch
git checkout -b feature/my-feature

# Make changes with conventional commits
git commit -m "feat: add new tool capability"

# Push and create PR
git push origin feature/my-feature
```

### Commit Convention

Follow conventional commits:

```bash
# Features
git commit -m "feat: add user authentication"

# Bug fixes
git commit -m "fix: resolve memory leak in tool execution"

# Documentation
git commit -m "docs: update API reference"

# Refactoring
git commit -m "refactor: simplify agent executor logic"
```

### Code Review Process

1. **Create PR**: Push branch and create pull request
2. **Automated Checks**: CI runs tests, linting, type checking
3. **Peer Review**: At least one reviewer approves
4. **Merge**: Squash merge with descriptive commit message

### Pre-commit Hooks

Set up pre-commit hooks for quality checks:

```bash
pip install pre-commit
pre-commit install

# Run manually
pre-commit run --all-files
```

## Coding Standards

### Python Style Guide

Follow PEP 8 with these additions:

```python
# Use type hints everywhere
def process_data(data: Dict[str, Any]) -> Optional[str]:
    pass

# Use dataclasses for data objects
@dataclass
class UserContext:
    user_id: str
    permissions: List[str] = field(default_factory=list)

# Use async context managers
async def execute_tool(self, tool: Tool, args: Dict) -> Any:
    async with self.get_executor() as executor:
        return await executor.run(tool, args)
```

### Naming Conventions

```python
# Classes: PascalCase
class ToolRegistry:
    pass

# Functions/methods: snake_case
def register_tool(self, tool: Tool) -> None:
    pass

# Constants: UPPER_CASE
MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30

# Private members: leading underscore
def _validate_config(self, config: Dict) -> bool:
    pass
```

### Import Organization

```python
# Standard library
import asyncio
import logging
from typing import Dict, List, Optional

# Third-party packages
from fastapi import WebSocket
import pydantic

# Local imports
from backend.src.core.config import AppConfig
from backend.src.tools.registry import ToolRegistry

# Relative imports (within package)
from .interfaces import ToolInterface
from ..core.events import Event
```

### Error Handling

```python
class ToolExecutionError(Exception):
    """Raised when tool execution fails."""
    pass

async def execute_tool(self, tool: Tool, args: Dict) -> Any:
    try:
        result = await tool.run(args, self.context)
        return result
    except ValidationError as e:
        logger.error(f"Validation error in {tool.name}: {e}")
        raise ToolExecutionError(f"Invalid arguments: {e}") from e
    except PermissionError as e:
        logger.warning(f"Permission denied for {tool.name}: {e}")
        raise ToolExecutionError(f"Permission denied: {e}") from e
    except Exception as e:
        logger.error(f"Unexpected error in {tool.name}: {e}", exc_info=True)
        raise ToolExecutionError(f"Tool execution failed: {e}") from e
```

### Logging Standards

```python
import logging

logger = logging.getLogger(__name__)

class MyClass:
    def __init__(self):
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")

    async def my_method(self, param: str) -> None:
        self.logger.debug(f"Starting my_method with param: {param}")

        try:
            # Do work
            result = await self.do_work(param)
            self.logger.info(f"my_method completed successfully for {param}")
            return result
        except Exception as e:
            self.logger.error(f"my_method failed for {param}: {e}", exc_info=True)
            raise
```

## Testing Strategy

### Test Structure

```
tests/
├── backend/
│   ├── unit/                    # Unit tests
│   ├── integration/            # Integration tests
│   ├── e2e/                    # End-to-end tests
│   └── fixtures/               # Test fixtures
├── frontend/                   # Frontend tests
└── conftest.py                # Pytest configuration
```

### Unit Testing

```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from backend.src.tools.registry import ToolRegistry

class TestToolRegistry:
    @pytest.fixture
    def registry(self):
        return ToolRegistry(config=MagicMock())

    @pytest.fixture
    def mock_tool(self):
        tool = MagicMock()
        tool.name = "test_tool"
        tool.get_json_schema.return_value = {"name": "test_tool"}
        return tool

    def test_register_tool(self, registry, mock_tool):
        """Test tool registration."""
        registry.register_tool(mock_tool)

        assert mock_tool.name in registry.tools
        assert registry.tools[mock_tool.name] is mock_tool

    @pytest.mark.asyncio
    async def test_execute_tool(self, registry, mock_tool):
        """Test tool execution."""
        mock_tool.run = AsyncMock(return_value={"success": True})

        registry.register_tool(mock_tool)
        result = await registry.execute_tool("test_tool", {})

        assert result["success"] is True
        mock_tool.run.assert_called_once()
```

### Integration Testing

```python
import pytest
from backend.src.core.container import Container

@pytest.mark.asyncio
class TestAgentIntegration:
    async def test_full_query_flow(self):
        """Test complete query processing flow."""
        container = Container()
        await container.initialize()

        agent = container.create_agent_session("test_user")

        responses = []
        async for response in agent.process_query("Hello"):
            responses.append(response)

        assert len(responses) > 0
        assert any(r.get("type") == "streaming-complete" for r in responses)
```

### Mock Strategy

```python
from unittest.mock import AsyncMock, MagicMock, patch

@pytest.fixture
def mock_llm_client():
    """Mock LLM client for testing."""
    client = MagicMock()
    client.generate_stream = AsyncMock(return_value=async_generator([
        {"content": "Hello", "finish_reason": None},
        {"content": " world!", "finish_reason": "stop"}
    ]))
    return client

def async_generator(items):
    """Helper to create async generators."""
    async def gen():
        for item in items:
            yield item
    return gen()
```

### Test Coverage

Aim for high test coverage:

```bash
# Run tests with coverage
pytest --cov=backend/src --cov-report=html --cov-report=term

# Generate coverage report
coverage html
```

### Property-Based Testing

```python
from hypothesis import given, strategies as st

class TestToolValidation:
    @given(st.text(min_size=1, max_size=1000))
    def test_query_validation(self, query: str):
        """Test query validation with various inputs."""
        try:
            validated = validate_query_text(query)
            assert isinstance(validated, str)
            assert len(validated) <= MAX_QUERY_LENGTH
        except ValidationError:
            # Invalid queries should raise ValidationError
            pass
```

## Debugging Techniques

### Logging Configuration

```python
# logging.conf
[loggers]
keys=root,assistant

[handlers]
keys=consoleHandler,fileHandler

[formatters]
keys=simpleFormatter

[logger_assistant]
level=DEBUG
handlers=consoleHandler,fileHandler
qualname=backend
propagate=0

[handler_consoleHandler]
class=StreamHandler
level=DEBUG
formatter=simpleFormatter
args=(sys.stdout,)

[handler_fileHandler]
class=FileHandler
level=DEBUG
formatter=simpleFormatter
args=('assistant.log', 'a')
```

### Debug Mode

```python
# Enable debug mode
import logging
logging.basicConfig(level=logging.DEBUG)

# Add debug prints
def debug_function(self, param):
    print(f"DEBUG: Entering function with param={param}")
    import pdb; pdb.set_trace()  # Drop into debugger
    result = self.process(param)
    print(f"DEBUG: Function result={result}")
    return result
```

### WebSocket Debugging

```python
# Debug WebSocket messages
async def debug_websocket_handler(websocket: WebSocket, data: Dict):
    logger.debug(f"Received message: {json.dumps(data, indent=2)}")

    # Add to message handler registry
    registry.add_middleware(debug_websocket_handler)
```

### Memory Debugging

```python
import tracemalloc

# Start tracing
tracemalloc.start()

# Your code here
result = await process_large_dataset()

# Check memory usage
current, peak = tracemalloc.get_traced_memory()
print(f"Current memory usage: {current / 1024 / 1024:.1f} MB")
print(f"Peak memory usage: {peak / 1024 / 1024:.1f} MB")

# Get traceback of allocations
stats = tracemalloc.take_snapshot().statistics('lineno')
for stat in stats[:10]:
    print(stat)
```

### Profiling

```python
import cProfile
import pstats

def profile_function():
    profiler = cProfile.Profile()
    profiler.enable()

    # Code to profile
    asyncio.run(main())

    profiler.disable()
    stats = pstats.Stats(profiler).sort_stats('cumulative')
    stats.print_stats(20)  # Top 20 functions

profile_function()
```

## Performance Optimization

### Async Best Practices

```python
# Don't block the event loop
async def bad_example():
    # DON'T DO THIS - blocks event loop
    time.sleep(1)
    return "done"

async def good_example():
    # DO THIS - proper async
    await asyncio.sleep(1)
    return "done"

# Use asyncio.gather for concurrent operations
async def concurrent_example():
    results = await asyncio.gather(
        task1(),
        task2(),
        task3()
    )
    return results
```

### Caching Strategy

The system provides multiple caching layers for optimal performance. See **[Caching System Documentation](caching_system.md)** for complete details.

**Built-in Caches**:
- **Embedding Cache**: Automatic caching of text embeddings (up to 90% API reduction)
- **Schema Cache**: Tool JSON schema caching with auto-invalidation
- **Query Cache**: Memory retrieval query result caching

**Usage Examples**:

```python
from functools import lru_cache
from backend.src.core.cache import cache_manager

class ToolRegistry:
    @lru_cache(maxsize=128)
    def get_tool_schema(self, tool_name: str) -> Dict:
        """Cache tool schemas (fallback to functools)."""
        return self.tools[tool_name].get_json_schema()

    async def get_expensive_data(self, key: str) -> Any:
        """Use global cache manager for complex caching."""
        cache_key = f"expensive_data:{key}"
        cached = cache_manager.get(cache_key)
        if cached is not None:
            return cached

        result = await self.fetch_from_api(key)
        cache_manager.set(cache_key, result, ttl=300)  # 5 minutes
        return result
```

**Cache Best Practices**:
- Use descriptive cache keys with namespaces
- Set appropriate TTL based on data freshness requirements
- Monitor cache hit rates and adjust strategies as needed
- Consider cache size limits for memory-constrained environments

### Database Optimization

```python
# Use connection pooling
class DatabaseManager:
    def __init__(self):
        self.pool = await asyncpg.create_pool(
            min_size=5,
            max_size=20,
            database='assistant'
        )

    async def execute_query(self, query: str, params: tuple = None):
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *params)

# Use efficient queries
async def get_recent_memories(self, user_id: str, limit: int = 10):
    query = """
    SELECT * FROM memories
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
    """
    return await self.db.execute_query(query, (user_id, limit))
```

### Memory Management

```python
# Use weak references for caches
import weakref

class CacheManager:
    def __init__(self):
        self._cache = weakref.WeakValueDictionary()

    def get(self, key: str) -> Optional[Any]:
        return self._cache.get(key)

    def set(self, key: str, value: Any) -> None:
        self._cache[key] = value

# Clean up large objects
async def process_large_file(self, file_path: str):
    async with aiofiles.open(file_path, 'r') as f:
        async for line in f:
            # Process line by line to avoid loading entire file
            await self.process_line(line)
```

## Security Considerations

### Input Validation

```python
from pydantic import BaseModel, validator, Field
import re

class SecureToolArgs(BaseModel):
    file_path: str = Field(..., min_length=1, max_length=4096)

    @validator('file_path')
    def validate_file_path(cls, v):
        # Prevent path traversal
        if '..' in v or not v.startswith('/safe/'):
            raise ValueError('Invalid file path')

        # Prevent dangerous characters
        if re.search(r'[<>:"|?*]', v):
            raise ValueError('Invalid characters in path')

        return v

class QueryArgs(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)

    @validator('text')
    def validate_query(cls, v):
        # Prevent code injection
        if any(keyword in v.lower() for keyword in ['import', 'exec', 'eval']):
            raise ValueError('Query contains dangerous keywords')
        return v
```

### Authentication & Authorization

```python
class SecurityManager:
    def __init__(self, config: AppConfig):
        self.config = config
        self.rate_limiter = RateLimiter()

    async def authenticate_user(self, token: str) -> Optional[User]:
        """Authenticate user from token."""
        # Verify JWT token
        try:
            payload = jwt.decode(token, self.config.secret_key)
            return User.from_dict(payload)
        except jwt.ExpiredSignatureError:
            return None

    def authorize_tool(self, user: User, tool: Tool) -> bool:
        """Check if user can use tool."""
        required_perms = getattr(tool, 'required_permissions', [])
        return all(perm in user.permissions for perm in required_perms)

    async def check_rate_limit(self, user_id: str, action: str) -> bool:
        """Check rate limits."""
        return await self.rate_limiter.check_limit(user_id, action)
```

### Secure Configuration

```python
# config.py
class SecureConfig(AppConfig):
    secret_key: str = Field(..., min_length=32)
    api_keys: Dict[str, str] = Field(default_factory=dict, exclude=True)

    @validator('secret_key')
    def validate_secret_key(cls, v):
        if len(v) < 32:
            raise ValueError('Secret key must be at least 32 characters')
        return v

    class Config:
        # Never log sensitive fields
        sensitive_fields = {'api_keys', 'secret_key'}
```

### Safe File Operations

```python
class SecureFileService:
    async def safe_read_file(self, path: str, user: User) -> Optional[str]:
        """Safely read file with permission checks."""

        # Validate path
        if not self.is_safe_path(path):
            raise PermissionError("Unsafe file path")

        # Check user permissions
        if not user.can_access_file(path):
            raise PermissionError("Access denied")

        # Check file size
        if await self.get_file_size(path) > self.max_file_size:
            raise ValueError("File too large")

        # Read with timeout
        async with asyncio.timeout(10):
            async with aiofiles.open(path, 'r', encoding='utf-8') as f:
                return await f.read()

    def is_safe_path(self, path: str) -> bool:
        """Check if path is safe."""
        normalized = os.path.normpath(path)
        return not normalized.startswith('..') and '\\' not in normalized
```

## Deployment

### Development Deployment

```bash
# Run with auto-reload
cd backend
uvicorn backend.src.main:app --host 0.0.0.0 --port 8765 --reload

# Or using the module
python -m backend.src.main
```

### Production Deployment

```bash
# Using uvicorn with production settings
uvicorn backend.src.main:app \
    --host 0.0.0.0 \
    --port 8765 \
    --workers 4 \
    --log-level info \
    --access-log

# Using gunicorn
gunicorn backend.src.main:app \
    -w 4 \
    -k uvicorn.workers.UvicornWorker \
    --bind 0.0.0.0:8765
```

### Docker Deployment

```dockerfile
# Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8765

CMD ["uvicorn", "backend.src.main:app", "--host", "0.0.0.0", "--port", "8765"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  assistant:
    build: .
    ports:
      - "8765:8765"
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - ./data:/app/data
    restart: unless-stopped
```

### Environment Configuration

```bash
# Production environment variables
export ENVIRONMENT=production
export LOG_LEVEL=WARNING
export DATABASE_URL=postgresql://user:pass@host:5432/db
export REDIS_URL=redis://host:6379
export METRICS_ENABLED=true
```

## Troubleshooting

### Common Issues

#### Import Errors

```bash
# Fix Python path
export PYTHONPATH=$PWD:$PYTHONPATH

# Or run with module
python -m backend.src.main
```

#### Database Issues

```bash
# Reset database
rm -f ~/.config/DesktopAssistant/assistant.db

# Restart application to recreate
```

#### Memory Issues

```python
# Check memory usage
import psutil
process = psutil.Process()
print(f"Memory usage: {process.memory_info().rss / 1024 / 1024:.1f} MB")
```

#### WebSocket Connection Issues

```javascript
// Test WebSocket connection
const ws = new WebSocket('ws://localhost:8765/ws');

ws.onopen = () => {
  console.log('Connected');
  ws.send(JSON.stringify({
    type: 'handshake',
    user_id: 'test'
  }));
};

ws.onmessage = (event) => {
  console.log('Received:', event.data);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};
```

### Debug Commands

```bash
# Check running processes
ps aux | grep python

# Check open ports
netstat -tlnp | grep 8765

# Check logs
tail -f assistant.log

# Check database
sqlite3 ~/.config/DesktopAssistant/assistant.db "SELECT COUNT(*) FROM memories;"
```

### Performance Monitoring

```python
# Add monitoring to your code
from backend.src.core.metrics import metrics

@metrics.timed('tool_execution')
async def execute_tool(self, tool: Tool, args: Dict) -> Any:
    start_time = time.time()
    result = await tool.run(args, self.context)
    execution_time = time.time() - start_time

    metrics.histogram('tool.execution_time', execution_time, tags={
        'tool': tool.name
    })

    return result
```

### Health Checks

```python
# Add health check endpoint
from fastapi import APIRouter

router = APIRouter()

@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0"
    }

@router.get("/ready")
async def readiness_check():
    """Readiness check endpoint."""
    # Check database connection
    # Check LLM provider availability
    # Check tool registry health
    return {"status": "ready"}
```

This developer guide provides the foundation for effective development on the Personal Assistant Backend. Follow these practices to maintain code quality, ensure security, and deliver reliable features.
