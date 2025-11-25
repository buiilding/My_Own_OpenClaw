# ADR-0003: Event-Driven Architecture for Component Communication

**Status**: Accepted  
**Date**: 2024-01-20  
**Deciders**: Development Team  
**Tags**: [architecture, events, decoupling, design-pattern]

## Context

Components need to communicate without tight coupling. For example:
- Memory manager needs to know when tools execute
- Plugins need to react to various system events
- Audit logging needs to track all operations
- UI needs real-time updates

Direct method calls create tight coupling and make the system hard to extend.

## Decision

We will implement an event-driven architecture using an event bus (`EventBus`) for decoupled component communication.

Components will:
- Publish events when significant actions occur
- Subscribe to events they care about
- Use typed event classes (Pydantic models)
- Support event filtering and priority-based handling

## Consequences

### Positive

- **Decoupling**: Components don't need direct references to each other
- **Extensibility**: New components can subscribe without modifying existing code
- **Testability**: Easy to test event publishing/subscribing in isolation
- **Observability**: All system events are centralized and can be logged/monitored
- **Flexibility**: Multiple handlers can react to the same event

### Negative

- **Debugging**: Event flow can be harder to trace than direct calls
- **Performance**: Slight overhead from event dispatching
- **Complexity**: More moving parts, need to understand event flow

## Alternatives Considered

### 1. Direct Method Calls
- **Rejected**: Creates tight coupling, hard to extend

### 2. Observer Pattern (Manual)
- **Rejected**: Too much boilerplate, no centralized management

### 3. Message Queue (RabbitMQ, Redis)
- **Rejected**: Overkill for single-process application, adds external dependency

### 4. Callback Functions
- **Rejected**: Hard to manage, no type safety, difficult to test

## Implementation

```python
from backend.src.core.bus import message_bus
from backend.src.core.events import ToolExecuted

# Publish
await message_bus.publish(ToolExecuted(...))

# Subscribe
message_bus.subscribe(ToolExecuted, handler, priority=50)
```

## Event Types

- `UserMessageReceived`: User sends a message
- `AgentResponseGenerated`: Agent generates a response
- `ToolExecutionStarted`: Tool execution begins
- `ToolExecuted`: Tool execution completes
- `MemoryStored`: Memory is stored
- `ConfigChanged`: Configuration updated
- `ErrorOccurred`: Error occurs

## References

- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)
- [Observer Pattern](https://en.wikipedia.org/wiki/Observer_pattern)

