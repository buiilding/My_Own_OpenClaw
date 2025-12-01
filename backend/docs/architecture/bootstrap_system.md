# Bootstrap and Initialization System

This document provides documentation for the bootstrap and initialization system that manages the startup and configuration of the Personal Assistant Backend.

## Overview

The bootstrap system orchestrates application startup through a coordinated initialization process. It ensures components are initialized in the correct dependency order and manages the overall application lifecycle.

## Core Components

### Bootstrap (`backend/src/core/bootstrap/__init__.py`)

The main bootstrap facade that coordinates application startup.

```python
class Bootstrap:
    """Handles application startup and initialization."""

    def __init__(self):
        """Initialize the bootstrap."""
        self.coordinator = InitializationCoordinator()

    async def startup(self, app: FastAPI) -> Tuple[Any, Any, Any]:
        """Initialize all application components."""
        logger.info("Starting application bootstrap...")
        return await self.coordinator.initialize(app)
```

### InitializationCoordinator (`backend/src/core/bootstrap/coordinator.py`)

Coordinates the initialization phases of the application startup process.

```python
class InitializationCoordinator:
    """Coordinates application initialization phases."""

    async def initialize(
        self, app: FastAPI, config_manager: ConfigManager = None
    ) -> Tuple[Container, SessionManager, Any]:
        """
        Initialize all application components in phases.
        Returns (container, session_manager, plugin_registry)
        """
        # Phase 1: Configuration
        await self._initialize_configuration(config_manager)

        # Phase 2: Container
        await self._initialize_container()

        # Phase 3: Services (SessionManager, Handlers)
        await self._initialize_services()

        # Phase 4: Plugins
        plugin_registry = await self._initialize_plugins()

        return self.container, self.session_manager, plugin_registry
```

### HandlerInitializer (`backend/src/core/bootstrap/handler_initializer.py`)

Initializes WebSocket message handlers with the session manager.

```python
class HandlerInitializer:
    """Initializes WebSocket message handlers."""

    async def initialize(self, session_manager: SessionManager) -> None:
        """Initialize and register all WebSocket message handlers.

        Args:
            session_manager: SessionManager instance for handlers that need session management
        """
        # Register all message handlers (query, ping, settings, etc.)
        initialize_handlers(session_manager)
        logger.info("WebSocket message handlers initialized.")
```

**Key Handlers Registered:**
- QueryMessageHandler: Processes user queries and streams responses
- PingMessageHandler: Health check and connection verification
- SettingsMessageHandler: Configuration management
- TTSManager: Text-to-speech integration

### PluginInitializer (`backend/src/core/bootstrap/plugin_initializer.py`)

Initializes the plugin system with comprehensive discovery and registration.

```python
class PluginInitializer:
    """Initializes the plugin system."""

    async def initialize(self, container: Container) -> PluginRegistry:
        """Initialize the plugin registry and discover/register plugins.

        Args:
            container: Application container for dependency injection

        Returns:
            Initialized PluginRegistry instance
        """
        # Define plugin directories to scan
        builtin_plugins_dir = Path(__file__).parent.parent.parent / "agent" / "plugins"
        external_plugins_dir = project_root / "plugins"

        # Create plugin registry with container injection
        plugin_registry = PluginRegistry()
        plugin_registry.set_container(container)

        # Create discovery service with multiple discoverers
        discovery_service = PluginDiscoveryService(...)
        discovery_service.register_discoverer(EntryPointPluginDiscoverer())
        discovery_service.register_discoverer(FilesystemPluginDiscoverer(...))

        # Discover, register, and initialize plugins
        await discovery_service.discover_and_register(auto_enable=True)
        await plugin_registry.initialize_all_plugins()

        return plugin_registry
```

**Plugin Discovery Strategy:**
1. **Entry Point Discovery**: Finds plugins registered via setuptools entry points
2. **Filesystem Discovery**: Scans plugin directories for Python modules
3. **Auto-Enable**: Automatically enables discovered plugins
4. **Lifecycle Management**: Initializes all enabled plugins with proper dependency injection

## Bootstrap Phases

### Phase 1: Configuration

Initialize configuration management and validation.

```python
async def _initialize_configuration(
    self, config_manager: ConfigManager = None
) -> None:
    """Phase 1: Initialize configuration."""
    self.config_manager = config_manager or get_config_manager()
    self.config_service = initialize_config_service(self.config_manager)
```

### Phase 2: Container

Initialize the dependency injection container.

```python
async def _initialize_container(self) -> None:
    """Phase 2: Initialize container."""
    self.container = Container()
    await self.container.initialize()
    set_container(self.container)
```

### Phase 3: Services

Initialize core services including SessionManager and message handlers.

