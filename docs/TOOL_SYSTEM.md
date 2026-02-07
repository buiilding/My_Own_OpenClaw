---
summary: "Tool System"
read_when:
  - When changing tool registry or execution.
---

# Tool System

## Overview

The Tool System enables the Desktop Assistant to interact with the computer through a set of specialized tools. **Tools are executed in the frontend Python sidecar**, while the backend provides tool schemas, coordinates resolution, and orchestration.

For planned schema-ownership migration (frontend-sourced runtime tool catalogs), see `docs/adr/005-frontend-tool-schema-source-of-truth.md`.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Backend (Python)                   │
│  ┌───────────────────────────────────────────┐  │
│  │  ToolRegistry                              │  │
│  │  - Tool Registration                       │  │
│  │  - Schema Management                       │  │
│  │  - Remote Tool Stubs                       │  │
│  └───────────────────────────────────────────┘  │
│              ↕                                    │
│  ┌───────────────────────────────────────────┐  │
│  │  ToolResultOrchestrator                    │  │
│  │  - Result Waiting/Assembly                 │  │
│  │  - Bundle/Single Handling                  │  │
│  └───────────────────────────────────────────┘  │
│              ↕                                    │
│  ┌───────────────────────────────────────────┐  │
│  │  ToolPreparer                              │  │
│  │  - Screenshot Management                   │  │
│  │  - OCR Coordination                        │  │
│  │  - Coordinate Resolution                   │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
              ↕ WebSocket
┌─────────────────────────────────────────────────┐
│            Frontend (Electron)                  │
│  ┌───────────────────────────────────────────┐  │
│  │  Main Process (IPC)                       │  │
│  │  - Tool Request Routing                   │  │
│  └───────────────────────────────────────────┘  │
│              ↕ stdin/stdout                      │
│  ┌───────────────────────────────────────────┐  │
│  │  Python Sidecar                           │  │
│  │  - Tool Execution                         │  │
│  │  - System State Capture                    │  │
│  └───────────────────────────────────────────┘  │
│              ↕ IPC (IpcBridge)                     │
│  ┌───────────────────────────────────────────┐  │
│  │  Renderer Process (React)                  │  │
│  │  - useToolRunner Hook                      │  │
│  │  - ToolExecutionService                    │  │
│  │  - MessageFormatter                        │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

## Tool Types

### Remote Tools (Frontend Execution)

Most tools are executed on the frontend Python sidecar:

- **Computer Control Tools**: `mouse_control`, `keyboard_control`, `scroll_control`
- **File System Tools**: `read_file`, `write_file`, `list_directory`, `search_file_content`
- **System Tools**: `screenshot`, `get_system_stats`, `get_open_windows`
- **Terminal Tools**: `run_shell_command`, `process`

### Backend Responsibilities (No Tool Execution)

The backend does not directly execute tools. It:
- Builds tool schemas and embeds them in the initial user message (`<tool_schemas>`)
- Emits tool schemas as a transparency event (`tool-schemas`)
- Resolves coordinates and screenshots
- Waits for results from the frontend sidecar

## Tool Execution Flow

### 1. Tool Call Generation

LLM generates tool call in response format:

```json
{
  "tool_calls": [
    {
      "tool_name": "mouse_control",
      "arguments": {
        "action": "click",
        "find_coordinates_by": "ocr",
        "target_text": "Submit"
      }
    }
  ]
}
```

### 2. Tool Preparation

**ToolPreparer** (`agent/tools/preparation/preparer.py`) prepares tool calls:

1. **Screenshot Acquisition**: Ensures screenshot is available
2. **OCR Processing**: Runs OCR if needed for coordinate resolution
3. **Coordinate Resolution**: Resolves coordinates using OCR or vision models
4. **Tool Call Preparation**: Adds metadata and coordinates

### 3. Tool Execution

Tool calls are sent by the agent tool sender; execution happens in the frontend sidecar.
**ToolResultOrchestrator** (`tools/orchestrator.py`) waits for frontend results and assembles `ToolResult` objects:

