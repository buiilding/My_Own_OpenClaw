# Phase 1 Implementation: Message Handlers & Config Service

## Overview

Phase 1 focuses on establishing the core communication infrastructure and configuration management system. This phase implements the foundational components that enable reliable message handling and dynamic configuration updates.

## Objectives

- Implement WebSocket message routing system
- Create extensible message handler registry
- Build configuration service with runtime updates
- Establish validation and error handling patterns
- Set up async communication patterns

## Implementation Details

### Message Handler Registry

**Location**: `backend/src/api/handlers/base.py`

The message handler registry provides a centralized system for routing WebSocket messages to appropriate handlers:

```python
class MessageHandlerRegistry:
    """Registry for WebSocket message handlers."""

    def __init__(self):
        self._handlers: Dict[str, MessageHandler] = {}

    def register(self, message_type: str, handler: MessageHandler):
        """Register handler for message type."""
        self._handlers[message_type] = handler

    async def handle(self, message_type: str, data: Dict, websocket: WebSocket, user_id: str):
        """Route message to appropriate handler."""
        handler = self._handlers.get(message_type)
        if not handler:
            raise ValueError(f"No handler for message type: {message_type}")

        await handler.handle(data, websocket, user_id)
```

**Key Features**:
- Type-safe message routing
- Middleware support for cross-cutting concerns
- Async handler execution
- Error propagation and handling

### Message Handlers

**Implemented Handlers**:
- `PingMessageHandler`: Health check and connection verification
- `QueryMessageHandler`: User query processing and streaming responses
- `SettingsHandler`: Configuration management (load/update)
- `ListModelsHandler`: LLM model enumeration

**Handler Interface**:
```python
class MessageHandler(ABC):
    @abstractmethod
    async def handle(self, data: Dict, websocket: WebSocket, user_id: str):
        """Handle WebSocket message."""
        pass

    def validate_message(self, data: Dict) -> bool:
        """Validate message structure."""
        return True
```

### Configuration Service

**Location**: `backend/src/core/config_service.py`

The configuration service provides centralized configuration management:

```python
class ConfigService:
    """Centralized configuration management."""

    def __init__(self):
        self._config: AppConfig = None
        self._subscribers: List[Callable] = []

    def get_config(self) -> AppConfig:
        """Get current configuration."""
        return self._config

    async def update_config(self, new_config: AppConfig):
        """Update configuration and notify subscribers."""
        self._config = new_config
        await self._notify_subscribers()

    def subscribe(self, callback: Callable):
        """Subscribe to configuration changes."""
        self._subscribers.append(callback)
```

**Features**:
- Runtime configuration updates
- Observer pattern for change notifications
- Validation and type safety
- Persistent storage integration

### WebSocket Communication

**Location**: `backend/src/api/routes/websocket.py`

WebSocket endpoint with handshake and message routing:

```python
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, session_manager):
    await websocket.accept()

    # Handshake
    handshake_data = await websocket.receive_json()
    if handshake_data.get("type") != "handshake":
        await websocket.close(code=1008)
        return

    user_id = handshake_data.get("user_id", "default_user")

    # Message loop
    try:
        while True:
            data = await websocket.receive_text()
            json_data = json.loads(data)
            json_data["user_id"] = user_id

            await handle_message(websocket, json_data, session_manager, user_id)
    except WebSocketDisconnect:
        await session_manager.end_session(user_id)
```

### Message Validation

**Location**: `backend/src/core/validation.py`

Comprehensive message validation system:

```python
def validate_message(data: Dict, expected_type: str, schema_class: Type[BaseModel]) -> BaseModel:
    """Validate message structure and content."""
    if data.get("type") != expected_type:
        raise ValidationError(f"Expected message type {expected_type}")

    try:
        return schema_class(**data)
    except ValidationError as e:
        raise ValidationError(f"Invalid message structure: {e}")

def validate_query_text(text: str) -> str:
    """Validate and sanitize query text."""
    if not text or not text.strip():
        raise ValidationError("Query text cannot be empty")

    if len(text) > MAX_QUERY_LENGTH:
        raise ValidationError(f"Query too long (max {MAX_QUERY_LENGTH} chars)")

    return text.strip()
```

