---
summary: "Communication Flow"
read_when:
  - When changing IPC or event flow.
---

# Communication Flow

## Overview

WindieOS uses a multi-layered communication architecture with:

- IPC between renderer and Electron main
- SDK local-runtime RPC between the desktop app and the local-runtime Python
  implementation
- WebSocket and HTTP between the client runtime and the backend control plane

The default product topology is remote-first: the app and SDK talk to the hosted backend for orchestration and perception, while the local runtime performs local execution on the user's computer through its local-runtime Python implementation.

## Communication Layers

```
Renderer Process (React)
  - Chat, dashboard, response overlay, settings
  |
  | IPC through preload allowlist (`window.agentSdk`, `window.ipc`)
  v
Electron Main / Agent Host
  - IPC routing, windows/overlays, endpoint policy, local host context
  |
  |-- SDK local-runtime RPC
  |   v
  |   Local-runtime Python implementation
  |   - Local tools, memory, browser/system state, wakeword helpers
  |
  `-- Hosted/self-hosted backend WebSocket + HTTP
      v
      Backend control plane (FastAPI)
      - WebSocket routes, agent loop, provider/tool policy
      - `/api/runs/*` HTTP control plane when VM worker mode is active
```

## IPC Communication (Electron)

### IPC Channels

#### Renderer -> Main

**`windie:invoke`**
- Purpose: Send SDK-shaped runtime commands to Electron main
- Format: `{ command, payload }`
- Usage: Conversation, settings, model, wakeword, memory, and conversation
  library commands that main routes to the live SDK runtime

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

#### Main -> Renderer

**`windie:rows`, `windie:current-turn`, `windie:status`**
- Purpose: Receive SDK conversation display rows, current-turn projection, and
  runtime status snapshots.
- Format: SDK projection payloads emitted by Electron main from the active
  `ConversationRuntime`.
- Usage: Chat, response overlay, and dashboard surfaces render SDK-owned
  conversation state without interpreting backend WebSocket packets.

**`windie:conversation-event`**
- Purpose: Receive SDK-normalized conversation side-effect events.
- Format: `{ type, conversationRef, turnRef?, payload? }`
- Usage: Transcript/session adapters consume normalized conversation events
  instead of subscribing to a generic backend-wire IPC stream.

**Typed backend event channels**
- Purpose: Receive non-chat backend side-channel events.
- Format: Event-specific payloads on channels such as `backend-settings-event`,
  `agent-capability-event`, and `audio-chunk`.
- Usage: Settings/model ACKs, capability metadata, and audio playback use typed
  renderer clients rather than the removed generic backend event channel.

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

**`show-main-window`**
- Purpose: Show the dashboard window from renderer surfaces
- Format: `{ maximize?: boolean, open?: string }`
- Usage: Dashboard opens from chat surfaces and can route to a specific panel
- Notes:
  - Electron main resolves the sender renderer's monitor and repositions the dashboard onto that display before showing it
  - The target display affinity is preserved through main-process composition instead of being dropped at the `index.cjs` wrapper boundary

### IPC Implementation

**Preload Script** (`src/preload.js`):
- Exposes `window.ipc` for host/native commands and `window.agentSdk` for
  SDK-shaped runtime commands
- Whitelists allowed channels
- Provides secure IPC bridge

**IPC Bridge** (`src/renderer/infrastructure/ipc/bridge.ts`):
- Type-safe IPC abstraction layer
- Channel validation (development only)
- O(1) channel lookup using Set data structures
- Provides IpcBridge.send(), IpcBridge.invoke(), IpcBridge.on()

**Main Process** (`src/main/ipc.cjs`):
- Handles IPC message routing
- Adapts renderer messages to the SDK runtime
- Starts `AgentClient.wakeUp(...)` directly and delegates hosted backend
  WebSocket transport to the SDK `Agent`/`ConversationRuntime` path
- Builds SDK runtime command payloads with system state, artifacts, and
  local-runtime memory context

## WebSocket Communication

### Connection Lifecycle

1. **Connection**: The SDK runtime opens the backend WebSocket on demand instead of at renderer startup. Customer-mode source and packaged runs use the hosted default `wss://api.windieos.com/ws` unless an explicit endpoint override pins another backend.
2. **Auth + Handshake**: Hosted clients first authenticate with a server-issued install token, then send the handshake message
   - the backend resolves the real `user_id` from the install token and ignores mismatched client-claimed `user_id` values
   - Electron main also sends the host operating-system label so backend session prompt rendering can follow the client OS instead of the Python host OS
   - Invalid handshake JSON/schema closes the socket with code `1008` (policy violation)
