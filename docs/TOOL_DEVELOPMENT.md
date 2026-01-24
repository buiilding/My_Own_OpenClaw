# Tool Development Guide

## Overview

This guide explains how to create custom tools for Desktop Assistant. Tools enable the assistant to interact with the computer and perform various tasks.

## Tool Architecture

### Tool Types

**Remote Tools** (Frontend Execution):
- Executed on Python sidecar (`frontend/src/main/python/tools/`)
- Access to system resources (mouse, keyboard, filesystem)
- Automatic screenshot capture for computer-use tools
- Defined by backend stubs (for LLM schema) and frontend implementations

**Backend Tools**:
- Executed on backend server
- Access to backend services (memory, LLM clients, plugins)
- Use SDK Tool base class with Pydantic schemas

## Creating a Remote Tool

Remote tools execute on the frontend Python sidecar. They require both a backend stub (for schema) and a frontend implementation.

### Step 1: Create Pydantic Schema

Create a schema file in `backend/src/tools/<domain>/schemas.py` (e.g., `computer/schemas.py`, `filesystem/schemas.py`):

```python
from pydantic import BaseModel, Field

class MyToolArgs(BaseModel):
    """Arguments for my remote tool."""
    param1: str = Field(..., description="Parameter 1 description")
    param2: int = Field(default=0, description="Parameter 2 description")
```

### Step 2: Create Backend Stub

Add a remote tool stub in `backend/src/tools/remote.py`:

```python
from backend.src.sdk.tool import Tool
from backend.src.tools.remote import RemoteToolBase, RemoteToolResult
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.my_domain.schemas import MyToolArgs

class RemoteMyTool(Tool[MyToolArgs], RemoteToolBase):
    """
    Remote my tool.
    
    Delegates execution to frontend Python sidecar.
    """
    
    name = "my_remote_tool"
    description = "Description of my remote tool"
    args_model = MyToolArgs
    category = ToolDomain.OTHER  # or appropriate domain (COMPUTER, FILESYSTEM, SYSTEM)
    
    async def execute_remote(self, args: MyToolArgs, ctx: ToolContext) -> RemoteToolResult:
        """Prepare tool call for remote execution."""
        request_id = self._get_request_id(ctx)
        args_dict = args.model_dump()
        
        return RemoteToolResult(
            tool_name="my_remote_tool",
            args=args_dict,
            request_id=request_id
        )
```

Then add it to the `REMOTE_TOOLS` dictionary at the bottom of `remote.py`:

```python
REMOTE_TOOLS = {
    # ... existing tools
    "my_remote_tool": RemoteMyTool,
}
```

The tool will be automatically registered when `ToolRegistry._register_remote_tools()` is called.

### Step 3: Create Frontend Implementation

Create tool implementation in `frontend/src/main/python/tools/<domain>/my_tool.py`:

```python
"""
My Remote Tool - Frontend implementation.
"""
import logging
from typing import Dict, Any

from tools.result import ToolResult
from tools.schemas import MyToolArgs

logger = logging.getLogger(__name__)

async def execute_my_remote_tool(args: Dict[str, Any]) -> ToolResult:
    """
    Execute my remote tool.
    
    Args:
        args: Tool arguments (validated by Pydantic schema)
        
    Returns:
        ToolResult with success status and data
    """
    try:
        # Validate args using Pydantic schema
        validated_args = MyToolArgs(**args)
        
        # Tool execution logic
        param1 = validated_args.param1
        param2 = validated_args.param2
        
        result = f"Processed {param1} with {param2}"
        
        return ToolResult(
            success=True,
            llm_content=f"My tool executed: {result}",
            return_display="Success",
            result=result
        )
    except Exception as e:
        logger.error(f"My tool failed: {e}", exc_info=True)
        return ToolResult(
            success=False,
            error=f"My tool failed: {str(e)}"
        )
```

### Step 4: Register Tool in Frontend

Add the tool to `frontend/src/main/python/tools/registry.py`:

