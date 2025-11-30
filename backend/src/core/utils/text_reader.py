"""
Text File Reader.

Provides utilities for reading text files with encoding detection.
"""
from pathlib import Path
from typing import Tuple, Union

from backend.src.core.utils.file_extensions import DEFAULT_ENCODING, FALLBACK_ENCODINGS

# Maximum file size to read (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024


class TextReader:
    """
    Reads text files with automatic encoding detection.
    """

    def __init__(self, max_file_size: int = MAX_FILE_SIZE):
        """
        Initialize the text reader.

        Args:
            max_file_size: Maximum file size to read in bytes
        """
        self.max_file_size = max_file_size

    def read_with_encoding(
        self, file_path: Union[str, Path], encoding: str = DEFAULT_ENCODING
    ) -> Tuple[str, str]:
        """
        Read a text file with the specified encoding.

        Args:
            file_path: Path to the file
            encoding: Encoding to use

        Returns:
            Tuple of (content, encoding_used)

        Raises:
            UnicodeDecodeError: If the file cannot be decoded with the given encoding
            OSError: If the file cannot be read or exceeds max_file_size
        """
        path = Path(file_path)

        # Check file size
        if path.stat().st_size > self.max_file_size:
            raise OSError(
                f"File too large: {path.stat().st_size} bytes "
                f"(max: {self.max_file_size})"
            )

        with open(path, "r", encoding=encoding) as f:
            content = f.read()

        return content, encoding

    def read_auto_encoding(self, file_path: Union[str, Path]) -> Tuple[str, str]:
        """
        Read a text file, automatically trying different encodings.

        Args:
            file_path: Path to the file

        Returns:
            Tuple of (content, encoding_used)

        Raises:
            UnicodeDecodeError: If the file cannot be decoded with any known encoding
            OSError: If the file cannot be read or exceeds max_file_size
        """
        for encoding in FALLBACK_ENCODINGS:
            try:
                return self.read_with_encoding(file_path, encoding)
            except UnicodeDecodeError:
                continue

        # If all encodings fail, try one more time with errors='replace'
        path = Path(file_path)
        if path.stat().st_size > self.max_file_size:
            raise OSError(
                f"File too large: {path.stat().st_size} bytes "
                f"(max: {self.max_file_size})"
            )

        with open(path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()

        return content, "utf-8"


# Global reader instance
_reader: TextReader = None


def get_text_reader() -> TextReader:
    """Get the global text reader instance."""
    global _reader
    if _reader is None:
        _reader = TextReader()
    return _reader


# Backward compatibility functions
def read_text_file_with_encoding(
    file_path: Union[str, Path], encoding: str = DEFAULT_ENCODING
) -> Tuple[str, str]:
    """
    Read a text file with the specified encoding (backward compatibility).

    Args:
        file_path: Path to the file
        encoding: Encoding to use

    Returns:
        Tuple of (content, encoding_used)
    """
    reader = get_text_reader()
    return reader.read_with_encoding(file_path, encoding)


def read_text_file_auto_encoding(file_path: Union[str, Path]) -> Tuple[str, str]:
    """
    Read a text file with automatic encoding detection (backward compatibility).

    Args:
        file_path: Path to the file

    Returns:
        Tuple of (content, encoding_used)
    """
    reader = get_text_reader()
    return reader.read_auto_encoding(file_path)