1. Frontend receives tool-call event
2. **useToolRunner** hook receives tool-call event
3. **ToolExecutionService** (`infrastructure/services/ToolExecutionService.ts`) handles execution:
   - Routes tool to Python sidecar via IPC invoke
   - Python sidecar executes tool
   - Automatically captures screenshot (if computer-use tool)
   - Captures system state
   - Formats result with MessageFormatter
4. Result displayed in UI via callback
5. Result sent back to backend via WebSocket

### 4. Result Processing

**ToolResultHandler** (`agent/tools/waiting/handler.py`) processes results:

1. Receives tool result from frontend
2. Stores result in centralized **ToolResultStorage** (with TTL-based cleanup)
3. Processes screenshot and OCR
4. Updates conversation history (O(1) access via cached LLM format)
5. Continues agent interaction

## Tool Development

### SDK Tool Base Class

All tools inherit from `Tool` base class (`sdk/tool.py`):

```python
from backend.src.sdk.tool import Tool
from backend.src.sdk.context import ToolContext
from backend.src.core.interfaces.tool import ToolResult

class MyTool(Tool):
    name = "my_tool"
    description = "Description of my tool"
    
    def get_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "param1": {"type": "string", "description": "Parameter 1"}
            },
            "required": ["param1"]
        }
    
    async def execute(
        self,
        args: dict,
        context: ToolContext
    ) -> ToolResult:
        # Tool execution logic
        return ToolResult(
            success=True,
            llm_content="Tool executed successfully",
            data={"result": "..."}
        )
```

### Remote Tool (Frontend Execution)

Remote tools are executed on the frontend Python sidecar:

**Backend Stub** (`tools/remote.py`):

```python
from pydantic import BaseModel

from backend.src.sdk.tool import Tool
from backend.src.tools.remote import RemoteToolBase

class MyRemoteToolArgs(BaseModel):
    param1: str

class MyRemoteTool(Tool[MyRemoteToolArgs], RemoteToolBase):
    name = "my_remote_tool"
    description = "Description of my remote tool"
    args_model = MyRemoteToolArgs
```

**Frontend Implementation** (`frontend/src/main/python/tools/my_tool.py`):

```python
async def execute_my_tool(args: Dict[str, Any]) -> Dict[str, Any]:
    # Tool execution logic
    return {
        "success": True,
        "data": {
            "llm_content": "Tool executed successfully",
            "return_display": "Success"
        }
    }
```

### Tool Registration

Tools are automatically registered:

1. **Remote Tools**: Discovered from `tools/remote.py`
2. **Backend Tools**: Registered in the tool registry (`backend/src/tools/registry.py`)

## Coordinate Resolution

### OCR-Based Resolution

For tools requiring coordinate resolution via OCR:

```python
{
    "tool_name": "mouse_control",
    "arguments": {
        "action": "click",
        "find_coordinates_by": "ocr",
        "target_text": "Submit Button"
    }
}
```

**Flow**:
1. Screenshot captured
2. OCR runs on screenshot
3. Text searched in OCR results
4. Coordinates extracted
5. Tool call prepared with coordinates

### Vision-Based Resolution

For tools using vision models:

```python
{
    "tool_name": "mouse_control",
    "arguments": {
        "action": "click",
        "find_coordinates_by": "prediction",
        "target_description": "Submit button"
    }
}
```

**Flow**:
1. Screenshot captured
2. Vision model analyzes screenshot
3. Element detected and localized
4. Coordinates extracted
5. Tool call prepared with coordinates

## Screenshot Management

### Screenshot Lifecycle

1. **User Message**: Screenshot captured before sending (via useChatMessageSender) and uploaded via HTTP `/api/artifacts`
2. **Tool Execution**: Screenshot automatically captured after computer-use tool execution (via ToolExecutionService) and uploaded via HTTP `/api/artifacts`
   - **Individual Tools**: Screenshot captured **once** after tool execution completes
   - **Bundled Tools**: Screenshot captured **once** after all bundled tools execute (not after each tool)
   - Both use the same helper method (`captureSystemStateAndScreenshot`) ensuring:
     - 2 second delay before capture (for UI to update)
     - Parallel system state + screenshot capture
     - Consistent error handling
     - Proper timing logs
