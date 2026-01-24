# Python Sidecar Documentation

## Overview

The Python Sidecar (`frontend/src/main/python/`) is a separate Python process that runs alongside the Electron main process. It handles tool execution, system state collection, memory operations, and communicates with the main process via JSON-RPC 2.0 protocol over stdin/stdout.

## Architecture

```
Electron Main Process (Node.js)
    ↕ stdin/stdout (JSON-RPC 2.0)
Python Sidecar Process
├── LocalBackend (main service)
│   ├── JSONRPCProtocol
│   ├── ToolRegistry
│   └── LocalMemoryStore
├── Tool Execution
│   ├── Computer Tools (mouse, keyboard, screenshot, scroll)
│   ├── Filesystem Tools (read, write, list, search, replace, glob, read_many)
│   └── System Tools (shell, window, stats, wait)
└── System State Capture
    └── Active window, mouse position, clipboard, stats
```

## Communication Protocol

### JSON-RPC 2.0

The sidecar communicates with the main process using JSON-RPC 2.0 over stdin/stdout:

**Request Format**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "execute_tool",
  "params": {
    "tool_name": "mouse_control",
    "args": { "action": "click", "x": 100, "y": 200 }
  }
}
```

**Response Format**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "success": true,
    "data": { ... }
  }
}
```

