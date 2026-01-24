# Tool Development Guide

## Overview

This guide explains how to create custom tools for Desktop Assistant. Tools enable the assistant to interact with the computer and perform various tasks.

## Tool Architecture

### Tool Types

**Remote Tools** (Frontend Execution):
- Executed on Python sidecar
- Access to system resources
- Automatic screenshot capture

**Backend Tools**:
- Executed on backend
- Access to backend services
- Memory and LLM integration

## Creating a Remote Tool

### Step 1: Create Backend Stub

Create a tool stub in `backend/src/tools/remote.py`:

```python
from backend.src.tools.remote import RemoteTool
from backend.src.sdk.context import ToolContext
from backend.src.core.interfaces.tool import ToolResult

class MyRemoteTool(RemoteTool):
    name = "my_remote_tool"
    description = "Description of my remote tool"
    
    def get_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "param1": {
                    "type": "string",
                    "description": "Parameter 1 description"
                },
                "param2": {
                    "type": "integer",
                    "description": "Parameter 2 description"
                }
            },
            "required": ["param1"]
        }
```

### Step 2: Create Frontend Implementation

Create tool implementation in `frontend/src/main/python/tools/my_tool.py`:

```python
"""
My Remote Tool - Frontend implementation.
"""
import asyncio
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

async def execute_my_remote_tool(args: Dict[str, Any]) -> Dict[str, Any]:
    """
    Execute my remote tool.
    
    Args:
        args: Tool arguments
        
    Returns:
        Tool execution result
    """
    try:
        param1 = args.get("param1")
        param2 = args.get("param2", 0)
        
        # Tool execution logic
        result = f"Processed {param1} with {param2}"
        
        return {
            "success": True,
            "data": {
                "llm_content": f"My tool executed: {result}",
                "return_display": "Success",
                "result": result
            }
        }
    except Exception as e:
        logger.error(f"My tool failed: {e}", exc_info=True)
        return {
            "success": False,
            "error": f"My tool failed: {str(e)}"
        }
```

### Step 3: Register Tool

Register tool in `frontend/src/main/python/core/dispatcher.py`:

```python
from frontend.src.main.python.tools.my_tool import execute_my_remote_tool

TOOL_REGISTRY = {
    "my_remote_tool": execute_my_remote_tool,
    # ... other tools
}
```

## Creating a Backend Tool

### Step 1: Create Tool Class

Create tool class in `backend/src/tools/`:

```python
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.core.interfaces.tool import ToolResult

class MyBackendTool(Tool):
    name = "my_backend_tool"
    description = "Description of my backend tool"
    
    def get_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Search query"
                }
            },
            "required": ["query"]
        }
    
    async def execute(
        self,
        args: dict,
        context: ToolContext
    ) -> ToolResult:
        """
        Execute my backend tool.
        
        Args:
            args: Tool arguments
            context: Tool execution context
            
        Returns:
            Tool execution result
        """
        query = args.get("query")
        
        # Tool execution logic
        result = await self._process_query(query, context)
        
        return ToolResult(
            success=True,
            llm_content=f"Found results for: {query}",
            data={"results": result}
        )
    
    async def _process_query(self, query: str, context: ToolContext) -> list:
        """Process search query."""
        # Implementation
        return []
```

### Step 2: Register Tool

Register tool in tool registry:

```python
from backend.src.tools.my_backend_tool import MyBackendTool

tool_registry.register_tool(MyBackendTool())
```

## Tool Schema

### Schema Format

Tool schemas follow JSON Schema format:

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
  "required": ["action"]
}
```

### Schema Best Practices

1. **Clear Descriptions**: Provide clear parameter descriptions
2. **Type Validation**: Use appropriate types
3. **Required Fields**: Mark required fields
4. **Enums**: Use enums for limited options
5. **Constraints**: Add min/max constraints where appropriate

## Tool Execution Context

### ToolContext

Tools receive a `ToolContext` object:

```python
class ToolContext:
    user_id: str
    session_id: str
    tool_registry: ToolRegistry
    memory_manager: Optional[MemoryManager]
    config: AppConfig
```

### Using Context

```python
async def execute(self, args: dict, context: ToolContext) -> ToolResult:
    # Access user ID
    user_id = context.user_id
    
    # Access memory
    if context.memory_manager:
        memories = await context.memory_manager.search(args["query"])
    
    # Access config
    timeout = context.config.tools.timeout
    
    ...
```

## Tool Result Format

### Success Result

```python
ToolResult(
    success=True,
    llm_content="Tool executed successfully",
    data={
        "result": "...",
        "metadata": {...}
    }
)
```

### Error Result

```python
ToolResult(
    success=False,
    llm_content="Tool execution failed: error message",
    data={
        "error": "error message",
        "error_code": "ERROR_CODE"
    }
)
```

## Automatic Screenshot Capture

### Enabling Automatic Capture

For remote tools, enable automatic screenshot capture:

```python
# In tool schema or metadata
auto_capture_image = "screenshot"
```

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
return {
    "success": True,
    "data": {
        "llm_content": "Tool executed",
        "screenshot": "base64-encoded-screenshot"  # Automatic
    }
}
```

## Tool Testing

### Unit Testing

```python
import pytest
from backend.src.tools.my_tool import MyTool
from backend.src.sdk.context import ToolContext

@pytest.mark.asyncio
async def test_my_tool():
    tool = MyTool()
    context = ToolContext(...)
    
    result = await tool.execute(
        {"param1": "value"},
        context
    )
    
    assert result.success
    assert "value" in result.llm_content
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

### Performance

- Use async/await for I/O operations
- Batch operations when possible
- Cache expensive computations

### Security

- Validate all inputs
- Sanitize user data
- Set resource limits

### Documentation

- Document tool purpose
- Document parameters
- Provide examples

## Examples

### Example: File Reading Tool

```python
class ReadFileTool(Tool):
    name = "read_file"
    description = "Read file contents"
    
    def get_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to file"
                }
            },
            "required": ["file_path"]
        }
    
    async def execute(self, args: dict, context: ToolContext) -> ToolResult:
        file_path = args["file_path"]
        
        try:
            with open(file_path, "r") as f:
                content = f.read()
            
            return ToolResult(
                success=True,
                llm_content=f"Read file: {file_path}",
                data={"content": content}
            )
        except Exception as e:
            return ToolResult(
                success=False,
                llm_content=f"Failed to read file: {str(e)}",
                data={"error": str(e)}
            )
```

### Example: API Call Tool

```python
class APICallTool(Tool):
    name = "api_call"
    description = "Make API call"
    
    async def execute(self, args: dict, context: ToolContext) -> ToolResult:
        import aiohttp
        
        url = args["url"]
        method = args.get("method", "GET")
        
        async with aiohttp.ClientSession() as session:
            async with session.request(method, url) as response:
                data = await response.json()
                
                return ToolResult(
                    success=True,
                    llm_content=f"API call successful",
                    data={"response": data}
                )
```

## Troubleshooting

### Tool Not Executing

1. Check tool registration
2. Verify tool schema
3. Check tool name matches
4. Review error logs

### Tool Execution Errors

1. Check error messages
2. Verify input validation
3. Review tool implementation
4. Check resource limits

### Tool Not Appearing

1. Check tool registration
2. Verify tool schema
3. Restart application
4. Check tool registry

---

For more information, see:
- [Tool System](TOOL_SYSTEM.md)
- [API Reference](API_REFERENCE.md)
- [Developer Guide](DEVELOPER_GUIDE.md)
