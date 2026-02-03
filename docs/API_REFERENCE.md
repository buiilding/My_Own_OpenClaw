---
summary: "API Reference"
read_when:
  - When integrating backend APIs or client calls.
---

# API Reference

## Overview

Desktop Assistant uses a WebSocket-based API for real-time communication between the frontend and backend. All messages follow a consistent format with type-based routing.

## WebSocket Endpoint

**URL**: `ws://127.0.0.1:8765/ws`

**Protocol**: WebSocket (RFC 6455)

**Connection**: Persistent connection, auto-reconnect on disconnect

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

## Message Format

### Base Message Structure

All messages follow this structure:

```json
{
  "id": "uuid-v4",
  "type": "message-type",
  "payload": { ... },
  "timestamp": "ISO-8601"
}
```

**Fields**:
- `id`: Unique message identifier (UUID v4)
- `type`: Message type (see Message Types)
- `payload`: Message-specific payload
- `timestamp`: ISO-8601 timestamp

## Client Messages (Frontend → Backend)

### Query Message

Send a user query with optional screenshot.

**Type**: `query`

**Payload**:
```json
{
  "text": "User query text",
  "content": "<system_context>...</system_context> ...", // Optional, built by Electron main process
  "screenshot": "base64-encoded-screenshot", // Optional
  "config": { "model_provider": "openai", "selected_model_id": "gpt-5.1" } // Optional
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

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "type": "query",
  "payload": {
    "text": "Click the submit button",
    "screenshot": "iVBORw0KGgoAAAANSUhEUgAA..."
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Load Settings Message

Request current application settings.

**Type**: `load-settings`

**Payload**: `{}`

**Response**: `settings-loaded` (legacy)

**Status**: Currently **not handled** by the backend. Frontend settings are local-only.

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
  "speech_mode_enabled": true | false
}
```

**Response**: `settings-updated` (legacy)

**Status**: Currently **not handled** by the backend. Frontend settings are local-only.

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
    "speech_mode_enabled": true
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
  "request_id": "uuid-v4",
  "success": true,
  "data": {
    "llm_content": "Preformatted tool output",
    "screenshot": "base64-encoded-screenshot",
    "system_state": { "active_window": "...", "mouse_position": "..." }
  },
  "error": null
}
```

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
      "screenshot": "iVBORw0KGgoAAAANSUhEUgAA...",
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
  "status": "success",
  "screenshot": "base64-encoded-screenshot",
  "system_state": { "active_window": "...", "mouse_position": "..." },
  "step_results": [ { "tool": "mouse_control", "status": "success" } ],
  "error": null
}
```

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
  "chunk": "Text chunk"
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174005",
  "type": "streaming-response",
  "payload": {
    "chunk": "I'll help you click the submit button."
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
  "raw_call": "{...}",
  "request_id": "unique-request-id"
}
```

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
    "raw_call": "{...}",
    "request_id": "req-123"
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
  "thought": "Thinking token text"
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174008",
  "type": "llm-thought",
  "payload": {
    "thought": "I need to find the submit button first..."
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
  "message": "Error message",
  "code": "ERROR_CODE" // Optional
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174009",
  "type": "error",
  "payload": {
    "message": "Tool execution failed",
    "code": "TOOL_EXECUTION_ERROR"
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
    "speech_mode_enabled": true
  }
}
```

**Status**: Legacy. Backend does not currently emit this; frontend settings are local-only.

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
      "speech_mode_enabled": true
    }
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

### Settings Updated Message

Response to update-settings request.

**Type**: `settings-updated`

**Payload**: `{}`

**Status**: Legacy. Backend does not currently emit this; frontend settings are local-only.

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174012",
  "type": "settings-updated",
  "payload": {},
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

System prompt sent to frontend for transparency display. Tool schemas are emitted separately as a `tool-schemas` event and embedded in the initial user message.

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

Tool schemas sent to frontend for transparency display (first message only). Schemas are embedded in the initial user message, not passed as an LLM API parameter.

**Type**: `tool-schemas`

**Payload**:
```json
{
  "tool_schemas": {
    "mouse_control": {
      "type": "object",
      "properties": { ... }
    },
    "keyboard_control": { ... }
  }
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174022",
  "type": "tool-schemas",
  "payload": {
    "tool_schemas": {
      "mouse_control": {
        "type": "object",
        "properties": {
          "action": {
            "type": "string",
            "enum": ["click", "double_click", "right_click"]
          }
        }
      }
    }
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
  "completion_tokens": 50,
  "total_tokens": 200
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174023",
  "type": "token-count",
  "payload": {
    "prompt_tokens": 150,
    "completion_tokens": 50,
    "total_tokens": 200
  },
  "timestamp": "2025-01-20T10:00:00Z"
}
```

## Error Codes

### Common Error Codes

- `VALIDATION_ERROR`: Message validation failed
- `TOOL_EXECUTION_ERROR`: Tool execution failed
- `LLM_API_ERROR`: LLM API error
- `CONFIGURATION_ERROR`: Configuration error
- `MEMORY_ERROR`: Memory system error
- `PLUGIN_ERROR`: Plugin error
- `UNKNOWN_ERROR`: Unknown error

## Rate Limiting

**Limits**:
- Max message size: 10MB
- Max concurrent tasks: 50 per connection
- Receive timeout: 3600 seconds (1 hour)

## Connection Management

### Handshake

On connection, client sends handshake:

```json
{
  "type": "handshake",
  "payload": {
    "user_id": "default_user"
  }
}
```

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
