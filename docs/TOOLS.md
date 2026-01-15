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
- `run_shell_command`: Execute shell commands

## Tool Execution Flow

```
1. LLM determines tool call needed
   ↓
2. Backend creates tool execution request
   ↓
3. Request sent to frontend via WebSocket
   ↓
4. Frontend main process executes tool locally (Node.js)
   ↓
5. Tool executor captures screenshot automatically
   ↓
6. Result + screenshot returned to backend
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

**Critical Behavior**: When a screenshot arrives at the backend, proactive OCR is **immediately activated** and runs **asynchronously** without blocking any other operations (LLM coordination, LLM response generation, tool result processing).

When backend receives a screenshot:
1. Stores screenshot in session (`latest_screenshot`)
2. Clears `ocr_completion_event` (signals OCR in progress)
3. Proactively triggers OCR analysis via `asyncio.create_task()` (async, runs in separate thread, non-blocking)
4. OCR runs in separate thread using `asyncio.to_thread()` (doesn't block event loop)
5. Stores OCR results in session (`latest_ocr_results`)
6. Sets `ocr_completion_event` (signals OCR complete)
7. OCR results available for subsequent tool calls

**Synchronization**: Tools that need OCR results (e.g., `mouse_control` with `find_coordinates_by="ocr"`) **wait for `ocr_completion_event`** before using `latest_ocr_results`. This ensures they use the latest OCR results from the current screenshot.

**Tool Waiting Behavior**: If an LLM response includes a click tool with `find_coordinates_by="ocr"`, the tool **waits for OCR completion** before extracting text coordinates. The `OcrCoordinator.get_ocr_results()` method blocks on `await session.ocr_completion_event.wait()` until proactive OCR completes, ensuring the tool uses the updated OCR list.

**Non-blocking**: OCR runs in a background thread, so tool result processing and LLM communication continue immediately without waiting for OCR to complete. **LLM response generation is NOT blocked by OCR** - they run in parallel.

### Tool Result Format

Frontend pre-formats tool output messages with system context XML embedded in `llm_content`:

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

**System Context**: Frontend automatically formats system context as XML and embeds it in `llm_content`:
- `active_window`: Currently active window title
- `mouse_position`: Mouse coordinates at time of execution
- `time`: Timestamp of tool execution
- `clipboard_preview`: Clipboard content preview

**Pre-formatting Requirement**: Backend requires pre-formatted messages with `is_preformatted: true` flag. No fallback formatting is provided.

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
2. **Frontend**: Implement tool in `frontend/src/main/tools/` (Node.js implementation)
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
```javascript
// frontend/src/main/tools/my_tool.cjs
async function executeMyTool(args) {
    // Tool implementation using Node.js APIs
    const result = doSomething(args);
    
    // Screenshot automatically captured by tool_executor.cjs
    return {
        success: true,
        data: result
    };
}

