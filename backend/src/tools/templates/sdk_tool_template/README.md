# SDK Tool Template

This is a template for creating new SDK tools for the Desktop Assistant.

## Quick Start

1. Copy this directory to create your new tool
2. Rename `tool.py` to match your tool name (e.g., `my_tool.py`)
3. Update the class names and descriptions
4. Implement your tool logic in the `run()` method
5. Register your tool in the appropriate location

## File Structure

```
my_tool/
├── tool.py          # Tool implementation
├── README.md        # Tool documentation
└── test_tool.py     # Unit tests (optional)
```

## Implementation Steps

### 1. Define Arguments Model

Create a Pydantic model for your tool's arguments:

```python
class MyToolArgs(BaseModel):
    param1: str = Field(..., description="Description of param1")
    param2: Optional[int] = Field(None, description="Optional parameter")
```

### 2. Create Tool Class

Inherit from `Tool[YourArgsModel]`:

```python
class MyTool(Tool[MyToolArgs]):
    name = "my_tool"
    description = "What this tool does"
    args_model = MyToolArgs
```

### 3. Implement run() Method

```python
async def run(self, args: MyToolArgs, ctx: Context) -> dict:
    # Your logic here
    return {
        "success": True,
        "llm_content": "Result description",
        "return_display": "User-friendly result"
    }
```

### 4. Declare Capabilities

```python
def get_capabilities(self) -> Dict[str, Any]:
    return {
        "requires_screenshot": False,
        "modifies_filesystem": True,
        "timeout": 30.0
    }
```

## Testing

Create a test file:

```python
import pytest
from my_tool import MyTool, MyToolArgs
from backend.src.sdk.context import Context

@pytest.mark.asyncio
async def test_my_tool():
    tool = MyTool()
    args = MyToolArgs(param1="test")
    ctx = Context(workspace_root="/workspace", services={})
    
    result = await tool.run(args, ctx)
    
    assert result["success"] is True
    assert "llm_content" in result
```

## Best Practices

1. **Clear Descriptions**: Provide detailed descriptions for the tool and all parameters
2. **Error Handling**: Always handle errors gracefully
3. **Logging**: Use logging for debugging (not print statements)
4. **Validation**: Use Pydantic validators for complex validation
5. **Documentation**: Document your tool's purpose and behavior
6. **Testing**: Write comprehensive tests

## Examples

See existing tools in `backend/src/tools/` for reference:
- `write_file_tool.py`: File operations
- `shell_tool.py`: System commands
- `click_ocr_tool.py`: Computer interaction

## Resources

- [Tool Development Guide](../../../docs/tool_development.md)
- [Extension Points Guide](../../../docs/extension_points.md)
- [Architecture Documentation](../../../docs/architecture.md)

