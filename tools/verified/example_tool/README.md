# Example Tool

This is an example marketplace tool that demonstrates how to create tools for the Personal Assistant using the SDK.

## Overview

The Example Tool is a simple utility that echoes back a message with a greeting. It's designed to demonstrate the complete tool development workflow using the Personal Assistant SDK.

## Structure

- `manifest.json` - Tool metadata, permissions, and configuration
- `tool.py` - Main tool implementation using the SDK
- `tool_template.py` - Template for creating new tools
- `manifest_template.json` - Template for tool manifests
- `README.md` - This documentation

## Tool Description

The Example Tool demonstrates:
- **Pydantic Argument Validation**: Type-safe argument handling
- **Context Access**: Accessing user and session information
- **Standardized Response Format**: Proper success/error responses
- **Logging**: Integrated logging with context
- **Error Handling**: Graceful error management

## Usage

### Direct SDK Usage

```python
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context

# Tool is automatically registered by the system
# Direct instantiation:
tool = ExampleTool()
result = await tool.run(
    args=ExampleArgs(message="Hello, world!"),
    ctx=context
)
```

### LLM Integration

The tool can be called by the agent through natural language:

```
"Use the example tool to say hello"
"Greet the user with a custom message"
```

### Parameters

```python
class ExampleArgs(BaseModel):
    message: str = Field(
        default="Hello from the example tool!",
        description="The message to echo back"
    )
```

## Implementation

### Tool Class

```python
from typing import Dict, Any
from pydantic import BaseModel, Field
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import Context

class ExampleArgs(BaseModel):
    message: str = Field(
        default="Hello from the example tool!",
        description="The message to echo back"
    )

class ExampleTool(Tool[ExampleArgs]):
    name = "example_tool"
    description = "A simple example tool that echoes messages"
    args_model = ExampleArgs

    async def run(self, args: ExampleArgs, ctx: Context) -> Dict[str, Any]:
        """Execute the example tool logic."""

        # Log the execution
        ctx.logger.info(f"Example tool called by user {ctx.user.user_id}")

        # Simulate some processing
        processed_message = f"🤖 {args.message}"

        return {
            "success": True,
            "data": {
                "original_message": args.message,
                "processed_message": processed_message,
                "timestamp": ctx.session.created_at
            },
            "llm_content": processed_message,
            "return_display": processed_message
        }
```

### Manifest Configuration

```json
{
    "name": "example_tool",
    "version": "1.0.0",
    "description": "A simple example tool that echoes messages",
    "author": "Personal Assistant Team",
    "category": "utility",
    "tool_class_name": "ExampleTool",
    "permissions": [],
    "is_destructive": false,
    "tags": ["example", "utility", "demonstration"]
}
```

## Response Format

### Success Response

```python
{
    "success": True,
    "data": {
        "original_message": "Hello, world!",
        "processed_message": "🤖 Hello, world!",
        "timestamp": 1234567890.123
    },
    "llm_content": "🤖 Hello, world!",
    "return_display": "🤖 Hello, world!"
}
```

### Error Response

```python
{
    "success": False,
    "data": {
        "error": "Invalid input provided",
        "error_type": "ValidationError"
    },
    "llm_content": "Error: Invalid input provided",
    "return_display": "❌ Tool failed: Invalid input provided"
}
```

## Development Workflow

### 1. Create Tool Arguments

Define your tool's arguments using Pydantic:

```python
class MyToolArgs(BaseModel):
    input_param: str = Field(..., description="Description of parameter")
    optional_param: Optional[int] = Field(None, description="Optional parameter")
```

### 2. Implement Tool Class

Create a class inheriting from `Tool[YourArgs]`:

```python
class MyTool(Tool[MyToolArgs]):
    name = "my_tool"
    description = "What my tool does"
    args_model = MyToolArgs

    async def run(self, args: MyToolArgs, ctx: Context) -> Dict[str, Any]:
        # Your implementation here
        pass
```