3. **Session Creation**: Backend creates session
4. **Message Loop**: Continuous message exchange
5. **Disconnection**: Cleanup on disconnect
   - The main-process bridge keeps the socket alive during active loop phases (`awaiting-first-chunk`, `streaming`, `tool-call`, `tool-output`)
   - After the loop returns to an idle/terminal phase, the bridge keeps the socket for a 30 minute grace window and then closes it intentionally if no further backend activity occurs
   - Unexpected disconnects only auto-reconnect while a live loop or that grace window still owns the connection; idle intentional closes do not immediately reconnect
   - If the socket drops during an active query before `streaming-complete` or `error`, Electron emits a normal `error` event for that turn instead of returning the UI to an indefinite waiting state. The user can retry after reconnect; the bridge does not auto-resend accepted turns because tool actions may already have executed.

### Parallel HTTP Control Plane (`/api/runs/*`)

In VM worker mode, Electron main also uses backend HTTP routes for run orchestration:

1. worker heartbeat poll (`POST /api/runs/workers/heartbeat`)
2. run assignment dispatch and ack (`POST /api/runs/{run_id}/worker-dispatched`)
3. backend stream event relay to run timelines (`POST /api/runs/{run_id}/events`)
4. worker-scoped control command application (`stop` currently mapped to websocket `stop-query`)

This control plane is separate from the `/ws` streaming channel and exists to coordinate worker assignment/control state for hosted VM scenarios.

### Endpoint Resolution (Electron Main)

`frontend/src/main/ipc.cjs` resolves backend endpoints in this order:

1. `BACKEND_WS_URL` and/or `BACKEND_HTTP_URL`
2. `BACKEND_HOST` + `BACKEND_PORT`
3. Hosted default candidate:
   - `wss://api.windieos.com/ws` and `https://api.windieos.com`
4. Source and packaged runs do not silently switch to a local backend when the hosted default is unreachable; local/self-hosted backends require explicit `BACKEND_*` or host/port overrides.

The resolved HTTP URL is also passed to the local-runtime Python process as
`WINDIE_BACKEND_HTTP_URL`. The local-runtime Python implementation consumes
that injected URL directly; it does not parse Electron endpoint aliases or
retry alternate backend URLs.

### SDK Routing Model

The SDK should follow the same transport split:

- **Hosted backend calls** for `/ws`, `/api/artifacts/*`, `/api/sdk/*`, and other backend-owned APIs
- **Local-runtime calls** for screenshots, clicks, typing, browser/runtime actions, local files, and local processes
- **Hybrid operations** when one user-facing action needs both, such as screenshot locally -> OCR remotely -> click locally

This keeps the backend as the hosted control plane and prevents SDK consumers from needing a locally running backend just to access OCR or prediction.

### Message Format

**Handshake (required, before any other messages)**:
```json
{
  "type": "handshake",
  "user_id": "user-123",
  "agent_definition": {
    "version": 1,
    "tools": {
      "mode": "explicit",
      "available_tools": ["mouse_control", "keyboard_control", "screenshot", "browser", "web_search"],
      "disabled_capabilities": ["ocr", "vision"]
    },
    "runtime": {
      "operating_system": "macOS",
      "coordinate_methods": ["manual"]
    }
  }
}
```

`agent_definition` is optional. When present, the backend maps its tool and
runtime fields into the session's effective agent capability policy before the
first query. The backend still intersects them with server config and
interaction-mode policy; the client does not get to expand backend-allowed
tools. Top-level capability handshake fields are removed and rejected. Electron
does not advertise coordinate-method availability. OCR, vision, and prediction
availability is resolved by backend policy and provider health.

**Hosted auth header**:
```text
Authorization: Bearer <install_token>
```

**Outgoing (Client -> Server)**:
```json
{
  "id": "uuid-v4",
  "type": "query|rehydrate-conversation|load-settings|list-models|update-settings|tool-result|tool-bundle-result|wakeword-detected",
  "payload": { ... }
}
```

