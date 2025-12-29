# Dependency Injection Container Documentation

This document provides comprehensive documentation for the Personal Assistant Backend dependency injection (DI) container system, including container composition, provider patterns, and best practices.

## Overview

The system uses `dependency-injector` for clean architecture and testability. The DI container manages the lifecycle and wiring of all application components through container composition.

## Container Architecture

### Container Composition Pattern

The application uses container composition to organize dependencies by domain:

```python
class ApplicationContainer(containers.DeclarativeContainer):
    """Main application container with domain-specific sub-containers."""

    # Core services (config, LLM, TTS)
    core = providers.Container(CoreContainer)

    # Tool system components
    tools = providers.Container(
        ToolContainer,
        config=core.config,
        service_container=core.service_container,
    )

    # Memory system components
    memory = providers.Container(
        MemoryContainer,
        config=core.config,
    )
```

### Domain-Specific Containers

#### CoreContainer

**Location**: `backend/src/core/container/core_container.py`

Provides foundational services:

```python
class CoreContainer(containers.DeclarativeContainer):
    """Core dependency injection container."""

    # Configuration management
    config_manager = providers.Singleton(ConfigManager)
    config = providers.Singleton(lambda cm: cm.load_config(), cm=config_manager)

    # Event Bus (singleton for application-wide event communication)
    event_bus = providers.Singleton(EventBus)

    # Service layer
    service_container = providers.Singleton(
        lambda cfg: _create_service_container(cfg),
        cfg=config,
    )

    # LLM and TTS services
    llm_client = providers.Factory(lambda cfg: get_llm_client(cfg), cfg=config)
    tts_service = providers.Singleton(_create_tts_service, config=config)
    vision_service = providers.Singleton(_create_vision_service)
```

#### ToolContainer

**Location**: `backend/src/core/container/tool_container.py`

Manages tool system components:

```python
class ToolContainer(containers.DeclarativeContainer):
    """Tool system container."""

    # Tool loading and registry
    tool_loader = providers.Singleton(
        _create_tool_loader,
        config=config,
        service_container=service_container,
    )

    tool_registry = providers.Singleton(
        _create_tool_registry_with_factory,
        config=config,
        tool_loader=tool_loader,
    )

    # Tool execution
    tool_orchestrator = providers.Singleton(
        ToolOrchestrator,
        tool_registry=tool_registry,
        config=config,
    )
```

#### MemoryContainer

**Location**: `backend/src/core/container/memory_container.py`

Handles memory system components:

```python
class MemoryContainer(containers.DeclarativeContainer):
    """Memory system container."""

    # Embedding and storage providers
    embedding_provider = providers.Singleton(
        _create_embedding_provider,
        config=config,
    )

    memory_store = providers.Singleton(
        _create_memory_store,
        config=config,
    )

    # Memory manager
    memory_manager = providers.Singleton(
        MemoryManager,
        config=config,
        store=memory_store,
        embedding_provider=embedding_provider,
    )
```

## Provider Types

### Singleton Providers

Singletons maintain one instance throughout the application lifecycle:

```python
class MyContainer(containers.DeclarativeContainer):
    # Singleton - one instance shared across all consumers
    config_manager = providers.Singleton(ConfigManager)

    # Singleton with initialization
    database = providers.Singleton(
        lambda cfg: create_database_connection(cfg),
        cfg=config_manager,
    )
```

### Factory Providers

Factories create new instances on each request:

```python
class MyContainer(containers.DeclarativeContainer):
    # Factory - new instance each time
    llm_client = providers.Factory(
        lambda cfg: create_llm_client(cfg),
        cfg=config,
    )

    # Factory with complex initialization
    agent_session = providers.Factory(
        AgentSession,
        config=config,
        memory_manager=memory_manager,
        tool_registry=tool_registry,
    )
```

### Callable Providers

Callables for custom initialization logic:

```python
class MyContainer(containers.DeclarativeContainer):
    # Callable provider for complex initialization
    service_registry = providers.Callable(
        create_service_registry,
        config=config,
        logger=logger,
    )
```

### Resource Providers

Resources for components needing cleanup:

```python
class MyContainer(containers.DeclarativeContainer):
    # Resource provider for components needing cleanup
    database_pool = providers.Resource(
        init_resource=create_pool,
        shutdown_resource=close_pool,
        config=config,
    )
```

## Dependency Wiring Patterns

### Constructor Injection

Dependencies injected through constructor parameters:

```python
class ToolOrchestrator:
    def __init__(self, tool_registry: ToolRegistry, config: AppConfig):
        self.tool_registry = tool_registry
        self.config = config

# Container wiring
tool_orchestrator = providers.Singleton(
    ToolOrchestrator,
    tool_registry=tool_registry,
    config=config,
)
```

### Factory Function Injection

Using factory functions for complex initialization:

