"""
Binary File Reader.

Provides utilities for reading binary files (images, PDFs) with base64 encoding.
"""
import base64
from pathlib import Path
from typing import Optional, Union

from backend.src.core.utils.file_type import FileType, detect_file_type
from backend.src.core.utils.mime_types import get_specific_mime_type

# Maximum file size to read (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024


class BinaryReader:
    """
    Reads binary files (images, PDFs) and encodes them as base64.
    """

    def __init__(self, max_file_size: int = MAX_FILE_SIZE):
        """
        Initialize the binary reader.

        Args:
            max_file_size: Maximum file size to read in bytes
        """
        self.max_file_size = max_file_size

    def read_as_base64(
        self, file_path: Union[str, Path], file_type: Optional[FileType] = None
    ) -> Optional[str]:
        """
        Read a binary file and return as base64-encoded data URL.

        Args:
            file_path: Path to the file
            file_type: Optional file type (detected if not provided)

        Returns:
            Base64-encoded data URL string, or None if file type not supported

        Raises:
            OSError: If the file cannot be read or exceeds max_file_size
        """
        path = Path(file_path)

        # Detect file type if not provided
        if file_type is None:
            file_type = detect_file_type(file_path)

        # Only handle images and PDFs
        if file_type not in [FileType.IMAGE, FileType.PDF]:
            return None

        # Check file size
        if path.stat().st_size > self.max_file_size:
            raise OSError(
                f"File too large to process: {path.stat().st_size} bytes "
                f"(max: {self.max_file_size})"
            )

        # Read binary data
        with open(path, "rb") as f:
            data = f.read()

        # Get MIME type
        mime_type = get_specific_mime_type(file_path)

        # Encode as base64
        encoded = base64.b64encode(data).decode("ascii")

        # Return as data URL
        return f"data:{mime_type};base64,{encoded}"


# Global reader instance
_reader: BinaryReader = None


def get_binary_reader() -> BinaryReader:
    """Get the global binary reader instance."""
    global _reader
    if _reader is None:
        _reader = BinaryReader()
    return _reader