**Incoming (Server -> Client)**:
```json
{
  "id": "turn_123",
  "turn_ref": "turn_123",
  "event_id": "turn_123-evt-000017-tool-call",
  "sequence": 17,
  "type": "query-accepted|streaming-response|web-search-progress|tool-call|tool-output|error|...",
  "payload": { ... }
}
```

For backend query streams, `id` and `turn_ref` are turn correlation fields.
They are intentionally the same for every event in one turn. `event_id` is the
unique backend-produced event identity, and `sequence` is the backend-produced
ordering number within that turn. SDK conversation stores use backend
`event_id` as the durable event row id for backend events, while the
local-runtime transcript store assigns `message_index` as local append order
for display and replay.

### Message Types

#### Client Message Types

**`query`**
- Purpose: User query with optional screenshot
- Payload: `{ text: string, conversation_ref: string, content?: string, screenshot_ref?: string, screenshot_refs?: string[], system_state_internal?: object }`
- Response: Streaming response

**`list-models`**
- Purpose: Request available models
- Payload: `{}`
- Response: `models-listed`
- Notes:
  - Sent only by the main dashboard renderer (`view` query param absent).
  - Chat overlay renderers (`view=minimal-chat-pill`, `view=minimal-response-overlay`) do not request models.
  - Renderer startup guards this request to one-shot per renderer lifecycle to avoid duplicate local-provider probes in React StrictMode.
  - If the dashboard asks for models before the backend WebSocket is fully open, Electron main queues that request and the SDK runtime flushes it after connect/handshake so selector state does not fall back to raw model ids during startup races.

**`load-settings`**
- Purpose: Request client settings snapshot from backend session/default config.
- Payload: `{}`
- Response: `settings-loaded`

**`update-settings`**
- Purpose: Apply allowed client settings fields to the active backend session.
- Response: `settings-updated`

**`wakeword-detected`**
- Purpose: Notify backend of wakeword activation
- Payload: `{}`

**`tool-result`**
- Purpose: SDK/local-runtime tool execution result
- Payload: `{ request_id, success, data?: { output, system_state?: { active_window, mouse_position }, screenshot_ref?, screenshot? }, error? }`
- Notes:
  - `system_state` is optional; when present, `active_window` and `mouse_position` are required.
  - `output` is plain model-facing tool text; frontend runtime state does not get serialized into XML inside `output`.
  - `screenshot_ref`/`screenshot` are only sent for computer-use tool results.
  - Automatic screenshot capture is monitor-scoped: Electron main resolves the sender/query display and passes both monitor bounds and virtual desktop bounds so local-runtime screenshot capture can crop to one monitor.
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
- Purpose: Restore a transcript snapshot into backend session history when a renderer action needs prior conversation history in memory.
- Payload: `{ conversation_ref, rehydrate_mode: "replace", messages: [{ role, content, message_type?, tool_name?, correlation_id?, tool_call_id?, tool_calls?, timestamp?, screenshot_ref? }] }`
- Notes:
  - Selecting a chat in `Your workspace` is renderer-only browsing; it does not eagerly send `rehydrate-conversation`.
  - Renderer sends this lazily before the first backend-dependent action on an existing chat, such as send, replay/edit, or manual compaction.
  - Renderer conversation identity for those actions comes from the merged local session snapshot: transcript session is authoritative, with projected chat-store selection only as a fallback when the transcript session has not caught up yet.
  - `tool_call_id` and `tool_calls` carry native tool-calling history linkage.
  - Backend rehydrate rejects tool-call rows without ids and tool-output rows that cannot be matched to a known or pending tool call.

#### Server Message Types

**`query-accepted`**
- Purpose: Acknowledge that backend query execution accepted the turn after validation/session resolution.
- Payload: `{ status: "accepted" }`
- Usage: Lets clients distinguish a message that may not have reached backend from a response interrupted after backend acceptance.

**`streaming-response`**
- Purpose: Streaming text chunks
- Payload: `{ text: string }`
- Usage: Real-time response streaming

**`audio-chunk`**
- Purpose: Stream TTS audio chunks for playback in the renderer.
- Payload: `{ audio: string, sample_rate: number }`
- Usage: Consumed by chat audio playback handlers.

