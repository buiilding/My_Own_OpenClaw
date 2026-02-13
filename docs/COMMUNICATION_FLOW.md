---
summary: "Communication Flow"
read_when:
  - When changing IPC or event flow.
---

# Communication Flow

## Overview

Desktop Assistant uses a multi-layered communication architecture with WebSocket for backend communication and IPC for Electron process communication.

## Communication Layers

```
┌─────────────────────────────────────────────────────────┐
│         Renderer Process (React)                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │  React Components                                  │  │
│  │  - ChatInterface                                   │  │
│  │  - MessageInput                                    │  │
│  │  - MessageList                                     │  │
│  └───────────────────────────────────────────────────┘  │
│                    ↕ IPC (preload.js)                     │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Main Process (Node.js)                           │  │
│  │  - IPC Bridge (ipc.cjs)                            │  │
│  │  - WebSocket Client                                 │  │
│  └───────────────────────────────────────────────────┘  │
│                    ↕ WebSocket (default ws://127.0.0.1:8765/ws) │
│  ┌───────────────────────────────────────────────────┐  │
│  │  Python Backend (FastAPI)                          │  │
│  │  - WebSocket Routes                                 │  │
│  │  - Message Handlers                                 │  │
│  │  - Agent System                                     │  │
│  └───────────────────────────────────────────────────┘  │
```

## IPC Communication (Electron)

### IPC Channels

#### Renderer → Main

**`to-backend`**
- Purpose: Send messages to backend
- Format: `{ type, payload }`
- Usage: All backend communication from renderer

**`wakeword-audio-chunk`**
- Purpose: Send audio chunks for wakeword detection
- Format: `Buffer` (binary)
- Usage: Real-time audio streaming

**`wakeword-enable`**
- Purpose: Enable wakeword detection
- Format: `{}`
- Usage: Start wakeword service

**`wakeword-disable`**
- Purpose: Disable wakeword detection
- Format: `{}`
- Usage: Stop wakeword service

#### Main → Renderer

**`from-backend`**
- Purpose: Receive messages from backend
- Format: `{ id, type, payload }`
- Usage: All backend responses to renderer

**`ipc-status`**
- Purpose: Connection status updates
- Format: `{ isConnected: boolean }`
- Usage: Connection state management

**`wakeword-detected`**
- Purpose: Wakeword detection events
- Format: `{ confidence: number }`
- Usage: Wakeword activation

**`wakeword-status`**
- Purpose: Wakeword service status
- Format: `{ status: string, error?: string }`
- Usage: Service health monitoring

### IPC Implementation

**Preload Script** (`src/preload.js`):
- Exposes `window.ipc` API
- Whitelists allowed channels
- Provides secure IPC bridge

**IPC Bridge** (`src/renderer/infrastructure/ipc/bridge.ts`):
- Type-safe IPC abstraction layer
- Channel validation (development only)
- O(1) channel lookup using Set data structures
- Provides IpcBridge.send(), IpcBridge.invoke(), IpcBridge.on()

**Main Process** (`src/main/ipc.cjs`):
- Handles IPC message routing
- Manages WebSocket connection
- Forwards messages between renderer and backend
- Builds complete user messages with system state and memories

## WebSocket Communication

### Connection Lifecycle

1. **Connection**: Client connects to backend WebSocket (default `ws://127.0.0.1:8765/ws`)
2. **Handshake**: Client sends handshake message (backend validates and uses client `user_id`)
3. **Session Creation**: Backend creates session
4. **Message Loop**: Continuous message exchange
5. **Disconnection**: Cleanup on disconnect

### Endpoint Resolution (Electron Main)

`frontend/src/main/ipc.cjs` resolves backend endpoints in this order:

1. `BACKEND_WS_URL` and/or `BACKEND_HTTP_URL`
2. `BACKEND_HOST` + `BACKEND_PORT`
3. Fallback: `ws://127.0.0.1:8765/ws` and `http://127.0.0.1:8765`

The resolved HTTP URL is also passed to the Python sidecar as `WINDIE_BACKEND_HTTP_URL`
so memory embedding/summarization calls target the same backend host.

### Message Format

**Handshake (required, before any other messages)**:
```json
{ "type": "handshake", "user_id": "user-123" }
```

**Outgoing (Client → Server)**:
```json
{
  "id": "uuid-v4",
  "type": "query|load-settings|list-models|update-settings|tool-result|tool-bundle-result|wakeword-detected",
  "payload": { ... }
}
```

**Incoming (Server → Client)**:
```json
{
  "id": "uuid-v4",
  "type": "streaming-response|tool-call|tool-output|error|...",
  "payload": { ... }
}
```

### Message Types

#### Client Message Types

**`query`**
- Purpose: User query with optional screenshot
- Payload: `{ text: string, content?: string, screenshot?: string, config?: object }`
- Response: Streaming response