module.exports = { executeMyTool };
```

## Key Principles

1. **No Local Execution**: Backend never executes tools locally
2. **Schema-Driven**: Tool schemas drive LLM tool selection
3. **Automatic Screenshots**: Every tool execution includes screenshot
4. **Pre-formatted Messages**: Frontend MUST pre-format tool output messages with system context XML embedded in `llm_content`
5. **No Fallback Formatting**: Backend requires pre-formatted messages - raises `ValueError` if not pre-formatted
6. **Proactive OCR**: Screenshots automatically analyzed with OCR
7. **Security**: Tools execute on user's machine, not backend

## Tool Result Processing

### Individual Tool Results

**Backend Processing**:
1. Receives tool result from frontend (pre-formatted with system context XML)
2. Extracts screenshot data
3. Stores in session
4. Triggers proactive OCR (async)
5. Uses pre-formatted message directly (no additional formatting)
6. Updates conversation history (one message per tool)
7. Continues LLM processing

**Frontend Processing**:
1. Executes tool
2. Captures screenshot automatically
3. Captures system state (active_window, mouse_position, time, clipboard)
4. Formats complete message with system context XML embedded in `llm_content`
5. Sets `is_preformatted: true` flag
6. Displays tool output in UI
7. Returns to backend via WebSocket

**Note**: Backend requires pre-formatted messages. If `is_preformatted` flag is missing or `llm_content` doesn't contain system context XML, a `ValueError` is raised.

### Bundled Tool Results

**Overview**: When multiple tools are chained together (bundled), they are executed sequentially but displayed and stored as a **single combined output** with one `system_context` and one screenshot.

**Frontend Processing (Bundled)**:
1. Executes all tools in bundle sequentially (with `skipAutoCapture` for intermediate tools)
2. Captures system state and screenshot **once at bundle end** (for computer-use tools)
3. Formats **combined message** with all tool outputs in a single `llm_content`:
   - Includes output from each tool in the bundle
   - Includes **one** `system_context` XML (shared across all tools)
   - Includes **one** screenshot (captured at bundle end)
4. Displays **single combined output** in UI (not individual outputs)
5. Sends bundled result to backend with:
   - `bundled: true` flag
   - `tools` array (individual tool results for orchestrator matching)
   - `combined_llm_content` (combined message for history)
   - `system_state` and `screenshot` (shared across bundle)

**Backend Processing (Bundled)**:
1. Receives bundled result with `bundled: true` flag
2. Stores individual tool results in `_pending_tool_results` (for orchestrator matching by request_id)
3. Creates **combined ToolResult** with `combined_llm_content` for history
4. Stores combined result in `session._bundled_results` for history processing
5. Triggers proactive OCR on bundle screenshot (async)
6. When processing results for history:
   - Detects bundled execution (multiple tool results)
   - Uses combined bundled result instead of individual results
   - Commits **single message** to conversation history (not multiple messages)
7. Continues LLM processing

**Key Differences**:
- **UI Display**: Bundled tools show as one combined output, not separate outputs
- **History Storage**: Bundled tools stored as one message in conversation history, not multiple messages
- **System Context**: One `system_context` XML shared across all tools in bundle
- **Screenshot**: One screenshot captured at bundle end (not per tool)
- **Orchestrator Matching**: Individual tool results still stored for request_id matching, but history uses combined result

## Tool Chaining (Bundled Tools)

**When Tools Are Bundled**: The LLM can chain multiple tools together when actions are predictable and don't require visual verification between steps (e.g., typing text then pressing Enter).

**Format for Chaining**: Output multiple JSON tool calls on separate lines:
```json
{"functionCall": {"name": "keyboard_control", "args": {"action": "type", "text": "amazon.com"}}}
{"functionCall": {"name": "keyboard_control", "args": {"action": "press", "key": "enter"}}}
```

**Execution Flow**:
1. Backend sends `bundle_start` event
2. Backend sends individual `tool_call` events for each tool
3. Backend sends `bundle_end` event
4. Frontend collects tools into bundle array
5. Frontend executes all tools sequentially
6. Frontend captures system state and screenshot **once at bundle end**
7. Frontend displays **single combined output** in UI
8. Frontend sends **single bundled result** to backend
9. Backend stores **single combined message** in conversation history

**Result Format**: Bundled tools produce a single combined output with:
- All tool outputs combined in one message
- One `system_context` XML (shared across all tools)
- One screenshot (captured at bundle end)

## Tool Error Handling

- **Tool Execution Errors**: Returned to backend, included in conversation
- **Screenshot Failures**: Tool result still returned, screenshot may be None
- **OCR Failures**: Logged but don't block tool result processing
- **Coordinate Resolution Failures**: When OCR or vision-based coordinate resolution fails:
  - Synthetic `ToolResult` created with error message
  - `ToolOutputEvent` yielded immediately for frontend display
  - Error sent to LLM as tool output
  - LLM can generate appropriate response (e.g., try different approach)
- **Bundled Tool Errors**: If any tool in a bundle fails, the combined result reflects the failure, but all tools are still included in the combined output
