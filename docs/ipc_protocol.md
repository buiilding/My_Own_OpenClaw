# IPC Protocol

This document defines the WebSocket-based Inter-Process Communication (IPC) protocol used for communication between the Electron frontend and the Python backend.

- **Protocol**: WebSocket
- **Format**: JSON

---

## Message Structure

All messages, in both directions, should conform to a basic structure:

```json
{
  "type": "string",
  "id": "string (uuid)",
  "payload": {}
}
```

- **`type`**: A string identifier for the message type (e.g., "query", "response").
- **`id`**: A unique identifier (UUID) for the request. Responses should use the same `id` as the request they are responding to.
- **`payload`**: An object containing the data relevant to the message type.

---

## Message Types

### From Frontend to Backend

#### `query`
Sent when the user submits a message in the chat.

- **Example**:
  ```json
  {
    "type": "query",
    "id": "uuid-1234",
    "payload": {
      "text": "What files did I edit yesterday?"
    }
  }
  ```

#### `load-settings`
Sent by the frontend on startup to request the current application configuration.

- **Example**:
  ```json
  {
    "type": "load-settings",
    "id": "uuid-4321"
  }
  ```

#### `save-settings`
Sent when the user saves changes in the settings panel. The payload should contain the complete, updated configuration object.

- **Example**:
  ```json
  {
    "type": "save-settings",
    "id": "uuid-5678",
    "payload": {
      "active_provider": "anthropic",
      "preferences": { "user_name": "Peter" }
    }
  }
  ```

---

### From Backend to Frontend

#### `response`
The standard response from the agent to a user's `query`.

- **Example**:
  ```json
  {
    "type": "response",
    "id": "uuid-1234",
    "payload": {
      "text": "Received your query: '...'. The agent is not yet connected."
    }
  }
  ```

#### `settings-loaded`
Sent in response to a `load-settings` request, containing the current application configuration.

- **Example**:
  ```json
  {
    "type": "settings-loaded",
    "id": "uuid-4321",
    "payload": {
      "active_provider": "openai",
      "preferences": { "user_name": "User" }
    }
  }
  ```

#### `settings-saved`
A confirmation message sent after settings have been successfully saved.

- **Example**:
  ```json
  {
    "type": "settings-saved",
    "id": "uuid-5678",
    "payload": {
      "message": "Settings saved successfully"
    }
  }
  ```

#### `error`
A generic error message. Can be sent in response to any request that fails.

- **Example**:
  ```json
  {
    "type": "error",
    "id": "uuid-5678",
    "payload": {
      "message": "Description of the error that occurred."
    }
  }
  ```