**Error Format**:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Internal error",
    "data": { ... }
  }
}
```

## Local Backend Service

### Overview

The `LocalBackend` class (`local_backend.py`) is the main service that handles all sidecar operations.

**Architecture**:
- JSON-RPC 2.0 protocol handler (via `core/ipc_protocol.py`)
- Tool registry integration
- Local memory store integration
- System state capture integration
- Async method support

**Initialization**:
1. Initialize JSON-RPC protocol handler
2. Initialize tool registry (loads all tools)
3. Initialize local memory store (SQLite + FAISS)
4. Register JSON-RPC methods
5. Start request loop (reads from stdin)

### Methods

#### `execute_tool(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]`

Execute a tool with the given arguments.

**Parameters**:
- `tool_name`: Name of the tool to execute
- `args`: Tool arguments (validated against Pydantic schema)

**Returns**: Tool execution result dictionary

**Flow**:
1. Validate tool name exists in registry
2. Validate arguments against Pydantic schema
3. Execute tool function (async)
4. Return result with success status and data

**Error Handling**:
- ToolNotFoundError: Tool name not in registry
- ValidationError: Arguments don't match Pydantic schema
- ToolExecutionError: Tool execution failed

#### `get_system_state() -> Dict[str, Any]`

Get current system state (active window, mouse position, clipboard, stats).

**Returns**: Dictionary with system state information:
- `active_window`: Currently focused window title
- `mouse_position`: Current mouse coordinates
- `clipboard`: Clipboard content preview (truncated to 100 chars)
- `screen_resolution`: Display resolution
- `windows`: List of all open window titles
- `stats`: System statistics (CPU, memory, battery)
- `time`: Timestamp

**Implementation**: Delegates to `core/system_state.py`

#### `search_memory(query: str, limit: int = 10) -> List[Dict[str, Any]]`

Search memories by semantic similarity.

**Parameters**:
- `query`: Search query text
- `limit`: Maximum number of results (default: 10)

**Returns**: List of memory dictionaries with similarity scores

**Implementation**: Delegates to `LocalMemoryStore.search()`

#### `store_memory(content: str, memory_type: str, metadata: Dict[str, Any] = None) -> Dict[str, Any]`

Store memory in local store.

**Parameters**:
- `content`: Memory content text
- `memory_type`: "episodic" or "semantic"
- `metadata`: Optional metadata dictionary

**Returns**: Dictionary with success status

**Implementation**: Delegates to `LocalMemoryStore.add_episodic()` or `LocalMemoryStore.add_semantic()`

#### `get_memory_stats() -> Dict[str, Any]`

Get memory statistics.

**Returns**: Dictionary with memory statistics (episodic count, semantic count, etc.)

**Implementation**: Delegates to `LocalMemoryStore.stats()`

#### `ping() -> Dict[str, Any]`

Health check method.

**Returns**: Dictionary with "pong" response

#### `get_status() -> Dict[str, Any]`

Get detailed backend status for diagnostics.

**Returns**: Dictionary with service status information:
- `status`: Service status ("ok" or "error")
- `service`: Service name ("local_backend")
- `running`: Whether service is running
- `memory_store_initialized`: Whether memory store is initialized
- `tool_registry_initialized`: Whether tool registry is initialized
- `registered_tools`: List of registered tool names
- `tool_count`: Number of registered tools
- `memory_store_status`: Memory store operational status

## Tool Registry

### Overview

The `ToolRegistry` (`tools/registry.py`) manages all available tools with Pydantic validation.

### Tool Registration

Tools are registered in the registry with their Pydantic schema classes:

```python
TOOL_SCHEMAS: Dict[str, Type[BaseModel]] = {
    "mouse_control": MouseControlArgs,
    "keyboard_control": KeyboardControlArgs,
    "screenshot": ScreenshotToolArgs,
    # ... more tools
}
```

### Tool Execution Flow

1. **Request Received**: JSON-RPC request with tool name and args
2. **Validation**: Args validated against Pydantic schema (from TOOL_SCHEMAS)
3. **Execution**: Tool function called with validated args
4. **Result**: Tool result formatted and returned
5. **Error Handling**: Errors caught and returned as ToolResult with success=False

**Key Methods**:
- `execute_tool(tool_name, args)`: Execute tool with validation
- `get_tool(tool_name)`: Get tool function by name
- `list_tools()`: List all registered tool names
- `_register_tools()`: Register all tools (called during initialization)

**TOOL_SCHEMAS Dictionary**:
- Maps tool names to Pydantic model classes
- Used for argument validation before tool execution
- Defined in `tools/registry.py`

## Built-in Tools

### Computer Control Tools

#### `mouse_control`

Mouse actions (click, double_click, right_click, drag, move).

**Location**: `tools/computer/mouse_tool.py`

**Arguments**:
- `action`: Mouse action type
- `x`, `y`: Coordinates (if provided)
- `find_coordinates_by`: "ocr" or "prediction" (if coordinates not provided)
- `target_text`: Text to find via OCR
- `target_description`: Description for vision model

#### `keyboard_control`

Keyboard input (type, key press, key combination).

**Location**: `tools/computer/keyboard_tool.py`

**Arguments**:
- `action`: Keyboard action type
- `text`: Text to type
- `key`: Key to press
- `keys`: Key combination

#### `screenshot`

Capture screenshot with optimized JPEG compression.

**Location**: `tools/computer/screenshot_tool.py`

**Features**:
- JPEG compression (quality 85) for faster encoding
- Base64 encoding for transmission
- Size calculation for monitoring

#### `scroll_control`

Scroll actions (up, down, left, right).

**Location**: `tools/computer/scroll_tool.py`

**Arguments**:
- `direction`: Scroll direction
- `amount`: Scroll amount (pixels or clicks)

### Filesystem Tools

#### `read_file`

Read file contents.

**Location**: `tools/filesystem/read_file_tool.py`

**Arguments**:
- `file_path`: Path to file (absolute or relative to workspace)

**Features**:
- Respects .gitignore rules
- Handles encoding detection
- Returns file content and metadata

#### `write_file`

Write file contents.

**Location**: `tools/filesystem/write_file_tool.py`

**Arguments**:
- `file_path`: Path to file
- `content`: File content
- `create_directories`: Create parent directories if needed

**Features**:
- Atomic writes (writes to temp file, then renames)
- Backup creation (optional)
- Encoding handling

#### `list_directory`

List directory contents.

**Location**: `tools/filesystem/list_directory_tool.py`

**Arguments**:
- `directory_path`: Path to directory
- `include_hidden`: Include hidden files
- `recursive`: Recursive listing

**Features**:
- Respects .gitignore rules
- Returns file metadata (size, modified time, type)

#### `search_file_content`

Search file contents with regex.

**Location**: `tools/filesystem/search_file_content_tool.py`

**Arguments**:
- `directory_path`: Directory to search
- `pattern`: Regex pattern
- `file_pattern`: File pattern filter

**Features**:
- Recursive search
- Respects .gitignore rules
- Returns matches with line numbers

#### `replace`

Replace text in files.

**Location**: `tools/filesystem/replace_tool.py`

**Arguments**:
- `file_path`: Path to file
- `old_text`: Text to replace
- `new_text`: Replacement text
- `regex`: Use regex matching

**Features**:
- Atomic writes
- Backup creation
- Regex support

#### `glob`

File pattern matching.

**Location**: `tools/filesystem/glob_tool.py`

**Arguments**:
- `pattern`: Glob pattern
- `root_dir`: Root directory for pattern

**Features**:
- Respects .gitignore rules
- Returns matching file paths

#### `read_many_files`

Read multiple files at once.

**Location**: `tools/filesystem/read_many_files_tool.py`

**Arguments**:
- `file_paths`: List of file paths

**Features**:
- Batch reading for efficiency
- Respects .gitignore rules
- Returns file contents and metadata

### System Tools

#### `run_shell_command`

Execute shell commands.

**Location**: `tools/system/shell_tool.py`

**Arguments**:
- `command`: Command to execute
- `directory`: Working directory (optional)
- `run_in_background`: Run in background (optional)
- `terminate_after_seconds`: Timeout (optional)

**Features**:
- Persistent working directory across commands
- Background execution support
- Timeout handling
- Output capture

#### `get_open_windows`

List open windows.

**Location**: `tools/system/window_tool.py`

**Returns**: List of open windows with titles and IDs

#### `switch_tab`

Switch to a window by title or ID.

**Location**: `tools/system/window_tool.py`

**Arguments**:
- `window_title`: Window title to match
- `window_id`: Window ID (alternative)

#### `get_system_stats`

Get system statistics.

**Location**: `tools/system/stats_tool.py`

**Returns**: CPU usage, memory usage, disk usage, network stats

#### `wait`

Wait for a specified duration.

**Location**: `tools/system/wait_tool.py`

**Arguments**:
- `seconds`: Duration to wait

**Features**:
- Non-blocking wait (allows cancellation)
- Used for delays between tool executions

## Core Utilities

### JSON-RPC Protocol (`core/ipc_protocol.py`)

JSON-RPC 2.0 protocol implementation for communication with Electron main process.

**JSONRPCProtocol Class**:
- `register_method(name, handler)`: Register method handler
- `create_request(method, params, request_id)`: Create JSON-RPC request
- `create_response(request_id, result, error)`: Create JSON-RPC response
- `create_error_response(request_id, code, message, data)`: Create error response
- `handle_request(request)`: Handle JSON-RPC request (async)

**JSONRPCError Exception**:
- Custom exception for JSON-RPC errors
- Fields: `code`, `message`, `data`

**Error Codes**:
- `PARSE_ERROR` (-32700): Invalid JSON
- `INVALID_REQUEST` (-32600): Invalid request structure
- `METHOD_NOT_FOUND` (-32601): Method not registered
- `INVALID_PARAMS` (-32602): Invalid parameters
- `INTERNAL_ERROR` (-32603): Internal server error

### System State (`core/system_state.py`)

System state collection for cross-platform support.

**Key Functions**:
- `get_system_state()`: Get complete system state (parallel capture)
- `_get_active_window()`: Get active window title (platform-specific)
- `_get_mouse_position()`: Get mouse coordinates
- `_get_clipboard_preview()`: Get clipboard content (truncated to 100 chars)
- `get_screen_resolution()`: Get display resolution
- `_get_all_open_windows()`: Get list of open windows
- `_get_system_stats()`: Get system statistics (CPU, memory, battery)

**Key Features**:
- **Parallel Operations**: All state components captured in parallel (asyncio.gather)
- **Cross-Platform**: Windows, macOS, Linux support
- **Error Isolation**: Individual component failures don't block others
- **Thread Pool**: Blocking operations run in thread pool

### Thread Pool (`core/thread_pool.py`)

Global ThreadPoolExecutor for the sidecar.

**Key Functions**:
- `get_executor(max_workers)`: Get global ThreadPoolExecutor (initializes if needed, default: 10 workers)
- `shutdown_executor(wait)`: Shutdown thread pool

**Features**:
- **Global Instance**: Single executor shared across all operations
- **Configurable Workers**: Default 10 workers, configurable
- **Lifecycle Management**: Shutdown on process exit

### Remote Embedding Client (`core/remote_embedding_client.py`)

HTTP client for backend embedding API.

**RemoteEmbeddingClient Class**:
- `__init__(backend_url)`: Initialize client with backend URL (default: "http://localhost:8765")
- `initialize()`: Initialize HTTP session (aiohttp.ClientSession)
- `close()`: Close HTTP session
- `embed_text(text)`: Generate embedding (returns numpy array)
- `dimension`: Property to get embedding dimension (default: 384)

**Features**:
- **Async HTTP**: Uses aiohttp for async HTTP requests
- **Error Handling**: Network error handling with detailed error messages
- **Timeout Management**: 30-second timeout for API calls
- **Numpy Integration**: Returns numpy arrays for FAISS compatibility
- **Session Management**: Reuses HTTP session for efficiency

### Platform-Specific Code (`core/platform/`)

Platform-specific implementations for window management.

**BaseWindowManager** (base.py):
- Abstract base class with interface
- Methods: `get_windows()`, `get_active_window()`, `switch_to_window()`

**WindowsWindowManager** (windows.py):
- Windows implementation using win32gui
- Window enumeration and activation via Windows API

**MacOSWindowManager** (macos.py):
- macOS implementation using AppKit
- Window management via NSWorkspace

**LinuxWindowManager** (linux.py):
- Linux implementation using xdotool
- Requires xdotool to be installed

**Key Methods** (all platforms):
- `get_windows()`: Get list of all open windows (returns list of dicts with 'title' and 'hwnd')
- `get_active_window()`: Get currently active window (returns dict or None)
- `switch_to_window(window_title)`: Switch to window by title (returns bool)

## System State Capture

### Overview

System state is captured automatically after computer-use tool execution and can be requested explicitly.

### Components

- **Active Window**: Current foreground window title and ID
- **Mouse Position**: Current mouse coordinates
- **Clipboard Preview**: First 100 characters of clipboard content
- **System Statistics**: CPU, memory, disk usage
- **Timestamp**: Current time

### Usage

System state is automatically captured:
- After computer-use tool execution (mouse, keyboard, scroll)
- When explicitly requested via `get_system_state` method

## Memory Operations

### Memory Service

**memory_service.py**:
- Memory service wrapper for LocalMemoryStore
- Provides simplified interface for memory operations
- Handles initialization and cleanup
- Integrates with RemoteEmbeddingClient

**Key Methods**:
- `initialize()`: Initialize memory store and embedding client
- `add_episodic(content, metadata)`: Add episodic memory
- `add_semantic(content, metadata)`: Add semantic memory
- `search(query, limit)`: Search memories
- `stats()`: Get memory statistics
- `close()`: Close database connections

### Local Memory Store

The sidecar maintains a local memory store (`memory/local_store.py`) for:
- Storing memories locally
- Searching memories by content
- Managing memory lifecycle

### Operations

- `search_memory(query, limit)`: Search memories by content
- `store_memory(content, metadata)`: Store new memory
- Memory persistence: Stored locally in SQLite database

## Error Handling

### Tool Execution Errors

- **Validation Errors**: Pydantic validation failures return error with details
- **Execution Errors**: Tool execution failures return error with message
- **Timeout Errors**: Tool timeouts return timeout error

### Error Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Tool execution failed",
    "data": {
      "tool_name": "mouse_control",
      "error": "Invalid coordinates"
    }
  }
}
```