1. Import the schema in the `TOOL_SCHEMAS` dictionary:
```python
from tools.schemas import (
    # ... existing imports
    MyToolArgs,
)

TOOL_SCHEMAS: Dict[str, Type[BaseModel]] = {
    # ... existing tools
    "my_remote_tool": MyToolArgs,
}
```

2. Register the execution function in `_register_tools()`:
```python
def _register_tools(self):
    # ... existing registrations
    
    try:
        from tools.my_domain.my_tool import execute_my_remote_tool
        self.tools["my_remote_tool"] = execute_my_remote_tool
    except ImportError as e:
        logger.warning(f"Failed to import my_tool: {e}")
```

## Creating a Backend Tool

Backend tools execute directly on the backend server. They have access to backend services like memory, LLM clients, and plugins.

### Step 1: Create Pydantic Schema

Create a schema file in `backend/src/tools/<domain>/schemas.py`:

```python
from pydantic import BaseModel, Field

class MyBackendToolArgs(BaseModel):
    """Arguments for my backend tool."""
    query: str = Field(..., description="Search query")
    limit: int = Field(default=10, description="Result limit")
```

### Step 2: Create Tool Class

Create tool class in `backend/src/tools/<domain>/my_backend_tool.py`:

```python
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.core.interfaces.tool import ToolResult
from backend.src.tools.categorization import ToolDomain
from backend.src.tools.my_domain.schemas import MyBackendToolArgs

class MyBackendTool(Tool[MyBackendToolArgs]):
    """
    My backend tool.
    
    Executes on the backend server.
    """
    
    name = "my_backend_tool"
    description = "Description of my backend tool"
    args_model = MyBackendToolArgs
    category = ToolDomain.OTHER
    
    async def run(
        self,
        args: MyBackendToolArgs,
        ctx: ToolContext
    ) -> ToolResult:
        """
        Execute my backend tool.
        
        Args:
            args: Validated tool arguments (Pydantic model)
            ctx: Tool execution context (access to session, config, etc.)
            
        Returns:
            ToolResult with success status and data
        """
        # Tool execution logic
        query = args.query
        limit = args.limit
        
        # Access backend services via context
        # config = ctx.config
        # session = ctx.session
        
        result = f"Searched for: {query} (limit: {limit})"
        
        return ToolResult(
            success=True,
            content=result,
            metadata={"query": query, "limit": limit}
        )
```

### Step 3: Register Tool

Register the tool in `backend/src/tools/registry.py`:

```python
from backend.src.tools.my_domain.my_backend_tool import MyBackendTool

# In ToolRegistry.__init__ or a registration method:
tool_registry.register_tool(MyBackendTool())
```

## Tool Schema

### Schema Format

Tool schemas use Pydantic models, which automatically generate JSON Schema:

```python
from pydantic import BaseModel, Field
from typing import Literal

class MouseControlArgs(BaseModel):
    """Arguments for mouse control tool."""
    action: Literal["click", "double_click", "right_click"] = Field(
        ..., 
        description="Mouse action to perform"
    )
    x: int = Field(..., description="X coordinate", ge=0)
    y: int = Field(..., description="Y coordinate", ge=0)
```

This automatically generates JSON Schema:
```json
{
  "type": "object",
  "properties": {
    "action": {
      "type": "string",
      "enum": ["click", "double_click", "right_click"],
      "description": "Mouse action to perform"
    },
    "x": {
      "type": "integer",
      "description": "X coordinate",
      "minimum": 0
    },
    "y": {
      "type": "integer",
      "description": "Y coordinate",
      "minimum": 0
    }
  },
  "required": ["action", "x", "y"]
}
```

### Schema Best Practices

1. **Use Pydantic Models**: Define schemas as Pydantic `BaseModel` classes
2. **Clear Descriptions**: Provide clear parameter descriptions using `Field(..., description="...")`
3. **Type Validation**: Use appropriate types (str, int, bool, Literal for enums)
4. **Required Fields**: Use `Field(...)` for required fields, `Field(default=...)` for optional
5. **Constraints**: Add constraints using `ge`, `le`, `min_length`, `max_length`, etc.
6. **Enums**: Use `Literal` for limited options

