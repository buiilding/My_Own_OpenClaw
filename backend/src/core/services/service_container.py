"""
Service Container Implementation.

Provides unified access to all application services with dependency injection support.
"""
from typing import Dict, Any, List, Optional

from backend.src.core.config import AppConfig
from backend.src.core.services.interfaces import (
    IServiceContainer,
    IWorkspaceService,
    IFileService,
    IStorageService,
)
from backend.src.core.services.workspace_service import WorkspaceService
from backend.src.core.services.file_service import FileService
from backend.src.core.services.storage_service import StorageService


class ServiceContainer(IServiceContainer):
    """
    Service container that provides access to various application services.
    
    This is the unified service layer.
    All services are lazily initialized and cached for the lifetime of the container.
    """

    def __init__(self, config: AppConfig):
        """
        Initialize the service container.
        
        Args:
            config: Application configuration
        """
        self.config = config
        self._workspace_service: Optional[IWorkspaceService] = None
        self._file_service: Optional[IFileService] = None
        self._storage_service: Optional[IStorageService] = None

    def get_workspace_context(self) -> IWorkspaceService:
        """
        Get workspace context service.
        
        Returns:
            WorkspaceService instance (lazily initialized)
        """
        if self._workspace_service is None:
            self._workspace_service = WorkspaceService()
        return self._workspace_service

    def get_file_service(self) -> IFileService:
        """
        Get file service.
        
        Returns:
            FileService instance (lazily initialized)
        """
        if self._file_service is None:
            self._file_service = FileService()
        return self._file_service

    def get_storage_service(self) -> IStorageService:
        """
        Get storage service.
        
        Returns:
            StorageService instance (lazily initialized)
        """
        if self._storage_service is None:
            self._storage_service = StorageService()
        return self._storage_service

    def get_file_filtering_options(self) -> Dict[str, Any]:
        """
        Get file filtering options.
        
        Returns:
            Dict with filtering options
        """
        return {
            "respect_git_ignore": True,
            "respect_gemini_ignore": True,
        }

    def get_allowed_tools(self) -> List[str]:
        """
        Get the list of allowed shell commands.
        
        Returns:
            List of allowed command names
        """
        return self.config.allowed_shell_commands

    def get_shell_timeout(self) -> float:
        """
        Get the shell command timeout in seconds.
        
        Returns:
            Timeout in seconds (default: 30.0)
        """
        return 30.0  # Default timeout for shell commands
