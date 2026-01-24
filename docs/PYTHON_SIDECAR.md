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
3. Execute tool function
4. Return result with success status and data

#### `get_system_state() -> Dict[str, Any]`

Get current system state (active window, mouse position, clipboard, stats).

**Returns**: Dictionary with system state information

#### `search_memory(query: str, limit: int = 10) -> List[Dict[str, Any]]`

Search local memory store for relevant memories.

**Parameters**:
- `query`: Search query text
- `limit`: Maximum number of results

**Returns**: List of memory items

#### `store_memory(content: str, metadata: Dict[str, Any]) -> Dict[str, Any]`

Store a memory item in local memory store.

**Parameters**:
- `content`: Memory content text
- `metadata`: Optional metadata dictionary

**Returns**: Storage result with memory ID

#### `ping() -> Dict[str, Any]`

Health check method.

**Returns**: `{"status": "ok", "service": "local_backend"}`

#### `get_status() -> Dict[str, Any]`

Get detailed backend status for diagnostics.

**Returns**: Dictionary with service status, registered tools, memory store status

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
2. **Validation**: Args validated against Pydantic schema
3. **Execution**: Tool function called with validated args
4. **Result**: Tool result formatted and returned

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
