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
4. Frontend executes tool locally (Node.js main process)
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
- `run_shell_command`: Execute shell commands

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

**Critical Behavior**: When a screenshot arrives at the backend, proactive OCR is **immediately activated** and runs **asynchronously** without blocking any other operations (LLM coordination, LLM response generation, tool result processing).

When backend receives a screenshot:

1. Stores screenshot in session (`latest_screenshot`)
2. Clears `ocr_completion_event` (signals OCR in progress)
3. Proactively triggers OCR analysis via `asyncio.create_task()` (async, runs in separate thread via `asyncio.to_thread`)
4. OCR runs in separate thread (doesn't block event loop)
5. Stores OCR results in session (`latest_ocr_results`)
6. Sets `ocr_completion_event` (signals OCR complete)
7. OCR results available for subsequent tool calls

**Synchronization**: The `ocr_completion_event` (`asyncio.Event`) in `AgentSession` coordinates access to OCR results. Tools that require OCR results wait for this event before using `latest_ocr_results`.

**Tool Waiting Behavior**: If an LLM response includes a click tool with `find_coordinates_by="ocr"`, the tool **waits for OCR completion** via `ocr_completion_event` before extracting text coordinates. The `OcrCoordinator.get_ocr_results()` method blocks on `await session.ocr_completion_event.wait()` until proactive OCR completes, ensuring the tool uses the updated OCR list.

**Performance**: OCR runs in a background thread, allowing tool result processing and LLM communication to continue immediately without blocking. **LLM response generation is NOT blocked by OCR** - they run in parallel.

### Result Format

**Individual Tool Results**:

Frontend MUST pre-format tool output messages with system context XML embedded in `llm_content`:

```json
{
  "success": true,
  "data": {
    // Tool-specific result data
    "screenshot": "base64_screenshot_data",
    "llm_content": "tool_name output:\n<content>\nstatus: successful\n<system_context>\n  <os_state>\n    <active_window>Application Name</active_window>\n    <mouse_position>(500, 300)</mouse_position>\n    <time>2026-01-02 13:23:17</time>\n    <clipboard_preview><empty></clipboard_preview>\n  </os_state>\n</system_context>\nState of the screen after tool_name was executed:",
    "is_preformatted": true
  }
}
```

**Bundled Tool Results**:

When multiple tools are bundled, frontend sends a single bundled result:

```json
{
  "type": "tool-result",
  "payload": {
    "request_id": "bundle_correlation_id",
    "success": true,
    "data": {
      "bundled": true,
      "tools": [
        {
          "tool_name": "keyboard_control",
          "request_id": "tool1_request_id",
          "success": true,
          "data": {
            "llm_content": "keyboard_control output:\n...",
            "is_preformatted": true
          }
        },
        {
          "tool_name": "keyboard_control",
          "request_id": "tool2_request_id",
          "success": true,
          "data": {
            "llm_content": "keyboard_control output:\n...",
            "is_preformatted": true
          }
        }
      ],
      "combined_llm_content": "Bundled tool execution output:\n\nkeyboard_control output:\nTyped text: 'amazon.com'\nstatus: successful\n\nkeyboard_control output:\nPressed key: enter\nstatus: successful\n\n<system_context>\n  <os_state>\n    <active_window>Application Name</active_window>\n    <mouse_position>(500, 300)</mouse_position>\n    <time>2026-01-02 13:23:17</time>\n    <clipboard_preview><empty></clipboard_preview>\n  </os_state>\n</system_context>\n\nState of the screen after bundled tools were executed:",
      "system_state": {...},
      "screenshot": "base64_screenshot_data"
    }
  }
}
```

**System Context**: Frontend automatically formats system context as XML and embeds it in `llm_content`:
- `active_window`: Currently active window title
- `mouse_position`: Mouse coordinates at time of execution
- `time`: Timestamp of tool execution
- `clipboard_preview`: Clipboard content preview

**Pre-formatting Requirement**: Backend requires pre-formatted messages with `is_preformatted: true` flag. The `format_for_history()` method will raise `ValueError` if content is not pre-formatted. No fallback formatting is provided.

**Bundled Result Processing**:
- Individual tool results in `tools` array are stored for orchestrator matching (by request_id)
- Combined result with `combined_llm_content` is stored in `session._bundled_results` for history
- When processing results for history, bundled results are committed as a **single message** instead of multiple messages
- UI displays bundled tools as a **single combined output** with one `system_context` and one screenshot

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

**Location**: `frontend/src/main/tools/`

Implement the actual tool execution logic in Node.js (main process).

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

## Coordinate Resolution for Mouse Control

**Location**: `backend/src/agent/tools/tool_preparer.py`

The `ToolPreparer` orchestrates tool call preparation, delegating to specialized components:

- **ScreenshotManager**: Ensures screenshot availability (requests hidden screenshot if needed)
- **OcrCoordinator**: Coordinates OCR result acquisition and waits for proactive OCR
- **CoordinateResolver**: Routes to OCR or Vision resolution methods
  - **OcrResolver**: Pure OCR text matching with fuzzy search
  - **VisionResolver**: Pure Vision model coordinate prediction
- **VisionServiceProvider**: Provides vision service access (decoupled)
- **SyntheticResultFactory**: Creates error results when resolution fails

The `ToolPreparer` intercepts `mouse_control` tool calls that require coordinate resolution (OCR or Vision):

1. **Intercepts** tool calls with `find_coordinates_by="ocr"` or `find_coordinates_by="prediction"`
2. **Ensures** screenshot is available (requests hidden screenshot if needed)
3. **Waits** for proactive OCR completion via `ocr_completion_event` (for OCR method)
4. **Resolves** coordinates using OCR text matching or Vision model prediction
5. **Rewrites** tool call to use manual coordinates (`x`, `y`)
6. **Removes** backend-only fields (`find_coordinates_by`, `ocr_text`, `description`)
7. **Sends** rewritten tool call to frontend (frontend only accepts manual coordinates)

**Error Handling**: If coordinate resolution fails:
- Creates synthetic `ToolResult` with error message
- Yields `ToolOutputEvent` immediately (frontend displays error)
- Stores result in `session._pending_tool_results` for orchestrator
- Orchestrator processes synthetic result, sends to LLM
- LLM receives error and can generate appropriate response

## Important Notes

1. **No Local Execution**: Backend never executes tools locally
2. **Schema-Driven**: Tool schemas drive LLM tool selection
3. **Automatic Screenshots**: Every tool execution includes screenshot
4. **Pre-formatted Messages**: Frontend MUST pre-format tool output messages with system context XML embedded in `llm_content`
5. **No Fallback Formatting**: Backend requires pre-formatted messages - `format_for_history()` raises `ValueError` if not pre-formatted
6. **Proactive OCR**: Screenshots automatically analyzed with OCR (non-blocking)
7. **Asynchronous OCR**: OCR runs in separate thread, doesn't block event loop
8. **Synchronization**: `ocr_completion_event` coordinates access to OCR results
9. **Security**: Tools execute on user's machine, not backend