## Tool Execution Context

### ToolContext (`sdk/context.py`)

Tools receive a `ToolContext` object that combines Identity (User/Session) with Runtime Capabilities.

**Structure**:
```python
@dataclass
class ToolContext:
    user: UserContext      # Identity: Who is performing the action?
    session: SessionContext  # Identity: In what context is this happening?
    runtime: ExecutionRuntime  # Capabilities: What can the tool do?
```

**UserContext**:
- `user_id`: User identifier
- `username`: Optional username
- `permissions`: List of user permissions

**SessionContext**:
- `session_id`: Session identifier
- `created_at`: Session creation timestamp
- `metadata`: Dictionary for session-specific metadata

**ExecutionRuntime**:
- `workspace_root`: Workspace root directory
- `services`: Dictionary of available services
- Properties: `agents` (AgentFactory), `file_service`

**Shortcuts** (for backward compatibility):
- `workspace_root`: Direct access to runtime.workspace_root
- `services`: Direct access to runtime.services
- `agents`: Direct access to runtime.agents
- `is_interactive`: Always True

### Using Context

```python
async def run(self, args: MyToolArgs, ctx: ToolContext) -> ToolResult:
    # Access user identity
    user_id = ctx.user.user_id
    permissions = ctx.user.permissions
    
    # Access session context
    session_id = ctx.session.session_id
    metadata = ctx.session.metadata
    
    # Access runtime capabilities
    workspace = ctx.workspace_root
    agent_factory = ctx.agents  # AgentFactory for creating sub-agents
    
    # Access services
    file_service = ctx.runtime.file_service
    
    # ...
```

### SDK Exceptions (`sdk/errors.py`)

SDK-specific exception classes for tool development.

**Exception Hierarchy**:
- `SDKError`: Base exception for all SDK errors
- `ToolExecutionError`: Raised when a tool fails to execute
  - `retryable`: Boolean indicating if error is retryable
- `ConfigurationError`: Raised when a tool is misconfigured

**Usage**:
```python
from backend.src.sdk.errors import ToolExecutionError

async def run(self, args: MyToolArgs, ctx: ToolContext) -> ToolResult:
    try:
        # Tool execution
        result = await do_work(args)
        return ToolResult(success=True, content=result)
    except SomeError as e:
        # Raise SDK exception
        raise ToolExecutionError(
            message=f"Tool execution failed: {str(e)}",
            retryable=True
        ) from e
```

## Tool Result Format

### Success Result

```python
from backend.src.core.interfaces.tool import ToolResult

ToolResult(
    success=True,
    content="Tool executed successfully",  # Main content for LLM
    metadata={"result": "...", "additional": "data"}  # Optional metadata
)
```

### Error Result

```python
ToolResult(
    success=False,
    content="Tool execution failed: error message",  # Error message for LLM
    error="error message",  # Optional error details
    metadata={"error_code": "ERROR_CODE"}  # Optional error metadata
)
```

### Frontend Tool Result

Frontend tools return `ToolResult` objects (from `tools.result`):

```python
from tools.result import ToolResult

ToolResult(
    success=True,
    llm_content="Tool executed successfully",  # Content for LLM
    return_display="Success",  # Display message for UI
    result="..."  # Optional result data
)
```

## Automatic Screenshot Capture

### Screenshot Capture Behavior

Screenshots are automatically captured for computer-use tools (mouse_control, keyboard_control, scroll_control, etc.):

- **Individual Tools**: Screenshot captured **once** after tool execution completes
- **Bundled Tools**: Screenshot captured **once** after all bundled tools execute (not after each individual tool)

Both use the same helper method (`captureSystemStateAndScreenshot`) which:
- Waits 2 seconds before capture (allows UI to update)
- Captures system state and screenshot in parallel for efficiency
- Provides consistent error handling and timing logs

### Screenshot in Results

Screenshots are automatically included in tool results:

