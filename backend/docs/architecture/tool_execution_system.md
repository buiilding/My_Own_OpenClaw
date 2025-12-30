# Tool Execution System

This document provides comprehensive documentation for the Personal Assistant Backend tool execution system, including orchestration, batch processing, result aggregation, and execution strategies.

## Overview

The tool execution system manages the complete lifecycle of tool operations from request to result, including:

- Tool discovery and validation
- Execution orchestration and coordination
- Batch processing and parallel execution
- Result aggregation and formatting
- Error handling and recovery
- Progress tracking and monitoring
- Security enforcement and audit logging

## Core Components

### Tool Orchestrator (`backend/src/tools/orchestrator.py`)

The main coordinator for tool execution operations.

#### Features

- Sequential and parallel tool execution
- Result aggregation and formatting
- Error handling and recovery
- Progress tracking
- Context management

#### Usage

```python
from backend.src.tools.orchestrator import ToolOrchestrator

orchestrator = ToolOrchestrator(tool_registry, config)

# Execute tools from LLM response
result = await orchestrator.execute_tools_from_response(
    parsed_response=parsed_llm_response,
    user_id="user123",
    session_id="session456"
)

# Check execution status
if result.success:
    print(f"Executed {len(result.results)} tools successfully")
    for tool_result in result.results:
        print(f"{tool_result.tool_name}: {tool_result.success}")
```

### Execution Engine (`backend/src/tools/execution/engine.py`)

The core execution engine that handles individual tool invocations.

#### Features

- Tool instance resolution and validation
- Argument validation and type conversion
- Execution strategy application
- Timeout and resource management
- Error capture and reporting

#### Execution Flow

```python
class ToolExecutionEngine:
    """Handles the actual execution of individual tools."""

    async def execute(
        self,
        tool_call: ParsedToolCall,
        user_id: str,
        session_id: str,
        session_ref: Optional[AgentSession] = None
    ) -> ToolExecutionResult:
        """Execute a single tool call."""

        # 1. Validate tool exists
        tool = self.tool_registry.get_tool(tool_call.tool_name)
        if not tool:
            return self._create_error_result(tool_call, "Tool not found")

        # 2. Validate arguments
        try:
            validated_args = self._validate_arguments(tool, tool_call.arguments)
        except Exception as e:
            return self._create_error_result(tool_call, f"Argument validation failed: {e}")

        # 3. Create execution context
        context = self.context_factory.create_tool_context(
            user_id=user_id,
            session_id=session_id,
            session_ref=session_ref
        )

        # 4. Execute with strategy
        try:
            result = await self.execution_strategy.execute(
                tool=tool,
                args=validated_args,
                context=context
            )
            return ToolExecutionResult(
                tool_call=tool_call,
                result=result,
                execution_time=time.time() - start_time,
                success=True
            )
        except Exception as e:
            return self._create_error_result(tool_call, str(e))
```

### Execution Strategies (`backend/src/tools/execution/strategies/`)

Pluggable execution strategies that control how tools are executed.

#### Strategy Types

- **Audit Strategy**: Logs execution details and enforces security policies
- **Validation Strategy**: Validates inputs and outputs
- **Security Strategy**: Applies security checks and resource limits
- **Chain Strategy**: Combines multiple strategies in sequence

#### Usage

```python
from backend.src.tools.execution.strategies import create_execution_chain

# Create execution chain with multiple strategies
execution_strategy = create_execution_chain(
    tool_registry=tool_registry,
    security_policy=security_policy
)

# Strategies are applied in order:
# 1. Security checks
# 2. Input validation
# 3. Tool execution
# 4. Output validation
# 5. Audit logging
```

#### Custom Strategies

```python
from backend.src.tools.execution.strategies.base import ExecutionStrategy

class LoggingStrategy(ExecutionStrategy):
    """Custom strategy that adds detailed logging."""

    async def execute(
        self,
        tool: SDKTool,
        args: Dict[str, Any],
        context: ToolContext
    ) -> ToolResult:
        logger.info(f"Executing {tool.name} with args: {args}")

        # Execute the tool
        result = await self.next_strategy.execute(tool, args, context)

        logger.info(f"Tool {tool.name} completed in {result.execution_time:.3f}s")
        return result
```

### Batch Executor (`backend/src/tools/execution/batch_executor.py`)

Handles batch processing of multiple tool calls.

#### Features

