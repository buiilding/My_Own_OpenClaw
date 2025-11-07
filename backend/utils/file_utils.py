"""
File processing utilities for the Desktop Assistant.

This module provides utilities for file type detection, content processing,
and file system operations used by the tool system.
"""

import mimetypes
import os
from enum import Enum
from pathlib import Path
from typing import BinaryIO, Optional, Tuple, Union

import magic


class FileType(Enum):
    """Enumeration of file types that tools can handle."""

    TEXT = "text"
    IMAGE = "image"
    PDF = "pdf"
    AUDIO = "audio"
    VIDEO = "video"
    BINARY = "binary"


# Common text file extensions
TEXT_EXTENSIONS = {
    ".txt",
    ".md",
    ".py",
    ".js",
    ".ts",
    ".jsx",
    ".tsx",
    ".html",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".json",
    ".xml",
    ".yaml",
    ".yml",
    ".toml",
    ".ini",
    ".cfg",
    ".conf",
    ".log",
    ".sh",
    ".bash",
    ".zsh",
    ".fish",
    ".ps1",
    ".bat",
    ".cmd",
    ".sql",
    ".csv",
    ".tsv",
    ".r",
    ".R",
    ".cpp",
    ".c",
    ".h",
    ".hpp",
    ".java",
    ".scala",
    ".go",
    ".rs",
    ".php",
    ".rb",
    ".pl",
    ".lua",
    ".dart",
    ".kt",
    ".swift",
}

# Image file extensions
IMAGE_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".svg",
    ".bmp",
    ".tiff",
    ".tif",
}

# PDF file extensions
PDF_EXTENSIONS = {".pdf"}

# Audio file extensions
AUDIO_EXTENSIONS = {".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a"}

# Video file extensions
VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv", ".wmv"}

# Binary file extensions (files we should skip)
BINARY_EXTENSIONS = {
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".bin",
    ".dat",
    ".db",
    ".sqlite",
    ".sqlite3",
    ".zip",
    ".tar",
    ".gz",
    ".bz2",
    ".7z",
    ".rar",
    ".jar",
    ".war",
    ".ear",
    ".class",
    ".pyc",
    ".pyo",
    ".o",
    ".obj",
    ".lib",
    ".a",
    ".deb",
    ".rpm",
}

# Default encoding to try for text files
DEFAULT_ENCODING = "utf-8"
FALLBACK_ENCODINGS = ["utf-8", "latin-1", "cp1252"]

# Maximum file size to read (10MB)
MAX_FILE_SIZE = 10 * 1024 * 1024


def detect_file_type(file_path: Union[str, Path]) -> FileType:
    """
    Detect the type of a file based on its extension and content.

    Args:
        file_path: Path to the file

    Returns:
        FileType enum value
    """
    path = Path(file_path)
    if not path.exists():
        return FileType.BINARY

    # Check by extension first
    ext = path.suffix.lower()

    if ext in TEXT_EXTENSIONS:
        return FileType.TEXT
    elif ext in IMAGE_EXTENSIONS:
        return FileType.IMAGE
    elif ext in PDF_EXTENSIONS:
        return FileType.PDF
    elif ext in AUDIO_EXTENSIONS:
        return FileType.AUDIO
    elif ext in VIDEO_EXTENSIONS:
        return FileType.VIDEO
    elif ext in BINARY_EXTENSIONS:
        return FileType.BINARY

    # For files without clear extensions, try content detection
    try:
        # Check if it's a text file by reading first few bytes
        with open(path, "rb") as f:
            sample = f.read(1024)

        # Check for null bytes (indicates binary)
        if b"\x00" in sample:
            return FileType.BINARY

        # Try to decode as text
        for encoding in FALLBACK_ENCODINGS:
            try:
                sample.decode(encoding)
                return FileType.TEXT
            except UnicodeDecodeError:
                continue

        return FileType.BINARY

    except (OSError, IOError):
        return FileType.BINARY


def get_mime_type(file_path: Union[str, Path]) -> str:
    """
    Get the MIME type of a file.

    Args:
        file_path: Path to the file

    Returns:
        MIME type string
    """
    path = Path(file_path)

    # First try extension-based detection
    mime_type, _ = mimetypes.guess_type(str(path))
    if mime_type:
        return mime_type

    # Fall back to magic number detection
    try:
        mime = magic.Magic(mime=True)
        return mime.from_file(str(path))
    except Exception:
        # If all else fails, return generic binary type
        return "application/octet-stream"


def get_specific_mime_type(file_path: Union[str, Path]) -> str:
    """
    Get a specific MIME type for the file, optimized for tool usage.

    Args:
        file_path: Path to the file

    Returns:
        MIME type string
    """
    file_type = detect_file_type(file_path)
    path = Path(file_path)

    if file_type == FileType.IMAGE:
        ext = path.suffix.lower()
        if ext == ".png":
            return "image/png"
        elif ext in [".jpg", ".jpeg"]:
            return "image/jpeg"
        elif ext == ".gif":
            return "image/gif"
        elif ext == ".webp":
            return "image/webp"
        elif ext == ".svg":
            return "image/svg+xml"
        elif ext == ".bmp":
            return "image/bmp"
    elif file_type == FileType.PDF:
        return "application/pdf"
    elif file_type == FileType.AUDIO:
        ext = path.suffix.lower()
        if ext == ".mp3":
            return "audio/mpeg"
        elif ext == ".wav":
            return "audio/wav"
        elif ext == ".flac":
            return "audio/flac"
    elif file_type == FileType.VIDEO:
        ext = path.suffix.lower()
        if ext == ".mp4":
            return "video/mp4"
        elif ext == ".mov":
            return "video/quicktime"

    # Fall back to general detection
    return get_mime_type(file_path)


