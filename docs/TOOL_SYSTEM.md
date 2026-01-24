# Tool System

## Overview

The Tool System enables the Desktop Assistant to interact with the computer through a set of specialized tools. Tools can be executed on the frontend (Python sidecar) or backend, with the backend primarily handling tool discovery, schema management, and coordinate resolution.

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Backend (Python)                   │
│  ┌───────────────────────────────────────────┐  │
│  │  ToolRegistry                              │  │
│  │  - Tool Discovery                          │  │
│  │  - Schema Management                       │  │
│  │  - Remote Tool Stubs                       │  │
│  └───────────────────────────────────────────┘  │
│              ↕                                    │
│  ┌───────────────────────────────────────────┐  │
│  │  ToolOrchestrator                          │  │
│  │  - Tool Execution Coordination             │  │
│  │  - Coordinate Resolution                   │  │
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
- **Terminal Tools**: `run_shell_command`

### Backend Tools

Most tools are remote tools (stubs) that execute on the frontend. The backend primarily provides:

- **Remote Tool Stubs**: Schema definitions for frontend tools (see `backend/src/tools/remote.py`)
- **Tool Registry**: Tool discovery and schema management
- **Tool Orchestration**: Coordinate resolution and tool preparation
- **Plugin Tools**: Plugin-provided tools (if any plugins register tools)

**Note**: Memory operations are handled by the frontend Python sidecar, not backend tools. The backend provides embedding generation via REST API, but memory storage and retrieval are frontend responsibilities.

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

**ToolPreparer** (`agent/tools/tool_preparer.py`) prepares tool calls:

1. **Screenshot Acquisition**: Ensures screenshot is available
2. **OCR Processing**: Runs OCR if needed for coordinate resolution
3. **Coordinate Resolution**: Resolves coordinates using OCR or vision models
4. **Tool Call Preparation**: Adds metadata and coordinates

### 3. Tool Execution

**ToolOrchestrator** (`tools/orchestrator.py`) coordinates execution:

1. Sends tool call to frontend via WebSocket
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

**ToolResultHandler** (`agent/core/tool_result_handler.py`) processes results:

1. Receives tool result from frontend
2. Stores result in centralized **ToolResultStorage** (with TTL-based cleanup)
3. Processes screenshot and OCR
4. Updates conversation history (O(1) access via cached LLM format)
5. Continues agent interaction

**ResultTransformer** (`agent/tools/result_transformer.py`) transforms raw tool results:

- **Pure Function**: No side effects, no state mutation, no history access
- **Responsibility**: Pure data transformation only
- **Invariant**: Must remain side-effect free (no session access, no history mutation, no IO, no events)

**Key Methods**:
- `transform(tool_name, tool_result)`: Transform raw result into ProcessedToolResult
- `_extract_screenshot_data()`: Extract screenshot from tool result or plugin artifacts

**ProcessedToolResult**:
- `tool_name`: Name of the tool
- `formatted_message`: Pre-formatted message for history
- `screenshot_data`: Optional screenshot data
- `success`: Success status
- `error`: Error message if failed
- `artifacts`: Optional artifacts dictionary

**BundleResultFormatter** (`agent/tools/bundle_result_formatter.py`) formats bundle results:

- **Purpose**: Converts atomic bundle results into single cohesive narrative
- **Method**: `format(bundle_result, system_state)`
- **Features**:
  - Eliminates redundant XML blocks
  - Provides cleaner context for LLM
  - Formats step-by-step narrative
  - Includes system state XML
  - Handles success, partial_failure, and failure statuses

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
from backend.src.tools.remote import RemoteTool

class MyRemoteTool(RemoteTool):
    name = "my_remote_tool"
    description = "Description of my remote tool"
    
    def get_schema(self) -> dict:
        return {...}
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
2. **Backend Tools**: Registered in tool registry
3. **Plugin Tools**: Registered by plugins

## Coordinate Resolution

Coordinate resolution is handled by pure resolver classes in `agent/tools/resolvers/coordinate_resolvers.py`. These are pure functions with no side effects, making them fully testable.

### OCR-Based Resolution

For tools requiring coordinate resolution via OCR:

```python
{
    "tool_name": "mouse_control",
    "arguments": {
        "action": "click",
        "find_coordinates_by": "ocr",
        "ocr_text": "Submit Button"
    }
}
```

**OcrResolver** (`resolvers/coordinate_resolvers.py`):
- **Pure Function**: No side effects, deterministic output
- **Method**: `resolve(text, ocr_results, threshold=0.8)`
- **Algorithm**: Uses `difflib.SequenceMatcher` for fuzzy text matching
- **Threshold**: Default 0.8 similarity score (configurable)
- **Returns**: Tuple of (x, y) center coordinates from bounding box

