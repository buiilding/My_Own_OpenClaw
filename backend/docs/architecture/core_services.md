# Core Services

This document provides comprehensive documentation for the core infrastructure services that support the Personal Assistant Backend, including file services, TTS services, workspace management, and agent factory services.

## Overview

The core services layer provides essential infrastructure components that support the Personal Assistant system. These services focus on workspace management, file operations, and context creation for tool execution. The service layer is designed to be lightweight and focused on core functionality rather than complex business logic.

## Service Architecture

### Service Container (`backend/src/core/services/service_container.py`)

The service container provides lazy-initialized access to core infrastructure services. It focuses on workspace management, file operations, and storage services.

```python
class ServiceContainer(IServiceContainer):
    """Service container that provides access to various application services.

    This is the unified service layer.
    All services are lazily initialized and cached for the lifetime of the container.
    """

    def __init__(self, config: AppConfig):
        self.config = config
        self._workspace_service: Optional[IWorkspaceService] = None
        self._file_service: Optional[IFileService] = None
        self._storage_service: Optional[IStorageService] = None

    def get_workspace_context(self) -> IWorkspaceService:
        """Get workspace context service (lazily initialized)."""

    def get_file_service(self) -> IFileService:
        """Get file service (lazily initialized)."""

    def get_storage_service(self) -> IStorageService:
        """Get storage service (lazily initialized)."""

    def get_file_filtering_options(self) -> Dict[str, Any]:
        """Get file filtering options."""

    def get_allowed_tools(self) -> List[str]:
        """Get the list of allowed shell commands."""

    def get_shell_timeout(self) -> float:
        """Get the shell command timeout in seconds."""
```

## Service Interfaces

The core services define clean interfaces through Protocol classes that ensure consistent service contracts throughout the system.

### IWorkspaceService

Defines the contract for workspace management operations:

```python
class IWorkspaceService(Protocol):
    workspace_path: str

    def is_path_within_workspace(self, path: str) -> bool:
        """Check if a path is within the workspace."""
```

### IFileService

Defines the contract for file operations with filtering:

```python
class IFileService(Protocol):
    def should_ignore_file(
        self, file_path: str, filtering_options: Dict[str, Any]
    ) -> bool:
        """Check if a file should be ignored based on filtering options."""

    def filter_files_with_report(
        self, relative_paths: List[str], filtering_options: Dict[str, Any]
    ) -> tuple[List[str], int]:
        """Filter files and return report with count."""
```

### IStorageService

Defines the contract for storage operations:

```python
class IStorageService(Protocol):
    def get_project_temp_dir(self) -> Optional[str]:
        """Get the project temp directory."""
```

## Service Implementations

### WorkspaceService (`backend/src/core/services/workspace_service.py`)

Provides workspace path validation and management with flexible access control:

```python
class WorkspaceService(IWorkspaceService):
    """Service for workspace operations."""

    def __init__(self, workspace_path: Optional[str] = None):
        """Initialize with optional workspace path (defaults to current directory)."""

    def is_path_within_workspace(self, path: str) -> bool:
        """Check if a path is within the workspace.

        Currently allows global file system access for flexibility.
        In restrictive environments, this could be configured to enforce workspace boundaries.
        """
```

### FileService (`backend/src/core/services/file_service.py`)

Handles file filtering and path validation for secure file operations:

```python
class FileService(IFileService):
    """Service for file operations with filtering capabilities."""

    def should_ignore_file(self, file_path: str, filtering_options: Dict[str, Any]) -> bool:
        """Check if a file should be ignored based on filtering options."""

    def filter_files_with_report(self, relative_paths: List[str], filtering_options: Dict[str, Any]) -> tuple[List[str], int]:
        """Filter files and return filtered list with count of ignored files."""
```

### StorageService (`backend/src/core/services/storage_service.py`)

Manages temporary directories and storage operations:

```python
class StorageService(IStorageService):
    """Service for storage operations and temporary file management."""

    def get_project_temp_dir(self) -> Optional[str]:
        """Get the project-specific temporary directory."""
```

### TTS Service (`backend/src/core/services/tts_service.py`)

Provides text-to-speech functionality with streaming support:

```python
class TTSService:
    """Text-to-speech service with streaming capabilities."""

    async def generate_audio_stream(self, text: str) -> AsyncGenerator[bytes, None]:
        """Generate streaming audio from text."""

    async def get_supported_voices(self) -> List[Dict[str, Any]]:
        """Get list of available voices."""

    async def set_voice(self, voice_id: str) -> bool:
        """Set the current voice for speech synthesis."""
```

### AgentFactory (`backend/src/core/services/agent_factory.py`)

Creates and configures agent sessions with all dependencies:

```python
class AgentFactory:
    """Factory for creating agent sessions with proper dependency injection."""

    def create_session(self, user_id: str, session_id: Optional[str] = None) -> AgentSession:
        """Create a new agent session with all required dependencies."""
```

### ContextFactory (`backend/src/core/services/context_factory.py`)

Creates execution contexts for tool operations:

