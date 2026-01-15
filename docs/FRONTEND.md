# Frontend Responsibilities

## Overview

The frontend is built with **Electron** and consists of three main processes:

1. **Renderer Process (React)**: User interface
2. **Main Process (Node.js)**: IPC coordination, WebSocket client, tool execution, and system state capture
3. **Python Sidecar**: Memory storage only (tools and system state now in Node.js)

## Renderer Process (React)

**Location**: `frontend/src/renderer/`

### Responsibilities

- **User Interface**: Chat interface, message display, input handling
- **State Management**: Chat messages, conversation history
- **API Client**: Sends queries to backend via IPC
- **Event Listening**: Receives backend events (tool results, errors, streaming responses)

### Key Components

- `ChatContext.jsx`: Manages chat state and sends queries
- `api/client.js`: API client for backend communication

### Communication

- Uses `window.ipc` (exposed via preload.js) to communicate with main process
- Sends queries via `to-backend` channel
- Receives events via `from-backend`, `tool-result`, `tool-error` channels

## Main Process (Node.js)

**Location**: `frontend/src/main/`

### Responsibilities

1. **IPC Bridge**: Coordinates communication between renderer and backend
2. **WebSocket Client**: Maintains WebSocket connection to backend
3. **Tool Execution**: Executes computer control and filesystem tools locally using Node.js
4. **System State Management**: Captures OS state and determines context type (initial vs sequential)

### Key Files

- `ipc.cjs`: IPC handlers, WebSocket client, system state coordination
- `tool_executor.cjs`: Executes tools using Node.js implementations (nut-js, systeminformation, etc.)
- `system_state.cjs`: Captures system state (windows, mouse, clipboard, etc.)
- `preload.js`: Exposes safe IPC APIs to renderer

### IPC Channels

**Renderer → Main:**
- `to-backend`: Send query to backend
- `execute-tool`: Execute tool in main process
- `get-system-state`: Get system state from main process
- `store-memory`: Store memory in Python sidecar

**Main → Renderer:**
- `from-backend`: Backend events (streaming responses, tool calls)
- `tool-result`: Tool execution results
- `tool-error`: Tool execution errors

### System Context Logic

- **First Query**: Sends `context_type: 'initial'` (formatted with full XML structure, but `getSystemState()` only captures minimal state: active window, mouse position, time, clipboard)
- **Subsequent Queries**: Sends `context_type: 'sequential'` (minimal context: active window, mouse position, time, clipboard)

**Note**: Currently `getSystemState()` only captures minimal state regardless of context type. The `formatInitialStateXml()` function expects additional fields (windows, stats, screen_resolution, internet) but these are not currently captured, so they default to empty/Unknown values.

### WebSocket Communication

- Connects to backend WebSocket server
- Sends query messages with system state and memories
- Receives streaming responses (thinking, tool calls, text chunks)
- Handles tool execution requests from backend

## Tool Execution (Node.js)

**Location**: `frontend/src/main/tools/`

### Responsibilities

1. **Computer Control Tools**: Mouse, keyboard, screenshot, scroll using nut-js
2. **Filesystem Tools**: Read file, write file, list directory
3. **System Tools**: Shell commands, window management, system stats, wait

### Key Components

- `tools/computer/`: Mouse, keyboard, screenshot, scroll tools (Node.js with nut-js)
- `tools/filesystem/`: Read file, write file, list directory tools
- `tools/system/`: Shell, window management, stats, wait tools
- `tool_executor.cjs`: Tool execution handler with automatic screenshot capture

### Screenshot Implementation

The screenshot tool uses **nut-js** to capture screenshots:

- **Color Format Conversion**: nut-js returns pixel data in BGR format by default, which is converted to RGB format using the `toRGB()` method before encoding to PNG
- **Fallback**: If `toRGB()` is unavailable, manual BGR→RGB conversion is performed by swapping red and blue channels
- **Format**: Screenshots are encoded as PNG and converted to base64 for transmission

### Tool Execution Flow

**Individual Tools**:
1. Main process receives tool execution request via IPC
2. `tool_executor.cjs` routes to appropriate Node.js tool implementation
3. Tool executes (e.g., mouse click using nut-js, file read using Node.js fs)
4. **Automatic screenshot capture** after execution (1 second delay for UI updates)
5. **System state capture** after execution (active_window, mouse_position, time, clipboard)
6. Tool result + screenshot + system state returned to renderer process
7. Renderer process (`ChatContext.jsx`) formats complete message with system context XML embedded in `llm_content`
8. Renderer sets `is_preformatted: true` flag
9. Renderer displays tool output in UI
10. Pre-formatted result sent to backend via WebSocket (backend requires pre-formatted messages)

