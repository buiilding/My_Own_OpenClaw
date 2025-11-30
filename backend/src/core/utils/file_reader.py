"""
File reading utilities.

Provides utilities for reading files with encoding detection and content extraction.
Facade that delegates to specialized readers (TextReader, BinaryReader).
"""
from pathlib import Path
from typing import Optional, Tuple, Union

from backend.src.core.utils.binary_reader import get_binary_reader
from backend.src.core.utils.file_metadata import (
    get_file_modification_time,
    get_file_size,
)
from backend.src.core.utils.file_type import FileType, detect_file_type
from backend.src.core.utils.text_reader import (
    read_text_file_auto_encoding,
    read_text_file_with_encoding,
)

# Re-export for backward compatibility
__all__ = [
    "read_text_file_with_encoding",
    "read_text_file_auto_encoding",
    "read_file_content",
    "get_file_size",
    "get_file_modification_time",
]


def read_file_content(
    file_path: Union[str, Path],
    offset: Optional[int] = None,
    limit: Optional[int] = None,
) -> Tuple[str, Optional[str], bool]:
    """
    Read file content with optional line range selection.

    Args:
        file_path: Path to the file
        offset: 0-based line number to start reading from
        limit: Maximum number of lines to read

    Returns:
        Tuple of (content, error_message, is_truncated)
        - content: The file content (or error message)
        - error_message: Error message if reading failed
        - is_truncated: True if content was truncated due to limit
    """
    try:
        path = Path(file_path)

        # Check if file exists first
        if not path.exists():
            return "", f"File does not exist: {file_path}", False

        # Check if it's a directory
        if path.is_dir():
            return "", f"Path is a directory, not a file: {file_path}", False

        file_type = detect_file_type(file_path)

        if file_type == FileType.TEXT:
            content, encoding = read_text_file_auto_encoding(file_path)
            lines = content.splitlines(keepends=True)

            # Handle line range selection
            if offset is not None or limit is not None:
                start_line = offset or 0
                end_line = len(lines) if limit is None else start_line + limit

                if start_line >= len(lines):
                    return (
                        "",
                        f"Offset {start_line} is beyond file length ({len(lines)} lines)",
                        False,
                    )

                selected_lines = lines[start_line:end_line]
                content = "".join(selected_lines)
                is_truncated = end_line < len(lines)
            else:
                is_truncated = False

            return content, None, is_truncated

        elif file_type in [FileType.IMAGE, FileType.PDF]:
            # Use BinaryReader for images and PDFs
            binary_reader = get_binary_reader()
            content = binary_reader.read_as_base64(file_path, file_type)

            if content is None:
                return "", f"Failed to read {file_type.value} file", False

            return content, None, False

        else:
            # For other binary files, skip them
            return "", f"Cannot display content of {file_type.value} file", False

    except Exception as e:
        return "", f"Error reading file: {str(e)}", False


# Metadata functions are imported from file_metadata module
# They are re-exported here for backward compatibility
