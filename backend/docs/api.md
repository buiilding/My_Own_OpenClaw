# API Reference

## Overview

The backend exposes:
1. **WebSocket API** for real-time bidirectional communication
2. **REST API** for embeddings generation

## REST API Endpoints

### Embeddings API

**Base Path**: `/api/embeddings`

#### POST `/api/embeddings/`

Generate embeddings for text. Used by the frontend memory system to create vector embeddings for semantic search.

**Request**:
```json
{
  "text": "Text to embed",
  "model_name": "default"
}
```

**Response**:
```json
{
  "embedding": [0.1, 0.2, 0.3, ...],
  "model_name": "text-embedding-ada-002",
  "dimension": 1536
}
```

**Status Codes**:
- `200`: Success
- `500`: Embedding generation failed
- `503`: Embedding service not available

#### GET `/api/embeddings/health`

Health check for the embeddings service.

**Response**:
```json
{
  "status": "healthy",
  "model_name": "text-embedding-ada-002",
  "dimension": 1536
}
```

**Status Codes**:
- `200`: Service is healthy
- `503`: Service is unavailable

### Semantic Memory API

**Base Path**: `/api/semantic`

#### POST `/api/semantic/summarize`

Summarize conversations and extract semantic information for long-term memory.

**Request**:
```json
{
  "conversations": [
    "User: hi\nAssistant: Hello! How can I help you today?",
    "User: I prefer dark mode\nAssistant: I'll remember that preference."
  ],
  "user_id": "default_user"
}
```

**Response**:
```json
{
  "summary": "User prefers dark mode and is learning Python",
  "facts": [
    "User prefers dark mode",
    "User is learning Python programming"
  ],
  "success": true
}
```

**Status Codes**:
- `200`: Success
- `500`: Summarization failed
- `503`: LLM service not available

#### GET `/api/semantic/health`

Health check for the semantic summarization service.

**Response**:
```json
{
  "status": "healthy",
  "message": "Semantic summarization service ready"
}
```

## WebSocket API

### Overview

The backend exposes a **WebSocket API** for real-time bidirectional communication with the frontend. All communication happens over a single WebSocket connection per user session.

## Connection

### Endpoint

```
ws://localhost:8000/ws
```

### Connection Parameters

- **user_id**: User identifier (query parameter or header)
- **session_id**: Optional session identifier for resuming sessions

### Connection Lifecycle

1. Frontend establishes WebSocket connection
2. Backend creates/retrieves AgentSession
3. Connection maintained for entire session
4. Connection closed on user disconnect or error

## Message Types

### Frontend → Backend

#### Query Message

Send a user query with system state and memories.

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

**Fields**:
- `text`: User query text (required)
- `image_data`: Optional base64-encoded image
- `context_type`: "initial" for first message, "sequential" for subsequent
- `content.system_state`: XML-formatted system state from frontend
- `content.memories`: Array of relevant memories from frontend

#### Tool Result Message

Return tool execution result from frontend.

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

**Fields**:
- `request_id`: UUID matching the tool_call request
- `success`: Whether tool execution succeeded
- `data`: Tool-specific result data (includes screenshot)
- `error`: Error message if execution failed
- `system_context`: System context at time of tool execution
  - `active_window`: Currently active window title
  - `mouse_position`: Current mouse coordinates (x, y)
  - `time`: Timestamp of tool execution

### Backend → Frontend

#### Streaming Events

Backend streams events in real-time during query processing.

**Event Types**:

##### Thinking Event

```json
{
  "type": "thinking",
  "payload": {
    "content": "Agent is thinking about the problem..."
  }
}
```

##### Tool Call Event

Request tool execution from frontend.

```json
{
  "type": "tool_call",
  "payload": {
    "request_id": "uuid",
    "tool_name": "mouse_control",
    "args": {
      "action": "click",
      "x": 100,
      "y": 200,
      "explanation": "Clicking on the button"
    }
  }
}
```

**Response**: Frontend should execute tool and send `tool_result` message.

##### Text Event

```json
{
  "type": "text",
  "payload": {
    "content": "Text chunk from LLM response"
  }
}
```

##### Error Event

```json
{
  "type": "error",
  "payload": {
    "message": "Error description",
    "details": {}
  }
}
```

##### Complete Event

```json
{
  "type": "complete",
  "payload": {
    "message_id": "uuid"
  }
}
```

## Message Flow Example

### Complete Query Flow

```
1. Frontend sends query:
   {
     "type": "query",
     "payload": {
       "text": "Click on the login button",
       "context_type": "initial",
       "content": {
         "system_state": "<system_context>...</system_context>",
         "memories": []
       }
     }
   }

2. Backend streams thinking:
   {
     "type": "thinking",
     "payload": {"content": "I need to find the login button..."}
   }

3. Backend requests tool execution:
   {
     "type": "tool_call",
     "payload": {
       "request_id": "abc-123",
       "tool_name": "mouse_control",
       "args": {
         "action": "click",
         "x": 500,
         "y": 300,
         "explanation": "Clicking on the login button"
       }
     }
   }

4. Frontend executes tool and returns result:
   {
     "type": "tool_result",
     "payload": {
       "request_id": "abc-123",
       "success": true,
       "data": {
         "screenshot": "base64_screenshot_data"
       },
       "system_context": {
         "active_window": "Application Name",
         "mouse_position": "(500, 300)",
         "time": "2026-01-02 13:23:17"
       }
     }
   }

5. Backend streams response:
   {
     "type": "text",
     "payload": {"content": "I've clicked on the login button."}
   }

6. Backend signals completion:
   {
     "type": "complete",
     "payload": {"message_id": "xyz-789"}
   }
```

## Error Handling

### Connection Errors

- **Connection Lost**: Frontend should reconnect and resume session
- **Invalid Message**: Backend sends error event and continues
- **Timeout**: Backend closes connection after timeout

### Tool Execution Errors

- Frontend sends `tool_result` with `success: false`
- Backend includes error in conversation context
- Backend may retry or ask user for clarification

## Session Management

### Session Creation

- Session created automatically on first query
- Session ID returned in connection acknowledgment
- Session persists for connection lifetime

### Session State

- Conversation history maintained in session
- Latest screenshot stored in session
- Latest OCR results stored in session
- Tool execution context maintained

## Rate Limiting

Currently no rate limiting implemented. Consider adding:
- Per-user rate limits
- Per-IP rate limits
- Tool execution rate limits

## Security Considerations

1. **Authentication**: Currently no authentication (add in production)
2. **Authorization**: User-based session isolation
3. **Input Validation**: All messages validated with Pydantic
4. **Tool Execution**: Tools execute on frontend, not backend

## Best Practices

1. **Reconnection**: Implement automatic reconnection on disconnect
2. **Error Handling**: Handle all event types gracefully
3. **State Management**: Maintain session state on frontend
4. **Tool Execution**: Execute tools promptly and return results
5. **Screenshots**: Always include screenshots in tool results