## Performance Optimizations

### Screenshot Optimization

- **JPEG Compression**: Quality 85 for balance of size and quality
- **Optimize=False**: Faster encoding
- **Progressive=False**: Faster encoding
- **Base64 Encoding**: Efficient transmission format

### Tool Execution

- **Async Execution**: All tools are async for non-blocking execution
- **Thread Pool**: CPU-intensive operations run in thread pool
- **Validation**: Fast Pydantic validation before execution

## Security

### Input Validation

- All tool arguments validated against Pydantic schemas
- Type checking enforced
- Required fields validated
- Range validation for numeric values

## Tool Result and Schemas

### ToolResult (`tools/result.py`)

Standardized tool execution result structure.

**ToolResult Class**:
- `success`: Boolean indicating success/failure
- `data`: Optional result data dictionary
- `error`: Optional error message string (only if success=False)

**Key Methods**:
- `to_dict()`: Convert to dictionary for JSON-RPC response
- `success_result(data)`: Factory method for success
- `error_result(error)`: Factory method for error

**Usage**:
```python
# Success result
return ToolResult(
    success=True,
    data={"result": "..."}
)

# Error result
return ToolResult(
    success=False,
    error="Tool execution failed: ..."
)
```

### Tool Schemas (`tools/schemas.py`)