**`tool-call`**
- Purpose: Tool execution request
- Payload: `{ tool_name, parameters, request_id, metadata? }`
- Usage: Request tool execution

Identity notes:
- `request_id` is backend-generated and used to correlate the later `tool-result`.
- `metadata.tool_call_id` is provider-origin when available (LLM/provider tool-call `id`); backend falls back to `tool_call_<index>` if absent.
- `event_id` identifies the stream event row. Tool call/output linkage uses
  `request_id`, provider `tool_call_id`, `correlation_id`, or `bundle_id`, not
  the stream event id.

**`tool-bundle`**
- Purpose: Atomic bundle of tools (single message)
- Payload: `{ bundle_id, tools: [{ name, args }] }`
- Usage: Execute tools sequentially and return `tool-bundle-result`

**`web-search-progress`**
- Purpose: Mid-search progress row for OpenAI native `web_search`
- Payload: `{ text, request_id?, action_type?, query?, url?, pattern? }`
- Usage: Render transient OpenAI-native search trace rows during the main LLM
  turn. OpenAI native search does not emit a later backend `tool-call` /
  `tool-output` pair for the same search; the final assistant message is the
  terminal model output. Gemini and Brave-backed logical `web_search` still use
  normal backend tool-call/tool-output rows.
- Notes:
  - Current producer is OpenAI native `web_search` only.
  - The SDK records these as `tool_progress` events and retains them in display
    rows for dashboard transparency. For rehydrate/model history, the SDK
    groups progress-only native search into one synthetic SDK-normalized
    `web_search` `tool_call`/`tool_output` pair so follow-up turns can see that
    native search happened without replaying orphan progress rows.

**`tool-output`**
- Purpose: Tool execution result
- Payload: `{ tool_name, success, output, execution_time?, error?, screenshot?, metadata? }`
- Usage: Tool execution complete

**`llm-thought`**
- Purpose: LLM thinking tokens from providers/models that expose reasoning deltas (for example Gemini and Kimi Coding).
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
- Purpose: Return client settings snapshot for the current session/default config.
- Usage: Response to `load-settings`.

**`models-listed`**
- Purpose: Available models response

**`wakeword-activated`**
- Purpose: Confirm wakeword activation and listening state.
- Payload: `{ speech_mode_enabled, greeting, status }`
- Usage: Emitted before `wakeword-greeting` after `wakeword-detected`.

**`wakeword-greeting`**
- Purpose: Deliver greeting text selected for wakeword activation.
- Payload: `{ text: string }`
- Usage: Wakeword UX messaging; may be followed by streamed `audio-chunk` events.

**`system-prompt`**
- Purpose: Transparency event with generated system prompt.
- Payload: `{ content, tool_schemas? }`

**`tool-schemas`**
- Purpose: Current tool schema list for transparency/debug UI.
- Payload: `{ tool_schemas }`

**`token-count`**
- Purpose: Token usage metrics for the current turn/conversation.
- Payload: `{ prompt_tokens, visible_output_tokens, thinking_tokens, output_tokens_total, total_tokens, conversation_tokens, usage_source, cached_tokens?, cache_hit?, cache_status? }`

**`user-message-full`**
- Purpose: Full model-facing user message payload for transparency.
- Payload: `{ content, metadata }`

**`assistant-message-full`**
- Purpose: Full assistant message payload for transparency.
- Payload: `{ content }`

## Memory HTTP Flow (Local Runtime <-> Backend)

The local-runtime memory implementation uses REST endpoints on the same FastAPI server for embeddings, semantic summaries, and conversation titles. In the product default this is the hosted backend `https://api.windieos.com`; local/self-hosted setups may instead point at `http://127.0.0.1:8765` or another explicit backend override. This is separate from the WebSocket stream and inherits Electron's resolved backend HTTP URL.

```
Local-runtime Python memory implementation
  - LocalMemoryStore
  - MemorySummarizer
  - Title runtime
  |
  | HTTP: /api/embeddings, /api/semantic/summarize, /api/semantic/title
  v
Backend API (FastAPI)
  - Embedding provider routing
  - Semantic summary and title routes
  - Structured provider errors
```

