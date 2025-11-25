"""
Service Interface Protocols.

This module defines Protocol interfaces for all services in the system.
These protocols enable type checking and ensure consistent service contracts.
"""
from typing import Protocol, Dict, Any, List, Optional
from pathlib import Path


class IWorkspaceService(Protocol):
    """Protocol for workspace management service."""
    
    workspace_path: str
    
    def is_path_within_workspace(self, path: str) -> bool:
        """Check if a path is within the workspace."""
        ...


class IFileService(Protocol):
    """Protocol for file operations service."""
    
    def should_ignore_file(
        self, file_path: str, filtering_options: Dict[str, Any]
    ) -> bool:
        """Check if a file should be ignored based on filtering options."""
        ...
    
    def filter_files_with_report(
        self, relative_paths: List[str], filtering_options: Dict[str, Any]
    ) -> tuple[List[str], int]:
        """Filter files and return report."""
        ...


class IStorageService(Protocol):
    """Protocol for storage operations service."""
    
    def get_project_temp_dir(self) -> Optional[str]:
        """Get the project temp directory."""
        ...


class IServiceContainer(Protocol):
    """Protocol for service container."""
    
    def get_workspace_context(self) -> IWorkspaceService:
        """Get workspace context service."""
        ...
    
    def get_file_service(self) -> IFileService:
        """Get file service."""
        ...
    
    def get_storage_service(self) -> IStorageService:
        """Get storage service."""
        ...
    
    def get_file_filtering_options(self) -> Dict[str, Any]:
        """Get file filtering options."""
        ...
    
    def get_allowed_tools(self) -> List[str]:
        """Get list of allowed shell commands."""
        ...
    
    def get_shell_timeout(self) -> float:
        """Get shell command timeout in seconds."""
        ...

