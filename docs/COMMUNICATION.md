# Communication Flow

## Overview

The Desktop Assistant uses multiple communication channels:

1. **IPC (Inter-Process Communication)**: Renderer ↔ Main Process
2. **WebSocket**: Main Process ↔ Backend
3. **stdin/stdout**: Main Process ↔ Python Sidecar

## Communication Channels

### 1. IPC (Renderer ↔ Main Process)

**Protocol**: Electron IPC

**Channels**:

#### Renderer → Main
- `to-backend`: Send query to backend
- `execute-tool`: Execute tool on sidecar
- `get-system-state`: Get system state from sidecar
- `store-memory`: Store memory in sidecar

#### Main → Renderer
- `from-backend`: Backend events (streaming responses, tool calls)
- `tool-result`: Tool execution results
- `tool-error`: Tool execution errors

**Implementation**: `frontend/src/preload.js` exposes safe IPC APIs

### 2. WebSocket (Main Process ↔ Backend)

**Protocol**: WebSocket (FastAPI)

**Connection**: Main process maintains persistent WebSocket connection

**Message Types**:

#### Frontend → Backend

**Query Message**:
```json
{
  "type": "query",
  "payload": {
    "text": "User query text",
    "image_data": "base64_image_data (optional)",
    "context_type": "initial" | "sequential",
    "content": {
      "system_state": "<system_context>...</system_context>",
      "memories": ["memory1", "memory2"]
    }
  }
}
```

**Tool Result Message**:
```json
{
  "type": "tool_result",
  "payload": {
    "request_id": "uuid",
    "success": true,
    "data": {
      // Tool-specific result data
      "screenshot": "base64_screenshot_data"
    },
    "error": null,
    "system_context": {
      "active_window": "Application Name",
      "mouse_position": "(500, 300)",
      "time": "2026-01-02 13:23:17"
    }
  }
}
```

#### Backend → Frontend

**Streaming Events**:
- `thinking`: Agent thinking process
- `tool_call`: Tool execution request
- `text`: Text chunk
- `error`: Error message
- `complete`: Stream complete

**Tool Execution Request**:
```json
{
  "type": "tool_call",
  "payload": {
    "request_id": "uuid",
    "tool_name": "mouse_control",
    "args": {
      "action": "click",
      "x": 100,
      "y": 200
    }
  }
}
```

### 3. stdin/stdout (Main Process ↔ Python Sidecar)

**Protocol**: Binary protocol over stdin/stdout

**Message Format**: Binary (length-prefixed)

**Message Types**:

#### Main → Sidecar

**Tool Execution Request**:
```json
{
  "type": "tool_execution",
  "payload": {
    "tool_name": "mouse_control",
    "args": {...}
  }
}
```

**System State Request**:
```json
{
  "type": "system_state",
  "payload": {
    "context_type": "initial" | "sequential"
  }
}
```

**Memory Search Request**:
```json
{
  "id": "memory-request-id",
  "type": "memory_search_request",
  "payload": {
    "query": "user query text",
    "limit": 5
  }
}
```

**Memory Search Response**:
```json
{
  "id": "memory-request-id",
  "type": "response",
  "payload": {
    "success": true,
    "data": {
      "memories": {
        "episodic": ["memory text 1", "memory text 2"],
        "semantic": []
      }
    }
  }
}
```

**Note**: Memory search responses use `payload.data.memories` structure, not `payload.memories`.

#### Sidecar → Main

**Tool Result**:
```json
{
  "type": "tool_result",
  "payload": {
    "success": true,
    "data": {...},
    "screenshot": "base64_screenshot_data"
  }
}
```

**System State**:
```json
{
  "type": "system_state",
  "payload": {
    "xml": "<system_context>...</system_context>"
  }
}
```

## Complete Flow Example

### User Query Flow

```
1. User types message in React UI
   ↓
2. ChatContext sends via IPC: 'to-backend'
   ↓
3. Main process (ipc.cjs):
   - Determines context_type (initial/sequential)
   - Gets system state from sidecar
   - Gets memories from sidecar
   - Sends WebSocket message to backend
   ↓
4. Backend receives query:
   - Creates/gets AgentSession
   - Processes with LLM
   - Determines tool calls needed
   ↓
5. Backend sends tool_call event via WebSocket
   ↓
6. Main process receives tool_call:
   - Routes to sidecar via tool_runner_bridge
   ↓
7. Sidecar executes tool:
   - Executes tool (e.g., mouse click)
   - Captures screenshot automatically
   - Returns result + screenshot
   ↓
8. Main process receives result:
   - Sends tool_result to backend via WebSocket
   ↓
9. Backend processes result:
   - Updates conversation
   - Continues LLM processing
   - Streams response chunks
   ↓
10. Main process receives streaming events:
    - Forwards to renderer via IPC
    ↓
11. Renderer displays response to user
```

### System Context Flow

**System context is MANDATORY** - it must always be retrieved and provided to the LLM. The system will use fallback context if retrieval fails, but it will never skip system context entirely.

**Initial Query**:
```
1. Main process detects first query
2. Requests system_state with context_type: "initial" (parallel with memory search)
3. Sidecar captures full system state (parallelized operations):
   - All open windows
   - System stats (CPU, memory, battery)
   - Screen resolution
   - Internet status
   - Active window, mouse position, time, clipboard
4. Returns full XML context
5. Sent to backend with query (system context is REQUIRED)
```

**Sequential Query**:
```
1. Main process detects subsequent query
2. Requests system_state with context_type: "sequential" (parallel with memory search)
3. Sidecar captures minimal state (parallelized operations):
   - Active window
   - Mouse position
   - Time
   - Clipboard preview
4. Returns minimal XML context
5. Sent to backend with query (system context is REQUIRED)
```

**Tool Output**:
```
1. Tool execution completes on frontend
2. System context retrieved immediately after tool execution (30s timeout, waits for completion)
3. Sidecar captures minimal state (parallelized operations):
   - Active window
   - Mouse position
   - Time
4. System context added to tool-result payload
5. Tool result sent to backend with system context (REQUIRED)
```

**Performance Optimizations**:
- **Parallel Execution**: System state capture runs operations in parallel (max_workers=5)
- **Fast Execution**: Operations execute concurrently to minimize total time
- **Fallback Context**: If retrieval fails, minimal fallback context is provided
- **Never Skipped**: System context is always included, even if retrieval fails

### Tool Execution Flow

```
1. Backend determines tool needed
2. Sends tool_call event to frontend
3. Main process routes to sidecar
4. Sidecar executes tool:
   - Computer control: pyautogui
   - Filesystem: Python file operations
   - System: psutil, etc.
5. Sidecar captures screenshot automatically
6. Returns result + screenshot
7. Main process sends to backend
8. Backend processes result
9. Backend may trigger proactive OCR on screenshot
10. Backend continues conversation
```

## Key Points

1. **Automatic Screenshots**: Frontend automatically captures screenshots after every tool execution
2. **Context Types**: Initial (full) vs Sequential (minimal) system context
3. **Memory Coordination**: Backend queries frontend for memories, frontend stores locally
4. **Tool Delegation**: All tool execution happens on frontend, backend only orchestrates
5. **Streaming**: Real-time response streaming via WebSocket
6. **Binary Protocol**: Sidecar communication uses binary protocol for efficiency
