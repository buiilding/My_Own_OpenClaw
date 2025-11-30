"""
File Type Detector.

Provides file type detection based on extensions and content analysis.
"""
from pathlib import Path
from typing import Union

from backend.src.core.utils.file_extensions import (
    AUDIO_EXTENSIONS,
    BINARY_EXTENSIONS,
    FALLBACK_ENCODINGS,
    IMAGE_EXTENSIONS,
    PDF_EXTENSIONS,
    TEXT_EXTENSIONS,
    VIDEO_EXTENSIONS,
)

# Import FileType to avoid circular import
from backend.src.core.utils.file_type import FileType


class FileDetector:
    """
    Detects file types based on extensions and content analysis.
    """

    def __init__(self):
        """Initialize the file detector."""
        self.text_extensions = TEXT_EXTENSIONS
        self.image_extensions = IMAGE_EXTENSIONS
        self.pdf_extensions = PDF_EXTENSIONS
        self.audio_extensions = AUDIO_EXTENSIONS
        self.video_extensions = VIDEO_EXTENSIONS
        self.binary_extensions = BINARY_EXTENSIONS

    def detect_file_type(self, file_path: Union[str, Path]) -> FileType:
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

        if ext in self.text_extensions:
            return FileType.TEXT
        elif ext in self.image_extensions:
            return FileType.IMAGE
        elif ext in self.pdf_extensions:
            return FileType.PDF
        elif ext in self.audio_extensions:
            return FileType.AUDIO
        elif ext in self.video_extensions:
            return FileType.VIDEO
        elif ext in self.binary_extensions:
            return FileType.BINARY

        # For files without clear extensions, try content detection
        return self._detect_by_content(path)

    def _detect_by_content(self, path: Path) -> FileType:
        """
        Detect file type by analyzing file content.

        Args:
            path: Path to the file

        Returns:
            FileType enum value
        """
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


# Global detector instance
_detector: FileDetector = None


def get_detector() -> FileDetector:
    """Get the global file detector instance."""
    global _detector
    if _detector is None:
        _detector = FileDetector()
    return _detector