Pydantic models for all tool arguments providing type-safe validation.

**Schema Structure**:
- All schemas inherit from `pydantic.BaseModel`
- Field validation using `Field()` with descriptions and constraints
- Enum types for action fields (e.g., MouseAction, KeyboardAction)
- Custom validators for complex validation logic

**Schema Examples**:
- `MouseControlArgs`: Mouse action validation with coordinate requirements
- `KeyboardControlArgs`: Keyboard action validation with text/key requirements
- `ScreenshotToolArgs`: Screenshot tool arguments
- `ReadFileArgs`: File path validation
- `WriteFileArgs`: File write validation
- `ListDirectoryArgs`: Directory listing arguments
- And more for all tools

**Features**:
- **Type Safety**: Pydantic ensures type correctness
- **Validation**: Custom validators for action-specific requirements
- **Documentation**: Field descriptions provide context
- **Error Messages**: Clear validation error messages

### Path Security

- Absolute path validation
- .gitignore respect (prevents accessing ignored files)
- Workspace root restrictions (optional)

### Resource Limits

- Tool execution timeouts
- Memory limits (implicit via process isolation)
- File size limits (for read operations)

## Integration

### Main Process Integration

The sidecar is spawned by the Electron main process:

```javascript
// In main process
const pythonProcess = spawn('python', ['local_backend.py'], {
  stdio: ['pipe', 'pipe', 'pipe']
});

// Send JSON-RPC request
pythonProcess.stdin.write(JSON.stringify(request));

// Receive JSON-RPC response
pythonProcess.stdout.on('data', (data) => {
  const response = JSON.parse(data);
  // Handle response
});
```

### Tool Execution Service Integration

The frontend `ToolExecutionService` communicates with the sidecar via IPC:

1. Tool call received from backend
2. Tool sent to sidecar via IPC invoke
3. Sidecar executes tool
4. Result returned to frontend
5. Screenshot and system state captured (if needed)
6. Result sent back to backend

---

For more information, see:
- [Tool System](TOOL_SYSTEM.md)
- [Frontend Architecture](FRONTEND_ARCHITECTURE.md)
- [Tool Development Guide](TOOL_DEVELOPMENT.md)