```python
def _create_tool_registry_with_factory(config: AppConfig, tool_loader, agent_factory):
    """Factory function for tool registry creation."""
    registry = ToolRegistry(config)
    registry.set_tool_loader(tool_loader)
    registry.set_agent_factory(agent_factory)
    return registry

# Container wiring
tool_registry = providers.Singleton(
    _create_tool_registry_with_factory,
    config=config,
    tool_loader=tool_loader,
    agent_factory=agent_factory,
)
```

### Lambda Injection

Inline lambda functions for simple transformations:

```python
# Configuration loading
config = providers.Singleton(
    lambda cm: cm.load_config(),
    cm=config_manager,
)

# Service initialization
llm_client = providers.Factory(
    lambda cfg: get_llm_client(cfg),
    cfg=config,
)
```

## Container Lifecycle Management

### Initialization

**Location**: `backend/src/core/container/initializer.py`

```python
class ContainerInitializer:
    """Handles container initialization and shutdown."""

    def __init__(self, container: ApplicationContainer):
        self.container = container

    async def initialize(self):
        """Initialize all container components."""
        # Initialize core components first
        await self._init_config()

        # Initialize services
        await self._init_services()

        # Initialize domain systems
        await self._init_tools()
        await self._init_memory()

    async def shutdown(self):
        """Shutdown all container components."""
        # Shutdown in reverse order
        await self._shutdown_memory()
        await self._shutdown_tools()
        await self._shutdown_services()
```

### Configuration Updates

**Location**: `backend/src/core/container/config_updater.py`

```python
class ContainerConfigUpdater:
    """Handles runtime configuration updates."""

    def __init__(self, container: ApplicationContainer):
        self.container = container

    async def update_config(self, new_config: AppConfig):
        """Update configuration and notify dependent components."""
        # Update config provider
        self.container.core.config.override(new_config)

        # Reinitialize dependent components
        await self._reinit_llm_client()
        await self._reinit_services()

        # Notify subscribers
        await self._notify_config_subscribers(new_config)
```

## Testing with Dependency Injection

### Container Overrides

Override dependencies for testing:

```python
@pytest.fixture
def test_container():
    """Test container with mocked dependencies."""
    container = ApplicationContainer()

    # Override with test implementations
    container.core.llm_client.override(MockLLMClient())
    container.tools.tool_registry.override(MockToolRegistry())

    return container

def test_agent_execution(test_container):
    """Test agent execution with mocked dependencies."""
    agent = test_container.agent_session()

    # Test logic here
    result = await agent.process_query("test query")
    assert result is not None
```

### Mock Providers

Create mock providers for isolated testing:

```python
def create_mock_provider(return_value=None):
    """Create a mock provider that returns a fixed value."""
    mock_instance = MagicMock(return_value=return_value)
    return providers.Object(mock_instance)

# Usage in tests
container.llm_client.override(create_mock_provider(mock_response))
```

### Integration Testing

Test with real container but controlled dependencies:

```python
@pytest.mark.asyncio
class TestAgentIntegration:
    async def test_full_agent_flow(self):
        """Test complete agent flow with container."""
        container = ApplicationContainer()
        await container.initialize()

        try:
            agent = container.agent_session()
            result = await agent.process_query("Hello")

            assert result["success"] is True
            assert "response" in result

        finally:
            await container.shutdown()
```

## Best Practices

### Container Organization

1. **Domain Separation**: Use separate containers for different domains
2. **Dependency Direction**: Core → Tools → Memory (dependencies flow inward)
3. **Clear Boundaries**: Each container has a single responsibility
4. **Testability**: Easy to override dependencies for testing

### Provider Selection

| Provider Type | Use Case | Example |
|---------------|----------|---------|
| Singleton | Shared state, expensive initialization | ConfigManager, Database |
| Factory | New instances needed | LLM clients, Agent sessions |
| Callable | Complex initialization logic | Service registries |
| Resource | Cleanup required | Database pools, File handles |

### Naming Conventions

```python
class MyContainer(containers.DeclarativeContainer):
    # Services
    user_service = providers.Singleton(UserService)

    # Repositories
    user_repository = providers.Singleton(UserRepository)

    # Factories
    user_factory = providers.Factory(UserFactory)

    # External dependencies
    database_client = providers.Singleton(DatabaseClient)
```

### Error Handling

```python
class ResilientContainer:
    """Container with error handling and recovery."""

    async def safe_initialize(self):
        """Initialize with error handling."""
        try:
            await self._init_critical_components()
        except Exception as e:
            logger.error(f"Critical component initialization failed: {e}")
            await self._init_fallback_components()
            raise

        try:
            await self._init_optional_components()
        except Exception as e:
            logger.warning(f"Optional component initialization failed: {e}")
            # Continue without optional components
```

## Performance Optimization

### Lazy Loading

Defer initialization until first access:

```python
class LazyContainer(containers.DeclarativeContainer):
    """Container with lazy-loaded components."""

    # Lazy-loaded service
    expensive_service = providers.Singleton(
        ExpensiveService,
        config=config,
    ).lazy()  # Only created when first accessed
```

### Provider Caching

Cache expensive provider resolutions:

```python
from functools import lru_cache

@lru_cache(maxsize=1)
def get_cached_config():
    """Cache configuration loading."""
    return load_config_from_files()

config = providers.Callable(get_cached_config)
```

### Resource Pooling

Use resource pools for expensive resources:

```python
class PooledContainer(containers.DeclarativeContainer):
    """Container with resource pooling."""

    # Database connection pool
    db_pool = providers.Resource(
        init_resource=create_connection_pool,
        shutdown_resource=close_connection_pool,
        config=config,
        min_size=5,
        max_size=20,
    )

    # HTTP client pool
    http_client = providers.Resource(
        init_resource=create_http_client,
        shutdown_resource=close_http_client,
    )
```

## Monitoring and Debugging

### Container Introspection

Inspect container state and dependencies:

```python
def inspect_container(container):
    """Inspect container structure and dependencies."""
    print(f"Container: {container.__class__.__name__}")

    for name in dir(container):
        attr = getattr(container, name)
        if isinstance(attr, providers.Provider):
            print(f"  {name}: {type(attr).__name__}")

            # Check if resolved
            try:
                instance = attr()
                print(f"    -> {type(instance).__name__}")
            except Exception as e:
                print(f"    -> Not resolved: {e}")
```

### Dependency Graph Visualization

```python
def visualize_dependencies(container):
    """Create dependency graph visualization."""
    graph = {}

    for name in dir(container):
        attr = getattr(container, name)
        if isinstance(attr, providers.Provider):
            dependencies = []
            # Extract dependencies from provider (implementation-specific)
            graph[name] = dependencies

    return graph
```

### Health Checks

```python
class HealthCheckableContainer:
    """Container with health check capabilities."""

    async def health_check(self):
        """Check health of all components."""
        results = {}

        # Check critical components
        try:
            config = self.config()
            results["config"] = "healthy"
        except Exception as e:
            results["config"] = f"unhealthy: {e}"

        # Check services
        try:
            db = self.database()
            await db.ping()  # Assuming ping method
            results["database"] = "healthy"
        except Exception as e:
            results["database"] = f"unhealthy: {e}"

        return results
```

## Migration and Refactoring

### Adding New Dependencies

1. Add provider to appropriate container
2. Wire dependencies in constructor or factory
3. Update initialization sequence if needed
4. Add to tests and health checks

### Refactoring Existing Dependencies

1. Create new provider alongside old one
2. Update consumers gradually
3. Remove old provider once migration complete
4. Update tests and documentation

### Version Compatibility

```python
class VersionedContainer(containers.DeclarativeContainer):
    """Container supporting multiple versions."""

    # Version-specific providers
    v1_service = providers.Singleton(V1Service)
    v2_service = providers.Singleton(V2Service)

    # Version selector
    @property
    def current_service(self):
        """Get service based on configuration."""
        if self.config().api_version == "v2":
            return self.v2_service
        return self.v1_service
```

## Common Patterns and Anti-Patterns

### Good Patterns

#### Interface-based Dependencies

```python
# Good: Depend on interfaces, not implementations
user_repository = providers.Singleton(
    UserRepository,  # Interface
    db_connection=db_connection,
)

# Implementation chosen via configuration
if config.use_postgres:
    user_repository.override(PostgresUserRepository)
else:
    user_repository.override(SqliteUserRepository)
```

#### Factory Pattern

```python
# Good: Use factories for complex object creation
agent_factory = providers.Factory(
    lambda registry, memory: AgentFactory(registry, memory),
    registry=tool_registry,
    memory=memory_manager,
)
```

### Anti-Patterns

#### Circular Dependencies

```python
# Bad: Circular dependency
class BadContainer(containers.DeclarativeContainer):
    service_a = providers.Singleton(ServiceA, service_b=service_b)  # Depends on service_b
    service_b = providers.Singleton(ServiceB, service_a=service_a)  # Depends on service_a
```

#### Global State in Providers

```python
# Bad: Global state in provider
global_config = None

def bad_factory():
    global global_config
    if global_config is None:
        global_config = load_config()
    return create_service(global_config)

bad_service = providers.Factory(bad_factory)
```

#### Global Singletons (Anti-Pattern)

```python
# ❌ BAD: Global singleton (removed from codebase)
# backend/src/core/bus.py
message_bus = EventBus()  # Global singleton - removed!

# ✅ GOOD: Inject via container
class CoreContainer(containers.DeclarativeContainer):
    event_bus = providers.Singleton(EventBus)  # Singleton via DI

# Usage
class MyService:
    def __init__(self, event_bus: EventBus):  # ✅ Injected
        self.event_bus = event_bus
```

#### Tight Coupling

```python
# Bad: Tight coupling to implementation details
class TightlyCoupledService:
    def __init__(self, config_path: str):  # Takes path instead of config object
        self.config = load_config_from_path(config_path)  # Loads config internally
```

This comprehensive dependency injection documentation provides the foundation for understanding, using, and extending the container system in the Personal Assistant Backend.