```python
# Frontend tool automatically includes screenshot
return ToolResult(
    success=True,
    llm_content="Tool executed",
    # Screenshot is automatically added by ToolExecutionService
)
```

## Tool Testing

### Unit Testing

```python
import pytest
from backend.src.tools.my_tool import MyTool
from backend.src.sdk.context import ToolContext
from backend.src.tools.my_domain.schemas import MyToolArgs

@pytest.mark.asyncio
async def test_my_tool():
    tool = MyTool()
    context = ToolContext(...)
    
    args = MyToolArgs(param1="value", param2=10)
    result = await tool.run(args, context)
    
    assert result.success
    assert "value" in result.content
```

### Integration Testing

```python
@pytest.mark.asyncio
async def test_tool_execution_flow():
    # Test tool call generation
    # Test tool preparation
    # Test tool execution
    # Test result processing
```

## Best Practices

### Error Handling

- Always handle exceptions
- Return meaningful error messages
- Log errors for debugging
- Use `ToolResult` with `success=False` for errors

### Performance

- Use async/await for I/O operations
- Batch operations when possible
- Cache expensive computations
- Offload blocking operations to thread pool

### Security

- Validate all inputs using Pydantic schemas
- Sanitize user data
- Set resource limits
- Use type-safe argument models

### Documentation

- Document tool purpose in class docstring
- Document parameters in Pydantic Field descriptions
- Provide examples in docstrings
- Use clear, descriptive names

## Examples

### Example: Remote File Reading Tool

**Backend Stub** (`backend/src/tools/remote.py`):
```python
class RemoteReadFileTool(Tool[ReadFileArgs], RemoteToolBase):
    name = "read_file"
    description = "Read file contents"
    args_model = ReadFileArgs
    category = ToolDomain.FILESYSTEM
    
    async def execute_remote(self, args: ReadFileArgs, ctx: ToolContext) -> RemoteToolResult:
        request_id = self._get_request_id(ctx)
        return RemoteToolResult(
            tool_name="read_file",
            args=args.model_dump(),
            request_id=request_id
        )
```

**Frontend Implementation** (`frontend/src/main/python/tools/filesystem/read_file_tool.py`):
```python
async def read_file(args: Dict[str, Any]) -> ToolResult:
    try:
        validated_args = ReadFileArgs(**args)
        file_path = validated_args.file_path
        
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        
        return ToolResult(
            success=True,
            llm_content=f"Read file: {file_path}\n\n{content}",
            return_display=f"Read {file_path}",
            result=content
        )
    except Exception as e:
        return ToolResult(
            success=False,
            error=f"Failed to read file: {str(e)}"
        )
```

### Example: Backend Memory Search Tool

```python
class MemorySearchTool(Tool[MemorySearchArgs]):
    name = "memory_search"
    description = "Search memory for relevant information"
    args_model = MemorySearchArgs
    category = ToolDomain.MEMORY
    
    async def run(self, args: MemorySearchArgs, ctx: ToolContext) -> ToolResult:
        query = args.query
        limit = args.limit
        
        # Access memory service via context
        # (implementation depends on how memory is accessed)
        
        results = []  # Search memory
        
        return ToolResult(
            success=True,
            content=f"Found {len(results)} results for: {query}",
            metadata={"results": results}
        )
```

## Troubleshooting

### Tool Not Executing

1. Check tool registration in `ToolRegistry`
2. Verify tool schema matches implementation
3. Check tool name matches between backend and frontend
4. Review error logs for validation errors

### Tool Execution Errors

1. Check error messages in tool result
2. Verify Pydantic schema validation
3. Review tool implementation
4. Check resource limits and permissions

### Tool Not Appearing

1. Check tool registration in both backend and frontend
2. Verify tool schema is valid Pydantic model
3. Restart application to reload registrations
4. Check tool registry logs for registration errors

---

For more information, see:
- [Tool System](TOOL_SYSTEM.md) - Tool system architecture
- [API Reference](API_REFERENCE.md) - WebSocket API details
- [Developer Guide](DEVELOPER_GUIDE.md) - General development guide