def is_text_file(file_path: Union[str, Path]) -> bool:
    """
    Check if a file is a text file.

    Args:
        file_path: Path to the file

    Returns:
        True if the file is a text file, False otherwise
    """
    return detect_file_type(file_path) == FileType.TEXT


def is_image_file(file_path: Union[str, Path]) -> bool:
    """
    Check if a file is an image file.

    Args:
        file_path: Path to the file

    Returns:
        True if the file is an image file, False otherwise
    """
    return detect_file_type(file_path) == FileType.IMAGE


def is_pdf_file(file_path: Union[str, Path]) -> bool:
    """
    Check if a file is a PDF file.

    Args:
        file_path: Path to the file

    Returns:
        True if the file is a PDF file, False otherwise
    """
    return detect_file_type(file_path) == FileType.PDF


def should_skip_file(file_path: Union[str, Path]) -> bool:
    """
    Determine if a file should be skipped during processing.

    Args:
        file_path: Path to the file

    Returns:
        True if the file should be skipped, False otherwise
    """
    file_type = detect_file_type(file_path)
    return file_type in [FileType.BINARY, FileType.AUDIO, FileType.VIDEO]


def read_text_file_with_encoding(
    file_path: Union[str, Path], encoding: str = DEFAULT_ENCODING
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
        OSError: If the file cannot be read
    """
    path = Path(file_path)

    # Check file size
    if path.stat().st_size > MAX_FILE_SIZE:
        raise OSError(
            f"File too large: {path.stat().st_size} bytes (max: {MAX_FILE_SIZE})"
        )

    with open(path, "r", encoding=encoding) as f:
        content = f.read()

    return content, encoding


def read_text_file_auto_encoding(file_path: Union[str, Path]) -> Tuple[str, str]:
    """
    Read a text file, automatically trying different encodings.

    Args:
        file_path: Path to the file

    Returns:
        Tuple of (content, encoding_used)

    Raises:
        UnicodeDecodeError: If the file cannot be decoded with any known encoding
        OSError: If the file cannot be read
    """
    for encoding in FALLBACK_ENCODINGS:
        try:
            return read_text_file_with_encoding(file_path, encoding)
        except UnicodeDecodeError:
            continue

    # If all encodings fail, try one more time with errors='replace'
    path = Path(file_path)
    if path.stat().st_size > MAX_FILE_SIZE:
        raise OSError(
            f"File too large: {path.stat().st_size} bytes (max: {MAX_FILE_SIZE})"
        )

    with open(path, "r", encoding="utf-8", errors="replace") as f:
        content = f.read()

    return content, "utf-8"


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
            # For images and PDFs, return base64 encoded data
            import base64

            path = Path(file_path)
            if path.stat().st_size > MAX_FILE_SIZE:
                return (
                    "",
                    f"File too large to process: {path.stat().st_size} bytes",
                    False,
                )

            with open(path, "rb") as f:
                data = f.read()

            mime_type = get_specific_mime_type(file_path)
            encoded = base64.b64encode(data).decode("ascii")

            content = f"data:{mime_type};base64,{encoded}"
            return content, None, False

        else:
            # For other binary files, skip them
            return "", f"Cannot display content of {file_type.value} file", False

    except Exception as e:
        return "", f"Error reading file: {str(e)}", False


def get_file_size(file_path: Union[str, Path]) -> int:
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


def get_file_modification_time(file_path: Union[str, Path]) -> float:
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


def ensure_directory_exists(dir_path: Union[str, Path]) -> None:
    """
    Ensure that a directory exists, creating it if necessary.

    Args:
        dir_path: Path to the directory
    """
    Path(dir_path).mkdir(parents=True, exist_ok=True)


def is_within_directory(
    file_path: Union[str, Path], directory: Union[str, Path]
) -> bool:
    """
    Check if a file path is within a given directory.

    Args:
        file_path: Path to the file
        directory: Path to the directory

    Returns:
        True if the file is within the directory, False otherwise
    """
    try:
        file_path = Path(file_path).resolve()
        directory = Path(directory).resolve()
        return file_path.is_relative_to(directory)
    except (OSError, ValueError):
        return False


def make_relative_path(
    absolute_path: Union[str, Path], base_dir: Union[str, Path]
) -> str:
    """
    Make a path relative to a base directory.

    Args:
        absolute_path: Absolute path to convert
        base_dir: Base directory

    Returns:
        Relative path string
    """
    try:
        return str(Path(absolute_path).relative_to(base_dir))
    except ValueError:
        # If the path is not relative to base_dir, return the absolute path
        return str(absolute_path)


def shorten_path(path: Union[str, Path], max_length: int = 50) -> str:
    """
    Shorten a path for display purposes.

    Args:
        path: Path to shorten
        max_length: Maximum length of the result

    Returns:
        Shortened path string
    """
    path_str = str(path)
    if len(path_str) <= max_length:
        return path_str

    # Try to keep the filename and some directory context
    path_obj = Path(path)
    filename = path_obj.name

    if len(filename) > max_length - 3:
        return "..." + filename[-(max_length - 3) :]

    remaining_length = max_length - len(filename) - 3  # 3 for "..."
    parent_str = str(path_obj.parent)

    if len(parent_str) <= remaining_length:
        return "..." + parent_str + "/" + filename
    else:
        return "..." + parent_str[-remaining_length:] + "/" + filename
