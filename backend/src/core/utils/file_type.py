"""
File type detection utilities.

Provides file type detection based on extensions and content analysis.
"""
from enum import Enum
from pathlib import Path
from typing import Union

# Import extension constants for backward compatibility
from backend.src.core.utils.file_extensions import (
    AUDIO_EXTENSIONS,
    BINARY_EXTENSIONS,
    DEFAULT_ENCODING,
    FALLBACK_ENCODINGS,
    IMAGE_EXTENSIONS,
    PDF_EXTENSIONS,
    TEXT_EXTENSIONS,
    VIDEO_EXTENSIONS,
)


# Import detector (lazy import to avoid circular dependency)
def _get_detector():
    from backend.src.core.utils.file_detector import get_detector

    return get_detector()


# Re-export for backward compatibility
__all__ = [
    "FileType",
    "detect_file_type",
    "is_text_file",
    "is_image_file",
    "is_pdf_file",
    "should_skip_file",
    "TEXT_EXTENSIONS",
    "IMAGE_EXTENSIONS",
    "PDF_EXTENSIONS",
    "AUDIO_EXTENSIONS",
    "VIDEO_EXTENSIONS",
    "BINARY_EXTENSIONS",
    "DEFAULT_ENCODING",
    "FALLBACK_ENCODINGS",
]


class FileType(Enum):
    """Enumeration of file types that tools can handle."""

    TEXT = "text"
    IMAGE = "image"
    PDF = "pdf"
    AUDIO = "audio"
    VIDEO = "video"
    BINARY = "binary"


def detect_file_type(file_path: Union[str, Path]) -> FileType:
    """
    Detect the type of a file based on its extension and content.

    Args:
        file_path: Path to the file

    Returns:
        FileType enum value
    """
    detector = _get_detector()
    return detector.detect_file_type(file_path)


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
