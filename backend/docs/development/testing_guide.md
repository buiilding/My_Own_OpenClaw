# Testing Guide

This comprehensive guide covers the testing strategy, patterns, and best practices for the Personal Assistant Backend. It includes unit testing, integration testing, end-to-end testing, and testing infrastructure.

## Overview

The testing strategy follows a pyramid approach with multiple layers of testing:

- **Unit Tests**: Test individual components in isolation
- **Integration Tests**: Test component interactions
- **End-to-End Tests**: Test complete user workflows
- **Performance Tests**: Validate system performance under load

## Testing Infrastructure

### Dependencies

```txt
# requirements.txt (current)
pytest==8.1.1
pytest-asyncio==0.23.6
```

**Note**: Additional testing dependencies (pytest-cov, pytest-mock, pytest-xdist) may be needed for full testing infrastructure but are not currently included in requirements.txt.

### Configuration

No pytest.ini configuration file currently exists. Testing is configured via command line options or can be added to pyproject.toml in the future.

### Test Structure

```
tests/
├── backend/                   # Backend tests
│   └── test_*.py             # Individual test files
│       # Tests are organized by functionality rather than unit/integration/e2e
│       # Each test file focuses on testing a specific tool or component pipeline
└── frontend/                  # Frontend tests
    ├── __mocks__/            # Test mocks
    ├── *.spec.jsx           # Component tests
    └── *.js                 # Test utilities
```

**Note**: The current test structure focuses on tool pipeline testing rather than traditional unit/integration separation. Each test file validates the end-to-end functionality of a specific tool or component.

## Unit Testing

### Basic Unit Test Structure

```python
import pytest
from unittest.mock import AsyncMock, MagicMock
from backend.src.my_module import MyClass

class TestMyClass:
    """Test suite for MyClass."""

    @pytest.fixture
    def my_instance(self):
        """Create test instance."""
        return MyClass(config=MagicMock())

    def test_some_method(self, my_instance):
        """Test some method."""
        result = my_instance.some_method("test_input")
        assert result is not None
        assert isinstance(result, str)

    @pytest.mark.asyncio
    async def test_async_method(self, my_instance):
        """Test async method."""
        result = await my_instance.async_method("test_input")
        assert result["success"] is True
```

### Async Testing Patterns

```python
import pytest
from unittest.mock import AsyncMock

@pytest.mark.asyncio
class TestAsyncComponent:
    async def test_async_operation(self):
        """Test async operations."""
        # Mock async dependencies
        mock_service = AsyncMock()
        mock_service.process.return_value = {"result": "success"}

        component = MyComponent(service=mock_service)
        result = await component.process_data("input")

        assert result["result"] == "success"
        mock_service.process.assert_called_once_with("input")

    async def test_async_with_timeout(self):
        """Test async operations with timeout."""
        import asyncio

        component = MyComponent()

        with pytest.raises(asyncio.TimeoutError):
            await asyncio.wait_for(
                component.long_running_operation(),
                timeout=0.1
            )
```

### Mocking Strategies

#### Service Mocking

```python
@pytest.fixture
def mock_llm_client():
    """Mock LLM client for testing."""
    client = AsyncMock()
    client.generate_response.return_value = {
        "content": "Mock response",
        "finish_reason": "stop"
    }
    client.generate_stream.return_value = async_generator([
        {"content": "Mock", "finish_reason": None},
        {"content": " response", "finish_reason": "stop"}
    ])
    return client

def async_generator(items):
    """Helper for creating async generators."""
    async def gen():
        for item in items:
            yield item
    return gen()
```

#### Container Mocking

```python
@pytest.fixture
def test_container():
    """Test container with mocked dependencies."""
    from backend.src.core.container import ApplicationContainer

    container = ApplicationContainer()

    # Override with mocks
    container.core.llm_client.override(mock_llm_client())
    container.tools.tool_registry.override(MagicMock())

    return container
```

#### Context Mocking

```python
@pytest.fixture
def mock_context():
    """Mock execution context."""
    from backend.src.sdk.context import Context, UserContext, SessionContext

    return Context(
        user=UserContext(user_id="test_user", permissions=["read_filesystem"]),
        session=SessionContext(session_id="test_session", created_at=1234567890),
        runtime=MagicMock()
    )
```

## Integration Testing

### Container-Based Testing