```python
class ContextFactory:
    """Factory for creating execution contexts for tools."""

    def create_context(self, tool_name: str, **kwargs) -> ToolContext:
        """Create execution context for a specific tool."""
```

## Service Integration

### Dependency Injection Integration

Services are integrated through the main `Container` class which provides access to all system components:

```python
# Container setup
container = Container()
await container.initialize()

# Access to services through container properties
config = container.config
tool_registry = container.tool_registry
memory_store = container.memory_store
llm_client = container._di_container.llm_client()
```

### Service Container Usage

The `ServiceContainer` provides basic configuration and settings, while the main `Container` provides access to fully initialized services:

```python
# Access through main container
workspace_service = container.service_container.get_workspace_context()
file_service = container.service_container.get_file_service()
storage_service = container.service_container.get_storage_service()

# Get configuration values
allowed_commands = container.service_container.get_allowed_tools()
shell_timeout = container.service_container.get_shell_timeout()
filtering_options = container.service_container.get_file_filtering_options()
```

### Advanced Service Access

Services are also available through the dependency injection container:

```python
# Direct access to fully configured services
agent_session = container.create_agent_session("user123")
llm_client = container._di_container.llm_client()
tool_registry = container.tool_registry
memory_store = container.memory_store
embedder = container.embedder
```

### Service Lifecycle

The service system follows a comprehensive lifecycle managed by the dependency injection framework:

1. **Interface Definition**: Protocol interfaces define service contracts for type safety
2. **Container Composition**: Services are organized in domain-specific containers (Core, Tool, Memory)
3. **Bootstrap Initialization**: Services are initialized during application startup in phases
4. **Lazy Initialization**: Heavy services are created on first access to optimize startup time
5. **Dependency Injection**: Services are automatically wired together through container composition
6. **Configuration Updates**: Services can be reconfigured at runtime through config changes
7. **Graceful Shutdown**: Services are properly cleaned up during application shutdown

### Initialization Phases

Services are initialized in coordinated phases during bootstrap:

```python
# Phase 1: Configuration - Load and validate app config
# Phase 2: Container - Initialize DI containers with proper wiring
# Phase 3: Services - Create core services (SessionManager, Handlers)
# Phase 4: Plugins - Initialize plugin system and register plugins
```

### Runtime Reconfiguration

Services support runtime reconfiguration through the config subscription system:

```python
# Services automatically update when config changes
config_service.subscribe(session_manager)
config_service.subscribe(memory_manager)
# Services receive config updates and re-initialize as needed
```

### Error Handling

Service operations include proper error handling:

```python
try:
    result = await container.tool_registry.get_tool("tool_name")
    if result is None:
        logger.warning("Tool not found")
except Exception as e:
    logger.error(f"Service operation failed: {e}")
```

## Configuration

### Service-Related Configuration

The service container uses configuration from the main `AppConfig`:

```python
# Configuration values used by services
config.allowed_shell_commands  # Shell command restrictions
config.shell_timeout          # Shell execution timeout
# File filtering options provided by service container
```

## Testing

Services are tested through the dependency injection system:

```python
# Test service container
async def test_service_container():
    config = AppConfig()
    service_container = ServiceContainer(config)

    # Test configuration access
    allowed_tools = service_container.get_allowed_tools()
    assert isinstance(allowed_tools, list)

    timeout = service_container.get_shell_timeout()
    assert isinstance(timeout, float)
```

## Performance Considerations

### Lazy Initialization

Services use lazy initialization to optimize startup performance:

- Core services are created only when first accessed through container properties
- Tool services are loaded on-demand from filesystem and marketplace
- Memory services initialize embeddings and storage connections lazily
- Reduces initial application startup time from ~2-3 seconds to ~1 second

### Multi-Level Caching

The system implements comprehensive caching strategies:

- **Tool Schemas**: JSON schemas cached via SchemaRegistry with automatic invalidation
- **Embeddings**: Text vectorization cached to avoid recomputation for identical content
- **Configuration**: Runtime config cached with subscription-based updates
- **LLM Responses**: Provider connection pooling through LiteLLM

### Resource Management

Services provide centralized resource controls:

```python
# Configurable timeouts and limits
shell_timeout = container.service_container.get_shell_timeout()  # 30.0 seconds
allowed_commands = container.service_container.get_allowed_tools()  # Restricted command set

# Memory limits with conversation truncation
max_history_length = config.max_history_length  # Prevents unbounded memory growth

# Connection pooling for external services
# LiteLLM handles provider connection pooling automatically
```

### Concurrent Execution

Services support concurrent operations:

- Tool execution can run in parallel batches (configurable max concurrency)
- Memory operations are thread-safe with async locks
- WebSocket connections support multiple simultaneous users
- Background tasks run independently (memory summarization, etc.)

### Monitoring and Metrics

Services include built-in monitoring capabilities:

- Execution time tracking for tool operations
- Error rate monitoring and logging
- Resource usage statistics
- Health check endpoints for service availability

This updated core services documentation accurately reflects the current implementation with proper service classes, lazy initialization, multi-level caching, and comprehensive resource management.

This core services documentation provides the foundation for understanding how the Personal Assistant Backend's infrastructure components work together to support the agent system.
