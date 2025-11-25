"""
File Service Implementation.

Provides file filtering and ignore pattern management.
"""
from pathlib import Path
from typing import Dict, Any, List

from backend.src.core.services.interfaces import IFileService


class FileService(IFileService):
    """Service for file operations."""

    def should_ignore_file(
        self, file_path: str, filtering_options: Dict[str, Any]
    ) -> bool:
        """
        Check if a file should be ignored based on filtering options.
        
        Args:
            file_path: Path to the file
            filtering_options: Dict with filtering options like 'respect_git_ignore', 'respect_gemini_ignore'
            
        Returns:
            True if file should be ignored
        """
        # For now, just check if it's a common ignore pattern
        path_obj = Path(file_path)
        ignore_patterns = [".git", "__pycache__", "node_modules", ".DS_Store"]

        for pattern in ignore_patterns:
            if pattern in str(path_obj):
                return True

        return False

    def filter_files_with_report(
        self, relative_paths: List[str], filtering_options: Dict[str, Any]
    ) -> tuple[List[str], int]:
        """
        Filter files based on filtering options and return report.

        Args:
            relative_paths: List of relative file paths to filter
            filtering_options: Dict with filtering options like 'respect_git_ignore', 'respect_gemini_ignore'

        Returns:
            Tuple of (filtered_paths, ignored_count)
        """
        filtered_paths = []
        ignored_count = 0

        for path in relative_paths:
            if self.should_ignore_file(path, filtering_options):
                ignored_count += 1
            else:
                filtered_paths.append(path)

        return filtered_paths, ignored_count

