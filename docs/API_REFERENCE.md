# API Reference

## Overview

Desktop Assistant uses a WebSocket-based API for real-time communication between the frontend and backend. All messages follow a consistent format with type-based routing.

## WebSocket Endpoint

**URL**: `ws://127.0.0.1:8765/ws`

**Protocol**: WebSocket (RFC 6455)

**Connection**: Persistent connection, auto-reconnect on disconnect

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
  "screenshot": "base64-encoded-screenshot" // Optional
}
```

**Response**: Streaming response with multiple message types:
- `streaming-response`: Text chunks
- `tool-call`: Tool execution requests
- `tool-output`: Tool execution results
- `llm-thought`: Thinking tokens (Gemini)
- `streaming-complete`: End of stream

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

**Response**: `settings-loaded`

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
  "selected_model_id": "gpt-4o",
  "voice_mode_enabled": true | false,
  "speech_mode_enabled": true | false
}
```

**Response**: `settings-updated`

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174002",
  "type": "update-settings",
  "payload": {
    "model_mode": "online",
    "model_provider": "openai",
    "selected_model_id": "gpt-4o",
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
  "tool_name": "mouse_control",
  "result": {
    "success": true,
    "llm_content": "Tool executed successfully",
    "data": { ... }
  },
  "screenshot": "base64-encoded-screenshot", // Optional
  "system_context": { // Optional
    "active_window": "Application Name",
    "mouse_position": "(100, 200)",
    "time": "2025-01-20T10:00:00Z"
  }
}
```

**Response**: Acknowledgment (no specific response type)

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174004",
  "type": "tool-result",
  "payload": {
    "tool_name": "mouse_control",
    "result": {
      "success": true,
      "llm_content": "Clicked submit button",
      "data": {
        "x": 100,
        "y": 200
      }
    },
    "screenshot": "iVBORw0KGgoAAAANSUhEUgAA...",
    "system_context": {
      "active_window": "Browser",
      "mouse_position": "(100, 200)",
      "time": "2025-01-20T10:00:00Z"
    }
  },
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
  "arguments": {
    "action": "click",
    "x": 100,
    "y": 200
  },
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
    "arguments": {
      "action": "click",
      "x": 100,
      "y": 200
    },
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
  "result": {
    "success": true,
    "llm_content": "Tool executed successfully",
    "data": { ... }
  },
  "screenshot": "base64-encoded-screenshot", // Optional
  "system_context": { ... } // Optional
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174007",
  "type": "tool-output",
  "payload": {
    "tool_name": "mouse_control",
    "result": {
      "success": true,
      "llm_content": "Clicked submit button",
      "data": {
        "x": 100,
        "y": 200
      }
    },
    "screenshot": "iVBORw0KGgoAAAANSUhEUgAA...",
    "system_context": {
      "active_window": "Browser",
      "mouse_position": "(100, 200)",
      "time": "2025-01-20T10:00:00Z"
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
    "selected_model_id": "gpt-4o",
    "voice_mode_enabled": false,
    "speech_mode_enabled": true
  }
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174011",
  "type": "settings-loaded",
  "payload": {
    "config": {
      "model_mode": "online",
      "model_provider": "openai",
      "selected_model_id": "gpt-4o",
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
      "provider": "ollama"
    }
  ],
  "online": [
    {
      "id": "gpt-4o",
      "provider": "openai"
    },
    {
      "id": "claude-3-opus",
      "provider": "anthropic"
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
        "provider": "ollama"
      }
    ],
    "online": [
      {
        "id": "gpt-4o",
        "provider": "openai"
      },
      {
        "id": "claude-3-opus",
        "provider": "anthropic"
      }
    ]
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