**Bundled Tools** (Multiple tools chained together):
1. Main process receives `bundle_start` event, then multiple `tool_call` events, then `bundle_end` event
2. Renderer collects tools into bundle array
3. Tools execute sequentially with `skipAutoCapture` for intermediate tools
4. **System state and screenshot captured once at bundle end** (for computer-use tools)
5. Renderer formats **combined message** with all tool outputs in single `llm_content`
6. Renderer displays **single combined output** in UI (not individual outputs)
7. Renderer sends bundled result with `bundled: true`, `tools` array, and `combined_llm_content`
8. Backend stores individual tool results for orchestrator matching
9. Backend uses combined result for history storage (single message)

### Performance Optimizations

- **Direct Execution**: Tools run directly in main process, no subprocess overhead
- **Async Operations**: All I/O operations are async to avoid blocking event loop
- **Automatic Screenshots**: Screenshots captured automatically after computer control tools

## Python Sidecar

**Location**: `frontend/src/main/python/`

### Responsibilities

1. **Memory Storage**: Local episodic and semantic memory storage
2. **Embedding Generation**: Vector embeddings for semantic search (via remote embedding client)

### Key Components

- `memory/local_store.py`: Local memory storage with FAISS indexing
- `memory_service.py`: Memory service bridge
- `core/remote_embedding_client.py`: Client for remote embedding generation

### System State Capture

**Location**: `frontend/src/main/system_state.cjs`

System state is captured in Node.js using:
- **nut-js**: For mouse position and screen information
- **systeminformation**: For system stats (CPU, memory, battery)
- **Node.js APIs**: For clipboard, active window detection

**System State Types**:
- **Initial State**: Formatted with full XML structure, but currently captures same minimal state as sequential (active window, mouse position, time, clipboard). Additional fields (windows, stats, screen_resolution, internet) are expected by `formatInitialStateXml()` but not currently captured.
- **Sequential State**: Minimal context (active window, mouse position, time, clipboard)

### Memory Storage

- **Episodic Memory**: Conversation history, tool executions
  - Stored in SQLite database: `~/.local/share/desktop-assistant/memory/episodic.db`
  - Vector index: `~/.local/share/desktop-assistant/memory/episodic.faiss.index`
  - FAISS index saved immediately after each addition for persistence
- **Semantic Memory**: Vector embeddings for semantic search
  - Stored in SQLite database: `~/.local/share/desktop-assistant/memory/semantic.db`
  - Vector index: `~/.local/share/desktop-assistant/memory/semantic.faiss.index`
  - FAISS index saved immediately after each addition for persistence

**Memory Search**:
- Performs semantic similarity search using FAISS
- Returns memories grouped by type (episodic/semantic)
- Response structure: `payload.data.memories` (not `payload.memories`)
- Automatically rebuilds FAISS index if empty but memories exist
- Stored locally in sidecar, queried by backend when needed

## Communication Flow

```
Renderer → IPC → Main Process → WebSocket → Backend
                ↓
         Tool Execution (Node.js)
                ↓
         Tool Result + Screenshot
                ↓
         Main Process → Backend
                ↓
         Python Sidecar (memory only)
```

## Key Features

1. **Automatic Screenshots**: Frontend automatically captures screenshots after every tool execution
2. **System Context**: Provides OS state to backend for context-aware responses
3. **Local Tool Execution**: All computer control happens locally (security, performance)
4. **Memory Storage**: Local memory for fast retrieval
5. **Real-time Communication**: WebSocket for streaming responses
6. **Bundled Tool Results**: Multiple chained tools displayed and stored as single combined output with one system context and one screenshot

## Tool Result Display

### Individual Tools

Each tool execution produces a separate output in the UI with its own system context and screenshot.

### Bundled Tools

When multiple tools are chained together (bundled):
- **Execution**: Tools execute sequentially with `skipAutoCapture` for intermediate tools
- **System State Capture**: System state and screenshot captured **once at bundle end** (for computer-use tools)
- **Display**: **Single combined output** shown in UI (not individual outputs)
  - Shows status of all tools in the bundle
  - Includes one `system_context` XML (shared across all tools)
  - Includes one screenshot (captured at bundle end)
- **Backend**: Sends bundled result with `combined_llm_content` for single-message history storage

## File Structure

```
frontend/
├── src/
│   ├── renderer/          # React UI
│   │   ├── context/
│   │   │   └── ChatContext.jsx
│   │   └── api/
│   │       └── client.js
│   ├── main/              # Electron main process
│   │   ├── ipc.cjs        # IPC handlers
│   │   ├── preload.js     # IPC API exposure
│   │   ├── tool_executor.cjs  # Tool execution handler
│   │   ├── system_state.cjs   # System state capture
│   │   ├── tools/         # Node.js tool implementations
│   │   │   ├── computer/  # Mouse, keyboard, screenshot, scroll
│   │   │   ├── filesystem/ # Read, write, list directory
│   │   │   └── system/     # Shell, windows, stats, wait
│   │   └── python/         # Python sidecar (memory only)
│   │       ├── memory/
│   │       │   └── local_store.py
│   │       └── memory_service.py
```