**Flow**:
1. Screenshot captured
2. OCR runs on screenshot (via `OcrCoordinator`)
3. `OcrResolver.resolve()` searches OCR results for matching text
4. Best match found using similarity scoring
5. Coordinates extracted from bounding box center
6. Tool call prepared with coordinates

**Error Handling**:
- Raises `ValueError` if OCR results empty
- Raises `ValueError` if text not found or match score below threshold
- Logs timing information for performance monitoring

### Vision-Based Resolution

For tools using vision models:

```python
{
    "tool_name": "mouse_control",
    "arguments": {
        "action": "click",
        "find_coordinates_by": "prediction",
        "description": "Submit button"
    }
}
```

**VisionResolver** (`resolvers/coordinate_resolvers.py`):
- **Pure Function**: No side effects, deterministic output
- **Method**: `resolve(description, screenshot_data, vision_service)`
- **Model**: Uses InternVL model via VisionService
- **Returns**: Tuple of (x, y) coordinates from model prediction

**Flow**:
1. Screenshot captured
2. `VisionResolver.resolve()` called with description and screenshot
3. InternVL model analyzes screenshot and description
4. Model predicts click coordinates
5. Coordinates returned
6. Tool call prepared with coordinates

**Error Handling**:
- Raises `ValueError` if description missing
- Raises `ValueError` if vision service unavailable or not initialized
- Raises `ValueError` if model cannot identify element
- Logs timing information for performance monitoring

### CoordinateResolver

**CoordinateResolver** (`resolvers/coordinate_resolvers.py`):
- Routes coordinate resolution to OCR or Vision methods
- **Pure Function**: No side effects, deterministic output
- **Method**: `resolve(tool_call, screenshot_data, ocr_results, vision_service)`

**Usage**:
```python
resolver = CoordinateResolver(
    ocr_resolver=OcrResolver(),
    vision_resolver=VisionResolver()
)

coordinates = await resolver.resolve(
    tool_call=parsed_tool_call,
    screenshot_data=screenshot_base64,
    ocr_results=ocr_results,  # For OCR method
    vision_service=vision_service  # For Vision method
)
```

**Features**:
- Automatic method detection from tool call parameters
- Parameter validation before resolution
- Clear error messages for missing parameters
- Supports both OCR and Vision methods

## Screenshot Management

### Screenshot Lifecycle

1. **User Message**: Screenshot captured before sending (via useChatMessageSender)
2. **Tool Execution**: Screenshot automatically captured after computer-use tool execution (via ToolExecutionService)
   - **Individual Tools**: Screenshot captured **once** after tool execution completes
   - **Bundled Tools**: Screenshot captured **once** after all bundled tools execute (not after each tool)
   - Both use the same helper method (`captureSystemStateAndScreenshot`) ensuring:
     - 2 second delay before capture (for UI to update)
     - Parallel system state + screenshot capture
     - Consistent error handling
     - Proper timing logs
3. **Hidden Screenshots**: Screenshot requested by backend if needed (via request-screenshot message)
4. **OCR Processing**: Screenshot processed for OCR (backend)
5. **Storage**: Screenshot stored in session with unique ID (backend)

### ScreenshotManager

**ScreenshotManager** (`agent/tools/screenshot_manager.py`) manages screenshots:

- **get_screenshot()**: Get screenshot from session or request hidden screenshot
- **process_screenshot()**: Process and store screenshot, trigger OCR
- **Screenshot IDs**: Unique IDs prevent race conditions

## Tool Schemas

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
- Provides schemas to LLM
- Validates tool call arguments

## Built-in Tools

### Computer Control Tools

- **mouse_control**: Mouse actions (click, drag, move)
- **keyboard_control**: Keyboard input
- **scroll_control**: Scroll actions
- **screenshot**: Capture screenshot

### File System Tools

- **read_file**: Read file contents
- **write_file**: Write file contents
- **list_directory**: List directory contents
- **search_file_content**: Search file contents
- **glob**: File pattern matching

### System Tools

- **get_system_stats**: System statistics
- **get_open_windows**: List open windows
- **run_shell_command**: Execute shell command

## Security

### Tool Execution Security

- **Permission System**: Tools require explicit permissions
- **Sandboxing**: Isolated execution environment
- **Resource Limits**: CPU, memory, and time limits
- **Audit Logging**: All tool executions logged

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

### Tool Plugin Development

1. Create plugin implementing tool interface
2. Register tool in plugin
3. Plugin registers tool on initialization

---

For more detailed information, see:
- [Tool Development Guide](TOOL_DEVELOPMENT.md)
- [API Reference](API_REFERENCE.md)
- [Backend Architecture](BACKEND_ARCHITECTURE.md)
