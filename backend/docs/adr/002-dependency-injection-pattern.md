# 002. Dependency Injection Container

Date: 2024-01-XX

## Status

Accepted

## Context

The Personal Assistant Backend has complex interdependencies between components:
- Agent sessions depend on memory, tools, LLM clients
- Tools depend on various services and configuration
- Memory system depends on embeddings and storage
- Multiple configuration sources and runtime overrides

Without proper dependency management:
- Components become tightly coupled
- Testing requires complex mocking
- Configuration changes require code changes
- Component lifecycle management becomes difficult

## Decision

Implement dependency injection using the `dependency-injector` library with a hierarchical container structure:

1. **ApplicationContainer**: Top-level container composing all domains
2. **CoreContainer**: Configuration, services, LLM, TTS
3. **ToolContainer**: Tool system components
4. **MemoryContainer**: Memory system components

Key patterns:
- **Container Composition**: Domain-specific containers wired together
- **Factory Providers**: For components needing runtime parameters
- **Singleton Providers**: For shared services and configuration
- **Override Support**: For testing and runtime configuration

## Consequences

### Positive
- **Loose Coupling**: Components don't create their own dependencies
- **Testability**: Easy mocking and stubbing of dependencies
- **Flexibility**: Runtime dependency replacement and configuration
- **Maintainability**: Clear dependency relationships and lifecycle
- **Modularity**: Independent container modules for different domains

### Negative
- **Complexity**: Additional abstraction layer to understand
- **Performance**: Slight overhead from DI resolution
- **Debugging**: Dependency resolution can be opaque
- **Learning Curve**: New pattern for developers to learn

### Mitigation
- Clear container structure documentation
- Factory methods for complex object creation
- Runtime container inspection tools
- Comprehensive integration tests

## Alternatives Considered

### Manual Dependency Passing
- **Rejected**: Constructor parameter explosion, tight coupling, hard to test

### Service Locator Pattern
- **Rejected**: Hidden dependencies, harder testing, global state issues

### Singleton Pattern
- **Rejected**: Tight coupling, hard to test, global state management

### Context Variables (contextvars)
- **Rejected**: Complex context management, thread-local issues, limited scope

## Related ADRs

- ADR-001: Async-First Architecture (async-compatible container)
- ADR-003: Protocol-Based Interfaces (interface contracts for DI)
