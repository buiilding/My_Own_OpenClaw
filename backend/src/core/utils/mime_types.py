"""
MIME type detection utilities.

Provides MIME type detection based on extensions and magic number analysis.
"""
import mimetypes
from pathlib import Path
from typing import Union

import magic

from backend.src.core.utils.file_type import FileType, detect_file_type


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