```python
@pytest.mark.asyncio
class TestToolIntegration:
    """Integration tests for tool system."""

    @pytest.fixture
    async def container(self):
        """Real container for integration testing."""
        from backend.src.core.container import ApplicationContainer

        container = ApplicationContainer()
        await container.initialize()
        yield container
        await container.shutdown()

    async def test_tool_execution_flow(self, container):
        """Test complete tool execution flow."""
        # Get real components
        tool_registry = container.tools.tool_registry()
        orchestrator = container.tools.tool_orchestrator()

        # Register a test tool
        test_tool = MyTestTool()
        tool_registry.register_tool(test_tool)

        # Execute tool
        context = container.core.context_factory().create_tool_context(
            user_id="test_user",
            session_id="test_session"
        )

        result = await orchestrator.execute_tool(
            "my_test_tool",
            {"param": "value"},
            context
        )

        assert result["success"] is True
        assert "data" in result
```

### API Integration Testing

```python
import pytest
from fastapi.testclient import TestClient
from backend.src.main import app

@pytest.fixture
def client():
    """Test client for API testing."""
    return TestClient(app)

def test_websocket_connection(client):
    """Test WebSocket connection establishment."""
    with client.websocket_connect("/ws") as websocket:
        # Send handshake
        websocket.send_json({
            "type": "handshake",
            "user_id": "test_user"
        })

        # Send ping
        websocket.send_json({
            "id": "test-ping",
            "type": "ping"
        })

        # Receive pong
        response = websocket.receive_json()
        assert response["type"] == "pong"
        assert response["id"] == "test-ping"
```

### Database Integration Testing

```python
@pytest.mark.asyncio
class TestMemoryIntegration:
    """Test memory system integration."""

    @pytest.fixture
    async def memory_store(self, tmp_path):
        """Real memory store with temporary database."""
        from backend.src.memory.storage.local_store import SQLiteMemoryStore

        db_path = tmp_path / "test_memory.db"
        store = SQLiteMemoryStore(str(db_path))
        await store.initialize()
        yield store
        await store.close()

    async def test_memory_storage_and_retrieval(self, memory_store):
        """Test storing and retrieving memories."""
        # Store memory
        await memory_store.add(
            text="Test memory content",
            user_id="test_user",
            metadata={"source": "test"}
        )

        # Retrieve memories
        memories = await memory_store.search(
            query="test memory",
            user_id="test_user",
            limit=5
        )

        assert len(memories) == 1
        assert "Test memory content" in memories[0]["text"]
```

## End-to-End Testing

### Pipeline Testing

```python
@pytest.mark.asyncio
class TestEndToEndPipeline:
    """End-to-end tests for complete pipelines."""

    async def test_read_file_pipeline(self):
        """Test complete read_file tool pipeline."""
        # This simulates the test_read_file_tool_pipeline.py

        # 1. Parse LLM response
        parser = ResponseParser()
        llm_response = '{"functionCall": {"name": "read_file", "args": {"path": "test_file.txt"}}}'
        parsed = parser.parse_response(llm_response)

        # 2. Set up container
        container = ApplicationContainer()
        await container.initialize()

        try:
            # 3. Execute through orchestrator
            orchestrator = container.tools.tool_orchestrator()
            context = container.core.context_factory().create_tool_context(
                user_id="test_user",
                session_id="test_session"
            )

            result = await orchestrator.execute_tool_calls(
                parsed.tool_calls,
                context
            )

            # 4. Verify results
            assert len(result) == 1
            assert result[0]["success"] is True

        finally:
            await container.shutdown()
```

### WebSocket E2E Testing

```python
import pytest
import asyncio
from websockets import connect
from backend.src.main import start_server

@pytest.mark.asyncio
class TestWebSocketE2E:
    """End-to-end WebSocket testing."""

    @pytest.fixture(autouse=True)
    async def server(self):
        """Start test server."""
        server = await start_server(host="localhost", port=8766)
        yield server
        server.close()

    async def test_complete_conversation_flow(self):
        """Test complete conversation through WebSocket."""
        uri = "ws://localhost:8766/ws"

        async with connect(uri) as websocket:
            # Handshake
            await websocket.send('{"type": "handshake", "user_id": "test_user"}')

            # Send query
            await websocket.send('{"id": "test-1", "type": "query", "payload": {"text": "Hello"}}')

            # Receive responses
            responses = []
            while True:
                try:
                    response = await asyncio.wait_for(
                        websocket.recv(),
                        timeout=5.0
                    )
                    data = json.loads(response)
                    responses.append(data)

                    if data.get("type") == "streaming-complete":
                        break

                except asyncio.TimeoutError:
                    break

            # Verify conversation completed
            assert len(responses) > 0
            assert any(r["type"] == "streaming-response" for r in responses)
            assert any(r["type"] == "streaming-complete" for r in responses)
```

## Tool Testing Patterns

### Tool Unit Testing