### Embedding Flow
1. The local-runtime memory implementation prepares episodic memory content.
2. `POST /api/embeddings/` returns the embedding vector.
3. The local-runtime memory implementation stores embeddings in local FAISS indexes.

### Semantic Summarization Flow
1. MemorySummarizer batches episodic memories by conversation.
2. `POST /api/semantic/summarize` returns summary + facts.
3. The local-runtime memory implementation stores semantic memory and marks episodic memories as semanticized.

### Conversation Title Flow
1. Transcript storage sees the first user turn and first assistant `llm-text` turn for a conversation.
2. `POST /api/semantic/title` returns a short model-backed title.
3. The local-runtime transcript store saves the title for conversation-list/search reads while heuristic titles remain the fallback.

### Health Checks
- `GET /api/embeddings/health`
- `GET /api/semantic/health`

## Message Flow Examples

### User Query Flow

```
1. User types message in UI
2. useChatMessageSender hook handles message
3. Screenshot capture runs only when `include_query_screenshot=true` (default enabled)
4. Captured/pasted screenshot artifacts upload via HTTP `/api/artifacts`
5. Renderer sends `window.agentSdk.invoke('conversation.send', ...)`
6. Electron main receives the SDK-shaped IPC command
7. Electron main resolves system state, artifacts, and local-runtime memory context
8. SDK runtime sends the backend WebSocket `query` message
9. Backend validates the message (`backend/src/api/schemas/incoming.py`)
10. QueryHandler processes the message
11. AgentSession.process_query() runs the agent loop
12. LLM/provider produces response chunks and tool calls
13. Backend streams response events
14. SDK runtime normalizes backend WebSocket messages into conversation events
15. Electron main forwards SDK projections and typed side-channel events via IPC
16. Renderer runtime clients process SDK projections and typed events
17. Chat store updates display state
18. UI renders the streaming response
```

### Tool Execution Flow

```
1. LLM/provider generates a tool call
2. Backend sends a `tool-call` or `tool-bundle` stream event
3. SDK runtime receives the event through its backend transport
4. SDK runtime normalizes the event and claims executable work
5. SDK local runtime calls the local-runtime Python implementation
6. Electron main supplies agent-host context for window/screenshot/artifact behavior
7. Local-runtime Python tool code executes the action
8. SDK ToolExecutionCoordinator builds the result envelope
9. SDK runtime sends `tool-result` or `tool-bundle-result` back to backend
10. Renderer receives projected tool call/output display events
11. Backend commits the result and continues the agent loop
```

### Settings Flow

Settings are persisted locally and synced to the backend session:

- `AppConfigContext.updateConfig()` saves to localStorage and disk.
- Frontend sends SDK command `settings.update` through `windie:invoke`.
- Main process tracks `settings-updated` ACK by message id.
- First `query`/`wakeword-detected` after connect waits for initial settings sync ACK (timeout fallback keeps app responsive).
- Backend applies session config updates for the active session before subsequent query processing.

## Error Handling

### Error Flow

```
1. Error occurs in a producer runtime or UI component
2. Owning runtime records the diagnostic or error state
3. Backend handles backend-owned protocol/runtime errors
4. SDK/runtime error events settle the affected turn or surface
5. Electron main forwards SDK projections or typed side-channel errors
6. Renderer receives projected error state
7. UI displays the error
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

**SDK/Electron Agent Host**:
- Ensures backend connectivity on demand for SDK runtime commands
- Keeps the backend connection alive during active loop phases
- Lets idle intentional closes remain closed until another command needs the
  hosted runtime

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

**SDK/Electron Agent Host**:
- SDK-owned backend transport command queue
- Electron main IPC dispatch remains single-process and channel allowlisted
- Conversation state is projected from SDK events before renderer fan-out

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

- **Explicit Endpoints**: Hosted and self-hosted backend URLs come from the
  Electron/SDK endpoint policy
- **Local Execution Boundary**: Machine actions stay on the SDK local runtime
- **IPC Security**: Whitelisted channels only
- **Content Security**: CSP headers enforced

---

For more detailed information, see:
- [Frontend Architecture](frontend_architecture.md)
- Backend Architecture (private backend docs)
- [API Reference](../reference/api_reference.md)
