---
summary: "API Reference"
read_when:
  - When integrating backend APIs or client calls.
---

# API Reference

## Overview

Desktop Assistant uses a WebSocket-based API for real-time communication between the frontend and backend. All messages follow a consistent format with type-based routing.

## WebSocket Endpoint

**URL**: default `ws://127.0.0.1:8765/ws`

Electron clients may override this via:
- `BACKEND_WS_URL` (explicit WebSocket URL)
- `BACKEND_HTTP_URL` (WebSocket derived as `/ws`)
- `BACKEND_HOST` + `BACKEND_PORT`

**Protocol**: WebSocket (RFC 6455)

**Connection**: Persistent connection, auto-reconnect on disconnect

### Handshake (Required)

The client must send a handshake message immediately after connecting.
This message does **not** use the base message envelope.
The backend validates the client-provided `user_id` and uses it as the
connection identity.

**Payload**:
```json
{ "type": "handshake", "user_id": "user-123" }
```

### Hosted WebSocket (Planned)

**URL**: `wss://api.<domain>/ws`

**Auth**: `Authorization: Bearer <access_token>`

**Handshake Payload**: `{ user_id, device_id, session_id? }`

## HTTP Endpoints (Memory)

These REST endpoints live on the same FastAPI server as the WebSocket (default `http://127.0.0.1:8765`). They are used by the Python sidecar for embeddings and semantic summarization.

### POST `/api/embeddings/`

Generate an embedding for a single text input.

**Request**:
```json
{ "text": "string", "model_name": "default" }
```

**Limits**: `text` max 8192 chars, `model_name` max 128 chars.

**Response**:
```json
{ "embedding": [0.0, 0.1, ...], "model_name": "string", "dimension": 384 }
```

### GET `/api/embeddings/health`

Health check for the embeddings service.

**Response**:
```json
{ "status": "healthy", "model_name": "string", "dimension": 384 }
```

### POST `/api/semantic/summarize`

Summarize episodic conversations into semantic memory.

**Request**:
```json
{ "conversations": ["..."], "user_id": "user-123" }
```

**Limits**: up to 100 conversations; each conversation max 32KB; `user_id` cannot be `default_user`.

**Response**:
```json
{ "summary": "string", "facts": ["..."], "success": true }
```

### GET `/api/semantic/health`

Health check for semantic summarization.

**Response**:
```json
{ "status": "healthy", "message": "Semantic summarization service ready" }
```

## HTTP Endpoints (Artifacts)

Large artifacts (screenshots, snapshots) are uploaded over HTTP and referenced by ID in WebSocket payloads.

### POST `/api/artifacts/`

Upload an artifact (multipart/form-data).

**Request**:
- `file`: binary file upload

**Response**:
```json
{
  "artifact_id": "uuid.jpg",
  "content_type": "image/jpeg",
  "size_bytes": 123456,
  "sha256": "hex",
  "url": "http://127.0.0.1:8765/api/artifacts/uuid.jpg"
}
```

### GET `/api/artifacts/{artifact_id}`

Fetch an artifact by ID (binary response).

## Message Format

### Base Message Structure

Applies to all messages **after** the handshake.

All messages follow this structure:

```json
{
  "id": "uuid-v4",
  "type": "message-type",
  "payload": { ... }
}
```

**Fields**:
- `id`: Unique message identifier (UUID v4)
- `type`: Message type (see Message Types)
- `payload`: Message-specific payload

**Notes**:
- `user_id` is injected server-side from the handshake connection context (client-provided, validated at handshake).
- `timestamp` is optional and ignored by the backend if present.
- Unknown top-level envelope fields are rejected.
- Incoming schema source lives in `backend/src/api/schemas/` (`common.py`, `incoming.py`, `outgoing.py`), with compatibility exports from `backend/src/api/schema.py`.

## Client Messages (Frontend → Backend)

### Query Message

Send a user query with optional screenshot.

**Type**: `query`

**Payload**:
```json
{
  "text": "User query text",
  "content": "<system_context>...</system_context> ...", // Optional, built by Electron main process
  "screenshot": "base64-encoded-screenshot", // Optional (legacy)
  "screenshot_ref": "uuid.jpg", // Preferred
  "system_state_internal": { "screen_resolution": "1920x1080" } // Optional backend-only runtime state
}
```

