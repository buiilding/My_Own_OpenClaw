# Phase 2 Implementation: Tool Discovery & Execution Strategies

## Overview

Phase 2 focuses on implementing the tool system that enables the assistant to perform actions beyond conversation. This phase establishes the foundation for tool discovery, loading, execution, and orchestration.

## Objectives

- Implement dynamic tool discovery and loading
- Create tool execution framework with sandboxing
- Build tool orchestration for multi-step tasks
- Establish tool registry and schema management
- Implement security controls and permission system

## Implementation Details

### Tool Registry System

**Location**: `backend/src/tools/registry.py`

Central registry for managing tool instances and schemas:

```python
class ToolRegistry:
    """Registry for managing available tools."""

    def __init__(self, config: AppConfig, tool_loader: ToolLoader):
        self.config = config
        self.tools: Dict[str, Tool] = {}
        self.loader = tool_loader
        self.schemas: Dict[str, Dict] = {}

    def register_tool(self, tool: Tool):
        """Register a tool instance."""
        self.tools[tool.name] = tool
        self.schemas[tool.name] = tool.get_json_schema()

    async def discover_tools(self):
        """Discover and load tools from filesystem."""
        tool_classes = await self.loader.discover_tools()
        for tool_class in tool_classes:
            tool_instance = tool_class()
            self.register_tool(tool_instance)
```

**Features**:
- Dynamic tool registration
- Schema caching for LLM integration
- Tool metadata management
- Lifecycle management

### Tool Loading System

**Location**: `backend/src/tools/loader.py`

Filesystem-based tool discovery and loading:

```python
class ToolLoader:
    """Loads tools from filesystem locations."""

    def __init__(self, search_paths: List[Path]):
        self.search_paths = search_paths

    async def discover_tools(self) -> List[Type[Tool]]:
        """Discover tool classes from search paths."""
        tools = []

        for path in self.search_paths:
            if path.is_dir():
                tools.extend(await self._load_from_directory(path))

        return tools

    async def _load_from_directory(self, directory: Path) -> List[Type[Tool]]:
        """Load tools from a directory."""
        tools = []

        for item in directory.iterdir():
            if item.is_file() and item.suffix == '.py':
                module = await self._import_module(item)
                tools.extend(self._extract_tools_from_module(module))

        return tools
```

**Discovery Strategy**:
1. Scan configured directories
2. Import Python modules dynamically
3. Extract Tool subclasses
4. Validate and register tools

### Tool Execution Framework

**Location**: `backend/src/tools/orchestrator.py`

Orchestrates tool execution with proper context and error handling:

```python
class ToolOrchestrator:
    """Orchestrates tool execution."""

    def __init__(self, registry: ToolRegistry, config: AppConfig):
        self.registry = registry
        self.config = config
        self.executor = ToolExecutor()

    async def execute_tool(self, tool_name: str, args: Dict, context: ToolContext) -> Dict:
        """Execute a tool with given arguments."""
        tool = self.registry.get_tool(tool_name)
        if not tool:
            raise ToolNotFoundError(f"Tool {tool_name} not found")

        # Validate permissions
        await self._check_permissions(tool, context)

        # Execute with timeout
        async with asyncio.timeout(self.config.tool_timeout_seconds):
            result = await tool.run(args, context)

        # Post-process result
        return await self._process_result(result, tool, context)
```

**Execution Features**:
- Permission checking
- Timeout enforcement
- Result validation
- Error handling and logging

### Security and Permissions

**Location**: `backend/src/core/security/`

Permission system for tool access control:

```python
class PermissionManager:
    """Manages tool permissions."""

    def __init__(self, config: AppConfig):
        self.config = config

    async def check_permission(self, tool: Tool, user: UserContext) -> bool:
        """Check if user can execute tool."""
        required_perms = getattr(tool, 'required_permissions', [])

        # Check destructive operations
        if getattr(tool, 'destructive', False) and not self.config.allow_destructive:
            return False

        # Check user permissions
        return all(perm in user.permissions for perm in required_perms)

    def get_required_permissions(self, tool: Tool) -> List[str]:
        """Get permissions required for tool."""
        return getattr(tool, 'required_permissions', [])
```

### Tool Context Management

**Location**: `backend/src/tools/context_factory.py`

Creates execution contexts for tools:

```python
class ContextFactory:
    """Factory for creating tool execution contexts."""

    def __init__(self, container):
        self.container = container

    def create_context(self, user_id: str, session_id: str) -> ToolContext:
        """Create tool execution context."""
        user = UserContext(
            user_id=user_id,
            permissions=self._get_user_permissions(user_id)
        )

        session = SessionContext(
            session_id=session_id,
            created_at=time.time()
        )

        runtime = ExecutionRuntime(
            workspace_root=self.container.config.workspace_root,
            services=self._get_available_services()
        )

        return ToolContext(user=user, session=session, runtime=runtime)
```