- Parallel execution of independent tools
- Dependency resolution and ordering
- Resource pooling and limits
- Progress tracking across batches

#### Usage

```python
batch_executor = BatchExecutor(orchestrator, config)

# Execute batch of tool calls
batch_result = await batch_executor.execute_batch(
    tool_calls=[call1, call2, call3],
    user_id="user123",
    session_id="session456",
    max_parallel=3
)

# Get batch statistics
print(f"Batch completed: {batch_result.total_tools} tools")
print(f"Success rate: {batch_result.success_rate}")
print(f"Total time: {batch_result.total_time}")
```

### Result Aggregator (`backend/src/tools/execution/aggregator.py`)

Aggregates and formats execution results from multiple tools.

#### Features

- Result consolidation and deduplication
- Success/failure statistics
- Formatted output generation
- Error summarization

**Note:** `ResultAggregator` has been inlined into `ToolOrchestrator` for simplicity. The aggregation logic is now directly in `ToolOrchestrator.execute_tools_from_response()`.

#### Usage

```python
from backend.src.tools.orchestrator import ToolOrchestrator

orchestrator = ToolOrchestrator(tool_registry, config)

# Execute tools - aggregation happens automatically
result = await orchestrator.execute_tools_from_response(
    parsed_response=parsed_response,
    user_id="user123",
    session_id="session456"
)

# Check execution status
if result.all_successful:
    print(f"Executed {len(result.tool_results)} tools successfully")
    print(result.summary)
else:
    print(f"Some tools failed: {result.summary}")
    for tool_result in result.tool_results:
        if not tool_result.success:
            print(f"  {tool_result.tool_call.tool_name}: {tool_result.result.error}")
```

### Progress Tracker (`backend/src/tools/execution/progress_tracker.py`)

Tracks execution progress and provides real-time updates.

#### Features

- Progress percentage calculation
- ETA estimation
- Current operation status
- Cancellation support

#### Usage

```python
progress_tracker = ProgressTracker(orchestrator, config)

# Track progress during execution
async def execute_with_progress(tool_calls):
    total_tools = len(tool_calls)
    completed = 0

    for tool_call in tool_calls:
        # Update progress
        progress_tracker.update_progress(
            completed=completed,
            total=total_tools,
            current_tool=tool_call.tool_name,
            status="executing"
        )

        # Execute tool
        result = await orchestrator.execute_single_tool(tool_call)

        completed += 1
        progress_tracker.update_progress(
            completed=completed,
            total=total_tools,
            status="completed" if result.success else "failed"
        )

    return progress_tracker.get_final_summary()
```

## Data Structures

### ToolExecutionResult

```python
@dataclass
class ToolExecutionResult:
    """Result of a single tool execution."""
    tool_call: ParsedToolCall
    result: ToolResult
    execution_time: float
    success: bool
    error: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
```

### OrchestrationResult

```python
@dataclass
class OrchestrationResult:
    """Result of orchestrating multiple tool executions."""
    results: List[ToolExecutionResult]
    total_time: float
    success: bool
    summary: Dict[str, Any]

    @property
    def successful_tools(self) -> List[ToolExecutionResult]:
        """Get successfully executed tools."""
        return [r for r in self.results if r.success]

    @property
    def failed_tools(self) -> List[ToolExecutionResult]:
        """Get failed tool executions."""
        return [r for r in self.results if not r.success]
```

### ToolResult

```python
@dataclass
class ToolResult:
    """Standardized result from tool execution."""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    llm_content: Optional[str] = None
    return_display: Optional[str] = None
    execution_time: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None
```

## Execution Strategies

### Chain Strategy

Combines multiple execution strategies in a pipeline:

```python
def create_execution_chain(tool_registry, security_policy) -> ExecutionStrategy:
    """Create a chain of execution strategies."""

    # Build strategy chain
    strategies = [
        SecurityStrategy(security_policy),
        ValidationStrategy(tool_registry),
        AuditStrategy(),
        BaseExecutionStrategy()  # Actual tool execution
    ]

    # Chain them together
    strategy = strategies[-1]
    for s in reversed(strategies[:-1]):
        s.next_strategy = strategy
        strategy = s

    return strategy
```

### Security Strategy