**`list-models`**
- Purpose: Request available models
- Payload: `{}`
- Response: `models-listed`
- Notes:
  - Sent only by the main dashboard renderer (`view` query param absent).
  - Chat overlay renderers (`view=chatbox`, `view=chatbox-response`) do not request models.
  - Renderer startup guards this request to one-shot per renderer lifecycle to avoid duplicate local-provider probes in React StrictMode.

**`load-settings`**
- Purpose: Request frontend-owned settings snapshot from backend session/default config.
- Payload: `{}`
- Response: `settings-loaded`

**`update-settings`**
- Purpose: Apply frontend-owned config fields to the active backend session.
- Payload: `{ model_mode?, model_provider?, selected_model_id?, interaction_mode?, voice_mode_enabled?, speech_mode_enabled? }`
- Response: `settings-updated`

**`wakeword-detected`**
- Purpose: Notify backend of wakeword activation
- Payload: `{}`

**`tool-result`**
- Purpose: Tool execution result from frontend
- Payload: `{ request_id, success, data?: { llm_content, system_state: { active_window, mouse_position }, screenshot_ref?, screenshot? }, error? }`
- Notes:
  - when `data` is present, `system_state.active_window` and `system_state.mouse_position` are required.
  - `screenshot_ref`/`screenshot` are only sent for computer-use tool results.
- Response: Acknowledgment

**`tool-bundle-result`**
- Purpose: Result of atomic tool bundle
- Payload: `{ bundle_id, status, screenshot_ref?, screenshot?, system_state?, step_results: [{ tool, status, output?, ...extra_fields }], error? }`
- Notes:
  - Step `status` convention is `ok` / `error`.
  - Step `output` may be string or structured object.
  - Frontend may synthesize step output `Tool <tool_name> executed successfully (no output)` when a tool succeeds with no explicit output.
  - Screenshot fields are only sent when the bundle includes computer-use actions.
  - When `system_state` is present, it uses `{ active_window, mouse_position }`.

**`rehydrate-conversation`**
- Purpose: Restore a transcript snapshot into backend session history when resuming a past conversation.
- Payload: `{ conversation_ref, rehydrate_mode: "replace", messages: [{ role, content, message_type?, tool_name?, correlation_id?, tool_call_id?, tool_calls?, timestamp?, screenshot_ref?, screenshot? }] }`
- Notes:
  - `tool_call_id` and `tool_calls` are optional linkage fields for native tool-calling history.
  - If omitted, backend reconstructs valid tool-call linkage from transcript `message_type` + `correlation_id` and synthesizes missing IDs as needed.

#### Server Message Types

**`streaming-response`**
- Purpose: Streaming text chunks
- Payload: `{ text: string }`
- Usage: Real-time response streaming

**`tool-call`**
- Purpose: Tool execution request
- Payload: `{ tool_name, parameters, request_id, metadata? }`
- Usage: Request tool execution

Identity notes:
- `request_id` is backend-generated and used to correlate the later `tool-result`.
- `metadata.tool_call_id` is provider-origin when available (LLM/provider tool-call `id`); backend falls back to `tool_call_<index>` if absent.

**`tool-bundle`**
- Purpose: Atomic bundle of tools (single message)
- Payload: `{ bundle_id, tools: [{ name, args }] }`
- Usage: Execute tools sequentially and return `tool-bundle-result`

**`tool-output`**
- Purpose: Tool execution result
- Payload: `{ tool_name, success, output, execution_time?, error?, screenshot?, metadata? }`
- Usage: Tool execution complete

**`llm-thought`**
- Purpose: LLM thinking tokens (Gemini)
- Payload: `{ status: string }`
- Usage: Display reasoning

**`error`**
- Purpose: Error response
- Payload: `{ message: string }`
- Usage: Error handling

**`streaming-complete`**
- Purpose: End of stream
- Payload: `{}`
- Usage: Mark streaming complete

**`settings-updated`**
- Purpose: Acknowledge `update-settings` payload application for the current session.
- Usage: Electron main process gates first `query`/`wakeword-detected` until this ACK (or timeout fallback) to avoid tool-whitelist races.

**`settings-loaded`**
- Purpose: Return frontend-owned config snapshot for the current session/default config.
- Usage: Response to `load-settings`.

**`models-listed`**
- Purpose: Available models response

## Memory HTTP Flow (Sidecar ↔ Backend)

The Python sidecar uses REST endpoints on the same FastAPI server (default `http://127.0.0.1:8765`) for memory operations. This is separate from the WebSocket stream and inherits Electron's resolved backend HTTP URL.

```
┌──────────────────────────────┐          HTTP           ┌──────────────────────────────┐
│ Python Sidecar (memory/)     │  ───────────────────▶   │ FastAPI REST (memory routes) │
│ - LocalMemoryStore           │                         │ - /api/embeddings            │
│ - MemorySummarizer           │  ◀───────────────────   │ - /api/semantic/summarize    │
└──────────────────────────────┘                         └──────────────────────────────┘
```

### Embedding Flow
1. Sidecar prepares episodic memory content.
2. `POST /api/embeddings/` returns the embedding vector.
3. Sidecar stores embeddings in local FAISS indexes.

