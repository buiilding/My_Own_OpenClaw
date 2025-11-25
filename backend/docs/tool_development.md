# SDK Tool Development Guide

This guide explains how to develop tools for the Desktop Assistant using the SDK tool system.

## Table of Contents

1. [Overview](#overview)
2. [Tool Structure](#tool-structure)
3. [Creating a Tool](#creating-a-tool)
4. [Tool Arguments](#tool-arguments)
5. [Tool Execution](#tool-execution)
6. [Accessing Services](#accessing-services)
7. [Return Values](#return-values)
8. [Tool Capabilities](#tool-capabilities)
9. [Testing Tools](#testing-tools)
10. [Marketplace Tools](#marketplace-tools)

---

## Overview

Tools extend the agent's capabilities. They are executed by the agent based on LLM decisions and can perform various operations like file manipulation, system commands, API calls, etc.

All tools must inherit from `backend.src.sdk.tool.Tool` and use Pydantic for argument validation.

---

## Tool Structure

A tool consists of:

1. **Arguments Model**: Pydantic model defining input parameters
2. **Tool Class**: Inherits from `Tool[ArgsModel]`
3. **Execution Method**: `run()` method that performs the operation

---

## Creating a Tool

### Basic Template

```python
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context
from pydantic import BaseModel, Field
from typing import Optional

class MyToolArgs(BaseModel):
    """Arguments for MyTool."""
    input_param: str = Field(..., description="Description of input parameter")
    optional_param: Optional[int] = Field(None, description="Optional parameter")

class MyTool(Tool[MyToolArgs]):
    """Tool that does something useful."""
    
    name = "my_tool"
    description = "A clear description of what this tool does"
    args_model = MyToolArgs
    
    async def run(self, args: MyToolArgs, ctx: Context) -> dict:
        """
        Execute the tool.
        
        Args:
            args: Validated arguments
            ctx: Execution context with services and workspace info
            
        Returns:
            Dictionary with execution results
        """
        # Your tool logic here
        result = process(args.input_param)
        
        return {
            "success": True,
            "llm_content": f"Processed: {result}",
            "return_display": f"Result: {result}"
        }
```

---

## Tool Arguments

### Using Pydantic Models

Arguments are validated using Pydantic models:

```python
from pydantic import BaseModel, Field, validator

class FileOperationArgs(BaseModel):
    file_path: str = Field(..., description="Path to the file")
    operation: str = Field(..., description="Operation to perform")
    content: Optional[str] = Field(None, description="Content for write operations")
    
    @validator('operation')
    def validate_operation(cls, v):
        allowed = ['read', 'write', 'delete']
        if v not in allowed:
            raise ValueError(f"Operation must be one of {allowed}")
        return v
```

### Field Descriptions

Always provide clear descriptions for fields - these are used by the LLM to understand the tool:

```python
class SearchArgs(BaseModel):
    query: str = Field(
        ...,
        description="Search query string. Can include wildcards and operators."
    )
    limit: int = Field(
        10,
        description="Maximum number of results to return (default: 10)"
    )
```

---

## Tool Execution

### The `run()` Method

The `run()` method is async and receives:
- `args`: Validated arguments (instance of your args model)
- `ctx`: Context object with services and workspace information

```python
async def run(self, args: MyToolArgs, ctx: Context) -> dict:
    # Access workspace root
    workspace_root = ctx.workspace_root
    
    # Access services
    config = ctx.services.get("config")
    file_service = ctx.services.get("file_service")
    
    # Your logic here
    pass
```

---

## Accessing Services

Services are available through `ctx.services.get()`:

### Available Services

- `config`: Application configuration (`AppConfig`)
- `file_service`: File operations service
- `workspace_context`: Workspace context
- `storage`: Storage service

### Example

```python
async def run(self, args: MyToolArgs, ctx: Context) -> dict:
    # Get configuration
    config = ctx.services.get("config")
    max_size = config.max_file_size
    
    # Get file service
    file_service = ctx.services.get("file_service")
    if file_service.should_ignore_file(args.file_path, {}):
        return {"error": "File is ignored"}
    
    # Your logic
    pass
```

---

## Return Values

Tools must return a dictionary with the following structure:

```python
{
    "success": bool,              # Whether execution succeeded
    "llm_content": str,           # Content for LLM context (required)
    "return_display": str,        # Human-readable result (optional)
    "error": str,                 # Error message if failed (optional)
    "artifacts": dict,            # Additional data (screenshots, files, etc.)
    "episodic_memories": list,    # Memories to store (optional)
    "semantic_facts": list,       # Facts to extract (optional)
}
```

### Return Examples

#### Success

```python
return {
    "success": True,
    "llm_content": "File 'test.txt' created successfully with 42 bytes",
    "return_display": "✓ Created test.txt (42 bytes)"
}
```

#### Error

```python
return {
    "success": False,
    "error": "File already exists",
    "llm_content": "Error: File 'test.txt' already exists"
}
```

#### With Artifacts

```python
return {
    "success": True,
    "llm_content": "Screenshot captured",
    "return_display": "Screenshot saved",
    "artifacts": {
        "screenshot": base64_image_data
    }
}
```

---

## Tool Capabilities

Tools can declare capabilities that affect how they're handled:

```python
class MyTool(Tool[MyToolArgs]):
    # ... other fields ...
    
    def get_capabilities(self) -> Dict[str, Any]:
        return {
            "requires_screenshot": True,  # Auto-capture screenshot after execution
            "modifies_filesystem": True,   # Tool modifies files
            "network_access": False,       # Tool accesses network
            "timeout": 30.0                # Execution timeout in seconds
        }
```

### Capability Flags

- `requires_screenshot`: If True, a screenshot is automatically captured after execution
- `modifies_filesystem`: If True, tool modifies files on disk
- `network_access`: If True, tool makes network requests
- `timeout`: Execution timeout in seconds

---

## Testing Tools

### Unit Testing

```python
import pytest
from backend.src.sdk.context import Context
from my_tool import MyTool, MyToolArgs

@pytest.mark.asyncio
async def test_my_tool():
    tool = MyTool()
    args = MyToolArgs(input_param="test")
    
    # Create mock context
    ctx = Context(
        workspace_root="/workspace",
        services={"config": mock_config}
    )
    
    result = await tool.run(args, ctx)
    
    assert result["success"] is True
    assert "llm_content" in result
```

---

## Marketplace Tools

Marketplace tools are external tools that can be loaded dynamically.

### Tool Manifest

Create a `manifest.json` file:

```json
{
    "name": "my_tool",
    "version": "1.0.0",
    "description": "Tool description",
    "author": "Your Name",
    "entry_point": "tool.py",
    "dependencies": [],
    "capabilities": {
        "requires_screenshot": false,
        "modifies_filesystem": true
    }
}
```

### Tool File Structure

```
my_tool/
├── manifest.json
├── tool.py
└── README.md
```

### Security

Marketplace tools are scanned for security issues before loading. See `backend/src/tools/marketplace/discovery/security.py` for details.

---

## Best Practices

1. **Clear Descriptions**: Provide clear, detailed descriptions for the tool and all parameters
2. **Error Handling**: Always handle errors gracefully and return informative error messages
3. **Validation**: Use Pydantic validators for complex validation logic
4. **Logging**: Use logging for debugging (avoid print statements)
5. **Documentation**: Document your tool's purpose, parameters, and behavior
6. **Testing**: Write comprehensive tests for your tool
7. **Performance**: Keep tool execution fast; defer heavy work if needed
8. **Idempotency**: Make tools idempotent when possible (safe to run multiple times)

---

## Examples

See existing tools in `backend/src/tools/` for reference:
- `write_file_tool.py`: File writing
- `shell_tool.py`: System command execution
- `click_ocr_tool.py`: Computer interaction

