# Marketplace Tool Development Guide

This guide explains how to create tools for the Desktop Assistant marketplace using the modern SDK.

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Tool Structure](#tool-structure)
4. [SDK Pattern](#sdk-pattern)
5. [Tool Registration](#tool-registration)
6. [Testing](#testing)
7. [Best Practices](#best-practices)
8. [Examples](#examples)

## Overview

All marketplace tools must:
- Inherit from `Tool[TArgs]` where `TArgs` is a Pydantic model
- Use `Context` for execution context
- Return a dict with `success`, `data`, `llm_content`, and `return_display`
- Be registered via entry points or manifest.json

## Quick Start

1. **Copy the template:**
   ```bash
   cp tools/verified/example_tool/tool_template.py tools/verified/your_tool/tool.py
   ```

2. **Update the tool:**
   - Rename `YourTool` to your tool class name
   - Update `name` and `description`
   - Define your arguments model
   - Implement `run()` method

3. **Create manifest.json:**
   ```bash
   cp tools/verified/example_tool/manifest_template.json tools/verified/your_tool/manifest.json
   ```

4. **Register your tool:**
   - Add entry point in `setup.py` or `pyproject.toml`
   - Or place in `tools/verified/your_tool/` with manifest.json

5. **Test your tool:**
   ```python
   # Test script
   from your_tool.tool import YourTool
   tool = YourTool()
   # Test with sample args
   ```

## Tool Structure

### Directory Structure

```
tools/verified/your_tool/
├── tool.py              # Your tool implementation
├── manifest.json         # Tool metadata and schema
├── README.md            # Tool documentation (optional)
└── requirements.txt     # Dependencies (optional)
```

### File: tool.py

Your tool must follow this structure:

```python
from typing import Dict, Any
from pydantic import BaseModel, Field
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context

class YourToolArgs(BaseModel):
    param: str = Field(..., description="Parameter description")

class YourTool(Tool[YourToolArgs]):
    name = "your_tool_name"
    description = "Tool description"
    args_model = YourToolArgs

    async def run(self, args: YourToolArgs, ctx: Context) -> Dict[str, Any]:
        # Your implementation
        return {
            "success": True,
            "data": {...},
            "llm_content": "...",
            "return_display": "..."
        }
```

## SDK Pattern

### 1. Arguments Model (Pydantic)

Define your tool's arguments using Pydantic:

```python
from pydantic import BaseModel, Field

class MyToolArgs(BaseModel):
    # Required parameter
    path: str = Field(..., description="Path to file")
    
    # Optional with default
    mode: str = Field(default="read", description="File mode")
    
    # Boolean flag
    recursive: bool = Field(default=False, description="Recursive operation")
    
    # List parameter
    tags: list[str] = Field(default_factory=list, description="Tags")
```

**Field descriptions are critical** - they help the LLM understand how to use your tool.

### 2. Tool Class

Inherit from `Tool[TArgs]`:

```python
class MyTool(Tool[MyToolArgs]):
    name = "my_tool"  # Must be snake_case, unique
    description = "Clear description of what the tool does"
    args_model = MyToolArgs  # Link to your args model
```

### 3. Implementation

Implement the `run()` method:

```python
async def run(self, args: MyToolArgs, ctx: Context) -> Dict[str, Any]:
    # Access context
    user_id = ctx.user.user_id
    workspace = ctx.workspace_root
    
    # Access services (if needed)
    file_service = ctx.services.get("file_service")
    
    # Your logic here
    result = await do_something(args.path)
    
    # Return result
    return {
        "success": True,
        "data": {"result": result},
        "llm_content": f"Operation completed: {result}",
        "return_display": "Success!"
    }
```

### 4. Return Format

Always return a dict with these fields:

- `success` (bool): Whether execution succeeded
- `data` (Any): Tool-specific result data
- `llm_content` (str): Content for LLM to read and reason about
- `return_display` (str): User-friendly message
- `error` (str, optional): Error message if success=False

## Tool Registration

### Method 1: Entry Points (Recommended)

Add to `setup.py` or `pyproject.toml`:

```python
# setup.py
setup(
    ...
    entry_points={
        "desktop_assistant.marketplace_tools": [
            "your_tool = your_tool.tool:YourTool",
        ],
    },
)
```

```toml
# pyproject.toml
[project.entry-points."desktop_assistant.marketplace_tools"]
your_tool = "your_tool.tool:YourTool"
```

### Method 2: Filesystem Discovery

Place your tool in `tools/verified/your_tool/` with:
- `tool.py` containing your tool class
- `manifest.json` with metadata

The system will auto-discover it.

## Testing

### Unit Testing

```python
import pytest
from your_tool.tool import YourTool, YourToolArgs
from backend.src.sdk.context import Context, UserContext, SessionContext

@pytest.mark.asyncio
async def test_your_tool():
    tool = YourTool()
    args = YourToolArgs(param="test")
    ctx = Context(
        user=UserContext(user_id="test_user"),
        session=SessionContext(session_id="test_session"),
        workspace_root="/tmp"
    )
    
    result = await tool.run(args, ctx)
    assert result["success"] == True
    assert "data" in result
```

### Integration Testing

Test with the actual tool registry:

```python
from backend.src.tools.registry import ToolRegistry
from backend.src.core.config import get_config_manager

async def test_tool_integration():
    config = get_config_manager().load_config()
    registry = ToolRegistry(config=config, ...)
    
    # Register your tool
    registry.register_tool(YourTool())
    
    # Execute via registry
    result = await registry.execute_tool(
        "your_tool",
        parameters={"param": "test"},
        user_id="test_user",
        session_id="test_session"
    )
    
    assert result["success"] == True
```

## Best Practices

### 1. Tool Design

- **Single Responsibility**: Each tool should do one thing well
- **Stateless**: Tools should not maintain state between calls
- **Idempotent**: When possible, tools should be safe to retry
- **Descriptive Names**: Use clear, descriptive names and descriptions

### 2. Error Handling

Always handle errors gracefully:

```python
try:
    result = await risky_operation()
    return {"success": True, "data": result, ...}
except SpecificError as e:
    logger.error(f"Specific error: {e}")
    return {"success": False, "error": str(e), ...}
except Exception as e:
    logger.error(f"Unexpected error: {e}", exc_info=True)
    return {"success": False, "error": "Operation failed", ...}
```

### 3. Logging

Use structured logging:

```python
import logging
logger = logging.getLogger(__name__)

logger.info(f"Tool {self.name} executed for user {ctx.user.user_id}")
logger.debug(f"Tool args: {args}")
logger.error(f"Tool failed: {e}", exc_info=True)
```

### 4. Context Usage

Access services via context:

```python
# Good: Access via context
file_service = ctx.services.get("file_service")
if file_service:
    result = await file_service.read_file(path)

# Bad: Don't inject dependencies in __init__
# self.file_service = ...  # Don't do this
```

### 5. Argument Validation

Use Pydantic for validation:

```python
from pydantic import BaseModel, Field, field_validator

class MyToolArgs(BaseModel):
    path: str = Field(..., description="File path")
    
    @field_validator("path")
    @classmethod
    def validate_path(cls, v: str) -> str:
        if not v.startswith("/"):
            raise ValueError("Path must be absolute")
        return v
```

### 6. Documentation

- Add docstrings to your tool class
- Document complex logic
- Include examples in docstrings
- Update README.md with usage examples

## Examples

### Example 1: Simple Tool

```python
from typing import Dict, Any
from pydantic import BaseModel, Field
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context

class EchoArgs(BaseModel):
    message: str = Field(..., description="Message to echo")

class EchoTool(Tool[EchoArgs]):
    name = "echo"
    description = "Echoes a message back"
    args_model = EchoArgs

    async def run(self, args: EchoArgs, ctx: Context) -> Dict[str, Any]:
        return {
            "success": True,
            "data": {"echoed": args.message},
            "llm_content": f"Echoed: {args.message}",
            "return_display": args.message
        }
```

### Example 2: File Operation Tool

```python
from pathlib import Path
from typing import Dict, Any
from pydantic import BaseModel, Field
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context

class ReadFileArgs(BaseModel):
    path: str = Field(..., description="Path to file to read")

class ReadFileTool(Tool[ReadFileArgs]):
    name = "read_file"
    description = "Reads a file and returns its contents"
    args_model = ReadFileArgs

    async def run(self, args: ReadFileArgs, ctx: Context) -> Dict[str, Any]:
        file_service = ctx.services.get("file_service")
        if not file_service:
            return {
                "success": False,
                "error": "File service not available",
                "llm_content": "Error: File service not available",
                "return_display": "Error: File service not available"
            }
        
        try:
            full_path = Path(ctx.workspace_root) / args.path
            content = await file_service.read_file(str(full_path))
            
            return {
                "success": True,
                "data": {"content": content, "path": str(full_path)},
                "llm_content": f"File contents:\n{content}",
                "return_display": f"Read {len(content)} bytes from {args.path}"
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "llm_content": f"Error reading file: {e}",
                "return_display": f"Error: {e}"
            }
```

## Common Patterns

### Accessing Services

```python
# File service
file_service = ctx.services.get("file_service")
if file_service:
    content = await file_service.read_file(path)

# Storage service
storage_service = ctx.services.get("storage_service")
if storage_service:
    data = await storage_service.get(key)

# Tool registry (for calling other tools)
tool_registry = ctx.services.get("tool_registry")
if tool_registry:
    result = await tool_registry.execute_tool("other_tool", {...})
```

### Working with Workspace

```python
from pathlib import Path

# Get workspace root
workspace = Path(ctx.workspace_root)

# Resolve relative paths
file_path = workspace / args.relative_path

# Check if file exists
if file_path.exists():
    # Process file
    pass
```

### User/Session Info

```python
# User information
user_id = ctx.user.user_id
username = ctx.user.username
permissions = ctx.user.permissions

# Session information
session_id = ctx.session.session_id
session_metadata = ctx.session.metadata
```

## Troubleshooting

### Tool Not Discovered

- Check entry point registration
- Verify tool class name matches manifest.json
- Check tool is in `tools/verified/` directory
- Review discovery service logs

### Tool Execution Fails

- Check error logs for details
- Verify arguments match Pydantic model
- Ensure all dependencies are available
- Test tool in isolation first

### Context Services Missing

- Services are injected by ContextFactory
- Check if service is registered in container
- Verify service name matches exactly
- Some services may be optional

## Next Steps

1. Review the example tool: `tools/verified/example_tool/tool.py`
2. Copy the template: `tools/verified/example_tool/tool_template.py`
3. Create your tool following this guide
4. Test thoroughly
5. Submit for review

## Support

For questions or issues:
- Check existing tools for examples
- Review SDK documentation: `backend/src/sdk/`
- Ask in development channels
- Create an issue with details