```python
class SecurityStrategy(ExecutionStrategy):
    """Applies security checks before tool execution."""

    def __init__(self, security_policy: SecurityPolicy):
        self.security_policy = security_policy

    async def execute(self, tool, args, context):
        # Check permissions
        if not self.security_policy.check_permission(
            tool.name, Permission.EXECUTE_COMMANDS, args
        ):
            raise SecurityError(f"Permission denied for tool {tool.name}")

        # Check resource limits
        if not self.security_policy.check_resource_limits(tool.name):
            raise SecurityError(f"Resource limits exceeded for tool {tool.name}")

        # Check path access if applicable
        for arg_value in args.values():
            if isinstance(arg_value, str) and "/" in arg_value:
                if not self.security_policy.check_path_access(arg_value):
                    raise SecurityError(f"Path access denied: {arg_value}")

        # Continue with next strategy
        return await self.next_strategy.execute(tool, args, context)
```

### Validation Strategy

```python
class ValidationStrategy(ExecutionStrategy):
    """Validates tool inputs and outputs."""

    async def execute(self, tool, args, context):
        # Validate input arguments
        try:
            validated_args = tool.args_model(**args)
        except ValidationError as e:
            raise ValidationError(f"Input validation failed: {e}")

        # Execute tool
        result = await self.next_strategy.execute(tool, validated_args.dict(), context)

        # Validate output if schema provided
        if hasattr(tool, 'output_model') and result.data:
            try:
                validated_output = tool.output_model(**result.data)
                result.data = validated_output.dict()
            except ValidationError as e:
                logger.warning(f"Output validation failed for {tool.name}: {e}")

        return result
```

### Audit Strategy

```python
class AuditStrategy(ExecutionStrategy):
    """Logs all tool executions for audit purposes."""

    async def execute(self, tool, args, context):
        start_time = time.time()

        try:
            result = await self.next_strategy.execute(tool, args, context)
            execution_time = time.time() - start_time

            # Log successful execution
            audit_tool_execution(
                tool_name=tool.name,
                user_id=context.user.user_id,
                session_id=context.session.session_id,
                parameters=args,
                success=True,
                execution_time=execution_time
            )

            result.execution_time = execution_time
            return result

        except Exception as e:
            execution_time = time.time() - start_time

            # Log failed execution
            audit_tool_execution(
                tool_name=tool.name,
                user_id=context.user.user_id,
                session_id=context.session.session_id,
                parameters=args,
                success=False,
                execution_time=execution_time,
                error=str(e)
            )
            raise
```

## Context Factory Integration

### Tool Context Creation

```python
class ContextFactory:
    """Creates execution contexts for tools."""

    def create_tool_context(
        self,
        user_id: str,
        session_id: str,
        workspace_root: Optional[str] = None,
        session_ref: Optional[AgentSession] = None
    ) -> ToolContext:
        """Create execution context with all necessary services."""

        services = {
            "config": self.config,
            "tool_registry": self.tool_registry,
            "file_service": self.file_service,
            "workspace_service": self.workspace_service,
            "session": session_ref
        }

        return ToolContext(
            user=UserContext(user_id=user_id),
            session=SessionContext(session_id=session_id, created_at=time.time()),
            runtime=ExecutionRuntime(
                workspace_root=workspace_root or os.getcwd(),
                services=services
            )
        )
```

## Error Handling and Recovery

### Execution Errors

```python
class ToolExecutionError(Exception):
    """Base class for tool execution errors."""
    pass

class ToolNotFoundError(ToolExecutionError):
    """Tool not found in registry."""
    pass

class ToolValidationError(ToolExecutionError):
    """Tool argument validation failed."""
    pass

class ToolSecurityError(ToolExecutionError):
    """Tool execution blocked by security policy."""
    pass

class ToolTimeoutError(ToolExecutionError):
    """Tool execution timed out."""
    pass
```

### Error Recovery

```python
async def execute_with_recovery(
    self,
    tool_call: ParsedToolCall,
    max_retries: int = 2
) -> ToolExecutionResult:
    """Execute tool with automatic retry on transient failures."""

    last_error = None

    for attempt in range(max_retries + 1):
        try:
            return await self.execute(tool_call, user_id, session_id)
        except (ToolTimeoutError, ConnectionError) as e:
            last_error = e
            if attempt < max_retries:
                wait_time = 2 ** attempt  # Exponential backoff
                logger.warning(f"Tool execution failed (attempt {attempt + 1}), retrying in {wait_time}s: {e}")
                await asyncio.sleep(wait_time)
            else:
                logger.error(f"Tool execution failed after {max_retries + 1} attempts: {e}")
        except ToolExecutionError:
            # Non-retryable error
            raise

    # This should not be reached, but just in case
    raise ToolExecutionError(f"Execution failed after retries: {last_error}")
```