### Schema Management

**Location**: `backend/src/tools/schema_registry.py`

Manages tool schemas for LLM integration:

```python
class SchemaRegistry:
    """Registry for tool schemas."""

    def __init__(self):
        self.schemas: Dict[str, Dict] = {}
        self._cache: Dict[str, str] = {}

    def register_schema(self, tool_name: str, schema: Dict):
        """Register tool schema."""
        self.schemas[tool_name] = schema

    def get_all_schemas(self) -> List[Dict]:
        """Get all tool schemas for LLM."""
        return list(self.schemas.values())

    def get_tool_names(self) -> List[str]:
        """Get list of available tool names."""
        return list(self.schemas.keys())
```

## Tool Categories

### Built-in Tools

**Filesystem Tools** (`backend/src/tools/filesystem/`):
- `read_file`: Read file contents
- `write_file`: Write to files
- `list_directory`: List directory contents
- `search_files`: Search file contents

**System Tools** (`backend/src/tools/system/`):
- `run_command`: Execute system commands
- `get_system_info`: Get system information
- `take_screenshot`: Capture screen

**Utility Tools** (`backend/src/tools/utilities/`):
- `web_search`: Search the web
- `calculate`: Mathematical calculations
- `encode_decode`: Data encoding/decoding

### Tool Interface

All tools implement the standardized interface:

```python
class Tool(ABC, Generic[TArgs]):
    """Base tool interface."""

    name: str
    description: str
    args_model: Type[TArgs]

    @abstractmethod
    async def run(self, args: TArgs, ctx: ToolContext) -> Dict[str, Any]:
        """Execute tool logic."""
        pass

    def get_json_schema(self) -> Dict[str, Any]:
        """Get JSON schema for LLM."""
        schema = self.args_model.model_json_schema()
        return {
            "name": self.name,
            "description": self.description,
            "parameters": schema
        }
```

## Execution Strategies

### Direct Execution
Simple single-tool execution:

```python
# Tool call from LLM
tool_call = {
    "name": "read_file",
    "arguments": {"path": "/etc/hosts"}
}

# Execute directly
result = await orchestrator.execute_tool(
    tool_call["name"],
    tool_call["arguments"],
    context
)
```

### Sequential Execution
Execute tools in sequence:

```python
async def execute_sequential(self, tool_calls: List[Dict]) -> List[Dict]:
    """Execute tools sequentially."""
    results = []
    for tool_call in tool_calls:
        result = await self.execute_tool(
            tool_call["name"],
            tool_call["arguments"],
            self.context
        )
        results.append(result)

        # Check if we should continue
        if result.get("error"):
            break

    return results
```

### Parallel Execution
Execute independent tools concurrently:

```python
async def execute_parallel(self, tool_calls: List[Dict]) -> List[Dict]:
    """Execute tools in parallel."""
    # Group independent tool calls
    independent_calls = self._group_independent_calls(tool_calls)

    # Execute groups concurrently
    results = []
    for group in independent_calls:
        group_results = await asyncio.gather(*[
            self.execute_tool(call["name"], call["arguments"], self.context)
            for call in group
        ])
        results.extend(group_results)

    return results
```

## Error Handling

### Tool Execution Errors

```python
class ToolExecutionError(Exception):
    """Raised when tool execution fails."""
    pass

async def execute_with_error_handling(self, tool_call: Dict) -> Dict:
    """Execute tool with comprehensive error handling."""
    try:
        return await self.execute_tool(
            tool_call["name"],
            tool_call["arguments"],
            self.context
        )
    except ToolNotFoundError:
        return {
            "success": False,
            "error": f"Tool '{tool_call['name']}' not found",
            "available_tools": list(self.registry.tools.keys())
        }
    except ValidationError as e:
        return {
            "success": False,
            "error": f"Invalid arguments: {e}",
            "required_schema": self.registry.get_schema(tool_call["name"])
        }
    except asyncio.TimeoutError:
        return {
            "success": False,
            "error": f"Tool execution timed out after {self.config.tool_timeout_seconds}s"
        }
    except PermissionError as e:
        return {
            "success": False,
            "error": f"Permission denied: {e}"
        }
    except Exception as e:
        logger.error(f"Unexpected error in tool {tool_call['name']}: {e}", exc_info=True)
        return {
            "success": False,
            "error": f"Internal error: {str(e)}"
        }
```

### Result Validation

```python
def validate_tool_result(self, result: Dict) -> Dict:
    """Validate tool execution result."""
    required_keys = {"success", "data", "llm_content", "return_display"}

    if not all(key in result for key in required_keys):
        raise ValidationError(f"Tool result missing required keys: {required_keys - set(result.keys())}")

    if not isinstance(result["success"], bool):
        raise ValidationError("Tool result 'success' must be boolean")

    return result
```