```python
import pytest
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context

class TestMyTool:
    """Test suite for MyTool."""

    @pytest.fixture
    def tool(self):
        """Create tool instance."""
        return MyTool()

    @pytest.fixture
    def mock_context(self):
        """Create mock execution context."""
        return Context(
            user=MagicMock(),
            session=MagicMock(),
            runtime=MagicMock()
        )

    @pytest.mark.asyncio
    async def test_tool_success(self, tool, mock_context):
        """Test successful tool execution."""
        args = MyToolArgs(input_data="test")

        result = await tool.run(args, mock_context)

        assert result["success"] is True
        assert "data" in result
        assert result["llm_content"] is not None
        assert result["return_display"] is not None

    @pytest.mark.asyncio
    async def test_tool_validation_error(self, tool, mock_context):
        """Test tool argument validation."""
        args = MyToolArgs(input_data="")  # Invalid empty input

        result = await tool.run(args, mock_context)

        assert result["success"] is False
        assert "error" in result

    @pytest.mark.asyncio
    async def test_tool_permission_denied(self, tool, mock_context):
        """Test permission checking."""
        # Mock user without required permissions
        mock_context.user.permissions = []

        args = MyToolArgs(input_data="test")
        result = await tool.run(args, mock_context)

        assert result["success"] is False
        assert "permission" in result["error"].lower()
```

### Tool Schema Testing

```python
class TestToolSchema:
    """Test tool JSON schema generation."""

    def test_tool_schema_generation(self, tool):
        """Test tool generates valid JSON schema."""
        schema = tool.get_json_schema()

        assert "name" in schema
        assert "description" in schema
        assert "parameters" in schema
        assert schema["name"] == tool.name

        # Validate schema structure
        parameters = schema["parameters"]
        assert "type" in parameters
        assert "properties" in parameters

    def test_tool_schema_validation(self, tool):
        """Test schema validates tool arguments."""
        from jsonschema import validate, ValidationError

        schema = tool.get_json_schema()["parameters"]
        valid_args = {"input_data": "test"}

        # Should not raise ValidationError
        validate(valid_args, schema)

        # Invalid args should raise ValidationError
        with pytest.raises(ValidationError):
            validate({"invalid_field": "value"}, schema)
```

## Test Utilities and Fixtures

### Test Fixtures

**tests/backend/conftest.py**:
```python
import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock
from backend.src.core.container import ApplicationContainer

@pytest.fixture
def event_loop():
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture
def mock_config():
    """Mock application configuration."""
    config = MagicMock()
    config.llm_provider = "openai"
    config.temperature = 0.7
    config.memory_enabled = True
    return config

@pytest.fixture
async def test_container():
    """Test container with mocked dependencies."""
    container = ApplicationContainer()

    # Override expensive services with mocks
    container.core.llm_client.override(AsyncMock())
    container.memory.memory_store.override(MagicMock())

    await container.initialize()
    yield container
    await container.shutdown()

@pytest.fixture
def temp_workspace(tmp_path):
    """Create temporary workspace directory."""
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    return workspace
```

### Test Helpers

**tests/backend/helpers.py**:
```python
import json
import tempfile
from pathlib import Path
from typing import Dict, Any
from backend.src.sdk.context import Context, UserContext, SessionContext

def create_test_context(
    user_id: str = "test_user",
    session_id: str = "test_session",
    permissions: list = None
) -> Context:
    """Create test execution context."""
    return Context(
        user=UserContext(
            user_id=user_id,
            permissions=permissions or ["read_filesystem"]
        ),
        session=SessionContext(
            session_id=session_id,
            created_at=1234567890
        ),
        runtime=MagicMock()
    )

def create_temp_file(content: str, suffix: str = ".txt") -> Path:
    """Create temporary file with content."""
    fd, path = tempfile.mkstemp(suffix=suffix)
    with os.fdopen(fd, 'w') as f:
        f.write(content)
    return Path(path)

def mock_llm_response(content: str, tool_calls: list = None) -> Dict[str, Any]:
    """Create mock LLM response."""
    response = {
        "content": content,
        "finish_reason": "stop"
    }

    if tool_calls:
        response["tool_calls"] = tool_calls

    return response

def async_generator(items):
    """Create async generator from items."""
    async def gen():
        for item in items:
            yield item
    return gen()
```

## Performance Testing

### Load Testing