**Response**: Streaming response with multiple message types:
- `streaming-response`: Text chunks
- `tool-call`: Tool execution requests
- `tool-output`: Tool execution results
- `tool-bundle`: Atomic bundle of tools (single message)
- `llm-thought`: Thinking tokens (Gemini)
- `streaming-complete`: End of stream
- `memory-store`: Request to store memory
- `wakeword-greeting`: Wakeword detection greeting
- `system-prompt`: System prompt for transparency
- `user-message-full`: Full user message for transparency
- `assistant-message-full`: Full assistant message for transparency
- `tool-schemas`: Tool schemas for transparency
- `token-count`: Token usage information

**Note**: The Electron main process enriches `query` payloads by adding `content` (system context + memory + user query).
`system_state_internal` is backend-only runtime state and is not model-facing prompt/tool-output content.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "type": "query",
  "payload": {
    "text": "Click the submit button",
    "screenshot_ref": "1f2c3a4b5d6e7f8a.jpg"
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Rehydrate Conversation Message

Rebuild backend in-memory conversation history from a frontend transcript snapshot.
Used when switching or resuming conversations from episodic memory.

**Type**: `rehydrate-conversation`

**Payload**:
```json
{
  "conversation_ref": "conv_123",
  "messages": [
    {
      "role": "user",
      "content": "Earlier prompt",
      "message_type": "user",
      "timestamp": "2026-02-02T20:00:00Z",
      "screenshot_ref": "1f2c3a4b5d6e7f8a.jpg"
    },
    {
      "role": "assistant",
      "content": "Earlier reply",
      "message_type": "llm-text",
      "timestamp": "2026-02-02T20:00:01Z"
    }
  ],
  "rehydrate_mode": "replace"
}
```

**Message entry fields**:
- `role`: `user | assistant | tool`
- `content`: message text/content
- `message_type`: optional frontend message type
- `tool_name`: optional tool name (tool entries)
- `correlation_id`: optional call correlation id
- `timestamp`: optional timestamp
- `screenshot_ref`: optional artifact id
- `screenshot`: optional inline base64 screenshot fallback

**Behavior**:
- Backend replaces session history for `conversation_ref` with provided message list.
- For entries with `screenshot_ref`, backend attempts artifact lookup and inlines base64 for model history.
- If artifact lookup fails, backend logs a warning and continues rehydrate with `image_data=None` for that entry (text history still restored).

**Response**:
- Success: no dedicated success event (rehydrate is applied silently).
- Failure: standard `error` event.

### Frontend Tool Schemas Message (Planned)

Send frontend runtime tool schemas after handshake so backend can build prompt/tool validation from the active client catalog.

**Type**: `frontend-tool-schemas`

**Payload**:
```json
{
  "schema_version": "2026-02-07",
  "catalog_revision": 1,
  "client_build": "frontend@1.3.0",
  "tools": [
    {
      "name": "read_file",
      "description": "Read a UTF-8 text file from disk",
      "parameters": {
        "type": "object",
        "properties": {
          "path": { "type": "string" }
        },
        "required": ["path"]
      },
      "execution": {
        "surface": "frontend-sidecar",
        "enabled": true
      }
    }
  ]
}
```

**Response**: `frontend-tool-schemas-accepted`

**Status**: Planned. Not implemented yet.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174024",
  "type": "frontend-tool-schemas",
  "payload": {
    "schema_version": "2026-02-07",
    "catalog_revision": 1,
    "client_build": "frontend@1.3.0",
    "tools": [
      {
        "name": "read_file",
        "description": "Read a UTF-8 text file from disk",
        "parameters": {
          "type": "object",
          "properties": {
            "path": { "type": "string" }
          },
          "required": ["path"]
        },
        "execution": {
          "surface": "frontend-sidecar",
          "enabled": true
        }
      }
    ]
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Load Settings Message

Request current application settings.

**Type**: `load-settings`

**Payload**: `{}`

**Response**: `settings-loaded`

**Status**: Handled by the backend. Returns frontend-owned settings from the active session config (or global defaults if no session exists).

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174001",
  "type": "load-settings",
  "payload": {},
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Update Settings Message

Update application configuration.

**Type**: `update-settings`

**Payload**:
```json
{
  "model_mode": "online" | "local",
  "model_provider": "openai" | "anthropic" | ...,
  "selected_model_id": "gpt-5.1",
  "voice_mode_enabled": true | false,
  "speech_mode_enabled": true | false,
  "include_query_screenshot": true | false
}
```

**Response**: `settings-updated`

**Status**: Handled by the backend. Updates apply to the user session on the next query.
Payload shape is validated at message-parse time; value semantics are validated in backend settings validators.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174002",
  "type": "update-settings",
  "payload": {
    "model_mode": "online",
    "model_provider": "openai",
    "selected_model_id": "gpt-5.1",
    "voice_mode_enabled": false,
    "speech_mode_enabled": true,
    "include_query_screenshot": true
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### List Models Message

Request available LLM models.

**Type**: `list-models`

**Payload**: `{}`

**Response**: `models-listed`

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174003",
  "type": "list-models",
  "payload": {},
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Tool Result Message

Send tool execution result from frontend.

**Type**: `tool-result`

**Payload**:
```json
{
  "request_id": "opaque-request-id-from-tool-call",
  "success": true,
  "data": {
    "llm_content": "Preformatted tool output",
    "screenshot_ref": "uuid.jpg", // Optional, computer-use tools only
    "screenshot": "base64-encoded-screenshot", // Optional legacy fallback, computer-use tools only
    "system_state": { "active_window": "...", "mouse_position": "..." },
    "system_state_internal": { "active_window": "...", "mouse_position": "...", "screen_resolution": "..." } // Optional backend-only runtime state
  },
  "error": null
}
```

`request_id` must echo the `tool-call` payload `request_id` value for correlation.
`data.system_state.active_window` and `data.system_state.mouse_position` are required when `data` is present.
`data.system_state_internal` is optional backend-only runtime state and is not model-facing tool-output content.
For non-computer tools, omit `data.screenshot_ref` and `data.screenshot`.

**Response**: Acknowledgment (no specific response type)

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174004",
  "type": "tool-result",
  "payload": {
    "request_id": "req-123",
    "success": true,
    "data": {
      "llm_content": "Clicked submit button",
      "screenshot_ref": "1f2c3a4b5d6e7f8a.jpg",
      "system_state": {
        "active_window": "Browser",
        "mouse_position": "(100, 200)"
      }
    },
    "error": null
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Tool Bundle Result Message

Result of an atomic tool bundle executed on the frontend.

**Type**: `tool-bundle-result`

**Payload**:
```json
{
  "bundle_id": "bundle-123",
  "status": "success", // success | partial_failure | failure
  "screenshot_ref": "1f2c3a4b5d6e7f8a.jpg", // Optional, computer-use bundles only
  "screenshot": "base64-encoded-screenshot", // Optional legacy fallback, computer-use bundles only
  "system_state": { "active_window": "...", "mouse_position": "..." },
  "step_results": [
    {
      "tool": "run_shell_command",
      "status": "ok",
      "output": { "stdout": "line-1", "exit_code": 0 },
      "debug_trace": "optional-debug-info"
    }
  ],
  "error": null
}
```

`step_results` notes:
- `status` convention from frontend bundle runner is `ok` / `error` (bundle-level `status` remains `success` / `partial_failure` / `failure`).
- `output` may be a string or structured object.
- additional per-step fields are allowed and preserved.
- if a step succeeds without explicit `output`, frontend uses fallback text: `Tool <tool_name> executed successfully (no output)`.
- screenshot fields are omitted for bundles without computer-use actions.
- when `system_state` is present, it uses `{ active_window, mouse_position }`.

### Wakeword Detected Message

Notify backend that wakeword was detected.

**Type**: `wakeword-detected`

**Payload**: `{}`

**Response**: `wakeword-greeting` (optional)

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174005",
  "type": "wakeword-detected",
  "payload": {},
  "timestamp": "2025-01-20T10:00:00Z"
}
```

## Server Messages (Backend → Frontend)

### Streaming Response Message

Streaming text chunks from LLM.

**Type**: `streaming-response`

**Payload**:
```json
{
  "text": "Text chunk"
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174005",
  "type": "streaming-response",
  "payload": {
    "text": "I'll help you click the submit button."
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Tool Call Message

Request tool execution from frontend.

**Type**: `tool-call`

**Payload**:
```json
{
  "tool_name": "mouse_control",
  "parameters": {
    "action": "click",
    "x": 100,
    "y": 200
  },
  "request_id": "unique-request-id",
  "metadata": {
    "tool_call_id": "call_abc123"
  }
}
```

`request_id` is generated by backend tool preparation and must be treated as an opaque correlation id.  
`metadata.tool_call_id` is provider-sourced when the LLM/provider returns a tool-call id; backend falls back to `tool_call_<index>` if missing.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174006",
  "type": "tool-call",
  "payload": {
    "tool_name": "mouse_control",
    "parameters": {
      "action": "click",
      "x": 100,
      "y": 200
    },
    "request_id": "req-123",
    "metadata": {
      "tool_call_id": "call_abc123"
    }
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Tool Output Message

Tool execution result from backend.

**Type**: `tool-output`

**Payload**:
```json
{
  "tool_name": "mouse_control",
  "success": true,
  "execution_time": 0.42,
  "output": "Formatted tool output",
  "error": null,
  "screenshot": "base64-encoded-screenshot",
  "metadata": { ... }
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174007",
  "type": "tool-output",
  "payload": {
    "tool_name": "mouse_control",
    "success": true,
    "execution_time": 0.42,
    "output": "Clicked submit button",
    "error": null,
    "screenshot": "iVBORw0KGgoAAAANSUhEUgAA...",
    "metadata": {
      "active_window": "Browser"
    }
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### LLM Thought Message

LLM thinking/reasoning tokens (Gemini models).

**Type**: `llm-thought`

**Payload**:
```json
{
  "status": "Thinking token text"
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174008",
  "type": "llm-thought",
  "payload": {
    "status": "I need to find the submit button first..."
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Error Message

Error response from backend.

**Type**: `error`

**Payload**:
```json
{
  "message": "Error message"
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174009",
  "type": "error",
  "payload": {
    "message": "Tool execution failed"
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Streaming Complete Message

End of streaming response.

**Type**: `streaming-complete`

**Payload**: `{}`

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174010",
  "type": "streaming-complete",
  "payload": {},
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Settings Loaded Message

Response to load-settings request.

**Type**: `settings-loaded`

**Payload**:
```json
{
  "config": {
    "model_mode": "online",
    "model_provider": "openai",
    "selected_model_id": "gpt-5.1",
    "voice_mode_enabled": false,
    "speech_mode_enabled": true,
    "include_query_screenshot": true
  }
}
```

**Status**: Emitted by backend in response to `load-settings`.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174011",
  "type": "settings-loaded",
  "payload": {
    "config": {
      "model_mode": "online",
      "model_provider": "openai",
      "selected_model_id": "gpt-5.1",
      "voice_mode_enabled": false,
      "speech_mode_enabled": true,
      "include_query_screenshot": true
    }
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Settings Updated Message

Response to update-settings request.

**Type**: `settings-updated`

**Payload**:
```json
{
  "updated_keys": ["model_provider", "selected_model_id"]
}
```

**Status**: Emitted by backend after applying session config updates.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174012",
  "type": "settings-updated",
  "payload": {
    "updated_keys": ["model_provider", "selected_model_id"]
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Models Listed Message

Response to list-models request.

**Type**: `models-listed`

**Payload**:
```json
{
  "local": [
    {
      "id": "llama-2-7b",
      "provider": "ollama",
      "display_name": "llama-2-7b"
    }
  ],
  "online": [
    {
      "id": "gpt-5.1",
      "provider": "openai",
      "display_name": "openai/gpt-5.1",
      "supports_thinking": false
    },
    {
      "id": "claude-sonnet-4-5-20250929",
      "provider": "anthropic",
      "display_name": "anthropic/claude-sonnet-4-5-20250929",
      "supports_thinking": true
    }
  ],
  "vision": [
    {
      "id": "OpenGVLab/InternVL3_5-4B",
      "provider": "huggingface-local",
      "display_name": "huggingface-local/OpenGVLab/InternVL3_5-4B"
    }
  ]
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174013",
  "type": "models-listed",
  "payload": {
    "local": [
      {
        "id": "llama-2-7b",
        "provider": "ollama",
        "display_name": "llama-2-7b"
      }
    ],
    "online": [
      {
        "id": "gpt-5.1",
        "provider": "openai",
        "display_name": "openai/gpt-5.1",
        "supports_thinking": false
      },
      {
        "id": "claude-sonnet-4-5-20250929",
        "provider": "anthropic",
        "display_name": "anthropic/claude-sonnet-4-5-20250929",
        "supports_thinking": true
      }
    ],
    "vision": [
      {
        "id": "OpenGVLab/InternVL3_5-4B",
        "provider": "huggingface-local",
        "display_name": "huggingface-local/OpenGVLab/InternVL3_5-4B"
      }
    ]
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Bundle Start Message

Atomic bundle of tools to execute together (replaces bundle_start + N tool-calls + bundle_end).

**Type**: `tool-bundle`

**Payload**:
```json
{
  "bundle_id": "bundle-123",
  "tools": [
    {
      "name": "mouse_control",
      "args": { "x": 100, "y": 200, "action": "click" }
    },
    {
      "name": "keyboard_control",
      "args": { "text": "Hello", "action": "type" }
    }
  ]
}
```

**Description**: Single message containing all tools in a bundle. Frontend executes all tools sequentially and returns a single `tool-bundle-result` message.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174014",
  "type": "tool-bundle",
  "payload": {
    "bundle_id": "bundle-123",
    "tools": [
      {
        "name": "mouse_control",
        "args": { "x": 100, "y": 200, "action": "click" }
      },
      {
        "name": "keyboard_control",
        "args": { "text": "Hello", "action": "type" }
      }
    ]
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Memory Store Message

Request to store memory in the local memory system.

**Type**: `memory-store`

**Payload**:
```json
{
  "user_query": "User's query text",
  "assistant_response": "Assistant's response",
  "memory_type": "episodic", // or "semantic"
  "user_id": "default_user",
  "session_id": "session-123" // Optional
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174017",
  "type": "memory-store",
  "payload": {
    "user_query": "What's the weather?",
    "assistant_response": "It's sunny today.",
    "memory_type": "episodic",
    "user_id": "default_user",
    "session_id": "session-123"
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Wakeword Greeting Message

Greeting message sent when wakeword is detected.

**Type**: `wakeword-greeting`

**Payload**:
```json
{
  "text": "Hello! I'm listening."
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174018",
  "type": "wakeword-greeting",
  "payload": {
    "text": "Hello! I'm listening."
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### System Prompt Message

System prompt sent to frontend for transparency display. Tool schemas are emitted separately as a `tool-schemas` event.

**Type**: `system-prompt`

**Payload**:
```json
{
  "content": "You are a helpful assistant..."
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174019",
  "type": "system-prompt",
  "payload": {
    "content": "You are a helpful assistant..."
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### User Message Full Message

Full user message content for transparency display.

**Type**: `user-message-full`

**Payload**:
```json
{
  "content": "Full user message with context XML...",
  "metadata": {
    "has_screenshot": true,
    "has_memory": true
  }
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174020",
  "type": "user-message-full",
  "payload": {
    "content": "<system_context>...</system_context><user_query>Click submit</user_query>",
    "metadata": {
      "has_screenshot": true,
      "has_memory": true
    }
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Assistant Message Full Message

Full assistant message content for transparency display.

**Type**: `assistant-message-full`

**Payload**:
```json
{
  "content": "Full assistant response..."
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174021",
  "type": "assistant-message-full",
  "payload": {
    "content": "I'll help you click the submit button..."
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Tool Schemas Message

Tool schemas sent to frontend for transparency display (first message metadata window). These are canonical OpenAI/LiteLLM tool objects.

**Type**: `tool-schemas`

**Payload**:
```json
{
  "tool_schemas": [
    {
      "type": "function",
      "function": {
        "name": "mouse_control",
        "description": "Control mouse actions",
        "parameters": {
          "type": "object",
          "properties": { ... }
        }
      }
    }
  ]
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174022",
  "type": "tool-schemas",
  "payload": {
    "tool_schemas": [
      {
        "type": "function",
        "function": {
          "name": "mouse_control",
          "parameters": {
            "type": "object",
            "properties": {
              "action": {
                "type": "string",
                "enum": ["click", "double_click", "right_click"]
              }
            }
          }
        }
      }
    ]
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Token Count Message

Token usage information for the current interaction.

**Type**: `token-count`

**Payload**:
```json
{
  "prompt_tokens": 150,
  "visible_output_tokens": 38,
  "thinking_tokens": 12,
  "output_tokens_total": 50,
  "total_tokens": 200,
  "conversation_tokens": 3200,
  "usage_source": "provider"
}
```

Notes:
- `visible_output_tokens` counts only assistant text shown to users.
- `thinking_tokens` is provider-reported reasoning/thought token usage. It may be `null` when unavailable.
- `output_tokens_total` includes visible output plus hidden reasoning where the provider reports it.
- `usage_source` is `provider` when prompt/output/total counts come fully from provider usage; otherwise `estimated`.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174023",
  "type": "token-count",
  "payload": {
    "prompt_tokens": 150,
    "visible_output_tokens": 38,
    "thinking_tokens": null,
    "output_tokens_total": 38,
    "total_tokens": 188,
    "conversation_tokens": 3200,
    "usage_source": "estimated"
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Frontend Tool Schemas Accepted Message (Planned)

Acknowledgment after backend validates and stores a frontend-sent tool catalog for the current session.

**Type**: `frontend-tool-schemas-accepted`

**Payload**:
```json
{
  "catalog_revision": 1,
  "accepted_tools": ["read_file"],
  "rejected_tools": [
    {
      "name": "danger_tool",
      "reason": "policy_denied"
    }
  ]
}
```

**Status**: Planned. Not implemented yet.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174025",
  "type": "frontend-tool-schemas-accepted",
  "payload": {
    "catalog_revision": 1,
    "accepted_tools": ["read_file"],
    "rejected_tools": [
      {
        "name": "danger_tool",
        "reason": "policy_denied"
      }
    ]
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

## Error Codes

### Common Error Codes (Internal)

Error responses sent to clients include **only** a `message` string. These
codes are internal to the backend exception hierarchy and may appear in logs.

- `CONFIG_ERROR`: Configuration error
- `LLM_ERROR`: LLM error
- `LLM_API_ERROR`: LLM API error
- `LLM_RATE_LIMIT`: LLM rate limit
- `TOOL_EXECUTION_ERROR`: Tool execution failed
- `TOOL_VALIDATION_ERROR`: Tool validation failed
- `TOOL_NOT_FOUND`: Tool not found
- `MEMORY_ERROR`: Memory system error
- `MEMORY_STORE_ERROR`: Memory store failure
- `EMBEDDING_ERROR`: Embedding failure
- `SESSION_ERROR`: Session error
- `INPUT_SIZE_LIMIT_ERROR`: Input size limit
- `PARSE_TIMEOUT_ERROR`: Parse timeout
- `PARSE_VALIDATION_ERROR`: Parse validation error

## Rate Limiting

**Limits**:
- Max message size: 10MB
- Max concurrent tasks: 50 per connection
- Receive timeout: 3600 seconds (1 hour)

## Connection Management

### Handshake

On connection, client sends handshake (backend validates and uses the client `user_id` for the connection):

```json
{
  "type": "handshake",
  "user_id": "user-123"
}
```

### Post-Handshake Tool Catalog Sync (Planned)

After handshake, client may send `frontend-tool-schemas` before first `query`. During migration:
- If schema sync is supported, backend responds with `frontend-tool-schemas-accepted` and uses the accepted catalog for that session.
- If schema sync is not supported, clients continue using legacy flow (backend-owned remote schema catalog).

Planned sequence:
1. Connect WebSocket
2. Send `handshake`
3. Send `frontend-tool-schemas` (planned)
4. Receive `frontend-tool-schemas-accepted` (planned)
5. Send `query`

### Reconnection

- Auto-reconnect on disconnect
- Exponential backoff
- Max reconnection attempts: 5

## Security

### Message Validation

- All messages validated via Pydantic
- Type checking enforced
- Required fields validated
- Sanitization applied

### Connection Security

- WebSocket on localhost only
- No external access
- IPC channels whitelisted
- Content Security Policy enforced

---

For more detailed information, see:
- [Communication Flow](COMMUNICATION_FLOW.md)
- [Backend Architecture](BACKEND_ARCHITECTURE.md)
- [Frontend Architecture](FRONTEND_ARCHITECTURE.md)
- [ADR 005: Frontend-Sourced Tool Schemas](adr/005-frontend-tool-schema-source-of-truth.md)