3. **WS Reference**: WebSocket payloads carry `screenshot_ref` (optionally `screenshot_url` for UI) instead of base64 blobs
4. **OCR Processing**: Screenshot processed for OCR (backend, resolved from artifact store)
5. **Storage**: Screenshot stored in session with unique ID (backend)

### ScreenshotManager

**ScreenshotManager** (`agent/tools/screenshot_manager.py`) manages screenshots:

- **get_screenshot()**: Ensure an active screenshot is available in session
- **process_screenshot()**: Process and store screenshot, trigger OCR
- **Screenshot IDs**: Unique IDs prevent race conditions

## Tool Schemas

**Note**: Tool schemas are embedded in the first user message (as a `<tool_schemas>` XML section). They are not passed as a separate LLM API parameter.

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
      "description": "X coordinate"
    },
    "y": {
      "type": "integer",
      "description": "Y coordinate"
    }
  },
  "required": ["action"]
}
```

### Schema Registry

**SchemaRegistry** (`tools/schema_registry.py`) manages tool schemas:

- Registers tool schemas
- Provides schemas to the LLM via the initial user message (and for transparency)
- Validates tool call arguments

## Built-in Tools

### Computer Control Tools

- **mouse_control**: Mouse actions (click, drag, move)
- **keyboard_control**: Keyboard input
- **scroll_control**: Scroll actions
- **screenshot**: Capture screenshot
- **switch_tab**: Switch between tabs/windows
- **wait**: Pause for a specified duration

### File System Tools

- **read_file**: Read file contents
- **write_file**: Write file contents
- **list_directory**: List directory contents

### System Tools

- **get_system_stats**: System statistics
- **get_open_windows**: List open windows
- **run_shell_command**: Execute shell command (supports `yield_after_seconds` + `env` overrides; use `process` for background sessions)
- **process**: Manage background shell sessions (poll/log/write/kill)

**Note**: The sidecar implements additional tools (`replace`, `search_file_content`, `glob`, `read_many_files`), but they are not currently registered in the backend tool schemas, so the LLM cannot call them yet. `process` is registered and available.

## Security

### Tool Execution Security

- **Permission Model**: `SecurityPolicy` defines permissions, but sidecar execution does not enforce them yet
- **Sandbox Hooks**: Executor abstraction allows sandboxing (not enabled by default)
- **Resource Limits**: Limits are defined in `SecurityPolicy`, not enforced in sidecar by default
- **Audit Logging**: Policy supports audit logs; wire-in is required for enforcement

### Tool Validation

- **Schema Validation**: Tool arguments validated against schema
- **Type Checking**: Argument types validated
- **Required Fields**: Required fields checked
- **Range Validation**: Numeric ranges validated

## Performance

### Optimization Strategies

- **Parallel Execution**: Multiple tools in parallel
- **Caching**: Tool schemas cached
- **Batch Processing**: Batch coordinate resolution
- **Lazy Loading**: Tools loaded on demand

### Resource Management

- **Thread Pool**: Global thread pool for blocking operations
- **Memory Management**: Screenshot cleanup
- **Timeout Handling**: Tool execution timeouts

## Testing

### Tool Testing

Tools can be tested independently:

```python
async def test_my_tool():
    tool = MyTool()
    result = await tool.execute(
        {"param1": "value"},
        ToolContext(...)
    )
    assert result.success
```

### Integration Testing

Tool execution flow tested end-to-end:

```python
async def test_tool_execution_flow():
    # Test tool call generation
    # Test tool preparation
    # Test tool execution
    # Test result processing
```

## Extension Points

### Custom Tool Development

1. Create tool class inheriting from `Tool`
2. Implement `execute()` method
3. Define tool schema
4. Register tool in registry

### Tool Registration

1. Create tool class inheriting from `Tool`
2. Define schema + `execute()` implementation
3. Register in `backend/src/tools/registry.py`

---

For more detailed information, see:
- [Tool Development Guide](TOOL_DEVELOPMENT.md)
- [API Reference](API_REFERENCE.md)
- [Backend Architecture](BACKEND_ARCHITECTURE.md)
