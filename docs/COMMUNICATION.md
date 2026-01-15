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
- `execute-tool`: Execute tool in main process (Node.js)
- `get-system-state`: Get system state from main process
- `store-memory`: Store memory in Python sidecar

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

**Tool Result Message (Individual)**:
```json
{
  "type": "tool_result",
  "payload": {
    "request_id": "uuid",
    "success": true,
    "data": {
      // Tool-specific result data
      "screenshot": "base64_screenshot_data",
      "llm_content": "tool_name output:\n<content>\nstatus: successful\n<system_context>\n  <os_state>\n    <active_window>Application Name</active_window>\n    <mouse_position>(500, 300)</mouse_position>\n    <time>2026-01-02 13:23:17</time>\n    <clipboard_preview><empty></clipboard_preview>\n  </os_state>\n</system_context>\nState of the screen after tool_name was executed:",
      "is_preformatted": true
    },
    "error": null
  }
}
```

**Tool Result Message (Bundled)**:
```json
{
  "type": "tool_result",
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
        }
        // ... more tools
      ],
      "combined_llm_content": "Bundled tool execution output:\n\nkeyboard_control output:\n...\n\n<system_context>...</system_context>\n\nState of the screen after bundled tools were executed:",
      "system_state": {...},
      "screenshot": "base64_screenshot_data"
    }
  }
}
```

**Note**: System context is embedded in `llm_content` as XML, not as a separate `system_context` field. The `is_preformatted` flag indicates the message is ready for direct use by the backend.

**Bundled Results**: When tools are bundled, the frontend sends a single bundled result with:
- `bundled: true` flag
- `tools` array containing individual tool results (for orchestrator matching)
- `combined_llm_content` containing the combined message (for history storage)
- One `system_state` and one `screenshot` shared across all tools in the bundle

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

### 3. IPC (Main Process ↔ Python Sidecar)

**Note**: Tool execution now happens in Node.js main process. Python sidecar is only used for memory operations.

**Protocol**: IPC via `memory_service_bridge.cjs`

**Message Types**:

#### Main → Sidecar (Memory Operations Only)

**Memory Storage Request**:
```json
{
  "type": "tool_execution",
  "payload": {
    "tool_name": "mouse_control",
    "args": {...}
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

**Note**: Tool execution and system state capture now happen directly in the Node.js main process, not via Python sidecar.

## Complete Flow Example

### User Query Flow

```
1. User types message in React UI
   ↓
2. ChatContext sends via IPC: 'to-backend'
   ↓
3. Main process (ipc.cjs):
   - Determines context_type (initial/sequential)
   - Gets system state from Node.js (system_state.cjs)
   - Gets memories from Python sidecar
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
   - Routes to tool_executor.cjs
   ↓
7. Tool executor executes tool (Node.js):
   - Executes tool (e.g., mouse click using nut-js)
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
2. Determines context_type: "initial" (parallel with memory search)
3. Main process (Node.js) calls getSystemState() which captures minimal state (parallelized operations):
   - Active window
   - Mouse position
   - Time
   - Clipboard preview
4. Formats as full XML structure (formatInitialStateXml) - note: additional fields like windows, stats, screen_resolution, internet are expected but not currently captured, so they default to empty/Unknown
5. Sent to backend with query (system context is REQUIRED)
```

**Sequential Query**:
```
1. Main process detects subsequent query
2. Determines context_type: "sequential" (parallel with memory search)
3. Main process (Node.js) calls getSystemState() which captures minimal state (parallelized operations):
   - Active window
   - Mouse position
   - Time
   - Clipboard preview
4. Formats as minimal XML context (formatSequentialStateXml)
5. Sent to backend with query (system context is REQUIRED)
```

**Note**: Currently `getSystemState()` only captures minimal state regardless of context type. The formatting functions differ in XML structure, but the underlying data captured is the same.

**Tool Output**:
```
1. Tool execution completes on frontend
2. System context retrieved immediately after tool execution (via Node.js tool executor)
3. Main process (Node.js) captures minimal state (parallelized operations):
   - Active window
   - Mouse position
   - Time
   - Clipboard preview
4. Frontend formats complete message with system context XML embedded in llm_content
5. Frontend sets is_preformatted: true flag
6. Tool result sent to backend (REQUIRED: must be pre-formatted)
7. Backend uses pre-formatted message directly (no additional formatting)
```

**Performance Optimizations**:
- **Parallel Execution**: System state capture runs operations in parallel using Promise.all()
- **Fast Execution**: Operations execute concurrently to minimize total time
- **Fallback Context**: If retrieval fails, minimal fallback context is provided
- **Never Skipped**: System context is always included, even if retrieval fails

**Current Limitation**: `getSystemState()` currently only captures minimal state (active window, mouse position, time, clipboard) regardless of context type. The `formatInitialStateXml()` function expects additional fields (windows, stats, screen_resolution, internet) but these are not currently captured, so they default to empty/Unknown values in the XML output.

### Tool Execution Flow

```
1. Backend determines tool needed
2. Sends tool_call event to frontend
3. Main process routes to tool_executor.cjs
4. Tool executor executes tool (Node.js):
   - Computer control: nut-js
   - Filesystem: Node.js fs operations
   - System: systeminformation, etc.
5. Tool executor captures screenshot automatically
6. Returns result + screenshot
7. Main process sends to backend
8. Backend processes result
9. Backend may trigger proactive OCR on screenshot
10. Backend continues conversation
```

## Key Points

1. **Automatic Screenshots**: Frontend automatically captures screenshots after every tool execution
2. **Pre-formatted Messages**: Frontend pre-formats tool output messages with system context XML embedded in `llm_content`
3. **Context Types**: Initial (full) vs Sequential (minimal) system context for user queries
4. **Memory Coordination**: Backend queries frontend for memories, frontend stores locally
5. **Tool Delegation**: All tool execution happens on frontend, backend only orchestrates
6. **Streaming**: Real-time response streaming via WebSocket
7. **Binary Protocol**: Sidecar communication uses binary protocol for efficiency
8. **No Fallback Formatting**: Backend requires pre-formatted messages - raises `ValueError` if not pre-formatted
