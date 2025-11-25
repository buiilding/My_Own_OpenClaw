# ADR-0007: Configuration Service with Subscriber Pattern

**Status**: Accepted  
**Date**: 2024-02-20  
**Deciders**: Development Team  
**Tags**: [architecture, configuration, observer-pattern, reactivity]

## Context

Configuration changes need to propagate to multiple components:
- `SessionManager` needs to update all active sessions
- `MemoryManager` needs to reload settings
- `LLMClient` needs to reconnect with new API keys
- UI needs to reflect changes

Initially, components accessed config directly from `ConfigManager`, making it:
- Hard to react to changes
- No centralized change notification
- Components need to poll for changes
- Inconsistent config access patterns

## Decision

We will create a `ConfigurationService` that:
- Wraps `ConfigManager` for centralized access
- Implements **Observer Pattern** with `ConfigSubscriber` protocol
- Notifies subscribers when config changes
- Provides type-safe config access via `get_config_value(path)`

Components that need to react to config changes will:
- Implement `ConfigSubscriber` protocol
- Subscribe to `ConfigurationService`
- Receive `on_config_changed()` callbacks

## Consequences

### Positive

- **Reactivity**: Components automatically notified of changes
- **Centralized**: Single source of truth for config access
- **Type Safety**: Path-based access with validation
- **Decoupling**: Components don't need direct `ConfigManager` reference
- **Testability**: Easy to test config change reactions

### Negative

- **Complexity**: Additional abstraction layer
- **Async Callbacks**: Need to handle async subscriber callbacks
- **Error Handling**: Subscriber errors need careful handling

## Alternatives Considered

### 1. Direct ConfigManager Access
- **Rejected**: No change notifications, components need to poll

### 2. Event Bus for Config Changes
- **Considered**: Could work, but config service is more specific and type-safe

### 3. Polling for Changes
- **Rejected**: Inefficient, adds latency, wastes resources

### 4. Manual Update Methods
- **Rejected**: Error-prone, easy to forget to call, tight coupling

## Implementation

```python
from backend.src.core.config_service import ConfigurationService, ConfigSubscriber

class MyComponent(ConfigSubscriber):
    async def on_config_changed(self, old_config: AppConfig, new_config: AppConfig):
        # React to config changes
        self.update_settings(new_config)

# Subscribe
config_service = ConfigurationService(config_manager)
config_service.subscribe(MyComponent())
```

## Subscriber Pattern

```
ConfigurationService
    ├─→ SessionManager (updates all sessions)
    ├─→ MemoryManager (reloads settings)
    └─→ OtherComponents (react to changes)
```

## References

- [Observer Pattern](https://en.wikipedia.org/wiki/Observer_pattern)
- [Configuration Management Best Practices](https://12factor.net/config)