```python
async def _initialize_services(self) -> None:
    """Phase 3: Initialize services (SessionManager, Handlers)."""
    self.session_manager = SessionManager(self.container)
    self.container._session_manager = self.session_manager

    # Subscribe SessionManager to config changes
    self.config_service.subscribe(self.session_manager)

    # Initialize handlers
    self.handler_initializer = HandlerInitializer()
    await self.handler_initializer.initialize(self.session_manager)
```

### Phase 4: Plugins

Initialize the comprehensive plugin system with discovery and lifecycle management.

```python
async def _initialize_plugins(self) -> PluginRegistry:
    """Phase 4: Initialize plugins with full discovery and registration."""
    self.plugin_initializer = PluginInitializer()
    plugin_registry = await self.plugin_initializer.initialize(self.container)

    # Store plugin_registry in container for AgentSession creation
    self.container.plugin_registry = plugin_registry

    # Plugin registry is now available for agent session creation
    logger.info(f"Plugin system initialized with {len(plugin_registry.get_enabled_plugins())} plugins")
    return plugin_registry
```

**Plugin System Features:**
- Multiple discovery mechanisms (entry points, filesystem)
- Automatic plugin registration and configuration
- Lifecycle management (initialize/shutdown)
- Dependency injection integration
- State persistence and configuration management

## Configuration Management

### Configuration Initialization

The bootstrap system initializes configuration through the ConfigManager and ConfigService.

```python
async def _initialize_configuration(
    self, config_manager: ConfigManager = None
) -> None:
    """Phase 1: Initialize configuration."""
    self.config_manager = config_manager or get_config_manager()
    self.config_service = initialize_config_service(self.config_manager)
```

## Dependency Injection Container

### Container Initialization

The bootstrap system initializes the dependency injection container:

```python
async def _initialize_container(self) -> None:
    """Phase 2: Initialize container."""
    self.container = Container()
    await self.container.initialize()
    set_container(self.container)
```

The Container class provides access to all system components through domain-specific containers (CoreContainer, ToolContainer, MemoryContainer) and manages their initialization order.

## Error Handling

### Initialization Error Handling

The bootstrap system includes error handling for initialization failures:

```python
async def initialize(
    self, app: FastAPI, config_manager: ConfigManager = None
) -> Tuple[Container, SessionManager, Any]:
    """Initialize with error handling."""
    try:
        # Phase 1: Configuration
        await self._initialize_configuration(config_manager)

        # Phase 2: Container
        await self._initialize_container()

        # Phase 3: Services
        await self._initialize_services()

        # Phase 4: Plugins
        plugin_registry = await self._initialize_plugins()

        return self.container, self.session_manager, plugin_registry

    except Exception as e:
        logger.error(f"Application initialization failed: {e}", exc_info=True)
        raise
```

## Usage

## Bootstrap Integration

The bootstrap system integrates seamlessly with FastAPI's lifespan management:

```python
# main.py - Application Entry Point
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup Phase - Bootstrap initialization
    bootstrap = Bootstrap()
    container, session_manager, plugin_registry = await bootstrap.startup(app)

    # Start background tasks after successful initialization
    summarization_task = asyncio.create_task(
        session_manager.run_summarization_periodically()
    )

    # Application is now ready to accept requests
    yield

    # Shutdown Phase - Graceful cleanup
    shutdown = Shutdown()
    await shutdown.shutdown(plugin_registry, summarization_task)

# FastAPI Application Configuration
app = FastAPI(
    title="Personal Assistant Backend",
    lifespan=lifespan,
    # ... other config
)

# CORS and Routes configured after app creation
app.add_middleware(CORSMiddleware, ...)
app.include_router(websocket.router)
```

## Bootstrap Sequence Summary

The complete bootstrap sequence ensures proper initialization order:

1. **Configuration Loading** → Validate and load all app settings
2. **Container Setup** → Wire all dependencies through DI system
3. **Core Services** → Initialize SessionManager, message handlers, config subscriptions
4. **Plugin Discovery** → Find, register, and initialize all plugins
5. **Background Tasks** → Start periodic tasks (memory summarization, etc.)
6. **Ready State** → Application accepts WebSocket connections and API requests

## Error Handling and Recovery

The bootstrap system includes comprehensive error handling:

```python
try:
    container, session_manager, plugin_registry = await bootstrap.startup(app)
    # Success - proceed with normal operation
except Exception as e:
    logger.error(f"Bootstrap failed: {e}", exc_info=True)
    # Application will not start - critical failure
    raise
```

**Failure Scenarios Handled:**
- Configuration validation errors
- Dependency injection wiring failures
- Plugin discovery or initialization errors
- Database connection failures
- External service availability issues

The bootstrap process ensures the application only starts when all critical components are properly initialized and ready for operation.
