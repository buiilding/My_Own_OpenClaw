# Frontend Responsibilities

## Overview

The frontend is built with **Electron** and consists of three main processes:

1. **Renderer Process (React)**: User interface
2. **Main Process (Node.js)**: IPC coordination and WebSocket client
3. **Python Sidecar**: Local tool execution and system state

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

1. **IPC Bridge**: Coordinates communication between renderer and sidecar
2. **WebSocket Client**: Maintains WebSocket connection to backend
3. **Tool Execution Bridge**: Routes tool execution requests to Python sidecar
4. **System State Management**: Determines context type (initial vs sequential)

### Key Files

- `ipc.cjs`: IPC handlers, WebSocket client, system state coordination
- `tool_runner_bridge.cjs`: Manages Python sidecar subprocess
- `preload.js`: Exposes safe IPC APIs to renderer

### IPC Channels

**Renderer → Main:**
- `to-backend`: Send query to backend
- `execute-tool`: Execute tool on sidecar
- `get-system-state`: Get system state from sidecar
- `store-memory`: Store memory in sidecar

**Main → Renderer:**
- `from-backend`: Backend events (streaming responses, tool calls)
- `tool-result`: Tool execution results
- `tool-error`: Tool execution errors

### System Context Logic

- **First Query**: Sends `context_type: 'initial'` (full system context)
- **Subsequent Queries**: Sends `context_type: 'sequential'` (minimal context: active window, mouse position, time, clipboard)

### WebSocket Communication

- Connects to backend WebSocket server
- Sends query messages with system state and memories
- Receives streaming responses (thinking, tool calls, text chunks)
- Handles tool execution requests from backend

## Python Sidecar

**Location**: `frontend/src/main/python/`

### Responsibilities

1. **Tool Execution**: Executes computer control and filesystem tools locally
2. **System State Capture**: Captures OS state (windows, mouse, clipboard, etc.)
3. **Memory Storage**: Local episodic and semantic memory storage
4. **Automatic Screenshots**: Captures screenshots after tool execution

### Key Components

- `runner.py`: Main entry point, receives tool/system state requests via stdin/stdout
- `tools/computer/`: Mouse, keyboard, screenshot, scroll, wait tools
- `tools/filesystem/`: Read file, write file, list directory tools
- `core/system_state.py`: System state capture (initial and sequential)
- `core/thread_pool.py`: Global thread pool for efficient async execution
- `core/dispatcher.py`: Tool dispatcher with automatic screenshot capture
- `memory/local_store.py`: Local memory storage

### Tool Execution Flow

1. Main process sends tool request via stdin
2. Sidecar dispatches to appropriate tool
3. Tool executes (e.g., mouse click, file read) using global thread pool
4. **Automatic screenshot capture** after execution (2 second delay for UI updates)
5. Tool result + screenshot returned via stdout
6. Main process receives result and forwards to backend

### Performance Optimizations

- **Global Thread Pool**: Single shared `ThreadPoolExecutor` (10 workers) eliminates thread creation overhead
- **Combined Operations**: Screenshot tool combines capture, encoding, and base64 conversion in single executor call
- **Parallel System State**: System state capture runs independent operations in parallel
- **Async I/O**: All blocking operations (file I/O, FAISS, pyautogui) run in thread pool to avoid blocking event loop

### System State Types

- **Initial State**: Full context (all windows, system stats, etc.)
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
         Python Sidecar (tool execution)
                ↓
         Tool Result + Screenshot
                ↓
         Main Process → Backend
```

## Key Features

1. **Automatic Screenshots**: Frontend automatically captures screenshots after every tool execution
2. **System Context**: Provides OS state to backend for context-aware responses
3. **Local Tool Execution**: All computer control happens locally (security, performance)
4. **Memory Storage**: Local memory for fast retrieval
5. **Real-time Communication**: WebSocket for streaming responses

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
│   │   ├── tool_runner_bridge.cjs  # Sidecar bridge
│   │   └── python/         # Python sidecar
│   │       ├── runner.py
│   │       ├── tools/
│   │       │   ├── computer/
│   │       │   └── filesystem/
│   │       ├── core/
│   │       │   └── system_state.py
│   │       └── memory/
│   │           └── local_store.py
```
