# Example Tool

This is an example marketplace tool that demonstrates how to create tools for the Desktop Assistant marketplace.

## Structure

- `manifest.json` - Tool metadata and configuration
- `tool.py` - Tool implementation
- `README.md` - This file

## Tool Description

The Example Tool is a simple utility that echoes back a message with a greeting. It's designed to demonstrate the marketplace system functionality.

## Usage

The tool can be called by the agent with an optional message parameter:

```json
{
  "functionCall": {
    "name": "example_tool",
    "args": {
      "message": "Hello, world!"
    }
  }
}
```

## Implementation Notes

- Tools must inherit from `backend.tools.base.Tool`
- Tools receive `AppServices` instance via constructor for dependency injection
- Tools must implement `execute_async(context, **kwargs) -> ToolResult`
- Tool schemas are automatically generated from type hints