## Performance Optimization

### Parallel Execution

```python
async def execute_parallel(
    self,
    tool_calls: List[ParsedToolCall],
    max_concurrent: int = 3
) -> List[ToolExecutionResult]:
    """Execute tools in parallel with concurrency limit."""

    semaphore = asyncio.Semaphore(max_concurrent)

    async def execute_with_semaphore(tool_call):
        async with semaphore:
            return await self.execute(tool_call, user_id, session_id)

    # Execute all tools concurrently
    tasks = [execute_with_semaphore(call) for call in tool_calls]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Handle exceptions in results
    processed_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            processed_results.append(self._create_error_result(
                tool_calls[i],
                f"Execution failed: {str(result)}"
            ))
        else:
            processed_results.append(result)

    return processed_results
```

### Resource Pooling

```python
class ResourcePool:
    """Manages shared resources for tool execution."""

    def __init__(self, max_connections: int = 10):
        self.semaphore = asyncio.Semaphore(max_connections)
        self._pools = {}

    async def acquire_resource(self, resource_type: str) -> Any:
        """Acquire a resource from the pool."""
        async with self.semaphore:
            if resource_type not in self._pools:
                self._pools[resource_type] = await self._create_resource_pool(resource_type)

            return await self._pools[resource_type].acquire()

    async def release_resource(self, resource_type: str, resource: Any):
        """Release a resource back to the pool."""
        if resource_type in self._pools:
            await self._pools[resource_type].release(resource)
```

## Monitoring and Metrics

### Execution Metrics

```python
class ExecutionMetrics:
    """Tracks execution performance metrics."""

    def __init__(self):
        self.total_executions = 0
        self.successful_executions = 0
        self.failed_executions = 0
        self.average_execution_time = 0.0
        self.tool_execution_times = defaultdict(list)

    def record_execution(self, tool_name: str, success: bool, execution_time: float):
        """Record execution metrics."""
        self.total_executions += 1

        if success:
            self.successful_executions += 1
        else:
            self.failed_executions += 1

        # Update average execution time
        self.average_execution_time = (
            (self.average_execution_time * (self.total_executions - 1)) + execution_time
        ) / self.total_executions

        # Track per-tool metrics
        self.tool_execution_times[tool_name].append(execution_time)

        # Keep only last 100 executions per tool
        if len(self.tool_execution_times[tool_name]) > 100:
            self.tool_execution_times[tool_name] = self.tool_execution_times[tool_name][-100:]

    def get_tool_stats(self, tool_name: str) -> Dict[str, Any]:
        """Get statistics for a specific tool."""
        times = self.tool_execution_times.get(tool_name, [])
        if not times:
            return {}

        return {
            "executions": len(times),
            "avg_time": sum(times) / len(times),
            "min_time": min(times),
            "max_time": max(times),
            "success_rate": self.successful_executions / max(1, self.total_executions)
        }
```

## Testing

### Execution Testing

```python
import pytest
from unittest.mock import AsyncMock, MagicMock

@pytest.fixture
def mock_tool():
    """Create a mock tool for testing."""
    tool = MagicMock()
    tool.name = "test_tool"
    tool.run = AsyncMock(return_value={
        "success": True,
        "data": {"result": "test"},
        "llm_content": "Test result",
        "return_display": "Test result"
    })
    return tool

@pytest.fixture
def mock_context():
    """Create a mock execution context."""
    return MagicMock()

@pytest.mark.asyncio
async def test_tool_execution_success(mock_tool, mock_context):
    """Test successful tool execution."""
    engine = ToolExecutionEngine(
        tool_registry=MagicMock(),
        context_factory=MagicMock(),
        execution_strategy=MagicMock()
    )

    # Mock dependencies
    engine.tool_registry.get_tool.return_value = mock_tool
    engine.execution_strategy.execute.return_value = ToolResult(
        success=True,
        data={"result": "test"}
    )

    # Execute
    result = await engine.execute(
        tool_call=ParsedToolCall(tool_name="test_tool", arguments={}),
        user_id="test_user",
        session_id="test_session"
    )

    assert result.success is True
    assert result.result.data == {"result": "test"}
```

This tool execution system documentation provides comprehensive coverage of how tools are discovered, validated, executed, and monitored within the Personal Assistant Backend.
