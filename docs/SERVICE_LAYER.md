# Service Layer Architecture

## Overview

The service layer provides a unified, dependency-injected interface for accessing application services. This replaces the previous `AppServices` class and provides better separation of concerns, testability, and extensibility.

## Structure

```
backend/src/core/services/
├── __init__.py              # Package exports
├── interfaces.py            # Protocol definitions
├── service_container.py     # Main ServiceContainer class
├── workspace_service.py    # Workspace management
├── file_service.py         # File operations
├── storage_service.py      # Storage operations
└── context_factory.py      # Context creation (existing)
```

## Service Container

The `ServiceContainer` is the main entry point for accessing services:

```python
from backend.src.core.services import ServiceContainer
from backend.src.core.config import get_config_manager

config = get_config_manager().load_config()
services = ServiceContainer(config)

# Access services
workspace = services.get_workspace_context()
file_service = services.get_file_service()
storage = services.get_storage_service()
```

## Services

### WorkspaceService

Manages workspace paths and validation:

```python
workspace = services.get_workspace_context()
is_valid = workspace.is_path_within_workspace("/path/to/file")
```

### FileService

Handles file filtering and ignore patterns:

```python
file_service = services.get_file_service()
filtered, ignored_count = file_service.filter_files_with_report(
    paths, filtering_options
)
```

### StorageService

Manages temporary directories and storage:

```python
storage = services.get_storage_service()
temp_dir = storage.get_project_temp_dir()
```

## Dependency Injection

Services are registered in the DI container:

```python
# In ApplicationContainer
service_container = providers.Singleton(
    lambda cfg: ServiceContainer(cfg),
    cfg=config,
)
```

Access via container:

```python
container = Container()
services = container.service_container
```

## Protocol Interfaces

All services implement Protocol interfaces defined in `interfaces.py`:

- `IWorkspaceService`
- `IFileService`
- `IStorageService`
- `IServiceContainer`

This enables:
- Type checking
- Easy mocking in tests
- Clear service contracts

## Migration from AppServices

Old code:
```python
from backend.src.core.config import AppServices

services = AppServices(config)
workspace = services.get_workspace_context()
```

New code:
```python
from backend.src.core.services import ServiceContainer

services = ServiceContainer(config)
workspace = services.get_workspace_context()
```

The API is identical - only the import changes.

## Backward Compatibility

`AppServices` is still available as an alias to `ServiceContainer` for backward compatibility:

```python
from backend.src.core.services import AppServices  # Still works
```

However, new code should use `ServiceContainer`.

## Testing

Services can be easily mocked using Protocol interfaces:

```python
from backend.src.core.services.interfaces import IFileService

class MockFileService(IFileService):
    def should_ignore_file(self, path, options):
        return False
    
    def filter_files_with_report(self, paths, options):
        return paths, 0
```

## Future Enhancements

- Service lifecycle management
- Service health checks
- Service metrics and monitoring
- Service discovery for plugins

