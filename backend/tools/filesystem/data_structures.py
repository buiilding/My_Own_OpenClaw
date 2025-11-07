"""
Data structures for filesystem tools.

This module contains common data classes used by filesystem tools.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class FileEntry:
    """File entry returned by list_directory tool."""

    name: str
    path: str
    is_directory: bool
    size: int
    modified_time: float

    @classmethod
    def from_path(cls, path: Path) -> "FileEntry":
        """Create a FileEntry from a Path object."""
        try:
            stat_info = path.stat()
            is_dir = path.is_dir()
            return cls(
                name=path.name,
                path=str(path),
                is_directory=is_dir,
                size=0 if is_dir else stat_info.st_size,
                modified_time=stat_info.st_mtime,
            )
        except OSError:
            # If we can't stat the file, create a basic entry
            # Try to determine if it's a directory, but fall back to False if we can't
            try:
                is_dir = path.is_dir()
            except OSError:
                is_dir = False
            return cls(
                name=path.name,
                path=str(path),
                is_directory=is_dir,
                size=0,
                modified_time=0,
            )


@dataclass
class GlobEntry:
    """Entry returned by glob tool."""

    path: str
    size: int
    modified_time: float

    @classmethod
    def from_path(cls, path: Path) -> "GlobEntry":
        """Create a GlobEntry from a Path object."""
        try:
            stat_info = path.stat()
            return cls(
                path=str(path), size=stat_info.st_size, modified_time=stat_info.st_mtime
            )
        except OSError:
            return cls(path=str(path), size=0, modified_time=0)


@dataclass
class GrepMatch:
    """Match result from search_file_content tool."""

    file_path: str
    line_number: int
    line: str


@dataclass
class ProcessedFileResult:
    """Result of processing a single file."""

    success: bool
    file_path: str
    relative_path: str
    content: Optional[str] = None
    error: Optional[str] = None
