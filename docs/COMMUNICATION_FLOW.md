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
│                    ↕ WebSocket (ws://127.0.0.1:8765/ws)  │
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
- Format: `{ id, type, payload, timestamp }`
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

**Main Process** (`src/main/ipc.cjs`):
- Handles IPC message routing
- Manages WebSocket connection
- Forwards messages between renderer and backend

## WebSocket Communication

### Connection Lifecycle

1. **Connection**: Client connects to `ws://127.0.0.1:8765/ws`
2. **Handshake**: Client sends handshake message
3. **Session Creation**: Backend creates session
4. **Message Loop**: Continuous message exchange
5. **Disconnection**: Cleanup on disconnect

### Message Format

**Outgoing (Client → Server)**:
```json
{
  "id": "uuid-v4",
  "type": "query|load-settings|update-settings|list-models|tool-result",
  "payload": { ... },
  "timestamp": "ISO-8601"
}
```

**Incoming (Server → Client)**:
```json
{
  "id": "uuid-v4",
  "type": "streaming-response|tool-call|tool-output|error|...",
  "payload": { ... },
  "timestamp": "ISO-8601"
}
```

### Message Types

#### Client Message Types

**`query`**
- Purpose: User query with optional screenshot
- Payload: `{ text: string, screenshot?: string }`
- Response: Streaming response

**`load-settings`**
- Purpose: Request current settings
- Payload: `{}`
- Response: `settings-loaded`

**`update-settings`**
- Purpose: Update configuration
- Payload: `{ ...config }`
- Response: `settings-updated`

**`list-models`**
- Purpose: Request available models
- Payload: `{}`
- Response: `models-listed`

**`tool-result`**
- Purpose: Tool execution result from frontend
- Payload: `{ tool_name, result, screenshot?, system_context? }`
- Response: Acknowledgment

#### Server Message Types

**`streaming-response`**
- Purpose: Streaming text chunks
- Payload: `{ chunk: string }`
- Usage: Real-time response streaming

**`tool-call`**
- Purpose: Tool execution request
- Payload: `{ tool_name, arguments, request_id }`
- Usage: Request tool execution

**`tool-output`**
- Purpose: Tool execution result
- Payload: `{ tool_name, result, screenshot?, system_context? }`
- Usage: Tool execution complete

**`llm-thought`**
- Purpose: LLM thinking tokens (Gemini)
- Payload: `{ thought: string }`
- Usage: Display reasoning

**`error`**
- Purpose: Error response
- Payload: `{ message: string, code?: string }`
- Usage: Error handling

**`streaming-complete`**
- Purpose: End of stream
- Payload: `{}`
- Usage: Mark streaming complete

**`settings-loaded`**
- Purpose: Settings loaded response
- Payload: `{ config: {...} }`
- Usage: Initial settings load

**`settings-updated`**
- Purpose: Settings updated response
- Payload: `{}`
- Usage: Settings save confirmation

**`models-listed`**
- Purpose: Available models response
- Payload: `{ local: [...], online: [...] }`
- Usage: Model selection

## Message Flow Examples

### User Query Flow

```
1. User types message in UI
   ↓
2. ChatContext.sendMessage()
   ↓
3. Screenshot captured (if needed)
   ↓
4. window.ipc.send('to-backend', { type: 'query', payload: {...} })
   ↓
5. Main process receives IPC message
   ↓
6. Main process sends WebSocket message to backend
   ↓
7. Backend validates message (schema.py)
   ↓
8. QueryHandler processes message
   ↓
9. AgentSession.process_query()
   ↓
10. LLM generates response
    ↓
11. Backend streams response chunks
    ↓
12. Main process receives WebSocket messages
    ↓
13. Main process forwards to renderer via IPC
    ↓
14. Renderer updates UI with streaming response
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
5. Renderer displays tool call in UI
   ↓
6. Main process sends tool request to Python sidecar
   ↓
7. Python sidecar executes tool
   ↓
8. Python sidecar captures screenshot (if needed)
   ↓
9. Python sidecar sends result to main process
   ↓
10. Main process sends tool-result to backend via WebSocket
    ↓
11. Backend processes result
    ↓
12. Agent continues with next step
```

### Settings Update Flow

```
1. User changes setting in SettingsPanel
   ↓
2. AppContext.updateConfig()
   ↓
3. window.ipc.send('to-backend', { type: 'update-settings', payload: {...} })
   ↓
4. Main process receives IPC message
   ↓
5. Main process sends WebSocket message to backend
   ↓
6. Backend validates and saves settings
   ↓
7. Backend sends settings-updated response
   ↓
8. Main process receives WebSocket message
   ↓
9. Main process forwards to renderer via IPC
   ↓
10. AppContext handles settings-updated event
    ↓
11. UI updates with success status
```

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
    "message": "Error message",
    "code": "ERROR_CODE"
  },
  "timestamp": "ISO-8601"
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
