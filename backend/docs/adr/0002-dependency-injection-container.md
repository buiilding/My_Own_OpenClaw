# ADR-0002: Use Dependency Injection Container

**Status**: Accepted  
**Date**: 2024-01-15  
**Deciders**: Development Team  
**Tags**: [architecture, dependency-injection, design-pattern]

## Context

The application needs to manage complex dependencies between components (LLM clients, tool registries, memory managers, etc.). We need a way to:
- Wire components together cleanly
- Support testing with mocks
- Manage component lifecycle
- Avoid circular dependencies
- Provide a single source of truth for component creation

## Decision

We will use the `dependency-injector` library to create a declarative dependency injection container (`ApplicationContainer`).

The container will:
- Use `providers.Singleton` for shared components (config, tool registry)
- Use `providers.Factory` for components that need new instances (agent sessions)
- Support lazy imports to avoid circular dependencies
- Be defined in `backend/src/core/container.py`

## Consequences

### Positive

- **Loose Coupling**: Components depend on interfaces, not concrete implementations
- **Testability**: Easy to override providers with mocks in tests
- **Lifecycle Management**: Singleton providers ensure single instance
- **Type Safety**: Container can be typed with TYPE_CHECKING
- **Clear Dependencies**: Dependencies are explicit in container definition

### Negative

- **Learning Curve**: Team needs to understand dependency-injector patterns
- **Initial Setup**: More boilerplate for simple cases
- **Debugging**: Stack traces can be deeper due to provider layers

## Alternatives Considered

### 1. Manual Dependency Injection
- **Rejected**: Too much boilerplate, error-prone, hard to test

### 2. Framework DI (FastAPI's Depends)
- **Rejected**: Only works for HTTP endpoints, not for internal components

### 3. Service Locator Pattern
- **Rejected**: Hides dependencies, makes testing harder, considered anti-pattern

### 4. Global Singletons
- **Rejected**: Hard to test, creates hidden dependencies, no lifecycle control

## Implementation

```python
from dependency_injector import containers, providers

class ApplicationContainer(containers.DeclarativeContainer):
    config_manager = providers.Singleton(ConfigManager)
    config = providers.Singleton(lambda cm: cm.load_config(), cm=config_manager)
    tool_registry = providers.Singleton(ToolRegistry, config=config)
```

## References

- [dependency-injector Documentation](https://python-dependency-injector.ets-labs.org/)
- [Dependency Injection Pattern](https://en.wikipedia.org/wiki/Dependency_injection)