```python
import pytest
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor

@pytest.mark.asyncio
class TestPerformance:
    """Performance tests."""

    async def test_concurrent_queries(self, test_container):
        """Test handling multiple concurrent queries."""
        container = test_container
        num_concurrent = 10

        async def single_query(i: int):
            agent = container.agent_session()
            start_time = time.time()
            result = await agent.process_query(f"Query {i}")
            end_time = time.time()
            return end_time - start_time

        # Execute concurrent queries
        start_time = time.time()
        results = await asyncio.gather(*[
            single_query(i) for i in range(num_concurrent)
        ])
        total_time = time.time() - start_time

        # Validate performance
        avg_response_time = sum(results) / len(results)
        assert avg_response_time < 2.0  # Max 2 seconds per query
        assert total_time < 5.0  # All queries complete within 5 seconds

    def test_memory_usage(self, test_container):
        """Test memory usage under load."""
        import psutil
        import os

        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss

        # Perform memory-intensive operations
        # ... test code ...

        final_memory = process.memory_info().rss
        memory_increase = final_memory - initial_memory

        # Allow reasonable memory increase (e.g., 50MB max)
        assert memory_increase < 50 * 1024 * 1024
```

### Benchmarking

```python
import pytest
import time
import statistics
from pytest_benchmark import benchmark

def test_tool_execution_benchmark(benchmark, test_container):
    """Benchmark tool execution performance."""

    @benchmark
    def run_tool():
        # Synchronous benchmark wrapper
        asyncio.run(async_tool_execution(test_container))

    async def async_tool_execution(container):
        tool = container.tools.tool_registry().get_tool("read_file")
        context = container.core.context_factory().create_tool_context(
            user_id="bench_user",
            session_id="bench_session"
        )

        await tool.run({"path": "small_file.txt"}, context)

    # Analyze results
    stats = benchmark.stats
    assert stats.mean < 0.1  # Average execution < 100ms
```

## Test Organization and Running

### Running Tests

```bash
# Run all tests
pytest

# Run specific test file
pytest tests/backend/test_llm_parser.py

# Run tests in class
pytest tests/backend/test_read_file_tool_pipeline.py::TestReadFilePipeline

# Run async tests only
pytest -k "async"

# Run with coverage
pytest --cov=backend/src --cov-report=html

# Run in parallel
pytest -n auto

# Run performance tests
pytest -k "performance" --benchmark-only
```

### Test Categories

```python
# Mark tests by category
@pytest.mark.unit
def test_unit_functionality():
    pass

@pytest.mark.integration
class TestIntegrationSuite:
    pass

@pytest.mark.e2e
def test_end_to_end_flow():
    pass

@pytest.mark.performance
def test_performance_metrics():
    pass

@pytest.mark.slow
def test_slow_operation():
    pass
```

### CI/CD Integration

**.github/workflows/test.yml**:
```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.9'

      - name: Install dependencies
        run: pip install -r backend/requirements.txt

      - name: Run backend tests
        run: pytest tests/backend/ -v

      - name: Generate coverage report
        run: pytest --cov=backend/src --cov-report=xml

      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Debugging Tests

### Test Debugging Techniques

```python
def test_debug_failure():
    """Debug test with detailed logging."""
    import logging
    logging.basicConfig(level=logging.DEBUG)

    # Enable debug mode for components
    os.environ["DEBUG"] = "1"

    try:
        # Test code that fails
        result = some_operation()
        assert result is not None
    except Exception as e:
        # Capture detailed error information
        import traceback
        print("Full traceback:")
        traceback.print_exc()

        # Inspect component state
        print(f"Component state: {some_component.__dict__}")

        raise
```

### Test Isolation Issues

```python
# Ensure test isolation
@pytest.fixture(autouse=True)
def isolate_tests():
    """Ensure each test runs in isolation."""
    # Reset global state
    # Clean up test files
    # Reset mocks
    yield
    # Additional cleanup
```

## Best Practices

### Test Quality Guidelines

1. **Test One Thing**: Each test should verify one specific behavior
2. **Arrange-Act-Assert**: Clear structure for each test
3. **Descriptive Names**: Test names should describe what they verify
4. **Independent Tests**: Tests should not depend on each other
5. **Fast Execution**: Tests should run quickly
6. **Realistic Data**: Use realistic test data and edge cases

### Code Coverage

```python
# Target coverage goals
# - Unit tests: > 80% coverage
# - Integration tests: > 70% coverage
# - Critical paths: 100% coverage

# Measure coverage
pytest --cov=backend/src --cov-report=term-missing

# Fail if coverage below threshold
pytest --cov=backend/src --cov-fail-under=80
```

### Test Maintenance

1. **Regular Review**: Review and update tests regularly
2. **Remove Flaky Tests**: Fix or remove unreliable tests
3. **Update on Refactor**: Update tests when code changes
4. **Add New Tests**: Add tests for new features
5. **Performance Monitoring**: Monitor test execution time

This comprehensive testing guide provides the foundation for maintaining high-quality, reliable tests across the Personal Assistant Backend codebase.
