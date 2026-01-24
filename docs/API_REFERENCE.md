# API Reference

## Overview

Desktop Assistant uses a WebSocket-based API for real-time communication between the frontend and backend. All messages follow a consistent format with type-based routing.

## API Endpoints

### WebSocket Endpoint

**URL**: `ws://127.0.0.1:8765/ws`

**Protocol**: WebSocket (RFC 6455)

**Connection**: Persistent connection, auto-reconnect on disconnect

**Implementation**: `backend/src/api/routes/websocket.py`

**Features**:
- Thread-safe message sending via `SafeWebSocket` wrapper
- Queue-based sender to decouple message generation from network I/O
- Task tracking and cancellation on disconnect
- Message validation via Pydantic
- Connection lifecycle management

### REST Endpoints

#### Embeddings API

**Base URL**: `http://127.0.0.1:8765/api/embeddings`

**POST `/`** - Generate Embeddings
- **Purpose**: Generate embeddings for text (used by frontend memory system)
- **Request Body**:
  ```json
  {
    "text": "Text to embed (1-8192 chars)",
    "model_name": "default"
  }
  ```
- **Constraints**:
  - Text length: 1-8192 characters
  - Model name: 1-128 characters
- **Response**:
  ```json
  {
    "embedding": [0.123, 0.456, ...],
    "model_name": "sentence-transformers/all-MiniLM-L6-v2",
    "dimension": 384
  }
  ```
- **Implementation**: `backend/src/api/routes/embeddings.py`
- **Features**:
  - Async embedding generation (offloaded to thread pool)
  - Timing logs for performance monitoring
  - Error handling with sanitized error messages
  - Supports numpy arrays and lists

**GET `/health`** - Health Check
- **Purpose**: Check embeddings service health
- **Response**:
  ```json
  {
    "status": "healthy",
    "model_name": "sentence-transformers/all-MiniLM-L6-v2",
    "dimension": 384
  }
  ```
- **Features**:
  - Tests embedding generation with "test" string
  - Returns model name and dimension if healthy
  - Returns "unhealthy" status if service unavailable

#### Semantic Memory API

**Base URL**: `http://127.0.0.1:8765/api/semantic`

**POST `/summarize`** - Summarize Conversations
- **Purpose**: Summarize conversations and extract semantic information (facts, preferences)
- **Request Body**:
  ```json
  {
    "conversations": ["conversation text 1", "conversation text 2"],
    "user_id": "user123"
  }
  ```
- **Constraints**:
  - Max 100 conversations per request
  - Max 32KB per conversation
  - User ID required (cannot be "default_user" or empty)
- **Response**:
  ```json
  {
    "summary": "Brief summary of conversations",
    "facts": ["Fact 1", "Fact 2", "Fact 3"],
    "success": true
  }
  ```
- **Implementation**: `backend/src/api/routes/semantic.py`
- **Features**:
  - Extracts user preferences
  - Extracts key facts about user
  - Extracts important context
  - Robust regex parsing with fallback extraction
  - Uses user's selected LLM model from config
  - Structured prompt for consistent extraction
  - Fallback summary if parsing fails (500 chars)

**GET `/health`** - Health Check
- **Purpose**: Check semantic summarization service health
- **Response**:
  ```json
  {
    "status": "healthy",
    "message": "Semantic summarization service ready"
  }
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
  "screenshot": "base64-encoded-screenshot" // Optional
}
```

**Response**: Streaming response with multiple message types:
- `streaming-response`: Text chunks
- `tool-call`: Tool execution requests
- `tool-output`: Tool execution results
- `tool-bundle`: Atomic bundle of tools (single message)
- `llm-thought`: Thinking tokens (Gemini)
- `streaming-complete`: End of stream
- `request-screenshot`: Request hidden screenshot
- `memory-store`: Request to store memory
- `wakeword-greeting`: Wakeword detection greeting
- `system-prompt`: System prompt for transparency
- `user-message-full`: Full user message for transparency
- `assistant-message-full`: Full assistant message for transparency
- `tool-schemas`: Tool schemas for transparency
- `token-count`: Token usage information

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

### Request Screenshot Message

Backend requests a hidden screenshot for coordinate calculation (not displayed in UI).

**Type**: `request-screenshot`

**Payload**:
```json
{
  "request_id": "screenshot-req-123",
  "correlation_id": "screenshot-req-123"
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174016",
  "type": "request-screenshot",
  "payload": {
    "request_id": "screenshot-req-123",
    "correlation_id": "screenshot-req-123"
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

System prompt sent to frontend for transparency display.

**Type**: `system-prompt`

**Payload**:
```json
{
  "content": "You are a helpful assistant...",
  "tool_schemas": { ... } // Optional
}
```

**Example**:
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174019",
  "type": "system-prompt",
  "payload": {
    "content": "You are a helpful assistant...",
    "tool_schemas": {
      "mouse_control": { ... }
    }
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

Tool schemas sent to frontend for transparency display (first message only).

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
