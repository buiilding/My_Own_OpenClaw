"""
File utility functions for binary detection and file type checking.
"""

import os
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Common binary file signatures (magic bytes)
BINARY_SIGNATURES = {
    # Images
    b'\x89PNG\r\n\x1a\n': 'image/png',
    b'\xff\xd8\xff': 'image/jpeg',
    b'GIF87a': 'image/gif',
    b'GIF89a': 'image/gif',
    b'RIFF': 'image/webp',  # Partial - WebP is RIFF-based
    b'BM': 'image/bmp',
    # Archives
    b'PK\x03\x04': 'application/zip',
    b'Rar!\x1a\x07': 'application/x-rar',
    b'\x1f\x8b': 'application/gzip',
    b'BZ': 'application/x-bzip2',
    # Executables
    b'MZ': 'application/x-msdos-program',  # Windows PE
    b'\x7fELF': 'application/x-executable',  # Linux ELF
    # PDF
    b'%PDF': 'application/pdf',
    # Office documents
    b'PK\x03\x04': 'application/vnd.openxmlformats',  # Office 2007+ (ZIP-based)
    # Audio/Video
    b'\x00\x00\x00 ftyp': 'video/mp4',  # MP4
    b'ID3': 'audio/mpeg',  # MP3 with ID3 tag
    b'\xff\xfb': 'audio/mpeg',  # MP3
    b'RIFF': 'audio/wav',  # WAV (RIFF-based)
}

# Binary file extensions (fallback)
BINARY_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico',
    '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz',
    '.exe', '.dll', '.so', '.dylib', '.bin',
    '.pdf',
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.mp3', '.mp4', '.avi', '.mov', '.wav', '.flac',
    '.pyc', '.pyo', '.pyd', '.class', '.o', '.obj',
}


def is_binary_file(file_path: str) -> bool:
    """
    Detect if a file is binary by checking magic bytes and extension.
    
    Args:
        file_path: Path to the file
        
    Returns:
        True if file appears to be binary, False otherwise
    """
    try:
        path = Path(file_path)
        
        # Check extension first (fast)
        if path.suffix.lower() in BINARY_EXTENSIONS:
            return True
        
        # Check file size - empty files are text
        if not path.exists() or path.stat().st_size == 0:
            return False
        
        # Check magic bytes (first few bytes)
        with open(file_path, 'rb') as f:
            # Read first 12 bytes (enough for most signatures)
            header = f.read(12)
            
            # Check against known binary signatures
            for signature, _ in BINARY_SIGNATURES.items():
                if header.startswith(signature):
                    return True
            
            # Check for null bytes (strong indicator of binary)
            if b'\x00' in header:
                return True
            
            # Check if content is mostly printable ASCII
            # If more than 30% non-printable (excluding common whitespace), likely binary
            printable_count = sum(1 for b in header if 32 <= b <= 126 or b in (9, 10, 13))
            if len(header) > 0 and printable_count / len(header) < 0.7:
                return True
        
        return False
    except Exception as e:
        logger.warning(f"Error detecting binary file {file_path}: {e}")
        # On error, assume text (safer for reading)
        return False


def is_text_file(file_path: str) -> bool:
    """
    Check if a file is a text file (opposite of is_binary_file).
    
    Args:
        file_path: Path to the file
        
    Returns:
        True if file appears to be text, False otherwise
    """
    return not is_binary_file(file_path)


def detect_encoding(file_path: str) -> Optional[str]:
    """
    Attempt to detect file encoding.
    
    Args:
        file_path: Path to the file
        
    Returns:
        Detected encoding or None if detection fails
    """
    try:
        import chardet
        with open(file_path, 'rb') as f:
            raw_data = f.read(10000)  # Read first 10KB
            result = chardet.detect(raw_data)
            if result and result.get('encoding'):
                return result['encoding']
    except ImportError:
        # chardet not available, try common encodings
        pass
    except Exception as e:
        logger.warning(f"Error detecting encoding for {file_path}: {e}")
    
    # Default to UTF-8
    return 'utf-8'
