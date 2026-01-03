# Tool System Architecture

## Overview

The backend tool system follows a **delegation pattern**: Backend defines tool schemas and orchestrates execution, but **all tool execution happens on the frontend**.

## Key Principles

1. **No Local Execution**: Backend never executes tools locally
2. **Schema Management**: Backend generates JSON schemas for LLM
3. **Remote Tools**: All tools are "remote" - they delegate to frontend
4. **Automatic Screenshots**: Frontend automatically captures screenshots

## Tool Registry

**Location**: `backend/src/tools/registry.py`

### Responsibilities

- **Tool Registration**: Registers all available tools
- **Schema Generation**: Generates JSON schemas for LLM
- **Tool Lookup**: Provides tool instances by name
- **Schema Caching**: Caches schemas with 1-hour TTL

### Tool Registration

Tools are automatically registered from `remote.py`:

```python
REMOTE_TOOLS = {
    "mouse_control": RemoteMouseTool,
    "keyboard_control": RemoteKeyboardTool,
    "screenshot": RemoteScreenshotTool,
    "read_file": RemoteReadFileTool,
    "write_file": RemoteWriteFileTool,
    # ... more tools
}
```

## Remote Tools

**Location**: `backend/src/tools/remote.py`

### Pattern

All tools inherit from `RemoteToolBase` and implement `execute_remote()`:

```python
class RemoteMouseTool(Tool[MouseControlArgs], RemoteToolBase):
    name = "mouse_control"
    description = "Control mouse actions"
    args_model = MouseControlArgs
    
    async def execute_remote(self, args: MouseControlArgs, ctx: ToolContext):
        return RemoteToolResult(
            tool_name="mouse_control",
            args=args.model_dump(),
            request_id=self._get_request_id(ctx)
        )
```

### Tool Execution Flow

```
1. LLM determines tool call needed
   ↓
2. Backend creates RemoteToolResult
   ↓
3. Tool execution request sent to frontend via WebSocket
   ↓
4. Frontend executes tool locally (Python sidecar)
   ↓
5. Frontend captures screenshot automatically
   ↓
6. Tool result + screenshot returned to backend
   ↓
7. Backend processes result and continues conversation
```

## Tool Categories

### Computer Control Tools

- `mouse_control`: Mouse clicks, moves, drags
- `keyboard_control`: Keyboard input, key combinations
- `screenshot`: Capture screenshot (rarely needed - automatic screenshots)
- `scroll_control`: Scroll windows
- `switch_tab`: Switch browser tabs
- `wait`: Wait for specified duration

### Filesystem Tools

- `read_file`: Read file contents
- `write_file`: Write file contents
- `list_directory`: List directory contents

### System Tools

- `get_open_windows`: Get list of open windows
- `get_system_stats`: Get system statistics

## Tool Schema Generation

### Schema Registry

**Location**: `backend/src/tools/schema_registry.py`

- Generates JSON schemas from Pydantic models
- Caches schemas for performance
- Formats for LLM consumption

### Schema Format

```json
{
  "name": "mouse_control",
  "description": "Control mouse actions",
  "parameters": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["click", "move", "drag"]
      },
      "x": {"type": "number"},
      "y": {"type": "number"}
    },
    "required": ["action", "x", "y"]
  }
}
```

## Tool Result Processing

### Automatic Screenshots

**Frontend automatically captures screenshots after every tool execution**, even if the tool doesn't explicitly request one.

### OCR Integration

When backend receives a screenshot:

1. Stores screenshot in session (`latest_screenshot`)
2. Proactively triggers OCR analysis (async)
3. Stores OCR results in session (`latest_ocr_results`)
4. OCR results available for subsequent tool calls

### Result Format

```json
{
  "success": true,
  "data": {
    // Tool-specific result data
    "screenshot": "base64_screenshot_data"
  },
  "system_context": {
    "active_window": "Application Name",
    "mouse_position": "(500, 300)",
    "time": "2026-01-02 13:23:17"
  },
  "llm_content": "Formatted content for LLM"
}
```

**System Context**: Automatically included in tool results:
- `active_window`: Currently active window title
- `mouse_position`: Mouse coordinates at time of execution
- `time`: Timestamp of tool execution

## Tool Permissions

Tools declare required permissions:

- `COMPUTER_CONTROL`: For computer control tools
- `READ_FILESYSTEM`: For file reading
- `WRITE_FILESYSTEM`: For file writing

**Note**: Permissions are declared but not enforced for remote tools (execution happens on frontend).

## Tool Orchestration

**Location**: `backend/src/tools/orchestrator.py`

### Responsibilities

- Coordinates tool execution requests
- Manages tool execution context
- Handles tool result processing

## Adding a New Tool

### 1. Define Tool Schema

**Location**: `backend/src/tools/computer/schemas.py` (or appropriate category)

```python
class MyToolArgs(BaseModel):
    param1: str = Field(..., description="Parameter 1")
    param2: int = Field(..., description="Parameter 2")
    explanation: str = Field(..., description="Why this tool is used")
```

### 2. Create Remote Tool Stub

**Location**: `backend/src/tools/remote.py`

```python
class RemoteMyTool(Tool[MyToolArgs], RemoteToolBase):
    name = "my_tool"
    description = "Tool description for LLM"
    args_model = MyToolArgs
    category = ToolDomain.COMPUTER  # or appropriate category
    
    async def execute_remote(self, args: MyToolArgs, ctx: ToolContext):
        return RemoteToolResult(
            tool_name="my_tool",
            args=args.model_dump(),
            request_id=self._get_request_id(ctx)
        )
```

### 3. Register Tool

Add to `REMOTE_TOOLS` dictionary in `remote.py`:

```python
REMOTE_TOOLS = {
    # ... existing tools
    "my_tool": RemoteMyTool,
}
```

### 4. Implement Frontend Tool

**Location**: `frontend/src/main/python/tools/`

Implement the actual tool execution logic on the frontend sidecar.

## Tool Execution Context

### ToolContext

**Location**: `backend/src/sdk/context.py`

Provides execution context:
- User context (user_id)
- Session context (session_id)
- Runtime context (workspace_root, services)

### Services Available

- `config`: Application configuration
- `tool_registry`: Tool registry instance
- `session`: AgentSession reference
- `agent_factory`: Agent factory for sub-agents
- `vision_service`: Vision service (InternVL)

## Important Notes

1. **No Local Execution**: Backend never executes tools locally
2. **Schema-Driven**: Tool schemas drive LLM tool selection
3. **Automatic Screenshots**: Every tool execution includes screenshot
4. **Proactive OCR**: Screenshots automatically analyzed with OCR
5. **Security**: Tools execute on user's machine, not backend
