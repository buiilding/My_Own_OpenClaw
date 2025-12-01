# 003. Protocol-Based Interfaces

Date: 2024-01-XX

## Status

Accepted

## Context

The Personal Assistant Backend requires a flexible architecture that supports multiple implementations of core components while maintaining type safety and testability. Components like LLM providers, storage backends, and tool executors need to be interchangeable without changing dependent code.

Traditional inheritance-based interfaces create tight coupling and make testing difficult. Abstract base classes can be overly restrictive and don't work well with dependency injection frameworks. The system needs:

- Type-safe interfaces for static analysis and IDE support
- Runtime flexibility for different implementations
- Easy mocking for unit testing
- Clear contracts between components
- Support for both sync and async operations

## Decision

Implement protocol-based interfaces using Python's `Protocol` class from the `typing` module. All core interfaces will be defined as protocols with optional abstract base class implementations.

Key patterns:
1. **Protocol Interfaces**: Define contracts using `Protocol` classes
2. **Structural Typing**: Implementation by structure, not inheritance
3. **Optional ABCs**: Provide abstract base classes for convenience
4. **Async Support**: Protocols support both sync and async method signatures
5. **Generic Protocols**: Support for parameterized interfaces

## Consequences

### Positive
- **Type Safety**: Full mypy support and IDE autocompletion
- **Flexibility**: Any class can implement a protocol by structure
- **Testability**: Easy creation of mock objects for testing
- **Dependency Injection**: Works seamlessly with DI containers
- **Runtime Polymorphism**: No inheritance requirements for implementation

### Negative
- **Discovery**: Harder to find all implementations of a protocol
- **Documentation**: Less explicit than inheritance hierarchies
- **Validation**: Runtime protocol checking requires additional tools
- **IDE Support**: Some IDEs may not fully support protocol discovery

### Mitigation
- Clear naming conventions for protocol interfaces
- Comprehensive documentation of protocol requirements
- Runtime protocol validation in debug mode
- Protocol registry for implementation discovery

## Alternatives Considered

### Abstract Base Classes (ABCs)
- **Rejected**: Requires inheritance, creates tight coupling, harder testing

### Duck Typing Only
- **Rejected**: No static type checking, runtime errors from missing methods

### Interface Classes with __subclasshook__
- **Rejected**: Complex implementation, still inheritance-based, confusing

### Type Hints Only
- **Rejected**: No runtime checking, incomplete contracts, harder refactoring

## Related ADRs

- ADR-002: Dependency Injection Container (protocol-compatible DI)
- ADR-005: Tool SDK Design (protocol-based tool interfaces)
- ADR-007: Plugin System Architecture (protocol-based plugin interfaces)
