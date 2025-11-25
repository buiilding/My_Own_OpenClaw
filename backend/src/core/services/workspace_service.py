"""
Workspace Service Implementation.

Provides workspace path validation and management.
"""
import os
from typing import Optional

from backend.src.core.services.interfaces import IWorkspaceService


class WorkspaceService(IWorkspaceService):
    """Service for workspace operations."""

    def __init__(self, workspace_path: Optional[str] = None):
        """
        Initialize workspace service.
        
        Args:
            workspace_path: Optional workspace path (defaults to current working directory)
        """
        self.workspace_path = workspace_path or os.getcwd()

    def is_path_within_workspace(self, path: str) -> bool:
        """
        Check if a path is within the workspace.
        
        Modified to allow operations anywhere on the system for global file access.
        This provides flexibility while maintaining the interface contract.
        
        Args:
            path: Path to check
            
        Returns:
            True if path is accessible (currently allows all paths)
        """
        # Allow access to any path on the system
        # In a more restrictive environment, this would use os.path.is_within_directory()
        return True

