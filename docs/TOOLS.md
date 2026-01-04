# Tool System Architecture

## Overview

The tool system follows a **delegation pattern**: Backend defines tool schemas and orchestrates, Frontend executes tools locally.

## Tool Types

### Remote Tools (Backend → Frontend)

All computer control and filesystem tools are **remote tools** that delegate execution to the frontend.

#### Computer Control Tools
- `mouse_control`: Mouse clicks, moves, drags
- `keyboard_control`: Keyboard input, key combinations
- `screenshot`: Capture screenshot (though automatic screenshots make this rarely needed)
- `scroll_control`: Scroll windows
- `switch_tab`: Switch browser tabs
- `wait`: Wait for specified duration

#### Filesystem Tools
- `read_file`: Read file contents
- `write_file`: Write file contents
- `list_directory`: List directory contents

#### System Tools
- `get_open_windows`: Get list of open windows
- `get_system_stats`: Get system statistics (CPU, memory, battery)

## Tool Execution Flow

```
1. LLM determines tool call needed
   ↓
2. Backend creates tool execution request
   ↓
3. Request sent to frontend via WebSocket
   ↓
4. Frontend main process routes to Python sidecar
   ↓
5. Sidecar executes tool locally
   ↓
6. Sidecar captures screenshot automatically
   ↓
7. Result + screenshot returned to backend
   ↓
8. Backend processes result
   ↓
9. Backend may trigger OCR on screenshot
   ↓
10. Backend continues conversation
```

## Tool Schema Management

### Backend Responsibilities

- **Schema Generation**: Generates JSON schemas for all tools
- **Schema Registry**: Caches tool schemas (TTL: 1 hour)
- **LLM Integration**: Injects tool schemas into system prompt
- **Tool Definitions**: Defines tool names, descriptions, parameters

### Frontend Responsibilities

- **Tool Implementation**: Actual tool execution code
- **Tool Execution**: Runs tools locally on user's machine
- **Screenshot Capture**: Automatically captures screenshots after execution

## Tool Result Processing

### Automatic Screenshots

**Frontend automatically captures screenshots after every tool execution**, even if the tool doesn't explicitly request one. This provides visual context to the LLM.

### OCR Integration

When backend receives a screenshot:
1. Stores screenshot in session (`latest_screenshot`)
2. Clears `ocr_completion_event` (signals OCR in progress)
3. Proactively triggers OCR analysis (async, runs in separate thread)
4. Stores OCR results in session (`latest_ocr_results`)
5. Sets `ocr_completion_event` (signals OCR complete)
6. OCR results available for subsequent tool calls

**Synchronization**: Tools that need OCR results (e.g., `mouse_control` with `find_coordinates_by="ocr"`) wait for `ocr_completion_event` before using `latest_ocr_results`. This ensures they use the latest OCR results from the current screenshot.

**Non-blocking**: OCR runs in a background thread, so tool result processing and LLM communication continue immediately without waiting for OCR to complete.

### Tool Result Format

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

## Tool Categories

### ToolDomain Enum

- `COMPUTER`: Computer control tools
- `FILESYSTEM`: File operations
- `SYSTEM`: System information
- `OTHER`: Miscellaneous tools

## Tool Permissions

Tools declare required permissions:
- `COMPUTER_CONTROL`: For computer control tools
- `READ_FILESYSTEM`: For file reading
- `WRITE_FILESYSTEM`: For file writing

## Tool Development

### Adding a New Tool

1. **Backend**: Define tool schema in `backend/src/tools/remote.py`
2. **Frontend**: Implement tool in `frontend/src/main/python/tools/`
3. **Register**: Tool automatically registered via remote tool system

### Tool Implementation Pattern

**Backend (Remote Tool Stub)**:
```python
class RemoteMyTool(Tool[MyToolArgs], RemoteToolBase):
    name = "my_tool"
    description = "Tool description"
    args_model = MyToolArgs
    
    async def execute_remote(self, args: MyToolArgs, ctx: ToolContext):
        return RemoteToolResult(
            tool_name="my_tool",
            args=args.model_dump(),
            request_id=self._get_request_id(ctx)
        )
```

**Frontend (Tool Implementation)**:
```python
class MyTool:
    async def execute(self, args: dict) -> dict:
        # Tool implementation
        result = do_something(args)
        
        # Screenshot automatically captured by sidecar
        return {
            "success": True,
            "data": result
        }
```

## Key Principles

1. **No Local Execution**: Backend never executes tools locally
2. **Schema-Driven**: Tool schemas drive LLM tool selection
3. **Automatic Screenshots**: Every tool execution includes screenshot
4. **Proactive OCR**: Screenshots automatically analyzed with OCR
5. **Security**: Tools execute on user's machine, not backend

## Tool Result Processing

### Backend Processing

1. Receives tool result from frontend
2. Extracts screenshot data
3. Stores in session
4. Triggers proactive OCR (async)
5. Formats result for LLM
6. Updates conversation history
7. Continues LLM processing

### Frontend Processing

1. Executes tool
2. Captures screenshot automatically
3. Formats result
4. Returns to backend via WebSocket

## Tool Error Handling

- **Tool Execution Errors**: Returned to backend, included in conversation
- **Screenshot Failures**: Tool result still returned, screenshot may be None
- **OCR Failures**: Logged but don't block tool result processing
- **Coordinate Resolution Failures**: When OCR or vision-based coordinate resolution fails:
  - Synthetic `ToolResult` created with error message
  - `ToolOutputEvent` yielded immediately for frontend display
  - Error sent to LLM as tool output
  - LLM can generate appropriate response (e.g., try different approach)