## Performance Optimizations

### Tool Caching

```python
class ToolCache:
    """Cache for tool schemas and instances."""

    def __init__(self):
        self.schema_cache: Dict[str, Dict] = {}
        self.instance_cache: Dict[str, Tool] = {}

    def get_schema(self, tool_name: str) -> Optional[Dict]:
        """Get cached schema."""
        return self.schema_cache.get(tool_name)

    def cache_schema(self, tool_name: str, schema: Dict):
        """Cache tool schema."""
        self.schema_cache[tool_name] = schema

    def get_instance(self, tool_name: str) -> Optional[Tool]:
        """Get cached tool instance."""
        return self.instance_cache.get(tool_name)
```

### Execution Pooling

```python
class ToolExecutionPool:
    """Pool for managing concurrent tool execution."""

    def __init__(self, max_concurrent: int = 5):
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.active_executions: Set[str] = set()

    async def execute(self, tool_name: str, operation: Callable) -> Any:
        """Execute tool with concurrency control."""
        async with self.semaphore:
            if tool_name in self.active_executions:
                raise ConcurrencyError(f"Tool {tool_name} already executing")

            self.active_executions.add(tool_name)
            try:
                return await operation()
            finally:
                self.active_executions.remove(tool_name)
```

## Testing

### Tool Testing Framework

```python
class ToolTestHarness:
    """Testing harness for tools."""

    def __init__(self, container):
        self.container = container

    async def test_tool(self, tool: Tool, test_cases: List[Dict]) -> List[Dict]:
        """Test tool with multiple test cases."""
        results = []

        for test_case in test_cases:
            context = self._create_test_context(test_case.get("user", "test_user"))
            args = test_case["args"]
            expected = test_case.get("expected")

            try:
                result = await tool.run(args, context)
                success = self._validate_result(result, expected)
                results.append({
                    "test_case": test_case,
                    "result": result,
                    "success": success
                })
            except Exception as e:
                results.append({
                    "test_case": test_case,
                    "error": str(e),
                    "success": False
                })

        return results
```

### Integration Testing

```python
@pytest.mark.asyncio
class TestToolSystem:
    async def test_tool_discovery(self, container):
        """Test tool discovery and registration."""
        registry = container.tool_registry()
        await registry.discover_tools()

        assert len(registry.tools) > 0
        assert "read_file" in registry.tools

    async def test_tool_execution(self, container):
        """Test end-to-end tool execution."""
        orchestrator = container.tool_orchestrator()

        # Create test context
        context = container.context_factory().create_context("test_user", "test_session")

        # Execute tool
        result = await orchestrator.execute_tool("read_file", {"path": "test.txt"}, context)

        assert result["success"] is True
        assert "content" in result["data"]
```

## Security Considerations

### Sandboxing

- Tool execution in isolated contexts
- File system access restrictions
- Network access controls
- Resource limit enforcement

### Permission Model

```python
TOOL_PERMISSIONS = {
    "read_file": ["file_read"],
    "write_file": ["file_write"],
    "run_command": ["system_execute"],
    "web_search": ["network_access"]
}
```

### Audit Logging

```python
class ToolAuditLogger:
    """Audit logging for tool execution."""

    async def log_execution(self, tool_name: str, args: Dict, context: ToolContext, result: Dict):
        """Log tool execution."""
        audit_entry = {
            "timestamp": time.time(),
            "tool_name": tool_name,
            "user_id": context.user.user_id,
            "session_id": context.session.session_id,
            "args": self._sanitize_args(args),
            "success": result.get("success", False),
            "execution_time": result.get("execution_time")
        }

        await self._write_audit_log(audit_entry)
```

## Future Extensions

### Advanced Execution Strategies
- Conditional execution based on results
- Retry logic with exponential backoff
- Circuit breaker pattern for failing tools

### Tool Composition
- Tool chaining and pipelining
- Composite tools built from simpler tools
- Tool templates and generators

### Marketplace Integration
- Tool rating and reviews
- Usage analytics and metrics
- Automated tool updates

## Success Criteria

- [x] Dynamic tool discovery from filesystem
- [x] Secure tool execution with permissions
- [x] Tool orchestration for complex tasks
- [x] Schema generation for LLM integration
- [x] Comprehensive error handling
- [x] Performance optimizations
- [x] Security controls and audit logging
- [x] Testing framework and coverage

## Lessons Learned

### Dynamic Loading Complexity
Dynamic module importing introduced complexity but enabled the flexible plugin architecture we needed.

### Permission System Importance
Early implementation of permissions prevented security issues and enabled fine-grained access control.

### Schema Management Challenges
Keeping schemas synchronized with tool implementations required careful change management.

### Execution Strategy Flexibility
Different execution strategies (sequential, parallel) were needed for different types of tool interactions.