### 3. Create Manifest

Define tool metadata in `manifest.json`:

```json
{
    "name": "my_tool",
    "version": "1.0.0",
    "description": "Tool description",
    "author": "Your Name",
    "category": "utility",
    "tool_class_name": "MyTool",
    "permissions": ["required_permissions"],
    "is_destructive": false
}
```

### 4. Test Tool

Test your tool implementation:

```python
# Create mock context
ctx = Context(
    user=UserContext(user_id="test", permissions=["*"]),
    session=SessionContext(session_id="test"),
    workspace_root="/tmp",
    services={},
    agents=None
)

# Test tool execution
tool = MyTool()
result = await tool.run(args=MyToolArgs(...), ctx=ctx)
assert result["success"] is True
```

## Best Practices

### Error Handling
```python
async def run(self, args: MyArgs, ctx: Context) -> Dict[str, Any]:
    try:
        # Tool logic
        result = risky_operation(args.input)
        return {"success": True, "data": result}
    except ValueError as e:
        raise ValidationError(f"Invalid input: {e}")
    except Exception as e:
        ctx.logger.error(f"Tool execution failed: {e}")
        return {
            "success": False,
            "data": {"error": str(e)},
            "llm_content": f"Error: {e}",
            "return_display": f"❌ Tool failed: {e}"
        }
```

### Permission Checking
```python
async def run(self, args: MyArgs, ctx: Context) -> Dict[str, Any]:
    # Check permissions
    if not self._has_permission(ctx, "required_permission"):
        raise PermissionError("Insufficient permissions")

    # Proceed with execution
    ...

def _has_permission(self, ctx: Context, permission: str) -> bool:
    return permission in ctx.user.permissions
```

### Logging
```python
async def run(self, args: MyArgs, ctx: Context) -> Dict[str, Any]:
    ctx.logger.info(f"Executing tool for user {ctx.user.user_id}")
    ctx.logger.debug(f"Arguments: {args}")

    # Tool execution
    result = await self._execute(args)

    ctx.logger.info("Tool execution completed successfully")
    return result
```

## Security Considerations

### Permissions
- **Minimal Permissions**: Request only necessary permissions
- **Runtime Validation**: Always validate permissions at runtime
- **Secure Defaults**: Default to restrictive permissions

### Input Validation
- **Type Safety**: Use Pydantic for automatic validation
- **Sanitization**: Clean and validate all inputs
- **Bounds Checking**: Validate input ranges and sizes

### Resource Limits
- **Execution Time**: Implement reasonable timeouts
- **Memory Usage**: Monitor and limit memory consumption
- **Rate Limiting**: Prevent abuse through rate limiting

## Distribution

### Marketplace Submission
1. **Test Thoroughly**: Ensure tool works in all scenarios
2. **Documentation**: Provide comprehensive README
3. **Security Review**: Verify no security vulnerabilities
4. **Manifest Validation**: Ensure manifest is complete and accurate

### Community Guidelines
- **Quality Standards**: Follow coding best practices
- **Documentation**: Provide clear usage examples
- **Compatibility**: Test with multiple SDK versions
- **Updates**: Keep tools updated with SDK changes

## Troubleshooting

### Common Issues

#### Import Errors
```python
# Ensure proper Python path
import sys
sys.path.insert(0, '/path/to/backend/src')

from backend.src.sdk.tool import Tool
```

#### Schema Generation Issues
- Ensure all Field descriptions are provided
- Check Pydantic model inheritance
- Validate field types are supported

#### Permission Errors
- Verify manifest permissions match code requirements
- Check user has necessary permissions
- Review permission validation logic

#### Context Access Issues
- Ensure context is properly passed to tool
- Check context attributes are available
- Verify context initialization in test environments

This example tool provides a complete reference implementation for developing tools in the Personal Assistant ecosystem. Use it as a starting point for creating your own marketplace tools.