## Message Types

### Ping Message
```json
{
  "id": "ping-123",
  "type": "ping",
  "payload": {
    "text": "optional-custom-message"
  }
}
```

**Response**:
```json
{
  "type": "pong",
  "id": "ping-123",
  "payload": {
    "text": "Pong"
  }
}
```

### Query Message
```json
{
  "id": "query-456",
  "type": "query",
  "payload": {
    "text": "What is the weather?"
  }
}
```

**Streaming Response**:
```json
{
  "type": "streaming-response",
  "id": "query-456",
  "payload": {
    "content": "The weather is sunny"
  }
}
```

### Load Settings Message
```json
{
  "id": "settings-789",
  "type": "load-settings"
}
```

**Response**:
```json
{
  "type": "settings-loaded",
  "id": "settings-789",
  "payload": {
    "selected_model_id": "gpt-4",
    "temperature": 0.7
  }
}
```

## Error Handling

### Validation Errors
- Message structure validation
- Type checking and constraints
- Business rule validation

### Runtime Errors
- Handler execution failures
- Configuration update errors
- Session management errors

### Error Response Format
```json
{
  "type": "error",
  "id": "original-message-id",
  "payload": {
    "message": "Human-readable error message",
    "content": "Optional additional details"
  }
}
```

## Configuration Management

### Configuration Sources
1. **YAML Files**: Platform-specific config directories
2. **Environment Variables**: API keys and secrets
3. **Runtime Updates**: Dynamic configuration changes
4. **Defaults**: Sensible fallback values

### Configuration Schema
```python
class AppConfig(BaseModel):
    # LLM Configuration
    selected_provider: Optional[str] = None
    selected_model_id: Optional[str] = None
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)

    # Memory Configuration
    memory_enabled: bool = True
    max_history_length: int = Field(default=50, ge=1, le=1000)

    # Tool Configuration
    tool_timeout_seconds: float = Field(default=30.0, ge=1.0, le=300.0)
```

## Testing

### Unit Tests
- Message handler validation
- Configuration service operations
- WebSocket message parsing
- Error handling scenarios

### Integration Tests
- End-to-end message flow
- Configuration persistence
- Session management
- Concurrent connection handling

### Test Coverage
- Handler registration and routing
- Message validation edge cases
- Configuration update propagation
- Error response formatting

## Performance Considerations

### Connection Management
- Efficient WebSocket connection pooling
- Session cleanup on disconnect
- Connection limit enforcement

### Message Processing
- Async message handling prevents blocking
- Validation caching for repeated schemas
- Efficient JSON parsing and serialization

### Memory Management
- Bounded message queues
- Configuration object reuse
- Garbage collection monitoring

## Security Measures

### Input Validation
- Strict message schema validation
- Query text sanitization
- Configuration value constraints

### Connection Security
- User identification and session tracking
- Rate limiting capabilities
- Timeout enforcement

### Data Protection
- Sensitive configuration field exclusion
- Secure API key handling
- Audit logging preparation

## Future Extensions

### Additional Message Types
- File upload/download messages
- Bulk operation messages
- Administrative control messages

### Enhanced Configuration
- Configuration profiles
- Environment-specific overrides
- Configuration validation rules

### Monitoring Integration
- Message processing metrics
- Performance monitoring hooks
- Health check endpoints

## Success Criteria

- [x] WebSocket connection establishment and handshake
- [x] Message routing to appropriate handlers
- [x] Query processing with streaming responses
- [x] Configuration loading and runtime updates
- [x] Comprehensive error handling and validation
- [x] Async execution without blocking
- [x] Type-safe message processing
- [x] Extensible handler registration system

## Lessons Learned

### Async Complexity
Async programming introduced complexity in error handling and debugging, but provided necessary performance benefits for concurrent operations.

### Validation Importance
Early message validation caught many integration issues and improved system reliability.

### Configuration Challenges
Runtime configuration updates required careful change propagation and validation to prevent system instability.

### Handler Registry Benefits
The registry pattern provided excellent extensibility and testability for adding new message types.
