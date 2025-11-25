# ADR-0006: Message Handler Registry for WebSocket Routing

**Status**: Accepted  
**Date**: 2024-02-15  
**Deciders**: Development Team  
**Tags**: [architecture, api, websocket, extensibility]

## Context

WebSocket message handling in `websocket.py` used hardcoded `if/elif` chains:

```python
if msg_type == "ping":
    # handle ping
elif msg_type == "query":
    # handle query
elif msg_type == "load-settings":
    # handle settings
# ... more elifs
```

This approach:
- Violates Open/Closed Principle (need to modify router for new message types)
- Hard to test individual handlers
- No clear separation of concerns
- Difficult to add new message types

## Decision

We will implement a **Registry Pattern** with `MessageHandlerRegistry` and `BaseMessageHandler` for WebSocket message routing.

The system will:
- Use `MessageHandlerRegistry` to map message types to handlers
- Each handler inherits from `BaseMessageHandler`
- Handlers are registered at startup
- New message types can be added without modifying the router

## Consequences

### Positive

- **Extensibility**: Add new message types without modifying router
- **Testability**: Each handler can be tested independently
- **Separation of Concerns**: Handler logic separate from routing
- **Type Safety**: Handlers can validate message schemas
- **Clear Structure**: Easy to see all supported message types

### Negative

- **Initial Setup**: More boilerplate for simple handlers
- **Abstraction**: Additional layer of abstraction

## Alternatives Considered

### 1. Keep if/elif Chain
- **Rejected**: Violates Open/Closed Principle, hard to extend

### 2. Dictionary Mapping
- **Considered**: Simpler, but less structured, no base class benefits

### 3. FastAPI Router Pattern
- **Rejected**: FastAPI routers are for HTTP, not WebSocket messages

### 4. Plugin-Based Handlers
- **Considered**: Overkill for message routing, plugins are for agent execution

## Implementation

```python
from backend.src.api.handlers.base import BaseMessageHandler

class QueryHandler(BaseMessageHandler):
    def __init__(self):
        super().__init__("query")
    
    async def handle(self, data, websocket, session_manager, user_id, config_service):
        # Handle query message
        pass

# Register
registry = MessageHandlerRegistry()
registry.register("query", QueryHandler())
registry.register("ping", PingHandler())
```

## Handler Structure

```
MessageHandlerRegistry
    ├─→ QueryHandler (handles "query")
    ├─→ PingHandler (handles "ping")
    ├─→ LoadSettingsHandler (handles "load-settings")
    └─→ UpdateSettingsHandler (handles "update-settings")
```

## References

- [Registry Pattern](https://en.wikipedia.org/wiki/Service_locator_pattern#Registry)
- [Open/Closed Principle](https://en.wikipedia.org/wiki/Open%E2%80%93closed_principle)

