"""
Storage Service Implementation.

Provides temporary directory and storage management.
"""
import os
from typing import Optional

from backend.src.core.services.interfaces import IStorageService


class StorageService(IStorageService):
    """Service for storage operations."""

    def __init__(self, temp_dir: Optional[str] = None):
        """
        Initialize storage service.
        
        Args:
            temp_dir: Optional temp directory path (defaults to project temp directory)
        """
        self.temp_dir = temp_dir or os.path.join(os.getcwd(), "temp")

    def get_project_temp_dir(self) -> Optional[str]:
        """
        Get the project temp directory.
        
        Returns:
            Path to temp directory
        """
        return self.temp_dir

