"""
File Metadata Utilities.

Provides utilities for retrieving file metadata like size and modification time.
"""
from pathlib import Path
from typing import Union


class FileMetadata:
    """
    Provides file metadata operations.
    """

    def get_file_size(self, file_path: Union[str, Path]) -> int:
        """
        Get the size of a file in bytes.

        Args:
            file_path: Path to the file

        Returns:
            File size in bytes

        Raises:
            OSError: If the file cannot be accessed
        """
        return Path(file_path).stat().st_size

    def get_file_modification_time(self, file_path: Union[str, Path]) -> float:
        """
        Get the modification time of a file.

        Args:
            file_path: Path to the file

        Returns:
            Modification time as a Unix timestamp

        Raises:
            OSError: If the file cannot be accessed
        """
        return Path(file_path).stat().st_mtime


# Global metadata instance
_metadata: FileMetadata = None


def get_file_metadata() -> FileMetadata:
    """Get the global file metadata instance."""
    global _metadata
    if _metadata is None:
        _metadata = FileMetadata()
    return _metadata


# Backward compatibility functions
def get_file_size(file_path: Union[str, Path]) -> int:
    """
    Get the size of a file in bytes (backward compatibility).

    Args:
        file_path: Path to the file

    Returns:
        File size in bytes
    """
    metadata = get_file_metadata()
    return metadata.get_file_size(file_path)


def get_file_modification_time(file_path: Union[str, Path]) -> float:
    """
    Get the modification time of a file (backward compatibility).

    Args:
        file_path: Path to the file

    Returns:
        Modification time as a Unix timestamp
    """
    metadata = get_file_metadata()
    return metadata.get_file_modification_time(file_path)
