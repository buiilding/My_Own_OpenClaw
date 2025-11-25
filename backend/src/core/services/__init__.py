"""
Core Services Package.

This package provides core services for the application, including:
- ContextFactory: Creates execution contexts for tools
- ServiceContainer: Unified service access layer
- Service implementations: WorkspaceService, FileService, StorageService
"""
from backend.src.core.services.context_factory import ContextFactory
from backend.src.core.services.service_container import ServiceContainer, AppServices
from backend.src.core.services.workspace_service import WorkspaceService
from backend.src.core.services.file_service import FileService
from backend.src.core.services.storage_service import StorageService

__all__ = [
    "ContextFactory",
    "ServiceContainer",
    "AppServices",  # Backward compatibility alias
    "WorkspaceService",
    "FileService",
    "StorageService",
]