### Semantic Summarization Flow
1. MemorySummarizer batches episodic memories by conversation.
2. `POST /api/semantic/summarize` returns summary + facts.
3. Sidecar stores semantic memory and marks episodic memories as semanticized.

### Health Checks
- `GET /api/embeddings/health`
- `GET /api/semantic/health`
- Payload: `{ local: [...], online: [...] }`
- Usage: Model selection

## Message Flow Examples

### User Query Flow

```
1. User types message in UI
   ↓
2. useChatMessageSender hook handles message
   ↓
3. Screenshot captured (always for visual context)
   ↓
4. Screenshot uploaded via HTTP `/api/artifacts` → returns `screenshot_ref`
   ↓
5. IpcBridge.send('to-backend', { type: 'query', payload: { screenshot_ref, ... } })
   ↓
6. Main process receives IPC message
   ↓
7. Main process builds complete message with system state and memories
   ↓
8. Main process sends WebSocket message to backend
   ↓
9. Backend validates message (schema.py)
   ↓
9. QueryHandler processes message
   ↓
11. AgentSession.process_query()
    ↓
11. LLM generates response
    ↓
13. Backend streams response chunks
    ↓
14. Main process receives WebSocket messages
    ↓
15. Main process forwards to renderer via IPC
    ↓
16. useChatStream hook processes events
    ↓
17. Chat store updated via Zustand
    ↓
18. UI updates with streaming response
```

### Tool Execution Flow

```
1. LLM generates tool call
   ↓
2. Backend sends tool-call message
   ↓
3. Main process receives via WebSocket
   ↓
4. Main process forwards to renderer via IPC
   ↓
5. useToolRunner hook receives tool-call event
   ↓
6. ToolExecutionService.executeTool() called
   ↓
7. Tool sent to Python sidecar via IpcBridge.invoke()
   ↓
8. Python sidecar executes tool
   ↓
9. ToolExecutionService.captureSystemStateAndScreenshot() called ONCE (if computer-use tool)
   - 2 second delay for UI to update
   - Parallel system state + screenshot capture
   ↓
10. MessageFormatter formats result
   ↓
11. If captured, screenshot uploaded via HTTP `/api/artifacts` → returns `screenshot_ref`
    ↓
12. Result displayed in UI via callback
   ↓
13. Result sent to backend via IpcBridge.send() (includes `screenshot_ref` only for computer-use tools)
    ↓
14. Main process sends tool-result to backend via WebSocket
    ↓
15. Backend processes result (centralized storage)
    ↓
16. Agent continues with next step
```

### Settings Flow

Settings are persisted locally and synced to the backend session:

- `AppConfigContext.updateConfig()` saves to localStorage and disk.
- Frontend sends `update-settings` to backend.
- Main process tracks `settings-updated` ACK by message id.
- First `query`/`wakeword-detected` after connect waits for initial settings sync ACK (timeout fallback keeps app responsive).
- Backend applies session config updates for the active session before subsequent query processing.

## Error Handling

### Error Flow

```
1. Error occurs in component
   ↓
2. Error caught and logged
   ↓
3. Error message sent to backend (if needed)
   ↓
4. Backend processes error
   ↓
5. Backend sends error response
   ↓
6. Frontend receives error
   ↓
7. Error displayed in UI
```

### Error Message Format

```json
{
  "id": "uuid-v4",
  "type": "error",
  "payload": {
    "message": "Error message"
  }
}
```

## Connection Management

### Connection State

**States**:
- `disconnected`: No connection
- `connecting`: Connection in progress
- `connected`: Connected and ready
- `error`: Connection error

### Reconnection Logic

**Main Process**:
- Auto-reconnect on disconnect
- Exponential backoff
- Max reconnection attempts

**Backend**:
- Handles reconnection gracefully
- Maintains session state
- Cleans up on disconnect

## Thread Safety

### SafeWebSocket

**Backend** uses `SafeWebSocket` wrapper:
- Queue-based message sending
- Single sender task
- Thread-safe message enqueueing

**Main Process**:
- Single WebSocket connection
- Message queue for sending
- Thread-safe IPC handling

## Performance Considerations

### Message Size Limits

- **Max Message Size**: 10MB
- **Screenshot Compression**: PNG format
- **Chunk Size**: Streaming chunks optimized

### Optimization Strategies

- **Message Batching**: Batch multiple messages
- **Compression**: Compress large payloads
- **Caching**: Cache frequent messages
- **Lazy Loading**: Load data on demand

## Security

### Message Validation

- **Schema Validation**: Pydantic models
- **Type Checking**: Type validation
- **Sanitization**: Input sanitization
- **Rate Limiting**: Prevent DoS attacks

### Secure Communication

- **Local Only**: WebSocket on localhost
- **No External Access**: No external connections
- **IPC Security**: Whitelisted channels only
- **Content Security**: CSP headers enforced

---

For more detailed information, see:
- [Frontend Architecture](FRONTEND_ARCHITECTURE.md)
- [Backend Architecture](BACKEND_ARCHITECTURE.md)
- [API Reference](API_REFERENCE.md)
